import ast, json, math, struct, time, random, shutil
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "万象古林-体素模型"
OUT.mkdir(exist_ok=True)
S = 0.04
HS = 0.04
ORIGIN = np.array([-11.04, -0.4, -8.8])
SHAPE = (552, 100, 440)
palette = []
lookup = {}
groups = {}
hero_arrays = {}
lights = []
A = None
rng = random.Random(142627)
source = ast.parse((ROOT / "建模工具/build_tavern.py").read_text(encoding="utf-8"))
names = {
    "color",
    "group",
    "ix",
    "cid",
    "box",
    "cell",
    "disk",
    "line",
    "lin",
    "geometry",
    "glb",
    "vox",
}


class Rename(ast.NodeTransformer):
    def visit_Constant(self, n):
        m = {"Wanxiang_Tavern": "Wanxiang_Ancient_Forest", 158: 276, 133: 220}
        return ast.copy_location(ast.Constant(value=m[n.value]), n) if n.value in m else n


exec(
    compile(
        ast.fix_missing_locations(
            Rename().visit(
                ast.Module(
                    body=[
                        n for n in source.body if isinstance(n, ast.FunctionDef) and n.name in names
                    ],
                    type_ignores=[],
                )
            )
        ),
        "forest_voxel_utilities",
        "exec",
    )
)
for n, h in {
    "earth": "4b5146",
    "earth2": "535b4c",
    "earth3": "5b6052",
    "gravel": "6e7668",
    "rock": "53696b",
    "rock2": "617b7a",
    "dark": "273b3c",
    "stone": "769387",
    "edge": "9bab8b",
    "bark": "4d4031",
    "barkLight": "6d5940",
    "root": "635238",
    "leaf": "355e52",
    "leaf2": "497764",
    "leaf3": "5b896c",
    "moss": "647d4b",
    "wood": "7c7253",
    "wood2": "958365",
    "iron": "33454a",
    "brass": "a79160",
    "paper": "c6c5a0",
    "blue": "557989",
    "cap": "49868a",
    "water": "2c586a",
}.items():
    color(n, h)
for n, h, e in [("cyan", "75dac9", 0.5), ("spore", "b9dbe0", 0.6), ("fire", "d1eaae", 0.4)]:
    color(n, h, e)
group("01_Ancient_Forest_Floor")
box(-11, -0.24, -8.6, 22, 0.2, 17.2, "earth")
for x in np.arange(-10.8, 10.8, 0.36):
    for z in np.arange(-8.4, 8.4, 0.36):
        box(x, -0.04, z, min(0.36, 11 - x), 0.04, 0.36, rng.choice(["earth", "earth2", "earth3"]))
group("02_Flat_Central_Battle_Glade")
box(-6.16, 0, -5.16, 12.32, 0.04, 10.32, "earth2")
for _ in range(600):
    x = rng.randrange(-151, 151) * S
    z = rng.randrange(-128, 128) * S
    box(
        x,
        0,
        z,
        rng.choice([0.04, 0.08, 0.12, 0.2]),
        0.04,
        0.04,
        rng.choice(["earth", "earth3", "gravel"]),
    )
group("03_Friendly_Wooden_Platform")
for z in np.arange(0.96, 4.72, 0.24):
    for x in np.arange(-6.04, 6.04, 0.8):
        box(x, 0.04, z, min(0.76, 6.04 - x), 0.04, 0.2, rng.choice(["wood", "wood2"]))
        cell(x + 0.04, 0.04, z + 0.08, "root")
group("04_Enemy_Sunken_Stonework")
for z in np.arange(-4.8, -0.96, 0.48):
    for x in np.arange(-6.04, 6.04, 0.64):
        box(x, 0.04, z, min(0.6, 6.04 - x), 0.04, 0.44, rng.choice(["rock", "rock2"]))
        if rng.random() < 0.24:
            cell(x + 0.12, 0.04, z + 0.2, "moss")
group("05_Glade_Border_and_Entry")
for x in [-6.36, 6.16]:
    box(x, 0, -5.4, 0.2, 0.16, 10.8, "root")
    for z in np.arange(-5.36, 5.36, 0.4):
        box(x - 0.04, 0.12, z, 0.28, 0.08, 0.16, "moss")
