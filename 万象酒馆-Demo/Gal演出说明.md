# Gal 演出研发

研发分支为 `develop`，正式网页仍只发布 `main`／`master`。Pages 作业增加分支判断，即使从研发分支手动触发也不能覆盖正式站点。正式发布须由用户明确要求后合并。

设置 → 开发者模式 → Gal式剧情演出。开关仅存于本机开发设置，不改写正文或战斗存档。关闭后恢复原来的教程窗口与正文阅读。已经生成的 Gal 正文仍可按普通文章阅读，旧小说正文可作为旁白在 Gal 舞台分页，不猜测引号里的说话者。

脚本仍一次生成全部既定阶段，原 story 字符串、篇幅目标和数据附录不变。仅在 Gal 请求中追加轻量标记要求：`【旁白】`、`【对白:角色ID】`，可选 `【登场:角色ID】`、`【退场:角色ID】`、`【清场】`。长旁白由本地按标点分页。生成不会因为演出新增每句 API 请求。角色生成、地图、造物和总结接口不受影响。

角色第一次说话时进入舞台，最多两名；正在说话的角色高亮。旁白使用独立标识并降低在场角色亮度，不把旁白配给伊蒂丝，也不因一段旁白就清场。明确退场、清场、本段结束或取消时释放舞台。玩家默认第一视角，只显示主角姓名和“你的视角”；没有 Gal 立绘的角色使用姓名、可用头像和正文，不放大有背景的卡面，也不借用其他人物立绘。未知 NPC 保留姓名，无头像也能阅读。

布局参考《CLANNAD》与《苍之彼方的四重奏》的实机画面：人物、背景和底部阅读区分层，姓名与正文保持明确层级。结合本项目的半身素材，将人物容器从接近全屏高缩至屏幕高的64%，宽度最多28%（手机29%），双人分居约三成和七成处；上方与两侧保留背景，正文收在有横向留白的底部半透明区域。参考截图只用于观察布局，不作为游戏资产发布。

三种接口共享正文标记和共同写作要求，另按任务追加独立文风指引：剧本通过具体行动、交涉与结果推进完整场景；酒馆聊天突出个人口吻、生活细节和潜台词；局内闲聊聚焦眼前处境，避免凭空推进剧情。共同约束减少说明腔、轮流附和、抽象抒情与重复信息，同时保留世界书设定、预设偏好、原有篇幅及全部数据协议。文风是创作指引，不作为返回校验的拒收条件。

教程开场、引导、潘多拉入队、纹章教学和升级对白通过同一播放器展现。Gal 舞台是顶层 section/popover，不创建新的模态对话框；鼠标、触屏、空格和 Enter 可展开/继续，自动和回看均在舞台内。教程必须读完当前序列才调用原有完成回调，取消不会伪造教学完成。副本解锁、历史记录和战斗规则继续由现有流程控制。

## 立绘资源与生成提示

使用内置 imagegen 工具编辑用户提供的三张参考图，保留身份和服装，输出 RGBA。资源保存于 `assets/gal/`，没有替换原来的角色卡面。实际使用提示如下，共同要求和对应人物要求合并为每张图的一次请求。

共同要求：Use case: identity-preserve / background-extraction. Create a production visual-novel dialogue sprite from the attached character reference. Preserve EXACT character identity, face, eye color, hairstyle, all signature ornaments, clothing design and delicate high-quality anime painted rendering. One character only, standing upright, relaxed natural three-quarter/front conversation pose. Half-body composition from whole head including every hair ornament down to hips, both shoulders and elbows inside canvas, hands anatomically correct, breathing room above head and at sides. Genuine transparent RGBA background, clean fine hair alpha edges, no scenery, no particles, no glow cloud, no text, no border, no pedestal. Do not include a fake checkerboard. Preserve outfit coverage and proportions. The lower edge will be placed behind a dialogue reading area.

- 潘多拉 `pandora-half.png`：Pandora: lavender long hair, ornate black and white lace bonnet, clock/star accessories, gentle violet starry eyes, black/white lace dress, holding her small pale patchwork bear naturally against her waist. Keep her gentle reserved expression. Show her bear clearly; remove the large background astronomical rings.
- 月汐 `yuexi-half.png`：Changjing Yuexi: silver lavender long hair, crescent moon hair ornament, soft violet eyes, ornate white and indigo dress with gold celestial embroidery. Preserve exact face and costume; natural friendly attentive expression. Her sheathed sword may remain partially beside her hip but no enormous vertical weapon obscuring face.
- 伊蒂丝 `edith-half.png`：Edith: long sky-blue hair covering one eye, visible golden eye, two small gold star hair pins, white scholarly robe with deep navy gold-embroidered scarf, holding dark navy gold-bound book at waist, black ornate sword strapped behind shoulder. Preserve exact calm face and costume.
