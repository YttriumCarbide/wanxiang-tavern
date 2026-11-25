"""Build the Black Market (暗巷黑市) voxel battlefield and its miniature preview."""

import math
import random
from functools import partial

import numpy as np

from build_realms import Model

TIDE_Y = -0.08

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


def build_wharf_deck(model, start_z, end_z, colors, group, rivet):
    model.box(-6.44, -0.25, start_z, 12.88, 0.25, end_z - start_z, "33251b", group)
    for edge_z in (start_z, end_z - 0.085):
        model.box(-6.44, -0.19, edge_z, 12.88, 0.278, 0.085, "7a573b", group)
    for row, z in enumerate(np.arange(start_z + 0.097, end_z - 0.21, 0.39)):
        x = -6.44
        column = 0
        length = 1.28 - (row % 3) * 0.38
        depth = min(0.353, end_z - 0.096 - z)
        while x < 6.38:
            width = min(length - 0.034, 6.44 - x)
            color = colors[(row * 3 + column) % len(colors)]
            model.box(x, 0.0, z, width, 0.088, depth, color, group)
            if width > 0.22 and column % 3 == row % 3:
                model.box(x + 0.12, 0.088, z + 0.08, 0.045, 0.010, 0.045, rivet, group)
            x += length
            column += 1
            length = 1.28


def build_central_board(model):
    # The basin extends under the land and piers, not as a dry slab over the inlet.
    model.box(-25.0, -0.56, -19.0, 50.0, 0.22, 38.0, "101a1d", "00_Harbor_Basin_Bedrock")
    model.box(-25.0, -0.34, -19.0, 50.0, 0.26, 38.0, "183f46", "01_Harbor_Basin_Water")
    build_wharf_deck(
        model,
        0.68,
        5.48,
        ("594230", "715235", "543d2b", "635440"),
        "02_Central_Wharf_Deck",
        "a68150",
    )
    build_wharf_deck(
        model,
        -5.48,
        -0.68,
        ("473426", "594230", "493b32", "63503d"),
        "03_Enemy_Cargo_Wharf",
        "785a44",
    )

    # Two timber crossings leave a wide, recessed tidal slip visible between the card rows.
    channel = "04_Tidal_Slip_Water"
    model.box(-6.44, TIDE_Y, -0.68, 12.88, 0.008, 1.36, "30636a", channel)
    for i, x in enumerate(np.arange(-6.25, 6.16, 0.56)):
        model.box(
            float(x),
            TIDE_Y + 0.010,
            -0.37 + (i % 4) * 0.19,
            0.32,
            0.008,
            0.04,
            ("4c8886", "255258", "5d9e91")[i % 3],
            channel,
        )
    for x in (-5.76, 4.73):
        group = "05_Wharf_Crossings"
        model.box(x, -0.20, -0.79, 1.02, 0.21, 1.58, "473426", group)
        for i in range(6):
            model.box(
                x + 0.018,
                0.010,
                -0.65 + i * 0.222,
                0.986,
                0.085,
                0.20,
                "876340" if i % 2 else "6b5035",
                group,
            )

    # Six grounded card foundations keep their authored anchors and footprint.
    for z in (-2.345, 2.345):
        for x in (-3.014, 0.0, 3.014):
            enemy_side = z < 0
            base_col = "343946" if enemy_side else "3d373a"
            top_col = "473426" if enemy_side else "594230"
            model.box(
                x - 1.12, 0.0, z - 1.54, 2.24, 0.10, 3.08, base_col, "Six_Grounded_Foundations"
            )
            model.box(
                x - 1.05, 0.10, z - 1.47, 2.10, 0.06, 2.94, top_col, "Six_Grounded_Foundations"
            )
            model.ring(x, 0.16, z, 0.52, "5e5252", 0.035, "Revealed_Dais_Engraving")
            for sx in (-1, 1):
                for sz in (-1, 1):
                    model.box(
                        x + sx * 0.93 - 0.1,
                        0.16,
                        z + sz * 1.35,
                        0.24,
                        0.035,
                        0.045,
                        "5ad1a4" if enemy_side else "c89854",
                        "Dais_Corner_Inlay",
                        glow=enemy_side,
                    )

    for side in (-1, 1):
        for start in (-5.48, 0.68):
            x = side * 6.47 - 0.08
            model.box(x, -0.22, start, 0.16, 0.35, 4.8, "473426", "Edge_Curb")
            for z in np.arange(start + 0.15, start + 4.8 - 0.16, 0.75):
                model.box(x - 0.035, 0.13, float(z), 0.23, 0.030, 0.16, "92724f", "Edge_Curb")


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
    box = partial(safe_prop_box, model)
    colors = ("473426", "765538", "594230", "88613c")
    # The dock face is open to the tidal slip. Two offset landings replace the continuous stone wing.
    north = "East_Receiver_Wharf"
    build_timber_quay(box, 6.60, -8.6, 7.8, 5.25, colors, north)
    for x, z in ((7.35, -4.9), (8.46, -6.1), (10.27, -4.6), (13.05, -5.7)):
        stack_crate(box, x, 0.235, z, rng.choice(colors), "East_Bonded_Cargo")
    build_canvas_stall(box, 7.28, -8.25, 3.24, 2.32, ("3b5450", "496560"), "East_Cargo_Shelter")
    build_loading_gantry(box, 11.36, 0.235, -4.75, 0.9, "East_Receiver_Hoist")

    south = "East_Market_Wharf"
    build_timber_quay(box, 6.60, 2.02, 7.95, 3.45, colors, south)
    for x, z, width, shades in (
        (7.05, 2.47, 3.18, ("6e1d28", "a83242")),
        (10.88, 2.55, 3.06, ("374b46", "53645b")),
    ):
        build_canvas_stall(box, x, z, width, 2.10, shades, "East_Quayside_Market")
        box(x + 0.17, 0.235, z + 1.33, width - 0.34, 0.68, 0.44, "594230", "East_Stall_Counters")
        for i, color in enumerate(("5ad1a4", "c89854", "38b889", "e39b5a", "8cf0c8")):
            box(
                x + 0.45 + i * 0.49,
                0.915,
                z + 1.50,
                0.15,
                0.27,
                0.14,
                color,
                "East_Stall_Lights",
                glow=True,
            )

    # Piles and bollards trace the bend of the eastern inlet rather than walling it off.
    for z in (-4.92, -4.17, 2.26, 3.61, 4.96):
        for x in (6.82, 13.7):
            box(x, -0.35, z, 0.19, 0.88, 0.20, "624531", "East_Mooring_Piles")
            box(x - 0.028, 0.53, z - 0.027, 0.25, 0.048, 0.25, "a77c50", "East_Mooring_Piles")


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


