import { GAL_NPC_PORTRAIT_NAMES } from '../content/gal-npc-portraits.js';

export function galActorListText(input) {
  const members = input?.party || input?.characters || [];
  return `可用人物ID与姓名：${JSON.stringify(
    members.map((entry) => ({ id: entry.id, name: entry.name || entry.setting?.name })),
  )}。`;
}

/** Companion rule for preset and fallback prompts, including older or customized worldbooks. */
function galReactionInstruction() {
  return `【Gal对白反应】按情绪条件使用，不强制每句触发；只在角色当下确有明显情绪转折时，给该条对白末尾加一个可选后缀：【对白:角色ID|hop】或【对白:npc:姓名|立绘编号|hop】。普通交谈和连续接话沿用无后缀写法。白名单：hop（开心轻跳与闪光）、hop:alert（轻微受惊或警觉）、hop:note（愉快轻跳与音符）、shake（恼怒或惊惧急抖）、sweat（尴尬下沉）、lean（认真前倾）、back（警惕后退）、nod（点头）、sway（无奈摇头或短暂沉默）、question（困惑歪头）。情绪靠正文也能读懂；不要叠加或连续复用后缀，不在旁白、玩家台词、登退场、补丁字段或JSON ID里加后缀。`;
}

function galEnsembleInstruction(kind) {
  const unit =
    kind === 'script'
      ? '按场景分幕，每个 story[i] 是一幕'
      : '本轮场景为一幕';
  return [
    `【多人队伍聚焦与反端水】${unit}。仅写作指导，不作硬校验。`,
    '满编也只让最契合局势的 2～3 名同伴或现场 NPC 开口，同屏最多 2～3 人；不为凑数加人。',
    '非焦点不开口、不新登场：一句【旁白】交代分工，已在场则用【退场:角色ID】切出。跨幕轮换焦点，各有高光。',
    '突发状况不写三人以上逐一惊叹、附和或表态；集体动作合成一条【旁白】。',
    '两人交涉、争论或试探时，围绕一件事深谈 3～5 个来回，无关者不插话。短聊分轮推进，不替玩家发言。',
    '发言有转折或多层意思时，同一角色连写 2～3 条【对白:同一ID】，不让全员轮流点名。',
  ].join('\n');
}

/** Do not repeat the built-in guide if the request actually contains it. */
export function hasGalReactionGuidance(messages) {
  return messages.some(({ role, content }) => {
    if (role !== 'system' || typeof content !== 'string') return false;
    return (
      content.includes('可选立绘反应后缀按情绪条件使用') &&
      content.includes('【对白:角色ID|hop】') &&
      content.includes('【对白:npc:姓名|立绘编号|hop】')
    );
  });
}

export function galSceneCastInstruction(input, kind, { reactionInWorldbook = false } = {}) {
  const rules = [galActorListText(input)];
  if (!reactionInWorldbook) rules.push(galReactionInstruction());
  rules.push(galEnsembleInstruction(kind));
  return rules.join('\n');
}

