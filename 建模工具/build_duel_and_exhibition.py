"""Export the two battle spaces and their open-front destination miniatures."""

import math
import random

from build_realms import Model

SOURCE = "建模工具/build_duel_and_exhibition.py"
SAND = ("b68a58", "be9664", "b99060", "c29b69", "b58c5d", "c6a16e")
SANDSTONE = ("9b765f", "aa856b", "b89679", "a78066", "bd9d80")
MARBLE = ("c0bcb0", "d4cdc0", "dfd7c6", "cac8bd", "d2d2c6", "e1ddd2")
MARINE = ("20424b", "284b54", "2b5059", "325660", "365e65")
BRONZE = "b68343"
GOLD = "e6be78"
IRON = "3b3b3e"
BURGUNDY = "76342f"


def floor(model, palette, grout, tile, rng):
    model.box(-10.8, -0.55, -7.85, 21.6, 0.43, 15.7, grout, "Bedrock")
    for row in range(math.ceil(15.7 / tile)):
        z = -7.85 + row * tile
        depth = min(tile, 7.85 - z)
        x = -10.8
        width = tile / 2 if row % 2 else tile
        while x < 10.79:
            width = min(width, 10.8 - x)
            model.box(
                x + 0.014,
                -0.13,
                z + 0.014,
                width - 0.028,
                0.13,
                depth - 0.028,
                rng.choice(palette),
                "Paving",
            )
            x += width
            width = tile


def line_on_floor(model, points, width, color, y, group):
    for a, b in zip(points, points[1:] + points[:1]):
        model.stroke((a[0], y, a[1]), (b[0], y, b[1]), color, width, group)


def stone_pier(model, x, z, height, stone, shade, group, width=0.8):
    model.box(x - width * 0.65, 0, z - width * 0.62, width * 1.3, 0.25, width * 1.24, shade, group)
    model.box(x - width / 2, 0.28, z - width / 2, width, height - 0.55, width, stone, group)
    for y in (0.28, height - 0.49, height - 0.28):
        model.box(
            x - width * 0.6, y, z - width * 0.59, width * 1.2, 0.12, width * 1.18, shade, group
        )
    model.box(
        x - width * 0.68,
        height - 0.16,
        z - width * 0.64,
        width * 1.36,
        0.16,
        width * 1.28,
        stone,
        group,
    )


def arch(model, x, z, spring, radius, thickness, palette, group):
    count = 17
    for index in range(count):
        angle = index * math.pi / (count - 1)
        center = x + math.cos(angle) * radius
        y = spring + math.sin(angle) * radius
        width = radius * math.pi / (count - 1) + thickness * 0.58
        model.box(
            center - width / 2,
            y - thickness / 2,
            z,
            width,
            thickness,
            0.56,
            palette[index % len(palette)],
            group,
        )


def banner(model, x, z, top, color, trim, group, width=1.12):
    model.box(x - width * 0.62, top, z - 0.09, width * 1.24, 0.1, 0.14, trim, group)
    for i in range(9):
        strip = width / 9
        height = width * (1.33 + (4 - abs(4 - i)) * 0.09)
        model.box(
            x - width / 2 + i * strip,
            top - height,
            z,
            strip,
            height,
            0.055,
            color if i not in (0, 8) else trim,
            group,
        )
    insignia_y = top - width * 0.64
    model.box(x - 0.045, insignia_y - 0.21, z + 0.055, 0.09, 0.44, 0.029, trim, group)
    model.box(x - 0.17, insignia_y - 0.045, z + 0.055, 0.34, 0.09, 0.028, trim, group)


def brazier(model, x, z, y, group):
    for shift, height, width in ((0, 0.16, 0.62), (0.16, 0.34, 0.28), (0.5, 0.15, 0.59)):
        model.box(x - width / 2, y + shift, z - width / 2, width, height, width, IRON, group)
    for offset_x, offset_z, height in ((0, 0, 0.45), (-0.13, -0.07, 0.29), (0.14, 0.05, 0.24)):
        model.box(
            x + offset_x - 0.08,
            y + 0.62,
            z + offset_z - 0.08,
            0.16,
            height,
            0.16,
            "ffad4f",
            group,
            glow=True,
        )
        model.box(
            x + offset_x - 0.05,
            y + 0.66,
            z + offset_z - 0.04,
            0.1,
            height * 0.54,
            0.09,
            "fff0a2",
            group,
            glow=True,
        )


