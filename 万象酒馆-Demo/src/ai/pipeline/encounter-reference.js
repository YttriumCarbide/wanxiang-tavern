import { encounterSpec, DEFINITIONS, enemySlots } from '../../data.js';

/** The same encounterSpec used by the expedition decides the cast before generation. */
export function encounterEnemies(index, boss) {
  const spec = encounterSpec(index, boss);
  return enemiesForSpec(spec);
}
export function enemiesForSpec(spec) {
  const slots = enemySlots(spec.enemyIds, spec.enemyDefinitions);
  return spec.enemyIds.map((id) => {
    const slot = Math.max(0, slots.indexOf(id));
    const enemy = spec.enemyDefinitions?.[id] || DEFINITIONS[id];
    return {
      id,
      name: enemy.name,
      position: ['左侧', '中央', '右侧'][slot],
      boss: enemy.boss === true,
      ...(enemy.openingIntent ? { openingAttack: enemy.openingIntent.text } : {}),
      possibleActions: [
        ...(enemy.openingIntent ? [enemy.openingIntent] : []),
        ...enemy.intents,
        ...(enemy.enragedIntents || []),
      ].map((intent) => intent.name),
      settingSource: '世界书中的怪物设定；敌人能力与战斗行为以游戏数据和已发生事件为准',
    };
  });
}
