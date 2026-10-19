import ast, math, json, struct, random, time, shutil
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "万象战场-体素模型"
OUT.mkdir(exist_ok=True)
S = 0.04
HS = 0.02
ORIGIN = np.array([-11.04, -0.4, -8.8])
SHAPE = (552, 100, 440)
XS = 1.3
ZS = 1.5
palette = []
lookup = {}
groups = {}
hero_arrays = {}
lights = []
A = None
rng = random.Random(261014)
# Reuse the existing voxel mesher and exporters without executing the room builder.
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


class RenameRoot(ast.NodeTransformer):
    def visit_Constant(self, n):
        mapping = {"Wanxiang_Tavern": "Wanxiang_Battlefield", 158: 276, 133: 220}
        return (
            ast.copy_location(ast.Constant(value=mapping[n.value]), n) if n.value in mapping else n
        )


utilities = RenameRoot().visit(
    ast.Module(
        body=[n for n in source.body if isinstance(n, ast.FunctionDef) and n.name in names],
        type_ignores=[],
    )
)
exec(compile(ast.fix_missing_locations(utilities), "voxel_utilities", "exec"))
native_box = box


def box(x, y, z, w, h, d, c):
    native_box(x * XS, y, z * ZS, w * XS, h, d * ZS, c)


def disk(cx, y, cz, r, h, c, inner=0):
    x0, x1 = ix((cx - r) * XS, 0), ix((cx + r) * XS, 0)
    z0, z1 = ix((cz - r) * ZS, 2), ix((cz + r) * ZS, 2)
    y0, y1 = ix(y, 1), ix(y + h, 1)
    xx = ((np.arange(x0, x1) + 0.5) * S + ORIGIN[0]) / XS
    zz = ((np.arange(z0, z1) + 0.5) * S + ORIGIN[2]) / ZS
    dist = (xx[:, None] - cx) ** 2 + (zz[None, :] - cz) ** 2
    mask = (dist <= r * r) & (dist >= inner * inner)
    view = A[x0:x1, y0:y1, z0:z1]
    view[:] = np.where(mask[:, None, :], cid(c), view)


for n, h in {
    "rock": "484d57",
    "rock2": "555b65",
    "rock3": "626975",
    "dark": "252e38",
    "mortar": "343d46",
    "tile": "817c71",
    "tile2": "898579",
    "tile3": "77776e",
    "warm": "928574",
    "edge": "aaa18a",
    "chip": "666761",
    "enemy": "585b68",
    "enemy2": "626371",
    "enemy3": "505464",
    "iron": "303a42",
    "brass": "a28554",
    "brass2": "c8ac74",
    "tealDark": "27575e",
    "violetDark": "4f3d68",
    "card": "172e36",
    "enemyCard": "302439",
    "paper": "cbbf9f",
    "moss": "476951",
    "moss2": "60765a",
    "wood": "644731",
    "wood2": "88664a",
    "clay": "916747",
    "ash": "5c4942",
    "cloth": "4b334a",
    "cloth2": "66435f",
    "red": "793c42",
    "bone": "b8ac90",
    "darkLeaf": "304e43",
}.items():
    color(n, h)
for n, h, e in [
    ("teal", "6ed8cd", 0.35),
    ("violet", "ba91db", 0.35),
    ("fire", "f9bb68", 0.7),
    ("flame", "ffe4ab", 0.9),
]:
    color(n, h, e)

group("01_Continuous_Stone_Floor")
box(-5.92, -0.4, -4.64, 11.84, 0.2, 9.28, "dark")
box(-5.8, -0.2, -4.52, 11.6, 0.12, 9.04, "rock")
box(-5.68, -0.08, -4.4, 11.36, 0.08, 8.8, "rock2")
group("02_Central_Board_Tiles")
box(-4.72, 0, -3.44, 9.44, 0.04, 6.88, "mortar")
for iz, z in enumerate(np.arange(-3.4, 3.4, 0.4)):
    for ix0, x in enumerate(np.arange(-4.68, 4.68, 0.52)):
        c = (
            rng.choice(["tile", "tile2", "tile3"])
            if abs(z) < 0.76
            else (
                rng.choice(["warm", "tile", "tile2"])
                if z > 0
                else rng.choice(["enemy", "enemy2", "enemy3"])
            )
        )
        w = min(0.48, 4.68 - x)
        box(x, 0.04, z, w, 0.04, 0.36, c)
        # Sparse flush wear, concentrated outside the clean card faces.
        if rng.random() < 0.17:
            cell(x + 0.04, 0.04, z + 0.04, "chip")
