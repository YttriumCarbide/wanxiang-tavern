# 食材与菜肴图集

四张原始透明 PNG。每张 4×4，按从左到右、从上到下索引，运行时直接采样原图。基础食材使用 ingredients-a 和 ingredients-b，基础菜肴使用 dishes，新增掉落食材和相应菜肴使用 forage。原始尺寸与哈希见 manifest.json。

共用生成提示词：

Use case: stylized-concept. Asset: western fantasy JRPG tavern inventory sprite atlas. EXACTLY 16 different food item icons in a perfectly regular 4 columns by 4 rows square grid, equal cells, each icon isolated and centered inside its own cell with generous transparent padding, no overlap. True transparent RGBA background, no drawn grid, no text, no labels, no card frames, no ground or drop shadow. Polished hand painted fantasy RPG item icons, crisp elegant dark outlines, jewel like appetizing colors, detailed cel shading and softly painted highlights, readable at 64 pixels, three-quarter view. Square canvas preferably 2048x2048. Every item occupies about 65% of its cell.

掉落食材和菜肴生成提示词：

Use case: stylized-concept. Asset: transparent square inventory sprite atlas for a western fantasy JRPG tavern game, exactly 4 columns × 4 rows, equal size cells, evenly spaced. In every cell one isolated small object, about 65% cell width, large fully transparent gutter, never overlap cells. Authentic hand-painted RPG inventory icon style, crisp elegant dark outline, soft detailed cel shading, jewel-like food colors, 3/4 overhead view, legible at 64px. Rows from left to right exactly: row 1 pale blue frost oyster mushrooms, open glass jar of jade-green floral honey, small bright-green fir shoots, bundle of mint leaves. Row 2 ochre aromatic root with two side shoots, cluster of ruby berries, two raw game-bird cuts, curling amber edible algae. Row 3 thick creamy pale-blue mushroom chowder in a rustic bowl, golden mint honey tea in a ceramic cup, roast wild bird with bright herb sprigs on a plate, orange root and amber seaweed stew in a small dark bowl. Row 4 ruby berry tartlet on a plate, golden honey-glazed root slices on a board, clear evergreen broth in a ceramic bowl, amber seaweed salad in a bowl. No text, grid lines, lettering, frames, props outside icons, ground shadows, backdrop, watermark or UI. True transparent RGBA.

食材A追加提示词：

Read left to right top to bottom: row1 wheat sheaf, bag of flour, potatoes, carrots; row2 onions, red tomatoes, cabbage, brown mushrooms; row3 raw beef steak, raw chicken drumstick, raw pork cut, whole silver river fish; row4 brown eggs, yellow butter, white cheese wedge, ceramic milk jug.

食材B追加提示词：

Read left to right top to bottom: row1 red apples, purple grapes, small honey jar, handful walnuts; row2 green herb bundle, garlic bulb, little salt pouch, red chili peppers; row3 brown beer bottle with simple cork and no text, dark wine bottle with cork no label, round bread loaf, mixed red berries; row4 pale blue fantasy moonflower, glowing golden fantasy sunfruit, iridescent fantasy silverfin fish, purple stargrain in a tiny open pouch. Magical ingredients subtle restrained glow only inside own cell.

菜肴追加提示词：

Read left to right top to bottom: row1 rustic beef potato stew in earthen bowl, roast herb chicken on plate, pan fried fish with vegetables, creamy mushroom soup in bowl; row2 sliced bread and cheese on board, tomato egg skillet, cabbage pork rolls on plate, roasted root vegetables on plate; row3 honey apple pie slice, berry crepe folded on plate, walnut honey bread on plate, grape cheese salad in bowl; row4 spicy beef skillet, milk rice pudding in bowl, magical moonflower fish soup in bowl, golden sunfruit stargrain tart on plate. Plates and bowls must remain fully within their own square cell.
