const fail = (path) => {
  const failure = Error(`角色设定格式不符：${path}`);
  failure.path = path.match(/^setting[\w.[\]]*/)?.[0] || 'character.setting';
  throw failure;
};
function fields(value, keys, path, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path}必须是对象`);
  for (const key of keys)
    if (!optional.includes(key) && !Object.hasOwn(value, key)) fail(`${path}.${key}缺失`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}不是规定字段`);
  return value;
}
const text = (value, path, max) =>
  typeof value === 'string' && value.trim() && value.length <= max
    ? value.trim()
    : fail(`${path}需要1～${max}字的文字`);
function action(value, path) {
  fields(value, ['name', 'description'], path);
  return {
    name: text(value.name, `${path}.name`, 30),
    description: text(value.description, `${path}.description`, 1200),
  };
}

/** Accept the explicit name/description variant without discarding either piece of prose. */
export function normalizeCharacterPersonality(value) {
  if (typeof value === 'string') return text(value, 'setting.personality', 2400);
  fields(value, ['name', 'description'], 'setting.personality');
  const name = text(value.name, 'setting.personality.name', 30);
  const description = text(value.description, 'setting.personality.description', 2400);
  return text(`${name}：${description}`, 'setting.personality', 2400);
}

export function normalizeCharacterSetting(value) {
  fields(
    value,
    [
      'name',
      'gender',
      'age',
      'appearance',
      'profession',
      'personality',
      'history',
      'attack',
      'skills',
      'entrySkill',
    ],
    'setting',
    ['age', 'entrySkill'],
  );
  const profession = action(value.profession, 'setting.profession');
  const history = text(value.history, 'setting.history', 2000);
  if (!Array.isArray(value.skills) || value.skills.length !== 2) fail('setting.skills必须恰好两项');
  const normalized = {
    name: text(value.name, 'setting.name', 30),
    gender: text(value.gender, 'setting.gender', 30),
    age:
      value.age == null
        ? ''
        : typeof value.age === 'string'
          ? value.age
          : JSON.stringify(value.age),
    appearance: text(value.appearance, 'setting.appearance', 2000),
    profession,
    personality: normalizeCharacterPersonality(value.personality),
    history,
    attack: action(value.attack, 'setting.attack'),
    skills: value.skills.map((skill, index) => action(skill, `setting.skills[${index}]`)),
  };
  if (value.entrySkill) {
    normalized.entrySkill = action(value.entrySkill, 'setting.entrySkill');
  }
  return normalized;
}

/** Strip the JSON wrapper once; all subsequent role context is readable setting prose. */
export function formatCharacterSetting(value) {
  const setting = normalizeCharacterSetting(value);
  return [
    `姓名：${setting.name}`,
    `性别：${setting.gender}`,
    setting.age ? `年龄：${setting.age}` : null,
    `外貌：${setting.appearance}`,
    `职业：${setting.profession.name}\n${setting.profession.description}`,
    `性格：${setting.personality}`,
    `经历：${setting.history}`,
    `攻击方式｜${setting.attack.name}：${setting.attack.description}`,
    ...setting.skills.map((skill) => `技能动作描写｜${skill.name}：${skill.description}`),
    setting.entrySkill?.name
      ? `入场技动作描写｜${setting.entrySkill.name}：${setting.entrySkill.description}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Names are generated once in setting; numeric slots inherit them during compilation. */
export function characterDataFromSetting(setting, data) {
  return {
    ...data,
    name: setting.name,
    title: setting.profession.name,
    attackName: setting.attack.name,
    skills: Array.isArray(data.skills)
      ? data.skills.map((skill, index) => ({ ...skill, name: setting.skills[index]?.name }))
      : data.skills,
    ...(data.entrySkill
      ? {
          entrySkill: {
            ...data.entrySkill,
            name: setting.entrySkill?.name || data.entrySkill.name || '入场技',
          },
        }
      : {}),
  };
}