group("03_Board_Inlaid_Border")
for x in [-4.88, 4.72]:
    box(x, 0, -3.6, 0.16, 0.12, 7.2, "edge")
    box(x + 0.04, 0.12, -3.52, 0.04, 0.04, 7.04, "brass")
for z in [-3.6, 3.44]:
    box(-4.72, 0, z, 9.44, 0.12, 0.16, "edge")
    box(-4.64, 0.12, z + 0.04, 9.28, 0.04, 0.04, "brass")
for x in [-4.6, 4.28]:
    for z in [-3.32, 3.0]:
        box(x, 0.08, z, 0.32, 0.04, 0.32, "dark")
        box(x + 0.08, 0.12, z + 0.08, 0.16, 0.04, 0.16, "brass2")
group("04_Friendly_Zone_Inlay")
box(-4.52, 0.08, 0.88, 9.04, 0.04, 0.04, "tealDark")
box(-4.52, 0.08, 3.16, 9.04, 0.04, 0.04, "tealDark")
for x in [-4.36, 4.12]:
    box(x, 0.08, 1.8, 0.24, 0.04, 0.24, "tealDark")
    box(x + 0.08, 0.12, 1.88, 0.08, 0.04, 0.08, "teal")
group("05_Enemy_Zone_Inlay")
box(-4.52, 0.08, -0.92, 9.04, 0.04, 0.04, "violetDark")
box(-4.52, 0.08, -3.2, 9.04, 0.04, 0.04, "violetDark")
for x in [-4.36, 4.12]:
    box(x, 0.08, -2.04, 0.24, 0.04, 0.24, "violetDark")
    box(x + 0.08, 0.12, -1.96, 0.08, 0.04, 0.08, "violet")
group("06_Neutral_Center_Compass")
disk(0, 0.08, 0, 0.4, 0.04, "brass", 0.36)
for x, z, w, d in [(-0.04, -0.28, 0.08, 0.56), (-0.28, -0.04, 0.56, 0.08)]:
    box(x, 0.08, z, w, 0.04, d, "chip")
disk(0, 0.08, 0, 0.12, 0.04, "edge")

for side, z, accent, fill in [
    ("Friendly", 1.96, "teal", "card"),
    ("Enemy", -1.96, "violet", "enemyCard"),
]:
    group("07_" + side + "_Three_Front_Slots")
    for x in [-2.56, 0, 2.56]:
        box(x - 0.8, 0.08, z - 1.04, 1.6, 0.04, 2.08, "dark")
        for px in [x - 0.8, x + 0.72]:
            box(px, 0.12, z - 1.04, 0.08, 0.04, 2.08, "brass" if side == "Friendly" else "rock3")
        for pz in [z - 1.04, z + 0.96]:
            box(x - 0.72, 0.12, pz, 1.44, 0.04, 0.08, "brass" if side == "Friendly" else "rock3")
        # Four corner sockets, plus a shallow diamond marking (kept below card).
        for px in [x - 0.76, x + 0.68]:
            for pz in [z - 1, z + 0.92]:
                box(px, 0.16, pz, 0.08, 0.04, 0.08, accent)
        box(x - 0.08, 0.12, z - 0.08, 0.16, 0.04, 0.16, accent)
    for i, x in enumerate([-2.56, 0, 2.56]):
        group(f"Placeholder_{side}_{i+1:02d}")
        box(x - 0.64, 0.16, z - 0.84, 1.28, 0.04, 1.68, "iron")
        box(x - 0.6, 0.2, z - 0.8, 1.2, 0.04, 1.6, "brass" if side == "Friendly" else "violetDark")
        box(x - 0.56, 0.24, z - 0.76, 1.12, 0.04, 1.52, fill)
        # Leave the full portrait face unoccupied; UV artwork planes are added below.

group("10_Perimeter_Cobblestones")
for z in np.arange(-4.28, 4.28, 0.32):
    for x in np.arange(-5.56, 5.56, 0.4):
        if abs(x) < 4.92 and abs(z) < 3.64:
            continue
        box(x, 0, z, 0.36, 0.04, 0.28, rng.choice(["rock", "rock2", "rock3"]))
        if rng.random() < 0.16:
            cell(x + 0.04, 0.04, z + 0.08, "moss")
