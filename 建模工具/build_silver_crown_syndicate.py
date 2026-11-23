"""Reproducible Silver Crown syndicate sculptures, articulated GLBs and mesh portraits.

Run with 建模工具/.venv/Scripts/python.exe. Only the seven slugs below are written.
Geometry and animation follow the supplied Gemini specification; no encounter data is changed.
"""

import argparse
import hashlib
import json
import math
import struct

import numpy as np

from overlord_rig_core import (
    ASSETS,
    OUT_OVERLORDS,
    OUT_ROOT,
    PORTRAITS,
    PI,
    TAU,
    RiggedSculptor,
    bell_window,
    euler_xyz_to_quat,
    lerp_hex,
    plateau,
    rot_matrix_xyz,
    smoothstep,
)

from silver_crown_syndicate_voxels import BUILDERS, export_voxel

WHITE = "#f4f7ff"
SILVER = "#cdd8eb"
SHADOW = "#8898b5"
NAVY = "#233454"
BLUE = "#334e7a"
BLUE_EDGE = "#4f72a8"
ROSE = "#e11d74"
WINE = "#9d174d"
GOLD = "#eab308"
GOLD_LIGHT = "#ffe885"
BRASS = "#a16207"
GREEN = "#34f59b"
VIOLET = "#c026d3"
RED = "#ff2a6d"
SOURCE = "建模工具/build_silver_crown_syndicate.py"
SPECS = (
    (
        "syndicateVelvetBlade",
        "syndicate-velvet-blade",
        "银渠暗桩刺客",
        "normal",
        (1.66, 1.28, 1.20),
    ),
    (
        "syndicateRepeatingArbalest",
        "syndicate-repeating-arbalest",
        "乌羽连弩暗哨",
        "normal",
        (1.62, 1.35, 1.40),
    ),
    (
        "syndicateMintChemist",
        "syndicate-mint-chemist",
        "伪币熔银毒师",
        "normal",
        (1.70, 1.45, 1.35),
    ),
    (
        "syndicateVaultEnforcer",
        "syndicate-vault-enforcer",
        "金库银铠重卫",
        "normal",
        (1.85, 1.60, 1.38),
    ),
    (
        "syndicateBloodCroupier",
        "syndicate-blood-croupier",
        "血筹码典仪官",
        "elite",
        (2.16, 1.85, 1.60),
    ),
    (
        "syndicateGildedAutomaton",
        "syndicate-gilded-automaton",
        "鎏金鸦首护法机兵",
        "elite",
        (2.24, 2.15, 1.80),
    ),
    (
        "silverCrownSyndicateArchon",
        "silver-crown-syndicate-archon",
        "银冠鬼拍主·白鸦公爵",
        "overlord",
        (2.78, 2.60, 2.10),
    ),
)
CLIPS = (
    ("Idle", 3.8, 40),
    ("Charge_Up", 1.85, 38),
    ("Normal_Attack", 1.75, 36),
    ("Special_Attack", 1.95, 40),
    ("Special_Action", 2.20, 44),
    ("Talon_Rend", 2.05, 42),
    ("Break_Stagger", 1.55, 34),
)
FX_NAMES = ("Blade_Cross_FX", "Muzzle_Blast_FX", "Feather_Storm_FX", "Execution_Shadow_FX")


def materials(s):
    return {
        "cloth": s.mat("Royal_Velvet", 0.10, 0.46, pbr_kind="raven_leather"),
        "lining": s.mat("Burgundy_Velvet", 0.08, 0.50, pbr_kind="raven_leather"),
        "silver": s.mat("Mithril_Filigree", 0.48, 0.22, pbr_kind="filigree_iron"),
        "feather": s.mat("Platinum_Raven", 0.48, 0.22, pbr_kind="raven_feather"),
        "gold": s.mat("Imperial_Gold", 0.54, 0.22, pbr_kind="brass_astrolabe"),
        "white": s.mat("Ivory_Gloves_Porcelain", 0.08, 0.30),
        "green": s.mat("Glow_Emerald", 0.08, 0.14, emissive=[0.10, 0.95, 0.45]),
        "purple": s.mat("Core_Amethyst", 0.08, 0.16, emissive=[0.85, 0.18, 1.15]),
        "red": s.mat("Eyes_Crimson", 0.08, 0.16, emissive=[1.20, 0.15, 0.45]),
        "light": s.mat("Rings_Coin_Light", 0.25, 0.22, emissive=[0.70, 0.38, 0.04]),
        "glass": s.mat("Distillation_Glass", 0.0, 0.14, alpha=0.22, double_sided=True),
        "fx": s.mat("Glow_Strike_FX", 0.0, 0.22, emissive=[0.7, 0.35, 0.65], double_sided=True),
    }


def orb(s, m, j, center, radii, color):
    s.ellipsoid(j, m, center, radii, color, u_segs=16, v_segs=10)


def rod(s, m, j, points, radius, color, segs=12):
    s.tube(j, m, points, radius, color, segs=segs, steps_per_seg=3)


def plate(s, m, j, center, width, height, depth, color, rot=(0, 0, 0)):
    poly = [
        (-width / 2, -depth / 2),
        (width / 2, -depth / 2),
        (width / 2, depth / 2),
        (-width / 2, depth / 2),
    ]
    s.bevel_prism(j, m, poly, height, min(width, height, depth) * 0.14, center, color, rot)


def ring(s, m, j, center, radius, color=GOLD, thickness=0.016, frontal=True):
    s.torus(
        j,
        m,
        center,
        radius,
        thickness,
        color,
        u_segs=28,
        v_segs=6,
        rot=(PI / 2, 0, 0) if frontal else (0, 0, 0),
    )


def coin(s, mats, j, center, radius=0.075, glow=None):
    x, y, z = center
    orb(s, mats["gold"], j, center, (radius, radius, radius * 0.20), GOLD)
    ring(s, mats["gold"], j, (x, y, z + radius * 0.20), radius * 0.79, GOLD_LIGHT, radius * 0.09)
    s.scale_plate(
        j,
        mats[glow or "silver"],
        (x, y, z + radius * 0.25),
        (0, 0, 1),
        (0, -1, 0),
        radius * 0.90,
        radius * 1.05,
        radius * 0.12,
        (
            GREEN
            if glow == "green"
            else VIOLET if glow == "purple" else RED if glow == "red" else SILVER
        ),
    )


