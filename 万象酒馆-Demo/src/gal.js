/** Lightweight prose markers; the stored story remains complete, readable text. */
export function galRequestInput(kind, input) {
  if (!['script', 'chat', 'quick-chat'].includes(kind)) return input;
  return { ...input, presentationMode: 'gal' };
}

export function parseGalText(source, defaultSpeaker = '') {
  const text = String(source || '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div)>/giu, '\n')
    .replace(/<\/?(?:p|div|span|em|strong|b|i|small)\b[^>]*>/giu, '');
  const pattern =
    /【(旁白|对白[:：][^】\n]{1,80}|登场[:：][^】\n]{1,80}|退场[:：][^】\n]{1,80}|清场)】/gu;
  const beats = [];
  let cursor = 0;
  let kind = defaultSpeaker ? 'dialogue' : 'narration';
  let speaker = defaultSpeaker;
  function append(end) {
    const content = text.slice(cursor, end).trim();
    if (content) beats.push({ type: kind, speaker, text: content });
  }
  for (const match of text.matchAll(pattern)) {
    append(match.index);
    const [label, ...identity] = match[1].split(/[:：]/u);
    const id = identity.join(':').trim();
    cursor = match.index + match[0].length;
    if (label === '旁白') {
      kind = 'narration';
      speaker = '';
    } else if (label === '对白') {
      kind = 'dialogue';
      speaker = id;
    } else
      beats.push({
        type: label === '清场' ? 'clear' : label === '登场' ? 'enter' : 'exit',
        speaker: id,
        text: '',
      });
  }
  append(text.length);
  return beats;
}

/** Only authored dialogue has a known speaker: separate its quoted speech from stage narration. */
export function authoredGalContent(content, defaultSpeaker = '伊蒂丝') {
  return content.flatMap((source) => {
    const line = typeof source === 'string' ? { speaker: defaultSpeaker, text: source } : source;
    if (['旁白', 'narrator'].includes(line.speaker) || !/“[^”]+”/u.test(line.text)) return [line];
    const parts = [];
    let cursor = 0;
    for (const match of line.text.matchAll(/“([^”]+)”/gu)) {
      const narration = line.text.slice(cursor, match.index).trim();
      if (narration) parts.push({ speaker: '旁白', text: narration });
      parts.push({ ...line, text: match[1] });
      cursor = match.index + match[0].length;
    }
    if (line.text.slice(cursor).trim())
      parts.push({ speaker: '旁白', text: line.text.slice(cursor).trim() });
    return parts;
  });
}

/** Prefer one or two complete sentences; retain punctuation and the original text exactly. */
function pacedPageEnd(characters, limit) {
  let sentenceEnd = 0;
  let sentences = 0;
  for (let index = 0; index < limit; index++) {
    const character = characters[index];
    if (character === '\n') return index + 1;
    const period =
      character === '.' &&
      (!characters[index + 1] || /[\s”’"」』）)]/u.test(characters[index + 1]));
    if (!period && !/[。！？!?；;…]/u.test(character)) continue;
    let end = index + 1;
    while (end < characters.length && /[。！？!?；;….”’"」』）》】)]/u.test(characters[end])) end++;
    if (end > limit) break;
    sentenceEnd = end;
    sentences++;
    if (sentences === 2) return end;
    index = end - 1;
  }
  if (sentenceEnd) return sentenceEnd;
  if (limit === characters.length) return limit;
  for (let index = limit - 1; index >= Math.floor(limit * 0.45); index--)
    if (/[，,、：:\s]/u.test(characters[index])) return index + 1;
  let end = limit;
  while (end > 1 && /[，,。！？!?；;、：:….”’"」』）》】)]/u.test(characters[end])) end--;
  while (end > 1 && /[“‘"「『（(《【]/u.test(characters[end - 1])) end--;
  return end;
}

export function paginateGalBeat(beat, capacity = 140) {
  if (!beat.text) return [beat];
  const result = [];
  let remaining = Array.from(beat.text);
  const compact = capacity <= 80;
  const pageLimit = Math.min(
    capacity,
    beat.type === 'dialogue' ? (compact ? 48 : 64) : compact ? 60 : 80,
  );
  while (remaining.length) {
    let end = 0;
    let lines = 1;
    let column = 0;
    const columns = Math.ceil(capacity / 3);
    while (end < remaining.length && end < pageLimit) {
      if (remaining[end] === '\n') {
        lines++;
        column = 0;
      } else if (++column > columns) {
        lines++;
        column = 1;
      }
      if (lines > 3) break;
      end++;
    }
    end = Math.max(1, end);
    end = pacedPageEnd(remaining, end);
    result.push({ ...beat, text: remaining.slice(0, end).join('') });
    remaining = remaining.slice(end);
  }
  return result;
}

export function readableGalText(source, actors = [], protagonistId) {
  if (!/【(?:旁白|对白[:：]|登场[:：]|退场[:：]|清场)/u.test(source)) return source;
  return parseGalText(source)
    .filter((beat) => beat.text)
    .map((beat) =>
      beat.type === 'dialogue'
        ? `${resolveGalActor(beat.speaker, actors, protagonistId)?.name || beat.speaker}：${beat.text}`
        : beat.text,
    )
    .join('\n\n');
}

export function resolveGalActor(speaker, actors, protagonistId) {
  const identity = String(speaker || '')
    .replace(/\s*·\s*Lv\.\d+$/u, '')
    .replace(/^npc[:：]/u, '');
  if (!identity || ['旁白', 'narrator'].includes(identity)) return null;
  if (['user', 'player', '<user>', '主角', '玩家', '你'].includes(identity))
    return (
      actors.find((actor) => actor.id === protagonistId) || { id: 'user', name: '你', user: true }
    );
  const matches = actors.filter(
    (actor) =>
      actor.id === identity || actor.name === identity || actor.aliases?.includes(identity),
  );
  return matches.length === 1 ? matches[0] : { id: identity, name: identity };
}

/** A speaker enters on their first line; narration dims but never invents an exit. */
export function nextGalStage(stage, beat, actor) {
  if (beat.type === 'clear') return [];
  if (beat.type === 'exit')
    return stage.filter((entry) => entry !== actor?.id && entry !== beat.speaker);
  if (!['dialogue', 'enter'].includes(beat.type) || !actor?.sprite || actor.user) return [...stage];
  if (stage.includes(actor.id)) return [...stage];
  return [...stage.slice(-1), actor.id];
}

/** Selection order owns two portrait slots; a missing sprite leaves its slot empty. */
export function selectedGalStage(ids, actors, protagonistId) {
  return ids
    .slice(0, 2)
    .map((id) => resolveGalActor(id, actors, protagonistId))
    .filter((actor) => actor?.sprite && !actor.user)
    .map((actor) => actor.id);
}
