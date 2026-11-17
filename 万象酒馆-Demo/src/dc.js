/** Pure 2D6 DC check mechanics and six-attribute rules shared across generation, story and UI. */
import { findGemById } from './content/gems.js';

export const DC_ATTR_MIN = 6;
export const DC_ATTR_MAX = 18;
export const DC_ATTR_BUDGET = 72;
export const DC_DEFAULT_DIFFICULTY = 9;

export const DC_ATTRIBUTES = Object.freeze([
  Object.freeze({
    key: 'str',
    label: '力量',
    short: 'STR',
    desc: '体魄爆发、强行破障、近战角力与负重攀登',
  }),
  Object.freeze({
    key: 'dex',
    label: '敏捷',
    short: 'DEX',
    desc: '潜行闪避、灵巧拆解、平衡跳跃与先手反应',
  }),
  Object.freeze({
    key: 'con',
    label: '体质',
    short: 'CON',
    desc: '耐力韧性、抵抗毒疫、长途跋涉与硬抗冲击',
  }),
  Object.freeze({
    key: 'int',
    label: '智力',
    short: 'INT',
    desc: '奥术解析、古籍破译、机关推演与博闻强识',
  }),
  Object.freeze({
    key: 'wis',
    label: '感知',
    short: 'WIS',
    desc: '危险直觉、察言观色、环境追踪与定力抗衡',
  }),
  Object.freeze({
    key: 'cha',
    label: '魅力',
    short: 'CHA',
    desc: '说服交涉、威慑唬骗、共情安抚与临场号召',
  }),
]);

export const DC_ATTRIBUTE_MAP = Object.freeze(
  Object.fromEntries(DC_ATTRIBUTES.map((attr) => [attr.key, attr])),
);

const ATTR_ALIASES = Object.freeze({
  str: 'str',
  strength: 'str',
  力量: 'str',
  体魄: 'str',
  dex: 'dex',
  dexterity: 'dex',
  敏捷: 'dex',
  灵巧: 'dex',
  con: 'con',
  constitution: 'con',
  体质: 'con',
  耐力: 'con',
  int: 'int',
  intelligence: 'int',
  智力: 'int',
  学识: 'int',
  wis: 'wis',
  wisdom: 'wis',
  感知: 'wis',
  洞察: 'wis',
  cha: 'cha',
  charisma: 'cha',
  魅力: 'cha',
  交涉: 'cha',
});

export const DC_PROTAGONIST_PRESETS = Object.freeze([
  Object.freeze({
    id: 'balanced',
    name: '均衡旅人',
    attrs: Object.freeze({ str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 }),
  }),
  Object.freeze({
    id: 'vanguard',
    name: '前锋剑客',
    attrs: Object.freeze({ str: 15, dex: 14, con: 13, int: 9, wis: 11, cha: 10 }),
  }),
  Object.freeze({
    id: 'scholar',
    name: '秘术学者',
    attrs: Object.freeze({ str: 8, dex: 11, con: 10, int: 16, wis: 15, cha: 12 }),
  }),
  Object.freeze({
    id: 'envoy',
    name: '酒馆说客',
    attrs: Object.freeze({ str: 9, dex: 12, con: 10, int: 12, wis: 13, cha: 16 }),
  }),
  Object.freeze({
    id: 'ranger',
    name: '荒野游侠',
    attrs: Object.freeze({ str: 11, dex: 16, con: 12, int: 10, wis: 15, cha: 8 }),
  }),
]);

export const OFFICIAL_DC_ATTRS = Object.freeze({
  'character-qingyuan': Object.freeze({ str: 13, dex: 14, con: 12, int: 11, wis: 12, cha: 10 }),
  'official-edith': Object.freeze({ str: 10, dex: 13, con: 11, int: 14, wis: 12, cha: 12 }),
  'official-aegis': Object.freeze({ str: 14, dex: 11, con: 15, int: 10, wis: 12, cha: 10 }),
  'official-pandora': Object.freeze({ str: 12, dex: 14, con: 10, int: 13, wis: 11, cha: 12 }),
  'official-lyria': Object.freeze({ str: 14, dex: 16, con: 11, int: 9, wis: 11, cha: 11 }),
  'official-morrow': Object.freeze({ str: 8, dex: 12, con: 10, int: 16, wis: 15, cha: 11 }),
  'official-serin': Object.freeze({ str: 8, dex: 11, con: 11, int: 13, wis: 15, cha: 14 }),
  'official-vesper': Object.freeze({ str: 8, dex: 13, con: 10, int: 15, wis: 14, cha: 12 }),
  'official-rook': Object.freeze({ str: 11, dex: 16, con: 12, int: 10, wis: 14, cha: 9 }),
  'official-luo-gongxu': Object.freeze({ str: 14, dex: 11, con: 13, int: 12, wis: 12, cha: 10 }),
  'official-silica-laps': Object.freeze({ str: 9, dex: 11, con: 10, int: 15, wis: 13, cha: 14 }),
  'official-libet': Object.freeze({ str: 8, dex: 12, con: 10, int: 12, wis: 15, cha: 15 }),
  'official-lumi': Object.freeze({ str: 9, dex: 16, con: 10, int: 11, wis: 15, cha: 11 }),
  'official-yuto-nakashi': Object.freeze({ str: 10, dex: 14, con: 11, int: 12, wis: 11, cha: 14 }),
});

