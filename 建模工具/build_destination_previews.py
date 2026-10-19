"""Five purpose-built miniature voxel dioramas for the two-level destination pager."""

import json
import math
import random

from build_realms import ASSETS, OUT, Model

PALETTES = {
    "ruins": ("3c4548", "7c8274", "aaaf8e", "c9b779", "88d6cf"),
    "forest": ("354942", "526c4c", "789564", "c3b684", "a7e7a2"),
    "frost": ("354b65", "6d9bab", "aecbd0", "a8c9d7", "7ce7ee"),
    "forge": ("373d47", "675b55", "968274", "cf9d62", "ffad56"),
    "tide": ("36556a", "548d98", "97b9ad", "d1c58d", "8be5df"),
}


def base(model, theme, rng):
    dark, stone, top, trim, glow = PALETTES[theme]
    for ix in range(-10, 11):
        for iz in range(-8, 9):
            if abs(ix) + abs(iz) > 15 or (abs(ix) > 8 and abs(iz) > 5):
                continue
            x, z = ix * 0.4, iz * 0.4
            depth = 0.5 + rng.choice([0, 0.2, 0.4])
            model.box(x, -depth, z, 0.39, depth, 0.39, dark, "Floating_Bedrock")
            model.box(x, 0, z, 0.39, 0.14, 0.39, rng.choice([stone, top, top]), "Terrain")
            if rng.random() < 0.2:
                model.box(x + 0.08, 0.14, z + 0.09, 0.12, 0.04, 0.08, stone, "Surface_Chips")
    # Raised causeway, stone curbs, recessed luminous edge, and three entrance stairs.
    for ix in range(-2, 3):
        for iz in range(-6, 7):
            model.box(ix * 0.38, 0.15, iz * 0.4, 0.36, 0.1, 0.38, stone, "Causeway")
    for side in [-1, 1]:
        model.box(side * 1.13, 0.19, -2.4, 0.12, 0.13, 5.2, trim, "Causeway_Edge")
        model.box(side * 1.15, 0.32, -1, 0.055, 0.035, 2.2, glow, "Light_Inlay", True)
    for i in range(3):
        model.box(-1.3, -0.13 + i * 0.1, 3.5 - i * 0.32, 2.9, 0.1, 0.34, trim, "Front_Stairs")


def pillar(model, x, z, height, theme):
    dark, stone, top, trim, glow = PALETTES[theme]
    for y, w, h, color in [(0.15, 0.8, 0.18, dark), (0.33, 0.69, 0.16, trim)]:
        model.box(x - w / 2, y, z - w / 2, w, h, w, color, "Pillar_Plinths")
    for level in range(round(height / 0.24)):
        model.box(
            x - 0.24,
            0.49 + level * 0.24,
            z - 0.24,
            0.48,
            0.225,
            0.48,
            stone if level % 3 else top,
            "Carved_Pillars",
        )
    model.box(x - 0.37, height + 0.45, z - 0.37, 0.74, 0.18, 0.74, trim, "Pillar_Capitals")
    model.box(x - 0.06, 0.7, z + 0.245, 0.12, height * 0.63, 0.045, glow, "Pillar_Runes", True)


def arch(model, theme):
    _, stone, top, trim, glow = PALETTES[theme]
    for x in [-1.2, 1.2]:
        pillar(model, x, -1.65, 2.6, theme)
    for i in range(11):
        x = (i - 5) * 0.24
        y = 3.08 + (5 - abs(i - 5)) * 0.14
        model.box(x - 0.14, y, -1.94, 0.28, 0.38, 0.58, top if i % 2 else stone, "Stepped_Arch")
        model.box(x - 0.09, y + 0.39, -1.88, 0.18, 0.07, 0.46, trim, "Arch_Crown")
    model.box(-0.1, 3.72, -1.98, 0.2, 0.28, 0.1, glow, "Arch_Keystone", True)


def brazier(model, x, z):
    model.box(x - 0.26, 0.2, z - 0.26, 0.52, 0.18, 0.52, "443f40", "Brazier")
    model.box(x - 0.12, 0.38, z - 0.12, 0.24, 0.45, 0.24, "aa9163", "Brazier")
    for i in range(4):
        w = 0.42 - i * 0.08
        model.box(
            x - w / 2,
            0.85 + i * 0.12,
            z - w / 2,
            w,
            0.14,
            w,
            ["f28e45", "ffc66a", "ffe4a0", "fff0ba"][i],
            "Flame",
            True,
        )


