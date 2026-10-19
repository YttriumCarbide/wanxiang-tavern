"""Build three original voxel arenas and four creature studies; retain reusable card meshes."""

import copy
import json
import math
import random
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "万象酒馆-Demo/assets"
OUT = ROOT / "万象异境-体素模型"
FACES = [
    ([0, 3, 2, 1], [0, 0, -1]),
    ([4, 5, 6, 7], [0, 0, 1]),
    ([0, 4, 7, 3], [-1, 0, 0]),
    ([1, 2, 6, 5], [1, 0, 0]),
    ([0, 1, 5, 4], [0, -1, 0]),
    ([3, 7, 6, 2], [0, 1, 0]),
]


def linear(hex_color):
    values = [int(hex_color[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]


class Model:
    def __init__(self, name, cards=False):
        self.doc = {
            "asset": {"version": "2.0", "generator": "Wanxiang voxel atelier"},
            "scene": 0,
            "scenes": [{"nodes": []}],
            "nodes": [],
            "meshes": [],
            "materials": [],
            "buffers": [{"byteLength": 0}],
            "bufferViews": [],
            "accessors": [],
        }
        self.binary = bytearray()
        self.name = name
        self.groups = {}
        self.boxes = []
        if cards:
            self.cards()

    def buffer(self, content, target=None):
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        index = len(self.doc["bufferViews"])
        view = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(content)}
        if target:
            view["target"] = target
        self.doc["bufferViews"].append(view)
        self.binary.extend(content)
        return index

    def cards(self, include_floor=False):
        raw = (ASSETS / "battle.glb").read_bytes()
        length = struct.unpack_from("<I", raw, 12)[0]
        old = json.loads(raw[20 : 20 + length])
        source = raw[28 + length :]
        self.doc["materials"] = copy.deepcopy(old["materials"])
        views, accessors, meshes = {}, {}, {}

        def view(index):
            if index not in views:
                item = old["bufferViews"][index]
                start = item.get("byteOffset", 0)
                new_index = self.buffer(
                    source[start : start + item["byteLength"]], item.get("target")
                )
                if "byteStride" in item:
                    self.doc["bufferViews"][new_index]["byteStride"] = item["byteStride"]
                views[index] = new_index
            return views[index]

        def accessor(index):
            if index not in accessors:
                item = copy.deepcopy(old["accessors"][index])
                item["bufferView"] = view(item["bufferView"])
                accessors[index] = len(self.doc["accessors"])
                self.doc["accessors"].append(item)
            return accessors[index]

        def node(index):
            item = copy.deepcopy(old["nodes"][index])
            if "mesh" in item:
                mesh_index = item["mesh"]
                if mesh_index not in meshes:
                    mesh = copy.deepcopy(old["meshes"][mesh_index])
                    for primitive in mesh["primitives"]:
                        primitive["attributes"] = {
                            key: accessor(value) for key, value in primitive["attributes"].items()
                        }
                        if "indices" in primitive:
                            primitive["indices"] = accessor(primitive["indices"])
                    meshes[mesh_index] = len(self.doc["meshes"])
                    self.doc["meshes"].append(mesh)
                item["mesh"] = meshes[mesh_index]
            if "children" in item:
                item["children"] = [node(child) for child in item["children"]]
            new_index = len(self.doc["nodes"])
            self.doc["nodes"].append(item)
            return new_index

        active_roots = set(old["scenes"][old.get("scene", 0)]["nodes"])
        for index, item in enumerate(old["nodes"]):
            name = item.get("name", "")
            card = name.startswith("Placeholder_") and "Artwork" not in name
            floor = (
                include_floor
                and index in active_roots
                and (
                    name == "01_Continuous_Stone_Floor"
                    or name.startswith("24_Continuous_Outer_Floor_")
                    or name == "24_Outer_Floor_Mortar"
                    or name == "Decorated_Halves_With_Six_Grounded_Stone_Bases"
                )
            )
            if card or floor:
                self.doc["scenes"][0]["nodes"].append(node(index))
        for field in ["images", "textures", "samplers"]:
            if field in old:
                self.doc[field] = copy.deepcopy(old[field])
        for image in self.doc.get("images", []):
            if "bufferView" in image:
                image["bufferView"] = view(image["bufferView"])

    def box(self, x, y, z, w, h, d, color, group="Architecture", glow=False, pivot=None):
        if min(w, h, d) <= 0:
            return
        self.groups.setdefault((group, glow, pivot), []).append((x, y, z, w, h, d, color))
        self.boxes.append((x, y, z, w, h, d, color))

    def stroke(self, a, b, color, width=0.045, group="Inlay", glow=False):
        steps = max(1, math.ceil(max(abs(b[i] - a[i]) for i in range(3)) / width))
        for i in range(steps + 1):
            p = [a[j] + (b[j] - a[j]) * i / steps for j in range(3)]
            self.box(*p, width, width, width, color, group, glow)

    def ring(self, x, y, z, radius, color, width=0.05, group="Inlay", glow=False, pivot=None):
        for i in range(max(24, int(radius * 52))):
            angle = i * math.tau / max(24, int(radius * 52))
            self.box(
                x + math.cos(angle) * radius,
                y,
                z + math.sin(angle) * radius,
                width * 1.8,
                width,
                width * 1.8,
                color,
                group,
                glow,
                pivot,
            )

    def crystal(self, x, z, size, color, height=1.8):
        for i in range(16):
            t = i / 16
            radius = size * (0.42 + math.sin(t * math.pi) * 0.58) * (1 - t * 0.6)
            self.box(
                x - radius / 2 + t * size * 0.14,
                i * height / 16,
                z - radius / 2,
                radius,
                height / 16,
                radius,
                color if i % 3 else "b9eced",
                "Crystal_Facets",
            )
        self.box(
            x - size * 0.1,
            height * 0.3,
            z - size * 0.26,
            size * 0.07,
            height * 0.5,
            size * 0.03,
            "bffaf4",
            "Crystal_Heart",
            True,
        )

    def finish(self, filename, source="建模工具/build_realms.py", instances=(), metadata=None):
        counts = {}
        landscape_nodes = []
        for (group, glow, pivot), boxes in self.groups.items():
            positions, normals, colors, indices = [], [], [], []
            for x, y, z, w, h, d, color in boxes:
                corners = np.array(
                    [
                        [x, y, z],
                        [x + w, y, z],
                        [x + w, y + h, z],
                        [x, y + h, z],
                        [x, y, z + d],
                        [x + w, y, z + d],
                        [x + w, y + h, z + d],
                        [x, y + h, z + d],
                    ]
                )
                if pivot:
                    corners -= np.array(pivot)
                rgb = linear(color)
                for face, normal in FACES:
                    start = len(positions)
                    positions.extend(corners[face])
                    normals.extend([normal] * 4)
                    colors.extend([rgb] * 4)
                    indices.extend([start, start + 1, start + 2, start, start + 2, start + 3])

            def acc(values, dtype, kind, target):
                array = np.asarray(values, dtype=dtype)
                item = {
                    "bufferView": self.buffer(array.tobytes(), target),
                    "componentType": 5126 if dtype == "<f4" else 5125,
                    "count": len(array),
                    "type": kind,
                }
                if kind == "VEC3":
                    item.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
                index = len(self.doc["accessors"])
                self.doc["accessors"].append(item)
                return index

            attrs = {
                key: acc(values, "<f4", "VEC3", 34962)
                for key, values in [
                    ("POSITION", positions),
                    ("NORMAL", normals),
                    ("COLOR_0", colors),
                ]
            }
            idx = acc(indices, "<u4", "SCALAR", 34963)
            material = {
                "name": group,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1, 1, 1, 1],
                    "roughnessFactor": 0.78,
                    "metallicFactor": 0.12,
                },
            }
            if glow:
                radiance = np.mean([linear(box[-1]) for box in boxes], axis=0)
                material["emissiveFactor"] = (radiance * 0.42).tolist()
            mid = len(self.doc["materials"])
            self.doc["materials"].append(material)
            mesh = len(self.doc["meshes"])
            self.doc["meshes"].append(
                {
                    "name": group,
                    "primitives": [{"attributes": attrs, "indices": idx, "material": mid}],
                }
            )
            node = {"name": group, "mesh": mesh}
            if pivot:
                node["translation"] = list(pivot)
            nid = len(self.doc["nodes"])
            self.doc["nodes"].append(node)
            self.doc["scenes"][0]["nodes"].append(nid)
            if group.startswith("Landscape_"):
                landscape_nodes.append(node)
            counts[group] = len(boxes)
        for instance in instances:
            for original in landscape_nodes:
                node = {
                    "name": original["name"] + "__" + instance["name"],
                    "mesh": original["mesh"],
                    "scale": instance.get("scale", [1, 1, 1]),
                    "translation": instance.get("translation", [0, 0, 0]),
                }
                self.doc["scenes"][0]["nodes"].append(len(self.doc["nodes"]))
                self.doc["nodes"].append(node)
        self.doc["extras"] = {
            "title": self.name,
            "voxelBoxes": len(self.boxes),
            "components": counts,
            "source": source,
            "cardScaleUnchanged": True,
            **(metadata or {}),
        }
        self.doc["buffers"][0]["byteLength"] = len(self.binary)
        head = json.dumps(self.doc, separators=(",", ":"), ensure_ascii=True).encode()
        head += b" " * (-len(head) % 4)
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        output = (
            struct.pack("<III", 0x46546C67, 2, 28 + len(head) + len(self.binary))
            + struct.pack("<II", len(head), 0x4E4F534A)
            + head
            + struct.pack("<II", len(self.binary), 0x004E4942)
            + self.binary
        )
        OUT.mkdir(exist_ok=True)
        (OUT / filename).write_bytes(output)
        (ASSETS / filename).write_bytes(output)
        print(self.name, len(self.boxes), "voxel boxes", len(output), "bytes")
        return counts


