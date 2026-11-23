"""Native box models for the four Silver Crown mobs and two elites."""

import json
import math
from shutil import copyfile

from build_expanded_enemies import GLOW_GROUPS
from build_realms import Model, portrait
from overlord_rig_core import OUT_ROOT

WHITE, SILVER, SHADE = "#f4f7ff", "#cdd8eb", "#8898b5"
NAVY, BLUE, BLUE_EDGE = "#233454", "#334e7a", "#4f72a8"
WINE, ROSE, PLUM = "#9d174d", "#e11d74", "#5c0b2b"
GOLD, LIGHT, BRASS = "#eab308", "#ffe885", "#a16207"
GREEN, TOXIN, VIOLET, RED = "#34f59b", "#10b981", "#c026d3", "#ff2a6d"


class Voxels:
    def __init__(self):
        self.blocks = []

    def box(self, group, at, size, color):
        x, y, z = at
        w, h, d = size
        self.blocks.append((group, x, y, z, w, h, d, color))

    def steps(self, group, start, end, size, color, count):
        """Use overlapping box centers to draw an angled silhouette without rotated meshes."""
        for i in range(count):
            t = i / max(1, count - 1)
            center = tuple(a + (b - a) * t for a, b in zip(start, end))
            self.box(group, center, size, color)

    def disk(self, group, at, radius, thickness, color, rows=7):
        """A stepped circular silhouette in the XY plane, assembled from horizontal strips."""
        x, y, z = at
        step = 2 * radius / rows
        for row in range(rows):
            dy = (row - (rows - 1) / 2) * step
            width = 2 * math.sqrt(radius**2 - dy**2)
            self.box(group, (x, y + dy, z), (width, step, thickness), color)

    def fit(self, dimensions):
        lower = [min(b[i] - b[i + 3] / 2 for b in self.blocks) for i in (1, 2, 3)]
        upper = [max(b[i] + b[i + 3] / 2 for b in self.blocks) for i in (1, 2, 3)]
        height, width, depth = dimensions
        sx, sy, sz = [
            limit / (hi - lo) for limit, lo, hi in zip((width, height, depth), lower, upper)
        ]
        sx, sz = min(sx, sy), min(sz, sy)
        cx, _, cz = [(hi + lo) / 2 for lo, hi in zip(lower, upper)]
        return [
            {
                "group": group,
                "x": round((x - cx) * sx, 6),
                "y": round((y - h / 2 - lower[1]) * sy, 6),
                "z": round((z - cz) * sz, 6),
                "w": round(w * sx, 6),
                "h": round(h * sy, 6),
                "d": round(d * sz, 6),
                "color": color,
            }
            for group, x, y, z, w, h, d, color in self.blocks
        ]


def boots(v, sx=0.18, knee=0.50, stride=0.10, bulk=1.0):
    for sign in (-1, 1):
        x, z = sign * sx, sign * stride
        v.box("Boots", (x, 0.075, z + 0.075), (0.22 * bulk, 0.15, 0.31), NAVY)
        v.box("Boots", (x, knee / 2 + 0.04, z), (0.17 * bulk, knee - 0.07, 0.19), BLUE)
        v.box("Greaves", (x, knee - 0.04, z + 0.08), (0.18 * bulk, 0.16, 0.07), SILVER)
        v.box("Spur", (x, 0.11, z - 0.095), (0.075, 0.055, 0.065), GOLD)
        v.steps(
            "Trousers",
            (x, knee, z),
            (x * 0.70, knee + 0.31, 0),
            (0.19 * bulk, 0.15, 0.19),
            SHADE,
            3,
        )