for z in [-5.4, 5.2]:
    box(-6.16, 0, z, 12.32, 0.16, 0.2, "root")
for z in [-5.4, 5.2]:
    for x in np.arange(-6, 6, 0.56):
        box(x, 0.12, z, 0.16, 0.08, 0.24, "moss")
group("06_Moon_Pool_Emblem")
disk(0, 0.04, 0, 0.56, 0.04, "rock2")
disk(0, 0.08, 0, 0.44, 0.04, "water")
disk(0, 0.12, 0, 0.24, 0.04, "cyan", 0.2)
for x, z in [(-0.64, 0), (0.56, 0), (0, -0.64), (0, 0.56)]:
    box(x, 0.08, z, 0.08, 0.04, 0.08, "spore")


def build_side_trees():
    # Crown centres relative to the trunk: sideways, forward, elevation, width.
    crowns = {
        "spreading": [
            (-0.61, 0.1, -0.26, 0.89),
            (0.08, -0.13, 0.02, 1.03),
            (0.66, 0.32, -0.14, 0.68),
        ],
        "forked": [(-0.46, -0.2, 0.11, 0.8), (0.52, 0.13, -0.12, 0.71)],
        "leaning": [(0.31, -0.1, 0.05, 0.78), (0.76, 0.32, -0.24, 0.67)],
        "tapered": [
            (0.05, 0.0, -0.35, 0.83),
            (-0.11, -0.08, 0.08, 0.62),
            (-0.14, -0.17, 0.41, 0.42),
        ],
        "sapling": [(-0.12, 0.04, 0.04, 0.55), (0.22, 0.12, -0.17, 0.37)],
        "snag": [],
    }
    # Separate banks intentionally have different ages, gaps and silhouettes.
    trees = [
        (-8.9, -6.45, 2.03, "forked", 1.35),
        (-8.55, -3.65, 2.48, "spreading", 0.52),
        (-9.45, -0.99, 1.38, "sapling", -1.27),
        (-8.34, 1.39, 1.98, "leaning", 2.2),
        (-8.78, 4.54, 2.42, "spreading", -0.85),
        (-5.38, 7.02, 1.18, "sapling", 1.4),
        (7.94, -6.13, 1.26, "snag", -0.84),
        (8.95, -4.34, 2.64, "tapered", 1.05),
        (8.41, -1.86, 2.03, "forked", 0.86),
        (9.58, 0.4, 1.46, "sapling", -0.32),
        (8.62, 2.23, 2.57, "tapered", -0.95),
        (8.81, 5.28, 2.12, "leaning", 1.06),
        (5.25, -7.38, 1.37, "sapling", 0.3),
        (5.62, 7.19, 1.85, "forked", -0.73),
    ]
    foliage = []
    group("07_Trees_and_Exposed_Roots")
    for x, z, height, form, heading in trees:
        radius = 0.27 if form == "spreading" else 0.18
        lean = 0.48 if form == "leaning" else 0.1
        top_x = x + math.cos(heading) * lean
        top_z = z + math.sin(heading) * lean
        for level in range(8):
            fraction = level / 8
            disk(
                x + (top_x - x) * fraction,
                height * fraction,
                z + (top_z - z) * fraction,
                radius * (1 - fraction * 0.45),
                height / 8 + S,
                "bark",
            )
        for offset in (0, 1.65, 3.4, 4.6):
            angle = heading + offset
            reach = rng.uniform(0.48, 0.84)
            line(
                (x - 0.04, 0.24, z - 0.04),
                (x + math.cos(angle) * reach, 0.04, z + math.sin(angle) * reach),
                0.12,
                "root",
            )
        if form == "snag":
            disk(top_x, height, top_z, 0.14, 0.08, "barkLight")
            line((x, 0.65, z), (x + 0.38, 1.12, z - 0.22), 0.12, "barkLight")
        for dx, dz, dy, width in crowns[form]:
            cx = x + dx * math.cos(heading) - dz * math.sin(heading)
            cz = z + dx * math.sin(heading) + dz * math.cos(heading)
            cy = height + dy
            line((x - 0.06, height * 0.61, z - 0.06), (cx, cy, cz), 0.16, "barkLight")
            foliage.append((cx, cy, cz, width, rng.choice(["leaf2", "leaf3"])))
    group("08_Layered_Voxel_Canopies")
    for x, y, z, radius, top in foliage:
        for level, width, color in [
            (-0.22, 0.7, "leaf"),
            (-0.06, 1.0, "leaf"),
            (0.1, 0.85, "leaf2"),
            (0.26, 0.58, top),
        ]:
            disk(x - level * 0.23, y + level, z + level * 0.18, radius * width, 0.16, color)


