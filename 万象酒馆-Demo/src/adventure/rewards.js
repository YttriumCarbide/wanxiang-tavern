import { ITEMS } from '../content/items.js';

/** Independent of the chosen story option; rare supplies carry a lower draw weight. */
export const EVENT_REWARD_POOL = Object.freeze([
  { id: 'coins', weight: 18, gold: [18, 28] },
  { id: 'ether', weight: 12, ether: [8, 16] },
  { id: 'health', weight: 12, items: { 'health-potion': 1 } },
  { id: 'mana', weight: 12, items: { 'mana-potion': 1 } },
  { id: 'strength', weight: 7, items: { 'strength-potion': 1 } },
  { id: 'slow', weight: 7, items: { 'slow-potion': 1 } },
  { id: 'recovery', weight: 6, items: { 'recovery-potion': 1 } },
  { id: 'calamity', weight: 4, items: { 'calamity-scroll': 1 } },
  { id: 'fine-health', weight: 3, items: { 'fine-health-potion': 1 } },
  { id: 'fine-mana', weight: 3, items: { 'fine-mana-potion': 1 } },
  { id: 'paired-potions', weight: 3, items: { 'health-potion': 1, 'mana-potion': 1 } },
  { id: 'travel-supplies', weight: 4, gold: [6, 10], items: { 'health-potion': 1 } },
  { id: 'ether-purse', weight: 4, gold: [8, 12], ether: [4, 8] },
  { id: 'contract', weight: 1, summonContracts: 1 },
]);

export function rollEventReward(seed) {
  let state = 2166136261;
  for (const character of String(seed))
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  function random() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  let draw = random() * EVENT_REWARD_POOL.reduce((sum, item) => sum + item.weight, 0);
  const selected = EVENT_REWARD_POOL.find((item) => (draw -= item.weight) < 0);
  const amount = (range) =>
    range ? range[0] + Math.floor(random() * (range[1] - range[0] + 1)) : 0;
  return {
    poolId: selected.id,
    summonContracts: selected.summonContracts || 0,
    gold: amount(selected.gold),
    ether: amount(selected.ether),
    items: { ...selected.items },
  };
}

export function validEventReward(reward) {
  const pool = EVENT_REWARD_POOL.find((item) => item.id === reward?.poolId);
  const inRange = (value, range) =>
    Number.isSafeInteger(value) && (range ? value >= range[0] && value <= range[1] : value === 0);
  return !!(
    pool &&
    inRange(reward.gold, pool.gold) &&
    inRange(reward.ether, pool.ether) &&
    reward.summonContracts === (pool.summonContracts || 0) &&
    reward.items &&
    typeof reward.items === 'object' &&
    !Array.isArray(reward.items) &&
    Object.keys(reward.items).length === Object.keys(pool.items || {}).length &&
    Object.entries(reward.items).every(([id, count]) => ITEMS[id] && pool.items?.[id] === count)
  );
}

/** Old saves receive the same seeded roll; new saves already carry the complete reward. */
export function eventReward(expedition) {
  const event = expedition.adventure.event;
  event.reward ??= rollEventReward(`${expedition.id}:event-2`);
  if (!validEventReward(event.reward)) throw Error('事件奖励存档无效');
  return event.reward;
}

export function eventRewardText(reward) {
  return [
    reward.gold ? `${reward.gold} 金币` : '',
    reward.ether ? `${reward.ether} 以太` : '',
    reward.summonContracts ? `召唤契约 ×${reward.summonContracts}` : '',
    ...Object.entries(reward.items).map(([id, count]) => `${ITEMS[id].name} ×${count}`),
  ]
    .filter(Boolean)
    .join(' · ');
}
