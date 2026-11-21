"""Build the City Market (灯影商街 / city-market) voxel battlefield and its miniature preview."""

import math
import random

import numpy as np

from build_realms import Model

PALETTE = {
    "cobble": ["6e737b", "85898f", "9a9b99", "b3aa99"],
    "slate": ["454c56", "535b66", "3c424c"],
    "timber": ["4d3826", "694c33", "826040"],
    "terracotta": ["9e4b3a", "b55d47", "853d30"],
    "cobalt": ["3b5d8a", "4a6f9e", "2f4a70"],
    "emerald": ["4c7b5f", "5d8f70", "3c6349"],
    "burgundy": ["8c3b46", "a04a55", "6f2d36"],
    "cream": ["e8dcc2", "d8c9a8", "f0e6d0"],
    "saffron": ["c9933b", "d9a44c", "b07f2e"],
    "water": ["67b0bd", "8ed3de", "4f97a4"],
    "foliage": ["486b42", "628752", "3a5735"],
    "flowers": ["d97468", "e6bd5c", "c95f52"],
    "lamp": ["f5c878", "ffe7a3", "e8b45c"],
    "brass": ["c89854", "b8863f", "d9ab68"],
    "iron": ["3b4047", "524a46", "2e3238"],
    "bedrock": ["2a2f36", "383f48", "464d57"],
    "stone": ["5c636b", "6d747b", "7e858a", "91979b"],
}


def build_central_board(model, rng):
    model.box(-25.0, -0.56, -19.0, 50.0, 0.52, 38.0, "2a2f36", "00_Deep_City_Bedrock")
    model.box(-24.2, -0.04, -18.2, 48.4, 0.04, 36.4, "4d5259", "01_City_Street_Base")

    # Friendly half (z > 0.02): warm dressed limestone cobblestones.
    cobble_cols = PALETTE["cobble"]
    z_cursor = 0.02
    row = 0
    while z_cursor < 5.42:
        depth = 0.44
        x_cursor = -6.44
        offset = (row % 3) * 0.34
        first = 0.88 + offset
        col = 0
        while x_cursor < 6.44:
            pw = first if col == 0 else 1.28
            w = min(pw - 0.03, 6.44 - x_cursor)
            d = min(depth - 0.03, 5.44 - z_cursor)
            if w > 0.06 and d > 0.06:
                h = 0.102 if (row + col) % 4 == 0 else 0.098
                color = cobble_cols[(row * 3 + col) % len(cobble_cols)]
                model.box(x_cursor, 0.0, z_cursor, w, h, d, color, "02_Central_Market_Cobbles")
            x_cursor += pw
            col += 1
        z_cursor += depth
        row += 1

    # Subtle drainage curbs running along the friendly half.
    for rut_x in (-1.62, 1.62):
        z = 0.14
        while z < 5.36:
            seg = rng.uniform(0.34, 0.6)
            model.box(
                rut_x - 0.09 + rng.uniform(-0.02, 0.02),
                0.1,
                z,
                0.18,
                0.006,
                seg,
                rng.choice(["5c636b", "6d747b"]),
                "02_Central_Market_Cobbles",
            )
            z += seg + rng.uniform(0.02, 0.06)

    # Enemy half (z < -0.02): cooler dusk-slate cobblestones.
    slate_cols = PALETTE["slate"]
    z_cursor = -5.44
    row = 0
    while z_cursor < -0.02:
        depth = 0.5
        x_cursor = -6.44
        stagger = 0.32 if row % 2 else 0.0
        col = 0
        while x_cursor < 6.44:
            tw = (0.78 + stagger) if col == 0 else 0.94
            w = min(tw - 0.03, 6.44 - x_cursor)
            d = min(depth - 0.03, -0.02 - z_cursor)
            if w > 0.06 and d > 0.06:
                color = slate_cols[(row * 5 + col) % len(slate_cols)]
                model.box(x_cursor, 0.0, z_cursor, w, 0.098, d, color, "03_Enemy_Shaded_Cobbles")
            x_cursor += tw
            col += 1
        z_cursor += depth
        row += 1

    # Scattered warm fallen petals / leaves on the enemy half.
    for _ in range(64):
        vx = rng.uniform(-6.0, 6.0)
        vz = rng.uniform(-5.2, -0.2)
        if min(abs(vx - cx) for cx in (-3.014, 0.0, 3.014)) < 1.2 and abs(vz + 2.345) < 1.6:
            continue
        model.box(
            vx,
            0.099,
            vz,
            rng.uniform(0.05, 0.16),
            0.01,
            rng.uniform(0.04, 0.12),
            rng.choice(PALETTE["flowers"] + PALETTE["saffron"]),
            "03_Enemy_Shaded_Cobbles",
        )

    # Center line: stepped pale ashlar crosswalk stones across z in [-0.22, 0.22].
    cross_cols = ["b3aa99", "9a9b99", "c2b9a6"]
    x = -6.3
    idx = 0
    while x < 6.3:
        w = rng.uniform(0.34, 0.52)
        model.box(
            x,
            0.1,
            -0.22,
            w,
            0.01,
            0.44,
            cross_cols[idx % len(cross_cols)],
            "04_Center_Crosswalk_Inlay",
        )
        x += w + 0.04
        idx += 1
    # Small low brass survey medallion at (0,0).
    model.box(-0.18, 0.1, -0.18, 0.36, 0.03, 0.36, "c89854", "04_Center_Crosswalk_Inlay")
    model.box(-0.08, 0.13, -0.08, 0.16, 0.02, 0.16, "b8863f", "04_Center_Crosswalk_Inlay")

    # Six grounded card foundations.
    for z in (-2.345, 2.345):
        for x in (-3.014, 0.0, 3.014):
            base_col = "3c424c" if z < 0 else "6e737b"
            top_col = "535b66" if z < 0 else "85898f"
            model.box(
                x - 1.12, 0.0, z - 1.54, 2.24, 0.10, 3.08, base_col, "Six_Grounded_Foundations"
            )
            model.box(
                x - 1.05, 0.10, z - 1.47, 2.10, 0.06, 2.94, top_col, "Six_Grounded_Foundations"
            )
            model.ring(x, 0.16, z, 0.52, "9a9b99", 0.035, "Revealed_Dais_Engraving")
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
                            "f5c878",
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