def foundation(model, theme, rng):
    palettes = {
        "frost": ["263e53", "4b6577", "5b8291", "b4d8d9", "82cbdc"],
        "forge": ["272e37", "574c47", "736451", "b7a274", "e7a653"],
        "tide": ["253f51", "496a72", "648b8f", "c8b88b", "7ad4d5"],
    }
    dark, enemy, friendly, metal, glow = palettes[theme]
    model.box(-24, -0.5, -18, 48, 0.48, 36, dark, "Bedrock")
    model.box(-6.45, 0, -5.45, 12.9, 0.1, 5.45, enemy, "Enemy_Floor")
    model.box(-6.45, 0, 0, 12.9, 0.1, 5.45, friendly, "Friendly_Floor")
    for _ in range(800):
        x, z = rng.uniform(-15, 15), rng.uniform(-11, 11)
        if abs(x) < 6.35 and abs(z) < 5.35:
            if (
                min(abs(x - pos) for pos in [-3.014, 0, 3.014]) < 1.1
                and min(abs(z - pos) for pos in [-2.345, 2.345]) < 1.6
            ):
                continue
            model.box(
                x,
                0.1,
                z,
                rng.uniform(0.04, 0.24),
                0.017,
                rng.uniform(0.025, 0.08),
                rng.choice([dark, enemy, friendly]),
                "Floor_Wear",
            )
        else:
            model.box(
                x,
                -0.025,
                z,
                rng.uniform(0.18, 0.6),
                rng.uniform(0.03, 0.14),
                rng.uniform(0.16, 0.6),
                rng.choice([enemy, friendly, dark]),
                "Outer_Rubble",
            )
    for radius in [1.12, 3.92, 4.04]:
        for i in range(96):
            a = i * math.tau / 96
            if i % 13 in [0, 1]:
                continue
            model.box(
                math.cos(a) * radius,
                0.115,
                math.sin(a) * radius,
                0.075,
                0.025,
                0.065,
                metal if radius < 4 else dark,
                "Broken_Celestial_Relief",
            )
    for i in range(8):
        angle = i * math.tau / 8
        model.stroke(
            (math.cos(angle) * 0.24, 0.12, math.sin(angle) * 0.24),
            (math.cos(angle) * 0.72, 0.12, math.sin(angle) * 0.72),
            metal,
            0.035,
        )
    for z in [-2.345, 2.345]:
        for x in [-3.014, 0, 3.014]:
            model.box(x - 1.12, 0.1, z - 1.54, 2.24, 0.1, 3.08, dark, "Six_Grounded_Foundations")
            model.box(
                x - 1.05,
                0.2,
                z - 1.47,
                2.1,
                0.06,
                2.94,
                enemy if z < 0 else friendly,
                "Six_Grounded_Foundations",
            )
            model.ring(x, 0.265, z, 0.52, metal, 0.035, "Revealed_Dais_Engraving")
            for sx in [-1, 1]:
                for sz in [-1, 1]:
                    model.box(
                        x + sx * 0.93 - 0.1,
                        0.26,
                        z + sz * 1.35,
                        0.24,
                        0.035,
                        0.045,
                        glow,
                        "Dais_Corner_Inlay",
                        True,
                    )
    for side in [-1, 1]:
        for z in np.arange(-7.5, 7.6, 0.6):
            model.box(side * 6.65 - 0.16, 0, z, 0.32, 0.22, 0.52, dark, "Border_Coping")
            model.box(side * 6.65 - 0.12, 0.22, z, 0.24, 0.05, 0.12, metal, "Border_Rivets")
    return dark, enemy, friendly, metal, glow


