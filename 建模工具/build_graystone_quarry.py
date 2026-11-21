"""Build the Graystone Quarry (灰岩旧采石场) voxel battlefield and its miniature preview."""

import math
import random

import numpy as np

from build_realms import Model

PALETTE = {
    "bedrock": ["2a2f36", "383f48", "464d57"],
    "limestone": ["5c636b", "6d747b", "7e858a", "91979b"],
    "mud": ["4a3e33", "594b3e", "6b5c4d"],
    "timber": ["4a3625", "5e4631", "73573d"],
    "iron": ["3b4047", "524a46", "6e4e3a"],
    "canvas": ["756852", "8a7c63", "9c8f76"],
    "pine": ["3d4f38", "4b5d44", "5d7052"],
    "scrub": ["4f5e43", "63704d"],
    "rift": ["1b1026", "2d1740", "7e4fd9", "9b6bff", "c49eff"],
    "lamp": ["e89c48", "f5c878"],
}


def build_central_board(model, rng):
    model.box(-25.0, -0.56, -19.0, 50.0, 0.52, 38.0, "2a2f36", "00_Deep_Quarry_Bedrock")
    model.box(-24.2, -0.04, -18.2, 48.4, 0.04, 36.4, "4d5259", "01_Quarry_Floor_Base")

    # Friendly half: chiseled limestone loading slabs with muddy cart ruts.
    slab_cols = PALETTE["limestone"]
    z_cursor = 0.02
    row = 0
    while z_cursor < 5.42:
        depth = 0.46
        x_cursor = -6.44
        offset = (row % 3) * 0.36
        first = 0.92 + offset
        col = 0
        while x_cursor < 6.44:
            pw = first if col == 0 else 1.34
            w = min(pw - 0.03, 6.44 - x_cursor)
            d = min(depth - 0.03, 5.44 - z_cursor)
            if w > 0.06 and d > 0.06:
                h = 0.102 if (row + col) % 4 == 0 else 0.098
                color = slab_cols[(row * 3 + col) % len(slab_cols)]
                model.box(x_cursor, 0.0, z_cursor, w, h, d, color, "02_Central_Quarry_Slabs")
            x_cursor += pw
            col += 1
        z_cursor += depth
        row += 1

    # Slim recessed wheel ruts running along the friendly half toward the south.
    rut_cols = ["4a3e33", "594b3e", "3f3a33"]
    for rut_x in (-1.55, 1.55):
        z = 0.12
        while z < 5.36:
            seg = rng.uniform(0.34, 0.62)
            model.box(
                rut_x - 0.10 + rng.uniform(-0.02, 0.02),
                0.1,
                z,
                0.20,
                0.006,
                seg,
                rng.choice(rut_cols),
                "02_Central_Quarry_Slabs",
            )
            z += seg + rng.uniform(0.02, 0.06)

    # Enemy half: blasted dark slate with faint violet crystal veins.
    slate_cols = ["383f48", "464d57", "3f4650", "4a515b"]
    z_cursor = -5.44
    row = 0
    while z_cursor < -0.02:
        depth = 0.52
        x_cursor = -6.44
        stagger = 0.34 if row % 2 else 0.0
        col = 0
        while x_cursor < 6.44:
            tw = (0.8 + stagger) if col == 0 else 0.96
            w = min(tw - 0.03, 6.44 - x_cursor)
            d = min(depth - 0.03, -0.02 - z_cursor)
            if w > 0.06 and d > 0.06:
                color = slate_cols[(row * 5 + col) % len(slate_cols)]
                model.box(x_cursor, 0.0, z_cursor, w, 0.098, d, color, "03_Enemy_Blast_Slate")
            x_cursor += tw
            col += 1
        z_cursor += depth
        row += 1

    # Faint violet crystal veins creeping from the north rift.
    for _ in range(70):
        vx = rng.uniform(-6.0, 6.0)
        vz = rng.uniform(-5.2, -0.2)
        if min(abs(vx - cx) for cx in (-3.014, 0.0, 3.014)) < 1.2 and abs(vz + 2.345) < 1.6:
            continue
        glow = rng.random() < 0.35
        model.box(
            vx,
            0.099,
            vz,
            rng.uniform(0.05, 0.22),
            0.012,
            rng.uniform(0.04, 0.16),
            rng.choice(PALETTE["rift"][2:]),
            "03_Enemy_Blast_Slate",
            glow=glow,
        )

    # Center line: twin iron minecart rails with wooden sleepers and a survey rivet.
    for rail_z in (-0.16, 0.16):
        model.box(-6.3, 0.1, rail_z - 0.03, 12.6, 0.05, 0.06, "3b4047", "04_Center_Track_And_Ring")
    for x in np.arange(-6.2, 6.3, 0.42):
        model.box(float(x), 0.1, -0.24, 0.3, 0.04, 0.48, "5e4631", "04_Center_Track_And_Ring")
    model.box(-0.16, 0.1, -0.16, 0.32, 0.03, 0.32, "91979b", "04_Center_Track_And_Ring")
    model.box(-0.06, 0.13, -0.06, 0.12, 0.02, 0.12, "6d747b", "04_Center_Track_And_Ring")

    # Six grounded card foundations.
    for z in (-2.345, 2.345):
        for x in (-3.014, 0.0, 3.014):
            base_col = "383f48" if z < 0 else "5c636b"
            top_col = "464d57" if z < 0 else "6d747b"
            model.box(
                x - 1.12, 0.0, z - 1.54, 2.24, 0.10, 3.08, base_col, "Six_Grounded_Foundations"
            )
            model.box(
                x - 1.05, 0.10, z - 1.47, 2.10, 0.06, 2.94, top_col, "Six_Grounded_Foundations"
            )
            model.ring(x, 0.16, z, 0.52, "91979b", 0.035, "Revealed_Dais_Engraving")
            for sx in (-1, 1):
                for sz in (-1, 1):
                    if z < 0:
                        model.box(
                            x + sx * 0.93 - 0.1,
                            0.16,
                            z + sz * 1.35,
                            0.24,
                            0.035,
                            0.045,
                            "9b6bff",
                            "Dais_Corner_Inlay",
                            glow=True,
                        )
                    else:
                        model.box(
                            x + sx * 0.93 - 0.1,
                            0.16,
                            z + sz * 1.35,
                            0.24,
                            0.035,
                            0.045,
                            "c89854",
                            "Dais_Corner_Inlay",
                        )

    # Low curbs along east and west edges.
    for side in (-1, 1):
        for z in np.arange(-5.4, 5.4, 0.6):
            model.box(
                side * 6.56 - 0.14,
                0.0,
                float(z),
                0.28,
                0.16,
                0.52,
                "5c636b" if z < 0 else "6d747b",
                "Edge_Curb",
            )


def safe_prop_box(model, x, y, z, w, h, d, color, group, glow=False, pivot=None):
    if y + h > 0.11:
        if not ((x + w <= -6.48) or (x >= 6.48) or (z + d <= -5.48) or (z >= 5.48)):
            raise ValueError(
                f"Peripheral group {group} intruded into central battle zone: "
                f"{(x, y, z, w, h, d)}"
            )
    model.box(x, y, z, w, h, d, color, group, glow=glow, pivot=pivot)