group("11_Broken_Perimeter_Walls")
for x in np.arange(-5.6, 5.6, 0.48):
    if abs(x) < 1.4:
        continue
    for row in range(rng.choice([2, 3, 4])):
        box(x, row * 0.2, -4.36, 0.44, 0.16, 0.32, rng.choice(["rock", "rock2", "rock3"]))
for side in [-1, 1]:
    for z in np.arange(-3.92, 3.92, 0.48):
        if abs(z) < 0.56:
            continue
        for row in range(rng.choice([1, 2, 3])):
            box(
                side * 5.48 - 0.16,
                row * 0.2,
                z,
                0.32,
                0.16,
                0.44,
                rng.choice(["rock", "rock2", "rock3"]),
            )
# Low front parapet does not hide friendly cards.
for x in np.arange(-5.12, 5.12, 0.48):
    if abs(x) < 1.6:
        continue
    box(x, 0, 4.08, 0.44, 0.16, 0.28, "rock2")

for i, (cx, cz, h) in enumerate(
    [(-5.24, -3.92, 1.68), (5.24, -3.92, 1.36), (-5.24, 3.8, 0.92), (5.24, 3.8, 1.12)]
):
    group(f"12_Ruined_Column_{i+1}")
    box(cx - 0.36, 0, cz - 0.36, 0.72, 0.16, 0.72, "rock3")
    box(cx - 0.28, 0.16, cz - 0.28, 0.56, 0.12, 0.56, "edge")
    box(cx - 0.2, 0.28, cz - 0.2, 0.4, h - 0.28, 0.4, "rock2")
    for y in np.arange(0.28, h, 0.24):
        for px in [cx - 0.24, cx + 0.16]:
            box(px, y, cz - 0.2, 0.08, 0.2, 0.4, "rock3")
        box(cx - 0.2, y, cz - 0.24, 0.4, 0.2, 0.08, "rock")
    box(cx - 0.28, h, cz - 0.28, 0.56, 0.12, 0.56, "rock3")
    for _ in range(8):
        px = cx + rng.choice([-0.24, -0.2, 0.16, 0.2])
        pz = cz + rng.choice([-0.24, -0.2, 0.16, 0.2])
        py = rng.randrange(3, max(4, round(h / S))) * S
        cell(px, py, pz, "moss")

group("13_Back_Ruined_Gateway")
for x in [-1.28, 1.0]:
    box(x, 0, -4.32, 0.28, 1.8, 0.32, "rock3")
    for y in np.arange(0.12, 1.72, 0.24):
        box(x - 0.04, y, -4.36, 0.36, 0.04, 0.4, "dark")
    box(x - 0.08, 0, -4.4, 0.44, 0.2, 0.48, "edge")
box(-1.04, 1.72, -4.32, 2.08, 0.24, 0.32, "rock2")
box(-0.72, 1.96, -4.32, 1.44, 0.16, 0.32, "rock3")
box(-0.12, 1.72, -4.4, 0.24, 0.28, 0.12, "brass")
cell(-0.04, 1.8, -4.44, "violet")
group("14_Gateway_Stone_Steps")
for j in range(3):
    box(-1.0, 0, -3.76 - j * 0.16, 2, 0.04 * (j + 1), 0.16, "rock3")

for i, (x, z) in enumerate([(-4.76, -3.84), (4.76, -3.84), (-5.28, 1.48), (5.28, 1.48)]):
    group(f"15_Brazier_{i+1}")
    box(x - 0.2, 0, z - 0.2, 0.4, 0.12, 0.4, "rock3")
    box(x - 0.12, 0.12, z - 0.12, 0.24, 0.44, 0.24, "iron")
    disk(x, 0.56, z, 0.28, 0.08, "brass")
    disk(x, 0.64, z, 0.24, 0.08, "ash")
    for dz, w, h in [(-0.12, 0.12, 0.32), (-0.04, 0.2, 0.24), (0.04, 0.16, 0.2)]:
        box(x - w / 2, 0.72, z + dz, w, h, 0.08, "fire")
    box(x - 0.04, 0.8, z - 0.04, 0.08, 0.32, 0.08, "flame")
    lights.append(
        {
            "name": f"Brazier_{i+1}",
            "position": [x * XS, 1.08, z * ZS],
            "color": [1, 0.59, 0.26],
            "intensity": 13,
            "range": 5,
        }
    )

