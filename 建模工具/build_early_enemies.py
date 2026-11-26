"""Build voxel GLBs and card-ready block sources for the original early enemy cast."""

import json
import shutil
from pathlib import Path

from build_realms import ASSETS, OUT, Model

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "万象异境-体素模型/早期敌人"
GLOW_GROUPS = {"Core", "Ember", "Eyes", "Lantern", "Runes", "Spore_Glow"}


def add(blocks, group, x, y, z, w, d, h, color):
    blocks.append(
        {
            "group": group,
            "x": x,
            "y": y,
            "z": z,
            "w": w,
            "d": d,
            "h": h,
            "color": color,
        }
    )


def moss_slime():
    blocks = []
    add(blocks, "Wet_Ground", 0, 0, 0, 4.8, 3.8, 0.28, "#648d58")
    add(blocks, "Slime_Body", -0.1, 0.28, 0, 4.0, 3.3, 1.25, "#80b864")
    add(blocks, "Slime_Body", 0.15, 1.25, 0, 3.25, 2.75, 1.18, "#9bd179")
    add(blocks, "Slime_Highlight", 0.15, 2.15, -0.05, 2.45, 2.15, 0.82, "#b9df91")
    add(blocks, "Slime_Highlight", 0.65, 2.92, -0.1, 1.25, 1.15, 0.42, "#d2e9a6")
    add(blocks, "Eyes", 1.38, 1.72, -0.62, 0.24, 0.28, 0.42, "#f7edb2")
    add(blocks, "Eyes", 1.38, 1.72, 0.62, 0.24, 0.28, 0.42, "#f7edb2")
    add(blocks, "Eyes", 1.52, 1.78, -0.62, 0.12, 0.14, 0.23, "#4f744d")
    add(blocks, "Eyes", 1.52, 1.78, 0.62, 0.12, 0.14, 0.23, "#4f744d")
    add(blocks, "Moss", -0.55, 3.32, -0.45, 0.72, 0.42, 0.28, "#5f9a58")
    add(blocks, "Moss", -0.15, 3.36, 0.02, 0.54, 0.48, 0.3, "#79ad57")
    add(blocks, "Moss", -0.85, 3.18, 0.48, 0.48, 0.36, 0.24, "#79ad57")
    add(blocks, "Embedded_Stone", -0.85, 1.12, 0.82, 0.52, 0.43, 0.38, "#b1a78b")
    add(blocks, "Embedded_Stone", -1.18, 0.75, -0.62, 0.42, 0.34, 0.3, "#d0c29c")
    add(blocks, "Slime_Bubbles", -1.5, 1.5, -0.72, 0.22, 0.22, 0.22, "#d6f0ad")
    add(blocks, "Slime_Bubbles", 0.38, 2.48, 0.78, 0.18, 0.18, 0.18, "#d6f0ad")
    return blocks


def sprout():
    blocks = []
    add(blocks, "Stem", -0.1, 0.28, 0, 1.4, 1.75, 2.2, "#d8c391")
    add(blocks, "Stem_Shadow", -0.18, 0.25, 0, 1.72, 2.05, 0.42, "#b59d70")
    add(blocks, "Feet", 0.15, 0.05, -0.9, 0.55, 0.5, 0.42, "#8b7454")
    add(blocks, "Feet", 0.15, 0.05, 0.9, 0.55, 0.5, 0.42, "#8b7454")
    add(blocks, "Cap_Underside", 0, 2.42, 0, 3.9, 3.5, 0.55, "#9d6f4e")
    add(blocks, "Cap", -0.18, 2.92, 0, 4.75, 4.0, 0.72, "#c88755")
    add(blocks, "Cap", -0.28, 3.58, -0.1, 3.65, 3.35, 0.7, "#e1a76d")
    add(blocks, "Cap_Highlight", -0.42, 4.22, -0.28, 2.5, 2.4, 0.55, "#efc38a")
    add(blocks, "Cap_Highlight", 0.15, 3.68, -1.78, 1.05, 0.42, 0.32, "#f3d19a")
    add(blocks, "Cap_Spot", 1.2, 3.5, 0.98, 0.72, 0.52, 0.25, "#f0d09a")
    add(blocks, "Eyes", 0.78, 1.62, -0.46, 0.2, 0.22, 0.22, "#554b42")
    add(blocks, "Eyes", 0.78, 1.62, 0.46, 0.2, 0.22, 0.22, "#554b42")
    add(blocks, "Leaf", -0.72, 0.38, -1.38, 0.34, 0.95, 0.2, "#78a85e")
    add(blocks, "Leaf", -0.58, 0.42, 1.34, 0.32, 0.86, 0.18, "#8db867")
    add(blocks, "Leaf", -0.95, 0.4, -0.78, 0.3, 0.6, 0.16, "#a1c575")
    add(blocks, "Missing_Cap_Edge", 1.88, 2.86, 0.95, 0.45, 0.8, 0.38, "#9d6f4e")
    return blocks


