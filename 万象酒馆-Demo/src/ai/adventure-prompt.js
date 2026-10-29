import { ITEMS } from '../content/items.js';

export const ADVENTURE_SCRIPT_RULES = `【五节点冒险，替代旧五场连续战斗】
本次schemaVersion为5。story仍是五段完整Gal正文：0普通战前，1选项事件开场，2精英战前，3自由RP任务开场，4 Boss战前。不是五场战斗。
data.adventure.event提供标题、场景介绍、2～4个不同选择；选项只解决局部事件，不取消后续战斗。reward只使用已列出的金币和消耗道具，金币加道具售价合计不超过原普通战20金币，不能生成属性、技能或新装备奖励。
data.adventure.quest提供开头情境description、独立场景概览overview、2～6个目标（至少一个required:true），及必选目标完成后的共同状态commonState。story[3]只演出本段开头，把行动决定留给玩家，不演完任务，不直接告知具体解法。
description是第四阶段标题下单独展示的事件介绍，写成约120～180个中文字的一段自然描写，简要交代当前处境、在场人物与事件缘由，让玩家明白此刻面对什么。显示顺序固定为标题→事件介绍→任务→环境观察。它是开场后的简要回顾，不逐句复制story[3]，不代替玩家作决定，也不提前透露解法或结局；不要只写一句泛泛的提示。
每个目标只输出objective一句普通人能看懂的话及required，例如“和洛雨完成交易”“找到离开矿道的路”。不再输出谜语标题加说明的双层结构，不用“重构命运”“共鸣的回声”等抽象标题；不列行动方法、道具组合或必走地点。任务必须允许不同合理方法，不依赖特定火属性、种族或队伍没有的能力；必选不能设计成无法补救的失败。
环境信息另用overview格式化观察数组，每项{location:"所在位置",detail:"那里可观察到什么"}。例如窗边/木盒半开，票据压在杯下；树梢/有鸟断续鸣叫。环境板块只列观察，不重复事件介绍或Gal正文，不在观察里写人物大段对话、情绪长描写、设问或解谜攻略。观察需既有可利用的普通事物，也有自然动静，不能每条都是明晃晃的任务提示。建议3～8项，不解释它们的用途。
第四节点不是必然追杀、倒计时或逃命，可以是交易、宴席、协商、修复、采集、调查、文化误会、与同伴休息谈心、做出取舍或寻找方向；依当前官设情境挑选，不连续套用同一种紧迫困局。普通玩家有时间观察、尝试和交流。第二节点也可以轻松、古怪或温暖，不必每次遭险。
第五段从共同状态开始，不预设玩家怎样到达；不写“你们已破解封印”等尚未发生的具体过程，留下实际RP承接空间。
人物、装备、伏笔、标签及无限模式敌人配置字段保持原约定；encounters仍按五节点索引，只有0/2/4进入战斗，中间配置仅作兼容参考。
正文沿用【旁白】与【对白:姓名】，以人物之间有差异的对话推动故事，短旁白交代必要动作；不输出JSON台词数组，不让模型给台词或任务编号。代码分配稳定ID。`;

export function adventureScriptRules() {
  return (
    ADVENTURE_SCRIPT_RULES +
    '\n可用事件道具：' +
    JSON.stringify(
      Object.values(ITEMS)
        .filter((item) => item.price <= 20)
        .map(({ id, name, price }) => ({ id, name, price })),
    )
  );
}

