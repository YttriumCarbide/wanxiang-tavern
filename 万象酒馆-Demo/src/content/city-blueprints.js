import { STARBELL_SCENES } from './starbell-scenes.js';
import { TOWN_SIDE_PLACES } from './town-side-places.js';
import { SILVER_CROWN_PLACES } from './silver-crown-scenes.js';
import { ETERNAL_CITY_PLACES } from './eternal-city-scenes.js';

export const CITY_MAP_WIDTH = 820;
export const CITY_MAP_HEIGHT = 470;

const BUILDING_BLOCKS = Object.freeze({
  starbell: [
    'M186 154h44v30h-44z',
    'M188 196h40v28h-40z',
    'M192 276h36v26h-36z',
    'M298 110h42v26h-42z',
    'M296 202h46v30h-46z',
    'M294 268h54v34h-54z',
    'M300 326h48v28h-48z',
    'M386 144h38v28h-38z',
    'M470 126h50v28h-50z',
    'M476 266h48v30h-48z',
    'M376 286h52v32h-52z',
    'M372 346h56v34h-56z',
    'M542 152h52v32h-52z',
    'M544 258h50v30h-50z',
    'M622 162h46v26h-46z',
    'M620 266h46v28h-46z',
    'M704 166h42v36h-42z',
    'M704 236h44v34h-44z',
  ],
  'silver-crown': [
    'M154 146h42v28h-42z',
    'M228 148h46v28h-46z',
    'M154 256h48v24h-48z',
    'M238 250h44v26h-44z',
    'M294 128h38v24h-38z',
    'M392 126h44v28h-44z',
    'M392 224h46v30h-46z',
    'M324 236h48v24h-48z',
    'M540 124h48v28h-48z',
    'M546 218h46v30h-46z',
    'M612 222h48v26h-48z',
    'M142 362h38v28h-38z',
    'M268 358h52v28h-52z',
    'M354 358h56v26h-56z',
    'M530 356h54v30h-54z',
    'M616 364h46v28h-46z',
  ],
  'eternal-city': [
    'M148 158h48v28h-48z',
    'M148 278h50v28h-50z',
    'M238 164h44v24h-44z',
    'M238 276h46v24h-46z',
    'M314 152h46v28h-46z',
    'M318 278h48v28h-48z',
    'M492 146h48v30h-48z',
    'M492 276h50v28h-50z',
    'M552 162h44v24h-44z',
    'M554 274h44v24h-44z',
    'M140 340h46v26h-46z',
    'M284 342h44v24h-44z',
    'M658 124h48v28h-48z',
    'M592 332h40v22h-40z',
  ],
});

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
    alleys: ['M336 174 Q388 198 434 224', 'M84 258 Q88 332 118 376', 'M656 226 Q682 284 688 342'],
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
      ['city-center', 'guild-hall'],
      ['city-center', 'market'],
      ['market', 'lantern-workshop'],
      ['market', 'market-alley'],
    ],
    extrasSvg: `
      <g class="blueprint-landmark" transform="translate(434 224)">
        <circle r="34" fill="#ecd5a4" fill-opacity=".68" stroke="#6f4c34" stroke-width="1.5"/>
        <circle r="24" fill="none" stroke="#8b6240" stroke-width=".9" stroke-dasharray="4 3"/>
        <path d="M0-14 L5-4 L14 0 L5 4 L0 14 L-5 4 L-14 0 L-5-4 Z" fill="#9a5c37" fill-opacity=".42" stroke="#633e25" stroke-width="1.1"/>
      </g>
      <g class="blueprint-landmark" transform="translate(246 334)">
        <rect x="-26" y="-17" width="52" height="34" rx="3" fill="#965636" stroke="#59331d" stroke-width="1.3"/>
        <path d="M-28-4 L0-21 L28-4" fill="#b46f48" stroke="#59331d" stroke-width="1.2"/>
      </g>
      <g class="blueprint-landmark" transform="translate(520 344)">
        <rect x="-24" y="-16" width="48" height="32" rx="3" fill="#6f4a2d" stroke="#d4a44f" stroke-width="1.4"/>
        <path d="M-26-4 L0-19 L26-4" fill="#9b7242" stroke="#59331d" stroke-width="1.2"/>
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
        <rect x="-30" y="-14" width="60" height="28" rx="10" fill="#d9bb86" fill-opacity=".55" stroke="#6c4930" stroke-width="1.3"/>
      </g>
      <g class="blueprint-landmark" transform="translate(722 220)">
        <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="#8f5c3e" stroke="#5d3822" stroke-width="1.3"/>
        <circle r="7" fill="#ecd5a4" stroke="#5d3822" stroke-width="1"/>
      </g>
      <g class="blueprint-landmark" transform="translate(208 384)">
        <rect x="-24" y="-15" width="48" height="30" rx="3" fill="#6f4a2d" stroke="#d4a44f" stroke-width="1.4"/>
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
        <circle r="36" fill="#ecd5a4" fill-opacity=".65" stroke="#6f4c34" stroke-width="1.6"/>
        <circle r="22" fill="#89aba4" fill-opacity=".42" stroke="#486f6a" stroke-width="1.2"/>
        <circle r="7" fill="#ecd5a4" stroke="#6f4c34" stroke-width="1"/>
      </g>
      <g class="blueprint-landmark" transform="translate(676 234)">
        <ellipse rx="46" ry="32" fill="#c6a377" fill-opacity=".55" stroke="#68452d" stroke-width="1.8"/>
        <ellipse rx="36" ry="24" fill="none" stroke="#68452d" stroke-width="1" stroke-dasharray="4 2"/>
        <ellipse rx="24" ry="15" fill="#e5c896" stroke="#7c563a" stroke-width="1.1"/>
      </g>
      <g class="blueprint-landmark" transform="translate(264 108)">
        <rect x="-26" y="-14" width="52" height="28" fill="#8e5a3d" stroke="#57331f" stroke-width="1.2"/>
        <circle r="15" fill="#b77e54" stroke="#57331f" stroke-width="1.2"/>
      </g>
      <g class="blueprint-landmark" transform="translate(594 104)">
        <rect x="-32" y="-20" width="64" height="40" fill="none" stroke="#6d4930" stroke-width="5"/>
        <rect x="-20" y="-10" width="40" height="20" fill="#c9d6be" fill-opacity=".45" stroke="#5c6c4e" stroke-width=".9"/>
      </g>
      <g class="blueprint-landmark" transform="translate(566 366)">
        <rect x="-24" y="-15" width="48" height="30" rx="3" fill="#6f4a2d" stroke="#d4a44f" stroke-width="1.5"/>
      </g>`,
  }),
});

