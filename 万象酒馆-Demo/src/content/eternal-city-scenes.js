export const ETERNAL_CITY_GATE = 'eternal-city';

export const ETERNAL_CITY_STOPS = Object.freeze({
  'eternal-road-orchard': '果坡驿站',
  'eternal-road-mill': '白石水磨',
  'eternal-road-checkpoint': '凯旋关哨',
});

export const ETERNAL_CITY_VISITOR_SPOTS = Object.freeze(['left', 'right']);

export const ETERNAL_CITY_PLACES = Object.freeze({
  [ETERNAL_CITY_GATE]: {
    name: '帝都南门',
    art: 'eternal-gate',
    environment: '从白石门洞进入城内，凯旋大道在前方展开，右侧的缓坡通往骑士驻区。',
    exits: { 'eternal-avenue': [0.5, 0.69], 'eternal-garrison': [0.83, 0.69] },
  },
  'eternal-avenue': {
    name: '凯旋大道',
    art: 'eternal-avenue-v2',
    environment: '浅色石板铺出仪仗队列的中轴，盾牌与银星悬挂在宽檐下。',
    exits: {
      [ETERNAL_CITY_GATE]: [0.17, 0.68],
      'eternal-plaza': [0.51, 0.74],
      'eternal-temple': [0.83, 0.68],
    },
  },
  'eternal-plaza': {
    name: '银星广场',
    environment: '广场的银星泉四周留出宽阔的步行空间，市民从这里穿行于竞技场和典籍庭之间。',
    exits: {
      'eternal-avenue': [0.13, 0.61],
      'eternal-arena': [0.88, 0.63],
      'eternal-archive': [0.68, 0.62],
    },
  },
  'eternal-temple': {
    name: '万圣殿',
    environment: '浅石柱廊围住圣殿前庭，骑士们从右侧拱门进入回廊。',
    exits: { 'eternal-avenue': [0.21, 0.73], 'eternal-garden': [0.91, 0.72] },
  },
  'eternal-arena': {
    name: '大骑士竞技场',
    environment: '椭圆石墙沿广场展开，观赛队伍和骑士各走不同的出入口。',
    exits: { 'eternal-plaza': [0.12, 0.71], 'eternal-garrison': [0.9, 0.71] },
  },
  'eternal-academy': {
    name: '炼金魔法学院',
    environment: '教学楼围住炼金工坊的院落，学院与圣殿之间有一条僻静的石廊。',
    exits: { 'eternal-archive': [0.19, 0.66], 'eternal-garden': [0.84, 0.68] },
  },
  'eternal-garrison': {
    name: '骑士驻区',
    environment: '军营木廊俯瞰开阔的操练场，侧门分别通向竞技场和河岸。',
    exits: {
      [ETERNAL_CITY_GATE]: [0.1, 0.68],
      'eternal-arena': [0.58, 0.65],
      'eternal-quay': [0.89, 0.67],
    },
  },
  'eternal-archive': {
    name: '典籍庭',
    environment: '历年公文与手抄典籍收在高窗后，通往学院的拱廊向公众开放。',
    exits: { 'eternal-plaza': [0.11, 0.67], 'eternal-academy': [0.91, 0.67] },
  },
  'eternal-garden': {
    name: '圣殿回廊',
    environment: '回廊绕过安静的花园，花园尽头的缓坡通向河岸。',
    exits: {
      'eternal-temple': [0.15, 0.66],
      'eternal-academy': [0.5, 0.68],
      'eternal-quay': [0.86, 0.66],
    },
  },
  'eternal-quay': {
    name: '王渠石埠',
    environment: '货船沿石阶停靠，岸上的步道接回操练场和圣殿花园。',
    exits: { 'eternal-garrison': [0.17, 0.55], 'eternal-garden': [0.86, 0.55] },
    feet: [
      [0.27, 0.64],
      [0.74, 0.64],
    ],
  },
});
