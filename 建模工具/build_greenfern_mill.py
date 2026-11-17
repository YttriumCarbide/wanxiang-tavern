"""Build the Greenfern Mill (绿蕨磨坊) 3D voxel battlefield while preserving the 6 battle card slots."""

import math
import random

import numpy as np

from build_realms import Model


def build_central_board(model, rng):
    # Deep earth underlayer (kept outside Floor regex so 48x36 slab is not subdivided)
    model.box(-24.0, -0.52, -18.0, 48.0, 0.48, 36.0, "262d26", "Bedrock")
    # Outer mill yard soil & cobble base floor
    model.box(-14.5, -0.04, -11.5, 29.0, 0.04, 23.0, "3b4236", "01_Mill_Ground_Floor")

    # Friendly side (z in [0, 5.45]): loose weathered timber planks + pale flour dust
    plank_colors = ["7b6548", "6d583e", "887153", "634f38"]
    z_cursor = 0.02
    row_idx = 0
    while z_cursor < 5.42:
        plank_d = 0.34
        x_cursor = -6.44
        offset = (row_idx % 3) * 0.42
        first_w = 0.88 + offset
        col_idx = 0
        while x_cursor < 6.44:
            pw = first_w if col_idx == 0 else 1.56
            w = min(pw - 0.025, 6.44 - x_cursor)
            if w > 0.06:
                tilt_h = 0.102 if (row_idx + col_idx) % 5 == 0 else 0.098
                c = plank_colors[(row_idx * 3 + col_idx) % len(plank_colors)]
                model.box(
                    x_cursor,
                    0.0,
                    z_cursor,
                    w,
                    tilt_h,
                    min(plank_d - 0.022, 5.44 - z_cursor),
                    c,
                    "02_Central_Plank_Floor",
                )
            x_cursor += pw
            col_idx += 1
        z_cursor += plank_d
        row_idx += 1

    # Pale spilled flour dust patches on friendly planks (outside card foundation footprints)
    flour_colors = ["e7e1d1", "dad2bf", "cfc6b0"]
    for _ in range(95):
        fx = rng.uniform(-6.1, 6.1)
        fz = rng.uniform(0.35, 5.15)
        if min(abs(fx - cx) for cx in (-3.014, 0.0, 3.014)) < 1.18 and abs(fz - 2.345) < 1.62:
            continue
        if math.hypot(fx, fz) < 1.08:
            continue
        model.box(
            fx,
            0.103,
            fz,
            rng.uniform(0.14, 0.46),
            0.014,
            rng.uniform(0.12, 0.38),
            rng.choice(flour_colors),
            "04_Flour_Dust_Floor",
        )

    # Enemy side (z in [-5.45, 0]): damp mossy stone flagstones
    stone_colors = ["48564e", "526157", "3f4c45", "5b6a5e"]
    z_cursor = -5.44
    row_idx = 0
    while z_cursor < -0.02:
        tile_d = 0.54
        x_cursor = -6.44
        stagger = 0.38 if row_idx % 2 else 0.0
        col_idx = 0
        while x_cursor < 6.44:
            tw = (0.76 + stagger) if col_idx == 0 else 0.92
            w = min(tw - 0.03, 6.44 - x_cursor)
            d = min(tile_d - 0.03, -0.02 - z_cursor)
            if w > 0.06 and d > 0.06:
                c = stone_colors[(row_idx * 5 + col_idx) % len(stone_colors)]
                model.box(x_cursor, 0.0, z_cursor, w, 0.098, d, c, "03_Enemy_Moss_Tile_Floor")
                if rng.random() < 0.28:
                    in_card = (
                        min(abs((x_cursor + w * 0.5) - cx) for cx in (-3.014, 0.0, 3.014)) < 1.18
                        and abs((z_cursor + d * 0.5) + 2.345) < 1.62
                    )
                    if not in_card and math.hypot(x_cursor + w * 0.5, z_cursor + d * 0.5) > 1.08:
                        model.box(
                            x_cursor + 0.04,
                            0.099,
                            z_cursor + 0.04,
                            min(0.24, w * 0.5),
                            0.015,
                            min(0.2, d * 0.5),
                            rng.choice(["557548", "648651", "47633d"]),
                            "03_Enemy_Moss_Tile_Floor",
                        )
            x_cursor += tw
            col_idx += 1
        z_cursor += tile_d
        row_idx += 1

    # Central sunken old stone millstone emblem at (0, 0) (radius <= 0.92, clear of cards)
    for r_ring, col in [(0.88, "6c7368"), (0.64, "83897c"), (0.34, "575d54")]:
        steps = max(24, int(r_ring * 44))
        for i in range(steps):
            a = (i * math.tau) / steps
            model.box(
                math.cos(a) * r_ring - 0.055,
                0.102,
                math.sin(a) * r_ring - 0.055,
                0.11,
                0.024,
                0.11,
                col,
                "05_Central_Millstone_Floor",
            )
    # Radial grinding furrows & flour-filled grooves on central millstone
    for k in range(8):
        ang = (k * math.tau) / 8 + 0.2
        model.stroke(
            (math.cos(ang) * 0.28, 0.126, math.sin(ang) * 0.28),
            (math.cos(ang + 0.22) * 0.82, 0.126, math.sin(ang + 0.22) * 0.82),
            "dcd5c3" if k % 2 == 0 else "4a5048",
            0.036,
            "Millstone_Furrows",
        )
    # Iron millstone eye / spindle socket at (0, 0)
    model.box(-0.16, 0.104, -0.16, 0.32, 0.032, 0.32, "373f42", "Millstone_Iron_Rhynd")
    model.box(-0.07, 0.136, -0.07, 0.14, 0.022, 0.14, "9e834e", "Millstone_Iron_Rhynd")

    # Six grounded card foundations matching battle.glb / build_realms.py exact coordinates
    for z in (-2.345, 2.345):
        for x in (-3.014, 0.0, 3.014):
            base_col = "3b463f" if z < 0 else "584733"
            top_col = "516156" if z < 0 else "796347"
            trim_col = "7ca368" if z < 0 else "cbbd9d"
            model.box(
                x - 1.12, 0.1, z - 1.54, 2.24, 0.1, 3.08, base_col, "Six_Grounded_Foundations"
            )
            model.box(x - 1.05, 0.2, z - 1.47, 2.1, 0.06, 2.94, top_col, "Six_Grounded_Foundations")
            model.ring(x, 0.265, z, 0.52, "9c8454", 0.035, "Revealed_Dais_Engraving")
            for sx in (-1, 1):
                for sz in (-1, 1):
                    model.box(
                        x + sx * 0.93 - 0.1,
                        0.26,
                        z + sz * 1.35,
                        0.24,
                        0.035,
                        0.045,
                        trim_col,
                        "Dais_Corner_Inlay",
                        glow=(z < 0),
                    )

    # Low weathered timber & mossy stone curb bordering the central 12.9 x 10.9 playfield
    for side in (-1, 1):
        for z in np.arange(-5.4, 5.4, 0.6):
            model.box(
                side * 6.58 - 0.14,
                0.0,
                float(z),
                0.28,
                0.18,
                0.52,
                "495247" if z < 0 else "65513a",
                "Board_Border_Curb",
            )


