/** Request-local ST variables; no eval, scripts, network access or persistent side effects. */
export function createMacroExpander(variables) {
  const values = new Map();
  const truth = (value) => value && !['0', 'false', 'null'].includes(String(value).toLowerCase());
  const expand = (source) => {
    // Shield literal writing slots even inside setvar/getvar values; restore them verbatim.
    let prefix = '\uE000writing-slot:';
    while (source.includes(prefix) || [...values.values()].some((value) => value.includes(prefix)))
      prefix += ':';
    const slots = [];
    const protect = (text) =>
      text.replace(/\{\{\s*(?:思考内容|正文内容|可能要求的附加内容)\s*\}\}/gu, (literal) => {
        const index = slots.push(literal) - 1;
        return `${prefix}${index}\uE001`;
      });
    const restore = (text) =>
      text.replace(new RegExp(`${prefix}(\\d+)\uE001`, 'gu'), (_match, index) => slots[index]);
    let text = source;
    for (let pass = 0; pass < 12; pass++) {
      text = protect(text);
      const before = text;
      text = text.replace(/{{([^{}]*?)}}/g, (_match, key) => {
        const [command, ...args] = restore(key).trim().split('::');
        const name = command.trim().toLowerCase();
        if (args.length) args[0] = args[0].trim();
        if (/^if\s|^\/if$|^else$/.test(name)) return _match;
        if (name.startsWith('//')) return '';
        if (name === 'trim') return '';
        if (name === 'newline') return '\n';
        if (name === 'lastusermessage')
          return variables.lastusermessage ?? variables.brief ?? variables.input ?? '';
        if (name === 'date' || name === 'time') {
          const date = new Date(variables.clock || Date.now());
          return name === 'date'
            ? date.toLocaleDateString('sv-SE')
            : date.toTimeString().slice(0, 5);
        }
        const roll = name.match(/^roll\s+(\d{1,3})d(\d{1,10})$/);
        if (roll) {
          const count = Number(roll[1]),
            sides = Number(roll[2]);
          if (count < 1 || count > 100 || sides < 1 || sides > 1000000000)
            throw Error('骰子宏范围无效');
          let seed = 2166136261;
          for (const char of `${variables.brief || variables.input || ''}:${name}`)
            seed = Math.imul(seed ^ char.codePointAt(0), 16777619) >>> 0;
          let result = 0;
          for (let index = 0; index < count; index++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            result += (seed % sides) + 1;
          }
          return String(result);
        }
        if (['setvar', 'setglobalvar'].includes(name)) {
          values.set(args[0], args.slice(1).join('::'));
          return '';
        }
        if (['getvar', 'getglobalvar'].includes(name)) return values.get(args[0]) || '';
        if (['addvar', 'addglobalvar'].includes(name)) {
          const previous = values.get(args[0]) || '';
          const addition = args.slice(1).join('::');
          let next;
          try {
            const array = JSON.parse(previous);
            if (Array.isArray(array)) {
              array.push(addition);
              next = JSON.stringify(array);
            }
          } catch {
            /* A plain string or a number is valid too. */
          }
          if (next === undefined)
            next =
              Number.isNaN(Number(previous)) || Number.isNaN(Number(addition))
                ? previous + addition
                : String(Number(previous) + Number(addition));
          values.set(args[0], next);
          return '';
        }
        if (['incvar', 'decvar', 'incglobalvar', 'decglobalvar'].includes(name)) {
          const next = (Number(values.get(args[0])) || 0) + (name.startsWith('inc') ? 1 : -1);
          values.set(args[0], String(next));
          return String(next);
        }
        if (['random', 'pick'].includes(name)) {
          // Stable per context, so preview and sending do not disagree.
          const choices = args.length > 1 ? args : (args[0] || '').split(',');
          const seed = Array.from(variables.brief || '').reduce(
            (sum, char) => sum + char.codePointAt(0),
            0,
          );
          return choices[seed % choices.length]?.trim() || '';
        }
        const fullName = key.trim().toLowerCase();
        if (fullName.startsWith('outlet::')) return variables[fullName] || '';
        if (Object.hasOwn(variables, fullName)) return variables[fullName];
        throw Error(`预设含未适配宏 {{${key}}}；请在提示词预设中检查该宏。`);
      });
      text = text.replace(/{{if\s+([^{}]+)}}([\s\S]*?){{\/if}}/gi, (_, condition, body) => {
        const [yes, no = ''] = body.split('{{else}}');
        return truth(condition.trim()) ? yes : no;
      });
      if (text === before) return restore(text);
    }
    if (/{{/.test(text)) throw Error('宏嵌套超过12层，请简化预设');
    return restore(text);
  };
  return expand;
}
