"""Embed procedural PBR albedo/normal maps into alchemical-puppet.glb and render its 600x900 SVG portrait."""

import json
import math
from pathlib import Path
import struct
import zlib

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS_GLB = ROOT / "万象酒馆-Demo/assets/alchemical-puppet.glb"
ATELIER_GLB = ROOT / "万象异境-体素模型/alchemical-puppet.glb"
PORTRAIT_SVG = ROOT / "万象酒馆-Demo/assets/portraits/alchemical-puppet.svg"

CATEGORY_SPECS = {
    "porcelain": (0.88, 0.14, 2.85, 5.2, 0.72),
    "brass": (0.81, 0.15, 2.55, 4.8, 0.64),
    "iron": (0.76, 0.17, 2.45, 5.6, 0.78),
    "wood": (0.77, 0.21, 2.25, 6.2, 0.88),
    "crystal": (0.84, 0.16, 2.95, 4.4, 0.56),
}


def material_category(name):
    if name in ("Porcelain_mask", "Porcelain_bisque"):
        return "porcelain"
    if name in ("Tarnished_brass", "Antique_bronze", "Faction_inlay"):
        return "brass"
    if name in ("Cast_iron", "Rusted_pincer", "Engraved_obsidian_plinth"):
        return "iron"
    if name in ("Weathered_oak", "Splintered_timber"):
        return "wood"
    if name in ("Antigrav_violet", "Alchemical_emerald", "Obsidian_crack"):
        return "crystal"
    return None


def encode_rgb_png(rgb_uint8):
    """Encode an HxWx3 uint8 NumPy array into a self-contained lossless PNG using stdlib zlib."""
    height, width, channels = rgb_uint8.shape
    assert channels == 3
    # PNG Sub filter (filter type 1) compresses smooth normal & albedo gradients compactly
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
    """Generate seamlessly wrap-around 2D Gaussian-filtered noise via FFT."""
    raw = rng.standard_normal((size, size)).astype(np.float32)
    if sigma > 0:
        fy = np.fft.fftfreq(size)[:, None] * size
        fx = np.fft.fftfreq(size)[None, :] * size
        kernel = np.exp(-2.0 * (math.pi * sigma / size) ** 2 * (fx * fx + fy * fy))
        arr = np.fft.ifft2(np.fft.fft2(raw) * kernel).real.astype(np.float32)
    else:
        arr = raw
    return (arr - arr.mean()) / (arr.std() + 1e-5)


