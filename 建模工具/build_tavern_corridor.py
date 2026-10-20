"""Build the upstairs corridor shared by the two guest rooms and the master bedroom."""

import json
import math
import random
import struct
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TAVERN_OUT = ROOT / "万象酒馆-体素模型"
ASSETS = ROOT / "万象酒馆-Demo/assets"
S = 0.02
ORIGIN = np.array([-1.9, -0.34, -5.1])
SHAPE = (190, 180, 520)
rng = random.Random(20261021)
DOOR_CENTERS = (2.2, 0.0, -2.2)
RETURN_Z = 1.0
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
    "grout": "3f424b",
    "plaster": "c1b399",
    "plaster2": "b9ac94",
    "plaster3": "c6baa2",
    "iron": "303037",
    "ironLight": "4b4b51",
    "brass": "ad8647",
    "brassLight": "c3a267",
    "brassDark": "806231",
    "rug": "693548",
    "rug2": "7b4256",
    "rug3": "552c40",
    "thread": "b99163",
    "wine": "673943",
    "cream": "ddd0b0",
    "linen": "cfc2a5",
    "paper": "ded0aa",
    "paperShadow": "b9aa84",
    "night": "1d3145",
    "night2": "29465b",
    "night3": "355a73",
    "mirror": "91a4a7",
    "leaf": "557452",
    "leafLight": "6d8c61",
    "bark": "5c3b29",
    "terracotta": "9c6351",
    "wax": "e5d5ad",
}.items():
    color(name, hex_value)
for name, hex_value, emit in [
    ("flame", "ffe0a0", 0.9),
    ("fire", "f2b564", 0.6),
    ("lanternGlow", "ffd28a", 0.55),
    ("moonGlow", "d4ebff", 0.8),
    ("starGlow", "fff4cc", 0.9),
]:
    color(name, hex_value, emit)


def ix(value, axis):
    return int(round((value - ORIGIN[axis]) / S))


def cid(name):
    return lookup[name] if isinstance(name, str) else name


VOL = np.zeros(SHAPE, dtype=np.uint8)


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


def oval_xz(cx, cz, rx, rz, y, h, name, inner=0.0):
    global box_calls
    b, b1 = ix(y, 1), ix(y + h, 1)
    for a in range(ix(cx - rx, 0), ix(cx + rx, 0)):
        x = ORIGIN[0] + (a + 0.5) * S
        for e in range(ix(cz - rz, 2), ix(cz + rz, 2)):
            z = ORIGIN[2] + (e + 0.5) * S
            radial = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2
            if radial <= 1 and radial >= inner * inner:
                VOL[a : a + 1, b:b1, e : e + 1] = cid(name)
                box_calls += 1


