import { STARBELL_SCENES } from './starbell-scenes.js';
import { TOWN_SIDE_PLACES } from './town-side-places.js';
import { SILVER_CROWN_PLACES } from './silver-crown-scenes.js';
import { ETERNAL_CITY_PLACES } from './eternal-city-scenes.js';

export const CITY_MAP_WIDTH = 820;
export const CITY_MAP_HEIGHT = 470;

const TREES = Object.freeze({
  starbell: [
    [62, 134, 15],
    [94, 108, 13],
    [118, 176, 14],
    [68, 354, 16],
    [82, 412, 14],
    [142, 418, 13],
    [514, 72, 13],
    [584, 72, 14],
    [758, 96, 15],
    [762, 374, 16],
    [304, 412, 15],
    [438, 410, 13],
  ],
  'silver-crown': [
    [68, 114, 14],
    [102, 152, 13],
    [66, 336, 15],
    [108, 396, 14],
    [276, 68, 13],
    [422, 68, 13],
    [572, 68, 14],
    [756, 126, 15],
    [752, 378, 15],
    [572, 420, 14],
  ],
  'eternal-city': [
    [60, 104, 15],
    [64, 344, 15],
    [194, 84, 13],
    [346, 76, 13],
    [504, 76, 13],
    [388, 344, 14],
    [474, 344, 14],
    [408, 382, 12],
    [460, 382, 12],
    [762, 146, 15],
    [762, 326, 14],
  ],
});

export const CITY_BLUEPRINTS = Object.freeze({
  starbell: Object.freeze({
    region: 'starbell',
    title: '星钟城 · 城区绘卷',
    subtitle: 'STARBELL DISTRICT CHART · 街区与侧巷总览',
    walls: 'M168 42 L774 42 L774 426 L168 426 Z M168 232 L168 286',
    towers: [
      [168, 42],
      [472, 42],
      [774, 42],
      [774, 234],
      [774, 426],
      [472, 426],
      [168, 426],
      [168, 226],
      [168, 286],
    ],
    waterPaths: ['M138 18 C118 118 134 202 126 270 C118 338 92 404 72 456'],
    bridges: ['M98 242 L176 242 M98 274 L176 274'],
    roads: [
      'M84 258 L246 258 Q340 242 434 224 L656 226',
      'M246 258 L246 334 Q246 382 310 382 L478 364 Q514 358 520 344',
      'M226 128 L226 258',
      'M434 96 L434 224',
      'M434 224 L520 344',
      'M226 128 Q304 128 340 88',
      'M642 108 L656 226',
    ],
    alleys: [
      'M336 174 Q388 198 434 224',
      'M84 258 Q88 332 118 376',
      'M656 226 Q682 284 688 342',
      'M434 224 Q392 290 344 344',
    ],
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
    ],
    extrasSvg: `
      <g class="blueprint-landmark" transform="translate(434 224)">
        <circle r="30" fill="#f3e1b9" fill-opacity=".42" stroke="#79523a" stroke-width="1.1"/>
        <circle r="21" fill="none" stroke="#8b6240" stroke-width=".75" stroke-dasharray="3 3"/>
        <path d="M0-11 L3-3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3-3 Z" fill="none" stroke="#79523a" stroke-width="1"/>
      </g>
      <g class="blueprint-landmark" transform="translate(344 344)">
        <circle r="20" fill="none" stroke="#8b3b28" stroke-width="1.1" stroke-dasharray="3 2.5"/>
      </g>`,
  }),

  'silver-crown': Object.freeze({
    region: 'silver-crown',
    title: '银冠城 · 城区绘卷',
    subtitle: 'SILVER CROWN WARD MAP · 王城运河与回廊',
    walls: 'M136 38 L774 38 L774 430 L136 430 Z',
    towers: [
      [136, 38],
      [455, 38],
      [774, 38],
      [774, 234],
      [774, 430],
      [455, 430],
      [136, 430],
      [136, 206],
      [136, 260],
    ],
    waterPaths: [
      'M16 320 C140 314 238 308 330 308 C450 308 552 316 654 316 C714 316 768 310 806 306',
    ],
    bridges: ['M292 288 L292 332 M324 288 L324 332', 'M636 292 L636 338 M672 292 L672 338'],
    roads: [
      'M80 240 L196 232 Q272 212 336 186 L492 224 L722 220',
      'M196 232 L208 104',
      'M336 186 L342 84',
      'M336 186 L484 114 L636 140',
      'M492 224 L636 140',
      'M196 232 Q256 268 308 308',
      'M308 308 Q258 358 208 384',
      'M308 308 Q384 366 448 386',
      'M492 224 Q584 268 654 314',
    ],
    alleys: ['M208 104 Q276 86 342 84', 'M484 114 Q490 168 492 224', 'M448 386 Q558 366 654 314'],
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
    extrasSvg: `
      <g class="blueprint-landmark" transform="translate(492 224)">
        <circle r="24" fill="#f3e1b9" fill-opacity=".35" stroke="#79523a" stroke-width="1"/>
      </g>
      <g class="blueprint-landmark" transform="translate(722 220)">
        <polygon points="0,-19 16,-9 16,9 0,19 -16,9 -16,-9" fill="none" stroke="#79523a" stroke-width="1.1"/>
      </g>`,
  }),

  'eternal-city': Object.freeze({
    region: 'eternal-city',
    title: '艾尔鲁斯 · 帝都绘卷',
    subtitle: 'ETERNAL CAPITAL ATLAS · 帝都十大街区与公会总部',
    walls: 'M122 36 L776 36 L776 394 L122 394 Z',
    towers: [
      [122, 36],
      [336, 36],
      [564, 36],
      [776, 36],
      [776, 214],
      [776, 394],
      [564, 394],
      [122, 394],
      [122, 208],
      [122, 264],
    ],
    waterPaths: ['M16 436 C176 416 320 420 470 426 C618 432 724 416 806 420'],
    bridges: ['M192 384 L192 422 M228 384 L228 422'],
    roads: [
      'M94 236 L418 236 L676 234',
      'M246 236 L264 108',
      'M418 236 L420 96',
      'M418 236 Q518 172 594 104',
      'M246 236 Q226 326 210 392',
      'M418 236 L434 356',
      'M434 356 L566 366 L690 368',
      'M676 234 L690 368',
    ],
    alleys: ['M264 108 L420 96 L594 104', 'M594 104 Q648 164 676 234', 'M210 392 Q328 382 434 356'],
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
    extrasSvg: `
      <g class="blueprint-landmark" transform="translate(418 236)">
        <circle r="34" fill="#f3e1b9" fill-opacity=".38" stroke="#79523a" stroke-width="1.2"/>
        <circle r="21" fill="#89aba4" fill-opacity=".22" stroke="#5b7a75" stroke-width=".9"/>
      </g>
      <g class="blueprint-landmark" transform="translate(676 234)">
        <ellipse rx="40" ry="27" fill="none" stroke="#79523a" stroke-width="1.1" stroke-dasharray="4 2.5"/>
        <ellipse rx="24" ry="15" fill="none" stroke="#8f6743" stroke-width=".85"/>
      </g>`,
  }),
});

