/** SillyTavern regex JSON; imported extension metadata is retained, never executed. */
export function normalizeRegexScripts(raw) {
  const scripts = Array.isArray(raw)
    ? raw
    : raw?.regex_scripts || raw?.scripts || (raw?.findRegex ? [raw] : []);
  if (!Array.isArray(scripts) || scripts.length > 200) throw Error('正则最多200条');
  return scripts.map((value, index) => {
    const item = {
      id: `regex-${index}`,
      scriptName: '未命名正则',
      findRegex: '',
      replaceString: '',
      trimStrings: [],
      placement: [2],
      disabled: false,
      markdownOnly: false,
      promptOnly: false,
      runOnEdit: false,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
      apiTargets: ['character', 'script'],
      ...structuredClone(value),
    };
    for (const key of ['scriptName', 'findRegex', 'replaceString'])
      if (typeof item[key] !== 'string' || item[key].length > 128000)
        throw Error(`正则${index + 1}.${key}无效`);
    if (!item.findRegex || item.findRegex.length > 10000)
      throw Error('查找表达式不能为空且最多10000字');
    if (
      !Array.isArray(item.placement) ||
      item.placement.some((id) => ![0, 1, 2, 3, 5, 6].includes(id))
    )
      throw Error('正则作用位置无效');
    if (
      !Array.isArray(item.trimStrings) ||
      item.trimStrings.some((text) => typeof text !== 'string')
    )
      throw Error('trimStrings必须是文字数组');
    if (
      !Array.isArray(item.apiTargets) ||
      item.apiTargets.some((kind) => !['character', 'script', 'chat', 'quick-chat'].includes(kind))
    )
      throw Error('正则发送对象无效');
    for (const key of ['disabled', 'markdownOnly', 'promptOnly', 'runOnEdit'])
      if (typeof item[key] !== 'boolean') throw Error(`正则${key}必须为开关`);
    for (const key of ['minDepth', 'maxDepth'])
      if (
        item[key] !== null &&
        (!Number.isInteger(item[key]) || item[key] < -1 || item[key] > 10000)
      )
        throw Error(`正则${key}无效`);
    if (![0, 1, 2].includes(Number(item.substituteRegex))) throw Error('正则宏替换类型无效');
    compileRegex(item.findRegex);
    return item;
  });
}

export function compileRegex(source) {
  const literal = source.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/);
  return literal ? new RegExp(literal[1], literal[2]) : new RegExp(source, 'g');
}

export function presetRegexScripts(preset) {
  return normalizeRegexScripts(preset?.extensions?.regex_scripts || preset?.regex_scripts || []);
}

export function applyRegexScripts(text, scripts, placement, options = {}) {
  const changes = [];
  const macro = (value, escaped = false) =>
    value.replace(/{{\s*(char|user)\s*}}/gi, (_, key) => {
      const result = options.variables?.[key.toLowerCase()] || '';
      return escaped ? result.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : result;
    });
  let output = text;
  for (const script of scripts) {
    if (script.disabled || !script.placement.includes(placement)) continue;
    if (options.kind && !script.apiTargets.includes(options.kind)) continue;
    if (options.isEdit && !script.runOnEdit) continue;
    if (!(
      (script.markdownOnly && options.isMarkdown) ||
      (script.promptOnly && options.isPrompt) ||
      (!script.markdownOnly && !script.promptOnly && !options.isMarkdown && !options.isPrompt)
    ))
      continue;
    if (
      typeof options.depth === 'number' &&
      ((script.minDepth !== null && options.depth < script.minDepth) ||
        (script.maxDepth !== null && script.maxDepth >= 0 && options.depth > script.maxDepth))
    )
      continue;
    const source = Number(script.substituteRegex)
      ? macro(script.findRegex, Number(script.substituteRegex) === 2)
      : script.findRegex;
    const regex = compileRegex(source);
    const before = output;
    output = output.replace(regex, (...args) => {
      const groups = typeof args.at(-1) === 'object' ? args.at(-1) : {};
      const groupLimit = args.length - (typeof args.at(-1) === 'object' ? 3 : 2);
      return macro(
        script.replaceString
          .replace(/{{match}}/gi, '$0')
          .replace(/\$(\d+)|\$<([^>]+)>/g, (_, number, name) => {
            let value = String(
              number !== undefined
                ? Number(number) <= groupLimit
                  ? (args[Number(number)] ?? '')
                  : ''
                : (groups[name] ?? ''),
            );
            for (const trim of script.trimStrings) value = value.replaceAll(macro(trim), '');
            return value;
          }),
      );
    });
    if (output !== before)
      changes.push({
        id: script.id,
        name: script.scriptName,
        beforeCharacters: before.length,
        afterCharacters: output.length,
      });
    if (output.length > 2000000) throw Error('正则替换后的文本超过安全容量');
  }
  return { text: output, changes };
}
