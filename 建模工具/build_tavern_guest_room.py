"""Build the detached upstairs guest room at a 2 cm voxel edge.

The room is rasterized into one ownership volume. Overlapping box definitions
therefore collapse into a single watertight surface instead of co-planar faces,
which removes the floor flicker of the first pass.
"""

import json
import math
import random
import struct
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from tavern_chair import tavern_chair

ROOT = Path(__file__).resolve().parents[1]
TAVERN_OUT = ROOT / "万象酒馆-体素模型"
ASSETS = ROOT / "万象酒馆-Demo/assets"
S = 0.02
ORIGIN = np.array([-4.18, -0.34, -3.38])
SHAPE = (418, 188, 338)
rng = random.Random(20261018)
VARIANT = "a"

palette = []
lookup = {}
box_calls = 0


def color(name, hex_value, emit=0):
    rgb = tuple(int(hex_value[index : index + 2], 16) for index in (0, 2, 4))
    palette.append((name, rgb, emit))
    lookup[name] = len(palette)


for name, hex_value in {
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
    "plank4": "a17b55",
    "grain": "765738",
    "stone": "646573",
    "stoneLight": "767782",
    "stoneDark": "525562",
    "stoneGreen": "5b665f",
    "grout": "3f424b",
    "plaster": "c1b399",
    "plaster2": "b9ac94",
    "plaster3": "c6baa2",
    "plaster4": "d2c5ad",
    "iron": "303037",
    "ironLight": "4b4b51",
    "ironEdge": "66656a",
    "brass": "ad8647",
    "brassLight": "c3a267",
    "brassDark": "806231",
    "copper": "b78b50",
    "copperDark": "83603b",
    "leather": "73433a",
    "leatherDark": "53322e",
    "leatherLight": "8a5749",
    "rug": "693548",
    "rug2": "7b4256",
    "rug3": "552c40",
    "thread": "b99163",
    "green": "335d50",
    "greenLight": "4b7863",
    "mint": "99bd85",
    "blue": "37536e",
    "purple": "65527e",
    "wine": "673943",
    "cream": "ddd0b0",
    "linen": "cfc2a5",
    "blush": "b98786",
    "paper": "ded0aa",
    "paperShadow": "b9aa84",
    "tea": "493027",
    "ink": "272830",
    "black": "22242a",
    "night": "1d3145",
    "night2": "29465b",
    "night3": "355a73",
    "mirror": "91a4a7",
    "leaf": "557452",
    "leafLight": "6d8c61",
    "moss": "77855f",
    "bark": "5c3b29",
    "terracotta": "9c6351",
    "ember": "b74c2f",
    "wax": "e5d5ad",
}.items():
    color(name, hex_value)
for name, hex_value, emit in [
    ("flame", "ffe0a0", 0.95),
    ("fire", "f2b564", 0.62),
    ("emberGlow", "d86736", 0.35),
    ("moonGlow", "d4ebff", 0.8),
    ("starGlow", "fff4cc", 0.9),
    ("lanternGlow", "ffd28a", 0.55),
]:
    color(name, hex_value, emit)


def ix(value, axis):
    return int(round((value - ORIGIN[axis]) / S))


def cid(name):
    return lookup[name] if isinstance(name, str) else name


def box(x, y, z, w, h, d, name):
    global box_calls
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
        name,
    )
    VOL[a:a1, b:b1, e:e1] = cid(name)
    box_calls += 1


def clear_box(x, y, z, w, h, d):
    a, b, e = ix(x, 0), ix(y, 1), ix(z, 2)
    a1, b1, e1 = ix(x + w, 0), ix(y + h, 1), ix(z + d, 2)
    assert 0 <= a < a1 <= SHAPE[0] and 0 <= b < b1 <= SHAPE[1] and 0 <= e < e1 <= SHAPE[2]
    VOL[a:a1, b:b1, e:e1] = 0


def paint_top(x, z, w, d, name, y=0.0):
    box(x, y - S, z, w, S, d, name)


def paint_layer(x, y, z, w, d, name):
    box(x, y, z, w, S, d, name)


VOL = np.zeros(SHAPE, dtype=np.uint8)


def candle(x, y, z):
    box(x - 0.06, y, z - 0.06, 0.12, 0.02, 0.12, "brass")
    box(x - 0.04, y + 0.02, z - 0.04, 0.08, 0.06, 0.08, "brassDark")
    box(x - 0.02, y + 0.08, z - 0.02, 0.04, 0.16, 0.04, "wax")
    box(x - 0.01, y + 0.24, z - 0.01, 0.02, 0.04, 0.02, "flame")
    box(x - 0.02, y + 0.2, z - 0.01, 0.02, 0.04, 0.02, "fire")


def book_flat(x, y, z, width, depth, cover):
    box(x, y, z, width, 0.02, depth, cover)
    box(x + 0.02, y + 0.02, z + 0.02, width - 0.04, 0.02, depth - 0.04, "paperShadow")
    box(x, y + 0.04, z + 0.02, width, 0.02, depth - 0.04, cover)
    box(x + 0.01, y + 0.06, z + 0.01, width - 0.02, 0.01, depth - 0.02, "paper")


def mug(x, y, z):
    box(x - 0.06, y, z - 0.06, 0.12, 0.02, 0.12, "cream")
    box(x - 0.04, y + 0.02, z - 0.04, 0.08, 0.12, 0.08, "cream")
    box(x - 0.04, y + 0.14, z - 0.04, 0.08, 0.02, 0.08, "tea")
    box(x + 0.04, y + 0.04, z - 0.04, 0.04, 0.08, 0.04, "cream")
    box(x + 0.06, y + 0.08, z - 0.04, 0.02, 0.04, 0.04, "cream")