def make_pbr_maps(kind):
    avg, contrast, _, normal_strength, _ = CATEGORY_SPECS[kind]
    size = 256
    seed = sum(ord(ch) * (idx + 17) for idx, ch in enumerate(kind)) + 202611
    rng = np.random.default_rng(seed)
    yy, xx = np.meshgrid(
        np.linspace(0.0, math.tau, size, endpoint=False, dtype=np.float32),
        np.linspace(0.0, math.tau, size, endpoint=False, dtype=np.float32),
        indexing="ij",
    )
    fine = periodic_blur_noise(rng, size, 0.9)
    med = periodic_blur_noise(rng, size, 3.2)
    broad = periodic_blur_noise(rng, size, 9.5)

    if kind == "porcelain":
        # Crazed ceramic crackle glaze network + subtle bisque pitting
        pts_y = rng.uniform(0.0, math.tau, 44).astype(np.float32)
        pts_x = rng.uniform(0.0, math.tau, 44).astype(np.float32)
        dy = np.abs(yy[:, :, None] - pts_y[None, None, :])
        dx = np.abs(xx[:, :, None] - pts_x[None, None, :])
        dy = np.minimum(dy, math.tau - dy)
        dx = np.minimum(dx, math.tau - dx)
        dist = np.sqrt(dx * dx + dy * dy)
        part = np.partition(dist, 1, axis=-1)
        crackle_edge = part[:, :, 1] - part[:, :, 0]
        cracks = -np.exp(-((crackle_edge / 0.052) ** 2))
        height = cracks * 0.88 + fine * 0.14 + med * 0.18
    elif kind == "brass":
        # Anisotropic lathe-brushed antique brass striations + patina mottling
        striation = np.sin(yy * 42.0 + med * 1.4) * 0.26 + np.sin(yy * 84.0 + fine * 0.9) * 0.16
        scratches = np.exp(-((np.sin(xx * 7.0 + yy * 5.0 + broad * 1.8)) ** 2) / 0.004) * -0.35
        height = striation + scratches + med * 0.32 + fine * 0.15
    elif kind == "iron":
        # Pitted sand-cast iron & rust slag cavities
        pits = np.minimum(0.0, med + 0.35) * 0.95
        hammer = np.sin(xx * 6.0 + broad * 2.1) * np.cos(yy * 6.0 - broad * 1.9) * 0.28
        height = pits + hammer + fine * 0.38
    elif kind == "wood":
        # Longitudinal weathered oak fibers, growth rings, and dry timber splits
        rings = np.sin(xx * 9.0 + np.sin(yy * 2.0 + broad * 1.6) * 2.6 + med * 0.9)
        fibers = np.sin(xx * 52.0 + fine * 1.3) * 0.24
        splits = -np.exp(-(((xx - math.pi + broad * 0.35) % (math.tau / 3.0) - 0.2) ** 2) / 0.003)
        height = rings * 0.52 + fibers + splits * 0.55 + med * 0.22
    else:
        # Faceted alchemical crystal veins
        facets = np.abs(np.sin(xx * 5.0 + yy * 3.0 + broad * 1.5)) + np.abs(
            np.cos(xx * 4.0 - yy * 6.0 + med * 1.1)
        )
        height = (facets - facets.mean()) * 0.65 + fine * 0.18

    height = (height - height.mean()) / (height.std() + 0.03)
    albedo_gray = (np.clip(avg + height * contrast + broad * 0.035, 0.24, 0.98) * 255.0).astype(
        np.uint8
    )
    albedo_rgb = np.repeat(albedo_gray[:, :, None], 3, axis=2)

    gy, gx = np.gradient(height * 0.24)
    ones = np.ones_like(gx)
    normal_vec = np.stack([-gx * normal_strength, gy * normal_strength, ones], axis=-1)
    normal_vec /= np.sqrt(np.sum(normal_vec * normal_vec, axis=-1, keepdims=True)) + 1e-8
    normal_rgb = (np.clip(normal_vec * 0.5 + 0.5, 0.0, 1.0) * 255.0).astype(np.uint8)

    return [encode_rgb_png(albedo_rgb), encode_rgb_png(normal_rgb)]


def quat_to_mat3(q):
    x, y, z, w = q
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    return np.array(
        [
            [1.0 - 2.0 * (yy + zz), 2.0 * (xy - wz), 2.0 * (xz + wy)],
            [2.0 * (xy + wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz - wx)],
            [2.0 * (xz - wy), 2.0 * (yz + wx), 1.0 - 2.0 * (xx + yy)],
        ],
        dtype=np.float32,
    )


def node_local_matrix(node):
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=np.float32).reshape(4, 4).T
    t = np.asarray(node.get("translation", [0.0, 0.0, 0.0]), dtype=np.float32)
    r = quat_to_mat3(node.get("rotation", [0.0, 0.0, 0.0, 1.0]))
    s = np.asarray(node.get("scale", [1.0, 1.0, 1.0]), dtype=np.float32)
    mat = np.eye(4, dtype=np.float32)
    mat[:3, :3] = r * s[None, :]
    mat[:3, 3] = t
    return mat


def linear_to_srgb255(rgb):
    out = []
    for c in rgb[:3]:
        c = max(0.0, min(1.0, float(c)))
        s = c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1.0 / 2.4)) - 0.055
        out.append(max(0, min(255, round(s * 255.0))))
    return np.asarray(out, dtype=np.float32)


