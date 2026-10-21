import { completionURL, validateApiKey } from './compatible.js';
import { isVertex, vertexURL } from './vertex.js';
const randomUUID = () => crypto.randomUUID();

export const DEFAULT_OUTPUT_TOKENS = 32768;
export const MAX_OUTPUT_TOKENS = 131072;
export const API_KINDS = [
  'character',
  'script',
  'chat',
  'quick-chat',
  'summary',
  'creation',
  'map',
];
const kinds = API_KINDS;
const publicProfile = ({ apiKey, ...profile }) => ({ ...profile, hasApiKey: !!apiKey });

function profileFrom(input, old) {
  completionURL(input.baseUrl);
  const provider = input.provider ?? old.provider ?? 'auto';
  const vertexAuth = input.vertexAuth ?? old.vertexAuth ?? 'api-key';
  if (!['auto', 'openai', 'vertex'].includes(provider)) throw Error('接口协议无效');
  if (!['api-key', 'oauth'].includes(vertexAuth)) throw Error('Vertex 认证类型无效');
  if (isVertex({ ...input, provider })) vertexURL(input);
  if (typeof input.model !== 'string' || input.model.length > 200) throw Error('模型名称无效');
  const apiKey = input.clearKey
    ? ''
    : typeof input.apiKey === 'string' && input.apiKey.trim()
      ? input.apiKey.trim()
      : old.apiKey;
  validateApiKey(apiKey);
  if (!['max_tokens', 'max_completion_tokens', 'none'].includes(input.tokenField))
    throw Error('输出长度字段无效');
  const maxTokens = Number(input.maxTokens ?? DEFAULT_OUTPUT_TOKENS);
  if (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > MAX_OUTPUT_TOKENS)
    throw Error(`输出上限需要是256～${MAX_OUTPUT_TOKENS}的整数`);
  const temperature = input.temperature == null ? null : Number(input.temperature);
  if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2))
    throw Error('Temperature范围是0～2');
  const promptProcessing = input.promptProcessing ?? old.promptProcessing ?? 'strict';
  if (!['strict', 'merge_tools'].includes(promptProcessing)) throw Error('提示词后处理类型无效');
  const contextSize = Number(input.contextSize ?? old.contextSize ?? 131072);
  if (!Number.isInteger(contextSize) || contextSize < 1024 || contextSize > 2000000)
    throw Error('上下文长度需要是1024～2000000的整数');
  const requestMode = input.requestMode ?? old.requestMode ?? 'local';
  if (!['local', 'browser'].includes(requestMode)) throw Error('连接方式无效');
  return {
    provider,
    vertexAuth,
    requestMode,
    sessionId: old.sessionId || randomUUID(),
    contextSize,
    promptProcessing,
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    apiKey,
    rememberKey: input.rememberKey !== false,
    jsonMode: input.jsonMode === true,
    strictJson: input.strictJson === true,
    temperature,
    maxTokens,
    tokenField: input.tokenField,
  };
}