const OUTCOME_LABELS = Object.freeze({
  crit: '大成功',
  success: '成功',
  fail: '失败',
  fumble: '大失败',
});

function hashSeed(input) {
  const text = String(input || 'wanxiang');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Normalize attribute keys across lowercase keys, uppercase short names, and Chinese labels. */
export function normalizeDcAttrKey(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  return ATTR_ALIASES[cleaned] || ATTR_ALIASES[raw.trim()] || null;
}

export function dcAttrLabel(key) {
  const normalized = normalizeDcAttrKey(key) || 'str';
  return DC_ATTRIBUTE_MAP[normalized]?.label || '力量';
}

export function attrMod(value) {
  const numeric = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 10;
  return Math.floor((numeric - 10) / 2);
}

export function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : String(mod);
}

const MAP_DC_BASE = Object.freeze({
  ruins: 6,
  forest: 7,
  frost: 7,
  forge: 8,
  tide: 8,
});

export function normalizeDcDifficulty(dc, fallback = DC_DEFAULT_DIFFICULTY) {
  const num = Number(dc);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(18, Math.max(5, Math.round(num)));
}

/** Compute balanced 2D6 DC target scaled by dungeon biome or route level. */
export function computeMapDc(mapOrLevel, index = 0, fallback = DC_DEFAULT_DIFFICULTY) {
  let base = null;
  let tier = 'mid';
  if (typeof mapOrLevel === 'number' && Number.isFinite(mapOrLevel)) {
    const lv = Math.max(1, Math.round(mapOrLevel));
    base = lv <= 10 ? 6 : lv <= 20 ? 7 : 8;
    tier = lv <= 10 ? 'early' : lv <= 25 ? 'mid' : 'late';
  } else if (typeof mapOrLevel === 'string' && Object.hasOwn(MAP_DC_BASE, mapOrLevel)) {
    base = MAP_DC_BASE[mapOrLevel];
    tier = mapOrLevel === 'ruins' ? 'early' : mapOrLevel === 'tide' ? 'late' : 'mid';
  }
  if (base === null) return normalizeDcDifficulty(fallback);
  const spread =
    tier === 'early'
      ? [0, 0, 1, 0]
      : tier === 'late'
        ? [1, 1, 2, 2]
        : mapOrLevel === 'forest'
          ? [0, 1, 0, 1]
          : [0, 1, 1, 2];
  const delta = spread[Math.abs(Math.trunc(index)) % spread.length];
  return normalizeDcDifficulty(base + delta);
}

export function dcOutcomeLabel(outcome) {
  return OUTCOME_LABELS[outcome] || '成功';
}

export function isDcSuccess(outcome) {
  return outcome === 'crit' || outcome === 'success';
}

/** Rebalance a six-stat object to hit the exact budget within [DC_ATTR_MIN, DC_ATTR_MAX]. */
export function rebalanceDcAttrs(raw, budget = DC_ATTR_BUDGET) {
  const next = {};
  for (const { key } of DC_ATTRIBUTES) {
    const val = Number(raw?.[key]);
    const clamped = Number.isFinite(val) ? Math.round(val) : 12;
    next[key] = Math.min(DC_ATTR_MAX, Math.max(DC_ATTR_MIN, clamped));
  }
  const keys = DC_ATTRIBUTES.map((attr) => attr.key);
  let total = keys.reduce((sum, key) => sum + next[key], 0);
  let guard = 0;
  while (total !== budget && guard < 200) {
    guard++;
    const step = total < budget ? 1 : -1;
    const candidates = keys
      .filter((key) => (step > 0 ? next[key] < DC_ATTR_MAX : next[key] > DC_ATTR_MIN))
      .sort((a, b) => (step > 0 ? next[a] - next[b] : next[b] - next[a]));
    if (!candidates.length) break;
    next[candidates[0]] += step;
    total += step;
  }
  return next;
}

