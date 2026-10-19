import { scriptProse } from './chat.js';

/** Summaries are derived context only; original messages and confirmed events remain intact. */
export function memoryHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}

export function restoredSummary(value, original) {
  if (
    !value ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    value.text.length > 12000 ||
    value.sourceHash !== memoryHash(original)
  )
    return null;
  return { text: value.text, sourceHash: value.sourceHash };
}

export function memoryText(original, summary) {
  const valid = restoredSummary(summary, original);
  return valid ? `【已确认摘要】${valid.text}` : original;
}

function memorySources(library, quick = []) {
  const sources = [];
  for (const [kind, messages] of [
    ['chat', library.tavernChat || []],
    ['quick', quick],
  ]) {
    messages.forEach((message, index) => {
      if (message.divider || message.role === 'system') return;
      sources.push({
        id: `${kind}:${index}`,
        kind,
        label: `${kind === 'chat' ? '酒馆交流' : '本趟闲聊'} · 第${index + 1}层 · ${message.role === 'user' ? '玩家' : message.speakerName || '回应'}`,
        text: message.content,
        target: message,
      });
    });
  }
  for (const [recordIndex, record] of (library.history || []).entries()) {
    for (const [index, line] of (record.lines || []).entries()) {
      sources.push({
        id: `dungeon:${record.runId || recordIndex}:${index}`,
        kind: 'dungeon',
        label: `${record.title || '副本经历'} · 第${(line.encounter || 0) + 1}战 · ${line.speaker || '旁白'} · 第${index + 1}条`,
        text: line.text,
        target: line,
      });
    }
  }
  return sources.filter((item) => typeof item.text === 'string' && item.text.trim());
}

export function pendingMemories(library, quick = []) {
  return memorySources(library, quick)
    .filter((item) => !restoredSummary(item.target.summary, item.text))
    .map(({ target: _target, ...item }) => item);
}

/** Validate every snapshot before applying anything, including edits or a changed save. */
export function applyMemorySummaries(library, quick, snapshot, results) {
  const current = new Map(memorySources(library, quick).map((item) => [item.id, item]));
  const expected = new Map(snapshot.map((item) => [item.id, item]));
  if (
    results.length !== expected.size ||
    new Set(results.map((item) => item.id)).size !== results.length
  )
    throw Error('摘要数量或条目ID不匹配，尚未保存');
  const changes = results.map((result) => {
    const source = current.get(result.id);
    const original = expected.get(result.id);
    if (!source || !original || source.text !== original.text || source.label !== original.label)
      throw Error('记录已变化，请重新生成摘要，尚未保存');
    if (
      typeof result.summary !== 'string' ||
      !result.summary.trim() ||
      result.summary.length > 12000
    )
      throw Error('摘要需要1～12000字，尚未保存');
    return {
      target: source.target,
      text: result.summary.trim(),
      sourceHash: memoryHash(source.text),
    };
  });
  const previous = changes.map(({ target }) => ({ target, summary: target.summary }));
  for (const { target, text, sourceHash } of changes) target.summary = { text, sourceHash };
  return () => {
    for (const { target, summary } of previous) {
      if (summary === undefined) delete target.summary;
      else target.summary = summary;
    }
  };
}

export function memoryChat(messages) {
  return messages.map(({ role, content, summary }) => ({
    role,
    content: memoryText(content, summary),
  }));
}

/** Route history contains copies of confirmed lines; match both speaker and original text. */
export function memoryHistory(library, records) {
  const neededTexts = new Set();
  for (const record of records) {
    for (const line of record.confirmedEvents || record.lines || []) {
      if (!line.summary) neededTexts.add(line.text);
    }
  }
  const summaries = new Map();
  for (const record of library.history || []) {
    for (const line of record.lines || []) {
      if (neededTexts.has(line.text) && restoredSummary(line.summary, line.text))
        summaries.set(JSON.stringify([line.speaker, line.text]), line.summary);
    }
  }
  return records.map((record) => ({
    title: record.title,
    ...(record.setting ? { setting: record.setting } : {}),
    confirmedEvents: (record.confirmedEvents || record.lines || []).map((line) => ({
      speaker: line.speaker,
      text: memoryText(
        line.text,
        line.summary || summaries.get(JSON.stringify([line.speaker, line.text])),
      ),
      ...(Number.isInteger(line.encounter) ? { encounter: line.encounter } : {}),
      ...(line.stage ? { stage: line.stage } : {}),
    })),
    unresolvedHook: record.unresolvedHook || (record.complete ? record.nextHook : null),
  }));
}

export function previousDungeonMemory(library) {
  const record = library.history?.at(-1);
  if (!record) return '';
  return [
    record.title,
    ...(record.lines || [])
      .filter((line) => line.stage !== 'combat')
      .map((line) => `${line.speaker || '旁白'}：${memoryText(line.text, line.summary)}`),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function scriptMemory(library, book) {
  const record = library.history?.find((item) => item.runId === book.runId);
  const summaries = new Map((record?.lines || []).map((line) => [line.text, line.summary]));
  return scriptProse(book, (text) => memoryText(text, summaries.get(text)));
}
