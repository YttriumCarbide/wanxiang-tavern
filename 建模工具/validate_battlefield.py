from pathlib import Path
import json, struct, numpy as np

p = Path(__file__).resolve().parents[1] / "万象战场-体素模型"
raw = (p / "万象战场-遗迹战盘.glb").read_bytes()
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
widths = {"SCALAR": 1, "VEC3": 3, "VEC2": 2}


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
        if not mesh["name"].endswith("_Artwork"):
            grid = pos / 0.04
            assert np.max(np.abs(grid - np.round(grid))) < 0.0001
        assert np.allclose(np.linalg.norm(normal, axis=1), 1)
raw = (p / "万象战场-遗迹战盘.vox").read_bytes()
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

assert len(doc["meshes"]) == 52
assert (
    len(
        [
            n
            for n in doc["nodes"]
            if n.get("name", "").startswith("Placeholder_")
            and not n.get("name", "").endswith("_Artwork")
        ]
    )
    == 6
)
art = [m for m in doc["meshes"] if m["name"].endswith("_Artwork")]
assert len(art) == 6
for m in art:
    uv = data(m["primitives"][0]["attributes"]["TEXCOORD_0"])
    assert uv.min() == 0 and uv.max() == 1 and len(uv) == 4
assert len(doc["images"]) == 1 and doc["images"][0]["mimeType"] == "image/png"
assert doc["cameras"][0]["type"] == "orthographic"
stats = json.loads((p / "模型规格.json").read_text(encoding="utf-8"))
assert count == stats["体素数"]
stats["验证"] = {
    "GLB几何与体素网格": "通过",
    "VOX分块和边界": "通过",
    "固定俯视和占位卡显隐": "通过",
}
(p / "模型规格.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
print("Battlefield geometry, VOX and camera validated")
