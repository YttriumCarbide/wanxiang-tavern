"""Build the master bedroom: twice the guest-room floor area and a king bed."""

import json
import math
import random
import time
from pathlib import Path

import numpy as np

import build_tavern_guest_room as kit
from tavern_chair import tavern_chair

ROOT = Path(__file__).resolve().parents[1]
TAVERN_OUT = ROOT / "万象酒馆-体素模型"
ASSETS = ROOT / "万象酒馆-Demo/assets"
S = kit.S
ORIGIN = np.array([-5.78, -0.34, -4.78])
SHAPE = (596, 200, 480)
X0, X1 = -5.6, 5.6
Z0, Z1 = -4.6, 4.6
HEIGHT = 3.4
rng = random.Random(20261022)
kit.ORIGIN = ORIGIN
kit.SHAPE = SHAPE
kit.VOL = np.zeros(SHAPE, dtype=np.uint8)
kit.box_calls = 0


def box(x, y, z, w, h, d, name):
    kit.box(x, y, z, w, h, d, name)


def clear_box(x, y, z, w, h, d):
    kit.clear_box(x, y, z, w, h, d)


def paint_top(x, z, w, d, name, y=0.0):
    kit.paint_top(x, z, w, d, name, y)


def oval_xz(cx, cz, rx, rz, y, h, name, inner=0.0):
    kit.oval_xz(cx, cz, rx, rz, y, h, name, inner)


def floor_and_walls():
    box(X0 - 0.18, -0.34, Z0 - 0.18, X1 - X0 + 0.36, 0.22, Z1 - Z0 + 0.36, "stoneDark")
    box(X0 - 0.16, -0.12, Z0 - 0.16, X1 - X0 + 0.32, 0.12, Z1 - Z0 + 0.32, "oakDark")
    x = X0
    while x < X1:
        width = min(0.24, X1 - x)
        paint_top(x, Z0, width - 0.015, Z1 - Z0, rng.choice(["plank2", "plank3", "plank4"]))
        x += 0.24
    for _ in range(260):
        paint_top(
            rng.uniform(X0 + 0.05, X1 - 0.1),
            rng.uniform(Z0 + 0.05, Z1 - 0.08),
            rng.choice([0.05, 0.08, 0.12]),
            rng.choice([0.03, 0.05]),
            "grain",
        )
    # Walnut inlay border around the parquet.
    for x, w in [(X0 + 0.02, 0.08), (X1 - 0.1, 0.08)]:
        box(x, 0, Z0 + 0.02, w, 0.025, Z1 - Z0 - 0.04, "walnut")
    for z, d in [(Z0 + 0.02, 0.08), (Z1 - 0.1, 0.08)]:
        box(X0 + 0.02, 0, z, X1 - X0 - 0.04, 0.025, d, "walnut")

    # Walls, door and the large window opening.
    box(X0 - 0.18, 0, Z0 - 0.18, 0.18, HEIGHT, Z1 - Z0 + 0.36, "plaster2")
    box(X1, 0, Z0 - 0.18, 0.18, HEIGHT, Z1 - Z0 + 0.36, "plaster2")
    box(X0 - 0.18, 0, Z0 - 0.18, X1 - X0 + 0.36, HEIGHT, 0.18, "plaster")
    box(X0 - 0.18, 0, Z1, X1 - X0 + 0.36, HEIGHT, 0.18, "plaster")
    clear_box(-0.9, 0, Z1 - 0.03, 1.8, 2.55, 0.25)
    clear_box(X1 - 0.03, 0.8, -0.9, 0.24, 1.9, 2.8)

    # Wainscot, chair rails and paneling.
    for x in [X0, X1 - 0.02]:
        for z in np.arange(Z0 + 0.02, Z1 - 0.1, 0.62):
            box(x, 0.14, z, 0.025, 0.74, 0.57, "oak")
            box(x + 0.01, 0.2, z + 0.04, 0.02, 0.6, 0.49, "oakLight")
    for y, h in [(0, 0.12), (0.88, 0.12), (1.54, 0.08)]:
        box(X0, y, Z0, 0.04, h, Z1 - Z0, "walnut")
        box(X1 - 0.04, y, Z0, 0.04, h, Z1 - Z0, "walnut")
    for z in [Z0, Z1 - 0.04]:
        box(X0, 0, z, X1 - X0, 0.12, 0.04, "walnut")
    for y in [1.2, 2.05, 2.72]:
        box(-0.98, y, Z1 - 0.02, 1.96, 0.035, 0.035, "brass")
    # A few plaster repairs keep the larger room from feeling machine-flat.
    for _ in range(120):
        side = rng.choice([-1, 1])
        yy = rng.uniform(1.0, 2.9)
        zz = rng.uniform(Z0 + 0.1, Z1 - 0.1)
        if side > 0 and 0.8 < yy < 2.7 and -0.9 < zz < 1.9:
            continue
        x = X0 + 0.03 if side < 0 else X1 - 0.05
        box(
            x,
            yy,
            zz,
            0.02,
            rng.choice([0.02, 0.04]),
            rng.choice([0.04, 0.08, 0.12]),
            rng.choice(["plaster2", "plaster3"]),
        )


