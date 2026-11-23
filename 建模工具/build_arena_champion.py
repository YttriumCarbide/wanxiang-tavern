"""Sculpt Aurelius and bake the seven arena clips using the established rigid-joint rig."""

import math

import numpy as np

from build_arena_enemies import SVG_THEME, rewrite_glb
from overlord_rig_core import (
    ASSETS,
    OUT_OVERLORDS,
    OUT_ROOT,
    RiggedSculptor,
    bell_window,
    euler_xyz_to_quat,
    plateau,
    smoothstep,
)

SLUG = "arena-grand-champion"
SCRIPT = "建模工具/build_arena_champion.py"
HIDDEN = (1e-5,) * 3
WHITE, SILVER, STEEL = "#e8eef7", "#c2cde0", "#8c9bb5"
GOLD, LIGHT_GOLD, BRONZE = "#e0ad3e", "#ffe37d", "#9e6f1e"
RED, SCARLET, FOLD = "#b31935", "#e62e4d", "#6e0d20"
NAVY, LEATHER = "#2b364f", "#3e4d6e"
SUN, FIRE, CYAN = "#fff3b0", "#ff7b24", "#7df9ff"
FX_NAMES = (
    "Halberd_Arc_FX",
    "Shield_Nova_FX",
    "Solar_SpearRain_FX",
    "Colosseum_Judgment_FX",
)
CLIP_SPECS = (
    ("Idle", 3.6, 40),
    ("Charge_Up", 1.85, 38),
    ("Normal_Attack", 1.75, 36),
    ("Special_Attack", 1.95, 40),
    ("Special_Action", 2.20, 44),
    ("Talon_Rend", 2.10, 42),
    ("Break_Stagger", 1.55, 34),
)


def materials(s):
    return {
        "silver": s.mat("Ivory_Filigree_Armor", 0.46, 0.22, pbr_kind="filigree_iron"),
        "gold": s.mat("Royal_Brass_Relief", 0.52, 0.24, pbr_kind="brass_astrolabe"),
        "navy": s.mat("Midnight_Blue_Structure", 0.14, 0.48, pbr_kind="raven_leather"),
        "red": s.mat(
            "Triumphal_Crimson_Silk", 0.06, 0.52, double_sided=True, pbr_kind="raven_leather"
        ),
        "solar": s.mat("Solar_Core_Glow", 0.20, 0.15, emissive=[1.0, 0.384, 0.096]),
        "cyan": s.mat("Astral_Cyan_Glow", 0.20, 0.15, emissive=[0.12 / 1.15, 0.92 / 1.15, 1.0]),
        "hot": s.mat("Overload_Crimson_Glow", 0.12, 0.15, emissive=[1.0, 0.08, 0.18]),
    }


def joints(s):
    s.joint("Champion_Root")
    s.joint("Pelvis_Core", "Champion_Root", (0, 1.06, 0))
    s.joint("War_Kilt_Front", "Pelvis_Core", (0, 1.02, 0.16))
    for side, x in (("L", 0.24), ("R", -0.24)):
        s.joint("War_Kilt_" + side, "Pelvis_Core", (x, 1.04, 0))
    s.joint("Torso_Lower", "Pelvis_Core", (0, 1.20, 0))
    s.joint("Torso_Upper", "Torso_Lower", (0, 1.60, 0.02))
    s.joint("Collar_Mantle", "Torso_Upper", (0, 2.02, 0.02))
    s.joint("Neck_Joint", "Collar_Mantle", (0, 2.08, 0.03))
    s.joint("Head_Helm", "Neck_Joint", (0, 2.26, 0.05))
    s.joint("Visor_LionMask", "Head_Helm", (0, 2.28, 0.16))
    s.joint("Crest_Plume", "Head_Helm", (0, 2.48, 0.02))
    s.joint("Triumph_Halo", "Collar_Mantle", (0, 2.05, -0.18))
    for side, sign in (("L", 1), ("R", -1)):
        s.joint("Triumph_Wing_" + side, "Collar_Mantle", (sign * 0.30, 1.98, -0.16))
        s.joint("Cape_Mantle_" + side, "Collar_Mantle", (sign * 0.26, 1.96, -0.14))
    for side, pivots in {
        "R": [(-0.46, 1.92, 0), (-0.56, 1.72, 0.02), (-0.64, 1.44, 0.14), (-0.68, 1.24, 0.30)],
        "L": [(0.46, 1.92, 0), (0.56, 1.72, 0.04), (0.62, 1.46, 0.18), (0.60, 1.32, 0.34)],
    }.items():
        parent = "Collar_Mantle"
        for part, pivot in zip(("Shoulder", "UpperArm", "Forearm", "Hand"), pivots):
            name = part + "_" + side
            s.joint(name, parent, pivot)
            parent = name
    s.joint("Sunstar_Halberd", "Hand_R", (-0.68, 1.24, 0.32))
    s.joint("Aegis_Buckler", "Hand_L", (0.64, 1.36, 0.40))
    for side, x in (("L", 1), ("R", -1)):
        s.joint("Hip_" + side, "Pelvis_Core", (x * 0.20, 1.02, 0.06 if x > 0 else -0.04))
        s.joint(
            "Shin_" + side,
            "Hip_" + side,
            (0.22 if x > 0 else -0.24, 0.56, 0.16 if x > 0 else -0.10),
        )
        s.joint(
            "Boot_" + side,
            "Shin_" + side,
            (0.24 if x > 0 else -0.26, 0.14, 0.22 if x > 0 else -0.06),
        )
    for name, pivot in zip(
        FX_NAMES, ((0, 1.45, 0.88), (0.45, 1.40, 0.85), (0, 1.65, 0.45), (0, 1.55, 0.92))
    ):
        s.joint(name, "Champion_Root", pivot, HIDDEN, extras={"effectWindowOnly": True})
    # Segmented shield petals expose an independently emissive split during heavy skills.
    s.joint("Aegis_Crack_L", "Aegis_Buckler", (0.64, 1.36, 0.40))
    s.joint("Aegis_Crack_R", "Aegis_Buckler", (0.64, 1.36, 0.40))