def floor_details(model, theme, rng):
    """Handcrafted edge motifs keep the six card windows free of visual noise."""
    b = model.box
    palettes = {
        "frost": ("86afbd", "547c91", "b2cbd1"),
        "forge": ("a68a60", "332f30", "65534a"),
        "tide": ("91b8af", "3c6876", "b4b18d"),
    }
    ink, dark, light = palettes[theme]
    for side in [-1, 1]:
        for z in np.arange(-5.1, 5.2, 0.22):
            if rng.random() < 0.17:
                continue
            b(side * 6.16, 0.112, z, 0.035, 0.018, 0.14, dark, "Worn_Edge_Fillet")
        for zz in [-4.7, 0, 4.7]:
            x = side * 5.5
            if theme == "frost":
                # A wandering vein with short forks, rather than a repeated starburst.
                phase = rng.uniform(-1.0, 1.0)
                vein = [
                    (side * (6.2 - t * 1.12), 0.122, zz + math.sin(t * 5 + phase) * 0.13 + t * 0.16)
                    for t in np.linspace(0, 1, 30)
                ]
                for start, end in zip(vein, vein[1:]):
                    model.stroke(start, end, ink, 0.021, "Forked_Frost_Veins")
                for j in [7, 15, 23]:
                    start = vein[j]
                    branch = (
                        start[0] - side * rng.uniform(0.1, 0.22),
                        0.122,
                        start[2] + (1 if j % 2 else -1) * rng.uniform(0.14, 0.23),
                    )
                    model.stroke(start, branch, ink, 0.018, "Forked_Frost_Veins")
                for j in range(9):
                    xx = side * (6.01 + rng.uniform(-0.13, 0.14))
                    z = zz + rng.uniform(-0.32, 0.28)
                    b(
                        xx,
                        0.12,
                        z,
                        rng.uniform(0.06, 0.13),
                        rng.uniform(0.012, 0.028),
                        rng.uniform(0.05, 0.14),
                        light if j % 4 else ink,
                        "Windblown_Snow",
                    )
                for j in range(5):
                    b(
                        x + rng.uniform(-0.24, 0.24),
                        0.13,
                        zz + rng.uniform(-0.32, 0.32),
                        0.05,
                        0.08 + j * 0.022,
                        0.05,
                        ink,
                        "Fallen_Crystal_Needles",
                    )
            elif theme == "forge":
                # A scorched, asymmetric access plate with rivets and small brass offcuts.
                for j in range(15):
                    b(
                        x + rng.uniform(-0.35, 0.4),
                        0.114,
                        zz + rng.uniform(-0.45, 0.42),
                        rng.uniform(0.09, 0.28),
                        0.015,
                        rng.uniform(0.04, 0.18),
                        dark,
                        "Scorched_Workshop_Floor",
                    )
                b(x - 0.24, 0.132, zz - 0.28, 0.48, 0.035, 0.56, "42464a", "Access_Plates")
                for row in range(4):
                    b(
                        x - 0.17,
                        0.168,
                        zz - 0.2 + row * 0.12,
                        0.34,
                        0.012,
                        0.045,
                        "222a30",
                        "Access_Plate_Slits",
                    )
                for xx in [-0.21, 0.18]:
                    for dz in [-0.24, 0.2]:
                        b(x + xx, 0.17, zz + dz, 0.035, 0.025, 0.035, ink, "Brass_Bolts")
                for j in range(7):
                    b(
                        x - side * (0.35 + rng.random() * 0.25),
                        0.12,
                        zz + rng.uniform(-0.4, 0.4),
                        0.06,
                        0.03,
                        0.09,
                        ink,
                        "Metal_Offcuts",
                    )
            else:
                # Broken wave mosaic with shell-like rings, rather than a floor grid.
                for j in range(34):
                    z = zz - 0.62 + j * 0.037
                    xx = x + math.sin(j * 0.19) * 0.28
                    if j % 9 != 0:
                        b(xx, 0.12, z, 0.055, 0.018, 0.04, ink, "Eroded_Wave_Mosaic")
                        b(
                            xx + side * 0.09,
                            0.12,
                            z + 0.05,
                            0.035,
                            0.018,
                            0.04,
                            dark,
                            "Eroded_Wave_Mosaic",
                        )
                model.ring(x - side * 0.2, 0.125, zz + 0.15, 0.17, light, 0.018, "Shell_Inlay")
                for j in range(8):
                    xx = side * (5.92 + rng.uniform(-0.12, 0.16))
                    z = zz + rng.uniform(-0.35, 0.35)
                    b(
                        xx,
                        0.12,
                        z,
                        0.035,
                        rng.uniform(0.04, 0.11),
                        0.05,
                        light if j % 3 else ink,
                        "Coral_Fragments",
                    )


