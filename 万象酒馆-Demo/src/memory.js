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

export function conversationText(player, reply) {
  return `玩家：${player.content}\n\n${reply.speakerName || 'AI回应'}：${reply.content}`;
}

export function dungeonMemoryText(record) {
  return (record.lines || [])
    .map((line) => `${line.speaker || '旁白'}：${line.text || ''}`)
    .join('\n\n');
}

function isConversation(player, reply) {
  return (
    player?.role === 'user' &&
    reply?.role === 'assistant' &&
    !player.divider &&
    !reply.divider &&
    typeof player.content === 'string' &&
    typeof reply.content === 'string' &&
    !!player.content.trim() &&
    !!reply.content.trim()
  );
}

function memorySources(library, quick = []) {
  const sources = [];
  for (const [kind, messages] of [
    ['chat', library.tavernChat || []],
    ['quick', quick],
  ]) {
    let round = 0;
    messages.forEach((message, index) => {
      const player = messages[index - 1];
      if (!isConversation(player, message)) return;
      round++;
      sources.push({
        id: `${kind}:turn:${message.id || index}`,
        kind,
        label: `${kind === 'chat' ? '酒馆交流' : '本趟闲聊'} · 第${round}轮对话`,
        text: conversationText(player, message),
        target: message,
        summaryKey: 'turnSummary',
      });
    });
  }
  for (const [recordIndex, record] of (library.history || []).entries()) {
    sources.push({
      id: `dungeon:${record.runId || recordIndex}`,
      kind: 'dungeon',
      label: record.title || '副本经历',
      text: dungeonMemoryText(record),
      target: record,
      summaryKey: 'summary',
    });
  }
  return sources.filter((item) => typeof item.text === 'string' && item.text.trim());
}

export function pendingMemories(library, quick = []) {
  return memorySources(library, quick)
    .filter((item) => !restoredSummary(item.target[item.summaryKey], item.text))
    .map(({ target: _target, summaryKey: _key, ...item }) => item);
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
      key: source.summaryKey,
      text: result.summary.trim(),
      sourceHash: memoryHash(source.text),
    };
  });
  const previous = changes.map(({ target, key }) => ({ target, key, summary: target[key] }));
  for (const { target, key, text, sourceHash } of changes) target[key] = { text, sourceHash };
  return () => {
    for (const { target, key, summary } of previous) {
      if (summary === undefined) delete target[key];
      else target[key] = summary;
    }
  };
}

export function memoryChat(messages) {
  const history = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    const reply = messages[index + 1];
    const summary = isConversation(message, reply)
      ? restoredSummary(reply.turnSummary, conversationText(message, reply))
      : null;
    if (summary) {
      history.push({ role: 'assistant', content: `【已确认对话摘要】${summary.text}` });
      index++;
    } else
      history.push({ role: message.role, content: memoryText(message.content, message.summary) });
  }
  return history;
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
  return records.map((record) => {
    const original = (library.history || []).find((entry) =>
      record.runId
        ? entry.runId === record.runId
        : entry.title === record.title &&
          dungeonMemoryText(entry) ===
            dungeonMemoryText({ lines: record.confirmedEvents || record.lines }),
    );
    const summary = original && restoredSummary(original.summary, dungeonMemoryText(original));
    return {
      title: record.title,
      ...(record.setting ? { setting: record.setting } : {}),
      confirmedEvents: summary
        ? [{ speaker: '副本记忆', text: `【已确认副本摘要】${summary.text}` }]
        : (record.confirmedEvents || record.lines || []).map((line) => ({
            speaker: line.speaker,
            text: memoryText(
              line.text,
              line.summary || summaries.get(JSON.stringify([line.speaker, line.text])),
            ),
            ...(Number.isInteger(line.encounter) ? { encounter: line.encounter } : {}),
            ...(line.stage ? { stage: line.stage } : {}),
          })),
      unresolvedHook: record.unresolvedHook || (record.complete ? record.nextHook : null),
    };
  });
}

export function previousDungeonMemory(library) {
  const record = library.history?.at(-1);
  if (!record) return '';
  const summary = restoredSummary(record.summary, dungeonMemoryText(record));
  if (summary) return `${record.title}\n\n【已确认副本摘要】${summary.text}`;
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
  const summary = record && restoredSummary(record.summary, dungeonMemoryText(record));
  if (summary) {
    const confirmed = new Set((record.lines || []).map((line) => line.text));
    let included = false;
    return scriptProse(book, (text) => {
      if (!confirmed.has(text)) return text;
      if (included) return '';
      included = true;
      return `【已确认副本摘要】${summary.text}`;
    });
  }
  const summaries = new Map((record?.lines || []).map((line) => [line.text, line.summary]));
  return scriptProse(book, (text) => memoryText(text, summaries.get(text)));
}
