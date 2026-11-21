"""Build the 8 non-voxel high-detail sculpted Overlord & card-mounted boss models."""

import math
import numpy as np

from sculpt_mesh import SculptedModel


def circle_poly(r, sides=8, rx=1.0, rz=1.0):
    return [
        [math.cos(i / sides * math.tau) * r * rx, -math.sin(i / sides * math.tau) * r * rz]
        for i in range(sides)
    ]


def hex_chamfer_poly(hx, hz, cut=0.28):
    return [
        [-hx + cut, hz],
        [hx - cut, hz],
        [hx, hz - cut],
        [hx, -hz + cut],
        [hx - cut, -hz],
        [-hx + cut, -hz],
        [-hx, -hz + cut],
        [-hx, hz - cut],
    ]


def apep_rotation(x=0, y=0, z=0):
    """XYZ rotations authored in radians, stored as glTF quaternions."""
    cx, cy, cz = (math.cos(a / 2) for a in (x, y, z))
    sx, sy, sz = (math.sin(a / 2) for a in (x, y, z))
    return [
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    ]


def apep_clips():
    # Body pitch, head pitch, jaw, left and right snake flare, eclipse roll, eye tilt.
    rest = (0, 0, 0, 0, 0, 0, 0)
    poses = {
        "Idle": (
            3.8,
            (0.03, -0.05, 0.025, 0.08, -0.04, 0.065, 0.06),
            (-0.02, 0.03, 0.04, -0.07, 0.09, -0.05, -0.04),
            (-0.035, 0.02, 0.025, -0.045, 0.035, -0.035, 0.03),
        ),
        "Apep_Entrance": (
            2.3,
            (0.23, 0.26, 0.03, -0.27, -0.27, -0.18, 0.52),
            (-0.25, -0.26, 0.47, 0.38, 0.43, 0.32, 0),
            (-0.13, -0.13, 0.18, 0.18, 0.22, 0.15, 0),
        ),
        "Apep_Splash": (
            1.68,
            (-0.14, -0.26, 0.11, -0.34, -0.12, -0.11, -0.05),
            (0.23, 0.34, 0.41, 0.52, 0.19, 0.14, 0.11),
            (0.12, 0.17, 0.15, 0.28, 0.11, 0.08, 0),
        ),
        "Apep_Plague": (
            2.23,
            (-0.22, -0.24, 0.15, -0.23, -0.21, -0.24, 0.48),
            (0.23, 0.12, 0.52, 0.55, 0.59, 0.45, 0),
            (0.11, 0.08, 0.30, 0.37, 0.43, 0.28, 0),
        ),
        "Apep_Shell": (
            1.82,
            (0.13, 0.32, 0.03, -0.29, -0.47, -0.2, 0.63),
            (0.18, 0.19, 0.12, -0.15, 0.49, 0.22, 0.36),
            (0.09, 0.12, 0.08, -0.08, 0.25, 0.11, 0.18),
        ),
        "Apep_Tide": (
            2.2,
            (-0.24, -0.35, 0.14, -0.26, -0.25, -0.4, 0.33),
            (0.29, 0.34, 0.64, 0.69, 0.68, 0.51, 0),
            (0.16, 0.16, 0.32, 0.42, 0.48, 0.28, -0.07),
        ),
        "Apep_Gaze": (
            1.86,
            (-0.19, 0.22, 0.02, 0.15, 0.21, -0.21, 0.72),
            (0.07, -0.29, 0.20, -0.16, -0.1, 0.05, -0.07),
            (0.04, -0.15, 0.12, -0.08, -0.02, 0.02, 0),
        ),
        "Apep_Eclipse": (
            2.5,
            (0.21, 0.23, 0.18, -0.37, -0.34, -0.43, 0.72),
            (-0.27, -0.29, 0.66, 0.63, 0.61, 0.67, 0),
            (-0.12, -0.14, 0.34, 0.32, 0.33, 0.36, 0),
        ),
        "Break_Stagger": (
            1.46,
            (-0.24, -0.23, 0.46, 0.34, -0.3, -0.38, 0.62),
            (0.29, 0.25, 0.09, -0.42, -0.34, 0.24, 0.55),
            (0.21, 0.13, 0.04, -0.15, -0.18, 0.14, 0.26),
        ),
    }
    clips = {}
    for name, (duration, brace, release, recoil) in poses.items():
        frames = (rest, brace, release, recoil, rest)
        times = [duration * t for t in (0, 0.23, 0.43, 0.66, 1)]
        clips[name] = (
            times,
            {
                "Apep_Body": [apep_rotation(x=p[0], z=p[3] * 0.09) for p in frames],
                "Apep_Head": [apep_rotation(x=p[1], y=(p[3] - p[4]) * 0.38) for p in frames],
                "Apep_Jaw": [apep_rotation(x=p[2]) for p in frames],
                "Apep_Left_Serpent": [
                    apep_rotation(x=p[3] * 0.5, y=-p[3] * 0.32, z=p[3]) for p in frames
                ],
                "Apep_Right_Serpent": [
                    apep_rotation(x=p[4] * 0.5, y=p[4] * 0.35, z=-p[4]) for p in frames
                ],
                "Apep_Eclipse_Rig": [apep_rotation(y=p[5] * 0.3, z=p[5]) for p in frames],
                "Apep_Sternum_Eye": [apep_rotation(x=p[6]) for p in frames],
            },
        )
    return clips


