"""Build the Black Market (暗巷黑市) voxel battlefield and its miniature preview."""

import math
import random

import numpy as np

from build_realms import Model

PALETTE = {
    "vault": ["1c1e26", "272a34", "343946"],
    "brick": ["3d373a", "4d4446", "5e5252"],
    "timber": ["33251b", "473426", "594230"],
    "iron": ["2b3038", "42474f", "5c4738"],
    "crimson": ["6e1d28", "8f2634", "a83242"],
    "tarp": ["3a3d42", "4a4c49", "574e44"],
    "canal": ["16363b", "214e54", "2f6b70"],
    "jade": ["38b889", "5ad1a4", "8cf0c8"],
    "amber": ["d97b38", "f2a855"],
    "gold": ["c89854", "e5c171"],
}


def build_central_board(model, rng):
    model.box(-25.0, -0.56, -19.0, 50.0, 0.52, 38.0, "1c1e26", "00_Deep_Undercroft_Bedrock")
    model.box(-24.2, -0.04, -18.2, 48.4, 0.04, 36.4, "272a34", "01_Undercroft_Floor_Base")

    # Friendly half (z > 0.02): damp cut basalt flagstones with moss / wet puddle accents.
    basalt_cols = ["343946", "3d373a", "4d4446", "3a3f4a"]
    z_cursor = 0.02
    row = 0
    while z_cursor < 5.42:
        depth = 0.48
        x_cursor = -6.44
        offset = (row % 3) * 0.34
        first = 0.9 + offset
        col = 0
        while x_cursor < 6.44:
            pw = first if col == 0 else 1.3
            w = min(pw - 0.03, 6.44 - x_cursor)
            d = min(depth - 0.03, 5.44 - z_cursor)
            if w > 0.06 and d > 0.06:
                h = 0.102 if (row + col) % 4 == 0 else 0.098
                color = basalt_cols[(row * 3 + col) % len(basalt_cols)]
                model.box(x_cursor, 0.0, z_cursor, w, h, d, color, "02_Central_Vault_Stones")
            x_cursor += pw
            col += 1
        z_cursor += depth
        row += 1

    # Moss / wet puddle accents on the friendly half.
    for _ in range(60):
        px = rng.uniform(-6.0, 6.0)
        pz = rng.uniform(0.2, 5.2)
        if min(abs(px - cx) for cx in (-3.014, 0.0, 3.014)) < 1.2 and abs(pz - 2.345) < 1.6:
            continue
        if rng.random() < 0.5:
            model.box(
                px,
                0.1,
                pz,
                rng.uniform(0.1, 0.4),
                0.008,
                rng.uniform(0.1, 0.35),
                rng.choice(["214e54", "2f6b70", "16363b"]),
                "02_Central_Vault_Stones",
            )
        else:
            model.box(
                px,
                0.1,
                pz,
                rng.uniform(0.06, 0.2),
                0.012,
                rng.uniform(0.06, 0.2),
                rng.choice(["38b889", "5ad1a4"]),
                "02_Central_Vault_Stones",
                glow=rng.random() < 0.3,
            )

    # Enemy half (z < -0.02): soot-darkened undercroft bricks with crimson velvet runner edges.
    brick_cols = ["3d373a", "4d4446", "5e5252", "343946"]
    z_cursor = -5.44
    row = 0
    while z_cursor < -0.02:
        depth = 0.52
        x_cursor = -6.44
        stagger = 0.32 if row % 2 else 0.0
        col = 0
        while x_cursor < 6.44:
            tw = (0.8 + stagger) if col == 0 else 0.94
            w = min(tw - 0.03, 6.44 - x_cursor)
            d = min(depth - 0.03, -0.02 - z_cursor)
            if w > 0.06 and d > 0.06:
                color = brick_cols[(row * 5 + col) % len(brick_cols)]
                model.box(x_cursor, 0.0, z_cursor, w, 0.098, d, color, "03_Enemy_Auction_Floor")
            x_cursor += tw
            col += 1
        z_cursor += depth
        row += 1

    # Ragged crimson velvet auction runner edges along the enemy half.
    for side in (-1, 1):
        z = -5.2
        while z < -0.1:
            seg = rng.uniform(0.3, 0.6)
            model.box(
                side * 5.9 - 0.18,
                0.1,
                z,
                0.36,
                0.012,
                seg,
                rng.choice(PALETTE["crimson"]),
                "03_Enemy_Auction_Floor",
            )
            z += seg + rng.uniform(0.02, 0.08)

    # Faint jade alchemy spills on the enemy half.
    for _ in range(50):
        vx = rng.uniform(-6.0, 6.0)
        vz = rng.uniform(-5.2, -0.2)
        if min(abs(vx - cx) for cx in (-3.014, 0.0, 3.014)) < 1.2 and abs(vz + 2.345) < 1.6:
            continue
        model.box(
            vx,
            0.099,
            vz,
            rng.uniform(0.05, 0.22),
            0.012,
            rng.uniform(0.04, 0.16),
            rng.choice(PALETTE["jade"]),
            "03_Enemy_Auction_Floor",
            glow=rng.random() < 0.4,
        )

    # Center line: recessed subterranean storm-drain channel across z in [-0.20, 0.20].
    model.box(-6.44, 0.0, -0.20, 12.88, 0.04, 0.40, "16363b", "04_Center_Drain_Grate")
    # Dark teal canal water beneath.
    model.box(-6.3, 0.02, -0.16, 12.6, 0.03, 0.32, "214e54", "04_Center_Drain_Grate")
    # Spaced wrought-iron grate bars (y+h <= 0.10).
    for x in np.arange(-6.2, 6.3, 0.42):
        model.box(float(x), 0.04, -0.18, 0.14, 0.06, 0.36, "2b3038", "04_Center_Drain_Grate")
    # Small tarnished brass lockplate at (0,0).
    model.box(-0.16, 0.04, -0.16, 0.32, 0.03, 0.32, "c89854", "04_Center_Drain_Grate")
    model.box(-0.06, 0.07, -0.06, 0.12, 0.02, 0.12, "e5c171", "04_Center_Drain_Grate")

    # Six grounded card foundations.
    for z in (-2.345, 2.345):
        for x in (-3.014, 0.0, 3.014):
            base_col = "343946" if z < 0 else "3d373a"
            top_col = "4d4446" if z < 0 else "4d4446"
            model.box(
                x - 1.12, 0.0, z - 1.54, 2.24, 0.10, 3.08, base_col, "Six_Grounded_Foundations"
            )
            model.box(
                x - 1.05, 0.10, z - 1.47, 2.10, 0.06, 2.94, top_col, "Six_Grounded_Foundations"
            )
            model.ring(x, 0.16, z, 0.52, "5e5252", 0.035, "Revealed_Dais_Engraving")
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
                            "5ad1a4",
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
                "343946" if z < 0 else "3d373a",
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

    # 1) Southwest: West_Alchemy_Den - dark open-rafter underground bomb/alchemy stall.
    # Stall footprint x in [-14.6, -7.0], z in [2.2, 6.4].
    b(-14.6, 0.0, 2.2, 7.6, 0.24, 4.2, "272a34", "West_Alchemy_Den")
    # Timber corner posts.
    for px in (-14.4, -7.2):
        for pz in (2.4, 6.2):
            b(px, 0.24, pz, 0.2, 2.4, 0.2, "33251b", "West_Alchemy_Den")
    # Open rafters.
    for rx in np.arange(-14.2, -7.0, 0.55):
        b(float(rx), 2.5, 2.4, 0.12, 0.12, 4.0, "473426", "West_Alchemy_Den")
    for rz in np.arange(2.5, 6.3, 0.6):
        b(-14.4, 2.62, float(rz), 7.4, 0.1, 0.1, "594230", "West_Alchemy_Den")
    # ~55% partial tattered charcoal tarp.
    tarp_cols = PALETTE["tarp"]
    for rx in np.arange(-14.2, -7.0, 0.4):
        for rz in np.arange(2.5, 6.3, 0.4):
            if rng.random() < 0.55:
                b(
                    float(rx),
                    2.72,
                    float(rz),
                    0.36,
                    0.06,
                    0.36,
                    rng.choice(tarp_cols),
                    "West_Alchemy_Den",
                )
    # Glowing jade cauldron.
    cx, cz = -11.0, 4.2
    b(cx - 0.5, 0.24, cz - 0.5, 1.0, 0.5, 1.0, "2b3038", "West_Alchemy_Den")
    b(cx - 0.4, 0.74, cz - 0.4, 0.8, 0.12, 0.8, "38b889", "West_Alchemy_Glow", glow=True)
    b(cx - 0.3, 0.86, cz - 0.3, 0.6, 0.1, 0.6, "5ad1a4", "West_Alchemy_Glow", glow=True)
    # Amber / emerald flasks on a timber workbench.
    b(-13.6, 0.24, 3.0, 1.6, 0.5, 0.7, "473426", "West_Alchemy_Den")
    for i in range(5):
        fx = -13.4 + i * 0.3
        b(
            fx,
            0.74,
            3.2,
            0.16,
            0.28,
            0.16,
            rng.choice(PALETTE["amber"]),
            "West_Alchemy_Glow",
            glow=True,
        )
    for i in range(4):
        fx = -13.3 + i * 0.32
        b(
            fx,
            0.74,
            3.5,
            0.14,
            0.24,
            0.14,
            rng.choice(PALETTE["jade"]),
            "West_Alchemy_Glow",
            glow=True,
        )
    # Black-powder kegs.
    for kx, kz in [(-8.2, 5.4), (-8.6, 4.8), (-7.8, 4.6)]:
        b(kx, 0.24, kz, 0.4, 0.5, 0.4, "33251b", "West_Alchemy_Den")
        b(kx + 0.02, 0.5, kz + 0.02, 0.36, 0.06, 0.36, "2b3038", "West_Alchemy_Den")

    # 2) Mid-W: West_Contraband_Vault - vaulted stone lockup bay with iron cage bars.
    # Footprint x in [-14.6, -7.0], z in [-2.6, 1.8].
    # Raised damp cobblestone platform with lighter curb so it reads against the dark vault.
    b(-14.6, 0.0, -2.6, 7.6, 0.3, 4.4, "4d4446", "West_Contraband_Vault")
    b(-14.6, 0.3, -2.6, 7.6, 0.06, 4.4, "5e5252", "West_Contraband_Vault")
    # Lighter curb ring around the platform lip.
    b(-14.6, 0.36, -2.6, 7.6, 0.08, 0.16, "5c636b", "West_Contraband_Vault")
    b(-14.6, 0.36, 1.64, 7.6, 0.08, 0.16, "5c636b", "West_Contraband_Vault")
    b(-14.6, 0.36, -2.6, 0.16, 0.08, 4.4, "5c636b", "West_Contraband_Vault")
    b(-7.16, 0.36, -2.6, 0.16, 0.08, 4.4, "5c636b", "West_Contraband_Vault")
    # Vaulted stone arch.
    for i in range(9):
        ang = math.pi * i / 8
        b(
            -10.8 + math.cos(ang) * 3.2 - 0.2,
            0.44 + math.sin(ang) * 2.2,
            -2.4,
            0.4,
            0.4,
            0.5,
            rng.choice(PALETTE["brick"]),
            "West_Contraband_Vault",
        )
    # Wrought-iron cage bars (brighter iron).
    for bx in np.arange(-13.8, -7.4, 0.5):
        b(float(bx), 0.44, -2.2, 0.1, 1.8, 0.1, "7e858a", "West_Contraband_Vault")
    b(-14.0, 2.24, -2.3, 6.8, 0.12, 0.2, "91979b", "West_Contraband_Vault")
    # Open wooden crates spilling gold bars & violet/jade gems.
    for cx, cz in [(-13.4, 0.6), (-12.4, 1.0), (-8.4, 0.4)]:
        b(cx, 0.44, cz, 0.8, 0.5, 0.8, "473426", "West_Contraband_Vault")
        b(cx + 0.05, 0.94, cz + 0.05, 0.7, 0.06, 0.7, "594230", "West_Contraband_Vault")
    for i in range(6):
        b(
            -13.2 + i * 0.18,
            1.0,
            0.7,
            0.14,
            0.1,
            0.3,
            rng.choice(PALETTE["gold"]),
            "West_Contraband_Vault",
        )
    for i in range(5):
        b(
            -12.2 + i * 0.16,
            1.0,
            1.1,
            0.12,
            0.12,
            0.12,
            rng.choice(PALETTE["jade"]),
            "West_Vault_Gem_Glow",
            glow=True,
        )
    # Glowing amber lantern on the vault platform.
    b(-13.9, 1.2, -1.6, 0.24, 0.3, 0.24, "f2a855", "West_Vault_Gem_Glow", glow=True)
    b(-13.94, 1.5, -1.64, 0.32, 0.06, 0.32, "2b3038", "West_Contraband_Vault")
    # Rotating chain-hook hoist "Motion_BlackMarket_Pulley".
    pivot = (-9.0, 2.45, -0.5)
    b(-9.05, 2.45, -0.55, 0.1, 0.9, 0.1, "2b3038", "Motion_BlackMarket_Pulley", pivot=pivot)
    b(-9.3, 1.55, -0.8, 0.6, 0.5, 0.6, "473426", "Motion_BlackMarket_Pulley", pivot=pivot)
    b(-9.2, 1.35, -0.7, 0.4, 0.2, 0.4, "2b3038", "Motion_BlackMarket_Pulley", pivot=pivot)

    # 3) NW: West_Canal_Dock - sunken dark-teal drainage canal inlet.
    # Footprint x in [-14.6, -7.0], z in [-9.6, -3.0].
    b(-14.6, 0.0, -9.6, 7.6, 0.02, 6.6, "16363b", "West_Canal_Dock")
    # Water tiles.
    for wx in np.arange(-14.4, -7.0, 0.5):
        for wz in np.arange(-9.4, -3.2, 0.5):
            b(
                float(wx),
                0.02,
                float(wz),
                0.46,
                0.02,
                0.46,
                rng.choice(PALETTE["canal"]),
                "West_Canal_Dock",
            )
    # Slick stone quay steps.
    for step in range(4):
        b(-14.6, 0.02 + step * 0.14, -3.2 - step * 0.3, 7.6, 0.14, 0.3, "343946", "West_Canal_Dock")
    # Damp canal curbs along the quay lip.
    for cx in np.arange(-14.4, -7.0, 0.6):
        b(float(cx), 0.02, -3.05, 0.5, 0.12, 0.22, "2f6b70", "West_Canal_Dock")
        b(float(cx) + 0.05, 0.14, -3.0, 0.4, 0.04, 0.16, "214e54", "West_Canal_Dock")
    # Open-rim moored dark wooden smuggler skiff.
    sx, sz = -10.6, -6.4
    b(sx - 1.4, 0.06, sz - 0.6, 2.8, 0.3, 1.2, "33251b", "West_Canal_Dock")
    b(sx - 1.4, 0.36, sz - 0.6, 0.12, 0.3, 1.2, "473426", "West_Canal_Dock")
    b(sx + 1.28, 0.36, sz - 0.6, 0.12, 0.3, 1.2, "473426", "West_Canal_Dock")
    # Burlap sacks & glowing green bottles.
    for i in range(3):
        b(sx - 1.0 + i * 0.5, 0.36, sz - 0.3, 0.4, 0.3, 0.4, "574e44", "West_Canal_Dock")
    for i in range(4):
        b(
            sx - 0.8 + i * 0.4,
            0.36,
            sz + 0.2,
            0.14,
            0.24,
            0.14,
            "38b889",
            "West_Canal_Lantern_Glow",
            glow=True,
        )
    # Green wall lantern.
    b(-14.4, 1.2, -5.0, 0.2, 0.3, 0.2, "5ad1a4", "West_Canal_Lantern_Glow", glow=True)
    b(-14.44, 1.5, -5.04, 0.28, 0.06, 0.28, "2b3038", "West_Canal_Dock")


