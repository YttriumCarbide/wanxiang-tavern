import { encounterSpec, DEFINITIONS, enemySlots } from '../../data.js';

/** The same encounterSpec used by the expedition decides the cast before generation. */
export function encounterEnemies(index, boss) {
  const spec = encounterSpec(index, boss);
  return enemiesForSpec(spec);
}
export function enemiesForSpec(spec) {
  return enemySlots(spec.enemyIds).flatMap((id, slot) => {
    if (!id) return [];
    const enemy = spec.enemyDefinitions?.[id] || DEFINITIONS[id];
    return [
      {
        id,
        name: enemy.name,
        position: ['左侧', '中央', '右侧'][slot],
        boss: enemy.boss === true,
        possibleActions: [...enemy.intents, ...(enemy.enragedIntents || [])].map(
          (intent) => intent.name,
        ),
        settingSource: '已激活的副本怪物图鉴世界书；能力仅供描写，不是已发生事件',
      },
    ];
  });
}
