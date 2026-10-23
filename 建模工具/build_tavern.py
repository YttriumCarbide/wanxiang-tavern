import math, json, struct, random, time
from pathlib import Path
import numpy as np

from tavern_chair import tavern_chair

OUT = Path(__file__).resolve().parents[1] / "万象酒馆-体素模型"
S = 0.04
ORIGIN = np.array([-6.32, -0.4, -5.32])
SHAPE = (316, 100, 266)
rng = random.Random(142026)
palette = []
lookup = {}
groups = {}
A = None


def color(name, hex, emit=0):
    rgb = tuple(int(hex[i : i + 2], 16) for i in (0, 2, 4))
    idx = len(palette) + 1
    palette.append((name, rgb, emit))
    lookup[name] = idx
    return idx


for name, h in {
    "oak": "68442e",
    "oakDark": "493023",
    "oakLight": "855939",
    "oakGrain": "785035",
    "oakEdge": "986b44",
    "walnut": "483228",
    "walnutDark": "342721",
    "walnutLight": "594033",
    "plank": "8c6747",
    "plank2": "94704e",
    "plank3": "805c40",
    "grain": "765738",
    "stone": "646573",
    "stoneLight": "767782",
    "stoneDark": "525562",
    "grout": "3f424b",
    "sand": "938a77",
    "plaster": "c1b399",
    "plaster2": "b9ac94",
    "plaster3": "c6baa2",
    "iron": "303037",
    "ironLight": "4b4b51",
    "brass": "ad8647",
    "brassLight": "c3a267",
    "leather": "73433a",
    "leatherDark": "53322e",
    "rug": "693548",
    "rug2": "7b4256",
    "rug3": "552c40",
    "thread": "b99163",
    "green": "335d50",
    "greenLight": "4b7863",
    "blue": "37536e",
    "wine": "673943",
    "paper": "ded0aa",
    "paperShadow": "b9aa84",
    "cream": "ddd0b0",
    "tea": "493027",
    "black": "22242a",
    "moon": "526d88",
    "moon2": "627c92",
    "leaf": "557452",
    "purple": "65527e",
    "purple2": "78628f",
    "cyanDark": "275363",
    "cyanMid": "397c83",
    "violetDark": "3f3858",
    "violetMid": "62538b",
    "violetLight": "826dad",
    "bark": "5c3b29",
    "ember": "b74c2f",
    "terracotta": "9c6351",
    "cork": "9a7955",
}.items():
    color(name, h)
for name, h, e in [
    ("cyan", "72d2c7", 0.3),
    ("violet", "bca0e2", 0.4),
    ("fire", "f2b564", 0.4),
    ("flame", "ffe0a0", 0.6),
    ("mint", "99bd85", 0.15),
]:
    color(name, h, e)


def group(name):
    global A
    A = np.zeros(SHAPE, dtype=np.uint8)
    groups[name] = A


def ix(v, axis):
    return int(round((v - ORIGIN[axis]) / S))


def cid(c):
    return lookup[c] if isinstance(c, str) else c


def box(x, y, z, w, h, d, c):
    a, b, e = ix(x, 0), ix(y, 1), ix(z, 2)
    a1, b1, e1 = ix(x + w, 0), ix(y + h, 1), ix(z + d, 2)
    if a1 <= a or b1 <= b or e1 <= e:
        return
    assert 0 <= a < a1 <= SHAPE[0] and 0 <= b < b1 <= SHAPE[1] and 0 <= e < e1 <= SHAPE[2], (
        x,
        y,
        z,
        w,
        h,
        d,
    )
    A[a:a1, b:b1, e:e1] = cid(c)


def cell(x, y, z, c):
    box(x, y, z, S, S, S, c)


def topgrain(x, y, z, w, d, base="oakLight", grain="oakGrain"):
    box(x, y, z, w, S, d, base)
    for _ in range(max(2, int(w * d * 35))):
        px = x + rng.randrange(max(1, round(w / S))) * S
        pz = z + rng.randrange(max(1, round(d / S))) * S
        length = min(w - (px - x), rng.choice([0.08, 0.12, 0.2, 0.28, 0.36]))
        box(px, y, pz, length, S, S, grain)


def facegrain(x, y, z, w, h, base="oak", grain="oakDark"):
    box(x, y, z, w, h, S, base)
    for _ in range(max(2, int(w * h * 20))):
        px = x + rng.randrange(max(1, round(w / S))) * S
        py = y + rng.randrange(max(1, round(h / S))) * S
        box(px, py, z, S, min(h - (py - y), rng.choice([0.12, 0.2, 0.32])), S, grain)


def disk(cx, y, cz, r, h, c, inner=0):
    x0, x1 = ix(cx - r, 0), ix(cx + r, 0)
    z0, z1 = ix(cz - r, 2), ix(cz + r, 2)
    y0, y1 = ix(y, 1), ix(y + h, 1)
    xx = (np.arange(x0, x1) + 0.5) * S + ORIGIN[0]
    zz = (np.arange(z0, z1) + 0.5) * S + ORIGIN[2]
    dist = (xx[:, None] - cx) ** 2 + (zz[None, :] - cz) ** 2
    mask = (dist <= r * r) & (dist >= inner * inner)
    view = A[x0:x1, y0:y1, z0:z1]
    view[:] = np.where(mask[:, None, :], cid(c), view)


def line(a, b, width, c):
    a = np.asarray(a)
    b = np.asarray(b)
    steps = max(1, int(np.max(np.abs(b - a)) / S))
    for p in np.linspace(a, b, steps + 1):
        box(*p, width, width, width, c)


def framed(x, y, z, w, h, fill="leather", edge="brass"):
    box(x, y, z, w, h, 0.08, "walnutDark")
    box(x + 0.04, y + 0.04, z + 0.08, w - 0.08, h - 0.08, 0.04, edge)
    box(x + 0.08, y + 0.08, z + 0.12, w - 0.16, h - 0.16, 0.04, fill)


def candle(x, y, z):
    disk(x, y, z, 0.08, 0.04, "brass")
    disk(x, y + 0.04, z, 0.04, 0.16, "cream")
    cell(x - 0.02, y + 0.2, z - 0.02, "flame")


def mug(x, y, z):
    disk(x, y, z, 0.06, 0.12, "cream")
    disk(x, y + 0.12, z, 0.044, 0.04, "tea")
    box(x + 0.04, y + 0.04, z - 0.04, 0.08, 0.04, 0.04, "cream")
    box(x + 0.08, y + 0.04, z - 0.04, 0.04, 0.08, 0.04, "cream")
    box(x + 0.04, y + 0.12, z - 0.04, 0.08, 0.04, 0.04, "cream")


def bottle(x, y, z, c="green", height=0.28):
    disk(x, y, z, 0.06, 0.04, "greenLight" if c == "green" else c)
    disk(x, y + 0.04, z, 0.08, height - 0.12, c)
    disk(x, y + height - 0.08, z, 0.04, 0.08, c)
    cell(x - 0.02, y + height - 0.04, z - 0.02, "cork")
    box(x - 0.04, y + 0.08, z + 0.04, 0.08, 0.08, 0.04, "paper")
    cell(x - 0.04, y + 0.08, z + 0.08, "brass")


def chair(x, z, face="north", high=False):
    tavern_chair(box, x, z, face, high)


def barrel(x, y, z, r=0.28, h=0.72):
    for yy in np.arange(0, h, S):
        rr = r - 0.04 * (abs(yy / h - 0.5) * 2 > 0.72)
        disk(x, y + yy, z, rr, S, "oak")
        if abs(yy - 0.12) < 0.025 or abs(yy - (h - 0.16)) < 0.025:
            disk(x, y + yy, z, rr + 0.02, S, "iron", rr - 0.025)
    disk(x, y + h, z, r - 0.04, 0.04, "oakLight")
    # Flush lid: recolor only existing cap cells, never add raised strips.
    x0, x1 = ix(x - r, 0), ix(x + r, 0)
    z0, z1 = ix(z - r, 2), ix(z + r, 2)
    yy = ix(y + h, 1)
    for zz in range(z0, z1):
        row = A[x0:x1, yy, zz]
        row[row != 0] = cid("oakGrain" if (zz - z0) % 3 == 0 else "oakLight")
    # Stave lines around the curved silhouette.
    for angle in np.arange(0, 2 * math.pi, math.pi / 8):
        px = x + math.cos(angle) * (r - 0.04)
        pz = z + math.sin(angle) * (r - 0.04)
        box(px - 0.02, y + 0.2, pz - 0.02, 0.04, h - 0.4, 0.04, "oakDark")


def book(x, y, z, w=0.12, h=0.24, c="wine"):
    box(x, y, z, w, h, 0.2, c)
    box(x + 0.04, y + 0.04, z + 0.2, max(0.04, w - 0.08), h - 0.08, 0.04, "paperShadow")
    box(x, y + 0.04, z + 0.2, w, 0.04, 0.04, "brass")
    box(x, y + h - 0.08, z + 0.2, w, 0.04, 0.04, "brass")


