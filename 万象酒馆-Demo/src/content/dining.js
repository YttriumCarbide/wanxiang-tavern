const ingredientRows = [
  ['wheat', '麦穗', '谷物', 4, 0],
  ['flour', '面粉', '谷物', 5, 0],
  ['potato', '土豆', '蔬菜', 4, 0],
  ['carrot', '胡萝卜', '蔬菜', 4, 0],
  ['onion', '洋葱', '蔬菜', 4, 0],
  ['tomato', '番茄', '蔬菜', 5, 0],
  ['cabbage', '卷心菜', '蔬菜', 4, 0],
  ['mushroom', '褐菇', '菌菇', 6, 0],
  ['beef', '牛肉', '肉食', 10, 1],
  ['chicken', '鸡腿', '肉食', 8, 0],
  ['pork', '猪肉', '肉食', 8, 0],
  ['fish', '河鱼', '鱼鲜', 8, 0],
  ['egg', '鸡蛋', '蛋奶', 5, 0],
  ['butter', '黄油', '蛋奶', 7, 1],
  ['cheese', '奶酪', '蛋奶', 7, 1],
  ['milk', '鲜奶', '蛋奶', 5, 0],
  ['apple', '苹果', '果香', 5, 0],
  ['grape', '葡萄', '果香', 6, 0],
  ['honey', '蜂蜜', '甜味', 9, 1],
  ['walnut', '核桃', '坚果', 7, 1],
  ['herb', '香草', '清淡', 5, 0],
  ['garlic', '蒜头', '浓香', 4, 0],
  ['salt', '岩盐', '咸鲜', 3, 0],
  ['chili', '红椒', '辛辣', 6, 1],
  ['beer', '麦芽酒', '酒香', 9, 1],
  ['wine', '葡萄酒', '酒香', 14, 2],
  ['bread', '乡村面包', '谷物', 6, 0],
  ['berry', '野莓', '果香', 6, 0],
  ['moonflower', '月露花', '清淡', 20, 2],
  ['sunfruit', '日辉果', '果香', 28, 3],
  ['silverfin', '银鳞灵鱼', '鱼鲜', 24, 2],
  ['stargrain', '星穗米', '谷物', 24, 2],
  ['frost-oyster', '霜脆蕈', '菌菇', 10, 1],
  ['jade-honey', '青晶蜜', '甜味', 14, 2],
  ['fir-shoot', '冷杉嫩芽', '清淡', 8, 1],
  ['mint-leaf', '薄荷叶', '清淡', 6, 0],
  ['amber-root', '岩香根', '蔬菜', 8, 1],
  ['ruby-berry', '绯莓', '果香', 10, 1],
  ['game-bird', '野禽肉', '肉食', 11, 1],
  ['honey-kelp', '蜜藻', '鱼鲜', 12, 1],
];

export const INGREDIENTS = Object.freeze(
  Object.fromEntries(
    ingredientRows.map(([id, name, tag, price, rarity], index) => [
      id,
      {
        id,
        name,
        tags: [tag],
        price,
        rarity,
        index: index % 16,
        sheet: index < 16 ? 'ingredients-a' : index < 32 ? 'ingredients-b' : 'forage',
      },
    ]),
  ),
);