def shell_and_floor():
    box(-1.9, -0.34, -5.1, 3.8, 0.22, 10.2, "stoneDark")
    box(-1.88, -0.12, -5.08, 3.76, 0.12, 10.16, "oakDark")
    x = -1.7
    while x < 1.7:
        width = min(0.18, 1.7 - x)
        paint_top(x, -4.8, width - 0.02, 9.6, rng.choice(["plank", "plank2", "plank3"]))
        x += 0.18
    for _ in range(140):
        paint_top(
            rng.uniform(-1.65, 1.55),
            rng.uniform(-4.7, 4.7),
            rng.choice([0.04, 0.06, 0.1]),
            rng.choice([0.02, 0.04]),
            "grain",
        )

    # Walls with real door and window openings.
    box(-1.88, 0, -4.96, 0.18, 2.95, 9.92, "plaster2")
    box(1.7, 0, -4.96, 0.18, 2.95, 9.92, "plaster2")
    box(-1.88, 0, -4.96, 3.76, 2.95, 0.18, "plaster")
    box(-1.88, 0, 4.78, 3.76, 2.95, 0.18, "plaster")
    for zc in DOOR_CENTERS:
        clear_box(-1.9, 0, zc - 0.5, 0.22, 2.18, 1.0)
    clear_box(1.68, 0, RETURN_Z - 0.5, 0.2, 2.22, 1.0)
    clear_box(-0.66, 0.9, -5.1, 1.32, 1.62, 0.2)

    # Stone wainscot and chair rail.
    for row in range(4):
        y = 0.06 + row * 0.18
        offset = (row % 2) * 0.23
        z = -4.8 + offset - 0.48
        while z < 4.8:
            z0, z1 = max(-4.8, z), min(4.8, z + 0.44)
            if z1 - z0 >= S:
                stone = rng.choice(["stone", "stoneLight", "stoneDark"])
                if not any(z1 > zc - 0.5 and z0 < zc + 0.5 for zc in DOOR_CENTERS):
                    box(-1.7, y, z0, S, 0.16, z1 - z0, stone)
                if not (z1 > RETURN_Z - 0.5 and z0 < RETURN_Z + 0.5):
                    box(1.68, y, z0, S, 0.16, z1 - z0, stone)
            z += 0.48
    for y, h in [(0, 0.1), (0.82, 0.12)]:
        for z0, z1 in [(-4.8, -2.7), (-1.7, -0.5), (0.5, 1.7), (2.7, 4.7)]:
            box(-1.7, y, z0, 0.03, h, z1 - z0, "walnut")
        for z0, z1 in [(-4.8, 2.9), (3.9, 4.7)]:
            box(1.67, y, z0, 0.03, h, z1 - z0, "walnut")
    for z in [-4.8, 4.7]:
        box(-1.7, 0, z, 0.08, 2.95, 0.08, "walnut")
        box(1.62, 0, z, 0.08, 2.95, 0.08, "walnut")
    for z in [-4.7, -2.0, 0.7, 3.3, 4.7]:
        box(-1.7, 2.78, z, 3.4, 0.12, 0.08, "walnut")

    # Plaster wear and framed panels.
    for _ in range(80):
        side = rng.choice([-1, 1])
        yy = rng.uniform(1.0, 2.7)
        zz = rng.uniform(-4.6, 4.6)
        if side < 0 and any(zc - 0.62 < zz < zc + 0.62 for zc in DOOR_CENTERS):
            continue
        if side > 0 and RETURN_Z - 0.62 < zz < RETURN_Z + 0.62:
            continue
        x0 = -1.7 if side < 0 else 1.68
        box(
            x0,
            yy,
            zz,
            S,
            rng.choice([0.02, 0.04, 0.06]),
            rng.choice([0.04, 0.08, 0.12]),
            rng.choice(["plaster2", "plaster3"]),
        )
    for z in [-1.2]:
        box(1.66, 1.15, z - 0.02, 0.04, 0.9, 1.0, "walnut")
        box(1.64, 1.2, z + 0.04, 0.02, 0.8, 0.88, "paperShadow")
        for step in range(4):
            box(1.62, 1.32 + step * 0.16, z + 0.1, 0.02, 0.06, 0.68 - step * 0.12, "wine")
    for z in [-2.8]:
        box(1.66, 1.25, z - 0.14, 0.04, 0.5, 0.28, "oak")
        box(1.64, 1.3, z - 0.1, 0.02, 0.4, 0.2, "paper")
        box(1.62, 1.5, z - 0.06, 0.02, 0.04, 0.12, "brass")


def ceiling_and_lighting_fixtures():
    box(-1.88, 2.95, -5.1, 3.76, 0.12, 10.2, "oakDark")
    z = -4.8
    while z < 4.8:
        paint_layer(-1.7, 2.95, z, 3.4, 0.18, rng.choice(["oak", "oakGrain", "oakLight"]))
        z += 0.2
    for z in [-3.5, -1.2, 1.1, 3.4]:
        box(-1.7, 2.78, z - 0.07, 3.4, 0.18, 0.14, "walnut")
    for z in [2.75, 0.4, -2.0]:
        box(-0.02, 2.34, z, 0.04, 0.61, 0.04, "iron")
        box(-0.16, 2.28, z - 0.16, 0.32, 0.05, 0.32, "iron")
        box(-0.12, 1.86, z - 0.12, 0.24, 0.4, 0.24, "lanternGlow")
        for x in [-0.16, 0.12]:
            for zz in [z - 0.14, z + 0.14]:
                box(x, 1.84, zz, 0.04, 0.46, 0.04, "iron")
        box(-0.18, 2.3, z - 0.18, 0.36, 0.04, 0.36, "brass")
        box(-0.1, 1.8, z - 0.1, 0.2, 0.04, 0.2, "iron")
    for z in [1.9, -0.85]:
        box(1.66, 1.3, z, 0.05, 0.04, 0.5, "brass")
        for zz in [z - 0.25, z + 0.25]:
            box(1.61, 1.3, zz, 0.1, 0.04, 0.06, "brass")
            box(1.58, 1.34, zz, 0.07, 0.12, 0.06, "wax")
            box(1.58, 1.46, zz, 0.07, 0.04, 0.06, "flame")
    for z in [-3.2]:
        box(1.66, 1.55, z, 0.06, 0.3, 0.18, "brass")
        box(1.6, 1.6, z - 0.03, 0.06, 0.2, 0.12, "lanternGlow")


