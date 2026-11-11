import { DROP_GROUPS } from './content/enemy-drops.js';
import { INGREDIENTS } from './content/dining.js';
import { ITEMS } from './content/items.js';
import { claimBattleRewards } from './rewards.js';
import { definition } from './catalog.js';
import { DEFINITIONS } from './data.js';

const byPortrait = Object.freeze(
  Object.fromEntries(
    Object.entries(DROP_GROUPS).flatMap(([item, cards]) => cards.map((card) => [card, item])),
  ),
);
const bossCards = new Set(
  Object.values(DEFINITIONS)
    .filter((enemy) => enemy.boss)
    .map((enemy) => enemy.portrait),
);

export function enemyDropTable(enemy) {
  const primary = byPortrait[enemy?.portrait] || 'bread';
  const rare = bossCards.has(enemy?.portrait);
  return {
    primary,
    primaryChance: rare ? 0.85 : 0.48,
    extra: rare ? 'fine-recovery-potion' : 'health-potion',
    extraChance: rare ? 0.2 : 0.07,
  };
}

function roll(seed) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value / 4294967296;
}

/** Only accepted kills mint loot. Each run, battle and enemy has one claim. */
export function claimEnemyDrops(library, expedition, state, result) {
  if (!expedition || expedition.chapter || !Array.isArray(result.deaths)) return [];
  const loot = [];
  for (const death of result.deaths) {
    if (state.units[death.id]?.side !== 'enemy') continue;
    const enemy = definition(state, death.id);
    if (!enemy || enemy.nonlethal) continue;
    const claim = `${expedition.id}:drop:${state.encounter}:${death.id}`;
    const table = enemyDropTable(enemy);
    const drops = [];
    if (roll(`${claim}:primary`) < table.primaryChance) drops.push(table.primary);
    if (roll(`${claim}:extra`) < table.extraChance) drops.push(table.extra);
    if (!drops.length) continue;
    const items = {};
    for (const id of drops) if (ITEMS[id]) items[id] = (items[id] || 0) + 1;
    if (!claimBattleRewards(library, claim, { summonContracts: 0, items })) continue;
    for (const id of drops) {
      if (INGREDIENTS[id])
        library.dining.inventory[id] = Math.min(9999, (library.dining.inventory[id] || 0) + 1);
      loot.push((INGREDIENTS[id] || ITEMS[id]).name);
    }
  }
  return loot;
}