def build_north_market_archway(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Twin arched stone pillars, z in [-6.35, -5.54], top y <= 1.56.
    for px in (-2.6, 2.6):
        for tier in range(4):
            b(
                px - 0.42 + tier * 0.02,
                tier * 0.38,
                -6.3,
                0.84 - tier * 0.04,
                0.38,
                0.72,
                rng.choice(PALETTE["stone"]),
                "Landmark_Market_Archway",
            )
        # Carved capital.
        b(px - 0.5, 1.52, -6.32, 1.0, 0.04, 0.76, "91979b", "Landmark_Market_Archway")
    # Low carved lintel beam spanning the pillars.
    b(-3.1, 1.28, -6.28, 6.2, 0.24, 0.68, "7e858a", "Landmark_Market_Archway")
    b(-2.9, 1.4, -6.26, 5.8, 0.12, 0.6, "91979b", "Landmark_Market_Archway")
    # Carved relief blocks on the lintel.
    for i, cx in enumerate(np.arange(-2.4, 2.5, 0.8)):
        b(float(cx), 1.3, -6.34, 0.5, 0.16, 0.06, "b3aa99", "Landmark_Market_Archway")
    # Wrought-iron hanging warm glow lanterns under the lintel.
    for lx in (-1.6, 0.0, 1.6):
        b(lx - 0.03, 1.16, -6.0, 0.06, 0.12, 0.06, "3b4047", "Landmark_Market_Archway")
        b(
            lx - 0.12,
            0.94,
            -6.06,
            0.24,
            0.22,
            0.24,
            "f5c878",
            "Landmark_Market_Archway_Glow",
            glow=True,
        )
        b(lx - 0.14, 1.16, -6.08, 0.28, 0.05, 0.28, "3b4047", "Landmark_Market_Archway")
    # Stone flower planters flanking the pillars.
    for px in (-3.6, 3.6):
        b(px - 0.4, 0.0, -6.2, 0.8, 0.34, 0.6, "6d747b", "Landmark_Market_Archway")
        b(px - 0.34, 0.34, -6.14, 0.68, 0.06, 0.48, "4a3e33", "Landmark_Market_Archway")
        for _ in range(5):
            b(
                px - 0.3 + rng.uniform(0.0, 0.6),
                0.4,
                -6.1 + rng.uniform(0.0, 0.4),
                rng.uniform(0.08, 0.16),
                rng.uniform(0.08, 0.16),
                rng.uniform(0.08, 0.16),
                rng.choice(PALETTE["flowers"] + PALETTE["foliage"]),
                "Landmark_Market_Archway",
            )
    # Swaying brass guild signboard with pivot.
    pivot = (0.0, 1.08, -5.76)
    b(-0.03, 1.02, -5.78, 0.06, 0.06, 0.06, "3b4047", "Motion_Market_Signboard", pivot=pivot)
    b(-0.75, 0.44, -5.88, 1.5, 0.58, 0.24, "c89854", "Motion_Market_Signboard", pivot=pivot)
    b(-0.66, 0.52, -5.86, 1.32, 0.42, 0.2, "b8863f", "Motion_Market_Signboard", pivot=pivot)
    b(-0.5, 0.62, -5.84, 1.0, 0.22, 0.16, "d9ab68", "Motion_Market_Signboard", pivot=pivot)


def build_west_wing(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )

    # 1) Southwest: West_Lantern_Workshop.
    wx, wz = -11.4, 3.4
    b(wx - 1.6, 0.0, wz - 1.6, 3.2, 0.16, 3.2, "6d747b", "West_Lantern_Workshop")
    # Half-timbered walls.
    for dx in (-1.5, 1.5):
        for dz in (-1.5, 1.5):
            b(wx + dx - 0.1, 0.16, wz + dz - 0.1, 0.2, 1.5, 0.2, "4d3826", "West_Lantern_Workshop")
    b(wx - 1.5, 0.16, wz - 1.5, 3.0, 0.9, 0.16, "826040", "West_Lantern_Workshop")
    b(wx - 1.5, 0.16, wz + 1.34, 3.0, 0.9, 0.16, "826040", "West_Lantern_Workshop")
    b(wx - 1.5, 0.16, wz - 1.5, 0.16, 0.9, 3.0, "826040", "West_Lantern_Workshop")
    # Open-beam dormer with skylight showing glowing interior lamp.
    b(wx - 1.4, 1.06, wz - 1.4, 2.8, 0.1, 2.8, "694c33", "West_Lantern_Workshop")
    for rx in np.arange(wx - 1.3, wx + 1.3, 0.5):
        b(float(rx), 1.16, wz - 1.4, 0.1, 0.1, 2.8, "4d3826", "West_Lantern_Workshop")
    # Stepped partial terracotta roof tiles (~55% coverage).
    for rx in np.arange(wx - 1.4, wx + 1.4, 0.34):
        for rz in np.arange(wz - 1.4, wz + 1.4, 0.34):
            if rng.random() < 0.55:
                b(
                    float(rx),
                    1.26,
                    float(rz),
                    0.3,
                    0.08,
                    0.3,
                    rng.choice(PALETTE["terracotta"]),
                    "West_Lantern_Workshop",
                )
    # Glowing interior lamp visible through skylight.
    b(wx - 0.2, 0.16, wz - 0.2, 0.4, 0.5, 0.4, "f5c878", "West_Lantern_Glow", glow=True)
    # Exterior rack of glowing amber/cream paper lanterns.
    for i, lz in enumerate(np.arange(wz - 1.2, wz + 1.3, 0.5)):
        b(wx + 1.6, 0.16, float(lz), 0.1, 1.2, 0.1, "4d3826", "West_Lantern_Workshop")
        b(
            wx + 1.55,
            0.9 + (i % 2) * 0.1,
            float(lz) - 0.12,
            0.2,
            0.24,
            0.24,
            rng.choice(PALETTE["lamp"]),
            "West_Lantern_Glow",
            glow=True,
        )
    b(wx + 1.5, 1.3, wz - 1.2, 0.1, 0.08, 2.5, "694c33", "West_Lantern_Workshop")
    # Open-rim handcart filled with goods.
    cx, cz = wx - 2.4, wz + 0.6
    for wx2 in (cx - 0.4, cx + 0.4):
        b(wx2 - 0.1, 0.16, cz - 0.5, 0.2, 0.2, 0.2, "3b4047", "West_Lantern_Workshop")
    b(cx - 0.5, 0.36, cz - 0.6, 1.0, 0.1, 1.2, "694c33", "West_Lantern_Workshop")
    for ox in (cx - 0.5, cx + 0.4):
        b(ox, 0.46, cz - 0.6, 0.1, 0.3, 1.2, "826040", "West_Lantern_Workshop")
    for oz in (cz - 0.6, cz + 0.5):
        b(cx - 0.5, 0.46, oz, 1.0, 0.3, 0.1, "826040", "West_Lantern_Workshop")
    for _ in range(4):
        b(
            cx - 0.3 + rng.uniform(0.0, 0.6),
            0.5,
            cz - 0.4 + rng.uniform(0.0, 0.8),
            rng.uniform(0.14, 0.24),
            rng.uniform(0.12, 0.22),
            rng.uniform(0.14, 0.24),
            rng.choice(PALETTE["saffron"] + PALETTE["cream"]),
            "West_Lantern_Workshop",
        )

    # 2) Mid-W: West_Apothecary_Fountain.
    fx, fz = -10.6, -0.4
    # Octagonal stone plaza fountain base.
    for i in range(8):
        ang = i * math.tau / 8
        b(
            fx + math.cos(ang) * 1.1 - 0.2,
            0.0,
            fz + math.sin(ang) * 1.1 - 0.2,
            0.4,
            0.3,
            0.4,
            "6d747b",
            "West_Apothecary_Fountain",
        )
    b(fx - 0.9, 0.0, fz - 0.9, 1.8, 0.3, 1.8, "7e858a", "West_Apothecary_Fountain")
    # Stepped glowing cyan-blue water tiers.
    b(fx - 0.7, 0.3, fz - 0.7, 1.4, 0.12, 1.4, "67b0bd", "West_Fountain_Water_Glow", glow=True)
    b(fx - 0.45, 0.42, fz - 0.45, 0.9, 0.12, 0.9, "8ed3de", "West_Fountain_Water_Glow", glow=True)
    b(fx - 0.2, 0.54, fz - 0.2, 0.4, 0.3, 0.4, "7e858a", "West_Apothecary_Fountain")
    b(fx - 0.12, 0.84, fz - 0.12, 0.24, 0.12, 0.24, "8ed3de", "West_Fountain_Water_Glow", glow=True)
    # Emerald/cream striped sloped cloth awning on angled timber poles.
    for i, px in enumerate(np.arange(fx - 1.6, fx + 1.7, 0.55)):
        b(float(px), 0.0, fz + 1.5, 0.1, 1.4, 0.1, "4d3826", "West_Apothecary_Fountain")
        b(float(px), 1.3, fz + 1.4, 0.1, 0.1, 0.5, "694c33", "West_Apothecary_Fountain")
    for step in range(4):
        b(
            fx - 1.7,
            1.4 - step * 0.12,
            fz + 1.0 + step * 0.14,
            3.4,
            0.06,
            0.16,
            PALETTE["emerald"][step % 3] if step % 2 == 0 else PALETTE["cream"][step % 3],
            "West_Apothecary_Fountain",
        )
    # Apothecary jar table & herb crates.
    b(fx + 1.9, 0.0, fz + 0.4, 0.9, 0.4, 0.7, "694c33", "West_Apothecary_Fountain")
    for _ in range(5):
        b(
            fx + 1.95 + rng.uniform(0.0, 0.7),
            0.4,
            fz + 0.45 + rng.uniform(0.0, 0.5),
            rng.uniform(0.1, 0.16),
            rng.uniform(0.14, 0.24),
            rng.uniform(0.1, 0.16),
            rng.choice(PALETTE["water"] + PALETTE["flowers"]),
            "West_Apothecary_Fountain",
        )
    b(fx + 1.9, 0.0, fz - 0.6, 0.7, 0.5, 0.6, "826040", "West_Apothecary_Fountain")
    b(fx + 1.95, 0.5, fz - 0.55, 0.6, 0.1, 0.5, "628752", "West_Apothecary_Fountain")

    # 3) NW: West_Clock_Bookshop.
    bx, bz = -10.2, -4.2
    b(bx - 1.5, 0.0, bz - 1.2, 3.0, 0.2, 2.4, "6d747b", "West_Clock_Bookshop")
    for dx in (-1.4, 1.4):
        for dz in (-1.1, 1.1):
            b(bx + dx - 0.1, 0.2, bz + dz - 0.1, 0.2, 1.6, 0.2, "4d3826", "West_Clock_Bookshop")
    b(bx - 1.4, 0.2, bz - 1.1, 2.8, 1.0, 0.16, "826040", "West_Clock_Bookshop")
    b(bx - 1.4, 0.2, bz + 0.94, 2.8, 1.0, 0.16, "826040", "West_Clock_Bookshop")
    # Glowing warm window bay.
    b(bx - 0.6, 0.5, bz + 0.9, 1.2, 0.6, 0.1, "f5c878", "West_Bookshop_Window_Glow", glow=True)
    b(bx - 0.7, 0.4, bz + 0.86, 1.4, 0.1, 0.14, "4d3826", "West_Clock_Bookshop")
    # Stepped slate gable.
    for step in range(4):
        b(
            bx - 1.4 + step * 0.3,
            1.2 + step * 0.28,
            bz - 1.1,
            2.8 - step * 0.6,
            0.28,
            2.2,
            rng.choice(PALETTE["slate"]),
            "West_Clock_Bookshop",
        )
    # Spinning brass rooftop weathervane.
    pivot = (-9.1, 2.75, -4.4)
    b(-9.14, 2.4, -4.44, 0.08, 0.4, 0.08, "3b4047", "Motion_Market_Weathervane", pivot=pivot)
    b(-9.5, 2.75, -4.44, 0.8, 0.06, 0.06, "c89854", "Motion_Market_Weathervane", pivot=pivot)
    b(-9.14, 2.75, -4.8, 0.06, 0.06, 0.8, "c89854", "Motion_Market_Weathervane", pivot=pivot)
    b(-9.2, 2.9, -4.5, 0.12, 0.12, 0.12, "b8863f", "Motion_Market_Weathervane", pivot=pivot)
    b(-9.14, 3.05, -4.44, 0.08, 0.1, 0.08, "d9ab68", "Motion_Market_Weathervane", pivot=pivot)

    # 4) West wing floor dressing: cobbles, curbs, crates, barrels, planters,
    #    book-display tables, fountain basin steps, benches, bollards & lantern posts.
    # Cobblestone walkway tiles across bare wing floor (x in [-14.8, -6.65]).
    for _ in range(46):
        tx = rng.uniform(-14.6, -6.9)
        tz = rng.uniform(-5.2, 5.2)
        b(
            tx,
            0.0,
            tz,
            rng.uniform(0.3, 0.55),
            rng.uniform(0.06, 0.12),
            rng.uniform(0.3, 0.55),
            rng.choice(PALETTE["cobble"]),
            "West_Walkway_Cobbles",
        )
    # Stepped stone curbstones lining the walkway.
    for _ in range(18):
        cx0 = rng.uniform(-14.6, -6.9)
        cz0 = rng.uniform(-5.2, 5.2)
        b(
            cx0,
            0.0,
            cz0,
            rng.uniform(0.5, 0.9),
            rng.uniform(0.1, 0.18),
            rng.uniform(0.16, 0.24),
            rng.choice(PALETTE["stone"]),
            "West_Curbstones",
        )
    # Stacked market crates & wine barrels.
    for _ in range(14):
        sx0 = rng.uniform(-14.4, -7.0)
        sz0 = rng.uniform(-5.0, 5.0)
        b(
            sx0,
            0.0,
            sz0,
            rng.uniform(0.3, 0.45),
            rng.uniform(0.3, 0.45),
            rng.uniform(0.3, 0.45),
            rng.choice(PALETTE["timber"]),
            "West_Market_Crates",
        )
        if rng.random() < 0.5:
            b(
                sx0 + rng.uniform(-0.05, 0.05),
                0.45,
                sz0 + rng.uniform(-0.05, 0.05),
                rng.uniform(0.24, 0.36),
                rng.uniform(0.24, 0.36),
                rng.uniform(0.24, 0.36),
                rng.choice(PALETTE["timber"] + PALETTE["cream"]),
                "West_Market_Crates",
            )
    for _ in range(10):
        bx0 = rng.uniform(-14.4, -7.0)
        bz0 = rng.uniform(-5.0, 5.0)
        b(bx0, 0.0, bz0, 0.34, 0.44, 0.34, "694c33", "West_Wine_Barrels")
        b(bx0 - 0.02, 0.16, bz0 - 0.02, 0.38, 0.06, 0.38, "3b4047", "West_Wine_Barrels")
        b(bx0 - 0.02, 0.34, bz0 - 0.02, 0.38, 0.06, 0.38, "3b4047", "West_Wine_Barrels")
    # Flower planter boxes.
    for _ in range(10):
        px0 = rng.uniform(-14.4, -7.0)
        pz0 = rng.uniform(-5.0, 5.0)
        b(px0, 0.0, pz0, 0.6, 0.26, 0.4, "694c33", "West_Flower_Planters")
        for _ in range(3):
            b(
                px0 + rng.uniform(0.05, 0.5),
                0.26,
                pz0 + rng.uniform(0.05, 0.3),
                0.1,
                0.1,
                0.1,
                rng.choice(PALETTE["flowers"] + PALETTE["foliage"]),
                "West_Flower_Planters",
            )
    # Exterior bookshop book-display tables.
    for _ in range(6):
        dx0 = rng.uniform(-14.2, -7.2)
        dz0 = rng.uniform(-5.0, 5.0)
        b(dx0, 0.0, dz0, 0.9, 0.36, 0.6, "694c33", "West_Book_Display_Tables")
        b(dx0 + 0.05, 0.36, dz0 + 0.05, 0.8, 0.06, 0.5, "826040", "West_Book_Display_Tables")
        for _ in range(4):
            b(
                dx0 + rng.uniform(0.08, 0.7),
                0.42,
                dz0 + rng.uniform(0.08, 0.42),
                rng.uniform(0.1, 0.16),
                rng.uniform(0.06, 0.12),
                rng.uniform(0.14, 0.22),
                rng.choice(PALETTE["burgundy"] + PALETTE["cobalt"] + PALETTE["emerald"]),
                "West_Book_Display_Tables",
            )
    # Fountain stone basin steps.
    for step in range(3):
        b(
            fx - 1.3 - step * 0.18,
            0.0,
            fz - 1.3 - step * 0.18,
            2.6 + step * 0.36,
            0.1 + step * 0.06,
            2.6 + step * 0.36,
            rng.choice(PALETTE["stone"]),
            "West_Fountain_Basin_Steps",
        )
    # Wooden market benches.
    for _ in range(8):
        bx0 = rng.uniform(-14.2, -7.2)
        bz0 = rng.uniform(-5.0, 5.0)
        b(bx0, 0.0, bz0, 1.1, 0.1, 0.3, "694c33", "West_Market_Benches")
        b(bx0 + 0.05, 0.1, bz0 + 0.05, 1.0, 0.06, 0.2, "826040", "West_Market_Benches")
        for lx0 in (bx0 + 0.05, bx0 + 0.9):
            b(lx0, 0.0, bz0 + 0.05, 0.1, 0.1, 0.2, "4d3826", "West_Market_Benches")
    # Street bollards & lantern posts.
    for _ in range(12):
        bx0 = rng.uniform(-14.4, -7.0)
        bz0 = rng.uniform(-5.0, 5.0)
        b(bx0, 0.0, bz0, 0.2, 0.34, 0.2, "7e858a", "West_Street_Bollards")
        b(bx0 - 0.03, 0.34, bz0 - 0.03, 0.26, 0.04, 0.26, "91979b", "West_Street_Bollards")
    for _ in range(6):
        lx0 = rng.uniform(-14.2, -7.2)
        lz0 = rng.uniform(-5.0, 5.0)
        b(lx0, 0.0, lz0, 0.12, 1.2, 0.12, "3b4047", "West_Lantern_Posts")
        b(lx0 - 0.06, 1.2, lz0 - 0.06, 0.24, 0.24, 0.24, "f5c878", "West_Lantern_Glow", glow=True)
        b(lx0 - 0.08, 1.44, lz0 - 0.08, 0.28, 0.05, 0.28, "3b4047", "West_Lantern_Posts")


def build_east_wing(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )

    # 1) SE: East_Bakery_Cafe.
    bx, bz = 10.4, 3.6
    b(bx - 1.8, 0.0, bz - 1.6, 3.6, 0.24, 3.2, "6d747b", "East_Bakery_Cafe")
    # Balustrade.
    for px in np.arange(bx - 1.7, bx + 1.8, 0.4):
        b(float(px), 0.24, bz + 1.4, 0.12, 0.4, 0.12, "7e858a", "East_Bakery_Cafe")
    b(bx - 1.7, 0.6, bz + 1.36, 3.5, 0.1, 0.16, "91979b", "East_Bakery_Cafe")
    # Open ribbed burgundy/cream pergola canopy.
    for px in np.arange(bx - 1.6, bx + 1.7, 0.5):
        b(float(px), 0.24, bz - 1.4, 0.1, 1.4, 0.1, "4d3826", "East_Bakery_Cafe")
    for step in range(4):
        b(
            bx - 1.7,
            1.5 - step * 0.1,
            bz - 1.5 + step * 0.1,
            3.4,
            0.06,
            0.14,
            PALETTE["burgundy"][step % 3] if step % 2 == 0 else PALETTE["cream"][step % 3],
            "East_Bakery_Cafe",
        )
    # Wooden tables & stools.
    for tx in (bx - 1.0, bx + 0.6):
        b(tx, 0.24, bz - 0.2, 0.8, 0.1, 0.6, "694c33", "East_Bakery_Cafe")
        b(tx + 0.1, 0.34, bz - 0.1, 0.6, 0.06, 0.4, "826040", "East_Bakery_Cafe")
        for sx in (tx - 0.1, tx + 0.7):
            b(sx, 0.24, bz + 0.5, 0.2, 0.2, 0.2, "4d3826", "East_Bakery_Cafe")
    # Oven hearth glow.
    b(bx + 1.2, 0.24, bz - 1.2, 0.5, 0.6, 0.5, "5c636b", "East_Bakery_Cafe")
    b(bx + 1.25, 0.34, bz - 1.15, 0.4, 0.4, 0.4, "f5c878", "East_Bakery_Hearth_Glow", glow=True)
    # Flower boxes.
    for fx in (bx - 1.6, bx + 1.4):
        b(fx, 0.24, bz + 1.2, 0.4, 0.2, 0.3, "694c33", "East_Bakery_Cafe")
        for _ in range(3):
            b(
                fx + rng.uniform(0.0, 0.3),
                0.44,
                bz + 1.2 + rng.uniform(0.0, 0.2),
                0.1,
                0.1,
                0.1,
                rng.choice(PALETTE["flowers"]),
                "East_Bakery_Cafe",
            )

    # 2) Mid-E: East_Silk_Bazaar - three staggered asymmetric stalls.
    stalls = [
        (8.2, 0.2, PALETTE["cobalt"]),
        (10.6, -0.6, PALETTE["saffron"]),
        (12.8, 0.6, PALETTE["emerald"]),
    ]
    for sx, sz, cols in stalls:
        b(sx - 0.9, 0.0, sz - 0.7, 1.8, 0.3, 1.4, "694c33", "East_Silk_Bazaar")
        for px in (sx - 0.85, sx + 0.75):
            b(px, 0.3, sz - 0.65, 0.1, 1.1, 0.1, "4d3826", "East_Silk_Bazaar")
        for step in range(3):
            b(
                sx - 0.9,
                1.3 - step * 0.12,
                sz - 0.7 + step * 0.12,
                1.8,
                0.06,
                0.14,
                cols[step % 3],
                "East_Silk_Bazaar",
            )
        # Folded cloth rolls & pottery on the table.
        for _ in range(4):
            b(
                sx - 0.7 + rng.uniform(0.0, 1.3),
                0.3,
                sz - 0.5 + rng.uniform(0.0, 1.0),
                rng.uniform(0.12, 0.22),
                rng.uniform(0.1, 0.2),
                rng.uniform(0.12, 0.22),
                rng.choice(cols + PALETTE["cream"]),
                "East_Silk_Bazaar",
            )
    # Parked open-bed wooden merchant wagon with spoked wheels & barrels.
    wx, wz = 11.4, 2.4
    b(wx - 1.0, 0.3, wz - 0.5, 2.0, 0.1, 1.0, "694c33", "East_Silk_Bazaar")
    for ox in (wx - 1.0, wx + 0.9):
        b(ox, 0.4, wz - 0.5, 0.1, 0.3, 1.0, "826040", "East_Silk_Bazaar")
    for oz in (wz - 0.5, wz + 0.4):
        b(wx - 1.0, 0.4, oz, 2.0, 0.3, 0.1, "826040", "East_Silk_Bazaar")
    for wxx in (wx - 0.7, wx + 0.7):
        for i in range(8):
            ang = i * math.tau / 8
            b(
                wxx + math.cos(ang) * 0.28 - 0.06,
                0.3 + math.sin(ang) * 0.28,
                wz - 0.55,
                0.12,
                0.12,
                0.1,
                "4d3826",
                "East_Silk_Bazaar",
            )
    for _ in range(3):
        b(
            wx - 0.6 + rng.uniform(0.0, 1.2),
            0.4,
            wz - 0.3 + rng.uniform(0.0, 0.6),
            rng.uniform(0.2, 0.3),
            rng.uniform(0.2, 0.3),
            rng.uniform(0.2, 0.3),
            rng.choice(PALETTE["saffron"] + PALETTE["cobalt"]),
            "East_Silk_Bazaar",
        )

    # 3) NE: East_Guild_Courtyard.
    gx, gz = 10.6, -4.4
    b(gx - 1.8, 0.0, gz - 1.4, 3.6, 0.2, 2.8, "6d747b", "East_Guild_Courtyard")
    # Stone merchant arcade with open timber rafters & partial terracotta tiles.
    for px in np.arange(gx - 1.7, gx + 1.8, 0.6):
        b(float(px), 0.2, gz - 1.3, 0.16, 1.4, 0.16, "5c636b", "East_Guild_Courtyard")
    for rx in np.arange(gx - 1.7, gx + 1.8, 0.5):
        b(float(rx), 1.6, gz - 1.4, 0.1, 0.1, 2.8, "4d3826", "East_Guild_Courtyard")
    for rx in np.arange(gx - 1.7, gx + 1.8, 0.34):
        for rz in np.arange(gz - 1.4, gz + 1.4, 0.34):
            if rng.random() < 0.55:
                b(
                    float(rx),
                    1.7,
                    float(rz),
                    0.3,
                    0.08,
                    0.3,
                    rng.choice(PALETTE["terracotta"]),
                    "East_Guild_Courtyard",
                )
    # Cargo crates & bales inside.
    for _ in range(5):
        b(
            gx - 1.4 + rng.uniform(0.0, 2.6),
            0.2,
            gz - 1.0 + rng.uniform(0.0, 2.0),
            rng.uniform(0.3, 0.5),
            rng.uniform(0.3, 0.5),
            rng.uniform(0.3, 0.5),
            rng.choice(PALETTE["timber"] + PALETTE["cream"]),
            "East_Guild_Courtyard",
        )
    # Rope winch.
    b(gx + 1.2, 0.2, gz + 0.8, 0.4, 0.4, 0.4, "4d3826", "East_Guild_Courtyard")
    b(gx + 1.3, 0.6, gz + 0.9, 0.2, 0.2, 0.2, "3b4047", "East_Guild_Courtyard")
    # Wrought-iron gate pillar.
    b(gx - 1.9, 0.0, gz + 1.2, 0.3, 1.2, 0.3, "3b4047", "East_Guild_Courtyard")
    b(gx - 1.95, 1.2, gz + 1.15, 0.4, 0.1, 0.4, "524a46", "East_Guild_Courtyard")
    # Glowing street brazier.
    b(gx + 1.6, 0.0, gz - 1.0, 0.4, 0.3, 0.4, "3b4047", "East_Guild_Courtyard")
    b(gx + 1.65, 0.3, gz - 0.95, 0.3, 0.3, 0.3, "f5c878", "East_Guild_Brazier_Glow", glow=True)
    # Potted laurel trees.
    for px in (gx - 1.4, gx + 1.4):
        b(px - 0.2, 0.2, gz + 1.0, 0.4, 0.3, 0.4, "9e4b3a", "East_Guild_Courtyard")
        b(px - 0.05, 0.5, gz + 1.15, 0.1, 0.5, 0.1, "4d3826", "East_Guild_Courtyard")
        for layer in range(2):
            w = 0.5 - layer * 0.15
            b(
                px - w / 2,
                0.9 + layer * 0.2,
                gz + 1.15 - w / 2,
                w,
                0.2,
                w,
                rng.choice(PALETTE["foliage"]),
                "East_Guild_Courtyard",
            )
    # Varied low street cobbles/planters/barrels across empty wing floor.
    for _ in range(10):
        b(
            rng.uniform(7.0, 14.4),
            0.0,
            rng.uniform(-2.0, 1.6),
            rng.uniform(0.2, 0.4),
            rng.uniform(0.06, 0.14),
            rng.uniform(0.2, 0.4),
            rng.choice(PALETTE["cobble"]),
            "East_Guild_Courtyard",
        )
    for _ in range(4):
        b(
            rng.uniform(7.2, 14.2),
            0.0,
            rng.uniform(-1.8, 1.4),
            0.3,
            0.4,
            0.3,
            "694c33",
            "East_Guild_Courtyard",
        )

    # 4) East wing floor dressing: cobbles, curbs, crates, barrels, planters,
    #    display tables, basin steps, benches, bollards & lantern posts.
    # Cobblestone walkway tiles across bare wing floor (x in [6.65, 14.8]).
    for _ in range(46):
        tx = rng.uniform(6.9, 14.6)
        tz = rng.uniform(-5.2, 5.2)
        b(
            tx,
            0.0,
            tz,
            rng.uniform(0.3, 0.55),
            rng.uniform(0.06, 0.12),
            rng.uniform(0.3, 0.55),
            rng.choice(PALETTE["cobble"]),
            "East_Walkway_Cobbles",
        )
    # Stepped stone curbstones lining the walkway.
    for _ in range(18):
        cx0 = rng.uniform(6.9, 14.6)
        cz0 = rng.uniform(-5.2, 5.2)
        b(
            cx0,
            0.0,
            cz0,
            rng.uniform(0.5, 0.9),
            rng.uniform(0.1, 0.18),
            rng.uniform(0.16, 0.24),
            rng.choice(PALETTE["stone"]),
            "East_Curbstones",
        )
    # Stacked market crates & wine barrels.
    for _ in range(14):
        sx0 = rng.uniform(7.0, 14.4)
        sz0 = rng.uniform(-5.0, 5.0)
        b(
            sx0,
            0.0,
            sz0,
            rng.uniform(0.3, 0.45),
            rng.uniform(0.3, 0.45),
            rng.uniform(0.3, 0.45),
            rng.choice(PALETTE["timber"]),
            "East_Market_Crates",
        )
        if rng.random() < 0.5:
            b(
                sx0 + rng.uniform(-0.05, 0.05),
                0.45,
                sz0 + rng.uniform(-0.05, 0.05),
                rng.uniform(0.24, 0.36),
                rng.uniform(0.24, 0.36),
                rng.uniform(0.24, 0.36),
                rng.choice(PALETTE["timber"] + PALETTE["cream"]),
                "East_Market_Crates",
            )
    for _ in range(10):
        bx0 = rng.uniform(7.0, 14.4)
        bz0 = rng.uniform(-5.0, 5.0)
        b(bx0, 0.0, bz0, 0.34, 0.44, 0.34, "694c33", "East_Wine_Barrels")
        b(bx0 - 0.02, 0.16, bz0 - 0.02, 0.38, 0.06, 0.38, "3b4047", "East_Wine_Barrels")
        b(bx0 - 0.02, 0.34, bz0 - 0.02, 0.38, 0.06, 0.38, "3b4047", "East_Wine_Barrels")
    # Flower planter boxes.
    for _ in range(10):
        px0 = rng.uniform(7.0, 14.4)
        pz0 = rng.uniform(-5.0, 5.0)
        b(px0, 0.0, pz0, 0.6, 0.26, 0.4, "694c33", "East_Flower_Planters")
        for _ in range(3):
            b(
                px0 + rng.uniform(0.05, 0.5),
                0.26,
                pz0 + rng.uniform(0.05, 0.3),
                0.1,
                0.1,
                0.1,
                rng.choice(PALETTE["flowers"] + PALETTE["foliage"]),
                "East_Flower_Planters",
            )
    # Exterior display tables.
    for _ in range(6):
        dx0 = rng.uniform(7.2, 14.2)
        dz0 = rng.uniform(-5.0, 5.0)
        b(dx0, 0.0, dz0, 0.9, 0.36, 0.6, "694c33", "East_Display_Tables")
        b(dx0 + 0.05, 0.36, dz0 + 0.05, 0.8, 0.06, 0.5, "826040", "East_Display_Tables")
        for _ in range(4):
            b(
                dx0 + rng.uniform(0.08, 0.7),
                0.42,
                dz0 + rng.uniform(0.08, 0.42),
                rng.uniform(0.1, 0.16),
                rng.uniform(0.06, 0.12),
                rng.uniform(0.14, 0.22),
                rng.choice(PALETTE["saffron"] + PALETTE["cobalt"] + PALETTE["cream"]),
                "East_Display_Tables",
            )
    # Fountain stone basin steps (east side accent).
    ex, ez = 12.6, -1.6
    for step in range(3):
        b(
            ex - 1.1 - step * 0.16,
            0.0,
            ez - 1.1 - step * 0.16,
            2.2 + step * 0.32,
            0.1 + step * 0.06,
            2.2 + step * 0.32,
            rng.choice(PALETTE["stone"]),
            "East_Fountain_Basin_Steps",
        )
    # Wooden market benches.
    for _ in range(8):
        bx0 = rng.uniform(7.2, 14.2)
        bz0 = rng.uniform(-5.0, 5.0)
        b(bx0, 0.0, bz0, 1.1, 0.1, 0.3, "694c33", "East_Market_Benches")
        b(bx0 + 0.05, 0.1, bz0 + 0.05, 1.0, 0.06, 0.2, "826040", "East_Market_Benches")
        for lx0 in (bx0 + 0.05, bx0 + 0.9):
            b(lx0, 0.0, bz0 + 0.05, 0.1, 0.1, 0.2, "4d3826", "East_Market_Benches")
    # Street bollards & lantern posts.
    for _ in range(12):
        bx0 = rng.uniform(7.0, 14.4)
        bz0 = rng.uniform(-5.0, 5.0)
        b(bx0, 0.0, bz0, 0.2, 0.34, 0.2, "7e858a", "East_Street_Bollards")
        b(bx0 - 0.03, 0.34, bz0 - 0.03, 0.26, 0.04, 0.26, "91979b", "East_Street_Bollards")
    for _ in range(6):
        lx0 = rng.uniform(7.2, 14.2)
        lz0 = rng.uniform(-5.0, 5.0)
        b(lx0, 0.0, lz0, 0.12, 1.2, 0.12, "3b4047", "East_Lantern_Posts")
        b(lx0 - 0.06, 1.2, lz0 - 0.06, 0.24, 0.24, 0.24, "f5c878", "East_Lantern_Glow", glow=True)
        b(lx0 - 0.08, 1.44, lz0 - 0.08, 0.28, 0.05, 0.28, "3b4047", "East_Lantern_Posts")


def build_south_foreground(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Low approach cobbles z in [5.65, 8.6], y + h <= 0.38.
    for x in np.arange(-6.0, 6.1, 1.0):
        b(
            float(x),
            0.0,
            5.75 + rng.uniform(0.0, 0.3),
            rng.uniform(0.4, 0.8),
            rng.uniform(0.06, 0.16),
            rng.uniform(0.35, 0.6),
            rng.choice(PALETTE["cobble"] + PALETTE["stone"]),
            "South_Street_Approach",
        )
    # Crosswalk extension.
    for x in np.arange(-5.5, 5.6, 0.9):
        b(float(x), 0.0, 6.4, 0.7, 0.06, 0.5, "b3aa99", "South_Street_Approach")
    # Stone bollards.
    for bx in (-4.5, -1.5, 1.5, 4.5):
        b(bx - 0.15, 0.0, 7.4, 0.3, 0.34, 0.3, "7e858a", "South_Street_Approach")
        b(bx - 0.18, 0.34, 7.37, 0.36, 0.04, 0.36, "91979b", "South_Street_Approach")
    # Street flower troughs.
    for tx in (-3.0, 3.0):
        b(tx - 0.6, 0.0, 8.0, 1.2, 0.3, 0.4, "694c33", "South_Street_Approach")
        for _ in range(4):
            b(
                tx - 0.5 + rng.uniform(0.0, 1.0),
                0.3,
                8.0 + rng.uniform(0.0, 0.3),
                0.1,
                0.08,
                0.1,
                rng.choice(PALETTE["flowers"] + PALETTE["foliage"]),
                "South_Street_Approach",
            )
    # Outer terrace up to z=13.2.
    for tier in range(3):
        b(
            -6.0,
            tier * 0.24,
            8.8 + tier * 1.4,
            12.0,
            0.24,
            1.6,
            rng.choice(PALETTE["stone"]),
            "South_Low_Terrace",
        )
    for _ in range(12):
        b(
            rng.uniform(-5.8, 5.8),
            0.0,
            rng.uniform(9.0, 12.8),
            rng.uniform(0.2, 0.5),
            rng.uniform(0.1, 0.3),
            rng.uniform(0.2, 0.5),
            rng.choice(PALETTE["cobble"]),
            "South_Low_Terrace",
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
    if mirror_x:
        lx = s - (lx + lw)
    r = rot90 % 4
    for _ in range(r):
        lx, lz = lz, s - (lx + lw)
        lw, ld = ld, lw
    ly = ly * height_scale
    lh = lh * height_scale
    wx = ox + lx
    wz = oz + lz
    safe_prop_box(model, wx, ly, wz, lw, lh, ld, color, group, glow=glow)


def outer_rooftop_cluster(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Rooftop_Cluster"
    # Stepped building mass.
    for tier in range(3):
        w = 4.2 - tier * 0.7
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            (4.6 - w) / 2,
            tier * 0.7,
            0.3 + tier * 0.2,
            w,
            0.7,
            3.8 - tier * 0.4,
            rng.choice(PALETTE["stone"]),
            g,
        )
    # Stepped terracotta gable.
    for step in range(3):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.6 + step * 0.4,
            2.1 + step * 0.3,
            0.6,
            3.4 - step * 0.8,
            0.3,
            3.0,
            rng.choice(PALETTE["terracotta"]),
            g,
        )
    # Glowing windows.
    for _ in range(4):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.6, 3.4),
            rng.uniform(0.4, 1.6),
            0.2,
            0.3,
            0.3,
            0.1,
            rng.choice(PALETTE["lamp"]),
            g,
            glow=True,
        )
    # Chimney.
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 3.2, 2.1, 1.0, 0.4, 0.8, 0.4, "5c636b", g
    )