def floor_and_walls():
    # Foundation, floor boards and a dark gap layer; all detail lives in the top voxel layer.
    box(-4.18, -0.34, -3.38, 8.36, 0.22, 6.76, "stoneDark")
    box(-4.16, -0.12, -3.36, 8.32, 0.12, 6.72, "oakDark")
    row = 0
    z = -3.2
    while z < 3.2 - 1e-9:
        height = min(0.16, 3.2 - z)
        cursor = -4 - ((row * 0.43) % 0.9)
        while cursor < 4 - 1e-9:
            width = rng.choice([0.56, 0.72, 0.88, 1.04, 1.2])
            start, end = max(-4, cursor), min(4, cursor + width)
            if end - start >= S:
                plank = rng.choice(["plank", "plank2", "plank3", "plank4"])
                paint_top(start, z, end - start, height, plank)
                for _ in range(rng.randint(2, 5)):
                    gx = start + rng.random() * max(0, end - start - 0.12)
                    gz = z + rng.random() * max(0, height - 0.02)
                    paint_top(
                        gx,
                        gz,
                        min(end - gx, rng.choice([0.04, 0.06, 0.08, 0.12])),
                        S,
                        "grain",
                    )
            cursor += width + S
        z += 0.18
        row += 1
    # A single dark border keeps the board field visually contained.
    paint_layer(-4, -0.02, -3.2, S, 6.4, "walnutDark")
    paint_layer(3.98, -0.02, -3.2, S, 6.4, "walnutDark")
    paint_layer(-4, -0.02, -3.2, 8, S, "walnutDark")
    paint_layer(-4, -0.02, 3.18, 8, S, "walnutDark")

    box(-4.16, 0, -3.36, 8.32, 3.12, 0.16, "plaster")
    box(-4.16, 0, -3.2, 0.16, 3.12, 6.4, "plaster2")
    box(4.0, 0, -3.2, 0.16, 3.12, 6.4, "plaster2")
    box(-4.16, 0, 3.2, 8.32, 3.12, 0.16, "plaster")

    # Stone wainscot: separate 2 cm blocks with real mortar gaps.
    for row in range(5):
        y = 0.06 + row * 0.16
        offset = (row % 2) * 0.23
        x = -4 + offset - 0.48
        while x < 4:
            x0, x1 = max(-4, x), min(4, x + 0.44)
            if x1 - x0 >= S:
                stone = rng.choice(["stone", "stoneLight", "stoneDark", "stoneGreen"])
                box(x0, y, -3.2, x1 - x0, 0.14, S, stone)
                box(x0, y, 3.18, x1 - x0, 0.14, S, stone)
            x += 0.48
        z = -3.2 + offset - 0.48
        while z < 3.2:
            z0, z1 = max(-3.2, z), min(3.2, z + 0.44)
            if z1 - z0 >= S:
                stone = rng.choice(["stone", "stoneLight", "stoneDark", "stoneGreen"])
                box(-4, y, z0, S, 0.14, z1 - z0, stone)
                box(3.98, y, z0, S, 0.14, z1 - z0, stone)
            z += 0.48

    # Chair rail, skirting and corner timbers.
    for y, height in [(0, 0.1), (0.88, 0.12)]:
        box(-4, y, -3.2, 8, height, 0.03, "walnut")
        box(-4, y, 3.19, 8, height, 0.01, "walnut")
        box(-4, y, -3.2, 0.03, height, 6.4, "walnut")
        box(3.97, y, -3.2, 0.03, height, 6.4, "walnut")
    for x in [-4, 3.92]:
        for z in [-3.2, 3.12]:
            box(x, 0, z, 0.08, 3.12, 0.08, "walnut")
    for x in [-4, 3.92]:
        box(x, 2.98, -3.2, 0.08, 0.14, 6.32, "walnut")
    for z in [-3.2, 3.12]:
        box(-4, 2.98, z, 7.92, 0.14, 0.08, "walnut")

    # Subtle plaster wear, one 2 cm relief layer at a time.
    for _ in range(80):
        side = rng.choice(["back", "front", "left", "right"])
        width = rng.choice([0.04, 0.06, 0.08, 0.12])
        height = rng.choice([0.02, 0.04, 0.06])
        tint = rng.choice(["plaster2", "plaster3", "plaster4"])
        if side == "back":
            box(rng.uniform(-3.8, 3.8), rng.uniform(1.02, 2.9), -3.2, width, height, S, tint)
        elif side == "front":
            box(rng.uniform(-3.8, 3.8), rng.uniform(1.02, 2.9), 3.18, width, height, S, tint)
        elif side == "left":
            box(-4, rng.uniform(1.02, 2.9), rng.uniform(-2.9, 2.9), S, height, width, tint)
        else:
            box(3.98, rng.uniform(1.02, 2.9), rng.uniform(-2.9, 2.9), S, height, width, tint)

    # Bed accent panel.
    box(-3.06, 1.02, -3.2, 2.2, 1.88, 0.04, "plaster4")
    box(-3.02, 0.98, -3.16, 0.04, 1.96, 0.04, "walnut")
    box(-0.9, 0.98, -3.16, 0.04, 1.96, 0.04, "walnut")
    box(-3.06, 2.86, -3.16, 2.2, 0.04, 0.04, "walnut")
    for x in [-2.62, -1.98, -1.34]:
        box(x, 1.06, -3.16, 0.02, 1.78, 0.02, "plaster2")


def ceiling():
    box(-4.16, 3.12, -3.36, 8.32, 0.1, 6.72, "oakDark")
    x = -4
    while x < 4:
        width = min(0.16, 4 - x)
        if width >= S:
            paint_layer(x, 3.12, -3.2, width, 6.4, rng.choice(["oak", "oakGrain", "oakLight"]))
        x += 0.18
    for x in [-3.2, -1.06, 1.06, 3.2]:
        box(x - 0.08, 2.96, -3.2, 0.16, 0.16, 6.4, "walnut")
        box(x - 0.04, 2.94, -3.2, 0.08, 0.04, 6.4, "oakEdge")
    for z in [-1.8, 0.56, 2.48]:
        box(-4, 2.98, z - 0.07, 8, 0.14, 0.14, "walnut")
    # Ceiling rose above the lantern.
    for x in [-0.12, 0.08]:
        for z in [0.44, 0.64]:
            box(x, 3.1, z, 0.04, 0.02, 0.04, "brass")


def door():
    clear_box(-0.72, 0, 3.12, 1.44, 2.34, 0.26)
    box(-0.84, 0, 3.04, 0.12, 2.46, 0.2, "walnut")
    box(0.72, 0, 3.04, 0.12, 2.46, 0.2, "walnut")
    box(-0.84, 2.34, 3.04, 1.68, 0.12, 0.2, "walnut")
    box(-0.86, 0, 3.0, 1.72, 0.04, 0.32, "stone")
    box(-0.7, 0.04, 3.1, 1.4, 2.26, 0.08, "walnutDark")
    # Flush face inlays: color replaces the front voxel layer, no floating panels.
    box(-0.68, 0.08, 3.08, 0.08, 2.18, 0.02, "oak")
    box(0.6, 0.08, 3.08, 0.08, 2.18, 0.02, "oak")
    for y in [0.12, 1.08, 2.12]:
        box(-0.6, y, 3.08, 1.2, 0.08, 0.02, "oak")
    for y in [0.2, 1.16]:
        for x in [-0.56, 0.08]:
            box(x, y, 3.08, 0.48, 0.84, 0.02, "walnutLight")
    box(0.42, 0.94, 3.04, 0.18, 0.2, 0.04, "brass")
    box(0.46, 1.0, 3.0, 0.1, 0.08, 0.04, "brassLight")
    for y in [0.42, 1.72]:
        box(-0.69, y, 3.06, 0.08, 0.12, 0.04, "iron")
    box(-0.46, 2.5, 3.12, 0.92, 0.3, 0.08, "walnutDark")
    box(-0.36, 2.56, 3.08, 0.72, 0.18, 0.04, "brass")
    for x, y, color_name in [
        (-0.24, 2.62, "moonGlow"),
        (-0.18, 2.68, "moonGlow"),
        (-0.02, 2.68, "moonGlow"),
        (0.06, 2.62, "moonGlow"),
        (0.16, 2.62, "flame"),
    ]:
        box(x, y, 3.06, 0.04, 0.04, 0.02, color_name)