def frost(model, rng):
    for side in [-1, 1]:
        for j, z in enumerate(np.arange(-7, 7.1, 1.65)):
            # Keep a clear, full-width rolling lane around x=+/-8.25.
            for k in range(4):
                x = side * ((6.98 if k % 2 == 0 else 9.5) + rng.uniform(-0.08, 0.08))
                model.crystal(
                    x,
                    z + rng.uniform(-0.5, 0.5),
                    rng.uniform(0.3, 0.64),
                    rng.choice(["689fb7", "73b9cf", "8ac4d1"]),
                    rng.uniform(0.65, 2.1),
                )
            model.box(
                side * 9.5 - 0.12, 0, z - 0.6, 0.24, 2.6, 0.24, "755c4a", "Mine_Timber_Braces"
            )
            model.box(
                side * 8.15 - 1.4, 2.38, z - 0.6, 2.8, 0.2, 0.24, "9d8260", "Mine_Timber_Braces"
            )
        for z in np.arange(-8, 8, 0.45):
            model.box(side * 8.25 - 0.65, 0.05, z, 1.3, 0.07, 0.15, "79644e", "Mine_Sleepers")
        for dx in [-0.45, 0.45]:
            model.box(side * 8.25 + dx, 0.12, -8, 0.055, 0.1, 16, "8aa8b0", "Ore_Rail")
        for z in [-3.6, 3.6]:
            x = side * 8.25
            pivot = (x, 0.0, z)
            cart = f"Motion_Minecart_{side}_{z}"
            model.box(x - 0.45, 0.2, z - 0.6, 0.9, 0.42, 1.2, "384c5c", cart, pivot=pivot)
            for zz in [-0.45, 0.45]:
                model.box(x - 0.54, 0.04, z + zz, 1.08, 0.23, 0.18, "253542", cart, pivot=pivot)
            for i in range(5):
                model.box(
                    x - 0.35 + i * 0.14,
                    0.62,
                    z - 0.32,
                    0.13,
                    0.12 + (i % 3) * 0.08,
                    0.5,
                    "9bd9de",
                    cart,
                    pivot=pivot,
                )
    for x in np.arange(-5.5, 5.6, 1.0):
        model.box(x, 0.0, -6.5, 0.85, 0.35 + abs(x) * 0.16, 0.75, "476679", "Back_Glacier_Ledge")
        model.box(x, 0.35 + abs(x) * 0.16, -6.5, 0.85, 0.12, 0.75, "c4d9db", "Snow_Caps")
    for side in [-1, 1]:
        for z in [-5.7, -0.5, 4.8]:
            x = side * 6.95
            model.box(x, 0.2, z, 0.12, 0.75, 0.12, "574735", "Mine_Lamps")
            model.box(x - 0.12, 0.85, z - 0.12, 0.36, 0.35, 0.36, "d5d6ad", "Lamp_Cages")
            model.box(x - 0.05, 0.93, z - 0.14, 0.22, 0.17, 0.4, "8ff0e2", "Lamp_Hearts", True)


