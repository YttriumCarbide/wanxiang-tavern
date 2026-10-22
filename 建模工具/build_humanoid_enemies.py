"""Export the shared humanoid block sources with the established creature GLB exporter."""

import json
from pathlib import Path

from build_realms import Model


def main():
    root = Path(__file__).resolve().parents[1]
    source = root / "万象异境-体素模型/人形敌人"
    files = sorted(source.glob("enemy-humanoid-*.json"))
    if len(files) != 6:
        raise ValueError("Run tools/build-humanoid-enemies.mjs to prepare all six model sources")
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
            source="万象酒馆-Demo/tools/build-humanoid-enemies.mjs",
            metadata={
                "templateId": data["id"],
                "weapon": data["weapon"],
                "gender": data["gender"],
                "sourceBlocks": "万象异境-体素模型/人形敌人/" + filename.name,
                "portrait": "万象酒馆-Demo/assets/portraits/" + data["portrait"] + ".svg",
                "displayPlinth": False,
            },
        )


if __name__ == "__main__":
    main()
