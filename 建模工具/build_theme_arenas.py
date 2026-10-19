"""Eight authored side landscapes. Mirror/repeat only beyond one complete screen-side scene."""

import json
import math
import random
from pathlib import Path

import build_realms as atelier
from build_realms import Model

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "万象主题战场-体素模型"
TITLES = {
    "dynasty": "朱阙宫庭",
    "xianxia": "云海仙门",
    "castle": "石堡校场",
    "arcane": "星辉秘庭",
    "metropolis": "霓虹街口",
    "nexus": "量子舱室",
    "wasteland": "荒原残站",
    "relic": "黄沙神殿",
}
PALETTES = {
    "dynasty": ["665c49", "8e9b72", "a63e30", "d1b675"],
    "xianxia": ["4c6c65", "8aa68f", "b3cec1", "e0d1a0"],
    "castle": ["525a4d", "7f8877", "b0a27b", "a3483a"],
    "arcane": ["393346", "695b7e", "a28bc3", "d8be81"],
    "metropolis": ["384550", "7d8d92", "b3b5a0", "76d2d6"],
    "nexus": ["2e4656", "6f909e", "b6cdd0", "70d8e0"],
    "wasteland": ["736348", "a28b60", "bd9b68", "845a42"],
    "relic": ["9b825a", "c1a779", "ddc497", "7c6b4e"],
}
ZONES = {
    "dynasty": [
        "western gallery",
        "lotus pond and bridge",
        "old pine court",
        "moon gate",
        "flower rockery",
    ],
    "xianxia": [
        "tiered mountain",
        "curved sky path",
        "waterfall and moon pool",
        "suspended pavilion",
        "bamboo grove",
    ],
    "castle": [
        "breached curtain wall",
        "siege yard",
        "command tent",
        "stable and hay cart",
        "archery lane",
    ],
    "arcane": [
        "celestial observatory",
        "curved library",
        "crystal spring",
        "floating folios",
        "alchemical desk",
    ],
    "metropolis": ["corner shop block", "bus stop", "parking court", "neon sign", "street garden"],
    "nexus": ["reactor well", "service gantry", "control gallery", "cargo dock", "conduit trench"],
    "wasteland": [
        "broken highway",
        "crashed bus",
        "ruined filling station",
        "scrap yard",
        "windblown dunes",
    ],
    "relic": [
        "collapsed pyramid",
        "excavation trench",
        "buried guardian",
        "broken colonnade",
        "processional stair",
    ],
}