def forge(model, rng):
    for side in [-1, 1]:
        for j, z in enumerate([-6.2, -2.0, 2.5, 6.1]):
            x = side * 8.1
            model.box(x - 1.1, 0, z - 0.9, 2.2, 0.3, 1.8, "272b30", "Furnace_Plinths")
            for layer in range(5):
                model.box(
                    x - 0.8 + layer * 0.07,
                    0.3 + layer * 0.25,
                    z - 0.75,
                    1.6 - layer * 0.14,
                    0.24,
                    1.5,
                    rng.choice(["52473f", "65554b"]),
                    "Furnace_Masonry",
                )
            model.box(x - 0.35, 0.42, z + 0.755, 0.7, 0.54, 0.04, "eeb969", "Furnace_Fire", True)
            for bar in range(5):
                model.box(
                    x - 0.35 + bar * 0.15,
                    0.4,
                    z + 0.81,
                    0.055,
                    0.62,
                    0.06,
                    "28323b",
                    "Furnace_Grille",
                )
            model.box(x - 0.27, 1.55, z - 0.27, 0.54, 0.85, 0.54, "39393b", "Furnace_Chimneys")
            for step in range(7):
                model.box(
                    x - side * 1.4,
                    1.4 + step * 0.13,
                    z,
                    0.08,
                    0.08,
                    0.08,
                    "bd9364",
                    "Suspended_Chains",
                )
        for z in np.arange(-8, 8, 0.4):
            model.box(
                side * 7.0 - 0.18,
                -0.01,
                z,
                0.36,
                0.07,
                0.37,
                rng.choice(["c45f35", "eaa958", "efc27c"]),
                "Molten_Runoff",
                True,
            )
        for z in [-4.0, 0.4, 4.7]:
            x = side * 7.5
            model.box(x - 0.35, 0.1, z - 0.3, 0.7, 0.4, 0.6, "354049", "Anvil_Stands")
            model.box(x - 0.5, 0.5, z - 0.25, 1.0, 0.2, 0.5, "92a0a2", "Anvil_Faces")
            pivot = (x, 0.8, z)
            model.box(
                x - 0.2,
                0.8,
                z - 0.2,
                0.4,
                0.3,
                0.4,
                "b79b70",
                f"Motion_Piston_{side}_{z}",
                pivot=pivot,
            )
        pivot = (side * 8.5, 0.4, 0)
        for radius in [0.4, 0.72]:
            model.ring(*pivot, radius, "b58e5b", 0.085, f"Motion_Gear_{side}", pivot=pivot)
        for i in range(12):
            a = i * math.tau / 12
            model.box(
                pivot[0] + math.cos(a) * 0.8,
                pivot[1],
                math.sin(a) * 0.8,
                0.16,
                0.12,
                0.16,
                "c4a36d",
                f"Motion_Gear_{side}",
                pivot=pivot,
            )
    for x in np.arange(-5.8, 5.9, 0.9):
        model.box(x, 0, -6.6, 0.78, 1.1, 0.6, "443b37", "Foundry_Backwall")
        model.box(x + 0.14, 0.18, -6.2, 0.5, 0.08, 0.2, "d39d5e", "Copper_Pipework")


def tide(model, rng):
    for side in [-1, 1]:
        model.box(side * 8.3 - 1.35, -0.03, -8, 2.7, 0.05, 16, "214c63", "Tidal_Channels")
        for i in range(32):
            z = rng.uniform(-8, 8)
            model.box(
                side * 8.3 + rng.uniform(-1.1, 1),
                0.025,
                z,
                rng.uniform(0.15, 0.55),
                0.012,
                0.035,
                "69a5ad",
                "Water_Glints",
            )
        for j, z in enumerate([-6.1, -2.2, 2.1, 6]):
            x = side * 7.45
            for layer in range(5):
                width = 0.7 - abs(layer - 2) * 0.12
                model.box(
                    x - width / 2,
                    layer * 0.24,
                    z - width / 2,
                    width,
                    0.24,
                    width,
                    "66898b",
                    "Tide_Columns",
                )
            model.box(x - 0.4, 1.2, z - 0.4, 0.8, 0.14, 0.8, "c3b48b", "Column_Capitals")
            model.box(x - 0.12, 1.35, z - 0.12, 0.24, 0.36, 0.24, "9be6df", "Astral_Lamps", True)
            if j % 2 == 0:
                pivot = (x, 1.6, z)
                model.ring(*pivot, 0.75, "d2b778", 0.05, f"Motion_Orbit_{side}_{j}", pivot=pivot)
                for i in range(5):
                    angle = i * math.tau / 5
                    model.box(
                        x + math.cos(angle) * 0.8,
                        1.58,
                        z + math.sin(angle) * 0.8,
                        0.09,
                        0.09,
                        0.09,
                        "c2ffff",
                        f"Motion_Orbit_{side}_{j}",
                        True,
                        pivot,
                    )
        for z in [-4.3, 0, 4.3]:
            x = side * 6.9
            for branch in range(7):
                xx = x + rng.uniform(-0.3, 0.3)
                zz = z + rng.uniform(-0.3, 0.3)
                model.box(
                    xx,
                    0.05,
                    zz,
                    0.07,
                    rng.uniform(0.18, 0.55),
                    0.07,
                    rng.choice(["88afa3", "73999c", "c9b697"]),
                    "Calcified_Coral",
                )
    for x in [-4.8, 0, 4.8]:
        model.box(x - 0.5, 0, -6.2, 1, 0.3, 1, "54747e", "Orrery_Dais")
        for layer in range(4):
            model.box(
                x - 0.35 + layer * 0.04,
                0.3 + layer * 0.23,
                -6.4,
                0.7 - layer * 0.08,
                0.23,
                0.6,
                "92aaa1",
                "Orrery_Piers",
            )
        model.ring(x, 1.25, -6.1, 0.72, "d4bd89", 0.055, "Celestial_Compass")
        model.box(x - 0.14, 1.25, -6.24, 0.28, 0.28, 0.28, "9fe8db", "Celestial_Core", True)