def window():
    clear_box(3.98, 0.9, -0.72, 0.18, 1.7, 2.14)
    # Casing, sill and a deep window reveal.
    box(3.88, 0.82, -0.88, 0.12, 0.08, 2.64, "walnut")
    box(3.88, 2.6, -0.88, 0.12, 0.1, 2.64, "walnut")
    box(3.88, 0.9, -0.84, 0.12, 1.7, 0.12, "walnut")
    box(3.88, 0.9, 1.42, 0.12, 1.7, 0.12, "walnut")
    box(3.84, 0.82, -0.84, 0.2, 0.06, 2.56, "oakLight")
    box(3.86, 0.84, -0.72, 0.16, 0.04, 2.14, "oak")

    # Night glass physically sits in the carved opening; the moon is a pixelated relief.
    box(4.06, 0.94, -0.7, 0.04, 1.64, 2.1, "night2")
    box(4.06, 1.58, -0.68, 0.04, 1.0, 2.06, "night")
    for x in [-0.64, -0.08, 0.48, 1.04]:
        box(4.0, 0.92, x + 0.02, 0.08, 1.68, 0.04, "oak")
    for y in [0.92, 1.54, 2.52]:
        box(4.0, y, -0.72, 0.08, 0.08, 2.14, "oak")
    box(3.98, 1.52, 0.32, 0.12, 0.12, 0.16, "iron")
    box(3.94, 1.56, 0.36, 0.08, 0.04, 0.08, "brass")
    for z, y in [
        (-0.4, 1.9),
        (0.0, 2.28),
        (0.16, 1.2),
        (0.84, 2.06),
        (1.2, 1.72),
        (1.34, 2.36),
    ]:
        box(4.04, y, z, 0.02, 0.02, 0.02, "starGlow")
    moon_y, moon_z = 2.08, 0.9
    for iy in range(-10, 11):
        for iz in range(-10, 11):
            y, z = moon_y + iy * S, moon_z + iz * S
            distance = math.hypot(y - moon_y, z - moon_z)
            if distance <= 0.2 and math.hypot(y - moon_y - 0.07, z - moon_z + 0.03) > 0.16:
                box(4.04, y - 0.01, z - 0.01, S, S, S, "moonGlow")

    # Curtain rail, wall brackets, rings and gathered drapes.
    box(3.84, 2.68, -1.18, 0.06, 0.06, 3.04, "iron")
    box(3.84, 2.68, -1.24, 0.16, 0.06, 0.08, "brass")
    box(3.84, 2.68, 1.78, 0.16, 0.06, 0.08, "brass")
    for z in [-1.14, 1.58]:
        for index in range(6):
            box(
                3.8 + index * 0.02,
                0.68,
                z + index * 0.035,
                0.08,
                2.0,
                0.05,
                "rug3" if index % 2 else "rug2",
            )
        box(3.78, 1.05, z + 0.02, 0.08, 0.06, 0.28, "thread")
        for index in range(3):
            box(3.82 + index * 0.02, 2.66, z + 0.02, 0.04, 0.05, 0.06, "brass")

    # Window seat, two cushions, folded throw and its supported base.
    box(3.22, 0, -0.98, 0.78, 0.42, 2.7, "walnutDark")
    box(3.3, 0.42, -0.92, 0.68, 0.16, 2.58, "rug2")
    for x in [3.3, 3.58]:
        for z in [-0.88, 1.5]:
            box(x, 0, z, 0.1, 0.42, 0.1, "walnut")
    for z in [-0.62, 0.18, 0.98]:
        box(3.22, 0.1, z, 0.04, 0.28, 0.52, "oak")
        box(3.2, 0.22, z + 0.2, 0.02, 0.06, 0.06, "brass")
    box(3.36, 0.56, -0.82, 0.36, 0.16, 0.36, "cream")
    box(3.36, 0.56, 1.04, 0.36, 0.16, 0.36, "cream")
    box(3.44, 0.56, 0.16, 0.28, 0.12, 0.42, "greenLight")
    for z in [0.2, 0.3, 0.4]:
        box(3.4, 0.6, z, 0.24, 0.06, 0.04, "mint")
    box(3.9, 0.9, -0.44, 0.16, 0.16, 0.16, "ember")
    for x, z, height in [(3.96, -0.38, 0.18), (3.9, -0.3, 0.28), (4.0, -0.3, 0.14)]:
        box(x, 1.04, z, 0.04, height, 0.04, "leaf")
        box(x + 0.02, 1.14, z + 0.02, 0.02, 0.1, 0.02, "leafLight")


def oval_xz(cx, cz, rx, rz, y, h, name, inner=0.0):
    global box_calls
    a0, a1 = ix(cx - rx, 0), ix(cx + rx, 0)
    e0, e1 = ix(cz - rz, 2), ix(cz + rz, 2)
    b, b1 = ix(y, 1), ix(y + h, 1)
    for a in range(a0, a1):
        x = ORIGIN[0] + (a + 0.5) * S
        for e in range(e0, e1):
            z = ORIGIN[2] + (e + 0.5) * S
            radial = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2
            if radial <= 1 and radial >= inner * inner:
                VOL[a : a + 1, b:b1, e : e + 1] = cid(name)
                box_calls += 1


