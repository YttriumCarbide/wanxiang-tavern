# 保留的建模工具

这些脚本原先混在旧版目录，已迁至此处。依赖Python和NumPy，根路径由脚本位置推导。

- `build_tavern.py`：酒馆体素源资产及可复用导出工具。
- `build_battlefield.py`：遗迹战场源模型，复用酒馆导出函数。
- `build_forest.py`：古林源模型，复用酒馆导出函数和遗迹卡牌。
- `build_realms.py`：霜晶矿窟、余烬铸坊、潮汐星殿、三只小怪与星潮Boss。
- `build_humanoid_enemies.py`：复用异境模型导出器，将人形敌人的共享体素数据导出为六套真实GLB。统一重建入口为在Demo目录执行 `node tools/build-humanoid-enemies.mjs`，此命令同时生成卡面、保留JSON源并调用该Python导出器，无需重建地图。
- `build_theme_arenas.py`：在原有五张战场后追加八张主题战场及对应微缩预览，复用`build_realms.py`导出器。
- `build_graystone_quarry.py`：灰岩旧采石场独立战斗盘与副本之门微缩预览双模型（非对称两翼与多模块组合远景）。
- `build_city_market.py`：灯影商街（城市街道商区）独立战斗盘与微缩预览双模型（非对称东西两翼商街与多模块组合外围建筑群）。
- `build_black_market.py`：暗巷黑市独立战斗盘与微缩预览双模型（非对称地下黑市拱廊、运河暗栈与拍卖台组合外围群）。
- `build_demo_floor.py`：从保留的两套源GLB生成Demo地板、装饰和固定基座。源GLB与此前的两个GLB备份经SHA-256比对一致，因此不再保留重复备份。
- `build_alchemical_puppet.mjs`：生成炼金傀偶的几何与动画。先在仓库根目录运行 `npm ci` 安装固定版本的 Three.js，再运行该脚本。纹理由 `texture_alchemical_puppet.py` 处理。
- `validate_*.py`：对应源资产的几何验证。

只有修改模型时才运行生成和几何验证。生成脚本会覆盖对应输出，按酒馆、遗迹、古林、异境、主题战场、Demo地板的顺序使用；UI和普通玩法修改不执行这些脚本。

开发环境使用Python 3.12与本目录 `.venv`，依赖精确冻结在 `requirements-dev.txt`；安装命令为 `.venv\Scripts\python -m pip install -r requirements-dev.txt`。格式由Black统一，统一测试的 `--scope models` 不执行体素重建。
