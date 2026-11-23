"""Validate the seven retained capital-arena GLBs without rebuilding any assets.

Run with the modelling virtual environment. ``--json`` emits one machine-readable
report; both output modes return a nonzero exit status if any model fails.
"""

import argparse
import json
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODELS = (
    ("arena-retiarius", "arenaRetiarius", "normal", 1.68, 1.30, 1.20),
    ("arena-clockwork-lion", "arenaClockworkLion", "normal", 1.38, 1.55, 1.80),
    ("arena-beastmaster", "arenaBeastmaster", "normal", 1.76, 1.42, 1.30),
    ("arena-hoplite", "arenaHoplite", "normal", 1.82, 1.58, 1.35),
    ("arena-chariot-juggernaut", "arenaChariotJuggernaut", "elite", 2.18, 2.10, 1.75),
    ("arena-inquisitor-captain", "arenaInquisitorCaptain", "elite", 2.22, 1.85, 1.65),
    ("arena-grand-champion", "arenaGrandChampion", "overlord", 2.65, 4.50, 3.40),
)
CLIPS = {
    "Idle": (3.60, 40),
    "Charge_Up": (1.85, 38),
    "Normal_Attack": (1.75, 36),
    "Special_Attack": (1.95, 40),
    "Special_Action": (2.20, 44),
    "Talon_Rend": (2.10, 42),
    "Break_Stagger": (1.55, 34),
}
FX_WINDOWS = {
    "Halberd_Arc_FX": ("Normal_Attack", 0.38, 0.68, 1.15),
    "Shield_Nova_FX": ("Special_Attack", 0.42, 0.76, 1.25),
    "Solar_SpearRain_FX": ("Special_Action", 0.32, 1.65, 1.35),
    "Colosseum_Judgment_FX": ("Talon_Rend", 0.98, 1.55, 1.45),
}
PARENTS = {
    "Champion_Root": None,
    "Pelvis_Core": "Champion_Root",
    "War_Kilt_Front": "Pelvis_Core",
    "War_Kilt_L": "Pelvis_Core",
    "War_Kilt_R": "Pelvis_Core",
    "Torso_Lower": "Pelvis_Core",
    "Torso_Upper": "Torso_Lower",
    "Collar_Mantle": "Torso_Upper",
    "Neck_Joint": "Collar_Mantle",
    "Head_Helm": "Neck_Joint",
    "Visor_LionMask": "Head_Helm",
    "Crest_Plume": "Head_Helm",
    "Triumph_Halo": "Collar_Mantle",
    "Triumph_Wing_L": "Collar_Mantle",
    "Triumph_Wing_R": "Collar_Mantle",
    "Cape_Mantle_L": "Collar_Mantle",
    "Cape_Mantle_R": "Collar_Mantle",
    "Shoulder_R": "Collar_Mantle",
    "UpperArm_R": "Shoulder_R",
    "Forearm_R": "UpperArm_R",
    "Hand_R": "Forearm_R",
    "Sunstar_Halberd": "Hand_R",
    "Shoulder_L": "Collar_Mantle",
    "UpperArm_L": "Shoulder_L",
    "Forearm_L": "UpperArm_L",
    "Hand_L": "Forearm_L",
    "Aegis_Buckler": "Hand_L",
    "Hip_R": "Pelvis_Core",
    "Hip_L": "Pelvis_Core",
    "Shin_R": "Hip_R",
    "Shin_L": "Hip_L",
    "Boot_R": "Shin_R",
    "Boot_L": "Shin_L",
    **dict.fromkeys(FX_WINDOWS, "Champion_Root"),
}
COMPONENTS = {
    5120: np.dtype("i1"),
    5121: np.dtype("u1"),
    5122: np.dtype("<i2"),
    5123: np.dtype("<u2"),
    5125: np.dtype("<u4"),
    5126: np.dtype("<f4"),
}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def require(condition, message):
    if not condition:
        raise ValueError(message)