def build_west_wing(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )

    # 1) Southwest: timber checkpoint gate and two-storey watchtower.
    # Fence line runs along z in [2.2, 6.4] at x ~ -13.4.
    for idx, fz in enumerate(np.arange(2.3, 6.4, 0.5)):
        fx = -13.5 + (idx % 2) * 0.16
        lean = 0.9 if idx % 3 else 0.72
        b(fx, 0.0, float(fz), 0.16, lean, 0.16, "5e4631", "West_Checkpoint_Fence")
        if idx < 7:
            b(fx - 0.04, 0.5, float(fz), 0.1, 0.1, 0.58, "73573d", "West_Checkpoint_Fence")
    # Hanging sign board on the fence.
    b(-13.2, 0.62, 4.2, 0.08, 0.5, 0.9, "4a3625", "West_Checkpoint_Sign")
    b(-13.16, 0.72, 4.32, 0.04, 0.28, 0.66, "8a7c63", "West_Checkpoint_Sign")

    # Watchtower centered at (-10.8, 4.3), height 3.2.
    tx, tz = -10.8, 4.3
    for dx in (-0.9, 0.9):
        for dz in (-0.9, 0.9):
            b(tx + dx - 0.12, 0.0, tz + dz - 0.12, 0.24, 3.2, 0.24, "4a3625", "West_Watchtower")
    b(tx - 1.1, 1.4, tz - 1.1, 2.2, 0.16, 2.2, "5e4631", "West_Watchtower")
    b(tx - 1.1, 2.7, tz - 1.1, 2.2, 0.16, 2.2, "5e4631", "West_Watchtower")
    for dx in (-1.0, 1.0):
        b(tx + dx - 0.06, 1.56, tz - 1.0, 0.12, 1.14, 0.12, "73573d", "West_Watchtower")
    b(tx - 1.2, 2.86, tz - 1.2, 2.4, 0.14, 2.4, "4a3625", "West_Watchtower")
    # Open timber rafters with staggered partial slate shingles (top-down see-through).
    for rx in np.arange(tx - 1.05, tx + 1.05, 0.42):
        b(float(rx), 3.0, tz - 1.1, 0.12, 0.12, 2.2, "5e4631", "West_Watchtower")
    for rz in np.arange(tz - 1.0, tz + 1.0, 0.5):
        b(tx - 1.1, 3.12, float(rz), 2.2, 0.1, 0.1, "73573d", "West_Watchtower")
    shingle_cols = ["5c636b", "6d747b", "4a515b"]
    for rx in np.arange(tx - 1.0, tx + 1.0, 0.34):
        for rz in np.arange(tz - 1.0, tz + 1.0, 0.34):
            if rng.random() < 0.55:
                b(
                    float(rx),
                    3.22,
                    float(rz),
                    0.3,
                    0.06,
                    0.3,
                    rng.choice(shingle_cols),
                    "West_Watchtower",
                )
    # Interior props visible through the open rafters.
    b(tx - 0.7, 1.56, tz - 0.6, 0.5, 0.5, 0.5, "5e4631", "West_Watchtower")
    b(tx + 0.2, 1.56, tz + 0.1, 0.4, 0.4, 0.4, "73573d", "West_Watchtower")
    b(tx - 0.1, 1.56, tz + 0.5, 0.3, 0.3, 0.3, "3b4047", "West_Watchtower")
    # Wooden ladder.
    for lz in (tz - 1.3, tz - 1.05):
        b(tx - 1.35, 0.0, lz, 0.1, 2.7, 0.1, "73573d", "West_Watchtower_Ladder")
    for ly in np.arange(0.3, 2.6, 0.32):
        b(tx - 1.35, float(ly), tz - 1.3, 0.1, 0.06, 0.35, "5e4631", "West_Watchtower_Ladder")
    # Warm lantern on the tower.
    b(tx + 0.7, 2.2, tz + 0.7, 0.2, 0.28, 0.2, "e89c48", "West_Watchtower_Lantern", glow=True)
    b(tx + 0.66, 2.48, tz + 0.66, 0.28, 0.06, 0.28, "3b4047", "West_Watchtower_Lantern")

    # Sparse grey pines of varied heights.
    for px, pz, ph in [(-13.4, 6.2, 1.7), (-12.2, 2.6, 1.15), (-9.0, 6.3, 1.4)]:
        b(px, 0.0, pz, 0.16, ph, 0.16, "4a3625", "West_Grey_Pine")
        for layer in range(3):
            w = 0.9 - layer * 0.22
            b(
                px - w / 2,
                ph * 0.5 + layer * 0.32,
                pz - w / 2,
                w,
                0.28,
                w,
                rng.choice(PALETTE["pine"]),
                "West_Grey_Pine",
            )

    # 2) Due west: three-tier terraced quarry with A-frame crane.
    # Terraces step cleanly upward away from the board: x in [-14.2, -6.75], z in [-3.2, 2.0].
    b(-14.2, 0.0, -3.2, 7.45, 0.42, 5.2, PALETTE["limestone"][0], "West_Terraced_Quarry")
    b(-14.2, 0.42, -3.0, 5.0, 0.42, 4.6, PALETTE["limestone"][1], "West_Terraced_Quarry")
    b(-14.2, 0.84, -2.7, 2.6, 0.42, 3.8, PALETTE["limestone"][2], "West_Terraced_Quarry")
    # Stacked cut blocks on the top terrace (y = 1.26).
    for bx, bz, by in [(-13.7, -2.1, 1.26), (-12.8, -2.1, 1.26), (-13.3, -1.2, 1.26)]:
        b(bx, by, bz, 0.7, 0.4, 0.7, "7e858a", "West_Cut_Blocks")
    # Chisel wedges and stacked ashlar sitting cleanly on tier 0/1 surfaces.
    for wx, wy, wz in [(-10.8, 0.84, 1.0), (-10.2, 0.84, 1.25), (-8.8, 0.42, 1.4)]:
        b(wx, wy, wz, 0.18, 0.12, 0.14, "73573d", "West_Chisel_Wedges")
    for i in range(3):
        b(-8.6, 0.42 + i * 0.22, -2.6, 0.9, 0.2, 0.5, "7e858a", "West_Ashlar_Stack")
    # A-frame timber crane standing on tier 1 surface (y = 0.84) at (-10.4, -0.7).
    cx, cy_base, cz = -10.4, 0.84, -0.7
    for side in (-1, 1):
        for step in range(6):
            t = step / 5.0
            b(
                cx + side * (0.9 - t * 0.7) - 0.08,
                cy_base + t * 2.85,
                cz - 0.08,
                0.16,
                0.56,
                0.16,
                "5e4631",
                "West_A_Frame_Crane",
            )
    b(cx - 0.9, cy_base + 2.85, cz - 0.1, 1.8, 0.18, 0.2, "73573d", "West_A_Frame_Crane")
    # Suspended boulder with pivot at the top of the crane.
    pivot = (cx, cy_base + 2.85, cz)
    b(
        cx - 0.05,
        cy_base + 1.95,
        cz - 0.05,
        0.1,
        0.9,
        0.1,
        "3b4047",
        "Motion_Quarry_Crane_Load",
        pivot=pivot,
    )
    b(
        cx - 0.55,
        cy_base + 1.05,
        cz - 0.55,
        1.1,
        0.9,
        1.1,
        "6d747b",
        "Motion_Quarry_Crane_Load",
        pivot=pivot,
    )
    b(
        cx - 0.4,
        cy_base + 1.15,
        cz - 0.4,
        0.8,
        0.7,
        0.8,
        "7e858a",
        "Motion_Quarry_Crane_Load",
        pivot=pivot,
    )
    # Derailed tilted iron minecart resting cleanly on tier 0 top (y = 0.42) at (-7.9, 0.7).
    mx, my_base, mz = -7.9, 0.42, 0.7
    for wx in (mx - 0.4, mx + 0.4):
        b(wx - 0.1, my_base, mz - 0.5, 0.2, 0.2, 0.2, "3b4047", "West_Derailed_Minecart")
    for step in range(4):
        b(
            mx - 0.5 + step * 0.06,
            my_base + 0.18 + step * 0.14,
            mz - 0.6,
            1.0,
            0.14,
            1.2,
            "524a46",
            "West_Derailed_Minecart",
        )
    # Hollow top rim + spilled crushed limestone ore chunks (not a solid lid).
    b(mx - 0.42, my_base + 0.72, mz - 0.52, 0.84, 0.08, 1.04, "2a2f36", "West_Derailed_Minecart")
    for ox in (mx - 0.5, mx + 0.4):
        b(ox, my_base + 0.74, mz - 0.6, 0.1, 0.16, 1.2, "6e4e3a", "West_Derailed_Minecart")
    for oz in (mz - 0.6, mz + 0.5):
        b(mx - 0.4, my_base + 0.74, oz, 0.8, 0.16, 0.1, "6e4e3a", "West_Derailed_Minecart")
    for ox, oz, oh in [
        (mx - 0.2, mz - 0.2, 0.22),
        (mx + 0.05, mz + 0.05, 0.28),
        (mx - 0.1, mz + 0.22, 0.18),
    ]:
        b(
            ox,
            my_base + 0.78,
            oz,
            0.26,
            oh,
            0.26,
            rng.choice(PALETTE["limestone"][2:]),
            "West_Derailed_Minecart",
        )

    # 3) Northwest: timber ore chute and abandoned vent shaft.
    # Chute descends from x=-13.6 to x=-8.6, z in [-9.6, -3.5].
    for step in range(9):
        b(
            -13.6 + step * 0.55,
            0.2 + step * 0.28,
            -9.4,
            0.6,
            0.16,
            1.4,
            "5e4631",
            "West_Ore_Chute",
        )
    for side in (-1, 1):
        b(-13.6, 0.2, -9.4 + side * 0.7, 5.0, 0.1, 0.1, "73573d", "West_Ore_Chute")
    # Vent shaft centered at (-8.5, -4.6) with rusty grate.
    vx, vz = -8.5, -4.6
    b(vx - 0.9, 0.0, vz - 0.9, 1.8, 0.5, 1.8, "464d57", "West_Vent_Shaft")
    b(vx - 0.7, 0.5, vz - 0.7, 1.4, 0.1, 1.4, "1b1026", "West_Vent_Shaft")
    for gx in np.arange(-0.6, 0.7, 0.24):
        b(vx + float(gx), 0.6, vz - 0.7, 0.08, 0.08, 1.4, "6e4e3a", "West_Vent_Grate")
    # Rubble pile.
    for _ in range(24):
        b(
            rng.uniform(-14.0, -7.0),
            0.0,
            rng.uniform(-9.6, -3.6),
            rng.uniform(0.2, 0.5),
            rng.uniform(0.1, 0.3),
            rng.uniform(0.2, 0.5),
            rng.choice(PALETTE["limestone"]),
            "West_Rubble",
        )

    # 4) Asymmetric low ground detail across the bare west outer stone zone.
    _west_outer_ground_details(b, rng)