def build_apep_lamb():
    m = SculptedModel("apepLamb", "阿佩普的羔羊", tier="overlord")
    flesh = m.part("Charred_Hide", metallic=0.12, roughness=0.61)
    mantle = m.part("Cinder_Mantle", metallic=0.15, roughness=0.76, double_sided=True)
    skull = m.part("Fractured_Ovine_Mask", metallic=0.08, roughness=0.54)
    sockets = m.part("Recessed_Skull_Sockets", metallic=0.12, roughness=0.52)
    horn = m.part("Fluted_Obsidian_Horns", metallic=0.58, roughness=0.38)
    jaw = m.part("Hinged_Jaw", metallic=0.1, roughness=0.52)
    ribs = m.part("Reliquary_Ribs", metallic=0.72, roughness=0.42)
    eye = m.part("Sternum_Eye", metallic=0.12, roughness=0.25, emissive=[0.49, 0.023, 0.074])
    pupil = m.part("Sternum_Slit", metallic=0.15, roughness=0.34)
    glints = m.part("Skull_Fire", emissive=[0.66, 0.071, 0.12])
    crown = m.part("Broken_Eclipse", metallic=0.62, roughness=0.38, emissive=[0.13, 0.03, 0.045])

    m.lathe(
        flesh,
        [(0.04, 1.27), (0.54, 1.17), (1.58, 0.67), (2.37, 0.71), (3.29, 1.10), (3.62, 0.58)],
        segs=36,
        color="#312430",
        sx=1.14,
        sz=0.76,
        flute_amp=0.13,
        flute_freq=7,
    )
    for sx in (-1, 1):
        m.ellipsoid(flesh, (sx * 0.56, 0.14, 0.64), (0.32, 0.17, 0.51), color="#211820")
        m.tube(
            mantle,
            [
                [sx * 0.8, 3.02, 0.03],
                [sx * 1.13, 2.59, -0.16],
                [sx * 1.31, 1.48, -0.29],
                [sx * 1.57, 0.37, 0.22],
            ],
            [0.31, 0.27, 0.15, 0.015],
            color="#372c38",
        )
        for strip in range(5):
            u = strip / 4
            m.wing_membrane(
                mantle,
                [
                    [sx * (0.43 + u * 0.64), 3.38 - u * 0.13, 0.28 - u * 0.37],
                    [sx * (0.69 + u * 0.57), 2.42, 0.46 - u * 0.54],
                    [sx * (0.56 + u * 1.08), 0.27 + (strip % 3) * 0.14, 0.76 - u * 0.80],
                ],
                [
                    [sx * (0.58 + u * 0.62), 3.38 - u * 0.19, 0.19 - u * 0.37],
                    [sx * (0.85 + u * 0.48), 2.39, 0.43 - u * 0.51],
                    [sx * (0.79 + u * 0.91), 0.42, 0.52 - u * 0.63],
                ],
                divs_u=10,
                divs_v=4,
                camber=0.09,
                color=("#241d29", "#493344", "#322634")[strip % 3],
            )
        for i in range(6):
            y = 2.18 + i * 0.2
            reach = 0.68 - abs(i - 3) * 0.036
            m.tube(
                ribs,
                [
                    [sx * 0.93, y + 0.28, 0.17],
                    [sx * reach, y + 0.15, 0.57],
                    [sx * 0.41, y, 0.77],
                    [sx * 0.28, y - 0.08, 0.82],
                ],
                [0.10, 0.083, 0.061, 0.019],
                segs=9,
                color="#886459" if i % 2 else "#ab866b",
            )
        m.ellipsoid(
            mantle,
            (sx * 0.82, 3.23, -0.12),
            (0.63, 0.43, 0.62),
            color="#34252e",
            bump_fn=lambda th, ph: 0.17 * math.sin(6 * th) * math.sin(5 * ph),
        )
    m.ellipsoid(pupil, (0, 2.60, 0.67), (0.46, 0.59, 0.27), color="#150d19")
    m.ellipsoid(eye, (0, 2.6, 0.86), (0.34, 0.46, 0.19), color="#e22750")
    m.ellipsoid(pupil, (0, 2.6, 1.02), (0.07, 0.33, 0.055), color="#190a17")
    m.ellipsoid(eye, (-0.13, 2.78, 1.035), (0.055, 0.08, 0.025), color="#ffd6bb")

    m.ellipsoid(
        skull,
        (0, 4.01, 0.35),
        (0.62, 0.55, 0.65),
        u_segs=26,
        v_segs=16,
        color="#cfc1b5",
        bump_fn=lambda th, ph: 0.06 * math.sin(th * 7) * math.sin(ph * 7),
    )
    m.ellipsoid(skull, (0, 3.65, 0.88), (0.29, 0.26, 0.49), color="#d7c5ad", rot=(0.32, 0, 0))
    m.ellipsoid(jaw, (0, 3.49, 0.8), (0.28, 0.12, 0.43), color="#8e756b")
    for sx in (-1, 1):
        m.ellipsoid(
            sockets,
            (sx * 0.29, 4.04, 0.866),
            (0.22, 0.125, 0.10),
            color="#231521",
            rot=(0, sx * 0.25, -sx * 0.26),
        )
        m.ellipsoid(
            glints,
            (sx * 0.27, 4.048, 0.95),
            (0.082, 0.033, 0.036),
            color="#ff556b",
            rot=(0, 0, -sx * 0.25),
        )
        m.tube(
            skull,
            [[sx * 0.53, 4.12, 0.71], [sx * 0.38, 4.20, 0.91], [sx * 0.14, 4.09, 0.95]],
            [0.065, 0.095, 0.047],
            color="#e2cdb9",
        )
        m.tube(
            sockets,
            [
                [sx * 0.39, 4.48, 0.53],
                [sx * 0.21, 4.38, 0.78],
                [sx * 0.27, 4.21, 0.92],
                [sx * 0.19, 4.09, 0.93],
            ],
            [0.013, 0.018, 0.018, 0.013],
            segs=5,
            color="#382835",
        )
        for tooth in range(4):
            z = 1.20 - tooth * 0.11
            x = sx * (0.15 + tooth * 0.023)
            m.tube(
                jaw,
                [[x, 3.52, z], [x, 3.60 - tooth * 0.01, z + 0.022]],
                [0.047, 0.008],
                segs=7,
                color="#e7d7bb",
            )
        pts, radii = [], []
        for i in range(29):
            t = i / 28
            pitch = t * math.pi * (1.94 if sx > 0 else 1.67)
            pts.append(
                [
                    sx * (0.51 + 0.78 * math.sin(t * 2.7) + t * 0.42),
                    4.20 + math.sin(pitch) * (0.72 - t * 0.25),
                    -0.06 + math.cos(pitch) * 0.46 + t * 0.48,
                ]
            )
            radii.append(0.30 * (1.0 - t * 0.94))
        m.tube(horn, pts, radii, segs=13, color="#796062", flute_amp=0.2, flute_freq=7)
        m.tube(horn, pts[-8:], [r * 0.98 for r in radii[-8:]], segs=12, color="#ae806b")

    serpents = []
    for sx, name, height in [(-1, "Left", 3.87), (1, "Right", 4.03)]:
        skin = m.part(f"{name}_Serpent_Scales", metallic=0.36, roughness=0.35)
        mouth = m.part(f"{name}_Serpent_Fangs", metallic=0.07, roughness=0.52)
        light = m.part(f"{name}_Serpent_Embers", emissive=[0.62, 0.06, 0.105])
        pivot = (sx * 0.76, 0.43, -0.40)
        pts = [
            [sx * 0.53, 0.37, -0.52],
            [sx * 1.14, 0.44, -0.81],
            [sx * 1.64, 1.24, -0.76],
            [sx * 1.44, 2.21, -0.91],
            [sx * 1.52, height - 0.91, -0.75],
            [sx * 1.99, height - 0.30, -0.28],
            [sx * 1.82, height, 0.36],
        ]
        m.tube(
            skin,
            pts,
            [0.31, 0.36, 0.27, 0.234, 0.255, 0.29, 0.24],
            segs=18,
            color="#492837",
            flute_amp=0.12,
            flute_freq=7,
        )
        for index, (x, y, z) in enumerate(pts[2:]):
            m.tube(
                skin,
                [[x, y, z - 0.15], [x + sx * 0.29, y + 0.25, z - 0.31]],
                [0.15, 0.018],
                segs=8,
                color="#7c535e" if index % 2 else "#624754",
            )
        x = sx * 1.79
        m.ellipsoid(skin, (x, height, 0.61), (0.29, 0.22, 0.49), color="#614152", rot=(-0.14, 0, 0))
        m.ellipsoid(
            skin, (x, height - 0.24, 0.72), (0.22, 0.075, 0.36), color="#3c2230", rot=(0.32, 0, 0)
        )
        for sign in (-1, 1):
            m.ellipsoid(
                light, (x + sign * 0.22, height + 0.04, 0.84), (0.075, 0.05, 0.09), color="#ff4b62"
            )
            m.tube(
                mouth,
                [[x + sign * 0.15, height - 0.06, 0.98], [x + sign * 0.14, height - 0.22, 1.025]],
                [0.042, 0.009],
                segs=8,
                color="#d9b9a4",
            )
        serpents.append(
            (f"Apep_{name}_Serpent", "Apep_Body", pivot, (skin.name, mouth.name, light.name))
        )

    for start, extent in ((-0.3, 1.29), (1.19, 1.48), (2.94, 1.19), (4.42, 1.19)):
        for r, w, color in [(1.52, 0.069, "#9c6d63"), (1.37, 0.032, "#d28a72")]:
            pts = [
                [math.cos(a) * r, 4.13 + math.sin(a) * r, -0.63]
                for a in np.linspace(start, start + extent, 20)
            ]
            m.tube(crown, pts, [w] * len(pts), segs=8, color=color)
    for a in (0.72, 1.46, 2.3, 3.28, 4.55, 5.30):
        dx, dy = math.cos(a), math.sin(a)
        m.tube(
            crown,
            [
                [dx * 1.4, 4.13 + dy * 1.4, -0.63],
                [dx * 1.70, 4.13 + dy * 1.70, -0.64],
                [dx * 1.86, 4.13 + dy * 1.86, -0.63],
            ],
            [0.10, 0.088, 0.012],
            segs=6,
            color="#c38672",
        )

    joints = [
        ("Apep_Body", None, (0, 0.18, 0.08), (flesh.name, mantle.name, ribs.name)),
        (
            "Apep_Head",
            "Apep_Body",
            (0, 3.61, 0.18),
            (skull.name, sockets.name, horn.name, glints.name),
        ),
        ("Apep_Jaw", "Apep_Head", (0, 3.58, 0.51), (jaw.name,)),
        ("Apep_Sternum_Eye", "Apep_Body", (0, 2.60, 0.72), (eye.name, pupil.name)),
        ("Apep_Eclipse_Rig", "Apep_Body", (0, 4.13, -0.63), (crown.name,)),
        *serpents,
    ]
    return m.finish(
        "apep-lamb.glb",
        portrait_slug="apep-lamb",
        bg_color="#421b28",
        joints=joints,
        clips=apep_clips(),
    )