class Glb:
    """Bounded access to the embedded buffers and authored rest hierarchy."""

    def __init__(self, filename):
        self.raw = filename.read_bytes()
        require(len(self.raw) >= 28, "GLB header is truncated")
        magic, version, length = struct.unpack_from("<III", self.raw)
        require(magic == 0x46546C67 and version == 2, "Expected binary glTF 2.0")
        require(length == len(self.raw), "GLB declared length does not match its bytes")
        chunks = []
        offset = 12
        while offset < length:
            require(offset + 8 <= length, "GLB chunk header is truncated")
            size, kind = struct.unpack_from("<II", self.raw, offset)
            require(size % 4 == 0, "GLB chunk is not four-byte aligned")
            require(offset + 8 + size <= length, "GLB chunk extends beyond the file")
            chunks.append((kind, self.raw[offset + 8 : offset + 8 + size]))
            offset += 8 + size
        require(
            [kind for kind, _ in chunks] == [0x4E4F534A, 0x004E4942], "Expected JSON/BIN chunks"
        )
        self.doc = json.loads(chunks[0][1])
        self.blob = chunks[1][1]
        require(self.doc.get("asset", {}).get("version") == "2.0", "Invalid glTF asset version")
        buffers = self.doc.get("buffers", [])
        require(len(buffers) == 1 and "uri" not in buffers[0], "GLB must embed one buffer")
        self.byte_length = buffers[0]["byteLength"]
        require(0 <= len(self.blob) - self.byte_length <= 3, "Invalid embedded buffer length")
        self.cache = {}
        for index in range(len(self.doc.get("accessors", []))):
            self.values(index)
        self.parents, self.world, self.hidden = self.hierarchy()

    def values(self, index):
        if index in self.cache:
            return self.cache[index]
        accessors = self.doc.get("accessors", [])
        require(
            isinstance(index, int) and 0 <= index < len(accessors), "Invalid accessor reference"
        )
        accessor = accessors[index]
        require("sparse" not in accessor, "Sparse accessors are not used by the arena exporter")
        component = accessor.get("componentType")
        kind = accessor.get("type")
        require(component in COMPONENTS and kind in WIDTHS, "Unsupported accessor representation")
        count = accessor.get("count")
        require(isinstance(count, int) and count > 0, "Accessor count must be positive")
        views = self.doc.get("bufferViews", [])
        view_id = accessor.get("bufferView")
        require(
            isinstance(view_id, int) and 0 <= view_id < len(views), "Invalid bufferView reference"
        )
        view = views[view_id]
        require(view.get("buffer") == 0, "Accessor references an external buffer")
        dtype = COMPONENTS[component]
        width = WIDTHS[kind]
        packed = width * dtype.itemsize
        stride = view.get("byteStride", packed)
        start = view.get("byteOffset", 0)
        size = view.get("byteLength", -1)
        local = accessor.get("byteOffset", 0)
        require(
            all(isinstance(v, int) for v in (stride, start, size, local)), "Invalid buffer offsets"
        )
        require(
            start >= 0 and size >= 0 and start + size <= self.byte_length, "bufferView overflow"
        )
        require(local >= 0 and stride >= packed, "Invalid accessor offset or stride")
        require((start + local) % dtype.itemsize == 0, "Accessor component is misaligned")
        require(local + (count - 1) * stride + packed <= size, "Accessor extends beyond its view")
        values = np.ndarray(
            (count, width),
            dtype=dtype,
            buffer=self.blob,
            offset=start + local,
            strides=(stride, dtype.itemsize),
        )
        require(np.isfinite(values).all(), f"Accessor {index} contains nonfinite values")
        for name, reduction in (("min", np.min), ("max", np.max)):
            if name in accessor:
                bound = np.asarray(accessor[name])
                require(bound.shape == (width,), f"Accessor {index} has invalid {name}")
                require(
                    np.allclose(bound, reduction(values, axis=0), atol=2e-5),
                    f"Accessor {index} has stale {name}",
                )
        if accessor.get("normalized"):
            require(dtype.kind in "iu", "Only integer accessors may be normalized")
            values = values.astype(np.float64) / np.iinfo(dtype).max
            if dtype.kind == "i":
                values = np.maximum(values, -1)
        self.cache[index] = values
        return values

    def hierarchy(self):
        nodes = self.doc.get("nodes", [])
        require(nodes, "Model has no nodes")
        parents = {}
        for parent, node in enumerate(nodes):
            for child in node.get("children", []):
                require(isinstance(child, int) and 0 <= child < len(nodes), "Invalid child node")
                require(child not in parents, "Node has multiple parents")
                parents[child] = parent
        scenes = self.doc.get("scenes", [])
        scene = self.doc.get("scene", 0)
        require(isinstance(scene, int) and 0 <= scene < len(scenes), "Missing default scene")
        roots = scenes[scene].get("nodes", [])
        require(roots and len(set(roots)) == len(roots), "Scene roots are empty or duplicated")
        world, hidden, visiting = {}, {}, set()

        def visit(index, inherited, invisible):
            require(isinstance(index, int) and 0 <= index < len(nodes), "Invalid scene root")
            require(
                index not in visiting and index not in world, "Scene hierarchy contains a cycle"
            )
            visiting.add(index)
            node = nodes[index]
            transform = rest_matrix(node)
            world[index] = inherited @ transform
            scale = np.asarray(node.get("scale", [1, 1, 1]))
            hidden[index] = invisible or bool(np.max(np.abs(scale)) < 0.01)
            for child in node.get("children", []):
                visit(child, world[index], hidden[index])
            visiting.remove(index)

        for index in roots:
            require(index not in parents, "Scene root also has a parent")
            visit(index, np.eye(4), False)
        require(len(world) == len(nodes), "Model contains unreachable nodes")
        return parents, world, hidden