def build_east_wing(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )

    # 1) SE: East_Gambling_Alcove - sloped ribbed crimson-and-charcoal awning over green-felt tables.
    # Footprint x in [7.0, 14.6], z in [2.2, 6.4].
    b(7.0, 0.0, 2.2, 7.6, 0.24, 4.2, "272a34", "East_Gambling_Alcove")
    for px in (7.2, 14.4):
        for pz in (2.4, 6.2):
            b(px, 0.24, pz, 0.2, 2.4, 0.2, "33251b", "East_Gambling_Alcove")
    # Exposed bolted rafters.
    for rx in np.arange(7.2, 14.4, 0.55):
        b(float(rx), 2.5, 2.4, 0.12, 0.12, 4.0, "473426", "East_Gambling_Alcove")
    for rz in np.arange(2.5, 6.3, 0.6):
        b(7.2, 2.62, float(rz), 7.4, 0.1, 0.1, "594230", "East_Gambling_Alcove")
    # Sloped ribbed crimson-and-charcoal awning strips (distinct from SW tarp checkerboard).
    awning_cols = ["8f2634", "3a3d42", "a83242", "4a4c49"]
    for i, rx in enumerate(np.arange(7.2, 14.4, 0.4)):
        # Sloped strip: descends toward the front (south) edge.
        b(
            float(rx),
            2.72 - (i % 2) * 0.04,
            2.5,
            0.34,
            0.06,
            3.8,
            awning_cols[i % len(awning_cols)],
            "East_Gambling_Alcove",
        )
    # Ribbed awning support battens.
    for rz in np.arange(2.6, 6.2, 0.5):
        b(7.2, 2.66, float(rz), 7.2, 0.05, 0.08, "33251b", "East_Gambling_Alcove")
    # Green-felt card tables (two visible tables).
    for tx, tz in [(9.2, 3.6), (12.2, 4.6)]:
        b(tx - 0.7, 0.24, tz - 0.7, 1.4, 0.5, 1.4, "33251b", "East_Gambling_Alcove")
        b(tx - 0.65, 0.74, tz - 0.65, 1.3, 0.06, 1.3, "38b889", "East_Gambling_Alcove")
        # Stacked coin piles on each table.
        for i in range(4):
            b(
                tx - 0.4 + i * 0.25,
                0.8,
                tz - 0.3,
                0.14,
                0.1,
                0.14,
                rng.choice(PALETTE["gold"]),
                "East_Gambling_Alcove",
            )
    # Wine casks.
    for kx, kz in [(8.0, 5.4), (8.4, 4.8)]:
        b(kx, 0.24, kz, 0.5, 0.6, 0.5, "33251b", "East_Gambling_Alcove")
        b(kx + 0.02, 0.5, kz + 0.02, 0.46, 0.06, 0.46, "2b3038", "East_Gambling_Alcove")
    # Ruby-red lantern.
    b(13.8, 1.4, 5.6, 0.24, 0.3, 0.24, "a83242", "East_Gambling_Glow", glow=True)
    b(13.84, 1.7, 5.64, 0.16, 0.06, 0.16, "2b3038", "East_Gambling_Alcove")

    # 2) Mid-E: East_Weapons_Fence - staggered illegal arms & armor fence booths.
    # Footprint x in [7.0, 14.6], z in [-2.6, 1.8].
    # Raised damp brick platform with lighter curb so it reads against the dark vault.
    b(7.0, 0.0, -2.6, 7.6, 0.3, 4.4, "4d4446", "East_Weapons_Fence")
    b(7.0, 0.3, -2.6, 7.6, 0.06, 4.4, "5e5252", "East_Weapons_Fence")
    # Lighter curb ring around the platform lip.
    b(7.0, 0.36, -2.6, 7.6, 0.08, 0.16, "5c636b", "East_Weapons_Fence")
    b(7.0, 0.36, 1.64, 7.6, 0.08, 0.16, "5c636b", "East_Weapons_Fence")
    b(7.0, 0.36, -2.6, 0.16, 0.08, 4.4, "5c636b", "East_Weapons_Fence")
    b(14.44, 0.36, -2.6, 0.16, 0.08, 4.4, "5c636b", "East_Weapons_Fence")
    # Irregular sloped dark tarps.
    for step in range(5):
        b(
            7.2 + step * 0.3,
            2.2 - step * 0.2,
            -2.4,
            0.3,
            0.06,
            4.0 - step * 0.3,
            rng.choice(PALETTE["tarp"]),
            "East_Weapons_Fence",
        )
    # Blade / shield racks (brighter silver/iron).
    for i in range(6):
        b(8.0 + i * 0.9, 0.44, -1.8, 0.1, 1.4, 0.1, "7e858a", "East_Weapons_Fence")
        b(8.0 + i * 0.9, 1.34, -1.9, 0.1, 0.5, 0.3, "91979b", "East_Weapons_Fence")
    # Ironbound chests.
    for cx, cz in [(12.4, 0.6), (13.2, 1.0)]:
        b(cx, 0.44, cz, 0.7, 0.5, 0.7, "473426", "East_Weapons_Fence")
        b(cx + 0.02, 0.74, cz + 0.02, 0.66, 0.06, 0.66, "2b3038", "East_Weapons_Fence")
    # Gold ingots on the platform.
    for i in range(5):
        b(
            11.4 + i * 0.18,
            0.44,
            1.2,
            0.14,
            0.1,
            0.3,
            rng.choice(PALETTE["gold"]),
            "East_Weapons_Fence",
        )
    # Crimson banner on the fence.
    b(9.6, 1.0, -2.3, 0.5, 0.6, 0.06, "8f2634", "East_Weapons_Fence")
    # Glowing charcoal forge.
    b(13.6, 0.44, -1.8, 0.8, 0.5, 0.8, "2b3038", "East_Weapons_Fence")
    b(13.7, 0.94, -1.7, 0.6, 0.1, 0.6, "d97b38", "East_Fence_Forge_Glow", glow=True)
    # Glowing emerald lantern on the fence.
    b(7.6, 1.2, 1.4, 0.24, 0.3, 0.24, "5ad1a4", "East_Fence_Forge_Glow", glow=True)
    b(7.64, 1.5, 1.44, 0.16, 0.06, 0.16, "2b3038", "East_Weapons_Fence")

    # 3) NE: East_Secret_Stairwell - heavy iron-barred sewer access gate.
    # Footprint x in [7.0, 14.6], z in [-9.6, -3.0].
    b(7.0, 0.0, -9.6, 7.6, 0.3, 6.6, "343946", "East_Secret_Stairwell")
    # Iron-barred sewer gate.
    for gx in np.arange(7.4, 10.0, 0.4):
        b(float(gx), 0.3, -9.4, 0.1, 2.0, 0.1, "2b3038", "East_Secret_Stairwell")
    b(7.2, 2.3, -9.5, 3.0, 0.12, 0.2, "42474f", "East_Secret_Stairwell")
    # Stepped stone escape stairway descending northeast.
    for step in range(6):
        b(
            10.4 + step * 0.5,
            0.3 + step * 0.2,
            -9.2 + step * 0.4,
            0.6,
            0.2,
            0.6,
            "3d373a",
            "East_Secret_Stairwell",
        )
    # Contraband rum barrels.
    for kx, kz in [(12.0, -4.0), (12.6, -4.6), (13.2, -4.0)]:
        b(kx, 0.3, kz, 0.5, 0.6, 0.5, "33251b", "East_Secret_Stairwell")
        b(kx + 0.02, 0.56, kz + 0.02, 0.46, 0.06, 0.46, "2b3038", "East_Secret_Stairwell")
    # Rusted floor chains.
    for i in range(10):
        b(
            8.0 + i * 0.3,
            0.3,
            -5.0 + (i % 2) * 0.2,
            0.2,
            0.1,
            0.2,
            "5c4738",
            "East_Secret_Stairwell",
        )
    # Flickering emerald brazier.
    b(13.8, 0.3, -8.8, 0.5, 0.4, 0.5, "2b3038", "East_Secret_Stairwell")
    b(13.9, 0.7, -8.7, 0.3, 0.3, 0.3, "5ad1a4", "East_Stairwell_Glow", glow=True)
    # Scattered damp flagstones / crates / puddles.
    for _ in range(14):
        b(
            rng.uniform(7.2, 14.4),
            0.3,
            rng.uniform(-9.4, -3.2),
            rng.uniform(0.2, 0.5),
            rng.uniform(0.04, 0.12),
            rng.uniform(0.2, 0.5),
            rng.choice(PALETTE["brick"] + PALETTE["canal"]),
            "East_Secret_Stairwell",
        )