def creature(model, kind):
    b = model.box
    if kind == "crystal-beetle":
        for i in range(7):
            t = i / 7
            w = 1.2 * (1 - abs(t - 0.5))
            b(
                -w / 2,
                0.5 + i * 0.09,
                -0.65,
                w,
                0.1,
                1.2,
                ["456879", "6593a4", "80b6bf"][i % 3],
                "Segmented_Carapace",
            )
        for side in [-1, 1]:
            for z in [-0.42, 0, 0.42]:
                b(side * 0.65 - 0.06, 0.22, z, 0.12, 0.35, 0.12, "334c5f", "Six_Jointed_Legs")
                b(side * 0.8 - 0.12, 0.15, z + 0.05, 0.24, 0.12, 0.12, "7c9da7", "Six_Jointed_Legs")
        for x in [-0.35, 0, 0.35]:
            for j in range(6):
                b(
                    x - 0.07,
                    1.0 + j * 0.075,
                    -0.2,
                    0.14 - j * 0.014,
                    0.08,
                    0.18,
                    "b9e9eb",
                    "Crystal_Spines",
                    True,
                )
        b(-0.34, 0.48, 0.6, 0.68, 0.33, 0.24, "263b4d", "Head")
        for x in [-0.23, 0.14]:
            b(x, 0.65, 0.85, 0.09, 0.065, 0.04, "e9fcbd", "Eyes", True)
    elif kind == "cinder-imp":
        b(-0.42, 0.45, -0.3, 0.84, 0.72, 0.6, "5b514b", "Furnace_Body")
        for x in [-0.27, 0.1]:
            b(x, 0.1, -0.16, 0.18, 0.38, 0.34, "3a4248", "Iron_Feet")
            b(x - 0.06, 0.08, 0.1, 0.3, 0.15, 0.3, "856d55", "Iron_Feet")
        b(-0.27, 0.62, 0.31, 0.54, 0.36, 0.04, "edab60", "Ember_Core", True)
        for x in [-0.23, -0.08, 0.07, 0.22]:
            b(x, 0.6, 0.36, 0.045, 0.4, 0.04, "2b3039", "Grille")
        b(-0.32, 1.18, -0.25, 0.64, 0.4, 0.5, "a68969", "Mask")
        for x in [-0.22, 0.1]:
            b(x, 1.35, 0.26, 0.12, 0.05, 0.04, "fcddb0", "Eyes", True)
        for side in [-1, 1]:
            b(side * 0.62 - 0.1, 0.55, -0.05, 0.2, 0.5, 0.24, "655c54", "Riveted_Arms")
        for i in range(5):
            b(
                -0.25 + i * 0.1,
                1.58,
                -0.15,
                0.08,
                0.16 + (i % 3) * 0.09,
                0.2,
                "e6a364",
                "Crown_Flame",
                True,
            )
    elif kind == "tide-jelly":
        for i in range(6):
            w = 1.6 - i * 0.17
            b(
                -w / 2,
                1.0 + i * 0.1,
                -w / 2,
                w,
                0.1,
                w,
                ["548f9d", "78bbc0", "a1d9d5"][i % 3],
                "Luminous_Bell",
            )
        for side in [-1, 1]:
            b(side * 0.3 - 0.05, 1.15, 0.79, 0.1, 0.06, 0.04, "e5f9d7", "Eyes", True)
        for i in range(9):
            a = i * math.tau / 9
            for j in range(9):
                x = math.cos(a) * (0.5 + math.sin(j * 0.5) * 0.1)
                z = math.sin(a) * 0.5
                b(
                    x,
                    0.12 + j * 0.1,
                    z,
                    0.055,
                    0.09,
                    0.055,
                    "94d0c4" if j % 3 else "d2d9ad",
                    "Trailing_Ribbons",
                    j % 3 == 0,
                )
        b(-0.15, 0.9, -0.15, 0.3, 0.3, 0.3, "e0f6d5", "Lantern_Heart", True)
    else:
        for j in range(8):
            w = 0.8 + math.sin(j / 8 * math.pi) * 1.5
            b(
                -w / 2,
                0.3 + j * 0.2,
                -0.5,
                w,
                0.19,
                1,
                ["476c78", "638c92", "a29371"][j % 3],
                "Astral_Armor",
            )
        b(-0.45, 1.9, -0.3, 0.9, 0.68, 0.65, "b7ad8a", "Lantern_Mask")
        for x in [-0.3, 0.13]:
            b(x, 2.24, 0.36, 0.17, 0.07, 0.05, "cffff0", "Eyes", True)
        for i in range(44):
            a = i * math.tau / 44
            b(
                math.cos(a) * 1.2 - 0.06,
                2.2 + math.sin(a) * 1.2,
                -0.45,
                0.12,
                0.12,
                0.12,
                "d4b87f",
                "Astral_Halo",
            )
        for side in [-1, 1]:
            for j in range(5):
                b(
                    side * (0.92 + j * 0.14) - 0.15,
                    1.5 - j * 0.1,
                    0,
                    0.3,
                    0.3,
                    0.4,
                    "758e8a",
                    "Articulated_Arms",
                )
            x = side * 1.65
            b(x - 0.2, 0.7, -0.12, 0.4, 0.5, 0.4, "d5bd8a", "Tidal_Lantern")
            b(x - 0.1, 0.78, 0.3, 0.2, 0.3, 0.05, "bcfff0", "Tidal_Flame", True)
        for x in [-0.55, 0.3]:
            b(x, 0, -0.35, 0.25, 0.35, 0.65, "3e5d6a", "Pedestal_Feet")
        for j in range(6):
            b(-0.7 + j * 0.24, 0.48, 0.52, 0.1, 0.1, 0.1, "c9c092", "Chest_Stars")

    if kind == "crystal-beetle":
        for z in np.arange(-0.56, 0.58, 0.11):
            b(-0.016, 1.05, z, 0.032, 0.018, 0.065, "264e64", "Carapace_Seam")
        for side in [-1, 1]:
            for z in [-0.42, 0, 0.42]:
                b(
                    side * 0.65 - 0.065,
                    0.47,
                    z - 0.015,
                    0.13,
                    0.095,
                    0.15,
                    "a5cbd0",
                    "Armored_Knees",
                )
            b(side * 0.2 - 0.04, 0.42, 0.86, 0.08, 0.08, 0.2, "77aab8", "Split_Mandibles")
            b(side * 0.15 - 0.04, 0.42, 1.01, 0.08, 0.08, 0.08, "a9d4d8", "Split_Mandibles")
            for j in range(6):
                b(
                    side * 0.46,
                    0.83 + (j % 2) * 0.05,
                    -0.54 + j * 0.17,
                    0.045,
                    0.035,
                    0.06,
                    "b7dad4",
                    "Shell_Rivets",
                )
    elif kind == "cinder-imp":
        for row in range(4):
            for col in range(5):
                xx = -0.4 + col * 0.16 + (row % 2) * 0.035
                if 0.6 < 0.47 + row * 0.16 < 1.02 and 0 < col < 4:
                    continue
                b(
                    xx,
                    0.47 + row * 0.16,
                    0.302,
                    0.14,
                    0.13,
                    0.022,
                    ["76604b", "524942", "8d7050"][(row + col) % 3],
                    "Individual_Firebricks",
                )
        for side in [-1, 1]:
            for yy in [0.64, 0.94]:
                b(side * 0.62 - 0.04, yy, 0.194, 0.08, 0.08, 0.025, "b8a080", "Arm_Rivets")
            b(side * 0.6 - 0.13, 0.48, 0.18, 0.26, 0.05, 0.08, "3e4449", "Wrist_Bands")
            b(side * 0.21 - 0.02, 1.34, 0.3, 0.05, 0.09, 0.025, "ffe0a4", "Eye_Hotspots", True)
        for xx in [-0.11, -0.01, 0.09]:
            b(xx, 1.22, 0.256, 0.045, 0.04, 0.028, "4a4140", "Mask_Vents")
        for j in range(7):
            b(
                -0.22 + j * 0.065,
                0.67 + j % 2 * 0.09,
                0.355,
                0.045,
                0.05,
                0.02,
                "ffcf76",
                "Core_Sparks",
                True,
            )
        b(-0.1, 1.72, -0.14, 0.08, 0.21, 0.1, "f8d994", "Inner_Flame", True)
    elif kind == "tide-jelly":
        for side in [-1, 1]:
            for j in range(8):
                b(
                    -0.7 + j * 0.18,
                    1.03,
                    side * 0.78,
                    0.045,
                    0.07,
                    0.035,
                    "bedbd1",
                    "Bell_Edge_Pearls",
                    j % 3 == 0,
                )
                b(
                    side * 0.78,
                    1.03,
                    -0.7 + j * 0.18,
                    0.035,
                    0.07,
                    0.045,
                    "bedbd1",
                    "Bell_Edge_Pearls",
                    j % 3 == 0,
                )
        for j in range(5):
            b(
                -0.05,
                1.61 + j * 0.035,
                -0.05,
                0.1,
                0.035,
                0.1,
                "b2eee0" if j % 2 else "dae6b8",
                "Bell_Crown",
                True,
            )
    else:
        for side in [-1, 1]:
            for row in range(6):
                yy = 0.5 + row * 0.2
                for col in range(3):
                    xx = side * (0.25 + col * 0.23) - 0.09
                    b(
                        xx,
                        yy,
                        0.503,
                        0.18,
                        0.11,
                        0.022,
                        ["7b9c9e", "92aaa3", "4c7781"][(row + col) % 3],
                        "Inlaid_Armor_Tiles",
                    )
            for j in range(4):
                b(
                    side * 0.32,
                    2.03 + j * 0.11,
                    0.355,
                    0.035,
                    0.07,
                    0.025,
                    "8d896e",
                    "Weathered_Mask_Grooves",
                )
            x = side * 1.65
            for dx in [-0.15, 0.12]:
                b(x + dx, 0.73, 0.294, 0.035, 0.4, 0.04, "796e51", "Lantern_Guards")
            b(x - 0.23, 0.69, 0.26, 0.46, 0.06, 0.1, "a59365", "Lantern_Rims")
            b(x - 0.23, 1.12, 0.26, 0.46, 0.06, 0.1, "a59365", "Lantern_Rims")
        for j in range(4):
            width = 0.36 - abs(j - 1.5) * 0.1
            b(
                -width / 2,
                1.0 + j * 0.09,
                0.54,
                width,
                0.085,
                0.06,
                "b4e9d9",
                "Chest_Astrolabe",
                True,
            )
        for xx in [-0.24, 0.2]:
            b(xx, 0.95, 0.53, 0.04, 0.42, 0.04, "d2ba87", "Astrolabe_Frame")


