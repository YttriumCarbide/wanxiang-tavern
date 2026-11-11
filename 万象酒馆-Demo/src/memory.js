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
  return {
    text: value.text,
    sourceHash: value.sourceHash,
    ...(Array.isArray(value.keywords) ? { keywords: memoryKeywords(value.keywords) } : {}),
  };
}

export function memoryKeywords(value) {
  return Array.from({ length: 5 }, (_, index) =>
    typeof value?.[index] === 'string' ? value[index].trim().slice(0, 60) : '',
  );
}

export function tavernPrelude(library) {
  return (library.tavernChat || []).flatMap((message, index) => {
    if (message.divider || message.outing || message.journeyArchived || message.role === 'system')
      return [];
    return [
      {
        id: message.id || `legacy-${index}-${memoryHash(message.content)}`,
        role: message.role,
        content: message.content,
        speakerName: message.speakerName,
      },
    ];
  });
}

export function archiveTavernPrelude(library, prelude, archive = true) {
  const ids = new Set((prelude || []).map((message) => message.id));
  for (const [index, message] of (library.tavernChat || []).entries()) {
    if (archive && ids.has(message.id || `legacy-${index}-${memoryHash(message.content)}`))
      message.journeyArchived = true;
  }
  return (prelude || []).map((message) => ({
    speaker: message.role === 'user' ? '玩家（酒馆）' : message.speakerName || '旁白（酒馆）',
    text: message.content,
    stage: 'tavern-prelude',
    encounter: 0,
  }));
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

export function restoreInvitationHistory(raw) {
  const records = new Map();
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (
      typeof entry?.id !== 'string' ||
      !entry.id ||
      entry.id.length > 100 ||
      typeof entry.member !== 'string' ||
      !entry.member ||
      entry.member.length > 100 ||
      typeof entry.text !== 'string' ||
      !entry.text.trim()
    )
      continue;
    const summary = restoredSummary(entry.summary, entry.text);
    records.set(entry.id, {
      id: entry.id,
      member: entry.member,
      title: String(entry.title || '一次约见').slice(0, 70),
      text: entry.text,
      recap: typeof entry.recap === 'string' ? entry.recap : '',
      ...(typeof entry.place === 'string' ? { place: entry.place } : {}),
      ...(typeof entry.person === 'string' ? { person: entry.person } : {}),
      ...(Number.isFinite(entry.finishedAt) ? { finishedAt: entry.finishedAt } : {}),
      ...(summary ? { summary } : {}),
    });
  }
  return [...records.values()];
}

export const INVITATION_CONTEXT_LIMIT = 6000;

export function withInvitationMemories(kind, input, library) {
  const history = library?.invitationHistory;
  if (!history?.length || !['script', 'chat', 'quick-chat'].includes(kind)) return input;
  const key = kind === 'script' ? 'party' : 'characters';
  if (!Array.isArray(input?.[key])) return input;
  return {
    ...input,
    [key]: input[key].map((member) => {
      const lines = [];
      let available = INVITATION_CONTEXT_LIMIT;
      for (let index = history.length - 1; index >= 0 && available > 100; index--) {
        const entry = history[index];
        if (entry.member !== member?.id) continue;
        const text = restoredSummary(entry.summary, entry.text)?.text || entry.recap || entry.text;
        const line = `《${entry.title}》\n${text}`;
        const length = Math.min(1600, available - 2);
        lines.unshift(line.length > length ? line.slice(0, length - 1) + '…' : line);
        available -= lines[0].length + 2;
      }
      return lines.length ? { ...member, invitationMemory: lines.join('\n\n') } : member;
    }),
  };
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
      id: `${record.kind === 'overland' ? 'overland' : 'dungeon'}:${record.runId || recordIndex}`,
      kind: record.kind === 'overland' ? 'overland' : 'dungeon',
      label: record.title || '副本经历',
      ...(record.place ? { place: record.place } : {}),
      ...(record.people?.length ? { people: record.people } : {}),
      text: dungeonMemoryText(record),
      target: record,
      summaryKey: 'summary',
    });
  }
  for (const record of library.invitationHistory || []) {
    sources.push({
      id: `invitation:${record.id}`,
      kind: 'invitation',
      label: record.title,
      ...(record.place ? { place: record.place } : {}),
      ...(record.person ? { people: [record.person] } : {}),
      text: record.text,
      target: record,
      summaryKey: 'summary',
    });
  }
  return sources.filter((item) => typeof item.text === 'string' && item.text.trim());
}

export function pendingMemories(library, quick = []) {
  return memorySources(library, quick)
    .filter(
      (item) =>
        item.kind !== 'invitation' &&
        item.kind !== 'overland' &&
        (item.kind !== 'dungeon' || item.target.adventureVersion !== 1),
    )
    .filter((item) => !restoredSummary(item.target[item.summaryKey], item.text))
    .map(({ target: _target, summaryKey: _key, ...item }) => item);
}

export function pendingAdventureMemories(library) {
  return memorySources(library)
    .filter(
      (item) =>
        (item.kind === 'invitation' ||
          item.kind === 'overland' ||
          (item.kind === 'dungeon' &&
            item.target.adventureVersion === 1 &&
            item.target.complete === true)) &&
        !restoredSummary(item.target.summary, item.text),
    )
    .sort((a, b) => (a.target.finishedAt || 0) - (b.target.finishedAt || 0))
    .map(({ target: _target, summaryKey: _key, ...item }) => item);
}

export function journeyMemories(library) {
  if (!library) return [];
  const sources = memorySources(library).filter(
    (item) =>
      item.kind === 'invitation' ||
      item.kind === 'overland' ||
      (item.kind === 'dungeon' && item.target.complete),
  );
  const pending = sources
    .filter((item) => !restoredSummary(item.target.summary, item.text))
    .sort((a, b) => (a.target.finishedAt || 0) - (b.target.finishedAt || 0));
  const recent = new Set(pending.slice(-3).map((item) => item.id));
  return sources.flatMap((item) => {
    const summary = restoredSummary(item.target.summary, item.text);
    if (!summary && !recent.has(item.id)) return [];
    return [
      {
        id: item.id,
        title: item.label,
        text: summary?.text || item.text,
        ...(summary
          ? {
              keywords:
                summary.keywords ||
                [item.place, ...(item.people || []), item.label].filter(Boolean),
            }
          : { recent: true }),
      },
    ];
  });
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
      keywords: Array.isArray(result.keywords) ? memoryKeywords(result.keywords) : undefined,
      sourceHash: memoryHash(source.text),
    };
  });
  const previous = changes.map(({ target, key }) => ({ target, key, summary: target[key] }));
  for (const { target, key, text, sourceHash, keywords } of changes)
    target[key] = { text, sourceHash, ...(keywords ? { keywords } : {}) };
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
    if (record.complete) return `【已确认副本摘要】${summary.text}`;
    const confirmed = new Set((record.lines || []).map((line) => line.text));
    const reached = new Set((record.lines || []).map((line) => line.encounter));
    let included = false;
    return scriptProse(book, (text, index) => {
      if (!confirmed.has(text) && !(book.schemaVersion >= 3 && reached.has(index))) return text;
      if (included) return '';
      included = true;
      return `【已确认副本摘要】${summary.text}`;
    });
  }
  const summaries = new Map((record?.lines || []).map((line) => [line.text, line.summary]));
  return scriptProse(book, (text) => memoryText(text, summaries.get(text)));
}
