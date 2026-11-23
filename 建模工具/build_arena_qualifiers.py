"""Rebuild the modest qualifying-round roster with increasing, bounded model complexity."""

import argparse
import json
import math
from pathlib import Path

import numpy as np

from build_arena_enemies import rewrite_glb
from build_realms import ASSETS, FACES, OUT, Model
from overlord_rig_core import (
    OUT_OVERLORDS,
    PORTRAITS,
    RiggedSculptor,
    bell_window,
    euler_xyz_to_quat,
    plateau,
)
from validate_arena_models import Glb, geometry, require

ROOT = Path(__file__).resolve().parents[1]
ROSTER = ROOT / "万象酒馆-Demo/src/content/arena-qualifier-roster.json"
SOURCE = OUT / "首都内部竞技场/海选赛"
SCRIPT = "建模工具/build_arena_qualifiers.py"
THEME = {
    "bg0": "#484137",
    "bg1": "#29333b",
    "bg2": "#171e2b",
    "aura0": "#b39465",
    "aura1": "#788c8c",
    "rim": "#c5c0a6",
    "rim_rgb": [0.8, 0.8, 0.7],
}
COLORS = {
    "skin": "#c99576",
    "skin_light": "#e0b494",
    "hair": "#6b5141",
    "cloth": "#8f9d8e",
    "wrap": "#ded1ae",
    "pants": "#56657a",
    "leather": "#886348",
    "wood": "#ad8150",
    "wood_light": "#c69d6c",
    "steel": "#a5b2bb",
    "edge": "#ced5d5",
    "iron": "#63788b",
    "eyes": "#35465b",
}
CLIPS = {
    "Idle": (3.2, 36),
    "Charge_Up": (1.6, 32),
    "Normal_Attack": (1.35, 30),
    "Special_Attack": (1.65, 34),
    "Special_Action": (1.85, 38),
    "Talon_Rend": (1.95, 40),
    "Break_Stagger": (1.4, 30),
}


def cuboid(bucket, center, size, color):
    center, half = np.asarray(center), np.asarray(size) / 2
    verts = [
        center + half * sign
        for sign in (
            (-1, -1, -1),
            (1, -1, -1),
            (1, 1, -1),
            (-1, 1, -1),
            (-1, -1, 1),
            (1, -1, 1),
            (1, 1, 1),
            (-1, 1, 1),
        )
    ]
    tris = []
    for face, _ in FACES:
        tris.extend([[face[0], face[1], face[2]], [face[0], face[2], face[3]]])
    bucket.append(verts, tris, color, smooth=False)


