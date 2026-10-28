/** Fixed emblem rules; battle state is the sole owner of charge and duration. */
export function applyEmblemStats(combat, emblemId) {
  const result = structuredClone(combat);
  if (emblemId === OVERLOAD_EMBLEM_ID && !result._overloadApplied) {
    result.mp = Math.round(result.mp * 1.5);
    result.hp = Math.round(result.hp + result.mp * 0.25);
    result._overloadApplied = true;
  }
  return result;
}
export const EMBLEM_ID = 'tan-hongyu';
export const EMBLEM = Object.freeze({
  id: EMBLEM_ID,
  name: '檀虹羽',
  title: '均衡纹章士',
  text: '寻古溯源：结合期间，单体攻击的伤害同时作用于其他敌人，状态仍只施加给原目标。',
});
export const COMBINE_SKILL = Object.freeze({
  id: 'emblem-balance',
  name: '结合技 · 平衡',
  ap: 1,
  mp: 0,
  target: 'enemy',
  text: '使敌人的攻击伤害均分至三个前场位置，状态目标不变。每次结合限用一次。',
  effects: [{ type: 'buff', buff: 'balance', value: 1 }],
});

export const OVERLOAD_EMBLEM_ID = 'mizunatsuki-ran';
export const OVERLOAD_EMBLEM = Object.freeze({
  id: OVERLOAD_EMBLEM_ID,
  name: '水无月兰',
  title: '过载纹章士',
  text: '灵能血装：最大法力值*1.5倍，最大生命值增加最大法力的0.25；技能伤害与回复增加该技能消耗法力×0.25。',
});
export const OVERLOAD_SKILL = Object.freeze({
  id: 'emblem-overload',
  name: '结合技 · 超限负荷',
  ap: 1,
  mp: 0,
  target: 'self',
  text: '获得1层超限，本场保留至下次角色技能使用：消耗翻倍、额外生效一次。不随回合或结合结束消失，每次结合限用一次。',
  effects: [{ type: 'buff', buff: 'overload', value: 1 }],
});

export const DRAGON_EMBLEM_ID = 'kamui';
export const MASK_EMBLEM_ID = 'wind-dance';
export const SUPREME_EMBLEM_ID = 'jiu-qi';
export const DRAGON_SKILL = Object.freeze({
  id: 'emblem-dragon-vein',
  name: '结合技 · 龙脉',
  ap: 1,
  mp: 0,
  target: 'self',
  mechanic: 'dragonVein',
  effects: [],
  text: '本场在前场三格留下龙脉：左位每回合回复8hp，右位每回合回复8sp，中位持续获得1层铁皮、力量和敏捷。效果属于位置，换人仍保留。每次结合限用一次。',
});
export const MASK_SKILL = Object.freeze({
  id: 'emblem-deceit-sacrifice',
  name: '结合技 · 欺之牺',
  ap: 1,
  mp: 0,
  target: 'ally',
  mechanic: 'sacrifice',
  effects: [],
  text: '标记另一名队友。下次有敌人死亡时，献祭该队友、令其余敌人回复全部hp，自身吸收该队友20%的hp/sp上限、普攻及技能伤害，并随机获得一个技能。吸收仅本场有效，每次结合限用一次。',
});
export const SUPREME_SKILL = Object.freeze({
  id: 'emblem-moon-eye',
  name: '结合技 · 月之瞳',
  ap: 1,
  mp: 0,
  target: 'enemy',
  mechanic: 'moonEye',
  effects: [],
  text: '只能选择至少有3种负面状态的非Boss敌人：令其死亡，并对其余敌人造成等同于该敌人当前hp的伤害。每次结合限用一次。',
});

export const EMBLEMS = Object.freeze({
  [EMBLEM_ID]: {
    emblem: EMBLEM,
    skill: COMBINE_SKILL,
  },
  [OVERLOAD_EMBLEM_ID]: {
    emblem: OVERLOAD_EMBLEM,
    skill: OVERLOAD_SKILL,
  },
  [DRAGON_EMBLEM_ID]: {
    emblem: {
      id: DRAGON_EMBLEM_ID,
      name: '神威',
      title: '选择纹章士',
      text: '龙咒：结合期间，一次攻击仅命中一名敌人时，对其施加1层易伤、虚弱和迟缓。',
    },
    skill: DRAGON_SKILL,
  },
  [MASK_EMBLEM_ID]: {
    emblem: {
      id: MASK_EMBLEM_ID,
      name: '风在舞',
      title: '假面纹章士',
      text: '城之祭：结合期间，对敌人造成伤害时额外造成自身最大hp的20%伤害，并使其他队友受到各自最大hp的10%伤害，本人不承受代价。任意单位死亡时，自身及所有存活队友回复20%hp和sp。附加伤害不递归触发。',
    },
    skill: MASK_SKILL,
  },
  [SUPREME_EMBLEM_ID]: {
    emblem: {
      id: SUPREME_EMBLEM_ID,
      name: '玖柒',
      title: '至高纹章士',
      text: '万法归寂：结合期间，自己及所有队友免疫敌人施加的负面状态，并将其返还给施加者。',
    },
    skill: SUPREME_SKILL,
  },
});

export function emblemSkill(definition, skill) {
  const match = EMBLEMS[definition?.emblemId];
  return match?.skill?.id === skill ? match.skill : null;
}

export function canCombine(state, id) {
  const unit = state.units[id];
  const emblemId = state.heroDefinitions?.[id]?.emblemId;
  return (
    unit?.hp > 0 &&
    !!EMBLEMS[emblemId] &&
    state.formation.slice(0, 3).includes(id) &&
    unit.emblemCharge === 6 &&
    !unit.combined
  );
}

export function equipEmblem(library, memberId, emblemId) {
  const member = library.characters.find((entry) => entry.id === memberId);
  if (!member || (emblemId && (!EMBLEMS[emblemId] || !library.emblems?.includes(emblemId))))
    throw Error('纹章士尚未获得');
  if (emblemId)
    for (const entry of library.characters)
      if (entry.id !== memberId && entry.emblemId === emblemId) entry.emblemId = null;
  member.emblemId = emblemId || null;
}

export function emblemRing(definition, unit, selected = false, forecast = unit) {
  const currentCharge = unit.emblemCharge || 0;
  unit = unit.combined ? unit : forecast;
  const config = EMBLEMS[definition?.emblemId]?.emblem;
  if (!config) return '';
  const charge = unit.emblemCharge || 0;
  if (selected && currentCharge === 6 && !unit.combined) return '';
  const future = !unit.combined && charge > currentCharge;
  return `<span class="emblem-ring ${charge === 6 && !future ? 'charged' : ''} ${unit.combined ? 'combined' : ''}" data-tooltip="${config.name} · ${unit.combined ? '结合剩余' + unit.combined + '回合' : currentCharge + '/6充能' + (future ? '，本回合结束预计 +' + (charge - currentCharge) : '')}" aria-label="纹章充能 ${currentCharge}/6${future ? '，预计' + charge + '/6' : ''}"><svg viewBox="0 0 40 40" aria-hidden="true">${Array.from({ length: 6 }, (_, index) => `<circle class="${unit.combined || index < Math.min(currentCharge, charge) ? 'lit' : index < charge ? 'future-charge' : ''}" cx="20" cy="20" r="17" pathLength="60" stroke-dasharray="8 52" transform="rotate(${index * 60 - 88} 20 20)"/>`).join('')}</svg><b>✧</b></span>`;
}
