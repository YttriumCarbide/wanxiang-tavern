import { LEARNABLE_SKILLS, STARTER_LEARNED_SKILL_IDS } from './content/learnable-skills.js';

export const UNIVERSAL_SKILL_SLOTS = 2;

export const LEARNABLE_SKILL_MAP = Object.freeze(
  Object.fromEntries(LEARNABLE_SKILLS.map((skill) => [skill.id, skill])),
);

export function restoreLearnedSkills(list = []) {
  const valid = Array.isArray(list)
    ? list.filter((id) => typeof id === 'string' && !!LEARNABLE_SKILL_MAP[id])
    : [];
  return [...new Set([...STARTER_LEARNED_SKILL_IDS, ...valid])];
}

export function restoreEquippedSkills(raw, learnedSet = null) {
  const seen = new Set();
  const slots = Array(UNIVERSAL_SKILL_SLOTS).fill(null);
  if (!Array.isArray(raw)) return slots;
  for (let i = 0; i < UNIVERSAL_SKILL_SLOTS; i++) {
    const id = raw[i];
    if (typeof id !== 'string' || !LEARNABLE_SKILL_MAP[id] || seen.has(id)) continue;
    if (learnedSet && !learnedSet.has(id)) continue;
    seen.add(id);
    slots[i] = id;
  }
  return slots;
}

export function learnUniversalSkill(library, skillId) {
  if (!library || !LEARNABLE_SKILL_MAP[skillId]) return false;
  const current = restoreLearnedSkills(library.learnedSkills);
  const already = current.includes(skillId);
  library.learnedSkills = already ? current : [...current, skillId];
  return !already;
}

export function equipUniversalSkill(library, memberId, slotIndex, skillId) {
  const index = Number(slotIndex);
  if (!Number.isInteger(index) || index < 0 || index >= UNIVERSAL_SKILL_SLOTS) {
    throw Error('通用战技槽位无效');
  }
  const member = library?.characters?.find((entry) => entry.id === memberId);
  if (!member) throw Error('角色不存在');
  const learnedSet = new Set(restoreLearnedSkills(library.learnedSkills));
  const cleanId = skillId ? String(skillId) : null;
  if (cleanId && !LEARNABLE_SKILL_MAP[cleanId]) throw Error('未知的通用战技');
  if (cleanId && !learnedSet.has(cleanId)) throw Error('尚未研习该通用战技');
  const slots = restoreEquippedSkills(member.equippedSkills, learnedSet);
  if (cleanId) {
    for (let i = 0; i < slots.length; i++) {
      if (i !== index && slots[i] === cleanId) slots[i] = null;
    }
  }
  slots[index] = cleanId;
  member.equippedSkills = slots;
  return [...slots];
}

export function equippedUniversalSkills(member) {
  const slots = restoreEquippedSkills(member?.equippedSkills);
  return slots
    .filter(Boolean)
    .map((id) => LEARNABLE_SKILL_MAP[id])
    .filter(Boolean)
    .map((blueprint) => ({
      id: blueprint.id,
      name: blueprint.name,
      ap: blueprint.ap,
      mp: blueprint.mp,
      ...(blueprint.hp ? { hp: blueprint.hp } : {}),
      target: blueprint.target,
      effects: structuredClone(blueprint.effects),
      ...(blueprint.retreatSwap ? { retreatSwap: true } : {}),
      vfx: blueprint.vfx,
      vfxPalette: [...blueprint.vfxPalette],
      universal: true,
      text: '',
    }));
}
