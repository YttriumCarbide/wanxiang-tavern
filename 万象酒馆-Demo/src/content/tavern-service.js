const menuRows = [
  ['herb-chicken', '香草烤鸡', 12, 'heat', 'herb-chicken'],
  ['mushroom-soup', '奶油蘑菇汤', 9, 'stir', 'mushroom-soup'],
  ['berry-crepe', '野莓薄饼', 10, 'flip', 'berry-crepe'],
  ['pan-fish', '田园煎鱼', 11, 'cut', 'pan-fish'],
  ['mint-honey-tea', '薄荷蜜茶', 7, 'pour', 'mint-honey-tea'],
  ['kelp-salad', '琥珀海藻凉拌', 8, 'season', 'kelp-salad'],
  ['glazed-roots', '金蜜根片', 8, 'roll', 'glazed-roots'],
  ['hearth-stew', '炉火炖牛肉', 14, 'skim', 'hearth-stew'],
  ['cheese-board', '旅人奶酪拼盘', 8, 'plate', 'cheese-board'],
  ['tomato-egg', '番茄焗蛋', 9, 'flip', 'tomato-egg'],
  ['apple-pie', '蜜苹果派', 8, 'knead', 'apple-pie'],
  ['grape-salad', '葡萄奶酪沙拉', 9, 'plate', 'grape-salad'],
  ['pepper-beef', '红椒铁锅牛肉', 13, 'sear', 'pepper-beef'],
  ['milk-pudding', '星穗奶布丁', 10, 'whisk', 'milk-pudding'],
  ['moonfish-soup', '月露银鳞汤', 13, 'pour', 'moonfish-soup'],
  ['sunfruit-tart', '日辉星穗塔', 14, 'pipe', 'sunfruit-tart'],
  ['frost-chowder', '霜蕈浓汤', 11, 'whisk', 'frost-chowder'],
  ['fir-roast', '冷杉烤禽', 13, 'heat', 'fir-roast'],
  ['cabbage-rolls', '卷心菜肉卷', 10, 'roll', 'cabbage-rolls'],
  ['roast-roots', '炉烤根蔬', 8, 'heat', 'roast-roots'],
  ['walnut-bread', '蜂蜜坚果面包', 10, 'knead', 'walnut-bread'],
  ['milk-custard', '鲜奶布丁', 9, 'whisk', 'milk-pudding'],
  ['country-root-stew', '乡野根蔬汤', 9, 'stir', 'amber-stew'],
  ['jade-mint-tea', '青蜜薄荷茶', 15, 'pour', 'mint-honey-tea'],
];

export const SERVICE_MENU = Object.freeze(
  menuRows.map(([id, name, price, activity, artId]) => ({
    id,
    name,
    price,
    activity,
    artId,
  })),
);

// These retain their original indices for in-progress orders saved by older versions.
const specialtyDishes = new Set([
  'kelp-salad',
  'glazed-roots',
  'milk-pudding',
  'moonfish-soup',
  'sunfruit-tart',
  'frost-chowder',
  'fir-roast',
  'jade-mint-tea',
]);
export const SERVICE_BASIC_MENU = Object.freeze(
  SERVICE_MENU.flatMap((item, index) => (specialtyDishes.has(item.id) ? [] : [index])),
);