def _west_outer_ground_details(b, rng):
    # Stepped cut limestone quarry blocks (hand-placed, non-repeating).
    for bx, bz, bw, bh, bd in [
        (-14.4, 1.9, 0.9, 0.18, 0.7),
        (-13.3, 2.4, 0.6, 0.12, 0.5),
        (-12.1, 1.6, 0.7, 0.16, 0.6),
        (-11.0, 2.7, 0.5, 0.10, 0.4),
        (-9.4, 1.9, 0.8, 0.14, 0.6),
        (-8.2, 2.5, 0.55, 0.09, 0.45),
        (-7.4, 1.7, 0.6, 0.12, 0.5),
    ]:
        b(bx, 0.0, bz, bw, bh, bd, rng.choice(PALETTE["limestone"]), "West_Outer_Ground")
    # Rubble / gravel clusters.
    for _ in range(18):
        b(
            rng.uniform(-14.6, -6.8),
            0.0,
            rng.uniform(1.4, 3.0),
            rng.uniform(0.12, 0.3),
            rng.uniform(0.04, 0.12),
            rng.uniform(0.12, 0.3),
            rng.choice(PALETTE["limestone"] + PALETTE["bedrock"]),
            "West_Outer_Ground",
        )
    # Damp mud puddles.
    for px, pz, pw, pd in [(-13.0, 2.9, 0.9, 0.5), (-10.2, 2.2, 0.7, 0.4), (-8.0, 2.9, 0.6, 0.35)]:
        b(px, 0.0, pz, pw, 0.02, pd, "4a3e33", "West_Outer_Ground")
    # Sparse dry scrub / moss tufts.
    for _ in range(10):
        b(
            rng.uniform(-14.4, -6.9),
            0.0,
            rng.uniform(1.5, 3.0),
            rng.uniform(0.1, 0.2),
            rng.uniform(0.06, 0.14),
            rng.uniform(0.1, 0.2),
            rng.choice(PALETTE["scrub"]),
            "West_Outer_Ground",
        )
    # Ashlar slabs.
    for sx, sz in [(-12.6, 2.0), (-9.8, 2.6), (-7.6, 2.1)]:
        b(sx, 0.0, sz, 0.5, 0.06, 0.4, "7e858a", "West_Outer_Ground")
    # Small rusted iron drums and discarded rail sections.
    for dx, dz in [(-13.8, 2.6), (-11.4, 2.9), (-8.6, 2.3)]:
        b(dx, 0.0, dz, 0.24, 0.2, 0.24, "6e4e3a", "West_Outer_Ground")
    for rx, rz in [(-12.9, 1.7), (-10.6, 2.4)]:
        b(rx, 0.0, rz, 0.7, 0.05, 0.08, "524a46", "West_Outer_Ground")