def doors():
    for zc, number in zip(DOOR_CENTERS, (1, 2, 3)):
        # Frame and a single flush-mounted door leaf; all three doors share this geometry.
        box(-1.72, 0, zc - 0.58, 0.12, 2.28, 0.08, "walnut")
        box(-1.72, 0, zc + 0.5, 0.12, 2.28, 0.08, "walnut")
        box(-1.72, 2.18, zc - 0.58, 0.12, 0.1, 1.16, "walnut")
        box(-1.86, 0, zc - 0.5, 0.16, 2.18, 0.08, "walnut")
        box(-1.86, 0, zc + 0.42, 0.16, 2.18, 0.08, "walnut")
        box(-1.86, 2.1, zc - 0.5, 0.16, 0.08, 1.0, "walnut")
        box(-1.84, 0.03, zc - 0.46, 0.08, 2.12, 0.92, "walnutDark")
        for y in [0.16, 1.08]:
            box(-1.76, y, zc - 0.38, 0.02, 0.76, 0.76, "oak")
            box(-1.76, y + 0.1, zc - 0.28, 0.02, 0.56, 0.56, "walnutLight")
        box(-1.76, 1.96, zc - 0.3, 0.02, 0.1, 0.6, "oak")
        box(-1.76, 1.02, zc + 0.3, 0.04, 0.1, 0.16, "brass")
        box(-1.72, 1.06, zc + 0.32, 0.06, 0.08, 0.08, "brassLight")
        for y in [0.42, 1.62]:
            box(-1.76, y, zc - 0.5, 0.04, 0.12, 0.08, "iron")
        # Number plate: one, two or three brass bars over an otherwise identical door.
        box(-1.73, 2.36, zc - 0.22, 0.08, 0.2, 0.44, "walnutDark")
        box(-1.67, 2.4, zc - 0.18, 0.02, 0.12, 0.36, "brass")
        for index in range(number):
            box(-1.65, 2.44, zc - 0.12 + index * 0.09, 0.02, 0.05, 0.03, "brassDark")


def return_door():
    # A wider, distinctly marked door on the opposite wall: back to the tavern.
    box(1.7, 0, RETURN_Z - 0.5, 0.16, 2.22, 0.08, "walnut")
    box(1.7, 0, RETURN_Z + 0.42, 0.16, 2.22, 0.08, "walnut")
    box(1.7, 2.14, RETURN_Z - 0.5, 0.16, 0.08, 1.0, "walnut")
    box(1.76, 0.03, RETURN_Z - 0.46, 0.08, 2.12, 0.92, "oakEdge")
    box(1.74, 0.16, RETURN_Z - 0.38, 0.02, 0.78, 0.76, "walnutLight")
    box(1.74, 1.1, RETURN_Z - 0.38, 0.02, 0.72, 0.76, "walnutLight")
    box(1.74, 1.96, RETURN_Z - 0.3, 0.02, 0.1, 0.6, "brassDark")
    box(1.7, 1.02, RETURN_Z + 0.3, 0.02, 0.1, 0.16, "brass")
    box(1.70, 1.06, RETURN_Z + 0.32, 0.04, 0.08, 0.08, "brassLight")
    for y in [0.42, 1.62]:
        box(1.7, y, RETURN_Z - 0.5, 0.06, 0.12, 0.08, "iron")
    box(1.62, 2.4, RETURN_Z - 0.4, 0.1, 0.34, 0.8, "walnutDark")
    box(1.6, 2.44, RETURN_Z - 0.34, 0.02, 0.26, 0.68, "brass")
    box(1.58, 2.5, RETURN_Z - 0.2, 0.02, 0.14, 0.4, "oak")
    box(1.58, 2.56, RETURN_Z - 0.02, 0.02, 0.04, 0.08, "brass")