class Scenery:
    def __init__(self, model, theme):
        self.model = model
        self.theme = theme
        self.palette = PALETTES[theme]
        self.rng = random.Random(923 + list(TITLES).index(theme) * 719)

    def b(self, x, y, z, w, h, d, color, name, glow=False, approach=False):
        # Protect the entire original battle board; all authored work is outside it.
        if x - w / 2 < 6.5 and x + w / 2 > -6.5 and z - d / 2 < 5.5 and z + d / 2 > -5.5:
            return
        prefix = "Approach_" if approach else "Landscape_"
        self.model.box(x - w / 2, y, z - d / 2, w, h, d, color, prefix + name, glow)

    def line(self, a, b, width, color, name):
        count = max(1, math.ceil(max(abs(b[n] - a[n]) for n in range(3)) / width))
        for n in range(count + 1):
            t = n / count
            self.b(*(a[k] + (b[k] - a[k]) * t for k in range(3)), width, width, width, color, name)

    def ellipse(self, x, y, z, rx, rz, height, color, name, glow=False):
        step = 0.18
        for row in range(math.ceil(rz * 2 / step)):
            zz = -rz + (row + 0.5) * step
            width = 2 * rx * math.sqrt(max(0, 1 - (zz / rz) ** 2))
            self.b(x, y, z + zz, width, height, step + 0.008, color, name, glow)

    def rock(self, x, z, w, d, height, name="Rock_Outcrop", color=None, y=0.08):
        color = color or self.palette[0]
        for layer in range(5):
            t = layer / 5
            self.b(
                x + math.sin(layer * 1.7) * w * 0.07,
                y + height * t,
                z + math.cos(layer * 1.3) * d * 0.06,
                w * (1 - t * 0.65),
                height / 5 + 0.01,
                d * (1 - t * 0.55),
                color,
                name,
            )

    def path(self, points, width=0.85, color=None, name="Curved_Stone_Walk", y=0.12):
        color = color or self.palette[2]
        for a, b in zip(points, points[1:]):
            count = max(1, math.ceil(math.dist(a, b) / 0.26))
            for n in range(count):
                t = (n + 0.5) / count
                self.b(
                    a[0] + (b[0] - a[0]) * t,
                    y,
                    a[1] + (b[1] - a[1]) * t,
                    width,
                    0.045,
                    width,
                    color,
                    name,
                )

    def roof(self, x, y, z, w, d, name, tile="3f625c"):
        for side in [-1, 1]:
            for course in range(12):
                t = course / 12
                zz = z + side * d * (1 - t) / 2
                yy = y + t * 0.7 + (0.1 if course < 2 else 0)
                self.b(x, yy, zz, w - t * 0.28, 0.085, d / 21, tile, name)
                for n in range(max(2, int(w / 0.26))):
                    self.b(
                        x - w / 2 + 0.13 + n * 0.26,
                        yy + 0.085,
                        zz,
                        0.045,
                        0.035,
                        d / 20,
                        "82917a" if tile == "3f625c" else "ac8b50",
                        name + "_Seams",
                    )
        self.b(x, y + 0.76, z, w, 0.12, 0.16, "c6aa66", name + "_Ridge")
        for side in [-1, 1]:
            for end in [-1, 1]:
                for n in range(3):
                    self.b(
                        x + side * (w / 2 + n * 0.09),
                        y + 0.06 + n * 0.1,
                        z + end * d / 2,
                        0.24,
                        0.1,
                        0.22,
                        tile,
                        name + "_Eaves",
                    )

    def tree(self, x, z, height=1.6, pink=False, name="Garden_Pine"):
        self.line((x, 0.1, z), (x + 0.24, height * 0.75, z - 0.16), 0.14, "534b3a", name + "_Trunk")
        inks = ["57805d", "6e966f", "8eab7c"] if not pink else ["b88e9f", "d0a1b0", "deb7b9"]
        for dx, dz, dy, radius in [
            (-0.45, 0.12, 0.62, 0.72),
            (0.4, -0.26, 0.78, 0.68),
            (0.02, 0.2, 0.96, 0.66),
        ]:
            self.line(
                (x + 0.1, height * 0.45, z),
                (x + dx, height * dy, z + dz),
                0.09,
                "655440",
                name + "_Branches",
            )
            for layer in range(3):
                r = radius * (1 - layer * 0.22)
                for ix in range(-3, 4):
                    for iz in range(-3, 4):
                        px, pz = ix * 0.23, iz * 0.23
                        if (px / r) ** 2 + (pz / (r * 0.72)) ** 2 > 1:
                            continue
                        self.b(
                            x + dx + px,
                            height * dy + layer * 0.13,
                            z + dz + pz,
                            0.24,
                            0.14,
                            0.24,
                            self.rng.choice(inks),
                            name + "_Canopy",
                        )

    def lantern(self, x, z, y=0.12, name="Courtyard_Lantern"):
        self.b(x, y, z, 0.42, 0.2, 0.42, self.palette[0], name + "_Foot")
        self.b(x, y + 0.2, z, 0.14, 0.45, 0.14, self.palette[2], name + "_Stem")
        self.b(x, y + 0.65, z, 0.32, 0.35, 0.32, "e3c68a", name + "_Glass", True)
        self.b(x, y + 1.0, z, 0.48, 0.1, 0.48, self.palette[0], name + "_Cap")

    def ring(self, x, y, z, rx, rz, color, name, vertical=False):
        for n in range(96):
            a = n * math.tau / 96
            if vertical:
                self.b(
                    x + math.cos(a) * rx, y + math.sin(a) * rz, z, 0.085, 0.085, 0.1, color, name
                )
            else:
                self.b(
                    x + math.cos(a) * rx, y, z + math.sin(a) * rz, 0.09, 0.035, 0.09, color, name
                )

    def brick_wall(self, x, z, length, height, color, name, along_z=True):
        for row in range(math.ceil(height / 0.22)):
            for n in range(math.ceil(length / 0.48)):
                offset = -length / 2 + n * 0.48 + (row % 2) * 0.18
                dx, dz = (0, offset) if along_z else (offset, 0)
                self.b(
                    x + dx,
                    row * 0.22 + 0.08,
                    z + dz,
                    0.42 if along_z else 0.44,
                    0.2,
                    0.44 if along_z else 0.42,
                    color if (n + row) % 4 else self.palette[2],
                    name,
                )

    def base(self):
        self.b(-10.55, -0.12, 0, 7.9, 0.17, 19.1, self.palette[0], "Terrain_Base")
        # Irregular large fields belong to one composition; these are not repeated prefabs.
        for x, z, w, d in [
            (-12.3, -5.5, 4.2, 6.9),
            (-8.2, -2.0, 3.1, 7.4),
            (-11.5, 4.7, 5.4, 7.2),
            (-7.4, 7.2, 1.3, 4.2),
        ]:
            self.b(x, 0.055, z, w, 0.03, d, self.palette[1], "Terrain_Fields")