def safe_prop_box(model, x, y, z, w, h, d, color, group, glow=False, pivot=None):
    """Add peripheral architecture/prop box while strictly protecting [-6.25, 6.25] x [-5.25, 5.25]."""
    if x < 6.25 and x + w > -6.25 and z < 5.25 and z + d > -5.25:
        raise ValueError(
            f"Peripheral group {group} intruded into central card zone: {(x, y, z, w, h, d)}"
        )
    model.box(x, y, z, w, h, d, color, group, glow=glow, pivot=pivot)


def build_left_canal_and_waterwheel(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Dry stone-masonry mill canal (干涸石砌水渠) running along x in [-10.2, -7.2]
    b(-10.1, -0.02, -9.6, 2.7, 0.08, 18.2, "323832", "Canal_Dry_Silt_Bed")
    for z in np.arange(-9.4, 8.2, 0.68):
        zz = float(z)
        # Inner and outer dressed-stone canal retaining walls
        b(
            -7.45,
            0.0,
            zz,
            0.42,
            0.52 + (int(abs(zz) * 3) % 2) * 0.08,
            0.64,
            rng.choice(["5a635b", "687268", "4d564f"]),
            "Canal_Stone_Masonry",
        )
        b(
            -10.35,
            0.0,
            zz,
            0.46,
            0.62,
            0.64,
            rng.choice(["515a52", "636d63"]),
            "Canal_Stone_Masonry",
        )
        # Cracked dry mud slabs & damp moss tufts inside the dry canal bed
        if rng.random() < 0.75:
            b(
                rng.uniform(-9.7, -7.9),
                0.06,
                zz + 0.08,
                rng.uniform(0.32, 0.65),
                0.05,
                rng.uniform(0.28, 0.52),
                rng.choice(["484d42", "557347", "5b6154"]),
                "Canal_Dry_Silt_Bed",
            )
    # Wooden sluice gate frame in back-left canal (-8.7, z = -6.8)
    for dx in (-1.15, 1.05):
        b(-8.7 + dx, 0.0, -6.95, 0.22, 2.05, 0.24, "5c4833", "Canal_Sluice_Gate")
    b(-9.95, 1.85, -6.98, 2.5, 0.22, 0.3, "735a40", "Canal_Sluice_Gate")
    b(-9.65, 0.38, -6.9, 1.9, 1.15, 0.1, "4b3b2a", "Canal_Sluice_Gate")

    # Semi-collapsed riverside wooden waterwheel (半塌的河畔木质水轮)
    # Stone & oak A-frame support piers outside the paddle sweep
    wx, wz = -8.72, -2.35
    b(wx - 0.42, 0.0, wz - 1.95, 0.84, 0.92, 0.56, "59635a", "Waterwheel_Stone_Piers")
    b(wx - 0.42, 0.0, wz + 1.45, 0.84, 0.78, 0.56, "59635a", "Waterwheel_Stone_Piers")
    b(wx - 0.16, 0.06, wz - 0.16, 0.32, 1.02, 0.32, "4f3e2c", "Waterwheel_Axle_Post")
    # Collapsed broken wheel arc half-buried in canal bed nearby
    for k in range(5):
        ang = 0.3 + k * 0.35
        b(
            wx + math.cos(ang) * 0.9 - 0.1,
            0.08 + k * 0.06,
            wz + 2.35 + math.sin(ang) * 0.85,
            0.28,
            0.16,
            0.24,
            "69533b",
            "Collapsed_Wheel_Debris",
        )

    # Animated node: Motion_Mill_Waterwheel (rotates smoothly around Y pivot without clipping walls)
    wheel_pivot = (wx, 1.14, wz)
    b(
        wx - 0.24,
        1.02,
        wz - 0.24,
        0.48,
        0.26,
        0.48,
        "3c4347",
        "Motion_Mill_Waterwheel",
        pivot=wheel_pivot,
    )
    wheel_r = 1.22
    rim_segs = 24
    for i in range(rim_segs):
        a = (i * math.tau) / rim_segs
        rx = wx + math.cos(a) * wheel_r
        rz = wz + math.sin(a) * wheel_r
        b(
            rx - 0.11,
            1.04,
            rz - 0.11,
            0.22,
            0.2,
            0.22,
            "6e573d" if i % 2 else "806648",
            "Motion_Mill_Waterwheel",
            pivot=wheel_pivot,
        )
    for spoke in range(8):
        a = (spoke * math.tau) / 8
        for step in (0.38, 0.68, 0.96):
            sx = wx + math.cos(a) * (wheel_r * step)
            sz = wz + math.sin(a) * (wheel_r * step)
            b(
                sx - 0.07,
                1.08,
                sz - 0.07,
                0.14,
                0.12,
                0.14,
                "5c4732",
                "Motion_Mill_Waterwheel",
                pivot=wheel_pivot,
            )
        # Outer wooden water-paddles (skip one broken paddle to emphasize semi-collapsed look!)
        if spoke != 5:
            px = wx + math.cos(a) * (wheel_r + 0.2)
            pz = wz + math.sin(a) * (wheel_r + 0.2)
            b(
                px - 0.14,
                0.98,
                pz - 0.14,
                0.28,
                0.3,
                0.28,
                "8a7050",
                "Motion_Mill_Waterwheel",
                pivot=wheel_pivot,
            )

    # Toppled wooden fence & stinging nettle thickets (倾倒的木篱笆与带刺荨麻丛)
    for idx, fz in enumerate([-4.8, -3.5, -0.6, 0.9, 2.4, 3.9, 5.1]):
        fx = -6.88 - (idx % 2) * 0.14
        lean_h = 0.42 if idx in (1, 4) else 0.78
        b(fx, 0.0, fz, 0.14, lean_h, 0.14, "6b553c", "Toppled_Wooden_Fence")
        if idx < 6:
            rail_y = 0.16 if idx == 4 else 0.48
            b(fx - 0.04, rail_y, fz, 0.1, 0.09, 1.35, "7d6549", "Toppled_Wooden_Fence")
            b(fx + 0.05, 0.22, fz + 0.1, 0.09, 0.08, 1.18, "5e4a34", "Toppled_Wooden_Fence")

    nettle_spots = [
        (-6.85, -4.2),
        (-7.1, -1.1),
        (-6.9, 1.6),
        (-7.15, 3.2),
        (-6.95, 4.7),
        (-8.2, 5.8),
        (-6.6, -6.1),
    ]
    for nx, nz in nettle_spots:
        for stalk in range(6):
            ox = nx + (stalk % 3 - 1) * 0.22
            oz = nz + (stalk // 3 - 0.5) * 0.26
            sh = 0.36 + (stalk % 3) * 0.16
            b(ox, 0.0, oz, 0.12, sh, 0.12, "2f5936", "Stinging_Nettle_Clusters")
            b(
                ox - 0.06,
                sh * 0.65,
                oz - 0.06,
                0.24,
                0.12,
                0.24,
                "467844" if stalk % 2 else "5a8c49",
                "Stinging_Nettle_Clusters",
            )
            # Pale stinging spines / burrs
            b(ox + 0.02, sh + 0.02, oz + 0.02, 0.07, 0.08, 0.07, "c9d68a", "Nettle_Spines")


def build_north_mill_hall_and_attic_lab(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Half-leaning timber-framed mill hall broken north wall & leaky roof trusses (z <= -5.85)
    b(-6.6, 0.0, -7.65, 13.2, 0.46, 1.55, "4c544c", "Mill_Hall_Stone_Plinth")

    # Timber posts along z = -6.85
    post_xs = [-6.2, -4.1, -2.0, 0.2, 2.4, 4.4, 6.1]
    post_hs = [2.35, 3.05, 3.45, 3.4, 3.15, 2.65, 1.95]
    for px, ph in zip(post_xs, post_hs):
        b(px, 0.46, -6.92, 0.26, ph, 0.28, "54412e", "Mill_Timber_Frame")

    # Broken wattle-and-daub / plaster wall panels between timber posts (with light-leaking gaps & arched door)
    wall_panels = [
        (-5.94, 1.84, 1.75),
        (-3.84, 1.84, 2.25),
        (2.66, 1.74, 2.15),
        (4.66, 1.44, 1.35),
    ]
    for wx, ww, wh in wall_panels:
        b(wx, 0.46, -6.86, ww, wh, 0.16, "b8ae99", "Mill_Broken_Plaster_Wall")
        # Diagonal oak brace timber
        for step in range(6):
            t = step / 5.0
            b(
                wx + t * (ww - 0.22),
                0.52 + t * (wh - 0.28),
                -6.9,
                0.2,
                0.22,
                0.22,
                "664f38",
                "Mill_Timber_Frame",
            )
        # Jagged broken top bricks/plaster chunks
        for jag in range(4):
            b(
                wx + jag * (ww * 0.24),
                0.46 + wh,
                -6.86,
                ww * 0.18,
                0.14 + (jag % 2) * 0.12,
                0.16,
                "a39985",
                "Mill_Broken_Plaster_Wall",
            )

    # Central dark mill archway opening (between x = -1.74 and +0.2)
    b(-1.82, 0.46, -7.45, 2.1, 2.25, 0.22, "1d2224", "Mill_Interior_Shadow")
    b(-1.95, 2.65, -6.96, 2.35, 0.26, 0.34, "5c4732", "Mill_Timber_Frame")

    # Attic crossbeams & light-leaking pitched roof rafters (漏光屋架 + 阁楼木梁)
    b(-4.2, 2.18, -7.25, 7.1, 0.22, 0.95, "634d36", "Attic_Loft_Beams")
    for rx in np.arange(-4.4, 4.6, 0.72):
        xx = float(rx)
        for step in range(5):
            yy = 2.55 + step * 0.28
            zz = -6.35 - step * 0.32
            b(xx, yy, zz, 0.14, 0.16, 0.36, "70583e", "Leaky_Roof_Trusses")
            # Sparse surviving slate/wood shingles leaving open skylight gaps
            if (int(abs(xx * 3)) + step) % 3 != 0:
                b(
                    xx - 0.18,
                    yy + 0.15,
                    zz,
                    0.54,
                    0.07,
                    0.32,
                    rng.choice(["3e4d48", "4d5e54"]),
                    "Leaky_Roof_Shingles",
                )

    # Attic Lab Brass Clockwork Gears: Motion_Mill_Gear_A & Motion_Mill_Gear_B
    gear_a_pivot = (-1.35, 2.52, -6.78)
    b(
        -1.45,
        2.4,
        -6.88,
        0.2,
        0.24,
        0.2,
        "353d42",
        "Motion_Mill_Gear_A",
        pivot=gear_a_pivot,
    )
    for i in range(14):
        a = (i * math.tau) / 14
        gx = gear_a_pivot[0] + math.cos(a) * 0.56
        gz = gear_a_pivot[2] + math.sin(a) * 0.56
        b(
            gx - 0.08,
            2.46,
            gz - 0.08,
            0.16,
            0.12,
            0.16,
            "c8a256" if i % 2 else "9e7b3c",
            "Motion_Mill_Gear_A",
            pivot=gear_a_pivot,
        )
    for spoke in range(4):
        a = (spoke * math.tau) / 4
        b(
            gear_a_pivot[0] + math.cos(a) * 0.28 - 0.06,
            2.48,
            gear_a_pivot[2] + math.sin(a) * 0.28 - 0.06,
            0.12,
            0.08,
            0.12,
            "8a6a34",
            "Motion_Mill_Gear_A",
            pivot=gear_a_pivot,
        )

    gear_b_pivot = (-0.34, 2.54, -6.78)
    b(
        -0.42,
        2.42,
        -6.86,
        0.16,
        0.22,
        0.16,
        "353d42",
        "Motion_Mill_Gear_B",
        pivot=gear_b_pivot,
    )
    for i in range(10):
        a = (i * math.tau) / 10 + 0.15
        gx = gear_b_pivot[0] + math.cos(a) * 0.38
        gz = gear_b_pivot[2] + math.sin(a) * 0.38
        b(
            gx - 0.07,
            2.48,
            gz - 0.07,
            0.14,
            0.1,
            0.14,
            "b58648" if i % 2 else "d4b26a",
            "Motion_Mill_Gear_B",
            pivot=gear_b_pivot,
        )

    # Attic Alchemical Workbench & Glowing Core (Motion_Mill_Core)
    b(0.85, 2.4, -7.12, 1.55, 0.42, 0.72, "594430", "Attic_Alchemy_Bench")
    b(0.95, 2.82, -7.02, 0.18, 0.28, 0.18, "78e6b5", "Attic_Alchemy_Retorts", glow=True)
    b(2.05, 2.82, -6.98, 0.16, 0.22, 0.16, "b87cff", "Attic_Alchemy_Retorts", glow=True)

    core_pivot = (1.58, 3.12, -6.76)
    b(
        1.44,
        2.96,
        -6.9,
        0.28,
        0.32,
        0.28,
        "b978ff",
        "Motion_Mill_Core",
        glow=True,
        pivot=core_pivot,
    )
    for i in range(8):
        a = (i * math.tau) / 8
        cx = core_pivot[0] + math.cos(a) * 0.38
        cz = core_pivot[2] + math.sin(a) * 0.38
        b(
            cx - 0.05,
            3.08,
            cz - 0.05,
            0.1,
            0.09,
            0.1,
            "66f2b4" if i % 2 else "d4af62",
            "Motion_Mill_Core",
            glow=True,
            pivot=core_pivot,
        )


def build_right_yard_sacks_cellar_and_barrels(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # 1. Stacked bulging burlap flour sacks & overflowing flour dust (堆叠的鼓胀麻袋与溢出面粉)
    sack_specs = [
        (6.85, 0.0, 2.15, 0.86, 0.48, 0.68),
        (7.78, 0.0, 2.05, 0.88, 0.5, 0.72),
        (6.95, 0.0, 2.92, 0.84, 0.46, 0.68),
        (7.82, 0.0, 2.88, 0.86, 0.48, 0.66),
        (7.32, 0.48, 2.38, 0.82, 0.46, 0.66),
        (7.45, 0.48, 3.12, 0.78, 0.44, 0.64),
        (7.38, 0.92, 2.68, 0.74, 0.42, 0.58),
        (6.88, 0.0, 3.85, 0.78, 0.58, 0.68),
    ]
    burlap_cols = ["a8926d", "99825d", "b59f79"]
    for idx, (sx, sy, sz, sw, sh, sd) in enumerate(sack_specs):
        b(sx, sy, sz, sw, sh, sd, burlap_cols[idx % 3], "Bulging_Flour_Sacks")
        # Tied sack neck / ears
        b(
            sx + sw * 0.32,
            sy + sh,
            sz + sd * 0.32,
            0.22,
            0.12,
            0.22,
            "8c7552",
            "Bulging_Flour_Sacks",
        )
    # Spilled white-cream flour cones & dust drifts around torn lower sacks
    for fx, fz, fw, fh, fd in [
        (6.52, 2.35, 0.42, 0.14, 0.55),
        (6.48, 3.45, 0.48, 0.18, 0.62),
        (7.65, 3.68, 0.62, 0.12, 0.58),
        (6.62, 4.48, 0.36, 0.08, 0.44),
    ]:
        b(fx, 0.02, fz, fw, fh, fd, "ebe5d6", "Overflowing_Flour_Mounds")
        b(
            fx + 0.06,
            0.02 + fh,
            fz + 0.08,
            fw * 0.55,
            0.06,
            fd * 0.55,
            "f5f0e4",
            "Overflowing_Flour_Mounds",
        )

    # 2. Underground wine-cellar sloped wooden bulkhead doors / hatch (地下酒窖木门/斜盖板)
    cx, cz = 7.55, -1.35
    b(cx, 0.0, cz, 1.85, 0.28, 2.15, "4e5750", "Cellar_Stone_Bulkhead")
    b(cx + 0.22, 0.04, cz + 0.22, 1.4, 0.18, 1.7, "171c1e", "Cellar_Dark_Stairwell")
    # Sloped left & slightly-ajar right oak storm doors
    for step in range(5):
        dy = 0.26 + step * 0.11
        dx = cx + 0.18 + step * 0.28
        # Closed north cellar door leaf
        b(dx, dy, cz + 0.12, 0.32, 0.09, 0.88, "634d36", "Cellar_Sloped_Doors")
        # Slightly propped-open south cellar door leaf + iron hinge strap
        b(dx, dy + 0.05, cz + 1.08, 0.32, 0.09, 0.88, "735a40", "Cellar_Sloped_Doors")
        if step in (1, 3):
            b(dx + 0.04, dy + 0.09, cz + 0.14, 0.24, 0.03, 1.8, "363e42", "Cellar_Iron_Hinges")

    # 3. Rotting cracked oak wine barrels (腐烂开裂的橡木酒桶)
    barrels = [
        (6.95, -4.45, 0.72, 0.96, False),
        (7.85, -4.85, 0.76, 1.02, False),
        (7.35, -3.45, 0.74, 0.68, True),
        (8.35, -3.75, 0.7, 0.92, False),
    ]
    for bx, bz, bw, bh, cracked in barrels:
        b(bx, 0.0, bz, bw, bh, bw, "59422e" if cracked else "6b5038", "Rotting_Oak_Barrels")
        for hy in (0.14, bh * 0.52, bh - 0.14):
            if hy > 0.08:
                b(
                    bx - 0.03,
                    hy,
                    bz - 0.03,
                    bw + 0.06,
                    0.06,
                    bw + 0.06,
                    "3a4042",
                    "Barrel_Iron_Hoops",
                )
        if cracked:
            # Staved-in dark opening & spilled dark wine/mold stain
            b(bx + 0.14, 0.24, bz - 0.02, 0.26, 0.36, 0.14, "1e1920", "Cracked_Barrel_Void")
            b(bx - 0.32, 0.02, bz + 0.12, 0.52, 0.03, 0.58, "4a2d3b", "Wine_Mold_Seepage")

    # 4. Old strongbox / money-chest entangled in green moss slime (被青苔史莱姆缠住的旧钱箱)
    sx, sz = 6.92, 0.58
    b(sx, 0.04, sz, 0.86, 0.46, 0.62, "4a3a2a", "Old_Strongbox_Body")
    b(sx - 0.03, 0.04, sz - 0.03, 0.92, 0.08, 0.68, "343b40", "Strongbox_Iron_Bands")
    b(sx - 0.03, 0.42, sz - 0.03, 0.92, 0.16, 0.68, "5c4834", "Old_Strongbox_Body")
    b(sx + 0.08, 0.44, sz + 0.12, 0.28, 0.08, 0.22, "dfb95b", "Strongbox_Gold_Glint", glow=True)
    b(sx - 0.05, 0.28, sz + 0.22, 0.08, 0.14, 0.16, "b5924c", "Strongbox_Brass_Lock")
    # Wrapping green moss-slime mass & tendrils
    slime_blobs = [
        (sx - 0.18, 0.02, sz - 0.14, 0.52, 0.34, 0.48, "56a85b"),
        (sx + 0.26, 0.48, sz + 0.06, 0.48, 0.26, 0.44, "68c468"),
        (sx + 0.48, 0.18, sz + 0.38, 0.42, 0.32, 0.34, "4c9652"),
        (sx + 0.12, 0.58, sz + 0.16, 0.24, 0.18, 0.24, "86eb7a"),
    ]
    for lx, ly, lz, lw, lh, ld, lcol in slime_blobs:
        b(lx, ly, lz, lw, lh, ld, lcol, "Moss_Slime_Entanglement", glow=(lcol == "86eb7a"))


def build_south_foreground_trim(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Keep foreground (z >= 5.65) strictly low (y <= 0.45) so camera at (0, 18, 10) never clips cards
    for x in np.arange(-5.8, 5.9, 1.15):
        xx = float(x)
        b(
            xx,
            0.0,
            5.75 + rng.uniform(0.0, 0.35),
            rng.uniform(0.45, 0.82),
            rng.uniform(0.06, 0.16),
            rng.uniform(0.38, 0.65),
            rng.choice(["545c52", "6e5940", "63784e"]),
            "South_Yard_Threshold",
        )


def main():
    rng = random.Random(20261118)
    model = Model("Wanxiang_Greenfern_Mill", cards=True)
    build_central_board(model, rng)
    build_left_canal_and_waterwheel(model, rng)
    build_north_mill_hall_and_attic_lab(model, rng)
    build_right_yard_sacks_cellar_and_barrels(model, rng)
    build_south_foreground_trim(model, rng)
    counts = model.finish(
        "greenfern-mill.glb",
        source="建模工具/build_greenfern_mill.py",
        metadata={
            "biome": "greenfern-mill",
            "titleZh": "绿蕨磨坊",
            "motionNodes": [
                "Motion_Mill_Waterwheel",
                "Motion_Mill_Gear_A",
                "Motion_Mill_Gear_B",
                "Motion_Mill_Core",
            ],
        },
    )
    print("Greenfern Mill components:", len(counts), "groups")


if __name__ == "__main__":
    main()