def pebble():
    blocks = []
    add(blocks, "Floating_Stone", -1.55, 1.15, -1.25, 1.4, 1.1, 1.25, "#899799")
    add(blocks, "Floating_Stone", -1.75, 1.48, 1.18, 1.2, 1.35, 1.4, "#a9b3b6")
    add(blocks, "Floating_Stone", 0.15, 2.48, -1.18, 1.6, 1.15, 1.45, "#bec8c6")
    add(blocks, "Floating_Stone", 0.45, 2.28, 1.4, 1.35, 1.3, 1.55, "#929f9f")
    add(blocks, "Floating_Stone", 1.65, 0.92, -0.78, 1.18, 1.2, 1.05, "#778889")
    add(blocks, "Floating_Stone", 1.55, 0.72, 0.95, 1.25, 1.2, 0.92, "#b6beb9")
    add(blocks, "Core", 0.1, 1.72, 0.05, 1.1, 1.1, 1.3, "#9bd9cf")
    add(blocks, "Core", 0.22, 2.18, -0.04, 0.46, 0.46, 0.58, "#e1f4cc")
    add(blocks, "Runes", 0.7, 1.6, -0.55, 0.16, 0.16, 0.78, "#9de5db")
    add(blocks, "Runes", 0.7, 1.6, 0.58, 0.16, 0.16, 0.78, "#9de5db")
    add(blocks, "Stone_Shards", -2.42, 0.45, 0.05, 0.62, 0.62, 0.46, "#c7c9bd")
    add(blocks, "Stone_Shards", 2.42, 2.18, 0.08, 0.52, 0.56, 0.5, "#a8b0a9")
    add(blocks, "Stone_Shards", -0.55, 3.62, 0.28, 0.6, 0.52, 0.48, "#9ba7a3")
    add(blocks, "Stone_Shards", 0.12, 0.08, -1.8, 0.7, 0.52, 0.42, "#aab3ad")
    return blocks


