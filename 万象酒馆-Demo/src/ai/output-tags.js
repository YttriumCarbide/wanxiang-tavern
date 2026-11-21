import { BODY_TAGS } from './output-protocol.js';

const TAG_START =
  /[<＜][\s\u200B]*(?:([/／])[\s\u200B]*)?((?:wanxiang[\s\u200B]*_[\s\u200B]*[\w:.-]+|[\w:.-]+)~?)/iu;
const CODE_SPAN = /(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?\1|(`+)[^\r\n]*?\2/u;
const RETRY_BOUNDARIES = Symbol('retry output tag boundaries');

function normalizeBoundary(text) {
  return text
    .replace(/[\s\u200B]/gu, '')
    .replace('＜', '<')
    .replace('＞', '>')
    .replace('／', '/')
    .toLowerCase();
}

function tagName(text) {
  return text
    .replace(/[\s\u200B]/gu, '')
    .replace(/~$/u, '')
    .toLowerCase();
}

function matchBoundary(raw, expected, relaxed) {
  if (raw === expected) return true;
  if (normalizeBoundary(raw) !== expected) return false;
  if (!relaxed) throw RETRY_BOUNDARIES;
  return true;
}

/** Try exact protocol tags first. Retry only for a recognizable spelling of a known tag. */
export function readOutputTags(rawText, definitions, { partial = false } = {}) {
  const byTag = new Map(definitions.map((definition) => [definition.tag, definition]));
  let sections;
  try {
    sections = scanOutputTags(rawText, byTag, partial, partial);
  } catch (failure) {
    if (failure !== RETRY_BOUNDARIES) throw failure;
    sections = scanOutputTags(rawText, byTag, partial, true);
  }
  const seen = new Set();
  return sections.filter(({ tag, content }) => {
    const definition = byTag.get(tag);
    if (definition.accept && !definition.accept(content)) return false;
    if (seen.has(tag)) throw Error(`发现多组 ${tag} 输出标签；最终结果必须只有一组`);
    seen.add(tag);
    return true;
  });
}

/** Code and reasoning references never become candidate protocol sections. */
function scanOutputTags(rawText, byTag, partial, relaxed) {
  const tokens = new RegExp(
    `${CODE_SPAN.source}|${TAG_START.source}(?:[\\s\\u200B][^<>＜＞]*?)?[>＞]`,
    'giu',
  );
  const reasoning = [];
  const sections = [];
  for (let match = tokens.exec(rawText); match; match = tokens.exec(rawText)) {
    if (match[1] || match[2]) continue;
    const name = tagName(match[4]);
    if (/(?:think|thought|analysis|reasoning|planning|tucao|report_nya)/u.test(name)) {
      if (!match[3]) reasoning.push(name);
      else {
        const opening = reasoning.lastIndexOf(name);
        // The outer closing tag also ends any unpaired tag names quoted in its notes.
        if (opening >= 0) reasoning.length = opening;
      }
      continue;
    }
    if (reasoning.length) continue;
    const definition = byTag.get(name);
    const expected = `<${match[3] ? '/' : ''}${name}>`;
    if (!definition || !matchBoundary(match[0], expected, relaxed)) continue;
    if (match[3]) throw Error(`发现多余的 </${name}> 结束标签`);
    const from = tokens.lastIndex;
    const end = payloadEnd(rawText, from, definition, byTag, partial, relaxed);
    sections.push({
      tag: name,
      content: rawText.slice(from, end.contentEnd),
      start: match.index,
      end: end.end,
      complete: end.complete,
      ...(end.literalTail ? { literalTail: true } : {}),
      ...(match[0] !== expected || end.repairedBoundary ? { repairedBoundary: true } : {}),
    });
    tokens.lastIndex = end.end;
  }
  return sections;
}

function payloadEnd(rawText, from, definition, byTag, partial, relaxed) {
  const close = `</${definition.tag}>`;
  const boundary = new RegExp(`${TAG_START.source}[\\s\\u200B]*[>＞]`, 'iuy');
  let quoted = false;
  let escaped = false;
  let fence = null;
  for (let index = from; index < rawText.length; index++) {
    const char = rawText[index];
    if (!definition.json) {
      if (index === from || /[\r\n]/u.test(rawText[index - 1])) {
        const line = rawText.slice(index).match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/u);
        if (line) {
          const marker = line[1];
          const tail = line[2];
          if (fence) {
            if (marker[0] === fence[0] && marker.length >= fence.length && /^[ \t]*$/u.test(tail)) {
              fence = null;
              index += line[0].length - 1;
              continue;
            }
          } else if (marker[0] === '~' || !tail.includes('`')) {
            fence = marker;
            index += line[0].length - 1;
            continue;
          }
        }
      }
      if (fence) continue;
    }
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
    if (char !== '<' && char !== '＜') continue;
    boundary.lastIndex = index;
    const match = boundary.exec(rawText);
    if (!match) continue;
    const name = tagName(match[2]);
    if (!byTag.has(name) || !matchBoundary(match[0], `<${match[1] ? '/' : ''}${name}>`, relaxed))
      continue;
    if (match[1] && name === definition.tag) {
      return { contentEnd: index, end: boundary.lastIndex, complete: true, repairedBoundary: true };
    }
    throw Error(`发现嵌套或交叉的 <${definition.tag}> 输出标签`);
  }
  if (partial)
    return {
      contentEnd: rawText.length,
      end: rawText.length,
      complete: false,
      literalTail: fence !== null,
    };
  throw Error(`缺少有效的 ${close} 结束标签，或标签内字符串未闭合；不猜测缺失内容。`);
}

/** Streaming uses the same boundaries as final validation; incomplete tags stay invisible. */
export function streamingChatText(rawText) {
  try {
    const sections = readOutputTags(
      rawText,
      [...BODY_TAGS.map((tag) => ({ tag })), { tag: 'wanxiang_actions', json: true }],
      { partial: true },
    );
    const bodies = sections.filter((section) => BODY_TAGS.includes(section.tag));
    if (bodies.length > 1) return null;
    const body = bodies[0];
    if (!body) return null;
    // A chunk can stop halfway through a closing tag; don't briefly display its prefix.
    if (body.complete || body.literalTail) return body.content;
    const start = Math.max(body.content.lastIndexOf('<'), body.content.lastIndexOf('＜'));
    return start >= 0 && /^<\/?[\w~:.-]*$/u.test(normalizeBoundary(body.content.slice(start)))
      ? body.content.slice(0, start)
      : body.content;
  } catch {
    return null;
  }
}