group("16_Peripheral_Rubble_and_Moss")
for _ in range(55):
    x = rng.randrange(-130, 131) * S
    z = rng.randrange(-101, 101) * S
    if abs(x) < 4.96 and abs(z) < 3.68:
        continue
    if abs(x) < 1.6 and z < -3.64:
        continue
    box(
        x,
        0.04,
        z,
        rng.choice([0.08, 0.12, 0.2]),
        rng.choice([0.08, 0.12, 0.16]),
        rng.choice([0.08, 0.12, 0.16]),
        rng.choice(["rock", "rock3"]),
    )
    for j in range(2):
        cell(x + j * 0.04, 0.04, z - 0.04, rng.choice(["moss", "moss2"]))
group("17_Abandoned_Supply_Crates")
for x, z in [(-5.08, 2.4), (4.92, 2.48)]:
    box(x - 0.28, 0.04, z - 0.28, 0.56, 0.44, 0.56, "wood")
    for px in [x - 0.28, x + 0.2]:
        box(px, 0.04, z - 0.32, 0.08, 0.44, 0.04, "wood2")
    for yy in [0.08, 0.4]:
        box(x - 0.28, yy, z - 0.32, 0.56, 0.04, 0.04, "wood2")
    for px in np.arange(x - 0.28, x + 0.28, 0.12):
        box(px, 0.48, z - 0.28, 0.08, 0.04, 0.56, "wood2")
group("18_Front_Entry_Steps")
for j in range(3):
    box(-1.36, -0.08 - j * 0.08, 3.64 + j * 0.28, 2.72, 0.08, 0.28, "rock3")

group("19_Carved_Wall_Panels")
for side in [-1, 1]:
    for z in [-2.72, -1.12, 0.48, 2.08]:
        x = side * 5.48 - 0.16
        box(x, 0, z, 0.32, 0.88, 0.64, "rock2")
        box(x - 0.04, 0.08, z - 0.04, 0.4, 0.08, 0.72, "edge")
        box(x - 0.04, 0.8, z - 0.04, 0.4, 0.08, 0.72, "rock3")
        for zz in np.arange(z + 0.08, z + 0.56, 0.12):
            box(x - 0.04, 0.32, zz, 0.4, 0.04, 0.04, "dark")
        if z < 0:
            for yy in [0.16, 0.4, 0.64]:
                box(x, 0.0 + yy, z + 0.2, 0.36, 0.04, 0.24, "brass")
group("20_Draped_Ruined_Banners")
for cx in [-3.52, 3.52]:
    box(cx - 0.4, 0.28, -3.96, 0.8, 0.72, 0.04, "cloth")
    for dx in [-0.36, 0.32]:
        box(cx + dx, 0.28, -3.92, 0.04, 0.72, 0.04, "brass")
    for dx, h in [(-0.4, 0.08), (-0.24, 0.16), (0, 0.2), (0.16, 0.12)]:
        box(cx + dx, 0.28 - h, -3.96, 0.16, h, 0.04, "cloth2")
    box(cx - 0.36, 1.0, -4.04, 0.72, 0.04, 0.16, "brass")
    box(cx - 0.04, 0.4, -3.92, 0.08, 0.36, 0.04, "brass2")
    box(cx - 0.2, 0.56, -3.92, 0.4, 0.04, 0.04, "brass2")
group("21_Hanging_Vines_and_Roots")
for side in [-1, 1]:
    for z in [-3.28, -1.52, 2.64]:
        x = side * 5.4
        line((x, 0.72, z), (x - side * 0.2, 0.08, z + 0.6), 0.04, "darkLeaf")
        for j in range(10):
            yy = 0.68 - j * 0.06
            zz = z + j * 0.06
            xx = x - side * j * 0.02
            box(xx - 0.08, yy, zz, 0.16, 0.04, 0.08, rng.choice(["moss", "moss2"]))
        for j in range(3):
            box(x - side * (0.12 + j * 0.12), 0.04, z + 0.56 + j * 0.08, 0.12, 0.04, 0.12, "moss")
group("22_Corner_Offerings_and_Debris")
for x, z in [(-4.96, 3.28), (4.96, -2.92)]:
    for yy, rr in [(0, 0.2), (0.04, 0.24), (0.24, 0.2), (0.36, 0.12)]:
        disk(x, 0.04 + yy, z, rr, 0.08, "clay")
    disk(x, 0.48, z, 0.12, 0.04, "dark", 0.08)
    for dz in [0.32, 0.44]:
        box(x - 0.2, 0.04, z + dz, 0.44, 0.04, 0.08, "bone")
    for xx in [x - 0.16, x + 0.08]:
        cell(xx, 0.08, z + 0.32, "bone")
