"""Build the sculpted PBR animated Overlord GLB and SVG portrait for 初生暗鳞督军."""

import json
import math
import struct
import zlib
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "万象酒馆-Demo/assets"
PORTRAITS = ASSETS / "portraits"
OUT_ROOT = ROOT / "万象异境-体素模型"
OUT_OVERLORDS = OUT_ROOT / "霸主非体素模型"

TAU = math.tau
PI = math.pi


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


def lerp_hex(hex_a, hex_b, t):
    t = max(0.0, min(1.0, float(t)))
    ca = hex_to_rgb255(hex_a)
    cb = hex_to_rgb255(hex_b)
    c = np.clip(ca * (1.0 - t) + cb * t, 0, 255).astype(int)
    return f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}"


def normalize_rows(arr):
    arr = np.asarray(arr, dtype=np.float32)
    lens = np.linalg.norm(arr, axis=1, keepdims=True)
    safe = np.where(lens < 1e-8, 1.0, lens)
    out = arr / safe
    zero = lens[:, 0] < 1e-8
    if np.any(zero):
        out[zero] = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    return out


def euler_xyz_to_quat(rx=0.0, ry=0.0, rz=0.0):
    cx, sx = math.cos(rx * 0.5), math.sin(rx * 0.5)
    cy, sy = math.cos(ry * 0.5), math.sin(ry * 0.5)
    cz, sz = math.cos(rz * 0.5), math.sin(rz * 0.5)
    return [
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    ]


def rot_matrix_xyz(ax, ay, az):
    cx, sx = math.cos(ax), math.sin(ax)
    cy, sy = math.cos(ay), math.sin(ay)
    cz, sz = math.cos(az), math.sin(az)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], dtype=np.float32)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], dtype=np.float32)
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], dtype=np.float32)
    return rz @ ry @ rx


def basis_from_dir(direction):
    d = np.asarray(direction, dtype=np.float32)
    n = np.linalg.norm(d)
    if n < 1e-7:
        return np.eye(3, dtype=np.float32)
    y_axis = d / n
    ref = np.array([0.0, 0.0, 1.0], dtype=np.float32)
    if abs(float(np.dot(y_axis, ref))) > 0.92:
        ref = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    x_axis = np.cross(ref, y_axis)
    x_axis /= np.linalg.norm(x_axis) + 1e-8
    z_axis = np.cross(x_axis, y_axis)
    return np.stack([x_axis, y_axis, z_axis], axis=1)


def catmull_rom_samples(points, steps_per_seg=4):
    pts = np.asarray(points, dtype=np.float32)
    if len(pts) <= 2 or steps_per_seg <= 1:
        return pts
    ext = np.vstack([pts[0] * 2 - pts[1], pts, pts[-1] * 2 - pts[-2]])
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        count = steps_per_seg if i < len(pts) - 2 else steps_per_seg + 1
        for s in range(count):
            t = s / steps_per_seg
            t2 = t * t
            t3 = t2 * t
            pos = 0.5 * (
                (2.0 * p1)
                + (-p0 + p2) * t
                + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
                + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
            )
            out.append(pos)
    return np.asarray(out, dtype=np.float32)


def encode_rgb_png(rgb_uint8):
    height, width, _ = rgb_uint8.shape
    sub = np.empty((height, width * 3 + 1), dtype=np.uint8)
    sub[:, 0] = 1
    flat = rgb_uint8.reshape(height, width * 3)
    sub[:, 1:4] = flat[:, 0:3]
    sub[:, 4:] = (flat[:, 3:].astype(np.int16) - flat[:, :-3].astype(np.int16)) & 0xFF
    compressed = zlib.compress(sub.tobytes(), level=9)

    def chunk(tag, body):
        crc = zlib.crc32(tag + body) & 0xFFFFFFFF
        return struct.pack(">I4s", len(body), tag) + body + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def periodic_blur_noise(rng, size, sigma):
    raw = rng.standard_normal((size, size)).astype(np.float32)
    if sigma > 0:
        fy = np.fft.fftfreq(size)[:, None] * size
        fx = np.fft.fftfreq(size)[None, :] * size
        kernel = np.exp(-2.0 * (PI * sigma / size) ** 2 * (fx * fx + fy * fy))
        arr = np.fft.ifft2(np.fft.fft2(raw) * kernel).real.astype(np.float32)
    else:
        arr = raw
    return (arr - arr.mean()) / (arr.std() + 1e-5)


PBR_SPECS = {
    "darkscale": (0.86, 0.16, 2.8, 6.0, 0.85),
    "quarry_bone": (0.88, 0.14, 2.4, 5.0, 0.72),
    "sinew": (0.82, 0.18, 2.6, 5.4, 0.76),
    "rift_crystal": (0.90, 0.14, 2.9, 4.6, 0.58),
    "quarry_iron": (0.80, 0.18, 2.5, 5.8, 0.82),
    "bronze_trim": (0.86, 0.13, 2.7, 4.4, 0.55),
}


def make_pbr_maps(kind):
    avg, contrast, _, normal_strength, _ = PBR_SPECS[kind]
    size = 256
    seed = sum(ord(ch) * (idx + 23) for idx, ch in enumerate(kind)) + 20261119
    rng = np.random.default_rng(seed)
    yy, xx = np.meshgrid(
        np.linspace(0.0, TAU, size, endpoint=False, dtype=np.float32),
        np.linspace(0.0, TAU, size, endpoint=False, dtype=np.float32),
        indexing="ij",
    )
    fine = periodic_blur_noise(rng, size, 0.9)
    med = periodic_blur_noise(rng, size, 3.0)
    broad = periodic_blur_noise(rng, size, 9.0)

    if kind == "darkscale":
        # Imbricated hexagonal-diamond dragon scale lattice with raised central keel
        u = xx / TAU * 8.0
        v = yy / TAU * 8.0
        row = np.floor(v)
        u_shift = (u + (row % 2) * 0.5) % 1.0 - 0.5
        v_cell = v % 1.0
        arch = np.sqrt(u_shift * u_shift * 2.1 + (v_cell * 0.95) ** 2)
        rim = np.exp(-(((arch - 0.54) / 0.065) ** 2))
        dome = np.clip(0.58 - arch, -0.35, 0.58)
        keel = np.exp(-((u_shift / 0.075) ** 2)) * np.clip(1.0 - v_cell * 1.15, 0.0, 1.0) * 0.34
        height = dome * 1.15 - rim * 0.65 + keel + med * 0.16 + fine * 0.11
    elif kind == "quarry_bone":
        # Weathered calcified bone & grey limestone strata with hairline fissures
        grain = np.sin(yy * 28.0 + med * 1.6) * 0.25 + np.sin(yy * 64.0 + fine * 1.1) * 0.12
        layers = np.sin(xx * 6.0 + np.sin(yy * 3.0 + broad * 1.4) * 1.4) * 0.45
        pits = np.minimum(0.0, med + 0.55) * 0.72
        height = layers + grain + pits + fine * 0.18
    elif kind == "sinew":
        # Taut interwoven abyssal muscle fibers and scarred hide
        bundles = np.sin(xx * 18.0 + np.sin(yy * 4.0 + broad * 1.5) * 2.2) * 0.55
        cross = np.sin(yy * 32.0 + med * 1.4) * 0.18
        height = bundles + cross + med * 0.28 + fine * 0.2
    elif kind == "rift_crystal":
        # Sharp angular amethyst cleavage planes & luminous internal crack veins
        f1 = np.abs(np.sin(xx * 4.0 + yy * 3.0 + broad * 1.2))
        f2 = np.abs(np.cos(xx * 5.0 - yy * 4.0 + med * 0.9))
        veins = np.exp(-(((f1 - f2) / 0.08) ** 2)) * 0.7
        height = (f1 + f2) * 0.55 + veins + fine * 0.12
    elif kind == "quarry_iron":
        # Hammered cast-iron pitting & quarry slag wear
        pits = np.minimum(0.0, med + 0.3) * 1.05
        hammer = np.sin(xx * 7.0 + broad * 2.0) * np.cos(yy * 7.0 - broad * 1.7) * 0.32
        scratches = np.exp(-((np.sin(xx * 9.0 + yy * 5.0 + med * 1.5)) ** 2) / 0.005) * -0.4
        height = pits + hammer + scratches + fine * 0.36
    else:
        # Brushed antique bronze rivets & collar patina
        brush = np.sin(yy * 46.0 + med * 1.1) * 0.3 + np.sin(xx * 10.0 + broad * 1.4) * 0.2
        height = brush + med * 0.24 + fine * 0.15

    height = (height - height.mean()) / (height.std() + 0.03)
    albedo_gray = (np.clip(avg + height * contrast + broad * 0.03, 0.32, 0.99) * 255.0).astype(
        np.uint8
    )
    albedo_rgb = np.repeat(albedo_gray[:, :, None], 3, axis=2)

    gy, gx = np.gradient(height * 0.24)
    ones = np.ones_like(gx)
    normal_vec = np.stack([-gx * normal_strength, gy * normal_strength, ones], axis=-1)
    normal_vec /= np.sqrt(np.sum(normal_vec * normal_vec, axis=-1, keepdims=True)) + 1e-8
    normal_rgb = (np.clip(normal_vec * 0.5 + 0.5, 0.0, 1.0) * 255.0).astype(np.uint8)
    return encode_rgb_png(albedo_rgb), encode_rgb_png(normal_rgb)


class MaterialSpec:
    def __init__(
        self,
        name,
        metallic=0.2,
        roughness=0.5,
        emissive=None,
        double_sided=False,
        pbr_kind=None,
        alpha=1.0,
    ):
        self.name = name
        self.metallic = float(metallic)
        self.roughness = float(roughness)
        self.emissive = list(emissive) if emissive is not None else None
        self.double_sided = bool(double_sided)
        self.pbr_kind = pbr_kind
        self.alpha = float(alpha)


class MeshBucket:
    """Stores smooth/faceted geometry belonging to one joint and one material."""

    def __init__(self, joint_name, mat_spec):
        self.joint_name = joint_name
        self.mat_spec = mat_spec
        self.positions = []
        self.normals = []
        self.colors = []
        self.rgb_srgb = []
        self.uvs = []
        self.indices = []

    def append(self, verts, tris, color_or_fn, uvs=None, smooth=True):
        verts = np.asarray(verts, dtype=np.float32)
        tris = np.asarray(tris, dtype=np.uint32)
        if len(verts) == 0 or len(tris) == 0:
            return

        if isinstance(color_or_fn, str):
            lin = hex_to_linear(color_or_fn)
            srgb = hex_to_rgb255(color_or_fn)
            c_lin = np.tile(lin, (len(verts), 1))
            c_srgb = np.tile(srgb, (len(verts), 1))
        else:
            hexes = [color_or_fn(i, v) for i, v in enumerate(verts)]
            c_lin = np.asarray([hex_to_linear(h) for h in hexes], dtype=np.float32)
            c_srgb = np.asarray([hex_to_rgb255(h) for h in hexes], dtype=np.float32)

        v0 = verts[tris[:, 0]]
        v1 = verts[tris[:, 1]]
        v2 = verts[tris[:, 2]]
        fn = np.cross(v1 - v0, v2 - v0)

        if uvs is not None:
            uv_arr = np.asarray(uvs, dtype=np.float32)
        else:
            uv_arr = None

        if smooth:
            vn = np.zeros_like(verts)
            np.add.at(vn, tris[:, 0], fn)
            np.add.at(vn, tris[:, 1], fn)
            np.add.at(vn, tris[:, 2], fn)
            vn = normalize_rows(vn)
            if uv_arr is None:
                uv_arr = self._triplanar_uv(verts, vn)
            offset = len(self.positions)
            self.positions.extend(verts.tolist())
            self.normals.extend(vn.tolist())
            self.colors.extend(c_lin.tolist())
            self.rgb_srgb.extend(c_srgb.tolist())
            self.uvs.extend(uv_arr.tolist())
            self.indices.extend((tris + offset).ravel().tolist())
        else:
            fn_norm = normalize_rows(fn)
            for ti, tri in enumerate(tris):
                offset = len(self.positions)
                face_n = fn_norm[ti]
                for k in range(3):
                    vi = int(tri[k])
                    vp = verts[vi]
                    self.positions.append(vp.tolist())
                    self.normals.append(face_n.tolist())
                    self.colors.append(c_lin[vi].tolist())
                    self.rgb_srgb.append(c_srgb[vi].tolist())
                    if uv_arr is not None:
                        self.uvs.append(uv_arr[vi].tolist())
                    else:
                        ax = int(np.argmax(np.abs(face_n)))
                        if ax == 0:
                            self.uvs.append([float(vp[2]), float(vp[1])])
                        elif ax == 1:
                            self.uvs.append([float(vp[0]), float(vp[2])])
                        else:
                            self.uvs.append([float(vp[0]), float(vp[1])])
                self.indices.extend([offset, offset + 1, offset + 2])

    @staticmethod
    def _triplanar_uv(verts, norms):
        axis = np.argmax(np.abs(norms), axis=1)
        uv = np.stack((verts[:, 0], verts[:, 1]), axis=1).astype(np.float32)
        uv[axis == 0, 0] = verts[axis == 0, 2]
        uv[axis == 1, 1] = verts[axis == 1, 2]
        return uv