def entry_and_window():
    # Console and mirror on the near wall, opposite the room doors.
    box(-0.82, 0, 4.38, 0.08, 0.72, 0.08, "walnut")
    box(0.74, 0, 4.38, 0.08, 0.72, 0.08, "walnut")
    box(-0.82, 0.72, 4.4, 1.64, 0.08, 0.28, "walnut")
    box(-0.7, 0.8, 4.46, 1.4, 0.12, 0.12, "brass")
    box(-0.32, 0.8, 4.48, 0.64, 0.24, 0.06, "mirror")
    box(-0.38, 0.8, 4.42, 0.76, 2.0, 0.06, "walnutDark")
    box(-0.32, 0.86, 4.48, 0.64, 1.88, 0.04, "mirror")
    box(-0.26, 2.44, 4.5, 0.52, 0.08, 0.04, "brass")
    box(-0.62, 0.8, 4.52, 0.12, 0.18, 0.1, "terracotta")
    box(-0.62, 0.98, 4.52, 0.12, 0.34, 0.08, "leaf")
    box(0.48, 0.8, 4.5, 0.14, 0.2, 0.14, "wine")
    box(0.62, 0.8, 4.5, 0.1, 0.12, 0.1, "wax")

    # The far wall is split equally between supplies and the future ether device.
    clear_box(-1.68, 0.05, -4.96, 3.36, 2.72, 0.22)
    box(-1.7, 0, -4.96, 3.4, 2.95, 0.12, "walnutDark")


def vending_bottle(center_x, base_y, liquid):
    """One aligned potion: foot, body, shoulder, neck, seal, label and glass highlight."""
    box(center_x - 0.055, base_y, -4.075, 0.11, 0.018, 0.082, "iron")
    box(center_x - 0.05, base_y + 0.018, -4.07, 0.10, 0.12, 0.072, liquid)
    box(center_x - 0.045, base_y + 0.028, -3.994, 0.018, 0.098, 0.006, "cream")
    box(center_x - 0.035, base_y + 0.138, -4.058, 0.07, 0.03, 0.06, "mirror")
    box(center_x - 0.021, base_y + 0.168, -4.052, 0.042, 0.038, 0.046, "mirror")
    box(center_x - 0.024, base_y + 0.162, -4.056, 0.048, 0.01, 0.05, "brassLight")
    box(center_x - 0.014, base_y + 0.206, -4.044, 0.028, 0.024, 0.034, "brassDark")
    box(center_x - 0.036, base_y + 0.035, -3.996, 0.072, 0.062, 0.012, "paper")
    box(center_x - 0.03, base_y + 0.042, -3.982, 0.06, 0.008, 0.004, "brassDark")
    box(center_x - 0.024, base_y + 0.054, -3.982, 0.048, 0.026, 0.004, "wine")
    box(center_x - 0.009, base_y + 0.028, -3.982, 0.018, 0.078, 0.004, "paperShadow")