const recipes = [
  [
    'hearth-stew',
    '炉火炖牛肉',
    ['beef', 'potato', 'onion'],
    ['肉食', '浓香'],
    { shieldPercent: 8 },
  ],
  ['herb-chicken', '香草烤鸡', ['chicken', 'herb'], ['肉食', '清淡'], { attackPercent: 5 }],
  ['pan-fish', '田园煎鱼', ['fish', 'carrot'], ['鱼鲜', '清淡'], { mpPercent: 8 }],
  ['mushroom-soup', '奶油蘑菇汤', ['mushroom', 'milk'], ['菌菇', '蛋奶', '清淡'], { hpPercent: 8 }],
  ['cheese-board', '旅人奶酪拼盘', ['bread', 'cheese'], ['谷物', '蛋奶'], { shieldPercent: 6 }],
  ['tomato-egg', '番茄焗蛋', ['tomato', 'egg'], ['蔬菜', '蛋奶'], { hpPercent: 6 }],
  ['cabbage-rolls', '卷心菜肉卷', ['cabbage', 'pork'], ['肉食', '蔬菜'], { shieldPercent: 7 }],
  [
    'roast-roots',
    '炉烤根蔬',
    ['potato', 'carrot', 'garlic'],
    ['蔬菜', '浓香'],
    { hpPercent: 6, mpPercent: 4 },
  ],
  ['apple-pie', '蜜苹果派', ['apple', 'flour', 'honey'], ['甜味', '果香'], { mpPercent: 9 }],
  [
    'berry-crepe',
    '野莓薄饼',
    ['berry', 'flour', 'egg'],
    ['甜味', '果香'],
    { skillDamagePercent: 5 },
  ],
  [
    'walnut-bread',
    '蜂蜜坚果面包',
    ['wheat', 'walnut', 'honey'],
    ['甜味', '坚果', '谷物'],
    { shieldPercent: 5, hpPercent: 4 },
  ],
  [
    'grape-salad',
    '葡萄奶酪沙拉',
    ['grape', 'cheese'],
    ['果香', '蛋奶', '清淡'],
    { mpPercent: 5, hpPercent: 4 },
  ],
  [
    'pepper-beef',
    '红椒铁锅牛肉',
    ['beef', 'chili', 'salt'],
    ['肉食', '辛辣'],
    { attackPercent: 6 },
  ],
  [
    'milk-pudding',
    '星穗奶布丁',
    ['milk', 'stargrain'],
    ['甜味', '蛋奶', '谷物'],
    { mpPercent: 10 },
  ],
  [
    'moonfish-soup',
    '月露银鳞汤',
    ['silverfin', 'moonflower'],
    ['鱼鲜', '清淡'],
    { hpPercent: 7, mpPercent: 7 },
  ],
  [
    'sunfruit-tart',
    '日辉星穗塔',
    ['sunfruit', 'stargrain', 'butter'],
    ['甜味', '果香', '谷物'],
    { shieldPercent: 7, skillDamagePercent: 5 },
  ],
  [
    'frost-chowder',
    '霜蕈浓汤',
    ['frost-oyster', 'milk'],
    ['菌菇', '蛋奶'],
    { hpPercent: 7, shieldPercent: 4 },
  ],
  ['mint-honey-tea', '青蜜薄荷茶', ['jade-honey', 'mint-leaf'], ['甜味', '清淡'], { mpPercent: 8 }],
  ['fir-roast', '冷杉烤禽', ['game-bird', 'fir-shoot'], ['肉食', '清淡'], { attackPercent: 5 }],
  [
    'amber-stew',
    '岩根蜜藻炖汤',
    ['amber-root', 'honey-kelp'],
    ['鱼鲜', '蔬菜'],
    { shieldPercent: 7 },
  ],
  [
    'ruby-tartlet',
    '绯莓挞',
    ['ruby-berry', 'flour', 'butter'],
    ['果香', '甜味'],
    { skillDamagePercent: 5 },
  ],
  ['glazed-roots', '青蜜烤岩根', ['jade-honey', 'amber-root'], ['蔬菜', '甜味'], { hpPercent: 6 }],
  [
    'evergreen-broth',
    '杉芽清汤',
    ['fir-shoot', 'mint-leaf'],
    ['清淡'],
    { mpPercent: 5, hpPercent: 4 },
  ],
  [
    'kelp-salad',
    '蜜藻凉拌',
    ['honey-kelp', 'garlic'],
    ['鱼鲜', '浓香'],
    { mpPercent: 5, shieldPercent: 4 },
  ],
];
export const DISHES = Object.freeze(
  Object.fromEntries(
    recipes.map(([id, name, ingredients, tags, bonus], index) => [
      id,
      {
        id,
        name,
        recipe: Object.fromEntries(ingredients.map((key) => [key, 1])),
        tags,
        bonus,
        sheet: index < 16 ? 'dishes' : 'forage',
        index: index < 16 ? index : index - 8,
        game: index % 2 ? 'heat' : 'chop',
      },
    ]),
  ),
);
export const DIRECT_FOODS = Object.freeze(
  Object.fromEntries(
    [
      'apple',
      'grape',
      'cheese',
      'milk',
      'walnut',
      'beer',
      'wine',
      'bread',
      'berry',
      'sunfruit',
    ].map((id) => [
      id,
      {
        ...INGREDIENTS[id],
        recipe: { [id]: 1 },
        bonus:
          id === 'wine'
            ? { shieldPercent: 4 }
            : id === 'beer'
              ? { shieldPercent: 3 }
              : id === 'sunfruit'
                ? { hpPercent: 5 }
                : { hpPercent: 3 },
        game: null,
      },
    ]),
  ),
);
export const MEAL_FOODS = Object.freeze({ ...DISHES, ...DIRECT_FOODS });
export const FOOD_BONUS_LABELS = Object.freeze({
  hp: '本场生命上限',
  mp: '本场法力上限',
  shield: '入场护盾',
  attack: '本场普攻',
  skillDamage: '本场技能伤害',
  hpPercent: '本场hp上限',
  mpPercent: '本场sp上限',
  shieldPercent: '入场护盾',
  attackPercent: '本场普攻',
  skillDamagePercent: '本场技能伤害',
});
export function foodBonusText(input = {}) {
  const bonus = input?.bonus && typeof input.bonus === 'object' ? input.bonus : input;
  return Object.entries(bonus || {})
    .filter(([, amount]) => amount)
    .map(([key, amount]) =>
      key.endsWith('Percent')
        ? `${FOOD_BONUS_LABELS[key] || key}＋${amount}%`
        : `${FOOD_BONUS_LABELS[key] || key}＋${amount}`,
    )
    .join(' · ');
}
export const DINING_WORLDBOOK =
  '酒馆用餐：菜肴以谷物、肉食、鱼鲜、蔬菜、菌菇、蛋奶、果香、甜味、坚果、清淡、浓香、辛辣、酒香区分。偏好分讨厌、一般、喜欢。以本次餐桌资料中的菜名、原料和角色偏好为准。围绕共同做饭、品尝、分食和人物间回应写Gal对话。偏好不替代性格；礼貌的人即使不喜欢也会照顾厨师感受，直率或无礼的人可以直说，不强迫所有人夸赞或吐槽。不在正文报数值、发放奖励、改变好感或战斗状态，不替玩家编造决定。';
export const FOOD_WORLDBOOK_CONTENT = [
  DINING_WORLDBOOK,
  '食材：' +
    Object.values(INGREDIENTS)
      .map((food) => `${food.name}（${food.tags.join('、')}）`)
      .join('；'),
  '菜谱：' +
    Object.values(DISHES)
      .map(
        (food) =>
          `${food.name}（${Object.keys(food.recipe)
            .map((id) => INGREDIENTS[id].name)
            .join('、')}；${food.tags.join('、')}）`,
      )
      .join('；'),
  '可直接食用：' +
    Object.values(DIRECT_FOODS)
      .map((food) => food.name)
      .join('、'),
].join('\n');