def build_radiant_wyvern():
    m = SculptedModel("radiantWyvern", "辉光亚龙", tier="overlord")
    scales = m.part("Wyvern_Scales", metallic=0.22, roughness=0.42)
    armor = m.part("Radiant_Plating", metallic=0.58, roughness=0.3)
    gold = m.part("Solar_Gold_Crest", metallic=0.84, roughness=0.22, emissive=[0.24, 0.18, 0.05])
    wing_mem = m.part(
        "Luminous_Wing_Membrane",
        metallic=0.1,
        roughness=0.35,
        emissive=[0.18, 0.28, 0.34],
        double_sided=True,
    )
    core = m.part("Prism_Core", metallic=0.15, roughness=0.15, emissive=[0.42, 0.62, 0.7])
    talons = m.part("Solar_Talons_Halo", metallic=0.86, roughness=0.2, emissive=[0.26, 0.2, 0.06])

    # Sculpted muscular torso & proud chest core
    m.ellipsoid(scales, (0, 2.35, 0.05), (0.98, 1.35, 1.05), u_segs=28, v_segs=18, color="#e8eef2")
    m.lathe(
        armor,
        [(1.25, 0.55), (1.75, 0.88), (2.45, 0.96), (3.15, 0.72), (3.45, 0.52)],
        center=(0, 0, 0.18),
        segs=24,
        color="#d8c896",
        sx=0.92,
        sz=0.86,
        flute_amp=0.06,
        flute_freq=6,
    )
    m.ellipsoid(core, (0, 2.68, 0.96), (0.34, 0.48, 0.24), u_segs=18, v_segs=12, color="#9cf7ff")
    m.torus(
        gold,
        (0, 2.68, 0.94),
        0.44,
        0.06,
        u_segs=30,
        v_segs=8,
        color="#ffe28c",
        rot=(math.pi / 2, 0, 0),
    )

    # Hind legs & golden talons gripping the card
    for sx in (-1, 1):
        m.tube(
            scales,
            [
                [sx * 0.72, 1.85, -0.05],
                [sx * 0.92, 1.15, -0.35],
                [sx * 0.78, 0.55, 0.18],
                [sx * 0.74, 0.14, 0.32],
            ],
            [0.44, 0.3, 0.22, 0.2],
            segs=14,
            color="#cfdbe2",
        )
        for toe in (-0.18, 0, 0.18):
            m.tube(
                gold,
                [[sx * 0.74 + toe, 0.16, 0.36], [sx * 0.76 + toe * 1.4, 0.06, 0.82]],
                [0.09, 0.02],
                segs=8,
                color="#edd487",
            )

    # S-curved serpentine neck & regal horned dragon skull facing +Z
    neck_pts = [
        [0, 3.25, 0.08],
        [0, 3.85, -0.18],
        [0, 4.48, -0.08],
        [0, 4.98, 0.35],
        [0, 5.22, 0.72],
    ]
    m.tube(
        scales,
        neck_pts,
        [0.56, 0.48, 0.42, 0.36, 0.32],
        segs=18,
        color="#e6edf0",
        flute_amp=0.07,
        flute_freq=8,
    )
    m.ellipsoid(armor, (0, 5.24, 0.92), (0.48, 0.42, 0.65), u_segs=22, v_segs=16, color="#f0efe8")
    m.ellipsoid(armor, (0, 5.14, 1.56), (0.28, 0.24, 0.44), u_segs=18, v_segs=12, color="#e8d9a5")
    for sx in (-1, 1):
        m.ellipsoid(
            core, (sx * 0.3, 5.36, 1.24), (0.09, 0.08, 0.14), u_segs=12, v_segs=8, color="#8efbff"
        )
        # Twin swept dragon horns
        m.tube(
            gold,
            [[sx * 0.28, 5.52, 0.88], [sx * 0.65, 5.95, 0.35], [sx * 0.95, 6.45, -0.25]],
            [0.14, 0.09, 0.02],
            segs=10,
            color="#f0d173",
        )

    # Broad sweeping luminous dragon wings (framed tightly enough for card pedestal clarity)
    for sx in (-1, 1):
        arm = [
            [sx * 0.68, 3.12, -0.18],
            [sx * 1.65, 4.25, -0.32],
            [sx * 2.55, 5.25, -0.18],
            [sx * 3.12, 4.85, 0.08],
        ]
        lower = [
            [sx * 0.58, 2.35, -0.28],
            [sx * 1.45, 2.65, -0.42],
            [sx * 2.25, 3.05, -0.25],
            [sx * 2.85, 3.45, 0.02],
        ]
        m.tube(armor, arm, [0.16, 0.12, 0.09, 0.03], segs=10, color="#f2e6c2")
        m.wing_membrane(wing_mem, arm, lower, divs_u=16, divs_v=10, camber=0.18, color="#c8f4ff")
        # Articulated wing-finger struts
        for fi, end_pt in enumerate(([sx * 2.7, 3.1, -0.2], [sx * 2.15, 2.4, -0.35])):
            m.tube(gold, [arm[2], end_pt], [0.065, 0.02], segs=8, color="#ead080")

    # Sweeping whip tail coiling smoothly around base back & rising on side
    tail_pts = [
        [0, 1.42, -0.62],
        [-0.85, 0.82, -1.25],
        [-1.65, 0.42, -0.75],
        [-1.85, 0.55, 0.35],
        [-1.35, 1.35, 0.95],
        [-0.95, 2.35, 0.65],
    ]
    m.tube(scales, tail_pts, [0.45, 0.34, 0.25, 0.18, 0.12, 0.05], segs=14, color="#d8e3e8")
    m.bevel_plate(
        talons,
        circle_poly(0.24, 4),
        0.65,
        bevel=0.05,
        center=(-0.95, 2.65, 0.65),
        rot=(0.35, 0, -0.35),
        color="#ffe591",
    )

    # Floating solar halo ring above wyvern crest
    m.torus(
        talons,
        (0, 5.15, 0.12),
        1.42,
        0.055,
        u_segs=42,
        v_segs=8,
        color="#ffe58f",
        rot=(math.pi / 2 - 0.18, 0, 0),
    )

    return m.finish("radiant-wyvern.glb", portrait_slug="radiant-wyvern", bg_color="#1d3247")