def orb(s, joint, mat, center, radii, color, detail=12):
    s.ellipsoid(joint, mat, center, radii, color, u_segs=detail, v_segs=8)


def tube(s, joint, mat, points, radii, color, segs=10):
    s.tube(joint, mat, points, radii, color, segs=segs, steps_per_seg=2)


def star(s, joint, mat, center, radius, color, thickness=0.025, spokes=8):
    """Beveled eight-point imperial emblem, with no flat decal geometry."""
    c = np.asarray(center)
    count = spokes * 2
    vertices = [c + [0, 0, thickness], c - [0, 0, thickness * 0.4]]
    for i in range(count):
        a = i * math.tau / count
        r = radius if i % 2 == 0 else radius * 0.32
        vertices.append(c + [math.cos(a) * r, math.sin(a) * r, 0])
    triangles = []
    for i in range(count):
        a, b = i + 2, (i + 1) % count + 2
        triangles.extend([[0, a, b], [1, b, a]])
    s.bucket(joint, mat).append(vertices, triangles, color, smooth=False)


def lion_relief(s, joint, m, center, radius):
    """Raised muzzle, brow, open mouth, and layered mane instead of a sphere emblem."""
    x, y, z = center
    for i in range(12):
        a = i * math.tau / 12
        p = (x + math.cos(a) * radius * 0.67, y + math.sin(a) * radius * 0.67, z)
        s.scale_plate(
            joint,
            m["gold"],
            p,
            (0, 0, 1),
            (math.cos(a), math.sin(a), 0),
            radius * 0.43,
            radius * 0.64,
            radius * 0.10,
            GOLD,
            LIGHT_GOLD,
        )
    orb(
        s,
        joint,
        m["gold"],
        (x, y, z + radius * 0.10),
        (radius * 0.62, radius * 0.65, radius * 0.30),
        GOLD,
    )
    orb(
        s,
        joint,
        m["navy"],
        (x, y - radius * 0.24, z + radius * 0.37),
        (radius * 0.30, radius * 0.24, radius * 0.04),
        NAVY,
        12,
    )
    for sign in (-1, 1):
        orb(
            s,
            joint,
            m["gold"],
            (x + sign * radius * 0.23, y - radius * 0.08, z + radius * 0.35),
            (radius * 0.26, radius * 0.19, radius * 0.16),
            LIGHT_GOLD,
            12,
        )
        tube(
            s,
            joint,
            m["gold"],
            [
                (x + sign * radius * 0.09, y + radius * 0.31, z + radius * 0.35),
                (x + sign * radius * 0.43, y + radius * 0.25, z + radius * 0.25),
            ],
            radius * 0.08,
            BRONZE,
            6,
        )
        orb(
            s,
            joint,
            m["solar"],
            (x + sign * radius * 0.27, y + radius * 0.21, z + radius * 0.36),
            (radius * 0.13, radius * 0.055, radius * 0.04),
            SUN,
            10,
        )
        s.crystal_spire(
            joint,
            m["silver"],
            (x + sign * radius * 0.23, y - radius * 0.12, z + radius * 0.40),
            (0, -1, 0),
            radius * 0.23,
            radius * 0.06,
            WHITE,
            WHITE,
            sides=4,
        )


