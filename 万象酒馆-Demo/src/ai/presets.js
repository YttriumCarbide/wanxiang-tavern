import { samplingFromPreset } from './sampling.js';
import { createMacroExpander } from './prompt-macros.js';
const roles = ['system', 'user', 'assistant'];
export const PROMPT_MARKERS = [
  'taskContext',
  'chatHistory',
  'worldInfoBefore',
  'worldInfoAfter',
  'charDescription',
  'charPersonality',
  'scenario',
  'personaDescription',
  'dialogueExamples',
];

/** Adapt SillyTavern Chat Completion prompts + global prompt_order, with retained preset extensions. */
export function normalizePromptPreset(raw, id = 'custom') {
  if (!raw || !Array.isArray(raw.prompts) || !raw.prompts.length || raw.prompts.length > 1000)
    throw Error('预设需要1～1000条prompts消息；请导入酒馆Chat Completion预设');
  if (raw.prompt_order !== undefined && !Array.isArray(raw.prompt_order))
    throw Error('prompt_order必须是数组');
  const warnings = [];
  const prompts = raw.prompts.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw Error(`第${index + 1}条消息无效`);
    const identifier = String(entry.identifier || `message-${index + 1}`);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(identifier))
      throw Error('消息identifier只允许字母、数字、横线与下划线');
    const role = entry.role === 'ass' ? 'assistant' : entry.role || 'system';
    if (!roles.includes(role)) throw Error(`${identifier}的角色只能是system、user、assistant`);
    const content = typeof entry.content === 'string' ? entry.content : '';
    if (content.length > 128000) throw Error(`${identifier}内容过长（最多128000字）`);
    if (entry.marker && !PROMPT_MARKERS.includes(identifier))
      warnings.push(`未适配的占位层 ${identifier} 将跳过，请改成普通消息或支持的占位层。`);
    if (entry.injection_trigger?.length)
      warnings.push(`${identifier}的酒馆生成类型触发器不适用于游戏接口，按当前启用状态发送。`);
    return {
      ...structuredClone(entry),
      identifier,
      name: String(entry.name || identifier).slice(0, 80),
      role,
      content,
      system_prompt: entry.system_prompt === true,
      marker: entry.marker === true,
      injection_position: entry.injection_position === 1 ? 1 : 0,
      injection_depth: Math.max(0, Math.min(100, Math.floor(Number(entry.injection_depth) || 0))),
      injection_order: Math.max(
        0,
        Math.min(9999, Math.floor(Number(entry.injection_order ?? 100))),
      ),
      enabled: entry.enabled !== false,
    };
  });
  if (new Set(prompts.map((entry) => entry.identifier)).size !== prompts.length)
    throw Error('消息identifier不能重复');
  if (prompts.reduce((sum, entry) => sum + entry.content.length, 0) > 1000000)
    throw Error('预设正文总量过大');
  const group =
    raw.prompt_order?.find((entry) => entry.character_id === 100001) ||
    raw.prompt_order?.find((entry) => entry.character_id === 100000) ||
    raw.prompt_order?.[0];
  const order = Array.isArray(group?.order)
    ? group.order
    : prompts.map((entry) => ({ identifier: entry.identifier, enabled: entry.enabled }));
  if (new Set(order.map((entry) => entry.identifier)).size !== order.length)
    throw Error('消息顺序不能包含重复identifier');
  const identifiers = new Set(prompts.map((entry) => entry.identifier));
  const knownOrder = order
    .filter((entry) => identifiers.has(entry.identifier))
    .map((entry) => ({ identifier: entry.identifier, enabled: entry.enabled !== false }));
  for (const entry of prompts)
    if (!knownOrder.some((item) => item.identifier === entry.identifier))
      knownOrder.push({ identifier: entry.identifier, enabled: false });
  samplingFromPreset(raw);
  const metadata = structuredClone(raw);
  if (raw.assistant_prefill || raw.assistant_impersonation || raw.continue_prefill)
    warnings.push(
      '预设的回复预填充已保留，但生成接口要求完整JSON，不发送半截ASSISTANT前缀；以最终请求预览为准。',
    );
  for (const key of [
    'api_key',
    'apiKey',
    'openai_api_key',
    'proxy_password',
    'reverse_proxy_password',
    'custom_include_headers',
    'custom_exclude_headers',
    'headers',
    'authorization',
    'Authorization',
  ])
    delete metadata[key];
  if (
    Object.hasOwn(metadata.extensions || {}, 'tavern_helper') ||
    JSON.stringify(metadata.extensions || {}).includes('TavernHelper') ||
    /<script\b|<%/.test(JSON.stringify(metadata))
  )
    warnings.push(
      '附带酒馆助手脚本：选用预设时在扩展窗口运行；依赖其他插件的接口可能需要进一步适配。',
    );
  return {
    preset: {
      ...metadata,
      id,
      name: String(raw.name || '导入的酒馆预设').slice(0, 80),
      prompts,
      prompt_order: [{ character_id: 100001, order: knownOrder }],
    },
    warnings,
  };
}

export function composePromptPreset(preset, variables, markers) {
  const replace = createMacroExpander(variables);
  const messages = [],
    injections = [];
  let hasInput = false;
  for (const item of preset.prompt_order[0].order) {
    if (!item.enabled) continue;
    const entry = preset.prompts.find((prompt) => prompt.identifier === item.identifier);
    if (!entry) continue;
    if (entry.marker) {
      const chunk = Object.hasOwn(markers, entry.identifier) ? markers[entry.identifier] : [];
      if (['taskContext', 'chatHistory'].includes(entry.identifier) && chunk.length)
        hasInput = true;
      messages.push(...chunk);
      continue;
    }
    if (!entry.content.trim()) continue;
    if (/{{\s*input\s*}}/i.test(entry.content)) hasInput = true;
    const content = replace(entry.content);
    if (!content.trim()) continue;
    const message = { role: entry.role, content };
    if (entry.injection_position === 1) injections.push({ ...entry, message });
    else messages.push(message);
  }
  // The current task cannot disappear when an imported chat preset disables chatHistory.
  if (!hasInput) messages.push(...markers.taskContext);
  const base = [...messages];
  const result = [];
  for (let index = 0; index <= base.length; index++) {
    const entries = injections
      .filter((entry) => Math.max(0, base.length - entry.injection_depth) === index)
      .sort(
        (a, b) =>
          b.injection_order - a.injection_order || roles.indexOf(a.role) - roles.indexOf(b.role),
      );
    result.push(...entries.map((entry) => entry.message));
    if (index < base.length) result.push(base[index]);
  }
  return result;
}

/** Only portable Chat Completions sampling fields are sent; connection secrets never come from a preset. */
export function presetSampling(preset) {
  return samplingFromPreset(preset);
}