def build_cargo_skiff(box, x, water_y, z, scale, group):
    """Low open hull with a tapered bow, gunwales, a stepped sail and cargo on deck."""

    def piece(dx, dy, dz, w, h, d, color):
        box(
            x + dx * scale,
            water_y + dy * scale,
            z + dz * scale,
            w * scale,
            h * scale,
            d * scale,
            color,
            group,
        )

    # Each station flares above the water and tapers toward the bow at the right.
    for start, length, width in (
        (0, 0.4, 0.64),
        (0.4, 2.9, 1.12),
        (3.3, 0.55, 0.76),
        (3.85, 0.46, 0.39),
    ):
        piece(start, -0.105, -width * 0.37, length, 0.22, width * 0.74, "33251b")
        piece(start, 0.115, -width / 2, length, 0.16, width, "6b5032")
        for side in (-1, 1):
            piece(start, 0.275, side * (width / 2 - 0.055) - 0.055, length, 0.14, 0.11, "996541")
    piece(0.04, 0.275, -0.32, 0.11, 0.14, 0.64, "996541")
    piece(4.20, 0.275, -0.19, 0.11, 0.14, 0.38, "996541")
    piece(1.99, 0.275, -0.045, 0.09, 1.45, 0.09, "624531")
    for row, width in enumerate((0.99, 0.86, 0.73, 0.57, 0.38, 0.19)):
        piece(
            2.05, 0.72 + row * 0.145, -0.04, width, 0.145, 0.08, "8f2634" if row % 2 else "a83242"
        )
    for dx, dz in ((0.61, -0.27), (1.19, -0.02), (2.92, -0.24)):
        piece(dx, 0.275, dz, 0.46, 0.32, 0.38, "594230")
        piece(dx + 0.05, 0.595, dz + 0.04, 0.35, 0.055, 0.30, "b2824e")