def body(s, m):
    orb(s, "Pelvis_Core", m["navy"], (0, 1.06, 0), (0.28, 0.17, 0.20), NAVY)
    s.torus("Pelvis_Core", m["gold"], (0, 1.10, 0), 0.255, 0.035, GOLD, u_segs=28, v_segs=6)
    lion_relief(s, "Pelvis_Core", m, (0, 1.08, 0.21), 0.095)
    for i in range(5):
        x = (i - 2) * 0.094
        s.blade_prism(
            "War_Kilt_Front",
            m["red"],
            [(x, 1.04, 0.19), (x, 0.87, 0.25), (x, 0.70 + abs(i - 2) * 0.025, 0.26)],
            [0.038, 0.044, 0.030],
            [0.022, 0.024, 0.017],
            RED,
            SCARLET,
        )
        tube(
            s,
            "War_Kilt_Front",
            m["gold"],
            [
                (x - 0.034, 1.00, 0.217),
                (x - 0.034, 0.74 + abs(i - 2) * 0.025, 0.285),
                (x + 0.03, 0.74 + abs(i - 2) * 0.025, 0.285),
            ],
            0.008,
            LIGHT_GOLD,
            5,
        )
    star(s, "War_Kilt_Front", m["silver"], (0, 0.85, 0.30), 0.055, WHITE, 0.008)
    for sign, side in ((-1, "R"), (1, "L")):
        for i in range(3):
            s.scale_plate(
                "War_Kilt_" + side,
                m["silver"],
                (sign * (0.27 + i * 0.015), 1.04 - i * 0.075, 0.02),
                (sign, 0, 0.6),
                (sign * 0.16, -1, 0),
                0.25,
                0.19,
                0.025,
                WHITE,
                GOLD,
            )
    orb(s, "Torso_Lower", m["navy"], (0, 1.30, 0.015), (0.245, 0.24, 0.17), NAVY, 20)
    for y in np.linspace(1.20, 1.48, 5):
        tube(
            s,
            "Torso_Lower",
            m["gold"],
            [(-0.19, y, 0.13), (0, y - 0.025, 0.20), (0.19, y, 0.13)],
            0.015,
            GOLD,
            6,
        )
    # The breastplate has separate sculpted pectorals and sternum, not a flat box.
    for sign in (-1, 1):
        s.ellipsoid(
            "Torso_Upper",
            m["silver"],
            (sign * 0.175, 1.74, 0.035),
            (0.25, 0.25, 0.21),
            WHITE,
            u_segs=24,
            v_segs=14,
            rot=(0, 0, sign * 0.10),
        )
        tube(
            s,
            "Torso_Upper",
            m["gold"],
            [(sign * 0.05, 1.58, 0.22), (sign * 0.30, 1.64, 0.20), (sign * 0.36, 1.85, 0.10)],
            0.018,
            GOLD,
            7,
        )
    star(s, "Torso_Upper", m["gold"], (0, 1.75, 0.256), 0.17, GOLD)
    s.crystal_spire("Torso_Upper", m["solar"], (0, 1.72, 0.26), (0, 0, 1), 0.09, 0.065, FIRE, SUN)
    s.torus(
        "Collar_Mantle", m["gold"], (0, 2.015, 0.02), 0.20, 0.04, LIGHT_GOLD, u_segs=28, v_segs=6
    )
    tube(s, "Neck_Joint", m["navy"], [(0, 2.00, 0.02), (0, 2.18, 0.05)], 0.10, NAVY)
    for y in (2.07, 2.11, 2.15):
        s.scale_plate(
            "Neck_Joint",
            m["gold"],
            (0, y, 0.13),
            (0, 0, 1),
            (0, -1, 0),
            0.14,
            0.065,
            0.017,
            GOLD,
            LIGHT_GOLD,
        )


def head(s, m):
    s.ellipsoid(
        "Head_Helm", m["silver"], (0, 2.29, 0.045), (0.17, 0.205, 0.16), WHITE, u_segs=24, v_segs=16
    )
    for sign in (-1, 1):
        s.scale_plate(
            "Head_Helm",
            m["gold"],
            (sign * 0.145, 2.29, 0.08),
            (sign * 0.7, 0, 1),
            (sign, 0.6, 0),
            0.16,
            0.22,
            0.018,
            GOLD,
            LIGHT_GOLD,
        )
        s.scale_plate(
            "Head_Helm",
            m["silver"],
            (sign * 0.12, 2.17, 0.14),
            (sign * 0.5, 0, 1),
            (0, -1, 0),
            0.13,
            0.20,
            0.017,
            SILVER,
            WHITE,
        )
    lion_relief(s, "Visor_LionMask", m, (0, 2.28, 0.19), 0.135)
    s.torus("Crest_Plume", m["gold"], (0, 2.45, 0.035), 0.17, 0.019, GOLD, u_segs=24, v_segs=6)
    for i in range(9):
        a = math.pi * (0.08 + i / 8 * 0.84)
        root = (math.cos(a) * 0.13, 2.43 + math.sin(a) * 0.09, 0.025)
        tip = (math.cos(a) * 0.25, 2.43 + math.sin(a) * 0.24, 0.025)
        s.blade_prism(
            "Crest_Plume", m["gold"], [root, tip], [0.025, 0.002], [0.018, 0.002], GOLD, LIGHT_GOLD
        )
    for i in range(9):
        z = -0.20 + i * 0.05
        s.blade_prism(
            "Crest_Plume",
            m["red"] if i % 2 else m["gold"],
            [(0, 2.43, z), (0, 2.57 + 0.08 * math.sin(i / 8 * math.pi), z - 0.03)],
            [0.045, 0.025],
            [0.025, 0.006],
            SCARLET if i % 2 else GOLD,
            LIGHT_GOLD,
        )


