/** Fixed emblem rules; battle state is the sole owner of charge and duration. */
export function applyEmblemStats(combat) {
  return structuredClone(combat);
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
  damageType: null,
  text: '使敌人的攻击伤害降低15%（可与其他减伤叠乘）并均分至三个前场位置，状态目标不变。每次结合限用一次。',
  effects: [{ type: 'buff', buff: 'balance', value: 1 }],
});

export const OVERLOAD_EMBLEM_ID = 'mizunatsuki-ran';
export const OVERLOAD_EMBLEM = Object.freeze({
  id: OVERLOAD_EMBLEM_ID,
  name: '水无月兰',
  title: '过载纹章士',
  text: '灵能血装：结合期间，最大sp翻倍并立刻回满；每次造成伤害时，获得等同于伤害量的最大hp并同步回复生命（结合结束后上限恢复原值，已获得的生命不扣除）。',
});
export const OVERLOAD_SKILL = Object.freeze({
  id: 'emblem-overload',
  name: '结合技 · 超限负荷',
  ap: 1,
  mp: 0,
  target: 'self',
  damageType: null,
  text: '获得1层超限，使下一次行动重复生效一次（×2）；若为攻击技能，每次攻击额外造成本次结合期间已累计增加的最大sp与最大hp之和的伤害。每次结合限用一次。',
  effects: [{ type: 'buff', buff: 'overload', value: 1 }],
});