def build_ares():
    m = SculptedModel("ares", "战斗机兵·阿瑞斯", tier="overlord")
    hull = m.part("Ares_Armor_Hull", metallic=0.72, roughness=0.34)
    trim = m.part("Gold_Trim", metallic=0.86, roughness=0.24)
    dark = m.part("Hydraulic_Frame", metallic=0.55, roughness=0.52)
    core = m.part("Arc_Reactor", metallic=0.1, roughness=0.18, emissive=[0.55, 0.22, 0.16])
    blade = m.part("Plasma_Blade", metallic=0.4, roughness=0.2, emissive=[0.3, 0.55, 0.62])
    shield = m.part("Rotary_Chain_Shield", metallic=0.78, roughness=0.28)

    # Heavy armored legs & greaves
    for sx in (-0.65, 0.65):
        m.bevel_plate(
            hull,
            hex_chamfer_poly(0.38, 0.65, 0.12),
            0.34,
            0.06,
            center=(sx, 0.17, 0.18),
            color="#566674",
        )
        m.tube(
            dark,
            [[sx, 0.3, 0], [sx * 1.06, 1.15, -0.18], [sx * 0.95, 1.95, 0.05]],
            [0.24, 0.2, 0.26],
            segs=14,
            color="#2f3742",
        )
        m.bevel_plate(
            hull,
            hex_chamfer_poly(0.32, 0.36, 0.1),
            1.15,
            0.06,
            center=(sx * 1.04, 1.05, 0.08),
            rot=(-0.12, 0, 0),
            color="#687a8c",
        )
        m.bevel_plate(
            trim, circle_poly(0.22, 6), 0.36, 0.04, center=(sx * 1.04, 1.52, 0.28), color="#d4b468"
        )

    # Sculpted waist & angular torso chassis with glowing reactor core
    m.lathe(
        dark, [(1.88, 0.52), (2.25, 0.44), (2.6, 0.64)], center=(0, 0, 0), segs=20, color="#2e3540"
    )
    m.bevel_plate(
        hull,
        hex_chamfer_poly(0.95, 0.68, 0.25),
        1.48,
        0.09,
        center=(0, 3.35, 0.04),
        color="#617385",
    )
    m.bevel_plate(
        hull,
        hex_chamfer_poly(0.75, 0.55, 0.2),
        0.85,
        0.08,
        center=(0, 3.45, 0.32),
        rot=(0.2, 0, 0),
        color="#788da1",
    )
    m.torus(
        trim,
        (0, 3.45, 0.64),
        0.34,
        0.065,
        u_segs=28,
        v_segs=10,
        color="#dfb965",
        rot=(math.pi / 2, 0, 0),
    )
    m.ellipsoid(core, (0, 3.45, 0.62), (0.26, 0.26, 0.16), u_segs=18, v_segs=12, color="#ff6f5e")

    # Armored V-crest mecha helm & crimson visor
    m.lathe(dark, [(4.05, 0.28), (4.35, 0.26)], center=(0, 0, 0.04), segs=16, color="#303845")
    m.bevel_plate(
        hull,
        hex_chamfer_poly(0.46, 0.48, 0.14),
        0.72,
        0.07,
        center=(0, 4.65, 0.06),
        color="#718599",
    )
    m.ellipsoid(core, (0, 4.64, 0.46), (0.34, 0.09, 0.1), u_segs=16, v_segs=10, color="#ff4a5f")
    for sx in (-1, 1):
        m.tube(
            trim,
            [[0, 4.92, 0.45], [sx * 0.48, 5.25, 0.25], [sx * 0.78, 5.58, 0.05]],
            [0.09, 0.07, 0.02],
            segs=8,
            color="#edd07b",
        )

    # Massive sloped shoulder pauldrons & thruster backpack
    for sx in (-1, 1):
        m.bevel_plate(
            hull,
            hex_chamfer_poly(0.62, 0.62, 0.18),
            0.78,
            0.08,
            center=(sx * 1.48, 3.95, 0.04),
            rot=(0, 0, sx * -0.28),
            color="#687c91",
        )
        m.bevel_plate(
            trim,
            hex_chamfer_poly(0.55, 0.5, 0.15),
            0.16,
            0.04,
            center=(sx * 1.56, 4.35, 0.04),
            rot=(0, 0, sx * -0.28),
            color="#dfc06b",
        )
        m.tube(
            dark,
            [[sx * 1.42, 3.65, 0.06], [sx * 1.52, 2.75, 0.35], [sx * 1.38, 2.15, 0.68]],
            [0.24, 0.2, 0.22],
            segs=12,
            color="#353f4d",
        )
        # Back jet thrusters
        m.lathe(
            hull,
            [(0, 0.24), (0.65, 0.36), (1.15, 0.28)],
            center=(sx * 0.58, 3.25, -0.82),
            segs=18,
            color="#485666",
        )
        m.ellipsoid(
            blade,
            (sx * 0.58, 3.15, -0.82),
            (0.18, 0.22, 0.18),
            u_segs=12,
            v_segs=8,
            color="#7ef5ff",
        )

    # Right arm (screen-left/viewer-right): heavy bevelled plasma greatsword
    m.bevel_plate(
        hull,
        hex_chamfer_poly(0.18, 0.42, 0.05),
        3.35,
        0.04,
        center=(1.42, 2.85, 1.05),
        rot=(0.45, 0.12, -0.15),
        color="#596978",
    )
    m.bevel_plate(
        blade,
        hex_chamfer_poly(0.11, 0.26, 0.03),
        3.15,
        0.025,
        center=(1.42, 2.85, 1.15),
        rot=(0.45, 0.12, -0.15),
        color="#92fbff",
    )
    # Left arm: rotary shield & chainsaw gauntlet
    m.torus(
        shield,
        (-1.42, 2.15, 0.78),
        0.72,
        0.1,
        u_segs=32,
        v_segs=10,
        color="#6d7f91",
        rot=(0, math.pi / 2, 0),
    )
    m.ellipsoid(
        shield, (-1.42, 2.15, 0.78), (0.18, 0.56, 0.56), u_segs=18, v_segs=12, color="#4d5c6b"
    )
    for i in range(12):
        a = (i / 12) * math.tau
        m.bevel_plate(
            shield,
            circle_poly(0.09, 4),
            0.14,
            0.02,
            center=(-1.42, 2.15 + math.sin(a) * 0.84, 0.78 + math.cos(a) * 0.84),
            color="#f0d27a",
        )

    return m.finish("ares.glb", portrait_slug="ares", bg_color="#1b2b3d")