def hound():
    blocks = []
    add(blocks, "Body", -0.1, 2.15, 0, 4.5, 2.0, 1.72, "#b46e57")
    add(blocks, "Chest", 1.25, 2.05, 0, 1.65, 2.12, 1.9, "#cc8969")
    add(blocks, "Neck", 1.82, 2.9, 0, 1.34, 1.62, 1.65, "#a95e4b")
    add(blocks, "Head", 2.72, 3.55, 0, 1.68, 1.78, 1.48, "#bd765c")
    add(blocks, "Muzzle", 3.75, 3.18, 0, 1.22, 1.08, 0.7, "#e0b28a")
    add(blocks, "Nose", 4.34, 3.36, 0, 0.34, 0.42, 0.32, "#544a43")
    add(blocks, "Ears", 2.48, 4.8, -0.63, 0.58, 0.62, 0.9, "#754c43")
    add(blocks, "Ears", 2.48, 4.8, 0.63, 0.58, 0.62, 0.9, "#754c43")
    add(blocks, "Ears", 2.62, 4.82, -0.63, 0.31, 0.34, 0.54, "#d69877")
    add(blocks, "Ears", 2.62, 4.82, 0.63, 0.31, 0.34, 0.54, "#d69877")
    add(blocks, "Eyes", 3.24, 4.18, -0.73, 0.18, 0.18, 0.18, "#f5d184")
    add(blocks, "Eyes", 3.24, 4.18, 0.73, 0.18, 0.18, 0.18, "#f5d184")
    for x, z in [(-1.65, -0.72), (-1.65, 0.72), (1.55, -0.72), (1.55, 0.72)]:
        add(blocks, "Legs", x, 0.78, z, 0.82, 0.72, 1.42, "#a85f4b")
        add(blocks, "Paws", x + 0.22, 0.16, z, 1.08, 0.92, 0.34, "#62534a")
    for x in [-1.35, -0.48, 0.38]:
        add(blocks, "Rib_Marks", x, 2.5, -1.04, 0.34, 0.16, 0.92, "#d7a181")
        add(blocks, "Rib_Marks", x, 2.5, 1.04, 0.34, 0.16, 0.92, "#d7a181")
    add(blocks, "Spines", -0.85, 3.45, 0, 0.56, 0.58, 0.85, "#694b45")
    add(blocks, "Spines", -0.12, 3.55, 0, 0.52, 0.56, 0.9, "#765148")
    add(blocks, "Spines", 0.58, 3.48, 0, 0.48, 0.52, 0.76, "#694b45")
    add(blocks, "Tail", -2.72, 2.92, 0, 1.38, 0.72, 0.7, "#9e5e4e")
    add(blocks, "Tail", -3.45, 3.28, 0, 0.86, 0.66, 0.64, "#674a45")
    add(blocks, "Mud", -1.98, 0.48, -0.75, 0.32, 0.32, 0.2, "#8b755a")
    add(blocks, "Mud", 1.18, 0.4, 0.74, 0.28, 0.28, 0.18, "#8b755a")
    return blocks


def warden():
    blocks = []
    add(blocks, "Feet", 0.32, 0.16, -0.78, 1.56, 1.35, 0.64, "#707f83")
    add(blocks, "Feet", 0.32, 0.16, 0.78, 1.56, 1.35, 0.64, "#707f83")
    add(blocks, "Leg_Armor", 0, 0.78, -0.78, 1.16, 1.15, 1.18, "#9da9a8")
    add(blocks, "Leg_Armor", 0, 0.78, 0.78, 1.16, 1.15, 1.18, "#9da9a8")
    add(blocks, "Torso", -0.12, 1.95, 0, 2.48, 2.12, 2.42, "#8d9fa6")
    add(blocks, "Chest_Plate", 0.22, 2.52, 0, 1.9, 2.2, 1.34, "#b4bec0")
    add(blocks, "Worn_Armor", 0.85, 3.38, -0.8, 0.34, 0.2, 1.2, "#718187")
    add(blocks, "Worn_Armor", 0.85, 3.38, 0.8, 0.34, 0.2, 1.2, "#718187")
    add(blocks, "Neck", 0, 4.3, 0, 1.05, 1.0, 0.62, "#776f65")
    add(blocks, "Head", 0.1, 4.75, 0, 1.64, 1.6, 1.5, "#a8b3b3")
    add(blocks, "Brow", 0.82, 5.76, 0, 0.36, 1.9, 0.26, "#65767b")
    add(blocks, "Eyes", 0.98, 5.28, -0.48, 0.2, 0.18, 0.18, "#d5f1d9")
    add(blocks, "Eyes", 0.98, 5.28, 0.48, 0.2, 0.18, 0.18, "#d5f1d9")
    for z in [-1.38, 1.38]:
        add(blocks, "Shoulders", -0.12, 3.72, z, 1.68, 1.2, 1.15, "#909fa1")
        add(blocks, "Arms", 0.08, 2.62, z * 1.1, 1.2, 0.92, 1.72, "#79898d")
        add(blocks, "Sand_Joints", -0.25, 2.1, z * 1.1, 0.46, 0.78, 0.38, "#b29368")
    add(blocks, "Shield", 1.05, 1.82, 2.12, 0.48, 2.5, 3.22, "#75858a")
    add(blocks, "Shield_Rim", 1.34, 2.02, 2.15, 0.22, 2.08, 2.7, "#c09b62")
    add(blocks, "Shield_Emblem", 1.49, 3.04, 2.15, 0.18, 0.72, 1.02, "#d0b576")
    add(blocks, "Hammer_Handle", 0.4, 0.26, -2.08, 0.32, 0.32, 3.6, "#755d48")
    add(blocks, "Hammer_Head", 0.54, 3.52, -2.08, 0.92, 1.25, 1.5, "#89979a")
    add(blocks, "Sand_Joints", 0.62, 4.12, -0.78, 0.2, 0.18, 0.26, "#b29368")
    return blocks


