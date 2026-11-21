"""暗巷匪王·黑鸦 — Bandit Syndicate King (Overlord boss) procedural sculpt/rig/animate/export."""

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from overlord_rig_core import (
    RiggedSculptor,
    hex_to_linear,
    lerp_hex,
    euler_xyz_to_quat,
    rot_matrix_xyz,
    basis_from_dir,
    smoothstep,
    bell_window,
    plateau,
    pulse_peak,
    PI,
    TAU,
)

# ---------------------------------------------------------------------------
# Palette — Charcoal-Slate & Ink-Navy base with Crimson/Gold/Emerald accents
# ---------------------------------------------------------------------------
C_OBSIDIAN = "#2d354a"
C_MIDNIGHT = "#3b4764"
C_INDIGO = "#4d5d82"
C_PLUM = "#6e4e7a"
C_BRONZE_TIP = "#c26c58"
C_ROSE_TIP = "#cf3e64"
C_CRIMSON = "#a61c42"
C_CRIMSON_DEEP = "#6e102b"
C_CRIMSON_BRIGHT = "#cf2852"
C_IRON_DARK = "#4a5366"
C_IRON_MID = "#66738c"
C_IRON_LIGHT = "#94a3bf"
C_SILVER = "#e6eef8"
C_SILVER_DIM = "#aeb9cc"
C_BRASS = "#d9ad4c"
C_BRASS_DIM = "#9c7832"
C_BRASS_BRIGHT = "#ffe078"
C_LEATHER = "#473c3c"
C_LEATHER_MID = "#5e4e4b"
C_LEATHER_LIGHT = "#7d6760"
C_STEEL = "#f2f7ff"
C_STEEL_DIM = "#b8c7db"
C_VENOM = "#2de88a"
C_VENOM_DEEP = "#109452"
C_OCULAR = "#f02a5e"
C_OCULAR_DEEP = "#9c1438"
C_WOOD = "#614232"
C_WOOD_LIGHT = "#8f6246"
C_FX_CRIMSON = "#f43f5e"
C_FX_VIOLET = "#9333ea"
C_FX_EMERALD = "#34d399"


def build():
    s = RiggedSculptor("banditSyndicateKing", "暗巷匪王·黑鸦")

    # -----------------------------------------------------------------------
    # 1. MATERIALS (tuned for non-IBL battle lighting so silhouettes & details pop)
    # -----------------------------------------------------------------------
    m_coat = s.mat("Coat_Leather", metallic=0.10, roughness=0.50, pbr_kind="raven_leather")
    m_feather = s.mat(
        "Raven_Feathers", metallic=0.16, roughness=0.40, double_sided=True, pbr_kind="raven_feather"
    )
    m_iron = s.mat("Dark_Iron_Armor", metallic=0.42, roughness=0.34, pbr_kind="filigree_iron")
    m_silver = s.mat("Silver_Filigree", metallic=0.48, roughness=0.24, pbr_kind="filigree_iron")
    m_brass = s.mat("Antique_Brass", metallic=0.50, roughness=0.26, pbr_kind="brass_astrolabe")
    m_ocular = s.mat(
        "Raven_Ocular_Glow", metallic=0.12, roughness=0.18, emissive=[1.15, 0.12, 0.28]
    )
    m_venom = s.mat("Venom_Glass_Glow", metallic=0.12, roughness=0.15, emissive=[0.08, 0.85, 0.38])
    m_blade = s.mat(
        "Blade_Steel",
        metallic=0.46,
        roughness=0.18,
        emissive=[0.06, 0.10, 0.13],
        pbr_kind="filigree_iron",
    )
    m_cloth = s.mat(
        "Syndicate_Crimson_Cloth",
        metallic=0.06,
        roughness=0.54,
        emissive=[0.06, 0.008, 0.018],
        double_sided=True,
        pbr_kind="raven_leather",
    )
    m_fx = s.mat(
        "Strike_FX",
        metallic=0.08,
        roughness=0.22,
        emissive=[0.88, 0.24, 0.62],
        double_sided=True,
    )

    # -----------------------------------------------------------------------
    # 2. SKELETON
    # -----------------------------------------------------------------------
    s.joint("Syndicate_Root", None, (0.0, 0.0, 0.0))
    s.joint("Pelvis_Core", "Syndicate_Root", (0.0, 1.05, 0.0))
    s.joint("Torso_Lower", "Pelvis_Core", (0.0, 1.18, 0.0))
    s.joint("Torso_Upper", "Torso_Lower", (0.0, 1.58, 0.02))
    s.joint("Collar_Mantle", "Torso_Upper", (0.0, 1.98, 0.03))
    s.joint("Neck_Joint", "Collar_Mantle", (0.0, 2.04, 0.04))
    s.joint("Head_Helm", "Neck_Joint", (0.0, 2.22, 0.06))
    s.joint("Mask_Beak", "Head_Helm", (0.0, 2.26, 0.16))
    s.joint("Tricorne_Crown", "Head_Helm", (0.0, 2.42, 0.05))

    s.joint("Feather_Cape_L", "Collar_Mantle", (-0.28, 1.96, -0.14))
    s.joint("Feather_Cape_R", "Collar_Mantle", (0.28, 1.96, -0.14))
    s.joint("Feather_Cape_Center", "Collar_Mantle", (0.0, 1.94, -0.22))
    s.joint("Coat_Tail_L", "Pelvis_Core", (-0.22, 1.12, -0.06))
    s.joint("Coat_Tail_R", "Pelvis_Core", (0.22, 1.12, -0.06))

    s.joint("Shoulder_R", "Collar_Mantle", (-0.42, 1.88, 0.0))
    s.joint("UpperArm_R", "Shoulder_R", (-0.54, 1.72, 0.02))
    s.joint("Forearm_R", "UpperArm_R", (-0.64, 1.44, 0.12))
    s.joint("Hand_R", "Forearm_R", (-0.70, 1.24, 0.28))
    s.joint("Venom_Rapier", "Hand_R", (-0.70, 1.24, 0.30))

    s.joint("Shoulder_L", "Collar_Mantle", (0.42, 1.88, 0.0))
    s.joint("UpperArm_L", "Shoulder_L", (0.54, 1.72, 0.04))
    s.joint("Forearm_L", "UpperArm_L", (0.60, 1.46, 0.18))
    s.joint("Hand_L", "Forearm_L", (0.58, 1.32, 0.36))
    s.joint("Raven_Flintlock", "Hand_L", (0.58, 1.32, 0.38))

    s.joint("Hip_R", "Pelvis_Core", (-0.19, 1.02, -0.02))
    s.joint("Shin_R", "Hip_R", (-0.24, 0.56, -0.10))
    s.joint("Boot_R", "Shin_R", (-0.26, 0.14, -0.06))
    s.joint("Hip_L", "Pelvis_Core", (0.19, 1.02, 0.04))
    s.joint("Shin_L", "Hip_L", (0.22, 0.56, 0.14))
    s.joint("Boot_L", "Shin_L", (0.24, 0.14, 0.22))

    fx_scale = (1e-5, 1e-5, 1e-5)
    s.joint("Blade_Cross_FX", "Syndicate_Root", (0.0, 1.45, 0.85), rest_scale=fx_scale)
    s.joint("Muzzle_Blast_FX", "Syndicate_Root", (0.55, 1.38, 0.82), rest_scale=fx_scale)
    s.joint("Feather_Storm_FX", "Syndicate_Root", (0.0, 1.45, 0.15), rest_scale=fx_scale)
    s.joint("Execution_Shadow_FX", "Syndicate_Root", (0.0, 1.55, 0.72), rest_scale=fx_scale)

    # -----------------------------------------------------------------------
    # 3. SCULPTING
    # -----------------------------------------------------------------------
    _sculpt_legs(s, m_coat, m_iron, m_brass, m_cloth, m_silver)
    _sculpt_pelvis_coat(s, m_coat, m_cloth, m_feather, m_brass, m_iron, m_ocular)
    _sculpt_torso(s, m_coat, m_iron, m_silver, m_brass, m_cloth, m_venom, m_ocular)
    _sculpt_mantle(s, m_feather, m_iron, m_silver, m_brass, m_cloth)
    _sculpt_head(s, m_iron, m_silver, m_ocular, m_feather, m_brass, m_coat, m_cloth)
    _sculpt_right_arm(s, m_iron, m_feather, m_silver, m_brass, m_blade, m_venom, m_coat)
    _sculpt_left_arm(s, m_iron, m_feather, m_brass, m_silver, m_venom, m_coat)
    _sculpt_fx(s, m_fx, m_venom, m_ocular)

    # -----------------------------------------------------------------------
    # 4. ANIMATION CLIPS
    # -----------------------------------------------------------------------
    clips = _build_clips()

    # -----------------------------------------------------------------------
    # 5. EXPORT
    # -----------------------------------------------------------------------
    svg_theme = {
        "bg0": "#451c35",
        "bg1": "#1c172b",
        "bg2": "#090a12",
        "aura0": "#e11d48",
        "aura1": "#7e22ce",
        "rim": "#f43f5e",
        "rim_rgb": [1.45, 0.65, 0.90],
    }
    tris = s.export_glb(
        "bandit-syndicate-king.glb",
        "bandit-syndicate-king",
        clips,
        source_name="建模工具/build_bandit_syndicate_king.py",
        svg_theme=svg_theme,
    )
    print(f"[banditSyndicateKing] total triangles = {tris}")
    return s


# ---------------------------------------------------------------------------
# SCULPTING HELPERS
# ---------------------------------------------------------------------------
def _ring(center, rx, rz, segs=16, y_off=0.0, squash=1.0):
    cx, cy, cz = center
    pts = []
    for i in range(segs):
        a = (i / segs) * TAU
        pts.append(
            [
                cx + math.cos(a) * rx,
                cy + y_off,
                cz + math.sin(a) * rz * squash,
            ]
        )
    return pts


def _sculpt_legs(s, m_coat, m_iron, m_brass, m_cloth, m_silver):
    # ---- Right leg (back, planted) ----
    _leg(
        s,
        "Hip_R",
        "Shin_R",
        "Boot_R",
        side=-1.0,
        m_coat=m_coat,
        m_iron=m_iron,
        m_brass=m_brass,
        m_cloth=m_cloth,
        m_silver=m_silver,
    )
    # ---- Left leg (forward, duelist stride) ----
    _leg(
        s,
        "Hip_L",
        "Shin_L",
        "Boot_L",
        side=1.0,
        m_coat=m_coat,
        m_iron=m_iron,
        m_brass=m_brass,
        m_cloth=m_cloth,
        m_silver=m_silver,
    )


