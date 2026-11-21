import { STARBELL_SCENES } from './starbell-scenes.js';
import { TOWN_SIDE_PLACES } from './town-side-places.js';
import { SILVER_CROWN_PLACES } from './silver-crown-scenes.js';
import { ETERNAL_CITY_PLACES } from './eternal-city-scenes.js';
import {
  buildOverlandPaperSvg,
  buildOverlandTerrainAccents,
  destinationTrail,
} from '../destination-map.js';

export const CITY_MAP_WIDTH = 820;
export const CITY_MAP_HEIGHT = 470;

const SECONDARY_ENDPOINTS = new Set([
  'riverbank',
  'guard-room',
  'clock-archive',
  'starbell-undercroft',
  'lantern-workshop',
  'market-alley',
  'black-market',
  'crown-belvedere',
  'crown-terrace',
  'crown-map-room',
  'crown-floodgate',
  'crown-ledger',
  'eternal-quay',
  'eternal-archive',
]);

export const CITY_BLUEPRINTS = Object.freeze({
  starbell: Object.freeze({
    region: 'starbell',
    title: '星钟城 · 城区绘卷',
    subtitle: 'STARBELL DISTRICT CHART · 街区与路径总览',
    nodes: Object.freeze([
      {
        id: 'outskirts',
        name: STARBELL_SCENES.outskirts?.title || '城外哨塔',
        tag: '西郊门户',
        x: 86,
        y: 256,
        kind: 'gate',
      },
      {
        id: 'riverbank',
        name: TOWN_SIDE_PLACES.riverbank.name,
        tag: '郊外水岸',
        x: 118,
        y: 376,
        kind: 'site',
      },
      {
        id: 'rampart',
        name: STARBELL_SCENES.rampart?.title || '守备区',
        tag: '北垣防务',
        x: 226,
        y: 128,
        kind: 'fort',
      },
      {
        id: 'guard-room',
        name: TOWN_SIDE_PLACES['guard-room'].name,
        tag: '巡防兵舍',
        x: 340,
        y: 88,
        kind: 'fort',
      },
      { id: 'street', name: '酒馆街角', tag: '万象酒馆', x: 246, y: 334, kind: 'tavern' },
      {
        id: 'clock-archive',
        name: TOWN_SIDE_PLACES['clock-archive'].name,
        tag: '钟楼旧档',
        x: 336,
        y: 174,
        kind: 'site',
      },
      {
        id: 'clock-roof',
        name: TOWN_SIDE_PLACES['clock-roof'].name,
        tag: '钟塔制高',
        x: 434,
        y: 96,
        kind: 'spire',
      },
      { id: 'city-center', name: '星钟广场', tag: '主城中心', x: 434, y: 224, kind: 'plaza' },
      {
        id: 'starbell-undercroft',
        name: '星钟地下暗渠',
        tag: '城区副本 · Lv.6',
        x: 344,
        y: 344,
        kind: 'dungeon',
        action: 'dungeon',
        dungeonId: 'starbell-undercroft',
        level: 6,
      },
      {
        id: 'guild-hall',
        name: '星钟冒险者公会',
        tag: '悬赏 · 情报 · 切磋',
        x: 520,
        y: 344,
        kind: 'guild',
        action: 'guild',
      },
      {
        id: 'lantern-workshop',
        name: TOWN_SIDE_PLACES['lantern-workshop'].name,
        tag: '秘灯工坊',
        x: 642,
        y: 108,
        kind: 'site',
      },
      {
        id: 'market',
        name: STARBELL_SCENES.market?.title || '商业街',
        tag: '灯匠市集',
        x: 656,
        y: 226,
        kind: 'market',
      },
      {
        id: 'market-alley',
        name: TOWN_SIDE_PLACES['market-alley'].name,
        tag: '市集暗巷',
        x: 688,
        y: 342,
        kind: 'site',
      },
      {
        id: 'black-market',
        name: '暗巷黑市',
        tag: '暗巷副本 · Lv.7-10',
        x: 742,
        y: 416,
        kind: 'dungeon',
        action: 'dungeon',
        dungeonId: 'black-market',
        level: 7,
      },
    ]),
    edges: [
      ['outskirts', 'street'],
      ['outskirts', 'rampart'],
      ['outskirts', 'riverbank'],
      ['rampart', 'guard-room'],
      ['rampart', 'city-center'],
      ['street', 'city-center'],
      ['city-center', 'clock-roof'],
      ['city-center', 'clock-archive'],
      ['city-center', 'starbell-undercroft'],
      ['city-center', 'guild-hall'],
      ['city-center', 'market'],
      ['market', 'lantern-workshop'],
      ['market', 'market-alley'],
      ['market-alley', 'black-market'],
    ],
  }),

  'silver-crown': Object.freeze({
    region: 'silver-crown',
    title: '银冠城 · 城区绘卷',
    subtitle: 'SILVER CROWN WARD MAP · 街区与路径总览',
    nodes: Object.freeze([
      { id: 'road-capital', name: '银冠城外门', tag: '城外驿门', x: 80, y: 240, kind: 'gate' },
      {
        id: 'crown-gateward',
        name: SILVER_CROWN_PLACES['crown-gateward'].name,
        tag: '正门瓮城',
        x: 196,
        y: 232,
        kind: 'gate',
      },
      {
        id: 'crown-tavern-door',
        name: SILVER_CROWN_PLACES['crown-tavern-door'].name,
        tag: '万象分门',
        x: 208,
        y: 104,
        kind: 'tavern',
      },
      {
        id: 'crown-belvedere',
        name: SILVER_CROWN_PLACES['crown-belvedere'].name,
        tag: '石砌眺望台',
        x: 342,
        y: 84,
        kind: 'spire',
      },
      {
        id: 'crown-promenade',
        name: SILVER_CROWN_PLACES['crown-promenade'].name,
        tag: '主街廊道',
        x: 336,
        y: 186,
        kind: 'plaza',
      },
      {
        id: 'crown-canal',
        name: SILVER_CROWN_PLACES['crown-canal'].name,
        tag: '三拱石桥',
        x: 308,
        y: 308,
        kind: 'bridge',
      },
      {
        id: 'guild-hall',
        name: '银冠冒险者公会',
        tag: '悬赏 · 情报 · 切磋',
        x: 208,
        y: 384,
        kind: 'guild',
        action: 'guild',
      },
      {
        id: 'crown-ledger',
        name: SILVER_CROWN_PLACES['crown-ledger'].name,
        tag: '税契书库',
        x: 448,
        y: 386,
        kind: 'site',
      },
      {
        id: 'crown-terrace',
        name: SILVER_CROWN_PLACES['crown-terrace'].name,
        tag: '高台园圃',
        x: 484,
        y: 114,
        kind: 'site',
      },
      {
        id: 'crown-arcade',
        name: SILVER_CROWN_PLACES['crown-arcade'].name,
        tag: '穹顶列柱',
        x: 492,
        y: 224,
        kind: 'market',
      },
      {
        id: 'crown-mint',
        name: SILVER_CROWN_PLACES['crown-mint'].name,
        tag: '皇家铸币署',
        x: 636,
        y: 140,
        kind: 'fort',
      },
      {
        id: 'crown-map-room',
        name: SILVER_CROWN_PLACES['crown-map-room'].name,
        tag: '制图秘室',
        x: 722,
        y: 220,
        kind: 'spire',
      },
      {
        id: 'crown-floodgate',
        name: SILVER_CROWN_PLACES['crown-floodgate'].name,
        tag: '运河水闸',
        x: 654,
        y: 314,
        kind: 'fort',
      },
    ]),
    edges: [
      ['road-capital', 'crown-gateward'],
      ['crown-gateward', 'crown-tavern-door'],
      ['crown-gateward', 'crown-promenade'],
      ['crown-gateward', 'crown-canal'],
      ['crown-promenade', 'crown-belvedere'],
      ['crown-promenade', 'crown-arcade'],
      ['crown-arcade', 'crown-terrace'],
      ['crown-arcade', 'crown-mint'],
      ['crown-arcade', 'crown-map-room'],
      ['crown-arcade', 'crown-floodgate'],
      ['crown-canal', 'guild-hall'],
      ['crown-canal', 'crown-ledger'],
    ],
  }),

  'eternal-city': Object.freeze({
    region: 'eternal-city',
    title: '艾尔鲁斯 · 帝都绘卷',
    subtitle: 'ETERNAL CAPITAL ATLAS · 帝都街区与路径总览',
    nodes: Object.freeze([
      {
        id: 'eternal-city',
        name: ETERNAL_CITY_PLACES['eternal-city'].name,
        tag: '帝都城门',
        x: 94,
        y: 236,
        kind: 'gate',
      },
      {
        id: 'eternal-avenue',
        name: ETERNAL_CITY_PLACES['eternal-avenue'].name,
        tag: '凯旋石道',
        x: 246,
        y: 236,
        kind: 'road',
      },
      {
        id: 'eternal-temple',
        name: ETERNAL_CITY_PLACES['eternal-temple'].name,
        tag: '圣穹主殿',
        x: 264,
        y: 108,
        kind: 'temple',
      },
      {
        id: 'eternal-archive',
        name: ETERNAL_CITY_PLACES['eternal-archive'].name,
        tag: '皇家藏书楼',
        x: 420,
        y: 96,
        kind: 'site',
      },
      {
        id: 'eternal-academy',
        name: ETERNAL_CITY_PLACES['eternal-academy'].name,
        tag: '秘法学院',
        x: 594,
        y: 104,
        kind: 'academy',
      },
      {
        id: 'eternal-plaza',
        name: ETERNAL_CITY_PLACES['eternal-plaza'].name,
        tag: '中央喷泉',
        x: 418,
        y: 236,
        kind: 'plaza',
      },
      {
        id: 'eternal-arena',
        name: ETERNAL_CITY_PLACES['eternal-arena'].name,
        tag: '帝国角斗场',
        x: 676,
        y: 234,
        kind: 'arena',
      },
      {
        id: 'eternal-quay',
        name: ETERNAL_CITY_PLACES['eternal-quay'].name,
        tag: '帝国石码头',
        x: 210,
        y: 392,
        kind: 'port',
      },
      {
        id: 'eternal-garden',
        name: ETERNAL_CITY_PLACES['eternal-garden'].name,
        tag: '御苑花林',
        x: 434,
        y: 356,
        kind: 'garden',
      },
      {
        id: 'guild-hall',
        name: '艾尔鲁斯冒险者总会',
        tag: '公会总部 · 榜单 · 试炼',
        x: 566,
        y: 366,
        kind: 'guild',
        action: 'guild',
      },
      {
        id: 'eternal-garrison',
        name: ETERNAL_CITY_PLACES['eternal-garrison'].name,
        tag: '禁卫军驻地',
        x: 690,
        y: 368,
        kind: 'fort',
      },
    ]),
    edges: [
      ['eternal-city', 'eternal-avenue'],
      ['eternal-avenue', 'eternal-plaza'],
      ['eternal-avenue', 'eternal-temple'],
      ['eternal-avenue', 'eternal-quay'],
      ['eternal-plaza', 'eternal-archive'],
      ['eternal-plaza', 'eternal-academy'],
      ['eternal-plaza', 'eternal-arena'],
      ['eternal-plaza', 'eternal-garden'],
      ['eternal-garden', 'guild-hall'],
      ['guild-hall', 'eternal-garrison'],
      ['eternal-arena', 'eternal-garrison'],
    ],
  }),
});

