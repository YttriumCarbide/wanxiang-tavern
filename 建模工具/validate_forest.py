from pathlib import Path
import struct, json, numpy as np

out = Path(__file__).resolve().parents[1] / "万象古林-体素模型"
raw = (out / "月痕古林-体素战场.glb").read_bytes()
magic, version, length = struct.unpack_from("<III", raw)
assert magic == 0x46546C67 and version == 2 and length == len(raw)
n = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20 : 20 + n])
blob = raw[28 + n :]
assert doc["buffers"][0]["byteLength"] <= len(blob)


def values(i):
    a = doc["accessors"][i]
    v = doc["bufferViews"][a["bufferView"]]
    assert v.get("byteOffset", 0) + v["byteLength"] <= len(blob)
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
    dtype = {5126: "<f4", 5125: "<u4"}[a["componentType"]]
    return np.frombuffer(
        blob,
        dtype=dtype,
        count=a["count"] * width,
        offset=v.get("byteOffset", 0) + a.get("byteOffset", 0),
    ).reshape(-1, width)


triangles = 0
for m in doc["meshes"]:
    for p in m["primitives"]:
        positions = values(p["attributes"]["POSITION"])
        normal = values(p["attributes"]["NORMAL"])
        indices = values(p["indices"])
        assert np.isfinite(positions).all() and np.allclose(np.linalg.norm(normal, axis=1), 1)
        assert indices.max() < len(positions) and p["material"] < len(doc["materials"])
        triangles += len(indices) // 3
assert (
    len(
        [
            n
            for n in doc["nodes"]
            if n.get("name", "").startswith("Placeholder_") and not n["name"].endswith("_Artwork")
        ]
    )
    == 6
)
assert doc["cameras"][0]["type"] == "orthographic"
vox = (out / "月痕古林-体素战场.vox").read_bytes()
assert vox[:4] == b"VOX "
offset = 20
count = 0
models = 0
size = None
while offset < len(vox):
    tag, n, children = struct.unpack_from("<4sII", vox, offset)
    body = vox[offset + 12 : offset + 12 + n]
    assert offset + 12 + n + children <= len(vox)
    if tag == b"SIZE":
        size = struct.unpack("<III", body)
        assert max(size) < 256
        models += 1
    if tag == b"XYZI":
        amount = struct.unpack_from("<I", body)[0]
        a = np.frombuffer(body[4:], dtype="u1").reshape(-1, 4)
        assert len(a) == amount and (a[:, :3] < np.asarray(size)).all()
        count += amount
    offset += 12 + n + children
assert offset == len(vox)
stats = json.loads((out / "模型规格.json").read_text(encoding="utf-8"))
assert stats["体素数"] == count
stats.update({"三角形": triangles, "几何与VOX验证": "通过"})
(out / "模型规格.json").write_text(
    json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(
    json.dumps(
        {
            "meshes": len(doc["meshes"]),
            "triangles": triangles,
            "voxels": count,
            "vox_models": models,
            "result": "passed",
        }
    )
)
