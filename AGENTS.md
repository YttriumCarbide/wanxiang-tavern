# 项目开发约定

- 当前研发分支为 `develop`。日常开发提交与上传使用该分支；未经用户明确要求发布正式版，不合并或推送到 `main`／`master`。正式 GitHub Pages 仅由正式分支发布，禁止从 `develop` 手动部署覆盖正式网页。
- 仅向 GitHub 的 `origin` 上传；Gitee 远程已移除，后续不再向 Gitee 推送或重新添加连接。

适用于本目录及全部子目录；以用户本轮明确要求为最高优先级。

- 当前运行项目是 `万象酒馆-Demo`。三个体素源模型目录和 `建模工具` 是有效开发资产，不按旧版处理。
- 修改前先读 `万象酒馆-Demo/开发规范.md`；当前开发基线验收见 `万象酒馆-Demo/代码审查.md`。
- **新增 Buff／Debuff 或地图时，开发 AI 必须主动询问用户要开放哪些生成入口。** 按需列出地图 API、角色、剧本、以太造物等入口，允许多选。已明确的范围直接执行，涉及共享登记表时先核对自动接入路径；生成池按用户选定的范围更新。详见[新增内容接入流程](万象酒馆-Demo/开发规范.md#新-buff-与新地图的接入流程)。
- 不重新创建 `.previous`、旧版查看器、重复启动实现、临时 QA 脚本或无要求的压缩包。
- 新代码使用可读的多行函数。改动历史长函数时整理实际改动的代码块；禁止为了排版扩大功能改动。
- 规则写入纯数据引擎，界面和动画只能消费预演事件。禁止分别计算预演伤害和结算伤害。
- 测试统一通过 `node tools/test.mjs`，一次提交本次需要的范围，收集所有失败后再修改。
- AI 测试一律复用已有官设角色及其正式资料，只按用例改变协议结构或数值；禁止新增虚构角色、复制个人生成角色作 fixture。个人生成角色、立绘、导出和存档仅留本机，禁止提交或上传仓库；历史已跟踪的个人角色文件须随下次同步删除。
- 本轮要测的范围先统一写入 `万象酒馆-Demo/tools/testing/checklist.json`，一条命令批量执行；独立项目最多两个并行，测试配置相互隔离。禁止逐项发工具、每个微调重跑整组，失败后合并复查失败及受修改影响的项目。
- **改哪里测哪里**。使用 `--changed` 或 `--scope`；文档和普通静态样式修改不自动跑完整副本。
- 失败后只重跑失败或受后续修复影响的范围。通过且未再改动的检查不重复跑。
- 六场副本真实浏览器通关仅在副本推进、资源继承、Boss规则变动或用户明确要求时运行。
- 禁止对每个微调分别启动浏览器、逐项发工具测试、无故覆盖大量分辨率或循环全量测试。
- Windows CMD 文件内部只写ASCII命令并使用CRLF；PowerShell用UTF-8 BOM。启动逻辑只有 `launch.ps1` 一份。
- 清理前验证引用及路径；旧文件默认放回收站，保留一份清理记录，不永久删除无法重建的源资产。

- 应用结构以 `万象酒馆-Demo/架构.md` 为准；源代码没有可变模块全局状态，控制器经组装入口连接。
- 自有代码由Prettier／ESLint检查，组件样式只维护 `styles/`，禁止恢复旧的覆盖样式文件。
- 新依赖必须更新npm锁文件；Python工具依赖位于其独立venv和冻结requirements中。


## 多模型职能分工与渠道化 DeepSeek Flash 分流规范

本项目由 **Gemini / AGY**、**OpenAI 官方 Codex** 与后台 **DeepSeek Flash (`deepseek-v4-1-flash-1017`)** 协同开发。每轮先根据当前真实执行渠道判断分工，不依据仓库标题或模型自称推测。**仅 OpenAI 官方 Codex 与 AGY 渠道可调用 DeepSeek Flash；用户明确禁止、工具未授权或资料不宜外发时仍不得调用。其他模型渠道禁止使用 DeepSeek Flash；在工具与权限允许时，优先将可并行工作拆给写集互斥的子代理（总并发不超过 5，独立测试项目同时不超过 2），不为凑数量创建无效任务。**

1. **主模型职责边界（严禁越界）**
   - **文案与世界观创作**（酒馆剧情、角色台词、卡牌／遗物 `flavorText` 风味文案）：**仅限 Gemini 主模型亲自撰写**。GPT 主模型与 DeepSeek 严禁创作或篡改正式风味文案（GPT 遇到需新增文案时，仅填结构字段或占位符，并提示交由 Gemini 撰写）。
   - **UI 视觉与动画审美**（`styles/` 样式排版、配色光影、动效表现）：优先由 **Gemini (`4h`／`4neon`)** 负责；**GPT (`6.2 sol`／`astar`)** 专注于 `engine/` 纯数据战斗引擎、状态机算法与 `tools/` 测试工具链。

2. **DeepSeek Flash 合格渠道内的主动分流阈值（仅在上文允许且未被用户禁止的渠道使用；命中任一条件时优先直接调用子工具）**
   - **批量数据／配置落盘（≥ 40 行）**：凡是将文案草稿／策划规则转为 JSON／JS 配置表、批量补全卡牌／遗物／波次字段、生成单测 Mock 数据或重复样板代码预计达 40 行以上，**必须委托 DeepSeek Flash 直接生成并落盘**，主模型仅负责校验结果。
   - **长日志与大文件初筛（≥ 80 行）**：凡是 `node tools/test.mjs` 报错堆栈、构建日志或待排查数据文件超过 80 行，**必须先调 DeepSeek Flash 提炼故障摘要与行号**。
   - **机械性批处理**：批量补全 JSDoc 注释、机械字段重命名映射、格式标准化。

3. **DeepSeek Flash 调用方式（仅限允许渠道；用户否决时停止，不重试）**
   - **方式 A（已挂载 MCP 工具时直调）**：
     - AGY (Gemini)：直接调用 `deepseek-worker` 的 `ds_file_worker`（文件到文件直写，最省 Token）或 `ds_ask`。
     - Codex (GPT)：直接调用已挂载的 DeepSeek Flash MCP 工具（或直接使用下方方式 B）。
   - **方式 B（通用终端 CLI 直调，GPT 与 Gemini 均可通过命令行直接执行）**：
     ```powershell
     # 1. 读本地文件并在后台直接生成/转换目标文件（不占主模型输出 Token）
     @{
       instruction = "严格按引擎 Schema 转换配置，完整保留原有 flavorText 文案一字不改"
       input_files = @("D:/万界酒馆/输入参考路径")
       output_file = "D:/万界酒馆/输出目标路径"
       json_mode   = $true
     } | ConvertTo-Json -Compress | node "C:\Users\Lenovo\.gemini\config\mcp\deepseek-worker.mjs" --cli ds_file_worker --stdin

     # 2. 长日志摘要或快速结构化生成
     @{
       prompt = "提炼以下测试失败堆栈的核心原因与涉及文件行号：..."
     } | ConvertTo-Json -Compress | node "C:\Users\Lenovo\.gemini\config\mcp\deepseek-worker.mjs" --cli ds_ask --stdin
     ```

4. **调用记录与用量**
   - 交付时如实列出 DeepSeek 执行了什么、实际写入了哪些文件，以及工具返回的输入／输出 Token。工具没有提供 usage 时明确说明“未报告”；实际用量与节省估算分开，未估算就不报估算。不得将失败调用描述为完成。

5. **仓库内通用 AI 调用工具**
   - 从仓库根目录运行 `node 万象酒馆-Demo/tools/ai-worker.mjs --cli ai_ask --stdin`，通过标准输入传入 `{"prompt":"…"}`。
   - 文件任务使用 `--cli ai_file_worker --stdin`，沿用 `instruction`、`input_files`、`output_file` 和 `json_mode`。仅传入任务所需且可发送到配置接口的文件。
   - 使用环境变量选择 Chat Completions 接口和模型。配置和调用示例见[开发规范](万象酒馆-Demo/开发规范.md#开发用-ai-调用工具)。需要由 DeepSeek Flash 处理的任务，使用此命令时仍须配置指定的 DeepSeek Flash 模型。