def build_north_auction(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Sunken brick archway facade. All front bricks/curtains/braziers kept strictly north of z=-5.52.
    for tier in range(4):
        b(
            -6.4,
            tier * 0.39,
            -6.38 + tier * 0.08,
            12.8,
            0.39,
            0.56,
            rng.choice(PALETTE["brick"]),
            "Landmark_BlackMarket_Auction",
        )
    # Varied stepped brick edges along the top (not flat bars).
    for i, cx in enumerate(np.arange(-6.0, 6.1, 1.2)):
        h = 1.56 - (i % 3) * 0.1
        b(
            float(cx),
            1.56 - 0.1,
            -6.2,
            0.9,
            0.1,
            0.6,
            rng.choice(PALETTE["brick"]),
            "Landmark_BlackMarket_Auction",
        )
    # Central sunken brick archway.
    b(-2.2, 0.0, -6.3, 4.4, 1.4, 0.7, "1c1e26", "Landmark_BlackMarket_Auction")
    for dx in (-2.4, 2.2):
        b(dx, 0.0, -6.2, 0.3, 1.5, 0.3, "3d373a", "Landmark_BlackMarket_Auction")
    b(-2.5, 1.4, -6.2, 5.0, 0.16, 0.3, "4d4446", "Landmark_BlackMarket_Auction")
    # Tattered crimson auction drapery hanging in front of arch beam (z = -5.88..-5.82).
    for i in range(6):
        b(
            -2.0 + i * 0.7,
            0.9,
            -5.88,
            0.5,
            0.5,
            0.06,
            rng.choice(PALETTE["crimson"]),
            "Landmark_BlackMarket_Auction",
        )
    # Auction podium steps strictly <= -5.56 (z + d <= -5.56).
    for step in range(3):
        b(
            -1.8,
            0.0,
            -5.74 - step * 0.18,
            3.6,
            0.42 + step * 0.28,
            0.18,
            rng.choice(PALETTE["brick"]),
            "Landmark_BlackMarket_Auction",
        )
    # Twin emerald alchemical fire braziers strictly north of -5.52.
    for bx in (-4.6, 4.6):
        b(bx - 0.3, 0.0, -6.12, 0.6, 0.5, 0.56, "2b3038", "Landmark_BlackMarket_Auction")
        b(bx - 0.2, 0.5, -6.04, 0.4, 0.3, 0.4, "38b889", "Landmark_BlackMarket_Glow", glow=True)
        b(bx - 0.15, 0.8, -5.98, 0.3, 0.2, 0.3, "5ad1a4", "Landmark_BlackMarket_Glow", glow=True)
    # Swaying iron contraband cage/lantern "Motion_BlackMarket_Cage".
    # Pivot at (0.0, 1.05, -5.72); cage at y in [0.42, 0.98], z in [-5.84, -5.60].
    pivot = (0.0, 1.05, -5.72)
    # Hanging chain from pivot.
    b(-0.05, 1.05, -5.78, 0.1, 0.5, 0.1, "2b3038", "Motion_BlackMarket_Cage", pivot=pivot)
    # Warm brass/gold frame.
    b(-0.3, 0.42, -5.84, 0.6, 0.5, 0.24, "c89854", "Motion_BlackMarket_Cage", pivot=pivot)
    # Bright jade core (glow=False so the whole cage is one node).
    b(
        -0.2,
        0.5,
        -5.80,
        0.4,
        0.3,
        0.18,
        "8cf0c8",
        "Motion_BlackMarket_Cage",
        glow=False,
        pivot=pivot,
    )
    b(
        -0.15,
        0.56,
        -5.78,
        0.3,
        0.18,
        0.14,
        "5ad1a4",
        "Motion_BlackMarket_Cage",
        glow=False,
        pivot=pivot,
    )


def build_south_foreground(model, rng):
    b = lambda x, y, z, w, h, d, c, g, glow=False, pivot=None: safe_prop_box(
        model, x, y, z, w, h, d, c, g, glow, pivot
    )
    # Low foreground band z in [5.65, 8.6], strictly y + h <= 0.38.
    for x in np.arange(-6.0, 6.1, 1.1):
        b(
            float(x),
            0.0,
            5.75 + rng.uniform(0.0, 0.3),
            rng.uniform(0.4, 0.8),
            rng.uniform(0.06, 0.16),
            rng.uniform(0.35, 0.6),
            rng.choice(PALETTE["brick"] + PALETTE["canal"]),
            "South_Alley_Steps",
        )
    # Iron sewer drainage grate.
    b(-2.0, 0.0, 6.6, 1.6, 0.1, 0.8, "2b3038", "South_Sewer_Grate")
    for gx in np.arange(-1.9, 0.4, 0.2):
        b(float(gx), 0.1, 6.7, 0.08, 0.06, 0.6, "42474f", "South_Sewer_Grate")
    # Tipped smuggler crates.
    for cx, cz in [(-3.4, 7.0), (2.4, 7.2)]:
        b(cx, 0.0, cz, 0.7, 0.4, 0.7, "473426", "South_Smuggler_Crates")
        b(cx + 0.05, 0.4, cz + 0.05, 0.6, 0.06, 0.6, "594230", "South_Smuggler_Crates")
    # Low curb.
    for x in np.arange(-5.5, 5.6, 1.4):
        b(float(x), 0.0, 8.2, 0.9, 0.2, 0.3, "343946", "South_Low_Curb")
    # Outer vaults to z=13.2.
    for tier in range(3):
        b(
            -6.0,
            tier * 0.28,
            8.8 + tier * 1.4,
            12.0,
            0.28,
            1.6,
            rng.choice(PALETTE["vault"]),
            "South_Outer_Vaults",
        )
    for _ in range(14):
        b(
            rng.uniform(-5.8, 5.8),
            0.0,
            rng.uniform(9.0, 12.8),
            rng.uniform(0.2, 0.5),
            rng.uniform(0.1, 0.3),
            rng.uniform(0.2, 0.5),
            rng.choice(PALETTE["brick"]),
            "South_Outer_Vaults",
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


def outer_masonry_pier(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Masonry_Pier"
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
            rng.choice(PALETTE["brick"]),
            g,
        )
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
            rng.choice(PALETTE["brick"]),
            g,
        )
    # Extra mossy brick patches & rubble clusters.
    for _ in range(8):
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
            rng.uniform(0.2, 0.5),
            rng.uniform(0.04, 0.12),
            rng.uniform(0.2, 0.5),
            rng.choice(["38b889", "5ad1a4", "214e54", "2f6b70"]),
            g,
        )


