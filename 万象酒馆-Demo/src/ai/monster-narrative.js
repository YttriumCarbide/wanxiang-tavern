const RETIRED_BOUNDARY =
  '叙事边界：这些是可观察特征与可能的行动。实际伤害、技能使用、受伤和胜负以游戏已经确认的事件为准。';

export function isMonsterWorldEntry(entry) {
  const marker = entry.extensions?.wanxiang;
  if (marker?.characterId) return false;
  return !!(
    marker?.monsterId ||
    marker?.generationRule === 'universal-enemies' ||
    /怪物图鉴|怪物设定/.test(entry.comment || '') ||
    (entry.content?.includes('习性与能力：') && entry.content?.includes('行动方式：'))
  );
}

const GAME_RULE_SENTENCE =
  /(?:现行1级|基础hp|最大hp|^hp[：:]|速度[：:]|每回合|第[一二三四五六七八九十\d]+回合|半血|百分之|不高于\s*\d|hp低于|\d+\s*(?:点)?\s*(?:伤害|护盾|hp|sp|生命|法力|回合|层|%|％)|伤害|护盾|薄盾|治疗按|治疗|回复|易伤|虚弱|铁皮|流血|中毒|再生|禁锢|锁定|优先|hp最低|sp(?:储量)?(?:最多|较高)|护盾最少|防护最高|目标|位置|前排|后排|中间位置|左位|右位|中位|两翼|三个前场|全部击败|行动顺序|循环|战斗事件|预写胜负|不预分胜负|不预写胜负|本回合|回合开始|攻击回合|奇数回合|偶数回合|紧急肃清|意图|只施加给|分摊至|每场只用一次|只作一次|先.{0,12}(?:再|后|随后)|无人受伤|受创后|核心受创|hp比例|同伴|同行者|同袍|视作|按.*比较|必须.{0,12}(?:胜利|击败))/i;

/** Lore is editable prose; intent tables remain in the combat archive and game reference. */
export function monsterNarrativeText(text) {
  return String(text || '')
    .replaceAll(RETIRED_BOUNDARY, '')
    .replace(/^\s*替代旧数字】\s*$/gmu, '')
    .split('\n')
    .filter(
      (line) =>
        !/^\s*(?:现行1级|基础hp|hp[：:]|速度[：:]|紧急肃清|只按真实战斗事件描写|只按真实战斗)/i.test(
          line,
        ),
    )
    .map((line) =>
      line
        .split(/(?<=[。；;])/u)
        .filter((sentence) => !GAME_RULE_SENTENCE.test(sentence))
        .join('')
        .replace(
          /(?:朝|向|攻击|打击|命中|对)(?:中间|中央|左侧|右侧|两侧|两翼|中位|左位|右位)(?:的)?(?:敌方|我方)?(?:单位|角色|目标)?/gu,
          '向来犯者',
        ),
    )
    .filter((line) => line.trim() && !/^[；;，,。\s]+$/u.test(line))
    .join('\n');
}