def vending_machine():
    # A single, evenly stocked cabinet: four columns, three shelves, centred labels.
    x = -1.56
    box(x, 0.04, -4.72, 1.4, 0.16, 0.68, "iron")
    box(x + 0.03, 0.2, -4.7, 1.34, 2.16, 0.64, "walnutDark")
    box(x + 0.02, 2.36, -4.74, 1.38, 0.08, 0.68, "brassDark")
    box(x + 0.08, 2.44, -4.7, 1.24, 0.04, 0.6, "brass")
    for xx in [x + 0.04, x + 1.28]:
        box(xx, 0.18, -4.69, 0.08, 2.22, 0.62, "brass")
        box(xx - 0.012, 0.28, -4.08, 0.024, 1.9, 0.08, "brassLight")
    box(x + 0.04, 2.22, -4.16, 1.32, 0.16, 0.18, "brassDark")
    box(x + 0.16, 2.24, -4.08, 1.08, 0.12, 0.05, "night2")
    for index in range(5):
        box(x + 0.27 + index * 0.18, 2.265, -4.025, 0.12, 0.055, 0.02, "starGlow")
    box(x + 0.16, 0.94, -4.14, 0.86, 1.12, 0.04, "night")
    box(x + 0.12, 0.9, -4.13, 0.94, 0.04, 0.06, "brass")
    box(x + 0.12, 2.06, -4.13, 0.94, 0.04, 0.06, "brass")
    box(x + 0.12, 0.9, -4.13, 0.04, 1.2, 0.06, "brass")
    box(x + 1.02, 0.9, -4.13, 0.04, 1.2, 0.06, "brass")
    for row, shelf_y in enumerate([0.98, 1.34, 1.7]):
        box(x + 0.16, shelf_y, -4.105, 0.8, 0.026, 0.14, "brass")
        box(x + 0.145, shelf_y - 0.012, -3.995, 0.83, 0.032, 0.026, "brassDark")
        box(x + 0.18, shelf_y + 0.03, -4.095, 0.76, 0.012, 0.012, "moonGlow")
        for col, liquid in enumerate(["moonGlow", "wine", "leafLight", "wax"]):
            center_x = x + 0.296 + col * 0.196
            vending_bottle(center_x, shelf_y + 0.026, liquid)
            box(center_x - 0.038, shelf_y - 0.022, -3.958, 0.076, 0.022, 0.008, "paperShadow")
    box(x + 0.96, 1.28, -3.99, 0.022, 0.48, 0.024, "brassLight")
    box(x + 0.945, 1.7, -3.985, 0.05, 0.026, 0.02, "brass")

    # Control strip: cash reader, three-by-three keypad and a framed delivery hatch.
    box(x + 1.0, 0.98, -4.1, 0.3, 1.06, 0.04, "iron")
    box(x + 1.035, 1.56, -4.08, 0.23, 0.2, 0.08, "brass")
    box(x + 1.07, 1.62, -4.01, 0.15, 0.06, 0.02, "iron")
    box(x + 1.075, 1.7, -4.01, 0.14, 0.055, 0.018, "moonGlow")
    for row in range(3):
        for col in range(3):
            box(
                x + 1.055 + col * 0.066, 1.2 + row * 0.085, -4.005, 0.044, 0.05, 0.022, "brassLight"
            )
    box(x + 1.06, 1.04, -4.005, 0.18, 0.07, 0.02, "night2")
    box(x + 1.085, 1.055, -3.995, 0.13, 0.04, 0.008, "starGlow")
    box(x + 0.18, 0.36, -4.12, 1.02, 0.46, 0.07, "brassDark")
    box(x + 0.24, 0.41, -3.99, 0.88, 0.34, 0.026, "iron")
    box(x + 0.28, 0.46, -3.972, 0.76, 0.24, 0.012, "night")
    box(x + 0.44, 0.67, -3.958, 0.44, 0.018, 0.018, "brassLight")
    box(x + 0.64, 0.37, -3.955, 0.12, 0.08, 0.018, "brass")
    box(x + 0.67, 0.39, -3.94, 0.06, 0.04, 0.008, "starGlow")
    box(x + 0.1, 0.28, -4.08, 1.16, 0.035, 0.12, "brass")
    box(x + 0.14, 0.24, -4.06, 1.08, 0.028, 0.08, "brassDark")

    # Feet, vents, screws and a bank of cold-cathode tubes under the display.
    for xx in [x + 0.1, x + 1.16]:
        box(xx, 0.01, -4.56, 0.14, 0.07, 0.16, "brassDark")
    for col in range(15):
        box(x + 0.18 + col * 0.07, 0.255, -4.055, 0.035, 0.095, 0.02, "ironLight")
    for row in range(3):
        for col in range(4):
            box(x + 0.22 + col * 0.24, 0.3 + row * 0.03, -4.0, 0.18, 0.012, 0.012, "moonGlow")
    for yy in np.arange(0.28, 2.22, 0.12):
        for xx in [x + 0.055, x + 1.345]:
            box(xx, yy, -4.0, 0.025, 0.025, 0.02, "brassLight")