def build_ares_cannon(side_slug, enemy_id, title, sx):
    m = SculptedModel(enemy_id, title, tier="overlord-part")
    hull = m.part("Drone_Armor", metallic=0.72, roughness=0.32)
    barrel = m.part("Rail_Barrels", metallic=0.82, roughness=0.25)
    trim = m.part("Copper_Trim", metallic=0.85, roughness=0.26)
    optic = m.part("Targeting_Optic", metallic=0.1, roughness=0.18, emissive=[0.55, 0.2, 0.15])
    hover = m.part("Levitation_Ring", metallic=0.15, roughness=0.2, emissive=[0.28, 0.58, 0.72])
    fins = m.part("Stabilizer_Fins", metallic=0.62, roughness=0.36, double_sided=True)

    # Magnetic hover ring at card top
    m.torus(hover, (0, 0.24, 0), 0.86, 0.065, u_segs=36, v_segs=10, color="#7bf2ff")
    m.torus(trim, (0, 0.58, 0), 0.62, 0.045, u_segs=28, v_segs=8, color="#dfc16e")
    m.lathe(
        hull, [(0.45, 0.22), (1.05, 0.42), (1.55, 0.34)], center=(0, 0, 0), segs=22, color="#4c5c6e"
    )

    # Main sculptural drone cowling
    m.ellipsoid(hull, (0, 1.92, -0.05), (0.88, 0.68, 0.95), u_segs=26, v_segs=18, color="#63768a")
    m.bevel_plate(
        hull,
        hex_chamfer_poly(0.74, 0.72, 0.22),
        0.48,
        0.07,
        center=(0, 2.55, -0.06),
        rot=(0.12, 0, sx * -0.08),
        color="#788ea3",
    )
    m.bevel_plate(
        trim,
        hex_chamfer_poly(0.68, 0.52, 0.16),
        0.22,
        0.04,
        center=(sx * 0.48, 1.95, 0.15),
        rot=(0, 0, math.pi / 2),
        color="#ddb968",
    )
    m.ellipsoid(optic, (0, 1.95, 0.84), (0.28, 0.28, 0.2), u_segs=18, v_segs=12, color="#ff596d")
    m.torus(
        trim,
        (0, 1.95, 0.86),
        0.34,
        0.055,
        u_segs=26,
        v_segs=8,
        color="#e6c873",
        rot=(math.pi / 2, 0, 0),
    )

    # Twin smooth lathe-turned railgun barrels protruding toward +Z
    for bz in (-0.42, 0.42):
        m.tube(barrel, [[bz, 1.72, 0.15], [bz, 1.75, 1.48]], [0.16, 0.14], segs=16, color="#8fa0b0")
        m.torus(
            trim,
            (bz, 1.75, 1.15),
            0.18,
            0.045,
            u_segs=20,
            v_segs=8,
            color="#e3c26e",
            rot=(math.pi / 2, 0, 0),
        )
        m.ellipsoid(hover, (bz, 1.75, 1.48), (0.1, 0.1, 0.1), u_segs=12, v_segs=8, color="#98fbff")

    # Swept stabilizer fins
    for fx in (-1, 1):
        m.wing_membrane(
            fins,
            [[fx * 0.65, 2.15, -0.2], [fx * 1.18, 2.85, -0.45]],
            [[fx * 0.62, 1.45, -0.35], [fx * 1.1, 1.75, -0.65]],
            divs_u=10,
            divs_v=6,
            camber=0.06,
            color="#556678",
        )

    return m.finish(f"{side_slug}.glb", portrait_slug=side_slug, bg_color="#1d2f3f")


