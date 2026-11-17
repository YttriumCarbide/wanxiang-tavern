/** Preset DC-focused gem pool for the 4th equipment slot (code-owned, never AI-crafted or upgraded). */

export const GEM_ATTR_LABELS = Object.freeze({
  all: '全属性',
  str: '力量',
  dex: '敏捷',
  con: '体质',
  int: '智力',
  wis: '感知',
  cha: '魅力',
});

export const GEM_POOL = Object.freeze([
  Object.freeze({
    id: 'gem-valor-shard',
    name: '勇力碎晶',
    category: 'gem',
    quality: 'common',
    price: 8,
    level: 1,
    dcBonus: Object.freeze({ str: 1 }),
    flavor: '温热沉实的赤铁结晶，握在掌心时令人气力充盈。',
  }),
  Object.freeze({
    id: 'gem-wind-agate',
    name: '微风青玛瑙',
    category: 'gem',
    quality: 'common',
    price: 8,
    level: 1,
    dcBonus: Object.freeze({ dex: 1 }),
    flavor: '轻如无物的流纹玛瑙，常令佩戴者的步法更添灵巧。',
  }),
  Object.freeze({
    id: 'gem-oak-amber',
    name: '坚岩琥珀芯',
    category: 'gem',
    quality: 'common',
    price: 8,
    level: 1,
    dcBonus: Object.freeze({ con: 1 }),
    flavor: '封存着古树树脂的琥珀，隐约散发着稳固生机的暖意。',
  }),
  Object.freeze({
    id: 'gem-ink-quartz',
    name: '澈思白水晶',
    category: 'gem',
    quality: 'common',
    price: 8,
    level: 1,
    dcBonus: Object.freeze({ int: 1 }),
    flavor: '切面如书页般工整的石英，凝视时杂念会悄然退散。',
  }),
  Object.freeze({
    id: 'gem-owl-moonstone',
    name: '静观月长石',
    category: 'gem',
    quality: 'common',
    price: 8,
    level: 1,
    dcBonus: Object.freeze({ wis: 1 }),
    flavor: '在暗处泛着极淡银晕，仿佛替人留意着林叶间的细响。',
  }),
  Object.freeze({
    id: 'gem-rose-garnet',
    name: '暖语石榴石',
    category: 'gem',
    quality: 'common',
    price: 8,
    level: 1,
    dcBonus: Object.freeze({ cha: 1 }),
    flavor: '酒红通透的坠石，能让言辞与神情显得格外真诚动人。',
  }),
  Object.freeze({
    id: 'gem-gladiator-onyx',
    name: '角斗士黑曜核',
    category: 'gem',
    quality: 'rare',
    price: 14,
    level: 1,
    dcBonus: Object.freeze({ str: 1, con: 1 }),
    flavor: '历经砂砾打磨的双色矿核，兼具刚猛爆发与顽强韧性。',
  }),
  Object.freeze({
    id: 'gem-trickster-opal',
    name: '流光游星欧泊',
    category: 'gem',
    quality: 'rare',
    price: 14,
    level: 1,
    dcBonus: Object.freeze({ dex: 1, cha: 1 }),
    flavor: '光线折射出捉摸不定的虹彩，总能在窘境中逢凶化吉。',
  }),
  Object.freeze({
    id: 'gem-sage-sapphire',
    name: '秘典青晶石',
    category: 'gem',
    quality: 'rare',
    price: 14,
    level: 1,
    dcBonus: Object.freeze({ int: 1, wis: 1 }),
    flavor: '学者行囊里珍藏的鉴读石，兼顾思辨推演与直觉洞察。',
  }),
  Object.freeze({
    id: 'gem-titan-diamond',
    name: '磐岳金刚晶',
    category: 'gem',
    quality: 'epic',
    price: 22,
    level: 1,
    dcBonus: Object.freeze({ str: 2, con: 1 }),
    flavor: '高密度的古矿晶魄，仅触碰便觉如山岳般难以撼动。',
  }),
  Object.freeze({
    id: 'gem-starweaver-prism',
    name: '星纬三棱镜',
    category: 'gem',
    quality: 'epic',
    price: 22,
    level: 1,
    dcBonus: Object.freeze({ int: 2, wis: 1 }),
    flavor: '能把繁复星象收束为一线清光的奇异晶棱。',
  }),
  Object.freeze({
    id: 'gem-fate-crown',
    name: '万象星冠石',
    category: 'gem',
    quality: 'legendary',
    price: 34,
    level: 1,
    dcBonus: Object.freeze({ all: 1 }),
    flavor: '旅人传颂的罕见星髓宝石，细微却全面地眷顾每一次抉择。',
  }),
]);

export function findGemById(id) {
  return GEM_POOL.find((gem) => gem.id === id) || null;
}

export function gemBonusText(dcBonus = {}) {
  return Object.entries(dcBonus)
    .filter(([, val]) => Number.isInteger(val) && val !== 0)
    .map(([key, val]) => `${GEM_ATTR_LABELS[key] || key} DC 检定 ${val >= 0 ? '+' : ''}${val}`)
    .join(' · ');
}

function hashValue(input) {
  let hash = 2166136261;
  for (const ch of String(input || 'gem')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const QUALITY_DROP_WEIGHTS = Object.freeze([
  ['common', 65],
  ['rare', 25],
  ['epic', 8],
  ['legendary', 2],
]);

/** Low-probability seeded gem drop roll across battles, skirmishes and overland milestones. */
export function rollGemDrop(seed, chance = 0.08) {
  const roll = (hashValue(seed) % 10000) / 10000;
  if (roll >= chance) return null;
  let ticket = hashValue(`${seed}:quality`) % 100;
  let pickedQuality = 'common';
  for (const [quality, weight] of QUALITY_DROP_WEIGHTS) {
    ticket -= weight;
    if (ticket < 0) {
      pickedQuality = quality;
      break;
    }
  }
  const pool = GEM_POOL.filter((item) => item.quality === pickedQuality);
  return pool[hashValue(`${seed}:pick`) % pool.length] || GEM_POOL[0];
}