def dynasty(s):
    s.base()
    # One long western gallery with an open court, rather than rows of tiny houses.
    s.b(-12.6, 0.1, -2.0, 2.7, 0.22, 10.3, "b7ae92", "Gallery_Stone_Terrace")
    for z in [-6.5, -4.4, -2.2, 0, 2.2]:
        for x in [-13.55, -11.7]:
            s.b(x, 0.32, z, 0.16, 1.3, 0.16, "a04434", "Gallery_Red_Columns")
    s.roof(-12.6, 1.6, -2.0, 2.7, 10.6, "Palace_Gallery_Roof", "79613e")
    s.path(
        [
            (-7.0, -6.8),
            (-8.7, -5.1),
            (-9.5, -2.5),
            (-9.1, -0.1),
            (-10.0, 2.0),
            (-8.8, 5.7),
            (-7.2, 7.2),
        ],
        0.82,
        "b7b39a",
    )
    s.ellipse(-9.3, 0.11, 2.6, 1.9, 2.1, 0.06, "466f70", "Lotus_Pond_Water")
    for n in range(14):
        a = n * math.tau / 14
        s.rock(
            -9.3 + math.cos(a) * 1.9,
            2.6 + math.sin(a) * 2.1,
            0.42,
            0.45,
            0.2,
            "Pond_Shore_Stones",
            "9caa95",
        )
    for n in range(9):
        z = 0.8 + n * 0.44
        y = 0.22 + math.sin(n * math.pi / 8) * 0.45
        s.b(-9.3, y, z, 0.85, 0.12, 0.44, "c4c5ad", "Arched_Pond_Bridge")
        for x in [-9.8, -8.8]:
            s.b(x, y, z, 0.07, 0.42, 0.07, "aab59c", "Bridge_Balusters")
    for x, z in [(-10.5, 2), (-8.1, 3.4), (-10.2, 3.8)]:
        s.ellipse(x, 0.19, z, 0.23, 0.18, 0.02, "84965a", "Lotus_Leaves")
    s.tree(-8.2, -4.7, 1.8, name="Old_Courtyard_Pine")
    s.tree(-12.1, 6.6, 1.45, True, "Flowering_Plum")
    s.rock(-11.0, 5.5, 1.7, 1.8, 0.85, "Garden_Rockery", "899381")
    s.brick_wall(-7.1, 5.8, 2.3, 0.4, "b2ad91", "Moon_Gate_Base")
    s.ring(-7.1, 1.1, 5.8, 0.75, 0.85, "c2b795", "Moon_Gate_Arch", True)
    for x, z in [(-7.15, -5.9), (-10.5, -1.4), (-11.1, 4.5), (-7.2, 7.2)]:
        s.lantern(x, z)


def xianxia(s):
    s.base()
    # A single winding hillside, waterfall and two unequal terraces.
    for x, z, w, d, h in [
        (-13.0, -5.6, 3.0, 5.3, 1.2),
        (-12.1, -1.7, 3.5, 4.0, 0.75),
        (-13.0, 3.1, 2.6, 4.1, 1.05),
        (-10.7, 7.1, 3.7, 3.8, 0.65),
    ]:
        s.rock(x, z, w, d, h, "Mountain_Strata", "617f77")
    s.path(
        [
            (-7.0, -7.7),
            (-8.8, -6.5),
            (-10.2, -4.6),
            (-9.7, -2.4),
            (-8.0, -0.5),
            (-8.6, 1.6),
            (-10.8, 3.7),
            (-10.3, 6.1),
            (-7.2, 7.8),
        ],
        0.95,
        "c1cfb6",
    )
    s.ellipse(-10.7, 0.12, 2.2, 1.7, 1.9, 0.06, "5a9592", "Moon_Pool_Water")
    for n in range(8):
        s.b(
            -11.8 + math.sin(n) * 0.07,
            0.17 + n * 0.1,
            0.8 - n * 0.16,
            0.7,
            0.1,
            0.28,
            "a7d0c1",
            "Waterfall_Steps",
            True,
        )
    s.rock(-11.7, -4.5, 2.1, 2.5, 0.65, "Pavilion_Rock_Base", "738e7e")
    for x in [-12.35, -11.05]:
        for z in [-5.2, -3.8]:
            s.b(x, 0.7, z, 0.1, 1.0, 0.1, "9db59a", "Pavilion_Columns")
    s.roof(-11.7, 1.7, -4.5, 2.0, 2.35, "Immortal_Pavilion_Roof")
    s.tree(-7.8, -3.6, 1.6, name="Cliff_Pine")
    s.tree(-12.6, 5.4, 1.35, name="Pool_Pine")
    for n in range(19):
        x = -7.1 - s.rng.random() * 1.25
        z = 3.3 + s.rng.random() * 3.5
        h = 0.6 + s.rng.random() * 0.8
        s.b(x, 0.1, z, 0.055, h, 0.055, "55775c", "Bamboo_Stems")
        s.b(x - 0.1, h * 0.65, z, 0.34, 0.05, 0.17, "8eaf83", "Bamboo_Leaves")
    for x, z in [(-7.0, -6.8), (-8.0, 0.0), (-9.8, 5.9)]:
        s.lantern(x, z, name="Jade_Way_Lantern")


