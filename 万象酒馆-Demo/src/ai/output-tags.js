/** Scan protocol boundaries, skipping references in reasoning wrappers and inline code. */
export function readOutputTags(rawText, definitions, { partial = false } = {}) {
  const tokens = /(`+)[^\r\n]*?\1|<(\/?)([\w:.-]+~?)(?:\s[^<>]*?)?>/gu;
  const reasoning = [];
  const sections = [];
  for (let match = tokens.exec(rawText); match; match = tokens.exec(rawText)) {
    if (match[1]) continue;
    const name = match[3].toLowerCase().replace(/~$/u, '');
    if (/(?:think|thought|analysis|reasoning|planning|tucao|report_nya)/u.test(name)) {
      if (!match[2]) reasoning.push(name);
      else {
        const opening = reasoning.lastIndexOf(name);
        // The outer closing tag also ends any unpaired tag names quoted in its notes.
        if (opening >= 0) reasoning.length = opening;
      }
      continue;
    }
    if (reasoning.length) continue;
    const definition = definitions.find((item) => item.tag === name);
    if (!definition || match[0] !== `<${match[2]}${definition.tag}>`) continue;
    if (match[2]) throw Error(`发现多余的 </${name}> 结束标签`);
    if (sections.some((section) => section.tag === name))
      throw Error(`发现多组 ${name} 输出标签；最终结果必须只有一组`);
    const from = tokens.lastIndex;
    const end = payloadEnd(rawText, from, definition, definitions, partial);
    sections.push({
      tag: name,
      content: rawText.slice(from, end.contentEnd),
      start: match.index,
      end: end.end,
      complete: end.complete,
    });
    tokens.lastIndex = end.end;
  }
  return sections;
}

function payloadEnd(rawText, from, definition, definitions, partial) {
  const close = `</${definition.tag}>`;
  let quoted = false;
  let escaped = false;
  for (let index = from; index < rawText.length; index++) {
    const char = rawText[index];
    if (definition.json) {
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
    } else if (char === '`') {
      const code = rawText.slice(index).match(/^(`+)[^\r\n]*?\1/u);
      if (code) {
        index += code[0].length - 1;
        continue;
      }
    }
    if (rawText.startsWith(close, index))
      return { contentEnd: index, end: index + close.length, complete: true };
    if (char !== '<') continue;
    if (
      definitions.some(
        ({ tag }) =>
          rawText.startsWith(`<${tag}>`, index) || rawText.startsWith(`</${tag}>`, index),
      )
    )
      throw Error(`发现嵌套或交叉的 <${definition.tag}> 输出标签`);
  }
  if (partial) return { contentEnd: rawText.length, end: rawText.length, complete: false };
  throw Error(`缺少有效的 ${close} 结束标签，或标签内字符串未闭合；不猜测缺失内容。`);
}

/** Streaming uses the same boundaries as final validation; incomplete tags stay invisible. */
export function streamingChatText(rawText) {
  try {
    const sections = readOutputTags(
      rawText,
      [{ tag: 'wanxiang_chat' }, { tag: 'wanxiang_actions', json: true }],
      { partial: true },
    );
    const body = sections.find((section) => section.tag === 'wanxiang_chat');
    if (!body) return null;
    // A chunk can stop halfway through a closing tag; don't briefly display its prefix.
    return body.complete ? body.content : body.content.replace(/<\/?[\w~:.-]*$/u, '');
  } catch {
    return null;
  }
}
