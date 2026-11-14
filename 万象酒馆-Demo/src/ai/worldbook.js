/** SillyTavern World Info wire format. Unknown extension data survives import/export. */
export const WORLD_ENTRY_DEFAULTS = Object.freeze({
  apiTargets: ['character', 'script'],
  key: [],
  keysecondary: [],
  comment: '',
  content: '',
  constant: false,
  vectorized: false,
  selective: true,
  selectiveLogic: 0,
  addMemo: false,
  order: 100,
  position: 0,
  disable: false,
  ignoreBudget: false,
  excludeRecursion: false,
  preventRecursion: false,
  matchPersonaDescription: false,
  matchCharacterDescription: false,
  matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false,
  matchScenario: false,
  matchCreatorNotes: false,
  delayUntilRecursion: 0,
  probability: 100,
  useProbability: true,
  depth: 4,
  outletName: '',
  group: '',
  groupOverride: false,
  groupWeight: 100,
  scanDepth: null,
  caseSensitive: null,
  matchWholeWords: null,
  useGroupScoring: null,
  automationId: '',
  role: 0,
  sticky: null,
  cooldown: null,
  delay: null,
  triggers: [],
});
export const WORLD_SETTINGS_DEFAULTS = Object.freeze({
  globalSelect: ['tavern-canon'],
  character: [],
  script: [],
  chat: [],
  'quick-chat': [],
  summary: [],
  map: [],
  creation: [],
  bindings: {},
  depth: 2,
  minActivations: 0,
  minActivationsDepthMax: 0,
  budget: 25,
  budgetCap: 6000,
  contextSize: 32768,
  includeNames: true,
  recursive: true,
  overflowAlert: true,
  caseSensitive: false,
  matchWholeWords: false,
  useGroupScoring: false,
  characterStrategy: 1,
  maxRecursionSteps: 8,
  persona: '玩家的行为与意愿由玩家决定。',
  characterNotes: '',
  creatorNotes: '',
  authorNote: '',
});
export const WORLD_POSITIONS = [
  '角色定义前',
  '角色定义后',
  '作者注释前',
  '作者注释后',
  '聊天深度',
  '示例对话前',
  '示例对话后',
  'Outlet',
];

function strings(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string') || value.length > 200)
    throw Error(`${label}必须是最多200项的文字数组`);
  return value;
}
export function newWorldEntry(uid = 0) {
  return { uid, ...structuredClone(WORLD_ENTRY_DEFAULTS), displayIndex: uid };
}
export function characterEntryCategory(entry) {
  const kind = entry.extensions?.wanxiang?.characterCategory;
  if (['protagonist', 'ai-character', 'character'].includes(kind)) return kind;
  if (/^主角设定[：:]/u.test(entry.comment)) return 'protagonist';
  if (/^ai角色条目[：:]/iu.test(entry.comment)) return 'ai-character';
  if (
    entry.extensions?.wanxiang?.characterId ||
    /^(?:人物详情|角色详情|角色条目)[：:]/u.test(entry.comment)
  )
    return 'character';
  return null;
}