export const SERVICE_PARTIES = Object.freeze([
  { name: '披斗篷的旅人', size: 1, seat: 'table', order: [0] },
  {
    name: '城门卫兵',
    size: 2,
    seat: 'window',
    order: [3, 4],
    notes: ['少盐', '酱汁另放', '汤别太烫'],
    extra: '清水',
    extras: ['清水', '热水', '空碟'],
    split: true,
    spill: '水渍',
  },
  {
    name: '卖花的姑娘',
    size: 1,
    seat: 'bar',
    order: [5, 7],
    notes: ['不要香菜', '蜜少一点', '面饼分开装'],
    extra: '空碟',
    extras: ['空碟', '纸巾', '清水'],
  },
  {
    name: '抄书人',
    size: 1,
    seat: 'bar',
    order: [4, 8],
    notes: ['去蜜', '茶温一点', '面包切薄片'],
    coupon: 2,
  },
  {
    name: '年轻行商',
    size: 3,
    seat: 'table',
    order: [1, 15, 10],
    notes: ['肉切小块', '先上孩子的', '不要辣'],
    extra: '餐具',
    extras: ['餐具', '纸巾', '面包'],
    spill: '油渍',
  },
  {
    name: '散步的老人',
    size: 1,
    seat: 'any',
    order: [6, 12],
    notes: ['不要酒', '少放盐', '温热就好'],
    coupon: 1,
  },
  {
    name: '赶路的信使',
    size: 1,
    seat: 'either',
    order: [2, 16],
    notes: ['煎脆一点', '打包一份', '不要等太久'],
    quick: true,
    extra: '纸巾',
    extras: ['纸巾', '清水', '餐具'],
  },
  {
    name: '窗边熟客',
    size: 2,
    seat: 'window',
    order: [6, 5, 15],
    notes: ['酱汁另放', '多放香草', '甜一点'],
    split: true,
    spill: '碎屑',
  },
  {
    name: '巡夜的搭档',
    size: 2,
    seat: 'table',
    order: [0, 12],
    notes: ['不要香菜', '肉切小块', '汤别太烫'],
    spill: '油渍',
  },
  {
    name: '来等朋友的客人',
    size: 1,
    seat: 'any',
    order: [4, 16],
    notes: ['少冰', '茶淡一点', '多一碟面包'],
    extra: '清水',
    coupon: 2,
  },
  {
    name: '披雨衣的送信人',
    size: 1,
    seat: 'bar',
    order: [3, 16],
    notes: ['少盐', '不要香菜', '汤稠一点'],
    quick: true,
    spill: '水渍',
  },
  {
    name: '旅行中的兄妹',
    size: 2,
    seat: 'table',
    order: [5, 2, 17],
    notes: ['不要辣', '蜂蜜少一点', '先上孩子的'],
    extra: '空碟',
    split: true,
  },
]);

export const SERVICE_TRAINING = Object.freeze([
  { ...SERVICE_PARTIES[0], spill: '碎屑' },
  { name: '来喝汤的抄书人', size: 1, seat: 'bar', order: [1] },
  { name: '窗边熟客', size: 2, seat: 'window', order: [2], spill: '碎屑', extra: '清水' },
]);

export const SEAT_REQUESTS = Object.freeze({
  table: [
    '我想把地图摊开，得找张宽些的桌子。',
    '带的东西有点多，圆桌方便些。靠不靠窗都行。',
    '要一张能围坐的桌子，等会儿还要写两行字。',
    '我们想边吃边看路线，能坐一张大些的桌子吗？',
    '桌边还有空位吗？行李放在脚边就好。',
  ],
  window: [
    '还想看一眼街上的灯，能坐在看得见外面的地方吗？',
    '我同伴还没来，我想从座位上看见窗外。',
    '我们坐靠窗吧，能并排坐就好。',
    '今晚外头有灯会，靠窗的位置最合适。',
    '想给孩子看看广场上的灯，窗边还有位置吗？',
  ],
  bar: [
    '就我一个人，想靠近酒柜看看今天开了什么酒。',
    '吧台给我留一席就好，我不占整张桌。',
    '我只有一杯汤，坐在柜台边吃就行。',
    '我赶时间，吧台随便一个空位都可以。',
    '坐近些听你们聊天，柜台边就好。',
  ],
  either: [
    '吧台或大厅那张圆桌都行，我赶时间，哪边有空坐哪边。',
    '我不想靠窗。柜台有位就坐柜台，大厅的桌也可以。',
    '别让桌子空着，能坐就行。',
    '我只有一个人，哪边方便就安排哪边。',
  ],
  any: [
    '走得有点累了，有个空位歇脚就好。',
    '哪里方便就安排哪里吧，只要我们都坐得下。',
    '今天不挑地方，你看着安排就行。',
    '不用特意张罗，能让我们坐下就成。',
    '听你的，哪里有位置就坐哪里。',
  ],
});

export const SERVICE_NOTES = Object.freeze([
  '少盐',
  '酱汁另放',
  '不要香菜',
  '煎得脆一点',
  '汤别太烫',
  '蜜少一点',
  '多加一碟面包',
  '肉切小块',
  '先上孩子的',
  '面饼分开装',
  '不要酒',
  '多放香草',
  '不要辣',
  '温的就好',
]);

export const SERVICE_EXTRAS = Object.freeze(['清水', '空碟', '纸巾', '餐具', '面包', '热水']);

export const SERVICE_ORDER_OPENERS = Object.freeze([
  '“麻烦来{dishes}{note}，谢谢。”',
  '“今天想吃{dishes}{note}。”',
  '“给我们上一份{dishes}吧{note}。”',
  '“路上就闻见香味了——{dishes}{note}。”',
  '“先来{dishes}{note}，不够再添。”',
  '“孩子说想吃{dishes}{note}。”',
  '“我不挑，来{dishes}{note}就好。”',
]);