def build_moon_eye():
    m = SculptedModel("moonEye", "月之魔眼", tier="overlord")
    bark = m.part("Ancient_Bark", metallic=0.08, roughness=0.78)
    buttress = m.part("Root_Buttress", metallic=0.1, roughness=0.72)
    brass = m.part("Astrolabe_Brass", metallic=0.82, roughness=0.28)
    iris = m.part("Lunar_Iris", metallic=0.45, roughness=0.25, emissive=[0.18, 0.45, 0.48])
    pupil = m.part("Ocular_Core", metallic=0.1, roughness=0.15, emissive=[0.55, 0.78, 0.88])
    vine = m.part("Biolum_Vines", metallic=0.12, roughness=0.42, emissive=[0.14, 0.35, 0.28])

    # Twisted ancient mother-trunk with cradling buttress roots
    m.lathe(
        bark,
        [(0.0, 1.55), (0.85, 1.18), (1.85, 1.05), (3.15, 1.12), (4.45, 0.92), (5.55, 0.62)],
        center=(0, 0, -0.18),
        segs=32,
        color="#43574e",
        flute_amp=0.11,
        flute_freq=7,
    )
    for k in range(6):
        a = (k / 6) * math.tau
        pts = [
            [math.cos(a) * 1.8, 0.05, math.sin(a) * 1.4 - 0.15],
            [math.cos(a) * 1.25, 0.75, math.sin(a) * 0.95 - 0.18],
            [math.cos(a + 0.3) * 0.85, 2.25, math.sin(a + 0.3) * 0.75 - 0.15],
            [math.cos(a + 0.6) * 0.95, 4.25, math.sin(a + 0.6) * 0.78 - 0.18],
        ]
        m.tube(buttress, pts, [0.34, 0.26, 0.18, 0.12], segs=12, color="#374840")

    # Giant embedded lunar metallic iris & glowing eye core
    m.torus(
        brass,
        (0, 2.78, 0.72),
        1.05,
        0.12,
        u_segs=40,
        v_segs=12,
        color="#bfa565",
        rot=(math.pi / 2, 0, 0),
    )
    m.torus(
        brass,
        (0, 2.78, 0.78),
        0.78,
        0.075,
        u_segs=32,
        v_segs=10,
        color="#7ebdb5",
        rot=(math.pi / 2, 0, 0),
    )
    m.ellipsoid(iris, (0, 2.78, 0.72), (0.82, 0.82, 0.36), u_segs=26, v_segs=18, color="#8ee2db")
    m.ellipsoid(pupil, (0, 2.78, 0.92), (0.36, 0.52, 0.28), u_segs=20, v_segs=14, color="#e6ffff")

    # Sweeping brass astrolabe crescent halo rings orbiting the upper trunk
    m.torus(
        brass,
        (0, 4.25, -0.05),
        1.68,
        0.07,
        u_segs=42,
        v_segs=10,
        color="#d8bc74",
        rot=(1.1, 0.25, 0.2),
    )
    m.torus(
        iris,
        (0, 4.25, -0.05),
        1.38,
        0.05,
        u_segs=34,
        v_segs=8,
        color="#8cf2ea",
        rot=(-0.9, -0.3, 0.1),
        arc=math.pi * 1.45,
    )

    # Coiling glowing sap vines weaving around trunk
    for s in (-1, 1):
        vpts = [
            [s * math.cos(t * 7.0) * 1.15, 0.2 + t * 5.2, math.sin(t * 7.0) * 1.05 - 0.1]
            for t in np.linspace(0, 1, 24)
        ]
        m.tube(vine, vpts, np.linspace(0.11, 0.05, 24), segs=10, color="#7ff2cf")

    return m.finish("moon-eye.glb", portrait_slug="moon-eye", bg_color="#1a3335")