def castle(s):
    s.base()
    for z, length in [(-5.5, 6.8), (4.5, 7.0)]:
        s.brick_wall(-13.6, z, length, 1.25, "697465", "Fortress_Masonry")
        for n in range(int(length / 0.7)):
            s.b(-13.6, 1.45, z - length / 2 + n * 0.7, 0.5, 0.27, 0.35, "9caa91", "Wall_Merlons")
    for z in [-8.3, 8.2]:
        s.b(-13.2, 0.1, z, 1.8, 1.3, 1.8, "727d6d", "Curtain_Tower")
        for dx in [-0.65, 0.65]:
            s.b(-13.2 + dx, 1.4, z, 0.3, 0.3, 1.5, "9ca48b", "Tower_Merlons")
    s.path(
        [(-7.2, -7.8), (-9.7, -5.7), (-10.4, -1.8), (-9.3, 1.2), (-10.1, 5.0), (-7.2, 7.8)],
        1.1,
        "9b9d83",
    )
    # One command tent, its entrance and ropes.
    s.b(-9.5, 0.1, -5.4, 2.6, 0.2, 3.1, "5c6048", "Tent_Timber_Deck")
    for n in range(10):
        s.b(
            -9.5,
            0.3 + n * 0.1,
            -5.4,
            2.7 - n * 0.25,
            0.14,
            3.2,
            "9d5343" if n % 2 else "b09b71",
            "Command_Tent_Canvas",
        )
    s.b(-9.5, 0.3, -3.75, 0.7, 0.7, 0.06, "473b30", "Tent_Entrance")
    # Timber siege engine in the yard; distinctive counterweight and long throwing arm.
    s.b(-10.7, 0.2, -0.2, 2.1, 0.18, 2.7, "66523b", "Siege_Chassis")
    for dx in [-0.72, 0.72]:
        s.line((-10.7 + dx, 0.3, -1.1), (-10.7, 1.65, -0.3), 0.13, "8a6a48", "Siege_Braces")
    s.line((-10.7, 1.3, -0.4), (-10.0, 2.2, -1.8), 0.14, "a38254", "Trebuchet_Arm")
    s.b(-11.0, 0.9, 0.45, 0.75, 0.7, 0.65, "746b50", "Counterweight")
    for dx in [-0.85, 0.85]:
        for dz in [-0.9, 0.9]:
            s.ring(-10.7 + dx, 0.3, -0.2 + dz, 0.27, 0.27, "4c4938", "Siege_Wheels", True)
    s.b(-10.9, 0.1, 5.4, 2.8, 0.2, 3.8, "696c50", "Stable_Footing")
    for z in [4.0, 6.8]:
        for x in [-12.0, -9.8]:
            s.b(x, 0.3, z, 0.14, 1.0, 0.14, "6d5337", "Stable_Posts")
    s.roof(-10.9, 1.3, 5.4, 2.8, 3.7, "Stable_Roof", "736747")
    for x, z in [(-8.4, 3.4), (-8.0, 4.3), (-7.5, 5.7)]:
        s.b(x, 0.1, z, 0.72, 0.45, 0.6, "b29b5b", "Hay_Bales")
    for z in [-1.8, 0.2, 2.1]:
        s.b(-7.3, 0.1, z, 0.1, 0.6, 0.1, "66543a", "Target_Posts")
        s.ring(-7.3, 0.75, z, 0.3, 0.3, "d0b386", "Archery_Targets", True)
    s.rock(-13.2, 0, 1.6, 2.4, 0.45, "Breach_Rubble")


