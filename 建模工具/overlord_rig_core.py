"""Reusable procedural sculpting / PBR / GLB / SVG toolkit for articulated Overlord rigs."""

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
    "raven_leather": (0.84, 0.16, 3.2, 5.2, 0.72),
    "raven_feather": (0.86, 0.17, 3.4, 5.6, 0.78),
    "filigree_iron": (0.82, 0.17, 3.0, 5.8, 0.80),
    "moon_bark": (0.85, 0.16, 2.8, 6.0, 0.86),
    "lunar_opal": (0.92, 0.14, 3.2, 4.6, 0.56),
    "brass_astrolabe": (0.88, 0.14, 3.0, 4.8, 0.62),
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
    elif kind == "raven_leather":
        # Diamond quilted hide & fine pebble grain
        u = xx / TAU * 6.0
        v = yy / TAU * 6.0
        diamond = np.abs(((u + v) % 2.0) - 1.0) + np.abs(((u - v) % 2.0) - 1.0)
        quilt = np.exp(-(((diamond - 0.55) / 0.16) ** 2)) * 0.55
        pebble = np.sin(xx * 22.0 + med * 1.8) * np.cos(yy * 22.0 - med * 1.4) * 0.22
        height = quilt + pebble + med * 0.24 + fine * 0.20
    elif kind == "raven_feather":
        # Directional oblique feather barbules & quill shafts
        u = xx / TAU * 5.0
        v = yy / TAU * 5.0
        shaft = np.exp(-((np.sin(u * PI) / 0.10) ** 2)) * 0.55
        barb = np.sin((u * 26.0 + v * 9.0) + med * 0.9) * 0.28
        barb2 = np.sin((u * 26.0 - v * 9.0) + fine * 0.7) * 0.16
        height = shaft + barb + barb2 + med * 0.18 + fine * 0.14
    elif kind == "filigree_iron":
        # Engraved steel scrollwork & hammered pits
        u = xx / TAU * 4.0
        v = yy / TAU * 4.0
        scroll = np.sin(u * 3.0 + np.sin(v * 2.0 + broad * 1.2) * 1.8) * 0.42
        scroll2 = np.cos(v * 3.0 + np.sin(u * 2.0 - broad * 1.1) * 1.6) * 0.32
        pits = np.minimum(0.0, med + 0.35) * 0.85
        height = scroll + scroll2 + pits + fine * 0.22
    elif kind == "moon_bark":
        # Twisted organic silver-bark ridges & dark phloem fissures
        u = xx / TAU * 3.0
        v = yy / TAU * 3.0
        twist = np.sin(v * 4.0 + np.sin(u * 2.0 + broad * 1.3) * 2.4) * 0.55
        ridge = np.exp(-((np.sin(u * 5.0 + v * 1.5 + med * 0.8) / 0.22) ** 2)) * 0.42
        fissure = -np.exp(-((np.sin(u * 7.0 - v * 2.0 + fine * 0.6) / 0.10) ** 2)) * 0.55
        height = twist + ridge + fissure + med * 0.20 + fine * 0.16
    elif kind == "lunar_opal":
        # Concentric iris striation & opalescent rings
        u = xx / TAU * 4.0
        v = yy / TAU * 4.0
        r = np.sqrt((u - 2.0) ** 2 + (v - 2.0) ** 2)
        rings = np.sin(r * 18.0 + broad * 1.4) * 0.42
        iris = np.sin(r * 42.0 + med * 0.9) * 0.18
        height = rings + iris + med * 0.22 + fine * 0.14
    elif kind == "brass_astrolabe":
        # Lathe-turned brass grooves & riveted collar bands
        u = xx / TAU * 4.0
        v = yy / TAU * 4.0
        lathe = np.sin(v * 34.0 + med * 0.8) * 0.38
        band = np.exp(-((np.sin(v * 6.0) / 0.14) ** 2)) * 0.42
        rivet = (
            np.exp(-((np.sin(u * 8.0) / 0.10) ** 2))
            * np.exp(-((np.sin(v * 6.0) / 0.10) ** 2))
            * 0.30
        )
        height = lathe + band + rivet + med * 0.18 + fine * 0.12
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
        elif isinstance(color_or_fn, (tuple, list)) and len(color_or_fn) == 2:
            c0, c1 = color_or_fn
            ymin = float(verts[:, 1].min())
            yspan = max(1e-4, float(verts[:, 1].max()) - ymin)
            hexes = [lerp_hex(c0, c1, (float(v[1]) - ymin) / yspan) for v in verts]
            c_lin = np.asarray([hex_to_linear(h) for h in hexes], dtype=np.float32)
            c_srgb = np.asarray([hex_to_rgb255(h) for h in hexes], dtype=np.float32)
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


