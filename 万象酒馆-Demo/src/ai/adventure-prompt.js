export const OBJECTIVE_RP_RULES = `【客观任务裁定】
1. 只回应玩家实际行动：只回应玩家本轮实际提出的行动，不替玩家补说关键台词、主动作出承诺、选择方案或连续执行未提出的步骤。队友可以反应、讨论、协助已明确提出的行动，不能抢走玩家的决定权。
2. 尊重NPC立场与事实门槛：NPC 有自身立场和信息边界，不为赶进度主动送出答案、接受交易、交出证据或宣布问题解决。调查要有可核实的发现，交易要有双方达成一致和实际交换，修复要有实施与检验，协商要有明确回应；仅表达意愿、提出建议、靠近地点或口头自称成功都不等于完成。
3. 允许分步推进：一次回复可以只取得部分进展或引出新情况，不必一次完成任何目标，更不能一次包办全部目标；保留 pending 是正常结果，但也不无视已经充分成立的事实。
4. 环境观察固定四条：环境信息固定四条，每条只写某处客观可见的具体事物或动静，线索有用但不解释用途，也不直接把完成主线的方法写在场景说明里。`;

export const ADVENTURE_SCRIPT_RULES = `【五节点冒险 · 三战与两次RP】
1. 五节点结构（schemaVersion 为 5）
- story 共五段 Gal 正文：0 普通战前、1 选择事件开场、2 精英战前、3 自由RP任务开场、4 Boss战前（仅索引 0、2、4 进入战斗）。
2. 第二节点：选择事件（story[1] + data.adventure.event）
- story[1] 停在玩家做决定前；data.adventure.event 提供 title、description 与 2～4 个 choices（每项仅含 label 与 detail，不生成 reward 字段）。
- 第二节点奖励由程序独立随机结算；正文、介绍、选项与后续回应均不预告或承诺金币、以太、药水、契约等数值奖励，也不在 data.items 中为第二节点安排战利品。
3. 第四节点：自由任务事件（story[3] + data.adventure.quest）
- story[3] 只演出开场，把行动权留给玩家，不演完任务或透露解法。
- quest.description：约 120～180 字的一段事件介绍，固定展示在第四阶段标题下方，简要回顾当前处境、在场人物与事件缘由（不逐句复制 story[3]）。
- quest.overview：环境观察数组，固定4项，每项为 {location:"所在位置",detail:"那里可观察到什么"}，只列客观观察，不写长对话或解谜攻略。
- quest.goals 与 commonState：goals 为 2～6 项（至少一个 required:true），每项只含 objective（一句普通人能看懂的话，如“和洛雨完成交易”）与 required，允许多种合理做法；第五段 story[4] 从 commonState 开始承接。
${OBJECTIVE_RP_RULES}`;

export function adventureScriptRules() {
  return ADVENTURE_SCRIPT_RULES;
}