def hexer():
    blocks = []
    add(blocks, "Robe", -0.15, 0.26, 0, 2.05, 2.2, 3.05, "#856e9e")
    add(blocks, "Robe_Hem", -0.32, 0.24, 0, 2.52, 2.55, 0.58, "#a085b5")
    add(blocks, "Robe_Fold", 0.08, 1.15, -0.92, 0.32, 0.18, 1.7, "#b097c6")
    add(blocks, "Robe_Fold", 0.08, 1.15, 0.92, 0.32, 0.18, 1.7, "#b097c6")
    add(blocks, "Sleeves", 0.18, 2.42, -1.42, 1.16, 0.94, 1.18, "#705b88")
    add(blocks, "Sleeves", 0.18, 2.42, 1.42, 1.16, 0.94, 1.18, "#705b88")
    add(blocks, "Hands", 0.92, 2.36, -1.42, 0.46, 0.48, 0.46, "#d2b49a")
    add(blocks, "Hands", 0.92, 2.36, 1.42, 0.46, 0.48, 0.46, "#d2b49a")
    add(blocks, "Sash", 0.2, 2.84, 0, 0.45, 2.0, 0.46, "#d6a665")
    add(blocks, "Hood", 0.12, 3.47, 0, 1.62, 1.8, 1.64, "#594e69")
    add(blocks, "Hood_Lining", 0.92, 3.42, 0, 0.28, 1.08, 1.16, "#bd9e78")
    add(blocks, "Face", 1.08, 3.42, 0, 0.32, 0.76, 0.84, "#d5b898")
    add(blocks, "Eyes", 1.26, 3.78, -0.26, 0.12, 0.14, 0.14, "#f2c57c")
    add(blocks, "Eyes", 1.26, 3.78, 0.26, 0.12, 0.14, 0.14, "#f2c57c")
    add(blocks, "Hood_Top", -0.38, 4.82, 0, 1.42, 1.45, 0.55, "#77678f")
    add(blocks, "Staff", -0.35, 0.22, 2.25, 0.3, 0.3, 6.15, "#80664e")
    add(blocks, "Staff_Crack", -0.12, 2.8, 2.25, 0.15, 0.15, 2.2, "#d19a64")
    add(blocks, "Ember", -0.18, 6.42, 2.25, 0.9, 0.9, 0.82, "#e29a61")
    add(blocks, "Ember", -0.18, 6.72, 2.25, 0.52, 0.52, 0.58, "#ffd486")
    add(blocks, "Smoke", -0.5, 7.32, 2.25, 0.42, 0.46, 0.72, "#9a86af")
    add(blocks, "Smoke", -0.12, 7.62, 2.25, 0.32, 0.36, 0.58, "#c2a4c5")
    return blocks


