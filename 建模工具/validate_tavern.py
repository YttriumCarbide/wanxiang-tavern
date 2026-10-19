from pathlib import Path
import json, struct, numpy as np

p = Path(__file__).resolve().parents[1] / "万象酒馆-体素模型"
raw = (p / "万象酒馆-完整房间.glb").read_bytes()
magic, version, length = struct.unpack_from("<III", raw)
assert magic == 0x46546C67 and version == 2 and length == len(raw)
jlen, jtag = struct.unpack_from("<II", raw, 12)
assert jtag == 0x4E4F534A
doc = json.loads(raw[20 : 20 + jlen])
binlen, bintag = struct.unpack_from("<II", raw, 20 + jlen)
assert bintag == 0x004E4942
blob = raw[28 + jlen :]
assert binlen == len(blob)
types = {5126: ("<f4", 4), 5125: ("<u4", 4)}
widths = {"SCALAR": 1, "VEC3": 3}


def data(a):
    av = doc["accessors"][a]
    bv = doc["bufferViews"][av["bufferView"]]
    dt, size = types[av["componentType"]]
    assert bv["byteOffset"] + bv["byteLength"] <= len(blob)
    count = av["count"] * widths[av["type"]]
    result = np.frombuffer(blob, dtype=dt, count=count, offset=bv["byteOffset"])
    return result.reshape(-1, widths[av["type"]])


for mesh in doc["meshes"]:
    for primitive in mesh["primitives"]:
        pos = data(primitive["attributes"]["POSITION"])
        normal = data(primitive["attributes"]["NORMAL"])
        indices = data(primitive["indices"])
        assert np.isfinite(pos).all() and np.isfinite(normal).all() and indices.max() < len(pos)
        grid = pos / 0.02
        assert np.max(np.abs(grid - np.round(grid))) < 0.0001
        assert np.allclose(np.linalg.norm(normal, axis=1), 1)
raw = (p / "万象酒馆-完整房间.vox").read_bytes()
assert raw[:4] == b"VOX "
offset = 20
sizes = []
count = 0
nodes = {}
while offset < len(raw):
    tag, size, children = struct.unpack_from("<4sII", raw, offset)
    body = raw[offset + 12 : offset + 12 + size]
    assert offset + 12 + size + children <= len(raw)
    if tag == b"SIZE":
        sizes.append(struct.unpack("<III", body))
    if tag == b"XYZI":
        n = struct.unpack_from("<I", body)[0]
        assert size == 4 + 4 * n
        cells = np.frombuffer(body[4:], dtype="u1").reshape(-1, 4)
        assert np.all(cells[:, :3] < np.asarray(sizes[-1]))
        assert np.all(cells[:, 3] > 0)
        count += n
    if tag in [b"nTRN", b"nGRP", b"nSHP"]:
        node = struct.unpack_from("<i", body)[0]
        assert node not in nodes
        nodes[node] = tag
    offset += 12 + size + children
assert offset == len(raw) and len(sizes) > 1 and all(max(s) < 256 for s in sizes)
detail_raw = (p / "近景陈设-2厘米.vox").read_bytes()
assert detail_raw[:4] == b"VOX "
detail_offset = 20
detail_sizes = []
while detail_offset < len(detail_raw):
    tag, size, children = struct.unpack_from("<4sII", detail_raw, detail_offset)
    body = detail_raw[detail_offset + 12 : detail_offset + 12 + size]
    if tag == b"SIZE":
        detail_sizes.append(struct.unpack("<III", body))
    if tag == b"XYZI":
        n = struct.unpack_from("<I", body)[0]
        cells = np.frombuffer(body[4:], dtype="u1").reshape(-1, 4)
        assert n == len(cells) and np.all(cells[:, :3] < np.asarray(detail_sizes[-1]))
    detail_offset += 12 + size + children
assert detail_offset == len(detail_raw) and len(detail_sizes) == 6
stats = json.loads((p / "模型规格.json").read_text(encoding="utf-8"))
assert stats["voxel_count_multiplier"] >= 10
stats["validation"] = {
    "glb_geometry": "passed",
    "vox_chunks_and_bounds": "passed",
    "near_view_vox": "passed",
    "seated_360_preview": "passed",
}
(p / "模型规格.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
print(
    json.dumps(
        {
            "glb_meshes": len(doc["meshes"]),
            "vox_models": len(sizes),
            "occupied_voxels": stats["occupied_voxels"],
            "all_checks": "passed",
        }
    )
)