def rest_matrix(node):
    if "matrix" in node:
        require(
            not any(key in node for key in ("translation", "rotation", "scale")),
            "Mixed matrix/TRS node",
        )
        matrix = np.asarray(node["matrix"], dtype=float)
        require(matrix.shape == (16,) and np.isfinite(matrix).all(), "Invalid node matrix")
        return matrix.reshape(4, 4).T
    translation = np.asarray(node.get("translation", [0, 0, 0]), dtype=float)
    scale = np.asarray(node.get("scale", [1, 1, 1]), dtype=float)
    rotation = np.asarray(node.get("rotation", [0, 0, 0, 1]), dtype=float)
    require(
        translation.shape == (3,) and scale.shape == (3,) and rotation.shape == (4,),
        "Invalid node TRS",
    )
    require(
        all(np.isfinite(values).all() for values in (translation, scale, rotation)),
        "Nonfinite node TRS",
    )
    require(np.isclose(np.linalg.norm(rotation), 1, atol=2e-4), "Node quaternion is not normalized")
    x, y, z, w = rotation
    matrix = np.eye(4)
    matrix[:3, :3] = np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    ) @ np.diag(scale)
    matrix[:3, 3] = translation
    return matrix


def geometry(glb):
    meshes = glb.doc.get("meshes", [])
    materials = glb.doc.get("materials", [])
    require(meshes and materials, "Model has no mesh/material data")
    triangles = 0
    for mesh in meshes:
        require(mesh.get("primitives"), "Empty mesh")
        for primitive in mesh["primitives"]:
            require(primitive.get("mode", 4) == 4, "Arena geometry must use triangles")
            attributes = primitive.get("attributes", {})
            require(
                "POSITION" in attributes and "NORMAL" in attributes, "Missing positions/normals"
            )
            positions = glb.values(attributes["POSITION"])
            normals = glb.values(attributes["NORMAL"])
            require(
                positions.shape[1] == 3 and normals.shape == positions.shape,
                "Invalid position/normal shape",
            )
            require(
                np.allclose(np.linalg.norm(normals, axis=1), 1, atol=2e-3),
                "Nonunit surface normals",
            )
            for accessor in attributes.values():
                require(
                    len(glb.values(accessor)) == len(positions), "Vertex attribute counts differ"
                )
            indices_id = primitive.get("indices")
            indices = glb.values(indices_id)
            require(
                glb.doc["accessors"][indices_id]["componentType"] in (5121, 5123, 5125),
                "Indices must be unsigned integers",
            )
            require(indices.shape[1] == 1 and len(indices) % 3 == 0, "Invalid triangle index count")
            require(indices.max() < len(positions), "Triangle index exceeds vertex count")
            material = primitive.get("material")
            require(
                isinstance(material, int) and 0 <= material < len(materials),
                "Invalid material reference",
            )
            triangles += len(indices) // 3
    for material in materials:
        pbr = material.get("pbrMetallicRoughness", {})
        for key in ("metallicFactor", "roughnessFactor"):
            value = pbr.get(key, 1)
            require(np.isfinite(value) and 0 <= value <= 1, f"Invalid PBR {key}")
        emission = np.asarray(material.get("emissiveFactor", [0, 0, 0]))
        require(
            emission.shape == (3,) and np.isfinite(emission).all() and (emission >= 0).all(),
            "Invalid emissive material",
        )
    visible = []
    for index, node in enumerate(glb.doc["nodes"]):
        if "mesh" not in node:
            continue
        mesh = node["mesh"]
        require(isinstance(mesh, int) and 0 <= mesh < len(meshes), "Invalid mesh node reference")
        if glb.hidden[index]:
            continue
        for primitive in meshes[mesh]["primitives"]:
            vertices = glb.values(primitive["attributes"]["POSITION"])
            homogeneous = np.column_stack((vertices, np.ones(len(vertices))))
            visible.append((homogeneous @ glb.world[index].T)[:, :3])
    require(visible, "Model has no visible rest geometry")
    vertices = np.concatenate(visible)
    return triangles, vertices.min(axis=0), vertices.max(axis=0)


