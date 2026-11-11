# 酒馆门前：原视野与简洁画风

使用内置 image_gen。第一参考图是原2172×724连续图的四块724×724重叠裁切，锁定视野与几何；第二参考是 `../street-hd-v2/center.png`，只取其干净的绘制风格，不取其构图。

四块原生输出均为1254×1254，固定原裁切位置拼为3762×1254。减少爬山虎、装饰柱和密集砖缝、碎阴影，清晰细节集中在门窗、招牌、药铺等物件。镜头、街宽和人物坐标沿用原图。公告板所在重叠带使用layout.json内的局部接线约束，避免切成两块。

以下是四次相同的实际完整提示词：

```text
Edit target: IMAGE 1 is an exact crop from the approved game street. Preserve its framing and spatial composition exactly. IMAGE 2 is ONLY the desired clean rendering style; DO NOT copy its camera, buildings, road width, or object layout.
TASK: Repaint IMAGE 1 in IMAGE 2's polished, clean anime/JRPG background style, with much less decorative clutter and high-frequency visual noise. This is a substantial ART-DIRECTION CLEANUP, not sharpening or faithfully retaining all the old texture.
GEOMETRY LOCK: Identical eye-level camera height, crop bounds, perspective, vanishing point, road width, main building silhouettes, eaves, door/window rectangle corners, doorstep endpoints, arch shape and position. Do not zoom in, enlarge the architecture, narrow the street, move the horizon, tilt the camera or add a new view. All boundaries must land at the same normalized coordinates as IMAGE 1. Keep the reference's spatial proportions.
SIMPLIFY AGGRESSIVELY: Remove at least 85% of all climbing ivy, scattered leaf sprays and tiny flowers from walls, doorframes, eaves and arch. Replace these areas with smooth clean cream plaster or simple broad masonry. Retain just a few restrained planter shapes, no wall-covering foliage. Remove redundant decorative thin pillars, small carved frames and dense upright trim; retain essential structural beams, the original eave outline, doors and windows. Walls should be largely open, calm painted planes, with a few broad architectural divisions rather than hundreds of visible brick joints. Keep arch wedge stones and essential corner stones but use simple unblemished faces. Road: same contour and perspective, larger readable paving groups, smooth stone surfaces, minimal joints, NO tiny fractures, moss or gravel. Shadows: a few broad soft coherent shapes, NO lace-like leaf speckles, dappled dots, crawling scratch marks or granular mottling.
STYLE: Match IMAGE 2's clean detailed hand-painted anime background, elegant edges, graceful controlled painterly shading, quiet warm plaster, natural wood, restrained terracotta and muted teal accents. Detailed recognizable landmarks, crisp door hardware, tidy window bottles, beautiful large shapes and atmospheric depth. Detail belongs in intentional objects, not noise on every surface. No thick black outlines, no grain, no stippling, no photoreal grit, no HDR sharpness, no oversaturated yellow. Smooth sky with a few large clouds.
Preserve the same square crop and output highest available NATIVE resolution. No people, new landmarks, text, interface, watermark, frame.
```

原生生成来源、尺寸、SHA256见同目录manifest.json；固定裁切与拼接坐标见layout.json。生产命令：`powershell.exe -NoProfile -File tools/stitch-scene.ps1 -Directory assets/exploration/street-hd-v4`。保留PNG原生像素，不压缩为有损格式、不放大生成图。
