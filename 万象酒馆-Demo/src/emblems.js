/** Fixed emblem rules; battle state is the sole owner of charge and duration. */
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
  cost: 100,
});
export const OVERLOAD_SKILL = Object.freeze({
  id: 'emblem-overload',
  name: '结合技 · 超限负荷',
  ap: 1,
  mp: 0,
  target: 'self',
  text: '下次释放技能时消耗改为两倍，并使技能视为此消耗额外生效一次。每次结合限用一次。',
  effects: [{ type: 'buff', buff: 'overload', value: 1 }],
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
  if (
    emblemId &&
    library.characters.some((entry) => entry.id !== memberId && entry.emblemId === emblemId)
  )
    throw Error('纹章士已与其他角色同行，请先卸下');
  member.emblemId = emblemId || null;
}

export function emblemRing(definition, unit, selected = false, forecast = unit) {
  unit = unit.combined ? unit : forecast;
  const config = EMBLEMS[definition?.emblemId]?.emblem;
  if (!config) return '';
  const charge = unit.emblemCharge || 0;
  if (selected && charge === 6 && !unit.combined) return '';
  return `<span class="emblem-ring ${charge === 6 ? 'charged' : ''} ${unit.combined ? 'combined' : ''}" data-tooltip="${config.name} · ${unit.combined ? '结合剩余' + unit.combined + '回合' : charge + '/6充能'}" aria-label="纹章充能 ${charge}/6"><svg viewBox="0 0 40 40" aria-hidden="true">${Array.from({ length: 6 }, (_, index) => `<circle class="${index < charge || unit.combined ? 'lit' : ''}" cx="20" cy="20" r="17" pathLength="60" stroke-dasharray="8 52" transform="rotate(${index * 60 - 88} 20 20)"/>`).join('')}</svg><b>✧</b></span>`;
}