export function buildBlueprintSvg(blueprint) {
  const w = CITY_MAP_WIDTH;
  const h = CITY_MAP_HEIGHT;
  const trees = (TREES[blueprint.region] || [])
    .map(
      ([cx, cy, r]) =>
        `<circle cx="${cx}" cy="${cy}" r="${(r * 0.88).toFixed(1)}" fill="#8fa077" fill-opacity=".28" stroke="#627350" stroke-opacity=".45" stroke-width=".85"/>`,
    )
    .join('');
  const water = blueprint.waterPaths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#a6c0b8" stroke-opacity=".42" stroke-width="26" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#6a908a" stroke-opacity=".75" stroke-width="15" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#e4efe9" stroke-opacity=".48" stroke-width="1.4" stroke-dasharray="12 10" stroke-linecap="round"/>`,
    )
    .join('');
  const bridges = blueprint.bridges
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#79523a" stroke-width="3.2" stroke-linecap="round"/>`,
    )
    .join('');
  const roads = blueprint.roads
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#79523a" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#f2e2c0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  const alleys = blueprint.alleys
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#855b3e" stroke-opacity=".62" stroke-width="3.2" stroke-dasharray="6 4" stroke-linecap="round"/>`,
    )
    .join('');
  const towers = blueprint.towers
    .map(
      ([x, y]) =>
        `<polygon points="${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}" fill="#8f5d40" stroke="#f3e1b9" stroke-width="1"/>`,
    )
    .join('');

  return `<svg class="city-submap-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <radialGradient id="city-vellum-${blueprint.region}" cx="50%" cy="46%" r="68%">
        <stop offset="0%" stop-color="#f7ebd0"/>
        <stop offset="68%" stop-color="#ebd7ad"/>
        <stop offset="100%" stop-color="#d8ba84"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#city-vellum-${blueprint.region})"/>
    <path d="M26 78 C210 42 420 96 630 58 T794 74 M28 394 C205 428 455 372 794 406" fill="none" stroke="#987343" stroke-opacity=".16" stroke-width="1.1" stroke-dasharray="5 5"/>
    <path d="M0 235 L${w} 235 M410 0 L410 ${h}" fill="none" stroke="#8d6842" stroke-opacity=".12" stroke-width=".85" stroke-dasharray="6 5"/>
    ${water}
    <path d="${blueprint.walls}" fill="none" stroke="#9e7652" stroke-opacity=".28" stroke-width="8" stroke-linejoin="round"/>
    <path d="${blueprint.walls}" fill="none" stroke="#79523a" stroke-opacity=".76" stroke-width="2.2" stroke-linejoin="round"/>
    ${towers}
    ${alleys}
    ${roads}
    ${bridges}
    ${blueprint.extrasSvg}
    ${trees}
    <rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="4" fill="none" stroke="#79523a" stroke-opacity=".42" stroke-width="1.5"/>
    <rect x="18" y="18" width="${w - 36}" height="${h - 36}" rx="2" fill="none" stroke="#85633f" stroke-opacity=".24" stroke-width=".9"/>
    <g transform="translate(${w - 56} ${h - 52})">
      <circle r="19" fill="#f3e1b9" fill-opacity=".62" stroke="#79523a" stroke-width="1"/>
      <path d="M0-20 L4-4 L20 0 L4 4 L0 20 L-4 4 L-20 0 L-4-4 Z" fill="#8f5d40" fill-opacity=".35" stroke="#5b3921" stroke-width=".9"/>
      <path d="M0-20 L4-4 L0 0 Z" fill="#8b2f1c"/>
      <text y="-23" text-anchor="middle" fill="#5b3921" font-size="9" font-weight="700">N</text>
    </g>
    <g transform="translate(34 ${h - 28})" fill="#5e3e26" font-size="9">
      <line x1="0" y1="0" x2="72" y2="0" stroke="#79523a" stroke-width="1.3"/>
      <path d="M0-3.5V3.5 M36-2.5V2.5 M72-3.5V3.5" stroke="#79523a" stroke-width="1.1"/>
      <text x="36" y="-6" text-anchor="middle">约百步尺</text>
    </g>
  </svg>`;
}