def boss_gate():
    blocks = []
    add(blocks, "Statue_Plinth", -0.12, 0.05, 0, 2.8, 5.9, 0.42, "#9a907d")
    add(blocks, "Feet", 0.22, 0.15, -1.32, 2.1, 1.68, 0.74, "#b4aa94")
    add(blocks, "Feet", 0.22, 0.15, 1.32, 2.1, 1.68, 0.74, "#b4aa94")
    add(blocks, "Leg_Armor", -0.08, 0.82, -1.32, 1.72, 1.42, 1.58, "#918978")
    add(blocks, "Leg_Armor", -0.08, 0.82, 1.32, 1.72, 1.42, 1.58, "#918978")
    add(blocks, "Knee_Plates", 0.68, 1.72, -1.32, 0.42, 1.5, 0.7, "#c2b79b")
    add(blocks, "Knee_Plates", 0.68, 1.72, 1.32, 0.42, 1.5, 0.7, "#c2b79b")
    add(blocks, "Waist_Armor", -0.05, 2.48, 0, 2.25, 3.65, 1.12, "#a79c84")
    add(blocks, "Torso", -0.08, 3.42, 0, 2.95, 4.85, 3.05, "#b5aa91")
    add(blocks, "Chest_Armor", 0.72, 4.02, 0, 1.34, 3.95, 1.94, "#c4b89b")
    add(blocks, "Chest_Armor", 0.82, 5.44, -1.66, 1.22, 0.54, 0.74, "#958a77")
    add(blocks, "Chest_Armor", 0.82, 5.44, 1.66, 1.22, 0.54, 0.74, "#958a77")
    add(blocks, "Core_Frame", 1.46, 4.12, 0, 0.4, 1.92, 1.82, "#776f60")
    add(blocks, "Core_Frame", 1.62, 4.34, 0, 0.24, 1.36, 1.38, "#d0a75d")
    add(blocks, "Core", 1.78, 4.55, 0, 0.18, 0.82, 0.94, "#f1c56f")
    add(blocks, "Core", 1.9, 4.84, 0, 0.12, 0.42, 0.52, "#fff0b0")
    add(blocks, "Runes", 1.55, 3.66, -1.12, 0.18, 0.16, 0.6, "#9bd9cb")
    add(blocks, "Runes", 1.55, 3.66, 1.12, 0.18, 0.16, 0.6, "#9bd9cb")
    add(blocks, "Runes", 1.56, 5.82, -0.82, 0.18, 0.16, 0.55, "#9bd9cb")
    add(blocks, "Runes", 1.56, 5.82, 0.82, 0.18, 0.16, 0.55, "#9bd9cb")
    add(blocks, "Neck", -0.1, 6.38, 0, 1.64, 1.8, 0.82, "#817966")
    add(blocks, "Head", -0.18, 7.08, 0, 2.0, 2.56, 1.86, "#a89e88")
    add(blocks, "Helmet", -0.28, 8.52, 0, 1.48, 2.92, 0.68, "#c4b99d")
    add(blocks, "Helmet_Crest", -0.48, 9.12, 0, 1.18, 1.72, 0.62, "#a89d83")
    add(blocks, "Brow", 0.84, 7.88, 0, 0.42, 2.08, 0.38, "#756e61")
    add(blocks, "Eyes", 1.04, 7.42, -0.58, 0.18, 0.22, 0.2, "#a8e7d8")
    add(blocks, "Eyes", 1.04, 7.42, 0.58, 0.18, 0.22, 0.2, "#a8e7d8")
    add(blocks, "Face_Plate", 0.94, 6.94, 0, 0.36, 0.9, 0.42, "#d0c3a4")
    for z in [-2.55, 2.55]:
        add(blocks, "Shoulder_Armor", -0.04, 5.95, z, 1.9, 1.8, 1.62, "#9b917d")
        add(blocks, "Shoulder_Inlay", 0.18, 6.58, z, 1.26, 1.28, 0.52, "#c0b59a")
        add(blocks, "Stone_Arms", 0.02, 4.54, z * 1.1, 1.62, 1.36, 1.92, "#a79c85")
        add(blocks, "Elbow_Armor", 0.3, 3.58, z * 1.1, 1.46, 1.42, 0.82, "#807867")
        add(blocks, "Stone_Fists", 0.52, 2.76, z * 1.08, 1.54, 1.42, 1.18, "#c0b59a")
    add(blocks, "Armor_Bands", 0.72, 1.12, -1.34, 0.2, 1.52, 0.24, "#766f63")
    add(blocks, "Armor_Bands", 0.72, 1.12, 1.34, 0.2, 1.52, 0.24, "#766f63")
    add(blocks, "Broken_Ring", 0.05, 0.3, -3.02, 0.58, 0.82, 0.42, "#d0ad68")
    add(blocks, "Broken_Ring", -0.16, 0.22, -2.62, 0.46, 0.7, 0.36, "#b8a273")
    add(blocks, "Broken_Ring", 0.1, 0.3, 3.02, 0.58, 0.82, 0.42, "#d0ad68")
    add(blocks, "Broken_Ring", -0.16, 0.22, 2.62, 0.46, 0.7, 0.36, "#b8a273")
    add(blocks, "Stone_Rubble", 0.42, 0.18, -3.45, 0.88, 0.8, 0.42, "#c2b79b")
    add(blocks, "Stone_Rubble", -0.2, 0.16, 3.42, 0.78, 0.74, 0.36, "#968d7b")
    return blocks