def build_loading_gantry(box, x, deck_y, z, scale, group):
    """A static timber hoist, usable at both combat and miniature scales."""

    def piece(dx, dy, dz, w, h, d, color):
        box(
            x + dx * scale,
            deck_y + dy * scale,
            z + dz * scale,
            w * scale,
            h * scale,
            d * scale,
            color,
            group,
        )

    for dx in (0, 1.92):
        piece(dx, 0, -0.14, 0.19, 2.04, 0.28, "624531")
        piece(dx - 0.07, 1.89, -0.22, 0.33, 0.14, 0.44, "9c784e")
        for step in range(4):
            brace = dx + (step * 0.13 if dx == 0 else 0.02 - step * 0.13)
            piece(brace, 1.42 + step * 0.13, -0.18, 0.20, 0.16, 0.12, "87603e")
    piece(-0.15, 2.0, -0.21, 2.47, 0.23, 0.42, "624531")
    piece(0.97, 1.95, -0.13, 0.36, 0.31, 0.43, "42474f")
    for dz in (-0.09, 0.19):
        piece(1.12, 0.86, dz, 0.045, 1.17, 0.045, "b38e65")
    piece(0.88, 0.55, -0.29, 0.52, 0.34, 0.70, "6e4629")
    piece(0.81, 0.52, -0.32, 0.66, 0.065, 0.76, "42474f")


def stack_crate(box, x, y, z, color, group):
    box(x, y, z, 0.58, 0.37, 0.50, color, group)
    for dx in (0.05, 0.46):
        box(x + dx, y + 0.37, z + 0.02, 0.07, 0.04, 0.46, "a78351", group)


def build_canvas_stall(box, x, z, width, depth, colors, group):
    for post_x in (x + 0.05, x + width - 0.17):
        for post_z in (z + 0.08, z + depth - 0.18):
            box(post_x, 0.235, post_z, 0.12, 1.75, 0.14, "624531", group)
    for row in range(5):
        y = 2.16 - row * 0.05
        length = depth / 5
        for stripe in range(7):
            span = (width + 0.24) / 7
            box(
                x - 0.12 + stripe * span,
                y,
                z + row * length,
                span - 0.008,
                0.08,
                length,
                colors[stripe % 2],
                group,
            )
    box(x - 0.11, 1.74, z + depth - 0.06, width + 0.22, 0.29, 0.1, colors[0], group)


def build_timber_quay(box, x, z, width, depth, colors, group):
    box(x, -0.24, z, width, 0.42, depth, colors[0], group)
    for row, plank_z in enumerate(np.arange(z + 0.02, z + depth - 0.12, 0.3)):
        for column, plank_x in enumerate(np.arange(x + 0.02, x + width - 0.10, 1.17)):
            box(
                float(plank_x),
                0.18,
                float(plank_z),
                min(1.12, x + width - plank_x - 0.015),
                0.055,
                min(0.274, z + depth - plank_z - 0.02),
                colors[(row + column * 3) % len(colors)],
                group,
            )


def build_water_marks(box, rng, x, z, width, depth, group, row_spacing=0.56):
    for row, row_z in enumerate(np.arange(z + 0.2, z + depth - 0.15, row_spacing)):
        for col, col_x in enumerate(np.arange(x + 0.24, x + width - 0.46, 1.65)):
            ripple_x = col_x + rng.uniform(0.00, 0.37)
            long = (row + col * 3) % 7 == 0
            color = "57918f" if long else rng.choice(("22545b", "2b6167", "3d7677", "387173"))
            ripple_width = min(rng.uniform(0.36, 1.21), x + width - ripple_x - 0.04)
            if ripple_width > 0:
                box(
                    float(ripple_x),
                    TIDE_Y + 0.013,
                    float(row_z),
                    ripple_width,
                    0.009,
                    0.043 if long else 0.058,
                    color,
                    group,
                )


