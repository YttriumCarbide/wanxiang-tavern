# 其他四处场景：原视野与简洁画风的分块高清

内置 image_gen，共16次生成。广场（city-center）、商业街（market）、城墙守备区（rampart）、城外（outskirts）各四块。第一输入为各自原单图的重叠裁切，第二输入为 street-hd-v2/center.png，仅提供用户确认的干净画风，不采用它的街宽和相机。

原图2172×724（城墙2171×724），每块裁724×724，x=round((原宽−724)×序号/3)。各块生成原生1254×1254，使用原裁切的固定位置拼接：广场、商业街、城外3762×1254，城墙3760×1254。原生PNG不缩小、不转有损格式；人物、热点及镜头范围均保留。

保留钟楼、喷泉、灯具铺、药铺、城门、哨塔、车辙和各条路，删减满墙藤蔓、密集碎花、冗余装饰柱与高频材质。背景不画人物。城外哨塔使用layout.json的局部保护接线，保留完整塔顶，天空加宽混合，其他地方保留窄接线。

16次使用同一条完整实际提示词：

```text
Edit target: IMAGE 1 is an exact crop from the approved game street. Preserve its framing and spatial composition exactly. IMAGE 2 is ONLY the desired clean rendering style; DO NOT copy its camera, buildings, road width, or object layout.
TASK: Repaint IMAGE 1 in IMAGE 2's polished, clean anime/JRPG background style, with much less decorative clutter and high-frequency visual noise. This is a substantial ART-DIRECTION CLEANUP, not sharpening or faithfully retaining all the old texture.
GEOMETRY LOCK: Identical eye-level camera height, crop bounds, perspective, vanishing point, road width, main building silhouettes, eaves, door/window rectangle corners, doorstep endpoints, arch shape and position. Do not zoom in, enlarge the architecture, narrow the street, move the horizon, tilt the camera or add a new view. All boundaries must land at the same normalized coordinates as IMAGE 1. Keep the reference's spatial proportions.
SIMPLIFY AGGRESSIVELY: Remove at least 85% of all climbing ivy, scattered leaf sprays and tiny flowers from walls, doorframes, eaves and arch. Replace these areas with smooth clean cream plaster or simple broad masonry. Retain just a few restrained planter shapes, no wall-covering foliage. Remove redundant decorative thin pillars, small carved frames and dense upright trim; retain essential structural beams, the original eave outline, doors and windows. Walls should be largely open, calm painted planes, with a few broad architectural divisions rather than hundreds of visible brick joints. Keep arch wedge stones and essential corner stones but use simple unblemished faces. Road: same contour and perspective, larger readable paving groups, smooth stone surfaces, minimal joints, NO tiny fractures, moss or gravel. Shadows: a few broad soft coherent shapes, NO lace-like leaf speckles, dappled dots, crawling scratch marks or granular mottling.
STYLE: Match IMAGE 2's clean detailed hand-painted anime background, elegant edges, graceful controlled painterly shading, quiet warm plaster, natural wood, restrained terracotta and muted teal accents. Detailed recognizable landmarks, crisp door hardware, tidy window bottles, beautiful large shapes and atmospheric depth. Detail belongs in intentional objects, not noise on every surface. No thick black outlines, no grain, no stippling, no photoreal grit, no HDR sharpness, no oversaturated yellow. Smooth sky with a few large clouds.
Preserve the same square crop and output highest available NATIVE resolution. No people, new landmarks, text, interface, watermark, frame.
Additional consistency rules for this scene: Preserve ALL important functional landmarks and their exact positions, normal structural arcade supports, towers, arches, stairs, signs and doorways. Remove only redundant surface ornament, not the structural supports holding an arch. Keep the existing open foreground, road boundaries, human eye-level viewpoint, background depth and all route directions. Do not make this a different town. Preserve distinctive necessary festival props when present, but clear tiny scattered decoration. If countryside: reduce scattered grass blades, tiny flowers, gravel, leaf-tip highlights and speckled shadows into calm clean grouped shapes while retaining tree masses, landmarks, fences and the existing road outline. If fortress: keep convincing large stone blocks and battlements, but remove scratchy mottling and unnecessary tiny joints. Preserve the same direction of lighting. No additional object or person.
```

生成文件来源、原生尺寸和哈希逐块记录在各场景manifest.json，输入裁切与最终位置在layout.json。生产拼接命令：

```powershell
powershell.exe -NoProfile -File tools/stitch-scene.ps1 -Directory assets/exploration/free-scenes-hd-v2/city-center
powershell.exe -NoProfile -File tools/stitch-scene.ps1 -Directory assets/exploration/free-scenes-hd-v2/market
powershell.exe -NoProfile -File tools/stitch-scene.ps1 -Directory assets/exploration/free-scenes-hd-v2/rampart
powershell.exe -NoProfile -File tools/stitch-scene.ps1 -Directory assets/exploration/free-scenes-hd-v2/outskirts
```
