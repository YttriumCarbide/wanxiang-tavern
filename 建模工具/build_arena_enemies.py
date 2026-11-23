"""Rebuild the six layered arena enemies from retained block sources, without a plinth."""

import json
import math
import struct

import numpy as np

from build_realms import ASSETS, FACES, OUT, Model
from overlord_rig_core import PORTRAITS, RiggedSculptor

SOURCE = OUT / "首都内部竞技场"
SCRIPT = "建模工具/build_arena_enemies.py"
GLOW_GROUPS = {"Core", "Eyes", "Glow", "Runes", "Crown", "Rings"}
PALETTE = {
    "white": "#e8eef7",
    "silver": "#c2cde0",
    "steel": "#8c9bb5",
    "gold": "#e0ad3e",
    "highlight": "#ffe37d",
    "bronze": "#9e6f1e",
    "red": "#b31935",
    "scarlet": "#e62e4d",
    "fold": "#6e0d20",
    "navy": "#2b364f",
    "leather": "#3e4d6e",
    "edge": "#58698c",
    "cyan": "#7df9ff",
    "blue": "#22d3ee",
    "fire": "#ff7b24",
    "sun": "#fff3b0",
    "skin": "#c88d68",
}
SVG_THEME = {
    "bg0": "#4a2518",
    "bg1": "#1c2238",
    "bg2": "#0a0d18",
    "aura0": "#f59e0b",
    "aura1": "#e11d48",
    "rim": "#fde047",
    "rim_rgb": [1.45, 1.15, 0.45],
}


def rewrite_glb(path, update):
    """Update metadata/material declarations only; preserve exported buffers verbatim."""
    raw = path.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20 : 20 + size])
    binary = raw[28 + size :]
    update(doc)
    head = json.dumps(doc, ensure_ascii=True, separators=(",", ":")).encode()
    head += b" " * (-len(head) % 4)
    result = (
        struct.pack("<III", 0x46546C67, 2, 28 + len(head) + len(binary))
        + struct.pack("<II", len(head), 0x4E4F534A)
        + head
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )
    path.write_bytes(result)
    return result