for cx in [-3.84, 3.84]:
    for j in range(6):
        box(cx + j * 0.08, 0.04, 3.84 + (j % 2) * 0.08, 0.12, 0.08, 0.16, "rock3")
group("23_Peripheral_Rune_Plinths")
for cx, cz, accent in [(-5.1, -0.12, "teal"), (5.1, -0.12, "violet")]:
    box(cx - 0.24, 0.04, cz - 0.4, 0.48, 0.08, 0.8, "dark")
    box(cx - 0.2, 0.12, cz - 0.36, 0.4, 0.04, 0.72, "rock3")
    for dz in [-0.24, -0.04, 0.16]:
        box(cx - 0.08, 0.16, cz + dz, 0.16, 0.04, 0.04, accent)
group("25_Weathered_Floor_Fringes")
for side in [-1, 1]:
    for j in range(18):
        x = side * (5.0 + rng.choice([0, 0.08, 0.16, 0.24]))
        z = -3.6 + j * 0.4
        for k in range(rng.choice([2, 3, 4])):
            box(
                x - side * k * 0.08,
                0.04,
                z + k * 0.04,
                0.08,
                0.04,
                0.12,
                rng.choice(["darkLeaf", "moss", "moss2"]),
            )
group("26_Relics_and_Chains")
for x, z in [(-5.04, -2.8), (5.04, 2.92)]:
    box(x - 0.04, 0.08, z - 0.32, 0.08, 0.04, 0.56, "edge")
    box(x - 0.16, 0.08, z + 0.08, 0.32, 0.04, 0.08, "brass")
    box(x - 0.04, 0.08, z + 0.16, 0.08, 0.04, 0.2, "wood")
    for j in range(9):
        yy = 0.12 + j * 0.08
        zz = z + j * 0.04
        box(x + 0.16, yy, zz, 0.04, 0.04, 0.08, "iron")
        box(x + 0.24, yy, zz, 0.04, 0.04, 0.08, "iron")
        box(x + 0.16, yy, zz - 0.04, 0.12, 0.04, 0.04, "iron")
        box(x + 0.16, yy, zz + 0.08, 0.12, 0.04, 0.04, "iron")

# Dress the visible space beyond the arena walls as a real ruined courtyard.
group("27_Outer_Courtyard_Collapsed_Masonry")
for side in [-1, 1]:
    for z in np.arange(-7.6, 7.6, 0.44):
        x = side * 8.4 - 0.24
        for row in range(rng.choice([1, 2, 3, 4, 5])):
            native_box(x, row * 0.16, z, 0.48, 0.12, 0.4, rng.choice(["rock", "rock2", "rock3"]))
        for k in range(rng.choice([2, 3, 4])):
            xx = side * rng.choice([7.8, 8.08, 8.6, 8.84])
            zz = z + rng.choice([-0.2, 0, 0.16])
            w = rng.choice([0.12, 0.2, 0.28])
            native_box(
                xx - 0.12,
                0,
                zz,
                w,
                rng.choice([0.12, 0.16, 0.24]),
                0.2,
                rng.choice(["rock", "rock3"]),
            )
for z in [-7.76, 7.64]:
    for x in np.arange(-8.2, 8.2, 0.48):
        if abs(x) < 1.6:
            continue
        native_box(x, 0, z, 0.44, rng.choice([0.16, 0.24, 0.32]), 0.28, "rock2")
group("28_Outer_Courtyard_Overgrowth")
for side in [-1, 1]:
    for z in np.arange(-7.4, 7.4, 0.32):
        for k in range(rng.choice([2, 3, 4, 5])):
            x = side * (7.76 + k * 0.2)
            native_box(
                x - 0.08,
                0.0,
                z + (k % 3) * 0.08,
                0.16,
                rng.choice([0.04, 0.08, 0.12]),
                0.2,
                rng.choice(["darkLeaf", "moss", "moss2"]),
            )
for z in [-7.36, 7.24]:
    for x in np.arange(-7.8, 7.8, 0.32):
        if rng.random() < 0.7:
            native_box(x, 0, z, 0.28, 0.08, 0.16, rng.choice(["darkLeaf", "moss", "moss2"]))
