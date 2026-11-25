import { normalizeRules } from './triggers.js';
import { findGemById } from './content/gems.js';
import { EQUIPMENT_AFFIX_REGISTRY } from './content/equipment-affixes.js';
import {
  EQUIPMENT_QUALITIES,
  clampEquipmentLevel,
  hashSeed,
  levelStatScale,
  resolveEquipmentQuality,
} from './equipment-scale.js';
import { combatScale } from './combat-scale.js';

export { EQUIPMENT_AFFIX_REGISTRY } from './content/equipment-affixes.js';

export const EQUIPMENT_AFFIX_QUALITIES = Object.freeze({
  common: Object.freeze({ points: 1, weight: 52 }),
  uncommon: Object.freeze({ points: 2, weight: 28 }),
  rare: Object.freeze({ points: 3, weight: 14 }),
  epic: Object.freeze({ points: 4, weight: 5 }),
  legendary: Object.freeze({ points: 5, weight: 1 }),
});

export const EQUIPMENT_AFFIX_QUALITY_ORDER = Object.freeze(Object.keys(EQUIPMENT_AFFIX_QUALITIES));

function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function normalizeEquipmentAffix(value) {
  if (!value || !Object.hasOwn(EQUIPMENT_AFFIX_REGISTRY, value.id)) return null;
  if (!Object.hasOwn(EQUIPMENT_AFFIX_QUALITIES, value.quality)) return null;
  return { id: value.id, quality: value.quality };
}

