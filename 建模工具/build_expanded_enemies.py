"""Export the 38 progressive 3-tier expanded voxel enemies and bosses to GLB."""

import json
from pathlib import Path

from build_realms import Model

GLOW_GROUPS = {"Core", "Eyes", "Glow", "Runes", "Rift", "Crown", "Rings"}


def main():
    root = Path(__file__).resolve().parents[1]
    source = root / "万象异境-体素模型/扩展怪物"
    files = sorted(source.glob("*.json"))
    if len(files) != 38:
        raise ValueError(f"Expected 38 expanded enemy JSONs, found {len(files)}")
    for filename in files:
        data = json.loads(filename.read_text(encoding="utf-8"))
        model = Model(data["name"])
        for block in data["blocks"]:
            group = block["group"]
            model.box(
                block["x"] - block["w"] / 2,
                block["y"],
                block["z"] - block["d"] / 2,
                block["w"],
                block["h"],
                block["d"],
                block["color"].lstrip("#"),
                group,
                glow=group in GLOW_GROUPS,
            )
        model.finish(
            data["model"],
            source="万象酒馆-Demo/tools/build-expanded-enemies.mjs",
            metadata={
                "enemyId": data["id"],
                "tier": data["tier"],
                "nonVoxel": False,
                "sourceBlocks": "万象异境-体素模型/扩展怪物/" + filename.name,
                "portrait": "万象酒馆-Demo/assets/portraits/" + data["portrait"] + ".svg",
                "displayPlinth": False,
            },
        )


if __name__ == "__main__":
    main()