def bed():
    x0, x1 = -2.9, -0.96
    z0, z1 = -3.2, -1.12
    # A low walnut frame with four visible legs, not a four-poster.
    for x in [x0 + 0.04, x1 - 0.16]:
        for z in [z0 + 0.08, z1 - 0.18]:
            box(x, 0, z, 0.12, 0.28, 0.12, "walnutDark")
    box(x0, 0.24, z0 + 0.12, 0.12, 0.24, 1.84, "walnut")
    box(x1 - 0.12, 0.24, z0 + 0.12, 0.12, 0.24, 1.84, "walnut")
    box(x0 + 0.12, 0.24, z0 + 0.12, 1.82, 0.22, 0.12, "walnut")
    box(x0 + 0.12, 0.24, z1 - 0.12, 1.82, 0.22, 0.12, "walnut")
    for x in [-2.56, -2.22, -1.88, -1.54, -1.2]:
        box(x, 0.2, z0 + 0.2, 0.06, 0.08, 1.62, "oak")

    # Mattress, fitted sheet and a quiet rose duvet with stitched borders.
    box(-2.84, 0.4, -3.12, 1.82, 0.2, 1.92, "linen")
    box(-2.86, 0.6, -3.14, 1.86, 0.02, 1.96, "cream")
    duvet_x0, duvet_x1 = -2.86, -0.98
    duvet_z0, duvet_z1 = -2.64, -1.2
    box(duvet_x0, 0.62, duvet_z0, duvet_x1 - duvet_x0, 0.1, duvet_z1 - duvet_z0, "linen")
    for x in [duvet_x0, duvet_x1 - 0.06]:
        box(x, 0.7, duvet_z0, 0.06, 0.02, duvet_z1 - duvet_z0, "wine")
    for z in [duvet_z0, duvet_z1 - 0.06]:
        box(duvet_x0, 0.7, z, duvet_x1 - duvet_x0, 0.02, 0.06, "wine")
    for z in [-2.46, -2.22, -1.98, -1.74, -1.5]:
        box(-2.78, 0.7, z, 0.72, 0.02, 0.02, "thread")
        box(-1.7, 0.7, z, 0.72, 0.02, 0.02, "thread")
    for z in [-2.36, -2.0, -1.64]:
        box(duvet_x0 + 0.14, 0.72, z, 0.12, 0.02, 0.12, "paperShadow")
        box(duvet_x0 + 0.18, 0.74, z + 0.02, 0.04, 0.02, 0.04, "thread")

    # Two large sleeping pillows and one dark green accent cushion.
    for x in [-2.72, -1.9]:
        box(x, 0.62, -3.08, 0.76, 0.16, 0.36, "linen")
        box(x + 0.04, 0.78, -3.02, 0.68, 0.06, 0.26, "cream")
        box(x + 0.08, 0.84, -2.98, 0.6, 0.03, 0.18, "paperShadow")
    box(-2.2, 0.8, -2.82, 0.54, 0.12, 0.2, "wine")
    for x in [-2.14, -1.98, -1.82]:
        box(x, 0.92, -2.8, 0.04, 0.02, 0.16, "thread")

    # A folded throw across the foot of the bed.
    box(-2.82, 0.72, -1.44, 1.78, 0.08, 0.24, "greenLight")
    box(-2.82, 0.8, -1.42, 1.78, 0.02, 0.06, "mint")
    for x in [-2.66, -2.3, -1.94, -1.58, -1.22]:
        box(x, 0.82, -1.42, 0.04, 0.02, 0.06, "thread")

    # Low footboard and a paneled, upholstered headboard.
    box(-2.94, 0.18, -1.28, 1.98, 0.62, 0.12, "walnut")
    box(-2.74, 0.3, -1.16, 1.58, 0.34, 0.04, "oak")
    for x in [-2.78, -2.3, -1.82, -1.34]:
        box(x, 0.22, -1.12, 0.05, 0.1, 0.04, "brass")
    box(-2.96, 0, -3.2, 2.0, 1.45, 0.14, "walnut")
    box(-2.78, 0.3, -3.06, 1.64, 0.98, 0.06, "leather")
    for x in [-2.64, -2.3, -1.96, -1.62, -1.28]:
        box(x, 0.36, -3.0, 0.04, 0.84, 0.02, "leatherLight")
    for y in [0.5, 0.78, 1.06]:
        for x in [-2.58, -2.24, -1.9, -1.56, -1.22]:
            box(x, y, -2.98, 0.03, 0.03, 0.03, "brassDark")
    box(-2.84, 1.28, -3.06, 1.76, 0.05, 0.06, "brass")
    box(-2.98, 1.45, -3.2, 2.04, 0.1, 0.16, "walnutDark")


def wardrobe():
    x0, x1 = 1.55, 3.15
    z_back, z_front = -3.2, -2.44
    box(x0, 0, z_back, x1 - x0, 2.25, 0.76, "walnutDark")
    box(x0 - 0.06, 0, z_back - 0.06, x1 - x0 + 0.12, 0.12, 0.9, "walnut")
    box(x0 - 0.06, 2.25, z_back - 0.06, x1 - x0 + 0.12, 0.14, 0.9, "walnut")
    # Two full doors and their recessed panels, facing the room.
    for door_x, door_w in [(1.65, 0.68), (2.37, 0.68)]:
        box(door_x, 0.12, -2.52, door_w, 2.05, 0.08, "walnut")
        box(door_x + 0.08, 0.24, -2.46, door_w - 0.16, 0.78, 0.02, "oak")
        box(door_x + 0.08, 1.12, -2.46, door_w - 0.16, 0.82, 0.02, "oak")
        box(door_x + 0.12, 0.32, -2.44, door_w - 0.24, 0.6, 0.02, "walnutLight")
        box(door_x + 0.12, 1.2, -2.44, door_w - 0.24, 0.64, 0.02, "walnutLight")
    for x in [2.24, 2.44]:
        box(x, 1.06, -2.44, 0.05, 0.1, 0.04, "brassLight")
    box(2.31, 1.2, -2.44, 0.16, 0.04, 0.04, "brass")
    box(2.31, 1.82, -2.44, 0.02, 0.06, 0.06, "brassDark")
    # Travel hatbox and a folded blanket on top, both fully supported by the crown.
    box(2.02, 2.39, -2.9, 0.44, 0.16, 0.44, "leatherDark")
    box(2.08, 2.55, -2.84, 0.32, 0.12, 0.32, "leather")
    box(2.7, 2.39, -2.74, 0.28, 0.08, 0.32, "cream")
    box(2.7, 2.47, -2.72, 0.28, 0.02, 0.06, "rug2")