def build_harbor_frontage(model, rng):
    box = partial(safe_prop_box, model)
    water = "South_Harbor_Water"
    box(-24.2, TIDE_Y, 5.48, 48.4, 0.008, 12.72, "2a5962", water)
    build_water_marks(box, rng, -24.2, 5.48, 48.4, 12.72, water)
    box(6.44, TIDE_Y, -3.35, 13.0, 0.008, 5.37, "28555d", "East_Tidal_Inlet_Water")
    build_water_marks(box, rng, 6.44, -3.35, 13.0, 5.37, "East_Tidal_Inlet_Water")

    # Unequal wharves leave the middle of the foreground open to a loaded vessel.
    colors = ("473426", "775637", "594230", "966947")
    for west, east, pier_end in ((-14.6, 0.12, 6.76), (5.82, 9.11, 8.48)):
        build_timber_quay(
            box, west, 5.48, east - west, pier_end - 5.48, colors, "South_Timber_Quay"
        )
        for x in np.arange(west + 0.26, east - 0.19, 1.06):
            box(float(x), -0.34, pier_end - 0.26, 0.16, 0.72, 0.19, "624531", "South_Mooring_Piles")
        for x in (west + 0.26, east - 0.30):
            box(x, 0.235, 6.0, 0.21, 0.34, 0.21, "473426", "South_Mooring_Bollards")
            box(x - 0.039, 0.575, 5.96, 0.29, 0.07, 0.29, "c89854", "South_Mooring_Bollards")

    build_loading_gantry(box, -5.77, 0.235, 6.11, 1.0, "Landmark_BlackMarket_Harbor")
    build_cargo_skiff(box, 0.72, TIDE_Y, 6.18, 1.08, "Landmark_BlackMarket_Harbor_Skiff")
    for x, z in ((-3.28, 5.98), (-1.80, 5.76), (-1.14, 6.03), (6.01, 5.61)):
        stack_crate(box, x, 0.235, z, "6b5035", "South_Smuggler_Cargo")
    for x in (-5.94, -0.39, 6.55):
        box(x, 0.235, 5.57, 0.13, 0.55, 0.13, "33251b", "South_Quay_Lamps")
        box(x - 0.041, 0.785, 5.525, 0.21, 0.19, 0.21, "e39b5a", "South_Quay_Lamps", glow=True)
        box(x - 0.06, 0.975, 5.51, 0.25, 0.065, 0.25, "42474f", "South_Quay_Lamps")


def build_outer_harbor_districts(model, rng):
    box = partial(safe_prop_box, model)
    colors = ("473426", "6b5035", "594230", "7a573b")
    land = "Harbor_Bank_Stone"
    box(-15.8, -0.32, -13.8, 9.36, 0.32, 19.28, "343946", land)
    box(-6.44, -0.32, -13.8, 22.24, 0.32, 8.32, "343946", land)
    box(14.55, -0.32, 2.02, 5.4, 0.32, 3.45, "343946", land)

    # Western loading finger and distant warehouse row: individually placed, not tiled rims.
    build_timber_quay(box, -19.76, -7.1, 4.0, 12.58, colors, "West_Loading_Pier")
    for z in (-6.71, -3.68, -0.30, 2.74):
        build_canvas_stall(
            box, -19.39, z, 2.65, 1.90, ("703339", "574e44"), "West_Loading_Shelters"
        )
        stack_crate(box, -16.41, 0.235, z + 0.55, rng.choice(colors), "West_Quay_Freight")
    build_timber_quay(box, -12.40, -16.8, 14.0, 3.0, colors, "North_Timber_Cargo_Wharf")
    for x, depth, shades in (
        (-12.1, 2.14, ("493832", "67534c")),
        (-6.9, 2.46, ("374d47", "4a5950")),
        (-2.4, 2.08, ("6e1d28", "574e44")),
    ):
        build_canvas_stall(box, x, -16.53, 3.47, depth, shades, "North_Quay_Warehouses")
        stack_crate(box, x + 0.70, 0.235, -15.2, rng.choice(colors), "North_Quay_Freight")
    build_cargo_skiff(box, -21.65, TIDE_Y, -10.65, 0.96, "Northwest_Cargo_Barge")

    build_timber_quay(box, 19.4, -3.35, 2.55, 8.8, colors, "East_Outer_Mooring_Pier")
    for z in np.arange(-3.10, 5.44, 0.96):
        box(19.66, -0.33, float(z), 0.16, 0.80, 0.16, "624531", "East_Outer_Mooring_Piles")
    build_water_marks(box, rng, -24.2, -14.0, 4.37, 19.47, "West_Harbor_Water", row_spacing=0.78)
    build_water_marks(box, rng, 22.0, -14.0, 2.2, 19.47, "East_Harbor_Water", row_spacing=0.78)
    build_water_marks(box, rng, -24.2, -18.2, 48.4, 1.39, "North_Harbor_Water", row_spacing=0.41)
    for x, z, depth in ((-17.0, 10.90, 4.2), (14.6, 8.95, 5.7)):
        build_timber_quay(box, x, z, 2.6, depth, colors, "South_Outer_Mooring_Piers")


