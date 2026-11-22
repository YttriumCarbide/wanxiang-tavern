/** Code-owned consumables; archive loot remains a separate ether settlement. */
function potion(id, name, color, price, effects, text, target = 'ally', art = id) {
  return Object.freeze({
    id,
    name,
    color,
    price,
    effects,
    text,
    target,
    ap: 1,
    icon: './assets/items/' + art + '.svg',
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
      potion(
        'mana-potion',
        '魔力药水',
        '#70cbed',
        20,
        [{ type: 'mana', maxMpPercent: 0.25 }],
        '回复最大法力的25%。',
      ),
      potion(
        'fine-mana-potion',
        '优质魔力药水',
        '#469bff',
        40,
        [{ type: 'mana', maxMpPercent: 0.45 }],
        '回复最大法力的45%。',
      ),
      potion(
        'health-potion',
        '生命药水',
        '#e98c91',
        20,
        [{ type: 'heal', maxHpPercent: 0.25 }],
        '回复最大生命的25%。',
      ),
      potion(
        'fine-health-potion',
        '优质生命药水',
        '#e45176',
        40,
        [{ type: 'heal', maxHpPercent: 0.45 }],
        '回复最大生命的45%。',
      ),
      potion(
        'strength-potion',
        '力量药水',
        '#edbd75',
        30,
        [{ type: 'buff', buff: 'strength', value: 1 }],
        '获得1层力量，每层使直接伤害增加10%。',
      ),
      potion(
        'fine-strength-potion',
        '优质力量药水',
        '#ef954a',
        60,
        [{ type: 'buff', buff: 'strength', value: 2 }],
        '获得2层力量，每层使直接伤害增加10%。',
      ),
      potion(
        'recovery-potion',
        '恢复药水',
        '#80d6b0',
        35,
        [
          { type: 'heal', maxHpPercent: 0.2 },
          { type: 'mana', maxMpPercent: 0.2 },
        ],
        '回复最大生命与最大法力的20%。',
      ),
      potion(
        'fine-recovery-potion',
        '优质恢复药水',
        '#4cc9c4',
        70,
        [
          { type: 'heal', maxHpPercent: 0.35 },
          { type: 'mana', maxMpPercent: 0.35 },
        ],
        '回复最大生命与最大法力的35%。',
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
      potion(
        'artifact-potion',
        '人工制品',
        '#edbd75',
        30,
        [{ type: 'buff', buff: 'artifact', value: 1 }],
        '获得1层人工制品。',
        'ally',
        'strength-potion',
      ),
      potion(
        'fine-artifact-potion',
        '优质人工制品',
        '#ef954a',
        60,
        [{ type: 'buff', buff: 'artifact', value: 2 }],
        '获得2层人工制品。',
        'ally',
        'fine-strength-potion',
      ),
      potion(
        'confusion-potion',
        '混乱药水',
        '#b7a4e9',
        40,
        [{ type: 'buff', buff: 'confusion', value: 1 }],
        '施加1层混乱。',
        'enemy',
        'slow-potion',
      ),
      potion(
        'fine-confusion-potion',
        '优质混乱药水',
        '#9a74ed',
        80,
        [{ type: 'buff', buff: 'confusion', value: 2 }],
        '施加2层混乱。',
        'enemy',
        'fine-slow-potion',
      ),
      potion(
        'blind-scroll',
        '致盲卷轴',
        '#c2a7e0',
        25,
        [{ type: 'buff', buff: 'blind', value: 1 }],
        '施加1层致盲。',
        'enemy',
        'calamity-scroll',
      ),
      potion(
        'fine-blind-scroll',
        '优质致盲卷轴',
        '#d497e8',
        50,
        [{ type: 'buff', buff: 'blind', value: 2 }],
        '施加2层致盲。',
        'enemy',
        'fine-calamity-scroll',
      ),
      potion(
        'cleanse-scroll',
        '净化卷轴',
        '#c2a7e0',
        35,
        [{ type: 'cleanse' }],
        '净化目标身上的所有负面状态。',
        'ally',
        'calamity-scroll',
      ),
      potion(
        'flying-scroll',
        '飞行卷轴',
        '#c2a7e0',
        45,
        [{ type: 'buff', buff: 'flying', value: 1 }],
        '获得1层飞行。',
        'ally',
        'calamity-scroll',
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