def build_east_wing(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )

    # 1) Southeast: private loading dock with tilted stone cart.
    # Dock occupies x in [7.0, 13.8], z in [2.2, 6.4].
    b(7.0, 0.0, 2.2, 6.8, 0.3, 4.2, "5c636b", "East_Loading_Dock")
    b(7.2, 0.3, 2.4, 6.4, 0.1, 3.8, "6d747b", "East_Loading_Dock")
    # Two-axle stone cart sunk in mud at (9.2, 4.4) on dock surface (y = 0.40).
    cx, cz = 9.2, 4.4
    b(cx - 1.2, 0.4, cz - 0.9, 2.4, 0.05, 1.8, "4a3e33", "East_Mud_Pit")
    for wx in (cx - 0.7, cx + 0.7):
        for wz in (cz - 0.6, cz + 0.6):
            b(wx - 0.18, 0.42, wz - 0.18, 0.36, 0.32, 0.36, "3b4047", "East_Stone_Cart")
    b(cx - 1.0, 0.64, cz - 0.7, 2.0, 0.45, 1.4, "5e4631", "East_Stone_Cart")
    b(cx - 1.0, 1.09, cz - 0.7, 2.0, 0.1, 1.4, "73573d", "East_Stone_Cart")
    for _ in range(10):
        b(
            cx + rng.uniform(-0.8, 0.8),
            1.15,
            cz + rng.uniform(-0.5, 0.5),
            rng.uniform(0.2, 0.4),
            rng.uniform(0.15, 0.3),
            rng.uniform(0.2, 0.4),
            "7e858a",
            "East_Stone_Cart",
        )
    # Half-lifted tarpaulin crate stack at (11.6, 3.6) with violet crystal glow.
    for i in range(3):
        b(11.2, 0.4 + i * 0.5, 3.2, 0.9, 0.5, 0.9, "5e4631", "East_Crate_Stack")
    b(11.1, 1.9, 3.1, 1.1, 0.1, 1.1, "8a7c63", "East_Tarpaulin")
    b(11.15, 1.5, 3.2, 0.8, 0.4, 0.8, "9b6bff", "East_Crate_Glow", glow=True)
    # Toppled ledger box and lantern at (12.2, 5.4).
    b(11.8, 0.4, 5.1, 0.8, 0.4, 0.6, "4a3625", "East_Ledger_Box")
    b(11.9, 0.8, 5.2, 0.6, 0.06, 0.4, "8a7c63", "East_Ledger_Box")
    b(12.1, 0.4, 5.3, 0.2, 0.3, 0.2, "e89c48", "East_Lantern", glow=True)

    # 2) Due east: half-collapsed shed, tarpaulin windbreak, drainage trough.
    # Shed centered at (9.8, -0.8), 3.0x3.0 stone base.
    sx, sz = 9.8, -0.8
    b(sx - 1.5, 0.0, sz - 1.5, 3.0, 0.3, 3.0, "5c636b", "East_Shed_Base")
    for dx in (-1.4, 1.4):
        for dz in (-1.4, 1.4):
            b(sx + dx - 0.1, 0.3, sz + dz - 0.1, 0.2, 2.0, 0.2, "4a3625", "East_Shed_Frame")
    # Open timber rafters with staggered partial slate/plank shingles.
    for rx in np.arange(sx - 1.4, sx + 1.4, 0.5):
        b(float(rx), 2.3, sz - 1.4, 0.12, 0.12, 2.8, "5e4631", "East_Shed_Roof")
    for rz in np.arange(sz - 1.3, sz + 1.3, 0.55):
        b(sx - 1.4, 2.42, float(rz), 2.8, 0.1, 0.1, "73573d", "East_Shed_Roof")
    shingle_cols = ["5c636b", "6d747b", "4a515b", "5e4631"]
    for rx in np.arange(sx - 1.3, sx + 1.3, 0.36):
        for rz in np.arange(sz - 1.3, sz + 1.3, 0.36):
            if rng.random() < 0.55:
                b(
                    float(rx),
                    2.52,
                    float(rz),
                    0.32,
                    0.06,
                    0.32,
                    rng.choice(shingle_cols),
                    "East_Shed_Roof",
                )
    # Interior props visible through the open rafters.
    b(sx - 0.9, 0.3, sz - 0.7, 0.6, 0.6, 0.6, "5e4631", "East_Shed_Frame")
    b(sx + 0.3, 0.3, sz + 0.2, 0.5, 0.5, 0.5, "73573d", "East_Shed_Frame")
    b(sx - 0.2, 0.3, sz + 0.6, 0.4, 0.4, 0.4, "3b4047", "East_Shed_Frame")
    b(sx + 0.6, 0.3, sz - 0.6, 0.2, 0.3, 0.2, "e89c48", "East_Shed_Frame", glow=True)
    # Stepped, sloped off-white/tan canvas awning strips over the trough.
    canvas_cols = ["9c8f76", "8a7c63", "756852"]
    for step in range(5):
        b(
            11.8 + step * 0.14,
            1.9 - step * 0.22,
            -2.8 + step * 0.1,
            0.12,
            0.06,
            4.0 - step * 0.3,
            canvas_cols[step % len(canvas_cols)],
            "East_Canvas_Windbreak",
        )
    # Diagonal timber support poles.
    for pz in (-2.6, -1.4, -0.2, 1.0):
        b(11.75, 0.3, float(pz), 0.1, 1.6, 0.1, "4a3625", "East_Canvas_Windbreak")
        b(11.9, 1.0, float(pz), 0.5, 0.08, 0.08, "5e4631", "East_Canvas_Windbreak")
    for rz in np.arange(-2.6, 1.2, 0.8):
        b(11.7, 1.9, float(rz), 0.3, 0.06, 0.06, "4a3625", "East_Canvas_Ropes")
    # Stone drainage trough at x in [7.3, 11.2], z in [-2.9].
    b(7.3, 0.3, -3.2, 3.9, 0.3, 0.9, "6d747b", "East_Drainage_Trough")
    b(7.5, 0.4, -3.1, 3.5, 0.1, 0.7, "2d1740", "East_Trough_Crystal", glow=True)
    for _ in range(8):
        b(
            rng.uniform(7.6, 10.9),
            0.45,
            rng.uniform(-3.05, -2.45),
            rng.uniform(0.1, 0.2),
            rng.uniform(0.08, 0.16),
            rng.uniform(0.1, 0.2),
            "9b6bff",
            "East_Trough_Crystal",
            glow=True,
        )
    # Craftsman anvil and toolbox.
    b(12.4, 0.3, 0.4, 0.8, 0.4, 0.6, "3b4047", "East_Anvil")
    b(12.5, 0.7, 0.5, 0.6, 0.2, 0.4, "524a46", "East_Anvil")
    b(12.6, 0.3, 1.4, 0.7, 0.3, 0.5, "5e4631", "East_Toolbox")

    # 3) Northeast: violently torn iron anchor bollard and dragging chain.
    # Giant slanted limestone anchor bollard at (9.5, -5.0).
    ax, az = 9.5, -5.0
    b(ax - 0.7, 0.0, az - 0.7, 1.4, 0.6, 1.4, "464d57", "East_Anchor_Bollard")
    for step in range(5):
        b(
            ax - 0.5 + step * 0.05,
            0.6 + step * 0.5,
            az - 0.5,
            1.0,
            0.5,
            1.0,
            "5c636b",
            "East_Anchor_Bollard",
        )
    # Broken iron rings.
    for i in range(6):
        b(
            ax + 0.6 + i * 0.3,
            0.6 + (i % 2) * 0.1,
            az + 0.4,
            0.24,
            0.24,
            0.24,
            "6e4e3a",
            "East_Broken_Rings",
        )
    # Dark wrought-iron / weathered-rust chain dragging toward the north mine portal.
    chain_cols = ["3b4047", "524a46"]
    for i in range(20):
        t = i / 19.0
        cxp = ax - 0.6 - t * 1.9
        czp = az - 0.7 - t * 0.9
        b(
            cxp,
            0.02,
            czp,
            0.22,
            0.12,
            0.22,
            chain_cols[i % 2],
            "East_Dragging_Chain",
        )
        b(
            cxp + 0.06,
            0.06,
            czp + 0.06,
            0.1,
            0.06,
            0.1,
            chain_cols[(i + 1) % 2],
            "East_Dragging_Chain",
        )
    # Smashed dark crystal crate at (12.0, -5.6).
    b(11.6, 0.0, -6.0, 0.9, 0.6, 0.9, "4a3625", "East_Smashed_Crate")
    for _ in range(10):
        b(
            rng.uniform(11.2, 12.4),
            0.0,
            rng.uniform(-6.2, -5.0),
            rng.uniform(0.1, 0.24),
            rng.uniform(0.1, 0.3),
            rng.uniform(0.1, 0.24),
            rng.choice(PALETTE["rift"][2:]),
            "East_Smashed_Crate",
            glow=True,
        )

    # 4) Asymmetric low ground detail across the bare east outer stone zone.
    _east_outer_ground_details(b, rng)


def _east_outer_ground_details(b, rng):
    # Stepped cut limestone quarry blocks (distinct from west layout).
    for bx, bz, bw, bh, bd in [
        (7.2, 1.9, 0.7, 0.14, 0.55),
        (8.4, 2.6, 0.9, 0.18, 0.7),
        (9.9, 1.7, 0.55, 0.10, 0.45),
        (11.2, 2.4, 0.8, 0.16, 0.6),
        (12.6, 1.8, 0.6, 0.12, 0.5),
        (13.8, 2.5, 0.7, 0.15, 0.55),
    ]:
        b(bx, 0.0, bz, bw, bh, bd, rng.choice(PALETTE["limestone"]), "East_Outer_Ground")
    # Rubble / gravel clusters.
    for _ in range(16):
        b(
            rng.uniform(6.8, 14.6),
            0.0,
            rng.uniform(1.4, 3.0),
            rng.uniform(0.12, 0.3),
            rng.uniform(0.04, 0.12),
            rng.uniform(0.12, 0.3),
            rng.choice(PALETTE["limestone"] + PALETTE["bedrock"]),
            "East_Outer_Ground",
        )
    # Damp mud puddles.
    for px, pz, pw, pd in [(8.0, 2.8, 0.8, 0.45), (10.6, 2.1, 0.65, 0.4), (13.2, 2.9, 0.7, 0.4)]:
        b(px, 0.0, pz, pw, 0.02, pd, "4a3e33", "East_Outer_Ground")
    # Sparse dry scrub / moss tufts.
    for _ in range(9):
        b(
            rng.uniform(6.9, 14.4),
            0.0,
            rng.uniform(1.5, 3.0),
            rng.uniform(0.1, 0.2),
            rng.uniform(0.06, 0.14),
            rng.uniform(0.1, 0.2),
            rng.choice(PALETTE["scrub"]),
            "East_Outer_Ground",
        )
    # Ashlar slabs.
    for sx, sz in [(7.8, 2.2), (10.4, 2.7), (12.9, 2.0)]:
        b(sx, 0.0, sz, 0.5, 0.06, 0.4, "7e858a", "East_Outer_Ground")
    # Small rusted iron drums and discarded rail sections.
    for dx, dz in [(7.4, 2.5), (9.6, 2.9), (13.6, 2.3)]:
        b(dx, 0.0, dz, 0.24, 0.2, 0.24, "6e4e3a", "East_Outer_Ground")
    for rx, rz in [(8.8, 1.8), (11.8, 2.5)]:
        b(rx, 0.0, rz, 0.7, 0.05, 0.08, "524a46", "East_Outer_Ground")


