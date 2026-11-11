export const OBJECTIVE_RP_RULES = `【客观任务裁定】
只回应玩家本轮实际提出的行动，不替玩家补说关键台词、主动作出承诺、选择方案或连续执行未提出的步骤。NPC有自身立场和信息边界，不为赶进度主动送出答案、接受交易、交出证据或宣布问题解决。队友可以反应、讨论、协助已明确提出的行动，不能抢走玩家的决定与完成任务的行动。
任务完成必须有充分、具体且与目标相符的事实：调查要有可核实的发现，交易要有双方达成一致和实际交换，修复要有实施与检验，协商要有明确回应。表达意愿、提出建议、靠近地点、简单问候、口头自称成功都不等于完成。一次回复可以只取得部分进展或新问题，不必一次完成任何目标，更不能一次包办全部目标；保留pending是正常结果。也不要为拖延凭空增加门槛或无视已经充分成立的结果。
本轮只客观描写所选行动带来的合理范围内的结果，不跨越时间、不自行开启后续阶段。环境信息固定四条，每条只写某处客观可见的具体事物或动静：线索有用但不解释用途，不用废话凑数，也不直接把完成主线的方法写在场景说明里。`;

export const ADVENTURE_SCRIPT_RULES = `【五节点冒险，替代旧五场连续战斗】
本次schemaVersion为5。story仍是五段完整Gal正文：0普通战前，1选项事件开场，2精英战前，3自由RP任务开场，4 Boss战前。不是五场战斗。
data.adventure.event提供标题、场景介绍、2～4个不同选择；选项只解决局部事件，不取消后续战斗。每个选项只写label与detail，不生成reward或其他奖励字段。第二节点奖励由程序独立随机结算，与AI叙事和选项无关；story[1]、事件介绍、选项说明和后续回应都只写经历、决定和人物反应，不预告或宣称获得金币、以太、药水、契约或其他数值奖励，不用“之后将得到……”暗示奖励，也不能通过data.items绕过此限制为第二节点安排战利品。
data.adventure.quest提供开头情境description、独立场景概览overview、2～6个目标（至少一个required:true），及必选目标完成后的共同状态commonState。story[3]只演出本段开头，把行动决定留给玩家，不演完任务，不直接告知具体解法。
description是第四阶段标题下单独展示的事件介绍，写成约120～180个中文字的一段自然描写，简要交代当前处境、在场人物与事件缘由，让玩家明白此刻面对什么。显示顺序固定为标题→事件介绍→任务→环境观察。它是开场后的简要回顾，不逐句复制story[3]，不代替玩家作决定，也不提前透露解法或结局；不要只写一句泛泛的提示。
每个目标只输出objective一句普通人能看懂的话及required，例如“和洛雨完成交易”“找到离开矿道的路”。不再输出谜语标题加说明的双层结构，不用“重构命运”“共鸣的回声”等抽象标题；不列行动方法、道具组合或必走地点。任务必须允许不同合理方法，不依赖特定火属性、种族或队伍没有的能力；必选不能设计成无法补救的失败。
环境信息另用overview格式化观察数组，每项{location:"所在位置",detail:"那里可观察到什么"}。例如窗边/木盒半开，票据压在杯下；树梢/有鸟断续鸣叫。环境板块只列观察，不重复事件介绍或Gal正文，不在观察里写人物大段对话、情绪长描写、设问或解谜攻略。观察需既有可利用的普通事物，也有自然动静，不能每条都是明晃晃的任务提示。固定4项，不解释它们的用途。
第四节点不是必然追杀、倒计时或逃命，可以是交易、宴席、协商、修复、采集、调查、文化误会、与同伴休息谈心、做出取舍或寻找方向；依当前官设情境挑选，不连续套用同一种紧迫困局。普通玩家有时间观察、尝试和交流。第二节点也可以轻松、古怪或温暖，不必每次遭险。
第五段从共同状态开始，不预设玩家怎样到达；不写“你们已破解封印”等尚未发生的具体过程，留下实际RP承接空间。
人物、装备、伏笔、标签及无限模式敌人配置字段保持原约定；encounters仍按五节点索引，只有0/2/4进入战斗，中间配置仅作兼容参考。
正文沿用【旁白】与【对白:姓名】，以人物之间有差异的对话推动故事，短旁白交代必要动作；不输出JSON台词数组，不让模型给台词或任务编号。代码分配稳定ID。
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
这是${turn.chapter ? '主线当前阶段的自由任务RP，只有已发生内容，没有提前生成的整章剧本；不生成任何未来剧情补丁，patches固定为空数组' : '第四节点自由任务RP'}。不要直接用NPC或旁白告诉玩家标准解法，给观察和尝试合理的反馈，可以让队友提出不唯一的意见，保留思考空间。回复还必须在正文标签之外输出唯一一组<wanxiang_adventure>JSON</wanxiang_adventure>，仅最终结果输出；思考、自查、示例和代码围栏中不得重复机器标签。格式：
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