def ceiling_and_light():
    box(X0 - 0.18, HEIGHT, Z0 - 0.18, X1 - X0 + 0.36, 0.12, Z1 - Z0 + 0.36, "oakDark")
    for z in [-3.7, -1.25, 1.2, 3.65]:
        box(X0, HEIGHT - 0.2, z - 0.09, X1 - X0, 0.2, 0.18, "walnut")
    for x in [-4.7, -2.6, -0.5, 1.6, 3.7]:
        box(x - 0.06, HEIGHT - 0.12, Z0, 0.12, 0.12, Z1 - Z0, "walnutDark")
    # Central brass chandelier.
    box(-0.62, 3.0, 0.08, 0.04, 0.4, 0.04, "iron")
    box(-0.68, 2.9, 0.02, 0.16, 0.12, 0.16, "brass")
    box(-1.3, 2.9, -0.56, 0.04, 0.04, 1.32, "brass")
    box(0.1, 2.9, -0.56, 0.04, 0.04, 1.32, "brass")
    box(-1.3, 2.9, -0.56, 1.44, 0.04, 0.04, "brass")
    box(-1.3, 2.9, 0.72, 1.44, 0.04, 0.04, "brass")
    box(-1.3, 2.9, 0.08, 0.7, 0.04, 0.04, "brass")
    box(-0.6, 2.9, 0.08, 0.74, 0.04, 0.04, "brass")
    box(-0.62, 2.9, -0.56, 0.04, 0.04, 0.66, "brass")
    box(-0.62, 2.9, 0.1, 0.04, 0.04, 0.66, "brass")
    for x, z in [
        (-1.28, -0.52),
        (-1.28, 0.1),
        (-1.28, 0.68),
        (0.12, -0.52),
        (0.12, 0.1),
        (0.12, 0.68),
        (-0.62, -0.54),
        (-0.62, 0.74),
    ]:
        box(x - 0.04, 2.93, z - 0.04, 0.08, 0.07, 0.08, "brass")
        box(x - 0.02, 3.0, z - 0.02, 0.04, 0.1, 0.04, "wax")
        box(x - 0.01, 3.1, z - 0.01, 0.02, 0.03, 0.02, "flame")


def double_door():
    box(-1.0, 0, Z1 - 0.04, 0.12, 2.65, 0.12, "walnut")
    box(0.88, 0, Z1 - 0.04, 0.12, 2.65, 0.12, "walnut")
    box(-1.0, 2.55, Z1 - 0.04, 2.0, 0.14, 0.12, "walnut")
    box(-0.9, 0, Z1 - 0.02, 0.08, 2.55, 0.12, "walnutDark")
    box(0.82, 0, Z1 - 0.02, 0.08, 2.55, 0.12, "walnutDark")
    box(-0.9, 2.48, Z1 - 0.02, 1.8, 0.08, 0.12, "walnutDark")
    for x0, hinge_x, handle_x in [
        (-0.82, -0.89, -0.2),
        (0.02, 0.77, 0.14),
    ]:
        box(x0, 0.03, Z1 - 0.02, 0.8, 2.44, 0.08, "walnutLight")
        box(x0 + 0.08, 0.2, Z1 - 0.06, 0.64, 0.84, 0.04, "oak")
        box(x0 + 0.08, 1.22, Z1 - 0.06, 0.64, 0.96, 0.04, "oak")
        box(x0 + 0.16, 0.34, Z1 - 0.08, 0.48, 0.56, 0.03, "walnut")
        box(x0 + 0.16, 1.36, Z1 - 0.08, 0.48, 0.68, 0.03, "walnut")
        box(handle_x, 1.02, Z1 - 0.1, 0.07, 0.08, 0.12, "brass")
        for y in [0.42, 1.72]:
            box(hinge_x, y, Z1 - 0.03, 0.12, 0.12, 0.08, "iron")
    box(-0.12, 2.44, Z1 - 0.12, 0.24, 0.12, 0.05, "brass")
    box(-0.06, 2.58, Z1 - 0.14, 0.12, 0.04, 0.03, "brassLight")