def arcane(s):
    s.base()
    # A single brass observatory dominates the center of this whole side.
    s.ellipse(-10.4, 0.1, -0.4, 2.25, 2.7, 0.12, "706588", "Observatory_Dais")
    for r in [1.0, 1.7, 2.1]:
        s.ring(-10.4, 0.24, -0.4, r, r * 1.2, "c6ad78", "Celestial_Inscriptions")
    for r in [0.65, 1.0, 1.4]:
        s.ring(-10.4, 1.35, -0.4, r, r * 0.75, "c6a678", "Observatory_Astrolabe", True)
    s.b(-10.4, 0.25, -0.4, 0.18, 1.2, 0.18, "b69a6d", "Astrolabe_Axis")
    # An L-shaped archive, with book spines following the architectural shelves.
    for x, z, w, d in [(-12.7, -5.4, 1.0, 4.8), (-10.1, -7.2, 4.2, 0.9)]:
        s.b(x, 0.1, z, w, 1.4, d, "47394f", "Library_Carcass")
        for level in range(4):
            s.b(x, 0.2 + level * 0.33, z, w + 0.1, 0.055, d + 0.08, "ad8b6b", "Library_Shelves")
        count = 22 if d > w else 20
        for n in range(count):
            dx = 0 if d > w else -w / 2 + n * w / count
            dz = -d / 2 + n * d / count if d > w else 0
            s.b(
                x + dx,
                1.51,
                z + dz,
                0.72 if d > w else 0.14,
                0.16 + s.rng.random() * 0.16,
                0.14 if d > w else 0.65,
                s.rng.choice(["9075a4", "769aaa", "b79c6f", "a97873"]),
                "Archive_Book_Spines",
            )
    s.ellipse(-10.4, 0.1, 5.1, 2.1, 2.0, 0.06, "615b88", "Crystal_Spring_Water", True)
    for x, z, height in [(-11.8, 4.9, 1.2), (-10.8, 6.4, 0.9), (-8.9, 5.2, 1.5), (-9.5, 3.9, 0.7)]:
        for level in range(5):
            s.b(
                x,
                0.16 + level * height / 5,
                z,
                0.45 - level * 0.055,
                height / 5,
                0.5 - level * 0.06,
                "ab9bd4",
                "Spring_Crystals",
                level == 4,
            )
    for n in range(7):
        a = n * 0.46
        x, z = -8.1 + math.sin(a) * 0.5, -5.4 + n * 1.0
        s.b(x, 0.45 + (n % 3) * 0.16, z, 0.6, 0.06, 0.46, "c8b991", "Floating_Folio_Pages")
        s.b(x, 0.41 + (n % 3) * 0.16, z, 0.66, 0.04, 0.5, "7b5c91", "Floating_Folio_Covers")
    s.b(-7.6, 0.1, 7.0, 1.3, 0.65, 1.8, "806a73", "Alchemy_Workbench")
    for n in range(5):
        s.b(
            -7.9 + n * 0.17,
            0.75,
            6.7 + (n % 2) * 0.4,
            0.12,
            0.18 + (n % 3) * 0.08,
            0.12,
            s.palette[2],
            "Alchemy_Bottles",
            True,
        )


def metropolis(s):
    s.base()
    # One corner block, a plaza, and parking: no repeated miniature city grid.
    s.b(-12.2, 0.1, -4.6, 3.8, 1.25, 5.6, "67747b", "City_Block")
    s.b(-10.9, 0.1, -1.9, 1.1, 0.9, 1.8, "8b7c6e", "Corner_Shop_Annex")
    s.b(-12.2, 1.35, -4.6, 4.0, 0.12, 5.8, "a4aaa4", "City_Parapet")
    s.b(-12.2, 1.48, -4.6, 3.6, 0.03, 5.4, "48575e", "Flat_Roof_Surface")
    s.b(-12.6, 1.52, -5.5, 1.2, 0.35, 1.4, "7c9297", "Roof_Air_Conditioner")
    for n in range(9):
        s.b(-12.6, 1.88, -6.1 + n * 0.14, 1.0, 0.035, 0.05, "435a64", "AC_Grilles")
    s.b(-11.5, 1.52, -3.2, 0.8, 0.16, 1.1, "8ac7c9", "Roof_Skylight")
    for z in [-6.5, -5.4, -4.3, -3.2]:
        s.b(-10.25, 0.35, z, 0.04, 0.5, 0.75, "88b5b9", "Shopfront_Windows", True)
    s.b(-9.95, 0.95, -4.7, 0.5, 0.08, 4.2, "d48a94", "Store_Awning")
    s.b(-7.5, 0.1, -4.5, 0.5, 1.3, 0.25, "294354", "Neon_Sign_Back")
    for n in range(4):
        s.b(
            -7.5,
            0.3 + n * 0.25,
            -4.34,
            0.3,
            0.11,
            0.04,
            "79d4d5" if n % 2 else "d582a1",
            "Neon_Sign_Glyphs",
            True,
        )
    s.path(
        [(-7.2, -8), (-8.7, -5.3), (-9.0, -1.0), (-9.0, 3.0), (-7.2, 7.8)],
        1.25,
        "a1aba6",
        "Street_Sidewalk",
    )
    # The bus shelter has an open roof and a visible bench.
    for z in [-0.4, 2.4]:
        s.b(-7.5, 0.1, z, 0.08, 0.95, 0.08, "647c83", "Bus_Stop_Posts")
    s.b(-7.55, 1.05, 1.0, 1.3, 0.09, 3.2, "78989a", "Bus_Shelter_Roof")
    s.b(-7.8, 0.1, 1, 0.45, 0.38, 1.8, "8a7761", "Bus_Stop_Bench")
    s.b(-11.3, 0.1, 4.6, 4.3, 0.04, 5.5, "424c54", "Parking_Asphalt")
    for x in [-12.8, -11.4, -10.0]:
        s.b(x, 0.15, 4.6, 0.05, 0.015, 4.8, "b9baa6", "Parking_Bay_Lines")
    for x, z, ink in [(-12.1, 3.7, "a6b5ae"), (-10.6, 5.7, "92766a")]:
        s.b(x, 0.18, z, 1.0, 0.35, 2.0, ink, "Parked_Cars")
        s.b(x, 0.53, z - 0.1, 0.8, 0.23, 1.0, "446370", "Car_Glass")
    s.tree(-7.6, 5.0, 1.0, name="Street_Planter_Tree")
    s.b(-13.3, 0.1, 0, 1.0, 0.45, 1.8, "647567", "Street_Garden_Wall")
    for z in [-0.5, 0, 0.5]:
        s.b(-13.3, 0.55, z, 0.8, 0.16, 0.55, "719170", "Street_Garden_Shrubs")