def limbs(s, m):
    for side in ("R", "L"):
        shoulder = "Shoulder_" + side
        upper, forearm, hand = (part + "_" + side for part in ("UpperArm", "Forearm", "Hand"))
        sh, ua, fa, hd = (s.joints[j]["pivot"] for j in (shoulder, upper, forearm, hand))
        tube(s, upper, m["navy"], [ua, fa], [0.12, 0.095], NAVY)
        orb(s, upper, m["silver"], (ua + fa) / 2, (0.13, 0.18, 0.13), WHITE)
        tube(s, forearm, m["silver"], [fa, hd], [0.13, 0.095], SILVER)
        for i in range(3):
            p = fa * (1 - i / 4) + hd * (i / 4)
            s.scale_plate(
                forearm,
                m["gold"],
                p + [0, 0, 0.12],
                (0, 0, 1),
                (0, -1, 0),
                0.19,
                0.10,
                0.018,
                GOLD,
                LIGHT_GOLD,
            )
        orb(s, hand, m["silver"], hd + [0, -0.02, 0.02], (0.105, 0.105, 0.105), WHITE, 14)
        for i in range(4):
            p = hd + [(i - 1.5) * 0.038, -0.04, 0.09]
            tube(s, hand, m["gold"], [p, p + [0, -0.065, 0.01]], 0.018, GOLD, 6)
        orb(s, shoulder, m["silver"], sh, (0.25, 0.17, 0.21), WHITE, 20)
        lion_relief(s, shoulder, m, sh + [0, 0.02, 0.20], 0.17)
        hip, shin, boot = (part + "_" + side for part in ("Hip", "Shin", "Boot"))
        hp, sp, bp = (s.joints[j]["pivot"] for j in (hip, shin, boot))
        tube(s, hip, m["navy"], [hp, sp], [0.155, 0.12], NAVY)
        orb(s, hip, m["gold"], (hp + sp) / 2, (0.15, 0.23, 0.14), GOLD)
        for i in range(3):
            s.scale_plate(
                hip,
                m["gold"],
                hp * (1 - (i + 1) / 4) + sp * ((i + 1) / 4) + [0, 0, 0.13],
                (0, 0, 1),
                (0, -1, 0),
                0.24,
                0.15,
                0.016,
                GOLD,
                LIGHT_GOLD,
            )
        tube(s, shin, m["silver"], [sp, bp], [0.13, 0.09], WHITE)
        s.scale_plate(
            shin,
            m["silver"],
            sp + [0, 0, 0.13],
            (0, 0, 1),
            (0, -1, 0),
            0.28,
            0.25,
            0.035,
            WHITE,
            GOLD,
        )
        star(s, shin, m["gold"], sp + [0, 0.015, 0.17], 0.08, LIGHT_GOLD, 0.01)
        tube(s, shin, m["gold"], [sp + [0, -0.10, 0.13], bp + [0, 0.02, 0.10]], 0.014, GOLD, 6)
        orb(s, boot, m["navy"], bp + [0, -0.045, 0.07], (0.14, 0.095, 0.23), NAVY)
        orb(s, boot, m["silver"], bp + [0, -0.01, 0.10], (0.135, 0.09, 0.20), WHITE)
        for i in range(3):
            s.scale_plate(
                boot,
                m["gold"],
                bp + [(i - 1) * 0.075, -0.02, 0.24],
                (0, 1, 0.4),
                (0, -0.15, 1),
                0.072,
                0.13,
                0.020,
                GOLD,
                LIGHT_GOLD,
            )