def stands(model, side, rng):
    for level in range(4):
        height = 0.28 + level * 0.41
        inner = 6.7 + level * 0.74
        x = inner if side > 0 else -inner - 0.75
        for index in range(10):
            z = -4.85 + index * 0.93
            if index in (4, 5):
                continue
            model.box(x, 0, z, 0.75, height, 0.915, rng.choice(SANDSTONE), "Stands")
            model.box(x - 0.025, height, z, 0.8, 0.09, 0.915, "c4a387", "Stands")
        model.box(x, 0, -1.13, 0.75, height * 0.67, 1.86, "95715b", "Stairs")
    outer = side * 9.73
    for z in (-3.85, -0.45, 3.25):
        stone_pier(model, outer, z, 2.83, "b18d71", "795e52", "Stands")
    model.box(outer - 0.2, 2.06, -4.42, 0.4, 0.16, 8.7, "d1ad86", "Stands")


def arena(model, rng):
    floor(model, SAND, "765c4a", 0.89, rng)
    for radius, color, height in (
        (6.21, "6c4740", 0.025),
        (6.02, GOLD, 0.041),
        (5.85, "7c4a3b", 0.057),
    ):
        points = [
            (
                radius * math.cos((i + 0.5) * math.tau / 8),
                radius * 0.77 * math.sin((i + 0.5) * math.tau / 8),
            )
            for i in range(8)
        ]
        line_on_floor(model, points, 0.11, color, height, "Ring_Mosaic")
    for radius, color in ((1.54, "9c5b42"), (1.36, "d6ad6a"), (0.98, "8b4e3a")):
        model.ring(0, 0.036, 0, radius, color, 0.071, "Ring_Mosaic")
    for side in (-1, 1):
        for offset in (-0.26, 0.26):
            model.stroke(
                (side * 0.72, 0.049, -0.47 + offset),
                (-side * 0.72, 0.049, 0.47 + offset),
                "794a3b",
                0.085,
                "Emblem",
            )
        stands(model, side, rng)
        brazier(model, side * 6.35, 3.25, 0.05, "Braziers")
        brazier(model, side * 3.42, -5.63, 0.11, "Braziers")
        banner(model, side * 5.48, -5.75, 3.45, BURGUNDY, GOLD, "Crimson_Standards")
        for x in (4.14, 6.7, 9.15):
            stone_pier(model, side * x, -6.48, 3.45, "c2a083", "8f6b59", "Grandstand")
        for x in (5.42, 7.93):
            model.box(side * x - 1.02, 0, -7.18, 2.04, 2.64, 0.35, "76626a", "Grandstand")
            arch(model, side * x, -6.72, 1.97, 1.12, 0.33, SANDSTONE, "Grandstand")
    for x in (-2.07, 2.07):
        stone_pier(model, x, -6.43, 3.1, "c4a386", "946b52", "Champion_Gate", 0.97)
    arch(model, 0, -6.66, 2.49, 1.8, 0.46, SANDSTONE, "Champion_Gate")
    model.box(-1.78, 0, -7.1, 3.56, 2.73, 0.31, "343541", "Gate_Grille")
    for i in range(-7, 8):
        model.box(i * 0.22 - 0.032, 0, -6.76, 0.064, 2.62, 0.14, IRON, "Gate_Grille")
    for y in (0.39, 1.21, 2.22):
        model.box(-1.77, y, -6.66, 3.54, 0.09, 0.13, "a58055", "Gate_Grille")
    for step in range(3):
        width = 4.4 - step * 0.45
        model.box(
            -width / 2, step * 0.09, -6.71, width, 0.09, 1.32 - step * 0.24, "b18b71", "Gate_Stairs"
        )
    model.box(-9.2, 3.54, -7.02, 18.4, 0.22, 0.74, "caa47e", "Grandstand")
    model.box(-1.43, 4.46, -6.82, 2.86, 0.18, 0.52, "d5ad78", "Champion_Gate")
    banner(model, 0, -6.04, 4.43, "852f37", GOLD, "Crimson_Standards", 0.93)