def vial(s, mats, j, base, height=0.20, glow="green"):
    x, y, z = base
    color = GREEN if glow == "green" else VIOLET if glow == "purple" else RED
    orb(
        s,
        mats[glow],
        j,
        (x, y + height * 0.42, z),
        (height * 0.20, height * 0.38, height * 0.20),
        color,
    )
    ring(s, mats["gold"], j, (x, y + height * 0.12, z), height * 0.19, GOLD, height * 0.035, False)
    rod(
        s,
        mats["gold"],
        j,
        [(x, y + height * 0.70, z), (x, y + height, z)],
        height * 0.14,
        GOLD_LIGHT,
    )


def feather(s, mats, j, start, end, width, tip=WHITE, root=SILVER):
    s.feather(
        j, mats["feather"], start, end, (0, 0, 1), width, curve=0.08, color_root=root, color_tip=tip
    )


def blade(s, mats, j, points, width=0.06, glow="green"):
    s.blade_prism(
        j, mats["silver"], points, [width, width * 0.74, 0.002], [0.02, 0.012, 0.001], SHADOW, WHITE
    )
    offset = np.array([0.0, 0.0, 0.017])
    rod(
        s,
        mats[glow],
        j,
        [(np.asarray(p) + offset).tolist() for p in points],
        [0.009, 0.007, 0.001],
        GREEN if glow == "green" else VIOLET,
    )


def humanoid_joints(s, root="Unit_Root"):
    s.joint(root)
    s.joint("Pelvis_Core", root, (0, 1.05, 0))
    s.joint("Torso_Lower", "Pelvis_Core", (0, 1.18, 0))
    s.joint("Torso_Upper", "Torso_Lower", (0, 1.58, 0.02))
    s.joint("Collar_Mantle", "Torso_Upper", (0, 1.98, 0.03))
    s.joint("Neck_Joint", "Collar_Mantle", (0, 2.04, 0.04))
    s.joint("Head_Helm", "Neck_Joint", (0, 2.22, 0.06))
    for side, sign in (("R", -1), ("L", 1)):
        s.joint(f"Shoulder_{side}", "Collar_Mantle", (sign * 0.42, 1.88, 0))
        s.joint(
            f"UpperArm_{side}", f"Shoulder_{side}", (sign * 0.54, 1.72, 0.02 if sign < 0 else 0.04)
        )
        s.joint(
            f"Forearm_{side}",
            f"UpperArm_{side}",
            (
                sign * (0.64 if sign < 0 else 0.60),
                1.44 if sign < 0 else 1.46,
                0.12 if sign < 0 else 0.18,
            ),
        )
        s.joint(
            f"Hand_{side}",
            f"Forearm_{side}",
            (
                sign * (0.70 if sign < 0 else 0.58),
                1.24 if sign < 0 else 1.32,
                0.28 if sign < 0 else 0.36,
            ),
        )
        s.joint(f"Hip_{side}", "Pelvis_Core", (sign * 0.19, 1.02, -0.02 if sign < 0 else 0.04))
        s.joint(
            f"Shin_{side}",
            f"Hip_{side}",
            (sign * (0.24 if sign < 0 else 0.22), 0.56, -0.10 if sign < 0 else 0.14),
        )
        s.joint(
            f"Boot_{side}",
            f"Shin_{side}",
            (sign * (0.26 if sign < 0 else 0.24), 0.14, -0.06 if sign < 0 else 0.22),
        )
        s.joint(f"Coat_Tail_{side}", "Pelvis_Core", (sign * 0.22, 1.12, -0.06))


def anatomy(s, mats, heavy=False, coat=BLUE):
    bulk = 1.25 if heavy else 1
    orb(s, mats["lining"], "Pelvis_Core", (0, 1.08, 0), (0.27 * bulk, 0.17, 0.18), WINE)
    orb(s, mats["cloth"], "Torso_Lower", (0, 1.32, 0), (0.25 * bulk, 0.25, 0.18), coat)
    orb(
        s,
        mats["silver"] if heavy else mats["cloth"],
        "Torso_Upper",
        (0, 1.67, 0),
        (0.35 * bulk, 0.30, 0.22),
        SILVER if heavy else coat,
    )
    rod(
        s,
        mats["gold"],
        "Pelvis_Core",
        [(-0.26 * bulk, 1.14, 0.16), (0, 1.12, 0.22), (0.26 * bulk, 1.14, 0.16)],
        0.025,
        GOLD,
    )
    coin(s, mats, "Pelvis_Core", (0, 1.12, 0.235), 0.085, "purple")
    for sign, side in ((-1, "R"), (1, "L")):
        hip = s.joints[f"Hip_{side}"]["pivot"]
        shin = s.joints[f"Shin_{side}"]["pivot"]
        boot = s.joints[f"Boot_{side}"]["pivot"]
        rod(s, mats["white"], f"Hip_{side}", [hip, shin], [0.12 * bulk, 0.095 * bulk], SILVER)
        rod(s, mats["cloth"], f"Shin_{side}", [shin, boot], [0.10 * bulk, 0.105 * bulk], NAVY)
        orb(
            s,
            mats["cloth"],
            f"Boot_{side}",
            boot + [0, -0.03, 0.06],
            (0.115 * bulk, 0.11, 0.23),
            BLUE,
        )
        s.scale_plate(
            f"Shin_{side}",
            mats["silver"],
            shin + [0, 0.02, 0.10],
            (0, 0, 1),
            (0, -1, 0),
            0.17 * bulk,
            0.22,
            0.025,
            SILVER,
            WHITE,
        )
        ring(
            s,
            mats["gold"],
            f"Boot_{side}",
            boot + [sign * 0.10, 0, -0.14],
            0.045,
            GOLD_LIGHT,
            0.010,
        )
        shoulder = s.joints[f"Shoulder_{side}"]["pivot"]
        elbow = s.joints[f"Forearm_{side}"]["pivot"]
        hand = s.joints[f"Hand_{side}"]["pivot"]
        orb(s, mats["silver"], f"Shoulder_{side}", shoulder, (0.18 * bulk, 0.12, 0.18), SILVER)
        rod(
            s,
            mats["cloth"],
            f"UpperArm_{side}",
            [shoulder, elbow],
            [0.12 * bulk, 0.09 * bulk],
            coat,
        )
        rod(s, mats["cloth"], f"Forearm_{side}", [elbow, hand], [0.10 * bulk, 0.08], coat)
        orb(s, mats["white"], f"Hand_{side}", hand, (0.09, 0.12, 0.08), WHITE)
        orb(
            s, mats["white"], f"Forearm_{side}", hand + [0, 0.08, -0.02], (0.11, 0.055, 0.11), WHITE
        )
        for i in range(4):
            rod(
                s,
                mats["gold"],
                f"Shoulder_{side}",
                [
                    shoulder + [sign * i * 0.045, -0.01, 0.12],
                    shoulder + [sign * i * 0.045, -0.18, 0.13],
                ],
                0.009,
                GOLD_LIGHT,
            )
        for row in range(2):
            for col in range(2):
                coin(
                    s,
                    mats,
                    "Torso_Lower",
                    (sign * (0.08 + col * 0.04), 1.37 + row * 0.13, 0.185),
                    0.024,
                )
        # Layered solid coat panels, with a separate bright lining face and gold hem.
        x = sign * 0.22
        s.scale_plate(
            f"Coat_Tail_{side}",
            mats["cloth"],
            (x, 0.91, -0.11),
            (0, 0, -1),
            (sign * 0.17, -1, 0.12),
            0.42,
            0.78,
            0.07,
            coat,
            BLUE_EDGE,
        )
        s.scale_plate(
            f"Coat_Tail_{side}",
            mats["lining"],
            (x, 0.91, -0.055),
            (0, 0, 1),
            (sign * 0.17, -1, 0.12),
            0.36,
            0.71,
            0.015,
            WINE,
            ROSE,
        )
        rod(
            s,
            mats["gold"],
            f"Coat_Tail_{side}",
            [(sign * 0.12, 1.13, -0.01), (sign * 0.35, 0.52, -0.04)],
            0.013,
            GOLD_LIGHT,
        )
    # Raised lapels and white cravat keep the chest legible in the canal lighting.
    for sign in (-1, 1):
        s.scale_plate(
            "Torso_Upper",
            mats["lining"],
            (sign * 0.16, 1.80, 0.20),
            (0, 0, 1),
            (-sign * 0.40, -1, 0),
            0.17,
            0.38,
            0.035,
            WINE,
            ROSE,
        )
    for i in range(3):
        orb(
            s,
            mats["white"],
            "Torso_Upper",
            (0, 1.91 - i * 0.08, 0.245),
            (0.09 - i * 0.015, 0.065, 0.038),
            WHITE,
        )
    rod(s, mats["silver"], "Neck_Joint", [(0, 1.96, 0.02), (0, 2.09, 0.04)], 0.115, SILVER)
    orb(s, mats["white"], "Head_Helm", (0, 2.22, 0.06), (0.15, 0.19, 0.13), "#b9a7a1")