def build_north_mine_and_rift(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Stepped limestone mine wall facade, shifted south so tops stay in viewport.
    # Every tall box keeps z + d <= -5.52.
    for tier in range(4):
        b(
            -6.4,
            tier * 1.02,
            -10.8 + tier * 0.9,
            12.8,
            1.02,
            1.0,
            rng.choice(PALETTE["limestone"]),
            "Landmark_Quarry_Mine_Rift",
        )
    # Varied stepped quarry cliff edges (not flat bars) along the top.
    for i, cx in enumerate(np.arange(-6.0, 6.1, 1.2)):
        h = 3.9 + (i % 3) * 0.18
        b(
            float(cx),
            3.9,
            -8.4,
            0.9,
            h - 3.9,
            1.4,
            rng.choice(PALETTE["limestone"]),
            "Landmark_Quarry_Mine_Rift",
        )
    # Timber roof beams over the mine wall.
    for bx in np.arange(-6.0, 6.1, 1.6):
        b(float(bx), 3.9, -8.4, 0.2, 0.2, 2.6, "5e4631", "North_Mine_Roof_Beams")
    # Central timber-supported tunnel mouth, scaled and shifted south so tops fit viewport.
    b(-2.2, 0.0, -6.38, 4.4, 1.58, 0.82, "1b1026", "Landmark_Quarry_Mine_Rift")
    for dx in (-2.4, 2.2):
        b(dx, 0.0, -6.18, 0.3, 1.62, 0.3, "4a3625", "North_Tunnel_Timber")
    b(-2.5, 1.48, -6.18, 5.0, 0.24, 0.36, "5e4631", "North_Tunnel_Timber")
    # Black-violet cave deep shadow.
    b(-2.0, 0.0, -8.4, 4.0, 1.6, 2.1, "1b1026", "North_Cave_Deep_Shadow")
    # Jagged black-violet rift fissure, z + d <= -5.52 and top inside viewport.
    for i in range(9):
        b(
            -0.5 + rng.uniform(-0.4, 0.4),
            0.14 + i * 0.13,
            -6.08,
            rng.uniform(0.22, 0.52),
            0.14,
            0.52,
            rng.choice(PALETTE["rift"][:3]),
            "Landmark_Quarry_Mine_Rift",
            glow=True,
        )
    # Floating pulsing crystal cluster with unified pivot inside top viewport.
    pivot = (0.0, 0.72, -5.80)
    for i in range(9):
        ang = i * math.tau / 9
        b(
            math.cos(ang) * 0.65 - 0.1,
            0.32 + (i % 3) * 0.18,
            -5.82 + math.sin(ang) * 0.16 - 0.1,
            0.2,
            0.36 + (i % 3) * 0.14,
            0.2,
            rng.choice(PALETTE["rift"][2:]),
            "Motion_Quarry_Rift_Crystal",
            glow=True,
            pivot=pivot,
        )
    b(
        -0.18,
        0.55,
        -5.94,
        0.36,
        0.55,
        0.34,
        "c49eff",
        "Motion_Quarry_Rift_Crystal",
        glow=True,
        pivot=pivot,
    )
    # Broken rails emerging from the mine mouth.
    for i in range(6):
        b(
            -1.2 + i * 0.5,
            0.1,
            -6.4 + (i % 2) * 0.1,
            0.5,
            0.08,
            0.12,
            "524a46",
            "North_Broken_Rails",
        )
    # Scattered crystal shards and broken chain on the ground.
    for _ in range(16):
        b(
            rng.uniform(-5.0, 5.0),
            0.0,
            rng.uniform(-10.4, -6.0),
            rng.uniform(0.1, 0.24),
            rng.uniform(0.08, 0.2),
            rng.uniform(0.1, 0.24),
            rng.choice(PALETTE["rift"][2:]),
            "North_Rift_Debris",
            glow=rng.random() < 0.5,
        )
    for i in range(8):
        b(
            -3.0 + i * 0.3,
            0.0,
            -6.6 + (i % 2) * 0.2,
            0.2,
            0.12,
            0.2,
            "524a46",
            "North_Rift_Debris",
        )


def build_south_foreground(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Low foreground band z in [5.65, 8.6], strictly y + h <= 0.40.
    for x in np.arange(-6.0, 6.1, 1.1):
        b(
            float(x),
            0.0,
            5.75 + rng.uniform(0.0, 0.3),
            rng.uniform(0.4, 0.8),
            rng.uniform(0.06, 0.16),
            rng.uniform(0.35, 0.6),
            rng.choice(PALETTE["mud"] + PALETTE["limestone"]),
            "South_Rutted_Approach",
        )
    # Toppled work sign.
    b(-3.4, 0.0, 6.6, 0.1, 0.4, 0.1, "4a3625", "South_Work_Sign")
    b(-3.4, 0.1, 6.6, 0.9, 0.28, 0.08, "8a7c63", "South_Work_Sign")
    # Low stone edging.
    for x in np.arange(-5.5, 5.6, 1.4):
        b(float(x), 0.0, 8.2, 0.9, 0.2, 0.3, "5c636b", "South_Stone_Edge")
    # Deeper band z in [8.8, 13.2], strictly z + d <= 13.4, y + h <= 0.90.
    for tier in range(3):
        b(
            -6.0,
            tier * 0.28,
            8.8 + tier * 1.4,
            12.0,
            0.28,
            1.6,
            rng.choice(PALETTE["limestone"]),
            "South_Low_Terrace",
        )
    # Mud ruts.
    for rut_x in (-2.4, 2.4):
        b(rut_x, 0.0, 9.2, 0.5, 0.06, 3.6, "4a3e33", "South_Mud_Ruts")
    # Old broken wheel.
    wx, wz = 2.4, 11.0
    for i in range(12):
        ang = i * math.tau / 12
        b(
            wx + math.cos(ang) * 0.7 - 0.1,
            0.4 + math.sin(ang) * 0.7,
            wz - 0.1,
            0.2,
            0.2,
            0.2,
            "5e4631",
            "South_Broken_Wheel",
        )
    # Scattered rubble.
    for _ in range(14):
        b(
            rng.uniform(-5.8, 5.8),
            0.0,
            rng.uniform(9.0, 12.8),
            rng.uniform(0.2, 0.5),
            rng.uniform(0.1, 0.3),
            rng.uniform(0.2, 0.5),
            rng.choice(PALETTE["limestone"]),
            "South_Rubble",
        )


def place_module_box(
    model,
    ox,
    oz,
    rot90,
    mirror_x,
    height_scale,
    lx,
    ly,
    lz,
    lw,
    lh,
    ld,
    color,
    group,
    glow=False,
):
    """Place a box inside a 4.6x4.6 module, applying mirror, rotation, scale, offset."""
    s = 4.6
    # Mirror x within the module.
    if mirror_x:
        lx = s - (lx + lw)
    # Rotate clockwise by rot90 * 90 degrees around module center.
    r = rot90 % 4
    for _ in range(r):
        # Clockwise rotation: (x, z) -> (z, s - x - w) with w/d swap.
        lx, lz = lz, s - (lx + lw)
        lw, ld = ld, lw
    # Scale height.
    ly = ly * height_scale
    lh = lh * height_scale
    # Translate to world.
    wx = ox + lx
    wz = oz + lz
    safe_prop_box(model, wx, ly, wz, lw, lh, ld, color, group, glow=glow)


def outer_strata_cliff(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Strata_Cliff"
    # Four stepped strata tiers.
    for tier in range(4):
        w = 4.4 - tier * 0.6
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            (4.6 - w) / 2,
            tier * 0.55,
            0.2 + tier * 0.15,
            w,
            0.55,
            4.2 - tier * 0.3,
            rng.choice(PALETTE["limestone"]),
            g,
        )
    # Scattered rubble on the base.
    for _ in range(10):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.2, 4.0),
            0.0,
            rng.uniform(0.2, 4.0),
            rng.uniform(0.3, 0.7),
            rng.uniform(0.2, 0.5),
            rng.uniform(0.3, 0.7),
            rng.choice(PALETTE["limestone"]),
            g,
        )
    # A few dark bedrock chips.
    for _ in range(6):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.3, 4.0),
            0.0,
            rng.uniform(0.3, 4.0),
            rng.uniform(0.2, 0.4),
            rng.uniform(0.1, 0.25),
            rng.uniform(0.2, 0.4),
            rng.choice(PALETTE["bedrock"]),
            g,
        )