def coat(v, waist, chest, hand_r, hand_l, color=BLUE, wide=0.50, tail=0.43, armor=False):
    v.box("Waist", (0, waist, 0), (wide * 0.79, 0.19, 0.28), color)
    v.box("Vest", (0, chest, 0), (wide, 0.37, 0.35), SILVER if armor else color)
    v.box("Waistband", (0, waist - 0.03, 0.03), (wide * 0.85, 0.075, 0.31), WINE)
    v.box("Buckles", (0, waist - 0.03, 0.20), (0.12, 0.09, 0.045), GOLD)
    for side, hand in ((-1, hand_r), (1, hand_l)):
        shoulder = (side * wide * 0.54, chest + 0.11, 0)
        elbow = (side * wide * 0.66, hand[1] + 0.105, (hand[2] - 0.08) * 0.38)
        v.steps("Sleeves", shoulder, elbow, (0.145, 0.16, 0.16), color, 3)
        v.steps("Sleeves", elbow, hand, (0.13, 0.13, 0.14), color, 3)
        v.box("Gloves", hand, (0.12, 0.11, 0.13), WHITE)
        v.box("Shoulders", shoulder, (0.20, 0.15, 0.24), SILVER)
        v.box("Epaulettes", (shoulder[0], shoulder[1] + 0.08, 0.02), (0.20, 0.04, 0.22), LIGHT)
        v.steps(
            "Lapels",
            (side * 0.13, chest + 0.14, 0.191),
            (side * 0.055, chest - 0.02, 0.19),
            (0.08, 0.077, 0.035),
            WINE if color != WINE else ROSE,
            3,
        )
        for i in range(3):
            v.box(
                "Buttons",
                (side * 0.08, chest - 0.07 - i * 0.08, 0.184),
                (0.038, 0.035, 0.025),
                LIGHT,
            )
        for i in range(3):
            v.box(
                "Coattails",
                (side * (0.10 + 0.02 * i), waist - 0.13 - tail * i / 3, -0.13 - i * 0.035),
                (0.17, tail / 3 + 0.05, 0.11),
                color,
            )
            v.box(
                "Lining",
                (side * (0.16 + 0.02 * i), waist - 0.13 - tail * i / 3, -0.07 - i * 0.035),
                (0.036, tail / 3 + 0.05, 0.026),
                ROSE,
            )
    v.box("Cravat", (0, chest + 0.12, 0.204), (0.098, 0.16, 0.07), WHITE)


def mask(v, y, z=0.0, eye=VIOLET, single=False, color=SILVER):
    v.box("Hood", (0, y, z), (0.28, 0.28, 0.25), NAVY)
    v.box("RavenMask", (0, y + 0.018, z + 0.13), (0.267, 0.16, 0.080), color)
    for i in range(3):
        v.box(
            "RavenMask",
            (0, y - 0.005 - i * 0.027, z + 0.179 + i * 0.033),
            (0.095 - i * 0.023, 0.09 - i * 0.017, 0.058),
            color if i < 2 else WHITE,
        )
    for side in ((1,) if single else (-1, 1)):
        v.box("LensFrames", (side * 0.074, y + 0.045, z + 0.18), (0.085, 0.073, 0.04), LIGHT)
        v.box("Eyes", (side * 0.074, y + 0.045, z + 0.207), (0.047, 0.035, 0.014), eye)


def hat(v, base, z=0, height=0.25):
    v.box("Hat", (0, base, z), (0.44, 0.055, 0.36), NAVY)
    v.box("Hat", (0, base + height / 2 + 0.02, z), (0.29, height, 0.27), WINE)
    v.box("HatTop", (0, base + height + 0.02, z), (0.33, 0.055, 0.28), PLUM)
    v.box("HatBand", (0, base + 0.062, z), (0.30, 0.05, 0.28), GOLD)
    v.box("Crown", (0, base + 0.08, z + 0.152), (0.105, 0.065, 0.025), VIOLET)


def blade(v, x, y, z, sign):
    v.box("RapierGuard", (x, y, z), (0.16, 0.044, 0.14), LIGHT)
    for i in range(6):
        dx = sign * (0.15 * math.sin(i * 0.35))
        v.box(
            "MithrilHook",
            (x + dx, y - 0.048 - i * 0.066, z + i * 0.035),
            (0.085 - i * 0.009, 0.095, 0.055),
            SILVER,
        )
        v.box(
            "Glow",
            (x + dx, y - 0.048 - i * 0.066, z + 0.029 + i * 0.035),
            (0.024, 0.076, 0.016),
            GREEN,
        )