DEFAULT_SVG_THEME = {
    "bg0": "#301d4a",
    "bg1": "#171525",
    "bg2": "#08090f",
    "aura0": "#a855f7",
    "aura1": "#6b21a8",
    "rim": "#9b5cf6",
    "rim_rgb": (0.85, 0.72, 1.25),
}


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

    def joint(
        self,
        name,
        parent=None,
        pivot=(0.0, 0.0, 0.0),
        rest_scale=(1.0, 1.0, 1.0),
        extras=None,
    ):
        self.joints[name] = {
            "name": name,
            "parent": parent,
            "pivot": np.asarray(pivot, dtype=np.float32),
            "rest_scale": tuple(float(v) for v in rest_scale),
            "extras": dict(extras) if extras else None,
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

    def bevel_prism(
        self,
        joint,
        mat,
        poly_xz,
        height,
        bevel,
        center=(0, 0, 0),
        color="#888888",
        rot=(0, 0, 0),
        smooth=False,
    ):
        """Chamfered polygon prism extruded along +Y with outward CCW winding in XZ."""
        pts = [(float(p[0]), float(p[1])) for p in poly_xz]
        if len(pts) < 3:
            return
        # Shoelace sign check -> ensure CCW winding in XZ plane
        area2 = 0.0
        for i in range(len(pts)):
            x0, z0 = pts[i]
            x1, z1 = pts[(i + 1) % len(pts)]
            area2 += x0 * z1 - x1 * z0
        if area2 < 0.0:
            pts = list(reversed(pts))

        cx, cy, cz = center
        h = float(height)
        b = max(0.0, min(float(bevel), h * 0.49))
        rmat = rot_matrix_xyz(*rot)
        cvec = np.array([cx, cy, cz], dtype=np.float32)

        # Inset polygon for the top/bottom bevel rings (shrink toward centroid)
        mx = sum(p[0] for p in pts) / len(pts)
        mz = sum(p[1] for p in pts) / len(pts)
        inset = []
        for x, z in pts:
            dx, dz = x - mx, z - mz
            d = math.hypot(dx, dz)
            if d < 1e-6:
                inset.append((x, z))
            else:
                k = max(0.0, (d - b)) / d
                inset.append((mx + dx * k, mz + dz * k))

        n = len(pts)
        verts = []
        # Ring 0: bottom outer (y=0), Ring 1: bottom inset (y=b), Ring 2: top inset (y=h-b), Ring 3: top outer (y=h)
        for ring_pts, y in ((pts, 0.0), (inset, b), (inset, h - b), (pts, h)):
            for x, z in ring_pts:
                local = np.array([x, y, z], dtype=np.float32)
                verts.append((rmat @ local + cvec).tolist())

        tris = []
        for ri in range(3):
            r0, r1 = ri * n, (ri + 1) * n
            for si in range(n):
                sn = (si + 1) % n
                a, bb, c, d = r0 + si, r0 + sn, r1 + sn, r1 + si
                tris.append([a, c, bb])
                tris.append([a, d, c])
        # Bottom cap (facing -Y): CCW when viewed from below
        bot_c = len(verts)
        verts.append((rmat @ np.array([mx, 0.0, mz], dtype=np.float32) + cvec).tolist())
        for si in range(n):
            sn = (si + 1) % n
            tris.append([bot_c, sn, si])
        # Top cap (facing +Y): CCW when viewed from above
        top_c = len(verts)
        verts.append((rmat @ np.array([mx, h, mz], dtype=np.float32) + cvec).tolist())
        base = 3 * n
        for si in range(n):
            sn = (si + 1) % n
            tris.append([top_c, base + si, base + sn])

        self.bucket(joint, mat).append(verts, tris, color, smooth=smooth)

    def feather(
        self,
        joint,
        mat,
        root_pt,
        tip_pt,
        up_dir,
        width,
        curve=0.1,
        color_root="#1a1a24",
        color_tip="#3b354d",
    ):
        """3D double-sided thick teardrop plumage blade along root->tip arching by up_dir."""
        root = np.asarray(root_pt, dtype=np.float32)
        tip = np.asarray(tip_pt, dtype=np.float32)
        axis = tip - root
        length = float(np.linalg.norm(axis))
        if length < 1e-5:
            return
        axis /= length
        up = np.asarray(up_dir, dtype=np.float32)
        up = up - axis * float(np.dot(up, axis))
        if np.linalg.norm(up) < 1e-5:
            ref = np.array([0.0, 1.0, 0.0], dtype=np.float32)
            if abs(float(np.dot(axis, ref))) > 0.9:
                ref = np.array([1.0, 0.0, 0.0], dtype=np.float32)
            up = ref - axis * float(np.dot(ref, axis))
        up /= np.linalg.norm(up) + 1e-8
        side = np.cross(axis, up)
        side /= np.linalg.norm(side) + 1e-8

        steps = 10
        hw = float(width) * 0.5
        thick = max(0.004, float(width) * 0.10)
        verts = []
        # Build a spine of cross-sections: each section has 4 verts (left, right, top-ridge, bottom-ridge)
        for i in range(steps + 1):
            t = i / steps
            # Teardrop width profile: narrow at root, widest ~35%, taper to tip
            prof = math.sin(min(1.0, t * 1.35) * PI * 0.5) * (1.0 - t) ** 0.55
            w = hw * prof
            arch = curve * math.sin(t * PI) * length
            center = root + axis * (t * length) + up * arch
            ridge = thick * (0.35 + 0.65 * prof)
            verts.append((center - side * w).tolist())
            verts.append((center + side * w).tolist())
            verts.append((center + up * ridge).tolist())
            verts.append((center - up * ridge).tolist())

        tris = []
        for i in range(steps):
            r0, r1 = i * 4, (i + 1) * 4
            # Top faces (left->ridge->right)
            tris.append([r0 + 0, r0 + 2, r1 + 2])
            tris.append([r0 + 0, r1 + 2, r1 + 0])
            tris.append([r0 + 2, r0 + 1, r1 + 1])
            tris.append([r0 + 2, r1 + 1, r1 + 2])
            # Bottom faces (left->right->bottom-ridge)
            tris.append([r0 + 0, r1 + 0, r1 + 3])
            tris.append([r0 + 0, r1 + 3, r0 + 3])
            tris.append([r0 + 1, r0 + 3, r1 + 3])
            tris.append([r0 + 1, r1 + 3, r1 + 1])

        def col_fn(idx, _v):
            t = (idx // 4) / steps
            return lerp_hex(color_root, color_tip, t)

        self.bucket(joint, mat).append(verts, tris, col_fn, smooth=True)

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

    def _floor_shift(self, include_joints=None):
        """Compute shift so visible non-FX geometry stands on y = 0 and X/Z are centered."""
        xs, ys, zs = [], [], []
        for b in self.buckets.values():
            if include_joints is not None and b.joint_name not in include_joints:
                continue
            j = self.joints[b.joint_name]
            if max(abs(v) for v in j["rest_scale"]) < 0.01 or not b.positions:
                continue
            arr = np.asarray(b.positions, dtype=np.float32)
            xs.append(arr[:, 0])
            ys.append(arr[:, 1])
            zs.append(arr[:, 2])
        if not xs:
            return np.zeros(3, dtype=np.float32)
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

    def render_portrait_svg(self, floor_shift, svg_theme=None, include_joints=None):
        """Render a crisp 600x900 Phong + rim-lit SVG portrait from the 3D sculpted mesh."""
        theme = dict(DEFAULT_SVG_THEME)
        if svg_theme:
            theme.update(svg_theme)
        rim_rgb = np.asarray(theme.get("rim_rgb", DEFAULT_SVG_THEME["rim_rgb"]), dtype=np.float32)

        cam_dir = normalize_rows(np.array([[0.46, 0.24, 1.0]], dtype=np.float32))[0]
        right = normalize_rows(np.array([np.cross([0, 1, 0], cam_dir)], dtype=np.float32))[0]
        up = np.cross(cam_dir, right)
        light_dir = normalize_rows(np.array([[0.55, 0.72, 0.44]], dtype=np.float32))[0]
        fill_dir = normalize_rows(np.array([[-0.65, 0.12, 0.55]], dtype=np.float32))[0]

        all_proj = []
        faces = []
        for b in self.buckets.values():
            if include_joints is not None and b.joint_name not in include_joints:
                continue
            j = self.joints[b.joint_name]
            if max(abs(v) for v in j["rest_scale"]) < 0.01 or not b.positions:
                continue
            verts = np.asarray(b.positions, dtype=np.float32) + floor_shift
            cols = np.asarray(b.rgb_srgb, dtype=np.float32)
            tris = np.asarray(b.indices, dtype=np.uint32).reshape(-1, 3)
            if len(tris) == 0:
                continue

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
                    + np.array([rim[ti] * rim_rgb[0], rim[ti] * rim_rgb[1], rim[ti] * rim_rgb[2]])
                    + em,
                    0,
                    255,
                ).astype(int)
                hex_c = f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
                faces.append((float(depth[ti]), p2, hex_c))

        if all_proj:
            stacked = np.concatenate(all_proj, axis=0)
            min_x, min_y = float(stacked[:, 0].min()), float(stacked[:, 1].min())
            max_x, max_y = float(stacked[:, 0].max()), float(stacked[:, 1].max())
        else:
            min_x = min_y = max_x = max_y = 0.0
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
            f'<stop offset="0" stop-color="{theme["bg0"]}"/>'
            f'<stop offset="0.55" stop-color="{theme["bg1"]}"/>'
            f'<stop offset="1" stop-color="{theme["bg2"]}"/>'
            f"</radialGradient>"
            f'<radialGradient id="riftAura" cx="50%" cy="46%" r="44%">'
            f'<stop offset="0" stop-color="{theme["aura0"]}" stop-opacity="0.34"/>'
            f'<stop offset="0.55" stop-color="{theme["aura1"]}" stop-opacity="0.16"/>'
            f'<stop offset="1" stop-color="{theme["bg2"]}" stop-opacity="0"/>'
            f"</radialGradient>"
            f"</defs>\n"
            f'<path fill="url(#overlordBg)" d="M0 0h256v384H0z"/>\n'
            f'<circle cx="128" cy="176" r="108" fill="url(#riftAura)"/>\n'
            f'<ellipse cx="128" cy="{shadow_y:.1f}" rx="{shadow_rx:.1f}" ry="11" '
            f'fill="#04050a" opacity="0.68"/>\n'
            f'<ellipse cx="128" cy="{shadow_y:.1f}" rx="{shadow_rx * 0.72:.1f}" ry="6.5" '
            f'fill="none" stroke="{theme["rim"]}" stroke-width="1.2" opacity="0.46"/>\n'
            f'<g data-enemy-model="{self.enemy_id}" shape-rendering="crispEdges">'
            + "".join(polys)
            + "</g>\n</svg>\n"
        )

    def _build_glb(
        self,
        filename,
        portrait_slug,
        clips,
        floor_shift,
        include_joints=None,
        battle_assembly=None,
        svg_theme=None,
        source_name="建模工具/overlord_rig_core.py",
        write_files=True,
    ):
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
            if include_joints is not None and jname not in include_joints:
                continue
            j = self.joints[jname]
            world_p = j["pivot"] + floor_shift
            parent = j["parent"]
            if include_joints is not None and parent is not None and parent not in include_joints:
                parent = None
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
            if j.get("extras"):
                node.setdefault("extras", {}).update(j["extras"])
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
            if include_joints is not None and jname not in include_joints:
                continue
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
                if jname not in joint_nodes:
                    continue
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
            if channels:
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
            "source": source_name,
        }
        if battle_assembly:
            doc["extras"]["battleAssembly"] = battle_assembly

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

        svg_text = self.render_portrait_svg(
            floor_shift, svg_theme=svg_theme, include_joints=include_joints
        )

        if write_files:
            OUT_ROOT.mkdir(exist_ok=True)
            OUT_OVERLORDS.mkdir(exist_ok=True)
            ASSETS.mkdir(exist_ok=True)
            PORTRAITS.mkdir(exist_ok=True)
            (ASSETS / filename).write_bytes(output)
            (OUT_ROOT / filename).write_bytes(output)
            (OUT_OVERLORDS / filename).write_bytes(output)
            (PORTRAITS / f"{portrait_slug}.svg").write_text(
                svg_text, encoding="utf-8", newline="\n"
            )

        print(
            f"[Overlord Sculpted PBR] {self.title} ({filename}): "
            f"{len(comp_counts)} meshes, {total_tris:,} tris, "
            f"{len(doc['images'])} PBR maps, {len(doc['animations'])} clips, "
            f"{len(output) / 1048576:.2f} MB; SVG={len(svg_text) // 1024} KB"
        )
        return total_tris

    def export_glb(
        self,
        filename,
        portrait_slug,
        clips,
        battle_assembly=None,
        source_name="建模工具/overlord_rig_core.py",
        svg_theme=None,
        include_joints=None,
    ):
        floor_shift = self._floor_shift(include_joints=include_joints)
        return self._build_glb(
            filename,
            portrait_slug,
            clips,
            floor_shift,
            include_joints=include_joints,
            battle_assembly=battle_assembly,
            svg_theme=svg_theme,
            source_name=source_name,
            write_files=True,
        )

    def export_subset_glb(
        self,
        filename,
        portrait_slug,
        include_joints,
        clips=None,
        svg_theme=None,
        source_name="建模工具/overlord_rig_core.py",
    ):
        """Build a standalone static (or clip-filtered) GLB + SVG from just the given joints."""
        include_set = set(include_joints)
        floor_shift = self._floor_shift(include_joints=include_set)
        filtered_clips = {}
        if clips:
            for clip_name, (times, tracks_by_joint) in clips.items():
                filtered = {
                    jname: track for jname, track in tracks_by_joint.items() if jname in include_set
                }
                if filtered:
                    filtered_clips[clip_name] = (times, filtered)
        return self._build_glb(
            filename,
            portrait_slug,
            filtered_clips,
            floor_shift,
            include_joints=include_set,
            svg_theme=svg_theme,
            source_name=source_name,
            write_files=True,
        )


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