def plaque(x, y, z, w=0.32, h=0.44, accent="cyan", motif="diamond"):
    framed(x, y, z, w, h, "walnutDark", "brass")
    box(x + 0.1, y + 0.08, z + 0.16, w - 0.2, 0.04, 0.04, "paperShadow")
    cx = x + w / 2
    cy = y + h * 0.58
    front = z + 0.16
    if motif == "leaf":
        for dy, ww in [(0, 0.04), (0.04, 0.12), (0.08, 0.16), (0.12, 0.12), (0.16, 0.04)]:
            box(cx - ww / 2, cy - 0.08 + dy, front, ww, 0.04, 0.04, accent)
        line((cx - 0.04, cy - 0.08, front), (cx + 0.08, cy + 0.08, front), 0.04, "green")
    elif motif == "sword":
        box(cx - 0.02, cy - 0.12, front, 0.04, 0.28, 0.04, accent)
        box(cx - 0.1, cy - 0.08, front, 0.2, 0.04, 0.04, "brass")
    elif motif == "star":
        box(cx - 0.02, cy - 0.12, front, 0.04, 0.24, 0.04, accent)
        box(cx - 0.12, cy - 0.02, front, 0.24, 0.04, 0.04, accent)
        for dx, dyy in [(-0.08, -0.08), (0.04, -0.08), (-0.08, 0.04), (0.04, 0.04)]:
            cell(cx + dx, cy + dyy, front, accent)
    else:
        for dy, ww in [(0, 0.04), (0.04, 0.12), (0.08, 0.2), (0.12, 0.12), (0.16, 0.04)]:
            box(cx - ww / 2, cy - 0.08 + dy, front, ww, 0.04, 0.04, accent)
    for dx in [0.04, w - 0.08]:
        cell(x + dx, y + 0.04, z + 0.16, "brassLight")
        cell(x + dx, y + h - 0.08, z + 0.16, "brassLight")


group("01_Foundation")
box(-6.2, -0.4, -5.2, 12.4, 0.24, 10.4, "stoneDark")
box(-6.04, -0.16, -5.04, 12.08, 0.12, 10.08, "walnutDark")
group("02_Parquet_Floor")
for row, z in enumerate(np.arange(-5, 5, 0.2)):
    for x in np.arange(-6 - (row % 2) * 0.8, 6, 1.6):
        x0 = max(-6, x)
        x1 = min(6, x + 1.56)
        if x1 <= x0:
            continue
        base = rng.choice(["plank", "plank2", "plank3"])
        box(x0, -0.04, z, x1 - x0, 0.04, 0.16, base)
        for _ in range(3):
            px = x0 + rng.randrange(max(1, round((x1 - x0) / S))) * S
            box(
                px,
                -0.04,
                z + rng.choice([0, 0.04, 0.08]),
                min(x1 - px, rng.choice([0.16, 0.28, 0.4])),
                0.04,
                0.04,
                "grain",
            )
        if x1 - x0 > 0.32:
            for px in [x0 + 0.08, x1 - 0.12]:
                cell(px, -0.04, z + 0.04, "walnut")
group("03_Masonry_Walls")
box(-6.2, 0, -5.2, 12.4, 3.52, 0.2, "plaster")
box(-6.2, 0, 5, 12.4, 3.52, 0.2, "plaster")
box(-6.2, 0, -5, 0.2, 3.52, 10, "plaster2")
box(6, 0, -5, 0.2, 3.52, 10, "plaster2")
# Wainscot bricks, small mortar recess and subtle chips.
for y in np.arange(0, 0.96, 0.16):
    for x in np.arange(-6 - (int(y / 0.16) % 2) * 0.24, 6, 0.48):
        x0 = max(-6, x)
        w = min(6, x + 0.44) - x0
        if w <= 0:
            continue
        for z in [-5, 4.96]:
            box(x0, y, z, w, 0.12, 0.04, rng.choice(["stone", "stoneLight", "stoneDark"]))
    for z in np.arange(-5 - (int(y / 0.16) % 2) * 0.24, 5, 0.48):
        z0 = max(-5, z)
        d = min(5, z + 0.44) - z0
        if d <= 0:
            continue
        for x in [-6, 5.96]:
            box(x, y, z0, 0.04, 0.12, d, rng.choice(["stone", "stoneLight", "stoneDark"]))
# Plaster pixel weathering at a quieter scale than the masonry.
for _ in range(220):
    x = rng.uniform(-5.9, 5.7)
    y = rng.uniform(1.12, 3.32)
    box(
        x, y, -4.96, rng.choice([0.08, 0.12, 0.2]), 0.04, 0.04, rng.choice(["plaster2", "plaster3"])
    )
group("04_Timber_Frame")
for x in [-5.88, -3.0, 0, 3.0, 5.72]:
    for z in [-4.92, 4.72]:
        box(x, 0, z, 0.2, 3.52, 0.2, "walnut")
        facegrain(x + 0.04, 0.16, z + 0.2, 0.12, 3.12, "oak", "oakDark")
        box(x - 0.04, 0.88, z - 0.04, 0.28, 0.12, 0.28, "oakEdge")
for z in [-4.8, -2.4, 0, 2.4, 4.64]:
    for x in [-5.96, 5.76]:
        box(x, 0, z, 0.2, 3.52, 0.2, "walnut")
for y, h in [(0, 0.12), (0.96, 0.12), (3.2, 0.2)]:
    box(-6, y, -4.96, 12, h, 0.12, "walnut")
    box(-6, y, 4.84, 12, h, 0.12, "walnut")
    box(-5.96, y, -5, 0.12, h, 10, "walnut")
    box(5.84, y, -5, 0.12, h, 10, "walnut")
for x in [-5.76, -2.84, 0.16, 3.16]:
    line((x, 2.72, -4.72), (x + 0.48, 3.2, -4.72), 0.12, "oak")
group("05_Ceiling")
box(-6, 3.52, -5, 12, 0.08, 10, "oak")
for x in np.arange(-6, 6, 0.16):
    box(x, 3.48, -5, 0.12, 0.04, 10, rng.choice(["oak", "oakGrain", "oakLight"]))
    for _ in range(4):
        box(x, 3.44, rng.uniform(-4.9, 4.8), 0.04, 0.04, 0.2, "oakDark")
for x in [-4, -1.32, 1.32, 4]:
    box(x, 3.28, -5, 0.2, 0.24, 10, "walnut")
    box(x - 0.04, 3.24, -4.8, 0.28, 0.04, 0.24, "oakEdge")
box(-6, 3.24, -0.08, 12, 0.24, 0.2, "walnut")

group("06_Windows_and_Entrance")
# Continuous panes and distinct depth layers eliminate mosaic gaps and overlaps.
for side in [-1, 1]:

    def wb(depth, y, z, w, h, d, c):
        xx = -6 + depth if side == -1 else 6 - depth - w
        box(xx, y, z, w, h, d, c)

    for z0 in [-1.9, 2.96]:
        wb(0.12, 0.92, z0, 0.12, 1.44, 1.12, "walnutDark")
        wb(0.24, 1.04, z0 + 0.12, 0.04, 1.2, 0.88, "moon")
        for yy in [0.92, 2.28]:
            wb(0.28, yy, z0, 0.08, 0.08, 1.12, "oakEdge")
        for zz in [z0, z0 + 1.04]:
            wb(0.28, 0.92, zz, 0.08, 1.44, 0.08, "oak")
        for yy in [1.44, 1.84]:
            wb(0.28, yy, z0 + 0.08, 0.04, 0.04, 0.96, "brass")
        for zz in [z0 + 0.4, z0 + 0.72]:
            wb(0.28, 1.0, zz, 0.04, 1.28, 0.04, "brass")
        wb(0.12, 0.84, z0 - 0.08, 0.32, 0.08, 1.28, "oakEdge")
        for zz in [z0 - 0.16, z0 + 1.16]:
            wb(0.16, 0.96, zz, 0.08, 1.32, 0.08, "oak")
        # Fittings belong to the outer frame, never to the glass surface.
        for yy in [0.96, 2.24]:
            for zz in [z0 + 0.04, z0 + 1.04]:
                wb(0.36, yy, zz, 0.04, 0.04, 0.04, "iron")
box(-0.64, 0, 4.76, 1.28, 2.32, 0.16, "walnutDark")
for x in np.arange(-0.52, 0.52, 0.12):
    facegrain(x, 0.04, 4.72, 0.08, 2.16, "oak", "oakDark")
for yy in [0.36, 1.76]:
    box(-0.52, yy, 4.68, 1.04, 0.08, 0.04, "iron")
