/** Small readable enemy cast: new silhouettes and attacks, using existing engine effects. */
export const EXTRA_ENEMIES = [
  {
    id: 'crystalBeetle',
    attackStyle: 'crystal-ram',
    name: '晶背甲虫',
    title: '矿窟 / 轻甲',
    color: '#94cfdb',
    portrait: 'crystal-beetle',
    hp: 31,
    mp: 0,
    speed: 2,
    limit: 1,
    buffs: {},
    intents: [
      { name: '晶角抵撞', slot: 1, selfShield: 3, effects: [{ type: 'damage', value: 8 }] },
    ],
  },
  {
    id: 'cinderImp',
    attackStyle: 'cinder-spark',
    name: '灰炉小偶',
    title: '铸坊 / 余烬',
    color: '#e4b078',
    portrait: 'cinder-imp',
    hp: 32,
    mp: 0,
    speed: 3,
    limit: 1,
    buffs: {},
    intents: [
      { name: '火星弹射', slot: 0, effects: [{ type: 'damage', value: 10 }] },
      { name: '短锤敲击', slot: 2, effects: [{ type: 'damage', value: 8 }] },
    ],
  },
  {
    id: 'tideJelly',
    attackStyle: 'tide-ribbon',
    name: '潮灯水母',
    title: '星殿 / 浅潮毒雾',
    color: '#a2d9d3',
    portrait: 'tide-jelly',
    hp: 34,
    mp: 0,
    speed: 2,
    limit: 1,
    buffs: {},
    intents: [
      {
        name: '触须掠波',
        slot: 2,
        effects: [
          { type: 'damage', value: 8 },
          { type: 'buff', buff: 'poison', value: 1 },
        ],
      },
      { name: '灯潮轻拂', slot: 0, effects: [{ type: 'damage', value: 10 }] },
    ],
  },
];
export const EXTRA_BOSSES = [
  {
    id: 'bossTide',
    attackStyle: 'astral-cascade',
    name: '星潮司灯者',
    title: 'Boss / 星盘与潮灯',
    boss: true,
    color: '#a9d6d1',
    portrait: 'boss-tide',
    hp: 105,
    mp: 0,
    speed: 3,
    limit: 1,
    buffs: {},
    phaseThreshold: 0.5,
    intents: [
      { name: '潮灯照中', slot: 1, selfShield: 5, effects: [{ type: 'damage', value: 11 }] },
      { name: '回潮两翼', slots: [0, 2], effects: [{ type: 'damage', value: 8 }] },
    ],
    enragedIntents: [
      { name: '星环坠落', slots: [0, 1, 2], effects: [{ type: 'damage', value: 8 }] },
      {
        name: '深潮贯中',
        slot: 1,
        effects: [
          { type: 'damage', value: 15 },
          { type: 'buff', buff: 'weak', value: 1 },
        ],
      },
    ],
  },
];