function withCharacterKeys(keys, character) {
  const existing = Array.isArray(keys) ? keys.map((item) => String(item || '').trim()) : [];
  const name = character?.setting?.name || character?.combat?.name || '';
  const ordered = [character?.id, ...existing, ...(existing.length ? [] : [name])];
  return [...new Set(ordered.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function classifyCharacterEntry(entry, character, protagonistId = null) {
  const category =
    character.id === protagonistId || character.id === 'character-qingyuan'
      ? 'protagonist'
      : character.source === 'generated' || character.id?.startsWith('character-')
        ? 'ai-character'
        : 'character';
  const label = { protagonist: '主角设定', 'ai-character': 'ai角色条目', character: '角色条目' }[
    category
  ];
  return {
    ...entry,
    comment: `${label}：${character.setting?.name || character.combat?.name || '未知角色'}`,
    key: withCharacterKeys(entry?.key, character),
    apiTargets: ['script', 'chat'],
    extensions: {
      ...entry.extensions,
      wanxiang: {
        ...entry.extensions?.wanxiang,
        apiTargets: ['script', 'chat'],
        characterId: character.id || '',
        characterCategory: category,
      },
    },
  };
}

export function characterWorldEntry(character, uid = 0, protagonistId = null) {
  const name = character?.setting?.name || character?.combat?.name || '未知角色';
  const content = character?.setting?.worldbook || '';
  return classifyCharacterEntry(
    {
      ...newWorldEntry(uid),
      comment: `人物详情：${name}`,
      key: withCharacterKeys([name], character),
      keysecondary: [],
      selectiveLogic: 0,
      constant: false,
      position: 1,
      depth: 0,
      order: 100,
      probability: 100,
      content,
      excludeRecursion: true,
      preventRecursion: true,
      disable: false,
      apiTargets: ['script', 'chat'],
      extensions: {
        wanxiang: {
          characterId: character?.id || '',
        },
      },
    },
    character,
    protagonistId,
  );
}
function convertEmbedded(raw) {
  const result = {};
  raw.forEach((entry, index) => {
    const ext = entry.extensions || {};
    result[index] = {
      ...entry,
      uid: index,
      key: entry.keys || [],
      keysecondary: entry.secondary_keys || [],
      disable: entry.enabled === false,
      order: entry.insertion_order ?? 100,
      position: ext.position ?? (entry.position === 'after_char' ? 1 : 0),
    };
    const aliases = {
      excludeRecursion: 'exclude_recursion',
      preventRecursion: 'prevent_recursion',
      delayUntilRecursion: 'delay_until_recursion',
      outletName: 'outlet_name',
      groupOverride: 'group_override',
      groupWeight: 'group_weight',
      scanDepth: 'scan_depth',
      caseSensitive: 'case_sensitive',
      matchWholeWords: 'match_whole_words',
      useGroupScoring: 'use_group_scoring',
      ignoreBudget: 'ignore_budget',
      automationId: 'automation_id',
      matchPersonaDescription: 'match_persona_description',
      matchCharacterDescription: 'match_character_description',
      matchCharacterPersonality: 'match_character_personality',
      matchCharacterDepthPrompt: 'match_character_depth_prompt',
      matchScenario: 'match_scenario',
      matchCreatorNotes: 'match_creator_notes',
    };
    for (const field of Object.keys(WORLD_ENTRY_DEFAULTS)) {
      const value = ext[aliases[field] || field];
      if (value !== undefined) result[index][field] = value;
    }
  });
  return result;
}
export function normalizeWorldbook(raw, fallbackName = '未命名世界书') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('世界书必须是JSON对象');
  const source = raw.character_book || raw;
  const original = Array.isArray(source.entries) ? convertEmbedded(source.entries) : source.entries;
  if (!original || typeof original !== 'object' || Object.keys(original).length > 1000)
    throw Error('世界书需要entries对象，最多1000条');
  const entries = {},
    warnings = [];
  for (const [key, item] of Object.entries(original)) {
    const uid = Number(item?.uid ?? key);
    if (!Number.isInteger(uid) || uid < 0 || uid > 100000000 || Object.hasOwn(entries, uid))
      throw Error('条目UID无效或重复');
    const entry = { ...newWorldEntry(uid), ...structuredClone(item), uid };
    const rawTargets = item.apiTargets ??
      item.extensions?.wanxiang?.apiTargets ?? ['character', 'script'];
    entry.apiTargets = Array.isArray(rawTargets)
      ? [...new Set(rawTargets.map((kind) => (kind === 'quick-chat' ? 'chat' : kind)))]
      : rawTargets;
    if (
      !Array.isArray(entry.apiTargets) ||
      new Set(entry.apiTargets).size !== entry.apiTargets.length ||
      entry.apiTargets.some(
        (kind) => !['character', 'script', 'chat', 'summary', 'creation', 'map'].includes(kind),
      )
    )
      throw Error(
        `条目${uid}.apiTargets只能包含character/script/chat/summary/creation/map，空数组表示都不发`,
      );
    entry.extensions = {
      ...entry.extensions,
      wanxiang: { ...entry.extensions?.wanxiang, apiTargets: [...entry.apiTargets] },
    };
    if (entry.probability === null) {
      entry.probability = 100;
      entry.useProbability = false;
    }
    if (entry.role === null) entry.role = 0;
    if (entry.depth === null) entry.depth = 4;
    if (typeof entry.delayUntilRecursion === 'boolean')
      entry.delayUntilRecursion = Number(entry.delayUntilRecursion);
    for (const field of ['key', 'keysecondary', 'triggers'])
      strings(entry[field], `条目${uid}.${field}`);
    for (const [field, defaultValue] of Object.entries(WORLD_ENTRY_DEFAULTS)) {
      const value = entry[field];
      if (defaultValue === null) {
        if (
          value !== null &&
          typeof value !==
            (['caseSensitive', 'matchWholeWords', 'useGroupScoring'].includes(field)
              ? 'boolean'
              : 'number')
        )
          throw Error(`条目${uid}.${field}类型不符`);
      } else if (
        !Array.isArray(defaultValue) &&
        typeof value !== typeof defaultValue &&
        !(field === 'delayUntilRecursion' && typeof value === 'boolean')
      )
        throw Error(`条目${uid}.${field}类型不符`);
    }
    if (entry.content.length > 100000 || entry.comment.length > 1000)
      throw Error(`条目${uid}正文或标题过长`);
    if (
      !Number.isInteger(entry.position) ||
      entry.position < 0 ||
      entry.position > 7 ||
      ![0, 1, 2].includes(entry.role) ||
      ![0, 1, 2, 3].includes(entry.selectiveLogic)
    )
      throw Error(`条目${uid}的位置、角色或逻辑无效`);
    for (const field of [
      'probability',
      'order',
      'depth',
      'groupWeight',
      'scanDepth',
      'sticky',
      'cooldown',
      'delay',
      'delayUntilRecursion',
    ]) {
      if (
        entry[field] !== null &&
        (!Number.isFinite(Number(entry[field])) ||
          Number(entry[field]) < 0 ||
          Number(entry[field]) > 100000)
      )
        throw Error(`条目${uid}.${field}数值无效`);
    }
    if (entry.probability > 100) throw Error('触发概率不能超过100');
    if (entry.vectorized)
      warnings.push(
        `条目${uid}请求向量触发：未连接酒馆向量插件，仍可通过常驻或关键词触发，不伪装语义检索。`,
      );
    if (entry.automationId)
      warnings.push(`条目${uid}的automationId已保留；本游戏不执行酒馆脚本或Quick Reply。`);
    entries[uid] = entry;
  }
  return {
    book: {
      ...structuredClone(source),
      name: String(source.name || fallbackName).slice(0, 100),
      entries,
    },
    warnings,
  };
}

export function normalizeWorldSettings(raw = {}) {
  const settings = { ...structuredClone(WORLD_SETTINGS_DEFAULTS), ...structuredClone(raw) };
  for (const field of [
    'globalSelect',
    'character',
    'script',
    'chat',
    'quick-chat',
    'summary',
    'map',
    'creation',
  ])
    strings(settings[field], field);
  if (
    !settings.bindings ||
    typeof settings.bindings !== 'object' ||
    Array.isArray(settings.bindings)
  )
    throw Error('角色绑定必须是对象');
  for (const books of Object.values(settings.bindings)) strings(books, '绑定世界书');
  for (const field of [
    'depth',
    'minActivations',
    'minActivationsDepthMax',
    'budget',
    'budgetCap',
    'contextSize',
    'maxRecursionSteps',
    'characterStrategy',
  ]) {
    if (!Number.isInteger(settings[field]) || settings[field] < 0 || settings[field] > 1000000)
      throw Error(`世界书设置${field}无效`);
  }
  if (
    settings.budget > 100 ||
    settings.characterStrategy > 2 ||
    settings.depth > 1000 ||
    settings.contextSize < 1024
  )
    throw Error('世界书预算、策略或扫描深度无效');
  for (const field of [
    'includeNames',
    'recursive',
    'overflowAlert',
    'caseSensitive',
    'matchWholeWords',
    'useGroupScoring',
  ])
    if (typeof settings[field] !== 'boolean') throw Error(`世界书设置${field}必须为开关`);
  for (const field of ['persona', 'characterNotes', 'creatorNotes', 'authorNote'])
    if (typeof settings[field] !== 'string' || settings[field].length > 24000)
      throw Error(`世界书设置${field}必须是最多24000字的文字`);
  return settings;
}

function entryFingerprint(entry) {
  const keys = Array.isArray(entry?.key) ? entry.key.join('\0') : '';
  const source = `${entry?.comment || ''}\n${entry?.content || ''}\n${keys}\n${entry?.constant ? 1 : 0}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const STALE_WANXIANG_META = [
  'builtinRevision',
  'retiredPromptArchive',
  'playtestRevision',
  'adventureRevision',
  'mainWorldRevision',
  'characterEntriesRevision',
  'townGuestsRevision',
];

function stripPatchMeta(wanxiang) {
  if (!wanxiang) return undefined;
  const cleaned = { ...wanxiang };
  for (const field of STALE_WANXIANG_META) delete cleaned[field];
  return cleaned;
}

function builtinEntryKey(entry) {
  const marker = entry?.extensions?.wanxiang;
  if (marker) {
    if (marker.officialDungeonId || marker.dungeonId) {
      return `dungeonId:${marker.officialDungeonId || marker.dungeonId}`;
    }
    for (const field of [
      'generationRule',
      'canon',
      'currencyRule',
      'officialNpcId',
      'monsterId',
      'mainWorld',
      'characterId',
    ]) {
      if (marker[field]) return `${field}:${marker[field]}`;
    }
    if (marker.dining) return 'dining:true';
  }
  if (entry?.comment === '万象酒馆 · 基础设定') return 'canon:tavern';
  return '';
}

/** Sync a stored worldbook directly against the latest builtin worldbook while preserving user edits and custom entries. */
export function syncBuiltinWorldbook(existing, builtin) {
  const normalizedBuiltin = normalizeWorldbook(builtin, '万象酒馆世界书').book;
  const builtinEntries = Object.values(normalizedBuiltin.entries);
  const templateHashes = new Map();
  const builtinKeys = new Set();
  for (const template of builtinEntries) {
    const key = builtinEntryKey(template);
    if (!key) continue;
    builtinKeys.add(key);
    templateHashes.set(key, entryFingerprint(template));
  }
  if (!existing?.entries || !Object.keys(existing.entries).length) {
    const fresh = structuredClone(normalizedBuiltin);
    if (fresh.extensions?.wanxiang) {
      fresh.extensions.wanxiang = stripPatchMeta(fresh.extensions.wanxiang);
    }
    for (const entry of Object.values(fresh.entries)) {
      const key = builtinEntryKey(entry);
      if (!key) continue;
      entry.extensions = {
        ...entry.extensions,
        wanxiang: {
          ...stripPatchMeta(entry.extensions?.wanxiang),
          builtinHash: templateHashes.get(key),
        },
      };
    }
    return fresh;
  }
  const book = normalizeWorldbook(existing, normalizedBuiltin.name).book;
  let nextUid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  const seenKeys = new Set();
  for (const [uid, entry] of Object.entries(book.entries)) {
    const w = entry.extensions?.wanxiang;
    const key = builtinEntryKey(entry);
    if (
      w?.generationExample === 'character' ||
      (w?.generationRule && !builtinKeys.has(`generationRule:${w.generationRule}`)) ||
      (w?.currencyRule && !builtinKeys.has(`currencyRule:${w.currencyRule}`)) ||
      (w?.mainWorld && !builtinKeys.has(`mainWorld:${w.mainWorld}`)) ||
      (key && seenKeys.has(key))
    ) {
      delete book.entries[uid];
      continue;
    }
    if (key) seenKeys.add(key);
  }
  const existingByKey = new Map();
  for (const entry of Object.values(book.entries)) {
    const key = builtinEntryKey(entry);
    if (key && !existingByKey.has(key)) existingByKey.set(key, entry);
  }
  for (const template of builtinEntries) {
    const key = builtinEntryKey(template);
    if (!key) continue;
    const templateHash = templateHashes.get(key);
    const match = existingByKey.get(key);
    if (!match) {
      const desiredUid = Number(template.uid);
      const uid =
        Number.isInteger(desiredUid) && desiredUid >= 0 && !book.entries[desiredUid]
          ? desiredUid
          : nextUid++;
      if (uid >= nextUid) nextUid = uid + 1;
      book.entries[uid] = {
        ...structuredClone(template),
        uid,
        displayIndex: uid,
        extensions: {
          ...template.extensions,
          wanxiang: {
            ...stripPatchMeta(template.extensions?.wanxiang),
            builtinHash: templateHash,
          },
        },
      };
    } else {
      const prevHash = match.extensions?.wanxiang?.builtinHash;
      const shouldSyncText = !prevHash || prevHash !== templateHash;
      if (shouldSyncText) {
        const isOfficialChar = Boolean(template.extensions?.wanxiang?.characterId);
        const isLegacyChar =
          isOfficialChar &&
          (match.comment !== template.comment ||
            match.content.includes('过期') ||
            match.content.includes('格雷'));
        if (!isOfficialChar || prevHash || isLegacyChar) {
          match.comment = template.comment;
          match.content = template.content;
        }
        const wxTemplate = template.extensions?.wanxiang || {};
        const existingKeys = Array.isArray(match.key) ? match.key.filter(Boolean) : [];
        const isSystemKeyed = Boolean(
          wxTemplate.generationRule ||
          wxTemplate.characterId ||
          wxTemplate.officialNpcId ||
          wxTemplate.officialDungeonId ||
          wxTemplate.dining,
        );
        if (
          Array.isArray(template.key) &&
          template.key.length &&
          (isSystemKeyed || !existingKeys.length)
        ) {
          if (!template.constant && match.constant && (isSystemKeyed || !existingKeys.length)) {
            match.constant = false;
          }
          match.key = [...new Set([...existingKeys, ...template.key])];
        }
      }
      match.extensions = {
        ...match.extensions,
        wanxiang: {
          ...stripPatchMeta(template.extensions?.wanxiang),
          ...stripPatchMeta(match.extensions?.wanxiang),
          builtinHash: templateHash,
        },
      };
    }
  }
  if (book.extensions?.wanxiang) {
    book.extensions = {
      ...book.extensions,
      wanxiang: stripPatchMeta(book.extensions.wanxiang),
    };
  }
  return normalizeWorldbook(book, normalizedBuiltin.name).book;
}