/** Platform-owned storage holds settings; this store has no network or filesystem dependency. */
export function createConnectionStore({ snapshot = {}, initial = {}, save = async () => {} } = {}) {
  const defaults = {
    provider: 'auto',
    vertexAuth: 'api-key',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    apiKey: '',
    rememberKey: true,
    jsonMode: false,
    strictJson: false,
    temperature: null,
    maxTokens: DEFAULT_OUTPUT_TOKENS,
    tokenField: 'max_tokens',
    promptProcessing: 'strict',
    contextSize: 131072,
    stream: false,
    requestMode: 'local',
    ...initial,
  };
  const profiles = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      {
        ...defaults,
        sessionId: randomUUID(),
        ...(kind === 'summary' ? { maxTokens: 8192, temperature: 0.2 } : {}),
        promptPresetId: kind === 'summary' ? null : `${kind}-default`,
        apiPresetId: null,
      },
    ]),
  );
  let presets = Array.isArray(snapshot.apiPresets) ? structuredClone(snapshot.apiPresets) : [];
  let writes = Promise.resolve();
  for (const kind of kinds) {
    const value = snapshot.profiles?.[kind] || snapshot[kind];
    if (value)
      profiles[kind] = {
        ...profiles[kind],
        ...value,
        apiKey: value.apiKey || defaults.apiKey,
        ...((snapshot.version || 0) < 4 ? { rememberKey: true } : {}),
      };
  }
  for (const kind of ['map', 'creation'])
    if (!profiles[kind].promptPresetId)
      profiles[kind].promptPresetId = profiles.chat.promptPresetId || `${kind}-default`;
  function persist() {
    const stored = (profile) => ({ ...profile, apiKey: profile.rememberKey ? profile.apiKey : '' });
    const value = {
      version: 4,
      profiles: Object.fromEntries(kinds.map((kind) => [kind, stored(profiles[kind])])),
      apiPresets: presets.map(stored),
    };
    writes = writes.catch(() => {}).then(() => save(value));
    return writes;
  }
  const checkKind = (kind) => {
    if (!kinds.includes(kind)) throw Error('接口类型无效');
  };
  const visible = () =>
    Object.fromEntries(kinds.map((kind) => [kind, publicProfile(profiles[kind])]));
  return {
    visible,
    get(kind) {
      checkKind(kind);
      return { ...profiles[kind] };
    },
    listPresets: () => presets.map(publicProfile),
    async saveProfile(input) {
      checkKind(input.kind);
      const old = profiles[input.kind];
      profiles[input.kind] = {
        ...profileFrom(input, old),
        promptPresetId: old.promptPresetId,
        apiPresetId: old.apiPresetId,
      };
      await persist();
      return visible();
    },
    async selectPrompt(kind, id) {
      checkKind(kind);
      if (kind === 'summary') throw Error('此API使用内置提示词，无需选择预设');
      profiles[kind].promptPresetId = id;
      await persist();
      return visible();
    },
    async preset(input) {
      checkKind(input.kind);
      if (input.action === 'save') {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 60) throw Error('API预设名称需要1～60字');
        const index = presets.findIndex((entry) => entry.id === input.id);
        if (input.id && index < 0) throw Error('API预设不存在');
        if (index < 0 && presets.length >= 100) throw Error('API预设最多100个');
        const current = profiles[input.kind];
        const connection = input.profile ? profileFrom(input.profile, current) : current;
        const {
          promptPresetId: _prompt,
          apiPresetId: _selected,
          ...profile
        } = { ...current, ...connection };
        // Saving a named connection explicitly includes its credential on this machine.
        // The ordinary profile checkbox still controls profiles saved without a preset.
        const entry = {
          ...profile,
          rememberKey: profile.requestMode !== 'browser' || input.profile?.rememberKey !== false,
          id: input.id || `api-${randomUUID()}`,
          name,
        };
        if (index < 0) presets.push(entry);
        else presets[index] = entry;
        profiles[input.kind] = { ...current, ...connection };
        profiles[input.kind].apiPresetId = entry.id;
        profiles[input.kind].rememberKey = entry.rememberKey;
      } else {
        const entry = presets.find((item) => item.id === input.id);
        if (!entry) throw Error('API预设不存在');
        if (input.action === 'apply') {
          const { id, name: _name, ...profile } = entry;
          profiles[input.kind] = {
            ...profile,
            promptPresetId: profiles[input.kind].promptPresetId,
            apiPresetId: id,
          };
        } else if (input.action === 'delete') {
          presets = presets.filter((item) => item.id !== input.id);
          for (const kind of kinds)
            if (profiles[kind].apiPresetId === input.id) profiles[kind].apiPresetId = null;
        } else throw Error('API预设操作无效');
      }
      await persist();
      return { profiles: visible(), presets: presets.map(publicProfile) };
    },
  };
}
