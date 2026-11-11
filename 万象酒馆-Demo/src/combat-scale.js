const POWER = [
  [1, 1],
  [5, 1.35],
  [10, 1.8],
  [20, 2.7],
  [21, 3.1],
  [40, 4.5],
  [41, 5.2],
  [60, 6.5],
  [61, 7.5],
  [80, 8.7],
  [81, 10],
  [90, 10.8],
  [91, 12.4],
  [99, 13.2],
];
const RANKS = [
  [20, '普通'],
  [40, '精锐'],
  [60, '超凡'],
  [80, '史诗'],
  [90, '传说'],
  [100, '神话'],
  [110, '不朽'],
  [120, '起源'],
];

export function combatRank(level) {
  return RANKS.find(([last]) => level <= last)?.[1] || '起源';
}

export function combatScale(level) {
  if (!(level > 1)) return 1;
  const index = POWER.findIndex(([at]) => at >= level);
  if (index < 0) return POWER.at(-1)[1];
  const [from, low] = POWER[index - 1];
  const [to, high] = POWER[index];
  return low + ((high - low) * (level - from)) / (to - from);
}

/** Scale a move once. Consecutive parts of the same hit pattern share rounding and gear bonuses. */
export function scaleMoveEffects(effects, scale, bonus = 0) {
  if (scale === 1 && !bonus) return effects;
  const groups = new Map();
  for (const effect of effects) {
    if (effect.type !== 'damage' || effect.flat) continue;
    const key = JSON.stringify([effect.target, effect.when]);
    const group = groups.get(key) || { total: 0, prior: 0, rounded: 0 };
    group.total += effect.value;
    groups.set(key, group);
  }
  const allDamage = [...groups.values()].reduce((total, group) => total + group.total, 0);
  return effects.map((effect) => {
    if (effect.type !== 'damage' || effect.flat) return effect;
    const group = groups.get(JSON.stringify([effect.target, effect.when]));
    group.prior += effect.value;
    const rounded = Math.round(group.prior * (scale + bonus / Math.max(1, allDamage)));
    const value = rounded - group.rounded;
    group.rounded = rounded;
    return {
      ...effect,
      value,
      ...(effect.perMark ? { perMark: Math.round(effect.perMark * scale) } : {}),
    };
  });
}
