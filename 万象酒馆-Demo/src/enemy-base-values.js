import { statusStacks } from './status-rules.js';
import { enemyIntentText } from './enemy-intent-text.js';

/** Level-one authored values already include the previous balance change. */
export const ENEMY_BASE_REVISION = 1;
export const ENEMY_DESIGN_LIMITS = Object.freeze({
  revision: ENEMY_BASE_REVISION,
  ordinary: { hp: [12, 360], damage: [1, 41] },
  boss: { hp: [12, 1035], damage: [1, 40] },
  support: [1, 40],
  note: '直接填写1级基础值，参考当前官方敌人；不填等级成长、战斗状态和额外倍率。',
});

export const ENEMY_TIERS = Object.freeze(['low', 'medium', 'high']);

export const ENEMY_TIER_TABLES = Object.freeze({
  ordinary: Object.freeze({
    hp: Object.freeze({ low: [32, 40], medium: [44, 52], high: [56, 66] }),
    damage: Object.freeze({ low: [7, 8], medium: [9, 11], high: [12, 14] }),
    support: Object.freeze({ low: [6, 8], medium: [10, 12], high: [14, 18] }),
    dot: Object.freeze({ low: [2, 3], medium: [4, 5], high: [6, 7] }),
    strongBuff: Object.freeze({ low: 1, medium: 1, high: 2 }),
    mana: Object.freeze({ low: 2, medium: 3, high: 4 }),
  }),
  boss: Object.freeze({
    hp: Object.freeze({ low: [120, 145], medium: [155, 185], high: [200, 240] }),
    damage: Object.freeze({ low: [12, 14], medium: [16, 19], high: [21, 25] }),
    support: Object.freeze({ low: [12, 16], medium: [18, 24], high: [26, 34] }),
    dot: Object.freeze({ low: [3, 4], medium: [5, 6], high: [8, 10] }),
    strongBuff: Object.freeze({ low: 1, medium: 2, high: 3 }),
    mana: Object.freeze({ low: 3, medium: 4, high: 6 }),
  }),
  speedModifiers: Object.freeze({ 1: 1.1, 2: 1.05, 3: 1, 4: 0.95, 5: 0.9 }),
  slotDamageModifiers: Object.freeze({ 1: 1, 2: 0.78, 3: 0.62 }),
  aoeSupportModifier: 0.68,
  controlTax: 0.85,
  multiHitDamageModifiers: Object.freeze({ 1: 1, 2: 0.65, 3: 0.48, 4: 0.38, 5: 0.32 }),
  statusStacks: Object.freeze({
    bind: Object.freeze({ low: 1, medium: 1, high: 1 }),
    flying: Object.freeze({ low: 1, medium: 1, high: 2 }),
    haste: Object.freeze({ low: 1, medium: 1, high: 2 }),
    weak: Object.freeze({ low: 1, medium: 2, high: 3 }),
    vulnerable: Object.freeze({ low: 1, medium: 2, high: 3 }),
    iron: Object.freeze({ low: 1, medium: 2, high: 3 }),
  }),
});

export const ENEMY_TIER_GUIDE = Object.freeze({
  mode: 'tier-power',
  tiers: ENEMY_TIERS,
  speed: [1, 5],
  tables: ENEMY_TIER_TABLES,
  note: '不要直接填hp或effect.value；敌人生命用tier(low/medium/high)，每个effect用power(low/medium/high)，程序会按速度、命中格数、控制/群体数量折算1级基础数值并随关卡等级自动成长。',
});