for xx in [-0.68, 0.6]:
    box(xx, 0, 4.6, 0.08, 2.32, 0.2, "oakEdge")
box(-0.68, 2.24, 4.6, 1.36, 0.12, 0.2, "oakEdge")
box(0.32, 1, 4.6, 0.08, 0.12, 0.08, "brass")
box(-0.48, 2.56, 4.64, 0.96, 0.28, 0.08, "walnutDark")
box(-0.36, 2.64, 4.6, 0.72, 0.04, 0.04, "brass")

group("10_Bar_Counter")
box(-5.16, 0, -3.84, 3.52, 1, 0.76, "walnut")
for x in np.arange(-5.04, -1.72, 0.56):
    framed(x, 0.12, -3.04, 0.44, 0.68, "oak", "walnutDark")
    facegrain(x + 0.12, 0.28, -2.88, 0.2, 0.4, "oak", "oakDark")
box(-5.28, 1, -3.92, 3.76, 0.08, 0.96, "walnutDark")
topgrain(-5.24, 1.04, -3.88, 3.68, 0.88, "oakLight", "oakGrain")
box(-5.12, 0.2, -2.64, 3.44, 0.04, 0.04, "iron")
for x in [-4.6, -3.4, -2.2]:
    chair(x, -2.44, high=True)
group("11_Bar_Back_Shelf")
box(-5.24, 0.28, -4.88, 3.72, 2.36, 0.16, "walnutDark")
for x in [-5.24, -4.0, -2.76, -1.6]:
    box(x, 0.32, -4.8, 0.08, 2.32, 0.32, "oak")
for yy in [0.48, 1.12, 1.76, 2.4]:
    box(-5.24, yy, -4.8, 3.72, 0.08, 0.44, "oakLight")
for yy in [0.56, 1.2, 1.84]:
    for x in np.arange(-5.04, -1.6, 0.28):
        bottle(x, yy, -4.56, rng.choice(["green", "wine", "blue"]), rng.choice([0.24, 0.28, 0.32]))
# Hand-held counter props are rebuilt on the fine near-view grid below.
# Brass taps and a small drip tray.
box(-2.8, 1.08, -3.72, 0.32, 0.04, 0.24, "iron")
box(-2.68, 1.12, -3.64, 0.08, 0.28, 0.08, "brass")
box(-2.72, 1.36, -3.6, 0.16, 0.04, 0.04, "brass")
box(-4.8, 2.88, -4.44, 2.96, 0.4, 0.08, "walnut")
box(-4.68, 2.96, -4.32, 2.72, 0.24, 0.04, "oakEdge")
for xx in [-4.6, -2.04]:
    box(xx, 3.28, -4.4, 0.04, 0.2, 0.04, "iron")
# Tankard icon and little carved marks on the tavern sign.
box(-3.44, 2.96, -4.28, 0.24, 0.2, 0.04, "brassLight")
box(-3.2, 3, -4.28, 0.08, 0.12, 0.04, "brass")
for x in [-4.4, -4.08, -2.88, -2.56]:
    box(x, 3.04, -4.28, 0.16, 0.04, 0.04, "walnutDark")
# The west rear corner is reserved for the separately exported supply machines.

group("13_Seating_and_Tables")


def table(cx, cz, r=0.64):
    disk(cx, 0.68, cz, r, 0.04, "walnut")
    disk(cx, 0.72, cz, r - 0.02, 0.04, "oakLight")
    for xx in np.arange(cx - r, cx + r, 0.16):
        width = math.sqrt(max(0, (r - 0.04) ** 2 - (xx - cx) ** 2)) * 2
        if width > 0.04:
            box(xx, 0.72, cz - width / 2, 0.04, 0.04, width, "oakGrain")
    for _ in range(35):
        px = rng.uniform(-r * 0.8, r * 0.8)
        pz = rng.uniform(-r * 0.8, r * 0.8)
        if px * px + pz * pz < (r - 0.08) ** 2:
            box(cx + px, 0.72, cz + pz, 0.04, 0.04, 0.08, "oakEdge")
    box(cx - 0.12, 0, cz - 0.12, 0.24, 0.68, 0.24, "walnut")
    box(cx - 0.44, 0.08, cz - 0.08, 0.88, 0.08, 0.16, "walnut")
    box(cx - 0.08, 0.08, cz - 0.44, 0.16, 0.08, 0.88, "walnut")
    chair(cx, cz + r + 0.32, "north")
    chair(cx - r - 0.32, cz, "east")
    chair(cx + r + 0.32, cz, "west")
    # Near-view tableware is built separately on a 2 cm grid below.


table(0.2, 1.64, 0.64)
table(3.84, 3.0, 0.56)
# Keep the east bench; the west rear bench gives the supply corner a clear footprint.
for x in [1.5]:
    for dx in [0, 1.32]:
        box(x + dx, 0, 4.24, 0.12, 0.44, 0.36, "walnut")
    topgrain(x, 0.44, 4.12, 1.48, 0.48, "oak", "oakDark")
    box(x, 0.52, 4.48, 1.48, 0.6, 0.08, "walnut")
    for xx in np.arange(x + 0.04, x + 1.4, 0.2):
        box(xx, 0.6, 4.4, 0.16, 0.44, 0.04, "oak")
    for dx in [0.12, 0.8]:
        box(x + dx, 0.48, 4.16, 0.52, 0.08, 0.32, "leather")
group("14_Woven_Rugs")


def rug(x, z, w, d, base="rug"):
    box(x, 0.0, z, w, 0.04, d, base)
    for xx in np.arange(x + 0.08, x + w - 0.08, 0.08):
        cell(xx, 0, z + 0.04, "thread")
        cell(xx, 0, z + d - 0.08, "thread")
    for zz in np.arange(z + 0.08, z + d - 0.08, 0.08):
        cell(x + 0.04, 0, zz, "thread")
        cell(x + w - 0.08, 0, zz, "thread")
    for xx in np.arange(x + 0.16, x + w - 0.16, 0.16):
        for zz in np.arange(z + 0.16, z + d - 0.16, 0.16):
            c = "rug2" if (round((xx - x) / 0.16) + round((zz - z) / 0.16)) % 2 else "rug3"
            cell(xx, 0, zz, c)
    for xx in np.arange(x + 0.24, x + w - 0.24, 0.32):
        for zz in np.arange(z + 0.24, z + d - 0.24, 0.32):
            if abs((xx - (x + w / 2)) / (w / 2)) + abs((zz - (z + d / 2)) / (d / 2)) < 0.7:
                cell(xx, 0, zz, "thread")
                cell(xx + 0.04, 0, zz + 0.04, "rug2")


rug(-1.16, 0.48, 2.72, 2.52)
rug(3.04, 2.24, 1.64, 1.8)
rug(3.24, -1.08, 1.72, 1.76, "green")

group("15_Hearth_and_Firewood")
box(3.76, 0, -4.96, 1.56, 0.12, 0.88, "stoneDark")
box(3.84, 0.12, -4.96, 0.28, 1.08, 0.64, "stone")
box(4.96, 0.12, -4.96, 0.28, 1.08, 0.64, "stone")
box(4.12, 0.12, -4.92, 0.84, 0.88, 0.12, "black")
for yy in np.arange(0.12, 1.2, 0.16):
    for xx in [3.84, 4.96]:
        box(xx, yy, -4.28, 0.28, 0.12, 0.04, rng.choice(["stone", "stoneLight"]))
box(3.84, 1.12, -4.96, 1.4, 0.16, 0.68, "stoneLight")
topgrain(3.68, 1.28, -4.96, 1.72, 0.8, "oakLight", "oakDark")
box(4, 1.4, -4.96, 1.08, 2.08, 0.4, "stone")
for yy in np.arange(1.4, 3.48, 0.2):
    for xx in np.arange(4, 5.08, 0.28):
        box(xx, yy, -4.52, 0.24, 0.16, 0.04, rng.choice(["stone", "stoneLight", "stoneDark"]))
for xx in [4.16, 4.6]:
    box(xx, 0.16, -4.52, 0.32, 0.12, 0.12, "bark")
for xx, hh in [(4.2, 0.2), (4.4, 0.28), (4.64, 0.16)]:
    box(xx, 0.28, -4.52, 0.08, hh, 0.08, "fire")
    cell(xx, 0.28 + hh, -4.52, "flame")
for xx in [3.92, 5.04]:
    candle(xx, 1.32, -4.52)
framed(4.16, 2.12, -4.48, 0.76, 0.56, "leather", "brass")
for yy in [0.04, 0.16]:
    for zz in [-4.36, -4.12, -3.88]:
        box(5.4, yy, zz, 0.36, 0.12, 0.16, "bark")
        box(5.4, yy + 0.04, zz + 0.16, 0.32, 0.04, 0.04, "oakLight")