def outer_rubble_and_rails(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Rubble_And_Rails"
    # Rubble field.
    for _ in range(20):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.2, 4.2),
            0.0,
            rng.uniform(0.2, 4.2),
            rng.uniform(0.2, 0.6),
            rng.uniform(0.1, 0.4),
            rng.uniform(0.2, 0.6),
            rng.choice(PALETTE["limestone"] + PALETTE["bedrock"]),
            g,
        )
    # Rail sleepers.
    for i in range(7):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.4 + i * 0.55,
            0.1,
            2.0,
            0.5,
            0.08,
            0.12,
            "524a46",
            g,
        )
    # Rail posts.
    for i in range(4):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.9 + i * 0.9,
            0.2,
            1.8,
            0.1,
            0.1,
            0.6,
            "6e4e3a",
            g,
        )
    # A couple of iron spikes.
    for _ in range(4):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.5, 4.0),
            0.0,
            rng.uniform(0.5, 4.0),
            0.08,
            0.18,
            0.08,
            "3b4047",
            g,
        )


def outer_pine_outcrop(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Pine_Outcrop"
    # Rock outcrop base.
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 0.4, 0.0, 0.4, 3.8, 0.8, 3.8, "5c636b", g
    )
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 0.8, 0.8, 0.8, 3.0, 0.4, 3.0, "6d747b", g
    )
    # Three pines of varied heights.
    for px, pz, ph in [(1.2, 1.2, 1.8), (2.8, 1.8, 1.2), (2.0, 3.0, 1.5)]:
        place_module_box(
            model, ox, oz, rot90, mirror_x, height_scale, px, 0.8, pz, 0.16, ph, 0.16, "4a3625", g
        )
        for layer in range(3):
            w = 0.9 - layer * 0.22
            place_module_box(
                model,
                ox,
                oz,
                rot90,
                mirror_x,
                height_scale,
                px - w / 2,
                0.8 + ph * 0.5 + layer * 0.3,
                pz - w / 2,
                w,
                0.26,
                w,
                rng.choice(PALETTE["pine"]),
                g,
            )
    # Small stones around the base.
    for _ in range(6):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.3, 4.0),
            0.0,
            rng.uniform(0.3, 4.0),
            rng.uniform(0.2, 0.4),
            rng.uniform(0.1, 0.25),
            rng.uniform(0.2, 0.4),
            rng.choice(PALETTE["limestone"]),
            g,
        )


def outer_retaining_ruin(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Retaining_Ruin"
    # Retaining wall segments of varied heights.
    for i in range(8):
        h = 0.8 + (i % 3) * 0.2
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.3 + i * 0.55,
            0.0,
            0.4,
            0.5,
            h,
            0.5,
            rng.choice(PALETTE["limestone"]),
            g,
        )
    # Stone arch culvert.
    for i in range(7):
        ang = math.pi * i / 6
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            2.2 + math.cos(ang) * 0.9,
            0.4 + math.sin(ang) * 0.9,
            2.4,
            0.3,
            0.3,
            0.5,
            "6d747b",
            g,
        )
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 1.2, 0.0, 2.2, 0.4, 0.9, 0.6, "5c636b", g
    )
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 3.2, 0.0, 2.2, 0.4, 0.9, 0.6, "5c636b", g
    )
    # Fallen blocks.
    for _ in range(5):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.5, 4.0),
            0.0,
            rng.uniform(2.8, 4.2),
            rng.uniform(0.3, 0.5),
            rng.uniform(0.2, 0.4),
            rng.uniform(0.3, 0.5),
            rng.choice(PALETTE["limestone"]),
            g,
        )


def outer_crystal_seep(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Crystal_Seep"
    # Dark slate base.
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 0.3, 0.0, 0.3, 4.0, 0.3, 4.0, "464d57", g
    )
    # Glowing crystal shards.
    for _ in range(14):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.5, 4.0),
            0.3,
            rng.uniform(0.5, 4.0),
            rng.uniform(0.1, 0.24),
            rng.uniform(0.1, 0.4),
            rng.uniform(0.1, 0.24),
            rng.choice(PALETTE["rift"][2:]),
            g,
            glow=True,
        )
    # Abandoned warning posts.
    for px in (1.0, 3.4):
        place_module_box(
            model, ox, oz, rot90, mirror_x, height_scale, px, 0.3, 1.0, 0.14, 0.9, 0.14, "4a3625", g
        )
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            px - 0.1,
            1.0,
            0.95,
            0.34,
            0.2,
            0.06,
            "e89c48",
            g,
            glow=True,
        )
    # A few dark chips.
    for _ in range(5):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.4, 4.0),
            0.3,
            rng.uniform(0.4, 4.0),
            rng.uniform(0.15, 0.3),
            rng.uniform(0.08, 0.2),
            rng.uniform(0.15, 0.3),
            rng.choice(PALETTE["bedrock"]),
            g,
        )


def build_varied_outer_rim(model, rng):
    modules = [
        outer_strata_cliff,
        outer_rubble_and_rails,
        outer_pine_outcrop,
        outer_retaining_ruin,
        outer_crystal_seep,
    ]
    # West rim: two columns at ox=-19.6 and ox=-24.2.
    west_layout = [
        (0, -19.6, -15.6, 0, False, 1.0),
        (1, -19.6, -10.4, 1, False, 1.0),
        (2, -19.6, -5.2, 2, True, 1.2),
        (3, -19.6, 0.0, 3, False, 1.0),
        (4, -19.6, 5.2, 0, True, 1.0),
        (0, -19.6, 10.4, 1, False, 1.1),
        (2, -24.2, -15.6, 2, False, 1.4),
        (3, -24.2, -10.4, 3, True, 1.0),
        (4, -24.2, -5.2, 0, False, 1.0),
        (0, -24.2, 0.0, 1, True, 1.2),
        (1, -24.2, 5.2, 2, False, 1.0),
        (2, -24.2, 10.4, 3, True, 1.3),
    ]
    # East rim: two columns at ox=15.0 and ox=19.6, different sequence.
    east_layout = [
        (4, 15.0, -15.6, 1, True, 1.0),
        (3, 15.0, -10.4, 2, False, 1.1),
        (2, 15.0, -5.2, 3, True, 1.0),
        (1, 15.0, 0.0, 0, False, 1.2),
        (0, 15.0, 5.2, 1, True, 1.0),
        (4, 15.0, 10.4, 2, False, 1.0),
        (1, 19.6, -15.6, 3, False, 1.0),
        (0, 19.6, -10.4, 0, True, 1.3),
        (4, 19.6, -5.2, 1, False, 1.0),
        (3, 19.6, 0.0, 2, True, 1.1),
        (2, 19.6, 5.2, 3, False, 1.0),
        (1, 19.6, 10.4, 0, True, 1.2),
    ]
    # North rim at oz=-16.2.
    north_layout = [
        (1, -14.6, -16.2, 0, False, 1.0),
        (2, -9.6, -16.2, 1, True, 1.1),
        (3, -4.6, -16.2, 2, False, 1.0),
        (4, 0.4, -16.2, 3, True, 1.2),
        (0, 5.4, -16.2, 0, False, 1.0),
        (2, 10.4, -16.2, 1, True, 1.1),
    ]
    # South rim at oz=13.6, height_scale=0.6.
    south_layout = [
        (3, -14.6, 13.6, 2, False, 0.6),
        (4, -9.6, 13.6, 3, True, 0.6),
        (0, -4.6, 13.6, 0, False, 0.6),
        (1, 0.4, 13.6, 1, True, 0.6),
        (2, 5.4, 13.6, 2, False, 0.6),
        (3, 10.4, 13.6, 3, True, 0.6),
    ]
    for layout in (west_layout, east_layout, north_layout, south_layout):
        for idx, ox, oz, rot90, mirror_x, height_scale in layout:
            modules[idx](model, rng, ox, oz, rot90, mirror_x, height_scale)