function seedOf(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function pickInRange([min, max], key) {
  return min + (seedOf(key) % (max - min + 1));
}

function compileBuffValue(effect, table, boss, seedKey) {
  const { buff, power } = effect;
  if (['poison', 'bleed'].includes(buff)) return pickInRange(table.dot[power], seedKey);
  if (['strength', 'guard', 'regen'].includes(buff)) return table.strongBuff[power];
  const raw = ENEMY_TIER_TABLES.statusStacks[buff]?.[power] ?? 1;
  return statusStacks(buff, !boss && buff === 'haste' ? Math.min(1, raw) : raw);
}

function compileEnemyMove(enemyId, move, moveKey, boss) {
  const table = ENEMY_TIER_TABLES[boss ? 'boss' : 'ordinary'];
  const list = move.effects || [];
  const damageCount = list.filter((effect) => effect.type === 'damage').length;
  const supportCount = list.filter((effect) => ['heal', 'shield'].includes(effect.type)).length;
  const hasExtra = list.some((effect) => effect.type !== 'damage');
  const slotMod = ENEMY_TIER_TABLES.slotDamageModifiers[move.slots.length] ?? 0.62;
  const multiHitMod =
    ENEMY_TIER_TABLES.multiHitDamageModifiers[Math.min(5, Math.max(1, damageCount))];
  const multiSupportMod = supportCount > 1 ? Math.max(0.55, 1 / Math.sqrt(supportCount)) : 1;
  const compiledEffects = list.map((effect, index) => {
    const seedKey = `${enemyId}:${moveKey}:${effect.type}:${effect.buff || ''}:${index}`;
    let value;
    if (effect.type === 'damage') {
      const base = pickInRange(table.damage[effect.power], seedKey);
      const controlTax = hasExtra ? ENEMY_TIER_TABLES.controlTax : 1;
      value = Math.max(1, Math.round(base * slotMod * multiHitMod * controlTax));
    } else if (effect.type === 'heal' || effect.type === 'shield') {
      const base = pickInRange(table.support[effect.power], seedKey);
      const scopeMod = effect.target === 'allAllies' ? ENEMY_TIER_TABLES.aoeSupportModifier : 1;
      const hybridTax = damageCount > 0 ? ENEMY_TIER_TABLES.controlTax : 1;
      value = Math.max(1, Math.round(base * scopeMod * hybridTax * multiSupportMod));
    } else if (effect.type === 'mana') {
      value = table.mana[effect.power];
    } else {
      value = compileBuffValue(effect, table, boss, seedKey);
    }
    return {
      type: effect.type,
      target: effect.target,
      value,
      ...(effect.type === 'buff' ? { buff: effect.buff } : {}),
    };
  });
  const compiled = { name: move.name, slots: move.slots, effects: compiledEffects };
  return { ...compiled, text: enemyIntentText(compiled) };
}

/** Compile a tier/power enemy specification deterministically into a Lv.1 base definition. */
export function compileEnemyDesign(id, tier, speed, intents, enragedIntents, boss = false) {
  const table = ENEMY_TIER_TABLES[boss ? 'boss' : 'ordinary'];
  const baseHp = pickInRange(table.hp[tier], `${id}:hp:${tier}`);
  const speedMod = ENEMY_TIER_TABLES.speedModifiers[speed] ?? 1;
  const hp = Math.max(1, Math.round(baseHp * speedMod));
  const compiledIntents = intents.map((move, index) =>
    compileEnemyMove(id, move, `intent:${index}`, boss),
  );
  const compiledEnraged = enragedIntents
    ? enragedIntents.map((move, index) => compileEnemyMove(id, move, `enraged:${index}`, boss))
    : compiledIntents;
  return { hp, intents: compiledIntents, enragedIntents: compiledEnraged };
}

/** Only old saved templates need conversion; new API results are never scaled. */
export function restoreEnemyBaseValues(source) {
  const enemy = structuredClone(source);
  if (enemy.baseRevision === ENEMY_BASE_REVISION) return enemy;
  enemy.hp = Math.round(enemy.hp * (enemy.boss ? 1.15 : 1.2));
  if (!enemy.boss)
    for (const move of [
      enemy.openingIntent,
      ...(enemy.intents || []),
      ...(enemy.enragedIntents || []),
    ].filter(Boolean)) {
      for (const effect of move.effects || [])
        if (effect.type === 'damage' && !effect.flat) effect.value++;
      if (move.text)
        move.text = move.text.replace(
          /(\d+)((?:点)?伤害)/g,
          (_, value, suffix) => `${Number(value) + 1}${suffix}`,
        );
    }
  enemy.baseRevision = ENEMY_BASE_REVISION;
  return enemy;
}