def build_preview_auction_arcade(preview, rng):
    """Three brick arches and hanging banners anchor the north side of the diorama."""
    wall = "Preview_Auction_Wall"
    for left, right, arch_x, radius in (
        (-3.8, -2.15, -2.98, 0.48),
        (-2.15, 0.67, -0.75, 0.91),
        (0.67, 2.28, 1.46, 0.49),
    ):
        for row in range(10):
            y = 0.14 + row * 0.226
            rise = max(0, y + 0.115 - 1.32)
            opening = math.sqrt(max(0, radius**2 - rise**2))
            color = rng.choice(PALETTE["brick"])
            if opening > 0.05:
                preview.box(left, y, -2.78, arch_x - opening - left, 0.22, 0.49, color, wall)
                preview.box(
                    arch_x + opening, y, -2.78, right - arch_x - opening, 0.22, 0.49, color, wall
                )
            else:
                preview.box(left, y, -2.78, right - left, 0.22, 0.49, color, wall)
        # A backed alcove and a broad masonry cap give the arcade depth.
        preview.box(left, 0.14, -2.97, right - left, 2.18, 0.18, "1c1e26", "Preview_Vault")
        preview.box(left, 2.42, -2.82, right - left, 0.16, 0.57, "5e5252", wall)
    for x in (-3.66, -2.23, 0.56, 2.13):
        preview.box(x, 0.14, -2.34, 0.22, 2.26, 0.15, "595054", wall)
        preview.box(x - 0.07, 1.45, -2.18, 0.36, 0.76, 0.06, "8f2634", "Preview_Banner")
        preview.box(x - 0.01, 1.13, -2.13, 0.24, 0.22, 0.20, "e39b5a", "Preview_Lantern", glow=True)
    preview.box(-1.6, 0.14, -2.0, 1.7, 0.18, 0.57, "343946", "Preview_Auction_Dais")
    preview.box(-1.06, 0.32, -1.9, 0.62, 0.52, 0.39, "594230", "Preview_Auction_Dais")
    preview.box(-0.9, 0.84, -1.79, 0.22, 0.26, 0.20, "5ad1a4", "Preview_Auction_Relic", glow=True)


def build_preview_stall(preview, x, z, colors):
    stall = "Preview_Market_Stalls"
    preview.box(x, 0.14, z, 1.50, 0.12, 1.03, "473426", stall)
    for dx in (0.06, 1.31):
        for dz in (0.05, 0.89):
            preview.box(x + dx, 0.26, z + dz, 0.1, 1.09, 0.1, "624531", stall)
    for row in range(5):
        for stripe, color in enumerate(colors):
            preview.box(
                x - 0.03 + stripe * 0.38,
                1.50 - row * 0.048,
                z + row * 0.23,
                0.38,
                0.06,
                0.23,
                color,
                stall,
            )
    preview.box(x + 0.09, 0.70, z + 0.61, 1.26, 0.12, 0.41, "594230", stall)
    for i, color in enumerate(("5ad1a4", "e39b5a", "8cf0c8")):
        preview.box(
            x + 0.23 + i * 0.35,
            0.82,
            z + 0.76,
            0.14,
            0.22,
            0.12,
            color,
            "Preview_Stall_Glass",
            glow=True,
        )