def void_machines():
    vending_machine()
    # Right half: dormant containment rings, a faceted ether core and pipework.
    x = 0.16
    box(x, 0.04, -4.72, 1.4, 0.16, 0.68, "iron")
    box(x + 0.08, 0.2, -4.66, 1.24, 0.38, 0.56, "walnutDark")
    for yy in [0.5, 1.92]:
        box(x + 0.12, yy, -4.58, 1.16, 0.12, 0.4, "brassDark")
        box(x + 0.22, yy + 0.04, -4.12, 0.96, 0.04, 0.06, "moonGlow")
    for xx in [x + 0.1, x + 1.22]:
        box(xx, 0.6, -4.48, 0.08, 1.34, 0.12, "brass")
    box(x + 0.42, 0.84, -4.44, 0.56, 0.74, 0.24, "night3")
    box(x + 0.5, 0.7, -4.38, 0.4, 1.02, 0.16, "night2")
    box(x + 0.6, 0.62, -4.32, 0.2, 1.18, 0.08, "moonGlow")
    box(x + 0.52, 1.0, -4.26, 0.36, 0.4, 0.08, "mirror")
    for row in range(14):
        angle = row * math.tau / 14
        xx = x + 0.68 + math.sin(angle) * 0.52
        yy = 1.3 + math.cos(angle) * 0.62
        box(xx, yy, -4.18, 0.08, 0.08, 0.06, "brassLight")
    box(x + 0.24, 2.12, -4.36, 0.92, 0.2, 0.18, "brassDark")
    box(x + 0.4, 2.16, -4.16, 0.6, 0.08, 0.04, "moonGlow")
    for col in range(3):
        box(x + 0.42 + col * 0.18, 0.3, -4.08, 0.08, 0.1, 0.04, "ironLight")

    # Five-millimetre details: rivets, vents and the suspended astrolabe.
    for yy in np.arange(0.25, 2.16, 0.12):
        for xx in [0.285, 1.385]:
            box(xx, yy, -4.005, 0.02, 0.02, 0.015, "brassLight")
    for row in range(4):
        for col in range(9):
            box(-1.35 + col * 0.11, 2.275 + row * 0.02, -3.995, 0.05, 0.008, 0.008, "moonGlow")
    # An astrolabe with nested engraved rings, fine teeth and suspended crystalline light.
    for radius, count in [(0.49, 96), (0.38, 72), (0.24, 48)]:
        for step in range(count):
            angle = step * math.tau / count
            box(
                0.84 + math.sin(angle) * radius,
                1.3 + math.cos(angle) * radius,
                -4.075,
                0.018,
                0.018,
                0.02,
                "brassLight" if step % 6 else "moonGlow",
            )
    for row in range(22):
        width = 0.04 + (1 - abs(row - 10.5) / 11) * 0.24
        box(
            0.84 - width / 2,
            1.015 + row * 0.025,
            -4.06,
            width,
            0.025,
            0.04,
            "night3" if row % 3 else "moonGlow",
        )
    for side in [-1, 1]:
        for row in range(9):
            box(0.84 + side * 0.59, 0.68 + row * 0.14, -4.16, 0.03, 0.025, 0.14, "brassDark")


def detailed_machine_meshes():
    global VOL, S, ORIGIN, SHAPE
    original = (VOL, S, ORIGIN, SHAPE)
    try:
        S = 0.005
        ORIGIN = np.array([-1.7, 0, -4.8])
        SHAPE = (680, 500, 220)
        VOL = np.zeros(SHAPE, dtype=np.uint8)
        void_machines()
        return meshes()[2]
    finally:
        VOL, S, ORIGIN, SHAPE = original


def runner():
    box(-0.68, 0, -4.35, 1.36, 0.035, 8.7, "rug")
    box(-0.62, 0.02, -4.29, 1.24, 0.02, 8.58, "rug2")
    for x in [-0.56, 0.52]:
        box(x, 0.04, -4.25, 0.06, 0.02, 8.48, "thread")
    for z in range(-4, 4):
        for x in [-0.4, -0.1, 0.2]:
            if (z + round(x * 10)) % 2 == 0:
                box(x, 0.04, z + 0.15, 0.18, 0.02, 0.36, "rug3")
            else:
                box(x, 0.04, z + 0.15, 0.18, 0.02, 0.36, "thread")
    for z in np.arange(-4.25, 4.25, 0.28):
        box(-0.58, 0.04, z, 0.1, 0.02, 0.08, "thread")
        box(0.48, 0.04, z, 0.1, 0.02, 0.08, "thread")
    for x in np.arange(-0.58, 0.6, 0.16):
        box(x, 0, -4.4, 0.04, 0.02, 0.08, "thread")
        box(x, 0, 4.36, 0.04, 0.02, 0.08, "thread")


