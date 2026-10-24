/** Display vocabulary only; persisted hp/mp fields and authored names stay unchanged. */
export function resourceText(value) {
  return String(value ?? '')
    .replace(/(?<![a-z])(?:skillDamage|skill_damage)(?![a-z])/giu, '技能伤害')
    .replace(/(?<![a-z])(?:manaCost|mana_cost)(?![a-z])/giu, 'sp消耗降低')
    .replace(/(?<![a-z])(?:maxHp|max_hp)(?![a-z])/giu, 'hp上限')
    .replace(/(?<![a-z])(?:maxMp|maxSp|max_mp|max_sp)(?![a-z])/giu, 'sp上限')
    .replace(/(?<![a-z])attack(?![a-z])/giu, '普攻伤害')
    .replace(/(?<![a-z])debuffs?(?![a-z])/giu, '负面状态')
    .replace(/(?<![a-z])buffs?(?![a-z])/giu, '状态')
    .replace(/生命(?:值|量)?|血量|(?<![a-z])HP(?![a-z])/giu, 'hp')
    .replace(/法力(?:值|量)?|魔力(?:值|量)?|魔法值|蓝量|(?<![a-z])(?:MP|SP)(?![a-z])/giu, 'sp')
    .replace(/回血/gu, '回复hp')
    .replace(/回蓝/gu, '回复sp');
}