/** Deterministically derive six balanced attributes for legacy or generated characters missing dcAttrs. */
export function deriveDcAttrsForCharacter(member) {
  const id = member?.id || '';
  if (OFFICIAL_DC_ATTRS[id]) return { ...OFFICIAL_DC_ATTRS[id] };
  const weapon = member?.combat?.weapon || member?.weapon || 'sword';
  const archetype = member?.archetype || '';
  const base =
    weapon === 'bow' || archetype === 'rook'
      ? { str: 11, dex: 15, con: 11, int: 11, wis: 14, cha: 10 }
      : weapon === 'staff' || ['morrow', 'serin', 'vesper'].includes(archetype)
        ? { str: 9, dex: 11, con: 10, int: 15, wis: 14, cha: 13 }
        : { str: 14, dex: 13, con: 13, int: 10, wis: 11, cha: 11 };
  const seed = hashSeed(member?.setting?.name || member?.combat?.name || id);
  const shiftA = DC_ATTRIBUTES[seed % 6].key;
  const shiftB = DC_ATTRIBUTES[(seed >>> 3) % 6].key;
  if (shiftA !== shiftB) {
    base[shiftA] = Math.min(16, base[shiftA] + 1);
    base[shiftB] = Math.max(8, base[shiftB] - 1);
  }
  return rebalanceDcAttrs(base, DC_ATTR_BUDGET);
}

/** Normalize saved or incoming character dcAttrs, preserving player budgets or falling back cleanly. */
export function normalizeDcAttrs(raw, member) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const validCount = DC_ATTRIBUTES.filter(({ key }) => {
      const value = Number(raw[key]);
      return Number.isInteger(value) && value >= DC_ATTR_MIN && value <= DC_ATTR_MAX;
    }).length;
    if (validCount === DC_ATTRIBUTES.length) {
      return rebalanceDcAttrs(raw, DC_ATTR_BUDGET);
    }
  }
  return deriveDcAttrsForCharacter(member);
}

/** Strict validation helper for AI character creation schema responses. */
export function validateGeneratedDcAttrs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw Error('角色缺少六维属性 dcAttrs');
  }
  let sum = 0;
  const parsed = {};
  for (const { key, label } of DC_ATTRIBUTES) {
    const val = raw[key];
    if (!Number.isInteger(val) || val < DC_ATTR_MIN || val > DC_ATTR_MAX) {
      throw Error(`角色属性 ${label}(${key}) 必须为 ${DC_ATTR_MIN}~${DC_ATTR_MAX} 的整数`);
    }
    parsed[key] = val;
    sum += val;
  }
  if (Math.abs(sum - DC_ATTR_BUDGET) > 6) {
    throw Error(`六维属性总点数预算为 ${DC_ATTR_BUDGET} 点（当前 ${sum} 点，超出允许微调范围）`);
  }
  return rebalanceDcAttrs(parsed, DC_ATTR_BUDGET);
}

/** Return total gem DC check bonus granted by a member's equipped gear. */
export function memberGemDcBonus(library, member, attrKey = null) {
  if (!library?.equipment || !member?.equipment) return 0;
  const normalizedAttr = attrKey ? normalizeDcAttrKey(attrKey) : null;
  let total = 0;
  for (const instanceId of member.equipment) {
    if (!instanceId) continue;
    const instance = library.equipment.owned?.find((item) => item.id === instanceId);
    const tpl =
      library.equipment.catalog?.find((item) => item.id === instance?.templateId) ||
      findGemById(instance?.templateId);
    if (!tpl || tpl.category !== 'gem') continue;
    const gemDc = instance?.dcBonus || tpl.dcBonus;
    if (!gemDc) continue;
    if (Number.isInteger(gemDc.all)) total += gemDc.all;
    if (normalizedAttr && Number.isInteger(gemDc[normalizedAttr])) {
      total += gemDc[normalizedAttr];
    }
  }
  return total;
}

/** Effective character attribute snapshot (base + any gem attr bonuses if applicable). */
export function effectiveDcAttrs(library, member) {
  const base = normalizeDcAttrs(member?.dcAttrs, member);
  const mods = {};
  for (const { key } of DC_ATTRIBUTES) {
    const gemBonus = memberGemDcBonus(library, member, key);
    mods[key] = {
      value: base[key],
      baseMod: attrMod(base[key]),
      gemBonus,
      mod: attrMod(base[key]) + gemBonus,
    };
  }
  return { base, mods };
}

export function roll2d6(rng = Math.random) {
  const d1 = 1 + Math.floor(rng() * 6);
  const d2 = 1 + Math.floor(rng() * 6);
  return [Math.min(6, Math.max(1, d1)), Math.min(6, Math.max(1, d2))];
}