class ArenaBlocks:
    """Author explicit layered cuboids; all dimensions are in the game's Y-up coordinates."""

    def __init__(self, enemy_id, slug, title, tier, dimensions):
        self.enemy_id = enemy_id
        self.slug = slug
        self.title = title
        self.tier = tier
        self.dimensions = dimensions  # Height, width X, depth Z, including equipment.
        self.blocks = []

    def box(self, center, size, color="silver", group="Armor"):
        x, y, z = center
        w, h, d = size
        self.blocks.append(
            dict(x=x, y=y - h / 2, z=z, w=w, h=h, d=d, color=PALETTE[color], group=group)
        )

    def line(self, a, b, width, color="gold", group="Trim"):
        a, b = np.asarray(a), np.asarray(b)
        count = max(1, math.ceil(float(np.max(np.abs(b - a))) / (width * 0.8)))
        for t in np.linspace(0, 1, count + 1):
            self.box(a * (1 - t) + b * t, (width, width, width), color, group)

    def oval(self, center, radii, color="silver", group="Armor", layers=9):
        x, y, z = center
        rx, ry, rz = radii
        for i in range(layers):
            t = (i + 0.5) / layers * 2 - 1
            r = math.sqrt(max(0.03, 1 - t * t))
            self.box((x, y + t * ry, z), (2 * rx * r, 2 * ry / layers, 2 * rz * r), color, group)

    def ring(self, center, radius, width, color="gold", group="Trim", count=32, arc=math.tau):
        x, y, z = center
        for a in np.linspace(0, arc, count, endpoint=arc != math.tau):
            self.box(
                (x + math.cos(a) * radius, y + math.sin(a) * radius, z), (width,) * 3, color, group
            )

    def star(self, center, radius, color="white", group="Emblem", spokes=8):
        x, y, z = center
        for i in range(spokes):
            a = i * math.tau / spokes
            self.line(
                (x, y, z),
                (x + math.cos(a) * radius, y + math.sin(a) * radius, z),
                radius * 0.17,
                color,
                group,
            )

    def humanoid(self, armored=True):
        for side, z in ((-1, -0.06), (1, 0.06)):
            self.box((side * 0.17, 0.10, z + 0.09), (0.25, 0.20, 0.39), "navy", "Boots")
            self.box((side * 0.17, 0.17, z + 0.19), (0.23, 0.08, 0.17), "gold", "Trim")
            self.box(
                (side * 0.17, 0.43, z),
                (0.20, 0.49, 0.22),
                "silver" if armored else "leather",
                "Greaves",
            )
            self.box((side * 0.17, 0.69, z), (0.23, 0.22, 0.26), "white", "Knees")
            self.box((side * 0.17, 0.84, z), (0.24, 0.30, 0.26), "navy", "Cloth")
        self.box((0, 1.00, 0), (0.52, 0.13, 0.33), "gold", "Belt")
        for i in range(7):
            x = (i - 3) * 0.073
            self.box((x, 0.83, 0.19), (0.057, 0.29, 0.065), "red", "Cloth")
            self.box((x, 0.70, 0.23), (0.05, 0.045, 0.035), "highlight", "Trim")
        self.oval((0, 1.23, 0), (0.31, 0.24, 0.18), "white" if armored else "red", "Armor")
        self.box((0, 1.47, 0), (0.16, 0.16, 0.17), "leather", "Neck")
        self.oval((0, 1.62, 0.01), (0.17, 0.20, 0.16), "silver" if armored else "skin", "Head")
        for side in (-1, 1):
            self.line(
                (side * 0.31, 1.36, 0),
                (side * 0.43, 1.13, 0.09),
                0.16,
                "silver" if armored else "skin",
                "Arms",
            )
            self.line((side * 0.43, 1.13, 0.09), (side * 0.48, 1.00, 0.23), 0.13, "leather", "Arms")
            self.box((side * 0.48, 1.00, 0.23), (0.14, 0.14, 0.15), "gold", "Hands")

    def normalize(self):
        lo = np.min(
            [[b["x"] - b["w"] / 2, b["y"], b["z"] - b["d"] / 2] for b in self.blocks], axis=0
        )
        hi = np.max(
            [[b["x"] + b["w"] / 2, b["y"] + b["h"], b["z"] + b["d"] / 2] for b in self.blocks],
            axis=0,
        )
        height, width, depth = self.dimensions
        factors = np.asarray([width, height, depth]) / (hi - lo)
        center = (hi + lo) / 2
        for b in self.blocks:
            for key, axis in (("x", 0), ("z", 2)):
                b[key] = float((b[key] - center[axis]) * factors[axis])
            b["y"] = float((b["y"] - lo[1]) * factors[1])
            for key, axis in (("w", 0), ("h", 1), ("d", 2)):
                b[key] = float(b[key] * factors[axis])

    def export(self):
        self.normalize()
        SOURCE.mkdir(exist_ok=True)
        data = dict(
            id=self.enemy_id,
            name=self.title,
            model=self.slug + ".glb",
            portrait=self.slug,
            tier=self.tier,
            displayPlinth=False,
            blocks=self.blocks,
        )
        (SOURCE / (self.slug + ".json")).write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        model = Model(self.title)
        portrait = RiggedSculptor(self.enemy_id, self.title)
        root = portrait.joint("Arena_Blocks")
        for b in self.blocks:
            glow = b["group"] in GLOW_GROUPS
            model.box(
                b["x"] - b["w"] / 2,
                b["y"],
                b["z"] - b["d"] / 2,
                b["w"],
                b["h"],
                b["d"],
                b["color"][1:],
                b["group"],
                glow,
            )
        model.finish(
            self.slug + ".glb",
            source=SCRIPT,
            metadata={
                "enemyId": self.enemy_id,
                "tier": self.tier,
                "nonVoxel": False,
                "triangles": len(self.blocks) * 12,
                "displayPlinth": False,
                "sourceBlocks": "万象异境-体素模型/首都内部竞技场/" + self.slug + ".json",
            },
        )

        def materials(doc):
            for mat in doc["materials"]:
                name = mat["name"]
                metal, rough = (
                    (0.52, 0.24) if name in {"Trim", "Belt", "Mane", "Wheels"} else (0.46, 0.22)
                )
                if name in {"Cloth", "Boots", "Arms", "Neck", "Hide"}:
                    metal, rough = 0.14, 0.48
                mat["pbrMetallicRoughness"].update(metallicFactor=metal, roughnessFactor=rough)

        result = rewrite_glb(ASSETS / (self.slug + ".glb"), materials)
        (OUT / (self.slug + ".glb")).write_bytes(result)
        (SOURCE / (self.slug + ".glb")).write_bytes(result)
        for (group, glow, _), boxes in model.groups.items():
            mat = portrait.mat(group, emissive=[0.12, 0.38, 0.42] if glow else None)
            for x, y, z, w, h, d, color in boxes:
                corners = [
                    [x, y, z],
                    [x + w, y, z],
                    [x + w, y + h, z],
                    [x, y + h, z],
                    [x, y, z + d],
                    [x + w, y, z + d],
                    [x + w, y + h, z + d],
                    [x, y + h, z + d],
                ]
                triangles = []
                for face, _normal in FACES:
                    triangles.extend([[face[0], face[1], face[2]], [face[0], face[2], face[3]]])
                portrait.bucket(root, mat).append(corners, triangles, "#" + color, smooth=False)
        PORTRAITS.mkdir(exist_ok=True)
        svg = portrait.render_portrait_svg(np.zeros(3), svg_theme=SVG_THEME)
        (PORTRAITS / (self.slug + ".svg")).write_text(
            svg.replace("sculpted-overlord-v1", "layered-arena-blocks-v1"),
            encoding="utf-8",
            newline="\n",
        )


