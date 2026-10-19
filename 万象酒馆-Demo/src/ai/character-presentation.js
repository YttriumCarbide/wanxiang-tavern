import { characterWorldbook } from './contracts.js';

/** Read labelled plain setting prose; never send a second structured character layer to AI. */
export function characterPresentation(entry) {
  const prose = characterWorldbook(entry);
  const headers = [
    ...prose.matchAll(
      /^(姓名|性别|年龄|外貌|职业|性格|经历|攻击方式｜[^\n：:]+|技能动作描写｜[^\n：:]+|奥义动作描写｜[^\n：:]+)[：:][\t ]*/gm,
    ),
  ];
  const fields = headers.map((match, index) => ({
    label: match[1],
    text: prose
      .slice(match.index + match[0].length, headers[index + 1]?.index ?? prose.length)
      .trim(),
  }));
  const find = (label) => fields.find((field) => field.label === label)?.text || '';
  const profession = find('职业').split('\n');
  const named = (prefix) =>
    fields
      .filter((field) => field.label.startsWith(prefix))
      .map((field) => ({ name: field.label.slice(prefix.length), description: field.text }));
  return {
    name: entry.setting.name,
    gender: find('性别') || '未记载',
    age: find('年龄') || '未记载',
    traits: [...prose.matchAll(/(?:^|[。\n])(种族|身份|境界|灵根)[：:]([^。\n]+)/g)].map(
      (match) => ({ label: match[1], value: match[2].trim() }),
    ),
    profession: profession.shift() || entry.setting.title,
    sections: [
      { title: '外貌', text: find('外貌') || entry.setting.appearance || '' },
      { title: '职业', text: profession.join('\n') || entry.setting.title },
      { title: '性格', text: find('性格') || entry.setting.personality || '' },
      { title: '经历', text: find('经历') || entry.setting.background || '' },
    ].filter((section) => section.text),
    attack: named('攻击方式｜')[0],
    skills: named('技能动作描写｜'),
    fallback: headers.length ? '' : prose,
  };
}
