"""Build the Mother Tree and Ares sculptures using the live rigs and clips."""

import argparse
import json
import math
import random
import struct

import numpy as np

from build_overlord_models import hex_chamfer_poly
from sculpt_mesh import ASSETS, OUT_ROOT, OUT_OVERLORDS, SculptedModel

GLB_ARRAYS = ("nodes", "meshes", "materials", "accessors", "bufferViews")


def add_sculpts(filename, sculpts, assembly=None, prepare_rig=None, mirror=None):
    """Append indexed vertex-colored parts to named joints, keeping existing indices stable."""
    asset = ASSETS / filename
    data = asset.read_bytes()
    header_size = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20 : 20 + header_size])
    extras = doc.setdefault("extras", {})
    original = extras.get("sculptSource")
    if original:
        for key in GLB_ARRAYS:
            del doc[key][original[key] :]
        for node in doc["nodes"]:
            if "children" in node:
                node["children"] = [i for i in node["children"] if i < original["nodes"]]
    else:
        original = {
            **{key: len(doc[key]) for key in GLB_ARRAYS},
            "bytes": doc["buffers"][0]["byteLength"],
        }
    binary = bytearray(data[28 + header_size : 28 + header_size + original["bytes"]])
    if prepare_rig:
        prepare_rig(doc)
    nodes_by_name = {node.get("name"): node for node in doc["nodes"]}

    def accessor(values, dtype, kind, target):
        array = np.asarray(values, dtype=dtype)
        binary.extend(b"\0" * (-len(binary) % 4))
        doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": len(binary), "byteLength": array.nbytes, "target": target}
        )
        binary.extend(array.tobytes())
        entry = {
            "bufferView": len(doc["bufferViews"]) - 1,
            "componentType": 5126 if dtype == "<f4" else 5125,
            "count": len(array),
            "type": kind,
        }
        if kind == "VEC3":
            entry.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        doc["accessors"].append(entry)
        return len(doc["accessors"]) - 1

    for parent, sculpture in sculpts.items():
        joint = nodes_by_name[parent]
        for part in sculpture.parts.values():
            attrs = {
                "POSITION": accessor(part.positions, "<f4", "VEC3", 34962),
                "NORMAL": accessor(part.normals, "<f4", "VEC3", 34962),
                "COLOR_0": accessor(part.colors, "<f4", "VEC3", 34962),
            }
            indices = accessor(part.indices, "<u4", "SCALAR", 34963)
            material = {
                "name": part.name,
                "pbrMetallicRoughness": {
                    "metallicFactor": part.metallic,
                    "roughnessFactor": part.roughness,
                },
                "doubleSided": part.double_sided,
            }
            if part.emissive:
                material["emissiveFactor"] = part.emissive
            primitive = {
                "attributes": attrs,
                "indices": indices,
                "material": len(doc["materials"]),
            }
            doc["materials"].append(material)
            joint.setdefault("children", []).append(len(doc["nodes"]))
            doc["nodes"].append({"name": part.name, "mesh": len(doc["meshes"])})
            doc["meshes"].append({"name": part.name, "primitives": [primitive]})

    if mirror:
        source, target = (nodes_by_name[name] for name in mirror)
        for index in source["children"]:
            node = doc["nodes"][index]
            mesh = doc["meshes"][node["mesh"]]
            for primitive in mesh.get("primitives", []):
                mat_idx = primitive.get("material")
                if mat_idx is not None:
                    doc["materials"][mat_idx]["doubleSided"] = True
            target["children"].append(len(doc["nodes"]))
            doc["nodes"].append({"name": f"{node['name']}_Mirrored", "mesh": node["mesh"]})

    extras["sculptSource"] = original
    extras["nonVoxel"] = True
    if assembly:
        extras["battleAssembly"] = assembly
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
    for directory in (ASSETS, OUT_ROOT, OUT_OVERLORDS):
        (directory / filename).write_bytes(output)
    print(f"{filename}: added {sum(m.total_triangles() for m in sculpts.values())} triangles")