def _leg(s, hip, shin, boot, side, m_coat, m_iron, m_brass, m_cloth, m_silver):
    z_hip = 0.04 if side > 0 else -0.02
    z_knee = 0.14 if side > 0 else -0.10
    z_boot = 0.22 if side > 0 else -0.06

    # Thigh leather breeks (loft rings connecting Hip -> Shin continuously)
    hip_y = 1.02
    knee_y = 0.56
    rings = []
    for i in range(7):
        t = i / 6.0
        y = hip_y * (1.0 - t) + knee_y * t
        r = 0.135 * (1.0 - 0.28 * t) + 0.02 * math.sin(t * PI)
        cx = side * (0.19 + 0.05 * t)
        cz = z_hip * (1.0 - t) + z_knee * t
        rings.append(_ring((cx, y, cz), r, r * 0.92, segs=14))
    s.loft_rings(
        hip, m_coat, rings, lambda idx, v: lerp_hex(C_LEATHER, C_LEATHER_MID, (idx // 14) / 6.0)
    )

    # Flared highwayman thigh-high leather cuff
    cuff_z_top = z_hip * 0.65 + z_knee * 0.35
    cuff_z_mid = z_hip * 0.48 + z_knee * 0.52
    cuff_z_bot = z_hip * 0.30 + z_knee * 0.70
    cuff_pts = [
        [side * 0.20, 0.86, cuff_z_top],
        [side * 0.21, 0.78, cuff_z_mid],
        [side * 0.22, 0.70, cuff_z_bot],
    ]
    s.tube(
        hip,
        m_coat,
        cuff_pts,
        [0.155, 0.175, 0.165],
        (C_LEATHER_MID, C_LEATHER_LIGHT),
        segs=16,
        steps_per_seg=3,
        flute_amp=0.06,
        flute_freq=8,
    )
    # Horizontal crimson cuff trim ring
    s.torus(
        hip,
        m_cloth,
        (side * 0.205, 0.855, cuff_z_top),
        0.160,
        0.014,
        C_CRIMSON_BRIGHT,
        u_segs=18,
        v_segs=6,
    )
    # Brass buckle on front of cuff
    s.bevel_prism(
        hip,
        m_brass,
        [
            (-0.038, -0.038),
            (0.038, -0.038),
            (0.038, 0.038),
            (-0.038, 0.038),
        ],
        0.022,
        0.006,
        center=(side * 0.215, 0.78, cuff_z_mid + 0.16),
        color=C_BRASS_BRIGHT,
        rot=(PI * 0.5, 0.0, 0.0),
    )

    # Knee poleyn — raven-talon gunmetal plate with silver tip highlight
    knee_c = (side * 0.24, 0.56, z_knee + 0.06)
    s.scale_plate(
        shin,
        m_iron,
        knee_c,
        normal=(side * 0.3, 0.2, 1.0),
        tip_dir=(0.0, -1.0, 0.2),
        width=0.16,
        length=0.20,
        thickness=0.03,
        color=C_IRON_MID,
        tip_color=C_SILVER_DIM,
    )
    # Talon spikes on knee
    for k in range(3):
        ang = -0.5 + k * 0.5
        s.crystal_spire(
            shin,
            m_silver,
            (side * 0.24 + math.sin(ang) * 0.05, 0.52, z_knee + 0.11),
            (math.sin(ang) * 0.4, -0.6, 0.7),
            0.105,
            0.022,
            C_IRON_LIGHT,
            C_SILVER,
            sides=5,
            taper=0.5,
        )

    # Shin leather (connects knee -> boot continuously)
    shin_rings = []
    for i in range(5):
        t = i / 4.0
        y = 0.56 * (1.0 - t) + 0.14 * t
        r = 0.10 * (1.0 - 0.15 * t)
        cx = side * (0.24 + 0.02 * t)
        cz = z_knee * (1.0 - t) + z_boot * t
        shin_rings.append(_ring((cx, y, cz), r, r * 0.9, segs=12))
    s.loft_rings(shin, m_coat, shin_rings, C_LEATHER_MID)

    # Studded boot (planted continuously under ankle, pointing +Z)
    boot_rings = []
    for i in range(6):
        t = i / 5.0
        y = 0.15 * (1.0 - t) + 0.02 * t
        r = 0.11 * (1.0 - 0.08 * t)
        cx = side * (0.26 + 0.02 * t)
        cz = z_boot + 0.07 * t
        boot_rings.append(_ring((cx, y, cz), r, r * 1.15, segs=12))
    s.loft_rings(boot, m_coat, boot_rings, C_LEATHER)

    # Gunmetal iron toe-cap
    toe_c = (side * 0.28, 0.05, z_boot + 0.15)
    s.ellipsoid(
        boot,
        m_iron,
        toe_c,
        (0.10, 0.06, 0.13),
        C_IRON_LIGHT,
        u_segs=14,
        v_segs=8,
    )
    # Spur
    s.tube(
        boot,
        m_brass,
        [
            [side * 0.26, 0.06, z_boot - 0.06],
            [side * 0.26, 0.03, z_boot - 0.14],
        ],
        [0.012, 0.008],
        C_BRASS,
        segs=8,
        steps_per_seg=2,
    )
    # Vertical spur rowel in YZ plane
    s.torus(
        boot,
        m_brass,
        (side * 0.26, 0.03, z_boot - 0.14),
        0.032,
        0.009,
        C_BRASS_BRIGHT,
        u_segs=10,
        v_segs=6,
        rot=(0.0, 0.0, PI * 0.5),
    )


def _sculpt_pelvis_coat(s, m_coat, m_cloth, m_feather, m_brass, m_iron, m_ocular):
    # Pelvis core
    s.ellipsoid(
        "Pelvis_Core",
        m_coat,
        (0.0, 1.05, 0.0),
        (0.24, 0.16, 0.18),
        C_LEATHER,
        u_segs=18,
        v_segs=12,
    )

    # Horizontal crimson waist sash above syndicate belt
    s.torus(
        "Pelvis_Core",
        m_cloth,
        (0.0, 1.145, 0.0),
        0.242,
        0.024,
        C_CRIMSON_BRIGHT,
        u_segs=28,
        v_segs=8,
    )

    # Horizontal thick buckled syndicate belt
    s.torus(
        "Pelvis_Core",
        m_coat,
        (0.0, 1.10, 0.0),
        0.245,
        0.045,
        C_LEATHER_MID,
        u_segs=28,
        v_segs=10,
    )
    # Coin-medal brass buckle + glowing ruby core (clear of belt outer radius 0.29)
    s.bevel_prism(
        "Pelvis_Core",
        m_brass,
        [
            (-0.065, -0.065),
            (0.065, -0.065),
            (0.065, 0.065),
            (-0.065, 0.065),
        ],
        0.026,
        0.008,
        center=(0.0, 1.10, 0.282),
        color=C_BRASS_BRIGHT,
        rot=(PI * 0.5, 0.0, 0.0),
    )
    s.torus(
        "Pelvis_Core",
        m_brass,
        (0.0, 1.10, 0.296),
        0.046,
        0.012,
        C_BRASS,
        u_segs=16,
        v_segs=8,
        rot=(PI * 0.5, 0.0, 0.0),
    )
    s.ellipsoid(
        "Pelvis_Core",
        m_ocular,
        (0.0, 1.10, 0.308),
        (0.022, 0.022, 0.014),
        C_OCULAR,
        u_segs=10,
        v_segs=6,
    )

    # Dagger sheath (right hip)
    s.tube(
        "Pelvis_Core",
        m_coat,
        [
            [-0.20, 1.02, 0.10],
            [-0.24, 0.86, 0.06],
            [-0.26, 0.72, 0.02],
        ],
        [0.035, 0.030, 0.018],
        C_LEATHER_MID,
        segs=10,
        steps_per_seg=3,
    )
    # Sheath brass tip
    s.ellipsoid(
        "Pelvis_Core",
        m_brass,
        (-0.26, 0.71, 0.02),
        (0.022, 0.03, 0.022),
        C_BRASS_BRIGHT,
        u_segs=10,
        v_segs=6,
    )
    # Dagger pommel
    s.ellipsoid(
        "Pelvis_Core",
        m_brass,
        (-0.19, 1.06, 0.12),
        (0.026, 0.026, 0.026),
        C_BRASS_BRIGHT,
        u_segs=10,
        v_segs=6,
    )

    # Pouch (left hip)
    s.ellipsoid(
        "Pelvis_Core",
        m_coat,
        (0.22, 0.94, 0.10),
        (0.07, 0.09, 0.06),
        C_LEATHER_MID,
        u_segs=12,
        v_segs=8,
    )
    s.torus(
        "Pelvis_Core",
        m_brass,
        (0.22, 0.99, 0.10),
        0.05,
        0.010,
        C_BRASS_BRIGHT,
        u_segs=12,
        v_segs=6,
    )

    # ---- Coat tails (crimson velvet lining + ink-navy flaps + gold hem piping + feathers) ----
    for tail, side in (("Coat_Tail_L", 1.0), ("Coat_Tail_R", -1.0)):
        # Vivid crimson velvet lining membrane
        spine_a = [
            [side * 0.22, 1.12, -0.06],
            [side * 0.28, 0.90, -0.14],
            [side * 0.30, 0.66, -0.20],
            [side * 0.26, 0.44, -0.22],
        ]
        spine_b = [
            [side * 0.06, 1.10, -0.10],
            [side * 0.08, 0.88, -0.18],
            [side * 0.10, 0.64, -0.24],
            [side * 0.08, 0.42, -0.26],
        ]
        s.membrane(
            tail,
            m_cloth,
            spine_a,
            spine_b,
            C_CRIMSON_BRIGHT,
            C_CRIMSON,
            divs_u=10,
            divs_v=6,
            camber=0.055,
        )
        # Charcoal-navy leather outer flap
        flap_rings = []
        for i in range(5):
            t = i / 4.0
            y = 1.12 * (1.0 - t) + 0.40 * t
            w = 0.16 * (1.0 - 0.35 * t)
            cx = side * (0.22 + 0.05 * t)
            cz = -0.06 - 0.18 * t
            flap_rings.append(_ring((cx, y, cz), w, 0.03, segs=10))
        s.loft_rings(
            tail,
            m_coat,
            flap_rings,
            lambda idx, v: lerp_hex(C_OBSIDIAN, C_MIDNIGHT, (idx // 10) / 4.0),
        )
        # Burnished gold hem piping along outer coat tail
        s.tube(
            tail,
            m_brass,
            [
                [side * 0.37, 1.10, -0.07],
                [side * 0.39, 0.88, -0.15],
                [side * 0.38, 0.64, -0.21],
                [side * 0.34, 0.41, -0.24],
            ],
            [0.011, 0.012, 0.012, 0.010],
            C_BRASS_BRIGHT,
            segs=8,
            steps_per_seg=3,
        )

        # Trailing raven feathers on coat tail with crimson-bronze iridescence
        for k in range(5):
            ft = k / 4.0
            root = [side * (0.20 + 0.07 * ft), 0.72 - 0.30 * ft, -0.16 - 0.06 * ft]
            tip = [side * (0.26 + 0.11 * ft), 0.30 - 0.20 * ft, -0.28 - 0.10 * ft]
            s.feather(
                tail,
                m_feather,
                root,
                tip,
                (0.0, 0.0, -1.0),
                0.095,
                curve=0.06,
                color_root=C_OBSIDIAN,
                color_tip=C_BRONZE_TIP if k % 2 == 0 else C_ROSE_TIP,
            )


def _sculpt_torso(s, m_coat, m_iron, m_silver, m_brass, m_cloth, m_venom, m_ocular):
    # Fitted charcoal-indigo brigandine torso
    torso_rings = []
    for i in range(9):
        t = i / 8.0
        y = 1.18 + t * 0.80
        rx = 0.26 * (1.0 - 0.10 * t) + 0.04 * math.sin(t * PI)
        rz = 0.18 * (1.0 - 0.05 * t)
        torso_rings.append(_ring((0.0, y, 0.0), rx, rz, segs=18))
    s.loft_rings(
        "Torso_Lower",
        m_coat,
        torso_rings,
        lambda idx, v: lerp_hex(C_OBSIDIAN, C_INDIGO, (idx // 18) / 8.0),
    )

    # Sleek crimson velvet coat lapels framing torso front
    for side in (-1.0, 1.0):
        s.tube(
            "Torso_Upper",
            m_cloth,
            [
                [side * 0.16, 1.93, 0.12],
                [side * 0.13, 1.72, 0.155],
                [side * 0.10, 1.46, 0.165],
                [side * 0.09, 1.24, 0.170],
            ],
            [0.016, 0.015, 0.013, 0.011],
            (C_CRIMSON_BRIGHT, C_CRIMSON_DEEP),
            segs=8,
            steps_per_seg=3,
        )
        s.tube(
            "Torso_Upper",
            m_brass,
            [
                [side * 0.175, 1.93, 0.115],
                [side * 0.145, 1.72, 0.150],
                [side * 0.115, 1.46, 0.160],
            ],
            [0.006, 0.007, 0.005],
            C_BRASS_BRIGHT,
            segs=6,
            steps_per_seg=3,
        )

    # Crimson silk cravat under breastplate
    s.ellipsoid(
        "Torso_Upper",
        m_cloth,
        (0.0, 1.74, 0.15),
        (0.11, 0.09, 0.065),
        C_CRIMSON_BRIGHT,
        u_segs=14,
        v_segs=8,
    )
    s.tube(
        "Torso_Upper",
        m_cloth,
        [
            [0.0, 1.70, 0.17],
            [0.02, 1.60, 0.19],
            [-0.02, 1.50, 0.17],
        ],
        [0.052, 0.042, 0.022],
        (C_CRIMSON_BRIGHT, C_CRIMSON),
        segs=10,
        steps_per_seg=3,
    )

    # Engraved gunmetal chestplate trim
    s.scale_plate(
        "Torso_Upper",
        m_iron,
        (0.0, 1.66, 0.16),
        normal=(0.0, 0.2, 1.0),
        tip_dir=(0.0, -1.0, 0.0),
        width=0.34,
        length=0.30,
        thickness=0.035,
        color=C_IRON_MID,
        tip_color=C_IRON_LIGHT,
    )
    # Silver filigree scrolls on chest
    for k in range(3):
        ang = -0.6 + k * 0.6
        s.tube(
            "Torso_Upper",
            m_silver,
            [
                [math.sin(ang) * 0.10, 1.74, 0.20],
                [math.sin(ang) * 0.14, 1.66, 0.21],
                [math.sin(ang) * 0.10, 1.58, 0.20],
            ],
            [0.011, 0.013, 0.009],
            C_SILVER,
            segs=8,
            steps_per_seg=3,
        )

    # Syndicate chest crest emblem (gold diamond + glowing ruby gem) + draped gold chain
    s.bevel_prism(
        "Torso_Upper",
        m_brass,
        [(0.0, -0.055), (0.045, 0.0), (0.0, 0.055), (-0.045, 0.0)],
        0.024,
        0.007,
        center=(0.0, 1.72, 0.205),
        color=C_BRASS_BRIGHT,
        rot=(PI * 0.5, 0.0, 0.0),
    )
    s.ellipsoid(
        "Torso_Upper",
        m_ocular,
        (0.0, 1.72, 0.228),
        (0.022, 0.026, 0.015),
        C_OCULAR,
        u_segs=10,
        v_segs=6,
    )
    s.tube(
        "Torso_Upper",
        m_brass,
        [
            [-0.22, 1.90, 0.13],
            [-0.12, 1.82, 0.19],
            [0.0, 1.79, 0.21],
            [0.12, 1.82, 0.19],
            [0.22, 1.90, 0.13],
        ],
        [0.009, 0.010, 0.011, 0.010, 0.009],
        C_BRASS_BRIGHT,
        segs=8,
        steps_per_seg=3,
    )
    for side in (-1.0, 1.0):
        s.ellipsoid(
            "Torso_Upper",
            m_brass,
            (side * 0.22, 1.90, 0.13),
            (0.028, 0.028, 0.020),
            C_BRASS_BRIGHT,
            u_segs=10,
            v_segs=6,
        )

    # Diagonal leather bandolier across chest
    s.tube(
        "Torso_Upper",
        m_coat,
        [
            [-0.24, 1.86, 0.10],
            [-0.10, 1.70, 0.20],
            [0.06, 1.54, 0.20],
            [0.20, 1.38, 0.12],
        ],
        [0.036, 0.042, 0.042, 0.036],
        C_LEATHER_LIGHT,
        segs=10,
        steps_per_seg=4,
    )

    # 4 glowing emerald poison glass phials on bandolier
    phial_positions = [
        (-0.14, 1.76, 0.22),
        (-0.04, 1.66, 0.24),
        (0.06, 1.56, 0.24),
        (0.16, 1.46, 0.20),
    ]
    for px, py, pz in phial_positions:
        # Glass cylinder
        s.tube(
            "Torso_Upper",
            m_venom,
            [
                [px, py - 0.052, pz],
                [px, py + 0.052, pz],
            ],
            [0.026, 0.026],
            (C_VENOM_DEEP, C_VENOM),
            segs=10,
            steps_per_seg=2,
        )
        # Brass stopper
        s.ellipsoid(
            "Torso_Upper",
            m_brass,
            (px, py + 0.068, pz),
            (0.020, 0.020, 0.020),
            C_BRASS_BRIGHT,
            u_segs=8,
            v_segs=6,
        )
        # Horizontal brass collar around phial
        s.torus(
            "Torso_Upper",
            m_brass,
            (px, py + 0.048, pz),
            0.028,
            0.007,
            C_BRASS_BRIGHT,
            u_segs=10,
            v_segs=6,
        )


def _sculpt_mantle(s, m_feather, m_iron, m_silver, m_brass, m_cloth):
    # Fitted horizontal high collar mantle base
    s.torus(
        "Collar_Mantle",
        m_iron,
        (0.0, 1.98, 0.02),
        0.245,
        0.036,
        C_IRON_MID,
        u_segs=24,
        v_segs=10,
    )
    # Horizontal crimson velvet inner collar ring
    s.torus(
        "Collar_Mantle",
        m_cloth,
        (0.0, 2.012, 0.02),
        0.225,
        0.018,
        C_CRIMSON_BRIGHT,
        u_segs=24,
        v_segs=8,
    )
    # Horizontal silver filigree collar trim
    s.torus(
        "Collar_Mantle",
        m_silver,
        (0.0, 2.008, 0.02),
        0.252,
        0.015,
        C_SILVER,
        u_segs=24,
        v_segs=8,
    )
    # Upturned rear assassin high collar guard with gold piping
    collar_top = [
        [-0.22, 2.03, -0.02],
        [-0.17, 2.18, -0.16],
        [0.0, 2.21, -0.21],
        [0.17, 2.18, -0.16],
        [0.22, 2.03, -0.02],
    ]
    collar_bot = [
        [-0.23, 1.96, -0.02],
        [-0.19, 1.96, -0.17],
        [0.0, 1.96, -0.23],
        [0.19, 1.96, -0.17],
        [0.23, 1.96, -0.02],
    ]
    s.membrane(
        "Collar_Mantle",
        m_cloth,
        collar_top,
        collar_bot,
        C_CRIMSON_BRIGHT,
        C_CRIMSON,
        divs_u=14,
        divs_v=4,
        camber=0.02,
    )
    s.tube(
        "Collar_Mantle",
        m_brass,
        collar_top,
        0.012,
        C_BRASS_BRIGHT,
        segs=8,
        steps_per_seg=3,
    )

    # 3 tiers of overlapping sculpted plumes around collar (open at +Z front chest)
    for tier in range(3):
        tier_y = 1.94 + tier * 0.055
        tier_r = 0.255 + tier * 0.042
        count = 14 + tier * 2
        for k in range(count):
            ang = (k / count) * TAU
            # Skip front-facing feathers (+Z) to keep crimson cravat & syndicate emblem visible
            if math.sin(ang) > 0.52:
                continue
            root = [math.cos(ang) * tier_r * 0.7, tier_y, math.sin(ang) * tier_r * 0.7 + 0.02]
            tip = [
                math.cos(ang) * tier_r * 1.28,
                tier_y - 0.10 - tier * 0.02,
                math.sin(ang) * tier_r * 1.28 + 0.02,
            ]
            up = [math.cos(ang) * 0.3, 0.6, math.sin(ang) * 0.3]
            col_root = lerp_hex(C_OBSIDIAN, C_INDIGO, tier / 2.0)
            col_tip = lerp_hex(C_BRONZE_TIP, C_ROSE_TIP, tier / 2.0)
            s.feather(
                "Collar_Mantle",
                m_feather,
                root,
                tip,
                up,
                0.105,
                curve=0.05,
                color_root=col_root,
                color_tip=col_tip,
            )

    # Twin sweeping cape panels (Feather_Cape_L / R) with crimson lining & gold piping
    for cape, side in (("Feather_Cape_L", 1.0), ("Feather_Cape_R", -1.0)):
        # Vivid crimson velvet inner cape lining membrane (cleanly offset forward of feather plates)
        lining_outer = [
            [side * 0.28, 1.94, -0.06],
            [side * 0.39, 1.56, -0.14],
            [side * 0.45, 1.18, -0.22],
            [side * 0.48, 0.82, -0.28],
        ]
        lining_inner = [
            [side * 0.08, 1.93, -0.09],
            [side * 0.12, 1.55, -0.17],
            [side * 0.15, 1.16, -0.24],
            [side * 0.17, 0.80, -0.30],
        ]
        s.membrane(
            cape,
            m_cloth,
            lining_outer,
            lining_inner,
            C_CRIMSON_BRIGHT,
            C_CRIMSON,
            divs_u=10,
            divs_v=6,
            camber=0.015,
        )
        # Burnished gold piping along flared cape outer edge
        s.tube(
            cape,
            m_brass,
            [
                [side * 0.29, 1.94, -0.08],
                [side * 0.40, 1.56, -0.16],
                [side * 0.46, 1.18, -0.24],
                [side * 0.49, 0.82, -0.30],
            ],
            [0.012, 0.013, 0.013, 0.011],
            C_BRASS_BRIGHT,
            segs=8,
            steps_per_seg=3,
        )
        # Shingled plumage plates down the outer back of the cape (clear of inner lining)
        for row in range(6):
            rt = row / 5.0
            y = 1.96 - rt * 1.10
            x = side * (0.28 + rt * 0.14)
            z = -0.17 - rt * 0.20
            for col in range(3):
                ct = (col - 1) / 1.0
                px = x + ct * 0.10
                pz = z - 0.02 + abs(ct) * 0.01
                s.scale_plate(
                    cape,
                    m_feather,
                    (px, y, pz),
                    normal=(side * 0.3, 0.1, -1.0),
                    tip_dir=(0.0, -1.0, -0.2),
                    width=0.145,
                    length=0.205,
                    thickness=0.02,
                    color=lerp_hex(C_OBSIDIAN, C_INDIGO, rt),
                    tip_color=lerp_hex(
                        C_PLUM, C_BRONZE_TIP if col % 2 == 0 else C_ROSE_TIP, 0.35 + 0.65 * rt
                    ),
                )
        # Long trailing feathers
        for k in range(6):
            ft = k / 5.0
            root = [side * (0.28 + 0.12 * ft), 1.90 - 0.90 * ft, -0.19 - 0.18 * ft]
            tip = [side * (0.36 + 0.16 * ft), 0.90 - 0.50 * ft, -0.35 - 0.24 * ft]
            s.feather(
                cape,
                m_feather,
                root,
                tip,
                (0.0, 0.0, -1.0),
                0.115,
                curve=0.08,
                color_root=C_MIDNIGHT,
                color_tip=C_BRONZE_TIP if k % 2 == 0 else C_ROSE_TIP,
            )

    # Center cape panel
    for row in range(5):
        rt = row / 4.0
        y = 1.94 - rt * 1.00
        z = -0.22 - rt * 0.18
        s.scale_plate(
            "Feather_Cape_Center",
            m_feather,
            (0.0, y, z),
            normal=(0.0, 0.1, -1.0),
            tip_dir=(0.0, -1.0, -0.2),
            width=0.19,
            length=0.22,
            thickness=0.02,
            color=lerp_hex(C_OBSIDIAN, C_INDIGO, rt),
            tip_color=lerp_hex(C_PLUM, C_BRONZE_TIP, 0.35 + 0.65 * rt),
        )
    for k in range(4):
        ft = k / 3.0
        root = [(ft - 0.5) * 0.14, 1.90 - 0.80 * ft, -0.22 - 0.16 * ft]
        tip = [(ft - 0.5) * 0.20, 0.95 - 0.40 * ft, -0.36 - 0.20 * ft]
        s.feather(
            "Feather_Cape_Center",
            m_feather,
            root,
            tip,
            (0.0, 0.0, -1.0),
            0.105,
            curve=0.07,
            color_root=C_MIDNIGHT,
            color_tip=C_BRONZE_TIP if k % 2 == 0 else C_ROSE_TIP,
        )


def _sculpt_head(s, m_iron, m_silver, m_ocular, m_feather, m_brass, m_coat, m_cloth):
    # Neck
    s.tube(
        "Neck_Joint",
        m_coat,
        [
            [0.0, 2.00, 0.03],
            [0.0, 2.10, 0.05],
        ],
        [0.075, 0.070],
        C_LEATHER_MID,
        segs=12,
        steps_per_seg=2,
    )

    # Head helm base (gunmetal slate skull)
    s.ellipsoid(
        "Head_Helm",
        m_iron,
        (0.0, 2.24, 0.06),
        (0.135, 0.155, 0.145),
        C_IRON_MID,
        u_segs=20,
        v_segs=14,
    )

    # Plague-raven mask beak (bright pewter-silver loft rings for strong facial contrast)
    beak_rings = []
    for i in range(7):
        t = i / 6.0
        y = 2.26 - t * 0.10
        z = 0.16 + t * 0.22
        r = 0.075 * (1.0 - 0.85 * t)
        beak_rings.append(_ring((0.0, y, z), r, r * 0.85, segs=12))
    s.loft_rings(
        "Mask_Beak",
        m_silver,
        beak_rings,
        lambda idx, v: lerp_hex(C_SILVER_DIM, C_SILVER, (idx // 12) / 6.0),
    )
    # Sharp curved pewter-gold beak tip
    s.crystal_spire(
        "Mask_Beak",
        m_silver,
        (0.0, 2.16, 0.38),
        (0.0, -0.5, 1.0),
        0.105,
        0.021,
        C_SILVER_DIM,
        C_SILVER,
        sides=5,
        taper=0.4,
    )

    # Burnished gold nasal crest ridge on beak
    s.tube(
        "Mask_Beak",
        m_brass,
        [
            [0.0, 2.34, 0.14],
            [0.0, 2.28, 0.22],
            [0.0, 2.22, 0.31],
        ],
        [0.013, 0.015, 0.009],
        C_BRASS_BRIGHT,
        segs=8,
        steps_per_seg=3,
    )
    # Cheek silver-gold filigree scrolls
    for side in (-1.0, 1.0):
        s.tube(
            "Head_Helm",
            m_silver,
            [
                [side * 0.10, 2.28, 0.14],
                [side * 0.13, 2.22, 0.16],
                [side * 0.11, 2.16, 0.14],
            ],
            [0.011, 0.013, 0.009],
            C_SILVER,
            segs=8,
            steps_per_seg=3,
        )

    # Sunken fierce crimson-neon glowing ocular lenses with bright slit highlight
    for side in (-1.0, 1.0):
        s.ellipsoid(
            "Head_Helm",
            m_ocular,
            (side * 0.072, 2.285, 0.162),
            (0.032, 0.015, 0.020),
            C_OCULAR,
            u_segs=12,
            v_segs=8,
            rot=(0.0, 0.0, -side * 0.26),
        )
        s.ellipsoid(
            "Head_Helm",
            m_ocular,
            (side * 0.072, 2.286, 0.178),
            (0.014, 0.006, 0.009),
            "#ffd0de",
            u_segs=8,
            v_segs=6,
            rot=(0.0, 0.0, -side * 0.26),
        )
        # Gunmetal eye socket brow rim
        s.torus(
            "Head_Helm",
            m_iron,
            (side * 0.072, 2.285, 0.156),
            0.034,
            0.008,
            C_IRON_DARK,
            u_segs=12,
            v_segs=6,
            rot=(PI * 0.5, 0.0, 0.0),
        )

    # Tall swept metallic brow horns / feather-crests
    for side in (-1.0, 1.0):
        s.crystal_spire(
            "Head_Helm",
            m_silver,
            (side * 0.10, 2.36, 0.06),
            (side * 0.5, 0.8, -0.2),
            0.22,
            0.028,
            C_IRON_MID,
            C_SILVER,
            sides=6,
            taper=0.55,
        )
        # Crimson-tipped feather crest behind horns
        s.feather(
            "Head_Helm",
            m_feather,
            (side * 0.10, 2.34, 0.02),
            (side * 0.22, 2.52, -0.10),
            (0.0, 0.0, -1.0),
            0.085,
            curve=0.05,
            color_root=C_MIDNIGHT,
            color_tip=C_ROSE_TIP,
        )

    # ---- Syndicate Tricorne Crown-Hat ----
    # Three-lobed charcoal-indigo velvet brim
    brim_poly = []
    brim_rim_pts = []
    for i in range(36):
        a = (i / 36) * TAU
        lobe = 1.0 + 0.18 * math.cos(a * 3.0)
        rx = math.cos(a) * 0.24 * lobe
        rz = math.sin(a) * 0.24 * lobe
        if i < 24:
            a24 = (i / 24) * TAU
            l24 = 1.0 + 0.18 * math.cos(a24 * 3.0)
            brim_poly.append((math.cos(a24) * 0.24 * l24, math.sin(a24) * 0.24 * l24))
        brim_rim_pts.append([rx, 2.425, 0.05 + rz])
    brim_rim_pts.append(brim_rim_pts[0])
    s.bevel_prism(
        "Tricorne_Crown",
        m_coat,
        brim_poly,
        0.03,
        0.012,
        center=(0.0, 2.40, 0.05),
        color=C_OBSIDIAN,
        rot=(0.0, 0.0, 0.0),
    )
    # Exact 3-lobed burnished gold brim piping
    s.tube(
        "Tricorne_Crown",
        m_brass,
        brim_rim_pts,
        0.012,
        C_BRASS_BRIGHT,
        segs=8,
        steps_per_seg=1,
    )
    # Dome crown
    s.ellipsoid(
        "Tricorne_Crown",
        m_coat,
        (0.0, 2.46, 0.05),
        (0.16, 0.10, 0.16),
        C_MIDNIGHT,
        u_segs=18,
        v_segs=10,
    )
    # Horizontal crimson velvet hat ribbon + burnished gold hat band
    s.torus(
        "Tricorne_Crown",
        m_cloth,
        (0.0, 2.462, 0.05),
        0.156,
        0.013,
        C_CRIMSON_BRIGHT,
        u_segs=22,
        v_segs=6,
    )
    s.torus(
        "Tricorne_Crown",
        m_brass,
        (0.0, 2.438, 0.05),
        0.160,
        0.013,
        C_BRASS_BRIGHT,
        u_segs=22,
        v_segs=6,
    )
    # Front Syndicate Crown-Crest brooch on hat
    s.bevel_prism(
        "Tricorne_Crown",
        m_brass,
        [(0.0, -0.042), (0.032, 0.0), (0.0, 0.042), (-0.032, 0.0)],
        0.020,
        0.006,
        center=(0.0, 2.475, 0.202),
        color=C_BRASS_BRIGHT,
        rot=(PI * 0.5, 0.0, 0.0),
    )
    s.ellipsoid(
        "Tricorne_Crown",
        m_ocular,
        (0.0, 2.475, 0.218),
        (0.016, 0.020, 0.012),
        C_OCULAR,
        u_segs=10,
        v_segs=6,
    )
    # Lush sweeping crimson-and-gold side feather plume
    for k in range(5):
        ft = k / 4.0
        s.feather(
            "Tricorne_Crown",
            m_feather,
            (0.14 + 0.02 * ft, 2.46, 0.02 - 0.04 * ft),
            (0.32 + 0.07 * ft, 2.64 + 0.05 * ft, -0.10 - 0.06 * ft),
            (0.0, 0.0, -1.0),
            0.078,
            curve=0.06,
            color_root=C_INDIGO,
            color_tip=C_CRIMSON_BRIGHT if k % 2 == 0 else C_BRASS_BRIGHT,
        )


def _sculpt_right_arm(s, m_iron, m_feather, m_silver, m_brass, m_blade, m_venom, m_coat):
    # Layered raven-wing laminated pauldron
    for k in range(4):
        kt = k / 3.0
        s.scale_plate(
            "Shoulder_R",
            m_iron,
            (-0.42 - 0.02 * kt, 1.90 - 0.04 * kt, 0.0 - 0.02 * kt),
            normal=(-0.6, 0.3, 0.4),
            tip_dir=(-0.3, -1.0, 0.0),
            width=0.18 - 0.02 * kt,
            length=0.16,
            thickness=0.025,
            color=lerp_hex(C_IRON_MID, C_IRON_DARK, kt),
            tip_color=C_SILVER,
        )
    # Gold shoulder ridge crest
    s.torus(
        "Shoulder_R",
        m_brass,
        (-0.43, 1.90, 0.0),
        0.095,
        0.012,
        C_BRASS_BRIGHT,
        u_segs=14,
        v_segs=6,
        rot=(0.0, 0.0, 0.5),
        arc=PI * 1.1,
    )
    # Feather fringe on pauldron
    for k in range(4):
        ft = k / 3.0
        s.feather(
            "Shoulder_R",
            m_feather,
            (-0.44 - 0.02 * ft, 1.86 - 0.02 * ft, -0.04 - 0.02 * ft),
            (-0.52 - 0.04 * ft, 1.72 - 0.04 * ft, -0.14 - 0.04 * ft),
            (0.0, 0.0, -1.0),
            0.075,
            curve=0.05,
            color_root=C_MIDNIGHT,
            color_tip=C_ROSE_TIP if k % 2 == 0 else C_BRONZE_TIP,
        )

    # Upper arm (connected cleanly into shoulder pauldron)
    s.tube(
        "UpperArm_R",
        m_coat,
        [
            [-0.44, 1.84, 0.01],
            [-0.54, 1.72, 0.02],
            [-0.60, 1.58, 0.06],
            [-0.64, 1.44, 0.12],
        ],
        [0.072, 0.075, 0.070, 0.065],
        C_INDIGO,
        segs=12,
        steps_per_seg=3,
    )

    # Vambrace (forearm armor)
    s.tube(
        "Forearm_R",
        m_iron,
        [
            [-0.64, 1.44, 0.12],
            [-0.68, 1.34, 0.20],
            [-0.70, 1.24, 0.28],
        ],
        [0.070, 0.065, 0.055],
        (C_IRON_LIGHT, C_IRON_MID),
        segs=12,
        steps_per_seg=3,
        flute_amp=0.05,
        flute_freq=6,
    )
    # Silver vambrace trim aligned around forearm axis
    s.torus(
        "Forearm_R",
        m_silver,
        (-0.68, 1.34, 0.20),
        0.070,
        0.011,
        C_SILVER,
        u_segs=14,
        v_segs=6,
        rot=(0.85, 0.0, 0.22),
    )

    # Gloved hand
    s.ellipsoid(
        "Hand_R",
        m_coat,
        (-0.70, 1.24, 0.28),
        (0.055, 0.065, 0.055),
        C_LEATHER_MID,
        u_segs=12,
        v_segs=8,
    )
    # Fingers
    for k in range(4):
        ft = k / 3.0
        s.tube(
            "Hand_R",
            m_coat,
            [
                [-0.70 + (ft - 0.5) * 0.06, 1.22, 0.30],
                [-0.70 + (ft - 0.5) * 0.07, 1.18, 0.34],
            ],
            [0.014, 0.010],
            C_LEATHER_LIGHT,
            segs=6,
            steps_per_seg=2,
        )

    # ---- Poisoned Swept-Hilt Rapier ----
    # Blade (long 1.45-unit gleaming cold-steel blade_prism)
    s.blade_prism(
        "Venom_Rapier",
        m_blade,
        [
            [-0.70, 1.24, 0.30],
            [-0.70, 1.24, 0.60],
            [-0.70, 1.24, 1.00],
            [-0.70, 1.24, 1.45],
            [-0.70, 1.24, 1.75],
        ],
        [0.032, 0.030, 0.026, 0.020, 0.005],
        [0.013, 0.012, 0.010, 0.007, 0.002],
        C_STEEL_DIM,
        C_STEEL,
    )
    # Bright glowing neon-emerald venom fuller inlay + blade-tip venom glint
    s.tube(
        "Venom_Rapier",
        m_venom,
        [
            [-0.70, 1.24, 0.35],
            [-0.70, 1.24, 0.85],
            [-0.70, 1.24, 1.42],
        ],
        [0.011, 0.010, 0.006],
        (C_VENOM_DEEP, C_VENOM),
        segs=8,
        steps_per_seg=3,
    )
    s.ellipsoid(
        "Venom_Rapier",
        m_venom,
        (-0.70, 1.24, 1.68),
        (0.012, 0.012, 0.032),
        C_VENOM,
        u_segs=8,
        v_segs=6,
    )
    # Brass swept basket guard
    s.torus(
        "Venom_Rapier",
        m_brass,
        (-0.70, 1.24, 0.32),
        0.075,
        0.013,
        C_BRASS_BRIGHT,
        u_segs=20,
        v_segs=8,
        rot=(PI * 0.5, 0.0, 0.0),
    )
    # Swept guard arcs
    for k in range(3):
        ang = -0.5 + k * 0.5
        s.tube(
            "Venom_Rapier",
            m_brass,
            [
                [-0.70 + math.sin(ang) * 0.06, 1.24 + math.cos(ang) * 0.06, 0.32],
                [-0.70 + math.sin(ang) * 0.10, 1.24 + math.cos(ang) * 0.10, 0.38],
                [-0.70 + math.sin(ang) * 0.06, 1.24 + math.cos(ang) * 0.06, 0.44],
            ],
            [0.009, 0.011, 0.007],
            C_BRASS_BRIGHT,
            segs=6,
            steps_per_seg=3,
        )
    # Quillions
    s.tube(
        "Venom_Rapier",
        m_brass,
        [
            [-0.78, 1.24, 0.30],
            [-0.70, 1.24, 0.30],
            [-0.62, 1.24, 0.30],
        ],
        [0.009, 0.013, 0.009],
        C_BRASS_BRIGHT,
        segs=8,
        steps_per_seg=2,
    )
    # Pommel
    s.ellipsoid(
        "Venom_Rapier",
        m_brass,
        (-0.70, 1.24, 0.24),
        (0.023, 0.023, 0.023),
        C_BRASS_BRIGHT,
        u_segs=10,
        v_segs=6,
    )


def _sculpt_left_arm(s, m_iron, m_feather, m_brass, m_silver, m_venom, m_coat):
    # Asymmetric layered iron-and-feather pauldron
    for k in range(3):
        kt = k / 2.0
        s.scale_plate(
            "Shoulder_L",
            m_iron,
            (0.42 + 0.02 * kt, 1.90 - 0.04 * kt, 0.0 - 0.02 * kt),
            normal=(0.6, 0.3, 0.4),
            tip_dir=(0.3, -1.0, 0.0),
            width=0.16 - 0.02 * kt,
            length=0.15,
            thickness=0.025,
            color=lerp_hex(C_IRON_MID, C_IRON_DARK, kt),
            tip_color=C_SILVER,
        )
    # Gold shoulder ridge crest
    s.torus(
        "Shoulder_L",
        m_brass,
        (0.43, 1.90, 0.0),
        0.090,
        0.012,
        C_BRASS_BRIGHT,
        u_segs=14,
        v_segs=6,
        rot=(0.0, 0.0, -0.5),
        arc=PI * 1.1,
    )
    for k in range(3):
        ft = k / 2.0
        s.feather(
            "Shoulder_L",
            m_feather,
            (0.44 + 0.02 * ft, 1.86 - 0.02 * ft, -0.04 - 0.02 * ft),
            (0.52 + 0.04 * ft, 1.72 - 0.04 * ft, -0.14 - 0.04 * ft),
            (0.0, 0.0, -1.0),
            0.075,
            curve=0.05,
            color_root=C_MIDNIGHT,
            color_tip=C_ROSE_TIP if k % 2 == 0 else C_BRONZE_TIP,
        )

    # Upper arm (connected cleanly into shoulder pauldron)
    s.tube(
        "UpperArm_L",
        m_coat,
        [
            [0.44, 1.84, 0.01],
            [0.54, 1.72, 0.04],
            [0.58, 1.58, 0.10],
            [0.60, 1.46, 0.18],
        ],
        [0.072, 0.075, 0.070, 0.065],
        C_INDIGO,
        segs=12,
        steps_per_seg=3,
    )

    # Brass-riveted bracer
    s.tube(
        "Forearm_L",
        m_iron,
        [
            [0.60, 1.46, 0.18],
            [0.59, 1.38, 0.28],
            [0.58, 1.32, 0.36],
        ],
        [0.070, 0.065, 0.055],
        (C_IRON_LIGHT, C_IRON_MID),
        segs=12,
        steps_per_seg=3,
    )
    # Brass rivets
    for k in range(4):
        ang = (k / 4.0) * TAU
        s.ellipsoid(
            "Forearm_L",
            m_brass,
            (0.59 + math.cos(ang) * 0.065, 1.38, 0.28 + math.sin(ang) * 0.065),
            (0.011, 0.011, 0.011),
            C_BRASS_BRIGHT,
            u_segs=6,
            v_segs=4,
        )

    # Gloved hand
    s.ellipsoid(
        "Hand_L",
        m_coat,
        (0.58, 1.32, 0.36),
        (0.055, 0.065, 0.055),
        C_LEATHER_MID,
        u_segs=12,
        v_segs=8,
    )

    # ---- Twin-Barrel Alchemical Flintlock Hand-Cannon ----
    # Octagonal gunmetal receiver box
    s.bevel_prism(
        "Raven_Flintlock",
        m_iron,
        [
            (-0.04, -0.04),
            (0.04, -0.04),
            (0.04, 0.04),
            (-0.04, 0.04),
        ],
        0.10,
        0.012,
        center=(0.58, 1.32, 0.42),
        color=C_IRON_LIGHT,
        rot=(PI * 0.5, 0.0, 0.0),
    )
    # Twin flared brass cannon barrels
    for side in (-1.0, 1.0):
        s.tube(
            "Raven_Flintlock",
            m_brass,
            [
                [0.58 + side * 0.025, 1.32, 0.46],
                [0.58 + side * 0.030, 1.32, 0.60],
                [0.58 + side * 0.035, 1.32, 0.74],
            ],
            [0.022, 0.026, 0.032],
            (C_BRASS, C_BRASS_BRIGHT),
            segs=10,
            steps_per_seg=3,
            flute_amp=0.04,
            flute_freq=6,
        )
        # Muzzle ring
        s.torus(
            "Raven_Flintlock",
            m_brass,
            (0.58 + side * 0.035, 1.32, 0.74),
            0.032,
            0.008,
            C_BRASS_BRIGHT,
            u_segs=12,
            v_segs=6,
            rot=(PI * 0.5, 0.0, 0.0),
        )
        # Glowing emerald muzzle core vent
        s.ellipsoid(
            "Raven_Flintlock",
            m_venom,
            (0.58 + side * 0.035, 1.32, 0.745),
            (0.014, 0.014, 0.010),
            C_VENOM,
            u_segs=8,
            v_segs=6,
        )
    # Sculpted silver raven-beak hammer cock
    s.crystal_spire(
        "Raven_Flintlock",
        m_silver,
        (0.58, 1.36, 0.42),
        (0.0, 0.6, -0.4),
        0.085,
        0.018,
        C_SILVER_DIM,
        C_SILVER,
        sides=5,
        taper=0.5,
    )
    # Carved walnut curved grip
    s.tube(
        "Raven_Flintlock",
        m_coat,
        [
            [0.58, 1.30, 0.40],
            [0.58, 1.24, 0.34],
            [0.58, 1.18, 0.28],
        ],
        [0.030, 0.028, 0.022],
        (C_WOOD, C_WOOD_LIGHT),
        segs=10,
        steps_per_seg=3,
    )
    # Glowing emerald arcane pressure gauge tube
    s.tube(
        "Raven_Flintlock",
        m_venom,
        [
            [0.58, 1.36, 0.50],
            [0.58, 1.41, 0.56],
            [0.58, 1.38, 0.62],
        ],
        [0.013, 0.015, 0.010],
        (C_VENOM_DEEP, C_VENOM),
        segs=8,
        steps_per_seg=3,
    )
    # Gauge brass housing
    s.torus(
        "Raven_Flintlock",
        m_brass,
        (0.58, 1.41, 0.56),
        0.020,
        0.007,
        C_BRASS_BRIGHT,
        u_segs=10,
        v_segs=6,
        rot=(PI * 0.5, 0.0, 0.0),
    )


def _sculpt_fx(s, m_fx, m_venom, m_ocular):
    # ---- Blade_Cross_FX: two crossed arcing slash crescents ----
    for k in range(2):
        ang = k * PI * 0.5 + PI * 0.25
        spine_a = [
            [math.cos(ang) * 0.05, 1.45 + math.sin(ang) * 0.05, 0.85],
            [math.cos(ang) * 0.30, 1.45 + math.sin(ang) * 0.30, 0.85],
            [math.cos(ang) * 0.55, 1.45 + math.sin(ang) * 0.55, 0.85],
        ]
        spine_b = [
            [math.cos(ang) * 0.05, 1.45 + math.sin(ang) * 0.05, 0.85],
            [math.cos(ang) * 0.28, 1.45 + math.sin(ang) * 0.28, 0.85],
            [math.cos(ang) * 0.50, 1.45 + math.sin(ang) * 0.50, 0.85],
        ]
        s.membrane(
            "Blade_Cross_FX",
            m_fx,
            spine_a,
            spine_b,
            C_FX_CRIMSON,
            C_FX_EMERALD,
            divs_u=8,
            divs_v=4,
            camber=0.02,
        )
        s.blade_prism(
            "Blade_Cross_FX",
            m_fx,
            [
                [math.cos(ang) * 0.05, 1.45 + math.sin(ang) * 0.05, 0.85],
                [math.cos(ang) * 0.30, 1.45 + math.sin(ang) * 0.30, 0.85],
                [math.cos(ang) * 0.55, 1.45 + math.sin(ang) * 0.55, 0.85],
            ],
            [0.02, 0.04, 0.005],
            [0.008, 0.012, 0.002],
            C_FX_CRIMSON,
            C_FX_EMERALD,
        )

    # ---- Muzzle_Blast_FX: conical flash star + shockwave rings ----
    s.crystal_spire(
        "Muzzle_Blast_FX",
        m_fx,
        (0.55, 1.38, 0.82),
        (0.0, 0.0, 1.0),
        0.30,
        0.10,
        C_FX_CRIMSON,
        C_FX_VIOLET,
        sides=8,
        taper=0.3,
    )
    for k in range(3):
        s.torus(
            "Muzzle_Blast_FX",
            m_fx,
            (0.55, 1.38, 0.82 + 0.10 * k),
            0.08 + 0.06 * k,
            0.012,
            C_FX_VIOLET,
            u_segs=16,
            v_segs=6,
            rot=(PI * 0.5, 0.0, 0.0),
        )

    # ---- Feather_Storm_FX: ring of 12 whirling razor plumes + tornado arcs ----
    for k in range(12):
        ang = (k / 12.0) * TAU
        root = [math.cos(ang) * 0.20, 1.45, 0.15 + math.sin(ang) * 0.20]
        tip = [math.cos(ang) * 0.55, 1.45 + 0.10 * math.sin(ang * 2.0), 0.15 + math.sin(ang) * 0.55]
        s.feather(
            "Feather_Storm_FX",
            m_fx,
            root,
            tip,
            (0.0, 1.0, 0.0),
            0.06,
            curve=0.04,
            color_root=C_FX_CRIMSON,
            color_tip=C_FX_VIOLET,
        )
    for k in range(2):
        s.torus(
            "Feather_Storm_FX",
            m_fx,
            (0.0, 1.45 + 0.10 * k, 0.15),
            0.35 + 0.10 * k,
            0.015,
            C_FX_VIOLET,
            u_segs=20,
            v_segs=6,
            rot=(PI * 0.5, 0.0, 0.0),
        )

    # ---- Execution_Shadow_FX: giant crimson-violet X-mark scythe arcs ----
    for k in range(2):
        ang = k * PI * 0.5 + PI * 0.25
        spine_a = [
            [math.cos(ang) * 0.10, 1.55 + math.sin(ang) * 0.10, 0.72],
            [math.cos(ang) * 0.40, 1.55 + math.sin(ang) * 0.40, 0.72],
            [math.cos(ang) * 0.70, 1.55 + math.sin(ang) * 0.70, 0.72],
        ]
        spine_b = [
            [math.cos(ang) * 0.10, 1.55 + math.sin(ang) * 0.10, 0.72],
            [math.cos(ang) * 0.38, 1.55 + math.sin(ang) * 0.38, 0.72],
            [math.cos(ang) * 0.65, 1.55 + math.sin(ang) * 0.65, 0.72],
        ]
        s.membrane(
            "Execution_Shadow_FX",
            m_fx,
            spine_a,
            spine_b,
            C_FX_CRIMSON,
            C_FX_VIOLET,
            divs_u=10,
            divs_v=5,
            camber=0.03,
        )


# ---------------------------------------------------------------------------
# ANIMATION
# ---------------------------------------------------------------------------
def _build_clips():
    clips = {}

    # =======================================================================
    # Idle (3.8s)
    # =======================================================================
    dur = 3.8
    n = 40
    times = [dur * i / (n - 1) for i in range(n)]
    tracks = {}

    def add_rot(jname, fn):
        tracks.setdefault(jname, {})["rotation"] = [euler_xyz_to_quat(*fn(t)) for t in times]

    def add_trans(jname, fn):
        tracks.setdefault(jname, {})["translation"] = [fn(t) for t in times]

    def add_scale(jname, fn):
        tracks.setdefault(jname, {})["scale"] = [fn(t) for t in times]

    # Breathing sway
    add_rot("Torso_Lower", lambda t: (0.02 * math.sin(t * TAU / dur), 0.0, 0.0))
    add_rot("Torso_Upper", lambda t: (0.015 * math.sin(t * TAU / dur + 0.5), 0.0, 0.0))
    add_rot("Collar_Mantle", lambda t: (0.01 * math.sin(t * TAU / dur + 1.0), 0.0, 0.0))
    # Head scanning
    add_rot(
        "Head_Helm",
        lambda t: (0.03 * math.sin(t * TAU / dur * 0.5), 0.12 * math.sin(t * TAU / dur * 0.7), 0.0),
    )
    add_rot("Neck_Joint", lambda t: (0.0, 0.05 * math.sin(t * TAU / dur * 0.7), 0.0))
    # Cloak flutter
    add_rot(
        "Feather_Cape_L",
        lambda t: (0.04 * math.sin(t * TAU / dur * 1.3), 0.0, 0.03 * math.sin(t * TAU / dur * 1.1)),
    )
    add_rot(
        "Feather_Cape_R",
        lambda t: (
            0.04 * math.sin(t * TAU / dur * 1.3 + 0.4),
            0.0,
            -0.03 * math.sin(t * TAU / dur * 1.1 + 0.4),
        ),
    )
    add_rot(
        "Feather_Cape_Center",
        lambda t: (0.03 * math.sin(t * TAU / dur * 1.2 + 0.8), 0.0, 0.0),
    )
    add_rot(
        "Coat_Tail_L",
        lambda t: (0.03 * math.sin(t * TAU / dur * 1.4), 0.0, 0.02 * math.sin(t * TAU / dur * 1.2)),
    )
    add_rot(
        "Coat_Tail_R",
        lambda t: (
            0.03 * math.sin(t * TAU / dur * 1.4 + 0.5),
            0.0,
            -0.02 * math.sin(t * TAU / dur * 1.2 + 0.5),
        ),
    )
    # Rapier tip poise
    add_rot("Shoulder_R", lambda t: (0.02 * math.sin(t * TAU / dur * 0.8), 0.0, 0.0))
    add_rot("Forearm_R", lambda t: (0.03 * math.sin(t * TAU / dur * 0.9 + 0.3), 0.0, 0.0))
    add_rot("Venom_Rapier", lambda t: (0.02 * math.sin(t * TAU / dur * 1.0), 0.0, 0.0))
    # Left arm subtle
    add_rot("Shoulder_L", lambda t: (0.015 * math.sin(t * TAU / dur * 0.8 + 0.6), 0.0, 0.0))
    add_rot("Forearm_L", lambda t: (0.02 * math.sin(t * TAU / dur * 0.9 + 0.9), 0.0, 0.0))
    # Root subtle sway
    add_rot("Syndicate_Root", lambda t: (0.0, 0.02 * math.sin(t * TAU / dur * 0.5), 0.0))

    clips["Idle"] = (times, tracks)

    # =======================================================================
    # Normal_Attack (1.75s) — 乌羽双刺
    # =======================================================================
    dur = 1.75
    n = 36
    times = [dur * i / (n - 1) for i in range(n)]
    tracks = {}

    def add_rot(jname, fn):
        tracks.setdefault(jname, {})["rotation"] = [euler_xyz_to_quat(*fn(t)) for t in times]

    def add_trans(jname, fn):
        tracks.setdefault(jname, {})["translation"] = [fn(t) for t in times]

    def add_scale(jname, fn):
        tracks.setdefault(jname, {})["scale"] = [fn(t) for t in times]

    # Coiled step forward
    add_trans(
        "Syndicate_Root",
        lambda t: (0.0, 0.0, 0.15 * plateau(t, 0.0, 0.25, 0.55, 0.85)),
    )
    add_rot(
        "Syndicate_Root",
        lambda t: (0.0, 0.10 * plateau(t, 0.0, 0.25, 0.55, 0.85), 0.0),
    )
    # Torso twist
    add_rot(
        "Torso_Upper",
        lambda t: (0.0, -0.25 * plateau(t, 0.10, 0.30, 0.55, 0.80), 0.0),
    )
    add_rot(
        "Torso_Lower",
        lambda t: (0.0, -0.12 * plateau(t, 0.10, 0.30, 0.55, 0.80), 0.0),
    )
    # Right arm lunge
    add_rot(
        "Shoulder_R",
        lambda t: (
            -0.6 * plateau(t, 0.15, 0.35, 0.55, 0.75),
            0.3 * plateau(t, 0.15, 0.35, 0.55, 0.75),
            0.0,
        ),
    )
    add_rot(
        "UpperArm_R",
        lambda t: (-0.4 * plateau(t, 0.15, 0.35, 0.55, 0.75), 0.0, 0.0),
    )
    add_rot(
        "Forearm_R",
        lambda t: (-0.5 * plateau(t, 0.20, 0.38, 0.55, 0.72), 0.0, 0.0),
    )
    add_rot(
        "Venom_Rapier",
        lambda t: (-0.3 * plateau(t, 0.25, 0.40, 0.55, 0.70), 0.0, 0.0),
    )
    # Left arm counter
    add_rot(
        "Shoulder_L",
        lambda t: (0.2 * plateau(t, 0.15, 0.35, 0.55, 0.75), 0.0, 0.0),
    )
    # Blade_Cross_FX scales up during strike window t=0.35..0.68
    add_scale(
        "Blade_Cross_FX",
        lambda t: (
            1e-5 + 1.0 * bell_window(t, 0.35, 0.68),
            1e-5 + 1.0 * bell_window(t, 0.35, 0.68),
            1e-5 + 1.0 * bell_window(t, 0.35, 0.68),
        ),
    )
    add_rot(
        "Blade_Cross_FX",
        lambda t: (0.0, 0.0, 0.5 * bell_window(t, 0.35, 0.68)),
    )
    # Cloak flare
    add_rot(
        "Feather_Cape_L",
        lambda t: (0.15 * plateau(t, 0.10, 0.30, 0.60, 0.85), 0.0, 0.0),
    )
    add_rot(
        "Feather_Cape_R",
        lambda t: (0.15 * plateau(t, 0.10, 0.30, 0.60, 0.85), 0.0, 0.0),
    )

    clips["Normal_Attack"] = (times, tracks)

    # =======================================================================
    # Special_Attack (1.95s) — 黑鸦暗铳
    # =======================================================================
    dur = 1.95
    n = 40
    times = [dur * i / (n - 1) for i in range(n)]
    tracks = {}

    def add_rot(jname, fn):
        tracks.setdefault(jname, {})["rotation"] = [euler_xyz_to_quat(*fn(t)) for t in times]

    def add_trans(jname, fn):
        tracks.setdefault(jname, {})["translation"] = [fn(t) for t in times]

    def add_scale(jname, fn):
        tracks.setdefault(jname, {})["scale"] = [fn(t) for t in times]

    # Twist body sideways
    add_rot(
        "Syndicate_Root",
        lambda t: (0.0, -0.35 * plateau(t, 0.0, 0.30, 0.70, 0.95), 0.0),
    )
    add_rot(
        "Torso_Upper",
        lambda t: (0.0, -0.20 * plateau(t, 0.0, 0.30, 0.70, 0.95), 0.0),
    )
    # Aim left arm flintlock dead ahead
    add_rot(
        "Shoulder_L",
        lambda t: (
            -0.9 * plateau(t, 0.10, 0.35, 0.65, 0.90),
            0.4 * plateau(t, 0.10, 0.35, 0.65, 0.90),
            0.0,
        ),
    )
    add_rot(
        "UpperArm_L",
        lambda t: (-0.5 * plateau(t, 0.10, 0.35, 0.65, 0.90), 0.0, 0.0),
    )
    add_rot(
        "Forearm_L",
        lambda t: (-0.3 * plateau(t, 0.15, 0.38, 0.65, 0.88), 0.0, 0.0),
    )
    # Recoil at fire
    add_rot(
        "Shoulder_L",
        lambda t: (
            -0.9 * plateau(t, 0.10, 0.35, 0.65, 0.90) + 0.4 * bell_window(t, 0.45, 0.72),
            0.4 * plateau(t, 0.10, 0.35, 0.65, 0.90),
            0.0,
        ),
    )
    # Right arm braces
    add_rot(
        "Shoulder_R",
        lambda t: (0.3 * plateau(t, 0.10, 0.35, 0.65, 0.90), 0.0, 0.0),
    )
    # Muzzle_Blast_FX flash cone at t=0.45..0.72
    add_scale(
        "Muzzle_Blast_FX",
        lambda t: (
            1e-5 + 1.2 * bell_window(t, 0.45, 0.72),
            1e-5 + 1.2 * bell_window(t, 0.45, 0.72),
            1e-5 + 1.2 * bell_window(t, 0.45, 0.72),
        ),
    )
    add_rot(
        "Muzzle_Blast_FX",
        lambda t: (0.0, 0.0, 0.3 * bell_window(t, 0.45, 0.72)),
    )
    # Cloak reacts
    add_rot(
        "Feather_Cape_L",
        lambda t: (0.10 * plateau(t, 0.05, 0.30, 0.70, 0.95), 0.0, 0.0),
    )
    add_rot(
        "Feather_Cape_R",
        lambda t: (0.10 * plateau(t, 0.05, 0.30, 0.70, 0.95), 0.0, 0.0),
    )

    clips["Special_Attack"] = (times, tracks)

    # =======================================================================
    # Special_Action (2.2s) — 夜枭连斩风暴
    # =======================================================================
    dur = 2.2
    n = 44
    times = [dur * i / (n - 1) for i in range(n)]
    tracks = {}

    def add_rot(jname, fn):
        tracks.setdefault(jname, {})["rotation"] = [euler_xyz_to_quat(*fn(t)) for t in times]

    def add_trans(jname, fn):
        tracks.setdefault(jname, {})["translation"] = [fn(t) for t in times]

    def add_scale(jname, fn):
        tracks.setdefault(jname, {})["scale"] = [fn(t) for t in times]

    # Leap up and spin full 360° in Y
    add_trans(
        "Syndicate_Root",
        lambda t: (0.0, 0.35 * bell_window(t, 0.10, 0.85), 0.0),
    )
    add_rot(
        "Syndicate_Root",
        lambda t: (0.0, TAU * smoothstep(0.15, 0.80, t), 0.0),
    )
    # Flare arms outward
    add_rot(
        "Shoulder_R",
        lambda t: (0.0, 0.0, -0.8 * plateau(t, 0.15, 0.35, 0.65, 0.85)),
    )
    add_rot(
        "Shoulder_L",
        lambda t: (0.0, 0.0, 0.8 * plateau(t, 0.15, 0.35, 0.65, 0.85)),
    )
    add_rot(
        "UpperArm_R",
        lambda t: (0.0, 0.0, -0.4 * plateau(t, 0.15, 0.35, 0.65, 0.85)),
    )
    add_rot(
        "UpperArm_L",
        lambda t: (0.0, 0.0, 0.4 * plateau(t, 0.15, 0.35, 0.65, 0.85)),
    )
    # Cape flares outward
    add_rot(
        "Feather_Cape_L",
        lambda t: (0.0, 0.0, 0.5 * plateau(t, 0.15, 0.35, 0.65, 0.85)),
    )
    add_rot(
        "Feather_Cape_R",
        lambda t: (0.0, 0.0, -0.5 * plateau(t, 0.15, 0.35, 0.65, 0.85)),
    )
    add_rot(
        "Feather_Cape_Center",
        lambda t: (0.3 * plateau(t, 0.15, 0.35, 0.65, 0.85), 0.0, 0.0),
    )
    # Feather_Storm_FX blossoms around t=0.30..0.78
    add_scale(
        "Feather_Storm_FX",
        lambda t: (
            1e-5 + 1.3 * bell_window(t, 0.30, 0.78),
            1e-5 + 1.3 * bell_window(t, 0.30, 0.78),
            1e-5 + 1.3 * bell_window(t, 0.30, 0.78),
        ),
    )
    add_rot(
        "Feather_Storm_FX",
        lambda t: (0.0, TAU * smoothstep(0.30, 0.78, t), 0.0),
    )

    clips["Special_Action"] = (times, tracks)

    # =======================================================================
    # Talon_Rend (2.05s) — 处决匕影
    # =======================================================================
    dur = 2.05
    n = 42
    times = [dur * i / (n - 1) for i in range(n)]
    tracks = {}

    def add_rot(jname, fn):
        tracks.setdefault(jname, {})["rotation"] = [euler_xyz_to_quat(*fn(t)) for t in times]

    def add_trans(jname, fn):
        tracks.setdefault(jname, {})["translation"] = [fn(t) for t in times]

    def add_scale(jname, fn):
        tracks.setdefault(jname, {})["scale"] = [fn(t) for t in times]

    # Crouch low like a raven
    add_trans(
        "Syndicate_Root",
        lambda t: (
            0.0,
            -0.25 * plateau(t, 0.0, 0.25, 0.55, 0.80) + 0.30 * bell_window(t, 0.55, 0.90),
            0.10 * plateau(t, 0.0, 0.25, 0.55, 0.80),
        ),
    )
    add_rot(
        "Torso_Lower",
        lambda t: (0.35 * plateau(t, 0.0, 0.25, 0.55, 0.80), 0.0, 0.0),
    )
    add_rot(
        "Torso_Upper",
        lambda t: (0.25 * plateau(t, 0.0, 0.25, 0.55, 0.80), 0.0, 0.0),
    )
    # Spring up and plunge both weapons downward in X-strike
    add_rot(
        "Shoulder_R",
        lambda t: (
            -0.8 * plateau(t, 0.30, 0.50, 0.70, 0.90),
            0.0,
            -0.3 * plateau(t, 0.30, 0.50, 0.70, 0.90),
        ),
    )
    add_rot(
        "Shoulder_L",
        lambda t: (
            -0.8 * plateau(t, 0.30, 0.50, 0.70, 0.90),
            0.0,
            0.3 * plateau(t, 0.30, 0.50, 0.70, 0.90),
        ),
    )
    add_rot(
        "Forearm_R",
        lambda t: (-0.6 * plateau(t, 0.35, 0.52, 0.70, 0.88), 0.0, 0.0),
    )
    add_rot(
        "Forearm_L",
        lambda t: (-0.6 * plateau(t, 0.35, 0.52, 0.70, 0.88), 0.0, 0.0),
    )
    add_rot(
        "Venom_Rapier",
        lambda t: (-0.4 * plateau(t, 0.38, 0.55, 0.70, 0.86), 0.0, 0.0),
    )
    # Execution_Shadow_FX flares around t=0.42..0.74
    add_scale(
        "Execution_Shadow_FX",
        lambda t: (
            1e-5 + 1.4 * bell_window(t, 0.42, 0.74),
            1e-5 + 1.4 * bell_window(t, 0.42, 0.74),
            1e-5 + 1.4 * bell_window(t, 0.42, 0.74),
        ),
    )
    add_rot(
        "Execution_Shadow_FX",
        lambda t: (0.0, 0.0, 0.4 * bell_window(t, 0.42, 0.74)),
    )
    # Cloak
    add_rot(
        "Feather_Cape_L",
        lambda t: (0.20 * plateau(t, 0.0, 0.25, 0.55, 0.80), 0.0, 0.0),
    )
    add_rot(
        "Feather_Cape_R",
        lambda t: (0.20 * plateau(t, 0.0, 0.25, 0.55, 0.80), 0.0, 0.0),
    )

    clips["Talon_Rend"] = (times, tracks)

    # =======================================================================
    # Charge_Up (1.85s)
    # =======================================================================
    dur = 1.85
    n = 38
    times = [dur * i / (n - 1) for i in range(n)]
    tracks = {}

    def add_rot(jname, fn):
        tracks.setdefault(jname, {})["rotation"] = [euler_xyz_to_quat(*fn(t)) for t in times]

    def add_trans(jname, fn):
        tracks.setdefault(jname, {})["translation"] = [fn(t) for t in times]

    def add_scale(jname, fn):
        tracks.setdefault(jname, {})["scale"] = [fn(t) for t in times]

    # Cross rapier and flintlock across chest
    add_rot(
        "Shoulder_R",
        lambda t: (
            -0.5 * plateau(t, 0.10, 0.40, 0.70, 0.95),
            0.0,
            0.6 * plateau(t, 0.10, 0.40, 0.70, 0.95),
        ),
    )
    add_rot(
        "Shoulder_L",
        lambda t: (
            -0.5 * plateau(t, 0.10, 0.40, 0.70, 0.95),
            0.0,
            -0.6 * plateau(t, 0.10, 0.40, 0.70, 0.95),
        ),
    )
    add_rot(
        "Forearm_R",
        lambda t: (-0.7 * plateau(t, 0.15, 0.42, 0.70, 0.92), 0.0, 0.0),
    )
    add_rot(
        "Forearm_L",
        lambda t: (-0.7 * plateau(t, 0.15, 0.42, 0.70, 0.92), 0.0, 0.0),
    )
    # Cloak wings flare sharply behind
    add_rot(
        "Feather_Cape_L",
        lambda t: (0.0, 0.0, 0.7 * plateau(t, 0.10, 0.40, 0.70, 0.95)),
    )
    add_rot(
        "Feather_Cape_R",
        lambda t: (0.0, 0.0, -0.7 * plateau(t, 0.10, 0.40, 0.70, 0.95)),
    )
    add_rot(
        "Feather_Cape_Center",
        lambda t: (0.4 * plateau(t, 0.10, 0.40, 0.70, 0.95), 0.0, 0.0),
    )
    # Torso leans back
    add_rot(
        "Torso_Upper",
        lambda t: (-0.15 * plateau(t, 0.10, 0.40, 0.70, 0.95), 0.0, 0.0),
    )
    # Head tilts up
    add_rot(
        "Head_Helm",
        lambda t: (-0.10 * plateau(t, 0.10, 0.40, 0.70, 0.95), 0.0, 0.0),
    )

    clips["Charge_Up"] = (times, tracks)

    # =======================================================================
    # Break_Stagger (1.55s)
    # =======================================================================
    dur = 1.55
    n = 34
    times = [dur * i / (n - 1) for i in range(n)]
    tracks = {}

    def add_rot(jname, fn):
        tracks.setdefault(jname, {})["rotation"] = [euler_xyz_to_quat(*fn(t)) for t in times]

    def add_trans(jname, fn):
        tracks.setdefault(jname, {})["translation"] = [fn(t) for t in times]

    def add_scale(jname, fn):
        tracks.setdefault(jname, {})["scale"] = [fn(t) for t in times]

    # Knocked backward
    add_trans(
        "Syndicate_Root",
        lambda t: (0.0, 0.0, -0.20 * bell_window(t, 0.0, 0.55)),
    )
    add_rot(
        "Syndicate_Root",
        lambda t: (-0.15 * bell_window(t, 0.0, 0.55), 0.0, 0.0),
    )
    # Tricorn & head snap up/side
    add_rot(
        "Head_Helm",
        lambda t: (
            -0.25 * bell_window(t, 0.0, 0.50),
            0.30 * bell_window(t, 0.0, 0.50),
            0.0,
        ),
    )
    add_rot(
        "Tricorne_Crown",
        lambda t: (
            -0.20 * bell_window(t, 0.0, 0.50),
            0.25 * bell_window(t, 0.0, 0.50),
            0.0,
        ),
    )
    # Limbs flail slightly
    add_rot(
        "Shoulder_R",
        lambda t: (0.30 * bell_window(t, 0.0, 0.55), 0.0, 0.20 * bell_window(t, 0.0, 0.55)),
    )
    add_rot(
        "Shoulder_L",
        lambda t: (0.30 * bell_window(t, 0.0, 0.55), 0.0, -0.20 * bell_window(t, 0.0, 0.55)),
    )
    add_rot(
        "Forearm_R",
        lambda t: (0.25 * bell_window(t, 0.05, 0.60), 0.0, 0.0),
    )
    add_rot(
        "Forearm_L",
        lambda t: (0.25 * bell_window(t, 0.05, 0.60), 0.0, 0.0),
    )
    # Torso recoil
    add_rot(
        "Torso_Upper",
        lambda t: (-0.20 * bell_window(t, 0.0, 0.55), 0.0, 0.0),
    )
    add_rot(
        "Torso_Lower",
        lambda t: (-0.10 * bell_window(t, 0.0, 0.55), 0.0, 0.0),
    )
    # Cloak flails
    add_rot(
        "Feather_Cape_L",
        lambda t: (0.25 * bell_window(t, 0.0, 0.60), 0.0, 0.15 * bell_window(t, 0.0, 0.60)),
    )
    add_rot(
        "Feather_Cape_R",
        lambda t: (0.25 * bell_window(t, 0.0, 0.60), 0.0, -0.15 * bell_window(t, 0.0, 0.60)),
    )

    clips["Break_Stagger"] = (times, tracks)

    return clips


if __name__ == "__main__":
    build()