def equivalent(first, last, path):
    if path == "rotation":
        return np.allclose(first, last, atol=2e-5) or np.allclose(first, -last, atol=2e-5)
    return np.allclose(first, last, atol=2e-5)


def champion_animations(glb):
    nodes = glb.doc["nodes"]
    names = {}
    for index, node in enumerate(nodes):
        name = node.get("name", "")
        if name in PARENTS:
            require(name not in names, f"Duplicate joint {name}")
            names[name] = index
    require(
        set(names) == set(PARENTS), f"Missing champion joints: {sorted(set(PARENTS) - set(names))}"
    )
    for name, expected_parent in PARENTS.items():
        parent_index = glb.parents.get(names[name])
        actual_parent = nodes[parent_index].get("name") if parent_index is not None else None
        require(actual_parent == expected_parent, f"Wrong parent of {name}: {actual_parent}")
    for name in FX_WINDOWS:
        require(
            np.allclose(nodes[names[name]].get("scale"), [1e-5] * 3, atol=1e-8),
            f"{name} must rest hidden",
        )
    animations = glb.doc.get("animations", [])
    require(len(animations) == len(CLIPS), "Champion must have exactly seven animations")
    require(
        {clip.get("name") for clip in animations} == set(CLIPS),
        "Champion animation names differ from contract",
    )
    tracks_by_clip = {}
    for clip in animations:
        name = clip["name"]
        duration, frames = CLIPS[name]
        tracks = {}
        samplers = clip.get("samplers", [])
        require(clip.get("channels") and samplers, f"{name} is empty")
        for channel in clip["channels"]:
            target = channel.get("target", {})
            node, path = target.get("node"), target.get("path")
            require(
                isinstance(node, int) and 0 <= node < len(nodes), f"{name}: invalid animation node"
            )
            require(
                path in ("translation", "rotation", "scale"), f"{name}: invalid animated property"
            )
            key = (node, path)
            require(key not in tracks, f"{name}: duplicate animation channel")
            sampler_id = channel.get("sampler")
            require(
                isinstance(sampler_id, int) and 0 <= sampler_id < len(samplers),
                f"{name}: invalid sampler",
            )
            sampler = samplers[sampler_id]
            require(
                sampler.get("interpolation", "LINEAR") == "LINEAR",
                f"{name}: expected LINEAR interpolation",
            )
            times = glb.values(sampler.get("input"))
            values = glb.values(sampler.get("output"))
            require(times.shape == (frames, 1), f"{name}: expected {frames} time samples")
            require(np.all(np.diff(times[:, 0]) > 0), f"{name}: animation times must increase")
            require(
                abs(float(times[0, 0])) < 1e-6 and abs(float(times[-1, 0]) - duration) < 1e-5,
                f"{name}: wrong duration",
            )
            require(
                values.shape == (frames, 4 if path == "rotation" else 3),
                f"{name}: output shape differs from time samples",
            )
            if path == "rotation":
                require(
                    np.allclose(np.linalg.norm(values, axis=1), 1, atol=2e-4),
                    f"{name}: nonunit rotation quaternion",
                )
            require(
                equivalent(values[0], values[-1], path),
                f"{name}: {nodes[node].get('name')} does not return to its starting pose",
            )
            tracks[key] = (times[:, 0], values)
        tracks_by_clip[name] = tracks
    idle = tracks_by_clip["Idle"]
    for name, tracks in tracks_by_clip.items():
        for node, path in set(idle) | set(tracks):
            rest = nodes[node].get(
                path,
                [0, 0, 0, 1] if path == "rotation" else [1, 1, 1] if path == "scale" else [0, 0, 0],
            )
            start = tracks[(node, path)][1][0] if (node, path) in tracks else np.asarray(rest)
            baseline = idle[(node, path)][1][0] if (node, path) in idle else np.asarray(rest)
            require(
                equivalent(start, baseline, path),
                f"{name}: first pose differs from Idle for {nodes[node].get('name')}/{path}",
            )
    for fx, (active_clip, start, end, peak) in FX_WINDOWS.items():
        node = names[fx]
        for clip, tracks in tracks_by_clip.items():
            key = (node, "scale")
            if clip != active_clip:
                if key in tracks:
                    require(
                        np.max(np.abs(tracks[key][1])) <= 1.01e-5, f"{fx} is visible during {clip}"
                    )
                continue
            require(key in tracks, f"{active_clip}: missing {fx} visibility track")
            times, scales = tracks[key]
            require(np.all(scales > 0), f"{fx}: scale must stay positive")
            require(
                np.allclose(scales, scales[:, :1], atol=2e-5),
                f"{fx}: expected uniform visibility scale",
            )
            require(
                0.90 * peak <= float(scales.max()) <= 1.01 * peak,
                f"{fx}: incorrect hit visibility peak",
            )
            outside = (times < start - 1e-6) | (times > end + 1e-6)
            require(
                np.max(np.abs(scales[outside])) <= 1.01e-5,
                f"{fx} is visible outside its hit window",
            )
    halo = names["Triumph_Halo"]
    for clip in ("Charge_Up", "Special_Attack", "Special_Action", "Talon_Rend"):
        scales = tracks_by_clip[clip][(halo, "scale")][1]
        require(np.max(scales) >= 1.24, f"{clip}: triumph halo never fully opens")

    judgment = names["Colosseum_Judgment_FX"]
    root = names["Champion_Root"]
    ultimate = tracks_by_clip["Talon_Rend"]
    scales = ultimate[(judgment, "scale")][1][:, 1]
    offsets = ultimate[(root, "translation")][1][:, 1]
    offsets = offsets + ultimate[(judgment, "translation")][1][:, 1]
    ring_center = offsets + scales * (0.04 - 1.55)
    visible_ring = scales > 1.25
    require(
        np.all(ring_center[visible_ring] >= 0.015),
        "Talon_Rend: the brightest frames bury the judgment ring below the floor",
    )
    return {
        name: {"seconds": seconds, "frames": frames, "tracks": len(tracks_by_clip[name])}
        for name, (seconds, frames) in CLIPS.items()
    }


