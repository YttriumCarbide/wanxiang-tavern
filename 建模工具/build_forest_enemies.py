"""Export the six forest chapters' creatures from shared portrait/model voxel sources."""

import json
from pathlib import Path

from build_realms import Model


def main():
    root = Path(__file__).resolve().parents[1]
    source = root / "万象异境-体素模型/月痕古林"
    files = sorted(source.glob("*.json"))
    if len(files) != 24:
        raise ValueError("Prepare all sixteen minions and eight boss parts before exporting")
    for filename in files:
        data = json.loads(filename.read_text(encoding="utf-8"))
        model = Model(data["name"])
        for block in data["blocks"]:
            model.box(
                block["x"] - block["w"] / 2,
                block["y"],
                block["z"] - block["d"] / 2,
                block["w"],
                block["h"],
                block["d"],
                block["color"].lstrip("#"),
                block["group"],
            )
        model.finish(
            data["model"],
            source="万象酒馆-Demo/tools/build-forest-enemies.mjs",
            metadata={
                "enemyId": data["id"],
                "sourceBlocks": "万象异境-体素模型/月痕古林/" + filename.name,
                "portrait": "万象酒馆-Demo/assets/portraits/" + data["portrait"] + ".svg",
                "displayPlinth": False,
            },
        )


if __name__ == "__main__":
    main()