def build_moon_crown():
    m = SculptedModel("moonCrown", "月蚀树冠", tier="overlord")
    trunk = m.part("Crown_Trunk", metallic=0.06, roughness=0.78)
    bough = m.part("Crown_Boughs", metallic=0.06, roughness=0.74)
    canopy = m.part("Lunar_Canopy", metallic=0.05, roughness=0.68)
    vital = m.part("Vitality_Pods", metallic=0.1, roughness=0.25, emissive=[0.22, 0.52, 0.44])
    plague = m.part("Plague_Pods", metallic=0.15, roughness=0.3, emissive=[0.46, 0.18, 0.48])
    bronze = m.part("Censer_Rings", metallic=0.82, roughness=0.28)

    # Arched twisted main trunk rising into broad umbrella boughs
    m.lathe(
        trunk,
        [(0, 1.15), (0.8, 0.85), (2.2, 0.65), (3.4, 0.58)],
        center=(0, 0, -0.15),
        segs=24,
        color="#3c4f46",
        flute_amp=0.1,
        flute_freq=6,
    )
    for i in range(6):
        a = (i / 6) * math.tau
        pts = [
            [0, 3.05, -0.15],
            [math.cos(a) * 0.95, 3.85, math.sin(a) * 0.85 - 0.1],
            [math.cos(a) * 1.75, 4.35, math.sin(a) * 1.45],
        ]
        m.tube(bough, pts, [0.34, 0.22, 0.1], segs=12, color="#495f55")
        # Sculpted lush tiered canopy dome above each bough
        cx, cy, cz = pts[-1]
        m.ellipsoid(
            canopy,
            (cx * 0.9, cy + 0.32, cz * 0.9),
            (0.95, 0.55, 0.92),
            u_segs=20,
            v_segs=14,
            color="#588f82" if i % 2 else "#6da394",
            bump_fn=lambda th, ph: 0.12 * math.sin(th * 6) * math.cos(ph * 4),
        )
        # Hanging tear-drop vitality or plague pods
        pod_part = vital if i % 2 == 0 else plague
        pod_col = "#7bf5cf" if i % 2 == 0 else "#d86bff"
        m.lathe(
            pod_part,
            [(0.0, 0.02), (0.35, 0.24), (0.72, 0.22), (1.05, 0.06)],
            center=(cx * 0.92, cy - 1.18, cz * 0.92),
            segs=16,
            color=pod_col,
        )

    m.ellipsoid(canopy, (0, 4.95, -0.1), (1.45, 0.72, 1.35), u_segs=24, v_segs=16, color="#78b3a3")
    m.torus(bronze, (0, 3.75, -0.1), 1.48, 0.06, u_segs=36, v_segs=10, color="#cdb06a")
    m.torus(
        vital,
        (0, 4.15, 0.05),
        0.95,
        0.045,
        u_segs=30,
        v_segs=8,
        color="#9cffea",
        rot=(0.45, 0, 0.2),
    )

    return m.finish("moon-crown.glb", portrait_slug="moon-crown", bg_color="#1d3834")