def velvet_blade(v):
    boots(v, stride=0.13)
    coat(v, 0.83, 1.12, (-0.36, 0.85, 0.06), (0.38, 0.84, 0.20), color="#315879", tail=0.29)
    mask(v, 1.45, eye=GREEN)
    for i in range(5):
        v.box(
            "WhiteRavenMantle",
            (-0.20 - i * 0.036, 1.31 - i * 0.042, -0.034 - i * 0.022),
            (0.15, 0.073, 0.19),
            WHITE if i % 2 == 0 else SILVER,
        )
    blade(v, -0.36, 0.83, 0.06, -1)
    blade(v, 0.38, 0.82, 0.20, 1)
    for i in range(3):
        x = 0.135 + i * 0.041
        v.box("SluiceKeys", (x, 0.73, 0.18), (0.022, 0.15, 0.025), BRASS)
        v.box("SluiceKeys", (x + 0.02, 0.67, 0.18), (0.062, 0.035, 0.029), LIGHT)
    v.box("WaxToken", (-0.21, 0.74, 0.18), (0.08, 0.08, 0.037), GOLD)
    v.box("WaxToken", (-0.21, 0.74, 0.207), (0.042, 0.043, 0.019), ROSE)


def repeating_arbalest(v):
    boots(v, sx=0.23, knee=0.30, stride=0.13)
    coat(v, 0.63, 0.91, (-0.27, 0.91, 0.31), (0.30, 0.92, 0.38), color=WINE, tail=0.46)
    mask(v, 1.20, z=0.06, single=True)
    hat(v, 1.34, z=0.06, height=0.20)
    v.box("HighCollar", (0, 1.08, -0.055), (0.34, 0.24, 0.21), PLUM)
    v.box("ArbalestStock", (0.23, 0.94, 0.44), (0.15, 0.18, 0.64), BRASS)
    v.box("ArbalestRail", (0.23, 1.05, 0.57), (0.10, 0.052, 0.43), LIGHT)
    v.box("Glow", (0.23, 1.081, 0.57), (0.052, 0.019, 0.40), VIOLET)
    v.disk("RotaryMagazine", (0.33, 0.91, 0.48), 0.175, 0.17, GOLD)
    v.disk("Core", (0.33, 0.91, 0.576), 0.067, 0.022, VIOLET, 5)
    for sign in (-1, 1):
        v.steps(
            "ArbalestLimbs",
            (0.23, 1.02, 0.73),
            (0.23 + sign * 0.36, 1.02, 0.60),
            (0.15, 0.083, 0.12),
            SILVER,
            4,
        )
        v.steps(
            "DrawString",
            (0.23 + sign * 0.36, 1.02, 0.60),
            (0.23, 1.02, 0.43),
            (0.076, 0.021, 0.043),
            GOLD,
            5,
        )
    v.steps("Quiver", (-0.16, 0.63, -0.27), (0.13, 1.14, -0.27), (0.21, 0.15, 0.15), SILVER, 5)
    for i in range(4):
        v.box(
            "GoldFletch", (0.05 + i * 0.043, 1.23 + i * 0.025, -0.27), (0.034, 0.26, 0.044), LIGHT
        )


