const narrativeKinds = Object.freeze(['chat', 'quick-chat', 'script']);
const narrativeMarker = '〔AR-NAR 8.31〕';
const narration = Object.freeze({
  know: {
    lite: '角色只根据亲眼所见、亲耳所闻或已明确获知的信息行动。没有依据时用猜测表达。',
    full: '区分玩家、旁白和各角色掌握的信息。玩家的内心、场外资料及其他角色的私密信息，不能直接变成角色知识；允许误解、试探和逐步发现。',
  },
  charm: {
    lite: '角色按自身性格回应，不默认赞美、亲近或认同玩家。',
    full: '保留角色的目标、边界和已有关系。根据情境允许拒绝、分歧和冷淡；亲近、信任和好感变化由互动及既有事件支持。',
  },
});

export function applyNarration(messages, config, kind) {
  if (!narrativeKinds.includes(kind)) return;
  const rules = [narration.know[config.know], narration.charm[config.charm]].filter(Boolean);
  if (!rules.length) return;
  const target = messages.find((item) => ['system', 'developer'].includes(item.role));
  if (!target) return;
  const instruction = `${narrativeMarker}\n${rules.join('\n')}\n仍须遵守本次请求的剧情条件和输出格式。\n〔/AR-NAR〕\n\n`;
  if (typeof target.content === 'string' && !target.content.includes(narrativeMarker))
    target.content = instruction + target.content;
  else if (Array.isArray(target.content)) {
    const part = target.content.find((item) => ['text', 'input_text'].includes(item.type));
    if (typeof part?.text === 'string' && !part.text.includes(narrativeMarker))
      part.text = instruction + part.text;
  }
}

function hash(value) {
  let result = 2166136261;
  for (const letter of value) result = Math.imul(result ^ letter.codePointAt(0), 16777619);
  return result >>> 0;
}

function paragraphHasOpenStructure(paragraph) {
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ])
    if (paragraph.split(open).length !== paragraph.split(close).length) return true;
  const tags = [];
  for (const [source, closing, name] of paragraph.matchAll(/<(\/?)([a-z][\w:-]*)\b[^<>]*>/gi)) {
    const normalized = name.toLowerCase();
    if (source.endsWith('/>') || /^(?:br|hr|img|input|meta|link)$/.test(normalized)) continue;
    if (!closing) tags.push(normalized);
    else if (tags.pop() !== normalized) return true;
  }
  return tags.length > 0;
}

function proseTargets(message) {
  if (
    message.role !== 'system' ||
    typeof message.content !== 'string' ||
    /^[ \t]*(?:`{3,}|~{3,})|<!--/m.test(message.content)
  )
    return [];
  const parts = message.content.split(/(\r?\n\r?\n)/);
  // A plain-looking paragraph inside a multi-paragraph schema or tag is not prose.
  if (parts.some(paragraphHasOpenStructure)) return [];
  return parts.flatMap((paragraph, index) =>
    paragraph.length >= 80 &&
    !/[\n\t<>{}[\]`|“”"〔〕]|https?:\/\/|^(?:\s|#{1,6}\s|[-*>]\s|\d+[.)]\s)/.test(paragraph)
      ? [{ message, paragraph, index, parts }]
      : [],
  );
}

/** Change at most one plain instruction paragraph, without touching game data. */
export function refractPrompt(messages, config, { session = '', now = Date.now(), random }) {
  const target = messages
    .flatMap(proseTargets)
    .sort((left, right) => right.paragraph.length - left.paragraph.length)[0];
  if (!target) return false;
  const window = config.saltWin ? Math.floor(now / (config.saltWin * 60000)) : 0;
  const seed =
    config.refractMode === 'random'
      ? Math.floor(random() * 0x100000000)
      : hash(`${session}\n${config.refractSeed}\n${window}\n${target.paragraph}`);
  const { paragraph } = target;
  let text = paragraph;
  // W: only ordinary spaces within prose. No line, indentation, or Markdown changes.
  const spaces = [...text.matchAll(/(?<=\p{L}) (?=\p{L})/gu)];
  const position = spaces[seed % spaces.length]?.index;
  if (position !== undefined) text = text.slice(0, position) + ' ' + text.slice(position);
  // L: a small allowlist of equivalent paragraph-opening connectors.
  if (config.entropyStrength !== 'light') {
    const swaps = [
      ['此外，', '另外，'],
      ['与此同时，', '同时，'],
      ['In addition, ', 'Additionally, '],
    ];
    const swap = swaps.find(([from]) => text.startsWith(from));
    if (swap) text = swap[1] + text.slice(swap[0].length);
  }
  // A: one bounded anchor, useful even when a Chinese paragraph has no spaces.
  if (config.entropyStrength !== 'light' || text === paragraph)
    text += `\n<!-- ar:${seed.toString(36)} -->`;
  if (text === paragraph) return false;
  target.parts[target.index] = text;
  target.message.content = target.parts.join('');
  return true;
}