def windows():
    # Deep window seat.
    box(4.82, 0, -1.12, 0.76, 0.42, 3.24, "oakDark")
    box(4.88, 0.42, -1.06, 0.7, 0.16, 3.12, "cream")
    for z in [-0.98, -0.1, 0.78, 1.66]:
        box(4.9, 0.58, z, 0.6, 0.16, 0.4, "linen")
    for z in [-1.18, 2.12]:
        box(4.78, 0, z, 0.82, 0.72, 0.1, "walnut")
    for y in [0.86, 1.46, 2.06, 2.66]:
        box(5.54, y, -0.9, 0.14, 0.08, 2.8, "walnut")
    for z in [-0.9, 0.0, 0.9, 1.8]:
        box(5.54, 0.82, z, 0.14, 1.86, 0.08, "walnut")
    box(5.68, 0.82, -0.86, 0.04, 1.84, 2.72, "night2")
    for z in [-0.44, 0.02, 0.48, 0.94, 1.4]:
        box(5.68, 0.9, z, 0.03, 1.7, 0.05, "night3")
    for y in [1.2, 1.8, 2.38]:
        box(5.68, 0.9, -0.86, 0.04, 0.05, 2.72, "oak")
    for z, y in [(-0.42, 2.34), (0.2, 2.16), (1.24, 2.44), (1.5, 1.55)]:
        box(5.69, y, z, 0.03, 0.03, 0.03, "starGlow")
    for iy in range(-12, 13):
        for ix in range(-12, 13):
            if math.hypot(ix, iy) <= 12 and math.hypot(ix + 4, iy + 3) > 9:
                box(5.69, 1.72 + iy * S, 1.18 + ix * S, 0.04, S, S, "moonGlow")
    # Rod and heavy wine curtains at both ends.
    box(5.52, 2.82, -1.24, 0.06, 0.06, 3.5, "iron")
    for z in [-1.24, 2.16]:
        box(5.48, 2.76, z, 0.08, 0.12, 0.1, "brass")
        box(5.4, 0.98, z, 0.16, 1.84, 0.16, "rug3")
        box(5.44, 1.02, z + 0.05, 0.04, 1.76, 0.06, "rug2")
        box(5.36, 1.04, z + 0.1, 0.03, 1.7, 0.04, "thread")


def fireplace():
    box(-5.6, 0, -1.32, 0.62, 1.45, 2.2, "stone")
    box(-5.12, 0.2, -0.88, 0.16, 1.1, 1.46, "walnutDark")
    box(-5.06, 0.24, -0.82, 0.06, 0.98, 1.34, "iron")
    for x, z in [(-5.0, -0.52), (-5.0, -0.2), (-5.0, 0.14), (-5.0, 0.38)]:
        box(x, 0.26, z - 0.12, 0.12, 0.12, 0.24, "bark")
        box(x + 0.02, 0.34, z - 0.1, 0.1, 0.12, 0.2, "wine")
    for x, z in [(-4.98, -0.5), (-4.98, -0.2), (-4.98, 0.12), (-4.98, 0.36)]:
        box(x, 0.46, z, 0.06, 0.34, 0.1, "fire")
        box(x + 0.01, 0.8, z + 0.02, 0.04, 0.08, 0.06, "flame")
    box(-5.6, 1.42, -1.42, 0.72, 0.16, 2.4, "walnut")
    box(-5.54, 1.58, -1.35, 0.6, 0.12, 2.26, "oak")
    box(-5.6, 1.7, -1.16, 0.06, 1.5, 1.88, "walnut")
    box(-5.56, 1.76, -1.1, 0.04, 1.38, 1.76, "mirror")
    box(-5.58, 2.82, -1.22, 0.06, 0.08, 2.0, "brass")
    box(-4.78, 0.02, -1.4, 0.42, 0.08, 2.42, "stoneLight")
    box(-5.6, 1.5, -1.4, 0.62, 1.9, 0.16, "stone")
    box(-5.6, 1.5, 0.74, 0.62, 1.9, 0.16, "stone")
    for x, z in [(-4.84, -1.28), (-4.84, 0.98)]:
        box(x, 0, z, 0.14, 0.72, 0.14, "iron")
        box(x - 0.04, 0.72, z - 0.04, 0.22, 0.06, 0.22, "brass")


