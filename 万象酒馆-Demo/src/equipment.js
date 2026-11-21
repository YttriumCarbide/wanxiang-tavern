import { materializeEquipment } from './equipment-materialize.js';
export {
  materializeEquipment,
  normalizeEquipment,
  restoreEquipment,
} from './equipment-materialize.js';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CRAFT_CATEGORIES,
  EQUIPMENT_SLOT_ORDER,
  resolveEquipmentTemplate,
} from './equipment-slots.js';
export {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CRAFT_CATEGORIES,
  EQUIPMENT_SLOT_ORDER,
  hasLegacyCategorizedEquipment,
  inferLegacyEquipmentCategory,
  normalizeEquipmentCategory,
  resolveEquipmentTemplate,
} from './equipment-slots.js';
export { applyEquipment } from './equipment-combat.js';
import {
  EQUIPMENT_QUALITIES,
  clampEquipmentLevel,
  hashSeed,
  qualityFromValue,
  resolveEquipmentQuality,
} from './equipment-scale.js';
export {
  EQUIPMENT_QUALITIES,
  EQUIPMENT_QUALITY_ORDER,
  EQUIPMENT_STATS,
  STAT_UNIT_COSTS,
  clampEquipmentLevel,
  equipmentBudget,
  equipmentCost,
  hashSeed,
  levelStatScale,
  qualityFromValue,
  resolveEquipmentQuality,
  rollEquipmentQuality,
} from './equipment-scale.js';
import { encounterLevel } from './enemy-growth.js';
import { findGemById, gemBonusText } from './content/gems.js';
import { compileEquipmentAffixes, normalizeEquipmentAffix } from './equipment-affixes.js';
export {
  EQUIPMENT_AFFIX_REGISTRY,
  EQUIPMENT_AFFIX_QUALITIES,
  EQUIPMENT_AFFIX_QUALITY_ORDER,
  addEquipmentAffix,
  refreshEquipmentAffixes,
  equipmentAffixCost,
  equipmentAffixStatBonus,
  equipmentInstanceView,
  equipmentAffixProgress,
  equipmentAffixPassiveRules,
} from './equipment-affixes.js';

export function favoriteEquipment(library, id) {
  const state = library.equipment;
  if (!state.catalog.some((item) => item.id === id)) throw Error('装备方案不存在');
  state.favorites ||= [];
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter((key) => key !== id)
    : [...state.favorites, id];
}

export function deleteEquipmentPlan(library, id) {
  const state = library.equipment;
  if (!state.catalog.some((item) => item.id === id)) throw Error('装备方案不存在');
  state.hidden = [...new Set([...(state.hidden || []), id])];
  state.favorites = (state.favorites || []).filter((key) => key !== id);
}

/** Maximum equipment level unlocked across party growth, explored frontiers, and loot archives. */
export function maxUnlockedEquipmentLevel(library) {
  let maxLevel = 1;
  for (const member of library?.characters || []) {
    maxLevel = Math.max(maxLevel, Number(member?.growth?.level) || 1);
  }
  for (const item of library?.archives?.items || []) {
    maxLevel = Math.max(maxLevel, Number(item?.level) || 1);
  }
  for (const owned of library?.equipment?.owned || []) {
    maxLevel = Math.max(maxLevel, Number(owned?.level) || 1);
  }
  for (const [map, state] of Object.entries(library?.exploration || {})) {
    if (!state || typeof state !== 'object') continue;
    if (Array.isArray(state.frontier)) {
      for (const node of state.frontier) {
        maxLevel = Math.max(maxLevel, encounterLevel({ ...node, map: node.map || map }));
      }
    }
    if (state.world?.sites) {
      for (let seq = 0; seq < (state.clears || 0); seq++) {
        maxLevel = Math.max(maxLevel, encounterLevel({ map, sequence: seq, world: state.world }));
      }
    }
  }
  return clampEquipmentLevel(maxLevel);
}

export function reforgeCost(template, instance) {
  const tier =
    EQUIPMENT_QUALITIES[resolveEquipmentQuality(instance?.quality, template?.price)].tier;
  const level = clampEquipmentLevel(instance?.level || template?.level || 1);
  return Math.max(3, Math.ceil(((template?.price || 10) * 0.35 + level * 1.2) * (tier * 0.45)));
}

export function temperCost(template, instance, targetLevel = (instance?.level || 1) + 1) {
  const tier =
    EQUIPMENT_QUALITIES[resolveEquipmentQuality(instance?.quality, template?.price)].tier;
  const current = clampEquipmentLevel(instance?.level || template?.level || 1);
  const delta = Math.max(1, clampEquipmentLevel(targetLevel) - current);
  return Math.max(4, Math.ceil(delta * (2.5 + tier * 1.6 + (template?.price || 10) * 0.06)));
}

