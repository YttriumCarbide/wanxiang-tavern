# 早期霸主图鉴模型

`models/` 保存阿佩普的羔羊、母树之魔眼和阿瑞斯的早期 GLB。测试图鉴的辉光亚龙与游戏资产逐字节一致，原件可从 `万象酒馆-Demo/assets/radiant-wyvern.glb` 取得。

`models.ts` 保存四个模型的几何与动画，`textures/` 保存制作纹理时使用的原图。正式游戏使用 `万象酒馆-Demo/assets/` 自己的模型。

在仓库根目录运行 `npm ci` 安装建模脚本的 Three.js 依赖。进入本目录运行 `node --experimental-strip-types export-models.ts` 导出测试模型，再用建模工具的 Python 环境运行 `texture-models.py` 写入纹理。产物在本目录的 `.runtime/models/`，归档原件和游戏资产可以继续独立维护。