def portrait(model, filename, theme):
    palette = {
        "ice": ("182d40", "6398ac"),
        "fire": ("382b31", "b7764e"),
        "sea": ("153344", "5d9e9e"),
        "boss": ("263047", "ac9f75"),
    }
    dark, light = palette[theme]

    # Explicit intrinsic size is required when SVG is uploaded as a WebGL texture.
    # Fit the isometric silhouette to the same card window for every creature.
    def iso(point):
        x, y, z = point
        return ((x - z) * 0.68, (x + z) * 0.25 - y)

    points = [
        iso((x + dx, y + dy, z + dz))
        for x, y, z, w, h, d, _ in model.boxes
        for dx in [0, w]
        for dy in [0, h]
        for dz in [0, d]
    ]
    min_x, min_y = (min(p[i] for p in points) for i in [0, 1])
    max_x, max_y = (max(p[i] for p in points) for i in [0, 1])
    scale = min(202 / (max_x - min_x), 264 / (max_y - min_y))
    cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2

    def project(point):
        px, py = iso(point)
        return (128 + (px - cx) * scale, 180 + (py - cy) * scale)

    shapes = []
    for x, y, z, w, h, d, color in sorted(
        model.boxes, key=lambda item: item[0] + item[2] + item[1] * 0.05
    ):
        corners = [
            [x, y, z],
            [x + w, y, z],
            [x + w, y + h, z],
            [x, y + h, z],
            [x, y, z + d],
            [x + w, y, z + d],
            [x + w, y + h, z + d],
            [x, y + h, z + d],
        ]
        rgb = [int(color[i : i + 2], 16) for i in (0, 2, 4)]
        for face, shade in [([4, 5, 6, 7], 0.76), ([1, 2, 6, 5], 0.57), ([3, 7, 6, 2], 1.06)]:
            points = " ".join(
                f"{project(corners[i])[0]:.1f},{project(corners[i])[1]:.1f}" for i in face
            )
            fill = "#" + "".join(f"{min(255, int(c * shade)):02x}" for c in rgb)
            shapes.append(f'<polygon points="{points}" fill="{fill}"/>')
    stars = "".join(
        f'<rect x="{25 + (i * 47) % 210}" y="{30 + (i * 29) % 230}" width="2" height="2" fill="#{light}" opacity=".45"/>'
        for i in range(30)
    )
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 256 384"><defs><radialGradient id="bg"><stop stop-color="#{light}"/><stop offset="1" stop-color="#{dark}"/></radialGradient></defs><path fill="url(#bg)" d="M0 0h256v384H0z"/>{stars}<ellipse cx="128" cy="311" rx="79" ry="19" fill="#081921" opacity=".7"/><path d="M24 330h208M38 337h180" stroke="#{light}" opacity=".35"/>{''.join(shapes)}</svg>'
    (ASSETS / "portraits" / (filename + ".svg")).write_text(svg, encoding="utf-8")


