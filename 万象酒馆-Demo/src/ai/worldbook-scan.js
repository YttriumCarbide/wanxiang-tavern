import { normalizeWorldSettings } from './worldbook.js';

function stableRoll(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
function matchKey(text, key, entry, settings, warnings) {
  if (!key.trim()) return false;
  const regex = key.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/);
  if (regex) {
    if (regex[1].length > 500 || /\([^)]*[+*][^)]*\)[+*{]/.test(regex[1])) {
      warnings.add(`条目${entry.uid}的正则过长或包含高风险嵌套量词，已跳过`);
      return false;
    }
    try {
      return new RegExp(regex[1], regex[2]).test(text);
    } catch {
      warnings.add(`条目${entry.uid}正则关键词无效：${key}`);
      return false;
    }
  }
  const sensitive = entry.caseSensitive ?? settings.caseSensitive;
  const haystack = sensitive ? text : text.toLocaleLowerCase();
  const needle = sensitive ? key.trim() : key.trim().toLocaleLowerCase();
  if (!(entry.matchWholeWords ?? settings.matchWholeWords)) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u').test(haystack);
}

/** World Info scan with explicit state: dry previews never consume timers or probability rolls. */
export function scanWorldbooks({ books, settings: rawSettings, context, state = {}, countTokens }) {
  const settings = normalizeWorldSettings(rawSettings);
  const step = Number(state.step || 0);
  const warnings = new Set();
  const rows = [],
    active = new Map(),
    evaluated = new Set(),
    rejected = new Set();
  const report = new Map();
  const globalNames = new Set(settings.globalSelect);
  for (const book of books) {
    for (const entry of Object.values(book.entries)) {
      const id = `${book.id}:${entry.uid}`;
      const row = {
        ...entry,
        bookId: book.id,
        bookName: book.name,
        id,
        global: globalNames.has(book.id),
      };
      rows.push(row);
      report.set(id, {
        id,
        book: book.name,
        uid: entry.uid,
        title: entry.comment || `条目${entry.uid}`,
        active: false,
        reason: '关键词未命中',
        tokens: 0,
        position: entry.position,
        order: entry.order,
      });
    }
  }
  const priority = (a, b) => {
    if (settings.characterStrategy !== 0 && a.global !== b.global)
      return settings.characterStrategy === 1
        ? Number(a.global) - Number(b.global)
        : Number(b.global) - Number(a.global);
    return b.order - a.order || a.uid - b.uid;
  };
  rows.sort(priority);
  const budget = Math.min(
    Math.floor((settings.contextSize * settings.budget) / 100),
    settings.budgetCap || Infinity,
  );
  let used = 0,
    recursionText = '',
    depth = settings.depth,
    round = 0;
  const history = context.messages || [];
  const nextEffects = structuredClone(state.effects || {});
  const selectedGroups = new Set();
  const reason = (entry, value) => {
    report.get(entry.id).reason = value;
  };
  const expanded = (text) =>
    text
      .replace(/{{\s*outputSchema\s*}}/gi, () => context.outputSchema || '')
      .replace(/{{\s*characterLimits\s*}}/gi, () => context.characterLimits || '')
      .replace(/{{\s*(char|user)\s*}}/gi, (_, key) =>
        key.toLowerCase() === 'char' ? (context.names || []).join('、') : '玩家',
      );
  for (;;) {
    const candidates = [];
    for (const entry of rows) {
      if (active.has(entry.id) || rejected.has(entry.id)) continue;
      if (!(entry.apiTargets || ['character', 'script']).includes(context.kind || 'character')) {
        reason(entry, '未发送到当前API');
        continue;
      }
      const effect = state.effects?.[entry.id] || {};
      const sticky = effect.stickyUntil > step;
      if (entry.disable) {
        reason(entry, '已禁用');
        continue;
      }
      if (
        entry.triggers.length &&
        !entry.triggers.includes(context.trigger || 'normal') &&
        !entry.triggers.includes(context.kind)
      ) {
        reason(entry, '生成类型不匹配');
        continue;
      }
      if (entry.characterFilter) {
        const filter = entry.characterFilter;
        const names = [...(context.names || []), ...(context.characterIds || [])];
        const nameMatch = filter.names?.some((name) => names.includes(name));
        const tagMatch = filter.tags?.some((tag) => (context.tags || []).includes(tag));
        if (
          filter.isExclude
            ? nameMatch || tagMatch
            : (filter.names?.length && !nameMatch) || (filter.tags?.length && !tagMatch)
        ) {
          reason(entry, '角色或标签过滤');
          continue;
        }
      }
      if (step < (entry.delay || 0)) {
        reason(entry, `延迟激活：第${entry.delay}次成功生成起`);
        continue;
      }
      if (!sticky && effect.cooldownUntil > step) {
        reason(entry, `冷却中：还需${effect.cooldownUntil - step}次成功生成`);
        continue;
      }
      if (!sticky && Number(entry.delayUntilRecursion) > round) {
        reason(entry, '等待递归层级');
        continue;
      }
      if (round > 0 && entry.excludeRecursion && !sticky) {
        reason(entry, '排除递归');
        continue;
      }
      if (entry.content.startsWith('@@dont_activate')) {
        reason(entry, '@@dont_activate');
        continue;
      }
      let text = history
        .slice(-(entry.scanDepth ?? depth))
        .map((message) =>
          settings.includeNames
            ? `${message.name || message.role || ''}: ${message.content}`
            : message.content,
        )
        .join('\n');
      if ((entry.scanDepth ?? depth) === 0) text = '';
      for (const [field, source] of [
        ['matchPersonaDescription', 'persona'],
        ['matchCharacterDescription', 'characters'],
        ['matchCharacterPersonality', 'personalities'],
        ['matchCharacterDepthPrompt', 'characterNotes'],
        ['matchScenario', 'scenario'],
        ['matchCreatorNotes', 'creatorNotes'],
      ])
        if (entry[field]) text += '\n' + (context[source] || '');
      text = (text + '\n' + recursionText).slice(-160000);
      const matches = entry.key.filter((key) =>
        matchKey(text, expanded(key), entry, settings, warnings),
      ).length;
      const secondary = entry.keysecondary.map((key) =>
        matchKey(text, expanded(key), entry, settings, warnings),
      );
      const selective =
        !entry.selective ||
        !secondary.length ||
        [
          secondary.some(Boolean),
          !secondary.every(Boolean),
          !secondary.some(Boolean),
          secondary.every(Boolean),
        ][entry.selectiveLogic];
      const forced = entry.content.startsWith('@@activate');
      if (!(entry.constant || sticky || forced || (matches && selective))) {
        reason(
          entry,
          entry.vectorized && !matches
            ? '向量插件未连接；关键词未命中'
            : matches
              ? '次关键词条件不满足'
              : '关键词未命中',
        );
        continue;
      }
      if (entry.vectorized)
        warnings.add('向量字段保留；本项目没有酒馆的向量插件，不执行向量检索。');
      if (entry.automationId)
        warnings.add('automationId仅保留和展示，本游戏不执行酒馆Quick Reply或脚本。');
      const content = expanded(entry.content.replace(/^@@(?:dont_activate|activate)\s*\n?/, ''));
      if (!content.trim()) {
        reason(entry, '正文为空');
        continue;
      }
      if (
        entry.useProbability &&
        !sticky &&
        !evaluated.has(entry.id) &&
        stableRoll(`${context.kind}:${step}:${entry.id}:probability`) * 100 >= entry.probability
      ) {
        rejected.add(entry.id);
        reason(entry, '概率未通过');
        continue;
      }
      evaluated.add(entry.id);
      candidates.push({
        ...entry,
        content,
        score: matches + secondary.filter(Boolean).length,
        activation: sticky
          ? '黏性保持'
          : entry.constant
            ? '常驻'
            : forced
              ? '@@activate'
              : round > 0
                ? '递归关键词命中'
                : '关键词命中',
      });
    }
    const groups = new Map();
    for (const entry of candidates)
      for (const name of entry.group
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)) {
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(entry);
      }
    const losers = new Set();
    for (const [name, members] of groups) {
      if (selectedGroups.has(name)) {
        members.forEach((entry) => losers.add(entry.id));
        continue;
      }
      let eligible = [...members];
      const stickyMembers = eligible.filter((entry) => entry.activation === '黏性保持');
      if (stickyMembers.length) eligible = stickyMembers;
      const override = eligible.filter((entry) => entry.groupOverride);
      if (override.length) eligible = override.sort(priority).slice(0, 1);
      else {
        if (eligible.some((entry) => entry.useGroupScoring ?? settings.useGroupScoring)) {
          const max = Math.max(...eligible.map((entry) => entry.score));
          eligible = eligible.filter((entry) => entry.score === max);
        }
        let roll =
          stableRoll(`${context.kind}:${step}:${name}:group`) *
          eligible.reduce((sum, entry) => sum + entry.groupWeight, 0);
        eligible = [eligible.find((entry) => (roll -= entry.groupWeight) < 0) || eligible[0]];
      }
      const winner = eligible[0];
      for (const entry of members) if (entry.id !== winner.id) losers.add(entry.id);
    }
    let added = 0,
      newRecursionText = '';
    for (const entry of candidates.sort(priority)) {
      if (losers.has(entry.id)) {
        reason(entry, '互斥组内未入选');
        rejected.add(entry.id);
        continue;
      }
      const tokens = countTokens(entry.content);
      report.get(entry.id).tokens = tokens;
      if (!entry.ignoreBudget && used + tokens > budget) {
        reason(entry, '超过世界书token预算');
        rejected.add(entry.id);
        continue;
      }
      if (entry.position === 7 && !entry.outletName.trim()) {
        reason(entry, 'Outlet名称为空');
        continue;
      }
      active.set(entry.id, entry);
      Object.assign(report.get(entry.id), { active: true, reason: entry.activation });
      entry.group
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((name) => selectedGroups.add(name));
      used += tokens;
      if (!entry.preventRecursion) newRecursionText += '\n' + entry.content;
      added++;
      if (!state.effects?.[entry.id] || !((state.effects[entry.id].stickyUntil || 0) > step)) {
        const stickyUntil = step + Math.max(1, entry.sticky || 0);
        nextEffects[entry.id] = { stickyUntil, cooldownUntil: stickyUntil + (entry.cooldown || 0) };
      }
    }
    recursionText += newRecursionText;
    const max = settings.maxRecursionSteps || Math.min(rows.length + 1, 100);
    const pendingDelayed = rows.some(
      (entry) =>
        !entry.disable && Number(entry.delayUntilRecursion) > round && !active.has(entry.id),
    );
    if (settings.recursive && round < max && ((added && newRecursionText) || pendingDelayed)) {
      round++;
      continue;
    }
    const depthMax = settings.minActivationsDepthMax || history.length;
    if (active.size < settings.minActivations && depth < Math.min(history.length, depthMax)) {
      depth++;
      round = 0;
      continue;
    }
    break;
  }
  return {
    entries: [...active.values()].sort((a, b) => a.order - b.order || a.uid - b.uid),
    report: [...report.values()],
    warnings: [...warnings],
    usedTokens: used,
    budget,
    scanDepth: depth,
    nextState: { step: step + 1, effects: nextEffects },
  };
}

