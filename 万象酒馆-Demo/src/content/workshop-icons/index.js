import { NATURE_ICONS } from './nature.js';
import { CRAFTED_ICONS } from './crafted.js';
import { SUPPLY_ICONS } from './supplies.js';
import { STATION_ICONS } from './stations.js';
import { RESEARCH_ICONS } from './research.js';

/**
 * 星隙工坊图标库。
 *
 * 每个图标只描述“形状”，颜色由色调决定：同一个“晶簇”配蓝色是雾晶，配琥珀色就是酒光原石。
 * 新增物资时优先“通用形状 + 换色调”，不够用再往对应分组文件里追加新形状。
 *
 * 绘制约定（64×64 画布，内容保持在 4～60 之间）：
 * - 不写 class 的图形：主色填充 + 深色描边。
 * - l / d：色调的亮色 / 暗色；hi：高光（无描边）；sh：阴影（无描边）。
 * - 固定材质，不随色调变化：wood、wood-l、iron、iron-l、stone、stone-l、glass、fire、fire-l、leaf、leaf-l、water、ink。
 * - line：只描边不填充；thin：细描边；n：去掉描边。
 */

/** 色调：[亮色, 主色, 暗色]。 */
export const WORKSHOP_TINTS = Object.freeze({
  gold: { name: '金', colors: ['#ffe9a8', '#e0ac45', '#8a5a1c'] },
  wheat: { name: '麦黄', colors: ['#fff0b8', '#e8c66a', '#9a7a2e'] },
  amber: { name: '琥珀', colors: ['#ffd27a', '#e08a2a', '#87420f'] },
  ember: { name: '炭火', colors: ['#ffc08a', '#ef6a2b', '#8c2a12'] },
  copper: { name: '铜', colors: ['#ffc29a', '#d27a45', '#7d3a1a'] },
  ruby: { name: '赤红', colors: ['#ff9aa0', '#d23a4a', '#6e1424'] },
  rose: { name: '蔷薇', colors: ['#ffc6d6', '#e7799c', '#8a3352'] },
  violet: { name: '紫晶', colors: ['#d9c2ff', '#9a6ae0', '#4d2b85'] },
  night: { name: '夜蓝', colors: ['#a9b4ff', '#4f5bbf', '#232a63'] },
  azure: { name: '湛蓝', colors: ['#b6e2ff', '#4a9be0', '#1d4f86'] },
  frost: { name: '霜白', colors: ['#effcff', '#a9e3f2', '#4f8fa6'] },
  teal: { name: '青碧', colors: ['#b5f2e3', '#3fb8a0', '#1b6457'] },
  jade: { name: '翠绿', colors: ['#c9f5b5', '#6cc25a', '#2e6e2a'] },
  moss: { name: '苔绿', colors: ['#dfe6a3', '#9aa848', '#525c20'] },
  earth: { name: '土褐', colors: ['#e3b98a', '#a36b3c', '#5a3418'] },
  ash: { name: '灰', colors: ['#eef0ee', '#a9aeb0', '#575d62'] },
  ivory: { name: '象牙', colors: ['#fffaf0', '#eadfc6', '#9b8d6e'] },
  ink: { name: '墨', colors: ['#8c8f9e', '#44475a', '#1d1f2a'] },
});

/** 图标分组，修改器按此筛选。 */
export const WORKSHOP_ICON_GROUPS = Object.freeze({
  nature: '天然原料',
  mineral: '矿物晶石',
  crafted: '加工构件',
  tool: '工具文书',
  vessel: '容器酒饮',
  food: '食材',
  arcane: '星辉能量',
  station: '建筑设施',
  research: '研究',
});

/** 条目没有指定图标时使用的默认值。 */
export const WORKSHOP_ICON_DEFAULTS = Object.freeze({
  items: { icon: 'crystal', tint: 'gold' },
  stations: { icon: 'workbench', tint: 'earth' },
  research: { icon: 'book', tint: 'azure' },
});

export const WORKSHOP_ICONS = Object.freeze(
  [...NATURE_ICONS, ...CRAFTED_ICONS, ...SUPPLY_ICONS, ...STATION_ICONS, ...RESEARCH_ICONS].map(
    (icon) => Object.freeze({ ...icon, tags: Object.freeze([...(icon.tags || [])]) }),
  ),
);

export const WORKSHOP_ICON_MAP = new Map(WORKSHOP_ICONS.map((icon) => [icon.id, icon]));