build_side_trees()
group("09_Lush_Forest_Sidebanks")
for side in [-1, 1]:
    for z in np.arange(-8.3, 8.3, 0.32):
        for k, x in enumerate(np.arange(7.2, 10.72, 0.36)):
            xx = x if side > 0 else -x - 0.28
            if rng.random() < 0.74:
                box(
                    xx,
                    0,
                    z,
                    0.28,
                    rng.choice([0.08, 0.12, 0.2, 0.28]),
                    0.28,
                    rng.choice(["moss", "leaf", "leaf2"]),
                )
            if rng.random() < 0.1:
                box(xx, 0.16, z, 0.16, 0.4, 0.16, "leaf3")
group("10_Fallen_Trunks_and_Stones")
for side in [-1, 1]:
    for z in [-4.96, -1.32, 2.76, 5.84]:
        x = side * 7.6 - 0.16
        box(x, 0.12, z, 0.32, 0.24, 1.2, "bark")
        box(x - 0.04, 0.16, z - 0.04, 0.4, 0.2, 0.08, "wood2")
        for zz in np.arange(z, z + 1.2, 0.16):
            box(x, 0.36, zz, 0.32, 0.04, 0.08, "moss")
    for z in np.arange(-7.6, 7.6, 0.72):
        x = side * rng.choice([6.8, 7.24, 9.8, 10.3])
        box(x - 0.16, 0, z, 0.32, rng.choice([0.16, 0.24, 0.32]), 0.32, "rock2")
        box(x - 0.08, 0.28, z + 0.04, 0.16, 0.04, 0.16, "moss")
group("11_Glowing_Mushrooms_and_Lanterns")
for side in [-1, 1]:
    for j, z in enumerate(np.arange(-6.8, 7, 1.44)):
        x = side * (7.2 + (j % 2) * 0.48)
        disk(x, 0.04, z, 0.04, 0.24, "stone")
        disk(x, 0.28, z, 0.2, 0.08, "cap")
        disk(x, 0.36, z, 0.12, 0.04, "cyan")
        box(x + 0.24, 0.04, z + 0.28, 0.04, 0.16, 0.04, "stone")
        disk(x + 0.28, 0.2, z + 0.3, 0.12, 0.04, "blue")
        if j % 2 == 0:
            lights.append(
                {
                    "name": f"Forest_Glow_{side}_{j}",
                    "position": [x, 0.64, z],
                    "color": [0.3, 0.8, 0.75],
                    "intensity": 6,
                    "range": 3,
                }
            )
group("12_Forest_Threshold_Stones")
for x in [-1.2, 0.96]:
    box(x, 0, -6.12, 0.24, 1.44, 0.32, "rock")
    box(x - 0.08, 1.44, -6.2, 0.4, 0.16, 0.48, "rock2")
    for y in [0.32, 0.64, 0.96]:
        box(x + 0.08, y, -5.8, 0.08, 0.08, 0.04, "cyan")
for x in np.arange(-0.96, 0.96, 0.32):
    box(x, 0.04, -5.72, 0.28, 0.04, 0.24, "stone")
WORLD = np.zeros(SHAPE, dtype=bool)
for v in reversed(list(groups.values())):
    v[WORLD] = 0
    WORLD |= v != 0
triangles = glb(OUT / "月痕古林-体素战场.glb")
count = vox(OUT / "月痕古林-体素战场.vox")


def readglb(p):
    raw = p.read_bytes()
    n = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20 : 20 + n]), bytearray(raw[28 + n :])