def display(model, x, z, kind, color):
    group = "Display_" + kind.title()
    for y, w, h, d, material in (
        (0, 1.48, 0.13, 1.54, "678187"),
        (0.13, 1.27, 0.51, 1.25, "263f44"),
        (0.64, 1.38, 0.115, 1.38, BRONZE),
        (0.755, 1.25, 0.055, 1.25, "51363b"),
    ):
        model.box(x - w / 2, y, z - d / 2, w, h, d, material, group)
    model.box(x - 0.24, 0.36, z + 0.626, 0.48, 0.13, 0.035, GOLD, group)
    if kind == "vase":
        for index, width in enumerate((0.35, 0.54, 0.65, 0.73, 0.66, 0.44, 0.31, 0.41)):
            model.box(
                x - width / 2,
                0.81 + index * 0.125,
                z - width / 2,
                width,
                0.125,
                width,
                GOLD if index in (2, 7) else color,
                group,
            )
        for side in (-1, 1):
            model.box(x + side * 0.39 - 0.06, 1.25, z - 0.08, 0.12, 0.42, 0.16, GOLD, group)
    elif kind == "crystals":
        for dx, dz, height in ((-0.23, 0.13, 0.56), (0.12, -0.12, 1.01), (0.33, 0.18, 0.39)):
            for index in range(6):
                width = (0.16 if height < 0.6 else 0.29) * (1 - index * 0.113)
                model.box(
                    x + dx - width / 2,
                    0.81 + index * height / 6,
                    z + dz - width / 2,
                    width,
                    height / 6,
                    width,
                    color if index % 2 else "a7eddc",
                    group,
                    glow=True,
                )
    else:
        model.box(x - 0.17, 0.81, z - 0.19, 0.34, 0.1, 0.38, BRONZE, group)
        model.box(x - 0.055, 0.91, z - 0.055, 0.11, 0.91, 0.11, GOLD, group)
        model.box(x - 0.28, 1.75, z - 0.11, 0.56, 0.11, 0.22, GOLD, group)
        for index, width in enumerate((0.41, 0.28, 0.19, 0.1)):
            model.box(
                x - width / 2, 1.86 + index * 0.18, z - width / 2, width, 0.18, width, color, group
            )
    for dx in (-0.63, 0.63):
        for dz in (-0.63, 0.63):
            model.box(
                x + dx - 0.028, 0.81, z + dz - 0.028, 0.056, 1.02, 0.056, "a4c6bd", "Vitrine_Trim"
            )
        model.box(x + dx - 0.024, 1.82, z - 0.64, 0.048, 0.056, 1.28, "a4c6bd", "Vitrine_Trim")
    for dz in (-0.63, 0.63):
        model.box(x - 0.64, 1.82, z + dz - 0.024, 1.28, 0.056, 0.048, "a4c6bd", "Vitrine_Trim")


def gallery_window(model, x, z, wide):
    width = 1.92 if wide else 1.46
    model.box(x - width / 2, 1.13, z, width, 2.27, 0.13, "2c4d61", "Windows")
    for index in range(11):
        dx = (index - 5) * width / 11
        height = math.sqrt(max(0, (width * 0.49) ** 2 - dx**2))
        model.box(x + dx - width / 22, 3.39, z, width / 11, height, 0.13, "2c4d61", "Windows")
    for i in range(-2, 3):
        for j in range(4):
            model.box(
                x + i * width / 5 - width * 0.086,
                1.27 + j * 0.52,
                z + 0.13,
                width * 0.172,
                0.44,
                0.035,
                (
                    MARINE[(i * 2 + j) % len(MARINE)]
                    if j < 1
                    else ("74b7bc" if (i + j) % 3 else "a9d8d1")
                ),
                "Stained_Glass",
                glow=j >= 1,
            )
    arch(model, x, z + 0.06, 3.38, width * 0.5, 0.135, ("b79a6e", GOLD), "Window_Trim")