def build_retiarius():
    m = ArenaBlocks("arenaRetiarius", "arena-retiarius", "沙场网斗士", "normal", (1.68, 1.30, 1.20))
    m.humanoid(armored=False)
    for i in range(6):
        m.box(
            (0.32 + i * 0.017, 1.36 + i * 0.046, -0.025),
            (0.24 - i * 0.023, 0.09, 0.30),
            "gold",
            "Galerus",
        )
    m.box((0, 1.69, 0.16), (0.34, 0.045, 0.03), "white", "Diadem")
    m.star((0, 1.69, 0.19), 0.052)
    m.line((-0.49, 0.25, 0.19), (-0.64, 1.55, 0.42), 0.038, "bronze", "Trident")
    m.line((-0.78, 1.55, 0.42), (-0.50, 1.55, 0.42), 0.035, "white", "Trident")
    for x in (-0.78, -0.64, -0.50):
        m.line((x, 1.55, 0.42), (x - 0.02, 1.80, 0.45), 0.03, "cyan", "Glow")
    # Diamond net hangs in a separate plane, with individual lead sinkers.
    for i in range(7):
        u = i / 6
        m.line((0.40 + u * 0.45, 1.05, 0.30), (0.25 + u * 0.45, 0.30, 0.64), 0.018, "silver", "Net")
        m.line(
            (0.40, 1.05 - u * 0.75, 0.30 + u * 0.34),
            (0.85, 1.05 - u * 0.75, 0.30 + u * 0.34),
            0.018,
            "silver",
            "Net",
        )
        m.box((0.25 + u * 0.45, 0.28, 0.64), (0.06, 0.08, 0.06), "steel", "Sinkers")
    return m


def build_lion():
    m = ArenaBlocks(
        "arenaClockworkLion", "arena-clockwork-lion", "发条金鬃狮", "normal", (1.38, 1.55, 1.80)
    )
    m.oval((0, 0.66, -0.12), (0.33, 0.29, 0.60), "bronze", "Frame")
    for z in np.linspace(-0.52, 0.24, 7):
        m.box((0, 0.77, z), (0.66, 0.09, 0.068), "gold", "Ribs")
    for side in (-1, 1):
        m.oval((side * 0.23, 0.86, -0.15), (0.18, 0.15, 0.44), "white")
        for z, y in ((0.35, 0.42), (-0.50, 0.34)):
            m.box((side * 0.29, y, z), (0.19, 0.45, 0.22), "silver", "Legs")
            m.box((side * 0.30, 0.10, z + 0.08), (0.28, 0.20, 0.35), "gold", "Paws")
            for claw in (-1, 0, 1):
                m.box(
                    (side * 0.30 + claw * 0.075, 0.075, z + 0.25),
                    (0.035, 0.07, 0.10),
                    "white",
                    "Claws",
                )
        m.line((side * 0.16, 0.82, -0.39), (side * 0.21, 1.13, -0.32), 0.08, "bronze", "Pipes")
        m.box((side * 0.21, 1.12, -0.32), (0.12, 0.07, 0.12), "gold", "Pipes")
    m.oval((0, 0.94, 0.50), (0.35, 0.36, 0.21), "gold", "Mane")
    for i in range(18):
        a = i * math.tau / 18
        m.line(
            (math.cos(a) * 0.30, 0.94 + math.sin(a) * 0.30, 0.48),
            (math.cos(a) * 0.46, 0.94 + math.sin(a) * 0.46, 0.41),
            0.09,
            "highlight" if i % 2 else "gold",
            "Mane",
        )
    m.oval((0, 0.99, 0.68), (0.25, 0.23, 0.24), "white", "Head")
    m.box((0, 0.81, 0.80), (0.36, 0.09, 0.25), "navy", "Jaw")
    m.box((0, 0.87, 0.88), (0.29, 0.04, 0.08), "fire", "Core")
    for side in (-1, 1):
        m.box((side * 0.14, 1.04, 0.89), (0.075, 0.055, 0.045), "fire", "Eyes")
        m.box((side * 0.17, 0.86, 0.90), (0.055, 0.15, 0.045), "white", "Fangs")
    tail = [(0, 0.65, -0.65), (0.27, 0.63, -0.87), (0.46, 0.79, -0.98), (0.50, 0.98, -0.87)]
    for a, b in zip(tail, tail[1:]):
        m.line(a, b, 0.065, "gold", "Tail")
        m.box(b, (0.10,) * 3, "bronze", "Tail")
    m.oval(tail[-1], (0.13, 0.13, 0.13), "silver", "TailMace", layers=5)
    return m