def bed():
    # Bed rug and a genuine king-size bed, 2.6 m wide by 2.9 m long.
    box(-3.7, 0, -4.28, 3.9, 0.035, 3.7, "thread")
    box(-3.56, 0.02, -4.18, 3.62, 0.02, 3.46, "cream")
    for x in [-3.38, -1.9, -0.42]:
        box(x, 0.04, -4.12, 0.08, 0.02, 3.32, "wine")
    box(-3.0, 0.12, -4.35, 2.6, 0.22, 2.9, "walnut")
    for x in [-2.98, -0.46]:
        box(x, 0, -4.3, 0.1, 0.14, 2.8, "walnutDark")
    box(-2.94, 0.34, -4.3, 2.48, 0.48, 2.78, "linen")
    box(-2.98, 0.82, -4.3, 2.56, 0.1, 2.84, "cream")
    box(-2.9, 0.92, -3.66, 2.4, 0.06, 2.04, "linen")
    box(-2.92, 0.98, -3.72, 2.44, 0.04, 0.18, "wine")
    box(-2.92, 0.94, -1.64, 2.44, 0.08, 0.2, "wine")
    for x in [-2.72, -1.7, -0.68]:
        box(x, 0.84, -3.28, 0.16, 0.04, 1.5, "wine")
    # Two distinct pillow groups and a central folded throw.
    for x in [-2.55, -1.2]:
        box(x, 0.96, -4.01, 1.15, 0.28, 0.42, "cream")
        box(x + 0.08, 1.06, -3.94, 0.98, 0.16, 0.3, "linen")
    box(-2.16, 0.96, -3.68, 0.58, 0.32, 0.32, "wine")
    box(-0.64, 0.96, -3.68, 0.58, 0.32, 0.32, "wine")
    box(-1.46, 0.94, -2.5, 0.78, 0.16, 0.42, "green")
    box(-1.46, 0.94, -2.5, 0.04, 0.16, 0.42, "brass")
    box(-3.12, 0.08, -4.42, 2.84, 1.8, 0.16, "leatherDark")
    for x in [-2.7, -2.1, -1.5, -0.9]:
        for y in [0.5, 1.1, 1.65]:
            box(x, y, -4.46, 0.08, 0.08, 0.06, "brass")
    # Canopy posts, rails and drapes.
    for x in [-3.08, -0.32]:
        for z in [-4.44, -1.5]:
            box(x, 0, z, 0.1, 2.82, 0.1, "walnutDark")
            box(x - 0.03, 2.82, z - 0.03, 0.16, 0.1, 0.16, "brass")
    for x in [-3.08, -0.32]:
        box(x, 2.74, -4.44, 0.1, 0.12, 2.94, "walnut")
    for z in [-4.44, -1.5]:
        box(-3.08, 2.74, z, 2.86, 0.12, 0.1, "walnut")
    box(-2.96, 2.56, -4.42, 2.64, 0.2, 0.16, "cream")
    for x in [-2.7, -2.25, -1.8, -1.35, -0.9]:
        box(x, 2.5, -4.48, 0.04, 0.12, 0.12, "brass")
    for x, z in [(-2.96, -4.38), (-0.4, -4.38), (-2.96, -1.58), (-0.4, -1.58)]:
        box(x, 1.35, z, 0.08, 1.42, 0.28, "linen")
        box(x + 0.02, 1.38, z + 0.04, 0.04, 1.36, 0.2, "wine")
    # Footboard and upholstered bench at the foot.
    box(-3.0, 0.18, -1.56, 2.6, 0.58, 0.11, "walnut")
    box(-2.82, 0, -1.42, 2.24, 0.4, 0.42, "walnutDark")
    box(-2.72, 0.34, -1.38, 2.04, 0.16, 0.34, "linen")
    for x in [-2.66, -0.76]:
        box(x, 0, -1.38, 0.08, 0.34, 0.08, "walnut")


def nightstands():
    for x0 in [-4.02, 0.02]:
        box(x0, 0, -4.36, 0.64, 0.5, 0.52, "walnut")
        box(x0 - 0.03, 0.5, -4.4, 0.7, 0.08, 0.6, "oakLight")
        box(x0 + 0.04, 0.12, -4.3, 0.56, 0.22, 0.4, "walnutDark")
        for dx in [0.03, 0.55]:
            box(x0 + dx, 0, -4.3, 0.06, 0.5, 0.06, "walnutDark")
        box(x0 + 0.2, 0.58, -4.2, 0.24, 0.08, 0.22, "brass")
        box(x0 + 0.24, 0.66, -4.16, 0.16, 0.2, 0.14, "wax")
        box(x0 + 0.28, 0.86, -4.12, 0.08, 0.12, 0.07, "lanternGlow")
        box(x0 + 0.24, 0.58, -4.18, 0.16, 0.04, 0.14, "flame")