def build_quarry_preview(rng):
    preview = Model("Quarry diorama preview / graystone-quarry", cards=False)
    for ix in range(-10, 11):
        for iz in range(-8, 9):
            if abs(ix) + abs(iz) > 15 or (abs(ix) > 8 and abs(iz) > 5):
                continue
            x, z = ix * 0.4, iz * 0.4
            depth = 0.5 + rng.choice([0, 0.2, 0.4])
            preview.box(x, -depth, z, 0.39, depth, 0.39, "2a2f36", "Floating_Bedrock")
            preview.box(
                x,
                0,
                z,
                0.39,
                0.14,
                0.39,
                rng.choice(PALETTE["limestone"]),
                "Terrain",
            )

    # Organic irregular scattered rubble stones and subtle wheel ruts on the courtyard.
    for _ in range(26):
        preview.box(
            rng.uniform(-1.4, 1.4),
            0.14,
            rng.uniform(-1.4, 1.6),
            rng.uniform(0.08, 0.22),
            rng.uniform(0.03, 0.08),
            rng.uniform(0.08, 0.22),
            rng.choice(PALETTE["limestone"] + PALETTE["bedrock"]),
            "Surface_Chips",
        )
    for rut_x in (-0.55, 0.55):
        preview.box(rut_x, 0.14, -1.2, 0.1, 0.02, 2.6, "4a3e33", "Surface_Chips")

    # North sculpted stepped quarry cliff tiers, timber mine portal and jagged glowing rift.
    # Shifted LEFT to center x ~ -0.6 so (9, 8, 12) sightline into the rift stays clear.
    strata = [
        # (x, y, z, w, h, d, color) - staggered non-uniform strata forming natural quarry steps
        (-3.15, 0.14, -3.05, 1.55, 1.05, 1.05, PALETTE["limestone"][0]),
        (-3.05, 1.19, -2.95, 1.35, 0.85, 0.85, PALETTE["limestone"][1]),
        (-2.75, 2.04, -2.85, 0.95, 0.45, 0.65, PALETTE["limestone"][2]),
        (-1.60, 0.14, -3.05, 2.15, 0.55, 0.95, PALETTE["bedrock"][2]),
        (-1.75, 2.18, -2.90, 2.35, 0.48, 0.72, PALETTE["limestone"][1]),
        (-1.55, 2.66, -2.85, 1.45, 0.36, 0.54, PALETTE["limestone"][2]),
        (-0.05, 2.52, -2.82, 1.15, 0.44, 0.52, PALETTE["limestone"][3]),
        (0.55, 0.14, -2.95, 1.35, 1.35, 0.90, PALETTE["limestone"][0]),
        (0.75, 1.49, -2.88, 1.10, 0.68, 0.72, PALETTE["limestone"][2]),
        (1.65, 0.14, -2.75, 0.85, 0.82, 0.75, PALETTE["bedrock"][2]),
        (1.85, 0.96, -2.68, 0.55, 0.42, 0.56, PALETTE["limestone"][1]),
    ]
    for sx, sy, sz, sw, sh, sd, sc in strata:
        preview.box(sx, sy, sz, sw, sh, sd, sc, "Preview_Mine_Wall")
    # Asymmetric rugged quarry crag caps (avoid flat battlements).
    crags = [
        (-2.55, 2.49, -2.75, 0.42, 0.34, 0.38, PALETTE["limestone"][3]),
        (-1.95, 2.66, -2.72, 0.56, 0.28, 0.44, PALETTE["limestone"][2]),
        (-1.12, 3.02, -2.78, 0.62, 0.38, 0.42, PALETTE["limestone"][3]),
        (-0.38, 2.96, -2.76, 0.48, 0.26, 0.38, PALETTE["limestone"][2]),
        (0.35, 2.17, -2.74, 0.52, 0.46, 0.42, PALETTE["limestone"][1]),
        (1.18, 2.17, -2.72, 0.46, 0.32, 0.40, PALETTE["limestone"][3]),
    ]
    for cx0, cy0, cz0, cw, ch, cd, cc in crags:
        preview.box(cx0, cy0, cz0, cw, ch, cd, cc, "Preview_Mine_Wall")
    # Vertical cut-stone portal buttresses.
    for bx, bh in [(-1.82, 2.15), (0.58, 1.98)]:
        preview.box(bx, 0.14, -2.42, 0.26, bh, 0.42, "5c636b", "Preview_Mine_Wall")
    # Deep mine tunnel mouth + heavy timber portal braces.
    preview.box(-1.56, 0.14, -2.92, 2.14, 2.04, 0.82, "1b1026", "Preview_Tunnel")
    for dx in (-1.56, 0.36):
        preview.box(dx, 0.14, -2.26, 0.22, 2.04, 0.24, "4a3625", "Preview_Tunnel_Timber")
    preview.box(-1.68, 2.04, -2.32, 2.38, 0.22, 0.34, "5e4631", "Preview_Tunnel_Timber")
    preview.box(-1.62, 1.84, -2.48, 0.18, 0.18, 0.46, "73573d", "Preview_Tunnel_Timber")
    preview.box(0.42, 1.84, -2.48, 0.18, 0.18, 0.46, "73573d", "Preview_Tunnel_Timber")
    # Diagonal jagged glowing violet dimensional fissure inside tunnel + crystal cluster.
    fissure_steps = [
        (-0.88, 0.26, -2.26, 0.20, 0.28, 0.12, "4c1d95"),
        (-0.76, 0.48, -2.23, 0.26, 0.34, 0.14, "7b2cbf"),
        (-0.60, 0.76, -2.20, 0.30, 0.38, 0.14, "9d4edd"),
        (-0.46, 1.08, -2.18, 0.28, 0.36, 0.14, "c49eff"),
        (-0.34, 1.38, -2.20, 0.22, 0.30, 0.12, "9d4edd"),
        (-0.24, 1.64, -2.24, 0.14, 0.24, 0.10, "7b2cbf"),
        (-0.82, 0.96, -2.24, 0.16, 0.22, 0.10, "7b2cbf"),
        (-0.18, 0.72, -2.24, 0.16, 0.24, 0.10, "7b2cbf"),
    ]
    for fx, fy, fz, fw, fh, fd, fc in fissure_steps:
        preview.box(fx, fy, fz, fw, fh, fd, fc, "Preview_Rift", glow=True)
    crystal_shards = [
        (-0.96, 0.16, -1.96, 0.14, 0.34, 0.14, "9d4edd"),
        (-0.72, 0.16, -1.88, 0.18, 0.48, 0.16, "c49eff"),
        (-0.44, 0.16, -1.94, 0.16, 0.38, 0.16, "9d4edd"),
        (-0.18, 0.16, -2.02, 0.12, 0.26, 0.12, "7b2cbf"),
    ]
    for sx, sy, sz, sw, sh, sd, sc in crystal_shards:
        preview.box(sx, sy, sz, sw, sh, sd, sc, "Preview_Rift_Crystal", glow=True)
    # Two crooked grey-needle quarry pines prominently perched on the northwest & mid-left ledges.
    for px, py, pz, ph in [(-2.72, 1.19, -2.22, 0.72), (-2.38, 2.04, -2.42, 0.78)]:
        preview.box(px - 0.05, py, pz - 0.05, 0.10, ph, 0.10, "4a3625", "Preview_Mine_Wall")
        for layer in range(3):
            w = 0.56 - layer * 0.14
            preview.box(
                px - w / 2,
                py + ph * 0.48 + layer * 0.20,
                pz - w / 2,
                w,
                0.18,
                w,
                rng.choice(PALETTE["pine"]),
                "Preview_Mine_Wall",
            )

    # West terrace: tier 1 flat and spacious (top y = 0.54) for the crane.
    preview.box(-3.1, 0.14, -0.7, 1.5, 0.4, 2.3, PALETTE["limestone"][0], "Preview_Terrace")
    preview.box(-2.80, 0.14, -0.25, 1.30, 0.40, 1.15, PALETTE["limestone"][1], "Preview_Terrace")
    # Higher upper cliff steps pushed cleanly west/northwest.
    preview.box(-3.1, 0.54, -0.5, 0.3, 0.4, 1.9, PALETTE["limestone"][2], "Preview_Terrace")
    preview.box(-3.1, 0.94, -0.3, 0.3, 0.35, 1.5, PALETTE["limestone"][3], "Preview_Terrace")
    # Crane stands cleanly on tier 1 surface y = 0.54 at (-2.15, 0.35).
    cx, cz = -2.15, 0.35
    for side in (-1, 1):
        for step in range(4):
            t = step / 3.0
            preview.box(
                cx + side * (0.42 - t * 0.32) - 0.06,
                0.54 + t * 1.4,
                cz - 0.06,
                0.12,
                0.45,
                0.12,
                "5e4631",
                "Preview_Crane",
            )
    preview.box(cx - 0.45, 1.95, cz - 0.08, 0.9, 0.14, 0.16, "73573d", "Preview_Crane")
    preview.box(cx - 0.05, 1.45, cz - 0.05, 0.1, 0.5, 0.1, "3b4047", "Preview_Crane")
    preview.box(cx - 0.26, 0.98, cz - 0.26, 0.52, 0.48, 0.52, "6d747b", "Preview_Crane")

    # East open-rafter shed + grounded sloped canvas windbreak, positioned right/forward-east
    # so the sightline from (9, 8, 12) into the North Rift stays 100% clear.
    preview.box(1.65, 0.14, -0.55, 1.45, 0.2, 1.4, "5c636b", "Preview_Shed_Base")
    for dx in (1.75, 2.75):
        for dz in (-0.45, 0.65):
            preview.box(dx - 0.08, 0.34, dz - 0.08, 0.16, 1.0, 0.16, "4a3625", "Preview_Shed")
    # Open rafters.
    for rx in np.arange(1.7, 2.9, 0.4):
        preview.box(float(rx), 1.34, -0.5, 0.1, 0.1, 1.3, "5e4631", "Preview_Shed_Roof")
    for rz in np.arange(-0.45, 0.7, 0.4):
        preview.box(1.65, 1.44, float(rz), 1.3, 0.08, 0.08, "73573d", "Preview_Shed_Roof")
    # Staggered partial shingles.
    for rx in np.arange(1.7, 2.9, 0.3):
        for rz in np.arange(-0.45, 0.7, 0.3):
            if rng.random() < 0.55:
                preview.box(
                    float(rx),
                    1.52,
                    float(rz),
                    0.26,
                    0.05,
                    0.26,
                    rng.choice(["5c636b", "6d747b", "4a515b"]),
                    "Preview_Shed_Roof",
                )
    # Grounded slanted canvas windbreak leaning from East Shed eave down onto shed pad.
    for pz in (-0.36, 0.58):
        for seg in range(4):
            preview.box(
                2.78 + seg * 0.07,
                1.20 - seg * 0.24,
                pz,
                0.08,
                0.28,
                0.08,
                "4a3625",
                "Preview_Canvas",
            )
    for step in range(4):
        preview.box(
            2.76 + step * 0.07,
            1.22 - step * 0.22,
            -0.42,
            0.14,
            0.06,
            1.14,
            ["9c8f76", "8a7c63", "9c8f76", "756852"][step],
            "Preview_Canvas",
        )
    preview.box(2.1, 0.14, -1.2, 0.5, 0.4, 0.5, "464d57", "Preview_Anchor")
    for i in range(5):
        preview.box(1.9 - i * 0.22, 0.16, -1.0, 0.16, 0.14, 0.16, "6e4e3a", "Preview_Chain")

    # Central minecart on straight rails, centered near x ~ 0.15.
    for z in np.arange(-1.2, 1.3, 0.3):
        preview.box(-0.45, 0.14, float(z), 1.2, 0.06, 0.12, "524a46", "Preview_Rails")
    for x in (-0.35, 0.65):
        preview.box(x, 0.2, -1.25, 0.06, 0.08, 2.5, "6e4e3a", "Preview_Rails")
    for x in (-0.25, 0.55):
        for z in (-0.3, 0.3):
            preview.box(x, 0.28, z, 0.12, 0.2, 0.2, "3b4047", "Minecart")
    preview.box(-0.3, 0.48, -0.4, 0.9, 0.1, 0.8, "5e4631", "Minecart")
    for x in (-0.3, 0.5):
        preview.box(x, 0.58, -0.4, 0.1, 0.4, 0.8, "73573d", "Minecart")
    for z in (-0.4, 0.3):
        preview.box(-0.3, 0.58, z, 0.9, 0.4, 0.1, "73573d", "Minecart")
    for _ in range(6):
        preview.box(
            rng.uniform(-0.15, 0.45),
            0.98,
            rng.uniform(-0.2, 0.2),
            0.18,
            rng.uniform(0.12, 0.3),
            0.16,
            "7e858a",
            "Minecart",
        )

    # Southwest fence checkpoint with stone brazier.
    for i in range(5):
        preview.box(-3.4 + i * 0.4, 0.14, 2.4, 0.12, 0.6, 0.12, "5e4631", "Preview_Fence")
        if i < 4:
            preview.box(-3.4 + i * 0.4, 0.5, 2.4, 0.4, 0.08, 0.08, "73573d", "Preview_Fence")
    bx, bz = -2.4, 2.8
    preview.box(bx - 0.26, 0.14, bz - 0.26, 0.52, 0.18, 0.52, "443f40", "Brazier")
    preview.box(bx - 0.12, 0.32, bz - 0.12, 0.24, 0.45, 0.24, "aa9163", "Brazier")
    for i in range(4):
        w = 0.42 - i * 0.08
        preview.box(
            bx - w / 2,
            0.77 + i * 0.12,
            bz - w / 2,
            w,
            0.14,
            w,
            ["f28e45", "ffc66a", "ffe4a0", "fff0ba"][i],
            "Flame",
            True,
        )

    preview.finish("preview-graystone-quarry.glb", source="建模工具/build_graystone_quarry.py")
    return preview