def validate_model(root, specification):
    slug, enemy_id, tier, target_height, max_width, max_depth = specification
    assets = root / "万象酒馆-Demo/assets"
    sources = root / "万象异境-体素模型"
    glb = Glb(assets / f"{slug}.glb")
    source_folder = "霸主非体素模型" if tier == "overlord" else "首都内部竞技场"
    for source in (sources / f"{slug}.glb", sources / source_folder / f"{slug}.glb"):
        require(source.read_bytes() == glb.raw, f"Source GLB differs: {source.relative_to(root)}")
    portrait = (assets / "portraits" / f"{slug}.svg").read_text(encoding="utf-8")
    require("<svg" in portrait and "</svg>" in portrait, "Missing or malformed SVG portrait")
    extras = glb.doc.get("extras", {})
    require(
        extras.get("enemyId") == enemy_id and extras.get("tier") == tier,
        "Model identity/tier metadata differs",
    )
    require(extras.get("displayPlinth") is False, "displayPlinth must be false")
    triangles, minimum, maximum = geometry(glb)
    require(
        extras.get("triangles") == triangles, "Triangle metadata differs from primitive indices"
    )
    size = maximum - minimum
    require(
        abs(float(minimum[1])) <= 2e-4, f"Visible geometry does not stand on y=0: {minimum[1]:.6f}"
    )
    require(
        np.allclose((minimum + maximum)[[0, 2]], 0, atol=3e-4),
        "Visible geometry is not centered on X/Z",
    )
    require(
        float(size[0]) <= max_width + 0.025 and float(size[2]) <= max_depth + 0.025,
        f"Footprint exceeds {max_width} x {max_depth}: {size[[0, 2]].tolist()}",
    )
    animations = {}
    if tier == "overlord":
        require(
            2.55 <= float(size[1]) <= 2.85, f"Champion height outside 2.55..2.85: {size[1]:.4f}"
        )
        require(
            16000 <= triangles <= 24000,
            f"Champion triangle budget outside 16000..24000: {triangles}",
        )
        require(
            extras.get("nonVoxel") is True and extras.get("standOnCard") is True,
            "Champion must be sculpted and stand on card",
        )
        animations = champion_animations(glb)
    else:
        require(
            abs(float(size[1]) - target_height) <= 0.055,
            f"Height differs from {target_height}: {size[1]:.4f}",
        )
        require(
            extras.get("nonVoxel") is False and extras.get("voxelBoxes", 0) > 0,
            "Ordinary units must retain layered block geometry",
        )
        require(
            (sources / source_folder / f"{slug}.json").is_file(),
            "Missing retained block JSON source",
        )
    return {
        "slug": slug,
        "passed": True,
        "triangles": triangles,
        "meshes": len(glb.doc["meshes"]),
        "nodes": len(glb.doc["nodes"]),
        "bounds": {"min": minimum.round(6).tolist(), "max": maximum.round(6).tolist()},
        "size": size.round(6).tolist(),
        "animations": animations,
        "bytes": len(glb.raw),
    }


def validate_all(root=ROOT):
    results = []
    for specification in MODELS:
        try:
            results.append(validate_model(Path(root), specification))
        except (OSError, ValueError, KeyError, IndexError, TypeError, struct.error) as error:
            results.append({"slug": specification[0], "passed": False, "error": str(error)})
    return {"passed": all(result["passed"] for result in results), "models": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Print the complete report as JSON")
    args = parser.parse_args()
    report = validate_all()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for result in report["models"]:
            if result["passed"]:
                size = " x ".join(f"{value:.3f}" for value in result["size"])
                print(f"PASS {result['slug']}: {result['triangles']:,} triangles; X/Y/Z={size}")
            else:
                print(f"FAIL {result['slug']}: {result['error']}")
        print(
            f"Arena models: {sum(item['passed'] for item in report['models'])}/{len(MODELS)} passed"
        )
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