def wardrobe():
    box(5.05, 0, 2.46, 0.5, 2.62, 1.72, "walnut")
    box(5.0, 0.12, 2.54, 0.06, 2.36, 1.56, "walnutDark")
    box(4.98, 0.28, 2.68, 0.03, 0.96, 0.56, "oak")
    box(4.98, 1.42, 2.68, 0.03, 0.86, 0.56, "oak")
    box(4.98, 0.28, 3.46, 0.03, 0.96, 0.56, "oak")
    box(4.98, 1.42, 3.46, 0.03, 0.86, 0.56, "oak")
    for z in [3.28, 3.38]:
        box(4.94, 1.08, z, 0.04, 0.1, 0.07, "brass")
    box(4.92, 2.5, 2.5, 0.16, 0.18, 1.64, "walnutDark")
    box(4.88, 2.56, 2.62, 0.12, 0.1, 1.4, "brass")
    box(5.12, 2.68, 2.76, 0.3, 0.18, 0.34, "terracotta")
    box(5.16, 2.86, 2.82, 0.22, 0.1, 0.22, "wine")
    box(5.1, 2.68, 3.62, 0.28, 0.14, 0.32, "green")


def desk():
    box(-5.56, 0, 1.62, 0.62, 0.06, 1.82, "walnut")
    box(-5.54, 0.78, 1.58, 0.64, 0.08, 1.9, "oakLight")
    for z in [1.66, 3.28]:
        box(-5.5, 0, z, 0.16, 0.78, 0.16, "walnutDark")
    box(-5.5, 0.08, 1.72, 0.44, 0.56, 0.5, "walnut")
    box(-5.46, 0.18, 1.78, 0.34, 0.22, 0.38, "walnutDark")
    box(-5.46, 0.46, 1.78, 0.34, 0.2, 0.38, "walnutDark")
    for z in [1.98, 2.4]:
        box(-5.1, 0.68, z, 0.04, 0.1, 0.06, "brass")
    tavern_chair(kit.box, -4.48, 2.5, "west")
    box(-5.5, 0.86, 1.88, 0.42, 0.05, 0.48, "leatherDark")
    box(-5.46, 0.9, 1.92, 0.22, 0.04, 0.4, "paper")
    box(-5.43, 0.94, 1.98, 0.16, 0.03, 0.3, "paper")
    box(-5.3, 0.92, 2.08, 0.02, 0.05, 0.18, "ink")
    box(-5.28, 0.96, 2.0, 0.02, 0.3, 0.04, "paper")
    box(-5.1, 0.86, 2.82, 0.24, 0.18, 0.24, "terracotta")
    box(-5.06, 1.04, 2.86, 0.16, 0.36, 0.16, "leaf")
    box(-5.04, 1.32, 2.9, 0.12, 0.12, 0.12, "mint")
    box(-5.08, 0.86, 3.1, 0.3, 0.1, 0.28, "walnut")
    for index in range(4):
        box(
            -5.06,
            0.96 + index * 0.08,
            3.16,
            0.24,
            0.06,
            0.16,
            rng.choice(["wine", "blue", "green"]),
        )
    box(-5.6, 1.62, 1.72, 0.06, 1.0, 1.54, "walnut")
    box(-5.56, 1.68, 1.78, 0.04, 0.88, 1.42, "paperShadow")
    for index in range(4):
        box(-5.54, 1.78 + index * 0.18, 1.9, 0.02, 0.06, 1.1 - index * 0.14, "wine")
    box(-5.42, 0.86, 3.28, 0.16, 0.04, 0.16, "brass")
    box(-5.36, 0.9, 3.32, 0.06, 0.2, 0.06, "wax")
    box(-5.35, 1.1, 3.33, 0.02, 0.03, 0.02, "flame")