def build_moon_root():
    m = SculptedModel("moonRoot", "月痕树根", tier="overlord")
    root_wood = m.part("Root_Tendrils", metallic=0.08, roughness=0.75)
    whips = m.part("Whip_Roots", metallic=0.1, roughness=0.68)
    brass = m.part("Siphon_Conduits", metallic=0.82, roughness=0.28)
    collars = m.part("Valve_Rings", metallic=0.86, roughness=0.24)
    sap = m.part("Moon_Sap_Bulbs", metallic=0.1, roughness=0.2, emissive=[0.22, 0.56, 0.48])
    stone = m.part("Root_Talons", metallic=0.15, roughness=0.65)

    # Massive arching coiled subterranean root-serpents forming a heavy siege arch
    for idx in range(5):
        ang = (idx - 2) * 0.62
        pts = []
        for s in range(20):
            t = s / 19.0
            a = t * math.pi
            x = math.sin(a + ang * 0.35) * (1.25 + (idx % 2) * 0.35) * math.cos(ang * 0.6)
            y = 0.08 + math.sin(a) * (3.25 + (2 - abs(idx - 2)) * 0.55)
            z = math.sin(ang) * 1.15 * (1.0 - 0.4 * t) + (t - 0.5) * 1.1
            pts.append([x, y, z])
        rads = [0.38 - 0.14 * abs(t - 0.5) for t in np.linspace(0, 1, 20)]
        m.tube(
            root_wood,
            pts,
            rads,
            segs=14,
            color="#4e5d52" if idx % 2 else "#3e4c43",
            flute_amp=0.09,
            flute_freq=6,
        )
        m.ellipsoid(stone, pts[0], (0.34, 0.22, 0.38), u_segs=14, v_segs=10, color="#6b7a72")
        m.ellipsoid(stone, pts[-1], (0.32, 0.2, 0.36), u_segs=14, v_segs=10, color="#6b7a72")

    # Central bronze diversion siphon & luminous sap tank placed slightly forward for clear 3/4 silhouette
    m.lathe(
        brass,
        [(0.15, 0.72), (0.85, 0.52), (1.45, 0.82), (2.35, 0.84), (2.95, 0.48), (3.45, 0.35)],
        center=(0, 0, 0.34),
        segs=24,
        color="#c4a662",
    )
    m.ellipsoid(sap, (0, 1.9, 0.36), (0.68, 0.85, 0.68), u_segs=22, v_segs=16, color="#86ffe2")
    m.torus(collars, (0, 1.9, 0.36), 0.78, 0.075, u_segs=32, v_segs=10, color="#dfc173")
    m.torus(
        collars, (0, 2.45, 0.36), 0.66, 0.06, u_segs=28, v_segs=8, color="#dfc173", rot=(0.55, 0, 0)
    )

    # Sweeping spiked whip-roots extending forward & upward
    for sx in (-1, 1):
        m.tube(
            whips,
            [
                [sx * 0.5, 1.8, 0.35],
                [sx * 1.35, 2.8, 0.95],
                [sx * 1.62, 3.85, 0.45],
                [sx * 1.15, 4.45, 0.15],
            ],
            [0.24, 0.18, 0.11, 0.03],
            segs=12,
            color="#586e62",
        )
        m.ellipsoid(
            sap, (sx * 1.35, 2.8, 0.95), (0.24, 0.24, 0.24), u_segs=14, v_segs=10, color="#7bf7dc"
        )

    return m.finish("moon-root.glb", portrait_slug="moon-root", bg_color="#1c302b")


def main():
    counts = {
        "apep-lamb": build_apep_lamb(),
        "radiant-wyvern": build_radiant_wyvern(),
        "ares": build_ares(),
        "ares-cannon-left": build_ares_cannon(
            "ares-cannon-left", "aresCannonLeft", "阿瑞斯·左浮游机炮", -1
        ),
        "ares-cannon-right": build_ares_cannon(
            "ares-cannon-right", "aresCannonRight", "阿瑞斯·右浮游机炮", 1
        ),
        "moon-eye": build_moon_eye(),
        "moon-crown": build_moon_crown(),
        "moon-root": build_moon_root(),
    }
    print("Built all 8 non-voxel Overlord/Card-Standing models:", counts)


if __name__ == "__main__":
    main()