def extras():
    # Plant at the far right, a small console beneath the wall pictures.
    box(1.3, 0, -3.95, 0.26, 0.24, 0.26, "terracotta")
    box(1.26, 0.24, -3.99, 0.34, 0.05, 0.34, "bark")
    for x, z, height in [(1.36, -3.9, 0.8), (1.42, -4.0, 0.6), (1.28, -4.02, 0.64)]:
        box(x, 0.29, z, 0.05, height, 0.05, "bark")
        box(x - 0.05, 0.46, z, 0.12, 0.06, 0.1, "leaf")
        box(x + 0.03, 0.68, z - 0.02, 0.12, 0.06, 0.1, "leafLight")
    box(1.34, 0.28, -2.9, 0.32, 0.08, 0.5, "oak")
    box(1.38, 0.36, -2.84, 0.24, 0.04, 0.38, "oakLight")
    box(1.34, 0, -2.72, 0.08, 0.28, 0.08, "walnut")
    box(1.58, 0, -2.72, 0.08, 0.28, 0.08, "walnut")
    box(1.58, 0.28, -2.86, 0.08, 0.08, 0.08, "walnut")
    box(1.34, 0.36, -2.76, 0.1, 0.22, 0.1, "cream")
    box(1.58, 0.36, -2.8, 0.12, 0.16, 0.12, "wine")

    for x in [-1.7, 1.68]:
        box(x, 2.64, -4.8, 0.04, 0.04, 9.6, "walnut")
    for z in [-4.4, 4.4]:
        box(-1.7, 2.64, z, 3.4, 0.04, 0.04, "walnut")


def meshes():
    occupied = np.argwhere(VOL)
    if not len(occupied):
        raise RuntimeError("Corridor has no voxels")
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


def write_glb(path, faces):
    blob = bytearray()
    doc = {
        "asset": {"version": "2.0", "generator": "Wanxiang corridor atelier"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Corridor_Voxels", "mesh": 0}],
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
    for color_index in used:
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
                "material": material_index[color_index],
            }
        )
        triangles += len(indices) // 3
    doc["meshes"].append({"name": "Corridor", "primitives": primitives})
    doc["buffers"] = [{"byteLength": len(blob)}]
    doc["extras"] = {
        "title": "万象酒馆 · 二层走廊",
        "voxelEdgeMeters": S,
        "boxDefinitions": box_calls,
        "triangles": triangles,
        "materials": len(used),
        "source": "建模工具/build_tavern_corridor.py",
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


def build():
    started = time.time()
    shell_and_floor()
    ceiling_and_lighting_fixtures()
    doors()
    return_door()
    entry_and_window()
    runner()
    extras()
    dimensions, occupied, faces = meshes()
    details = detailed_machine_meshes()
    for color_index, data in details.items():
        target = faces[color_index]
        offset = len(target["p"])
        target["p"].extend(data["p"])
        target["n"].extend(data["n"])
        target["i"].extend(index + offset for index in data["i"])
    triangles, bytes_written = write_glb(TAVERN_OUT / "万象酒馆-走廊.glb", faces)
    runtime = ASSETS / "corridor.glb"
    runtime.write_bytes((TAVERN_OUT / "万象酒馆-走廊.glb").read_bytes())
    spec = {
        "name": "万象酒馆 · 二层走廊",
        "asset": "万象酒馆-走廊.glb",
        "runtime": "assets/corridor.glb",
        "voxel_edge_m": S,
        "machine_voxel_edge_m": 0.005,
        "machine_detail_multiplier": 4,
        "resolution": "2 cm watertight voxel surface",
        "occupied_voxels": occupied,
        "box_definitions": box_calls,
        "triangles": triangles,
        "bytes": bytes_written,
        "dimensions_cells": dimensions.tolist(),
        "room_m": [3.4, 2.95, 9.6],
        "eye_height_m": 1.46,
        "doors": [
            "guest-room-a",
            "guest-room-b",
            "master-bedroom",
        ],
        "return_door": "tavern hall on the right wall",
        "style": "warm plaster, dark walnut, brass sconces and a wine runner",
        "mesh_cleanup": "single owner volume, hidden-face culling and greedy coplanar merge",
        "build_seconds": round(time.time() - started, 1),
    }
    (TAVERN_OUT / "走廊模型规格.json").write_text(
        json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps(spec, ensure_ascii=False))


build()