def outer_walled_courtyard(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Walled_Courtyard"
    # Perimeter wall.
    for i in range(8):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.3 + i * 0.55,
            0.0,
            0.3,
            0.5,
            0.7,
            0.4,
            rng.choice(PALETTE["stone"]),
            g,
        )
    for i in range(6):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.3,
            0.0,
            0.9 + i * 0.55,
            0.4,
            0.7,
            0.5,
            rng.choice(PALETTE["stone"]),
            g,
        )
    # Inner tree.
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 2.2, 0.0, 2.2, 0.16, 1.2, 0.16, "4d3826", g
    )
    for layer in range(3):
        w = 1.0 - layer * 0.25
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            2.2 - w / 2,
            0.9 + layer * 0.3,
            2.2 - w / 2,
            w,
            0.28,
            w,
            rng.choice(PALETTE["foliage"]),
            g,
        )
    # Well.
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 1.0, 0.0, 1.0, 0.6, 0.4, 0.6, "6d747b", g
    )


def outer_street_tree_pocket(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Street_Tree_Pocket"
    # Cobble pad.
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 0.4, 0.0, 0.4, 3.8, 0.1, 3.8, "85898f", g
    )
    # Trees.
    for px, pz, ph in [(1.2, 1.2, 1.6), (2.8, 2.4, 1.2)]:
        place_module_box(
            model, ox, oz, rot90, mirror_x, height_scale, px, 0.1, pz, 0.16, ph, 0.16, "4d3826", g
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
                0.1 + ph * 0.5 + layer * 0.28,
                pz - w / 2,
                w,
                0.26,
                w,
                rng.choice(PALETTE["foliage"]),
                g,
            )
    # Bench.
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 0.6, 0.1, 3.0, 1.2, 0.1, 0.3, "694c33", g
    )


