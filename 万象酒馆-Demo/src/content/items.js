/** Code-owned consumables; archive loot remains a separate ether settlement. */
function potion(id, name, color, price, effects, text, target = 'ally') {
  return Object.freeze({
    id,
    name,
    color,
    price,
    effects,
    text,
    target,
    ap: 1,
    icon: './assets/items/' + id + '.svg',
  });
}
export const ITEMS = Object.freeze(
  Object.fromEntries(
    [
      potion(
        'slow-potion',
        '迟缓药水',
        '#b7a4e9',
        25,
        [{ type: 'buff', buff: 'slow', value: 1 }],
        '施加1层迟缓。',
        'enemy',
      ),
      potion(
        'fine-slow-potion',
        '优质迟缓药水',
        '#9a74ed',
        50,
        [{ type: 'buff', buff: 'slow', value: 2 }],
        '施加2层迟缓。',
        'enemy',
      ),
      potion('mana-potion', '魔力药水', '#70cbed', 20, [{ type: 'mana', value: 8 }], '回复8法力。'),
      potion(
        'fine-mana-potion',
        '优质魔力药水',
        '#469bff',
        40,
        [{ type: 'mana', value: 16 }],
        '回复16法力。',
      ),
      potion(
        'health-potion',
        '生命药水',
        '#e98c91',
        20,
        [{ type: 'heal', value: 12 }],
        '回复12生命。',
      ),
      potion(
        'fine-health-potion',
        '优质生命药水',
        '#e45176',
        40,
        [{ type: 'heal', value: 24 }],
        '回复24生命。',
      ),
      potion(
        'strength-potion',
        '力量药水',
        '#edbd75',
        30,
        [{ type: 'buff', buff: 'strength', value: 1 }],
        '获得1层力量，本场攻击伤害增加1。',
      ),
      potion(
        'fine-strength-potion',
        '优质力量药水',
        '#ef954a',
        60,
        [{ type: 'buff', buff: 'strength', value: 2 }],
        '获得2层力量，本场攻击伤害增加2。',
      ),
      potion(
        'recovery-potion',
        '恢复药水',
        '#80d6b0',
        35,
        [
          { type: 'heal', value: 8 },
          { type: 'mana', value: 6 },
        ],
        '回复8生命与6法力。',
      ),
      potion(
        'fine-recovery-potion',
        '优质恢复药水',
        '#4cc9c4',
        70,
        [
          { type: 'heal', value: 16 },
          { type: 'mana', value: 12 },
        ],
        '回复16生命与12法力。',
      ),
      potion(
        'calamity-scroll',
        '灾星卷轴',
        '#c2a7e0',
        40,
        [
          { type: 'buff', buff: 'weak', value: 2 },
          { type: 'buff', buff: 'vulnerable', value: 2 },
        ],
        '施加2层虚弱和2层易伤。',
        'enemy',
      ),
      potion(
        'fine-calamity-scroll',
        '优质灾星卷轴',
        '#d497e8',
        80,
        [
          { type: 'buff', buff: 'weak', value: 4 },
          { type: 'buff', buff: 'vulnerable', value: 4 },
        ],
        '施加4层虚弱和4层易伤。',
        'enemy',
      ),
    ].map((item) => [item.id, item]),
  ),
);

export function restoreBag(value) {
  return Object.fromEntries(
    Object.keys(ITEMS).map((id) => [
      id,
      Number.isSafeInteger(value?.[id]) && value[id] >= 0 ? Math.min(9999, value[id]) : 0,
    ]),
  );
}

/** A purchase is atomic: a failed purchase changes neither gold nor inventory. */
export function buyItem(library, id) {
  const item = ITEMS[id];
  const inventory = library.inventory;
  if (!item || !inventory || !Number.isSafeInteger(inventory.gold) || inventory.gold < item.price)
    return { ok: false, message: '金币不足，无法购买。' };
  inventory.items = restoreBag(inventory.items);
  if (inventory.items[id] >= 9999) return { ok: false, message: '该道具已达到持有上限。' };
  inventory.gold -= item.price;
  inventory.items[id]++;
  inventory.bagUnlocked = true;
  if (library.campaign) library.campaign.shopPurchased = true;
  return { ok: true, item };
}