def main():
    rng = random.Random(20261119)
    model = Model("Wanxiang_Graystone_Quarry", cards=True)
    build_central_board(model, rng)
    build_west_wing(model, rng)
    build_east_wing(model, rng)
    build_north_mine_and_rift(model, rng)
    build_south_foreground(model, rng)
    build_varied_outer_rim(model, rng)
    counts = model.finish(
        "graystone-quarry.glb",
        source="建模工具/build_graystone_quarry.py",
        metadata={
            "biome": "graystone-quarry",
            "titleZh": "灰岩旧采石场",
            "motionNodes": [
                "Motion_Quarry_Rift_Crystal",
                "Motion_Quarry_Crane_Load",
            ],
            "peripheryLayout": {
                "mode": "authored-large",
                "uniqueSpan": [17.5, 24.0],
                "uniqueBounds": {"x": [-24.2, 24.2], "z": [-18.2, 18.2]},
                "zones": [
                    "west-watchtower-checkpoint",
                    "west-terraced-quarry-crane",
                    "west-chute-and-vent-shaft",
                    "east-smuggling-cart-dock",
                    "east-tarpaulin-shed-and-trough",
                    "east-broken-shackle-bollard",
                    "north-mine-tunnel-and-rift",
                    "south-rutted-approach",
                    "far-outer-strata-clusters",
                ],
                "mirroredRight": False,
                "bounds": {"x": 24.2, "z": 18.2},
                "patches": 1,
                "boxes": len(model.boxes),
            },
        },
    )
    print("Graystone Quarry components:", len(counts), "groups")
    print("Graystone Quarry boxes:", len(model.boxes))

    preview_rng = random.Random(20261119)
    preview = build_quarry_preview(preview_rng)
    print("Graystone Quarry preview boxes:", len(preview.boxes))


if __name__ == "__main__":
    main()