def boss_bloom():
    blocks = []
    add(blocks, "Roots", -0.1, 0.08, 0, 4.8, 4.6, 0.42, "#6f825e")
    for x, z, width, depth in [
        (-1.9, -1.4, 2.5, 0.75),
        (-1.8, 1.35, 2.4, 0.72),
        (1.2, -1.4, 2.2, 0.72),
        (1.35, 1.3, 2.2, 0.7),
    ]:
        add(blocks, "Roots", x, 0.1, z, width, depth, 0.56, "#7d9164")
    add(blocks, "Stem", -0.18, 0.42, 0, 2.25, 2.45, 4.55, "#9688b0")
    add(blocks, "Stem_Light", 1.0, 1.05, 0, 0.28, 1.3, 2.7, "#c3b5d8")
    add(blocks, "Cap_Underside", 0.12, 4.48, 0, 5.55, 5.4, 0.68, "#81739c")
    add(blocks, "Cap", -0.25, 5.02, 0, 7.1, 6.45, 1.1, "#a996c9")
    add(blocks, "Cap", -0.42, 6.0, 0, 5.8, 5.5, 0.88, "#c0afe0")
    add(blocks, "Cap_Highlight", -0.58, 6.78, -0.1, 3.65, 3.6, 0.62, "#ded1f1")
    add(blocks, "Cap_Rim", 0.15, 4.8, -2.6, 4.15, 0.62, 0.48, "#d5c5e8")
    add(blocks, "Cap_Rim", 0.15, 4.8, 2.6, 4.15, 0.62, 0.48, "#d5c5e8")
    for x, z in [(-1.55, -1.35), (-0.55, 0.9), (0.62, -1.0), (1.45, 1.35), (-1.05, 1.62)]:
        add(blocks, "Spore_Glow", x, 5.02, z, 0.35, 0.35, 0.32, "#f5dfa0")
    add(blocks, "Side_Mushroom", -0.62, 3.05, -2.34, 1.7, 1.6, 1.0, "#b9a6d8")
    add(blocks, "Side_Mushroom", -0.42, 3.82, -2.34, 1.25, 1.2, 0.58, "#dfc8ed")
    add(blocks, "Side_Mushroom", -0.62, 3.05, 2.34, 1.7, 1.6, 1.0, "#a895c8")
    add(blocks, "Side_Mushroom", -0.42, 3.82, 2.34, 1.25, 1.2, 0.58, "#d6c5e9")
    add(blocks, "Spore_Glow", 0.28, 3.9, -2.34, 0.2, 0.2, 0.22, "#f5dfa0")
    add(blocks, "Spore_Glow", 0.28, 3.9, 2.34, 0.2, 0.2, 0.22, "#f5dfa0")
    add(blocks, "Root_Vines", 0.95, 0.26, -1.95, 0.58, 0.65, 1.1, "#6d9863")
    add(blocks, "Root_Vines", 1.1, 0.24, 1.95, 0.56, 0.62, 1.0, "#88a66a")
    return blocks