export function ascendCost(template, instance) {
  const quality = EQUIPMENT_QUALITIES[resolveEquipmentQuality(instance?.quality, template?.price)];
  if (!quality.ascendTo) return 0;
  const level = clampEquipmentLevel(instance?.level || template?.level || 1);
  return Math.max(
    10,
    Math.ceil(quality.ascendEtherBase + level * 1.2 + (template?.price || 10) * 0.25),
  );
}

export function dismantleEther(template, instance) {
  const invested = Math.max(0, Math.trunc(Number(instance?.investedEther) || 0));
  return Math.floor(invested * 0.4);
}

export function buyEquipment(library, templateId, instanceId, options = {}) {
  return addEquipmentInstance(library, templateId, instanceId, options, true);
}

export function grantEquipment(library, templateId, instanceId, options = {}) {
  return addEquipmentInstance(library, templateId, instanceId, options, false);
}

function addEquipmentInstance(library, templateId, instanceId, options, purchase) {
  const template = library.equipment.catalog.find((item) => item.id === templateId);
  if (!template || library.equipment.hidden?.includes(templateId)) throw Error('装备方案已删除');
  if (purchase && library.inventory.ether < template.price) throw Error('以太不足');
  if (library.equipment.owned.length >= 1000) throw Error('装备背包已满');
  if (library.equipment.owned.some((item) => item.id === instanceId)) throw Error('装备标识重复');
  const level = clampEquipmentLevel(options.level ?? template.level ?? 1);
  const quality = resolveEquipmentQuality(options.quality ?? template.quality, template.price);
  const seed =
    options.seed !== undefined
      ? Number(options.seed) >>> 0
      : hashSeed(`${instanceId}:${library.equipment.owned.length}:${Date.now()}`);
  const rolled = materializeEquipment({
    design: template.design,
    stats: template.stats,
    rules: template.rules,
    level,
    quality,
    seed,
  });
  if (purchase) library.inventory.ether -= template.price;
  library.equipment.owned.push({
    id: instanceId,
    templateId,
    category: template.category,
    investedEther: purchase ? Math.max(0, Math.trunc(Number(template.price) || 0)) : 0,
    ...rolled,
  });
  return library.equipment.owned.at(-1);
}