group("16_Arcane_Bookcase")
box(4.72, 0, -3.32, 1.08, 2.04, 0.24, "walnutDark")
for xx in [4.72, 5.72]:
    box(xx, 0, -3.32, 0.08, 2.08, 0.36, "oak")
for yy in [0.12, 0.6, 1.08, 1.56, 2]:
    box(4.72, yy, -3.32, 1.08, 0.08, 0.4, "oakLight")
for yy in [0.2, 0.68, 1.16, 1.64]:
    for xx in np.arange(4.84, 5.64, 0.16):
        book(
            xx,
            yy,
            -3.08,
            0.12,
            rng.choice([0.24, 0.28, 0.32]),
            rng.choice(["wine", "green", "blue", "purple"]),
        )
box(4.68, 2.08, -3.36, 1.16, 0.08, 0.44, "walnut")
box(5, 2.2, -3.16, 0.28, 0.2, 0.2, "terracotta")
for xx, yy in [(5, 2.4), (5.12, 2.48), (4.96, 2.56)]:
    box(xx, yy, -3.12, 0.12, 0.12, 0.12, "leaf")

# Turn the complete case against the east wall, including its books and plant.
bookcase_indices = np.argwhere(A)
bookcase_points = ORIGIN + (bookcase_indices + 0.5) * S
bookcase_positions = bookcase_points.copy()
bookcase_positions[:, 0] = 5.88 - (bookcase_points[:, 2] + 3.32)
bookcase_positions[:, 2] = -3.6 + (bookcase_points[:, 0] - 4.72)
bookcase_target = np.floor((bookcase_positions - ORIGIN) / S + 1e-6).astype(int)
bookcase_volume = np.zeros(SHAPE, dtype=np.uint8)
bookcase_volume[tuple(bookcase_target.T)] = A[tuple(bookcase_indices.T)]
groups["16_Arcane_Bookcase"] = bookcase_volume

group("20_Summoning_Arrival_Gate")
box(-5.44, 0, 0.04, 2.08, 0.08, 1.84, "stoneDark")
box(-5.36, 0.08, 0.12, 1.92, 0.08, 1.68, "stone")
box(-5.28, 0.16, 0.2, 1.76, 0.04, 1.52, "cyanDark")
# The middle is an unobstructed landing floor, not a table or a card rack.
disk(-4.4, 0.2, 1.12, 0.52, 0.04, "cyan", 0.48)
disk(-4.4, 0.2, 1.12, 0.36, 0.04, "brass", 0.32)
for a in np.arange(0, 2 * math.pi, math.pi / 8):
    cell(-4.4 + math.cos(a) * 0.44, 0.2, 1.12 + math.sin(a) * 0.44, "cyan")
for xx in [-5.32, -3.76]:
    box(xx, 0.2, 0.24, 0.28, 2.2, 0.36, "cyanDark")
    box(xx - 0.04, 0.2, 0.2, 0.36, 0.12, 0.44, "brass")
    for yy in np.arange(0.4, 2.4, 0.24):
        box(xx + 0.04, yy, 0.6, 0.2, 0.12, 0.04, "stoneDark")
        box(xx + 0.08, yy + 0.04, 0.64, 0.12, 0.04, 0.04, "cyan")
    box(xx - 0.04, 2.4, 0.2, 0.36, 0.12, 0.44, "brass")
box(-5.04, 2.44, 0.24, 1.28, 0.16, 0.36, "cyanDark")
box(-4.88, 2.6, 0.24, 0.96, 0.12, 0.36, "brass")
box(-4.72, 2.72, 0.24, 0.64, 0.08, 0.36, "cyanDark")
# Abstract cyan seal; no humanoid imagery.
for xx in [-4.6, -4.48, -4.36, -4.24]:
    box(xx, 2.64, 0.64, 0.04, 0.08, 0.04, "cyan")
box(-5.04, 0.2, 0.56, 0.04, 2.24, 0.04, "cyan")
box(-3.8, 0.2, 0.56, 0.04, 2.24, 0.04, "cyan")
box(-5.04, 2.4, 0.56, 1.28, 0.04, 0.04, "cyan")
group("20_Summoning_Field")
box(-5, 0.2, 0.4, 1.2, 2.2, 0.04, "cyanDark")
for xx in np.arange(-5, -3.8, 0.04):
    for yy in np.arange(0.2, 2.4, 0.04):
        v = math.sin(xx * 8 + yy * 4) + math.cos(yy * 10) * 0.3
        cell(xx, yy, 0.44, "cyanMid" if v > -0.3 else "cyanDark")
for i, xx in enumerate([-5.18, -3.62]):
    group("20_Summoning_Crystal_" + str(i))
    for yy, r in [(2.56, 0.04), (2.6, 0.08), (2.64, 0.12), (2.68, 0.08), (2.72, 0.04)]:
        disk(xx, yy, 0.4, r, 0.04, "cyan")

group("21_Dungeon_Runegate")
box(-0.04, 0, -4.96, 2.32, 0.08, 1.0, "stoneDark")
box(0.04, 0.08, -4.96, 2.16, 0.08, 0.8, "stone")
box(0.12, 0.16, -4.96, 2, 0.08, 0.6, "stoneLight")
for xx in [0.12, 1.8]:
    box(xx, 0.24, -4.96, 0.36, 2.04, 0.36, "stoneDark")
    for yy in np.arange(0.24, 2.28, 0.2):
        box(xx, yy, -4.6, 0.36, 0.16, 0.04, rng.choice(["stone", "stoneLight", "stoneDark"]))
        box(xx + 0.08, yy + 0.04, -4.56, 0.2, 0.04, 0.04, "brass")
    box(xx - 0.04, 0.16, -4.96, 0.44, 0.16, 0.44, "stone")
    box(xx - 0.04, 2.28, -4.96, 0.44, 0.12, 0.44, "brass")
box(0.4, 2.4, -4.96, 1.52, 0.16, 0.36, "stoneLight")
box(0.6, 2.56, -4.96, 1.12, 0.12, 0.36, "stone")
box(0.84, 2.68, -4.96, 0.64, 0.08, 0.36, "brass")
group("21_Dungeon_Field")
box(0.48, 0.24, -4.8, 1.32, 2.12, 0.08, "violetDark")
# Detailed concentric pixel field; low emission preserves violet contrast.
for xx in np.arange(0.48, 1.8, 0.04):
    for yy in np.arange(0.24, 2.36, 0.04):
        d = ((xx - 1.14) / 0.64) ** 2 + ((yy - 1.3) / 1.04) ** 2
        v = math.sin(d * 16 + yy * 2.8) + math.sin(xx * 18 - yy * 5) * 0.24
        c = "violetLight" if v > 0.7 else "violetMid" if v > -0.4 else "violetDark"
        cell(xx, yy, -4.68, c)
group("21_Dungeon_Threshold_Details")
for xx in [0.44, 1.8]:
    box(xx, 0.24, -4.52, 0.04, 2.12, 0.04, "violet")
box(0.44, 2.36, -4.52, 1.4, 0.04, 0.04, "violet")
for xx in [0.96, 1.08, 1.2, 1.32]:
    cell(xx, 2.6, -4.52, "violet")
line((0.96, 2.56, -4.48), (1.28, 2.76, -4.48), 0.04, "brass")
line((1.28, 2.56, -4.44), (0.96, 2.76, -4.44), 0.04, "brass")
for xx in [-0.16, 2.36]:
    box(xx, 0.08, -4, 0.12, 0.6, 0.12, "stoneDark")
    disk(xx + 0.06, 0.68, -3.94, 0.1, 0.04, "brass")
    disk(xx + 0.06, 0.72, -3.94, 0.06, 0.08, "violet")

group("22_Roguelike_Three_Choice_Desk")
for xx, zz in [(3.48, -0.8), (4.64, -0.8), (3.48, -0.12), (4.64, -0.12)]:
    box(xx, 0, zz, 0.08, 0.76, 0.08, "walnut")
    box(xx - 0.04, 0.08, zz - 0.04, 0.16, 0.08, 0.16, "brass")
box(3.4, 0.68, -0.88, 1.44, 0.08, 0.92, "walnutDark")
topgrain(3.4, 0.76, -0.88, 1.44, 0.92, "oakLight", "oakGrain")
for xx, accent, motif in [
    (3.44, "mint", "leaf"),
    (3.96, "fire", "sword"),
    (4.48, "violet", "star"),
]:
    box(xx + 0.12, 0.8, -0.84, 0.08, 0.12, 0.12, "brass")
    plaque(xx, 0.92, -0.88, 0.36, 0.48, accent, motif)
# Detailed pages, candle holders and frame studs are added as near-view props.
chair(4.12, 0.52)

group("23_Lanterns_and_Chandeliers")
lights = []