def slit_leaf(part, center, yaw, length, width, color):
    x, y, z = center
    points = [
        (-0.08, 0.0, 0),
        (0.28, 0.01, -0.40),
        (0.62, -0.035, -0.48),
        (1, -0.11, 0),
        (0.59, -0.06, 0.48),
        (0.26, 0.0, 0.40),
        (0.48, 0.11, 0),
    ]
    ca, sa = math.cos(yaw), math.sin(yaw)
    verts = [
        (x + u * length * ca - w * width * sa, y + v * length, z + u * length * sa + w * width * ca)
        for u, v, w in points
    ]
    part.append_mesh(verts, [[i, 6, (i + 1) % 6] for i in range(6)], color, smooth=False)


def foliage_cluster(part, rng, center, spread, count, palette):
    x, y, z = center
    sx, sy, sz = spread
    for i in range(count):
        angle = i * 2.39996 + rng.uniform(-0.2, 0.2)
        radius = math.sqrt((i + 0.5) / count)
        center_offset = (
            x + math.cos(angle) * radius * sx,
            y + math.sqrt(1 - radius * radius) * sy + rng.uniform(-0.13, 0.12),
            z + math.sin(angle) * radius * sz,
        )
        slit_leaf(
            part,
            center_offset,
            angle + rng.uniform(-0.7, 0.7),
            rng.uniform(0.24, 0.45),
            rng.uniform(0.13, 0.26),
            rng.choice(palette),
        )


def prepare_mother_tree_rig(doc):
    nodes = doc["nodes"]
    root = next(node for node in nodes if node.get("name") == "Entity_Root")

    def remove_old_sculpture(node):
        name = node.get("name", "")
        if name in ("Lunar_Eclipse_Ray", "Resonance_Halo"):
            return
        node.pop("mesh", None)
        if "children" not in node:
            return
        for index in node["children"]:
            remove_old_sculpture(nodes[index])
        node["children"] = [
            index
            for index in node["children"]
            if not nodes[index].get("name", "").startswith("Shoulder_Missile_Pod_")
        ]

    remove_old_sculpture(root)
    for side, anatomy, reflection in (("Left", 1, -1), ("Right", 2, 1)):
        root["children"].append(len(nodes))
        nodes.append(
            {
                "name": f"Moon_Tree_{side}",
                "extras": {"anatomyIndex": anatomy},
                "scale": [reflection, 1, 1],
                "children": [],
            }
        )