def tree(model, x, z, size, rng):
    for i in range(12):
        model.box(
            x - 0.14 + math.sin(i) * 0.035,
            0.14 + i * 0.2,
            z - 0.14,
            0.29,
            0.22,
            0.29,
            "715b44" if i % 3 else "8b7553",
            "Tree_Trunks",
        )
    for _ in range(100):
        a, b, c = [rng.uniform(-1, 1) for _ in range(3)]
        if a * a + b * b + c * c > 1:
            continue
        model.box(
            x + a * size,
            2.65 + b * size * 0.7,
            z + c * size,
            0.38,
            0.35,
            0.38,
            rng.choice(["43644d", "587c57", "729262", "93ac75"]),
            "Layered_Canopy",
        )
    for dx, dz in [(0.3, 0), (-0.3, 0.15), (0, -0.3)]:
        model.box(x + dx - 0.1, 0.14, z + dz - 0.1, 0.24, 0.13, 0.25, "715b44", "Tree_Roots")


def ruins(model, rng):
    arch(model, "ruins")
    for x, z, h in [(-2.8, 0.2, 1.2), (2.7, -0.6, 1.8), (2.5, 1.7, 0.6)]:
        pillar(model, x, z, h, "ruins")
    for x in [-1.9, 1.9]:
        brazier(model, x, 1.65)
    model.ring(0.1, 0.28, 0.1, 0.7, "88d6cf", 0.04, "Ritual_Seal", True)
    for _ in range(45):
        x, z = rng.uniform(-3.5, 3.5), rng.uniform(-2.6, 2.5)
        if abs(x) > 1.6:
            model.box(x, 0.16, z, 0.16, 0.09, 0.2, "637c50", "Moss")


def forest(model, rng):
    for x, z, s in [(-2.5, -1.9, 1.25), (2.5, -1.3, 1.35), (-3, 1, 0.9)]:
        tree(model, x, z, s, rng)
    arch(model, "forest")
    for _ in range(35):
        x, z = rng.uniform(-3.2, 3.2), rng.uniform(-2.8, 2.7)
        if abs(x) < 1.35:
            continue
        model.box(x, 0.15, z, 0.045, 0.14, 0.045, "d3ccb0", "Mushrooms")
        model.box(
            x - 0.07,
            0.29,
            z - 0.07,
            0.18,
            0.065,
            0.18,
            rng.choice(["93d5c2", "dfa880", "c3c97d"]),
            "Mushroom_Caps",
        )
    model.box(1.8, 0.2, 1.1, 1.05, 0.16, 0.55, "685b43", "Rest_Bench")


def frost(model, rng):
    for x, z, size, h in [
        (-2.8, -1.7, 0.8, 3),
        (-2.3, -1.4, 0.5, 2.1),
        (2.6, -1.8, 1, 3.8),
        (3, 0.4, 0.5, 1.7),
        (-2.7, 1.8, 0.5, 1.3),
    ]:
        model.crystal(x, z, size, "77bacf", h)
    for z in [i * 0.36 - 2.3 for i in range(16)]:
        model.box(-0.85, 0.26, z, 1.75, 0.07, 0.14, "8d8376", "Track_Sleepers")
    for x in [-0.63, 0.63]:
        model.box(x, 0.33, -2.6, 0.07, 0.1, 5.8, "c3d8d9", "Steel_Rails")
    # Separate cart group supports a short, continuous runtime rail movement.
    for x in [-0.52, 0.52]:
        for z in [-0.3, 0.3]:
            model.box(x, 0.39, z, 0.14, 0.25, 0.24, "3a505a", "Minecart")
    model.box(-0.6, 0.65, -0.4, 1.35, 0.12, 1, "7c7770", "Minecart")
    for x in [-0.6, 0.6]:
        model.box(x, 0.77, -0.4, 0.12, 0.55, 1, "a29b8d", "Minecart")
    for z in [-0.4, 0.5]:
        model.box(-0.6, 0.77, z, 1.3, 0.55, 0.12, "a29b8d", "Minecart")
    for _ in range(18):
        model.box(
            rng.uniform(-0.4, 0.4),
            1.1,
            rng.uniform(-0.2, 0.3),
            0.22,
            rng.uniform(0.15, 0.4),
            0.19,
            "9bdde3",
            "Minecart",
        )
    for x in [-1.5, 1.5]:
        pillar(model, x, -2, 2.1, "frost")
    model.box(-1.85, 2.8, -2.3, 3.7, 0.26, 0.65, "968a78", "Mine_Beam")