def regalia(s, m):
    s.torus(
        "Triumph_Halo",
        m["gold"],
        (0, 2.05, -0.25),
        0.49,
        0.022,
        GOLD,
        u_segs=48,
        v_segs=6,
        rot=(math.pi / 2, 0, 0),
    )
    for i in range(18):
        a = i * math.tau / 18
        p = (math.cos(a) * 0.49, 2.05 + math.sin(a) * 0.49, -0.25)
        s.scale_plate(
            "Triumph_Halo",
            m["gold"],
            p,
            (0, 0, 1),
            (-math.sin(a), math.cos(a), 0),
            0.055,
            0.11,
            0.012,
            GOLD,
            LIGHT_GOLD,
        )
    for i in range(6):
        a = i * math.tau / 6
        p = (math.cos(a) * 0.52, 2.05 + math.sin(a) * 0.52, -0.24)
        s.crystal_spire(
            "Triumph_Halo", m["solar"], p, (math.cos(a), math.sin(a), 0), 0.10, 0.025, FIRE, SUN
        )
    for side, sign in (("L", 1), ("R", -1)):
        wing, cape = "Triumph_Wing_" + side, "Cape_Mantle_" + side
        # Three ascending wing lobes per side; five independently sculpted blade feathers.
        for i in range(5):
            a = -0.75 + i * 0.33
            root = np.array([sign * (0.31 + i * 0.022), 1.96 - i * 0.035, -0.25])
            tip = np.array([sign * (0.76 + 0.12 * math.cos(a)), 2.18 - i * 0.21, -0.36])
            mid = root * 0.40 + tip * 0.60 + [sign * 0.03, 0.10, -0.03]
            s.blade_prism(
                wing,
                m["gold"],
                [root, mid, tip],
                [0.04, 0.085, 0.002],
                [0.028, 0.024, 0.002],
                BRONZE,
                LIGHT_GOLD,
            )
            tube(
                s,
                wing,
                m["solar"],
                [root + [0, 0, 0.029], mid + [0, 0, 0.029], tip],
                [0.006, 0.009, 0.002],
                SUN,
                5,
            )
            for k in range(3):
                f = 0.28 + k * 0.15
                p = root * (1 - f) + tip * f + [0, 0, 0.028]
                tube(s, wing, m["silver"], [p, p + [sign * 0.045, -0.04, 0]], 0.006, WHITE, 5)
        inner = [(sign * 0.20, 1.95, -0.17), (sign * 0.20, 1.45, -0.29), (sign * 0.17, 0.57, -0.33)]
        outer = [(sign * 0.44, 1.95, -0.17), (sign * 0.59, 1.42, -0.43), (sign * 0.53, 0.57, -0.49)]
        s.membrane(cape, m["red"], inner, outer, SCARLET, FOLD, divs_u=14, divs_v=8, camber=0.08)
        tube(s, cape, m["gold"], outer, 0.013, LIGHT_GOLD, 7)
        tube(s, cape, m["gold"], [inner[-1], (sign * 0.34, 0.52, -0.42), outer[-1]], 0.012, GOLD, 7)
        for i in range(3):
            x = sign * (0.25 + i * 0.09)
            tube(
                s,
                cape,
                m["red"],
                [(x, 1.85, -0.22), (x + sign * 0.04, 1.19, -0.38), (x, 0.62, -0.40)],
                0.015,
                SCARLET,
                5,
            )


def weapons(s, m):
    j = "Sunstar_Halberd"
    tube(
        s,
        j,
        m["navy"],
        [(-0.64, 0.16, 0.30), (-0.72, 1.24, 0.32), (-0.82, 2.38, 0.35)],
        0.027,
        NAVY,
        12,
    )
    for y in np.linspace(0.30, 2.25, 12):
        x = -0.64 - (y - 0.16) / 2.22 * 0.18
        s.torus(j, m["gold"], (x, y, 0.32), 0.030, 0.009, GOLD, u_segs=10, v_segs=4)
    s.crystal_spire(j, m["silver"], (-0.82, 2.36, 0.35), (-0.07, 1, 0), 0.24, 0.06, SILVER, WHITE)
    # Broad crescent axe head with a beveled outer edge and a rear armor-piercing beak.
    s.blade_prism(
        j,
        m["silver"],
        [(-0.83, 2.04, 0.35), (-1.04, 2.13, 0.35), (-1.12, 2.33, 0.35), (-0.92, 2.45, 0.35)],
        [0.035, 0.13, 0.12, 0.002],
        [0.04, 0.045, 0.03, 0.002],
        SILVER,
        WHITE,
    )
    s.blade_prism(
        j,
        m["gold"],
        [(-0.81, 2.17, 0.35), (-0.63, 2.23, 0.35), (-0.51, 2.17, 0.35)],
        [0.065, 0.05, 0.002],
        [0.04, 0.025, 0.002],
        GOLD,
        LIGHT_GOLD,
    )
    star(s, j, m["gold"], (-0.81, 2.22, 0.40), 0.13, GOLD, 0.018)
    orb(s, j, m["solar"], (-0.81, 2.22, 0.43), (0.060, 0.075, 0.04), SUN, 14)
    for sign in (-1, 1):
        s.blade_prism(
            j,
            m["gold"],
            [
                (-0.81, 2.05, 0.35),
                (-0.81 + sign * 0.14, 2.01, 0.35),
                (-0.81 + sign * 0.21, 2.10, 0.35),
            ],
            [0.028, 0.045, 0.002],
            [0.02, 0.02, 0.002],
            GOLD,
            LIGHT_GOLD,
        )
    center = np.array([0.64, 1.36, 0.43])
    s.torus(
        "Aegis_Buckler",
        m["gold"],
        center,
        0.225,
        0.020,
        GOLD,
        u_segs=32,
        v_segs=6,
        rot=(math.pi / 2, 0, 0),
    )
    # Eight domed sectors leave narrow visible fracture seams; two rigid halves can separate.
    for i in range(8):
        a0, a1 = i * math.tau / 8 + 0.022, (i + 1) * math.tau / 8 - 0.022
        joint = "Aegis_Crack_L" if math.cos((a0 + a1) / 2) > 0 else "Aegis_Crack_R"
        verts = [center + [0, 0, 0.045]]
        for a in (a0, a1):
            verts.append(center + [math.cos(a) * 0.21, math.sin(a) * 0.21, 0])
        verts.append(center + [0, 0, -0.035])
        s.bucket(joint, m["silver"]).append(
            verts, [[0, 1, 2], [3, 2, 1], [0, 3, 1], [0, 2, 3]], WHITE, smooth=False
        )
        s.scale_plate(
            "Aegis_Buckler",
            m["gold"],
            center + [math.cos(a0) * 0.21, math.sin(a0) * 0.21, 0.02],
            (0, 0, 1),
            (-math.sin(a0), math.cos(a0), 0),
            0.038,
            0.08,
            0.01,
            GOLD,
            LIGHT_GOLD,
        )
    lion_relief(s, "Aegis_Buckler", m, center + [0, 0.018, 0.035], 0.115)
    s.crystal_spire(
        "Aegis_Buckler", m["cyan"], center + [0, -0.03, 0.10], (0, 0, 1), 0.06, 0.036, CYAN, WHITE
    )
    for sign in (-1, 1):
        tube(
            s,
            "Aegis_Crack_L" if sign > 0 else "Aegis_Crack_R",
            m["cyan"],
            [
                center + [0, 0.13 * sign, 0.05],
                center + [0.04 * sign, 0.05 * sign, 0.055],
                center + [0, -0.16 * sign, 0.045],
            ],
            0.007,
            CYAN,
            5,
        )