def mint_chemist(v):
    boots(v, sx=0.17, knee=0.42, stride=0.07)
    coat(v, 0.76, 1.02, (-0.34, 0.88, 0.24), (0.35, 0.96, 0.28), wide=0.54, tail=0.52)
    v.box("HunchedBack", (0, 1.20, -0.11), (0.42, 0.27, 0.35), BLUE_EDGE)
    mask(v, 1.33, z=0.14, eye=GREEN)
    for i in range(4):
        v.box(
            "AcidApron",
            (0, 1.05 - i * 0.125, 0.21 - i * 0.006),
            (0.31 + i * 0.027, 0.13, 0.055),
            WHITE if i % 2 == 0 else SILVER,
        )
    v.box("ApronBadge", (0, 0.92, 0.25), (0.09, 0.085, 0.025), GOLD)
    for sign in (-1, 1):
        x = sign * 0.18
        v.box("StillFrame", (x, 1.02, -0.31), (0.25, 0.46, 0.24), BRASS)
        v.box("Glass", (x, 1.03, -0.40), (0.19, 0.34, 0.20), "#85b8bf")
        v.box("Core", (x, 0.99, -0.46), (0.15, 0.25, 0.10), GREEN if sign < 0 else VIOLET)
        for y in (0.81, 1.24):
            v.box("StillCaps", (x, y, -0.37), (0.27, 0.075, 0.28), GOLD)
        v.steps(
            "BrassPipes", (x, 1.25, -0.37), (x * 0.72, 1.50, -0.23), (0.08, 0.11, 0.08), LIGHT, 4
        )
        for i in range(3):
            v.box(
                "Glow", (x + (i - 1) * 0.036, 0.88 + i * 0.105, -0.516), (0.030, 0.03, 0.024), LIGHT
            )
    for side in (-1, 1):
        v.steps(
            "Tongs",
            (-0.34 + side * 0.022, 0.88, 0.23),
            (-0.50 + side * 0.09, 0.74, 0.59),
            (0.049, 0.055, 0.13),
            SHADE,
            5,
        )
    v.box("Crucible", (-0.49, 0.70, 0.58), (0.28, 0.14, 0.24), BRASS)
    v.box("CrucibleLip", (-0.49, 0.77, 0.58), (0.32, 0.045, 0.27), GOLD)
    for i in range(4):
        v.box(
            "Glow",
            (-0.59 + i * 0.060, 0.81 + (i % 2) * 0.03, 0.58),
            (0.05, 0.045, 0.10),
            GREEN if i % 2 else VIOLET,
        )
    v.disk("Glass", (0.36, 1.065, 0.29), 0.13, 0.16, "#85b8bf")
    v.disk("Core", (0.36, 1.045, 0.377), 0.095, 0.027, GREEN, 5)


def vault_enforcer(v):
    boots(v, sx=0.20, knee=0.53, stride=0.09, bulk=1.4)
    coat(v, 0.93, 1.24, (-0.44, 0.95, 0.20), (0.45, 0.94, 0.28), wide=0.67, armor=True)
    mask(v, 1.61, color=WHITE)
    v.box("Helmet", (0, 1.74, -0.020), (0.34, 0.10, 0.33), SILVER)
    for sign in (-1, 1):
        v.box("Pauldrons", (sign * 0.36, 1.35, -0.02), (0.23, 0.22, 0.35), SILVER)
        v.box("Pauldrons", (sign * 0.43, 1.32, -0.02), (0.17, 0.16, 0.40), SHADE)
    v.steps("VelvetSash", (-0.29, 1.42, 0.215), (0.25, 0.91, 0.22), (0.139, 0.136, 0.069), WINE, 8)
    v.disk("CoinChest", (0, 1.24, 0.26), 0.165, 0.078, GOLD)
    v.disk("CoinChest", (0, 1.24, 0.306), 0.111, 0.024, WHITE, 5)
    v.disk("VaultShield", (0.43, 0.91, 0.39), 0.345, 0.154, SILVER, 9)
    v.disk("VaultShield", (0.43, 0.91, 0.477), 0.275, 0.041, SHADE)
    v.disk("Rings", (0.43, 0.91, 0.51), 0.16, 0.029, LIGHT)
    v.box("CombinationDial", (0.43, 0.91, 0.55), (0.245, 0.043, 0.044), BRASS)
    for i in range(12):
        a = math.tau * i / 12
        v.box(
            "GearTeeth",
            (0.43 + 0.335 * math.cos(a), 0.91 + 0.335 * math.sin(a), 0.41),
            (0.081, 0.080, 0.16),
            WHITE,
        )
    v.box("HammerHandle", (-0.44, 0.93, 0.18), (0.063, 0.62, 0.072), BRASS)
    for offset, height, depth in ((0, 0.25, 0.29), (0.026, 0.20, 0.35), (-0.025, 0.32, 0.22)):
        v.box("OctagonalHammer", (-0.51, 1.26 + offset, 0.18), (0.38, height, depth), SILVER)
    for x in (-0.71, -0.31):
        v.box("HammerBand", (x, 1.26, 0.18), (0.053, 0.29, 0.30), LIGHT)