function createSeededRandom(seed) {
  let state = (hashSeed(String(seed ?? 'voucher')) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Resolve protagonist current level from library party/characters (clamped to 1..99). */
export function protagonistLevel(library) {
  const chars = Array.isArray(library?.characters) ? library.characters : [];
  const protagonist =
    chars.find((item) => item?.id && item.id === library?.protagonistId) ||
    chars.find((item) => item?.protagonist === true || item?.role === 'protagonist') ||
    chars[0];
  return clampEquipmentLevel(Number(protagonist?.growth?.level ?? protagonist?.level ?? 1) || 1);
}

/** Compute bounded normal-distribution voucher equipment specs (weapon/armor/pendant, never gem). */
export function rollVoucherEquipmentSpec(library, options = {}) {
  const rand =
    typeof options.random === 'function'
      ? options.random
      : options.seed !== undefined
        ? createSeededRandom(options.seed)
        : Math.random;
  const heroLevel = protagonistLevel(library);
  const downSpread = Math.max(2, Math.round(heroLevel * 0.25));
  const upSpread = Math.max(2, Math.round(heroLevel * 0.18));
  const minLevel = clampEquipmentLevel(Math.max(1, heroLevel - downSpread));
  const maxLevel = clampEquipmentLevel(Math.min(99, heroLevel + upSpread));
  const u1 = Math.max(1e-7, Number(options.unitNormals?.[0] ?? rand()));
  const u2 = Number(options.unitNormals?.[1] ?? rand());
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const sigma = Math.max(1, (maxLevel - minLevel) / 3.6);
  const level = Math.max(minLevel, Math.min(maxLevel, Math.round(heroLevel + z * sigma)));
  const qualities = Object.keys(EQUIPMENT_QUALITIES);
  const quality =
    options.quality && EQUIPMENT_QUALITIES[options.quality]
      ? options.quality
      : qualities[Math.min(qualities.length - 1, Math.floor(rand() * qualities.length))];
  const category =
    options.category && EQUIPMENT_CRAFT_CATEGORIES.includes(options.category)
      ? options.category
      : EQUIPMENT_CRAFT_CATEGORIES[
          Math.min(
            EQUIPMENT_CRAFT_CATEGORIES.length - 1,
            Math.floor(rand() * EQUIPMENT_CRAFT_CATEGORIES.length),
          )
        ];
  const valueByQuality = { common: 10, uncommon: 30, rare: 60, epic: 100, legendary: 160 };
  const suffix = `${Date.now().toString(36)}-${Math.floor(rand() * 0xffffff).toString(16)}`;
  const qualityLabel = EQUIPMENT_QUALITIES[quality]?.name || quality;
  const categoryLabel = EQUIPMENT_CATEGORIES[category]?.label || category;
  return {
    id: options.id || `voucher-${suffix}`,
    name: `未命名${qualityLabel}${categoryLabel}胚胎`,
    description: `以装备兑换券凝聚的 Lv.${level} ${qualityLabel}${categoryLabel}胚胎，请依据背景与品质赋予其正式装备名称与风格描述。`,
    value: valueByQuality[quality] || 10,
    category,
    level,
    quality,
    voucherForged: true,
    bounds: { heroLevel, minLevel, maxLevel },
    script:
      options.script ||
      library?.worldbook?.summary ||
      '万象酒馆以太炉心：以装备兑换券引动纯正以太，依据使用者当前修为在允许阶位波动区间内锻造兵刃、护甲或挂坠（不含宝石）。',
  };
}

/** Grant a preset gem directly into inventory without going through ether crafting. */
export function grantGem(library, gemId, instanceId) {
  const gem = findGemById(gemId);
  if (!gem) throw Error('宝石预设不存在');
  if (!library?.equipment?.owned) throw Error('装备背包未初始化');
  if (library.equipment.owned.length >= 1000) throw Error('装备背包已满');
  if (library.equipment.owned.some((item) => item.id === instanceId)) throw Error('宝石标识重复');
  const entry = {
    id: instanceId,
    templateId: gem.id,
    category: 'gem',
    level: 1,
    quality: gem.quality,
    stats: {},
    rules: [],
    investedEther: 0,
    dcBonus: structuredClone(gem.dcBonus),
    description: gemBonusText(gem.dcBonus),
    flavor: gem.flavor,
  };
  library.equipment.owned.push(entry);
  return entry;
}

function ownedWithTemplate(library, instanceId) {
  const instance = library.equipment?.owned.find((item) => item.id === instanceId);
  if (!instance) throw Error('未持有该装备实例');
  const template = resolveEquipmentTemplate(library, instance.templateId);
  if (!template) throw Error('装备蓝图不存在');
  return { instance, template };
}

export function reforgeEquipment(library, instanceId, seed = null) {
  const { instance, template } = ownedWithTemplate(library, instanceId);
  if (template.category === 'gem') throw Error('宝石专注于 DC 检定加成，无需重铸');
  const cost = reforgeCost(template, instance);
  if ((library.inventory.ether || 0) < cost) throw Error('以太不足以重铸属性');
  const nextSeed =
    seed !== null && seed !== undefined
      ? Number(seed) >>> 0
      : hashSeed(`${instanceId}:reforge:${instance.seed ?? 1}:${Date.now()}:${Math.random()}`);
  const rolled = materializeEquipment({
    design: template.design,
    stats: instance.stats || template.stats,
    rules: instance.rules || template.rules,
    level: instance.level || template.level || 1,
    quality: instance.quality || template.quality || qualityFromValue(template.price),
    seed: nextSeed,
  });
  library.inventory.ether -= cost;
  instance.investedEther = Math.max(0, Number(instance.investedEther) || 0) + cost;
  Object.assign(instance, rolled);
  return instance;
}

export function temperEquipment(library, instanceId, targetLevel = null) {
  const { instance, template } = ownedWithTemplate(library, instanceId);
  if (template.category === 'gem') throw Error('宝石专注于 DC 检定加成，无需淬炼');
  const currentLevel = clampEquipmentLevel(instance.level || template.level || 1);
  const maxUnlocked = maxUnlockedEquipmentLevel(library);
  const desired = targetLevel === null ? currentLevel + 1 : clampEquipmentLevel(targetLevel);
  if (desired <= currentLevel) throw Error('目标等级必须高于当前等级');
  if (desired > maxUnlocked) throw Error(`当前最高只解锁到 Lv.${maxUnlocked}`);
  const cost = temperCost(template, instance, desired);
  if ((library.inventory.ether || 0) < cost) throw Error('以太不足以淬炼升级');
  const rolled = materializeEquipment({
    design: template.design,
    stats: instance.stats || template.stats,
    rules: instance.rules || template.rules,
    level: desired,
    quality: instance.quality || template.quality || qualityFromValue(template.price),
    seed: instance.seed ?? hashSeed(`${instance.id}:${template.id}`),
  });
  library.inventory.ether -= cost;
  instance.investedEther = Math.max(0, Number(instance.investedEther) || 0) + cost;
  Object.assign(instance, rolled);
  return instance;
}

export function ascendEquipment(library, instanceId, seed = null) {
  const { instance, template } = ownedWithTemplate(library, instanceId);
  if (template.category === 'gem') throw Error('宝石专注于 DC 检定加成，无需升阶');
  const currentQuality = resolveEquipmentQuality(
    instance.quality ?? template.quality,
    template.price,
  );
  const meta = EQUIPMENT_QUALITIES[currentQuality];
  if (!meta.ascendTo) throw Error('该装备已达最高传说品质');
  const cost = ascendCost(template, instance);
  if ((library.inventory.ether || 0) < cost) throw Error('以太不足以品质升阶');
  const nextSeed =
    seed !== null && seed !== undefined
      ? Number(seed) >>> 0
      : (instance.seed ?? hashSeed(`${instance.id}:ascend:${meta.ascendTo}`));
  const rolled = materializeEquipment({
    design: template.design,
    stats: instance.stats || template.stats,
    rules: instance.rules || template.rules,
    level: instance.level || template.level || 1,
    quality: meta.ascendTo,
    seed: nextSeed,
  });
  library.inventory.ether -= cost;
  instance.investedEther = Math.max(0, Number(instance.investedEther) || 0) + cost;
  Object.assign(instance, rolled);
  return instance;
}

export function dismantleEquipment(library, instanceId) {
  const { instance, template } = ownedWithTemplate(library, instanceId);
  if (library.characters?.some((member) => member.equipment?.includes(instanceId))) {
    throw Error('该装备正在穿戴中，请先卸下再分解');
  }
  const refund = dismantleEther(template, instance);
  library.equipment.owned = library.equipment.owned.filter((item) => item.id !== instanceId);
  library.inventory.ether = Math.min(999999999, (library.inventory.ether || 0) + refund);
  return refund;
}

export function equip(library, characterId, slot, instanceId) {
  const member = library.characters.find((item) => item.id === characterId);
  if (!member || !Number.isInteger(slot) || slot < 0 || slot >= EQUIPMENT_SLOT_ORDER.length)
    throw Error('装备槽无效');
  const slotCategory = EQUIPMENT_SLOT_ORDER[slot];
  if (instanceId && !library.equipment.owned.some((item) => item.id === instanceId))
    throw Error('未持有该装备');
  if (instanceId && library.characters.some((item) => item.equipment?.includes(instanceId)))
    throw Error('该装备已被使用，请先卸下');
  if (instanceId) {
    const instance = library.equipment.owned.find((item) => item.id === instanceId);
    const template = resolveEquipmentTemplate(library, instance?.templateId);
    const name = template?.name;
    if (
      equippedDefinitions(library, member).some(
        (item) => item.name === name && member.equipment?.[slot] !== item.id,
      )
    )
      throw Error('同名装备每名角色只能装备一件');
    if (template?.category && template.category !== slotCategory) {
      throw Error(`该槽位只能装备${EQUIPMENT_CATEGORIES[slotCategory].label}`);
    }
  }
  member.equipment ||= [null, null, null, null];
  while (member.equipment.length < EQUIPMENT_SLOT_ORDER.length) member.equipment.push(null);
  member.equipment = member.equipment.slice(0, EQUIPMENT_SLOT_ORDER.length);
  member.equipment[slot] = instanceId || null;
}

export function equippedDefinitions(library, member) {
  const names = new Set();
  const definitions = (member.equipment || [])
    .slice(0, EQUIPMENT_SLOT_ORDER.length)
    .map((id) => {
      if (!id) return null;
      const instance = library.equipment?.owned.find((item) => item.id === id);
      const template = resolveEquipmentTemplate(library, instance?.templateId);
      if (!template) return null;
      const stats = instance.stats || template.stats || {};
      const rules = instance.rules || template.rules || [];
      const dcBonus = instance.dcBonus || template.dcBonus;
      const affixMap = library.equipment.affixesByTemplate;
      const affix =
        affixMap && Object.hasOwn(affixMap, template.id)
          ? normalizeEquipmentAffix(affixMap[template.id])
          : null;
      return {
        ...structuredClone(template),
        id,
        templateId: template.id,
        category: template.category,
        level: clampEquipmentLevel(instance.level ?? template.level ?? 1),
        quality: resolveEquipmentQuality(instance.quality ?? template.quality, template.price),
        ...(instance.seed !== undefined ? { seed: instance.seed } : {}),
        stats: structuredClone(stats),
        rules: structuredClone(rules),
        affixes: affix ? [affix] : [],
        ...(dcBonus ? { dcBonus: structuredClone(dcBonus) } : {}),
        ...(instance.statRanges ? { statRanges: structuredClone(instance.statRanges) } : {}),
        ...(Number.isInteger(instance.rollPercent) ? { rollPercent: instance.rollPercent } : {}),
        ...(instance.description ? { description: instance.description } : {}),
      };
    })
    .filter((item) => item && !names.has(item.name) && names.add(item.name));
  return compileEquipmentAffixes(definitions);
}