def desk():
    # Desk against the left wall, well away from the bed.
    box(-4.0, 0.7, 0.16, 0.66, 0.08, 1.6, "walnut")
    paint_top(-3.96, 0.2, 0.58, 1.52, "oakLight", 0.78)
    for x in [-3.96, -3.4]:
        for z in [0.22, 1.68]:
            box(x, 0, z, 0.1, 0.7, 0.1, "walnut")
    box(-3.96, 0.3, 0.2, 0.56, 0.4, 0.58, "walnut")
    for z in [0.26, 0.5, 0.74]:
        box(-3.4, 0.36, z, 0.02, 0.22, 0.2, "oak")
        box(-3.38, 0.44, z + 0.07, 0.02, 0.05, 0.05, "brass")
    box(-3.36, 0.7, 0.16, 0.02, 0.08, 1.6, "oakEdge")

    # Reuse the exact tavern-hall chair instead of inventing a new desk chair.
    tavern_chair(box, -2.85, 0.96, "west")

    # Writing set, cup, candle, books.
    box(-3.9, 0.78, 0.46, 0.48, 0.02, 0.5, "leatherDark")
    box(-3.86, 0.8, 0.5, 0.2, 0.02, 0.42, "paper")
    box(-3.64, 0.8, 0.5, 0.2, 0.02, 0.42, "paper")
    box(-3.66, 0.8, 0.5, 0.02, 0.02, 0.42, "ink")
    for z in [0.56, 0.64, 0.72, 0.8, 0.88]:
        box(-3.82, 0.82, z, 0.12, 0.02, 0.01, "ink")
        box(-3.6, 0.82, z, 0.12, 0.02, 0.01, "ink")
    box(-3.78, 0.78, 1.08, 0.1, 0.12, 0.1, "ink")
    box(-3.72, 0.9, 1.1, 0.02, 0.24, 0.02, "paper")
    box(-3.7, 1.08, 1.08, 0.06, 0.04, 0.06, "paperShadow")
    candle(-3.76, 0.78, 1.45)
    mug(-3.52, 0.78, 1.52)
    for z in [0.28, 0.38, 0.48]:
        box(-3.52, 0.78, z, 0.22, 0.04, 0.06, "wine")
    box(-3.46, 0.82, 0.26, 0.18, 0.03, 0.12, "green")

    # Wall shelf with standing books, a vase and two wall brackets.
    box(-4.0, 1.62, 0.16, 0.22, 0.08, 1.56, "walnut")
    box(-4.0, 1.48, 0.24, 0.12, 0.14, 0.06, "iron")
    box(-4.0, 1.48, 1.58, 0.12, 0.14, 0.06, "iron")
    book_colors = ["wine", "green", "blue", "leather", "purple", "brassDark"]
    z = 0.28
    for index in range(11):
        height = rng.choice([0.2, 0.24, 0.28, 0.3])
        box(-3.96, 1.7, z, 0.16, height, 0.06, book_colors[index % len(book_colors)])
        box(-3.94, 1.74, z + 0.01, 0.12, height - 0.06, 0.02, "paperShadow")
        z += 0.08
    box(-3.97, 1.7, 1.36, 0.12, 0.16, 0.12, "cream")
    box(-3.94, 1.86, 1.39, 0.06, 0.18, 0.06, "green")
    box(-3.92, 1.94, 1.4, 0.04, 0.1, 0.04, "leaf")

    # Framed landscape above the shelf.
    box(-4.0, 2.08, 0.26, 0.05, 0.94, 1.3, "walnut")
    box(-3.95, 2.14, 0.32, 0.02, 0.82, 1.18, "paperShadow")
    for z0, width, height in [(0.4, 0.42, 0.14), (0.72, 0.5, 0.25), (1.12, 0.32, 0.18)]:
        for step in range(round(height / S)):
            box(-3.93, 2.2 + step * S, z0, 0.02, S, width - step * S, "stone")
    for z in [0.46, 0.62, 0.88, 1.14]:
        box(-3.93, 2.66, z, 0.02, 0.06, 0.06, "leaf")
    box(-3.93, 2.2, 0.38, 0.02, 0.06, 0.16, "plaster3")


def washstand():
    # A small basin stand in the gap between wardrobe and window.
    for x in [3.4, 3.86]:
        for z in [-2.14, -1.28]:
            box(x, 0, z, 0.08, 0.78, 0.08, "walnut")
    box(3.38, 0.18, -2.18, 0.58, 0.06, 0.94, "oak")
    box(3.32, 0.78, -2.22, 0.68, 0.08, 1.02, "walnut")
    paint_top(3.36, -2.18, 0.6, 0.94, "oakLight", 0.86)
    box(3.92, 0.86, -2.2, 0.08, 0.12, 1.0, "oak")

    # Wall mirror and its frame.
    box(3.9, 1.06, -2.08, 0.1, 1.08, 0.78, "walnut")
    box(3.86, 1.12, -2.02, 0.04, 0.96, 0.66, "mirror")
    box(3.84, 1.28, -1.9, 0.02, 0.5, 0.1, "paperShadow")
    box(3.84, 1.82, -2.0, 0.02, 0.06, 0.06, "brass")

    # Ceramic basin: a physical ring wall with water inside.
    oval_xz(3.66, -1.7, 0.25, 0.21, 0.86, 0.02, "cream")
    oval_xz(3.66, -1.7, 0.25, 0.21, 0.88, 0.14, "cream", inner=0.7)
    oval_xz(3.66, -1.7, 0.25, 0.21, 1.02, 0.02, "paper")
    oval_xz(3.66, -1.7, 0.165, 0.135, 0.94, 0.02, "night3")
    box(3.52, 1.04, -1.72, 0.06, 0.04, 0.06, "brass")

    # Pitcher and cup on the top slab.
    box(3.44, 0.86, -2.14, 0.14, 0.26, 0.14, "cream")
    box(3.46, 1.12, -2.12, 0.1, 0.06, 0.1, "paper")
    box(3.56, 1.0, -2.12, 0.06, 0.08, 0.04, "cream")
    box(3.58, 1.06, -2.1, 0.02, 0.06, 0.04, "cream")
    box(3.46, 0.86, -1.94, 0.08, 0.06, 0.08, "blue")
    box(3.34, 0.86, -1.46, 0.12, 0.04, 0.1, "brass")

    # Towel rail, attached under the top, and a hanging towel.
    box(3.24, 0.64, -1.98, 0.04, 0.04, 0.46, "brass")
    box(3.28, 0.64, -1.98, 0.08, 0.04, 0.04, "brass")
    box(3.28, 0.64, -1.56, 0.08, 0.04, 0.04, "brass")
    box(3.32, 0.64, -1.98, 0.04, 0.14, 0.04, "brass")
    box(3.32, 0.64, -1.56, 0.04, 0.14, 0.04, "brass")
    box(3.24, 0.18, -1.9, 0.05, 0.48, 0.3, "cream")
    box(3.23, 0.28, -1.88, 0.03, 0.08, 0.26, "rug2")