def lantern(x, y, z):
    box(x - 0.12, y, z - 0.08, 0.24, 0.04, 0.2, "iron")
    box(x - 0.08, y + 0.04, z - 0.04, 0.16, 0.28, 0.12, "flame")
    for xx in [x - 0.12, x + 0.08]:
        box(xx, y, z - 0.08, 0.04, 0.36, 0.2, "iron")
    box(x - 0.12, y + 0.32, z - 0.08, 0.24, 0.04, 0.2, "iron")
    box(x - 0.04, y + 0.36, z, 0.08, 0.12, 0.04, "brass")
    lights.append(
        {
            "name": "Lantern",
            "position": [x, y + 0.16, z + 0.18],
            "color": [1, 0.73, 0.42],
            "intensity": 10,
            "range": 7,
        }
    )


for x in [-1.12, 2.88]:
    lantern(x, 2.12, -4.68)
for x in [-3.12, 3.44]:
    lantern(x, 2.08, 4.52)
for cx, cz in [(-2.2, -0.72), (2.2, 2.12)]:
    box(cx - 0.02, 2.84, cz - 0.02, 0.04, 0.68, 0.04, "iron")
    disk(cx, 2.72, cz, 0.42, 0.08, "iron", 0.34)
    for a in np.arange(0, 2 * math.pi, math.pi / 3):
        xx = cx + math.cos(a) * 0.4
        zz = cz + math.sin(a) * 0.4
        candle(xx, 2.76, zz)
        line((cx, 2.8, cz), (xx, 2.8, zz), 0.04, "iron")
    lights.append(
        {
            "name": "Chandelier",
            "position": [cx, 2.36, cz],
            "color": [1, 0.78, 0.52],
            "intensity": 32,
            "range": 13,
        }
    )
lights += [
    {
        "name": "Hearth",
        "position": [4.48, 0.64, -4.08],
        "color": [1, 0.48, 0.2],
        "intensity": 10,
        "range": 6,
    },
    {
        "name": "Runegate",
        "position": [1.14, 1.4, -4.32],
        "color": [0.56, 0.4, 1],
        "intensity": 5,
        "range": 5,
    },
    {
        "name": "Summoning",
        "position": [-5.16, 1.24, 1.24],
        "color": [0.3, 0.85, 0.78],
        "intensity": 4,
        "range": 4,
    },
    {
        "name": "Counter_Candle",
        "position": [-3.94, 1.36, -3.7],
        "color": [1, 0.76, 0.45],
        "intensity": 1.6,
        "range": 3,
    },
]

group("24_Wall_Dressing")
# Banners, coat hooks, small framed maps, and wall ledges occupy the empty walls.
for xx in [-4.48, 4.8]:
    box(xx, 1.4, 4.72, 0.56, 1.28, 0.04, "leatherDark")
    box(xx + 0.04, 1.4, 4.68, 0.48, 1.24, 0.04, "rug")
    box(xx - 0.04, 2.68, 4.6, 0.64, 0.04, 0.08, "brass")
    for yy, ww in [(1.8, 0.08), (1.84, 0.16), (1.88, 0.24), (1.92, 0.16), (1.96, 0.08)]:
        box(xx + 0.28 - ww / 2, yy, 4.64, ww, 0.04, 0.04, "thread")
box(3.64, 1.56, 4.8, 0.92, 0.68, 0.08, "walnut")
box(3.68, 1.6, 4.76, 0.84, 0.6, 0.04, "brass")
box(3.72, 1.64, 4.72, 0.76, 0.52, 0.04, "paperShadow")
for xx in [3.8, 4.08, 4.28]:
    line((xx, 1.68, 4.68), (xx + 0.12, 2, 4.68), 0.04, "oak")
for x in [1.12, 1.64]:
    box(x, 1.56, 4.64, 0.12, 0.08, 0.12, "iron")
box(5.68, 1.2, 0.64, 0.28, 0.08, 1.44, "oakLight")
for z in [0.76, 1.16, 1.72]:
    box(5.6, 1.28, z, 0.24, 0.28, 0.28, "terracotta")
    box(5.6, 1.56, z, 0.24, 0.24, 0.24, "leaf")
# Fine plaster patina on the remaining walls as well.
group("25_Plaster_Patina")
for _ in range(260):
    zz = rng.uniform(-4.7, 4.7)
    yy = rng.uniform(1.2, 3.04)
    if 0.84 <= yy <= 2.44 and any(a - 0.24 < zz < a + 1.36 for a in [-1.9, 2.96]):
        continue
    if any(p - 0.16 < zz < p + 0.36 for p in [-4.8, -2.4, 0, 2.4, 4.64]):
        continue
    for xx in [-5.96, 5.92]:
        box(
            xx,
            yy,
            zz,
            0.04,
            0.04,
            rng.choice([0.08, 0.12, 0.2]),
            rng.choice(["plaster2", "plaster3"]),
        )
for _ in range(110):
    xx = rng.uniform(-5.7, 5.6)
    yy = rng.uniform(1.16, 3.12)
    if any(
        a - 0.08 < xx < b + 0.08 and y0 - 0.08 < yy < y1 + 0.08
        for a, b, y0, y1 in [
            (-4.52, -3.84, 1.4, 2.72),
            (3.6, 4.6, 1.56, 2.28),
            (4.76, 5.4, 1.4, 2.72),
        ]
    ):
        continue
    box(
        xx,
        yy,
        4.96,
        rng.choice([0.08, 0.12, 0.2]),
        0.04,
        0.04,
        rng.choice(["plaster2", "plaster3"]),
    )

group("26_Additional_Interior_Details")
# Serving tray, napkins and a short pile of maps on the bar.
box(-4.68, 1.08, -3.8, 0.48, 0.04, 0.28, "ironLight")
for xx in [-4.68, -4.24]:
    box(xx, 1.12, -3.8, 0.04, 0.04, 0.28, "iron")
box(-4.52, 1.12, -3.72, 0.16, 0.04, 0.16, "cream")
box(-4.48, 1.16, -3.72, 0.12, 0.04, 0.12, "paperShadow")
# Stack of books beside the hearth, simple iron poker and a shallow copper bowl.
for yy, c in [(0.04, "wine"), (0.12, "green"), (0.2, "blue")]:
    box(3.24, yy, -4.32, 0.32, 0.08, 0.24, c)
    box(3.28, yy, -4.04, 0.24, 0.04, 0.04, "paper")
box(3.44, 0.08, -4.76, 0.04, 0.92, 0.04, "iron")
box(3.4, 0.96, -4.76, 0.16, 0.04, 0.04, "iron")
disk(4.48, 1.32, -4.6, 0.12, 0.04, "brass")
disk(4.48, 1.36, -4.6, 0.12, 0.04, "brass", 0.08)

# Mount the entire arrival gate against the left wall, facing into the room.
for name, vol in list(groups.items()):
    if not name.startswith("20_"):
        continue
    points = np.argwhere(vol)
    new = np.zeros_like(vol)
    xx = ix(-5.96, 0) + (points[:, 2] - ix(0.04, 2))
    zz = ix(1.24, 2) - (points[:, 0] - ix(-4.4, 0)) - 1
    new[xx, points[:, 1], zz] = vol[tuple(points.T)]
    groups[name] = new
group("20_Wall_Mount")
box(-5.96, 0.2, 0.28, 0.12, 2.6, 1.92, "cyanDark")

# Every native voxel has exactly one owner. Remove buried faces across groups.
claimed = np.zeros(SHAPE, dtype="bool")
for name in reversed(list(groups)):
    vol = groups[name]
    occupied = vol != 0
    vol[claimed] = 0
    claimed |= occupied
WORLD = claimed
assert sum(int(np.count_nonzero(vol)) for vol in groups.values()) == int(
    np.count_nonzero(WORLD)
), "Overlapping native voxel owners"

# Frequently seen tableware and metalwork use a 2 cm grid.
HS = 0.02
hero_groups = {}
H = None
for name, hex in [
    ("ceramic", "dcd1b5"),
    ("ceramicRim", "f1e6c9"),
    ("glazeBlue", "527d8b"),
    ("copper", "b78b50"),
    ("copperDark", "83603b"),
    ("bread", "ae7845"),
    ("crumb", "d6ae72"),
    ("ink", "272830"),
]:
    color(name, hex)


def hg(name):
    global H
    H = {}
    hero_groups[name] = H


def hb(x, y, z, w, h, d, c):
    lo = [round(v / HS) for v in [x, y, z]]
    hi = [round(v / HS) for v in [x + w, y + h, z + d]]
    for xx in range(lo[0], hi[0]):
        for yy in range(lo[1], hi[1]):
            for zz in range(lo[2], hi[2]):
                H[(xx, yy, zz)] = cid(c)


def hd(cx, y, cz, r, h, c, inner=0):
    for xx in range(math.floor((cx - r) / HS), math.ceil((cx + r) / HS)):
        for zz in range(math.floor((cz - r) / HS), math.ceil((cz + r) / HS)):
            dist = ((xx + 0.5) * HS - cx) ** 2 + ((zz + 0.5) * HS - cz) ** 2
            if inner * inner <= dist <= r * r:
                for yy in range(round(y / HS), round((y + h) / HS)):
                    H[(xx, yy, zz)] = cid(c)