def raven_mask(s, mats, joint="Head_Helm", long=False):
    orb(s, mats["silver"], joint, (0, 2.25, 0.17), (0.16, 0.12, 0.055), SILVER)
    s.blade_prism(
        joint,
        mats["silver"],
        [(0, 2.25, 0.20), (0, 2.21, 0.34), (0, 2.15, 0.47 if long else 0.39)],
        [0.13, 0.09, 0.002],
        [0.055, 0.035, 0.001],
        SHADOW,
        WHITE,
    )
    for sign in (-1, 1):
        ring(s, mats["gold"], "Head_Helm", (sign * 0.081, 2.29, 0.214), 0.045, GOLD_LIGHT, 0.010)
        orb(
            s,
            mats["red"] if sign > 0 else mats["purple"],
            "Head_Helm",
            (sign * 0.081, 2.29, 0.22),
            (0.027, 0.018, 0.016),
            RED if sign > 0 else VIOLET,
        )
        for i in range(3):
            rod(
                s,
                mats["gold"],
                joint,
                [
                    (sign * 0.025, 2.26 - i * 0.027, 0.24 + i * 0.027),
                    (sign * 0.09, 2.27 - i * 0.027, 0.22 + i * 0.027),
                ],
                0.005,
                GOLD_LIGHT,
            )


def shoulder_feathers(s, mats, side="R", count=9):
    sign = -1 if side == "R" else 1
    for i in range(count):
        t = i / max(1, count - 1)
        feather(
            s,
            mats,
            f"Shoulder_{side}",
            (sign * (0.28 + 0.14 * t), 1.94, -0.02),
            (sign * (0.49 + 0.22 * t), 1.77 - 0.18 * t, -0.06),
            0.14,
            WHITE,
        )


def archon_joints(s):
    humanoid_joints(s, "Archon_Root")
    s.joint("Mask_Beak", "Head_Helm", (0, 2.25, 0.16))
    s.joint("Bicorne_Crown", "Head_Helm", (0, 2.42, 0.05))
    s.joint("Feather_Cape_L", "Collar_Mantle", (-0.28, 1.96, -0.14))
    s.joint("Feather_Cape_R", "Collar_Mantle", (0.28, 1.96, -0.14))
    s.joint("Feather_Cape_Center", "Collar_Mantle", (0, 1.94, -0.22))
    s.joint("Auction_Wheel_Halo", "Collar_Mantle", (0, 1.96, -0.28))
    s.joint("Gavel_Cane_Sword", "Hand_R", (-0.70, 1.24, 0.30))
    s.joint("Gavel_Hinged_Head", "Gavel_Cane_Sword", (-0.70, 1.40, 0.30))
    s.joint("Aether_Revolver_Flintlock", "Hand_L", (0.58, 1.32, 0.38))
    s.joint("Aether_Cartridge_Drum", "Aether_Revolver_Flintlock", (0.58, 1.39, 0.55))
    for name, pivot in zip(
        FX_NAMES, ((0, 1.45, 0.85), (0.55, 1.38, 0.82), (0, 1.45, 0.15), (0, 1.55, 0.72))
    ):
        s.joint(name, "Archon_Root", pivot, rest_scale=(1e-5,) * 3)


