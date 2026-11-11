# 酒馆门前：保留原构图的分块高清

基准：`../street-illustrated/connected-v1.png`，2172×724。只提高清晰度、清理碎纹理；不重新设计街宽、成人目平视角、门窗大小、消失点或站位。

按原图 x=0、482、966、1448 裁出四块724×724正方形。每块使用下列同一条实际提示词，分别以对应 reference-N.png 为输入；生成输出均为1254×1254原生PNG。根据裁切位置固定拼接为3762×1254，比例与原图同为3:1；不自动重新配准收窄道路，不缩放生成图。

完整实际提示词：

```text
Edit this EXACT square crop of an existing approved game background. This is a faithful detail restoration and texture clean-up, NOT a new illustration or a new composition.
LOCK ALL GEOMETRY: same crop boundaries, camera height, eye-level perspective, vanishing point, road width, door height/width, every object location and silhouette. Do not zoom, tilt, move the camera, enlarge any architecture, narrow the street, add or remove landmarks, or extend the frame. The door and window rectangle edges must stay at exactly the same normalized pixel coordinates. The large planter, eave edge, doorstep corners and roof line remain exactly in place. Maintain the reference's spatial proportions even if you would design them differently.
Improve only rendering quality: clean stable fine outlines, smoother plaster and wood shading, coherent elegant painted planes, fewer grainy specks and tiny scratch marks. Reduce high-frequency leaf-tip highlights and scattered mottled texture within the existing plant silhouettes; preserve their overall silhouettes. Keep the original paving stone arrangement and junctions, but simplify unnecessary tiny fissures and granular noise inside stones. Same broad shadow shapes and original light direction. Preserve the original palette without adding saturation or extra HDR.
Output the SAME square image faithfully reconstructed at the highest available NATIVE resolution, crisp and clean, not a blur filter. No re-framing, no close-up, no perspective change. No people, text, UI, labels, border, watermark.
```

生产命令：`powershell.exe -NoProfile -File tools/stitch-scene.ps1 -Directory assets/exploration/street-hd-v3`。

`layout.json` 保存原始裁切与固定拼接位置，`manifest.json` 保存原生输出的尺寸、来源和哈希。前两轮独立重构图改变了镜头，已停用并保留为画稿。人物使用原单图的脚底和身高坐标；取景高度恢复为0.9，保持小幅上下拖动。