group("29_Fallen_Columns_and_Old_Supplies")
for side in [-1, 1]:
    for z in [-5.8, -2.8, 0.4, 3.6, 6.0]:
        x = side * 8.04 - 0.2
        native_box(x, 0.04, z, 0.4, 0.36, 1.04, "rock3")
        for zz in [z, z + 0.92]:
            native_box(x - 0.08, 0, zz, 0.56, 0.44, 0.12, "edge")
        for zz in [z + 0.24, z + 0.44, z + 0.64]:
            native_box(x - 0.04, 0.36, zz, 0.48, 0.04, 0.04, "dark")
for side in [-1, 1]:
    for z in [-4.12, 1.92, 5.24]:
        x = side * 8.64 - 0.24
        native_box(x, 0, z, 0.56, 0.48, 0.56, "wood")
        native_box(x - 0.04, 0.08, z - 0.04, 0.64, 0.04, 0.64, "iron")
        native_box(x - 0.04, 0.36, z - 0.04, 0.64, 0.04, 0.64, "iron")
        for dx in [0, 0.12, 0.24, 0.36, 0.48]:
            native_box(x + dx, 0.48, z, 0.08, 0.04, 0.56, "wood2")
group("30_Outer_Lantern_Stations")
for side in [-1, 1]:
    for z in [-4.72, -1.12, 2.8, 6.4]:
        x = side * 8.0
        native_box(x - 0.24, 0, z - 0.24, 0.48, 0.16, 0.48, "rock3")
        native_box(x - 0.12, 0.16, z - 0.12, 0.24, 0.24, 0.24, "iron")
        native_box(x - 0.08, 0.2, z - 0.08, 0.16, 0.16, 0.16, "fire")
        native_box(x - 0.16, 0.4, z - 0.16, 0.32, 0.08, 0.32, "brass")
        lights.append(
            {
                "name": f"Outer_Lantern_{side}_{z}",
                "position": [x, 0.6, z],
                "color": [1, 0.62, 0.3],
                "intensity": 7,
                "range": 3,
            }
        )

group("31_Outer_Retaining_Walls")
for side in [-1, 1]:
    for z in np.arange(-8.12, 8.12, 0.4):
        for xx in np.arange(9.0, 10.92, 0.32):
            x = side * xx if side > 0 else -xx - 0.28
            native_box(x, 0, z, 0.28, 0.4, 0.36, rng.choice(["rock", "rock2", "rock3"]))
            if rng.random() < 0.76:
                native_box(
                    x,
                    0.4,
                    z,
                    0.28,
                    rng.choice([0.08, 0.16, 0.24]),
                    0.36,
                    rng.choice(["rock", "rock3"]),
                )
group("32_Outer_Wall_Climbing_Greenery")
for side in [-1, 1]:
    for z in np.arange(-7.92, 7.92, 0.28):
        for xx in [9.04, 9.32, 9.6, 9.88, 10.16, 10.44, 10.72]:
            if rng.random() < 0.58:
                x = side * xx if side > 0 else -xx - 0.16
                native_box(x, 0.4, z, 0.16, 0.04, 0.2, rng.choice(["darkLeaf", "moss", "moss2"]))
            if rng.random() < 0.2:
                x = side * xx if side > 0 else -xx - 0.12
                native_box(x, 0.4, z, 0.12, 0.28, 0.12, "darkLeaf")
                native_box(x - 0.04, 0.64, z - 0.04, 0.2, 0.08, 0.2, "moss2")

# One owner per native voxel: later modular props replace the backing beneath them.
WORLD = np.zeros(SHAPE, dtype=bool)
for v in reversed(list(groups.values())):
    v[WORLD] = 0
    WORLD |= v != 0
assert sum(np.count_nonzero(v) for v in groups.values()) == np.count_nonzero(WORLD)
triangles = glb(OUT / "万象战场-遗迹战盘.glb")
models = vox(OUT / "万象战场-遗迹战盘.vox")
# Store the intended fixed god-view camera in the transferable model itself.
p = OUT / "万象战场-遗迹战盘.glb"
raw = p.read_bytes()
jl = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20 : 20 + jl])
binary = bytearray(raw[28 + jl :])