def effects(s, m):
    j = FX_NAMES[0]
    for r, mat, color in ((0.64, m["solar"], SUN), (0.72, m["hot"], SCARLET)):
        points = [
            (math.cos(a) * r, 1.45 + math.sin(a) * r * 0.65, 0.88)
            for a in np.linspace(-0.6, 2.7, 18)
        ]
        tube(s, j, mat, points, [0.004, 0.04, 0.004], color, 6)
    j = FX_NAMES[1]
    star(s, j, m["cyan"], (0.45, 1.40, 0.85), 0.50, CYAN, 0.01)
    s.torus(
        j,
        m["cyan"],
        (0.45, 1.40, 0.85),
        0.43,
        0.013,
        CYAN,
        u_segs=32,
        v_segs=5,
        rot=(math.pi / 2, 0, 0),
    )
    j = FX_NAMES[2]
    s.torus(j, m["solar"], (0, 1.15, 0.45), 0.88, 0.018, SUN, u_segs=48, v_segs=5)
    for i in range(8):
        a = i * math.tau / 8
        p = np.array([math.cos(a) * 0.82, 0.65 + (i % 2) * 0.14, 0.45 + math.sin(a) * 0.82])
        tube(s, j, m["solar"], [p, p + [0, 0.72, 0]], 0.012, SUN, 5)
        s.crystal_spire(j, m["solar"], p + [0, 0.72, 0], (0, 1, 0), 0.23, 0.05, FIRE, SUN, sides=4)
    j = FX_NAMES[3]
    for a, b in (((0, 0.12, 0.92), (0, 2.70, 0.92)), ((-0.90, 1.55, 0.92), (0.90, 1.55, 0.92))):
        tube(s, j, m["solar"], [a, b], 0.045, SUN, 8)
    s.torus(j, m["solar"], (0, 0.04, 0.65), 0.88, 0.025, SUN, u_segs=48, v_segs=6)
    for i in range(12):
        a = i * math.tau / 12
        p = (math.cos(a) * 0.86, 0.05, 0.65 + math.sin(a) * 0.86)
        s.crystal_spire(
            j,
            m["solar"],
            p,
            (math.cos(a) * 0.7, 1, math.sin(a) * 0.7),
            0.20,
            0.035,
            FIRE,
            SUN,
            sides=4,
        )