def outer_vaulted_buttress(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Vaulted_Buttress"
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
            rng.choice(PALETTE["brick"]),
            g,
        )
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
            "4d4446",
            g,
        )
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
            rng.choice(PALETTE["brick"]),
            g,
        )
    # Rusted chain links draped along the buttress base.
    for i in range(8):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.4 + i * 0.45,
            0.0,
            3.4,
            0.18,
            0.1,
            0.18,
            "5c4738",
            g,
        )


def outer_barrel_alcove(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Barrel_Alcove"
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 0.3, 0.0, 0.3, 4.0, 0.3, 4.0, "272a34", g
    )
    for bx, bz in [(0.8, 0.8), (1.6, 1.2), (2.4, 0.9), (1.2, 2.4), (2.8, 2.2)]:
        place_module_box(
            model, ox, oz, rot90, mirror_x, height_scale, bx, 0.3, bz, 0.5, 0.6, 0.5, "33251b", g
        )
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            bx + 0.02,
            0.56,
            bz + 0.02,
            0.46,
            0.06,
            0.46,
            "2b3038",
            g,
        )
    for _ in range(6):
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
            rng.choice(PALETTE["vault"]),
            g,
        )
    # Stacked contraband kegs & crates.
    for bx, bz in [(0.6, 2.8), (1.4, 3.0), (3.2, 1.0)]:
        place_module_box(
            model, ox, oz, rot90, mirror_x, height_scale, bx, 0.3, bz, 0.45, 0.45, 0.45, "473426", g
        )
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            bx + 0.03,
            0.75,
            bz + 0.03,
            0.39,
            0.05,
            0.39,
            "594230",
            g,
        )