def render_alchemical_portrait_svg(doc, blob, read_accessor):
    cam_dir = np.array([0.48, 0.28, 1.0], dtype=np.float32)
    cam_dir /= np.linalg.norm(cam_dir)
    right = np.cross(np.array([0.0, 1.0, 0.0], dtype=np.float32), cam_dir)
    right /= np.linalg.norm(right)
    up = np.cross(cam_dir, right)
    light_dir = np.array([0.52, 0.74, 0.46], dtype=np.float32)
    light_dir /= np.linalg.norm(light_dir)
    fill_dir = np.array([-0.62, -0.18, 0.55], dtype=np.float32)
    fill_dir /= np.linalg.norm(fill_dir)

    all_proj = []
    faces = []

    def visit(node_idx, parent_mat):
        node = doc["nodes"][node_idx]
        name = node.get("name", "")
        if "Battle_Card" in name or name in (
            "Pole_Sweep_Afterglow",
            "Inverse_Gravity_Shockwave",
            "Resonance_Halo",
        ):
            return
        scale = node.get("scale", [1.0, 1.0, 1.0])
        if max(abs(v) for v in scale) < 0.001:
            return
        world = parent_mat @ node_local_matrix(node)
        if "mesh" in node:
            mesh = doc["meshes"][node["mesh"]]
            for prim in mesh["primitives"]:
                pos = read_accessor(prim["attributes"]["POSITION"], blob)
                ones = np.ones((len(pos), 1), dtype=np.float32)
                wpos = (np.hstack([pos, ones]) @ world.T)[:, :3]
                if "indices" in prim:
                    tris = read_accessor(prim["indices"], blob).reshape(-1, 3)
                else:
                    tris = np.arange(len(wpos), dtype=np.uint32).reshape(-1, 3)

                mat = doc["materials"][prim["material"]]
                pbr = mat.get("pbrMetallicRoughness", {})
                base_srgb = linear_to_srgb255(pbr.get("baseColorFactor", [0.8, 0.8, 0.8, 1.0]))
                em_lin = np.asarray(mat.get("emissiveFactor", [0.0, 0.0, 0.0]), dtype=np.float32)
                em_srgb = linear_to_srgb255(np.clip(em_lin, 0.0, 1.0)) * (
                    0.85 if em_lin.max() > 0 else 0.0
                )

                px = wpos @ right
                py = -(wpos @ up)
                pz = wpos @ cam_dir
                proj = np.stack([px, py, pz], axis=1)
                all_proj.append(proj)

                v0 = wpos[tris[:, 0]]
                v1 = wpos[tris[:, 1]]
                v2 = wpos[tris[:, 2]]
                raw_n = np.cross(v1 - v0, v2 - v0)
                lengths = np.linalg.norm(raw_n, axis=1, keepdims=True)
                valid = lengths[:, 0] > 1e-9
                tri_n = np.zeros_like(raw_n)
                tri_n[valid] = raw_n[valid] / lengths[valid]

                facing = tri_n @ cam_dir
                flip = facing < 0
                tri_n_oriented = np.where(flip[:, None], -tri_n, tri_n)
                diffuse = np.clip(tri_n_oriented @ light_dir, 0.0, 1.0)
                fill = np.clip(tri_n_oriented @ fill_dir, 0.0, 1.0)
                ndv = np.clip(np.abs(facing), 0.0, 1.0)
                rim = ((1.0 - ndv) ** 2.3) * 38.0
                tri_p = proj[tris]
                depth = tri_p[:, :, 2].mean(axis=1)

                for ti in range(len(tris)):
                    if not valid[ti] or facing[ti] <= 0.03:
                        continue
                    p2 = tri_p[ti, :, :2]
                    area2 = abs(
                        (p2[1, 0] - p2[0, 0]) * (p2[2, 1] - p2[0, 1])
                        - (p2[2, 0] - p2[0, 0]) * (p2[1, 1] - p2[0, 1])
                    )
                    if area2 < 0.00012:
                        continue
                    shade_k = 0.34 + float(diffuse[ti]) * 0.68 + float(fill[ti]) * 0.16
                    rgb = np.clip(
                        base_srgb * shade_k
                        + np.array([rim[ti] * 0.85, rim[ti] * 0.95, rim[ti] * 1.15])
                        + em_srgb,
                        0,
                        255,
                    ).astype(int)
                    hex_c = f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
                    faces.append((float(depth[ti]), p2, hex_c))

        for child in node.get("children", []):
            visit(child, world)

    for root_node in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        visit(root_node, np.eye(4, dtype=np.float32))

    stacked = np.concatenate(all_proj, axis=0)
    min_x, min_y = float(stacked[:, 0].min()), float(stacked[:, 1].min())
    max_x, max_y = float(stacked[:, 0].max()), float(stacked[:, 1].max())
    scale = min(218.0 / max(1e-4, max_x - min_x), 286.0 / max(1e-4, max_y - min_y))
    cx = 128.0 - (min_x + max_x) * 0.5 * scale
    cy = 194.0 - (min_y + max_y) * 0.5 * scale
    faces.sort(key=lambda item: item[0])

    polys = []
    for _, pts2, hex_c in faces:
        sx = cx + pts2[:, 0] * scale
        sy = cy + pts2[:, 1] * scale
        pts_str = " ".join(f"{sx[k]:.1f},{sy[k]:.1f}" for k in range(3))
        polys.append(f'<polygon points="{pts_str}" fill="{hex_c}"/>')

    shadow_y = min(354.0, cy + max_y * scale + 6.0)
    shadow_rx = min(92.0, (max_x - min_x) * scale * 0.4)
    ticks = "".join(
        f'<line x1="{128 + math.cos(i * math.tau / 24) * 94:.1f}" '
        f'y1="{172 + math.sin(i * math.tau / 24) * 94:.1f}" '
        f'x2="{128 + math.cos(i * math.tau / 24) * (102 if i % 3 == 0 else 98):.1f}" '
        f'y2="{172 + math.sin(i * math.tau / 24) * (102 if i % 3 == 0 else 98):.1f}" '
        f'stroke="#c29b50" stroke-width="1.1" opacity="0.28"/>'
        for i in range(24)
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" '
        'viewBox="0 0 256 384" data-art-style="sculpted-overlord-v1">\n'
        "<title>失败的炼金傀偶</title>\n"
        "<defs>"
        '<radialGradient id="overlordBg" cx="50%" cy="45%" r="70%">'
        '<stop offset="0" stop-color="#352046"/>'
        '<stop offset="0.55" stop-color="#1a1c2c"/>'
        '<stop offset="1" stop-color="#090c14"/>'
        "</radialGradient>"
        '<radialGradient id="coreGlow" cx="50%" cy="45%" r="42%">'
        '<stop offset="0" stop-color="#62f5b5" stop-opacity="0.32"/>'
        '<stop offset="0.5" stop-color="#9b4ef2" stop-opacity="0.18"/>'
        '<stop offset="1" stop-color="#090c14" stop-opacity="0"/>'
        "</radialGradient>"
        "</defs>\n"
        '<path fill="url(#overlordBg)" d="M0 0h256v384H0z"/>\n'
        '<circle cx="128" cy="172" r="106" fill="url(#coreGlow)"/>\n'
        '<circle cx="128" cy="172" r="94" fill="none" stroke="#c29b50" stroke-width="0.9" opacity="0.22"/>\n'
        '<circle cx="128" cy="172" r="72" fill="none" stroke="#8f45e8" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.25"/>\n'
        f"{ticks}\n"
        f'<ellipse cx="128" cy="{shadow_y:.1f}" rx="{shadow_rx:.1f}" ry="11" fill="#05070d" opacity="0.65"/>\n'
        f'<ellipse cx="128" cy="{shadow_y:.1f}" rx="{shadow_rx * 0.68:.1f}" ry="6.5" fill="none" stroke="#9b56f0" stroke-width="1.1" opacity="0.38"/>\n'
        '<g data-enemy-model="alchemicalPuppet" shape-rendering="crispEdges">'
        + "".join(polys)
        + "</g>\n</svg>\n"
    )