def acc(values, ctype, kind, target):
    a = np.asarray(values, dtype="<f4" if ctype == 5126 else "<u4")
    while len(binary) % 4:
        binary.append(0)
    view = len(doc["bufferViews"])
    raw = a.tobytes()
    doc["bufferViews"].append(
        {"buffer": 0, "byteOffset": len(binary), "byteLength": len(raw), "target": target}
    )
    binary.extend(raw)
    item = {"bufferView": view, "componentType": ctype, "type": kind, "count": len(a)}
    if kind == "VEC3":
        item.update(min=a.min(0).tolist(), max=a.max(0).tolist())
    doc["accessors"].append(item)
    return len(doc["accessors"]) - 1


def addmesh(name, positions, normals, indices, mat, uv=None, parent=None):
    attributes = {
        "POSITION": acc(positions, 5126, "VEC3", 34962),
        "NORMAL": acc(normals, 5126, "VEC3", 34962),
    }
    if uv is not None:
        attributes["TEXCOORD_0"] = acc(uv, 5126, "VEC2", 34962)
    mesh = len(doc["meshes"])
    doc["meshes"].append(
        {
            "name": name,
            "primitives": [
                {
                    "attributes": attributes,
                    "indices": acc(indices, 5125, "SCALAR", 34963),
                    "material": mat,
                }
            ],
        }
    )
    node = len(doc["nodes"])
    doc["nodes"].append({"name": name, "mesh": mesh})
    if parent is None:
        doc["scenes"][0]["nodes"].append(node)
    else:
        doc["nodes"][parent].setdefault("children", []).append(node)
    return node


# A full 2:3 portrait image can replace this neutral template without touching geometry.
from PIL import Image, ImageDraw

im = Image.new("RGB", (600, 900))
px = im.load()
for yy in range(900):
    for xx in range(600):
        distance = ((xx - 300) / 420) ** 2 + ((yy - 430) / 660) ** 2
        v = int(174 - max(0, distance) * 34 + 6 * math.sin(yy / 180))
        px[xx, yy] = (v, min(255, v + 9), max(0, v - 3))
draw = ImageDraw.Draw(im)
draw.rounded_rectangle((30, 30, 570, 870), radius=150, outline=(130, 147, 137), width=2)
# Subtle guide figure is a replaceable texture, never a raised sculpted symbol.
draw.ellipse((238, 150, 362, 274), fill=(140, 155, 145))
draw.polygon(
    [(266, 275), (334, 275), (392, 400), (430, 720), (170, 720), (208, 400)], fill=(135, 150, 141)
)
draw.line([(300, 325), (300, 660)], fill=(151, 166, 155), width=2)
im.save(OUT / "立绘贴图示例-2比3.png")
while len(binary) % 4:
    binary.append(0)