/** Evaluate 2D6 + mod + bonus against DC, with double-6 crit and double-1 fumble. */
export function evaluate2d6Check({ dice, mod = 0, bonus = 0, dc = DC_DEFAULT_DIFFICULTY }) {
  const [d1, d2] = Array.isArray(dice) && dice.length === 2 ? dice : [3, 4];
  const diceSum = d1 + d2;
  const totalMod = Math.trunc(mod) + Math.trunc(bonus);
  const total = diceSum + totalMod;
  const targetDc = normalizeDcDifficulty(dc);
  let outcome = 'fail';
  if (d1 === 6 && d2 === 6) outcome = 'crit';
  else if (d1 === 1 && d2 === 1) outcome = 'fumble';
  else if (total >= targetDc) outcome = 'success';
  return {
    dice: [d1, d2],
    diceSum,
    mod: Math.trunc(mod),
    bonus: Math.trunc(bonus),
    totalMod,
    total,
    dc: targetDc,
    outcome,
    label: dcOutcomeLabel(outcome),
    success: outcome === 'crit' || outcome === 'success',
  };
}

/** Exact discrete percentage across all 36 2D6 pairs (accounting for double-6/double-1 rules). */
export function dcSuccessProbability(totalMod = 0, dc = DC_DEFAULT_DIFFICULTY) {
  const targetDc = normalizeDcDifficulty(dc);
  const modifier = Math.trunc(totalMod);
  let wins = 0;
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      if (d1 === 6 && d2 === 6) {
        wins++;
      } else if (d1 === 1 && d2 === 1) {
        continue;
      } else if (d1 + d2 + modifier >= targetDc) {
        wins++;
      }
    }
  }
  return Math.round((wins / 36) * 100);
}

/**
 * Calibrate display dice and DC when reconciling pre-rolled values with AI narrative outcomes
 * or synthesizing display dice for fixed-choice outcomes without lying to the player.
 */
export function calibrateDisplayCheck({
  dice,
  mod = 0,
  bonus = 0,
  dc = DC_DEFAULT_DIFFICULTY,
  outcome = 'success',
  seed = 'dc',
}) {
  const targetOutcome = ['crit', 'success', 'fail', 'fumble'].includes(outcome)
    ? outcome
    : 'success';
  const totalMod = Math.trunc(mod) + Math.trunc(bonus);
  let displayDc = normalizeDcDifficulty(dc);
  if (targetOutcome === 'crit') {
    return evaluate2d6Check({ dice: [6, 6], mod, bonus, dc: displayDc });
  }
  if (targetOutcome === 'fumble') {
    return evaluate2d6Check({ dice: [1, 1], mod, bonus, dc: displayDc });
  }
  if (Array.isArray(dice) && dice.length === 2) {
    const direct = evaluate2d6Check({ dice, mod, bonus, dc: displayDc });
    if (direct.outcome === targetOutcome) return direct;
  }
  const wantSuccess = targetOutcome === 'success';
  const pairs = [];
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      if ((d1 === 6 && d2 === 6) || (d1 === 1 && d2 === 1)) continue;
      const total = d1 + d2 + totalMod;
      if (wantSuccess ? total >= displayDc : total < displayDc) {
        pairs.push([d1, d2]);
      }
    }
  }
  if (pairs.length) {
    const pick = pairs[hashSeed(seed) % pairs.length];
    return evaluate2d6Check({ dice: pick, mod, bonus, dc: displayDc });
  }
  const fallbackDice = wantSuccess ? [5, 6] : [1, 2];
  displayDc = wantSuccess
    ? Math.max(5, Math.min(18, fallbackDice[0] + fallbackDice[1] + totalMod))
    : Math.max(5, Math.min(18, fallbackDice[0] + fallbackDice[1] + totalMod + 1));
  return evaluate2d6Check({ dice: fallbackDice, mod, bonus, dc: displayDc });
}

/** Compute an auto-pass threshold: very routine checks pass passively when mod is comfortably ahead. */
export function isPassiveBypass({ totalMod = 0, dc = DC_DEFAULT_DIFFICULTY }) {
  const targetDc = normalizeDcDifficulty(dc);
  return 2 + Math.trunc(totalMod) >= targetDc && targetDc <= 10;
}

export function normalizeDcSpec(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const attr = normalizeDcAttrKey(raw.attr ?? raw.attribute);
  if (!attr) return null;
  const dc = normalizeDcDifficulty(raw.dc ?? raw.difficulty, DC_DEFAULT_DIFFICULTY);
  const actor =
    typeof raw.actor === 'string' && raw.actor.trim() ? raw.actor.trim().slice(0, 80) : undefined;
  return { attr, dc, ...(actor ? { actor } : {}) };
}

export function dcSpecPropertiesSchema() {
  return {
    attr: { type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    dc: { type: 'integer', minimum: 5, maximum: 18 },
    actor: { type: 'string', minLength: 1, maxLength: 80 },
  };
}
