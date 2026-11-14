export const SILVER_CROWN_GATE = 'crown-gateward';
export const SILVER_CROWN_TAVERN = 'crown-tavern-door';

export const SILVER_CROWN_PLACES = Object.freeze({
  'crown-gateward': {
    name: '银冠门庭',
    environment: '蓝顶门楼内的石街接向高处的王仪大道，另一条路沿帝国运河下行。',
    wide: true,
    night: true,
    exits: {
      'road-capital': [0.16, 0.67],
      'crown-promenade': [0.59, 0.62],
      'crown-canal': [0.8, 0.72],
      'crown-ledger': [0.25, 0.64],
    },
    spots: [
      [0.35, 0.83],
      [0.66, 0.85],
    ],
  },
  'crown-promenade': {
    name: '王仪大道',
    environment: '整齐的浅色石阶沿山势通向上城区，蓝旗和石栏标记着王都的仪仗路线。',
    wide: true,
    night: true,
    exits: {
      'crown-gateward': [0.24, 0.67],
      'crown-terrace': [0.56, 0.58],
      'crown-arcade': [0.81, 0.69],
      'crown-belvedere': [0.69, 0.74],
    },
    spots: [
      [0.35, 0.84],
      [0.62, 0.84],
    ],
  },
  'crown-canal': {
    name: '银渠码头',
    environment: '货驳泊在刻有水位线的石岸旁，蓝瓦仓房与铜制闸机沿运河排列。',
    wide: true,
    night: true,
    exits: {
      'crown-gateward': [0.13, 0.59],
      'crown-arcade': [0.94, 0.56],
      'crown-floodgate': [0.7, 0.84],
    },
    spots: [
      [0.22, 0.85],
      [0.48, 0.91],
    ],
  },
  'crown-arcade': {
    name: '银工连廊',
    environment: '连续的拱廊隔开绸缎铺和银器工位，雨天也能沿石廊验货和交易。',
    wide: true,
    night: true,
    exits: {
      'crown-canal': [0.12, 0.62],
      'crown-promenade': [0.45, 0.61],
      'crown-tavern-door': [0.81, 0.62],
      'crown-mint': [0.63, 0.62],
    },
    spots: [
      [0.34, 0.86],
      [0.63, 0.85],
    ],
  },
  'crown-terrace': {
    name: '王庭阶园',
    environment: '浅色梯台、修齐的树篱和水阶构成上城区的层次，俯瞰运河与蓝瓦屋顶。',
    wide: true,
    night: true,
    exits: { 'crown-promenade': [0.16, 0.73], 'crown-map-room': [0.72, 0.66] },
    spots: [
      [0.37, 0.85],
      [0.66, 0.86],
    ],
  },
  'crown-tavern-door': {
    name: '黄铜星门庭',
    environment: '连廊尽头是一方幽静的石庭，挂黄铜星的木门通往万象酒馆。',
    night: true,
    exits: { 'crown-arcade': [0.2, 0.64], tavern: [0.7, 0.58] },
    spots: [[0.46, 0.87]],
  },
  'crown-floodgate': {
    name: '水闸检修台',
    environment: '闸门下方水声回响，堤壁水尺和黄铜升降机构仍在使用。',
    night: true,
    exits: { 'crown-canal': [0.2, 0.6] },
    spots: [[0.54, 0.87]],
  },
  'crown-mint': {
    name: '银模工房',
    environment: '工匠用沉重的螺旋压机压出银坯，炉火映在青灰石拱上。',
    exits: { 'crown-arcade': [0.22, 0.6] },
    spots: [[0.52, 0.87]],
  },
  'crown-ledger': {
    name: '过关账房',
    environment: '砝码、铅封与收好的账卷存放在门庭旁的有灯石室里。',
    exits: { 'crown-gateward': [0.22, 0.6] },
    spots: [[0.52, 0.87]],
  },
  'crown-belvedere': {
    name: '眺渠台',
    environment: '从雕石栏杆边能顺着蓝瓦层层望到低处的运渠。',
    night: true,
    exits: { 'crown-promenade': [0.2, 0.58] },
    spots: [[0.52, 0.87]],
  },
  'crown-map-room': {
    name: '王都测绘室',
    environment: '无窗的测绘室里收着经纬仪和罗盘，地面用石材拼出了城市水路。',
    exits: { 'crown-terrace': [0.22, 0.55] },
    spots: [[0.52, 0.87]],
  },
});

export const TAVERN_EXITS = Object.freeze({
  street: '星钟城',
  [SILVER_CROWN_TAVERN]: '银冠城',
});
