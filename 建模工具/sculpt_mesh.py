"""Parametric smooth triangle-mesh sculpting and binary GLB/SVG exporter for Overlords."""

import json
import math
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "万象酒馆-Demo/assets"
PORTRAITS = ASSETS / "portraits"
OUT_ROOT = ROOT / "万象异境-体素模型"
OUT_OVERLORDS = OUT_ROOT / "霸主非体素模型"


def hex_to_linear(hex_color):
    h = hex_color.lstrip("#")
    vals = [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return np.array(
        [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in vals],
        dtype=np.float32,
    )


def hex_to_rgb255(hex_color):
    h = hex_color.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def normalize_rows(arr):
    lens = np.linalg.norm(arr, axis=1, keepdims=True)
    safe = np.where(lens < 1e-8, 1.0, lens)
    out = arr / safe
    zero = lens[:, 0] < 1e-8
    if np.any(zero):
        out[zero] = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    return out


class MeshPart:
    """Collects indexed smooth triangles for one named mesh/material node."""

    def __init__(
        self,
        name,
        metallic=0.18,
        roughness=0.58,
        emissive=None,
        double_sided=False,
    ):
        self.name = name
        self.metallic = float(metallic)
        self.roughness = float(roughness)
        self.emissive = list(emissive) if emissive is not None else None
        self.double_sided = bool(double_sided)
        self.positions = []
        self.normals = []
        self.colors = []
        self.rgb_srgb = []
        self.indices = []

    def append_mesh(self, verts, tris, color_fn_or_hex, smooth=True):
        verts = np.asarray(verts, dtype=np.float32)
        tris = np.asarray(tris, dtype=np.uint32)
        if len(verts) == 0 or len(tris) == 0:
            return
        if isinstance(color_fn_or_hex, str):
            lin = hex_to_linear(color_fn_or_hex)
            srgb = hex_to_rgb255(color_fn_or_hex)
            c_lin = np.tile(lin, (len(verts), 1))
            c_srgb = np.tile(srgb, (len(verts), 1))
        else:
            c_srgb_list = [hex_to_rgb255(color_fn_or_hex(i, v)) for i, v in enumerate(verts)]
            c_lin_list = [hex_to_linear(color_fn_or_hex(i, v)) for i, v in enumerate(verts)]
            c_srgb = np.asarray(c_srgb_list, dtype=np.float32)
            c_lin = np.asarray(c_lin_list, dtype=np.float32)

        v0 = verts[tris[:, 0]]
        v1 = verts[tris[:, 1]]
        v2 = verts[tris[:, 2]]
        fn = np.cross(v1 - v0, v2 - v0)

        if smooth:
            vn = np.zeros_like(verts)
            np.add.at(vn, tris[:, 0], fn)
            np.add.at(vn, tris[:, 1], fn)
            np.add.at(vn, tris[:, 2], fn)
            vn = normalize_rows(vn)
            offset = len(self.positions)
            self.positions.extend(verts.tolist())
            self.normals.extend(vn.tolist())
            self.colors.extend(c_lin.tolist())
            self.rgb_srgb.extend(c_srgb.tolist())
            self.indices.extend((tris + offset).ravel().tolist())
        else:
            fn = normalize_rows(fn)
            for ti, tri in enumerate(tris):
                offset = len(self.positions)
                for k in range(3):
                    vi = int(tri[k])
                    self.positions.append(verts[vi].tolist())
                    self.normals.append(fn[ti].tolist())
                    self.colors.append(c_lin[vi].tolist())
                    self.rgb_srgb.append(c_srgb[vi].tolist())
                self.indices.extend([offset, offset + 1, offset + 2])


class SculptedModel:
    """High-detail non-voxel Overlord sculpture exporter."""

    def __init__(self, enemy_id, name, tier="overlord", stand_on_card=True):
        self.enemy_id = enemy_id
        self.name = name
        self.tier = tier
        self.stand_on_card = stand_on_card
        self.parts = {}

    def part(
        self,
        name,
        metallic=0.18,
        roughness=0.58,
        emissive=None,
        double_sided=False,
    ):
        if name not in self.parts:
            self.parts[name] = MeshPart(name, metallic, roughness, emissive, double_sided)
        return self.parts[name]

    def lathe(
        self,
        part,
        profile,
        center=(0, 0, 0),
        segs=20,
        color="#c0b8a8",
        sx=1.0,
        sz=1.0,
        flute_amp=0.0,
        flute_freq=0,
    ):
        """Revolved surface from [(y, r), ...] around vertical axis."""
        cx, cy, cz = center
        verts = []
        n_ring = len(profile)
        for ri, (py, pr) in enumerate(profile):
            for si in range(segs):
                a = (si / segs) * math.tau
                mod = 1.0 + flute_amp * math.cos(a * flute_freq + ri * 0.4)
                r = pr * mod
                verts.append([cx + math.cos(a) * r * sx, cy + py, cz + math.sin(a) * r * sz])
        tris = []
        for ri in range(n_ring - 1):
            row0 = ri * segs
            row1 = (ri + 1) * segs
            for si in range(segs):
                sn = (si + 1) % segs
                a, b, c, d = row0 + si, row0 + sn, row1 + sn, row1 + si
                tris.append([a, c, b])
                tris.append([a, d, c])
        # Cap bottom (-Y outward) & top (+Y outward)
        if profile[0][1] > 0.01:
            bot_idx = len(verts)
            verts.append([cx, cy + profile[0][0], cz])
            for si in range(segs):
                tris.append([bot_idx, si, (si + 1) % segs])
        if profile[-1][1] > 0.01:
            top_idx = len(verts)
            verts.append([cx, cy + profile[-1][0], cz])
            base = (n_ring - 1) * segs
            for si in range(segs):
                tris.append([top_idx, base + (si + 1) % segs, base + si])
        part.append_mesh(verts, tris, color, smooth=True)

    def ellipsoid(
        self,
        part,
        center,
        radii,
        u_segs=18,
        v_segs=12,
        color="#c0b8a8",
        rot=(0.0, 0.0, 0.0),
        bump_fn=None,
    ):
        """Sculpted organic ellipsoid or sphere with optional displacement."""
        rx, ry, rz = radii
        cx, cy, cz = center
        ax, ay, az = rot
        cx_r, sx_r = math.cos(ax), math.sin(ax)
        cy_r, sy_r = math.cos(ay), math.sin(ay)
        cz_r, sz_r = math.cos(az), math.sin(az)

        def xform(x, y, z):
            y1, z1 = y * cx_r - z * sx_r, y * sx_r + z * cx_r
            x2, z2 = x * cy_r + z1 * sy_r, -x * sy_r + z1 * cy_r
            x3, y3 = x2 * cz_r - y1 * sz_r, x2 * sz_r + y1 * cz_r
            return [cx + x3, cy + y3, cz + z2]

        verts = []
        for vi in range(v_segs + 1):
            phi = (vi / v_segs) * math.pi
            sp, cp = math.sin(phi), math.cos(phi)
            for ui in range(u_segs):
                theta = (ui / u_segs) * math.tau
                ct, st = math.cos(theta), math.sin(theta)
                s = 1.0 + (bump_fn(theta, phi) if bump_fn else 0.0)
                verts.append(xform(ct * sp * rx * s, cp * ry * s, st * sp * rz * s))
        tris = []
        for vi in range(v_segs):
            r0, r1 = vi * u_segs, (vi + 1) * u_segs
            for ui in range(u_segs):
                un = (ui + 1) % u_segs
                a, b, c, d = r0 + ui, r0 + un, r1 + un, r1 + ui
                if vi > 0:
                    tris.append([a, b, c])
                if vi < v_segs - 1:
                    tris.append([a, c, d])
        part.append_mesh(verts, tris, color, smooth=True)

    def tube(
        self,
        part,
        points,
        radii,
        segs=12,
        color="#c0b8a8",
        cap_ends=True,
        twist=0.0,
        flute_amp=0.0,
        flute_freq=0,
    ):
        """Sweep a tapered, curved smooth tube along 3D spline points."""
        pts = np.asarray(points, dtype=np.float32)
        n = len(pts)
        if n < 2:
            return
        if isinstance(radii, (int, float)):
            rads = np.full(n, float(radii))
        else:
            rads = np.asarray(radii, dtype=np.float32)

        tangents = np.zeros_like(pts)
        tangents[0] = pts[1] - pts[0]
        tangents[-1] = pts[-1] - pts[-2]
        if n > 2:
            tangents[1:-1] = pts[2:] - pts[:-2]
        tangents = normalize_rows(tangents)

        ref = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        if abs(np.dot(tangents[0], ref)) > 0.9:
            ref = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        norm = normalize_rows(np.array([np.cross(tangents[0], ref)]))[0]

        verts = []
        for i in range(n):
            t = tangents[i]
            if i > 0:
                norm = norm - t * np.dot(norm, t)
                n_len = np.linalg.norm(norm)
                if n_len < 1e-6:
                    alt = np.array([1.0, 0.0, 0.0], dtype=np.float32)
                    if abs(np.dot(t, alt)) > 0.9:
                        alt = np.array([0.0, 0.0, 1.0], dtype=np.float32)
                    norm = np.cross(t, alt)
                    n_len = np.linalg.norm(norm)
                norm = norm / n_len
            binorm = np.cross(t, norm)
            r = rads[i]
            ang_off = twist * (i / max(1, n - 1))
            for si in range(segs):
                a = (si / segs) * math.tau + ang_off
                mod = 1.0 + flute_amp * math.cos(a * flute_freq)
                v = pts[i] + (norm * math.cos(a) + binorm * math.sin(a)) * (r * mod)
                verts.append(v.tolist())

        tris = []
        for i in range(n - 1):
            r0, r1 = i * segs, (i + 1) * segs
            for si in range(segs):
                sn = (si + 1) % segs
                a, b, c, d = r0 + si, r0 + sn, r1 + sn, r1 + si
                tris.append([a, b, c])
                tris.append([a, c, d])

        if cap_ends and rads[0] > 0.005:
            ci = len(verts)
            verts.append(pts[0].tolist())
            for si in range(segs):
                tris.append([ci, (si + 1) % segs, si])
        if cap_ends and rads[-1] > 0.005:
            ci = len(verts)
            verts.append(pts[-1].tolist())
            base = (n - 1) * segs
            for si in range(segs):
                tris.append([ci, base + si, base + (si + 1) % segs])
        part.append_mesh(verts, tris, color, smooth=True)

    def torus(
        self,
        part,
        center,
        major_r,
        minor_r,
        u_segs=32,
        v_segs=10,
        color="#e7cf7a",
        rot=(0.0, 0.0, 0.0),
        arc=math.tau,
    ):
        """Smooth closed torus or crescent halo ring."""
        cx, cy, cz = center
        ax, ay, az = rot
        cx_r, sx_r = math.cos(ax), math.sin(ax)
        cy_r, sy_r = math.cos(ay), math.sin(ay)
        cz_r, sz_r = math.cos(az), math.sin(az)

        def xform(x, y, z):
            y1, z1 = y * cx_r - z * sx_r, y * sx_r + z * cx_r
            x2, z2 = x * cy_r + z1 * sy_r, -x * sy_r + z1 * cy_r
            x3, y3 = x2 * cz_r - y1 * sz_r, x2 * sz_r + y1 * cz_r
            return [cx + x3, cy + y3, cz + z2]

        closed = abs(arc - math.tau) < 1e-4
        u_count = u_segs if closed else u_segs + 1
        verts = []
        for ui in range(u_count):
            u = (ui / u_segs) * arc
            cu, su = math.cos(u), math.sin(u)
            for vi in range(v_segs):
                v = (vi / v_segs) * math.tau
                cv, sv = math.cos(v), math.sin(v)
                r = major_r + minor_r * cv
                verts.append(xform(r * cu, minor_r * sv, r * su))
        tris = []
        limit_u = u_segs if closed else u_count - 1
        for ui in range(limit_u):
            un = (ui + 1) % u_segs if closed else ui + 1
            r0, r1 = ui * v_segs, un * v_segs
            for vi in range(v_segs):
                vn = (vi + 1) % v_segs
                a, b, c, d = r0 + vi, r0 + vn, r1 + vn, r1 + vi
                tris.append([a, b, c])
                tris.append([a, c, d])
        part.append_mesh(verts, tris, color, smooth=True)

    def wing_membrane(self, part, spine_a, spine_b, divs_u=14, divs_v=8, camber=0.14, color="#fff5d8"):
        """Sculpted doubly-curved aerodynamic wing / fin / cape sheet between two 3D spine curves."""
        a = np.asarray(spine_a, dtype=np.float32)
        b = np.asarray(spine_b, dtype=np.float32)
        verts = []
        cols = divs_u + 1
        rows = divs_v + 1
        for vi in range(rows):
            vt = vi / divs_v
            for ui in range(cols):
                ut = ui / divs_u
                p = a[min(len(a) - 1, int(ut * (len(a) - 1)))]
                # Interpolate smoothly along discrete curve
                fa = ut * (len(a) - 1)
                ia = min(len(a) - 2, int(fa))
                pa = a[ia] * (1 - (fa - ia)) + a[ia + 1] * (fa - ia)
                fb = ut * (len(b) - 1)
                ib = min(len(b) - 2, int(fb))
                pb = b[ib] * (1 - (fb - ib)) + b[ib + 1] * (fb - ib)
                pt = pa * (1 - vt) + pb * vt
                scallop = -0.18 * math.sin(ut * math.pi * 4.0) * (vt**1.4)
                pt[1] += camber * math.sin(vt * math.pi) + scallop * 0.35
                pt[2] += camber * 0.45 * math.sin(ut * math.pi) * math.sin(vt * math.pi)
                verts.append(pt.tolist())
        tris = []
        for vi in range(divs_v):
            for ui in range(divs_u):
                i0 = vi * cols + ui
                i1 = i0 + 1
                i2 = i0 + cols + 1
                i3 = i0 + cols
                tris.append([i0, i1, i2])
                tris.append([i0, i2, i3])
        part.append_mesh(verts, tris, color, smooth=True)

    def bevel_plate(self, part, poly_xz, height, bevel=0.06, center=(0, 0, 0), rot=(0, 0, 0), color="#7e94a8"):
        """Chamfered multi-sided smooth-edged armor plate / blade prism."""
        cx, cy, cz = center
        pts = np.asarray(poly_xz, dtype=np.float32)
        # Ensure polygon is CCW around +Y (standard right-handed top view: signed area in (x, -z) > 0)
        area2 = sum(pts[i][0] * (-pts[(i + 1) % len(pts)][1]) - pts[(i + 1) % len(pts)][0] * (-pts[i][1]) for i in range(len(pts)))
        if area2 < 0:
            pts = pts[::-1]
        m = len(pts)
        centroid = pts.mean(axis=0)
        shrunk = centroid + (pts - centroid) * max(0.35, 1.0 - bevel * 2.2)

        ax, ay, az = rot
        cx_r, sx_r = math.cos(ax), math.sin(ax)
        cy_r, sy_r = math.cos(ay), math.sin(ay)
        cz_r, sz_r = math.cos(az), math.sin(az)

        def xform(v):
            x, y, z = v
            y1, z1 = y * cx_r - z * sx_r, y * sx_r + z * cx_r
            x2, z2 = x * cy_r + z1 * sy_r, -x * sy_r + z1 * cy_r
            x3, y3 = x2 * cz_r - y1 * sz_r, x2 * sz_r + y1 * cz_r
            return [cx + x3, cy + y3, cz + z2]

        hh = height * 0.5
        hb = max(0.0, hh - bevel)
        rings = [
            [[shrunk[i][0], -hh, shrunk[i][1]] for i in range(m)],
            [[pts[i][0], -hb, pts[i][1]] for i in range(m)],
            [[pts[i][0], hb, pts[i][1]] for i in range(m)],
            [[shrunk[i][0], hh, shrunk[i][1]] for i in range(m)],
        ]
        verts = [xform(p) for ring in rings for p in ring]
        tris = []
        for ri in range(3):
            r0, r1 = ri * m, (ri + 1) * m
            for i in range(m):
                ni = (i + 1) % m
                tris.append([r0 + i, r0 + ni, r1 + ni])
                tris.append([r0 + i, r1 + ni, r1 + i])
        bot_c = len(verts)
        verts.append(xform([centroid[0], -hh, centroid[1]]))
        top_c = len(verts)
        verts.append(xform([centroid[0], hh, centroid[1]]))
        for i in range(m):
            ni = (i + 1) % m
            tris.append([bot_c, ni, i])
            tris.append([top_c, 3 * m + i, 3 * m + ni])
        part.append_mesh(verts, tris, color, smooth=False)

    def normalize_floor(self):
        """Translate whole sculpture so base sits cleanly on y = 0.0 and X/Z are centered."""
        all_v = np.concatenate([np.asarray(p.positions, dtype=np.float32) for p in self.parts.values() if p.positions])
        min_v = all_v.min(axis=0)
        max_v = all_v.max(axis=0)
        shift = np.array([-(min_v[0] + max_v[0]) * 0.5, -min_v[1], -(min_v[2] + max_v[2]) * 0.5], dtype=np.float32)
        for part in self.parts.values():
            if not part.positions:
                continue
            arr = np.asarray(part.positions, dtype=np.float32) + shift
            part.positions = arr.tolist()

    def total_triangles(self):
        return sum(len(p.indices) // 3 for p in self.parts.values())

    def render_portrait_svg(self, bg_color="#1d2b38"):
        """Render an isometric/3-4 Phong-shaded vector SVG portrait directly from the sculpted 3D mesh."""
        cam_dir = normalize_rows(np.array([[0.54, 0.34, 1.0]], dtype=np.float32))[0]
        right = normalize_rows(np.array([np.cross([0, 1, 0], cam_dir)], dtype=np.float32))[0]
        up = np.cross(cam_dir, right)
        light_dir = normalize_rows(np.array([[0.58, 0.72, 0.48]], dtype=np.float32))[0]

        all_verts = []
        faces = []
        for part in self.parts.values():
            if not part.positions:
                continue
            verts = np.asarray(part.positions, dtype=np.float32)
            norms = np.asarray(part.normals, dtype=np.float32)
            cols = np.asarray(part.rgb_srgb, dtype=np.float32)
            tris = np.asarray(part.indices, dtype=np.uint32).reshape(-1, 3)

            px = verts @ right
            py = -(verts @ up)
            pz = verts @ cam_dir
            proj = np.stack([px, py, pz], axis=1)
            all_verts.append(proj)

            tri_p = proj[tris]
            tri_n = normalize_rows(normals_avg := np.cross(verts[tris[:, 1]] - verts[tris[:, 0]], verts[tris[:, 2]] - verts[tris[:, 0]]))
            tri_c = cols[tris].mean(axis=1)
            depth = tri_p[:, :, 2].mean(axis=1)
            facing = tri_n @ cam_dir

            em = np.asarray(part.emissive or [0, 0, 0], dtype=np.float32) * 210.0
            diffuse = np.clip(tri_n @ light_dir, -0.3, 1.0)
            ndv = np.clip(np.abs(facing), 0.0, 1.0)
            rim = (1.0 - ndv) ** 2.2 * 45.0
            for ti in range(len(tris)):
                if not part.double_sided and facing[ti] <= 0.02:
                    continue
                shade_k = 0.42 + max(0.0, float(diffuse[ti])) * 0.68
                rgb = np.clip(tri_c[ti] * shade_k + rim[ti] + em, 0, 255).astype(int)
                hex_c = f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
                pts2 = tri_p[ti, :, :2]
                faces.append((float(depth[ti]), pts2, hex_c))

        stacked = np.concatenate(all_verts, axis=0)
        min_x, min_y = stacked[:, 0].min(), stacked[:, 1].min()
        max_x, max_y = stacked[:, 0].max(), stacked[:, 1].max()
        scale = min(216.0 / max(1e-4, max_x - min_x), 278.0 / max(1e-4, max_y - min_y))
        cx = 128.0 - (min_x + max_x) * 0.5 * scale
        cy = 198.0 - (min_y + max_y) * 0.5 * scale
        faces.sort(key=lambda item: item[0])

        polys = []
        for _, pts2, hex_c in faces:
            sx = cx + pts2[:, 0] * scale
            sy = cy + pts2[:, 1] * scale
            pts_str = " ".join(f"{sx[k]:.1f},{sy[k]:.1f}" for k in range(3))
            polys.append(f'<polygon points="{pts_str}" fill="{hex_c}"/>')

        shadow_y = min(352.0, cy + max_y * scale + 4.0)
        shadow_rx = min(98.0, (max_x - min_x) * scale * 0.42)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" '
            f'viewBox="0 0 256 384" data-art-style="sculpted-overlord-v1">\n'
            f'<title>{self.name}</title>\n'
            f'<defs><radialGradient id="overlordBg" cx="50%" cy="48%" r="68%">'
            f'<stop stop-color="{bg_color}"/><stop offset="1" stop-color="#0b1019"/>'
            f'</radialGradient></defs>\n'
            f'<path fill="url(#overlordBg)" d="M0 0h256v384H0z"/>\n'
            f'<ellipse cx="128" cy="{shadow_y:.1f}" rx="{shadow_rx:.1f}" ry="12" fill="#05080d" opacity="0.62"/>\n'
            f'<g data-enemy-model="{self.enemy_id}" shape-rendering="crispEdges">'
            + "".join(polys)
            + "</g>\n</svg>\n"
        )

    def finish(self, filename, portrait_slug=None, bg_color="#2a1f36"):
        self.normalize_floor()
        binary = bytearray()
        doc = {
            "asset": {"version": "2.0", "generator": "Wanxiang sculpted overlord atelier"},
            "scene": 0,
            "scenes": [{"nodes": []}],
            "nodes": [],
            "meshes": [],
            "materials": [],
            "buffers": [{"byteLength": 0}],
            "bufferViews": [],
            "accessors": [],
        }

        def push_buf(content, target):
            binary.extend(b"\0" * (-len(binary) % 4))
            idx = len(doc["bufferViews"])
            doc["bufferViews"].append(
                {
                    "buffer": 0,
                    "byteOffset": len(binary),
                    "byteLength": len(content),
                    "target": target,
                }
            )
            binary.extend(content)
            return idx

        def add_acc(values, dtype, kind, target):
            arr = np.asarray(values, dtype=dtype)
            item = {
                "bufferView": push_buf(arr.tobytes(), target),
                "componentType": 5126 if dtype == "<f4" else 5125,
                "count": len(arr),
                "type": kind,
            }
            if kind == "VEC3":
                item.update(min=arr.min(axis=0).tolist(), max=arr.max(axis=0).tolist())
            idx = len(doc["accessors"])
            doc["accessors"].append(item)
            return idx

        comp_counts = {}
        total_tris = 0
        for name, part in self.parts.items():
            if not part.indices:
                continue
            attrs = {
                "POSITION": add_acc(part.positions, "<f4", "VEC3", 34962),
                "NORMAL": add_acc(part.normals, "<f4", "VEC3", 34962),
                "COLOR_0": add_acc(part.colors, "<f4", "VEC3", 34962),
            }
            idx_acc = add_acc(part.indices, "<u4", "SCALAR", 34963)
            mat = {
                "name": name,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1, 1, 1, 1],
                    "roughnessFactor": part.roughness,
                    "metallicFactor": part.metallic,
                },
                "doubleSided": part.double_sided,
            }
            if part.emissive:
                mat["emissiveFactor"] = part.emissive
            mid = len(doc["materials"])
            doc["materials"].append(mat)
            mesh_id = len(doc["meshes"])
            doc["meshes"].append(
                {
                    "name": name,
                    "primitives": [{"attributes": attrs, "indices": idx_acc, "material": mid}],
                }
            )
            nid = len(doc["nodes"])
            doc["nodes"].append({"name": name, "mesh": mesh_id})
            doc["scenes"][0]["nodes"].append(nid)
            tris = len(part.indices) // 3
            comp_counts[name] = tris
            total_tris += tris

        doc["extras"] = {
            "title": self.name,
            "enemyId": self.enemy_id,
            "tier": self.tier,
            "nonVoxel": True,
            "voxelBoxes": 0,
            "triangles": total_tris,
            "standOnCard": bool(self.stand_on_card),
            "cardScaleUnchanged": True,
            "components": comp_counts,
            "source": "建模工具/build_overlord_models.py",
        }
        doc["buffers"][0]["byteLength"] = len(binary)
        head = json.dumps(doc, separators=(",", ":"), ensure_ascii=True).encode()
        head += b" " * (-len(head) % 4)
        binary.extend(b"\0" * (-len(binary) % 4))
        output = (
            struct.pack("<III", 0x46546C67, 2, 28 + len(head) + len(binary))
            + struct.pack("<II", len(head), 0x4E4F534A)
            + head
            + struct.pack("<II", len(binary), 0x004E4942)
            + binary
        )
        OUT_ROOT.mkdir(exist_ok=True)
        OUT_OVERLORDS.mkdir(exist_ok=True)
        ASSETS.mkdir(exist_ok=True)
        PORTRAITS.mkdir(exist_ok=True)
        (ASSETS / filename).write_bytes(output)
        (OUT_ROOT / filename).write_bytes(output)
        (OUT_OVERLORDS / filename).write_bytes(output)
        if portrait_slug:
            (PORTRAITS / f"{portrait_slug}.svg").write_text(
                self.render_portrait_svg(bg_color=bg_color), encoding="utf-8", newline="\n"
            )
        print(
            f"[Overlord Non-Voxel] {self.name} ({filename}): {len(comp_counts)} meshes, "
            f"{total_tris} tris, {len(output)} bytes"
        )
        return total_tris