image_raw = (OUT / "立绘贴图示例-2比3.png").read_bytes()
iv = len(doc["bufferViews"])
doc["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(image_raw)})
binary.extend(image_raw)
doc["images"] = [{"name": "Replaceable_Portrait_2x3", "bufferView": iv, "mimeType": "image/png"}]
doc["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]
doc["textures"] = [{"source": 0, "sampler": 0}]
artmat = len(doc["materials"])
doc["materials"].append(
    {
        "name": "CARD_ARTWORK_REPLACE_THIS_TEXTURE",
        "alphaMode": "MASK",
        "alphaCutoff": 0.05,
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "baseColorFactor": [1, 1, 1, 1],
            "roughnessFactor": 0.84,
            "metallicFactor": 0,
        },
    }
)
cardnodes = [
    (i, n["name"])
    for i, n in enumerate(doc["nodes"])
    if n.get("name", "").startswith("Placeholder_")
]
for node, name in cardnodes:
    x = [-2.56, 0, 2.56][int(name[-2:]) - 1] * XS
    z = (1.96 if "Friendly" in name else -1.96) * ZS
    w = 1.44
    h = 2.16
    y = 0.32
    # The top of every portrait points toward the enemy side of the screen.
    addmesh(
        name + "_Artwork",
        [
            [x - w / 2, y, z - h / 2],
            [x - w / 2, y, z + h / 2],
            [x + w / 2, y, z + h / 2],
            [x + w / 2, y, z - h / 2],
        ],
        [[0, 1, 0]] * 4,
        [0, 1, 2, 0, 2, 3],
        artmat,
        [[0, 0], [0, 1], [1, 1], [1, 0]],
        node,
    )
# Extended tiled ground is part of the GLB, so the scene continues beyond the screen.
for ci, cname in enumerate(["rock", "rock2", "rock3"]):
    positions = []
    normals = []
    indices = []
    for iz, z in enumerate(np.arange(-24, 24, 0.8)):
        for ix0, x in enumerate(np.arange(-24, 24, 0.8)):
            if abs(x) < 5.92 * XS and abs(z) < 4.64 * ZS:
                continue
            if (ix0 * 13 + iz * 7) % 3 != ci:
                continue
            i = len(positions)
            positions.extend(
                [
                    [x, -0.04, z],
                    [x, -0.04, z + 0.76],
                    [x + 0.76, -0.04, z + 0.76],
                    [x + 0.76, -0.04, z],
                ]
            )
            normals.extend([[0, 1, 0]] * 4)
            indices.extend([i, i + 1, i + 2, i, i + 2, i + 3])
    addmesh("24_Continuous_Outer_Floor_" + cname, positions, normals, indices, cid(cname) - 1)
    triangles += len(indices) // 3
# A darker continuous backing closes all mortar seams in the extended tiled ground.
addmesh(
    "24_Outer_Floor_Mortar",
    [[-24, -0.08, -24], [-24, -0.08, 24], [24, -0.08, 24], [24, -0.08, -24]],
    [[0, 1, 0]] * 4,
    [0, 1, 2, 0, 2, 3],
    cid("mortar") - 1,
)
triangles += 2
triangles += 12
doc["buffers"][0]["byteLength"] = len(binary)
while len(binary) % 4:
    binary.append(0)
angle = -math.atan2(18, 10)
doc["asset"]["generator"] = "Wanxiang voxel ruins battle board"
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
doc["extras"] = {
    "purpose": "Art asset only; three friendly front slots; rear party cards belong to future hand UI",
    "voxelSizeMeters": S,
}
js = json.dumps(doc, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
p.write_bytes(
    struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(binary))
    + struct.pack("<II", len(js), 0x4E4F534A)
    + js
    + struct.pack("<II", len(binary), 0x004E4942)
    + binary
)
carddoc = json.loads(json.dumps(doc))
original_node = next(
    i for i, n in enumerate(doc["nodes"]) if n.get("name") == "Placeholder_Friendly_01"
)
nodeids = [original_node, *doc["nodes"][original_node]["children"]]
meshid = [doc["nodes"][i]["mesh"] for i in nodeids]
carddoc["nodes"] = [dict(doc["nodes"][i]) for i in nodeids]
carddoc["nodes"][0].update(
    name="Portrait_Card_2x3", translation=[2.56 * XS, -0.16, -1.96 * ZS], children=[1]
)
for i, n in enumerate(carddoc["nodes"]):
    n["mesh"] = i
carddoc["meshes"] = [doc["meshes"][i] for i in meshid]
carddoc["scenes"] = [{"nodes": [0]}]
carddoc.pop("cameras", None)
carddoc.pop("extensions", None)
carddoc.pop("extensionsUsed", None)
carddoc["extras"] = {
    "purpose": "Standalone flat portrait card, replace CARD_ARTWORK_REPLACE_THIS_TEXTURE",
    "portraitAspectRatio": "2:3",
}
cardjs = json.dumps(carddoc, separators=(",", ":")).encode()
cardjs += b" " * ((-len(cardjs)) % 4)
(OUT / "卡牌-立绘平面.glb").write_bytes(
    struct.pack("<III", 0x46546C67, 2, 28 + len(cardjs) + len(binary))
    + struct.pack("<II", len(cardjs), 0x4E4F534A)
    + cardjs
    + struct.pack("<II", len(binary), 0x004E4942)
    + binary
)
stats = {
    "场景": "遗迹战盘庭院扩建版",
    "视角": "固定正交上帝视角",
    "体素边长米": S,
    "主体场景范围米": [15.4, 2.52, 13.92],
    "外围陈设范围米": [22, 16.6],
    "中央战盘米": [12.28, 10.32],
    "卡面尺寸米": [1.44, 2.16],
    "立绘贴图": "2比3，独立UV平面，PNG已内嵌GLB",
    "外围地砖延伸米": [48, 48],
    "我方前排槽位": 3,
    "敌方展示槽位": 3,
    "后三名角色": "后续手牌UI，场景不设置后排实体槽位",
    "可隐藏占位卡": 6,
    "体素数": int(np.count_nonzero(WORLD)),
    "网格模块": len(doc["meshes"]),
    "三角形": triangles,
    "VOX分块": models,
}
(OUT / "模型规格.json").write_text(
    json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
)
# Preview dependencies are supplied by the Demo vendor directory.
print(json.dumps(stats, ensure_ascii=False), flush=True)