export function adventureChatRules(turn, dialogueScenes = false) {
  if (!turn) return '';
  const common =
    OBJECTIVE_RP_RULES +
    (turn.investigation
      ? `\n【现场推理】程序已确认的线索仅有${JSON.stringify(turn.investigation.found)}。不得发现、补全、暗示未找到的证据，不得替玩家提出关键推理或主动推进。玩家必须亲自用这些证据建立因果关系，处理不能确定的部分，并达到：${turn.investigation.objective}。只发现线索或索要答案不完成任务；队友只能分析玩家已提出的判断。合理且充分的不同推断可以成功，不要求唯一措辞。\n`
      : '') +
    `
【副本RP规则，优先于普通战间闲聊限制】
这次可以推进当前事件，不可改动真实战斗数值、装备、技能、敌人阵容或宣布Boss已败。玩家只能声明意图和行动，成功结果由你根据世界书、角色能力、已确认事实自然判断；不能把“我已经成功”直接当事实。普通合理行动应得到推进，不强制唯一解，不用系统说教打断正文。
你可看完整预生成剧本，但其中“未来预定”只是幕后衔接参考：不得提前泄密、不得让角色知道未发现的秘密、不得把未来对白当作历史。以代码确认的任务状态和实际RP上文为准；不替玩家决定关键行动。只在wanxiang_output中输出Gal正文，机器标签不得混入正文。`;
  if (turn.mode !== 'quest')
    return (
      common +
      `
这是第二节点${turn.mode === 'event' ? '正式选择' : '事件后的普通闲聊'}。正式选项是代码确认的choice，玩家补充无论是否矛盾都不能更改它；冲突、口胡装备属性的部分自然忽略，合理细节可回应。奖励由程序独立随机结算，不由你设计；正文不得宣布、预告或编造获得金币、以太、药水、契约、属性或其他战利品。只写事件经过和人物反应，后续闲聊也不重复奖励，不完成第四节点任务。只输出一组<wanxiang_output>正文</wanxiang_output>，不输出任务JSON。`
    );
  return (
    common +
    `
这是第四节点自由任务RP。不要直接用NPC或旁白告诉玩家标准解法，给观察和尝试合理的反馈，可以让队友提出不唯一的意见，保留思考空间。回复还必须在正文标签之外输出唯一一组<wanxiang_adventure>JSON</wanxiang_adventure>，仅最终结果输出；思考、自查、示例和代码围栏中不得重复机器标签。格式：
准确的副本ID、版本和完整外层模板见本轮请求末尾“任务结果输出边界”，不要把说明文字或占位符当成真实字段值。
tasks可以只列本轮变化，不遗漏已有进度，不回退已完成目标；必选任务不能failed。只有正文确实发生的行为和结果才能批准完成，不能靠假设或自称完成。
${dialogueScenes ? '任务JSON的patches固定为空数组，后续台词统一在本轮的wanxiang_dialogue数据块中处理。' : '完成全部必选目标后才允许用patches调整boss.lines。使用现有台词ID及最新revision，保留已发生内容。'}玩家可以继续RP，不能自动进入Boss。
这是本轮唯一一次调用，任务结果和必要剧情补丁一起返回，不再要求调用剧本API。`
  );
}

/** Actual code-owned values in the final boundary prevent placeholder IDs leaking into replies. */
export function adventureOutputBoundary(turn, dialogueScenes = false) {
  if (turn?.mode !== 'quest') return '';
  return `【任务结果输出边界：本次必须遵守】
必须先完整输出一组wanxiang_output正文，再输出一组wanxiang_adventure任务JSON；JSON在正文标签外。没有任务变化也不能省略数据块，tasks和patches用空数组即可。禁止Markdown围栏、JSON注释、尾逗号、字符串形式的数组、单引号和额外键；不要在思考、自查、说明中重复输出这些标签。
本轮合法目标及已确认状态：${JSON.stringify(turn.goals.map(({ id, status, required }) => ({ id, status, required })))}。
任务项只能是{"id":"上述已有ID","status":"pending或completed或failed三选一","evidence":"本轮正文对应的依据，最多500字"}。没有变化就tasks:[]；完成必须有实际正文依据；主要目标不能failed，不能把status填写为中文或用目标名称代替ID。已完成目标不回退。${dialogueScenes ? '任务数据的patches固定填[]。' : '没有需要修改的后续剧情就patches:[]。'}
严格按下面的外层结构填写本次结果，episodeId和revision原样使用给定值，正文替换为本轮实际Gal内容：
<wanxiang_output>
【旁白】本轮实际正文
</wanxiang_output>
<wanxiang_adventure>
${JSON.stringify({ episodeId: turn.episodeId, revision: turn.boss.revision, tasks: [], patches: [] })}
</wanxiang_adventure>`;
}

export function adventureTurnTask(turn, dialogueScenes = false) {
  if (!turn) return '';
  if (turn.mode !== 'quest') {
    return `【本轮模式：quick-chat / ${turn.mode === 'event' ? 'node2-event' : 'node2-after'}】`;
  }
  const data = {
    mode: 'node4-quest',
    patchesMode: dialogueScenes ? 'wanxiang_dialogue' : 'boss_lines_or_empty',
    ...(turn.investigation ? { investigation: turn.investigation } : {}),
  };
  return `【本轮模式：quick-chat / ${data.mode}】${JSON.stringify(data)}`;
}

export function adventureBoundaryIds(turn, dialogueScenes = false) {
  if (turn?.mode !== 'quest') return '';
  return JSON.stringify({
    goals: turn.goals.map(({ id, status, required }) => ({ id, status, required })),
    patchesAllowedInAdventure: !dialogueScenes,
    template: { episodeId: turn.episodeId, revision: turn.boss.revision, tasks: [], patches: [] },
  });
}