def vanity():
    box(-5.56, 0, -4.2, 0.58, 0.06, 1.42, "walnut")
    box(-5.54, 0.8, -4.24, 0.62, 0.08, 1.5, "oakLight")
    for z in [-4.14, -2.92]:
        box(-5.48, 0, z, 0.14, 0.8, 0.14, "walnutDark")
    box(-5.5, 0.08, -4.06, 0.4, 0.58, 0.9, "walnut")
    for z in [-3.92, -3.36, -2.98]:
        box(-5.48, 0.52, z, 0.06, 0.08, 0.05, "brass")
    tavern_chair(kit.box, -4.58, -3.55, "west")
    box(-5.54, 0.9, -3.7, 0.3, 0.2, 0.4, "cream")
    box(-5.5, 1.1, -3.62, 0.24, 0.28, 0.24, "mirror")
    box(-5.5, 1.38, -3.6, 0.2, 0.06, 0.2, "brass")
    for x, z, h, name in [
        (-5.3, -4.12, 0.18, "blue"),
        (-5.16, -4.02, 0.14, "green"),
        (-5.3, -3.0, 0.22, "wine"),
    ]:
        box(x, 0.88, z, 0.08, h, 0.08, name)
        box(x + 0.02, 0.88 + h, z + 0.02, 0.04, 0.03, 0.04, "brass")
    for x, z in [(-5.28, -3.46), (-5.16, -3.34)]:
        box(x, 0.88, z, 0.08, 0.08, 0.08, "terracotta")
        box(x - 0.04, 1.0, z, 0.16, 0.06, 0.12, "leaf")
    box(-5.6, 1.62, -3.84, 0.06, 1.24, 1.1, "walnut")
    box(-5.56, 1.68, -3.78, 0.04, 1.12, 0.98, "mirror")
    for x in [-5.54, -5.52]:
        box(x, 1.82, -3.4, 0.02, 0.1, 0.5, "brass")
    box(-5.58, 2.82, -3.88, 0.06, 0.08, 1.18, "brass")


def bookshelf():
    box(-5.56, 0, -2.5, 0.38, 2.5, 1.18, "walnut")
    box(-5.54, 0.06, -2.44, 0.32, 0.06, 1.06, "walnutDark")
    for y in [0.48, 0.98, 1.48, 1.98]:
        box(-5.5, y, -2.44, 0.28, 0.06, 1.06, "oak")
        for index in range(9):
            z = -2.36 + index * 0.11
            box(
                -5.46,
                y + 0.08,
                z,
                0.18,
                rng.choice([0.22, 0.28, 0.34]),
                0.08,
                rng.choice(["wine", "blue", "green", "paper", "rug2"]),
            )
    box(-5.58, 2.48, -2.54, 0.4, 0.08, 1.26, "walnutDark")
    box(-5.34, 2.56, -2.08, 0.18, 0.2, 0.18, "cream")
    box(-5.3, 2.76, -2.02, 0.1, 0.14, 0.1, "cream")
    box(-5.48, 2.56, -2.38, 0.08, 0.18, 0.08, "brass")
    box(-5.5, 2.66, -2.34, 0.12, 0.22, 0.12, "blue")


def wing_chair(x, z, face):
    # Upholstered wingback, footprint about 1 x 1 m.
    if face == "east":
        back_x, front_x = x, x + 0.18
        seat_x = x + 0.18
        arm_x = x + 0.18
        sign = 1
    else:
        back_x, front_x = x + 0.72, x + 0.54
        seat_x = x + 0.1
        arm_x = x + 0.1
        sign = -1
    box(back_x, 0, z - 0.46, 0.18, 1.42, 0.92, "rug3")
    box(back_x + (0.02 if sign > 0 else -0.02), 0.72, z - 0.38, 0.08, 0.52, 0.76, "rug2")
    for zz in [z - 0.42, z + 0.28]:
        box(arm_x, 0.18, zz, 0.76, 0.16, 0.14, "walnutDark")
        box(arm_x, 0.34, zz, 0.7, 0.12, 0.12, "rug2")
    box(seat_x, 0.28, z - 0.4, 0.64, 0.16, 0.8, "linen")
    box(seat_x + 0.04, 0.44, z - 0.34, 0.52, 0.12, 0.68, "cream")
    for dx in [0.04, 0.62]:
        for dz in [-0.34, 0.26]:
            box(seat_x + dx, 0, z + dz, 0.07, 0.3, 0.07, "walnutDark")
    for y in [0.52, 0.74, 0.96]:
        box(back_x + (0.03 if sign > 0 else -0.01), y, z - 0.3, 0.04, 0.04, 0.6, "brass")