class RiggedSculptor:
    """Hierarchical sculpted creature builder with PBR textures and multi-clip animations."""

    def __init__(self, enemy_id, title):
        self.enemy_id = enemy_id
        self.title = title
        self.materials = {}
        self.joints = {}
        self.joint_order = []
        self.buckets = {}

    def mat(
        self,
        name,
        metallic=0.2,
        roughness=0.5,
        emissive=None,
        double_sided=False,
        pbr_kind=None,
        alpha=1.0,
    ):
        spec = MaterialSpec(name, metallic, roughness, emissive, double_sided, pbr_kind, alpha)
        self.materials[name] = spec
        return spec

    def joint(self, name, parent=None, pivot=(0.0, 0.0, 0.0), rest_scale=(1.0, 1.0, 1.0)):
        self.joints[name] = {
            "name": name,
            "parent": parent,
            "pivot": np.asarray(pivot, dtype=np.float32),
            "rest_scale": tuple(float(v) for v in rest_scale),
        }
        self.joint_order.append(name)
        return name

    def bucket(self, joint_name, mat_spec):
        key = (joint_name, mat_spec.name)
        if key not in self.buckets:
            self.buckets[key] = MeshBucket(joint_name, mat_spec)
        return self.buckets[key]

    def ellipsoid(
        self,
        joint,
        mat,
        center,
        radii,
        color,
        u_segs=22,
        v_segs=14,
        rot=(0.0, 0.0, 0.0),
        bump_fn=None,
        smooth=True,
    ):
        cx, cy, cz = center
        rx, ry, rz = radii
        rmat = rot_matrix_xyz(*rot)
        verts, uvs = [], []
        for vi in range(v_segs + 1):
            phi = (vi / v_segs) * PI
            sp, cp = math.sin(phi), math.cos(phi)
            for ui in range(u_segs):
                theta = (ui / u_segs) * TAU
                ct, st = math.cos(theta), math.sin(theta)
                disp = 1.0 + (bump_fn(theta, phi) if bump_fn else 0.0)
                local = np.array([ct * sp * rx * disp, cp * ry * disp, st * sp * rz * disp])
                w = rmat @ local + np.array([cx, cy, cz], dtype=np.float32)
                verts.append(w.tolist())
                uvs.append([ui / u_segs * 2.0, vi / v_segs])
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
        self.bucket(joint, mat).append(verts, tris, color, uvs=uvs, smooth=smooth)

    def tube(
        self,
        joint,
        mat,
        points,
        radii,
        color,
        segs=14,
        steps_per_seg=3,
        rx_scale=1.0,
        rz_scale=1.0,
        flute_amp=0.0,
        flute_freq=0,
        twist=0.0,
        cap_ends=True,
        smooth=True,
        ring_mod_fn=None,
    ):
        raw_pts = np.asarray(points, dtype=np.float32)
        if len(raw_pts) < 2:
            return
        pts = catmull_rom_samples(raw_pts, steps_per_seg) if steps_per_seg > 1 else raw_pts
        n = len(pts)
        if isinstance(radii, (int, float)):
            rads = np.full(n, float(radii), dtype=np.float32)
        else:
            raw_r = np.asarray(radii, dtype=np.float32)
            t_in = np.linspace(0.0, 1.0, len(raw_r))
            t_out = np.linspace(0.0, 1.0, n)
            rads = np.interp(t_out, t_in, raw_r).astype(np.float32)

        tangents = np.zeros_like(pts)
        tangents[0] = pts[1] - pts[0]
        tangents[-1] = pts[-1] - pts[-2]
        if n > 2:
            tangents[1:-1] = pts[2:] - pts[:-2]
        tangents = normalize_rows(tangents)

        ref = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        if abs(float(np.dot(tangents[0], ref))) > 0.9:
            ref = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        norm = np.cross(tangents[0], ref)
        norm /= np.linalg.norm(norm) + 1e-8

        arc_lens = np.zeros(n, dtype=np.float32)
        for i in range(1, n):
            arc_lens[i] = arc_lens[i - 1] + float(np.linalg.norm(pts[i] - pts[i - 1]))
        total_len = max(1e-4, float(arc_lens[-1]))

        verts, uvs = [], []
        for i in range(n):
            t_dir = tangents[i]
            if i > 0:
                norm = norm - t_dir * float(np.dot(norm, t_dir))
                n_len = float(np.linalg.norm(norm))
                if n_len < 1e-6:
                    alt = np.array([1.0, 0.0, 0.0], dtype=np.float32)
                    if abs(float(np.dot(t_dir, alt))) > 0.9:
                        alt = np.array([0.0, 0.0, 1.0], dtype=np.float32)
                    norm = np.cross(t_dir, alt)
                    n_len = float(np.linalg.norm(norm))
                norm = norm / max(1e-6, n_len)
            binorm = np.cross(t_dir, norm)
            u_param = i / max(1, n - 1)
            r = float(rads[i])
            ang_off = twist * u_param
            for si in range(segs):
                a = (si / segs) * TAU + ang_off
                mod = 1.0 + flute_amp * math.cos(a * flute_freq)
                if ring_mod_fn:
                    mod *= ring_mod_fn(u_param, a)
                v = pts[i] + (norm * math.cos(a) * rx_scale + binorm * math.sin(a) * rz_scale) * (
                    r * mod
                )
                verts.append(v.tolist())
                uvs.append([si / segs * 2.0, arc_lens[i] / max(0.35, total_len * 0.45)])

        tris = []
        for i in range(n - 1):
            r0, r1 = i * segs, (i + 1) * segs
            for si in range(segs):
                sn = (si + 1) % segs
                a, b, c, d = r0 + si, r0 + sn, r1 + sn, r1 + si
                tris.append([a, b, c])
                tris.append([a, c, d])

        if cap_ends and rads[0] > 0.004:
            ci = len(verts)
            verts.append(pts[0].tolist())
            uvs.append([0.5, 0.0])
            for si in range(segs):
                tris.append([ci, (si + 1) % segs, si])
        if cap_ends and rads[-1] > 0.004:
            ci = len(verts)
            verts.append(pts[-1].tolist())
            uvs.append([0.5, 1.0])
            base = (n - 1) * segs
            for si in range(segs):
                tris.append([ci, base + si, base + (si + 1) % segs])

        if isinstance(color, tuple) and len(color) == 2:
            c0, c1 = color
            ring_cols = [lerp_hex(c0, c1, i / max(1, n - 1)) for i in range(n)]

            def color_fn(idx, _v):
                ring_i = min(n - 1, idx // segs)
                return ring_cols[ring_i]

            self.bucket(joint, mat).append(verts, tris, color_fn, uvs=uvs, smooth=smooth)
        else:
            self.bucket(joint, mat).append(verts, tris, color, uvs=uvs, smooth=smooth)

    def loft_rings(self, joint, mat, rings, color_or_fn, smooth=True, cap_start=True, cap_end=True):
        """Loft a watertight anatomical mesh across a list of closed 3D rings (each len M)."""
        n_rings = len(rings)
        segs = len(rings[0])
        verts, uvs = [], []
        for ri, ring in enumerate(rings):
            v_coord = ri / max(1, n_rings - 1)
            for si, pt in enumerate(ring):
                verts.append([float(pt[0]), float(pt[1]), float(pt[2])])
                uvs.append([si / segs * 2.0, v_coord * 2.0])
        tris = []
        for ri in range(n_rings - 1):
            r0, r1 = ri * segs, (ri + 1) * segs
            for si in range(segs):
                sn = (si + 1) % segs
                a, b, c, d = r0 + si, r0 + sn, r1 + sn, r1 + si
                tris.append([a, c, b])
                tris.append([a, d, c])
        if cap_start:
            c0 = np.mean(rings[0], axis=0)
            ci = len(verts)
            verts.append(c0.tolist())
            uvs.append([0.5, 0.0])
            for si in range(segs):
                tris.append([ci, si, (si + 1) % segs])
        if cap_end:
            c1 = np.mean(rings[-1], axis=0)
            ci = len(verts)
            verts.append(c1.tolist())
            uvs.append([0.5, 1.0])
            base = (n_rings - 1) * segs
            for si in range(segs):
                tris.append([ci, base + (si + 1) % segs, base + si])
        self.bucket(joint, mat).append(verts, tris, color_or_fn, uvs=uvs, smooth=smooth)

    def torus(
        self,
        joint,
        mat,
        center,
        major_r,
        minor_r,
        color,
        u_segs=32,
        v_segs=10,
        rot=(0.0, 0.0, 0.0),
        arc=TAU,
        flute_amp=0.0,
        flute_freq=0,
    ):
        cx, cy, cz = center
        rmat = rot_matrix_xyz(*rot)
        closed = abs(arc - TAU) < 1e-4
        u_count = u_segs if closed else u_segs + 1
        verts, uvs = [], []
        for ui in range(u_count):
            u = (ui / u_segs) * arc
            cu, su = math.cos(u), math.sin(u)
            for vi in range(v_segs):
                v = (vi / v_segs) * TAU
                cv, sv = math.cos(v), math.sin(v)
                mr = minor_r * (1.0 + flute_amp * math.cos(u * flute_freq))
                r = major_r + mr * cv
                local = np.array([r * cu, mr * sv, r * su], dtype=np.float32)
                w = rmat @ local + np.array([cx, cy, cz], dtype=np.float32)
                verts.append(w.tolist())
                uvs.append([ui / u_segs * 3.0, vi / v_segs])
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
        self.bucket(joint, mat).append(verts, tris, color, uvs=uvs, smooth=True)

    def scale_plate(
        self,
        joint,
        mat,
        center,
        normal,
        tip_dir,
        width,
        length,
        thickness,
        color,
        tip_color=None,
    ):
        """Sculpt an authentic 3D beveled curved diamond-shield dragon scale with central keel."""
        n = np.asarray(normal, dtype=np.float32)
        n /= np.linalg.norm(n) + 1e-8
        t = np.asarray(tip_dir, dtype=np.float32)
        t = t - n * float(np.dot(t, n))
        if np.linalg.norm(t) < 1e-6:
            ref = np.array([0.0, -1.0, 0.0], dtype=np.float32)
            t = ref - n * float(np.dot(ref, n))
        t /= np.linalg.norm(t) + 1e-8
        s = np.cross(n, t)
        s /= np.linalg.norm(s) + 1e-8

        c = np.asarray(center, dtype=np.float32)
        hw = width * 0.5
        hl = length * 0.5
        th = thickness

        # Local outline (s, t, n): 6 perimeter pts + raised central keel + underside base
        outline = [
            (0.0, -hl * 0.88, -th * 0.15),  # root
            (hw * 0.85, -hl * 0.32, 0.0),  # right shoulder
            (hw * 0.96, hl * 0.25, th * 0.18),  # right mid
            (0.0, hl * 1.15, th * 0.42),  # sharp outward-lifted tip
            (-hw * 0.96, hl * 0.25, th * 0.18),  # left mid
            (-hw * 0.85, -hl * 0.32, 0.0),  # left shoulder
        ]
        # Top raised spine keel (2 vertices) & bottom backing
        keel_root = (0.0, -hl * 0.20, th * 1.15)
        keel_tip = (0.0, hl * 0.42, th * 1.05)
        back_center = (0.0, 0.0, -th * 0.48)

        pts_local = outline + [keel_root, keel_tip, back_center]
        verts = [(c + s * ls + t * lt + n * ln).tolist() for ls, lt, ln in pts_local]
        # Top faces (CCW around +n)
        tris = [
            [0, 1, 6],
            [1, 2, 7],
            [1, 7, 6],
            [2, 3, 7],
            [3, 4, 7],
            [4, 5, 6],
            [4, 6, 7],
            [5, 0, 6],
            # Back faces (CCW around -n)
            [8, 1, 0],
            [8, 2, 1],
            [8, 3, 2],
            [8, 4, 3],
            [8, 5, 4],
            [8, 0, 5],
        ]
        if tip_color:

            def col_fn(idx, _v):
                if idx in (3, 7):
                    return tip_color
                if idx in (2, 4, 6):
                    return lerp_hex(color, tip_color, 0.45)
                return color

            self.bucket(joint, mat).append(verts, tris, col_fn, smooth=False)
        else:
            self.bucket(joint, mat).append(verts, tris, color, smooth=False)

    def crystal_spire(
        self,
        joint,
        mat,
        base,
        direction,
        length,
        radius,
        color_base,
        color_tip,
        sides=6,
        taper=0.72,
    ):
        """Sharp faceted hexagonal amethyst rift-crystal prism with asymmetric pyramid tip."""
        basis = basis_from_dir(direction)
        b = np.asarray(base, dtype=np.float32)
        h_body = length * 0.72
        verts = []
        # Ring 0 (base), Ring 1 (shoulder), Apex, Base center
        for si in range(sides):
            a = (si / sides) * TAU
            ecc = 1.12 if si % 2 == 0 else 0.90
            v = b + basis @ np.array(
                [math.cos(a) * radius * ecc, 0.0, math.sin(a) * radius * ecc], dtype=np.float32
            )
            verts.append(v.tolist())
        for si in range(sides):
            a = (si / sides) * TAU + 0.08
            ecc = 1.08 if si % 2 == 0 else 0.88
            h_var = h_body * (1.0 + 0.09 * math.sin(a * 2.0))
            v = b + basis @ np.array(
                [
                    math.cos(a) * radius * taper * ecc,
                    h_var,
                    math.sin(a) * radius * taper * ecc,
                ],
                dtype=np.float32,
            )
            verts.append(v.tolist())
        apex_idx = len(verts)
        verts.append((b + basis @ np.array([0.0, length, 0.0], dtype=np.float32)).tolist())
        bot_idx = len(verts)
        verts.append(b.tolist())

        tris = []
        for si in range(sides):
            sn = (si + 1) % sides
            r0, r1 = si, sides + si
            r0n, r1n = sn, sides + sn
            tris.append([r0, r0n, r1n])
            tris.append([r0, r1n, r1])
            tris.append([r1, r1n, apex_idx])
            tris.append([bot_idx, r0n, r0])

        def col_fn(idx, _v):
            if idx == apex_idx:
                return color_tip
            if idx >= sides and idx < 2 * sides:
                return lerp_hex(color_base, color_tip, 0.58)
            return color_base

        self.bucket(joint, mat).append(verts, tris, col_fn, smooth=False)

    def membrane(
        self, joint, mat, spine_a, spine_b, color_a, color_b, divs_u=14, divs_v=8, camber=0.08
    ):
        """Doubly-curved scalloped draconic rift-fin membrane."""
        a = catmull_rom_samples(spine_a, 3)
        b = catmull_rom_samples(spine_b, 3)
        verts, uvs = [], []
        cols = divs_u + 1
        rows = divs_v + 1
        for vi in range(rows):
            vt = vi / divs_v
            for ui in range(cols):
                ut = ui / divs_u
                fa = ut * (len(a) - 1)
                ia = min(len(a) - 2, int(fa))
                pa = a[ia] * (1.0 - (fa - ia)) + a[ia + 1] * (fa - ia)
                fb = ut * (len(b) - 1)
                ib = min(len(b) - 2, int(fb))
                pb = b[ib] * (1.0 - (fb - ib)) + b[ib + 1] * (fb - ib)
                pt = pa * (1.0 - vt) + pb * vt
                scallop = -0.14 * abs(math.sin(ut * PI * 3.0)) * (vt**1.3)
                pt = pt.copy()
                pt[1] += camber * math.sin(vt * PI) + scallop * 0.25
                pt[2] -= camber * 0.65 * math.sin(ut * PI) * math.sin(vt * PI)
                verts.append(pt.tolist())
                uvs.append([ut * 2.0, vt * 2.0])
        tris = []
        for vi in range(divs_v):
            for ui in range(divs_u):
                i0 = vi * cols + ui
                i1 = i0 + 1
                i2 = i0 + cols + 1
                i3 = i0 + cols
                tris.append([i0, i1, i2])
                tris.append([i0, i2, i3])

        def col_fn(idx, _v):
            vi = idx // cols
            return lerp_hex(color_a, color_b, vi / max(1, divs_v))

        self.bucket(joint, mat).append(verts, tris, col_fn, uvs=uvs, smooth=True)

    def blade_prism(self, joint, mat, spine_pts, widths, thicknesses, color_spine, color_edge):
        """Swept sharp double-edged curved war-cleaver blade with central fuller ridge."""
        pts = catmull_rom_samples(spine_pts, 4)
        n = len(pts)
        t_in = np.linspace(0.0, 1.0, len(widths))
        t_out = np.linspace(0.0, 1.0, n)
        ws = np.interp(t_out, t_in, widths).astype(np.float32)
        ths = np.interp(t_out, t_in, thicknesses).astype(np.float32)

        tangents = np.zeros_like(pts)
        tangents[0] = pts[1] - pts[0]
        tangents[-1] = pts[-1] - pts[-2]
        if n > 2:
            tangents[1:-1] = pts[2:] - pts[:-2]
        tangents = normalize_rows(tangents)

        # Cross-section diamond-hex: front sharp edge (+F), outer bevel (+S), back spine (-F), inner bevel (-S)
        verts, uvs = [], []
        rings = []
        for i in range(n):
            td = tangents[i]
            side = np.array([1.0, 0.0, 0.0], dtype=np.float32)
            side = side - td * float(np.dot(side, td))
            if np.linalg.norm(side) < 1e-4:
                side = np.array([0.0, 0.0, 1.0], dtype=np.float32)
                side = side - td * float(np.dot(side, td))
            side /= np.linalg.norm(side) + 1e-8
            fwd = np.cross(side, td)
            fwd /= np.linalg.norm(fwd) + 1e-8

            w = float(ws[i])
            th = float(ths[i])
            # 6-point sharp blade cross section (front razor edge, 2 beveled faces, thick back spine)
            sec = [
                pts[i] + fwd * (w * 0.72),  # 0: razor leading edge
                pts[i] + fwd * (w * 0.15) + side * th,  # 1: outer bevel ridge
                pts[i] - fwd * (w * 0.42) + side * (th * 0.75),  # 2: back-outer spine
                pts[i] - fwd * (w * 0.52),  # 3: spine center
                pts[i] - fwd * (w * 0.42) - side * (th * 0.75),  # 4: back-inner spine
                pts[i] + fwd * (w * 0.15) - side * th,  # 5: inner bevel ridge
            ]
            rings.append(sec)

        self.loft_rings(
            joint,
            mat,
            rings,
            lambda idx, _v: (
                color_edge
                if (idx % 6 == 0)
                else lerp_hex(color_spine, color_edge, 0.22 if (idx % 6 in (1, 5)) else 0.0)
            ),
            smooth=False,
            cap_start=True,
            cap_end=True,
        )

    def total_triangles(self):
        return sum(len(b.indices) // 3 for b in self.buckets.values())

    def _compute_world_rest_transforms(self):
        world = {}

        def resolve(jname):
            if jname in world:
                return world[jname]
            j = self.joints[jname]
            t = j["pivot"]
            s = j["rest_scale"]
            if j["parent"] is None:
                m = np.eye(4, dtype=np.float32)
                m[0, 0], m[1, 1], m[2, 2] = s
                m[:3, 3] = t
            else:
                pm = resolve(j["parent"])
                parent_pivot = self.joints[j["parent"]]["pivot"]
                local_t = t - parent_pivot
                lm = np.eye(4, dtype=np.float32)
                lm[0, 0], lm[1, 1], lm[2, 2] = s
                lm[:3, 3] = local_t
                m = pm @ lm
            world[jname] = m
            return m

        for name in self.joint_order:
            resolve(name)
        return world

    def _floor_shift(self):
        """Compute shift so visible non-FX geometry stands on y = 0 and X/Z are centered."""
        xs, ys, zs = [], [], []
        for b in self.buckets.values():
            j = self.joints[b.joint_name]
            if max(abs(v) for v in j["rest_scale"]) < 0.01 or not b.positions:
                continue
            arr = np.asarray(b.positions, dtype=np.float32)
            xs.append(arr[:, 0])
            ys.append(arr[:, 1])
            zs.append(arr[:, 2])
        all_x = np.concatenate(xs)
        all_y = np.concatenate(ys)
        all_z = np.concatenate(zs)
        return np.array(
            [
                -(float(all_x.min()) + float(all_x.max())) * 0.5,
                -float(all_y.min()),
                -(float(all_z.min()) + float(all_z.max())) * 0.5,
            ],
            dtype=np.float32,
        )

    def render_portrait_svg(self, floor_shift):
        """Render a crisp 600x900 Phong + rim-lit SVG portrait from the 3D sculpted mesh."""
        cam_dir = normalize_rows(np.array([[0.46, 0.24, 1.0]], dtype=np.float32))[0]
        right = normalize_rows(np.array([np.cross([0, 1, 0], cam_dir)], dtype=np.float32))[0]
        up = np.cross(cam_dir, right)
        light_dir = normalize_rows(np.array([[0.55, 0.72, 0.44]], dtype=np.float32))[0]
        fill_dir = normalize_rows(np.array([[-0.65, 0.12, 0.55]], dtype=np.float32))[0]

        all_proj = []
        faces = []
        for b in self.buckets.values():
            j = self.joints[b.joint_name]
            if max(abs(v) for v in j["rest_scale"]) < 0.01 or not b.positions:
                continue
            verts = np.asarray(b.positions, dtype=np.float32) + floor_shift
            cols = np.asarray(b.rgb_srgb, dtype=np.float32)
            tris = np.asarray(b.indices, dtype=np.uint32).reshape(-1, 3)

            px = verts @ right
            py = -(verts @ up)
            pz = verts @ cam_dir
            proj = np.stack([px, py, pz], axis=1)
            all_proj.append(proj)

            v0, v1, v2 = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
            raw_n = np.cross(v1 - v0, v2 - v0)
            tri_n = normalize_rows(raw_n)
            tri_c = cols[tris].mean(axis=1)
            tri_p = proj[tris]
            depth = tri_p[:, :, 2].mean(axis=1)
            facing = tri_n @ cam_dir

            em = np.asarray(b.mat_spec.emissive or [0, 0, 0], dtype=np.float32) * 195.0
            diffuse = np.clip(tri_n @ light_dir, 0.0, 1.0)
            fill = np.clip(tri_n @ fill_dir, 0.0, 1.0)
            ndv = np.clip(np.abs(facing), 0.0, 1.0)
            rim = ((1.0 - ndv) ** 2.1) * 52.0

            for ti in range(len(tris)):
                if not b.mat_spec.double_sided and facing[ti] <= 0.02:
                    continue
                p2 = tri_p[ti, :, :2]
                area2 = abs(
                    (p2[1, 0] - p2[0, 0]) * (p2[2, 1] - p2[0, 1])
                    - (p2[2, 0] - p2[0, 0]) * (p2[1, 1] - p2[0, 1])
                )
                if area2 < 0.00018:
                    continue
                shade_k = 0.36 + float(diffuse[ti]) * 0.72 + float(fill[ti]) * 0.18
                rgb = np.clip(
                    tri_c[ti] * shade_k
                    + np.array([rim[ti] * 0.85, rim[ti] * 0.72, rim[ti] * 1.25])
                    + em,
                    0,
                    255,
                ).astype(int)
                hex_c = f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
                faces.append((float(depth[ti]), p2, hex_c))

        stacked = np.concatenate(all_proj, axis=0)
        min_x, min_y = float(stacked[:, 0].min()), float(stacked[:, 1].min())
        max_x, max_y = float(stacked[:, 0].max()), float(stacked[:, 1].max())
        scale = min(218.0 / max(1e-4, max_x - min_x), 292.0 / max(1e-4, max_y - min_y))
        cx = 128.0 - (min_x + max_x) * 0.5 * scale
        cy = 198.0 - (min_y + max_y) * 0.5 * scale
        faces.sort(key=lambda item: item[0])

        polys = []
        for _, pts2, hex_c in faces:
            sx = cx + pts2[:, 0] * scale
            sy = cy + pts2[:, 1] * scale
            pts_str = " ".join(f"{sx[k]:.1f},{sy[k]:.1f}" for k in range(3))
            polys.append(f'<polygon points="{pts_str}" fill="{hex_c}"/>')

        shadow_y = min(354.0, cy + max_y * scale + 5.0)
        shadow_rx = min(96.0, (max_x - min_x) * scale * 0.44)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" '
            f'viewBox="0 0 256 384" data-art-style="sculpted-overlord-v1">\n'
            f"<title>{self.title}</title>\n"
            f"<defs>"
            f'<radialGradient id="overlordBg" cx="50%" cy="44%" r="70%">'
            f'<stop offset="0" stop-color="#301d4a"/>'
            f'<stop offset="0.55" stop-color="#171525"/>'
            f'<stop offset="1" stop-color="#08090f"/>'
            f"</radialGradient>"
            f'<radialGradient id="riftAura" cx="50%" cy="46%" r="44%">'
            f'<stop offset="0" stop-color="#a855f7" stop-opacity="0.34"/>'
            f'<stop offset="0.55" stop-color="#6b21a8" stop-opacity="0.16"/>'
            f'<stop offset="1" stop-color="#08090f" stop-opacity="0"/>'
            f"</radialGradient>"
            f"</defs>\n"
            f'<path fill="url(#overlordBg)" d="M0 0h256v384H0z"/>\n'
            f'<circle cx="128" cy="176" r="108" fill="url(#riftAura)"/>\n'
            f'<ellipse cx="128" cy="{shadow_y:.1f}" rx="{shadow_rx:.1f}" ry="11" '
            f'fill="#04050a" opacity="0.68"/>\n'
            f'<ellipse cx="128" cy="{shadow_y:.1f}" rx="{shadow_rx * 0.72:.1f}" ry="6.5" '
            f'fill="none" stroke="#9b5cf6" stroke-width="1.2" opacity="0.46"/>\n'
            f'<g data-enemy-model="{self.enemy_id}" shape-rendering="crispEdges">'
            + "".join(polys)
            + "</g>\n</svg>\n"
        )

    def export_glb(self, filename, portrait_slug, clips):
        floor_shift = self._floor_shift()
        binary = bytearray()
        doc = {
            "asset": {"version": "2.0", "generator": "Wanxiang sculpted overlord atelier v2"},
            "scene": 0,
            "scenes": [{"nodes": []}],
            "nodes": [],
            "meshes": [],
            "materials": [],
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
            "images": [],
            "textures": [],
            "buffers": [{"byteLength": 0}],
            "bufferViews": [],
            "accessors": [],
            "animations": [],
        }

        def push_buf(content, target=None):
            binary.extend(b"\0" * (-len(binary) % 4))
            idx = len(doc["bufferViews"])
            view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(content)}
            if target is not None:
                view["target"] = target
            doc["bufferViews"].append(view)
            binary.extend(content)
            return idx

        def add_acc(values, dtype, kind, target=None):
            arr = np.asarray(values, dtype=dtype)
            item = {
                "bufferView": push_buf(arr.tobytes(), target),
                "componentType": 5126 if dtype == "<f4" else 5125,
                "count": len(arr),
                "type": kind,
            }
            if kind in ("VEC2", "VEC3") or (kind == "SCALAR" and target is None):
                item["min"] = arr.min(axis=0).tolist()
                item["max"] = arr.max(axis=0).tolist()
            idx = len(doc["accessors"])
            doc["accessors"].append(item)
            return idx

        # 1. Embed procedural PBR texture maps (albedo + normal per PBR category)
        tex_cache = {}
        mat_indices = {}
        for mname, spec in self.materials.items():
            mat_def = {
                "name": mname,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, spec.alpha],
                    "metallicFactor": spec.metallic,
                    "roughnessFactor": spec.roughness,
                },
                "doubleSided": spec.double_sided,
            }
            if spec.alpha < 0.99:
                mat_def["alphaMode"] = "BLEND"
            if spec.emissive:
                mat_def["emissiveFactor"] = spec.emissive
            if spec.pbr_kind:
                kind = spec.pbr_kind
                if kind not in tex_cache:
                    alb_png, nrm_png = make_pbr_maps(kind)
                    alb_img = len(doc["images"])
                    doc["images"].append(
                        {
                            "name": f"{kind}_albedo",
                            "bufferView": push_buf(alb_png),
                            "mimeType": "image/png",
                        }
                    )
                    alb_tex = len(doc["textures"])
                    doc["textures"].append({"source": alb_img, "sampler": 0})

                    nrm_img = len(doc["images"])
                    doc["images"].append(
                        {
                            "name": f"{kind}_normal",
                            "bufferView": push_buf(nrm_png),
                            "mimeType": "image/png",
                        }
                    )
                    nrm_tex = len(doc["textures"])
                    doc["textures"].append({"source": nrm_img, "sampler": 0})
                    tex_cache[kind] = (alb_tex, nrm_tex)

                alb_tex, nrm_tex = tex_cache[kind]
                mat_def["pbrMetallicRoughness"]["baseColorTexture"] = {"index": alb_tex}
                mat_def["normalTexture"] = {
                    "index": nrm_tex,
                    "scale": PBR_SPECS[kind][4],
                }

            mat_indices[mname] = len(doc["materials"])
            doc["materials"].append(mat_def)

        # 2. Build joint hierarchy nodes
        joint_nodes = {}
        joint_world_pos = {}
        joint_local_pos = {}
        scene_nodes = doc["scenes"][0]["nodes"]

        for jname in self.joint_order:
            j = self.joints[jname]
            world_p = j["pivot"] + floor_shift
            parent = j["parent"]
            local_t = world_p - joint_world_pos[parent] if parent else world_p
            node_idx = len(doc["nodes"])
            node = {
                "name": jname,
                "translation": [float(v) for v in local_t],
                "rotation": [0.0, 0.0, 0.0, 1.0],
                "scale": list(j["rest_scale"]),
                "children": [],
            }
            if parent is None:
                node["extras"] = {
                    "nonVoxel": True,
                    "modelType": "Articulated procedural creature",
                }
            doc["nodes"].append(node)
            if parent:
                doc["nodes"][joint_nodes[parent]]["children"].append(node_idx)
            else:
                scene_nodes.append(node_idx)
            joint_nodes[jname] = node_idx
            joint_world_pos[jname] = world_p
            joint_local_pos[jname] = local_t

        # 3. Attach meshes to their owning joints
        total_tris = 0
        comp_counts = {}
        for (jname, mname), bucket in self.buckets.items():
            if not bucket.indices:
                continue
            spec = bucket.mat_spec
            uv_scale = PBR_SPECS[spec.pbr_kind][2] if spec.pbr_kind else 1.0
            local_pos = (
                np.asarray(bucket.positions, dtype=np.float32)
                + floor_shift
                - joint_world_pos[jname]
            )
            uv_scaled = np.asarray(bucket.uvs, dtype=np.float32) * uv_scale
            attrs = {
                "POSITION": add_acc(local_pos, "<f4", "VEC3", 34962),
                "NORMAL": add_acc(bucket.normals, "<f4", "VEC3", 34962),
                "COLOR_0": add_acc(bucket.colors, "<f4", "VEC3", 34962),
                "TEXCOORD_0": add_acc(uv_scaled, "<f4", "VEC2", 34962),
            }
            idx_acc = add_acc(bucket.indices, "<u4", "SCALAR", 34963)
            mesh_name = f"{jname}_{mname}"
            mesh_id = len(doc["meshes"])
            doc["meshes"].append(
                {
                    "name": mesh_name,
                    "primitives": [
                        {
                            "attributes": attrs,
                            "indices": idx_acc,
                            "material": mat_indices[mname],
                        }
                    ],
                }
            )
            nid = len(doc["nodes"])
            doc["nodes"].append({"name": mesh_name, "mesh": mesh_id})
            doc["nodes"][joint_nodes[jname]]["children"].append(nid)
            tris = len(bucket.indices) // 3
            comp_counts[mesh_name] = tris
            total_tris += tris

        # 4. Bake all animation clips (supporting translation, rotation, and scale tracks)
        for clip_name, (times, tracks_by_joint) in clips.items():
            clock_acc = add_acc(np.asarray(times, dtype=np.float32).reshape(-1, 1), "<f4", "SCALAR")
            samplers, channels = [], []
            for jname, track_data in tracks_by_joint.items():
                node_id = joint_nodes[jname]
                base_t = joint_local_pos[jname]
                if "translation" in track_data:
                    vals = [
                        (base_t + np.asarray(delta, dtype=np.float32)).tolist()
                        for delta in track_data["translation"]
                    ]
                    out_acc = add_acc(vals, "<f4", "VEC3")
                    channels.append(
                        {
                            "sampler": len(samplers),
                            "target": {"node": node_id, "path": "translation"},
                        }
                    )
                    samplers.append(
                        {"input": clock_acc, "output": out_acc, "interpolation": "LINEAR"}
                    )
                if "rotation" in track_data:
                    out_acc = add_acc(track_data["rotation"], "<f4", "VEC4")
                    channels.append(
                        {
                            "sampler": len(samplers),
                            "target": {"node": node_id, "path": "rotation"},
                        }
                    )
                    samplers.append(
                        {"input": clock_acc, "output": out_acc, "interpolation": "LINEAR"}
                    )
                if "scale" in track_data:
                    out_acc = add_acc(track_data["scale"], "<f4", "VEC3")
                    channels.append(
                        {
                            "sampler": len(samplers),
                            "target": {"node": node_id, "path": "scale"},
                        }
                    )
                    samplers.append(
                        {"input": clock_acc, "output": out_acc, "interpolation": "LINEAR"}
                    )
            doc["animations"].append(
                {"name": clip_name, "channels": channels, "samplers": samplers}
            )

        doc["extras"] = {
            "title": self.title,
            "enemyId": self.enemy_id,
            "tier": "overlord",
            "nonVoxel": True,
            "voxelBoxes": 0,
            "triangles": total_tris,
            "embeddedPbrMaps": len(doc["images"]),
            "standOnCard": True,
            "cardScaleUnchanged": True,
            "components": comp_counts,
            "source": "建模工具/build_darkscale_warlord.py",
        }

        doc["buffers"][0]["byteLength"] = len(binary)
        head = json.dumps(doc, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
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

        svg_text = self.render_portrait_svg(floor_shift)
        (PORTRAITS / f"{portrait_slug}.svg").write_text(svg_text, encoding="utf-8", newline="\n")

        print(
            f"[Overlord Sculpted PBR] {self.title} ({filename}): "
            f"{len(comp_counts)} meshes, {total_tris:,} tris, "
            f"{len(doc['images'])} PBR maps, {len(doc['animations'])} clips, "
            f"{len(output) / 1048576:.2f} MB; SVG={len(svg_text) // 1024} KB"
        )
        return total_tris


# ---------------------------------------------------------------------------
# Smooth analytical easing helpers for weighty, organic boss animations
# ---------------------------------------------------------------------------
def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / max(1e-6, edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def bell_window(t, start, end):
    if t <= start or t >= end:
        return 0.0
    u = (t - start) / (end - start)
    return math.sin(u * PI) ** 1.35


def plateau(t, rise0, rise1, fall0, fall1):
    if t <= rise0 or t >= fall1:
        return 0.0
    if t < rise1:
        return smoothstep(rise0, rise1, t)
    if t > fall0:
        return 1.0 - smoothstep(fall0, fall1, t)
    return 1.0


def pulse_peak(t, center, width):
    return math.exp(-(((t - center) / max(1e-4, width)) ** 2))


# ---------------------------------------------------------------------------
# Sculpt 初生暗鳞督军 (Nascent Darkscale Warlord)
# ---------------------------------------------------------------------------
def sculpt_skull_and_jaw(s, head_j, jaw_j, mats):
    """Sculpt angular draconic warlord cranium, brow ridges, horns, eyes, jaw & fangs."""
    scale_m = mats["scale"]
    bone_m = mats["bone"]
    sinew_m = mats["sinew"]
    cryst_m = mats["crystal"]
    core_m = mats["core"]
    eye_m = mats["eye"]

    # Lofted anatomical draconic cranium & angular snout (back -> brow -> bridge -> snout tip)
    # Center of skull around (0, 3.04, 0.62), facing +Z
    skull_profile = [
        # (z, y_center, rx, ry_top, ry_bot, ridge_peak)
        (0.30, 3.08, 0.24, 0.22, 0.16, 0.06),
        (0.46, 3.12, 0.34, 0.26, 0.19, 0.09),
        (0.64, 3.11, 0.36, 0.25, 0.18, 0.10),
        (0.84, 3.06, 0.26, 0.18, 0.14, 0.07),
        (1.04, 3.01, 0.20, 0.14, 0.10, 0.05),
        (1.20, 2.97, 0.15, 0.10, 0.07, 0.03),
        (1.30, 2.95, 0.08, 0.05, 0.04, 0.01),
    ]
    segs = 20
    rings = []
    for z, yc, rx, ryt, ryb, ridge in skull_profile:
        ring = []
        for i in range(segs):
            a = (i / segs) * TAU
            ca, sa = math.cos(a), math.sin(a)
            ry = ryt if sa >= 0 else ryb
            # Angular chiseled drake brow & flat-topped nasal bridge
            crest = ridge * max(0.0, sa) ** 3
            cheek = 0.045 * (1.0 - abs(sa)) * (1.0 if 0.42 <= z <= 0.72 else 0.0)
            x = ca * (rx + cheek)
            y = yc + sa * ry + crest
            ring.append([x, y, z])
        rings.append(ring)

    s.loft_rings(
        head_j,
        scale_m,
        rings,
        lambda idx, v: lerp_hex("#3f3c5c", "#5d587c", min(1.0, max(0.0, (v[1] - 2.92) / 0.42))),
        smooth=True,
    )

    # High-contrast pale ash-bone armored snout plate & sweeping horned brow arches
    s.tube(
        head_j,
        bone_m,
        [
            [0.0, 3.24, 0.56],
            [0.0, 3.20, 0.82],
            [0.0, 3.12, 1.06],
            [0.0, 3.04, 1.24],
            [0.0, 2.96, 1.32],
        ],
        [0.10, 0.085, 0.072, 0.058, 0.028],
        ("#c8c2d2", "#a59fb2"),
        segs=10,
        rx_scale=1.25,
        rz_scale=0.62,
    )
    for sx in (-1, 1):
        # Swept pale ash-bone predatory brow ridge overhanging recessed eyes
        s.tube(
            head_j,
            bone_m,
            [
                [sx * 0.09, 3.17, 1.04],
                [sx * 0.21, 3.23, 0.86],
                [sx * 0.34, 3.26, 0.64],
                [sx * 0.42, 3.22, 0.40],
            ],
            [0.042, 0.068, 0.078, 0.025],
            ("#d2ccdc", "#9791a6"),
            segs=10,
        )
        # Flared bony cheek-horn plate
        s.tube(
            head_j,
            bone_m,
            [
                [sx * 0.26, 2.98, 0.78],
                [sx * 0.39, 2.97, 0.56],
                [sx * 0.46, 3.03, 0.32],
                [sx * 0.49, 3.10, 0.16],
            ],
            [0.045, 0.065, 0.052, 0.015],
            ("#beb8ca", "#857f96"),
            segs=9,
        )
        # Recessed dark orbital socket + fiercely glowing orchid-magenta slit eye
        s.ellipsoid(
            head_j,
            sinew_m,
            (sx * 0.23, 3.12, 0.86),
            (0.085, 0.055, 0.11),
            "#1a1224",
            u_segs=14,
            v_segs=10,
            rot=(0.0, sx * 0.35, -sx * 0.22),
        )
        s.ellipsoid(
            head_j,
            eye_m,
            (sx * 0.255, 3.12, 0.90),
            (0.048, 0.028, 0.078),
            "#ff86ff",
            u_segs=14,
            v_segs=10,
            rot=(0.0, sx * 0.38, -sx * 0.28),
        )
        # Glowing violet nostril slit
        s.ellipsoid(
            head_j,
            core_m,
            (sx * 0.095, 3.00, 1.22),
            (0.022, 0.016, 0.036),
            "#c06bff",
            u_segs=10,
            v_segs=8,
        )

        # MASSIVE PRIMARY SWEPT FLUTED HORNS (obsidian base -> glowing rift ring -> pale ash-bone tip!)
        horn_pts = [
            [sx * 0.24, 3.24, 0.54],
            [sx * 0.44, 3.42, 0.34],
            [sx * 0.62, 3.56, 0.08],
            [sx * 0.68, 3.66, -0.22],
            [sx * 0.58, 3.80, -0.44],
        ]
        s.tube(
            head_j,
            scale_m,
            horn_pts,
            [0.125, 0.105, 0.082, 0.052, 0.014],
            ("#3d3658", "#c8c2d6"),
            segs=14,
            steps_per_seg=4,
            flute_amp=0.16,
            flute_freq=7,
            twist=1.4 * sx,
        )
        # Glowing amethyst rift collar veins cracking the base of each horn
        s.torus(
            head_j,
            cryst_m,
            (sx * 0.30, 3.30, 0.48),
            0.115,
            0.024,
            "#be75ff",
            u_segs=20,
            v_segs=8,
            rot=(0.8, sx * 0.5, sx * 0.4),
        )
        # Secondary lower swept temporal horn
        s.tube(
            head_j,
            bone_m,
            [
                [sx * 0.32, 3.06, 0.44],
                [sx * 0.52, 3.12, 0.20],
                [sx * 0.66, 3.24, -0.06],
            ],
            [0.065, 0.044, 0.012],
            ("#5c5674", "#cfc9dc"),
            segs=10,
            flute_amp=0.12,
            flute_freq=5,
        )

        # Upper maxilla curved fangs (5 per side, big front tusk!)
        for fi, (fz, fx, flen, frad) in enumerate(
            [
                (1.19, 0.12, 0.145, 0.028),
                (1.07, 0.16, 0.105, 0.022),
                (0.96, 0.19, 0.092, 0.020),
                (0.85, 0.22, 0.082, 0.018),
                (0.75, 0.24, 0.070, 0.016),
            ]
        ):
            s.tube(
                head_j,
                bone_m,
                [
                    [sx * fx, 2.94, fz],
                    [sx * (fx * 1.03), 2.94 - flen * 0.55, fz + 0.015],
                    [sx * (fx * 0.96), 2.94 - flen, fz - 0.018],
                ],
                [frad, frad * 0.55, 0.004],
                ("#e4deec", "#b7b0c4"),
                segs=8,
                steps_per_seg=2,
            )

    # Central Nascent Warlord Crown Crest (faceted amethyst crystal horn rising between the brows!)
    s.crystal_spire(
        head_j,
        cryst_m,
        (0.0, 3.26, 0.66),
        (0.0, 0.85, -0.52),
        0.46,
        0.082,
        "#7d32e8",
        "#f0b8ff",
    )
    for sx in (-1, 1):
        s.crystal_spire(
            head_j,
            cryst_m,
            (sx * 0.11, 3.24, 0.58),
            (sx * 0.34, 0.82, -0.46),
            0.28,
            0.052,
            "#6b25cf",
            "#df9cff",
        )

    # --- Articulated Hinged Lower Jaw (Jaw_Lower) ---
    jaw_profile = [
        (0.58, 2.86, 0.24, 0.06, 0.09),
        (0.76, 2.84, 0.21, 0.055, 0.085),
        (0.96, 2.83, 0.16, 0.048, 0.078),
        (1.14, 2.84, 0.12, 0.042, 0.068),
        (1.24, 2.85, 0.07, 0.032, 0.048),
    ]
    jaw_rings = []
    for z, yc, rx, ryt, ryb in jaw_profile:
        ring = []
        for i in range(16):
            a = (i / 16) * TAU
            ca, sa = math.cos(a), math.sin(a)
            ry = ryt if sa >= 0 else ryb
            ring.append([ca * rx, yc + sa * ry, z])
        jaw_rings.append(ring)
    s.loft_rings(
        jaw_j,
        scale_m,
        jaw_rings,
        lambda _i, v: lerp_hex("#35304d", "#554e72", max(0.0, min(1.0, (v[2] - 0.58) / 0.66))),
        smooth=True,
    )
    # Pale ash-bone armored chin prow & downward chin spur
    s.tube(
        jaw_j,
        bone_m,
        [[0.0, 2.79, 1.24], [0.0, 2.74, 1.04], [0.0, 2.74, 0.76]],
        [0.062, 0.082, 0.055],
        ("#cfc9dc", "#9993a8"),
        segs=10,
        rx_scale=1.3,
        rz_scale=0.65,
    )
    s.tube(
        jaw_j,
        bone_m,
        [[0.0, 2.76, 1.18], [0.0, 2.66, 1.22], [0.0, 2.57, 1.14]],
        [0.048, 0.032, 0.006],
        ("#c8c2d6", "#ece7f5"),
        segs=8,
    )
    # Glowing violet inner maw & curled tongue (visible when roaring!)
    s.ellipsoid(
        jaw_j, core_m, (0.0, 2.88, 0.84), (0.12, 0.04, 0.24), "#a84dff", u_segs=14, v_segs=8
    )
    s.tube(
        jaw_j,
        sinew_m,
        [[0.0, 2.88, 0.72], [0.0, 2.91, 0.96], [0.0, 2.89, 1.14]],
        [0.058, 0.045, 0.016],
        ("#5e246e", "#943ca8"),
        segs=10,
        rx_scale=1.35,
        rz_scale=0.55,
    )
    # Lower fangs
    for sx in (-1, 1):
        for fz, fx, flen, frad in [
            (1.16, 0.08, 0.115, 0.022),
            (1.04, 0.13, 0.086, 0.018),
            (0.92, 0.16, 0.076, 0.017),
            (0.81, 0.19, 0.066, 0.015),
        ]:
            s.tube(
                jaw_j,
                bone_m,
                [
                    [sx * fx, 2.87, fz],
                    [sx * (fx * 1.02), 2.87 + flen * 0.55, fz + 0.012],
                    [sx * (fx * 0.96), 2.87 + flen, fz - 0.012],
                ],
                [frad, frad * 0.5, 0.004],
                ("#dfd8ea", "#b4adc4"),
                segs=8,
                steps_per_seg=2,
            )


def sculpt_torso_and_neck(s, pelvis_j, waist_j, chest_j, core_j, neck1_j, neck2_j, mats):
    """Sculpt barrel warlord torso, imbricated dragon scales, bone ribcage, rift heart & neck."""
    scale_m = mats["scale"]
    bone_m = mats["bone"]
    sinew_m = mats["sinew"]
    cryst_m = mats["crystal"]
    core_m = mats["core"]
    iron_m = mats["iron"]
    bronze_m = mats["bronze"]

    # --- Pelvis & Hip Girdle ---
    s.ellipsoid(
        pelvis_j, sinew_m, (0.0, 1.24, -0.04), (0.46, 0.28, 0.38), "#2c213a", u_segs=22, v_segs=14
    )
    # Armored darkscale hip belt & tasset plates hanging over front/sides
    for i in range(9):
        a = -PI * 0.72 + (i / 8) * PI * 1.44
        sa, ca = math.sin(a), math.cos(a)
        s.scale_plate(
            pelvis_j,
            scale_m,
            (sa * 0.45, 1.24, ca * 0.36 - 0.03),
            (sa, -0.18, ca),
            (sa * 0.22, -0.96, ca * 0.22),
            0.22,
            0.34,
            0.055,
            "#3c3858",
            tip_color="#706b94",
        )
    # Front central armored codpiece plate with bone ridge
    s.scale_plate(
        pelvis_j,
        bone_m,
        (0.0, 1.15, 0.34),
        (0.0, -0.1, 1.0),
        (0.0, -1.0, 0.12),
        0.24,
        0.38,
        0.065,
        "#9d97ae",
        tip_color="#d2cce0",
    )

    # --- Lower Torso / Muscular Waist & Segmented Belly Scutes ---
    waist_rings = []
    for y, rx, rz, zoff in [
        (1.36, 0.40, 0.32, -0.04),
        (1.56, 0.37, 0.31, -0.01),
        (1.78, 0.43, 0.36, 0.03),
        (1.98, 0.54, 0.44, 0.06),
    ]:
        ring = []
        for i in range(22):
            a = (i / 22) * TAU
            ca, sa = math.cos(a), math.sin(a)
            ring.append([ca * rx, y, zoff + sa * rz])
        waist_rings.append(ring)
    s.loft_rings(
        waist_j,
        sinew_m,
        waist_rings,
        lambda _i, v: lerp_hex("#271d35", "#3c2e50", (v[1] - 1.36) / 0.65),
    )
    # Overlapping abdominal ash-slate scute bands
    for row_i, (y, w, zf) in enumerate(
        [(1.46, 0.30, 0.28), (1.64, 0.33, 0.31), (1.82, 0.38, 0.35)]
    ):
        s.tube(
            waist_j,
            bone_m,
            [[-w, y + 0.02, zf - 0.09], [0.0, y, zf + 0.02], [w, y + 0.02, zf - 0.09]],
            [0.055, 0.072, 0.055],
            ("#8f89a2", "#b8b2c9"),
            segs=10,
        )
    # Waist back armor scales
    for y in (1.50, 1.72):
        for sx in (-1, 0, 1):
            s.scale_plate(
                waist_j,
                scale_m,
                (sx * 0.22, y, -0.34 + abs(sx) * 0.07),
                (sx * 0.4, 0.15, -0.9),
                (0.0, -0.95, -0.25),
                0.24,
                0.28,
                0.055,
                "#3b3856",
                tip_color="#67628a",
            )

    # --- Upper Torso: Massive Hunched Predatory Barrel Chest ---
    chest_rings = []
    for y, rx, rz, zoff in [
        (1.90, 0.56, 0.44, 0.06),
        (2.14, 0.72, 0.54, 0.08),
        (2.40, 0.80, 0.56, 0.05),
        (2.64, 0.68, 0.48, -0.02),
        (2.82, 0.44, 0.34, 0.02),
    ]:
        ring = []
        for i in range(28):
            a = (i / 28) * TAU
            ca, sa = math.cos(a), math.sin(a)
            # Recess front sternum cavity slightly to seat the glowing Rift Heart Core
            cavity = -0.14 * max(0.0, sa) ** 3 * (1.0 if 2.02 <= y <= 2.52 else 0.2)
            hump = 0.12 * max(0.0, -sa) ** 2 * (1.0 if y >= 2.35 else 0.3)
            ring.append([ca * rx, y, zoff + sa * (rz + cavity + hump)])
        chest_rings.append(ring)
    s.loft_rings(
        chest_j,
        sinew_m,
        chest_rings,
        lambda _i, v: lerp_hex("#271d36", "#3d3154", max(0.0, min(1.0, (v[1] - 1.9) / 0.9))),
    )

    # Layered Darkscale Pectoral & Trapezius Carapace Plates (rich sculpted armor overlap!)
    for sx in (-1, 1):
        # Upper pec armor slabs framing the glowing chest core
        for row, (px, py, pz, w, l) in enumerate(
            [
                (0.46, 2.48, 0.44, 0.34, 0.36),
                (0.58, 2.26, 0.42, 0.32, 0.36),
                (0.42, 2.04, 0.45, 0.28, 0.30),
                (0.36, 2.66, 0.32, 0.30, 0.34),
            ]
        ):
            s.scale_plate(
                chest_j,
                scale_m,
                (sx * px, py, pz),
                (sx * 0.42, 0.22, 0.88),
                (sx * 0.25, -0.86, 0.38),
                w,
                l,
                0.072,
                "#3e3a5c",
                tip_color="#7b75a2",
            )
        # Massive hunched trapezius & dorsal shoulder carapace (overlapping rows!)
        for row in range(4):
            y = 2.74 - row * 0.20
            z = -0.12 - row * 0.12
            for col in range(3):
                x = sx * (0.16 + col * 0.23)
                s.scale_plate(
                    chest_j,
                    scale_m,
                    (x, y, z + col * 0.06),
                    (sx * (0.28 + col * 0.22), 0.45 - row * 0.08, -0.82),
                    (sx * 0.18, -0.88, -0.35),
                    0.28,
                    0.34,
                    0.068,
                    "#433f64" if (row + col) % 2 == 0 else "#383452",
                    tip_color="#7973a0",
                )

        # EXPOSED WEATHERED ASH-BONE STERNAL RIBCAGE framing the glowing Rift Heart!
        for ri in range(5):
            ry = 2.02 + ri * 0.125
            reach_x = 0.62 - abs(ri - 2) * 0.045
            reach_z = 0.56 - abs(ri - 2) * 0.025
            s.tube(
                chest_j,
                bone_m,
                [
                    [sx * 0.66, ry + 0.06, 0.12],
                    [sx * reach_x, ry + 0.03, 0.40],
                    [sx * 0.30, ry - 0.01, reach_z],
                    [sx * 0.17, ry - 0.03, reach_z + 0.02],
                ],
                [0.056, 0.050, 0.040, 0.016],
                ("#a6a0b6", "#dbd6e8"),
                segs=9,
                steps_per_seg=2,
            )

    # Dorsal Spine Ridge: Pale Bone Vertebrae + Erupting Faceted Amethyst Crystal Spires!
    for di, (dy, dz, clen, crad) in enumerate(
        [
            (2.78, -0.18, 0.44, 0.088),
            (2.62, -0.38, 0.54, 0.098),
            (2.42, -0.50, 0.48, 0.088),
            (2.20, -0.52, 0.40, 0.075),
            (1.98, -0.48, 0.32, 0.065),
        ]
    ):
        s.crystal_spire(
            chest_j,
            cryst_m,
            (0.0, dy, dz),
            (0.0, 0.62 - di * 0.08, -0.82),
            clen,
            crad,
            "#6f28dc",
            "#eca8ff",
        )
        # Flanking bone ridge spurs hugging the crystal root
        for sx in (-1, 1):
            s.tube(
                chest_j,
                bone_m,
                [[sx * 0.12, dy, dz + 0.06], [sx * 0.18, dy + 0.08, dz - 0.16]],
                [0.045, 0.010],
                ("#9f99b0", "#d4cee2"),
                segs=7,
            )

    # Broken Quarry Iron Collar bolted around the clavicle/nape (environmental storytelling!)
    s.torus(
        chest_j,
        iron_m,
        (0.0, 2.66, 0.16),
        0.43,
        0.052,
        "#585250",
        u_segs=26,
        v_segs=10,
        rot=(0.35, 0.0, 0.0),
        arc=TAU * 0.84,
    )
    for bi in range(6):
        ang = 0.3 + bi * 0.9
        bx = math.cos(ang) * 0.46
        bz = 0.16 + math.sin(ang) * 0.43
        s.ellipsoid(
            chest_j,
            bronze_m,
            (bx, 2.68 - math.sin(ang) * 0.14, bz),
            (0.036, 0.036, 0.036),
            "#c79a5b",
            u_segs=10,
            v_segs=8,
        )

    # --- Glowing Black-Dragon Rift Heart Core (Rift_Heart_Core) ---
    # Deep abyssal recess behind core
    s.ellipsoid(
        chest_j, sinew_m, (0.0, 2.26, 0.42), (0.26, 0.30, 0.14), "#150920", u_segs=16, v_segs=12
    )
    # Pulsing faceted central Rift Crystal Core
    s.crystal_spire(
        core_j,
        core_m,
        (0.0, 2.04, 0.46),
        (0.0, 1.0, 0.06),
        0.26,
        0.135,
        "#a445ff",
        "#ffdbff",
        sides=6,
    )
    s.crystal_spire(
        core_j,
        core_m,
        (0.0, 2.48, 0.47),
        (0.0, -1.0, 0.06),
        0.26,
        0.135,
        "#a445ff",
        "#ffdbff",
        sides=6,
    )
    # Orbiting mini energy bands framing the heart
    s.torus(
        core_j,
        cryst_m,
        (0.0, 2.26, 0.48),
        0.20,
        0.024,
        "#e29cff",
        u_segs=24,
        v_segs=8,
        rot=(PI * 0.45, 0.35, 0.2),
    )
    s.torus(
        core_j,
        core_m,
        (0.0, 2.26, 0.48),
        0.16,
        0.016,
        "#ffc2ff",
        u_segs=22,
        v_segs=8,
        rot=(PI * 0.55, -0.45, -0.25),
    )

    # --- Serpentine Armored Neck (Neck_Base -> Neck_Upper) ---
    s.tube(
        neck1_j,
        sinew_m,
        [[0.0, 2.58, 0.16], [0.0, 2.74, 0.30], [0.0, 2.90, 0.44]],
        [0.31, 0.27, 0.24],
        ("#2d223d", "#3c2e50"),
        segs=18,
    )
    # Overlapping dorsal darkscale cervical armor plates & throat bone scutes
    for ni, (ny, nz) in enumerate([(2.66, 0.12), (2.78, 0.22), (2.88, 0.33)]):
        s.scale_plate(
            neck1_j,
            scale_m,
            (0.0, ny + 0.14, nz - 0.12),
            (0.0, 0.65, -0.76),
            (0.0, -0.55, -0.82),
            0.34 - ni * 0.03,
            0.28,
            0.062,
            "#423e62",
            tip_color="#7c76a4",
        )
        # Throat ash-bone scute
        s.tube(
            neck1_j,
            bone_m,
            [
                [-0.16, ny - 0.02, nz + 0.22],
                [0.0, ny - 0.05, nz + 0.28],
                [0.16, ny - 0.02, nz + 0.22],
            ],
            [0.036, 0.048, 0.036],
            ("#a7a0b8", "#d2cce0"),
            segs=8,
        )
    # Upper neck predatory spiked bone frill framing skull
    s.tube(
        neck2_j,
        sinew_m,
        [[0.0, 2.82, 0.38], [0.0, 2.95, 0.50], [0.0, 3.04, 0.58]],
        [0.24, 0.22, 0.20],
        "#322645",
        segs=16,
    )
    for sx in (-1, 1):
        for fi, (fy, fz, fx_out) in enumerate([(2.92, 0.36, 0.34), (3.02, 0.32, 0.38)]):
            s.tube(
                neck2_j,
                bone_m,
                [[sx * 0.16, fy, fz + 0.08], [sx * fx_out, fy + 0.08, fz - 0.14]],
                [0.055, 0.012],
                ("#8f89a2", "#d8d2e6"),
                segs=8,
            )


def sculpt_mantle_fins(s, fin_l, fin_r, mats):
    """Sculpt nascent jagged draconic rift-mantle crest spurs behind the shoulders."""
    bone_m = mats["bone"]
    scale_m = mats["scale"]
    cryst_m = mats["crystal"]
    mem_m = mats["membrane"]

    for sx, joint in ((1, fin_l), (-1, fin_r)):
        root = [sx * 0.52, 2.48, -0.32]
        # Top swept wing-spur strut (stays within x <= 1.32 so rest footprint stays tight!)
        top_strut = [
            root,
            [sx * 0.86, 2.82, -0.54],
            [sx * 1.16, 3.12, -0.74],
            [sx * 1.30, 3.24, -0.84],
        ]
        mid_strut = [
            [sx * 0.50, 2.34, -0.36],
            [sx * 0.84, 2.44, -0.62],
            [sx * 1.14, 2.52, -0.86],
        ]
        bot_strut = [
            [sx * 0.46, 2.16, -0.38],
            [sx * 0.72, 2.04, -0.62],
            [sx * 0.94, 1.92, -0.78],
        ]
        s.tube(
            joint, bone_m, top_strut, [0.085, 0.068, 0.045, 0.012], ("#5a5475", "#d4cee2"), segs=10
        )
        s.tube(joint, scale_m, mid_strut, [0.062, 0.045, 0.014], ("#433e62", "#8e88b0"), segs=9)
        s.tube(joint, scale_m, bot_strut, [0.054, 0.036, 0.012], ("#3d385a", "#78729a"), segs=8)

        # Tattered glowing-edge rift membrane spanning the spurs
        s.membrane(
            joint,
            mem_m,
            top_strut,
            mid_strut,
            "#2a1b42",
            "#7a36c4",
            divs_u=12,
            divs_v=6,
            camber=0.06,
        )
        s.membrane(
            joint,
            mem_m,
            mid_strut,
            bot_strut,
            "#241638",
            "#6b2cb0",
            divs_u=10,
            divs_v=5,
            camber=0.05,
        )

        # Sharp amethyst crystal needles erupting from the upper spur ridge
        for idx, pt in enumerate(top_strut[1:3]):
            s.crystal_spire(
                joint,
                cryst_m,
                pt,
                (sx * 0.55, 0.78, -0.35),
                0.32 - idx * 0.06,
                0.045,
                "#782ee0",
                "#efb4ff",
            )


def sculpt_arms(s, sh_l, ua_l, fa_l, hd_l, sh_r, ua_r, fa_r, ch_r, hd_r, mats):
    """Sculpt asymmetric warlord arms: +X Crystal Rift-Cleaver Arm & -X Shackled Brute Claw Arm."""
    scale_m = mats["scale"]
    bone_m = mats["bone"]
    sinew_m = mats["sinew"]
    cryst_m = mats["crystal"]
    core_m = mats["core"]
    iron_m = mats["iron"]
    bronze_m = mats["bronze"]

    # =========================================================================
    # CHARACTER LEFT (+X, Hero 3/4 side): Mutated Crystal-Cleaver Warlord Arm
    # =========================================================================
    # Massive multi-tier Darkscale Shoulder Pauldron
    s.ellipsoid(
        sh_l, scale_m, (0.86, 2.50, 0.08), (0.34, 0.28, 0.34), "#413d60", rot=(0.0, 0.0, -0.32)
    )
    for i, (ang, yoff) in enumerate(
        [(-0.5, 0.08), (0.0, 0.12), (0.5, 0.06), (-0.35, -0.10), (0.35, -0.12)]
    ):
        ca, sa = math.cos(ang), math.sin(ang)
        s.scale_plate(
            sh_l,
            scale_m,
            (0.98 + ca * 0.14, 2.54 + yoff, 0.08 + sa * 0.28),
            (0.85, 0.38, sa * 0.45),
            (0.32, -0.92, sa * 0.2),
            0.28,
            0.36,
            0.065,
            "#454166",
            tip_color="#8983b2",
        )
    # Ash-bone spiked pauldron rim arch
    s.tube(
        sh_l,
        bone_m,
        [[0.70, 2.74, 0.24], [0.96, 2.72, 0.12], [1.14, 2.52, -0.06], [1.02, 2.34, -0.22]],
        [0.055, 0.072, 0.062, 0.025],
        ("#c8c2d6", "#9a94ac"),
        segs=10,
    )
    # DRAMATIC ERUPTING AMETHYST RIFT-CRYSTAL CLUSTER bursting from the left pauldron!
    for base_off, cdir, clen, crad in [
        ((0.92, 2.66, 0.04), (0.52, 0.84, -0.12), 0.72, 0.115),
        ((0.82, 2.72, -0.06), (0.28, 0.90, -0.32), 0.56, 0.088),
        ((1.05, 2.56, 0.12), (0.78, 0.58, 0.22), 0.50, 0.082),
        ((0.96, 2.58, -0.14), (0.58, 0.62, -0.52), 0.44, 0.074),
        ((0.84, 2.62, 0.18), (0.44, 0.74, 0.48), 0.36, 0.062),
    ]:
        s.crystal_spire(sh_l, cryst_m, base_off, cdir, clen, crad, "#6e26dc", "#f3bdff")

    # Upper Arm (+X)
    s.tube(
        ua_l,
        sinew_m,
        [[0.88, 2.36, 0.10], [0.98, 2.04, 0.18], [1.02, 1.72, 0.28]],
        [0.24, 0.21, 0.19],
        ("#2d213e", "#3d2f52"),
        segs=14,
    )
    # Armored darkscale bicep guard & jutting ash-bone elbow spur
    s.scale_plate(
        ua_l,
        scale_m,
        (1.12, 2.06, 0.16),
        (0.95, 0.1, 0.18),
        (0.22, -0.96, 0.18),
        0.26,
        0.40,
        0.065,
        "#423e62",
        tip_color="#807aa8",
    )
    s.tube(
        ua_l,
        bone_m,
        [[1.04, 1.78, 0.22], [1.18, 1.72, 0.06], [1.28, 1.66, -0.12]],
        [0.065, 0.044, 0.010],
        ("#9f99b0", "#dfd9ec"),
        segs=8,
    )

    # Mutated Crystal-Cleaver Forearm (+X)
    s.tube(
        fa_l,
        scale_m,
        [[1.02, 1.72, 0.28], [1.05, 1.48, 0.42], [1.06, 1.24, 0.56]],
        [0.22, 0.24, 0.20],
        ("#3d385c", "#59537d"),
        segs=14,
        flute_amp=0.10,
        flute_freq=6,
    )
    # Glowing crystal fissures encasing the forearm bracer
    for base_pt, cdir, clen, crad in [
        ((1.18, 1.56, 0.34), (0.84, 0.35, -0.35), 0.36, 0.064),
        ((1.20, 1.38, 0.44), (0.76, -0.25, -0.45), 0.30, 0.056),
    ]:
        s.crystal_spire(fa_l, cryst_m, base_pt, cdir, clen, crad, "#752de0", "#efb4ff")

    # MASSIVE FUSED OBSIDIAN RIFT-CLEAVER GREATBLADE extending from outer forearm/wrist!
    blade_spine = [
        [1.14, 1.58, 0.36],
        [1.16, 1.30, 0.62],
        [1.14, 0.98, 0.96],
        [1.06, 0.66, 1.24],
        [0.92, 0.42, 1.40],
    ]
    s.blade_prism(
        fa_l,
        scale_m,
        blade_spine,
        widths=[0.18, 0.28, 0.34, 0.26, 0.04],
        thicknesses=[0.065, 0.062, 0.054, 0.040, 0.008],
        color_spine="#34304e",
        color_edge="#c07bff",
    )
    # Glowing crystalline plasma edge vein running the full length of the cleaver!
    s.tube(
        fa_l,
        core_m,
        [
            [1.14, 1.46, 0.52],
            [1.15, 1.18, 0.80],
            [1.10, 0.86, 1.12],
            [1.00, 0.56, 1.34],
            [0.92, 0.42, 1.41],
        ],
        [0.022, 0.028, 0.030, 0.022, 0.006],
        ("#b864ff", "#ffe0ff"),
        segs=8,
    )
    # Ash-bone serrated dorsal notches along blade back
    for bi, pt in enumerate(blade_spine[1:4]):
        s.tube(
            fa_l,
            bone_m,
            [
                [pt[0] + 0.02, pt[1] + 0.06, pt[2] - 0.14],
                [pt[0] + 0.06, pt[1] + 0.16, pt[2] - 0.24],
            ],
            [0.038, 0.008],
            ("#b4aec4", "#e3ddf0"),
            segs=7,
        )

    # Clawed Hand (+X) gripping around blade hilt
    s.ellipsoid(
        hd_l, scale_m, (1.04, 1.20, 0.60), (0.16, 0.14, 0.18), "#464166", u_segs=14, v_segs=10
    )
    for fi, (fx, fz, spread) in enumerate(
        [(-0.09, 0.10, -0.2), (0.0, 0.14, 0.0), (0.09, 0.10, 0.22)]
    ):
        s.tube(
            hd_l,
            bone_m,
            [
                [1.04 + fx, 1.16, 0.66 + fz * 0.5],
                [1.04 + fx * 1.4, 1.00, 0.78 + fz],
                [1.00 + fx * 1.1, 0.84, 0.74 + fz * 0.8],
            ],
            [0.038, 0.028, 0.006],
            ("#7e7898", "#e2dcef"),
            segs=8,
            steps_per_seg=2,
        )
    # Thumb talon
    s.tube(
        hd_l,
        bone_m,
        [[0.92, 1.22, 0.64], [0.82, 1.10, 0.74], [0.80, 0.98, 0.70]],
        [0.038, 0.026, 0.006],
        ("#7e7898", "#e2dcef"),
        segs=8,
    )

    # =========================================================================
    # CHARACTER RIGHT (-X): Shackled Quarry-Brute Claw Arm + Broken Iron Chain
    # =========================================================================
    s.ellipsoid(
        sh_r, scale_m, (-0.86, 2.48, 0.06), (0.34, 0.27, 0.34), "#413d60", rot=(0.0, 0.0, 0.32)
    )
    for ang, yoff in [(-0.5, 0.08), (0.0, 0.12), (0.5, 0.06), (-0.35, -0.10), (0.35, -0.12)]:
        ca, sa = math.cos(ang), math.sin(ang)
        s.scale_plate(
            sh_r,
            scale_m,
            (-0.98 - ca * 0.14, 2.52 + yoff, 0.06 + sa * 0.28),
            (-0.85, 0.38, sa * 0.45),
            (-0.32, -0.92, sa * 0.2),
            0.28,
            0.36,
            0.065,
            "#444064",
            tip_color="#8983b2",
        )
    # Pale weathered bone ridge crest & 2 massive bone shoulder spikes
    s.tube(
        sh_r,
        bone_m,
        [[-0.70, 2.72, 0.22], [-0.96, 2.70, 0.10], [-1.14, 2.50, -0.08], [-1.02, 2.32, -0.22]],
        [0.055, 0.072, 0.062, 0.025],
        ("#c8c2d6", "#9a94ac"),
        segs=10,
    )
    for sp_base, sp_tip in [
        ([-0.94, 2.66, 0.04], [-1.24, 3.04, -0.10]),
        ([-1.06, 2.52, -0.06], [-1.36, 2.74, -0.24]),
    ]:
        s.tube(sh_r, bone_m, [sp_base, sp_tip], [0.068, 0.010], ("#8c869e", "#dfd9ec"), segs=9)

    # Upper Arm (-X)
    s.tube(
        ua_r,
        sinew_m,
        [[-0.88, 2.34, 0.08], [-0.96, 2.02, 0.14], [-1.00, 1.70, 0.24]],
        [0.24, 0.21, 0.19],
        ("#2d213e", "#3d2f52"),
        segs=14,
    )
    s.scale_plate(
        ua_r,
        scale_m,
        (-1.12, 2.04, 0.14),
        (-0.95, 0.1, 0.18),
        (-0.22, -0.96, 0.18),
        0.26,
        0.40,
        0.065,
        "#423e62",
        tip_color="#807aa8",
    )
    s.tube(
        ua_r,
        bone_m,
        [[-1.02, 1.76, 0.18], [-1.16, 1.70, 0.02], [-1.26, 1.64, -0.14]],
        [0.065, 0.044, 0.010],
        ("#9f99b0", "#dfd9ec"),
        segs=8,
    )

    # Forearm (-X) + Heavy Forged Quarry-Iron Shackle Cuff!
    s.tube(
        fa_r,
        scale_m,
        [[-1.00, 1.70, 0.24], [-1.02, 1.46, 0.38], [-1.02, 1.24, 0.52]],
        [0.21, 0.23, 0.19],
        ("#3d385c", "#57517a"),
        segs=14,
    )
    for sy_off, sz_off in [(0.10, -0.05), (-0.06, 0.05)]:
        s.scale_plate(
            fa_r,
            scale_m,
            (-1.16, 1.52 + sy_off, 0.34 + sz_off),
            (-0.92, 0.18, 0.22),
            (-0.22, -0.94, 0.26),
            0.22,
            0.30,
            0.055,
            "#464268",
            tip_color="#8882b0",
        )
    # Forged Quarry-Iron Wrist Shackle + Bronze Bolts
    s.torus(
        fa_r,
        iron_m,
        (-1.02, 1.38, 0.42),
        0.235,
        0.058,
        "#635c58",
        u_segs=24,
        v_segs=10,
        rot=(0.48, 0.0, 0.08),
    )
    for bi in range(4):
        ang = bi * PI * 0.5 + 0.4
        s.ellipsoid(
            fa_r,
            bronze_m,
            (
                -1.02 + math.cos(ang) * 0.27,
                1.38 + math.sin(ang) * 0.12,
                0.42 + math.sin(ang) * 0.24,
            ),
            (0.036, 0.036, 0.036),
            "#cf9f5d",
            u_segs=10,
            v_segs=8,
        )

    # Dangling Broken Quarry Iron Chain (4 interlocking links on Chain_Swing_R!)
    for li in range(4):
        ly = 1.30 - li * 0.155
        rot_y = (PI * 0.5) if (li % 2 == 1) else 0.15
        s.torus(
            ch_r,
            iron_m,
            (-1.18 - li * 0.012, ly, 0.36 - li * 0.018),
            0.092,
            0.028,
            "#6b635e" if li % 2 == 0 else "#544e4b",
            u_segs=18,
            v_segs=8,
            rot=(PI * 0.5, rot_y, 0.0),
            arc=TAU * (0.78 if li == 3 else 1.0),  # bottom link snapped open!
        )

    # Massive 4-Clawed Predator Hand (-X)
    s.ellipsoid(
        hd_r, scale_m, (-1.02, 1.20, 0.56), (0.18, 0.15, 0.20), "#474268", u_segs=16, v_segs=10
    )
    for fx, fz, flen in [
        (-0.14, 0.08, 0.36),
        (-0.05, 0.13, 0.42),
        (0.05, 0.13, 0.41),
        (0.14, 0.07, 0.34),
    ]:
        s.tube(
            hd_r,
            bone_m,
            [
                [-1.02 + fx, 1.16, 0.62 + fz * 0.5],
                [-1.02 + fx * 1.45, 0.98, 0.74 + fz],
                [-0.98 + fx * 1.2, 0.78, 0.68 + fz * 0.7],
            ],
            [0.042, 0.030, 0.006],
            ("#7e7898", "#e8e2f4"),
            segs=8,
            steps_per_seg=2,
        )
    # Opposable Thumb Talon
    s.tube(
        hd_r,
        bone_m,
        [[-0.86, 1.20, 0.60], [-0.74, 1.06, 0.72], [-0.72, 0.92, 0.66]],
        [0.042, 0.028, 0.006],
        ("#7e7898", "#e8e2f4"),
        segs=8,
    )


def sculpt_legs(s, hip_l, shin_l, foot_l, hip_r, shin_r, foot_r, mats):
    """Sculpt powerful digitigrade warlord hind legs, armored greaves & stone-gripping talons."""
    scale_m = mats["scale"]
    bone_m = mats["bone"]
    sinew_m = mats["sinew"]
    cryst_m = mats["crystal"]

    configs = [
        (1, hip_l, shin_l, foot_l, 0.02, 0.22, 0.18),
        (-1, hip_r, shin_r, foot_r, -0.04, 0.14, 0.08),
    ]
    for sx, hip_j, shin_j, foot_j, hip_z, knee_z, foot_z in configs:
        # Muscular Digitigrade Thigh
        s.tube(
            hip_j,
            sinew_m,
            [
                [sx * 0.42, 1.20, hip_z],
                [sx * 0.52, 0.94, hip_z + 0.12],
                [sx * 0.58, 0.66, knee_z],
            ],
            [0.27, 0.24, 0.19],
            ("#2d223e", "#3d2f52"),
            segs=16,
        )
        # Layered Darkscale Cuisse Armor Plates on outer thigh
        for row, (ty, tz) in enumerate([(1.06, hip_z + 0.08), (0.84, hip_z + 0.16)]):
            s.scale_plate(
                hip_j,
                scale_m,
                (sx * (0.64 + row * 0.04), ty, tz),
                (sx * 0.85, 0.22, 0.48),
                (sx * 0.18, -0.94, 0.26),
                0.30,
                0.36,
                0.068,
                "#423e62",
                tip_color="#807aa8",
            )
        # Sharp Ash-Bone Knee Guard Spur
        s.scale_plate(
            hip_j,
            bone_m,
            (sx * 0.58, 0.72, knee_z + 0.18),
            (sx * 0.25, 0.35, 0.92),
            (sx * 0.15, 0.85, 0.48),
            0.22,
            0.28,
            0.065,
            "#a49eb6",
            tip_color="#e0daec",
        )

        # Digitigrade Shin / Hock (sweeps back to hock then forward to ankle)
        s.tube(
            shin_j,
            scale_m,
            [
                [sx * 0.58, 0.66, knee_z],
                [sx * 0.60, 0.44, knee_z - 0.18],
                [sx * 0.56, 0.16, foot_z],
            ],
            [0.18, 0.15, 0.14],
            ("#3d385a", "#524c75"),
            segs=14,
            flute_amp=0.08,
            flute_freq=6,
        )
        # Armored Shin Greave + Ankle Crystal Spur
        s.scale_plate(
            shin_j,
            scale_m,
            (sx * 0.62, 0.36, foot_z + 0.08),
            (sx * 0.45, 0.15, 0.88),
            (0.0, -0.95, 0.25),
            0.22,
            0.34,
            0.055,
            "#464268",
            tip_color="#8983b2",
        )
        s.crystal_spire(
            shin_j,
            cryst_m,
            (sx * 0.66, 0.44, knee_z - 0.22),
            (sx * 0.38, 0.22, -0.90),
            0.26,
            0.048,
            "#722ad8",
            "#e7a4ff",
        )

        # Broad Armored Drake Foot & 3 Forward + 1 Rear Stone-Gripping Talons (grounded cleanly at y=0!)
        s.ellipsoid(
            foot_j,
            scale_m,
            (sx * 0.56, 0.10, foot_z + 0.08),
            (0.20, 0.095, 0.24),
            "#444064",
            u_segs=14,
            v_segs=10,
        )
        for tx, tz_ext in [(-0.13, 0.34), (0.0, 0.40), (0.13, 0.34)]:
            s.tube(
                foot_j,
                scale_m,
                [
                    [sx * 0.56 + tx * 0.7, 0.10, foot_z + 0.16],
                    [sx * 0.56 + tx * 1.15, 0.075, foot_z + 0.16 + tz_ext * 0.55],
                ],
                [0.058, 0.046],
                "#4b466e",
                segs=9,
            )
            # Curved pale ash-bone claw resting firmly on y = 0.015
            s.tube(
                foot_j,
                bone_m,
                [
                    [sx * 0.56 + tx * 1.15, 0.075, foot_z + 0.16 + tz_ext * 0.55],
                    [sx * 0.56 + tx * 1.32, 0.045, foot_z + 0.16 + tz_ext * 0.85],
                    [sx * 0.56 + tx * 1.38, 0.010, foot_z + 0.16 + tz_ext * 1.05],
                ],
                [0.044, 0.026, 0.005],
                ("#9892aa", "#e8e2f4"),
                segs=8,
            )
        # Rear stabilizing dewclaw
        s.tube(
            foot_j,
            bone_m,
            [
                [sx * 0.56, 0.11, foot_z - 0.10],
                [sx * 0.56, 0.055, foot_z - 0.24],
                [sx * 0.56, 0.012, foot_z - 0.34],
            ],
            [0.044, 0.028, 0.006],
            ("#8f89a2", "#dcd6ea"),
            segs=8,
        )


def sculpt_tail(s, t1_j, t2_j, t3_j, tmace_j, mats):
    """Sculpt 4-joint sinuous armored dragon tail tipped with a heavy crystalline spiked war-mace."""
    scale_m = mats["scale"]
    bone_m = mats["bone"]
    cryst_m = mats["crystal"]

    # Segment 1: Thick armored tail root
    p1 = [[0.0, 1.18, -0.34], [-0.06, 1.04, -0.66], [-0.18, 0.90, -0.96]]
    s.tube(
        t1_j,
        scale_m,
        p1,
        [0.27, 0.23, 0.19],
        ("#3d385a", "#4a446c"),
        segs=16,
        flute_amp=0.08,
        flute_freq=6,
    )
    for pt in p1[1:]:
        s.scale_plate(
            t1_j,
            scale_m,
            (pt[0], pt[1] + 0.17, pt[2]),
            (0.0, 0.92, -0.35),
            (-0.15, -0.25, -0.95),
            0.28,
            0.30,
            0.055,
            "#464268",
            tip_color="#8983b2",
        )
        s.crystal_spire(
            t1_j,
            cryst_m,
            (pt[0], pt[1] + 0.20, pt[2]),
            (-0.1, 0.85, -0.5),
            0.24,
            0.045,
            "#722ad8",
            "#ebaaff",
        )

    # Segment 2: Sweeping curved mid-tail
    p2 = [[-0.18, 0.90, -0.96], [-0.38, 0.78, -1.16], [-0.62, 0.72, -1.24]]
    s.tube(
        t2_j,
        scale_m,
        p2,
        [0.19, 0.16, 0.135],
        ("#433e64", "#514b76"),
        segs=14,
        flute_amp=0.09,
        flute_freq=6,
    )
    for pt in p2[1:]:
        s.scale_plate(
            t2_j,
            bone_m,
            (pt[0], pt[1] + 0.14, pt[2]),
            (-0.25, 0.92, -0.25),
            (-0.7, -0.2, -0.6),
            0.22,
            0.26,
            0.048,
            "#9b95ad",
            tip_color="#dcd6ea",
        )

    # Segment 3: Agile whip curve curling around -X flank
    p3 = [[-0.62, 0.72, -1.24], [-0.86, 0.74, -1.18], [-1.02, 0.86, -0.98]]
    s.tube(t3_j, scale_m, p3, [0.135, 0.115, 0.105], ("#49446e", "#5b5584"), segs=14)
    s.crystal_spire(
        t3_j, cryst_m, (-0.86, 0.84, -1.18), (-0.4, 0.86, -0.25), 0.22, 0.042, "#752de0", "#efb4ff"
    )

    # Segment 4: Heavy Spiked Obsidian-Crystal War-Mace Club!
    mace_center = (-1.12, 0.98, -0.78)
    s.tube(
        tmace_j,
        scale_m,
        [[-1.02, 0.86, -0.98], list(mace_center)],
        [0.105, 0.14],
        "#4a446c",
        segs=12,
    )
    s.ellipsoid(
        tmace_j,
        bone_m,
        mace_center,
        (0.18, 0.17, 0.24),
        "#8f89a4",
        u_segs=18,
        v_segs=12,
        rot=(0.45, -0.45, 0.0),
    )
    # 6 Radiating Amethyst Crystal Spikes + Spear-Tip Crystal Crown on the Tail Mace!
    for i in range(6):
        a = (i / 6) * TAU
        d = (math.cos(a) * 0.75 - 0.2, math.sin(a) * 0.75 + 0.2, 0.35)
        s.crystal_spire(tmace_j, cryst_m, mace_center, d, 0.34, 0.056, "#752de0", "#f3beff")
    s.crystal_spire(
        tmace_j,
        cryst_m,
        (-1.16, 1.04, -0.66),
        (-0.35, 0.55, 0.75),
        0.46,
        0.072,
        "#8636f5",
        "#ffe0ff",
    )


def sculpt_dark_dust_and_fx(s, dust_joints, roar_fx, slash_fx, slam_fx, halo_fx, mats):
    """Sculpt the 8 orbiting Dark-Dust shards (游离暗尘) and embedded 3D combat VFX meshes."""
    scale_m = mats["scale"]
    cryst_m = mats["crystal"]
    core_m = mats["core"]
    fx_m = mats["fx"]

    # 8 Orbiting Dark-Dust Rift Shards (visible in Idle & choreographed in all clips!)
    for idx, dj in enumerate(dust_joints):
        p = s.joints[dj]["pivot"]
        ang = idx * 0.85
        scale_k = 0.85 + 0.32 * ((idx % 3) / 2.0)
        # Main obsidian-amethyst faceted shard
        s.crystal_spire(
            dj,
            cryst_m,
            (p[0], p[1] - 0.11 * scale_k, p[2]),
            (math.cos(ang) * 0.22, 0.96, math.sin(ang) * 0.22),
            0.25 * scale_k,
            0.052 * scale_k,
            "#6020be",
            "#edb0ff",
            sides=5,
        )
        # Inverted counter-crystal tail
        s.crystal_spire(
            dj,
            scale_m,
            (p[0], p[1] - 0.08 * scale_k, p[2]),
            (-math.cos(ang) * 0.22, -0.96, -math.sin(ang) * 0.22),
            0.16 * scale_k,
            0.044 * scale_k,
            "#3c355c",
            "#9b5ef8",
            sides=5,
        )
        # Inner glowing mote
        s.ellipsoid(
            dj,
            core_m,
            tuple(p),
            (0.042 * scale_k, 0.042 * scale_k, 0.042 * scale_k),
            "#f4c4ff",
            u_segs=8,
            v_segs=6,
        )

    # Roar_Wave_FX: 3 concentric sonic dark-command shockwave rings blasting from open jaws
    rp = s.joints[roar_fx]["pivot"]
    for ri, (rad, thick, zoff, col) in enumerate(
        [
            (0.28, 0.032, 0.0, "#f2b8ff"),
            (0.50, 0.038, 0.28, "#c26bff"),
            (0.74, 0.034, 0.58, "#8e3bf2"),
        ]
    ):
        s.torus(
            roar_fx,
            fx_m,
            (rp[0], rp[1], rp[2] + zoff),
            rad,
            thick,
            col,
            u_segs=28,
            v_segs=8,
            rot=(PI * 0.5, 0.0, ri * 0.4),
            flute_amp=0.22,
            flute_freq=8,
        )

    # Slash_Arc_FX: Sweeping double-layered violet crescent cleave trail on right blade
    sp = s.joints[slash_fx]["pivot"]
    s.torus(
        slash_fx,
        fx_m,
        tuple(sp),
        1.05,
        0.075,
        "#e096ff",
        u_segs=32,
        v_segs=8,
        rot=(0.35, 0.0, -0.45),
        arc=PI * 0.95,
        flute_amp=0.28,
        flute_freq=6,
    )
    s.torus(
        slash_fx,
        core_m,
        tuple(sp),
        0.95,
        0.035,
        "#ffe2ff",
        u_segs=28,
        v_segs=6,
        rot=(0.35, 0.0, -0.45),
        arc=PI * 0.88,
    )

    # Ground_Slam_FX: Erupting jagged amethyst fissure crystals + seismic ring at feet
    gp = s.joints[slam_fx]["pivot"]
    s.torus(
        slam_fx,
        fx_m,
        (gp[0], gp[1] + 0.04, gp[2]),
        1.35,
        0.055,
        "#b75eff",
        u_segs=36,
        v_segs=8,
        flute_amp=0.25,
        flute_freq=10,
    )
    s.torus(
        slam_fx, core_m, (gp[0], gp[1] + 0.06, gp[2]), 0.88, 0.035, "#f0b8ff", u_segs=30, v_segs=8
    )
    for ki in range(10):
        a = (ki / 10) * TAU
        r = 0.72 + (ki % 2) * 0.42
        bx = gp[0] + math.cos(a) * r
        bz = gp[2] + math.sin(a) * r
        s.crystal_spire(
            slam_fx,
            cryst_m,
            (bx, gp[1], bz),
            (math.cos(a) * 0.42, 0.92, math.sin(a) * 0.42),
            0.68 + (ki % 3) * 0.22,
            0.095,
            "#6a22d4",
            "#f5c2ff",
        )

    # Command_Halo_FX: Fractured black-dragon nascent crown sigil halo behind horns
    hp = s.joints[halo_fx]["pivot"]
    for start, ext in ((0.18, 1.15), (1.62, 1.25), (3.18, 1.18), (4.68, 1.22)):
        pts = [
            [hp[0] + math.cos(a) * 1.08, hp[1] + math.sin(a) * 1.08, hp[2]]
            for a in np.linspace(start, start + ext, 14)
        ]
        s.tube(halo_fx, fx_m, pts, 0.036, ("#9f4bf8", "#f0b8ff"), segs=8, steps_per_seg=1)
    for ri in range(8):
        a = (ri / 8) * TAU + 0.25
        ca, sa = math.cos(a), math.sin(a)
        s.crystal_spire(
            halo_fx,
            core_m,
            (hp[0] + ca * 1.02, hp[1] + sa * 1.02, hp[2]),
            (ca, sa, 0.0),
            0.34 if ri % 2 == 0 else 0.22,
            0.042,
            "#8c38f2",
            "#ffe0ff",
            sides=4,
        )


# ---------------------------------------------------------------------------
# 8 Full Articulated Boss Animation Clips (Smooth 56-sample curves!)
# ---------------------------------------------------------------------------
def build_warlord_clips(s, dust_joints):
    clip_specs = [
        ("Idle", 4.0, 56),
        ("Warlord_Awaken", 2.6, 56),
        ("Normal_Attack", 1.75, 52),
        ("Warlord_Roar", 2.3, 56),
        ("Special_Attack", 2.15, 56),
        ("Warlord_Tail_Sweep", 1.85, 52),
        ("Special_Action", 2.25, 56),
        ("Break_Stagger", 1.55, 48),
    ]

    animated_joints = [
        "Warlord_Root",
        "Pelvis_Core",
        "Torso_Lower",
        "Torso_Upper",
        "Rift_Heart_Core",
        "Mantle_Fin_L",
        "Mantle_Fin_R",
        "Neck_Base",
        "Neck_Upper",
        "Head_Skull",
        "Jaw_Lower",
        "Shoulder_L",
        "UpperArm_L",
        "Forearm_L",
        "ClawHand_L",
        "Shoulder_R",
        "UpperArm_R",
        "Forearm_R",
        "Chain_Swing_R",
        "ClawHand_R",
        "Tail_Seg_1",
        "Tail_Seg_2",
        "Tail_Seg_3",
        "Tail_Mace",
        "Hip_L",
        "Shin_L",
        "Hip_R",
        "Shin_R",
        "Roar_Wave_FX",
        "Slash_Arc_FX",
        "Ground_Slam_FX",
        "Command_Halo_FX",
        *dust_joints,
    ]

    clips = {}
    for clip_name, duration, steps in clip_specs:
        times = [round((i / steps) * duration, 5) for i in range(steps + 1)]
        tracks = {j: {"translation": [], "rotation": [], "scale": []} for j in animated_joints}

        is_idle = clip_name == "Idle"
        is_awaken = clip_name == "Warlord_Awaken"
        is_normal = clip_name == "Normal_Attack"
        is_roar = clip_name == "Warlord_Roar"
        is_slam = clip_name == "Special_Attack"
        is_tail = clip_name == "Warlord_Tail_Sweep"
        is_siphon = clip_name == "Special_Action"
        is_break = clip_name == "Break_Stagger"

        for i in range(steps + 1):
            t = i / steps
            a = t * TAU
            s1 = math.sin(a)
            s2 = math.sin(a * 2.0)
            c1 = math.cos(a) - 1.0  # 0 at t=0 and t=1!

            # Shared dramatic phase envelopes (all 0 at t=0 and t=1 for seamless crossfade!)
            wind = bell_window(t, 0.0, 0.34)
            strike = (
                pulse_peak(t, 0.42, 0.085)
                * smoothstep(0.24, 0.34, t)
                * (1.0 - smoothstep(0.68, 0.94, t))
            )
            follow = bell_window(t, 0.38, 0.82)
            # Awaken: deep crouch -> explosive upright roar -> settle
            aw_crouch = plateau(t, 0.02, 0.14, 0.28, 0.42)
            aw_burst = bell_window(t, 0.30, 0.86)
            aw_peak = pulse_peak(t, 0.54, 0.14)
            # Roar: inhale crouch -> explosive roar & command wave
            roar_in = bell_window(t, 0.0, 0.28)
            roar_hold = plateau(t, 0.24, 0.35, 0.68, 0.88)
            roar_vib = math.sin(t * TAU * 10.0) * roar_hold
            # Slam: deep crouch -> vault up -> blistering smash -> impact quake
            sl_prep = bell_window(t, 0.0, 0.26)
            sl_jump = bell_window(t, 0.16, 0.44)
            sl_hit = plateau(t, 0.40, 0.46, 0.64, 0.88)
            sl_quake = math.sin(t * TAU * 14.0) * bell_window(t, 0.43, 0.66)
            # Tail sweep: wind CCW -> violent 360-feel whip CW
            tw_prep = bell_window(t, 0.0, 0.30)
            tw_whip = bell_window(t, 0.26, 0.68)
            tw_snap = pulse_peak(t, 0.44, 0.10)
            # Siphon: arched stance drawing dark miasma into glowing heart
            si_hold = plateau(t, 0.10, 0.26, 0.72, 0.94)
            si_pulse = math.sin(t * TAU * 5.0) * si_hold
            # Break: violent snap recoil -> kneeling stagger shudder -> rise
            br_snap = pulse_peak(t, 0.16, 0.09)
            br_kneel = plateau(t, 0.12, 0.24, 0.66, 0.96)
            br_shake = math.sin(t * TAU * 13.0) * br_kneel

            def put(j, dp=(0.0, 0.0, 0.0), dr=(0.0, 0.0, 0.0), sc=(1.0, 1.0, 1.0)):
                tracks[j]["translation"].append(dp)
                tracks[j]["rotation"].append(euler_xyz_to_quat(*dr))
                tracks[j]["scale"].append(sc)

            # 1. Warlord_Root (vertical leap / ground drop / forward lunge)
            ry_off = 0.0
            rz_off = 0.0
            if is_normal:
                rz_off = -0.16 * wind + 0.36 * strike + 0.12 * follow
                ry_off = -0.08 * wind + 0.05 * strike
            elif is_slam:
                ry_off = -0.22 * sl_prep + 0.72 * sl_jump - 0.18 * sl_hit
                rz_off = -0.14 * sl_prep + 0.32 * sl_hit
            elif is_awaken:
                ry_off = -0.44 * aw_crouch + 0.10 * aw_peak
            elif is_roar:
                ry_off = -0.12 * roar_in + 0.06 * roar_hold
                rz_off = -0.08 * roar_in + 0.10 * roar_hold
            elif is_break:
                ry_off = -0.34 * br_kneel
                rz_off = -0.28 * br_snap - 0.16 * br_kneel
            put("Warlord_Root", dp=(0.0, ry_off, rz_off))

            # 2. Pelvis_Core
            pelv_p = (0.0, 0.03 * s1 if is_idle else 0.0, 0.0)
            pelv_r = (0.0, 0.0, 0.0)
            if is_idle:
                pelv_r = (0.025 * s1, 0.04 * math.sin(a * 0.5), 0.02 * s2)
            elif is_awaken:
                pelv_r = (0.36 * aw_crouch - 0.14 * aw_peak, 0.0, 0.0)
            elif is_normal:
                pelv_r = (0.10 * follow, -0.46 * wind + 0.52 * follow, 0.0)
            elif is_roar:
                pelv_r = (0.14 * roar_in - 0.12 * roar_hold, 0.0, 0.0)
            elif is_slam:
                pelv_r = (0.24 * sl_prep - 0.18 * sl_jump + 0.28 * sl_hit, 0.0, 0.0)
            elif is_tail:
                pelv_r = (0.12 * tw_whip, 0.78 * tw_prep - 1.15 * tw_whip, -0.10 * tw_snap)
            elif is_siphon:
                pelv_r = (-0.12 * si_hold, 0.0, 0.0)
            elif is_break:
                pelv_r = (-0.22 * br_snap + 0.18 * br_kneel, 0.18 * br_kneel, -0.14 * br_kneel)
            put("Pelvis_Core", dp=pelv_p, dr=pelv_r)

            # 3. Torso_Lower & Torso_Upper
            tl_r = (0.03 * s1 if is_idle else 0.0, 0.0, 0.0)
            tu_r = (0.05 * s1 if is_idle else 0.0, 0.0, 0.0)
            if is_awaken:
                tl_r = (0.32 * aw_crouch - 0.14 * aw_peak, 0.0, 0.0)
                tu_r = (0.38 * aw_crouch - 0.26 * aw_peak, 0.0, 0.0)
            elif is_normal:
                tl_r = (-0.12 * wind + 0.22 * strike, -0.35 * wind + 0.45 * follow, 0.0)
                tu_r = (-0.18 * wind + 0.34 * strike, -0.42 * wind + 0.56 * follow, 0.12 * strike)
            elif is_roar:
                tl_r = (0.20 * roar_in - 0.18 * roar_hold, 0.0, 0.0)
                tu_r = (0.24 * roar_in - 0.30 * roar_hold, 0.0, 0.035 * roar_vib)
            elif is_slam:
                tl_r = (0.22 * sl_prep - 0.26 * sl_jump + 0.36 * sl_hit, 0.0, 0.0)
                tu_r = (0.25 * sl_prep - 0.34 * sl_jump + 0.48 * sl_hit, 0.0, 0.03 * sl_quake)
            elif is_tail:
                tl_r = (0.10 * tw_whip, 0.45 * tw_prep - 0.55 * tw_whip, 0.0)
                tu_r = (0.16 * tw_whip, -0.32 * tw_prep + 0.48 * tw_whip, 0.15 * tw_snap)
            elif is_siphon:
                tl_r = (-0.14 * si_hold, 0.0, 0.0)
                tu_r = (-0.28 * si_hold, 0.04 * si_pulse, 0.0)
            elif is_break:
                tl_r = (-0.26 * br_snap + 0.22 * br_kneel, -0.18 * br_kneel, 0.16 * br_kneel)
                tu_r = (
                    -0.34 * br_snap + 0.28 * br_kneel,
                    -0.22 * br_kneel,
                    0.12 * br_kneel + 0.04 * br_shake,
                )
            put("Torso_Lower", dr=tl_r)
            put("Torso_Upper", dr=tu_r)

            # 4. Rift_Heart_Core (breathing pulse & spin)
            heart_sc = 1.0 + 0.09 * s2
            heart_ry = a
            if is_roar:
                heart_sc = 1.0 + 0.38 * roar_hold + 0.08 * roar_vib
                heart_ry = a * 3.0
            elif is_siphon:
                heart_sc = 1.0 + 0.48 * si_hold + 0.12 * si_pulse
                heart_ry = a * 4.0
            elif is_awaken:
                heart_sc = 0.78 + 0.62 * aw_burst
                heart_ry = a * 3.0
            elif is_slam:
                heart_sc = 1.0 + 0.32 * sl_jump + 0.24 * sl_hit
                heart_ry = a * 2.0
            elif is_break:
                heart_sc = max(0.55, 1.0 - 0.38 * br_kneel)
            put("Rift_Heart_Core", dr=(0.12 * s1, heart_ry, 0.0), sc=(heart_sc, heart_sc, heart_sc))

            # 5. Mantle_Fin_L & Mantle_Fin_R (flare open dramatically on Roar / Awaken / Siphon!)
            fin_flare = 0.06 * s1 if is_idle else 0.0
            fin_pitch = 0.04 * s2 if is_idle else 0.0
            if is_awaken:
                fin_flare = -0.25 * aw_crouch + 0.72 * aw_burst
                fin_pitch = -0.22 * aw_peak
            elif is_roar:
                fin_flare = -0.22 * roar_in + 0.78 * roar_hold + 0.06 * roar_vib
                fin_pitch = -0.20 * roar_hold
            elif is_slam:
                fin_flare = 0.56 * sl_jump - 0.18 * sl_hit
            elif is_siphon:
                fin_flare = 0.64 * si_hold + 0.06 * si_pulse
                fin_pitch = 0.18 * si_hold
            elif is_normal:
                fin_flare = 0.28 * wind + 0.42 * strike
            elif is_break:
                fin_flare = -0.35 * br_kneel
                fin_pitch = 0.26 * br_kneel
            put("Mantle_Fin_L", dr=(fin_pitch, -fin_flare * 0.75, fin_flare * 0.45))
            put("Mantle_Fin_R", dr=(fin_pitch, fin_flare * 0.75, -fin_flare * 0.45))

            # 6. Neck_Base, Neck_Upper, Head_Skull, Jaw_Lower
            nk_r = (0.04 * s1, 0.05 * math.sin(a * 0.5), 0.0) if is_idle else (0.0, 0.0, 0.0)
            hd_r = (-0.04 * s1, 0.14 * s1, 0.04 * s2) if is_idle else (0.0, 0.0, 0.0)
            jaw_open = 0.07 * (0.5 - 0.5 * math.cos(a * 2.0)) if is_idle else 0.0
            if is_awaken:
                nk_r = (0.35 * aw_crouch - 0.36 * aw_peak, 0.0, 0.0)
                hd_r = (0.28 * aw_crouch - 0.42 * aw_peak, 0.0, 0.04 * math.sin(a * 6.0) * aw_peak)
                jaw_open = 0.68 * aw_peak + 0.15 * aw_burst
            elif is_normal:
                nk_r = (-0.12 * wind + 0.24 * strike, -0.18 * wind + 0.22 * strike, 0.0)
                hd_r = (-0.10 * wind + 0.20 * strike, -0.25 * wind + 0.34 * strike, -0.10 * strike)
                jaw_open = 0.46 * strike + 0.14 * follow
            elif is_roar:
                nk_r = (0.32 * roar_in - 0.34 * roar_hold, 0.0, 0.04 * roar_vib)
                hd_r = (0.24 * roar_in - 0.38 * roar_hold, 0.05 * roar_vib, 0.06 * roar_vib)
                jaw_open = 0.76 * roar_hold + 0.08 * abs(roar_vib)
            elif is_slam:
                nk_r = (0.18 * sl_prep - 0.28 * sl_jump + 0.32 * sl_hit, 0.0, 0.0)
                hd_r = (0.16 * sl_prep - 0.26 * sl_jump + 0.26 * sl_hit, 0.0, 0.04 * sl_quake)
                jaw_open = 0.52 * sl_jump + 0.42 * sl_hit
            elif is_tail:
                nk_r = (0.08 * tw_whip, -0.28 * tw_prep + 0.36 * tw_whip, 0.0)
                hd_r = (0.06 * tw_whip, -0.34 * tw_prep + 0.46 * tw_whip, 0.0)
                jaw_open = 0.36 * tw_snap
            elif is_siphon:
                nk_r = (-0.26 * si_hold, 0.0, 0.0)
                hd_r = (-0.34 * si_hold, 0.06 * si_pulse, 0.0)
                jaw_open = 0.42 * si_hold + 0.08 * si_pulse
            elif is_break:
                nk_r = (-0.38 * br_snap + 0.42 * br_kneel, 0.16 * br_kneel, -0.14 * br_kneel)
                hd_r = (
                    -0.34 * br_snap + 0.38 * br_kneel,
                    0.22 * br_kneel + 0.09 * br_shake,
                    -0.22 * br_kneel,
                )
                jaw_open = 0.48 * br_snap + 0.28 * br_kneel
            put("Neck_Base", dr=nk_r)
            put("Neck_Upper", dr=(nk_r[0] * 0.55, nk_r[1] * 0.55, nk_r[2] * 0.5))
            put("Head_Skull", dr=hd_r)
            put("Jaw_Lower", dr=(jaw_open, 0.0, 0.0))

            # 7. Left Arm (+X Crystal-Cleaver Blade Arm)
            shl_r = (0.04 * s1, 0.0, 0.04 * s1) if is_idle else (0.0, 0.0, 0.0)
            ual_r = (-0.06 * s1, 0.0, 0.04 * s2) if is_idle else (0.0, 0.0, 0.0)
            fal_r = (-0.08 * math.sin(a - 0.6), 0.0, 0.0) if is_idle else (0.0, 0.0, 0.0)
            hdl_r = (0.06 * s2, 0.0, 0.0) if is_idle else (0.0, 0.0, 0.0)

            if is_awaken:
                shl_r = (0.34 * aw_crouch - 0.45 * aw_peak, 0.0, -0.28 * aw_crouch + 0.58 * aw_peak)
                ual_r = (0.35 * aw_crouch - 0.32 * aw_peak, -0.25 * aw_peak, 0.36 * aw_peak)
                fal_r = (-0.42 * aw_crouch - 0.18 * aw_peak, 0.0, 0.0)
            elif is_normal:
                # Explosive diagonal warlord cleave!
                shl_r = (
                    -1.18 * wind + 1.12 * strike + 0.42 * follow,
                    -0.58 * wind + 0.72 * follow,
                    0.65 * wind - 0.68 * strike,
                )
                ual_r = (
                    -0.64 * wind + 0.55 * strike,
                    -0.35 * wind + 0.65 * follow,
                    0.35 * wind - 0.42 * follow,
                )
                fal_r = (-0.68 * wind + 0.52 * strike, 0.0, 0.25 * strike)
                hdl_r = (-0.30 * wind + 0.35 * strike, 0.0, 0.0)
            elif is_roar:
                shl_r = (
                    0.28 * roar_in - 0.46 * roar_hold,
                    -0.35 * roar_hold,
                    -0.26 * roar_in + 0.62 * roar_hold,
                )
                ual_r = (0.22 * roar_in - 0.32 * roar_hold, -0.28 * roar_hold, 0.38 * roar_hold)
                fal_r = (-0.36 * roar_in - 0.24 * roar_hold, 0.0, 0.0)
            elif is_slam:
                shl_r = (
                    0.22 * sl_prep - 1.65 * sl_jump + 0.92 * sl_hit,
                    0.0,
                    0.35 * sl_jump - 0.25 * sl_hit,
                )
                ual_r = (-0.68 * sl_jump + 0.48 * sl_hit, 0.0, 0.20 * sl_jump - 0.18 * sl_hit)
                fal_r = (-0.52 * sl_jump + 0.44 * sl_hit, 0.0, 0.0)
            elif is_tail:
                shl_r = (-0.28 * tw_prep + 0.38 * tw_whip, 0.30 * tw_whip, 0.42 * tw_whip)
                ual_r = (-0.25 * tw_whip, 0.0, 0.25 * tw_whip)
                fal_r = (-0.32 * tw_whip, 0.0, 0.0)
            elif is_siphon:
                shl_r = (-0.24 * si_hold, -0.42 * si_hold, 0.62 * si_hold)
                ual_r = (-0.18 * si_hold, -0.25 * si_hold, 0.28 * si_hold)
                fal_r = (-0.42 * si_hold, 0.0, 0.0)
            elif is_break:
                shl_r = (-0.42 * br_snap + 0.32 * br_kneel, 0.0, 0.34 * br_snap - 0.16 * br_kneel)
                ual_r = (0.28 * br_kneel, 0.0, 0.22 * br_snap)
                fal_r = (0.26 * br_kneel, 0.0, 0.0)
            put("Shoulder_L", dr=shl_r)
            put("UpperArm_L", dr=ual_r)
            put("Forearm_L", dr=fal_r)
            put("ClawHand_L", dr=hdl_r)

            # 8. Right Arm (-X Shackled Brute Claw Arm + Dangling Quarry Iron Chain!)
            shr_r = (-0.04 * s1, 0.0, -0.04 * s1) if is_idle else (0.0, 0.0, 0.0)
            uar_r = (0.05 * s1, 0.0, -0.04 * s2) if is_idle else (0.0, 0.0, 0.0)
            far_r = (-0.07 * math.sin(a - 0.5), 0.0, 0.0) if is_idle else (0.0, 0.0, 0.0)
            hdr_r = (0.09 * s2, 0.0, 0.0) if is_idle else (0.0, 0.0, 0.0)
            # Secondary lag swing on dangling iron quarry chain
            chain_r = (0.08 * math.sin(a - 1.1), 0.0, 0.11 * math.sin(a - 0.8))

            if is_awaken:
                shr_r = (0.34 * aw_crouch - 0.45 * aw_peak, 0.0, 0.28 * aw_crouch - 0.58 * aw_peak)
                uar_r = (0.35 * aw_crouch - 0.32 * aw_peak, 0.25 * aw_peak, -0.36 * aw_peak)
                far_r = (-0.42 * aw_crouch - 0.18 * aw_peak, 0.0, 0.0)
                chain_r = (-0.45 * aw_peak, 0.0, -0.52 * aw_peak)
            elif is_normal:
                shr_r = (
                    0.34 * wind - 0.42 * strike,
                    0.28 * wind - 0.25 * follow,
                    -0.26 * wind - 0.32 * strike,
                )
                uar_r = (0.24 * wind - 0.28 * strike, 0.0, -0.22 * strike)
                far_r = (-0.38 * wind - 0.22 * follow, 0.0, 0.0)
                chain_r = (0.48 * strike - 0.32 * follow, 0.0, -0.58 * strike)
            elif is_roar:
                shr_r = (
                    0.28 * roar_in - 0.46 * roar_hold,
                    0.35 * roar_hold,
                    0.26 * roar_in - 0.62 * roar_hold,
                )
                uar_r = (0.22 * roar_in - 0.32 * roar_hold, 0.28 * roar_hold, -0.38 * roar_hold)
                far_r = (-0.36 * roar_in - 0.24 * roar_hold, 0.0, 0.0)
                chain_r = (0.32 * roar_hold, 0.0, -0.45 * roar_hold + 0.18 * roar_vib)
            elif is_slam:
                shr_r = (
                    0.22 * sl_prep - 1.65 * sl_jump + 0.92 * sl_hit,
                    0.0,
                    -0.35 * sl_jump + 0.25 * sl_hit,
                )
                uar_r = (-0.68 * sl_jump + 0.48 * sl_hit, 0.0, -0.20 * sl_jump + 0.18 * sl_hit)
                far_r = (-0.52 * sl_jump + 0.44 * sl_hit, 0.0, 0.0)
                chain_r = (0.78 * sl_jump - 0.55 * sl_hit, 0.0, 0.42 * sl_quake)
            elif is_tail:
                shr_r = (0.26 * tw_prep - 0.32 * tw_whip, -0.35 * tw_whip, -0.45 * tw_whip)
                uar_r = (-0.20 * tw_whip, 0.0, -0.25 * tw_whip)
                far_r = (-0.36 * tw_whip, 0.0, 0.0)
                chain_r = (0.45 * tw_snap, 0.0, -0.78 * tw_snap)
            elif is_siphon:
                shr_r = (-0.24 * si_hold, 0.42 * si_hold, -0.62 * si_hold)
                uar_r = (-0.18 * si_hold, 0.25 * si_hold, -0.28 * si_hold)
                far_r = (-0.42 * si_hold, 0.0, 0.0)
                chain_r = (0.22 * si_hold, 0.0, -0.34 * si_hold + 0.12 * si_pulse)
            elif is_break:
                shr_r = (-0.55 * br_snap + 0.22 * br_kneel, 0.0, -0.52 * br_snap + 0.14 * br_kneel)
                uar_r = (-0.24 * br_snap + 0.26 * br_kneel, 0.0, -0.32 * br_snap)
                far_r = (0.34 * br_kneel, 0.0, 0.0)
                chain_r = (0.65 * br_snap, 0.0, 0.55 * br_snap + 0.22 * br_shake)
            put("Shoulder_R", dr=shr_r)
            put("UpperArm_R", dr=uar_r)
            put("Forearm_R", dr=far_r)
            put("Chain_Swing_R", dr=chain_r)
            put("ClawHand_R", dr=hdr_r)

            # 9. 4-Segment Sinuous Armored Tail (wave lag!)
            t_y = [0.0, 0.0, 0.0, 0.0]
            t_x = [0.0, 0.0, 0.0, 0.0]
            for ti in range(4):
                lag = ti * 0.72
                if is_idle:
                    t_y[ti] = 0.12 * math.sin(a - lag)
                    t_x[ti] = 0.05 * math.cos(a - lag) - 0.05 * math.cos(-lag)
                elif is_tail:
                    # Huge sequential whip snap across the front arc!
                    wave_t = max(0.0, min(1.0, t - ti * 0.032))
                    p_loc = bell_window(wave_t, 0.0, 0.30)
                    w_loc = bell_window(wave_t, 0.24, 0.72)
                    t_y[ti] = 0.42 * p_loc - (0.62 + ti * 0.14) * w_loc
                    t_x[ti] = -0.14 * p_loc + 0.22 * w_loc
                elif is_normal:
                    t_y[ti] = 0.24 * wind - 0.30 * follow
                    t_x[ti] = 0.08 * strike
                elif is_roar or is_awaken:
                    amp = roar_hold if is_roar else aw_burst
                    t_y[ti] = 0.18 * math.sin(a * 2.0 - lag) * amp
                    t_x[ti] = 0.16 * amp
                elif is_slam:
                    t_x[ti] = -0.26 * sl_jump + 0.22 * sl_hit
                    t_y[ti] = 0.12 * math.sin(a - lag) * sl_hit
                elif is_siphon:
                    t_x[ti] = 0.18 * si_hold
                    t_y[ti] = 0.15 * math.sin(a * 2.0 - lag) * si_hold
                elif is_break:
                    t_x[ti] = -0.22 * br_kneel
                    t_y[ti] = 0.24 * br_snap - 0.12 * br_kneel
            put("Tail_Seg_1", dr=(t_x[0], t_y[0], 0.0))
            put("Tail_Seg_2", dr=(t_x[1], t_y[1], 0.0))
            put("Tail_Seg_3", dr=(t_x[2], t_y[2], 0.0))
            put("Tail_Mace", dr=(t_x[3], t_y[3], 0.0))

            # 10. Digitigrade Hind Legs (reactive knee bends for crouching/leaping/stagger!)
            hip_bend = 0.0
            shin_bend = 0.0
            if is_awaken:
                hip_bend = -0.45 * aw_crouch
                shin_bend = 0.52 * aw_crouch
            elif is_slam:
                hip_bend = -0.32 * sl_prep + 0.26 * sl_jump - 0.28 * sl_hit
                shin_bend = 0.38 * sl_prep - 0.18 * sl_jump + 0.34 * sl_hit
            elif is_break:
                hip_bend = -0.38 * br_kneel
                shin_bend = 0.46 * br_kneel
            elif is_roar:
                hip_bend = -0.16 * roar_in
                shin_bend = 0.20 * roar_in
            put(
                "Hip_L",
                dr=(hip_bend + (0.08 * wind - 0.10 * strike if is_normal else 0.0), 0.0, 0.0),
            )
            put("Shin_L", dr=(shin_bend, 0.0, 0.0))
            put(
                "Hip_R",
                dr=(hip_bend + (-0.10 * wind + 0.08 * strike if is_normal else 0.0), 0.0, 0.0),
            )
            put("Shin_R", dr=(shin_bend, 0.0, 0.0))

            # 11. Embedded 3D FX Nodes (hidden at 1e-5 in rest/idle, flare dramatically in action!)
            roar_sc = 0.00001
            roar_dz = 0.0
            if is_roar:
                w = bell_window(t, 0.24, 0.86)
                roar_sc = max(0.00001, w * 1.25)
                roar_dz = w * 0.55
            elif is_awaken:
                w = bell_window(t, 0.38, 0.82)
                roar_sc = max(0.00001, w * 1.05)
                roar_dz = w * 0.35
            put(
                "Roar_Wave_FX",
                dp=(0.0, 0.0, roar_dz),
                dr=(0.0, 0.0, a * 2.0),
                sc=(roar_sc, roar_sc, roar_sc),
            )

            slash_sc = 0.00001
            if is_normal:
                w = bell_window(t, 0.30, 0.64)
                slash_sc = max(0.00001, w * 1.15)
            put("Slash_Arc_FX", dr=(0.0, 0.0, -0.6 * follow), sc=(slash_sc, slash_sc, slash_sc))

            slam_sc = 0.00001
            if is_slam:
                w = bell_window(t, 0.42, 0.90)
                slam_sc = max(0.00001, w * 1.25)
            put("Ground_Slam_FX", dr=(0.0, a * 0.5, 0.0), sc=(slam_sc, slam_sc * 0.92, slam_sc))

            halo_sc = 0.00001
            if is_roar:
                halo_sc = max(0.00001, bell_window(t, 0.22, 0.90) * 1.15)
            elif is_awaken:
                halo_sc = max(0.00001, bell_window(t, 0.32, 0.92) * 1.12)
            elif is_siphon:
                halo_sc = max(0.00001, si_hold * 1.08)
            put("Command_Halo_FX", dr=(0.0, 0.0, -a * 1.5), sc=(halo_sc, halo_sc, halo_sc))

            # 12. 8 Orbiting Dark-Dust Rift Shards (游离暗尘!)
            for di, dj in enumerate(dust_joints):
                phase = (di / len(dust_joints)) * TAU
                bob = 0.09 * math.sin(a + phase)
                ox = 0.08 * math.cos(a + phase) - 0.08 * math.cos(phase)
                oz = 0.08 * math.sin(a + phase) - 0.08 * math.sin(phase)
                dsc = 1.0
                if is_roar:
                    # Surge forward aggressively in coordinated swarm strike!
                    surge = bell_window(t, 0.28, 0.84)
                    ox = math.cos(phase) * 0.24 * surge
                    bob = -0.18 * surge + 0.14 * math.sin(a * 3.0 + phase) * surge
                    oz = 1.45 * surge
                    dsc = 1.0 + 0.35 * surge
                elif is_siphon:
                    # Spiral rapidly inward toward chest Rift Heart Core!
                    pull = si_hold
                    p_rest = s.joints[dj]["pivot"]
                    ox = -float(p_rest[0]) * 0.62 * pull + math.cos(a * 3.0 + phase) * 0.22 * pull
                    bob = (2.26 - float(p_rest[1])) * 0.52 * pull
                    oz = (0.48 - float(p_rest[2])) * 0.55 * pull + math.sin(
                        a * 3.0 + phase
                    ) * 0.22 * pull
                    dsc = 1.0 + 0.25 * pull
                elif is_awaken:
                    # Drawn tight during crouch, then burst outward!
                    ox = (-0.42 * aw_crouch + 0.32 * aw_burst) * math.cos(phase)
                    bob = -0.38 * aw_crouch + 0.26 * aw_peak
                    oz = (-0.28 * aw_crouch + 0.24 * aw_burst) * math.sin(phase)
                elif is_normal:
                    # Whip forward along the cleave
                    oz = 0.62 * strike
                    ox = -0.35 * strike
                elif is_slam:
                    bob = 0.45 * sl_jump - 0.35 * sl_hit
                    ox = math.cos(phase) * 0.38 * sl_hit
                    oz = math.sin(phase) * 0.38 * sl_hit
                elif is_break:
                    # Lose levitation and flutter downward
                    bob = -0.78 * br_kneel + 0.08 * br_shake
                    ox = math.cos(phase) * 0.32 * br_kneel
                    dsc = max(0.65, 1.0 - 0.30 * br_kneel)
                put(
                    dj,
                    dp=(ox, bob, oz),
                    dr=(a * 0.5 + phase, a + phase, a * 0.5),
                    sc=(dsc, dsc, dsc),
                )

        clips[clip_name] = (times, tracks)
    return clips


def build_darkscale_warlord():
    s = RiggedSculptor("darkscaleWarlord", "初生暗鳞督军")

    mats = {
        "scale": s.mat("Darkscale_Obsidian", metallic=0.54, roughness=0.32, pbr_kind="darkscale"),
        "bone": s.mat("Quarry_Bone_Plate", metallic=0.14, roughness=0.46, pbr_kind="quarry_bone"),
        "sinew": s.mat("Corrupted_Sinew", metallic=0.08, roughness=0.68, pbr_kind="sinew"),
        "crystal": s.mat(
            "Rift_Amethyst_Crystal",
            metallic=0.26,
            roughness=0.16,
            emissive=[0.52, 0.14, 0.88],
            pbr_kind="rift_crystal",
        ),
        "core": s.mat(
            "Rift_Core_Plasma",
            metallic=0.10,
            roughness=0.12,
            emissive=[0.84, 0.32, 1.0],
            pbr_kind="rift_crystal",
        ),
        "eye": s.mat("Warlord_Eye_Glow", metallic=0.05, roughness=0.10, emissive=[1.0, 0.32, 0.92]),
        "iron": s.mat("Quarry_Rusted_Iron", metallic=0.82, roughness=0.38, pbr_kind="quarry_iron"),
        "bronze": s.mat(
            "Quarry_Bronze_Rivets", metallic=0.86, roughness=0.28, pbr_kind="bronze_trim"
        ),
        "membrane": s.mat(
            "Rift_Mantle_Membrane",
            metallic=0.15,
            roughness=0.42,
            emissive=[0.22, 0.06, 0.42],
            double_sided=True,
            pbr_kind="sinew",
        ),
        "fx": s.mat(
            "Rift_Energy_FX",
            metallic=0.05,
            roughness=0.15,
            emissive=[0.78, 0.24, 1.0],
            double_sided=True,
        ),
    }

    # --- Build Articulated Hierarchical Skeleton (36 joints!) ---
    root = s.joint("Warlord_Root", None, (0.0, 0.0, 0.0))
    pelvis = s.joint("Pelvis_Core", root, (0.0, 1.24, -0.04))
    waist = s.joint("Torso_Lower", pelvis, (0.0, 1.48, -0.02))
    chest = s.joint("Torso_Upper", waist, (0.0, 1.96, 0.06))
    core_j = s.joint("Rift_Heart_Core", chest, (0.0, 2.26, 0.47))
    fin_l = s.joint("Mantle_Fin_L", chest, (0.52, 2.48, -0.32))
    fin_r = s.joint("Mantle_Fin_R", chest, (-0.52, 2.48, -0.32))

    neck1 = s.joint("Neck_Base", chest, (0.0, 2.66, 0.24))
    neck2 = s.joint("Neck_Upper", neck1, (0.0, 2.86, 0.42))
    head = s.joint("Head_Skull", neck2, (0.0, 2.98, 0.56))
    jaw = s.joint("Jaw_Lower", head, (0.0, 2.88, 0.62))

    sh_l = s.joint("Shoulder_L", chest, (0.78, 2.48, 0.10))
    ua_l = s.joint("UpperArm_L", sh_l, (0.90, 2.34, 0.12))
    fa_l = s.joint("Forearm_L", ua_l, (1.02, 1.72, 0.28))
    hd_l = s.joint("ClawHand_L", fa_l, (1.06, 1.24, 0.56))

    sh_r = s.joint("Shoulder_R", chest, (-0.78, 2.46, 0.08))
    ua_r = s.joint("UpperArm_R", sh_r, (-0.90, 2.32, 0.10))
    fa_r = s.joint("Forearm_R", ua_r, (-1.00, 1.70, 0.24))
    ch_r = s.joint("Chain_Swing_R", fa_r, (-1.16, 1.38, 0.38))
    hd_r = s.joint("ClawHand_R", fa_r, (-1.02, 1.24, 0.52))

    t1 = s.joint("Tail_Seg_1", pelvis, (0.0, 1.18, -0.36))
    t2 = s.joint("Tail_Seg_2", t1, (-0.18, 0.90, -0.96))
    t3 = s.joint("Tail_Seg_3", t2, (-0.62, 0.72, -1.24))
    tmace = s.joint("Tail_Mace", t3, (-1.02, 0.86, -0.98))

    hip_l = s.joint("Hip_L", pelvis, (0.44, 1.18, 0.02))
    shin_l = s.joint("Shin_L", hip_l, (0.58, 0.66, 0.22))
    foot_l = s.joint("Foot_L", shin_l, (0.56, 0.14, 0.18))

    hip_r = s.joint("Hip_R", pelvis, (-0.44, 1.18, -0.04))
    shin_r = s.joint("Shin_R", hip_r, (-0.58, 0.66, 0.14))
    foot_r = s.joint("Foot_R", shin_r, (-0.56, 0.14, 0.08))

    # 8 Orbiting Dark-Dust Shards (kept cleanly within compact footprint around shoulders/crown!)
    dust_joints = []
    dust_spots = [
        (1.18, 3.18, 0.26),
        (-1.16, 3.10, 0.22),
        (0.86, 3.48, -0.38),
        (-0.84, 3.42, -0.40),
        (1.24, 2.15, -0.42),
        (-1.22, 2.08, -0.46),
        (0.46, 3.58, 0.32),
        (-0.48, 3.52, 0.28),
    ]
    for di, pos in enumerate(dust_spots):
        dust_joints.append(s.joint(f"Dust_Shard_{di}", root, pos))

    # Hidden-at-rest FX nodes (scale 1e-5 so rest bounding box stays clean & towering!)
    hidden = (0.00001, 0.00001, 0.00001)
    roar_fx = s.joint("Roar_Wave_FX", head, (0.0, 2.94, 1.34), rest_scale=hidden)
    slash_fx = s.joint("Slash_Arc_FX", fa_l, (1.02, 1.02, 0.92), rest_scale=hidden)
    slam_fx = s.joint("Ground_Slam_FX", root, (0.0, 0.02, 0.42), rest_scale=hidden)
    halo_fx = s.joint("Command_Halo_FX", chest, (0.0, 3.04, -0.18), rest_scale=hidden)

    # --- Sculpt Every Anatomical Layer ---
    sculpt_torso_and_neck(s, pelvis, waist, chest, core_j, neck1, neck2, mats)
    sculpt_skull_and_jaw(s, head, jaw, mats)
    sculpt_mantle_fins(s, fin_l, fin_r, mats)
    sculpt_arms(s, sh_l, ua_l, fa_l, hd_l, sh_r, ua_r, fa_r, ch_r, hd_r, mats)
    sculpt_legs(s, hip_l, shin_l, foot_l, hip_r, shin_r, foot_r, mats)
    sculpt_tail(s, t1, t2, t3, tmace, mats)
    sculpt_dark_dust_and_fx(s, dust_joints, roar_fx, slash_fx, slam_fx, halo_fx, mats)

    # --- Bake 8 Full Articulated Boss Animation Clips ---
    clips = build_warlord_clips(s, dust_joints)
    return s.export_glb("darkscale-warlord.glb", "darkscale-warlord", clips)


if __name__ == "__main__":
    build_darkscale_warlord()
