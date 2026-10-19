import { normalizeRules } from './triggers.js';

export const EQUIPMENT_STATS = Object.freeze({
  hp: '生命',
  mp: '法力',
  attack: '普攻',
  skillDamage: '技能伤害',
  limit: '行动次数',
  manaCost: '耗蓝降低',
});
export function equipmentBudget(value) {
  return Math.min(80, Math.max(1, Math.floor(Math.sqrt(value) * 1.5)));
}
export function equipmentCost(equipment) {
  const weights = { hp: 0.5, mp: 1, attack: 3, skillDamage: 3, limit: 24, manaCost: 10 };
  let cost = Object.entries(equipment.stats).reduce(
    (n, [key, value]) => n + value * weights[key],
    0,
  );
  for (const rule of equipment.rules) {
    const scope = ['allAllies', 'allEnemies', 'frontAllies', 'rearAllies'].includes(rule.target)
      ? 3
      : 1;
    const power = rule.effects.reduce(
      (n, effect) =>
        n +
        (effect.type === 'buff'
          ? effect.value * 5
          : effect.type === 'cleanse'
            ? effect.buffs.length * 3
            : effect.value),
      0,
    );
    cost += scope * power * (rule.mode === 'continuous' ? 3 : Math.max(1, rule.limit / 3));
  }
  return Math.ceil(cost);
}
export function normalizeEquipment(raw, source) {
  if (
    typeof source?.id !== 'string' ||
    !source.id ||
    source.id.length > 200 ||
    !Number.isSafeInteger(source.value) ||
    source.value < 0 ||
    source.value > 10000
  )
    throw Error('装备来源无效');
  if (
    !raw ||
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    raw.name.length > 40 ||
    typeof raw.description !== 'string' ||
    raw.description.length > 500
  )
    throw Error('装备名称或说明无效');
  const stats = {};
  for (const [key, value] of Object.entries(raw.stats || {})) {
    if (
      !Object.hasOwn(EQUIPMENT_STATS, key) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > (key === 'limit' ? 1 : key === 'manaCost' ? 2 : 40)
    )
      throw Error('装备基础属性无效');
    if (value) stats[key] = value;
  }
  const equipment = {
    id: source.id,
    name: raw.name.trim(),
    description: raw.description.trim(),
    price: source.value,
    map: source.map || source.source?.map || 'ruins',
    sourceName: source.name,
    sourceDescription: source.description || raw.sourceDescription || '',
    stats,
    rules: normalizeRules(raw.rules || []),
  };
  if (!Object.keys(stats).length && !equipment.rules.length)
    throw Error('装备至少需要一项属性或规则');
  if (equipmentCost(equipment) > equipmentBudget(source.value))
    throw Error('装备超过原物品的以太强度预算：' + source.name);
  return equipment;
}
export function restoreEquipment(value) {
  const catalog = [];
  for (const item of Array.isArray(value?.catalog) ? value.catalog : []) {
    try {
      if (!catalog.some((entry) => entry.id === item.id))
        catalog.push(
          normalizeEquipment(item, {
            id: item.id,
            name: item.sourceName || item.name,
            value: item.price,
            description: item.sourceDescription,
            map: item.map,
          }),
        );
    } catch {
      /* Damaged equipment is not equipped. */
    }
  }
  const seen = new Set();
  const owned = (Array.isArray(value?.owned) ? value.owned : [])
    .filter((item) => {
      if (
        typeof item.id !== 'string' ||
        item.id.length > 100 ||
        seen.has(item.id) ||
        !catalog.some((entry) => entry.id === item.templateId)
      )
        return false;
      seen.add(item.id);
      return true;
    })
    .map(({ id, templateId }) => ({ id, templateId }));
  return { catalog, owned: owned.slice(0, 1000) };
}
export function buyEquipment(library, templateId, instanceId) {
  const template = library.equipment.catalog.find((item) => item.id === templateId);
  if (!template || library.inventory.ether < template.price) throw Error('以太不足');
  if (library.equipment.owned.length >= 1000) throw Error('装备背包已满');
  if (library.equipment.owned.some((item) => item.id === instanceId)) throw Error('装备标识重复');
  library.inventory.ether -= template.price;
  library.equipment.owned.push({ id: instanceId, templateId });
}
export function equip(library, characterId, slot, instanceId) {
  const member = library.characters.find((item) => item.id === characterId);
  if (!member || !Number.isInteger(slot) || slot < 0 || slot > 2) throw Error('装备槽无效');
  if (instanceId && !library.equipment.owned.some((item) => item.id === instanceId))
    throw Error('未持有该装备');
  if (instanceId && library.characters.some((item) => item.equipment?.includes(instanceId)))
    throw Error('该装备已被使用，请先卸下');
  member.equipment ||= [null, null, null];
  member.equipment[slot] = instanceId || null;
}
export function equippedDefinitions(library, member) {
  return (member.equipment || [])
    .slice(0, 3)
    .map((id) => {
      const instance = library.equipment?.owned.find((item) => item.id === id);
      const template = library.equipment?.catalog.find((item) => item.id === instance?.templateId);
      return template ? { ...structuredClone(template), id } : null;
    })
    .filter(Boolean);
}
export function applyEquipment(combat, equipment) {
  const result = structuredClone(combat);
  result.equipment = structuredClone(equipment);
  for (const item of equipment) {
    for (const key of ['hp', 'mp', 'attack', 'limit']) result[key] += item.stats[key] || 0;
    for (const skill of result.skills) {
      if (skill.passive) continue;
      skill.mp = Math.max(0, skill.mp - (item.stats.manaCost || 0));
      for (const effect of skill.effects)
        if (effect.type === 'damage') effect.value += item.stats.skillDamage || 0;
    }
  }
  result.limit = Math.min(6, result.limit);
  return result;
}