/** All eight ST anchors, with explicit game mappings for author notes and chat depth. */
export function injectWorldbookMessages(
  messages,
  entries,
  authorNote = '',
  { characterText = '' } = {},
) {
  const result = [...messages];
  const role = (entry) => ['system', 'user', 'assistant'][entry.role] || 'system';
  const msg = (entry) => ({ role: role(entry), content: entry.content });
  const before = entries.filter((entry) => entry.position === 0).map(msg);
  const after = entries.filter((entry) => entry.position === 1).map(msg);
  const contextIndex = result.findIndex(
    (message) => message.role === 'user' && message.content.trim().startsWith('{'),
  );
  const characterIndex = characterText
    ? result.findIndex((message) => message.content.includes(characterText))
    : -1;
  const anchorIndex = characterIndex >= 0 ? characterIndex : contextIndex;
  const index = anchorIndex < 0 ? result.length : anchorIndex;
  result.splice(index, 0, ...before);
  result.splice(index + before.length + (anchorIndex < 0 ? 0 : 1), 0, ...after);
  const firstExample = result.findIndex((message) => message.role === 'assistant');
  result.splice(
    firstExample < 0 ? 0 : Math.max(0, firstExample - 1),
    0,
    ...entries.filter((entry) => entry.position === 5).map(msg),
  );
  const lastExample = result.findLastIndex((message) => message.role === 'assistant');
  result.splice(
    lastExample < 0 ? 0 : lastExample + 1,
    0,
    ...entries.filter((entry) => entry.position === 6).map(msg),
  );
  result.push(
    ...entries.filter((entry) => entry.position === 2).map(msg),
    ...(authorNote.trim() ? [{ role: 'system', content: authorNote }] : []),
    ...entries.filter((entry) => entry.position === 3).map(msg),
  );
  for (const entry of entries
    .filter((item) => item.position === 4)
    .sort((a, b) => b.depth - a.depth))
    result.splice(Math.max(0, result.length - entry.depth), 0, msg(entry));
  return result;
}