def build_beastmaster():
    m = ArenaBlocks(
        "arenaBeastmaster", "arena-beastmaster", "铁笼驯兽官", "normal", (1.76, 1.42, 1.30)
    )
    m.humanoid(armored=False)
    m.oval((0, 1.45, -0.06), (0.41, 0.13, 0.26), "bronze", "Hide")
    for side in (-1, 1):
        m.box((side * 0.26, 1.51, 0.04), (0.12, 0.23, 0.19), "highlight", "Hide")
        m.line((side * 0.25, 0.95, -0.23), (-side * 0.27, 1.61, -0.20), 0.055, "gold", "Darts")
        m.box((-side * 0.27, 1.64, -0.20), (0.09, 0.15, 0.07), "white", "Darts")
    m.box((0, 1.59, 0.18), (0.32, 0.15, 0.075), "gold", "LionMask")
    m.box((0, 1.55, 0.24), (0.17, 0.08, 0.07), "highlight", "LionMask")
    for i in range(4):
        x = 0.20 + i * 0.045
        m.ring((x, 1.01, 0.21), 0.028, 0.016, "steel", "Keys", count=12)
        m.line((x, 0.99, 0.21), (x, 0.87 - i * 0.015, 0.21), 0.018, "silver", "Keys")
        m.box((x + 0.018, 0.88 - i * 0.015, 0.21), (0.05, 0.025, 0.025), "silver", "Keys")
    whip = [
        (-0.48, 1.00, 0.25),
        (-0.70, 0.82, 0.42),
        (-0.86, 1.02, 0.64),
        (-0.71, 1.24, 0.72),
        (-0.55, 1.47, 0.76),
        (-0.68, 1.63, 0.83),
    ]
    for i, (a, b) in enumerate(zip(whip, whip[1:])):
        m.line(a, b, 0.035, "gold" if i % 2 else "fire", "Glow")
    m.line((0.47, 1.01, 0.26), (0.62, 1.28, 0.42), 0.11, "gold", "Horn")
    for i in range(4):
        m.box(
            (0.62, 1.28 + i * 0.025, 0.42 + i * 0.02),
            (0.14 + i * 0.045, 0.04, 0.13),
            "highlight",
            "Horn",
        )
    m.box((0.62, 1.39, 0.50), (0.14, 0.07, 0.07), "sun", "Core")
    return m


def build_hoplite():
    m = ArenaBlocks("arenaHoplite", "arena-hoplite", "银星重盾卫", "normal", (1.82, 1.58, 1.35))
    m.humanoid()
    for z in np.linspace(-0.20, 0.23, 10):
        m.box((0, 1.85, z), (0.07, 0.25, 0.065), "scarlet", "Crest")
    m.box((0, 1.62, 0.18), (0.30, 0.045, 0.025), "navy", "Visor")
    for i in range(9):
        x = 0.33 + (i - 4) * 0.085
        z = 0.49 - abs(i - 4) * 0.018
        m.box((x, 0.98, z), (0.09, 1.22 - abs(i - 4) * 0.035, 0.10), "white", "TowerShield")
        for y in (0.39, 1.57):
            m.box((x, y, z + 0.06), (0.085, 0.055, 0.04), "gold", "Trim")
    m.star((0.33, 1.03, 0.59), 0.28)
    m.oval((0.33, 1.03, 0.63), (0.08, 0.10, 0.04), "cyan", "Core", layers=5)
    m.line((-0.47, 1.06, -0.05), (-0.67, 1.11, 0.79), 0.045, "gold", "Spear")
    for i in range(5):
        m.box(
            (-0.67 - i * 0.01, 1.11, 0.80 + i * 0.055),
            (0.16 * (1 - i / 6), 0.055, 0.07),
            "white",
            "Spear",
        )
    return m