def stove():
    box(2.86, 0, 1.84, 1.06, 0.06, 1.12, "stoneDark")
    for x in [2.98, 3.6]:
        for z in [2.08, 2.62]:
            box(x, 0.06, z, 0.08, 0.1, 0.08, "iron")
    box(2.94, 0.16, 2.04, 0.84, 0.86, 0.76, "iron")
    box(2.92, 0.16, 2.02, 0.88, 0.08, 0.8, "ironLight")
    box(2.9, 1.02, 2.0, 0.92, 0.08, 0.84, "ironLight")
    box(2.98, 1.1, 2.08, 0.76, 0.02, 0.68, "ironEdge")
    # Firebox is a framed, glowing surface attached to the stove's front face.
    box(2.88, 0.34, 2.16, 0.08, 0.6, 0.5, "ironLight")
    box(2.9, 0.42, 2.2, 0.06, 0.44, 0.42, "black")
    for z in [2.24, 2.36, 2.48]:
        box(2.88, 0.48, z, 0.04, 0.12, 0.06, "emberGlow")
        box(2.86, 0.6, z + 0.02, 0.02, 0.18, 0.04, "fire")
        box(2.86, 0.72, z + 0.01, 0.02, 0.08, 0.02, "flame")
    box(2.86, 0.3, 2.1, 0.04, 0.04, 0.6, "brassDark")
    for z in [2.18, 2.64]:
        box(2.88, 0.24, z, 0.06, 0.82, 0.06, "ironLight")
    # Kettle and its supported handle.
    box(3.18, 1.1, 2.26, 0.4, 0.22, 0.34, "copper")
    box(3.14, 1.32, 2.22, 0.48, 0.04, 0.42, "copperDark")
    box(3.28, 1.36, 2.36, 0.2, 0.08, 0.16, "copper")
    box(3.08, 1.18, 2.5, 0.12, 0.08, 0.08, "copper")
    box(3.02, 1.24, 2.54, 0.07, 0.05, 0.04, "copperDark")
    for z in [2.22, 2.58]:
        box(3.34, 1.1, z, 0.08, 0.08, 0.04, "copperDark")
    box(3.34, 1.22, 2.2, 0.08, 0.08, 0.04, "iron")
    box(3.34, 1.22, 2.58, 0.08, 0.08, 0.04, "iron")
    box(3.34, 1.3, 2.18, 0.08, 0.04, 0.42, "iron")
    # Chimney is continuous from the stove top to the ceiling.
    box(3.36, 1.1, 2.24, 0.24, 0.12, 0.26, "ironLight")
    box(3.4, 1.22, 2.28, 0.16, 1.9, 0.18, "iron")
    for y in [1.5, 2.0, 2.55, 2.98]:
        box(3.36, y, 2.24, 0.24, 0.06, 0.26, "ironLight")
    # Fire tools on the floor and a log basket beside the stove.
    box(2.62, 0, 1.98, 0.12, 0.08, 0.12, "iron")
    box(2.66, 0.08, 2.04, 0.04, 0.74, 0.04, "iron")
    box(2.64, 0.82, 2.0, 0.12, 0.04, 0.06, "iron")
    box(2.46, 0, 2.42, 0.32, 0.34, 0.3, "bark")
    for x in [2.5, 2.56, 2.62]:
        box(x, 0.04, 2.48, 0.08, 0.2, 0.18, "oakGrain")
    box(2.42, 0.04, 2.46, 0.04, 0.24, 0.24, "iron")


def rug():
    x, z, w, d = -1.44, -0.26, 3.36, 2.04
    box(x, 0, z, w, 0.04, d, "rug")
    box(x + 0.02, 0.02, z + 0.02, w - 0.04, 0.02, d - 0.04, "rug2")
    for xx in range(20):
        for zz in range(12):
            px, pz = x + 0.1 + xx * 0.16, z + 0.1 + zz * 0.16
            if (xx + zz) % 2 == 0:
                paint_top(px, pz, 0.08, 0.08, "rug3", 0.04)
            elif xx in (0, 18) or zz in (0, 10):
                paint_top(px, pz, 0.08, 0.08, "thread", 0.04)
    for xx in range(5):
        for zz in range(3):
            paint_top(x + 0.92 + xx * 0.24, z + 0.64 + zz * 0.24, 0.16, 0.08, "thread", 0.04)
    for xx in range(0, 20, 2):
        box(x + 0.08 + xx * 0.16, 0, z - 0.04, 0.04, 0.02, 0.04, "thread")
        box(x + 0.08 + xx * 0.16, 0, z + d, 0.04, 0.02, 0.04, "thread")