def mother_tree():
    rng = random.Random(2791)
    bark_color = "#8191ab"
    ridge_color = "#a4afc4"
    shade_color = "#5d6885"
    deep_bark = "#4b5570"
    vein_color = "#8ea9d4"
    vein_bright = "#b8d5ff"
    pearl_color = "#d6e5fa"
    leaf_colors = ("#536d92", "#7388ad", "#8da3bd", "#a4afc9", "#837ca7", "#b7bfd6", "#c4d1e6")

    trunk = SculptedModel("moon-trunk", "月痕母树树干")
    heartwood = trunk.part("Moon_Heartwood", metallic=0.02, roughness=0.83)
    growth = trunk.part("Moon_Heartwood_Ridges", metallic=0.04, roughness=0.74)
    veins = trunk.part("Moon_Heartwood_Veins", roughness=0.52, emissive=[0.025, 0.06, 0.13])
    trunk.lathe(
        heartwood,
        [
            (0.05, 0.65),
            (0.33, 0.59),
            (0.78, 0.46),
            (1.28, 0.37),
            (1.83, 0.43),
            (2.23, 0.51),
            (2.77, 0.44),
            (3.15, 0.38),
            (3.48, 0.26),
            (3.71, 0.065),
        ],
        center=(0, 0, -0.14),
        segs=32,
        color=bark_color,
    )
    for k in range(6):
        base_a = (k / 6.0) * math.tau + 0.3
        rib_pts = []
        for step in range(8):
            t = step / 7.0
            a = base_a + t * 0.72
            r = 0.78 - 0.36 * math.sin(t * math.pi * 0.7) - 0.14 * t
            rib_pts.append((math.cos(a) * r, 0.06 + t * 3.16, -0.14 + math.sin(a) * r * 0.78))
        trunk.tube(
            growth,
            rib_pts,
            [0.14, 0.12, 0.095, 0.08, 0.085, 0.075, 0.055, 0.022],
            segs=9,
            color=shade_color if k % 2 else deep_bark,
        )
        if k % 2 == 0:
            vein_pts = [(x * 1.04, y, z * 1.05 + 0.03) for x, y, z in rib_pts[1:7]]
            trunk.tube(
                veins,
                vein_pts,
                [0.012, 0.016, 0.014, 0.014, 0.011, 0.005],
                segs=6,
                color=vein_color,
            )

    for side in (-1, 1):

        def mirrored(points):
            return [(side * x, y, z) for x, y, z in points]

        fork = mirrored(
            [
                (0.81, 0.13, 0.69),
                (0.62, 0.61, 0.30),
                (0.46, 1.13, 0.23),
                (0.52, 1.81, 0.26),
                (0.60, 2.30, 0.22),
                (0.42, 2.69, 0.11),
                (0.57, 3.12, -0.05),
                (0.86, 3.63, 0.04),
                (1.28, 3.88, 0.05),
            ]
        )
        trunk.tube(
            growth,
            fork,
            [0.14, 0.25, 0.21, 0.16, 0.17, 0.20, 0.18, 0.11, 0.014],
            segs=15,
            color=ridge_color,
            flute_amp=0.12,
            flute_freq=6,
        )
        trunk.tube(
            growth,
            mirrored(
                [(0.27, 0.16, 0.39), (0.22, 0.74, 0.40), (0.26, 1.21, 0.37), (0.35, 1.68, 0.43)]
            ),
            [0.20, 0.13, 0.10, 0.04],
            segs=12,
            color=shade_color,
        )
        trunk.tube(
            veins,
            mirrored(
                [
                    (0.42, 0.27, 0.51),
                    (0.39, 0.65, 0.47),
                    (0.37, 1.07, 0.44),
                    (0.42, 1.42, 0.43),
                    (0.49, 1.63, 0.47),
                ]
            ),
            [0.011, 0.027, 0.018, 0.026, 0.006],
            segs=8,
            color=vein_color,
        )
        # Carved ocular brow & cheek heartwood framing Silver_Iris at (0, 2.14, 0.41)
        trunk.tube(
            growth,
            mirrored(
                [
                    (0.08, 2.86, 0.36),
                    (0.44, 2.74, 0.38),
                    (0.68, 2.38, 0.35),
                    (0.62, 1.82, 0.36),
                    (0.30, 1.48, 0.40),
                ]
            ),
            [0.075, 0.105, 0.115, 0.09, 0.04],
            segs=10,
            color=deep_bark,
            flute_amp=0.08,
            flute_freq=5,
        )
        trunk.tube(
            veins,
            mirrored(
                [(0.16, 2.82, 0.43), (0.48, 2.66, 0.44), (0.64, 2.26, 0.42), (0.46, 1.72, 0.43)]
            ),
            [0.009, 0.015, 0.014, 0.006],
            segs=6,
            color=vein_bright,
        )
        # Upper central crown boughs uniting left/right wings
        for bough_pts, bough_rads in (
            (
                [(0.18, 3.05, 0.02), (0.36, 3.65, 0.24), (0.68, 4.18, 0.46), (1.08, 4.34, 0.52)],
                [0.14, 0.11, 0.07, 0.018],
            ),
            (
                [(0.14, 3.22, -0.14), (0.32, 3.92, -0.06), (0.62, 4.44, 0.12), (0.98, 4.52, 0.22)],
                [0.12, 0.09, 0.055, 0.014],
            ),
        ):
            trunk.tube(growth, mirrored(bough_pts), bough_rads, segs=10, color=bark_color)
            trunk.tube(
                veins,
                mirrored([(x, y + 0.04, z + 0.03) for x, y, z in bough_pts[:-1]]),
                [0.014, 0.011, 0.005],
                segs=6,
                color=vein_color,
            )

    crown = trunk.part("Moon_Crown_Continuous_Canopy", roughness=0.82, double_sided=True)
    for x, y, z, sx, sy, sz, count in (
        (0.00, 4.38, 0.24, 0.91, 0.30, 0.59, 132),
        (0.00, 4.14, 0.73, 0.64, 0.23, 0.44, 82),
        (-0.67, 4.17, 0.10, 0.80, 0.27, 0.47, 98),
        (0.67, 4.17, 0.10, 0.80, 0.27, 0.47, 98),
        (-1.39, 3.85, 0.53, 0.71, 0.26, 0.52, 84),
        (1.39, 3.85, 0.53, 0.71, 0.26, 0.52, 84),
        (0.00, 4.66, 0.06, 0.82, 0.25, 0.48, 76),
        (-0.56, 4.46, 0.42, 0.68, 0.22, 0.44, 62),
        (0.56, 4.46, 0.42, 0.68, 0.22, 0.44, 62),
        (-1.18, 4.22, -0.08, 0.74, 0.24, 0.46, 68),
        (1.18, 4.22, -0.08, 0.74, 0.24, 0.46, 68),
        (-1.76, 3.98, 0.22, 0.72, 0.22, 0.44, 58),
        (1.76, 3.98, 0.22, 0.72, 0.22, 0.44, 58),
        (0.00, 3.92, -0.22, 0.76, 0.24, 0.42, 56),
    ):
        foliage_cluster(crown, rng, (x, y, z), (sx, sy, sz), count, leaf_colors)

    iris = SculptedModel("moon-iris", "月之魔眼虹膜")
    socket = iris.part("Moon_Iris_Carved_Socket", metallic=0.12, roughness=0.65)
    lens = iris.part(
        "Moon_Iris_Opal_Lens", metallic=0.08, roughness=0.28, emissive=[0.095, 0.19, 0.32]
    )
    pupil = iris.part("Moon_Iris_Void", roughness=0.46)
    iris.ellipsoid(socket, (0, 0, -0.02), (0.77, 0.78, 0.36), u_segs=31, v_segs=20, color="#58627b")
    iris.torus(
        socket,
        (0, 0, 0.218),
        0.62,
        0.112,
        u_segs=48,
        v_segs=10,
        rot=(math.pi / 2, 0, 0),
        color="#bdcadc",
    )
    iris.torus(
        socket,
        (0, 0, 0.279),
        0.538,
        0.041,
        u_segs=48,
        v_segs=9,
        rot=(math.pi / 2, 0, 0),
        color="#7a84ad",
    )
    for pi in range(12):
        pa = (pi / 12.0) * math.tau
        iris.tube(
            socket,
            [
                (0.57 * math.cos(pa), 0.57 * math.sin(pa), 0.24),
                (0.76 * math.cos(pa), 0.76 * math.sin(pa), 0.16),
                (0.84 * math.cos(pa), 0.84 * math.sin(pa), 0.04),
            ],
            [0.055, 0.048, 0.015],
            segs=7,
            color="#98a7c4" if pi % 2 else "#6c7694",
        )
    iris.ellipsoid(lens, (0, 0, 0.268), (0.515, 0.51, 0.146), u_segs=36, v_segs=20, color="#b5d3f1")
    iris.torus(
        lens,
        (0, 0, 0.352),
        0.31,
        0.018,
        u_segs=36,
        v_segs=7,
        rot=(math.pi / 2, 0, 0),
        color="#dff0ff",
    )
    iris.ellipsoid(
        pupil, (0, 0.015, 0.405), (0.074, 0.365, 0.031), u_segs=20, v_segs=16, color="#202137"
    )
    iris.ellipsoid(
        lens, (-0.17, 0.20, 0.402), (0.052, 0.075, 0.022), u_segs=12, v_segs=8, color="#e8f6ff"
    )
    iris.ellipsoid(
        lens, (0.14, -0.17, 0.398), (0.032, 0.042, 0.018), u_segs=10, v_segs=8, color="#cfe8ff"
    )
    for i in range(24):
        theta = math.tau * i / 24
        ca, sa = math.cos(theta), math.sin(theta)
        iris.tube(
            lens,
            [
                (0.47 * ca, 0.47 * sa, 0.330),
                (0.39 * ca, 0.39 * sa, 0.365),
                (0.31 * ca, 0.31 * sa, 0.387),
            ],
            [0.014, 0.009, 0.002],
            segs=7,
            color="#9dabe0" if i % 2 else "#d1e4ff",
        )

    wing = SculptedModel("moon-wing", "月痕母树镜像枝根")
    boughs = wing.part("Moon_Wing_Boughs", metallic=0.02, roughness=0.86, double_sided=True)
    twigs = wing.part("Moon_Wing_Twigs", metallic=0.02, roughness=0.77, double_sided=True)
    leaves = wing.part("Moon_Wing_Foliage", roughness=0.82, double_sided=True)
    seeds = wing.part(
        "Moon_Wing_Seed_Pearls", roughness=0.42, emissive=[0.04, 0.065, 0.14], double_sided=True
    )
    limbs = (
        (
            [
                (0.33, 2.56, -0.04),
                (0.97, 3.19, -0.20),
                (2.01, 3.56, -0.25),
                (3.11, 3.58, -0.17),
                (4.31, 3.45, 0.08),
            ],
            [0.35, 0.32, 0.24, 0.14, 0.023],
        ),
        (
            [
                (0.46, 2.81, 0.03),
                (1.07, 3.23, 0.30),
                (1.96, 3.35, 0.63),
                (2.94, 3.22, 0.92),
                (4.08, 3.11, 0.82),
            ],
            [0.24, 0.23, 0.18, 0.12, 0.018],
        ),
        (
            [
                (0.25, 3.04, -0.19),
                (0.76, 3.62, -0.30),
                (1.60, 3.98, -0.19),
                (2.56, 4.03, 0.05),
                (3.42, 3.93, 0.17),
            ],
            [0.24, 0.20, 0.14, 0.10, 0.012],
        ),
        (
            [
                (0.28, 3.28, -0.08),
                (0.88, 3.88, -0.18),
                (1.82, 4.26, -0.12),
                (2.88, 4.32, 0.06),
                (3.86, 4.12, 0.22),
            ],
            [0.26, 0.22, 0.16, 0.11, 0.016],
        ),
        (
            [
                (0.42, 2.68, -0.22),
                (1.18, 3.05, -0.38),
                (2.28, 3.28, -0.32),
                (3.48, 3.24, -0.12),
                (4.58, 3.04, 0.18),
            ],
            [0.28, 0.24, 0.18, 0.12, 0.018],
        ),
        (
            [
                (0.38, 2.18, 0.14),
                (1.02, 2.48, 0.36),
                (1.92, 2.62, 0.58),
                (2.86, 2.52, 0.72),
                (3.68, 2.34, 0.64),
            ],
            [0.22, 0.19, 0.14, 0.09, 0.014],
        ),
    )
    for idx, (path, radii) in enumerate(limbs):
        wing.tube(
            boughs, path, radii, segs=15, color=bark_color, flute_amp=0.11, flute_freq=7, twist=0.7
        )
        ridgeline = [(x, y + r * 0.61, z + r * 0.61) for (x, y, z), r in zip(path, radii)]
        wing.tube(twigs, ridgeline, [0.09, 0.10, 0.066, 0.039, 0.005], segs=10, color=ridge_color)
        for j, (x, y, z) in enumerate(path[1:], 1):
            for s in (-1, 1):
                spring = (
                    x + 0.33 + j * 0.05,
                    y + 0.04 + 0.045 * j,
                    z + s * (0.37 if idx % 3 == 2 else 0.54),
                )
                wing.tube(
                    twigs,
                    [(x, y, z), (x + 0.24, y + 0.07, z + s * 0.23), spring],
                    [0.070, 0.039, 0.009],
                    segs=9,
                    color=ridge_color,
                )
                foliage_cluster(
                    leaves,
                    rng,
                    (spring[0] - 0.18, spring[1] - 0.10, max(-0.55, spring[2])),
                    (0.58 - 0.055 * j, 0.15, 0.36),
                    24 - j,
                    leaf_colors,
                )
    for cx, cy, cz, sx, sy, sz, count in (
        (1.65, 3.82, 0.18, 0.76, 0.22, 0.52, 46),
        (2.48, 3.88, 0.32, 0.78, 0.23, 0.54, 48),
        (3.38, 3.66, 0.26, 0.74, 0.21, 0.48, 44),
        (4.15, 3.35, 0.38, 0.68, 0.20, 0.44, 38),
        (2.15, 2.95, 0.62, 0.66, 0.19, 0.44, 36),
        (3.15, 2.84, 0.74, 0.62, 0.18, 0.42, 34),
    ):
        foliage_cluster(leaves, rng, (cx, cy, cz), (sx, sy, sz), count, leaf_colors)

    for x, y, z, drop in (
        (2.08, 3.33, 0.75, 0.46),
        (3.31, 3.17, 0.91, 0.33),
        (1.42, 3.52, 0.46, 0.52),
        (2.58, 3.74, 0.28, 0.58),
        (3.64, 3.55, 0.36, 0.48),
        (4.24, 3.18, 0.26, 0.44),
        (2.38, 2.58, 0.76, 0.38),
        (3.26, 2.42, 0.78, 0.36),
    ):
        wing.tube(
            twigs,
            [(x, y, z), (x + 0.01, y - drop * 0.55, z + 0.05), (x + 0.04, y - drop, z + 0.08)],
            [0.056, 0.031, 0.024],
            segs=10,
            color=shade_color,
        )
        wing.ellipsoid(
            seeds,
            (x + 0.04, y - drop - 0.115, z + 0.08),
            (0.093, 0.147, 0.093),
            u_segs=13,
            v_segs=10,
            color=pearl_color,
        )

    roots = wing.part("Moon_Wing_Buttresses", roughness=0.87, metallic=0.02, double_sided=True)
    channels = wing.part(
        "Moon_Wing_Sap_Channels",
        roughness=0.53,
        emissive=[0.035, 0.075, 0.15],
        double_sided=True,
    )
    for idx, path in enumerate(
        (
            [
                (0.20, 1.25, 0.12),
                (0.84, 0.91, 0.45),
                (1.72, 0.49, 0.76),
                (2.81, 0.28, 0.96),
                (3.90, 0.14, 1.18),
                (4.42, 0.09, 1.48),
            ],
            [
                (0.27, 0.92, -0.32),
                (1.00, 0.69, -0.44),
                (2.06, 0.35, -0.61),
                (3.19, 0.20, -0.60),
                (4.18, 0.12, -0.41),
                (4.56, 0.10, -0.14),
            ],
            [
                (0.36, 0.72, 0.29),
                (0.92, 0.51, 0.74),
                (1.50, 0.27, 1.28),
                (1.98, 0.13, 1.56),
                (2.56, 0.11, 1.71),
                (2.90, 0.09, 1.54),
            ],
            [
                (0.24, 1.48, -0.12),
                (0.94, 1.06, -0.02),
                (1.88, 0.56, 0.16),
                (2.96, 0.26, 0.28),
                (3.92, 0.13, 0.38),
                (4.62, 0.08, 0.54),
            ],
            [
                (0.32, 1.12, -0.48),
                (1.04, 0.78, -0.72),
                (1.94, 0.42, -0.88),
                (2.86, 0.22, -0.84),
                (3.64, 0.12, -0.68),
                (4.18, 0.09, -0.46),
            ],
            [
                (0.28, 0.64, 0.54),
                (0.76, 0.46, 0.98),
                (1.24, 0.24, 1.38),
                (1.78, 0.12, 1.62),
                (2.24, 0.09, 1.48),
                (2.48, 0.07, 1.18),
            ],
        )
    ):
        widths = [0.28, 0.31, 0.24, 0.15, 0.085, 0.012]
        wing.tube(
            roots,
            path,
            widths,
            segs=16,
            color=bark_color if idx % 3 != 2 else shade_color,
            flute_amp=0.14,
            flute_freq=7,
            twist=0.6,
        )
        seam = [(x, y + r * 0.81 + 0.021, z + r * 0.44) for (x, y, z), r in zip(path, widths)]
        wing.tube(
            channels, seam, [0.010, 0.039, 0.024, 0.026, 0.011, 0.003], segs=9, color=vein_color
        )
        for j, (x, y, z) in enumerate(path[2:5], 2):
            s = 1 if (idx + j) % 2 else -1
            wing.tube(
                roots,
                [
                    (x, y, z),
                    (x + 0.37, max(0.08, y - 0.09), z + s * 0.21),
                    (x + 0.75 - j * 0.05, 0.075, z + s * 0.43),
                ],
                [0.11, 0.052, 0.008],
                segs=9,
                color=ridge_color,
            )
    # Gnarled root arches bridging the base of the trunk outward
    for bridge_pts, bridge_r in (
        (
            [(0.48, 0.88, 0.16), (0.88, 0.98, 0.24), (1.32, 0.62, 0.42), (1.56, 0.18, 0.56)],
            [0.16, 0.14, 0.11, 0.05],
        ),
        (
            [(0.52, 0.72, -0.24), (0.96, 0.86, -0.34), (1.42, 0.48, -0.46), (1.68, 0.14, -0.52)],
            [0.15, 0.13, 0.10, 0.04],
        ),
    ):
        wing.tube(
            roots, bridge_pts, bridge_r, segs=11, color=deep_bark, flute_amp=0.1, flute_freq=6
        )

    add_sculpts(
        "moon-eye.glb",
        {"Moon_Tree_Right": wing, "Living_Tree_Trunk": trunk, "Silver_Iris": iris},
        assembly={"parts": 3, "scale": 1.0},
        prepare_rig=prepare_mother_tree_rig,
        mirror=("Moon_Tree_Right", "Moon_Tree_Left"),
    )