def outer_canal_pocket(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Canal_Pocket"
    place_module_box(
        model, ox, oz, rot90, mirror_x, height_scale, 0.3, 0.0, 0.3, 4.0, 0.06, 4.0, "16363b", g
    )
    for _ in range(14):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.5, 4.0),
            0.06,
            rng.uniform(0.5, 4.0),
            rng.uniform(0.2, 0.5),
            0.02,
            rng.uniform(0.2, 0.5),
            rng.choice(PALETTE["canal"]),
            g,
        )
    for px in (1.0, 3.4):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            px,
            0.06,
            1.0,
            0.14,
            0.9,
            0.14,
            "33251b",
            g,
        )
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            px - 0.1,
            0.76,
            0.95,
            0.34,
            0.2,
            0.06,
            "5ad1a4",
            g,
            glow=True,
        )
    # Damp canal curbs along the pocket rim.
    for cx in np.arange(0.5, 4.0, 0.6):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            float(cx),
            0.06,
            3.7,
            0.5,
            0.1,
            0.2,
            "2f6b70",
            g,
        )


def outer_chain_barrier(model, rng, ox, oz, rot90=0, mirror_x=False, height_scale=1.0):
    g = "Outer_Chain_Barrier"
    for i in range(6):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.4 + i * 0.7,
            0.0,
            0.6,
            0.16,
            1.0,
            0.16,
            "33251b",
            g,
        )
    for i in range(12):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.5 + i * 0.32,
            0.7 + (i % 2) * 0.1,
            0.6,
            0.2,
            0.12,
            0.2,
            "5c4738",
            g,
        )
    for _ in range(6):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            rng.uniform(0.4, 4.0),
            0.0,
            rng.uniform(0.4, 4.0),
            rng.uniform(0.15, 0.3),
            rng.uniform(0.08, 0.2),
            rng.uniform(0.15, 0.3),
            rng.choice(PALETTE["vault"]),
            g,
        )
    # Rusted chains trailing along the ground.
    for i in range(10):
        place_module_box(
            model,
            ox,
            oz,
            rot90,
            mirror_x,
            height_scale,
            0.4 + i * 0.35,
            0.0,
            2.6 + (i % 2) * 0.2,
            0.18,
            0.08,
            0.18,
            "5c4738",
            g,
        )