def blood_croupier(v):
    boots(v, sx=0.17, knee=0.68, stride=0.10)
    coat(v, 1.03, 1.35, (-0.41, 1.05, 0.29), (0.34, 1.14, 0.28), color=WINE, tail=0.69)
    mask(v, 1.71, eye=RED)
    hat(v, 1.86, height=0.27)
    v.box("CaneSword", (-0.40, 0.75, 0.28), (0.052, 1.22, 0.057), GOLD)
    v.box("CaneSword", (-0.40, 0.44, 0.316), (0.026, 0.54, 0.024), SILVER)
    for i, width in enumerate((0.08, 0.15, 0.20, 0.15, 0.08)):
        v.box(
            "Core",
            (-0.40, 1.38 + i * 0.058, 0.29),
            (width, 0.065, width * 0.78),
            VIOLET if i % 2 else "#e879f9",
        )
    for i in range(3):
        x = 0.28 + 0.125 * i
        y = 1.24 + (i % 2) * 0.1
        v.disk("HandChips", (x, y, 0.34), 0.080, 0.045, GOLD, 5)
        v.disk("Glow", (x, y, 0.371), 0.047, 0.021, RED, 3)
    for i in range(8):
        a = math.tau * i / 8
        x, z = 0.73 * math.cos(a), 0.45 * math.sin(a)
        y = 1.08 + 0.22 * math.sin(a + 0.4)
        v.disk("FloatingChips", (x, y, z), 0.072, 0.039, GOLD, 5)
        v.box("Rings", (x, y, z + 0.024), (0.064, 0.045, 0.019), LIGHT)
        if i % 2 == 0:
            v.box("TarotBlades", (x, y + 0.23, z), (0.103, 0.19, 0.036), GOLD)
            v.box("Glow", (x, y + 0.23, z + 0.022), (0.039, 0.09, 0.017), RED)