def sitting_area():
    box(1.9, 0, -4.3, 3.5, 0.035, 3.0, "rug3")
    box(2.0, 0.02, -4.2, 3.3, 0.02, 2.8, "rug2")
    for z in [-4.08, -1.52]:
        box(2.12, 0.04, z, 3.06, 0.02, 0.08, "thread")
    for x in [2.12, 5.08]:
        box(x, 0.04, -4.0, 0.08, 0.02, 2.52, "thread")
    wing_chair(2.48, -2.92, "east")
    wing_chair(4.44, -2.92, "west")
    # Round tea table between the chairs.
    oval_xz(3.72, -2.92, 0.52, 0.52, 0.6, 0.06, "oakLight")
    oval_xz(3.72, -2.92, 0.44, 0.44, 0.66, 0.02, "brass")
    box(3.58, 0, -3.06, 0.28, 0.6, 0.28, "walnutDark")
    box(3.34, 0, -3.3, 0.76, 0.05, 0.76, "walnut")
    box(3.3, 0.7, -2.98, 0.16, 0.12, 0.16, "wine")
    box(3.34, 0.82, -2.92, 0.08, 0.03, 0.08, "brass")
    box(3.86, 0.7, -2.82, 0.12, 0.08, 0.12, "brass")
    box(3.9, 0.76, -2.78, 0.08, 0.05, 0.08, "cream")
    box(3.64, 0.7, -2.72, 0.14, 0.06, 0.14, "terracotta")
    # Floor lamp.
    box(4.96, 0, -3.8, 0.34, 0.05, 0.34, "brass")
    box(5.08, 0.05, -3.72, 0.1, 2.25, 0.1, "iron")
    box(4.9, 2.2, -3.9, 0.46, 0.26, 0.46, "cream")
    box(4.96, 2.46, -3.84, 0.34, 0.08, 0.34, "brass")
    # A small side cabinet between the chair and the window.
    box(4.8, 0, -1.42, 0.6, 0.56, 0.42, "walnut")
    box(4.78, 0.56, -1.46, 0.66, 0.06, 0.5, "oakLight")
    box(4.86, 0.62, -1.3, 0.2, 0.12, 0.2, "terracotta")
    box(4.9, 0.74, -1.26, 0.12, 0.34, 0.08, "leaf")


def big_rug():
    box(-3.9, 0, -1.16, 5.4, 0.035, 4.3, "rug")
    box(-3.78, 0.02, -1.06, 5.16, 0.02, 4.1, "rug2")
    for x in [-3.58, 1.34]:
        box(x, 0.04, -0.96, 0.08, 0.02, 3.9, "thread")
    for z in [-0.94, 3.0]:
        box(-3.5, 0.04, z, 5.0, 0.02, 0.08, "thread")
    oval_xz(-1.4, 1.0, 1.15, 1.2, 0.04, 0.02, "wine")
    oval_xz(-1.4, 1.0, 0.9, 0.92, 0.06, 0.02, "thread")
    oval_xz(-1.4, 1.0, 0.55, 0.58, 0.08, 0.02, "brassDark")
    oval_xz(-1.4, 1.0, 0.3, 0.32, 0.1, 0.02, "brass")
    for x in [-3.4, 1.16]:
        for z in np.arange(-0.7, 3.0, 0.28):
            box(x, 0.04, z, 0.12, 0.02, 0.1, "thread")


