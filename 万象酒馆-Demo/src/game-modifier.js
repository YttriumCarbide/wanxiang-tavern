import { ITEMS } from './content/items.js';
import { statusStacks } from './status-rules.js';

const CURRENCIES = Object.freeze({
  gold: { label: '金币', max: 999999999 },
  ether: { label: '以太', max: 999999999 },
  summonContracts: { label: '召唤契约', max: 999999 },
  equipmentVouchers: { label: '装备券', max: 999999 },
});

const EFFECT_LABELS = Object.freeze({
  damage: '伤害',
  heal: '治疗量',
  selfHeal: '自身治疗量',
  shield: '护盾量',
  selfShield: '自身护盾量',
  mana: '法力回复量',
  selfMana: '自身法力回复量',
  buff: '状态层数',
});

const validNumber = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max;

function resourceField(key) {
  if (Object.hasOwn(CURRENCIES, key)) return CURRENCIES[key];
  if (!key.startsWith('item:')) return null;
  const id = key.slice(5);
  return Object.hasOwn(ITEMS, id) ? { label: ITEMS[id].name, max: 9999, item: id } : null;
}

function resourceValue(inventory, key, field) {
  return (field.item ? inventory.items?.[field.item] : inventory[key]) ?? 0;
}

export function modifierResourceFields(inventory) {
  return [...Object.keys(CURRENCIES), ...Object.keys(ITEMS).map((id) => 'item:' + id)].map(
    (key) => {
      const field = resourceField(key);
      return { key, ...field, min: 0, value: resourceValue(inventory, key, field) };
    },
  );
}

export function restoreModifierHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
    const entries = Object.entries(record);
    if (
      !entries.length ||
      entries.some(([key, delta]) => {
        const field = resourceField(key);
        return !field || !delta || !validNumber(delta, -field.max, field.max);
      })
    )
      return [];
    return [Object.fromEntries(entries)];
  });
}

function changedInventory(inventory, values) {
  const next = { ...inventory, items: { ...inventory.items } };
  for (const [key, value] of Object.entries(values)) {
    const field = resourceField(key);
    if (!field || !validNumber(value, 0, field.max))
      throw Error(`${field?.label || '资源'}超出可用范围。`);
    if (field.item) next.items[field.item] = value;
    else next[key] = value;
  }
  return next;
}

export function modifyResources(library, values) {
  const inventory = changedInventory(library.inventory, values);
  const changes = Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) => {
      const delta = value - resourceValue(library.inventory, key, resourceField(key));
      return delta ? [[key, delta]] : [];
    }),
  );
  if (!Object.keys(changes).length) return library;
  return {
    ...library,
    inventory,
    modifierResourceHistory: [...(library.modifierResourceHistory || []), changes],
  };
}

export function undoResourceModification(library) {
  const history = library.modifierResourceHistory || [];
  const last = history.at(-1);
  if (!last) return library;
  const values = Object.fromEntries(
    Object.entries(last).map(([key, delta]) => {
      const field = resourceField(key);
      const value = resourceValue(library.inventory, key, field) - delta;
      if (!validNumber(value, 0, field.max))
        throw Error(`${field.label}余额不足或会超出上限，本笔修改暂时无法撤回。`);
      return [key, value];
    }),
  );
  return {
    ...library,
    inventory: changedInventory(library.inventory, values),
    modifierResourceHistory: history.slice(0, -1),
  };
}

function combatField(path, key, label, value, min, max) {
  return { path, key, label, value, min, max };
}

function skillSection(skill, path) {
  const key = `skill:${JSON.stringify([...path, skill.id])}:`;
  const fields = [];
  if (path[0] === 'skills') {
    fields.push(
      combatField([...path, 'ap'], key + 'ap', '行动消耗（AP）', skill.ap ?? 1, 1, 3),
      combatField([...path, 'mp'], key + 'mp', '法力消耗（SP）', skill.mp ?? 0, 0, 999),
    );
  }
  for (const [index, effect] of (skill.effects || []).entries()) {
    if (
      !Object.hasOwn(EFFECT_LABELS, effect.type) ||
      !Number.isSafeInteger(effect.value) ||
      effect.maxHpPercent ||
      effect.maxMpPercent
    )
      continue;
    const max = effect.type === 'buff' ? statusStacks(effect.buff, 9999) : 99999;
    fields.push(
      combatField(
        [...path, 'effects', index, 'value'],
        key + JSON.stringify([index, effect.type, effect.buff, effect.target]),
        `${EFFECT_LABELS[effect.type]} · 效果 ${index + 1}`,
        effect.value,
        1,
        max,
      ),
    );
  }
  return { key, label: skill.name, fields };
}

export function modifierCharacterSections(member) {
  const { combat } = member;
  const stats = [
    combatField(null, 'level', '等级', member.growth?.level ?? 1, 1, 99),
    combatField(['hp'], 'hp', '基础生命（HP）', combat.hp, 1, 99999),
    combatField(['mp'], 'mp', '基础法力（SP）', combat.mp, 0, 99999),
    combatField(['attack'], 'attack', '基础普攻伤害', combat.attack, 1, 99999),
  ];
  const skills = combat.skills.flatMap((skill, index) =>
    skill.passive ? [] : [skillSection(skill, ['skills', index])],
  );
  if (combat.entrySkill) skills.push(skillSection(combat.entrySkill, ['entrySkill']));
  return { stats, skills: skills.filter(({ fields }) => fields.length) };
}

function characterFields(member) {
  const { stats, skills } = modifierCharacterSections(member);
  return [...stats, ...skills.flatMap(({ fields }) => fields)];
}

export function restoreCharacterModifier(member, values) {
  return Object.fromEntries(
    characterFields(member).flatMap(({ key, min, max }) => {
      const next = values?.[key];
      return validNumber(next, min, max) ? [[key, next]] : [];
    }),
  );
}

export function modifyCharacter(member, values) {
  const fields = new Map(characterFields(member).map((field) => [field.key, field]));
  const next = { ...member.modifierValues };
  for (const [key, value] of Object.entries(values)) {
    const field = fields.get(key);
    if (!field || !validNumber(value, field.min, field.max))
      throw Error(`${field?.label || '角色数值'}超出可用范围。`);
    if (value === field.value) delete next[key];
    else next[key] = value;
  }
  return { ...member, modifierValues: next };
}

export function restoreModifiedCharacter(member, skillKey) {
  const next = { ...member };
  if (!skillKey) delete next.modifierValues;
  else
    next.modifierValues = Object.fromEntries(
      Object.entries(member.modifierValues || {}).filter(([key]) => !key.startsWith(skillKey)),
    );
  return next;
}

export function applyCharacterModifier(member, combat) {
  if (!member.modifierValues || !Object.keys(member.modifierValues).length) return;
  for (const { key, path } of characterFields(member)) {
    if (!path || !Object.hasOwn(member.modifierValues, key)) continue;
    const parent = path.slice(0, -1).reduce((value, part) => value[part], combat);
    parent[path.at(-1)] = member.modifierValues[key];
  }
}