def build_juggernaut():
    m = ArenaBlocks(
        "arenaChariotJuggernaut",
        "arena-chariot-juggernaut",
        "重装战轮破阵者",
        "elite",
        (2.18, 2.10, 1.75),
    )
    m.humanoid()
    m.box((0, 1.31, 0), (0.77, 0.47, 0.40), "white")
    m.oval((0, 1.35, 0.27), (0.19, 0.18, 0.11), "gold", "LionHeart")
    for x in (-0.07, 0.07):
        m.box((x, 1.40, 0.38), (0.035, 0.035, 0.025), "fire", "Eyes")
    for side in (-1, 1):
        cx = side * 0.45
        m.ring((cx, 1.48, 0.04), 0.30, 0.075, "gold", "Wheels", count=36)
        for i in range(8):
            a = i * math.tau / 8
            m.line(
                (cx, 1.48, 0.04),
                (cx + math.cos(a) * 0.30, 1.48 + math.sin(a) * 0.30, 0.04),
                0.04,
                "bronze",
                "Wheels",
            )
            m.line(
                (cx + math.cos(a) * 0.30, 1.48 + math.sin(a) * 0.30, 0.04),
                (cx + math.cos(a) * 0.38, 1.48 + math.sin(a) * 0.38, 0.04),
                0.045,
                "white",
                "Spikes",
            )
        m.line((side * 0.62, 0.30, 0.28), (side * 0.68, 1.43, 0.39), 0.055, "gold", "Axes")
        for i in range(11):
            a = -1.25 + i / 10 * 2.50
            x = side * (0.70 + math.cos(a) * 0.25)
            y = 1.37 + math.sin(a) * 0.28
            m.box((x, y, 0.40), (0.13, 0.10, 0.09), "white", "Axes")
            m.box((x - side * 0.04, y, 0.46), (0.045, 0.06, 0.025), "fire", "Runes")
        m.line((side * 0.20, 1.15, -0.25), (side * 0.35, 2.06, -0.28), 0.035, "gold", "BannerPoles")
        for i in range(8):
            m.box(
                (side * (0.36 + i * 0.038), 1.94 - i * 0.020, -0.29 - i * 0.01),
                (0.047, 0.30 - i * 0.032, 0.04),
                "scarlet",
                "Cloth",
            )
        m.box((side * 0.17, 0.43, 0.06), (0.29, 0.53, 0.29), "white", "Greaves")
    return m


def build_captain():
    m = ArenaBlocks(
        "arenaInquisitorCaptain",
        "arena-inquisitor-captain",
        "万圣裁决卫队长",
        "elite",
        (2.22, 1.85, 1.65),
    )
    m.humanoid()
    for i in range(8):
        m.box((0, 1.80 + i * 0.035, 0), (0.28 * (1 - i / 9), 0.04, 0.21), "white", "Miter")
    m.box((0, 1.67, 0.17), (0.25, 0.035, 0.025), "navy", "Visor")
    m.line((0, 1.72, 0.19), (0, 2.05, 0.15), 0.028, "gold", "Trim")
    m.ring((0, 1.61, -0.26), 0.48, 0.04, "highlight", "Rings", count=36, arc=math.pi)
    for side in (-1, 1):
        for i in range(10):
            m.box(
                (side * (0.22 + i * 0.014), 1.35 - i * 0.10, -0.20 - i * 0.014),
                (0.28, 0.12, 0.065),
                "white",
                "Cape",
            )
            m.box(
                (side * (0.22 + i * 0.014), 1.35 - i * 0.10, -0.15 - i * 0.014),
                (0.24, 0.12, 0.025),
                "red",
                "Cloth",
            )
            m.box(
                (side * (0.36 + i * 0.014), 1.35 - i * 0.10, -0.15 - i * 0.014),
                (0.03, 0.12, 0.025),
                "gold",
                "Trim",
            )
    a, b = (-0.67, 0.20, 0.30), (0.55, 2.12, 0.46)
    m.line(a, b, 0.095, "white", "JudgmentSword")
    m.line((-0.48, 0.49, 0.35), (0.55, 2.12, 0.49), 0.033, "cyan", "Glow")
    m.line((-0.57, 0.96, 0.43), (0.04, 0.75, 0.43), 0.045, "gold", "Scales")
    for x, y in ((-0.57, 0.96), (0.04, 0.75)):
        m.line((x, y, 0.43), (x, y - 0.18, 0.43), 0.018, "gold", "Scales")
        m.box((x, y - 0.19, 0.43), (0.15, 0.035, 0.12), "highlight", "Scales")
    return m


def main():
    for builder in (
        build_retiarius,
        build_lion,
        build_beastmaster,
        build_hoplite,
        build_juggernaut,
        build_captain,
    ):
        builder().export()


if __name__ == "__main__":
    main()
