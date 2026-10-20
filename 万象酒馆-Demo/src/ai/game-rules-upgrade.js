const UPDATE_MARK = '【1.3 行程与成长规则更新】';
const SCRIPT_RULES = `五段正文全部在对应战斗开始时展示，最终战正文也在Boss战开始时展示，不提前写成Boss已被击败。每场正文都必须产生有效剧情推进或角色、NPC、环境的实质交互；剧情推进占70%以上，禁止只写敌人出现、摆姿势、准备战斗或重复在入口谈话。建议总正文4200～6300中文字，中间每段600～900字，首尾各1200～1800字；保持完整JSON，不为字数截断。
伏笔采用nextHook:{phase,setting}，phase依次为起、承1、承2、转1、转2、合，沿request.storyArc指定阶段书写。setting写“伏笔：阶段”并给出可执行的具体指引，明确人物、地点、行动，不以含糊的秘密、等待和谜语原地踏步。每个阶段都应取得新的事实与结果。
每趟副本自然获得1～3件可构筑装备的归档道具，不要求每只怪物、每场战斗都掉一个。来源应多样，可以是探索发现、人物赠予、剧情奖励、遗留物或敌方战利品；只记录正文已经实际取得的道具，不能在开战前凭空宣告Boss战利品。`;
const GROWTH_RULES =
  '升级所需经验显著提高。每级总共随机分配1～3点，以生命、法力为主要成长，普攻伤害次之，技能伤害、行动次数和耗蓝降低概率更低。普通战后不自动恢复生命或法力；第三场结束仅可休整一次，睡眠恢复最多40%最大生命，或用餐回满法力。';
const CHARACTER_RULES =
  '人物只有两个技能槽，每槽可选择主动或被动，普通攻击始终独立存在。为玩家生成主角时，根节点额外输出levelUpLines：恰好5句符合该主角性格的简短升级台词字符串，不能放进setting或data，不让主角说出其他角色的口吻。';
/** Preserve edited worldbook content while replacing obsolete timing phrases and appending current rules. */
export function upgradeGameRules(book) {
  const next = structuredClone(book);
  for (const entry of Object.values(next.entries || {})) {
    const rule = entry.extensions?.wanxiang?.generationRule;
    if (rule?.startsWith('script') && !entry.content.includes('【多元探索规则】'))
      entry.content +=
        '\n\n【多元探索规则】\n多元奇点世界及第七处以后的旅途由剧本决定每场敌人，在data.encounters输出五项{enemyIds:[敌人ID]}，每场1～3个不同ID，最终场至少一位当前世界Boss，全部取自request.dynamicWorld.enemies。不要生成地图专属buff。已经历的战斗配置不可改动。';
    if (!rule || entry.content.includes(UPDATE_MARK)) continue;
    if (rule.startsWith('character'))
      entry.content = entry.content.replaceAll(
        '两个技能至少一个主动。',
        '两个技能槽各自可选择主动或被动，普通攻击独立。',
      );
    if (rule === 'growth-numbers')
      entry.content = entry.content.replaceAll(
        '升级由程序对六项分别判定，生命成长+2、其余成长+1',
        '升级由程序总共随机抽取1～3点，按稀有度权重分配到六项，每点增加1，以生命和法力为主、普攻次之，技能伤害、行动次数和耗蓝降低概率较少',
      );
    if (rule.startsWith('script')) {
      entry.content = entry.content
        .replaceAll('第五段在Boss获胜后展示', '第五段在Boss战开始时展示')
        .replaceAll('第五段在Boss战获胜后展示', '第五段在Boss战开始时展示')
        .replaceAll('最终Boss获胜后', '最终Boss战开始时')
        .replaceAll('最终Boss战获胜后的收尾', '最终Boss战开始时的推进正文')
        .replaceAll('Boss获胜后的已知事实', 'Boss开战时的已知事实')
        .replaceAll('nextHook只保留setting', 'nextHook包含setting和phase');
      if (['script-output', 'script-plot'].includes(rule))
        entry.content += `\n\n${UPDATE_MARK}\n${SCRIPT_RULES}`;
    }
    if (rule === 'growth-numbers') entry.content += `\n\n${UPDATE_MARK}\n${GROWTH_RULES}`;
    if (rule === 'character-output') entry.content += `\n\n${UPDATE_MARK}\n${CHARACTER_RULES}`;
  }
  return next;
}