export const DRAGON_EMBLEM_ID = 'kamui';
export const MASK_EMBLEM_ID = 'wind-dance';
export const SUPREME_EMBLEM_ID = 'jiu-qi';
export const BREAKER_EMBLEM_ID = 'cang-ming';
export const DRAGON_SKILL = Object.freeze({
  id: 'emblem-dragon-vein',
  name: '结合技 · 龙脉',
  ap: 1,
  mp: 0,
  target: 'self',
  damageType: null,
  mechanic: 'dragonVein',
  effects: [],
  text: '在前场三格刻下龙脉，持续至结合结束后的下下回合开始时（结合结束后额外生效1回合）：左位每回合回复25%最大hp，右位每回合回复25%最大sp，中位持续获得3层铁皮、力量和敏捷。效果属于位置，换人仍保留。每次结合限用一次。',
});
export const MASK_SKILL = Object.freeze({
  id: 'emblem-deceit-sacrifice',
  name: '结合技 · 欺之牺',
  ap: 1,
  mp: 0,
  target: 'ally',
  damageType: null,
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
  damageType: null,
  mechanic: 'moonEye',
  effects: [],
  text: '选择至少有3种负面状态的存活敌人：对非Boss目标令其直接死亡并对其余敌人造成等同于该敌人当前hp的伤害；对Boss目标造成等同于其当前生命值一半的伤害。每次结合限用一次。',
});
export const BREAKER_SKILL = Object.freeze({
  id: 'emblem-shatter-shell',
  name: '结合技 · 裂壳共鸣',
  ap: 1,
  mp: 0,
  target: 'enemy',
  damageType: null,
  mechanic: 'shatterShell',
  effects: [],
  text: '移除目标所有护盾，并为我方全部存活角色回复等同于本次移除护盾数量的生命值；若目标处于可击破状态，将其剩余韧性调整为1层。每次结合限用一次。',
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
      text: '龙咒：结合期间，每回合第一次造成伤害时，对本次命中的所有敌人各施加1层易伤、虚弱和迟缓。',
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
  [BREAKER_EMBLEM_ID]: {
    emblem: {
      id: BREAKER_EMBLEM_ID,
      name: '苍铭',
      title: '破壁纹章士',
      text: '破壳共鸣：结合期间，普攻与技能命中目标时额外削减1层韧性（未命中弱点亦可削减1层），并对护盾造成双倍破盾效果；每次击破敌方护盾或触发破防时，为我方全前排施加6点护盾。',
    },
    skill: BREAKER_SKILL,
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

export const EMBLEM_VISUALS = Object.freeze({
  [EMBLEM_ID]: Object.freeze({
    id: EMBLEM_ID,
    cssClass: 'emblem-tan-hongyu',
    auraStyle: 'solar-scales',
    primary: '#f2c15a',
    secondary: '#4de1c4',
    glow: '#ffe082',
    accent: '#ffb300',
    core: '#fff7d6',
    deep: '#5c3c08',
    pixelfxPalette: Object.freeze(['#482606', '#a86716', '#f2c15a', '#4de1c4', '#fff5cc']),
    engageFx: 'holy-pillar',
    skillFx: 'star-fall',
    passiveFx: 'blessing',
  }),
  [OVERLOAD_EMBLEM_ID]: Object.freeze({
    id: OVERLOAD_EMBLEM_ID,
    cssClass: 'emblem-mizunatsuki-ran',
    auraStyle: 'overload-arc',
    primary: '#c87eff',
    secondary: '#ff5eb8',
    glow: '#e4a8ff',
    accent: '#7848ff',
    core: '#fdf2ff',
    deep: '#33115e',
    pixelfxPalette: Object.freeze(['#260a47', '#6c24b8', '#c87eff', '#ff5eb8', '#ffffff']),
    engageFx: 'charge-up',
    skillFx: 'chain-lightning',
    passiveFx: 'zap-hit',
  }),
  [DRAGON_EMBLEM_ID]: Object.freeze({
    id: DRAGON_EMBLEM_ID,
    cssClass: 'emblem-kamui',
    auraStyle: 'dragon-tide',
    primary: '#3fd4c6',
    secondary: '#2f82ff',
    glow: '#88f5eb',
    accent: '#18a4e0',
    core: '#e6fffb',
    deep: '#0a3342',
    pixelfxPalette: Object.freeze(['#082438', '#14628c', '#2fb8ff', '#5cf2d6', '#ebfffe']),
    engageFx: 'geyser',
    skillFx: 'wave-crash',
    passiveFx: 'ripples',
  }),
  [MASK_EMBLEM_ID]: Object.freeze({
    id: MASK_EMBLEM_ID,
    cssClass: 'emblem-wind-dance',
    auraStyle: 'phantom-veil',
    primary: '#ef4d6d',
    secondary: '#9c2c52',
    glow: '#ff8da3',
    accent: '#c82348',
    core: '#ffe8ed',
    deep: '#2e0814',
    pixelfxPalette: Object.freeze(['#21050c', '#6e1026', '#ef4d6d', '#ffa6b8', '#fff0f3']),
    engageFx: 'hex-sigil',
    skillFx: 'shadow-flames',
    passiveFx: 'curse',
  }),
  [SUPREME_EMBLEM_ID]: Object.freeze({
    id: SUPREME_EMBLEM_ID,
    cssClass: 'emblem-jiu-qi',
    auraStyle: 'moon-eclipse',
    primary: '#ffd56b',
    secondary: '#93a6ff',
    glow: '#e8efff',
    accent: '#6a7cff',
    core: '#ffffff',
    deep: '#19204a',
    pixelfxPalette: Object.freeze(['#12183a', '#4457b8', '#93a6ff', '#ffd56b', '#ffffff']),
    engageFx: 'eclipse',
    skillFx: 'arcane-beam',
    passiveFx: 'halo',
  }),
  [BREAKER_EMBLEM_ID]: Object.freeze({
    id: BREAKER_EMBLEM_ID,
    cssClass: 'emblem-cang-ming',
    auraStyle: 'shatter-crest',
    primary: '#f28b49',
    secondary: '#ffd17a',
    glow: '#ffc180',
    accent: '#e05a2b',
    core: '#fff4e0',
    deep: '#4a1b08',
    pixelfxPalette: Object.freeze(['#3d1305', '#9e3614', '#f28b49', '#ffd17a', '#fff6e5']),
    engageFx: 'holy-pillar',
    skillFx: 'star-fall',
    passiveFx: 'blessing',
  }),
});

export function emblemVisualFor(emblemId) {
  return EMBLEM_VISUALS[emblemId] || EMBLEM_VISUALS[EMBLEM_ID];
}

export function emblemRing(definition, unit, selected = false, forecast = unit) {
  const currentCharge = unit.emblemCharge || 0;
  unit = unit.combined ? unit : forecast;
  const config = EMBLEMS[definition?.emblemId]?.emblem;
  if (!config) return '';
  const visual = emblemVisualFor(definition?.emblemId);
  const charge = unit.emblemCharge || 0;
  if (selected && currentCharge === 6 && !unit.combined) return '';
  const future = !unit.combined && charge > currentCharge;
  return `<span class="emblem-ring ${charge === 6 && !future ? 'charged' : ''} ${unit.combined ? 'combined' : ''}" style="--emblem-ring-color:${visual.primary};--emblem-ring-glow:${visual.glow}" data-tooltip="${config.name} · ${unit.combined ? '结合剩余' + unit.combined + '回合' : currentCharge + '/6充能' + (future ? '，本回合结束预计 +' + (charge - currentCharge) : '')}" aria-label="纹章充能 ${currentCharge}/6${future ? '，预计' + charge + '/6' : ''}"><svg viewBox="0 0 40 40" aria-hidden="true">${Array.from({ length: 6 }, (_, index) => `<circle class="${unit.combined || index < Math.min(currentCharge, charge) ? 'lit' : index < charge ? 'future-charge' : ''}" cx="20" cy="20" r="17" pathLength="60" stroke-dasharray="8 52" transform="rotate(${index * 60 - 88} 20 20)"/>`).join('')}</svg><b>✧</b></span>`;
}