def build_varied_outer_rim(model, rng):
    modules = [
        outer_masonry_pier,
        outer_vaulted_buttress,
        outer_barrel_alcove,
        outer_canal_pocket,
        outer_chain_barrier,
    ]
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
    north_layout = [
        (1, -14.6, -16.2, 0, False, 1.0),
        (2, -9.6, -16.2, 1, True, 1.1),
        (3, -4.6, -16.2, 2, False, 1.0),
        (4, 0.4, -16.2, 3, True, 1.2),
        (0, 5.4, -16.2, 0, False, 1.0),
        (2, 10.4, -16.2, 1, True, 1.1),
    ]
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


def build_black_market_preview(rng):
    preview = Model("Black market diorama preview / black-market", cards=False)
    for ix in range(-10, 11):
        for iz in range(-8, 9):
            if abs(ix) + abs(iz) > 15 or (abs(ix) > 8 and abs(iz) > 5):
                continue
            x, z = ix * 0.4, iz * 0.4
            depth = 0.5 + rng.choice([0, 0.2, 0.4])
            preview.box(x, -depth, z, 0.39, depth, 0.39, "1c1e26", "Floating_Bedrock")
            preview.box(
                x,
                0,
                z,
                0.39,
                0.14,
                0.39,
                rng.choice(PALETTE["brick"]),
                "Terrain",
            )

    # Organic irregular scattered rubble stones and subtle puddles on the courtyard.
    for _ in range(26):
        preview.box(
            rng.uniform(-1.4, 1.4),
            0.14,
            rng.uniform(-1.4, 1.6),
            rng.uniform(0.08, 0.22),
            rng.uniform(0.03, 0.08),
            rng.uniform(0.08, 0.22),
            rng.choice(PALETTE["brick"] + PALETTE["vault"]),
            "Surface_Chips",
        )
    for rut_x in (-0.55, 0.55):
        preview.box(rut_x, 0.14, -1.2, 0.1, 0.02, 2.6, "214e54", "Surface_Chips")

    # North-Northwest sculpted auction archway (center x ~ -0.6, z in [-2.95, -1.75]).
    strata = [
        (-3.15, 0.14, -3.05, 1.55, 1.05, 1.05, PALETTE["brick"][0]),
        (-3.05, 1.19, -2.95, 1.35, 0.85, 0.85, PALETTE["brick"][1]),
        (-2.75, 2.04, -2.85, 0.95, 0.45, 0.65, PALETTE["brick"][2]),
        (-1.60, 0.14, -3.05, 2.15, 0.55, 0.95, PALETTE["vault"][2]),
        (-1.75, 2.18, -2.90, 2.35, 0.48, 0.72, PALETTE["brick"][1]),
        (-1.55, 2.66, -2.85, 1.45, 0.36, 0.54, PALETTE["brick"][2]),
        (-0.05, 2.52, -2.82, 1.15, 0.44, 0.52, PALETTE["brick"][0]),
        (0.55, 0.14, -2.95, 1.35, 1.35, 0.90, PALETTE["brick"][0]),
        (0.75, 1.49, -2.88, 1.10, 0.68, 0.72, PALETTE["brick"][2]),
        (1.65, 0.14, -2.75, 0.85, 0.82, 0.75, PALETTE["vault"][2]),
        (1.85, 0.96, -2.68, 0.55, 0.42, 0.56, PALETTE["brick"][1]),
    ]
    for sx, sy, sz, sw, sh, sd, sc in strata:
        preview.box(sx, sy, sz, sw, sh, sd, sc, "Preview_Auction_Wall")
    # Asymmetric rugged brick crag caps (avoid flat battlements).
    crags = [
        (-2.55, 2.49, -2.75, 0.42, 0.34, 0.38, PALETTE["brick"][2]),
        (-1.95, 2.66, -2.72, 0.56, 0.28, 0.44, PALETTE["brick"][1]),
        (-1.12, 3.02, -2.78, 0.62, 0.38, 0.42, PALETTE["brick"][2]),
        (-0.38, 2.96, -2.76, 0.48, 0.26, 0.38, PALETTE["brick"][1]),
        (0.35, 2.17, -2.74, 0.52, 0.46, 0.42, PALETTE["brick"][0]),
        (1.18, 2.17, -2.72, 0.46, 0.32, 0.40, PALETTE["brick"][2]),
    ]
    for cx0, cy0, cz0, cw, ch, cd, cc in crags:
        preview.box(cx0, cy0, cz0, cw, ch, cd, cc, "Preview_Auction_Wall")
    # Vertical cut-brick portal buttresses.
    for bx, bh in [(-1.82, 2.15), (0.58, 1.98)]:
        preview.box(bx, 0.14, -2.42, 0.26, bh, 0.42, "3d373a", "Preview_Auction_Wall")
    # Deep vault arch + heavy timber portal braces.
    preview.box(-1.56, 0.14, -2.92, 2.14, 2.04, 0.82, "1c1e26", "Preview_Vault")
    for dx in (-1.56, 0.36):
        preview.box(dx, 0.14, -2.26, 0.22, 2.04, 0.24, "33251b", "Preview_Vault_Timber")
    preview.box(-1.68, 2.04, -2.32, 2.38, 0.22, 0.34, "473426", "Preview_Vault_Timber")
    preview.box(-1.62, 1.84, -2.48, 0.18, 0.18, 0.46, "594230", "Preview_Vault_Timber")
    preview.box(0.42, 1.84, -2.48, 0.18, 0.18, 0.46, "594230", "Preview_Vault_Timber")
    # Crimson auction banners hung ON THE FRONT FACE at z = -1.96 so they shine toward SE camera.
    for i in range(5):
        preview.box(
            -1.4 + i * 0.55,
            1.6,
            -1.96,
            0.4,
            0.5,
            0.06,
            rng.choice(PALETTE["crimson"]),
            "Preview_Banner",
        )
    # Hanging lantern at arch lintel z = -1.98.
    preview.box(-0.6, 1.9, -1.98, 0.16, 0.24, 0.16, "f2a855", "Preview_Lantern", glow=True)
    preview.box(-0.64, 2.14, -2.02, 0.24, 0.06, 0.24, "2b3038", "Preview_Lantern")
    # Glowing jade-emerald caged contraband crystal moved slightly forward (z = -1.85).
    preview.box(-0.7, 0.16, -1.85, 0.5, 0.5, 0.4, "2b3038", "Preview_Cage")
    preview.box(-0.6, 0.66, -1.80, 0.3, 0.3, 0.3, "5ad1a4", "Preview_Cage", glow=True)
    preview.box(-0.55, 0.96, -1.75, 0.2, 0.2, 0.2, "8cf0c8", "Preview_Cage", glow=True)

    # West flat wide wharf (tier 1 top y=0.54 across x in [-2.85, -1.50], z in [-0.25, 0.90]).
    preview.box(-3.1, 0.14, -0.7, 1.5, 0.4, 2.3, PALETTE["brick"][0], "Preview_Wharf")
    preview.box(-2.85, 0.14, -0.25, 1.35, 0.40, 1.15, PALETTE["brick"][1], "Preview_Wharf")
    preview.box(-3.1, 0.54, -0.5, 0.3, 0.4, 1.9, PALETTE["brick"][2], "Preview_Wharf")
    preview.box(-3.1, 0.94, -0.3, 0.3, 0.35, 1.5, PALETTE["brick"][0], "Preview_Wharf")
    # Authentic Black Market Iron Contraband Cage & Potion Rack seated squarely on y=0.54.
    cx, cz = -2.15, 0.35
    # Dark iron cage bars (four corner posts + top frame).
    for side_x in (-1, 1):
        for side_z in (-1, 1):
            preview.box(
                cx + side_x * 0.24 - 0.04,
                0.54,
                cz + side_z * 0.24 - 0.04,
                0.08,
                0.9,
                0.08,
                "2b3038",
                "Preview_Cage_Rack",
            )
    preview.box(cx - 0.28, 1.44, cz - 0.28, 0.56, 0.08, 0.56, "42474f", "Preview_Cage_Rack")
    preview.box(cx - 0.28, 0.54, cz - 0.28, 0.56, 0.08, 0.56, "42474f", "Preview_Cage_Rack")
    # Glowing emerald/violet stolen relic crystal inside the cage.
    preview.box(
        cx - 0.12, 0.72, cz - 0.12, 0.24, 0.24, 0.24, "5ad1a4", "Preview_Cage_Rack", glow=True
    )
    preview.box(
        cx - 0.08, 0.96, cz - 0.08, 0.16, 0.16, 0.16, "8cf0c8", "Preview_Cage_Rack", glow=True
    )
    preview.box(
        cx - 0.06, 1.12, cz - 0.06, 0.12, 0.12, 0.12, "a83242", "Preview_Cage_Rack", glow=True
    )
    # Wooden shelf with glowing alchemy vials beside the cage.
    preview.box(cx + 0.34, 0.54, cz - 0.3, 0.5, 0.1, 0.6, "473426", "Preview_Cage_Rack")
    preview.box(cx + 0.34, 0.64, cz - 0.3, 0.5, 0.06, 0.6, "594230", "Preview_Cage_Rack")
    for i in range(3):
        preview.box(
            cx + 0.4 + i * 0.14,
            0.7,
            cz - 0.2,
            0.1,
            0.2,
            0.1,
            ["38b889", "5ad1a4", "8cf0c8"][i],
            "Preview_Cage_Rack",
            glow=True,
        )
    # Glowing emerald potion vials on the wharf.
    for i in range(3):
        preview.box(
            -2.6 + i * 0.2, 0.54, 0.7, 0.12, 0.2, 0.12, "38b889", "Preview_Vials", glow=True
        )

    # East foreground-right OPEN-RAFTER fence stall (x in [1.55, 2.95], z in [-0.50, 0.90], max y <= 1.65).
    preview.box(1.65, 0.14, -0.55, 1.45, 0.2, 1.4, "3d373a", "Preview_Fence_Base")
    for dx in (1.75, 2.75):
        for dz in (-0.45, 0.65):
            preview.box(dx - 0.08, 0.34, dz - 0.08, 0.16, 1.0, 0.16, "33251b", "Preview_Fence")
    # Open rafters.
    for rx in np.arange(1.7, 2.9, 0.4):
        preview.box(float(rx), 1.34, -0.5, 0.1, 0.1, 1.3, "473426", "Preview_Fence_Roof")
    for rz in np.arange(-0.45, 0.7, 0.4):
        preview.box(1.65, 1.44, float(rz), 1.3, 0.08, 0.08, "594230", "Preview_Fence_Roof")
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
                    rng.choice(PALETTE["tarp"]),
                    "Preview_Fence_Roof",
                )
    # Grounded slanted crimson/dark tarp poles anchored onto brick pad.
    for pz in (-0.36, 0.58):
        for seg in range(4):
            preview.box(
                2.78 + seg * 0.07,
                1.20 - seg * 0.24,
                pz,
                0.08,
                0.28,
                0.08,
                "33251b",
                "Preview_Tarp",
            )
    for step in range(4):
        preview.box(
            2.76 + step * 0.07,
            1.22 - step * 0.22,
            -0.42,
            0.14,
            0.06,
            1.14,
            [PALETTE["crimson"][0], PALETTE["tarp"][0], PALETTE["crimson"][1], PALETTE["tarp"][1]][
                step
            ],
            "Preview_Tarp",
        )
    # Smuggler barrels & weapon rack.
    preview.box(2.1, 0.14, -1.2, 0.5, 0.4, 0.5, "33251b", "Preview_Barrels")
    for i in range(5):
        preview.box(1.9 - i * 0.22, 0.16, -1.0, 0.16, 0.14, 0.16, "5c4738", "Preview_Chain")

    # Center "Minecart" on flush iron rail track z in [-1.25, 1.25].
    for z in np.arange(-1.2, 1.3, 0.3):
        preview.box(-0.45, 0.14, float(z), 1.2, 0.06, 0.12, "42474f", "Preview_Rails")
    for x in (-0.35, 0.65):
        preview.box(x, 0.2, -1.25, 0.06, 0.08, 2.5, "5c4738", "Preview_Rails")
    for x in (-0.25, 0.55):
        for z in (-0.3, 0.3):
            preview.box(x, 0.28, z, 0.12, 0.2, 0.2, "2b3038", "Minecart")
    preview.box(-0.3, 0.48, -0.4, 0.9, 0.1, 0.8, "473426", "Minecart")
    for x in (-0.3, 0.5):
        preview.box(x, 0.58, -0.4, 0.1, 0.4, 0.8, "594230", "Minecart")
    for z in (-0.4, 0.3):
        preview.box(-0.3, 0.58, z, 0.9, 0.4, 0.1, "594230", "Minecart")
    # Locked strongbox & emerald vials (all glow=False so the whole Minecart is one node).
    preview.box(-0.15, 0.98, -0.2, 0.4, 0.3, 0.4, "33251b", "Minecart")
    preview.box(-0.1, 1.28, -0.15, 0.3, 0.06, 0.3, "2b3038", "Minecart")
    for i in range(3):
        preview.box(0.1 + i * 0.12, 0.98, 0.1, 0.1, 0.2, 0.1, "8cf0c8", "Minecart", glow=False)

    # Southwest "Flame" on wrought-iron sewer brazier near (-2.4, ..., 2.7).
    bx, bz = -2.4, 2.7
    preview.box(bx - 0.26, 0.14, bz - 0.26, 0.52, 0.18, 0.52, "2b3038", "Brazier")
    preview.box(bx - 0.12, 0.32, bz - 0.12, 0.24, 0.45, 0.24, "42474f", "Brazier")
    for i in range(4):
        w = 0.42 - i * 0.08
        preview.box(
            bx - w / 2,
            0.77 + i * 0.12,
            bz - w / 2,
            w,
            0.14,
            w,
            ["38b889", "5ad1a4", "8cf0c8", "f2a855"][i],
            "Flame",
            True,
        )
    # Dark wrought-iron sewer spikes / grate around the brazier (replaces wooden picket fence).
    for i in range(5):
        preview.box(
            bx - 0.9 + i * 0.2, 0.14, bz + 0.5, 0.08, 0.3, 0.08, "2b3038", "Preview_Sewer_Bars"
        )
    for i in range(4):
        preview.box(
            bx - 0.9 + i * 0.2, 0.44, bz + 0.5, 0.08, 0.08, 0.08, "42474f", "Preview_Sewer_Bars"
        )
    # Wrought-iron grate ring around the brazier base.
    for i in range(6):
        ang = math.pi * i / 3
        preview.box(
            bx + math.cos(ang) * 0.42 - 0.04,
            0.14,
            bz + math.sin(ang) * 0.42 - 0.04,
            0.08,
            0.22,
            0.08,
            "2b3038",
            "Preview_Sewer_Bars",
        )

    preview.finish("preview-black-market.glb", source="建模工具/build_black_market.py")
    return preview


