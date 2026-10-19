"""Build Demo floor variants from the retained source GLBs without modifying them."""

import json, struct, random, shutil, math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
for name in ["battle", "forest"]:
    path = ROOT / "万象酒馆-Demo/assets" / f"{name}.glb"
    sources = {
        "battle": ROOT / "万象战场-体素模型/万象战场-遗迹战盘.glb",
        "forest": ROOT / "万象古林-体素模型/月痕古林-体素战场.glb",
    }
    backup = sources[name]
    raw = backup.read_bytes()
    n = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20 : 20 + n])
    binary = bytearray(raw[28 + n :])
    binary = binary[: doc["buffers"][0]["byteLength"]]
    removed = {
        "02_Central_Board_Tiles",
        "03_Board_Inlaid_Border",
        "04_Friendly_Zone_Inlay",
        "05_Enemy_Zone_Inlay",
        "06_Neutral_Center_Compass",
        "07_Friendly_Three_Front_Slots",
        "07_Enemy_Three_Front_Slots",
        "02_Flat_Central_Battle_Glade",
        "03_Friendly_Wooden_Platform",
        "04_Enemy_Sunken_Stonework",
        "06_Moon_Pool_Emblem",
    }
    removed_ids = {i for i, node in enumerate(doc["nodes"]) if node.get("name") in removed}
    for scene in doc["scenes"]:
        scene["nodes"] = [i for i in scene["nodes"] if i not in removed_ids]
    for node in doc["nodes"]:
        if "children" in node:
            node["children"] = [i for i in node["children"] if i not in removed_ids]
    positions = []
    normals = []
    indices = []
    colors = []
    seen_boxes = set()

    def box(x, y, z, w, h, d, c):
        key = tuple(round(v, 6) for v in [x, y, z, w, h, d]) + tuple(c)
        if key in seen_boxes:
            return
        seen_boxes.add(key)
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
            ],
            dtype=float,
        )
        faces = [
            ([0, 3, 2, 1], [0, 0, -1]),
            ([4, 5, 6, 7], [0, 0, 1]),
            ([0, 4, 7, 3], [-1, 0, 0]),
            ([1, 2, 6, 5], [1, 0, 0]),
            ([0, 1, 5, 4], [0, -1, 0]),
            ([3, 7, 6, 2], [0, 1, 0]),
        ]
        for face, normal in faces:
            start = len(positions)
            positions.extend(corners[face])
            normals.extend([normal] * 4)
            colors.extend([c] * 4)
            indices.extend([start, start + 1, start + 2, start, start + 2, start + 3])

    def rgb(h):
        # COLOR_0 is linear; match the material colors already in the GLB.
        values = [int(h[i : i + 2], 16) / 255 for i in [0, 2, 4]]
        return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]

    friendly = rgb("747a6c" if name == "battle" else "617455")
    enemy = rgb("626171" if name == "battle" else "48696c")
    box(-6.32, 0.04, 0, 12.64, 0.08, 5.2, friendly)
    box(-6.32, 0.04, -5.2, 12.64, 0.08, 5.2, enemy)
    rng = random.Random(916)

    def under_card(x, z):
        return (
            min(abs(x - j) for j in [-3.014, 0, 3.014]) < 1.15
            and min(abs(z - j) for j in [-2.345, 2.345]) < 1.54
        )

    def stroke(ax, az, bx, bz, c, width=0.04, y=0.12, h=0.015):
        steps = max(1, math.ceil(max(abs(bx - ax), abs(bz - az)) / 0.04))
        for step in range(steps + 1):
            t = step / steps
            x = round((ax + (bx - ax) * t) / 0.04) * 0.04
            z = round((az + (bz - az) * t) / 0.04) * 0.04
            box(x, y, z, width, h, width, c)

    # Broad irregular worn areas instead of a uniform checkerboard.
    for _ in range(45):
        x = rng.randrange(-147, 147) * 0.04
        z = rng.randrange(-120, 120) * 0.04
        if under_card(x, z):
            continue
        base = friendly if z >= 0 else enemy
        for _ in range(rng.randrange(8, 20)):
            dx = rng.randrange(-7, 8) * 0.04
            dz = rng.randrange(-5, 6) * 0.04
            c = [v * rng.choice([0.78, 0.86, 0.94, 1.1]) for v in base]
            box(
                x + dx,
                0.12,
                z + dz,
                rng.choice([0.08, 0.16, 0.24]),
                0.013,
                rng.choice([0.04, 0.08, 0.12]),
                c,
            )
    # A weathered circular relief links both halves; its center is an understated threshold sigil.
    carving = rgb("4e5657" if name == "battle" else "3e574e")
    old_metal = rgb("999276" if name == "battle" else "839176")
    for radius, c in [(2.38, carving), (2.5, old_metal), (3.88, carving)]:
        for i in range(120):
            a = i * math.tau / 120
            b = (i + 1) * math.tau / 120
            if (i % 19 in [0, 1, 2]) and radius != 2.38:
                continue
            stroke(
                math.cos(a) * radius,
                math.sin(a) * radius,
                math.cos(b) * radius,
                math.sin(b) * radius,
                c,
            )
    for sign in [-1, 1]:
        stroke(0, 0, sign * 0.68, 0, old_metal, width=0.08)
        stroke(0, 0, 0, sign * 0.48, old_metal, width=0.08)
        stroke(sign * 0.68, 0, sign * 0.94, sign * 0.22, old_metal)
    for i in range(16):
        a = i * math.tau / 16
        stroke(
            math.cos(a) * 2.65,
            math.sin(a) * 2.65,
            math.cos(a) * 2.81,
            math.sin(a) * 2.81,
            old_metal,
            width=0.08,
        )
    # Branching fissures and mineral fragments cluster around the perimeter.
    for side in [-1, 1]:
        for z in [-4.55, -0.5, 4.25]:
            x = side * 5.85
            zz = z
            for i in range(7):
                nx = x - side * rng.choice([0.16, 0.24, 0.32])
                nz = zz + rng.choice([-0.16, 0, 0.12])
                stroke(x, zz, nx, nz, carving)
                x, zz = nx, nz
                if i in [2, 5]:
                    stroke(x, zz, x + side * 0.16, zz + 0.32, carving)
    moss = rgb("536c4b" if name == "battle" else "49765a")
    leaf = rgb("7b8860" if name == "battle" else "709566")
    for side in [-1, 1]:
        for base_z in [-4.5, -0.75, 0.8, 4.4]:
            x = side * 6.16
            z = base_z
            for i in range(22):
                nx = x - side * 0.08
                nz = z + rng.choice([-0.04, 0, 0.04])
                stroke(x, z, nx, nz, moss, width=0.08, y=0.13, h=0.027)
                x, z = nx, nz
                if i % 3 == 0:
                    box(x - 0.04, 0.15, z + 0.08, 0.12, 0.04, 0.08, leaf)
                    box(x, 0.15, z - 0.12, 0.08, 0.04, 0.12, moss)
    # The six fixed, grounded stone bases are independent of the movable card meshes.
    for z in [-2.345, 2.345]:
        stone = rgb("666572" if z < 0 else "77827a")
        top = rgb("85838c" if z < 0 else "96a18c")
        accent = rgb("ba91cd" if z < 0 else "86c2b3")
        for x in [-3.014, 0, 3.014]:
            box(x - 1.12, 0.12, z - 1.54, 2.24, 0.08, 3.08, carving)
            box(x - 1.04, 0.2, z - 1.46, 2.08, 0.08, 2.92, stone)
            box(x - 0.96, 0.26, z - 1.38, 1.92, 0.02, 2.76, top)
            # Open corner inlays frame the portrait without surrounding it with another small grid.
            for sx in [-1, 1]:
                for sz in [-1, 1]:
                    px = x + sx * 0.94
                    pz = z + sz * 1.36
                    box(px - (0.24 if sx > 0 else 0), 0.28, pz, 0.28, 0.02, 0.04, accent)
                    box(px, 0.28, pz - (0.24 if sz > 0 else 0), 0.04, 0.02, 0.28, accent)
                    box(x + sx * 1.0, 0.2, z + sz * 1.28, 0.04, 0.08, 0.08, old_metal)
            # Recessed mounting motif becomes visible when the whole 3D card is lifted.
            for radius in [0.48, 0.6]:
                for i in range(40):
                    a = i * math.tau / 40
                    b = (i + 1) * math.tau / 40
                    stroke(
                        x + math.cos(a) * radius,
                        z + math.sin(a) * radius,
                        x + math.cos(b) * radius,
                        z + math.sin(b) * radius,
                        carving,
                        y=0.28,
                        h=0.004,
                    )
            stroke(x - 0.2, z, x + 0.2, z, accent, y=0.28, h=0.004)
            stroke(x, z - 0.2, x, z + 0.2, accent, y=0.28, h=0.004)

    def accessor(array, component, typ, target, minmax=False):
        while len(binary) % 4:
            binary.append(0)
        arr = np.asarray(array, dtype="<f4" if component == 5126 else "<u4")
        offset = len(binary)
        binary.extend(arr.tobytes())
        vi = len(doc["bufferViews"])
        doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": offset, "byteLength": arr.nbytes, "target": target}
        )
        ac = {"bufferView": vi, "componentType": component, "count": len(arr), "type": typ}
        if minmax:
            ac.update(min=arr.min(axis=0).tolist(), max=arr.max(axis=0).tolist())
        ai = len(doc["accessors"])
        doc["accessors"].append(ac)
        return ai

    attributes = {
        "POSITION": accessor(positions, 5126, "VEC3", 34962, True),
        "NORMAL": accessor(normals, 5126, "VEC3", 34962),
        "COLOR_0": accessor(colors, 5126, "VEC3", 34962),
    }
    idx = accessor(indices, 5125, "SCALAR", 34963)
    mi = len(doc["materials"])
    doc["materials"].append(
        {
            "name": "Quiet_Floor_Vertex_Color",
            "pbrMetallicRoughness": {
                "baseColorFactor": [1, 1, 1, 1],
                "metallicFactor": 0,
                "roughnessFactor": 1,
            },
        }
    )
    mesh = len(doc["meshes"])
    doc["meshes"].append(
        {
            "name": "Enemy_Friendly_Continuous_Floor",
            "primitives": [{"attributes": attributes, "indices": idx, "material": mi}],
        }
    )
    ni = len(doc["nodes"])
    doc["nodes"].append({"name": "Decorated_Halves_With_Six_Grounded_Stone_Bases", "mesh": mesh})
    doc["scenes"][doc.get("scene", 0)]["nodes"].append(ni)
    doc.setdefault("extras", {})["demoLayout"] = {
        "foundationCenters": [[x, 0.12, z] for z in [-2.345, 2.345] for x in [-3.014, 0, 3.014]],
        "foundationSize": [2.24, 0.16, 3.08],
        "floorStyle": "two worn halves, relief rings, branching cracks, creepers; no tile grid",
    }
    doc["buffers"][0]["byteLength"] = len(binary)
    head = json.dumps(doc, separators=(",", ":")).encode()
    head += b" " * ((-len(head)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, 28 + len(head) + len(binary))
        + struct.pack("<II", len(head), 0x4E4F534A)
        + head
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )
    print(
        name,
        "removed",
        len(removed_ids),
        "floor triangles",
        len(indices) // 3,
        "bytes",
        path.stat().st_size,
    )