doc, binary = readglb(OUT / "月痕古林-体素战场.glb")
old, oldbin = readglb(ROOT / "万象战场-体素模型/万象战场-遗迹战盘.glb")
while len(binary) % 4:
    binary.append(0)
byteoffset = len(binary)
binary += oldbin
viewoffset = len(doc["bufferViews"])
accessoffset = len(doc["accessors"])
materialoffset = len(doc["materials"])
doc["bufferViews"] += [
    {**v, "byteOffset": v.get("byteOffset", 0) + byteoffset} for v in old["bufferViews"]
]
doc["accessors"] += [{**a, "bufferView": a["bufferView"] + viewoffset} for a in old["accessors"]]
doc["materials"] += old["materials"]
doc["images"] = [{**im, "bufferView": im["bufferView"] + viewoffset} for im in old["images"]]
doc["textures"] = old["textures"]
doc["samplers"] = old["samplers"]
indices = [
    i
    for i, n in enumerate(old["nodes"])
    if n.get("name", "").startswith("Placeholder_")
    or n.get("name", "") in ["07_Friendly_Three_Front_Slots", "07_Enemy_Three_Front_Slots"]
]
nodemap = {idx: len(doc["nodes"]) + i for i, idx in enumerate(indices)}
meshmap = {}
for idx in indices:
    n = old["nodes"][idx]
    mi = n["mesh"]
    if mi not in meshmap:
        meshmap[mi] = len(doc["meshes"])
        m = json.loads(json.dumps(old["meshes"][mi]))
        for p in m["primitives"]:
            p["attributes"] = {k: v + accessoffset for k, v in p["attributes"].items()}
            p["indices"] += accessoffset
            p["material"] += materialoffset
        doc["meshes"].append(m)
    node = {**n, "mesh": meshmap[mi]}
    if "children" in node:
        node["children"] = [nodemap[c] for c in node["children"]]
    doc["nodes"].append(node)
    if not n["name"].endswith("_Artwork"):
        doc["scenes"][0]["nodes"].append(nodemap[idx])
angle = -math.atan2(18, 10)
doc["cameras"] = [
    {
        "name": "Fixed_God_View",
        "type": "orthographic",
        "orthographic": {"xmag": 8.5, "ymag": 5.85, "znear": 0.1, "zfar": 60},
    }
]
for n in doc["nodes"]:
    if "camera" in n:
        n.update(
            name="Fixed_God_View",
            translation=[0, 18, 10],
            rotation=[math.sin(angle / 2), 0, 0, math.cos(angle / 2)],
        )
doc["asset"]["generator"] = "Wanxiang moonlit ancient forest voxel battlefield"
doc["buffers"][0]["byteLength"] = len(binary)
js = json.dumps(doc, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
(OUT / "月痕古林-体素战场.glb").write_bytes(
    struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(binary))
    + struct.pack("<II", len(js), 0x4E4F534A)
    + js
    + struct.pack("<II", len(binary), 0x004E4942)
    + binary
)
shutil.copyfile(OUT / "月痕古林-体素战场.glb", ROOT / "万象酒馆-Demo/assets/forest.glb")
(OUT / "模型说明.md").write_text(
    "# 月痕古林\n\n第二张独立体素战场地图，保留同尺寸的中央战盘与平放卡牌接口。外围为古树、分层树冠、裸露根系、苔藓、倒木、月光蘑菇和石门。4厘米体素。中央保持无遮蔽。GLB 含六张可替换卡面、UV和正交相机；VOX 为森林环境的可编辑体素分组，卡牌复用遗迹战盘独立模型。\n",
    encoding="utf-8",
    newline="\n",
)
(OUT / "模型规格.json").write_text(
    json.dumps(
        {
            "体素数": int(np.count_nonzero(WORLD)),
            "原生模块": len(groups),
            "GLB模块": len(doc["meshes"]),
            "VOX分块": count,
            "体素边长米": S,
            "中央战盘米": [12.32, 10.32],
            "场景范围米": [22, 17.2],
        },
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
    newline="\n",
)
print("Forest exported:", len(doc["meshes"]), "meshes;", int(np.count_nonzero(WORLD)), "voxels")