def hcup(x, y, z):
    hd(x, y, z, 0.07, 0.02, "ceramic")
    for dy, r in [
        (0.02, 0.07),
        (0.04, 0.08),
        (0.06, 0.08),
        (0.08, 0.08),
        (0.1, 0.08),
        (0.12, 0.08),
    ]:
        hd(x, y + dy, z, r, 0.02, "ceramic", r - 0.02)
    hd(x, y + 0.14, z, 0.08, 0.02, "ceramicRim", 0.055)
    hd(x, y + 0.12, z, 0.052, 0.02, "tea")
    hd(x, y + 0.04, z, 0.08, 0.02, "glazeBlue", 0.06)
    for dy in [0.04, 0.12]:
        hb(x + 0.06, y + dy, z - 0.02, 0.1, 0.02, 0.04, "ceramicRim")
    hb(x + 0.14, y + 0.06, z - 0.02, 0.02, 0.06, 0.04, "ceramic")


def hcandle(x, y, z):
    hd(x, y, z, 0.09, 0.02, "copper")
    hd(x, y + 0.02, z, 0.06, 0.02, "copperDark")
    hd(x, y + 0.04, z, 0.03, 0.04, "copper")
    hd(x, y + 0.08, z, 0.055, 0.02, "copper")
    hd(x, y + 0.1, z, 0.03, 0.12, "cream")
    hb(x + 0.02, y + 0.16, z - 0.02, 0.02, 0.04, 0.02, "ceramicRim")
    hb(x - 0.02, y + 0.12, z + 0.02, 0.02, 0.06, 0.02, "ceramicRim")
    hd(x, y + 0.22, z, 0.026, 0.02, "fire")
    hd(x, y + 0.24, z, 0.02, 0.02, "flame")
    hb(x - 0.01, y + 0.26, z - 0.01, 0.02, 0.02, 0.02, "flame")


def hplate(x, y, z):
    hd(x, y, z, 0.11, 0.02, "ceramic")
    hd(x, y + 0.02, z, 0.14, 0.02, "ceramicRim", 0.1)
    hd(x, y + 0.02, z, 0.1, 0.02, "ceramic")
    hd(x, y + 0.04, z, 0.14, 0.02, "glazeBlue", 0.12)


def hbook(x, y, z, w=0.38, d=0.28):
    hb(x, y, z, w, 0.02, d, "leatherDark")
    hb(x + 0.02, y + 0.02, z + 0.02, w - 0.04, 0.04, d - 0.04, "paperShadow")
    hb(x + 0.02, y + 0.06, z + 0.02, w / 2 - 0.04, 0.02, d - 0.04, "paper")
    hb(x + w / 2 + 0.02, y + 0.06, z + 0.02, w / 2 - 0.04, 0.02, d - 0.04, "paper")
    hb(x + w / 2 - 0.01, y + 0.04, z + 0.02, 0.02, 0.04, d - 0.04, "leather")
    for xx in [x + 0.06, x + w / 2 + 0.04]:
        for zz in np.arange(z + 0.06, z + d - 0.02, 0.04):
            hb(xx, y + 0.06, zz, w / 2 - 0.08, 0.02, 0.02, "copperDark")
    for zz in [z + 0.02, z + d - 0.04]:
        hb(x + 0.02, y + 0.02, zz, w - 0.04, 0.02, 0.02, "ceramicRim")


def hbottle(x, y, z):
    hd(x, y, z, 0.065, 0.04, "green")
    hd(x, y + 0.04, z, 0.075, 0.14, "green")
    hd(x, y + 0.18, z, 0.055, 0.02, "greenLight")
    hd(x, y + 0.2, z, 0.035, 0.08, "green")
    hd(x, y + 0.28, z, 0.035, 0.02, "cork")
    hb(x - 0.04, y + 0.06, z + 0.06, 0.08, 0.08, 0.02, "paper")
    hb(x - 0.02, y + 0.08, z + 0.08, 0.04, 0.02, 0.02, "brass")
    hb(x - 0.04, y + 0.12, z + 0.06, 0.08, 0.02, 0.02, "leather")


hg("30_Round_Table_Close_Details")
hd(0.54, 0.76, 1.98, 0.11, 0.02, "leatherDark")
hd(0.54, 0.78, 1.98, 0.1, 0.02, "leather")
hcup(0.54, 0.8, 1.98)
hcandle(-0.1, 0.76, 1.4)
hplate(-0.12, 0.76, 1.84)
hd(-0.12, 0.8, 1.84, 0.08, 0.04, "bread")
hb(-0.18, 0.84, 1.8, 0.12, 0.02, 0.08, "crumb")
for zz in [1.8, 1.84]:
    hb(-0.18, 0.84, zz, 0.1, 0.02, 0.02, "bread")
hb(0.12, 0.76, 1.36, 0.24, 0.02, 0.16, "cream")
hb(0.14, 0.78, 1.36, 0.2, 0.02, 0.06, "paperShadow")
hd(0.2, 0.76, 1.64, 0.635, 0.02, "oakEdge", 0.615)
for a in [0, math.pi / 2, math.pi, math.pi * 1.5]:
    hb(0.2 + math.cos(a) * 0.59, 0.76, 1.64 + math.sin(a) * 0.59, 0.02, 0.02, 0.02, "iron")

hg("31_Window_Table_Close_Details")
hcandle(3.62, 0.76, 2.74)
hd(4.08, 0.76, 3.26, 0.1, 0.02, "leather")
hcup(4.08, 0.78, 3.26)
hb(3.64, 0.76, 3.06, 0.3, 0.02, 0.2, "leatherDark")
hb(3.66, 0.78, 3.08, 0.26, 0.02, 0.16, "paper")
for xx, zz in [(3.72, 3.12), (3.84, 3.1)]:
    hb(xx, 0.8, zz, 0.06, 0.06, 0.06, "ceramic")
    hb(xx + 0.02, 0.86, zz + 0.02, 0.02, 0.02, 0.02, "ink")
hb(3.98, 0.76, 2.94, 0.1, 0.02, 0.24, "copper")
hb(3.98, 0.78, 2.96, 0.06, 0.02, 0.04, "copperDark")
hd(3.84, 0.76, 3, 0.555, 0.02, "oakEdge", 0.535)

hg("32_Bar_Ledger_and_Tableware")
hbook(-3.68, 1.08, -3.52, 0.4, 0.28)
hd(-3.84, 1.08, -3.5, 0.05, 0.08, "ink")
hd(-3.84, 1.16, -3.5, 0.05, 0.02, "copper", 0.03)
for i in range(6):
    hb(-3.86 + i * 0.02, 1.18 + i * 0.02, -3.52, 0.02, 0.02, 0.04, "cream")
hd(-3.04, 1.08, -3.2, 0.1, 0.02, "leather")
hcup(-3.04, 1.1, -3.2)
hcandle(-3.94, 1.08, -3.7)
hbottle(-4.84, 1.08, -3.48)
hbottle(-2.12, 1.08, -3.48)
for yy, c in [(1.08, "wine"), (1.1, "paperShadow"), (1.14, "green")]:
    hb(-2, yy, -3.76, 0.24, 0.02, 0.32, c)

hg("33_Bar_Edge_Fittings")
hb(-5.26, 1.02, -2.96, 3.72, 0.04, 0.04, "copper")
hb(-5.26, 0.98, -2.92, 3.72, 0.02, 0.02, "walnut")
for xx in np.arange(-5.18, -1.6, 0.16):
    hb(xx, 1.02, -2.92, 0.02, 0.02, 0.02, "copperDark")

hg("34_Fate_Desk_Close_Details")
hbook(3.86, 0.8, -0.28, 0.52, 0.3)
hcandle(3.56, 0.8, -0.16)
hcandle(4.68, 0.8, -0.16)
for xx in [3.44, 3.96, 4.48]:
    for dx in [0.04, 0.3]:
        for yy in [0.96, 1.32]:
            hb(xx + dx, yy, -0.68, 0.02, 0.02, 0.02, "copper")
hb(4.44, 0.8, -0.26, 0.12, 0.02, 0.12, "leather")
hd(4.5, 0.82, -0.2, 0.035, 0.04, "brass")

hg("35_Dungeon_Close_Carvings")
for xx in [0.12, 1.8]:
    for yy in np.arange(0.3, 2.2, 0.2):
        for dx in [0.04, 0.3]:
            hb(xx + dx, yy, -4.52, 0.02, 0.02, 0.02, "copper")
        hb(xx + 0.1, yy + 0.06, -4.5, 0.16, 0.02, 0.02, "stoneDark")