def forge(model, rng):
    for ix in range(12):
        model.box(
            1.85,
            0.18,
            -2.4 + ix * 0.4,
            1.05,
            0.05,
            0.38,
            rng.choice(["c56b39", "e88e43", "ffb561"]),
            "Molten_Channel",
            True,
        )
    for i in range(13):
        w = 1.8 if i < 6 else 1.2 if i < 10 else 0.8
        model.box(
            -w / 2,
            0.25 + i * 0.24,
            -2.45,
            w,
            0.23,
            1.1,
            "6a5d55" if i % 2 else "7c6d5d",
            "Brick_Furnace",
        )
    model.box(-0.5, 0.4, -1.33, 1, 0.85, 0.06, "ffb05d", "Furnace_Mouth", True)
    for x in [-0.6, 0.6]:
        model.box(x, 0.38, -1.28, 0.18, 0.94, 0.15, "353e47", "Furnace_Grate")
    for x in [-0.3, 0, 0.3]:
        model.box(x, 0.42, -1.24, 0.055, 0.83, 0.12, "45464a", "Furnace_Grate")
    model.box(-2.8, 0.2, 0.3, 1.35, 0.42, 1, "665744", "Anvil_Base")
    model.box(-2.6, 0.62, 0.5, 0.95, 0.38, 0.6, "596370", "Anvil")
    model.box(-2.85, 1, 0.42, 1.5, 0.2, 0.75, "a2a9ac", "Anvil")
    for x in [-1.1, 1.1]:
        model.box(x, 0.3, 1.4, 0.15, 0.65, 0.8, "5f4937", "Workbench")
    model.box(-1.25, 0.95, 1.32, 2.6, 0.18, 1, "a98453", "Workbench")
    for i in range(7):
        model.box(-1 + i * 0.32, 1.14, 1.55, 0.2, 0.15, 0.46, "bbb8a4", "Metal_Ingots")
    brazier(model, -3, -1.7)


def tide(model, rng):
    for x, z, h in [(-2.3, -1.6, 2.8), (2.3, -1.6, 2.8), (-2.7, 1.5, 1.2), (2.7, 1.5, 1.6)]:
        pillar(model, x, z, h, "tide")
    for i in range(64):
        angle = i * math.tau / 64
        x, y = math.cos(angle) * 1.24, 2.5 + math.sin(angle) * 1.24
        model.box(x - 0.1, y, -1.7, 0.2, 0.19, 0.25, "d1c58d", "Celestial_Ring")
        if i % 8 == 0:
            model.box(x - 0.07, y + 0.04, -1.43, 0.14, 0.14, 0.07, "a4ece0", "Star_Studs", True)
    model.ring(0, 0.32, 0.7, 0.85, "96e9de", 0.055, "Tidal_Seal", True)
    for _ in range(30):
        x, z = rng.uniform(-3.7, 3.7), rng.uniform(-2.7, 2.8)
        if abs(x) < 1.5:
            continue
        height = rng.uniform(0.2, 0.6)
        color = rng.choice(["d29191", "afabcc", "79c8bd"])
        model.box(x, 0.14, z, 0.09, height, 0.09, color, "Branching_Coral")
        model.box(x - 0.16, height * 0.7, z, 0.4, 0.07, 0.09, color, "Branching_Coral")


def main():
    report = []
    for index, (theme, build) in enumerate(
        [("ruins", ruins), ("forest", forest), ("frost", frost), ("forge", forge), ("tide", tide)]
    ):
        rng = random.Random(3471 + index)
        model = Model(f"Destination miniature / {theme}")
        base(model, theme, rng)
        build(model, rng)
        filename = f"preview-{theme}.glb"
        counts = model.finish(filename, source="建模工具/build_destination_previews.py")
        report.append(
            {
                "theme": theme,
                "asset": filename,
                "boxes": len(model.boxes),
                "components": counts,
                "bytes": (ASSETS / filename).stat().st_size,
            }
        )
    (OUT / "preview-manifest.json").write_text(
        json.dumps(
            {"source": "建模工具/build_destination_previews.py", "models": report},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
