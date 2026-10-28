/** Remove retired ability sections without rewriting the rest of a player's setting. */
export function stripRetiredLore(text) {
  return typeof text === 'string'
    ? text
        .replace(
          /^职业[：:][\s\S]*?(?=^(?:姓名|性别|年龄|外貌|性格|经历|攻击方式|技能动作描写|入场技动作描写)[｜：:]|$(?![\s\S]))/gm,
          '',
        )
        .replace(
          /^奥义(?:动作描写)?[｜：:][\s\S]*?(?=^(?:姓名|性别|年龄|外貌|职业|性格|经历|攻击方式|技能动作描写)[｜：:]|$(?![\s\S]))/gm,
          '',
        )
        .trim()
    : text;
}

export function stripRetiredFields(value) {
  const copy = structuredClone(value);
  for (const layer of [copy.setting, copy.data, copy.combat, copy]) {
    if (!layer || typeof layer !== 'object') continue;
    delete layer.ultimate;
    delete layer.quest;
    delete layer.awakening;
    delete layer.profession;
    if (typeof layer.worldbook === 'string') layer.worldbook = stripRetiredLore(layer.worldbook);
  }
  return copy;
}