def pose(s, clip, t, duration):
    """Return local Euler deltas, root displacement, joint scales and shield fracture deltas."""
    r = {name: np.zeros(3) for name in s.joint_order}
    scale = {name: np.asarray(HIDDEN if name in FX_NAMES else (1, 1, 1)) for name in s.joint_order}
    move = np.zeros(3)
    cracks = 0.0
    halo_open = 0.0
    halo_spin = 0.65
    if clip == "Idle":
        phase = t / duration * math.tau
        breath = math.sin(phase)
        r["Torso_Lower"][0] = breath * 0.025
        r["Torso_Upper"][0] = -breath * 0.018
        r["Head_Helm"][1] = breath * 0.10
        r["Sunstar_Halberd"][2] = breath * 0.014
        r["Aegis_Buckler"][1] = breath * 0.025
        r["Crest_Plume"][0] = (math.sin(phase + 0.4) - math.sin(0.4)) * 0.012
        for side, sign in (("L", 1), ("R", -1)):
            wave = math.sin(phase + sign * 0.6) - math.sin(sign * 0.6)
            r["Cape_Mantle_" + side][0] = wave * 0.025
            r["Triumph_Wing_" + side][2] = sign * wave * 0.018
        r["Triumph_Halo"][2] = breath * 0.06
        return r, move, scale, cracks
    if clip == "Charge_Up":
        brace = bell_window(t, 0, 0.65)
        raise_up = plateau(t, 0.32, 0.75, 1.35, duration)
        move[1] = -0.10 * brace
        r["Shoulder_L"][2] = -0.65 * brace
        r["Shoulder_R"] = np.array([-1.15, 0, -0.35]) * raise_up
        r["Head_Helm"][0] = -0.18 * raise_up
        halo_open, halo_spin = raise_up, 1.2
        spread = 0.75 * raise_up
    elif clip == "Normal_Attack":
        wind = plateau(t, 0, 0.25, 0.34, 0.50)
        strike = plateau(t, 0.35, 0.59, 0.65, 1.13)
        recovery = bell_window(t, 0.65, duration)
        move[2] = -0.08 * wind + 0.22 * strike
        r["Torso_Upper"][1] = -0.38 * wind + 0.45 * strike
        r["Shoulder_R"] = (
            np.array([-0.75, 0.45, 0.34]) * strike + np.array([0.18, -0.45, -0.45]) * wind
        )
        r["Forearm_R"][0] = -0.55 * strike
        r["Sunstar_Halberd"][2] = -1.1 * strike + 0.22 * recovery
        r["Shoulder_L"][0] = -0.20 * wind
        scale[FX_NAMES[0]] = np.full(3, 1e-5 + 1.15 * bell_window(t, 0.38, 0.68))
        spread = 0.18 * strike
    elif clip == "Special_Attack":
        brace = plateau(t, 0, 0.28, 0.40, 0.58)
        impact = plateau(t, 0.40, 0.59, 0.67, 1.05)
        thrust = plateau(t, 0.55, 0.74, 0.80, 1.15)
        move[1], move[2] = -0.14 * brace, 0.28 * impact
        r["Shoulder_L"] = (
            np.array([-0.95, 0.35, -0.25]) * impact + np.array([-0.25, 0, -0.42]) * brace
        )
        r["Shoulder_R"][0] = 0.20 * brace - 0.85 * thrust
        r["Forearm_R"][0] = -0.35 * thrust
        r["Aegis_Buckler"][1] = -0.35 * impact
        scale[FX_NAMES[1]] = np.full(3, 1e-5 + 1.25 * bell_window(t, 0.42, 0.76))
        halo_open = impact
        spread, cracks = 0.75 * impact, 0.026 * impact
    elif clip == "Special_Action":
        crouch = bell_window(t, 0, 0.40)
        flight = plateau(t, 0.22, 0.40, 1.45, 1.78)
        spin = smoothstep(0.35, 1.55, t)
        move[1] = -0.12 * crouch + 0.38 * flight
        r["Champion_Root"][1] = math.tau * spin
        r["Shoulder_R"] = np.array([-0.75, 0.0, -0.80]) * flight
        r["Sunstar_Halberd"][2] = -0.70 * flight
        for side, sign in (("L", 1), ("R", -1)):
            r["Cape_Mantle_" + side] = np.array([0.65, sign * 0.2, -sign * 0.40]) * flight
        scale[FX_NAMES[2]] = np.full(3, 1e-5 + 1.35 * bell_window(t, 0.32, 1.65))
        r[FX_NAMES[2]][1] = math.tau * spin
        halo_open = flight
        spread, cracks = 0.85 * flight, 0.022 * flight
    elif clip == "Talon_Rend":
        crouch = bell_window(t, 0, 0.65)
        flight = plateau(t, 0.50, 0.72, 0.95, 1.25)
        slam = bell_window(t, 0.95, 1.60)
        lift = plateau(t, 0.10, 0.50, 0.95, 1.20)
        move[1] = -0.24 * crouch + 0.48 * flight - 0.08 * slam
        move[2] = 0.20 * slam
        r["Torso_Lower"][0] = 0.32 * crouch + 0.18 * slam
        r["Torso_Upper"][0] = -0.28 * flight + 0.25 * slam
        r["Shoulder_R"][0] = -1.35 * lift + 0.25 * slam
        r["Shoulder_R"][2] = -0.30 * lift
        r["Shoulder_L"] = np.array([-0.80, -0.45, -0.55]) * lift
        r["Forearm_L"][1] = -0.65 * lift
        r["Sunstar_Halberd"][2] = -0.50 * lift + 0.25 * slam
        landing = bell_window(t, 1.30, duration)
        move[1] -= 0.10 * landing
        r["Hip_L"][0], r["Shin_L"][0] = -0.28 * landing, 0.42 * landing
        scale[FX_NAMES[3]] = np.full(3, 1e-5 + 1.45 * bell_window(t, 0.98, 1.55))
        halo_open = max(flight, slam)
        spread, cracks = 0.95 * halo_open, 0.035 * slam
    else:
        hit = bell_window(t, 0, 0.80)
        kneel = plateau(t, 0.30, 0.60, 1.10, duration)
        move[2], move[1] = -0.22 * hit, -0.16 * max(hit, kneel)
        r["Torso_Upper"][0] = -0.28 * hit
        r["Torso_Lower"][0] = 0.28 * kneel
        r["Head_Helm"] = np.array([-0.25, 0.32, 0]) * hit
        r["Crest_Plume"][0] = 0.24 * hit
        r["Shoulder_L"] = np.array([0.35, 0, -0.30]) * kneel
        r["Shoulder_R"][0] = -0.18 * kneel
        r["Sunstar_Halberd"][0] = -0.10 * kneel
        r["Hip_L"][0], r["Shin_L"][0] = -0.40 * kneel, 0.55 * kneel
        for side in ("L", "R"):
            r["Triumph_Wing_" + side][0] = 0.30 * kneel
        spread = -0.12 * kneel
    r["Triumph_Halo"][2] = halo_spin * halo_open
    scale["Triumph_Halo"] = np.full(3, 1 + 0.25 * halo_open)
    for side, sign in (("L", 1), ("R", -1)):
        # With feathers extending laterally from their pivots, opposite Z signs open upward.
        r["Triumph_Wing_" + side][2] = sign * spread
        if clip != "Special_Action":
            r["Cape_Mantle_" + side][0] = 0.15 * spread
        r["War_Kilt_" + side][2] = -sign * abs(move[1]) * 0.8
    return r, move, scale, cracks