def gilded_automaton(v):
    boots(v, sx=0.30, knee=0.60, stride=0.13, bulk=1.65)
    v.box("Chassis", (0, 1.06, -0.03), (0.63, 0.39, 0.44), NAVY)
    v.box("Chassis", (0, 1.39, -0.03), (0.83, 0.58, 0.49), WHITE)
    v.box("MantleCladding", (0, 1.64, -0.03), (0.94, 0.18, 0.53), GOLD)
    mask(v, 1.80, z=0.018, eye=GREEN, color=WHITE)
    for i in range(3):
        v.box(
            "RavenCrest",
            (0, 1.94 + i * 0.035, -0.04 - i * 0.04),
            (0.13 - i * 0.03, 0.060, 0.12),
            GOLD,
        )
    v.disk("FlywheelFrame", (0, 1.38, 0.28), 0.33, 0.11, BRASS, 9)
    v.disk("FlywheelFrame", (0, 1.38, 0.345), 0.275, 0.061, LIGHT)
    v.disk("Core", (0, 1.38, 0.391), 0.224, 0.045, TOXIN)
    for i in range(8):
        a = math.tau * i / 8
        v.box(
            "GlassBraces",
            (0.22 * math.cos(a), 1.38 + 0.22 * math.sin(a), 0.422),
            (0.074, 0.062, 0.035),
            SILVER,
        )
        v.box(
            "Rings",
            (0.14 * math.cos(a), 1.38 + 0.14 * math.sin(a), 0.423),
            (0.049, 0.042, 0.028),
            GREEN,
        )
    for side in (-1, 1):
        x = side * 0.49
        v.box("ShoulderPlates", (x, 1.57, 0.02), (0.34, 0.27, 0.36), SILVER)
        v.box("ArmPistons", (x, 1.25, 0.04), (0.23, 0.46, 0.25), GOLD)
        v.box("ArmPistons", (x, 1.10, 0.16), (0.24, 0.21, 0.37), SHADE)
        v.box("Exhaust", (side * 0.31, 1.57, -0.34), (0.17, 0.68, 0.19), BRASS)
        v.box("ExhaustRim", (side * 0.31, 1.91, -0.34), (0.22, 0.09, 0.23), LIGHT)
        for i in range(4):
            v.box(
                "Core",
                (side * (0.31 + 0.028 * i), 1.99 + i * 0.060, -0.34 - i * 0.035),
                (0.09 + i * 0.015, 0.057, 0.095),
                VIOLET if side < 0 else GREEN,
            )
    for i in range(8):
        z, width = 0.37 + i * 0.095, 0.30 - i * 0.032
        v.box("ScrewDrill", (-0.54, 1.10, z), (width, width, 0.115), SILVER)
        a = i * math.pi / 2
        v.box(
            "DrillFlights",
            (-0.54 + width * 0.45 * math.cos(a), 1.10 + width * 0.45 * math.sin(a), z),
            (width * 0.6, width * 0.6, 0.052),
            LIGHT,
        )
    v.box("WingHinge", (0.56, 1.11, 0.30), (0.29, 0.25, 0.16), GOLD)
    for i in range(8):
        a = -1.10 + i * 0.25
        start = (0.57, 1.13, 0.34 + 0.016 * i)
        tip = (0.57 + 0.58 * math.cos(a), 1.13 + 0.58 * math.sin(a), 0.39 + 0.016 * i)
        v.steps("WingBlades", start, tip, (0.15, 0.115, 0.088), SILVER if i % 2 else WHITE, 5)
        v.box("WingGilding", tip, (0.118, 0.087, 0.083), LIGHT)


BUILDERS = (
    velvet_blade,
    repeating_arbalest,
    mint_chemist,
    vault_enforcer,
    blood_croupier,
    gilded_automaton,
)


def export_voxel(spec, builder):
    enemy_id, slug, title, tier, dimensions = spec
    voxels = Voxels()
    builder(voxels)
    blocks = voxels.fit(dimensions)
    model = Model(title)
    for box in blocks:
        group = box["group"]
        model.box(
            box["x"] - box["w"] / 2,
            box["y"],
            box["z"] - box["d"] / 2,
            box["w"],
            box["h"],
            box["d"],
            box["color"][1:],
            group,
            glow=group in GLOW_GROUPS,
        )
    source_dir = OUT_ROOT / "银冠黑市模型"
    source_dir.mkdir(exist_ok=True)
    block_source = source_dir / f"{slug}.json"
    block_source.write_text(
        json.dumps(
            {
                "id": enemy_id,
                "name": title,
                "portrait": slug,
                "model": f"{slug}.glb",
                "tier": tier,
                "blocks": blocks,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    model.finish(
        f"{slug}.glb",
        source="建模工具/silver_crown_syndicate_voxels.py",
        metadata={
            "enemyId": enemy_id,
            "tier": tier,
            "nonVoxel": False,
            "sourceBlocks": f"万象异境-体素模型/银冠黑市模型/{slug}.json",
            "portrait": f"万象酒馆-Demo/assets/portraits/{slug}.svg",
            "displayPlinth": False,
        },
    )
    copyfile(OUT_ROOT / f"{slug}.glb", source_dir / f"{slug}.glb")
    portrait(model, slug, "boss" if tier == "elite" else "ice")
