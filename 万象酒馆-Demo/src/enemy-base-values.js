/** Level-one authored values already include the previous balance change. */
export const ENEMY_BASE_REVISION = 1;
export const ENEMY_DESIGN_LIMITS = Object.freeze({
  revision: ENEMY_BASE_REVISION,
  ordinary: { hp: [12, 360], damage: [1, 41] },
  boss: { hp: [12, 1035], damage: [1, 40] },
  support: [1, 40],
  note: '直接填写1级基础值，参考当前官方敌人；不填等级成长、战斗状态和额外倍率。',
});

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