def silver_shield(model):
    group = "Silver_Shield"
    for y, w, h, d, color in (
        (0, 3.82, 0.18, 1.84, "89a29c"),
        (0.18, 3.1, 0.2, 1.45, "b9beb1"),
        (0.38, 2.42, 0.38, 1.07, "42717a"),
        (0.76, 2.75, 0.12, 1.22, BRONZE),
    ):
        model.box(-w / 2, y, -5.64 - d / 2, w, h, d, color, group)
    model.box(-0.25, 0.87, -5.7, 0.5, 1.39, 0.36, "34545f", group)
    for index, width in enumerate((0.2, 0.49, 0.77, 1.04, 1.29, 1.51, 1.62, 1.62, 1.4, 0.91)):
        y = 1.01 + index * 0.232
        model.box(-width / 2, y, -5.46, width, 0.232, 0.2, "e6e2c9", group)
        if width > 0.2:
            model.box(
                -width / 2 + 0.085,
                y + 0.013,
                -5.26,
                width - 0.17,
                0.206,
                0.054,
                "7dabb4" if index % 2 else "9fc0c0",
                group,
            )
    model.box(-0.07, 1.64, -5.2, 0.14, 1.36, 0.087, "eaf4dc", group)
    model.box(-0.43, 2.19, -5.2, 0.86, 0.14, 0.087, "eaf4dc", group)
    model.box(-0.145, 2.12, -5.11, 0.29, 0.29, 0.076, GOLD, group, glow=True)


def exhibition(model, rng):
    floor(model, MARBLE, "778787", 0.97, rng)
    for row in range(26):
        z = -6.6 + row * 0.48
        model.box(-1.95, 0.004, z, 3.9, 0.022, 0.48, MARINE[row % len(MARINE)], "Teal_Runner")
        for side in (-1, 1):
            model.box(side * 1.86 - 0.025, 0.027, z, 0.05, 0.013, 0.48, GOLD, "Brass_Inlay")
            model.box(side * 2.03 - 0.027, 0.004, z, 0.054, 0.012, 0.48, BRONZE, "Brass_Inlay")
            if row % 3 == 0:
                model.box(
                    side * 1.67 - 0.07, 0.028, z + 0.13, 0.14, 0.015, 0.14, GOLD, "Brass_Inlay"
                )
    for radius, color in ((1.48, BRONZE), (1.23, "aad8cf"), (0.93, GOLD)):
        model.ring(0, 0.041, 0, radius, color, 0.065, "Brass_Inlay")
    line_on_floor(
        model, [(0, -0.73), (0.5, 0), (0, 0.73), (-0.5, 0)], 0.058, GOLD, 0.04, "Brass_Inlay"
    )
    model.box(-10.35, 0, -7.45, 20.7, 4.75, 0.31, "5e737d", "Gallery_Wall")
    model.box(-10.35, 0.28, -7.14, 20.7, 0.2, 0.12, "bfb59a", "Gallery_Paneling")
    model.box(-10.42, 4.54, -7.51, 20.84, 0.23, 0.68, "dcd0b2", "Gallery_Cornice")
    model.box(-10.55, 4.77, -7.54, 21.1, 0.24, 0.85, "6a8388", "Gallery_Cornice")
    arch(model, 0, -6.63, 2.72, 2.05, 0.25, ("ded4bf", "b7a482", GOLD), "Central_Arch")
    for side in (-1, 1):
        for x in (2.24, 4.11, 7.04, 9.66):
            stone_pier(model, x * side, -6.74, 4.47, "ddd3c0", "b0a688", "Gallery_Columns", 0.61)
        for x in (3.19, 5.63, 8.42):
            gallery_window(model, x * side, -7.09, x == 5.63)
        banner(model, side * 2.66, -6.2, 3.55, "244e59", GOLD, "Gallery_Standards", 0.69)
        for z in (-4.6, -0.65, 3.3):
            stone_pier(model, side * 9.32, z, 2.35, "c9c6b3", "819590", "Side_Colonnade", 0.72)
        model.box(side * 9.32 - 0.29, 0.12, -5.12, 0.58, 0.48, 9.52, "9cab9d", "Side_Colonnade")
        model.box(side * 9.32 - 0.36, 0.57, -5.12, 0.72, 0.14, 9.52, "bfba9f", "Side_Colonnade")
    for x, z, kind, color in (
        (-6.45, -4.42, "vase", "326c74"),
        (6.48, -4.42, "scepter", "6799b3"),
        (-7.05, 0.06, "crystals", "4db4a1"),
        (7.1, 0.06, "vase", "994e48"),
        (-6.1, 4.63, "scepter", "668a9b"),
        (6.05, 4.63, "crystals", "568db5"),
    ):
        display(model, x, z, kind, color)
    silver_shield(model)