def archon_regalia(s, mats):
    anatomy(s, mats)
    raven_mask(s, mats, "Mask_Beak", long=True)
    # Openwork cuirass: raised metal ribs leave the royal velvet visible between them.
    for sign in (-1, 1):
        for row in range(4):
            y = 1.47 + row * 0.10
            rod(
                s,
                mats["silver"],
                "Torso_Upper",
                [
                    (sign * 0.02, y - 0.04, 0.24),
                    (sign * 0.17, y + 0.06, 0.24),
                    (sign * 0.30, y + 0.03, 0.14),
                ],
                0.014,
                WHITE,
            )
        for col in range(3):
            x = sign * (0.14 + col * 0.06)
            rod(
                s,
                mats["gold"],
                "Torso_Upper",
                [(x, 1.82, 0.22), (x, 1.58 - 0.02 * col, 0.29)],
                0.007,
                GOLD_LIGHT,
            )
            for row in range(4):
                orb(
                    s,
                    mats["gold"],
                    "Torso_Upper",
                    (x, 1.62 + row * 0.045, 0.29),
                    (0.017, 0.014, 0.017),
                    GOLD_LIGHT,
                )
    # Six individually mounted alternating poison/aether vials on an actual diagonal bandolier.
    rod(s, mats["gold"], "Torso_Upper", [(-0.27, 1.87, 0.22), (0.27, 1.32, 0.24)], 0.032, BRASS)
    for i in range(6):
        vial(
            s,
            mats,
            "Torso_Upper",
            (-0.23 + i * 0.09, 1.70 - i * 0.075, 0.30),
            0.17,
            "green" if i % 2 == 0 else "purple",
        )
    for sign, side in ((-1, "R"), (1, "L")):
        for row in range(2):
            for i in range(9):
                t = i / 8
                feather(
                    s,
                    mats,
                    "Collar_Mantle",
                    (sign * (0.09 + t * 0.23), 1.96 + row * 0.035, -0.03),
                    (sign * (0.18 + t * 0.38), 2.12 + row * 0.08 - t * 0.13, -0.16),
                    0.13,
                    WHITE,
                )
        shoulder_feathers(s, mats, side, 12)
        for i in range(7):
            t = i / 6
            feather(
                s,
                mats,
                f"Coat_Tail_{side}",
                (sign * (0.12 + t * 0.20), 0.83, -0.15),
                (sign * (0.16 + t * 0.25), 0.43 - 0.10 * t, -0.12),
                0.11,
                ROSE,
                WHITE,
            )
        # Twin waist chains end in a pocket watch and a seal case.
        chain = [
            (sign * (0.11 + i / 12 * 0.24), 1.12 - 0.12 * math.sin(PI * i / 12), 0.22)
            for i in range(13)
        ]
        rod(s, mats["gold"], "Pelvis_Core", chain, 0.009, GOLD_LIGHT)
    coin(s, mats, "Pelvis_Core", (-0.33, 0.94, 0.19), 0.080, "light")
    plate(s, mats["gold"], "Pelvis_Core", (-0.34, 0.76, 0.14), 0.11, 0.11, 0.07, GOLD)
    # Small abacus forearm shield: six rails, independently sculpted counting beads.
    plate(s, mats["gold"], "Forearm_L", (0.64, 1.50, 0.25), 0.20, 0.25, 0.045, BRASS)
    for i in range(4):
        y = 1.53 + i * 0.055
        rod(s, mats["silver"], "Forearm_L", [(0.56, y, 0.29), (0.72, y, 0.29)], 0.006, SILVER)
        for n in range(3):
            orb(
                s,
                mats["gold"],
                "Forearm_L",
                (0.58 + n * 0.046, y, 0.29),
                (0.017, 0.019, 0.017),
                GOLD_LIGHT,
            )
    # Bicorne has two sculpted curved horns rather than a generic cylindrical top hat.
    j = "Bicorne_Crown"
    orb(s, mats["cloth"], j, (0, 2.40, 0.05), (0.34, 0.04, 0.19), NAVY)
    for sign in (-1, 1):
        rod(
            s,
            mats["lining"],
            j,
            [(sign * 0.02, 2.43, 0.05), (sign * 0.23, 2.51, 0.06), (sign * 0.36, 2.59, 0.04)],
            [0.14, 0.12, 0.008],
            WINE,
        )
        rod(
            s,
            mats["gold"],
            j,
            [(0, 2.49, 0.18), (sign * 0.22, 2.57, 0.15), (sign * 0.36, 2.59, 0.04)],
            0.012,
            GOLD_LIGHT,
        )
    s.crystal_spire(j, mats["purple"], (0, 2.43, 0.20), (0, 1, 0), 0.18, 0.080, VIOLET, WHITE)
    for i in range(3):
        feather(
            s,
            mats,
            j,
            (0.17 + i * 0.035, 2.48, 0.01),
            (0.31 + i * 0.06, 2.67 - i * 0.025, -0.08),
            0.09,
            ROSE if i == 1 else WHITE,
        )
    # Exposed lower back plumage is blue/magenta; upper tiers remain platinum white.
    for side, sign in (("L", -1), ("R", 1), ("Center", 0)):
        j = f"Feather_Cape_{side}"
        for row in range(3):
            for i in range(11 if sign else 7):
                t = i / (10 if sign else 6)
                x = sign * (0.28 + 0.30 * t)
                root = (x, 1.98 - row * 0.17, -0.17 - row * 0.045)
                tip = (
                    sign * (0.45 + 0.48 * t) if sign else (t - 0.5) * 0.40,
                    1.70 - row * 0.35 - 0.30 * t,
                    -0.27 - row * 0.07,
                )
                feather(
                    s,
                    mats,
                    j,
                    root,
                    tip,
                    0.18,
                    WHITE if row == 0 else SILVER if row == 1 else ROSE,
                    WHITE if row < 2 else BLUE,
                )
        for i in range(6):
            x = sign * (0.47 + i * 0.065)
            rod(
                s,
                mats["gold"],
                j,
                [(x, 1.56 - i * 0.035, -0.24), (x, 1.43 - i * 0.035, -0.23)],
                0.008,
                GOLD_LIGHT,
            )


def archon_wheel(s, mats):
    j = "Auction_Wheel_Halo"
    center = np.array([0, 1.96, -0.28])
    ring(s, mats["gold"], j, center, 0.46, GOLD, 0.025)
    ring(s, mats["gold"], j, center, 0.36, GOLD_LIGHT, 0.012)
    for i in range(16):
        a = TAU * i / 16
        p = center + [0.36 * math.cos(a), 0.36 * math.sin(a), 0]
        q = center + [0.48 * math.cos(a), 0.48 * math.sin(a), 0]
        rod(s, mats["gold"], j, [p, q], 0.010, GOLD_LIGHT)
    for i, glow in enumerate(("green", "red", "purple", "light")):
        a = PI / 2 + i * PI / 2
        p = center + [0.46 * math.cos(a), 0.46 * math.sin(a), 0]
        coin(s, mats, j, p, 0.090, glow)
    # A miniature suspension beam with two weighing pans distinguishes the auction halo.
    rod(
        s,
        mats["gold"],
        j,
        [(-0.26, 2.24, -0.30), (0, 2.29, -0.30), (0.26, 2.24, -0.30)],
        0.015,
        GOLD_LIGHT,
    )
    for sign in (-1, 1):
        for dx in (-0.055, 0.055):
            rod(
                s,
                mats["gold"],
                j,
                [(sign * 0.22, 2.24, -0.30), (sign * 0.22 + dx, 2.08, -0.30)],
                0.006,
                GOLD,
            )
        orb(s, mats["gold"], j, (sign * 0.22, 2.07, -0.30), (0.085, 0.025, 0.065), GOLD_LIGHT)