def main():
    rng = random.Random(20261120)
    model = Model("Wanxiang_Black_Market", cards=True)
    build_central_board(model, rng)
    build_west_wing(model, rng)
    build_east_wing(model, rng)
    build_north_auction(model, rng)
    build_south_foreground(model, rng)
    build_varied_outer_rim(model, rng)
    counts = model.finish(
        "black-market.glb",
        source="建模工具/build_black_market.py",
        metadata={
            "biome": "black-market",
            "titleZh": "暗巷黑市",
            "motionNodes": [
                "Motion_BlackMarket_Cage",
                "Motion_BlackMarket_Pulley",
            ],
            "peripheryLayout": {
                "mode": "authored-large",
                "uniqueSpan": [17.5, 24.0],
                "uniqueBounds": {"x": [-24.2, 24.2], "z": [-18.2, 18.2]},
                "zones": [
                    "north-auction-alcove",
                    "west-alchemy-den",
                    "west-contraband-vault",
                    "west-canal-dock",
                    "east-gambling-alcove",
                    "east-weapons-fence",
                    "east-secret-stairwell",
                    "south-alley-entrance",
                    "far-undercroft-vaults",
                ],
                "mirroredRight": False,
                "bounds": {"x": 24.2, "z": 18.2},
                "patches": 1,
                "boxes": len(model.boxes),
            },
        },
    )
    print("Black Market components:", len(counts), "groups")
    print("Black Market boxes:", len(model.boxes))

    preview_rng = random.Random(20261120)
    preview = build_black_market_preview(preview_rng)
    print("Black Market preview boxes:", len(preview.boxes))


if __name__ == "__main__":
    main()