def clips(s):
    result = {}
    for name, duration, count in CLIP_SPECS:
        times = np.linspace(0, duration, count).tolist()
        tracks = {j: {"rotation": [], "scale": []} for j in s.joint_order}
        tracks["Champion_Root"]["translation"] = []
        judgment = "Colosseum_Judgment_FX"
        if name == "Talon_Rend":
            tracks[judgment]["translation"] = []
        for j in ("Aegis_Crack_L", "Aegis_Crack_R"):
            tracks[j]["translation"] = []
        for t in times:
            rotation, move, scale, crack = pose(s, name, t, duration)
            for j in s.joint_order:
                tracks[j]["rotation"].append(euler_xyz_to_quat(*rotation[j]))
                tracks[j]["scale"].append(scale[j].tolist())
            tracks["Champion_Root"]["translation"].append(move.tolist())
            tracks["Aegis_Crack_L"]["translation"].append([crack, 0, 0])
            tracks["Aegis_Crack_R"]["translation"].append([-crack, 0, 0])
            if name == "Talon_Rend":
                # Expansion about the chest-level pivot would push the ground ring below the card.
                fx_scale = scale[judgment][0]
                ring_drop = (fx_scale - 1) * (s.joints[judgment]["pivot"][1] - 0.04)
                lift = max(0.0, ring_drop - move[1]) * smoothstep(0.35, 0.95, fx_scale)
                tracks[judgment]["translation"].append([0, lift, 0])
        result[name] = (times, tracks)
    return result


def build_champion():
    s = RiggedSculptor("arenaGrandChampion", "帝都大冠军·奥勒留")
    m = materials(s)
    joints(s)
    for build in (body, head, limbs, regalia, weapons, effects):
        build(s, m)
    s.export_glb(SLUG + ".glb", SLUG, clips(s), source_name=SCRIPT, svg_theme=SVG_THEME)

    def metadata(doc):
        doc["extras"].update(
            overlord=True,
            displayPlinth=False,
            phaseAnchors=[
                "Solar_Core_Glow",
                "Astral_Cyan_Glow",
                "Triumph_Wing_L",
                "Triumph_Wing_R",
                "Aegis_Crack_L",
                "Aegis_Crack_R",
            ],
            animationRig="rigid-joint-hierarchy",
        )
        doc["extensionsUsed"] = ["KHR_materials_emissive_strength"]
        for mat in doc["materials"]:
            if mat["name"] in {"Solar_Core_Glow", "Astral_Cyan_Glow"}:
                strength = 1.25 if mat["name"] == "Solar_Core_Glow" else 1.15
                mat["extensions"] = {
                    "KHR_materials_emissive_strength": {"emissiveStrength": strength}
                }

    result = rewrite_glb(ASSETS / (SLUG + ".glb"), metadata)
    (OUT_ROOT / (SLUG + ".glb")).write_bytes(result)
    (OUT_OVERLORDS / (SLUG + ".glb")).write_bytes(result)
    return s


if __name__ == "__main__":
    build_champion()