def main():
    raw = ASSETS_GLB.read_bytes()
    json_len = struct.unpack_from("<I", raw, 12)[0]
    g = json.loads(raw[20 : 20 + json_len])
    binary = bytearray(raw[28 + json_len :])
    original = bytes(binary)

    if g.get("images"):
        raise RuntimeError(
            "alchemical-puppet.glb already has embedded textures; run build_alchemical_puppet.mjs first"
        )

    def append_buf(data, target=None):
        binary.extend(b"\0" * ((-len(binary)) % 4))
        offset = len(binary)
        binary.extend(data)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target:
            view["target"] = target
        g["bufferViews"].append(view)
        return len(g["bufferViews"]) - 1

    def read_accessor(index, buf_bytes):
        acc = g["accessors"][index]
        view = g["bufferViews"][acc["bufferView"]]
        comp_dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "<u1"}[acc["componentType"]]
        comp_size = {5126: 4, 5125: 4, 5123: 2, 5121: 1}[acc["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
        offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = view.get("byteStride", width * comp_size)
        arr = np.ndarray(
            (acc["count"], width),
            dtype=comp_dtype,
            buffer=buf_bytes,
            offset=offset,
            strides=(stride, comp_size),
        ).copy()
        return arr[:, 0] if width == 1 else arr

    g["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    g["images"] = []
    g["textures"] = []
    tex_cache = {}

    for mat in g["materials"]:
        kind = material_category(mat.get("name", ""))
        if not kind:
            continue
        if kind not in tex_cache:
            pair = []
            for suffix, data in zip(["albedo", "normal"], make_pbr_maps(kind)):
                g["images"].append(
                    {
                        "name": f"{kind}_{suffix}",
                        "bufferView": append_buf(data),
                        "mimeType": "image/png",
                    }
                )
                g["textures"].append({"source": len(g["images"]) - 1, "sampler": 0})
                pair.append(len(g["textures"]) - 1)
            tex_cache[kind] = pair
        mat.setdefault("pbrMetallicRoughness", {})["baseColorTexture"] = {
            "index": tex_cache[kind][0]
        }
        mat["normalTexture"] = {
            "index": tex_cache[kind][1],
            "scale": CATEGORY_SPECS[kind][4],
        }

    total_tris = 0
    for mesh in g["meshes"]:
        for prim in mesh["primitives"]:
            pos = read_accessor(prim["attributes"]["POSITION"], original)
            nrm = read_accessor(prim["attributes"]["NORMAL"], original)
            lengths = np.linalg.norm(nrm, axis=1, keepdims=True)
            bad = (~np.isfinite(lengths[:, 0])) | (lengths[:, 0] < 1e-6)
            if np.any(bad):
                nrm[bad] = np.array([0.0, 1.0, 0.0], dtype=np.float32)
                lengths = np.linalg.norm(nrm, axis=1, keepdims=True)
            nrm = (nrm / lengths).astype("<f4")
            nrm_view = g["bufferViews"][g["accessors"][prim["attributes"]["NORMAL"]]["bufferView"]]
            nrm_off = nrm_view.get("byteOffset", 0) + g["accessors"][
                prim["attributes"]["NORMAL"]
            ].get("byteOffset", 0)
            if "byteStride" not in nrm_view or nrm_view["byteStride"] == 12:
                raw_bytes = nrm.tobytes()
                binary[nrm_off : nrm_off + len(raw_bytes)] = raw_bytes

            if "indices" in prim:
                total_tris += g["accessors"][prim["indices"]]["count"] // 3
            else:
                total_tris += len(pos) // 3

            kind = material_category(g["materials"][prim["material"]].get("name", ""))
            if not kind:
                continue
            axis = np.argmax(np.abs(nrm), axis=1)
            uv = np.stack((pos[:, 0], pos[:, 1]), axis=1)
            uv[axis == 0, 0] = pos[axis == 0, 2]
            uv[axis == 1, 1] = pos[axis == 1, 2]
            uv = (uv * CATEGORY_SPECS[kind][2]).astype("<f4")
            uv_view = append_buf(uv.tobytes(), 34962)
            g["accessors"].append(
                {
                    "bufferView": uv_view,
                    "componentType": 5126,
                    "count": len(uv),
                    "type": "VEC2",
                    "min": uv.min(axis=0).tolist(),
                    "max": uv.max(axis=0).tolist(),
                }
            )
            prim["attributes"]["TEXCOORD_0"] = len(g["accessors"]) - 1

    g["extras"] = {
        "title": "失败的炼金傀偶",
        "enemyId": "alchemicalPuppet",
        "tier": "overlord",
        "nonVoxel": True,
        "voxelBoxes": 0,
        "triangles": int(total_tris),
        "embeddedPbrMaps": len(g["images"]),
        "standOnCard": True,
        "cardScaleUnchanged": True,
        "source": "建模工具/build_alchemical_puppet.mjs + 建模工具/texture_alchemical_puppet.py",
    }

    PORTRAIT_SVG.parent.mkdir(parents=True, exist_ok=True)
    svg_text = render_alchemical_portrait_svg(g, bytes(binary), read_accessor)
    PORTRAIT_SVG.write_text(svg_text, encoding="utf-8", newline="\n")

    binary.extend(b"\0" * ((-len(binary)) % 4))
    g["buffers"][0]["byteLength"] = len(binary)
    js = json.dumps(g, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    js += b" " * ((-len(js)) % 4)
    glb_bytes = (
        struct.pack("<4sII", b"glTF", 2, 28 + len(js) + len(binary))
        + struct.pack("<I4s", len(js), b"JSON")
        + js
        + struct.pack("<I4s", len(binary), b"BIN\x00")
        + binary
    )
    ASSETS_GLB.write_bytes(glb_bytes)
    ATELIER_GLB.write_bytes(glb_bytes)
    print(
        f"alchemical-puppet.glb: {total_tris:,} tris, {len(g['meshes'])} meshes, "
        f"{len(g['images'])} embedded PBR maps, {len(g.get('animations', []))} clips, "
        f"{len(glb_bytes) / 1048576:.2f} MB; SVG={len(svg_text) // 1024} KB"
    )


if __name__ == "__main__":
    main()