def build_black_market_preview(rng):
    preview = Model("Black market diorama preview / black-market", cards=False)
    for ix in range(-14, 14):
        for iz in range(-10, 11):
            if (abs(ix) > 12 and abs(iz) > 9) or (ix < -9 and iz > 6):
                continue
            x, z = ix * 0.3, iz * 0.3
            water = iz >= (4 if ix >= -2 else 8 if ix >= -8 else 10)
            depth = 0.28 + rng.choice([0.0, 0.13, 0.22])
            preview.box(x, -depth, z, 0.299, depth, 0.299, "1c1e26", "Floating_Bedrock")
            if water:
                preview.box(
                    x,
                    0.0,
                    z,
                    0.299,
                    0.039,
                    0.299,
                    rng.choice(("285558", "306365", "397876")),
                    "Preview_Harbor_Water",
                )
                if (ix * 3 + iz) % 7 == 0:
                    preview.box(
                        x + 0.06,
                        0.039,
                        z + 0.14,
                        0.20,
                        0.014,
                        0.035,
                        "76ae98",
                        "Preview_Harbor_Reflections",
                    )
            else:
                preview.box(x, 0.0, z, 0.29, 0.14, 0.29, rng.choice(PALETTE["brick"]), "Terrain")

    # Open L-shaped timber landing: the surrounding water is not covered by a land mesh.
    pier = "Preview_Harbor_Pier"
    preview.box(-0.82, 0.043, 0.89, 4.66, 0.22, 1.0, "473426", pier)
    preview.box(-0.82, 0.043, 1.89, 0.72, 0.22, 1.07, "473426", pier)
    for column, x in enumerate(np.arange(-0.80, 3.8, 0.25)):
        preview.box(
            float(x), 0.263, 0.91, 0.225, 0.047, 0.96, "7a573b" if column % 2 else "996541", pier
        )
    for row, z in enumerate(np.arange(1.92, 2.94, 0.21)):
        preview.box(
            -0.80, 0.263, float(z), 0.68, 0.047, 0.184, "7a573b" if row % 2 else "996541", pier
        )
    for x, z in ((-0.67, 2.78), (-0.25, 2.78), (0.37, 1.71), (1.5, 1.71), (3.61, 1.71)):
        preview.box(x, -0.10, z, 0.12, 0.61, 0.12, "624531", "Preview_Harbor_Piles")
        preview.box(x - 0.025, 0.51, z - 0.025, 0.17, 0.05, 0.17, "42474f", "Preview_Harbor_Piles")
    build_loading_gantry(preview.box, -0.55, 0.31, 1.37, 0.69, "Preview_Harbor_Gantry")
    build_cargo_skiff(preview.box, 0.2, 0.041, 2.46, 0.79, "Preview_Harbor_Skiff")

    build_preview_auction_arcade(preview, rng)
    build_preview_stall(preview, -3.37, -0.8, ("6e1d28", "8f2634", "6e1d28", "8f2634"))
    build_preview_stall(preview, 1.40, -0.92, ("345854", "496560", "345854", "496560"))
    for x, z in ((-3.13, 0.52), (-2.52, 0.9), (2.92, -1.05), (2.52, 0.55)):
        preview.box(x, 0.14, z, 0.36, 0.35, 0.38, "624531", "Preview_Contraband_Crates")
        preview.box(
            x + 0.055, 0.49, z + 0.045, 0.25, 0.05, 0.28, "c89854", "Preview_Contraband_Crates"
        )

    bx, bz = -2.52, 1.74
    preview.box(bx - 0.26, 0.14, bz - 0.26, 0.52, 0.18, 0.52, "2b3038", "Brazier")
    preview.box(bx - 0.12, 0.32, bz - 0.12, 0.24, 0.33, 0.24, "42474f", "Brazier")
    for i, color in enumerate(("38b889", "5ad1a4", "8cf0c8", "f2a855")):
        width = 0.36 - i * 0.072
        preview.box(
            bx - width / 2,
            0.65 + i * 0.10,
            bz - width / 2,
            width,
            0.12,
            width,
            color,
            "Flame",
            glow=True,
        )

    preview.finish("preview-black-market.glb", source="建模工具/build_black_market.py")
    return preview


def main():
    rng = random.Random(20261120)
    model = Model("Wanxiang_Black_Market", cards=True)
    build_central_board(model)
    build_west_wing(model, rng)
    build_east_wing(model, rng)
    build_north_auction(model, rng)
    build_harbor_frontage(model, rng)
    build_outer_harbor_districts(model, rng)
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
                "uniqueSpan": [18.2, 24.2],
                "uniqueBounds": {"x": [-24.2, 24.2], "z": [-18.2, 18.2]},
                "zones": [
                    "north-auction-alcove",
                    "west-alchemy-den",
                    "west-contraband-vault",
                    "west-canal-dock",
                    "east-receiver-wharf",
                    "east-market-wharf",
                    "east-tidal-inlet",
                    "south-timber-wharf",
                    "tidal-cargo-berth",
                    "north-quay-warehouses",
                    "west-loading-pier",
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