def archon_weapons(s, mats):
    j = "Gavel_Cane_Sword"
    rod(s, mats["gold"], j, [(-0.70, 1.13, 0.30), (-0.70, 1.40, 0.30)], 0.032, BRASS)
    # Horizontal gavel head and a sculpted raven relief over the rapier basket guard.
    head = "Gavel_Hinged_Head"
    rod(s, mats["gold"], head, [(-0.86, 1.41, 0.30), (-0.54, 1.41, 0.30)], 0.070, GOLD, 12)
    for x in (-0.86, -0.54):
        orb(s, mats["gold"], head, (x, 1.41, 0.30), (0.018, 0.088, 0.088), GOLD_LIGHT)
    ring(s, mats["gold"], j, (-0.70, 1.25, 0.40), 0.12, GOLD_LIGHT, 0.017)
    feather(s, mats, j, (-0.70, 1.36, 0.38), (-0.65, 1.25, 0.53), 0.09, WHITE)
    points = [(-0.70, 1.27, 0.41), (-0.76, 1.18, 0.88), (-0.79, 1.12, 1.44)]
    blade(s, mats, j, points, 0.055)
    rod(
        s,
        mats["purple"],
        j,
        [(-0.69, 1.27, 0.42), (-0.75, 1.18, 0.88), (-0.79, 1.12, 1.43)],
        [0.006, 0.005, 0.001],
        VIOLET,
    )
    j = "Aether_Revolver_Flintlock"
    plate(s, mats["gold"], j, (0.58, 1.34, 0.40), 0.16, 0.12, 0.28, GOLD)
    rod(s, mats["cloth"], j, [(0.58, 1.36, 0.41), (0.60, 1.17, 0.33)], [0.060, 0.042], WINE)
    ring(s, mats["gold"], j, (0.58, 1.26, 0.49), 0.062, GOLD_LIGHT, 0.012)
    for i, glow in enumerate(("green", "purple", "red")):
        a = PI / 2 + TAU * i / 3
        x, y = 0.58 + 0.060 * math.cos(a), 1.39 + 0.060 * math.sin(a)
        rod(s, mats["gold"], j, [(x, y, 0.48), (x, y, 0.95)], 0.042, GOLD)
        rod(s, mats["silver"], j, [(x, y, 0.89), (x, y, 0.98)], 0.047, WHITE)
        orb(s, mats["cloth"], j, (x, y, 0.987), (0.026, 0.026, 0.008), NAVY)
        vial(
            s,
            mats,
            "Aether_Cartridge_Drum",
            (x + 0.065 * math.cos(a), y + 0.065 * math.sin(a) - 0.055, 0.55),
            0.13,
            glow,
        )
    blade(s, mats, j, [(0.58, 1.29, 0.65), (0.58, 1.21, 0.82), (0.58, 1.20, 1.05)], 0.08, "purple")
    for i in range(4):
        a = i * PI / 5
        rod(
            s,
            mats["gold"],
            j,
            [(0.49, 1.34, 0.45 + i * 0.065), (0.47, 1.40 + 0.025 * math.sin(a), 0.48 + i * 0.065)],
            0.008,
            GOLD_LIGHT,
        )


def archon_effects(s, mats):
    for i, sign in enumerate((-1, 1)):
        j = "Blade_Cross_FX"
        blade(
            s,
            mats,
            j,
            [
                (-0.48, 1.12 if sign > 0 else 1.78, 0.85),
                (0, 1.45, 0.89),
                (0.48, 1.78 if sign > 0 else 1.12, 0.85),
            ],
            0.07,
            "green",
        )
        j = "Execution_Shadow_FX"
        blade(
            s,
            mats,
            j,
            [
                (-0.84, 0.92 if sign > 0 else 2.17, 0.75),
                (0, 1.55, 0.81),
                (0.84, 2.17 if sign > 0 else 0.92, 0.75),
            ],
            0.14,
            "purple",
        )
    j = "Execution_Shadow_FX"
    rod(s, mats["light"], j, [(0, 1.18, 0.83), (0, 2.13, 0.83)], 0.048, GOLD_LIGHT)
    rod(s, mats["gold"], j, [(-0.34, 2.13, 0.83), (0.34, 2.13, 0.83)], 0.13, GOLD_LIGHT)
    j = "Muzzle_Blast_FX"
    for i, glow in enumerate(("purple", "red", "light")):
        color = (VIOLET, RED, GOLD_LIGHT)[i]
        a = PI / 2 + TAU * i / 3
        x, y = 0.55 + 0.07 * math.cos(a), 1.38 + 0.07 * math.sin(a)
        s.crystal_spire(j, mats[glow], (x, y, 0.85), (0, 0, 1), 0.38, 0.07, color, WHITE)
        ring(s, mats[glow], j, (0.55, 1.38, 0.93 + i * 0.12), 0.13 + i * 0.065, color, 0.012)
    j = "Feather_Storm_FX"
    for i in range(12):
        a = TAU * i / 12
        root = (0.72 * math.cos(a), 1.45 + 0.15 * math.sin(a * 2), 0.15 + 0.72 * math.sin(a))
        tip = (1.15 * math.cos(a + 0.28), root[1] + 0.08, 0.15 + 1.15 * math.sin(a + 0.28))
        feather(s, mats, j, root, tip, 0.13, ROSE if i % 2 else WHITE, SILVER)
    for i in range(8):
        a = TAU * i / 8
        coin(s, mats, j, (0.93 * math.cos(a), 1.40, 0.15 + 0.93 * math.sin(a)), 0.08, "light")
    for i in range(6):
        coin(
            s,
            mats,
            "Blade_Cross_FX",
            (-0.45 + i * 0.18, 1.13 + 0.10 * (i % 3), 0.88),
            0.035,
            "light",
        )