for xx in np.arange(0.56, 1.8, 0.16):
    hb(xx, 0.24, -4.34, 0.04, 0.02, 0.04, "brass")
    hb(xx, 0.26, -4.34, 0.02, 0.02, 0.02, "violet")
for xx in [0.2, 1.96]:
    hb(xx, 2.32, -4.48, 0.08, 0.02, 0.04, "copperDark")

hero_arrays = {}
for name, cells in hero_groups.items():
    pts = np.asarray(list(cells), dtype=int)
    low = pts.min(0)
    high = pts.max(0) + 1
    vol = np.zeros(tuple(high - low), dtype="u1")
    indices = pts - low
    vol[tuple(indices.T)] = np.asarray(list(cells.values()), dtype="u1")
    hero_arrays[name] = (vol, low * HS)

print("Built", len(groups), "native groups and", len(hero_arrays), "near-view groups", flush=True)


# Greedy surface meshing retains small color cells but combines flat coplanar runs.
def lin(v):
    return ((v / 255 + 0.055) / 1.055) ** 2.4 if v / 255 > 0.04045 else v / 255 / 12.92


def geometry(volume, step=S, origin=ORIGIN, world=None):
    occupied = np.argwhere(volume)
    if len(occupied) == 0:
        return None
    low = occupied.min(0)
    high = occupied.max(0) + 1
    v = volume[tuple(slice(a, b) for a, b in zip(low, high))]
    if world is not None:
        world = np.pad(world, 1)
        world_region = world[tuple(slice(a, b + 2) for a, b in zip(low, high))]
    result = {}
    for axis in range(3):
        dims = [a for a in range(3) if a != axis]
        view = np.moveaxis(v, axis, 0)
        for sign in [-1, 1]:
            neighbor = np.zeros_like(view)
            if world is not None:
                ns = [slice(1, -1)] * 3
                ns[axis] = slice(2, None) if sign == 1 else slice(None, -2)
                neighbor = np.moveaxis(world_region[tuple(ns)], axis, 0)
            elif sign == 1:
                neighbor[:-1] = view[1:]
            else:
                neighbor[1:] = view[:-1]
            exposed = np.where((view != 0) & (neighbor == 0), view, 0)
            for layer in np.flatnonzero(np.any(exposed != 0, axis=(1, 2))):
                mask = exposed[layer]
                H, W = mask.shape
                for row in range(H):
                    col = 0
                    while col < W:
                        ci = int(mask[row, col])
                        if not ci:
                            col += 1
                            continue
                        end = col + 1
                        while end < W and mask[row, end] == ci:
                            end += 1
                        bottom = row + 1
                        while bottom < H and np.all(mask[bottom, col:end] == ci):
                            bottom += 1
                        mask[row:bottom, col:end] = 0
                        pos, norm, cols, indices = result.setdefault(ci, [[], [], [], []])
                        start = len(pos)
                        # Tangent axes, normal and clockwise ordering corrected below.
                        coord = np.zeros(3)
                        coord[axis] = layer + (1 if sign == 1 else 0)
                        corners = []
                        for u, w in [(row, col), (bottom, col), (bottom, end), (row, end)]:
                            q = coord.copy()
                            q[dims[0]] = u
                            q[dims[1]] = w
                            q += low
                            corners.append(tuple(q * step + origin))
                        n = np.zeros(3)
                        n[axis] = sign
                        cross = np.cross(
                            np.asarray(corners[1]) - corners[0], np.asarray(corners[2]) - corners[0]
                        )
                        if np.dot(cross, n) < 0:
                            corners.reverse()
                        rgb = tuple(lin(t) for t in palette[ci - 1][1])
                        pos.extend(corners)
                        norm.extend([tuple(n)] * 4)
                        cols.extend([rgb] * 4)
                        indices.extend([start, start + 1, start + 2, start, start + 2, start + 3])
                        col = end
    return result


def glb(path):
    blob = bytearray()
    doc = {
        "asset": {"version": "2.0", "generator": "Wanxiang interior renovation"},
        "scene": 0,
        "scenes": [{"nodes": []}],
        "nodes": [],
        "meshes": [],
        "materials": [],
        "bufferViews": [],
        "accessors": [],
        "buffers": [],
    }
    for name, rgb, em in palette:
        m = {
            "name": name,
            "pbrMetallicRoughness": {
                "roughnessFactor": 0.88,
                "metallicFactor": 0.25 if "brass" in name or "iron" in name else 0,
            },
            "doubleSided": False,
        }
        if "copper" in name or "brass" in name:
            m["pbrMetallicRoughness"].update(roughnessFactor=0.45, metallicFactor=0.6)
        elif "ceramic" in name or "glaze" in name:
            m["pbrMetallicRoughness"]["roughnessFactor"] = 0.52
        if em:
            m["emissiveFactor"] = [lin(v) * em for v in rgb]
        doc["materials"].append(m)

    def accessor(a, ctype, typ, target, position=False):
        while len(blob) % 4:
            blob.append(0)
        raw = a.tobytes()
        idx = len(doc["bufferViews"])
        doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": len(blob), "byteLength": len(raw), "target": target}
        )
        blob.extend(raw)
        item = {"bufferView": idx, "componentType": ctype, "type": typ, "count": len(a)}
        if position:
            item.update(min=a.min(0).tolist(), max=a.max(0).tolist())
        doc["accessors"].append(item)
        return len(doc["accessors"]) - 1

    tris = 0
    animated_nodes = []
    sources = [(name, vol, S, ORIGIN, WORLD) for name, vol in groups.items()] + [
        (name, vol, HS, origin, None) for name, (vol, origin) in hero_arrays.items()
    ]
    for name, vol, step, origin, world in sources:
        start = time.time()
        geo = geometry(vol, step, origin, world)
        prim = []
        for ci, (p, n, c, ind) in geo.items():
            positions = np.asarray(p, dtype="<f4")
            normals = np.asarray(n, dtype="<f4")
            indices = np.asarray(ind, dtype="<u4")
            # Color is carried by material here; vertex colors are unnecessary.
            mat = doc["materials"][ci - 1]
            mat["pbrMetallicRoughness"]["baseColorFactor"] = [*map(lin, palette[ci - 1][1]), 1]
            prim.append(
                {
                    "attributes": {
                        "POSITION": accessor(positions, 5126, "VEC3", 34962, True),
                        "NORMAL": accessor(normals, 5126, "VEC3", 34962),
                    },
                    "indices": accessor(indices, 5125, "SCALAR", 34963),
                    "material": ci - 1,
                }
            )
            tris += len(indices) // 3
        mesh = len(doc["meshes"])
        doc["meshes"].append({"name": name, "primitives": prim})
        node = len(doc["nodes"])
        doc["nodes"].append({"name": name, "mesh": mesh})
        doc["scenes"][0]["nodes"].append(node)
        if name.startswith("20_Summoning_Crystal_"):
            animated_nodes.append(node)
        print("Meshed", name, "in", round(time.time() - start, 1), "s", flush=True)
    if animated_nodes:
        samplers = []
        channels = []
        t = np.asarray([0, 0.75, 1.5, 2.25, 3], dtype="<f4")
        ti = accessor(t, 5126, "SCALAR", 34962)
        doc["accessors"][ti].update(min=[0], max=[3])
        for i, node in enumerate(animated_nodes):
            y = np.asarray(
                [
                    [0, 0, 0],
                    [0, 0.06, 0],
                    [0, 0, 0],
                    [0, -0.06, 0],
                    [0, 0, 0],
                ],
                dtype="<f4",
            )
            vi = accessor(y, 5126, "VEC3", 34962)
            samplers.append({"input": ti, "output": vi, "interpolation": "LINEAR"})
            channels.append({"sampler": i, "target": {"node": node, "path": "translation"}})
        doc["animations"] = [
            {"name": "Summoning_Crystals_Idle", "samplers": samplers, "channels": channels}
        ]
    doc["extensionsUsed"] = ["KHR_lights_punctual"]
    doc["extensions"] = {"KHR_lights_punctual": {"lights": []}}
    for light in lights:
        spot = light["name"] == "Chandelier"
        ld = {k: v for k, v in light.items() if k != "position"} | {
            "type": "spot" if spot else "point",
            "intensity": light["intensity"] * 0.55,
        }
        if spot:
            ld["spot"] = {"innerConeAngle": 0.45, "outerConeAngle": 1.18}
        i = len(doc["extensions"]["KHR_lights_punctual"]["lights"])
        doc["extensions"]["KHR_lights_punctual"]["lights"].append(ld)
        nd = {
            "name": light["name"],
            "translation": light["position"],
            "extensions": {"KHR_lights_punctual": {"light": i}},
        }
        if spot:
            nd["rotation"] = [-math.sqrt(0.5), 0, 0, math.sqrt(0.5)]
        node = len(doc["nodes"])
        doc["nodes"].append(nd)
        doc["scenes"][0]["nodes"].append(node)
    doc["cameras"] = [
        {
            "name": "Seated_Interior",
            "type": "perspective",
            "perspective": {"yfov": math.radians(64), "znear": 0.025, "zfar": 40},
        }
    ]
    node = len(doc["nodes"])
    doc["nodes"].append({"name": "Seated_Interior", "camera": 0, "translation": [0.2, 1.18, 2.6]})
    doc["scenes"][0]["nodes"].append(node)
    doc["buffers"] = [{"byteLength": len(blob)}]
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    blob += b"\0" * ((-len(blob)) % 4)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(blob))
        + struct.pack("<II", len(js), 0x4E4F534A)
        + js
        + struct.pack("<II", len(blob), 0x004E4942)
        + blob
    )
    return tris