def surroundings(model, arena_theme):
    stone = "8b6b58" if arena_theme else "83958f"
    mortar = "594743" if arena_theme else "485963"
    model.box(-24, -0.78, -17, 48, 0.25, 34, mortar, "Outer_Bedrock")
    for side in (-1, 1):
        for x in (11.13, 12.45, 14.25):
            model.box(side * x - 0.44, -0.52, -11.7, 0.88, 0.41, 23.4, stone, "Outer_Promenade")
        for z in (-8.8, -5.8, -2.8, 0.2, 3.2, 6.2, 9.2):
            stone_pier(
                model, side * 11.7, z, 2.9 if arena_theme else 2.02, stone, mortar, "Outer_Piers"
            )
    for x in range(-22, 23, 2):
        for z in (-10.2, -8.9, 9.2, 10.5):
            model.box(x - 0.97, -0.53, z, 1.94, 0.22, 1.25, stone, "Outer_Promenade")


def miniature(model, name, arena_theme):
    preview = Model(name)
    scale = 0.405
    for (group, glow, _), boxes in model.groups.items():
        for x, y, z, width, height, depth, color in boxes:
            preview.box(
                x * scale,
                (y + 0.55) * scale,
                z * scale,
                width * scale,
                height * scale,
                depth * scale,
                color,
                group,
                glow,
            )
    dark, trim = ("43383c", "a27450") if arena_theme else ("25434a", "9d855c")
    preview.box(-4.57, -0.29, -3.37, 9.14, 0.26, 6.74, dark, "Miniature_Plinth")
    preview.box(-4.52, -0.048, -3.32, 9.04, 0.058, 6.64, trim, "Miniature_Plinth")
    for side in (-1, 1):
        preview.box(side * 3.28 - 0.38, -0.32, 2.48, 0.76, 0.11, 0.53, dark, "Miniature_Plinth")
    for i in range(3):
        preview.box(
            -1.0 - i * 0.11,
            -0.08 - i * 0.073,
            3.18 + i * 0.16,
            2 + i * 0.22,
            0.15,
            0.24,
            trim,
            "Miniature_Entry",
        )
    return preview


def main():
    for key, title, design, seed in (
        ("duel-arena", "决斗场", arena, 1531),
        ("silver-shield-exhibition", "银盾镇展览馆", exhibition, 1562),
    ):
        scene = Model(title, cards=True)
        design(scene, random.Random(seed))
        preview = miniature(scene, title + "微缩模型", design is arena)
        preview.finish(f"preview-{key}.glb", source=SOURCE, metadata={"biome": key})
        surroundings(scene, design is arena)
        scene.finish(
            f"{key}.glb",
            source=SOURCE,
            metadata={
                "biome": key,
                "peripheryLayout": {
                    "mode": "authored-large",
                    "bounds": {"x": 24, "z": 17},
                    "patches": 1,
                    "boxes": len(scene.boxes),
                },
            },
        )


if __name__ == "__main__":
    main()