def archon_pose(name, t, duration):
    """World-authored pivot rig: rotations are local XYZ, translations are root deltas."""
    pose = {}
    delta = (0, 0, 0)
    fx = {}
    u = t / duration
    wave = math.sin(TAU * u)
    if name == "Idle":
        pose.update(
            {
                "Torso_Lower": (0.02 * wave, 0, 0),
                "Torso_Upper": (-0.015 * wave, 0, 0),
                "Head_Helm": (0, 0.12 * wave, 0),
                "Auction_Wheel_Halo": (0, 0, 0.18 * wave),
                "Gavel_Cane_Sword": (0.03 * wave, 0, 0),
                "Aether_Revolver_Flintlock": (0.015 * wave, 0, 0),
            }
        )
        for side, sign in (("L", 1), ("R", -1)):
            pose[f"Feather_Cape_{side}"] = (0.03 * wave, 0, sign * 0.04 * wave)
            pose[f"Coat_Tail_{side}"] = (0.025 * wave, 0, sign * 0.025 * wave)
    elif name == "Charge_Up":
        cross = plateau(t, 0, 0.40, 1.40, duration)
        flare = plateau(t, 0.35, 0.80, 1.40, duration)
        turn = smoothstep(0.40, 1.40, t)
        for side, sign in (("R", 1), ("L", -1)):
            pose[f"Shoulder_{side}"] = (0, 0, sign * 0.62 * cross)
            pose[f"Forearm_{side}"] = (-0.70 * cross, 0, 0)
            pose[f"Feather_Cape_{side}"] = (0, 0, sign * 0.72 * flare)
        pose["Torso_Upper"] = (-0.15 * flare, 0, 0)
        pose["Auction_Wheel_Halo"] = (0, 0, TAU * turn)
    elif name == "Normal_Attack":
        thrust = plateau(t, 0.28, 0.44, 0.62, 1.20)
        wind = bell_window(t, 0, 0.45)
        delta = (0, 0, 0.16 * plateau(t, 0, 0.28, 0.62, duration))
        pose["Torso_Upper"] = (0, -0.26 * wind + 0.16 * thrust, 0)
        pose["Shoulder_R"] = (-0.65 * thrust, 0.32 * thrust, 0)
        pose["Forearm_R"] = (-0.52 * thrust, 0, 0)
        pose["Gavel_Cane_Sword"] = (0.18 * bell_window(t, 0.28, 0.48) - 0.12 * thrust, 0, 0)
        pose["Gavel_Hinged_Head"] = (0, 0, 0.78 * plateau(t, 0.34, 0.46, 0.62, 1.10))
        pose["Shoulder_L"] = (0.12 * thrust, 0, -0.16 * thrust)
        fx["Blade_Cross_FX"] = 1.10 * bell_window(t, 0.35, 0.68)
    elif name == "Special_Attack":
        aim = plateau(t, 0, 0.35, 0.75, duration)
        recoil = sum(bell_window(t, a, a + 0.08) for a in (0.46, 0.56, 0.66))
        pose["Archon_Root"] = (0, -0.35 * aim, 0)
        pose["Torso_Upper"] = (0, -0.20 * aim, 0)
        pose["Shoulder_L"] = (-0.47 * aim + 0.42 * recoil, 0, -0.15 * aim)
        pose["Forearm_L"] = (-0.35 * aim, 0, 0)
        pose["Aether_Revolver_Flintlock"] = (0.13 * recoil, 0.45 * aim, 0.16 * aim)
        pose["Aether_Cartridge_Drum"] = (0, 0, TAU * smoothstep(0.42, 1.12, t))
        pose["Shoulder_R"] = (0.12 * aim, 0.20 * aim, 0.08 * aim)
        fx["Muzzle_Blast_FX"] = 1.25 * recoil
    elif name == "Special_Action":
        flight = plateau(t, 0, 0.30, 1.65, duration)
        turn = smoothstep(0.30, 1.65, t)
        delta = (0, 0.36 * flight, 0)
        pose["Archon_Root"] = (0, TAU * turn, 0)
        pose["Shoulder_R"] = (0, 0, -0.82 * flight)
        pose["Shoulder_L"] = (0, 0, 0.82 * flight)
        pose["Feather_Cape_R"] = (0.25 * flight, 0, 0.82 * flight)
        pose["Feather_Cape_L"] = (0.25 * flight, 0, -0.82 * flight)
        pose["Feather_Cape_Center"] = (-0.75 * flight, 0, 0)
        pose["Auction_Wheel_Halo"] = (0, 0, -TAU * 2 * turn)
        salute = bell_window(t, 1.65, duration)
        pose["Forearm_L"] = (-1.65 * salute, 0, -0.20 * salute)
        fx["Feather_Storm_FX"] = 1.35 * plateau(t, 0.30, 0.46, 1.52, 1.72)
        pose["Feather_Storm_FX"] = (0, TAU * 2 * turn, 0)
    elif name == "Talon_Rend":
        crouch = bell_window(t, 0, 0.68)
        leap = bell_window(t, 0.45, 1.30)
        cut = plateau(t, 0.90, 1.12, 1.35, 1.80)
        delta = (0, -0.25 * crouch + 0.32 * leap, 0.10 * crouch + 0.20 * leap)
        pose["Torso_Lower"] = (0.35 * crouch + 0.18 * cut, 0, 0)
        for side, sign in (("R", 1), ("L", -1)):
            pose[f"Shoulder_{side}"] = (-1.65 * leap - 0.85 * cut, 0, sign * 0.40 * cut)
            pose[f"Forearm_{side}"] = (-0.65 * cut, 0, 0)
            pose[f"Feather_Cape_{side}"] = (-0.40 * crouch, 0, sign * 0.30 * cut)
        pose["Auction_Wheel_Halo"] = (0, 0, 0.80 * cut)
        fx["Execution_Shadow_FX"] = 1.42 * plateau(t, 0.85, 1.02, 1.32, 1.50)
    else:
        stagger = plateau(t, 0, 0.25, 0.90, duration)
        shake = math.sin(t * 35) * stagger
        delta = (0, -0.05 * stagger, -0.20 * stagger)
        pose["Archon_Root"] = (-0.15 * stagger, 0, 0)
        pose["Head_Helm"] = (-0.26 * stagger, 0.30 * stagger, 0)
        pose["Bicorne_Crown"] = (0, 0, 0.12 * shake)
        pose["Auction_Wheel_Halo"] = (0.25 * stagger, 0.08 * shake, -0.35 * stagger)
        for side, sign in (("R", 1), ("L", -1)):
            pose[f"Shoulder_{side}"] = (0.32 * stagger, 0, sign * 0.22 * stagger)
            pose[f"Feather_Cape_{side}"] = (0.10 * shake, 0, sign * 0.28 * stagger)
    return pose, delta, fx