def ares():
    def armor(model, part, center, dims, paint, tilt=(0, 0, 0)):
        x, y, z = dims
        model.bevel_plate(
            part,
            hex_chamfer_poly(x / 2, z / 2, min(x, z) * 0.22),
            y,
            min(y * 0.23, 0.055),
            center=center,
            rot=tilt,
            color=paint,
        )

    light, dark, gold = "#c2c3b9", "#495c70", "#bd8653"
    sculpts = {}
    head = SculptedModel("ares-helm", "阿瑞斯头盔")
    shell = head.part("Ares_Helmet_Laminated_Armor", metallic=0.39, roughness=0.4)
    optic = head.part("Ares_Command_Optic", emissive=[0.72, 0.21, 0.08])
    armor(head, shell, (0, 0.24, 0.066), (0.75, 0.18, 0.69), light, (-0.17, 0, 0))
    armor(head, shell, (0, 0.10, 0.32), (0.57, 0.058, 0.19), dark, (-0.22, 0, 0))
    armor(head, shell, (0, 0.333, 0.07), (0.18, 0.055, 0.41), dark, (-0.17, 0, 0))
    armor(head, optic, (0, 0.365, 0.22), (0.083, 0.022, 0.13), gold, (-0.17, 0, 0))
    for s in (-1, 1):
        armor(
            head,
            shell,
            (s * 0.29, -0.092, 0.29),
            (0.20, 0.21, 0.22),
            light,
            (0.16, s * 0.28, s * 0.24),
        )
        head.tube(
            optic,
            [(s * 0.08, 0.051, 0.347), (s * 0.21, 0.059, 0.349)],
            [0.021, 0.013],
            segs=9,
            color="#ffac6f",
        )
    sculpts["Optical_Head"] = head

    torso = SculptedModel("ares-turret", "阿瑞斯炮塔装甲")
    hull = torso.part("Ares_Turret_Ceramic_Plates", metallic=0.34, roughness=0.45)
    insets = torso.part("Ares_Reactor_and_Cable_Clamps", metallic=0.44, roughness=0.35)
    crystal = torso.part(
        "Ares_Reactor_Lens", metallic=0.15, roughness=0.28, emissive=[0.66, 0.22, 0.08]
    )
    for s in (-1, 1):
        armor(
            torso,
            hull,
            (s * 0.42, 0.30, 0.416),
            (0.63, 0.27, 0.32),
            light,
            (0.23, s * 0.25, s * 0.24),
        )
        armor(
            torso,
            hull,
            (s * 0.51, -0.21, 0.451),
            (0.32, 0.34, 0.2),
            dark,
            (0.12, s * 0.14, -s * 0.23),
        )
        for j in range(3):
            armor(
                torso,
                insets,
                (s * (0.31 + 0.111 * j), 0.36 + 0.03 * j, 0.57),
                (0.071, 0.029, 0.105),
                gold,
                (0.15, 0, s * 0.20),
            )
        torso.tube(
            insets,
            [(s * 0.66, -0.21, 0.25), (s * 0.53, -0.48, 0.43), (s * 0.37, -0.46, 0.51)],
            [0.074, 0.068, 0.061],
            segs=12,
            color=gold,
        )
        for j in range(4):
            armor(
                torso,
                insets,
                (s * 0.42, -0.09 + j * 0.145, -0.76),
                (0.27, 0.071, 0.15),
                light,
                (0.21, s * 0.16, 0),
            )
    torso.torus(
        insets,
        (0, -0.087, 0.557),
        0.18,
        0.034,
        u_segs=26,
        v_segs=10,
        rot=(math.pi / 2, 0, 0),
        color=gold,
    )
    torso.ellipsoid(
        crystal, (0, -0.087, 0.562), (0.139, 0.141, 0.058), u_segs=16, v_segs=12, color="#ffae6d"
    )
    sculpts["Torso_Turret"] = torso

    for s, side in ((-1, "L"), (1, "R")):
        arm = SculptedModel(f"ares-arm-{side}", "阿瑞斯臂甲")
        plates = arm.part(f"Ares_{side}_Pauldron_and_Gauntlet", metallic=0.35, roughness=0.43)
        armor(arm, plates, (s * 0.11, 0.36, 0.02), (0.84, 0.22, 0.83), light, (-0.11, 0, -s * 0.18))
        armor(arm, plates, (s * 0.36, 0.14, 0.045), (0.23, 0.36, 0.67), dark, (0.05, 0, -s * 0.26))
        armor(arm, plates, (s * 0.11, -0.49, 0.254), (0.38, 0.42, 0.16), light, (0.10, 0, s * 0.1))
        armor(arm, plates, (s * 0.06, 0.48, 0.08), (0.47, 0.069, 0.45), dark, (-0.11, 0, -s * 0.18))
        for j in range(3):
            armor(
                arm,
                plates,
                (s * (0.08 + j * 0.113), 0.53 - j * 0.023, 0.11),
                (0.061, 0.036, 0.29),
                gold,
                (-0.11, 0, -s * 0.18),
            )
        for z in (-0.20, 0.28):
            arm.ellipsoid(
                plates,
                (s * 0.34, 0.44 + 0.11 * z, z),
                (0.037, 0.025, 0.037),
                u_segs=10,
                v_segs=8,
                color="#273843",
            )
        sculpts[f"Heavy_Arm_{side}"] = arm

        leg = SculptedModel(f"ares-leg-{side}", "阿瑞斯腿甲")
        shins = leg.part(f"Ares_{side}_Greave_and_Piston", metallic=0.38, roughness=0.45)
        armor(leg, shins, (s * 0.12, -0.71, 0.35), (0.43, 0.22, 0.19), light, (-0.21, 0, -s * 0.06))
        armor(leg, shins, (s * 0.18, -1.06, 0.263), (0.34, 0.39, 0.14), dark, (-0.14, 0, 0))
        armor(leg, shins, (s * 0.18, -1.39, 0.48), (0.55, 0.14, 0.26), light)
        leg.tube(
            shins,
            [(s * 0.34, -0.78, 0.04), (s * 0.38, -1.14, 0.04), (s * 0.37, -1.34, 0.09)],
            [0.066, 0.052, 0.043],
            segs=10,
            color=gold,
        )
        sculpts[f"Hydraulic_Leg_{side}"] = leg
    add_sculpts("ares.glb", sculpts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", choices=("moon-tree", "ares", "all"), nargs="?", default="all")
    selection = parser.parse_args().model
    if selection in ("moon-tree", "all"):
        mother_tree()
    if selection in ("ares", "all"):
        ares()