def main():
    manifest = []
    for index, (theme, title, sculpt) in enumerate(
        [("frost", "霜晶矿窟", frost), ("forge", "余烬铸坊", forge), ("tide", "潮汐星殿", tide)]
    ):
        model = Model(title, cards=True)
        rng = random.Random(260101 + index)
        foundation(model, theme, rng)
        floor_details(model, theme, rng)
        sculpt(model, rng)
        parts = model.finish(f"{theme}.glb")
        manifest.append(
            {
                "id": theme,
                "name": title,
                "boxes": len(model.boxes),
                "components": parts,
                "file": f"{theme}.glb",
            }
        )
    for kind, title, theme in [
        ("crystal-beetle", "晶背甲虫", "ice"),
        ("cinder-imp", "灰炉小偶", "fire"),
        ("tide-jelly", "潮灯水母", "sea"),
        ("boss-tide", "星潮司灯者", "boss"),
    ]:
        model = Model(title)
        creature(model, kind)
        parts = model.finish(kind + ".glb")
        portrait(model, kind, theme)
        manifest.append(
            {
                "id": kind,
                "name": title,
                "boxes": len(model.boxes),
                "components": parts,
                "file": kind + ".glb",
                "kind": "creature",
            }
        )
    (OUT / "模型清单.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
