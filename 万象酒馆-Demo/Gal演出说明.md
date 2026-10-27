# Gal 演出研发

研发分支为 `develop`，正式网页仍只发布 `main`／`master`。Pages 作业增加分支判断，即使从研发分支手动触发也不能覆盖正式站点。正式发布须由用户明确要求后合并。

设置 → 开发者模式 → Gal式剧情演出。开关仅存于本机开发设置，不改写正文或战斗存档。关闭后恢复原来的教程窗口与正文阅读。已经生成的 Gal 正文仍可按普通文章阅读，旧小说正文可作为旁白在 Gal 舞台分页，不猜测引号里的说话者。

脚本仍一次生成全部既定阶段，原 story 字符串、篇幅目标和数据附录不变。仅在 Gal 请求中追加轻量标记要求：`【旁白】`、`【对白:角色ID】`，可选 `【登场:角色ID】`、`【退场:角色ID】`、`【清场】`。长旁白由本地按标点分页。生成不会因为演出新增每句 API 请求。角色生成、地图、造物和总结接口不受影响。

角色第一次说话时进入舞台，最多两名；正在说话的角色高亮。旁白使用独立标识并降低在场角色亮度，不把旁白配给伊蒂丝，也不因一段旁白就清场。明确退场、清场、本段结束或取消时释放舞台。玩家默认第一视角，只显示主角姓名和“你的视角”；没有 Gal 立绘的角色使用姓名、可用头像和正文，不放大有背景的卡面，也不借用其他人物立绘。未知 NPC 保留姓名，无头像也能阅读。

立绘按《ATRI》参考图的站立构图处理：单人居中，双人位于28%与72%处；高度为画面84%，直接落到屏幕底边，由半透明对话层盖住下半身，不再缩进对话框上方的小区域。手机横屏沿用同一比例。打开选人侧栏时立绘向剩余画面让位。交流不再沿用旧模态弹窗及其局部模糊背景，直接在完整酒馆场景上演出。正文仅在显示时清理页首、页尾与连续空白行，原文与数据附录保持不变。

三种接口共享正文标记和共同写作要求，以人物的来回对话为主体：剧本对白字数目标65%～80%，酒馆聊天80%～90%，局内闲聊85%左右。发现、推理、交涉和关系变化尽量通过人物互动表现；旁白主要承接必要动作与场景变化，避免连续几个旁白块。保留世界书设定、预设偏好、原有篇幅及全部数据协议；这些比例是创作指引，不作为返回校验的拒收条件。

交流使用全屏舞台：左侧同行者抽屉、下方输入抽屉、侧滑记录页，均复用原选人、输入、删除、重试和记忆功能。三个抽屉互斥，打开时隐藏阅读框，避免双层叠框；选人使用58px紧凑行（手机46px），打开时立绘让位。勾选立即预览，始终按选择顺序保留前两位，取消后依序补入；没有Gal素材的身份留空，不由第三人顶替，也不随说话者切换。进入交流和退出选人均直接显示输入框，输入框“收起”直接退出交流。只有一条底部工具栏。回车发送，快速返回的回复也等待至发送后约两秒才开播。退出后“重播上次”可从保存记录重播完整上一条AI回复，不重发API或重复好感结算。战斗中背包右侧新增与AP同尺寸的圆形切换按钮，动画收起时间轴后在其区域显示剧情／闲聊，再次点击恢复时间轴；切换不改动编排和战斗状态。

战斗入场通过场景的whenSettled等待实际卡牌运动完成，并等待有限时长的入场过渡，之后才进入可操作状态并播放剧情、教学或伙伴对白。场景销毁会释放等待者；不以弹出Gal暂停中的画面作为落位完成。常规生成不再弹出自动修复格式提示，修复详情仍保留在诊断页。

视觉布局以下载查看的《ATRI》实机截图为参考：底部全宽的无硬边青色半透明渐层，姓名与正文浮在场景上；输入与阅读共用这一层。操作全部绘制为固定SVG线条图标，放在对话区域内部底部正中，默认半透明，悬停及启用高亮；名称保留在title与aria-label中。按钮不占独立工具行，侧栏亦使用半透明材质。参考图仅用于本地观察，不进入发布资源。

阅读控制参考Ren’Py官方快捷菜单提供回退、继续、快进、自动、历史、隐藏界面与退出；回退只改变已生成正文的阅读位置，不回滚游戏状态，明确退场可在回退时恢复。教程不能借交流按钮绕过必读段落。没有添加无实际功能的语音、截图或存读按钮。

出发顺序统一为：仅编队的确认页→同时生成剧本与调整装备→剧本就绪后出发。编队取消不请求API；确认的角色和站位进入生成上下文。生成期间立即打开装备整备，禁止增删成员、拖拽换位，但保留装备与纹章调整；生成就绪前禁用出发，取消整备会终止请求并返回酒馆。首次装备教学在整备打开时进行。手机弹窗有视口边界和滚动约束，设置页改为整页滚动，兼容竖屏浏览器中的旋转横屏。

教程开场、引导、潘多拉入队、纹章教学和升级对白通过同一播放器展现。Gal 舞台是顶层 section/popover，不创建新的模态对话框；鼠标、触屏、空格和 Enter 可展开/继续，自动和回看均在舞台内。教程必须读完当前序列才调用原有完成回调，取消不会伪造教学完成。副本解锁、历史记录和战斗规则继续由现有流程控制。

## 立绘资源与生成提示

使用内置 imagegen 工具编辑用户提供的三张参考图，保留身份和服装，输出 RGBA。资源保存于 `assets/gal/`，没有替换原来的角色卡面。实际使用提示如下，共同要求和对应人物要求合并为每张图的一次请求。

共同要求：Use case: identity-preserve / background-extraction. Create a production visual-novel dialogue sprite from the attached character reference. Preserve EXACT character identity, face, eye color, hairstyle, all signature ornaments, clothing design and delicate high-quality anime painted rendering. One character only, standing upright, relaxed natural three-quarter/front conversation pose. Half-body composition from whole head including every hair ornament down to hips, both shoulders and elbows inside canvas, hands anatomically correct, breathing room above head and at sides. Genuine transparent RGBA background, clean fine hair alpha edges, no scenery, no particles, no glow cloud, no text, no border, no pedestal. Do not include a fake checkerboard. Preserve outfit coverage and proportions. The lower edge will be placed behind a dialogue reading area.

- 潘多拉 `pandora-half.png`：Pandora: lavender long hair, ornate black and white lace bonnet, clock/star accessories, gentle violet starry eyes, black/white lace dress, holding her small pale patchwork bear naturally against her waist. Keep her gentle reserved expression. Show her bear clearly; remove the large background astronomical rings.
- 月汐 `yuexi-half.png`：Changjing Yuexi: silver lavender long hair, crescent moon hair ornament, soft violet eyes, ornate white and indigo dress with gold celestial embroidery. Preserve exact face and costume; natural friendly attentive expression. Her sheathed sword may remain partially beside her hip but no enormous vertical weapon obscuring face.
- 伊蒂丝 `edith-half.png`：Edith: long sky-blue hair covering one eye, visible golden eye, two small gold star hair pins, white scholarly robe with deep navy gold-embroidered scarf, holding dark navy gold-bound book at waist, black ornate sword strapped behind shoulder. Preserve exact calm face and costume.