def outer_tile_gable(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Tile_Gable"
    # Base building.
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 0.4, 0.0, 0.4, 3.8, 1.2, 3.8, "7e858a", g
    )
    # Stepped tile gable.
    for step in range(4):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.4 + step * 0.4,
            1.2 + step * 0.3,
            0.4,
            3.8 - step * 0.8,
            0.3,
            3.8,
            rng.choice(PALETTE["terracotta"]),
            g,
        )
    # Glowing window.
    place_module_box(
        model,
        ox,
        oz,
        rot90,
        mirror_x,
        height_scale,
        1.8,
        0.5,
        0.3,
        0.4,
        0.4,
        0.1,
        "f5c878",
        g,
        True,
    )


def outer_market_stall_row(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Market_Stall_Row"
    # Two staggered stalls.
    for i, sx in enumerate((0.5, 2.4)):
        place_module_box(
            model, ox, oz, rot90, mirror_x, height_scale, sx, 0.0, 1.0, 1.4, 0.3, 1.2, "694c33", g
        )
        for px in (sx, sx + 1.3):
            place_module_box(
                model,
                ox,
                oz,
                rot90,
                mirror_x,
                height_scale,
                px,
                0.3,
                1.0,
                0.1,
                1.0,
                0.1,
                "4d3826",
                g,
            )
        cols = PALETTE["cobalt"] if i == 0 else PALETTE["saffron"]
        for step in range(3):
            place_module_box(
                model,
                ox,
                oz,
                rot90,
                mirror_x,
                height_scale,
                sx,
                1.2 - step * 0.1,
                1.0 + step * 0.1,
                1.4,
                0.06,
                0.14,
                cols[step % 3],
                g,
            )
        for _ in range(3):
            place_module_box(
                model,
                ox,
                oz,
                rot90,
                mirror_x,
                height_scale,
                sx + rng.uniform(0.1, 1.1),
                0.3,
                1.1 + rng.uniform(0.0, 0.8),
                0.16,
                0.16,
                0.16,
                rng.choice(cols + PALETTE["cream"]),
                g,
            )


def build_varied_outer_rim(model, rng):
    modules = [
        outer_rooftop_cluster,
        outer_walled_courtyard,
        outer_street_tree_pocket,
        outer_tile_gable,
        outer_market_stall_row,
    ]
    # West rim clusters (x in [-24.2, -15.0]).
    west_layout = [
        (0, -19.6, -15.6, 0, False, 1.0),
        (1, -19.6, -10.5, 1, False, 1.0),
        (2, -19.6, -5.2, 2, True, 1.1),
        (3, -19.6, 0.0, 3, False, 1.0),
        (4, -19.6, 5.2, 0, True, 1.0),
        (0, -24.2, -15.6, 2, False, 1.2),
        (3, -24.2, -10.5, 3, True, 1.0),
        (1, -24.2, -5.2, 0, False, 1.0),
        (2, -24.2, 0.0, 1, True, 1.1),
        (4, -24.2, 5.2, 2, False, 1.0),
        (0, -24.2, 10.5, 3, True, 1.2),
        # Extra non-repeating west rim placements.
        (2, -19.6, 10.5, 1, False, 1.0),
        (3, -24.2, 15.6, 0, True, 1.0),
    ]
    # East rim clusters (x in [15.0, 24.2]) - different sequence.
    east_layout = [
        (4, 15.0, -15.6, 1, True, 1.0),
        (3, 15.0, -10.5, 2, False, 1.1),
        (2, 15.0, -5.2, 3, True, 1.0),
        (1, 15.0, 0.0, 0, False, 1.2),
        (0, 15.0, 5.2, 1, True, 1.0),
        (4, 19.6, -15.6, 3, False, 1.0),
        (0, 19.6, -10.5, 0, True, 1.2),
        (4, 19.6, -5.2, 1, False, 1.0),
        (3, 19.6, 0.0, 2, True, 1.1),
        (2, 19.6, 5.2, 3, False, 1.0),
        (1, 19.6, 10.5, 0, True, 1.2),
        # Extra non-repeating east rim placements.
        (0, 15.0, 10.5, 2, False, 1.0),
        (3, 24.2, -5.2, 1, True, 1.0),
    ]
    # North rim clusters (z in [-18.2, -10.5]).
    north_layout = [
        (1, -14.6, -16.2, 0, False, 1.0),
        (2, -9.6, -16.2, 1, True, 1.1),
        (3, -4.6, -16.2, 2, False, 1.0),
        (4, 0.4, -16.2, 3, True, 1.2),
        (0, 5.4, -16.2, 0, False, 1.0),
        (2, 10.4, -16.2, 1, True, 1.1),
        # Extra non-repeating north rim placements.
        (4, -19.6, -16.2, 2, False, 1.0),
        (1, 15.4, -16.2, 3, True, 1.0),
    ]
    # South rim clusters (z in [10.5, 18.2]).
    south_layout = [
        (3, -14.6, 13.6, 2, False, 0.7),
        (4, -9.6, 13.6, 3, True, 0.7),
        (0, -4.6, 13.6, 0, False, 0.7),
        (1, 0.4, 13.6, 1, True, 0.7),
        (2, 5.4, 13.6, 2, False, 0.7),
        (3, 10.4, 13.6, 3, True, 0.7),
        # Extra non-repeating south rim placements.
        (0, -19.6, 13.6, 1, False, 0.7),
        (4, 15.4, 13.6, 0, True, 0.7),
    ]
    for layout in (west_layout, east_layout, north_layout, south_layout):
        for idx, ox, oz, rot90, mirror_x, height_scale in layout:
            modules[idx](model, rng, ox, oz, rot90, mirror_x, height_scale)


def build_city_market_preview(rng):
    preview = Model("City market diorama preview / city-market", cards=False)
    # Floating beveled cobblestone plaza on dark brick cellar bedrock.
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
                rng.choice(PALETTE["cobble"]),
                "Terrain",
            )

    # Organic irregular scattered cobbles and subtle guide track on the plaza.
    for _ in range(26):
        preview.box(
            rng.uniform(-1.4, 1.4),
            0.14,
            rng.uniform(-1.4, 1.6),
            rng.uniform(0.08, 0.22),
            rng.uniform(0.03, 0.08),
            rng.uniform(0.08, 0.22),
            rng.choice(PALETTE["cobble"] + PALETTE["stone"]),
            "Surface_Chips",
        )
    # Flush street limestone cart-rut paving strips (city pavement, not railway).
    # Two shallow parallel ruts flanking a clear central path z in [-1.25, 1.25].
    rut_cols = ["b3aa99", "9a9b99", "c2b9a6", "85898f"]
    for z in np.arange(-1.25, 1.3, 0.3):
        for rut_x in (-0.42, 0.62):
            preview.box(
                rut_x,
                0.14,
                float(z),
                0.16,
                0.02,
                0.28,
                rng.choice(rut_cols),
                "Preview_Street_Paving",
            )
    # Pale limestone paving slabs filling the cart lane between the ruts.
    for z in np.arange(-1.25, 1.3, 0.34):
        preview.box(
            -0.24,
            0.14,
            float(z),
            0.84,
            0.015,
            0.3,
            rng.choice(["b3aa99", "c2b9a6", "9a9b99"]),
            "Preview_Street_Paving",
        )
    # Low flush kerb edging the paving lane (kept below cart wheels).
    for z in np.arange(-1.25, 1.3, 0.5):
        for edge_x in (-0.56, 0.76):
            preview.box(
                edge_x,
                0.14,
                float(z),
                0.08,
                0.03,
                0.46,
                "7e858a",
                "Preview_Street_Paving",
            )

    # North-Northwest sculpted clock-gate archway (center x ~ -0.6, z in [-2.95, -1.75]).
    strata = [
        (-3.15, 0.14, -3.05, 1.55, 1.05, 1.05, PALETTE["stone"][0]),
        (-3.05, 1.19, -2.95, 1.35, 0.85, 0.85, PALETTE["stone"][1]),
        (-2.75, 2.04, -2.85, 0.95, 0.45, 0.65, PALETTE["stone"][2]),
        (-1.60, 0.14, -3.05, 2.15, 0.55, 0.95, PALETTE["bedrock"][2]),
        (-1.75, 2.18, -2.90, 2.35, 0.48, 0.72, PALETTE["stone"][1]),
        (-1.55, 2.66, -2.85, 1.45, 0.36, 0.54, PALETTE["stone"][2]),
        (-0.05, 2.52, -2.82, 1.15, 0.44, 0.52, PALETTE["stone"][3]),
        (0.55, 0.14, -2.95, 1.35, 1.35, 0.90, PALETTE["stone"][0]),
        (0.75, 1.49, -2.88, 1.10, 0.68, 0.72, PALETTE["stone"][2]),
        (1.65, 0.14, -2.75, 0.85, 0.82, 0.75, PALETTE["bedrock"][2]),
        (1.85, 0.96, -2.68, 0.55, 0.42, 0.56, PALETTE["stone"][1]),
    ]
    for sx, sy, sz, sw, sh, sd, sc in strata:
        preview.box(sx, sy, sz, sw, sh, sd, sc, "Preview_Clock_Gate")
    # Irregular stepped terracotta gable masonry (no flat battlements).
    crags = [
        (-2.55, 2.49, -2.75, 0.42, 0.34, 0.38, PALETTE["terracotta"][0]),
        (-1.95, 2.66, -2.72, 0.56, 0.28, 0.44, PALETTE["terracotta"][1]),
        (-1.12, 3.02, -2.78, 0.62, 0.38, 0.42, PALETTE["terracotta"][2]),
        (-0.38, 2.96, -2.76, 0.48, 0.26, 0.38, PALETTE["terracotta"][0]),
        (0.35, 2.17, -2.74, 0.52, 0.46, 0.42, PALETTE["terracotta"][1]),
        (1.18, 2.17, -2.72, 0.46, 0.32, 0.40, PALETTE["terracotta"][2]),
    ]
    for cx0, cy0, cz0, cw, ch, cd, cc in crags:
        preview.box(cx0, cy0, cz0, cw, ch, cd, cc, "Preview_Clock_Gate")
    # Vertical cut-stone portal buttresses.
    for bx, bh in [(-1.82, 2.15), (0.58, 1.98)]:
        preview.box(bx, 0.14, -2.42, 0.26, bh, 0.42, "5c636b", "Preview_Clock_Gate")
    # Deep archway mouth + heavy timber braces.
    preview.box(-1.56, 0.14, -2.92, 2.14, 2.04, 0.82, "1b1026", "Preview_Archway")
    for dx in (-1.56, 0.36):
        preview.box(dx, 0.14, -2.26, 0.22, 2.04, 0.24, "4d3826", "Preview_Archway_Timber")
    preview.box(-1.68, 2.04, -2.32, 2.38, 0.22, 0.34, "694c33", "Preview_Archway_Timber")
    # Front timber facade band above the arch lintel (faces SE camera).
    preview.box(-1.68, 2.26, -2.24, 2.38, 0.10, 0.10, "826040", "Preview_Archway_Timber")
    preview.box(-1.68, 2.60, -2.24, 2.38, 0.08, 0.10, "694c33", "Preview_Archway_Timber")
    # Warm glowing clockface mounted PROUDLY on the front facade above the lintel.
    # Faces Southeast camera (9,8,12): sits at z=-2.18, in front of the black arch box.
    preview.box(-0.86, 2.30, -2.18, 0.52, 0.52, 0.06, "c89854", "Preview_Clockface")
    preview.box(-0.82, 2.34, -2.16, 0.44, 0.44, 0.05, "f5c878", "Preview_Clockface", glow=True)
    preview.box(-0.72, 2.44, -2.14, 0.24, 0.24, 0.04, "ffe7a3", "Preview_Clockface", glow=True)
    # Dark clock hands on the glowing face (z=-2.12, in front of the face).
    preview.box(-0.61, 2.50, -2.12, 0.05, 0.16, 0.03, "3b4047", "Preview_Clockface_Hands")
    preview.box(-0.61, 2.55, -2.12, 0.15, 0.05, 0.03, "3b4047", "Preview_Clockface_Hands")
    preview.box(-0.61, 2.55, -2.11, 0.06, 0.06, 0.03, "524a46", "Preview_Clockface_Hands")
    # Hanging lantern from the front wooden arch beam, fully in front of the arch box.
    preview.box(-0.53, 2.02, -1.99, 0.06, 0.10, 0.06, "3b4047", "Preview_Archway_Lantern")
    preview.box(-0.53, 1.94, -1.99, 0.06, 0.08, 0.06, "524a46", "Preview_Archway_Lantern")
    preview.box(
        -0.65, 1.72, -2.02, 0.24, 0.22, 0.24, "f5c878", "Preview_Archway_Lantern", glow=True
    )
    preview.box(-0.67, 1.94, -2.04, 0.28, 0.05, 0.28, "3b4047", "Preview_Archway_Lantern")
    preview.box(-0.67, 1.68, -2.04, 0.28, 0.04, 0.28, "3b4047", "Preview_Archway_Lantern")
    # Warm glow halo around the lantern.
    preview.box(
        -0.72, 1.66, -2.09, 0.38, 0.34, 0.38, "ffe7a3", "Preview_Archway_Lantern_Glow", glow=True
    )
    # Two sculpted green cypress/laurel street trees on NW stepped ledge.
    for px, py, pz, ph in [(-2.72, 1.19, -2.22, 0.72), (-2.38, 2.04, -2.42, 0.78)]:
        preview.box(px - 0.05, py, pz - 0.05, 0.10, ph, 0.10, "4d3826", "Preview_Clock_Gate")
        for layer in range(3):
            w = 0.56 - layer * 0.14
            preview.box(
                px - w / 2,
                py + ph * 0.48 + layer * 0.20,
                pz - w / 2,
                w,
                0.18,
                w,
                rng.choice(PALETTE["foliage"]),
                "Preview_Clock_Gate",
            )

    # West flat wide terrace (tier 1 top y=0.54) supporting a miniature shopfront.
    preview.box(-3.1, 0.14, -0.7, 1.5, 0.4, 2.3, PALETTE["stone"][0], "Preview_Terrace")
    preview.box(-2.85, 0.14, -0.25, 1.35, 0.40, 1.15, PALETTE["stone"][1], "Preview_Terrace")
    preview.box(-3.1, 0.54, -0.5, 0.3, 0.4, 1.9, PALETTE["stone"][2], "Preview_Terrace")
    preview.box(-3.1, 0.94, -0.3, 0.3, 0.35, 1.5, PALETTE["stone"][3], "Preview_Terrace")
    # Charming miniature shopfront seated cleanly on y=0.54.
    sx, sz = -2.15, 0.35
    # Stone plinth + timber-framed shop body.
    preview.box(sx - 0.55, 0.54, sz - 0.5, 1.1, 0.12, 1.0, "6d747b", "Preview_Shopfront")
    preview.box(sx - 0.5, 0.66, sz - 0.45, 1.0, 0.62, 0.9, "826040", "Preview_Shopfront")
    # Corner timber posts.
    for px in (sx - 0.5, sx + 0.4):
        for pz in (sz - 0.45, sz + 0.35):
            preview.box(px, 0.66, pz, 0.1, 0.62, 0.1, "4d3826", "Preview_Shopfront")
    # Glowing shop display windows facing EAST (+x = sx + 0.56).
    preview.box(
        sx + 0.46,
        0.78,
        sz - 0.32,
        0.06,
        0.34,
        0.5,
        "f5c878",
        "Preview_Shopfront_Window_Glow",
        glow=True,
    )
    preview.box(sx + 0.44, 0.74, sz - 0.36, 0.08, 0.06, 0.58, "4d3826", "Preview_Shopfront")
    preview.box(sx + 0.44, 1.14, sz - 0.36, 0.08, 0.06, 0.58, "4d3826", "Preview_Shopfront")
    # Glowing shop display windows facing SOUTH (+z = sz + 0.51).
    preview.box(
        sx - 0.34,
        0.78,
        sz + 0.46,
        0.5,
        0.34,
        0.06,
        "f5c878",
        "Preview_Shopfront_Window_Glow",
        glow=True,
    )
    preview.box(sx - 0.38, 0.74, sz + 0.44, 0.58, 0.06, 0.08, "4d3826", "Preview_Shopfront")
    preview.box(sx - 0.38, 1.14, sz + 0.44, 0.58, 0.06, 0.08, "4d3826", "Preview_Shopfront")
    # Warm interior glow spilling from the shop.
    preview.box(
        sx - 0.2, 0.7, sz - 0.2, 0.4, 0.4, 0.4, "ffe7a3", "Preview_Shopfront_Window_Glow", glow=True
    )
    # Pitched terracotta gable roof (stepped ridge running east-west).
    for step in range(4):
        w = 1.2 - step * 0.24
        preview.box(
            sx - w / 2,
            1.28 + step * 0.12,
            sz - 0.55,
            w,
            0.12,
            1.1,
            rng.choice(PALETTE["terracotta"]),
            "Preview_Shopfront_Roof",
        )
    # Ridge cap.
    preview.box(sx - 0.06, 1.76, sz - 0.55, 0.12, 0.08, 1.1, "853d30", "Preview_Shopfront_Roof")
    # Blue/cream striped awning over the south-facing window.
    for step in range(3):
        preview.box(
            sx - 0.6,
            1.24 - step * 0.08,
            sz + 0.42 + step * 0.08,
            1.2,
            0.05,
            0.12,
            PALETTE["cobalt"][step % 3] if step % 2 == 0 else PALETTE["cream"][step % 3],
            "Preview_Shopfront",
        )
    # Hanging shop sign bracket on the east face.
    preview.box(sx + 0.5, 1.02, sz - 0.05, 0.16, 0.05, 0.05, "3b4047", "Preview_Shopfront")
    preview.box(sx + 0.58, 0.86, sz - 0.12, 0.05, 0.16, 0.24, "c89854", "Preview_Shopfront")

    # East foreground-right OPEN-RAFTER bakery/market stall (max height y <= 1.65).
    preview.box(1.65, 0.14, -0.55, 1.45, 0.2, 1.4, "5c636b", "Preview_Bakery_Base")
    for dx in (1.75, 2.75):
        for dz in (-0.45, 0.65):
            preview.box(dx - 0.08, 0.34, dz - 0.08, 0.16, 1.0, 0.16, "4d3826", "Preview_Bakery")
    # Open rafters.
    for rx in np.arange(1.7, 2.9, 0.4):
        preview.box(float(rx), 1.34, -0.5, 0.1, 0.1, 1.3, "694c33", "Preview_Bakery_Roof")
    for rz in np.arange(-0.45, 0.7, 0.4):
        preview.box(1.65, 1.44, float(rz), 1.3, 0.08, 0.08, "826040", "Preview_Bakery_Roof")
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
                    rng.choice(PALETTE["terracotta"]),
                    "Preview_Bakery_Roof",
                )
    # Grounded slanted red/cream awning poles anchored to the stone shop pad.
    for pz in (-0.36, 0.58):
        for seg in range(4):
            preview.box(
                2.78 + seg * 0.07,
                1.20 - seg * 0.24,
                pz,
                0.08,
                0.28,
                0.08,
                "4d3826",
                "Preview_Bakery_Awning",
            )
    for step in range(4):
        preview.box(
            2.76 + step * 0.07,
            1.22 - step * 0.22,
            -0.42,
            0.14,
            0.06,
            1.14,
            PALETTE["burgundy"][step % 3] if step % 2 == 0 else PALETTE["cream"][step % 3],
            "Preview_Bakery_Awning",
        )
    # Wine barrels.
    for bx in (1.9, 2.4):
        preview.box(bx, 0.34, 0.3, 0.3, 0.4, 0.3, "694c33", "Preview_Bakery")
        preview.box(bx - 0.02, 0.5, 0.28, 0.34, 0.06, 0.34, "3b4047", "Preview_Bakery")

    # Center "Minecart" carrying colorful stacked silk bolts & crates.
    for x in (-0.25, 0.55):
        for z in (-0.3, 0.3):
            preview.box(x, 0.24, z, 0.12, 0.2, 0.2, "3b4047", "Minecart")
    preview.box(-0.3, 0.44, -0.4, 0.9, 0.1, 0.8, "694c33", "Minecart")
    for x in (-0.3, 0.5):
        preview.box(x, 0.54, -0.4, 0.1, 0.4, 0.8, "826040", "Minecart")
    for z in (-0.4, 0.3):
        preview.box(-0.3, 0.54, z, 0.9, 0.4, 0.1, "826040", "Minecart")
    for _ in range(6):
        preview.box(
            rng.uniform(-0.15, 0.45),
            0.94,
            rng.uniform(-0.2, 0.2),
            0.18,
            rng.uniform(0.12, 0.3),
            0.16,
            rng.choice(PALETTE["cobalt"] + PALETTE["saffron"] + PALETTE["burgundy"]),
            "Minecart",
        )

    # Southwest "Flame" on wrought-iron corner street brazier near (-2.4, ..., 2.7).
    bx, bz = -2.4, 2.7
    preview.box(bx - 0.26, 0.14, bz - 0.26, 0.52, 0.18, 0.52, "3b4047", "Brazier")
    preview.box(bx - 0.12, 0.32, bz - 0.12, 0.24, 0.45, 0.24, "524a46", "Brazier")
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
    # Stone bollards beside the brazier.
    for px in (-3.2, -1.6):
        preview.box(px - 0.12, 0.14, 2.6, 0.24, 0.3, 0.24, "7e858a", "Preview_Bollards")
        preview.box(px - 0.15, 0.44, 2.57, 0.3, 0.04, 0.3, "91979b", "Preview_Bollards")
    # Scattered cobbles/planters (no grid dots).
    for _ in range(10):
        preview.box(
            rng.uniform(-1.6, 1.6),
            0.14,
            rng.uniform(1.4, 2.4),
            rng.uniform(0.1, 0.24),
            rng.uniform(0.06, 0.16),
            rng.uniform(0.1, 0.24),
            rng.choice(PALETTE["cobble"] + PALETTE["flowers"]),
            "Preview_Planters",
        )

    preview.finish("preview-city-market.glb", source="建模工具/build_city_market.py")
    return preview