/** All narrative APIs use the Gal stage; metadata, mechanics and prose lengths stay unchanged. */
export function galInstruction(input, kind = 'script', options) {
  if (!['script', 'chat', 'quick-chat'].includes(kind)) return '';
  const dialogueTarget = kind === 'script' ? '65%～80%' : kind === 'chat' ? '80%～90%' : '85%左右';
  const style = {
    script: `【Gal剧本文风】
1. 场景与叙事：按可直接演出的视觉小说场景书写，贴近主角当下所见所闻。每个场景都要有正在发生的具体事件、不同人物的诉求与局面变化；让线索在观察、交涉与试探中自然浮现，不用旁白提前讲透谜底。
2. 对白与角色口吻：对白负责试探、拒绝、打趣、隐瞒、选择与关系变化，不照本宣科背诵世界书设定。按各人身份、性格与说话习惯区分句长、用词和关注点；动作与短暂沉默穿插在对白之间，必要时用简练旁白承接发现与转场。
3. 收尾与节奏：冲突与收获要有清晰因果，段落末尾自然停在具体动作、回应或新发现上，不逐段总结中心思想或强行预告命运。`,
    chat: `【Gal酒馆聊天文风】
1. 直接回应玩家：先接住玩家这次具体说了什么、做了什么，再按关系和性格延伸。把角色写成有个人偏好和生活习惯的活人，允许犹豫、接错话、转移话题或存在分歧，不要每次都脸红、微笑、歪头或无条件迎合。
2. 落在当前地点：用少量准确的动作、物件与感官细节撑起现场感，不重复外貌档案或大段背景，不把日常闲聊强行升级成世界危机，也不替玩家说出未经输入的回答与承诺。`,
    'quick-chat': `【Gal局内闲聊文风】
1. 旅途简短接话：这是副本途中的短暂同伴交流。优先让一两个相关同伴用符合性格的口吻自然接话，短对白之间只插必要动作或观察，不写全队轮流汇报战况，也不堆砌抽象感悟。
2. 严守局内边界：不得借闲聊推进下一场剧情、凭空生成敌人或改变战斗与奖励，不替玩家决定行动；话说到位即可自然收住。`,
  }[kind];

  return `【Gal叙事格式，仅影响正文】
保留本次 JSON 与标签外层协议，剧本 story 的每项仍是完整字符串，不增加第二套JSON或拆成短台词数组。
1. 常用台词与旁白标记（对白字数目标占 ${dialogueTarget}）
- 【旁白】后写必要的环境、动作与神态（通常 1～2 句，不替角色开口说话，不夹带引号台词）。
- 【对白:角色ID】后写该角色实际说的话（不外包整句引号，不夹带第三人称动作；玩家主角可用【对白:user】）。
- 【登场:角色ID】、【退场:角色ID】、【清场】仅在角色中途进出或切换场景时使用；首次说话会自动登场，切到旁白不清空舞台。
2. 【NPC立绘绑定，三类叙事共用】
- 队伍成员和已有官方人物沿用真实 ID 与固有立绘，不套用 npc: 标记。
- 其他 NPC 每次发言使用【对白:npc:姓名|立绘编号】格式，登场用【登场:npc:姓名|立绘编号】，退场用【退场:npc:姓名】。其中“姓名”必须写成「短身份·真实人名」（如【对白:npc:女守卫·玛莎|guardWoman】或【对白:npc:老学者·温特|scholar】），方便在通用立绘下清楚区分人物；严禁只写「女性守卫」「城门女卫兵」「商贩」「路人」等无名职业代号。同一人物全篇保持同一编号，姓名与 data.npcs 一致。可选编号及含义：${JSON.stringify(GAL_NPC_PORTRAIT_NAMES)}。
3. 【剧情奖励边界】
- 正文不能自行授予实际物品。纹章戒指仅可在本次请求明确提供 storyRingReward 时于指定节点描写外观与人物反应；storyRingReward 为 null 时不创作戒指赠送。不在剧本或聊天正文写戒指的具体游戏效果、数值、技能、充能格数或操作教学，也不将纹章戒指列入 data.items。
4. 【短页阅读节奏】
- 同一角色可连续使用多个【对白:同一角色ID】，按语气停顿拆成每块 1～2 句（约 20～50 字）；旁白也按动作或观察拆成每块 1～2 句（约 25～60 字）。标记后直接写正文，不留首尾空行，不在词句中间生硬断开。
${galSceneCastInstruction(input, kind, options)}
【Gal共同写作要求】
正文使用自然流畅的中文，人物先行动、感受、回应，确有必要时再解释。选用能传递信息的具体细节，避免“复杂神色”“莫名情绪”“意味深长”“故事才刚刚开始”等套话，不靠省略号和感叹号堆情绪。每句对白都要有当下的交流目的，旁白与对白互相补充，不输出创作说明或分镜编号。
${style || ''}`;
}