export function buildBlueprintSvg(blueprint) {
  const w = CITY_MAP_WIDTH;
  const h = CITY_MAP_HEIGHT;
  const nodeById = new Map(blueprint.nodes.map((node) => [node.id, node]));
  const regionSeed =
    blueprint.region === 'starbell' ? 11 : blueprint.region === 'silver-crown' ? 29 : 47;

  const trails = blueprint.edges
    .map(([fromId, toId], idx) => {
      const a = nodeById.get(fromId);
      const b = nodeById.get(toId);
      if (!a || !b) return '';
      const secondary = SECONDARY_ENDPOINTS.has(fromId) || SECONDARY_ENDPOINTS.has(toId);
      const d = destinationTrail(a, b, regionSeed + idx * 7, {
        maxCurve: 18,
        curveFactor: 0.09,
        branch: secondary,
      });
      return secondary
        ? `<path class="city-submap-trail is-secondary" d="${d}" fill="none" stroke="#6e5239" stroke-width="1.8" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round" opacity="0.72"/>`
        : `<path class="city-submap-trail is-main" d="${d}" fill="none" stroke="#79523a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>`;
    })
    .join('');

  const paper = buildOverlandPaperSvg({
    prefix: 'city',
    id: blueprint.region,
    width: w,
    height: h,
  });
  const terrain = buildOverlandTerrainAccents({
    width: w,
    height: h,
    points: blueprint.nodes,
    seed: regionSeed,
    maxHills: 3,
    maxGroves: 5,
  });

  return `<svg class="city-submap-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${paper.defs}
    ${paper.layers}
    ${terrain}
    <g class="city-submap-trails">${trails}</g>
  </svg>`;
}