def muzzle_pose(s, pose):
    """Place the independent FX joint at the posed muzzle in Archon_Root space."""
    point = np.array([0.58, 1.39, 0.98])
    axis = np.array([0.0, 0.0, 1.0])
    joint = "Aether_Revolver_Flintlock"
    while joint != "Archon_Root":
        item = s.joints[joint]
        angles = pose.get(joint, (0, 0, 0))
        # The inverse transpose converts the shared ZYX matrix helper to glTF's XYZ order.
        rotation = rot_matrix_xyz(*(-angle for angle in angles)).T
        point = item["pivot"] + rotation @ (point - item["pivot"])
        axis = rotation @ axis
        joint = item["parent"]
    rotation = (math.atan2(-axis[1], axis[2]), math.asin(float(np.clip(axis[0], -1, 1))), 0)
    delta = point - s.joints["Muzzle_Blast_FX"]["pivot"]
    return rotation, delta.tolist()


def archon_clips(s):
    clips = {}
    for name, duration, count in CLIPS:
        times = np.linspace(0, duration, count).tolist()
        # Every action resets every joint, including FX. No scale/pose can leak across crossfades.
        tracks = {j: {"rotation": []} for j in s.joint_order}
        tracks["Archon_Root"]["translation"] = []
        tracks["Muzzle_Blast_FX"]["translation"] = []
        for j in FX_NAMES:
            tracks[j]["scale"] = []
        for t in times:
            pose, delta, fx = archon_pose(name, t, duration)
            muzzle_delta = (0, 0, 0)
            if name == "Special_Attack":
                pose["Muzzle_Blast_FX"], muzzle_delta = muzzle_pose(s, pose)
            for j in s.joint_order:
                tracks[j]["rotation"].append(euler_xyz_to_quat(*pose.get(j, (0, 0, 0))))
            tracks["Archon_Root"]["translation"].append(delta)
            tracks["Muzzle_Blast_FX"]["translation"].append(muzzle_delta)
            for j in FX_NAMES:
                tracks[j]["scale"].append([max(1e-5, fx.get(j, 1e-5))] * 3)
        clips[name] = (times, tracks)
    return clips


def build_archon(s, mats):
    archon_regalia(s, mats)
    archon_wheel(s, mats)
    archon_weapons(s, mats)
    archon_effects(s, mats)
    return archon_clips(s)


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    assert magic == 0x46546C67 and version == 2 and length == len(data), path
    json_len, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A
    doc = json.loads(data[20 : 20 + json_len])
    offset = 20 + json_len
    binary_len, chunk_type = struct.unpack_from("<II", data, offset)
    assert chunk_type == 0x004E4942
    binary = data[offset + 8 : offset + 8 + binary_len]
    assert len(binary) >= doc["buffers"][0]["byteLength"]
    return doc, binary