export function buildBlueprintSvg(blueprint) {
  const w = CITY_MAP_WIDTH;
  const h = CITY_MAP_HEIGHT;
  const buildings = (BUILDING_BLOCKS[blueprint.region] || [])
    .map(
      (d) =>
        `<path d="${d}" fill="#8f5d40" stroke="#5d3822" stroke-width="1.1"/><path d="${d}" transform="translate(-2 -2)" fill="#ab7754" fill-opacity=".86" stroke="#6b442b" stroke-width=".9"/>`,
    )
    .join('');
  const trees = (TREES[blueprint.region] || [])
    .map(
      ([cx, cy, r]) =>
        `<circle cx="${cx + 2}" cy="${cy + 3}" r="${r}" fill="#4d573d" fill-opacity=".22"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#7c8b60" fill-opacity=".84" stroke="#4c5b3f" stroke-width="1"/><circle cx="${cx - r * 0.25}" cy="${cy - r * 0.25}" r="${(r * 0.48).toFixed(1)}" fill="#9dad7e" fill-opacity=".65"/>`,
    )
    .join('');
  const water = blueprint.waterPaths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#83a8a0" stroke-opacity=".4" stroke-width="34" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#588680" stroke-width="22" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#466f6b" stroke-width="23" stroke-opacity=".28" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#dfece6" stroke-opacity=".58" stroke-width="2" stroke-dasharray="14 12" stroke-linecap="round"/>`,
    )
    .join('');
  const bridges = blueprint.bridges
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#5d3b24" stroke-width="5" stroke-linecap="round"/>`,
    )
    .join('');
  const roads = blueprint.roads
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#79523a" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#c19572" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#edd3a5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  const alleys = blueprint.alleys
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#855b3e" stroke-opacity=".68" stroke-width="6.5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#e4c897" stroke-width="2.6" stroke-linecap="round"/>`,
    )
    .join('');
  const towers = blueprint.towers
    .map(
      ([x, y]) =>
        `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2" fill="#b4865c" stroke="#5e3d26" stroke-width="1.4"/><rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="#8e5f40"/>`,
    )
    .join('');

  return `<svg class="city-submap-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <radialGradient id="city-vellum-${blueprint.region}" cx="50%" cy="46%" r="65%">
        <stop offset="0%" stop-color="#f5e6c4"/>
        <stop offset="68%" stop-color="#e8d09f"/>
        <stop offset="100%" stop-color="#d2b179"/>
      </radialGradient>
      <pattern id="city-grid-${blueprint.region}" width="64" height="64" patternUnits="userSpaceOnUse">
        <path d="M64 0H0V64" fill="none" stroke="#8d6842" stroke-opacity=".12" stroke-width=".8"/>
      </pattern>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#city-vellum-${blueprint.region})"/>
    <rect width="${w}" height="${h}" fill="url(#city-grid-${blueprint.region})"/>
    <path d="M0 235 L${w} 235 M410 0 L410 ${h}" fill="none" stroke="#8d6842" stroke-opacity=".16" stroke-width=".9" stroke-dasharray="6 5"/>
    ${water}
    <path d="${blueprint.walls}" fill="none" stroke="#b98a61" stroke-opacity=".42" stroke-width="14" stroke-linejoin="round"/>
    <path d="${blueprint.walls}" fill="none" stroke="#69462d" stroke-width="4" stroke-linejoin="round"/>
    ${towers}
    ${alleys}
    ${roads}
    ${bridges}
    ${buildings}
    ${blueprint.extrasSvg}
    ${trees}
    <rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="6" fill="none" stroke="#74513a" stroke-opacity=".45" stroke-width="1.6"/>
    <rect x="18" y="18" width="${w - 36}" height="${h - 36}" rx="3" fill="none" stroke="#85633f" stroke-opacity=".26" stroke-width="1"/>
    <g transform="translate(${w - 58} ${h - 54})">
      <circle r="21" fill="#f3e1b9" fill-opacity=".68" stroke="#6f4c34" stroke-width="1.2"/>
      <circle r="16" fill="none" stroke="#8b6240" stroke-width=".7" stroke-dasharray="2 2"/>
      <path d="M0-22 L4.5-4.5 L22 0 L4.5 4.5 L0 22 L-4.5 4.5 L-22 0 L-4.5-4.5 Z" fill="#8b5a36" fill-opacity=".35" stroke="#5b3921" stroke-width="1"/>
      <path d="M0-22 L4.5-4.5 L0 0 Z" fill="#8b2f1c"/>
      <text y="-25" text-anchor="middle" fill="#5b3921" font-size="10" font-weight="700">N</text>
    </g>
    <g transform="translate(34 ${h - 30})" fill="#5e3e26" font-size="9">
      <line x1="0" y1="0" x2="72" y2="0" stroke="#5e3e26" stroke-width="1.5"/>
      <path d="M0-4V4 M36-3V3 M72-4V4" stroke="#5e3e26" stroke-width="1.2"/>
      <text x="36" y="-6" text-anchor="middle">约百步尺</text>
    </g>
  </svg>`;
}