export function adventureChatRules(turn) {
  if (!turn) return '';
  const common = `【副本RP规则，优先于普通战间闲聊限制】
这次可以推进当前事件，不可改动真实战斗数值、装备、技能、敌人阵容或宣布Boss已败。玩家只能声明意图和行动，成功结果由你根据世界书、角色能力、已确认事实自然判断；不能把“我已经成功”直接当事实。普通合理行动应得到推进，不强制唯一解，不用系统说教打断正文。
你可看完整预生成剧本，但其中“未来预定”只是幕后衔接参考：不得提前泄密、不得让角色知道未发现的秘密、不得把未来对白当作历史。以代码确认的任务状态和实际RP上文为准；不替玩家决定关键行动。只在wanxiang_chat中输出Gal正文，机器标签不得混入正文。`;
  if (turn.mode !== 'quest')
    return (
      common +
      `
这是第二节点${turn.mode === 'event' ? '正式选择' : '事件后的普通闲聊'}。正式选项是代码确认的choice，玩家补充无论是否矛盾都不能更改它或reward；冲突、口胡装备属性的部分自然忽略，合理细节可回应。后续闲聊不重复奖励，不完成第四节点任务。只输出一组<wanxiang_chat>正文</wanxiang_chat>，不输出任务JSON。`
    );
  return (
    common +
    `
这是第四节点自由任务RP。不要直接用NPC或旁白告诉玩家标准解法，给观察和尝试合理的反馈，可以让队友提出不唯一的意见，保留思考空间。回复还必须在正文标签之外输出唯一一组<wanxiang_adventure>JSON</wanxiang_adventure>，仅最终结果输出；思考、自查、示例和代码围栏中不得重复机器标签。格式：
准确的副本ID、版本和完整外层模板见本轮请求末尾“任务结果输出边界”，不要把说明文字或占位符当成真实字段值。
tasks可以只列本轮变化，不遗漏已有进度，不回退已完成目标；必选任务不能failed。只有正文确实发生的行为和结果才能批准完成，不能靠假设或自称完成。
本轮完成全部必选目标（包括以前已完成的），或必选早已完成时，才允许patches。没有值得Boss回应的新事实就返回空数组；不要为了反馈硬改。玩家可以继续RP，不能自动进入Boss。
补丁只针对当前boss.lines：替换{"op":"replace","id":"已有台词ID","speaker":"姓名或旁白","text":"正文"}；插入{"op":"insert","after":"前一句ID","before":"紧邻后一句ID","speaker":"姓名或旁白","text":"正文"}。保留未涉及台词，只补充真实进入方式、可选目标、承诺或情报反应，不改Boss身份、战斗配置和过去节点。使用本轮最新ID和revision，不自己分配新ID。
这是本轮唯一一次调用，任务结果和必要剧情补丁一起返回，不再要求调用剧本API。`
  );
}

/** Actual code-owned values in the final boundary prevent placeholder IDs leaking into replies. */
export function adventureOutputBoundary(turn) {
  if (turn?.mode !== 'quest') return '';
  return `【任务结果输出边界：本次必须遵守】
必须先完整输出一组wanxiang_chat正文，再输出一组wanxiang_adventure任务JSON；JSON在正文标签外。没有任务变化也不能省略数据块，tasks和patches用空数组即可。禁止Markdown围栏、JSON注释、尾逗号、字符串形式的数组、单引号和额外键；不要在思考、自查、说明中重复输出这些标签。
本轮合法目标及已确认状态：${JSON.stringify(turn.goals.map(({ id, status, required }) => ({ id, status, required })))}。
任务项只能是{"id":"上述已有ID","status":"pending或completed或failed三选一","evidence":"本轮正文对应的依据，最多500字"}。没有变化就tasks:[]；完成必须有实际正文依据；主要目标不能failed，不能把status填写为中文或用目标名称代替ID。已完成目标不回退。没有需要修改的后续剧情就patches:[]，不要强行写补丁。
严格按下面的外层结构填写本次结果，episodeId和revision原样使用给定值，正文替换为本轮实际Gal内容：
<wanxiang_chat>
【旁白】本轮实际正文
</wanxiang_chat>
<wanxiang_adventure>
${JSON.stringify({ episodeId: turn.episodeId, revision: turn.boss.revision, tasks: [], patches: [] })}
</wanxiang_adventure>`;
}