def accessor_array(doc, binary, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2"}[acc["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    needed = acc["count"] * width * np.dtype(dtype).itemsize
    assert offset + needed <= len(binary), "Accessor exceeds binary buffer"
    return np.frombuffer(binary, dtype=dtype, count=acc["count"] * width, offset=offset).reshape(
        -1, width
    )


def rest_bounds(doc, binary):
    nodes = doc["nodes"]
    points = []

    def walk(index, parent, hidden=False):
        node = nodes[index]
        scale = np.array(node.get("scale", (1, 1, 1)))
        hidden = hidden or max(abs(scale)) < 0.01
        local = np.eye(4)
        local[:3, :3] = np.diag(scale)
        local[:3, 3] = node.get("translation", (0, 0, 0))
        world = parent @ local
        if "mesh" in node and not hidden:
            for primitive in doc["meshes"][node["mesh"]]["primitives"]:
                pos = accessor_array(doc, binary, primitive["attributes"]["POSITION"])
                points.append(pos @ world[:3, :3].T + world[:3, 3])
        for child in node.get("children", []):
            walk(child, world, hidden)

    for root in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        walk(root, np.eye(4))
    values = np.concatenate(points)
    return values.min(axis=0), values.max(axis=0)


def verify_asset(spec):
    enemy_id, slug, _, tier, limits = spec
    filename = slug + ".glb"
    path = ASSETS / filename
    doc, binary = read_glb(path)
    data = path.read_bytes()
    category = OUT_OVERLORDS if tier == "overlord" else OUT_ROOT / "银冠黑市模型"
    assert (OUT_ROOT / filename).read_bytes() == data
    assert (category / filename).read_bytes() == data
    assert (PORTRAITS / f"{slug}.svg").stat().st_size > 1000
    assert doc["extras"]["enemyId"] == enemy_id
    assert doc["extras"]["tier"] == tier
    is_archon = tier == "overlord"
    assert doc["extras"]["nonVoxel"] is is_archon
    voxel_boxes = doc["extras"]["voxelBoxes"]
    if is_archon:
        assert doc["extras"]["source"] == SOURCE and voxel_boxes == 0
    else:
        source = json.loads((category / f"{slug}.json").read_text(encoding="utf-8"))
        assert source["id"] == enemy_id and source["model"] == filename
        assert len(source["blocks"]) == voxel_boxes and voxel_boxes >= 45
        assert any(m.get("emissiveFactor") for m in doc["materials"])
    for i in range(len(doc["accessors"])):
        assert np.isfinite(accessor_array(doc, binary, i)).all(), f"{slug}: nonfinite accessor {i}"
    triangles = 0
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            attrs = primitive["attributes"]
            positions = accessor_array(doc, binary, attrs["POSITION"])
            normals = accessor_array(doc, binary, attrs["NORMAL"])
            indices = accessor_array(doc, binary, primitive["indices"])
            assert indices.max() < len(positions) and indices.size % 3 == 0
            assert len(normals) == len(positions)
            assert np.allclose(np.linalg.norm(normals, axis=1), 1, atol=0.001)
            if not is_archon:
                assert (
                    np.count_nonzero(normals, axis=1) == 1
                ).all(), "Voxel faces must be axis aligned"
            triangles += indices.size // 3
    for material in doc["materials"]:
        assert all(0 <= c <= 1 for c in material.get("emissiveFactor", []))
        pbr = material["pbrMetallicRoughness"]
        assert 0 <= pbr["metallicFactor"] <= 1 and 0 <= pbr["roughnessFactor"] <= 1
    low, high = rest_bounds(doc, binary)
    size = high - low
    assert (
        abs(low[1]) < 1e-5 and abs(low[0] + high[0]) < 1e-5 and abs(low[2] + high[2]) < 1e-5
    ), f"{slug}: floor/center {low}, {high}"
    h, w, d = limits
    assert (
        0 < size[0] <= w + 0.002 and size[1] <= h + 0.002 and size[2] <= d + 0.002
    ), f"{slug}: size {size} exceeds {limits}"
    assert size[1] >= (2.50 if tier == "overlord" else h - 0.01), f"{slug}: wrong height"
    if not is_archon:
        assert not doc.get("animations") and triangles == voxel_boxes * 12
        print(
            f"[verified] {slug}: H={size[1]:.3f} X={size[0]:.3f} Z={size[2]:.3f}; {voxel_boxes} voxel boxes"
        )
        return {
            "slug": slug,
            "tier": tier,
            "sizeXYZ": size.tolist(),
            "voxelBoxes": voxel_boxes,
            "triangles": triangles,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    names = {node["name"]: i for i, node in enumerate(doc["nodes"])}
    parents = {
        child: i for i, node in enumerate(doc["nodes"]) for child in node.get("children", [])
    }
    assert names["Archon_Root"] in doc["scenes"][0]["nodes"]
    expected_clips = CLIPS
    animations = {clip["name"]: clip for clip in doc["animations"]}
    assert set(animations) == {name for name, _, _ in expected_clips}
    clip_stats = {}
    for name, duration, count in expected_clips:
        animation = animations[name]
        assert len(animation["channels"]) > 15
        seen = set()
        for channel in animation["channels"]:
            target = channel["target"]
            key = (target["node"], target["path"])
            assert key not in seen
            seen.add(key)
            assert target["node"] < len(doc["nodes"])
            sampler = animation["samplers"][channel["sampler"]]
            times = accessor_array(doc, binary, sampler["input"]).ravel()
            values = accessor_array(doc, binary, sampler["output"])
            assert len(times) == count == len(values)
            assert abs(times[0]) < 1e-6 and abs(times[-1] - duration) < 1e-5
            assert (np.diff(times) > 0).all()
            if target["path"] == "rotation":
                assert np.allclose(np.linalg.norm(values, axis=1), 1, atol=1e-5)
            if target["path"] == "scale":
                assert (values > 0).all()
                assert np.allclose(values[0], 1e-5) and np.allclose(values[-1], 1e-5)
        clip_stats[name] = {"duration": duration, "frames": count, "channels": len(seen)}
    if tier == "overlord":
        expected = RiggedSculptor(enemy_id, "")
        archon_joints(expected)
        for joint, definition in expected.joints.items():
            index = names[joint]
            parent = definition["parent"]
            assert parents.get(index) == (names[parent] if parent else None), joint
            if parent:
                actual = np.asarray(doc["nodes"][index]["translation"])
                desired = definition["pivot"] - expected.joints[parent]["pivot"]
                assert np.allclose(actual, desired, atol=1e-5), f"Wrong pivot: {joint}"
        for joint in FX_NAMES:
            assert doc["nodes"][names[joint]]["scale"] == [1e-5] * 3
        for clip_name, effect, minimum in (
            ("Normal_Attack", FX_NAMES[0], 1.0),
            ("Special_Attack", FX_NAMES[1], 1.0),
            ("Special_Action", FX_NAMES[2], 1.30),
            ("Talon_Rend", FX_NAMES[3], 1.40),
        ):
            clip = animations[clip_name]
            channel = next(
                c
                for c in clip["channels"]
                if c["target"] == {"node": names[effect], "path": "scale"}
            )
            output = clip["samplers"][channel["sampler"]]["output"]
            assert accessor_array(doc, binary, output).max() >= minimum, f"{effect}: inactive"
        # Idle must loop seamlessly, including root and every feather/coat joint.
        for sampler in animations["Idle"]["samplers"]:
            values = accessor_array(doc, binary, sampler["output"])
            assert np.allclose(values[0], values[-1], atol=1e-5), "Idle loop seam"
    print(
        f"[verified] {slug}: H={size[1]:.3f} X={size[0]:.3f} Z={size[2]:.3f}; {triangles:,} tris; {len(animations)} clips"
    )
    return {
        "slug": slug,
        "tier": tier,
        "sizeXYZ": size.tolist(),
        "triangles": triangles,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "clips": clip_stats,
    }


def protected_hashes():
    """Guard the preceding Starbell black market's assets across all output locations."""
    paths = list(ASSETS.glob("*.glb")) + list(OUT_ROOT.rglob("*.glb"))
    return {
        path: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in paths
        if path.name.startswith("bandit-") or "black-market" in path.name
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--only", choices=[spec[1] for spec in SPECS])
    args = parser.parse_args()
    selected = [spec for spec in SPECS if args.only is None or spec[1] == args.only]
    protected = protected_hashes()
    builders = (*BUILDERS, build_archon)
    reports = []
    for spec, builder in zip(SPECS, builders):
        if spec not in selected:
            continue
        enemy_id, slug, title, tier, _ = spec
        if not args.verify_only:
            if tier != "overlord":
                export_voxel(spec, builder)
            else:
                s = RiggedSculptor(enemy_id, title)
                archon_joints(s)
                clips = builder(s, materials(s))
                s.export_glb(
                    slug + ".glb",
                    slug,
                    clips,
                    source_name=SOURCE,
                    svg_theme={
                        "bg0": "#3b1747",
                        "bg1": "#16203a",
                        "bg2": "#070a14",
                        "aura0": "#f59e0b",
                        "aura1": "#ec4899",
                        "rim": "#38bdf8",
                        "rim_rgb": [0.95, 1.15, 1.45],
                    },
                )
        reports.append(verify_asset(spec))
    assert protected == protected_hashes(), "An existing unrelated GLB was changed"
    output = ASSETS.parents[0] / ".runtime/models/silver-crown-syndicate"
    output.mkdir(parents=True, exist_ok=True)
    (output / "validation.json").write_text(
        json.dumps({"models": reports, "protectedGLBs": len(protected)}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[complete] {len(reports)} models verified; {len(protected)} existing GLBs unchanged")


if __name__ == "__main__":
    main()