export function restoreEquipmentAffixes(value, catalog = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!catalog.some((template) => template.id === id) && !findGemById(id)) continue;
    const entry = normalizeEquipmentAffix(raw);
    if (entry)
      Object.defineProperty(result, id, {
        value: entry,
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  return result;
}

function randomQuality(rng) {
  const total = EQUIPMENT_AFFIX_QUALITY_ORDER.reduce(
    (sum, quality) => sum + EQUIPMENT_AFFIX_QUALITIES[quality].weight,
    0,
  );
  let cursor = rng() * total;
  for (const quality of EQUIPMENT_AFFIX_QUALITY_ORDER) {
    cursor -= EQUIPMENT_AFFIX_QUALITIES[quality].weight;
    if (cursor <= 0) return quality;
  }
  return 'common';
}

export function rollEquipmentAffix(seed = 1, affixId = null) {
  const rng = createRng(seed);
  const ids = Object.keys(EQUIPMENT_AFFIX_REGISTRY);
  if (affixId !== null && !Object.hasOwn(EQUIPMENT_AFFIX_REGISTRY, affixId))
    throw Error('装备词条不存在');
  const id = affixId || ids[Math.floor(rng() * ids.length)];
  return { id, quality: randomQuality(rng) };
}

export function equipmentAffixCost(template, instance = template) {
  const level = clampEquipmentLevel(instance?.level || template?.level || 1);
  const tier =
    EQUIPMENT_QUALITIES[
      resolveEquipmentQuality(instance?.quality || template?.quality, template?.price)
    ].tier;
  return Math.max(5, Math.ceil((template?.price || 10) * 0.25 + level * 0.8 + tier * 2));
}

export function equipmentAffixStatBonus(equipment) {
  const bonus = {};
  for (const raw of equipment?.affixes || []) {
    const entry = normalizeEquipmentAffix(raw);
    if (!entry) continue;
    const definition = EQUIPMENT_AFFIX_REGISTRY[entry.id];
    const points = EQUIPMENT_AFFIX_QUALITIES[entry.quality].points;
    for (const [key, value] of Object.entries(definition.statsPerPoint)) {
      const amount = Math.max(
        1,
        Math.round(value * points * levelStatScale(key, equipment.level || 1)),
      );
      bonus[key] = (bonus[key] || 0) + amount;
    }
  }
  return bonus;
}

/** Single-item presentation includes shared affix stats, never character-wide threshold passives. */
export function equipmentInstanceView(template, instance = null, affixesByTemplate = {}) {
  if (!template) return null;
  const affix =
    affixesByTemplate && Object.hasOwn(affixesByTemplate, template.id)
      ? normalizeEquipmentAffix(affixesByTemplate[template.id])
      : null;
  const view = {
    ...structuredClone(template),
    ...(instance ? structuredClone(instance) : {}),
    id: instance?.id || template.id,
    templateId: template.id,
    name: template.name,
    flavor: template.flavor,
    price: template.price,
    stats: structuredClone(instance?.stats || template.stats || {}),
    rules: structuredClone(instance?.rules || template.rules || []),
    affixes: affix ? [affix] : [],
  };
  view.affixStatBonus = equipmentAffixStatBonus(view);
  for (const [key, value] of Object.entries(view.affixStatBonus))
    view.stats[key] = (view.stats[key] || 0) + value;
  return view;
}

function scaledPassiveRules(rules, level) {
  const scale = combatScale(level);
  return normalizeRules(
    rules.map((rule) => ({
      ...structuredClone(rule),
      effects: rule.effects.map((effect) => {
        if (effect.type === 'buff' || effect.type === 'cleanse') return structuredClone(effect);
        const factor = effect.type === 'mana' ? Math.sqrt(scale) : scale;
        return {
          ...structuredClone(effect),
          value: Math.max(1, Math.round(effect.value * factor)),
        };
      }),
    })),
  );
}

/** A character's equipped families earn quality points; each family unlocks each threshold once. */
export function equipmentAffixProgress(equipment = []) {
  const byFamily = new Map();
  for (const item of equipment) {
    for (const raw of item?.affixes || []) {
      const entry = normalizeEquipmentAffix(raw);
      if (!entry) continue;
      const current = byFamily.get(entry.id) || { id: entry.id, points: 0, level: 1 };
      current.points += EQUIPMENT_AFFIX_QUALITIES[entry.quality].points;
      current.level = Math.max(current.level, clampEquipmentLevel(item.level || 1));
      byFamily.set(entry.id, current);
    }
  }
  return [...byFamily.values()].map((family) => ({
    ...family,
    thresholds: EQUIPMENT_AFFIX_REGISTRY[family.id].passives.map((passive) => ({
      required: passive.required,
      unlocked: family.points >= passive.required,
      rules: scaledPassiveRules(passive.rules, family.level),
    })),
  }));
}

export function equipmentAffixPassiveRules(equipment = []) {
  return equipmentAffixProgress(equipment).flatMap((family) =>
    family.thresholds
      .filter((threshold) => threshold.unlocked)
      .flatMap((threshold) => threshold.rules),
  );
}

/** Freeze shared affixes into the same equipment definitions consumed by the battle engine. */
export function compileEquipmentAffixes(equipment = []) {
  const result = equipment.map((item) => {
    const stats = structuredClone(item.stats || {});
    for (const [key, value] of Object.entries(equipmentAffixStatBonus(item)))
      stats[key] = (stats[key] || 0) + value;
    return { ...item, stats, rules: structuredClone(item.rules || []) };
  });
  for (const family of equipmentAffixProgress(equipment)) {
    const owner = result.find((item) => item.affixes?.some((entry) => entry.id === family.id));
    if (!owner) continue;
    for (const threshold of family.thresholds) {
      if (!threshold.unlocked) continue;
      owner.rules.push(...threshold.rules);
    }
  }
  return result;
}

function templateFor(library, targetId) {
  const instance = library?.equipment?.owned?.find((item) => item.id === targetId);
  const id = instance?.templateId || targetId;
  const template = library?.equipment?.catalog?.find((item) => item.id === id) || findGemById(id);
  if (!template) throw Error('装备蓝图不存在');
  return template;
}

function writeAffix(library, targetId, seed, affixId, adding, currency = 'ether') {
  const template = templateFor(library, targetId);
  const map = library.equipment.affixesByTemplate;
  const current =
    map && Object.hasOwn(map, template.id) ? normalizeEquipmentAffix(map[template.id]) : null;
  if (adding && current) throw Error('该装备已有词条，请使用刷新');
  if (!adding && !current) throw Error('该装备尚无词条，请先添加');
  const cost = equipmentAffixCost(template);
  if ((library.inventory?.[currency] || 0) < cost) {
    throw Error(currency === 'gold' ? '金币不足以调整装备词条' : '以太不足以调整装备词条');
  }
  const nextSeed =
    seed === null || seed === undefined
      ? hashSeed(`${template.id}:affix:${Date.now()}:${Math.random()}`)
      : Number(seed) >>> 0;
  const next = rollEquipmentAffix(nextSeed, affixId);
  library.equipment.affixesByTemplate ||= {};
  Object.defineProperty(library.equipment.affixesByTemplate, template.id, {
    value: next,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  library.inventory[currency] -= cost;
  return next;
}

export function addEquipmentAffix(library, targetId, affixId = null, seed = null) {
  return writeAffix(library, targetId, seed, affixId, true);
}

export function refreshEquipmentAffixes(library, targetId, seed = null) {
  return writeAffix(library, targetId, seed, null, false);
}

/** Pay gold at the blacksmith; all copies still share the blueprint's affix. */
export function smithEquipmentAffix(library, instanceId, { refresh = false, seed = null } = {}) {
  if (!library.equipment.owned.some((item) => item.id === instanceId)) {
    throw Error('未持有该装备实例');
  }
  return writeAffix(library, instanceId, seed, null, !refresh, 'gold');
}