class QualifierBlocks:
    """Large readable blocks, with equipment built as distinct silhouettes rather than recolors."""

    def __init__(self, entry):
        self.entry = entry
        self.blocks = []
        self.detail = {"minion": 0, "elite": 1, "boss": 2}[entry["tier"]]

    def box(self, center, size, color="cloth", group="Cloth"):
        x, y, z = center
        w, h, d = size
        self.blocks.append(
            {
                "x": float(x),
                "y": float(y - h / 2),
                "z": float(z),
                "w": float(w),
                "h": float(h),
                "d": float(d),
                "color": COLORS.get(color, color),
                "group": group,
            }
        )

    def bar(self, start, end, width=0.09, color="wood", group="Weapon", count=None):
        start, end = np.asarray(start), np.asarray(end)
        delta = np.abs(end - start)
        if np.count_nonzero(delta > 1e-6) <= 1:
            self.box((start + end) / 2, delta + width, color, group)
            return
        count = count or max(2, math.ceil(float(np.max(delta)) / (width * 1.5)))
        for t in np.linspace(0, 1, count):
            self.box(start * (1 - t) + end * t, (width,) * 3, color, group)

    def human(self):
        q = self.detail
        width = 0.27 + q * 0.035
        for side in (-1, 1):
            z = 0.045 * side
            self.box((side * 0.15, 0.08, z + 0.06), (0.23, 0.16, 0.32), "leather", "Boots")
            self.box((side * 0.15, 0.31, z), (0.17, 0.35, 0.19), "pants", "Legs")
            self.box((side * 0.15, 0.56, z), (0.21, 0.24, 0.23), "pants", "Legs")
            self.box((side * (width + 0.07), 1.04, 0), (0.17, 0.27, 0.21), "skin", "Arms")
            self.box((side * (width + 0.11), 0.86, 0.09), (0.15, 0.20, 0.19), "skin", "Arms")
            self.box((side * (width + 0.11), 0.77, 0.13), (0.17, 0.15, 0.18), "skin_light", "Hands")
        self.box((0, 0.70, 0), (0.45, 0.16, 0.29), "leather", "Belt")
        self.box((0, 0.94, 0), (width * 2, 0.40, 0.31), self.entry["color"])
        self.box((0, 1.17, 0), (0.16, 0.11, 0.17), "skin", "Head")
        self.box((0, 1.34, 0.01), (0.29, 0.30, 0.28), "skin", "Head")
        self.box((0, 1.49, -0.01), (0.31, 0.10, 0.29), "hair", "Head")
        for side in (-1, 1):
            self.box((side * 0.075, 1.37, 0.155), (0.045, 0.04, 0.025), "eyes", "Face")
        self.box((0, 1.30, 0.17), (0.065, 0.06, 0.07), "skin_light", "Face")
        self.box((0.12, 0.71, 0.17), (0.08, 0.065, 0.045), "iron", "Belt")
        if q:
            self.armor()

    def armor(self):
        q = self.detail
        for side in (-1, 1):
            for layer in range(3 if q == 1 else 5):
                self.box(
                    (side * (0.32 + q * 0.025), 1.17 - layer * 0.045, 0),
                    (0.25 - layer * 0.015, 0.065, 0.35),
                    "steel" if layer % 2 else "iron",
                    "Shoulders",
                )
            for y in (0.28, 0.34, 0.40):
                self.box((side * 0.15, y, 0.13), (0.17, 0.06, 0.065), "leather", "Greaves")
            for y in (0.81, 0.87):
                self.box((side * (0.39 + q * 0.035), y, 0.13), (0.20, 0.045, 0.24), "wrap", "Wraps")
            for i in range(3):
                self.box(
                    (side * (0.10 + i * 0.08), 0.59, 0.18),
                    (0.065, 0.26, 0.06),
                    self.entry["color"],
                    "Skirt",
                )
            self.box((side * 0.15, 0.10, 0.22), (0.22, 0.07, 0.09), "iron", "Boots")
            for y in (0.73, 0.77):
                self.box((side * 0.22, y, 0.18), (0.065, 0.03, 0.035), "wood_light", "Belt")
        for x in (-0.12, 0, 0.12):
            self.box((x, 1.05, 0.18), (0.10, 0.20, 0.055), "leather", "Vest")
        for side in (-1, 1):
            for i in range(4):
                self.box(
                    (side * 0.14, 0.90 + i * 0.055, 0.22),
                    (0.07, 0.024, 0.025),
                    "wrap",
                    "Vest_Lacing",
                )
        self.box((0, 1.50, -0.01), (0.35, 0.11, 0.33), "iron", "Helmet")
        for side in (-1, 1):
            self.box((side * 0.16, 1.38, -0.02), (0.065, 0.21, 0.30), "steel", "Helmet")
        if q == 2:
            # These are functional straps, rivets, padded folds and plate seams, not gilded regalia.
            for side in (-1, 1):
                for i in range(5):
                    self.box(
                        (side * 0.23, 0.96 + i * 0.035, 0.20),
                        (0.07, 0.028, 0.025),
                        "edge",
                        "Rivets",
                    )
                for i in range(5):
                    self.box(
                        (side * 0.15, 0.36 + i * 0.065, 0.17),
                        (0.19, 0.06, 0.06),
                        "steel",
                        "Greaves",
                    )
                for i in range(4):
                    self.box(
                        (side * 0.16, 0.70 + i * 0.045, -0.17),
                        (0.17, 0.035, 0.045),
                        "wrap",
                        "Seams",
                    )
                for i in range(4):
                    self.box(
                        (side * (0.25 + i * 0.045), 1.20 - i * 0.035, 0.04),
                        (0.07, 0.07, 0.36),
                        "steel",
                        "Shoulders",
                    )
            for i in range(5):
                self.box(
                    ((i - 2) * 0.09, 0.67 - abs(i - 2) * 0.025, -0.23),
                    (0.08, 0.63, 0.06),
                    self.entry["color"],
                    "Cape",
                )
            for y in (0.82, 0.91, 1.0, 1.09):
                self.box((0, y, 0.22), (0.23, 0.025, 0.04), "wrap", "Seams")

    def blade(self, side=-1, long=False, wooden=False):
        x = side * (0.42 + self.detail * 0.025)
        self.box((x, 0.92, 0.18), (0.07, 0.40 if not long else 0.65, 0.07), "leather", "Weapon")
        self.box((x, 1.07 if not long else 1.19, 0.18), (0.28, 0.065, 0.09), "iron", "Weapon")
        self.box(
            (x, 1.29 if not long else 1.53, 0.18),
            (0.12 if wooden else 0.15, 0.40 if not long else 0.62, 0.055),
            "wood_light" if wooden else "steel",
            "Weapon",
        )
        self.box(
            (x + side * 0.025, 1.51 if not long else 1.86, 0.18),
            (0.07, 0.09, 0.055),
            "wood" if wooden else "edge",
            "Weapon",
        )

    def shield(self, tower=False, metal=False):
        x, y, w, h = (0.46, 0.84, 0.50, 0.78) if tower else (0.47, 0.93, 0.40, 0.43)
        q = self.detail
        planks = 3 if not q else 5
        for i in range(planks):
            self.box(
                (x + (i - (planks - 1) / 2) * w / planks, y, 0.29),
                (w / planks - 0.012, h, 0.09),
                "wood" if i % 2 else "wood_light",
                "Shield",
            )
        for sign in (-1, 1):
            self.box(
                (x, y + sign * (h / 2 - 0.07), 0.35),
                (w, 0.055, 0.04),
                "iron" if metal else "leather",
                "Shield",
            )
        if metal:
            for side in (-1, 1):
                self.box((x + side * w / 2, y, 0.36), (0.04, h, 0.05), "steel", "Shield")
            self.box((x, y, 0.38), (0.16, 0.15, 0.09), "iron", "Shield")
        if q == 2:
            for side in (-1, 1):
                for y_offset in np.linspace(-h * 0.36, h * 0.36, 5):
                    self.box(
                        (x + side * w * 0.38, y + y_offset, 0.40),
                        (0.035, 0.035, 0.035),
                        "edge",
                        "Rivets",
                    )

    def axe(self, side=-1, heavy=False):
        x = side * (0.46 + self.detail * 0.025)
        self.box((x, 1.06, 0.16), (0.075, 0.90 if heavy else 0.65, 0.075), "wood", "Weapon")
        self.box((x + side * 0.10, 1.38, 0.16), (0.24, 0.21, 0.11), "iron", "Weapon")
        for i in range(3):
            self.box(
                (x + side * (0.20 + i * 0.025), 1.38 - i * 0.04, 0.16),
                (0.07, 0.25 - i * 0.06, 0.08),
                "steel",
                "Weapon",
            )

    def spear(self, pike=False, fork=False):
        x = -0.48
        self.box((x, 0.98, 0.19), (0.07, 1.75 if pike else 1.48, 0.07), "wood", "Weapon")
        y = 1.88 if pike else 1.73
        if fork:
            self.box((x, y, 0.19), (0.34, 0.065, 0.06), "iron", "Weapon")
            for i in (-1, 0, 1):
                self.box((x + i * 0.14, y + 0.14, 0.19), (0.045, 0.24, 0.045), "steel", "Weapon")
        else:
            for i in range(3):
                self.box(
                    (x, y + i * 0.055, 0.19), (0.15 - i * 0.04, 0.075, 0.055), "edge", "Weapon"
                )

    def equipment(self):
        v = self.entry["variant"]
        if v in ("sword", "sword-shield", "iron-shield", "tower-shield", "patchwork"):
            self.blade(long=v == "sword")
            if v != "sword":
                self.shield(tower=v == "tower-shield", metal=self.detail > 0)
        elif v in ("dual-knives", "dual-blades"):
            for side in (-1, 1):
                self.blade(side, long=v == "dual-blades", wooden=self.detail == 0)
        elif v in ("dual-axes",):
            for side in (-1, 1):
                self.axe(side)
        elif v in ("spear", "pitchfork", "pike"):
            self.spear(pike=v == "pike", fork=v == "pitchfork")
        elif v in ("hammer", "maul"):
            self.box((-0.46, 1.04, 0.20), (0.09, 0.72, 0.09), "wood", "Weapon")
            self.box(
                (-0.46, 1.41, 0.20),
                (0.46 if v == "maul" else 0.32, 0.27, 0.27),
                "iron" if v == "maul" else "wood_light",
                "Weapon",
            )
            self.box((0, 0.90, 0.19), (0.39, 0.50, 0.06), "leather", "Apron")
        elif v in ("club", "staff", "polearm"):
            self.box(
                (-0.47, 1.06, 0.19), (0.11, 1.25 if v != "club" else 0.64, 0.11), "wood", "Weapon"
            )
            self.box((-0.47, 1.43, 0.19), (0.16, 0.23, 0.16), "wood_light", "Weapon")
            if v == "polearm":
                self.box((-0.38, 1.68, 0.19), (0.28, 0.065, 0.09), "steel", "Weapon")
        elif v == "sling":
            self.bar((-0.43, 0.80, 0.20), (-0.69, 1.23, 0.20), 0.06, "wrap", count=5)
            self.bar((-0.69, 1.23, 0.20), (-0.43, 1.38, 0.20), 0.06, "wrap", count=4)
            self.box((-0.69, 1.23, 0.20), (0.13, 0.10, 0.11), "iron", "Weapon")
            self.box((0.28, 0.65, 0.16), (0.20, 0.22, 0.17), "leather", "Pouch")
        elif v in ("net", "trapper"):
            x0, y0 = 0.28, 0.55
            for i in range(3):
                self.box((x0 + i * 0.13, y0, 0.30), (0.035, 0.46, 0.035), "wrap", "Net")
                self.box(
                    (x0 + 0.13, y0 - 0.18 + i * 0.18, 0.30), (0.34, 0.035, 0.035), "wrap", "Net"
                )
            self.box((-0.46, 1.04, 0.18), (0.075, 0.64, 0.075), "wood", "Weapon")
            self.bar((-0.46, 1.36, 0.18), (-0.72, 1.46, 0.18), 0.06, "leather", count=4)
        elif v == "boxing":
            for side in (-1, 1):
                self.box((side * 0.46, 0.85, 0.22), (0.29, 0.24, 0.30), "wrap", "Gloves")
                for i in range(4):
                    self.box(
                        (side * 0.46, 0.77 + i * 0.05, 0.38),
                        (0.30, 0.025, 0.025),
                        "leather",
                        "Gloves",
                    )
        elif v == "crossbow":
            self.box((-0.37, 0.87, 0.30), (0.11, 0.09, 0.56), "wood", "Weapon")
            self.box((-0.37, 0.88, 0.49), (0.65, 0.08, 0.10), "iron", "Weapon")
            self.box((-0.37, 0.91, 0.37), (0.62, 0.025, 0.025), "wrap", "Weapon")
            self.box((0.26, 1.02, -0.27), (0.16, 0.42, 0.16), "leather", "Quiver")
            for i in range(3):
                self.box(
                    (0.20 + i * 0.05, 1.28, -0.27), (0.025, 0.25, 0.025), "wood_light", "Quiver"
                )
        elif v == "flail":
            self.box((-0.46, 1.08, 0.18), (0.08, 0.56, 0.08), "wood", "Weapon")
            self.bar((-0.46, 1.36, 0.18), (-0.81, 1.20, 0.18), 0.07, "iron", count=6)
            self.box((-0.84, 1.16, 0.18), (0.26, 0.26, 0.25), "iron", "Weapon")
            for side in (-1, 1):
                self.box((-0.84 + side * 0.15, 1.16, 0.18), (0.09, 0.10, 0.10), "steel", "Weapon")
        elif v == "hound-pair":
            self.axe(heavy=True)
            self.animal("hound", (0.72, 0, 0.12), 0.55, armored=False)
        if v == "pitchfork":
            self.box((0, 1.51, 0), (0.56, 0.06, 0.47), "wood_light", "Hat")
        elif v in ("knives", "dual-knives", "boxing"):
            self.box((0, 1.44, 0.035), (0.33, 0.06, 0.30), self.entry["color"], "Headband")
        elif v == "patchwork":
            for x, y in ((-0.16, 0.88), (0.09, 1.09), (0.20, 0.94)):
                self.box((x, y, 0.23), (0.14, 0.12, 0.05), "iron", "Repairs")

    def animal(self, kind, origin=(0, 0, 0), scale=1.0, armored=True):
        ox, oy, oz = origin
        start = len(self.blocks)
        wide = kind == "boar"
        self.box((0, 0.44, 0), (0.51 if wide else 0.37, 0.39, 0.82), self.entry["color"], "Hide")
        self.box((0, 0.55, 0.44), (0.32, 0.34, 0.34), self.entry["color"], "Head")
        self.box((0, 0.45, 0.65), (0.25, 0.18, 0.22), "leather", "Muzzle")
        self.box((0, 0.46, 0.78), (0.15, 0.10, 0.045), "eyes", "Muzzle")
        for side in (-1, 1):
            for z in (-0.27, 0.28):
                self.box((side * 0.15, 0.18, z), (0.12, 0.34, 0.14), "leather", "Legs")
                self.box((side * 0.15, 0.055, z + 0.04), (0.15, 0.11, 0.20), "iron", "Feet")
            self.box((side * 0.15, 0.63, 0.57), (0.035, 0.045, 0.035), "eyes", "Face")
            self.box((side * 0.14, 0.78, 0.41), (0.11, 0.21, 0.12), self.entry["color"], "Ears")
        self.bar((0, 0.55, -0.37), (0.13, 0.73, -0.67), 0.09, "leather", "Tail", count=4)
        self.box((0, 0.35, 0.30), (0.43, 0.08, 0.14), "leather", "Collar")
        self.box((0, 0.34, 0.40), (0.08, 0.10, 0.04), "steel", "Collar")
        if kind == "ram":
            for side in (-1, 1):
                for i in range(3):
                    self.box(
                        (side * (0.22 + i * 0.04), 0.71 - i * 0.05, 0.39 - i * 0.06),
                        (0.12, 0.12, 0.12),
                        "wrap",
                        "Horns",
                    )
            for z in (-0.22, 0.02, 0.25):
                self.box((0, 0.62, z), (0.41, 0.09, 0.21), "wrap", "Wool")
        if wide and armored:
            for side in (-1, 1):
                self.box((side * 0.14, 0.40, 0.73), (0.07, 0.19, 0.07), "wrap", "Tusks")
                for i in range(8):
                    self.box(
                        (side * 0.27, 0.36 + (i % 2) * 0.09, -0.30 + i * 0.08),
                        (0.07, 0.14, 0.12),
                        "steel",
                        "Armor",
                    )
            for i in range(9):
                self.box((0, 0.69, -0.32 + i * 0.09), (0.49, 0.075, 0.09), "iron", "Armor")
            for i in range(6):
                self.box(
                    ((i % 3 - 1) * 0.13, 0.76, -0.22 + (i // 3) * 0.25),
                    (0.05, 0.05, 0.05),
                    "edge",
                    "Rivets",
                )
            for side in (-1, 1):
                for z in (-0.24, 0, 0.24):
                    self.box((side * 0.29, 0.43, z), (0.045, 0.25, 0.045), "leather", "Straps")
        for block in self.blocks[start:]:
            block["x"] = block["x"] * scale + ox
            block["y"] = block["y"] * scale + oy
            block["z"] = block["z"] * scale + oz
            for key in ("w", "h", "d"):
                block[key] *= scale

    def normalize(self):
        lo = np.min(
            [[b["x"] - b["w"] / 2, b["y"], b["z"] - b["d"] / 2] for b in self.blocks], axis=0
        )
        hi = np.max(
            [[b["x"] + b["w"] / 2, b["y"] + b["h"], b["z"] + b["d"] / 2] for b in self.blocks],
            axis=0,
        )
        target = {"minion": 1.55, "elite": 1.80, "boss": 2.02}[self.entry["tier"]]
        if self.entry["archetype"] == "beast":
            target = {"hound": 0.90, "ram": 1.05, "boar": 1.25}[self.entry["variant"]]
        scale = target / (hi[1] - lo[1])
        center = (lo + hi) / 2
        for b in self.blocks:
            b["x"] = float((b["x"] - center[0]) * scale)
            b["y"] = float((b["y"] - lo[1]) * scale)
            b["z"] = float((b["z"] - center[2]) * scale)
            for key in ("w", "h", "d"):
                b[key] = float(b[key] * scale)

    def export(self):
        self.normalize()
        slug = self.entry["slug"]
        data = {**self.entry, "displayPlinth": False, "blocks": self.blocks}
        (SOURCE / (slug + ".json")).write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        model = Model(self.entry["name"])
        portrait = RiggedSculptor(self.entry["id"], self.entry["name"])
        joint = portrait.joint("Qualifier_Blocks")
        for b in self.blocks:
            model.box(
                b["x"] - b["w"] / 2,
                b["y"],
                b["z"] - b["d"] / 2,
                b["w"],
                b["h"],
                b["d"],
                b["color"][1:],
                b["group"],
                False,
            )
            mat = portrait.mat(b["group"], metallic=0.12, roughness=0.68)
            cuboid(
                portrait.bucket(joint, mat),
                (b["x"], b["y"] + b["h"] / 2, b["z"]),
                (b["w"], b["h"], b["d"]),
                b["color"],
            )
        model.finish(
            slug + ".glb",
            source=SCRIPT,
            metadata={
                "enemyId": self.entry["id"],
                "tier": self.entry["tier"],
                "nonVoxel": False,
                "displayPlinth": False,
                "blockCount": len(self.blocks),
                "triangles": len(self.blocks) * 12,
                "sourceBlocks": "万象异境-体素模型/首都内部竞技场/海选赛/" + slug + ".json",
            },
        )

        def material_params(doc):
            for mat in doc["materials"]:
                metal = mat["name"] in {"Weapon", "Armor", "Helmet", "Greaves", "Rivets"}
                mat["pbrMetallicRoughness"].update(
                    metallicFactor=0.22 if metal else 0.03, roughnessFactor=0.61 if metal else 0.83
                )

        result = rewrite_glb(ASSETS / (slug + ".glb"), material_params)
        (OUT / (slug + ".glb")).write_bytes(result)
        (SOURCE / (slug + ".glb")).write_bytes(result)
        svg = portrait.render_portrait_svg(np.zeros(3), svg_theme=THEME)
        (PORTRAITS / (slug + ".svg")).write_text(svg, encoding="utf-8", newline="\n")


def build_blocks(entry):
    model = QualifierBlocks(entry)
    if entry["archetype"] == "beast":
        model.animal(entry["variant"])
    else:
        model.human()
        model.equipment()
    return model


def build_coach(entry):
    """A grounded, scarred training master: padded cloth, an iron cuff and a wooden baton."""
    s = RiggedSculptor(entry["id"], entry["name"])
    root = s.joint("Coach_Root")
    s.joint("Pelvis", root, (0, 0.93, 0))
    s.joint("Spine", "Pelvis", (0, 1.17, 0))
    s.joint("Chest", "Spine", (0, 1.50, 0))
    s.joint("Neck", "Chest", (0, 1.82, 0))
    s.joint("Head", "Neck", (0, 2.00, 0.03))
    s.joint("Jaw", "Head", (0, 1.91, 0.13))
    for side, sign in (("L", 1), ("R", -1)):
        s.joint("Shoulder_" + side, "Chest", (sign * 0.44, 1.65, 0))
        s.joint("Elbow_" + side, "Shoulder_" + side, (sign * 0.56, 1.37, 0.07))
        s.joint("Hand_" + side, "Elbow_" + side, (sign * 0.58, 1.13, 0.23))
        s.joint("Hip_" + side, "Pelvis", (sign * 0.22, 0.89, 0))
        s.joint("Knee_" + side, "Hip_" + side, (sign * 0.24, 0.49, 0.01))
        s.joint("Boot_" + side, "Knee_" + side, (sign * 0.24, 0.13, 0.11))
    s.joint("Practice_Baton", "Hand_R", (-0.58, 1.13, 0.23))
    s.joint("Plank_Buckler", "Hand_L", (0.58, 1.13, 0.28))
    s.joint("Apron_Front", "Pelvis", (0, 0.89, 0.20))
    s.joint("Apron_Back", "Pelvis", (0, 0.89, -0.19))
    s.joint("Impact_Dust_FX", root, (0, 0.03, 0.46), (1e-5,) * 3)
    mats = {
        "cloth": s.mat("Worn_Padded_Cloth", 0.02, 0.86),
        "skin": s.mat("Weathered_Skin", 0.01, 0.78),
        "wood": s.mat("Practice_Wood", 0.03, 0.79),
        "iron": s.mat("Brushed_Iron_Cuff", 0.32, 0.55),
        "wrap": s.mat("Linen_Bindings", 0.01, 0.91),
    }

    def box(joint, mat, center, size, color):
        cuboid(s.bucket(joint, mats[mat]), center, size, COLORS.get(color, color))

    def oval(joint, mat, center, size, color, segs=10, layers=6):
        s.ellipsoid(
            joint,
            mats[mat],
            center,
            size,
            COLORS.get(color, color),
            u_segs=segs,
            v_segs=layers,
            smooth=False,
        )

    def tube(joint, mat, points, radius, color):
        s.tube(
            joint,
            mats[mat],
            points,
            radius,
            COLORS.get(color, color),
            segs=8,
            steps_per_seg=1,
            smooth=False,
        )

    oval("Pelvis", "cloth", (0, 0.94, 0), (0.34, 0.16, 0.23), "pants")
    oval("Spine", "cloth", (0, 1.23, 0), (0.35, 0.25, 0.24), entry["color"], 12, 7)
    oval("Chest", "cloth", (0, 1.55, 0), (0.46, 0.28, 0.26), entry["color"], 14, 8)
    tube("Neck", "skin", [(0, 1.77, 0), (0, 1.91, 0.02)], 0.115, "skin")
    oval("Head", "skin", (0, 2.02, 0.02), (0.22, 0.25, 0.205), "skin", 12, 8)
    oval("Jaw", "skin", (0, 1.90, 0.14), (0.16, 0.095, 0.12), "skin_light", 8, 5)
    oval("Head", "cloth", (0, 2.20, -0.035), (0.21, 0.08, 0.18), "hair", 10, 5)
    for side in (-1, 1):
        box("Head", "cloth", (side * 0.092, 2.05, 0.212), (0.09, 0.03, 0.025), "hair")
        box("Head", "iron", (side * 0.088, 2.015, 0.216), (0.04, 0.034, 0.022), "eyes")
        oval("Head", "skin", (side * 0.22, 2.00, 0.01), (0.055, 0.085, 0.045), "skin", 6, 4)
    box("Head", "skin", (0.11, 2.08, 0.218), (0.025, 0.11, 0.019), "wrap")
    box("Head", "skin", (0, 1.98, 0.24), (0.075, 0.10, 0.10), "skin_light")
    for side, sign in (("L", 1), ("R", -1)):
        oval("Shoulder_" + side, "skin", (sign * 0.47, 1.57, 0.01), (0.19, 0.24, 0.18), "skin")
        tube(
            "Elbow_" + side,
            "skin",
            [(sign * 0.55, 1.41, 0.05), (sign * 0.58, 1.17, 0.20)],
            0.135 if side == "R" else 0.12,
            "skin",
        )
        oval("Hand_" + side, "wrap", (sign * 0.59, 1.12, 0.24), (0.16, 0.15, 0.17), "wrap", 8, 5)
        oval("Hip_" + side, "cloth", (sign * 0.23, 0.74, 0), (0.19, 0.25, 0.20), "pants")
        oval(
            "Shoulder_" + side,
            "wood",
            (sign * 0.46, 1.69, 0.01),
            (0.19, 0.07, 0.19),
            "leather",
            8,
            5,
        )
        oval("Knee_" + side, "wood", (sign * 0.24, 0.49, 0.13), (0.13, 0.12, 0.06), "leather", 8, 5)
        tube(
            "Knee_" + side,
            "cloth",
            [(sign * 0.24, 0.51, 0), (sign * 0.24, 0.18, 0.07)],
            0.135,
            "pants",
        )
        oval("Boot_" + side, "wood", (sign * 0.24, 0.12, 0.17), (0.17, 0.12, 0.28), "leather")
        for i in range(5):
            box(
                "Knee_" + side,
                "wrap",
                (sign * 0.24, 0.20 + i * 0.045, 0.05),
                (0.285, 0.032, 0.285),
                "wrap",
            )
        for i in range(4):
            box(
                "Hand_" + side,
                "wood",
                (sign * 0.59, 1.04 + i * 0.047, 0.39),
                (0.24, 0.023, 0.02),
                "leather",
            )
    for i in range(4):
        oval("Elbow_R", "iron", (-0.58, 1.24 + i * 0.045, 0.13), (0.155, 0.045, 0.15), "iron", 8, 4)
    for i in range(7):
        x = (i - 3) * 0.10
        box("Chest", "wrap", (x, 1.63 - abs(x) * 0.28, 0.25), (0.075, 0.11, 0.028), "wrap")
        box("Spine", "wood", (x * 0.86, 0.99, 0.24), (0.075, 0.10, 0.05), "leather")
    for side, z in (("Front", 0.20), ("Back", -0.20)):
        for i in range(6):
            box(
                "Apron_" + side,
                "wood",
                ((i - 2.5) * 0.095, 0.73, z),
                (0.09, 0.39 - abs(i - 2.5) * 0.025, 0.045),
                "leather",
            )
    tube("Practice_Baton", "wood", [(-0.58, 0.63, 0.23), (-0.58, 1.62, 0.23)], 0.066, "wood_light")
    oval("Practice_Baton", "wood", (-0.58, 1.58, 0.23), (0.11, 0.22, 0.105), "wood", 8, 5)
    for i in range(4):
        box("Practice_Baton", "wrap", (-0.58, 1.10 + i * 0.045, 0.23), (0.15, 0.025, 0.15), "wrap")
    for i in range(5):
        x = (i - 2) * 0.105
        box(
            "Plank_Buckler",
            "wood",
            (0.58 + x, 1.13, 0.37),
            (0.095, 0.45 - abs(x) * 0.55, 0.08),
            "wood" if i % 2 else "wood_light",
        )
    for y in (0.99, 1.27):
        box("Plank_Buckler", "iron", (0.58, y, 0.42), (0.48, 0.05, 0.035), "iron")
    oval("Plank_Buckler", "iron", (0.58, 1.13, 0.43), (0.10, 0.10, 0.045), "steel", 8, 5)
    for i in range(8):
        a = i * math.tau / 8
        box(
            "Impact_Dust_FX",
            "wood",
            (math.cos(a) * 0.46, 0.10, 0.46 + math.sin(a) * 0.31),
            (0.10, 0.10 + i % 3 * 0.025, 0.10),
            "wood_light",
        )
    s.export_glb(
        entry["slug"] + ".glb", entry["slug"], coach_clips(s), source_name=SCRIPT, svg_theme=THEME
    )

    def metadata(doc):
        doc["extras"].update(
            enemyId=entry["id"],
            tier="overlord",
            displayPlinth=False,
            nonVoxel=True,
            standOnCard=True,
            animationRig="rigid-joint-hierarchy",
        )

    result = rewrite_glb(ASSETS / (entry["slug"] + ".glb"), metadata)
    (SOURCE / (entry["slug"] + ".glb")).write_bytes(result)
    (OUT / (entry["slug"] + ".glb")).write_bytes(result)
    (OUT_OVERLORDS / (entry["slug"] + ".glb")).write_bytes(result)


def coach_clips(s):
    result = {}
    for name, (duration, frames) in CLIPS.items():
        times = np.linspace(0, duration, frames).tolist()
        tracks = {j: {"rotation": []} for j in s.joint_order}
        tracks["Coach_Root"]["translation"] = []
        tracks["Impact_Dust_FX"]["scale"] = []
        for t in times:
            r = {j: np.zeros(3) for j in s.joint_order}
            move = np.zeros(3)
            impact = 0
            if name == "Idle":
                wave = math.sin(t / duration * math.tau)
                r["Chest"][0] = 0.022 * wave
                r["Head"][1] = 0.07 * wave
                r["Practice_Baton"][2] = 0.04 * wave
            elif name == "Charge_Up":
                wind = plateau(t, 0, 0.55, 1.10, duration)
                move[1] = -0.12 * wind
                r["Shoulder_R"][0], r["Shoulder_L"][0] = -0.85 * wind, -0.35 * wind
                r["Elbow_R"][0], r["Spine"][1] = -0.40 * wind, -0.18 * wind
            elif name == "Normal_Attack":
                wind = bell_window(t, 0, 0.45)
                hit = plateau(t, 0.32, 0.53, 0.62, duration)
                r["Shoulder_R"][0] = -0.80 * wind + 0.35 * hit
                r["Spine"][1] = -0.30 * wind + 0.35 * hit
                r["Practice_Baton"][0] = -0.45 * hit
                move[2] = 0.17 * hit
            elif name == "Special_Attack":
                hit = plateau(t, 0.30, 0.64, 0.80, duration)
                r["Shoulder_L"][0] = -1.05 * hit
                r["Elbow_L"][1] = 0.35 * hit
                r["Spine"][0] = 0.17 * hit
                move[2] = 0.22 * hit
            elif name == "Special_Action":
                wind = plateau(t, 0, 0.5, 0.7, 1.15)
                hit = plateau(t, 0.6, 1.05, 1.2, duration)
                r["Coach_Root"][1] = -0.32 * wind + 0.55 * hit
                r["Shoulder_R"][2], r["Shoulder_R"][0] = -0.65 * hit, -0.4 * wind
                r["Practice_Baton"][2] = -0.85 * hit
                r["Shoulder_L"][0] = -0.4 * wind
            elif name == "Talon_Rend":
                lift = plateau(t, 0, 0.55, 0.80, 1.30)
                slam = plateau(t, 0.82, 1.02, 1.17, duration)
                r["Shoulder_R"][0] = -1.40 * lift + 0.25 * slam
                r["Elbow_R"][0] = -0.35 * lift
                r["Spine"][0] = -0.10 * lift + 0.32 * slam
                move[1], move[2] = -0.12 * slam, 0.18 * slam
                impact = bell_window(t, 0.98, 1.43)
            else:
                hit = bell_window(t, 0, duration)
                move[1], move[2] = -0.14 * hit, -0.17 * hit
                r["Chest"][0], r["Head"][2] = -0.24 * hit, 0.18 * hit
                r["Shoulder_L"][2] = -0.22 * hit
            r["Apron_Front"][0] = -move[2] * 0.4
            r["Apron_Back"][0] = move[2] * 0.6
            for joint in tracks:
                tracks[joint]["rotation"].append(euler_xyz_to_quat(*r[joint]))
            tracks["Coach_Root"]["translation"].append(move.tolist())
            tracks["Impact_Dust_FX"]["scale"].append([1e-5 + impact] * 3)
        result[name] = (times, tracks)
    return result


def verify(entries):
    report = []
    limits = {"minion": (22, 58), "elite": (60, 110), "boss": (112, 210)}
    for entry in entries:
        slug, tier = entry["slug"], entry["tier"]
        glb = Glb(ASSETS / (slug + ".glb"))
        tris, lo, hi = geometry(glb)
        require(abs(float(lo[1])) < 2e-4, slug + ": not standing on floor")
        require(np.allclose((lo + hi)[[0, 2]], 0, atol=3e-4), slug + ": not centered")
        require(glb.doc["extras"]["enemyId"] == entry["id"], slug + ": wrong identity")
        require((SOURCE / (slug + ".glb")).read_bytes() == glb.raw, slug + ": source mismatch")
        if tier != "overlord":
            source = json.loads((SOURCE / (slug + ".json")).read_text(encoding="utf-8"))
            blocks = len(source["blocks"])
            require(
                limits[tier][0] <= blocks <= limits[tier][1],
                f"{slug}: {blocks} blocks outside {limits[tier]}",
            )
            require(tris == blocks * 12, slug + ": incorrect geometry count")
        else:
            blocks = None
            require(3000 <= tris <= 9000, slug + ": coach complexity outside range")
            require(
                {a["name"] for a in glb.doc["animations"]} == set(CLIPS), slug + ": clips missing"
            )
            for animation in glb.doc["animations"]:
                for channel in animation["channels"]:
                    values = glb.values(animation["samplers"][channel["sampler"]]["output"])
                    require(
                        np.allclose(values[0], values[-1], atol=1e-5),
                        slug + ": clip does not return",
                    )
        report.append({"id": entry["id"], "tier": tier, "blocks": blocks, "triangles": tris})
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--only", help="Rebuild or verify one exact slug")
    args = parser.parse_args()
    entries = json.loads(ROSTER.read_text(encoding="utf-8"))
    if args.only:
        entries = [e for e in entries if e["slug"] == args.only]
        if not entries:
            parser.error("Unknown qualifier slug")
    SOURCE.mkdir(parents=True, exist_ok=True)
    PORTRAITS.mkdir(parents=True, exist_ok=True)
    if not args.verify_only:
        for entry in entries:
            if entry["tier"] == "overlord":
                build_coach(entry)
            else:
                build_blocks(entry).export()
    for item in verify(entries):
        print(json.dumps(item, ensure_ascii=True))


if __name__ == "__main__":
    main()