def decor():
    # Full-height plant growing from a pot, beside the door.
    box(-3.52, 0, 2.58, 0.4, 0.26, 0.4, "terracotta")
    box(-3.56, 0.26, 2.54, 0.48, 0.06, 0.48, "ember")
    for x, z in [(-3.38, 2.78), (-3.44, 2.74), (-3.58, 2.86)]:
        box(x, 0.32, z, 0.06, 0.9, 0.06, "bark")
        box(x - 0.06, 0.5, z + 0.02, 0.12, 0.06, 0.1, "leaf")
        box(x + 0.04, 0.68, z - 0.02, 0.12, 0.06, 0.1, "leafLight")
        box(x - 0.04, 0.86, z + 0.01, 0.12, 0.06, 0.1, "leaf")

    # Wall map framed right of the door: each depth layer touches the next.
    box(1.42, 1.68, 3.12, 0.96, 0.78, 0.08, "walnut")
    box(1.48, 1.74, 3.08, 0.84, 0.66, 0.04, "paperShadow")
    for x in [1.58, 1.86, 2.06]:
        box(x, 1.84, 3.06, 0.06, 0.26, 0.02, "oak")
    for z, y in [(1.62, 2.2), (1.78, 2.12), (2.08, 2.24), (2.16, 2.0)]:
        box(z, y, 3.04, 0.12, 0.04, 0.02, "wine")
    box(1.46, 1.7, 3.08, 0.06, 0.04, 0.04, "brass")
    box(2.3, 1.7, 3.08, 0.06, 0.04, 0.04, "brass")

    # Hooks, scarf and a small wall sconce.
    for x in [0.94, 1.18]:
        box(x, 1.54, 3.12, 0.08, 0.08, 0.08, "iron")
        box(x + 0.02, 1.5, 3.08, 0.04, 0.12, 0.04, "brass")
    box(0.94, 0.82, 3.08, 0.28, 0.72, 0.06, "green")
    box(1.02, 1.04, 3.02, 0.1, 0.46, 0.04, "thread")
    box(2.46, 1.8, 3.12, 0.12, 0.4, 0.08, "iron")
    box(2.52, 1.9, 3.02, 0.2, 0.2, 0.12, "lanternGlow")

    # Framed night landscape above the headboard.
    box(-2.62, 1.68, -3.16, 1.2, 0.92, 0.06, "walnut")
    box(-2.56, 1.74, -3.1, 1.08, 0.8, 0.04, "paperShadow")
    box(-2.5, 1.82, -3.06, 0.96, 0.62, 0.02, "night3")
    for x0, width, height in [(-2.46, 0.46, 0.18), (-2.08, 0.4, 0.28), (-1.74, 0.18, 0.14)]:
        for step in range(round(height / S)):
            box(x0, 1.86 + step * S, -3.04, width - step * S, S, 0.02, "stone")
    box(-2.14, 2.26, -3.03, 0.1, 0.1, 0.02, "moonGlow")
    for x in [-2.4, -1.9, -1.64]:
        box(x, 2.14, -3.03, 0.04, 0.04, 0.02, "starGlow")
    box(-2.56, 2.44, -3.05, 1.08, 0.04, 0.02, "brass")

    # Woven wall hanging between the bed and the wardrobe.
    box(-0.63, 2.64, -3.18, 1.86, 0.08, 0.06, "brass")
    box(-0.67, 2.56, -3.2, 0.06, 0.08, 0.1, "brassDark")
    box(1.16, 2.56, -3.2, 0.06, 0.08, 0.1, "brassDark")
    box(-0.55, 1.12, -3.2, 1.7, 1.52, 0.02, "rug3")
    box(-0.51, 1.16, -3.18, 1.62, 0.08, 0.02, "thread")
    box(-0.51, 2.52, -3.18, 1.62, 0.08, 0.02, "thread")
    for x in [-0.51, 1.07]:
        box(x, 1.16, -3.18, 0.08, 1.44, 0.02, "thread")
    for row in range(4):
        for column in range(5):
            cx = -0.27 + column * 0.3
            cy = 1.42 + row * 0.28
            box(cx, cy, -3.17, 0.12, 0.12, 0.02, "blue" if (row + column) % 2 else "green")
            box(cx + 0.03, cy + 0.03, -3.15, 0.06, 0.06, 0.02, "cream")
    for x in [-0.49, -0.25, -0.01, 0.23, 0.47, 0.71, 0.95]:
        box(x, 1.06, -3.17, 0.04, 0.08, 0.04, "brassDark")

    # Ceiling lantern, supported by a chain from the ceiling rose.
    box(-0.02, 2.34, 0.52, 0.04, 0.78, 0.04, "iron")
    box(-0.18, 2.28, 0.36, 0.4, 0.06, 0.4, "iron")
    box(-0.14, 1.76, 0.4, 0.32, 0.46, 0.32, "lanternGlow")
    for x in [-0.18, 0.12]:
        for z in [0.38, 0.66]:
            box(x, 1.74, z, 0.04, 0.54, 0.04, "iron")
    box(-0.2, 2.26, 0.34, 0.44, 0.04, 0.44, "brass")
    box(-0.12, 1.7, 0.36, 0.3, 0.04, 0.3, "iron")
    box(-0.04, 2.0, 0.44, 0.08, 0.12, 0.08, "cream")


def meshes():
    """Extract a greedy, hidden-face-culled mesh from the single owner volume."""
    occupied = np.argwhere(VOL)
    if not len(occupied):
        raise RuntimeError("Guest room has no voxels")
    low = occupied.min(0)
    high = occupied.max(0) + 1
    volume = VOL[tuple(slice(a, b) for a, b in zip(low, high))]
    faces = defaultdict(lambda: {"p": [], "n": [], "i": []})
    for axis in range(3):
        dimensions = [dimension for dimension in range(3) if dimension != axis]
        view = np.moveaxis(volume, axis, 0)
        for sign in (-1, 1):
            neighbor = np.zeros_like(view)
            if sign == 1:
                neighbor[:-1] = view[1:]
            else:
                neighbor[1:] = view[:-1]
            exposed = np.where((view != 0) & (neighbor == 0), view, 0)
            for layer in np.flatnonzero(np.any(exposed != 0, axis=(1, 2))):
                mask = exposed[layer]
                for color_index in np.unique(mask):
                    if color_index == 0:
                        continue
                    solid = mask == color_index
                    for row in np.flatnonzero(solid.any(axis=1)):
                        col = 0
                        while col < solid.shape[1]:
                            if not solid[row, col]:
                                col += 1
                                continue
                            end = col + 1
                            while end < solid.shape[1] and solid[row, end]:
                                end += 1
                            bottom = row + 1
                            while bottom < solid.shape[0] and np.all(solid[bottom, col:end]):
                                bottom += 1
                            solid[row:bottom, col:end] = False
                            positions, normals, indices = (
                                faces[int(color_index)]["p"],
                                faces[int(color_index)]["n"],
                                faces[int(color_index)]["i"],
                            )
                            start = len(positions)
                            coord = np.zeros(3, dtype=int)
                            coord[axis] = layer + (1 if sign == 1 else 0)
                            corners = []
                            for u, w in [(row, col), (bottom, col), (bottom, end), (row, end)]:
                                cell = coord.copy()
                                cell[dimensions[0]] = u
                                cell[dimensions[1]] = w
                                cell += low
                                corners.append((cell * S + ORIGIN).tolist())
                            normal = np.zeros(3)
                            normal[axis] = sign
                            cross = np.cross(
                                np.asarray(corners[1]) - corners[0],
                                np.asarray(corners[2]) - corners[0],
                            )
                            if np.dot(cross, normal) < 0:
                                corners.reverse()
                            positions.extend(corners)
                            normals.extend([normal.tolist()] * 4)
                            indices.extend(
                                [start, start + 1, start + 2, start, start + 2, start + 3]
                            )
                            col = end
    return high - low, len(occupied), faces


def linear(hex_value):
    values = [int(hex_value[index : index + 2], 16) / 255 for index in (0, 2, 4)]
    return [
        value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in values
    ]