def nexus(s):
    s.base()
    # A large reactor well linked to a service dock by a routed conduit trench.
    s.ellipse(-11.5, 0.1, -3.3, 2.1, 2.6, 0.14, "587784", "Reactor_Well_Rim")
    s.ellipse(-11.5, 0.25, -3.3, 1.7, 2.15, 0.06, "294b60", "Reactor_Well_Interior")
    for radius in [0.8, 1.25, 1.7]:
        s.ring(-11.5, 0.4, -3.3, radius, radius * 1.15, "9bbfc8", "Reactor_Containment_Rings")
    s.b(-11.5, 0.3, -3.3, 0.65, 0.9, 0.8, "76dce3", "Reactor_Core", True)
    for x in [-12.7, -10.3]:
        s.b(x, 0.25, -3.3, 0.14, 1.2, 0.14, "93adb4", "Reactor_Service_Ribs")
    s.path(
        [(-11.5, -1.0), (-10.2, 0.2), (-10.5, 2.3), (-9.4, 4.5), (-9.7, 7.5)],
        0.7,
        "263c4b",
        "Conduit_Trench",
    )
    for dx in [-0.2, 0.2]:
        s.path(
            [(-11.5 + dx, -1.0), (-10.2 + dx, 0.2), (-10.5 + dx, 2.3), (-9.4 + dx, 4.5)],
            0.06,
            "7fbfc8",
            "Conduit_Cables",
            0.18,
        )
    s.b(-7.7, 0.1, -3.2, 1.4, 0.15, 7.6, "7694a0", "Control_Gallery_Deck")
    for z in [-6.0, -4.8, -2.9, -1.1]:
        s.b(-7.8, 0.26, z, 0.8, 0.55, 0.7, "425c70", "Control_Console_Body")
        s.b(-7.8, 0.81, z, 0.7, 0.035, 0.5, "85dae0", "Control_Console_Display", True)
    s.b(-12.2, 0.1, 4.7, 3.8, 0.18, 5.9, "587889", "Cargo_Dock")
    # One small craft with swept wings and a nose, rather than a bank of identical cabinets.
    s.b(-12.1, 0.3, 4.7, 1.1, 0.45, 3.8, "a2b8ba", "Docked_Skiff_Hull")
    for side in [-1, 1]:
        s.line(
            (-12.1 + side * 0.4, 0.4, 4.1),
            (-12.1 + side * 1.5, 0.4, 5.5),
            0.25,
            "728fa0",
            "Skiff_Swept_Wings",
        )
    s.b(-12.1, 0.75, 4.0, 0.7, 0.2, 1.1, "406a82", "Skiff_Cockpit")
    for x, z in [(-8.0, 2.9), (-7.2, 4.5), (-8.1, 6.8)]:
        s.b(x, 0.15, z, 0.8, 0.55, 0.9, "6a8491", "Unequal_Cargo_Crates")
        s.b(x, 0.7, z, 0.55, 0.035, 0.65, "b2c4b9", "Cargo_Lid")
    s.b(-11.1, 1.3, -7.2, 5.3, 0.16, 0.55, "9ab4bd", "Service_Gantry")