def main():
    rng = random.Random(20261201)
    model = Model("Wanxiang_City_Market", cards=True)
    build_central_board(model, rng)
    build_north_market_archway(model, rng)
    build_west_wing(model, rng)
    build_east_wing(model, rng)
    build_south_foreground(model, rng)
    build_varied_outer_rim(model, rng)
    counts = model.finish(
        "city-market.glb",
        source="建模工具/build_city_market.py",
        metadata={
            "biome": "city-market",
            "titleZh": "灯影商街",
            "motionNodes": [
                "Motion_Market_Signboard",
                "Motion_Market_Weathervane",
            ],
            "peripheryLayout": {
                "mode": "authored-large",
                "uniqueSpan": [17.5, 24.0],
                "uniqueBounds": {"x": [-24.2, 24.2], "z": [-18.2, 18.2]},
                "zones": [
                    "north-market-archway",
                    "west-lantern-workshop",
                    "west-apothecary-fountain",
                    "west-clock-bookshop",
                    "east-bakery-cafe",
                    "east-silk-bazaar",
                    "east-guild-courtyard",
                    "south-street-approach",
                    "far-city-rooftops",
                ],
                "mirroredRight": False,
                "bounds": {"x": 24.2, "z": 18.2},
                "patches": 1,
                "boxes": len(model.boxes),
            },
        },
    )
    print("City Market components:", len(counts), "groups")
    print("City Market boxes:", len(model.boxes))

    preview_rng = random.Random(20261201)
    preview = build_city_market_preview(preview_rng)
    print("City Market preview boxes:", len(preview.boxes))


if __name__ == "__main__":
    main()