SPECS = [
    {
        "id": "mossSlime",
        "name": "苔藓史莱姆",
        "model": "moss-slime.glb",
        "portrait": "moss-slime",
        "color": "#91bb78",
        "appearance": "拳头到水桶大小的半透明软团，体表黏着碎苔和湿砂。收缩时能看见里面裹着的细小石屑。",
        "build": moss_slime,
    },
    {
        "id": "sprout",
        "name": "腐木魔菇",
        "model": "sprout.glb",
        "portrait": "sprout",
        "color": "#d1a776",
        "appearance": "矮小蕈类生物，菌盖边缘缺了一块，细腿支着圆鼓鼓的身体，身上带着落叶。",
        "build": sprout,
    },
    {
        "id": "pebble",
        "name": "碎石魔灵",
        "model": "pebble.glb",
        "portrait": "pebble",
        "color": "#a9b3b6",
        "appearance": "几块巴掌大的灰石绕着一颗暗淡的灵核聚合，移动时互相磕碰，石缝里漏出微光。",
        "build": pebble,
    },
    {
        "id": "hound",
        "name": "裂隙猎犬",
        "model": "hound.glb",
        "portrait": "hound",
        "color": "#b46e57",
        "appearance": "身形瘦长的异界猎兽，肋线清楚，肩背长着短硬的暗色棘毛，爪间常夹着泥。",
        "build": hound,
    },
    {
        "id": "warden",
        "name": "遗迹石卫",
        "model": "warden.glb",
        "portrait": "golem",
        "color": "#8d9fa6",
        "appearance": "由沉重石块拼合的守卫，肩和胸口有磨损的护片，关节处夹着沙土，移动伴着石面摩擦声。",
        "build": warden,
    },
    {
        "id": "hexer",
        "name": "余烬祭司",
        "model": "hexer.glb",
        "portrait": "cultist",
        "color": "#b097c6",
        "appearance": "披旧祭衣的人形敌人，兜帽遮住额头，袖口有烟熏痕，手里握着带焦裂纹的施法器。",
        "build": hexer,
    },
    {
        "id": "bossGate",
        "name": "缚界巨像",
        "model": "boss-gate.glb",
        "portrait": "boss-gate",
        "color": "#dfb46d",
        "appearance": "嵌着界门核心的巨大石像，装甲比普通石卫厚，胸腹间露着发亮的裂纹，脚边散着断裂的石环。",
        "build": boss_gate,
    },
    {
        "id": "bossBloom",
        "name": "夜蕈母体",
        "model": "boss-bloom.glb",
        "portrait": "boss-bloom",
        "color": "#bdaaed",
        "appearance": "巨大的夜色蕈体扎在古林深处，菌盖层层叠起，根须缠着湿土，荧光孢子附在下垂的褶片上。",
        "build": boss_bloom,
    },
]


def export_enemy(spec):
    blocks = spec["build"]()
    data = {key: value for key, value in spec.items() if key != "build"}
    data["blocks"] = blocks
    source_file = SOURCE / (Path(spec["model"]).stem + ".json")
    source_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    model = Model(spec["name"])
    for block in blocks:
        model.box(
            block["x"] - block["w"] / 2,
            block["y"],
            block["z"] - block["d"] / 2,
            block["w"],
            block["h"],
            block["d"],
            block["color"].lstrip("#"),
            block["group"],
            glow=block["group"] in GLOW_GROUPS,
        )
    model.finish(
        spec["model"],
        source="建模工具/build_early_enemies.py",
        metadata={
            "enemyId": spec["id"],
            "sourceBlocks": "万象异境-体素模型/早期敌人/" + source_file.name,
            "portrait": "万象酒馆-Demo/assets/portraits/" + spec["portrait"] + ".svg",
            "displayPlinth": False,
        },
    )
    shutil.copy2(OUT / spec["model"], SOURCE / spec["model"])
    print(f"Source model: {SOURCE / spec['model']}")


def main():
    SOURCE.mkdir(parents=True, exist_ok=True)
    if len(SPECS) != 8 or len({spec["id"] for spec in SPECS}) != len(SPECS):
        raise ValueError("Expected eight unique early-enemy model specifications")
    for spec in SPECS:
        export_enemy(spec)


if __name__ == "__main__":
    main()