def wasteland(s):
    s.base()
    for x, z, w, d in [(-13.2, -6.3, 2.4, 5.6), (-8.2, -4.0, 2.5, 4.4), (-11.5, 6.5, 5.0, 4.4)]:
        s.rock(x, z, w, d, 0.38, "Sand_Dunes", "b39c6c")
    # One collapsed road spans the upper portion; its torn edge reveals metal bars.
    for n in range(12):
        if n in [5, 6]:
            continue
        s.b(
            -13.5 + n * 0.48,
            1.45 + n * 0.025,
            -5.2 + n * 0.12,
            0.49,
            0.23,
            2.0,
            "7c8173",
            "Collapsed_Overpass",
        )
        s.b(
            -13.5 + n * 0.48,
            1.7 + n * 0.025,
            -5.1 + n * 0.12,
            0.22,
            0.015,
            0.07,
            "c8b883",
            "Faded_Road_Marks",
        )
    for x, z in [(-12.5, -5), (-8.8, -3.8)]:
        s.b(x, 0.1, z, 0.6, 1.4, 0.7, "747d70", "Bridge_Piers")
    for n in range(7):
        s.line(
            (-11.0 + n * 0.14, 1.65, -4.2),
            (-10.7 + n * 0.13, 1.2, -3.6),
            0.035,
            "7a5c45",
            "Torn_Rebar",
        )
    s.b(-12.2, 0.12, -0.3, 1.9, 1.0, 4.1, "9d7652", "Crashed_Bus_Body")
    for z in [-1.7, -0.9, -0.1, 0.7, 1.4]:
        s.b(-11.22, 0.5, z, 0.055, 0.45, 0.5, "456267", "Broken_Bus_Windows")
        s.b(-12.2, 1.14, z, 0.9, 0.035, 0.28, "79694c", "Bus_Roof_Vents")
    s.b(-8.8, 0.1, 2.1, 2.7, 0.15, 3.7, "746549", "Station_Foundation")
    for x, z in [(-9.9, 0.7), (-7.7, 0.7), (-9.9, 3.4)]:
        s.b(x, 0.25, z, 0.12, 1.15, 0.12, "715e44", "Broken_Canopy_Posts")
    s.b(-9.1, 1.4, 1.8, 2.1, 0.14, 3.4, "94794f", "Torn_Station_Canopy")
    for n in range(3):
        s.b(-8.2, 0.25, 0.9 + n * 0.9, 0.4, 0.65, 0.5, "995c40", "Abandoned_Fuel_Pumps")
    for n in range(14):
        x, z = -13.2 + s.rng.random() * 2.3, 3.1 + s.rng.random() * 3.7
        s.b(
            x,
            0.1,
            z,
            0.3 + s.rng.random() * 0.7,
            0.12 + s.rng.random() * 0.35,
            0.4 + s.rng.random() * 0.8,
            s.rng.choice(["7b6045", "a37b50", "786e54"]),
            "Scrap_Yard_Parts",
        )
    s.path(
        [(-7.0, -7.5), (-7.8, -2.5), (-10.1, 0), (-10.4, 4.8), (-7.2, 7.9)],
        0.6,
        "9b906e",
        "Broken_Service_Road",
    )


def relic(s):
    s.base()
    # One eroded pyramid with a collapsed corner, not repeated obelisks.
    for level in range(7):
        s.b(
            -11.4 + level * 0.05,
            0.1 + level * 0.28,
            -5.1,
            4.5 - level * 0.46,
            0.28,
            4.6 - level * 0.43,
            "bc9e6a" if level % 2 else "cfb17a",
            "Stepped_Pyramid",
        )
    s.b(-11.3, 0.15, -2.72, 0.7, 1.05, 0.08, "4b5247", "Pyramid_Door")
    s.path(
        [(-11.3, -2.5), (-10.8, -0.7), (-11.6, 1.6), (-10.9, 4.6), (-7.0, 7.6)],
        0.75,
        "887955",
        "Excavation_Trench",
    )
    s.path(
        [(-7.1, -7.9), (-7.7, -4), (-8.1, 0.6), (-8.1, 4.5), (-7.0, 7.6)],
        0.9,
        "d2bb87",
        "Processional_Causeway",
    )
    for x, z, h in [(-7.3, -5.4, 1.55), (-7.5, -1.6, 0.65), (-7.4, 2.0, 1.25), (-8.8, 5.9, 0.5)]:
        s.b(x, 0.1, z, 0.9, 0.18, 0.9, "c8af7d", "Column_Square_Base")
        for level in range(int(h / 0.2)):
            s.b(
                x,
                0.28 + level * 0.2,
                z,
                0.5,
                0.19,
                0.5,
                "cdb483" if level % 2 else "b59e74",
                "Broken_Colonnade",
            )
        s.b(x, h + 0.25, z, 0.8, 0.14, 0.8, "d6bd8a", "Papyrus_Capitals")
    s.rock(-12.4, 2.8, 2.5, 3.5, 0.45, "Buried_Sand", "c6aa73")
    s.b(-12.4, 0.45, 2.6, 1.25, 0.5, 2.3, "b69968", "Fallen_Guardian_Body")
    s.b(-12.2, 0.95, 1.7, 1.0, 0.6, 0.9, "d1b37d", "Guardian_Head")
    for dx in [-0.6, 0.6]:
        s.b(-12.4 + dx, 0.45, 3.8, 0.38, 0.24, 1.1, "baa172", "Guardian_Paws")
    s.brick_wall(-11.7, 6.7, 3.9, 0.55, "b59c6c", "Excavated_Inscribed_Wall", False)
    for n in range(18):
        s.b(
            -13.35 + n * 0.19,
            0.3 + (n % 3) * 0.08,
            7.0,
            0.08,
            0.12,
            0.025,
            "7d714f",
            "Wall_Hieroglyphs",
        )