def write_glb(
    path,
    faces,
    material_map=None,
    title="万象酒馆 · 客房",
    mesh_name="Guest_Room",
    source="建模工具/build_tavern_guest_room.py",
):
    material_map = material_map or {}
    blob = bytearray()
    doc = {
        "asset": {"version": "2.0", "generator": "Wanxiang guest-room atelier"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Guest_Room_Voxels", "mesh": 0}],
        "meshes": [],
        "materials": [],
        "bufferViews": [],
        "accessors": [],
        "buffers": [],
    }

    def accessor(array, component_type, kind, target, include_bounds=False):
        while len(blob) % 4:
            blob.append(0)
        raw = np.asarray(array).tobytes()
        index = len(doc["bufferViews"])
        doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": len(blob), "byteLength": len(raw), "target": target}
        )
        blob.extend(raw)
        item = {
            "bufferView": index,
            "componentType": component_type,
            "count": len(array),
            "type": kind,
        }
        if include_bounds:
            values = np.asarray(array)
            item.update(min=values.min(0).tolist(), max=values.max(0).tolist())
        doc["accessors"].append(item)
        return len(doc["accessors"]) - 1

    used = sorted(faces)
    material_index = {}
    material_targets = sorted({material_map.get(color_index, color_index) for color_index in used})
    for color_index in material_targets:
        name, rgb, emit = palette[color_index - 1]
        material = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [*linear("%02x%02x%02x" % rgb), 1],
                "roughnessFactor": 0.86,
                "metallicFactor": 0,
            },
        }
        if any(part in name for part in ["brass", "copper", "iron"]):
            material["pbrMetallicRoughness"].update(roughnessFactor=0.5, metallicFactor=0.55)
        elif any(part in name for part in ["plaster", "stone", "linen", "cream"]):
            material["pbrMetallicRoughness"]["roughnessFactor"] = 0.96
        if emit:
            material["emissiveFactor"] = [value * emit for value in linear("%02x%02x%02x" % rgb)]
        material_index[color_index] = len(doc["materials"])
        doc["materials"].append(material)

    primitives = []
    triangles = 0
    for color_index in used:
        data = faces[color_index]
        if not data["p"]:
            continue
        positions = np.asarray(data["p"], dtype="<f4")
        normals = np.asarray(data["n"], dtype="<f4")
        indices = np.asarray(data["i"], dtype="<u4")
        primitives.append(
            {
                "attributes": {
                    "POSITION": accessor(positions, 5126, "VEC3", 34962, True),
                    "NORMAL": accessor(normals, 5126, "VEC3", 34962),
                },
                "indices": accessor(indices, 5125, "SCALAR", 34963),
                "material": material_index[material_map.get(color_index, color_index)],
            }
        )
        triangles += len(indices) // 3
    doc["meshes"].append({"name": mesh_name, "primitives": primitives})
    doc["buffers"] = [{"byteLength": len(blob)}]
    doc["extras"] = {
        "title": title,
        "voxelEdgeMeters": S,
        "boxDefinitions": box_calls,
        "triangles": triangles,
        "materials": len(material_targets),
        "source": source,
    }
    encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=True).encode()
    encoded += b" " * ((-len(encoded)) % 4)
    blob.extend(b"\0" * ((-len(blob)) % 4))
    output = (
        struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(blob))
        + struct.pack("<II", len(encoded), 0x4E4F534A)
        + encoded
        + struct.pack("<II", len(blob), 0x004E4942)
        + blob
    )
    path.write_bytes(output)
    return triangles, len(output)


ROOM_VARIANTS = [
    {
        "kind": "a",
        "asset": "万象酒馆-客房A.glb",
        "runtime": "guest-room-a.glb",
        "spec": "客房A模型规格.json",
        "title": "万象酒馆 · 客房·东厢",
        "seed": 20261018,
        "style": "warm plaster, dark walnut, brass fittings and wine fabric",
        "landmarks": [
            "low walnut guest bed",
            "moonlit window seat",
            "writing desk with tavern chair",
            "double-door wardrobe",
            "basin stand with mirror",
            "iron stove with kettle",
            "corridor door",
        ],
    },
    {
        "kind": "b",
        "asset": "万象酒馆-客房B.glb",
        "runtime": "guest-room-b.glb",
        "spec": "客房B模型规格.json",
        "title": "万象酒馆 · 客房·西厢",
        "seed": 20261019,
        "style": "warm plaster, dark walnut, brass fittings and cool blue fabric",
        "landmarks": [
            "blue-accent guest bed",
            "moonlit window seat",
            "writing desk with tavern chair",
            "double-door wardrobe",
            "basin stand with mirror",
            "iron stove with kettle",
            "corridor door",
        ],
    },
]

GUEST_B_REMAP = {
    "wine": "blue",
    "rug2": "night3",
    "rug3": "blue",
    "green": "night3",
    "greenLight": "blue",
    "mint": "blue",
}


def build_room(config):
    global VOL, box_calls, VARIANT, rng
    started = time.time()
    VARIANT = config["kind"]
    rng = random.Random(config["seed"])
    VOL = np.zeros(SHAPE, dtype=np.uint8)
    box_calls = 0
    floor_and_walls()
    ceiling()
    door()
    window()
    bed()
    wardrobe()
    desk()
    washstand()
    stove()
    rug()
    decor()
    dimensions, occupied, faces = meshes()
    if VARIANT == "b":
        remap = {lookup[source]: lookup[target] for source, target in GUEST_B_REMAP.items()}
    else:
        remap = {}
    triangles, bytes_written = write_glb(
        TAVERN_OUT / config["asset"],
        faces,
        material_map=remap,
        title=config["title"],
        mesh_name="Guest_Room_" + VARIANT.upper(),
    )
    runtime = ASSETS / config["runtime"]
    runtime.write_bytes((TAVERN_OUT / config["asset"]).read_bytes())
    if VARIANT == "a":
        (TAVERN_OUT / "万象酒馆-客房.glb").write_bytes((TAVERN_OUT / config["asset"]).read_bytes())
        (ASSETS / "guest-room.glb").write_bytes((TAVERN_OUT / config["asset"]).read_bytes())
    spec = {
        "name": config["title"],
        "variant": VARIANT,
        "asset": config["asset"],
        "runtime": "assets/" + config["runtime"],
        "voxel_edge_m": S,
        "resolution": "2 cm watertight voxel surface",
        "occupied_voxels": occupied,
        "box_definitions": box_calls,
        "triangles": triangles,
        "bytes": bytes_written,
        "dimensions_cells": dimensions.tolist(),
        "room_m": [8, 3.12, 6.4],
        "eye_height_m": 1.36,
        "style": config["style"],
        "landmarks": config["landmarks"],
        "teleport_door": "three matching doors at the end of the upstairs corridor",
        "mesh_cleanup": "single owner volume, hidden-face culling and greedy coplanar merge",
        "build_seconds": round(time.time() - started, 1),
    }
    (TAVERN_OUT / config["spec"]).write_text(
        json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(spec, ensure_ascii=False))


def build():
    for config in ROOM_VARIANTS:
        build_room(config)


if __name__ == "__main__":
    build()