def decor():
    # Painting over the bed, mirror over the fireplace, art around the room.
    box(-3.24, 2.05, -4.6, 2.8, 1.08, 0.06, "walnut")
    box(-3.16, 2.11, -4.56, 2.64, 0.96, 0.04, "night2")
    for i in range(8):
        box(
            -3.0 + i * 0.3,
            2.2 + (i % 3) * 0.08,
            -4.52,
            0.22,
            0.62 - (i % 2) * 0.16,
            0.02,
            "night3" if i % 2 else "wine",
        )
    box(-3.3, 3.08, -4.54, 2.96, 0.06, 0.06, "brass")
    # Tapestry in the back-right corner.
    box(1.15, 1.28, -4.6, 1.7, 1.72, 0.06, "walnut")
    box(1.22, 1.35, -4.56, 1.56, 1.58, 0.04, "rug3")
    for x in [1.32, 1.62, 1.92, 2.22, 2.52]:
        box(x, 1.45, -4.52, 0.14, 1.34, 0.02, "thread")
    # Back-wall sconces flanking the bed.
    for x in [-3.72, 0.48]:
        box(x, 1.88, -4.6, 0.12, 0.3, 0.12, "brass")
        box(x - 0.02, 2.16, -4.56, 0.16, 0.06, 0.16, "brass")
        box(x + 0.02, 2.22, -4.54, 0.08, 0.16, 0.08, "wax")
        box(x + 0.03, 2.38, -4.52, 0.06, 0.06, 0.06, "flame")
    # Curtain pelmet above the window.
    box(5.32, 2.82, -1.26, 0.16, 0.18, 3.52, "walnut")
    for z in [-1.18, 2.1]:
        box(5.2, 2.72, z, 0.24, 0.18, 0.18, "brass")
    # Plant left of the entry; a smaller plant beside the wardrobe.
    for x, z, scale in [(-4.65, 4.05, 1.0), (3.7, 4.02, 0.8)]:
        box(x, 0, z, 0.36 * scale, 0.3 * scale, 0.36 * scale, "terracotta")
        box(x - 0.03, 0.3 * scale, z - 0.03, 0.42 * scale, 0.06, 0.42 * scale, "bark")
        for dx, dz, h in [(-0.08, 0.04, 1.3), (0.08, -0.03, 1.1), (0.01, 0.1, 0.95)]:
            box(x + dx * scale, 0.34 * scale, z + dz * scale, 0.05, h * scale, 0.05, "bark")
            box(
                x + (dx - 0.08) * scale,
                0.54 * scale,
                z + dz * scale,
                0.2 * scale,
                0.1,
                0.16 * scale,
                "leaf",
            )
            box(
                x + (dx + 0.04) * scale,
                0.8 * scale,
                z + dz * scale,
                0.18 * scale,
                0.08,
                0.14 * scale,
                "leafLight",
            )
    # Console in the entry, kept clear of both door leaves.
    box(-2.5, 0, 4.34, 0.1, 0.72, 0.1, "walnut")
    box(-1.6, 0, 4.34, 0.1, 0.72, 0.1, "walnut")
    box(-2.58, 0.72, 4.34, 1.08, 0.08, 0.24, "walnut")
    box(-2.5, 0.8, 4.4, 0.9, 0.06, 0.1, "brass")
    box(-2.18, 0.8, 4.4, 0.22, 0.18, 0.16, "blue")
    box(-2.14, 0.98, 4.38, 0.14, 0.24, 0.12, "leaf")
    box(-1.72, 0.8, 4.38, 0.14, 0.14, 0.12, "wax")
    box(-1.68, 0.94, 4.4, 0.08, 0.04, 0.06, "flame")
    # Ceiling-mounted picture light above the desk.
    box(-5.6, 2.78, 2.1, 0.4, 0.06, 0.08, "brass")
    box(-5.56, 2.84, 2.16, 0.26, 0.06, 0.06, "lanternGlow")


def build():
    started = time.time()
    floor_and_walls()
    ceiling_and_light()
    double_door()
    windows()
    fireplace()
    bed()
    nightstands()
    wardrobe()
    desk()
    vanity()
    bookshelf()
    sitting_area()
    big_rug()
    decor()
    dimensions, occupied, faces = kit.meshes()
    triangles, bytes_written = kit.write_glb(
        TAVERN_OUT / "万象酒馆-主卧.glb",
        faces,
        title="万象酒馆 · 主卧·主人房",
        mesh_name="Master_Bedroom",
        source="建模工具/build_tavern_master.py",
    )
    runtime = ASSETS / "master-bedroom.glb"
    runtime.write_bytes((TAVERN_OUT / "万象酒馆-主卧.glb").read_bytes())
    spec = {
        "name": "万象酒馆 · 主卧·主人房",
        "asset": "万象酒馆-主卧.glb",
        "runtime": "assets/master-bedroom.glb",
        "voxel_edge_m": S,
        "resolution": "2 cm watertight voxel surface",
        "occupied_voxels": occupied,
        "box_definitions": kit.box_calls,
        "triangles": triangles,
        "bytes": bytes_written,
        "dimensions_cells": dimensions.tolist(),
        "room_m": [11.2, 3.4, 9.2],
        "floor_area_m2": round(11.2 * 9.2, 2),
        "guest_floor_area_m2": 51.2,
        "area_multiple": round(11.2 * 9.2 / 51.2, 3),
        "bed_size_m": [2.6, 2.9],
        "eye_height_m": 1.5,
        "style": "warm plaster, dark walnut, gilt brass, wine silk and king bed",
        "landmarks": [
            "king-size canopied double bed",
            "two nightstands with lamps",
            "window seat with moonlit curtains",
            "stone fireplace and mantel mirror",
            "writing desk with shared tavern chair",
            "vanity and basin",
            "two wingback chairs and tea table",
            "wardrobe with hatboxes",
            "large medallion rug and brass chandelier",
            "corridor door",
        ],
        "mesh_cleanup": "single owner volume, hidden-face culling and greedy coplanar merge",
        "build_seconds": round(time.time() - started, 1),
    }
    (TAVERN_OUT / "主卧模型规格.json").write_text(
        json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(spec, ensure_ascii=False))


if __name__ == "__main__":
    build()