BUILDERS = dict(
    zip(TITLES, [dynasty, xianxia, castle, arcane, metropolis, nexus, wasteland, relic])
)


def approaches(s):
    # One rear approach and a different foreground apron complete the frame.
    for side in [-1, 1]:
        s.b(0, -0.02, side * 7.55, 13.0, 0.12, 3.9, s.palette[0], "Terrain", approach=True)
        for x in [-4.4, 4.4]:
            s.b(
                x, 0.1, side * 7.7, 4.0, 0.08, 3.4, s.palette[1], "Flanking_Terraces", approach=True
            )
        for n in range(10):
            s.b(
                0,
                0.12 + (0.1 if side < 0 else 0.02) * n,
                side * (5.75 + n * 0.35),
                2.2 + n * 0.08,
                0.1,
                0.36,
                s.palette[2],
                "Entry_Stair",
                approach=True,
            )
    if s.theme == "metropolis":
        for x in range(-5, 6):
            s.b(x, 0.2, 6.4, 0.5, 0.025, 1.3, "c1c5b6", "Pedestrian_Crossing", approach=True)
    elif s.theme == "nexus":
        for x in [-1.4, 1.4]:
            s.b(x, 0.23, 7.0, 0.09, 0.04, 2.7, "7cd4dd", "Dock_Guides", True, True)
    elif s.theme in ["dynasty", "xianxia"]:
        for x in [-4.3, 4.3]:
            s.b(x, 0.22, 6.9, 2.5, 0.22, 1.5, "687e5c", "Low_Garden_Beds", approach=True)
    else:
        for x in [-4.7, 4.1]:
            s.b(x, 0.2, 6.8, 1.5, 0.25, 1.7, s.palette[1], "Broken_Apron_Stone", approach=True)


def landscape_instances():
    result = []
    for east in [False, True]:
        for outward in [0, 1]:
            for row in [-1, 0, 1]:
                if not east and outward == 0 and row == 0:
                    continue
                result.append(
                    {
                        "name": f"{'East' if east else 'West'}_{outward}_{row}",
                        "scale": [-1 if east else 1, 1, 1],
                        "translation": [(1 if east else -1) * outward * 8.2, 0, row * 19.2],
                    }
                )
    return result


def make_preview(theme, model):
    preview = Model("Authored landscape miniature / " + theme)
    scale = 0.24
    preview.box(-3.8, -0.3, -2.6, 7.6, 0.3, 5.2, PALETTES[theme][0], "Miniature_Plinth")
    for z, color in [(-2.6, "626171"), (2.6, "747a6c")]:
        preview.box(
            -6.32 * scale,
            0.01,
            (z - 2.6) * scale,
            12.64 * scale,
            0.05,
            5.2 * scale,
            color,
            "Miniature_Original_Board",
        )
    for (group, glow, _pivot), boxes in model.groups.items():
        for x, y, z, w, h, d, color in boxes:
            preview.box(
                x * scale,
                y * scale + 0.02,
                z * scale,
                w * scale,
                h * scale,
                d * scale,
                color,
                "Miniature_" + group,
                glow,
            )
            if group.startswith("Landscape_"):
                preview.box(
                    -(x + w) * scale,
                    y * scale + 0.02,
                    z * scale,
                    w * scale,
                    h * scale,
                    d * scale,
                    color,
                    "Miniature_East_" + group,
                    glow,
                )
    preview.finish("preview-" + theme + ".glb", source="建模工具/build_theme_arenas.py")


def main():
    OUT.mkdir(exist_ok=True)
    atelier.OUT = OUT
    manifest = []
    for theme, title in TITLES.items():
        model = Model(title)
        model.cards(include_floor=True)
        scenery = Scenery(model, theme)
        BUILDERS[theme](scenery)
        approaches(scenery)
        layout = {
            "mode": "authored-large",
            "uniqueSpan": [7.9, 19.1],
            "uniqueBounds": {"x": [-14.5, -6.6], "z": [-9.55, 9.55]},
            "zones": ZONES[theme],
            "mirroredRight": True,
            "repeatSpan": [8.2, 19.2],
            "bounds": {"x": 24, "z": 29},
            "patches": 1,
            "boxes": len(model.boxes),
        }
        counts = model.finish(
            theme + ".glb",
            source="建模工具/build_theme_arenas.py",
            instances=landscape_instances(),
            metadata={"peripheryLayout": layout},
        )
        make_preview(theme, model)
        manifest.append(
            {
                "id": theme,
                "name": title,
                "boxes": len(model.boxes),
                "components": len(counts),
                "file": theme + ".glb",
                "preview": "preview-" + theme + ".glb",
                "layout": layout,
            }
        )
    (OUT / "主题战场清单.json").write_text(
        json.dumps(
            {"source": "建模工具/build_theme_arenas.py", "models": manifest},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