def vox(path):
    def string(s):
        b = s.encode()
        return struct.pack("<i", len(b)) + b

    def dictionary(d):
        return struct.pack("<i", len(d)) + b"".join(string(k) + string(v) for k, v in d.items())

    def chunk(tag, data):
        return tag + struct.pack("<II", len(data), 0) + data

    children = bytearray()
    models = []
    for name, vol in groups.items():
        occupied = np.argwhere(vol)
        low = occupied.min(0)
        high = occupied.max(0) + 1
        for x0 in range(int(low[0]), int(high[0]), 240):
            for z0 in range(int(low[2]), int(high[2]), 240):
                v = vol[x0 : min(x0 + 240, high[0]), low[1] : high[1], z0 : min(z0 + 240, high[2])]
                xyz = np.argwhere(v)
                if not len(xyz):
                    continue
                size = (v.shape[0], v.shape[2], v.shape[1])
                xyzi = np.empty((len(xyz), 4), dtype="u1")
                xyzi[:, :3] = xyz[:, [0, 2, 1]]
                xyzi[:, 3] = v[tuple(xyz.T)]
                model = len(models)
                children.extend(chunk(b"SIZE", struct.pack("<III", *size)))
                children.extend(chunk(b"XYZI", struct.pack("<I", len(xyzi)) + xyzi.tobytes()))
                trans = (
                    x0 + size[0] // 2 - 158,
                    z0 + size[1] // 2 - 133,
                    int(low[1]) + size[2] // 2 - 10,
                )
                models.append((name, model, trans))
    rgba = b"".join(bytes(rgb + (255,)) for _, rgb, _ in palette) + bytes(4) * (256 - len(palette))
    children.extend(chunk(b"RGBA", rgba))
    children.extend(
        chunk(
            b"nTRN",
            struct.pack("<i", 0)
            + dictionary({"_name": "Wanxiang_Tavern"})
            + struct.pack("<iiii", 1, -1, -1, 1)
            + dictionary({}),
        )
    )
    kids = [2 + 2 * i for i in range(len(models))]
    children.extend(
        chunk(
            b"nGRP",
            struct.pack("<i", 1)
            + dictionary({})
            + struct.pack("<i", len(kids))
            + struct.pack("<" + "i" * len(kids), *kids),
        )
    )
    for i, (name, model, trans) in enumerate(models):
        node = 2 + i * 2
        children.extend(
            chunk(
                b"nTRN",
                struct.pack("<i", node)
                + dictionary({"_name": name})
                + struct.pack("<iiii", node + 1, -1, -1, 1)
                + dictionary({"_t": " ".join(map(str, trans))}),
            )
        )
        children.extend(
            chunk(
                b"nSHP",
                struct.pack("<i", node + 1)
                + dictionary({})
                + struct.pack("<ii", 1, model)
                + dictionary({}),
            )
        )
    path.write_bytes(
        b"VOX " + struct.pack("<I", 150) + b"MAIN" + struct.pack("<II", 0, len(children)) + children
    )
    return len(models)


def hero_vox(path):
    def string(s):
        b = s.encode()
        return struct.pack("<i", len(b)) + b

    def dictionary(d):
        return struct.pack("<i", len(d)) + b"".join(string(k) + string(v) for k, v in d.items())

    def chunk(tag, data):
        return tag + struct.pack("<II", len(data), 0) + data

    children = bytearray()
    models = []
    for name, (v, origin) in hero_arrays.items():
        size = (v.shape[0], v.shape[2], v.shape[1])
        assert max(size) < 256
        xyz = np.argwhere(v)
        xyzi = np.empty((len(xyz), 4), dtype="u1")
        xyzi[:, :3] = xyz[:, [0, 2, 1]]
        xyzi[:, 3] = v[tuple(xyz.T)]
        children.extend(chunk(b"SIZE", struct.pack("<III", *size)))
        children.extend(chunk(b"XYZI", struct.pack("<I", len(xyzi)) + xyzi.tobytes()))
        pos = np.round(origin / HS).astype(int)
        trans = (int(pos[0] + size[0] // 2), int(pos[2] + size[1] // 2), int(pos[1] + size[2] // 2))
        models.append((name, len(models), trans))
    children.extend(
        chunk(
            b"RGBA",
            b"".join(bytes(rgb + (255,)) for _, rgb, _ in palette)
            + bytes(4) * (256 - len(palette)),
        )
    )
    children.extend(
        chunk(
            b"nTRN",
            struct.pack("<i", 0)
            + dictionary({"_name": "Near_View_Details_2cm"})
            + struct.pack("<iiii", 1, -1, -1, 1)
            + dictionary({}),
        )
    )
    kids = [2 + 2 * i for i in range(len(models))]
    children.extend(
        chunk(
            b"nGRP",
            struct.pack("<i", 1)
            + dictionary({})
            + struct.pack("<i", len(kids))
            + struct.pack("<" + "i" * len(kids), *kids),
        )
    )
    for i, (name, model, trans) in enumerate(models):
        node = 2 + 2 * i
        children.extend(
            chunk(
                b"nTRN",
                struct.pack("<i", node)
                + dictionary({"_name": name})
                + struct.pack("<iiii", node + 1, -1, -1, 1)
                + dictionary({"_t": " ".join(map(str, trans))}),
            )
        )
        children.extend(
            chunk(
                b"nSHP",
                struct.pack("<i", node + 1)
                + dictionary({})
                + struct.pack("<ii", 1, model)
                + dictionary({}),
            )
        )
    path.write_bytes(
        b"VOX " + struct.pack("<I", 150) + b"MAIN" + struct.pack("<II", 0, len(children)) + children
    )


triangles = glb(OUT / "万象酒馆-完整房间.glb")
# The room VOX contains quantized 4 cm proxies; the detail VOX preserves 2 cm cells.
proxy = np.zeros(SHAPE, dtype="u1")
for cells in hero_groups.values():
    for (xx, yy, zz), ci in cells.items():
        q = (np.asarray([xx, yy, zz]) * HS + HS / 2 - ORIGIN) / S
        indices = np.floor(q + 1e-6).astype(int)
        proxy[tuple(indices)] = ci
groups["30_Near_View_Props_Proxy"] = proxy
merged = np.zeros(SHAPE, dtype="u1")
for vol in groups.values():
    np.copyto(merged, vol, where=vol != 0)
count = int(np.count_nonzero(merged))
print("Occupied voxels", count, "ratio", count / 142020, flush=True)
parts = vox(OUT / "万象酒馆-完整房间.vox")
hero_vox(OUT / "近景陈设-2厘米.vox")
stats = {
    "voxel_edge_m": S,
    "occupied_voxels": count,
    "previous_occupied_voxels": 142020,
    "voxel_count_multiplier": round(count / 142020, 2),
    "surface_resolution_multiplier": round((0.125 / S) ** 2, 2),
    "triangles": triangles,
    "mesh_groups": len(groups) - 1 + len(hero_arrays),
    "vox_scene_models": parts,
    "near_view_voxel_edge_m": HS,
    "near_view_voxels": sum(len(cells) for cells in hero_groups.values()),
    "geometry_cleanup": "Unique native voxel ownership and shared hidden-face removal",
    "interior_m": [12, 3.52, 10],
    "table_top_m": 0.76,
    "chair_seat_m": 0.48,
    "bar_top_m": 1.08,
    "seated_eye_height_m": 1.18,
    "bottle_height_m": 0.28,
    "stations": [
        "20_Summoning_Arrival_Gate",
        "21_Dungeon_Runegate",
        "22_Roguelike_Three_Choice_Desk",
    ],
    "animations": ["Summoning_Crystals_Idle"],
    "summoning": "People emerge through the arrival gate; cards are only their combat representation",
    "lights": [
        l
        | {
            "intensity": l["intensity"] * 0.55,
            "type": "spot" if l["name"] == "Chandelier" else "point",
        }
        for l in lights
    ],
}
(OUT / "模型规格.json").write_text(
    json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(json.dumps(stats, ensure_ascii=False), flush=True)
