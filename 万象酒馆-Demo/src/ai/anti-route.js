import { applyNarration, refractPrompt } from './anti-route-prompt.js';

/** Native integration of the V0.5 desktop script (Anti-Route 8.31). */
export const ANTI_ROUTE_VERSION = '8.31';
export const ANTI_ROUTE_DEFAULTS = Object.freeze({
  enabled: true,
  verify: true,
  pin: true,
  thinking: false,
  retryEmpty: true,
  retryOutput: false,
  safe: false,
  entropy: false,
  entropyMode: 'refract',
  entropyStrength: 'mid',
  refractMode: 'stable',
  refractSeed: '',
  saltWin: 30,
  know: 'off',
  charm: 'off',
  scope: 'all',
  scopeList: 'deepseek',
  healTags: false,
});

export function routeSettings(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const result = { ...ANTI_ROUTE_DEFAULTS };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'boolean' && typeof input[key] === 'boolean')
      result[key] = input[key];
  }
  const choices = {
    entropyMode: ['refract', 'comment', 'session', 'ref'],
    entropyStrength: ['light', 'mid', 'heavy'],
    refractMode: ['stable', 'random'],
    know: ['off', 'lite', 'full'],
    charm: ['off', 'lite', 'full'],
    scope: ['all', 'skip', 'only'],
  };
  for (const [key, values] of Object.entries(choices))
    if (values.includes(input[key])) result[key] = input[key];
  if (Number.isInteger(input.saltWin) && input.saltWin >= 0 && input.saltWin <= 1440)
    result.saltWin = input.saltWin;
  if (typeof input.scopeList === 'string') result.scopeList = input.scopeList.slice(0, 512);
  if (typeof input.refractSeed === 'string') result.refractSeed = input.refractSeed.slice(0, 120);
  return result;
}

function randomText(length, random) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}

function entropyBlock(config, random) {
  if (config.entropyMode === 'session')
    return `[Session Reference: ${randomText(48, random)} | Anchor: ${randomText(24, random)}]`;
  if (config.entropyMode === 'ref') {
    const count = config.entropyStrength === 'heavy' ? 12 : 6;
    return Array.from(
      { length: count },
      () => `[_ar5_${randomText(6, random)}]: # (${randomText(10, random)})`,
    ).join('\n');
  }
  const count =
    config.entropyStrength === 'light'
      ? 3
      : config.entropyStrength === 'heavy'
        ? 45
        : 15 + Math.floor(random() * 31);
  return Array.from(
    { length: count },
    () => `<!-- ${randomText(16 + Math.floor(random() * 20), random)} -->`,
  ).join('');
}

/** Work on the outgoing copy only, before the final token count and context check. */
export function prepareRouteMessages(messages, input, options = {}) {
  const config = routeSettings(input);
  const result = structuredClone(messages);
  const random = options.random || Math.random;
  if (!config.enabled || config.safe || !result.length) return { messages: result, entropy: false };
  if (!config.entropy || config.entropyMode === 'refract') {
    const entropy = config.entropy && refractPrompt(result, config, { ...options, random });
    applyNarration(result, config, options.kind);
    return { messages: result, entropy };
  }
  function prefix(message) {
    const block = entropyBlock(config, random) + '\n';
    if (typeof message.content === 'string') {
      message.content = block + message.content;
      return true;
    } else if (Array.isArray(message.content)) {
      const part = message.content.find((item) => typeof item.text === 'string');
      if (part) {
        part.text = block + part.text;
        return true;
      }
    }
    return false;
  }
  const system = result.find((message) => message.role === 'system');
  let entropy = system ? prefix(system) : true;
  if (!system) result.unshift({ role: 'system', content: entropyBlock(config, random) });
  if (config.entropyStrength !== 'light') {
    const user = result.findLast((message) => message.role === 'user');
    if (user) entropy = prefix(user) || entropy;
  }
  applyNarration(result, config, options.kind);
  return { messages: result, entropy };
}

export function routeMessages(messages, input, random = Math.random) {
  return prepareRouteMessages(messages, input, { random }).messages;
}

export function detectRouteEffort(body) {
  const level = body.reasoning_effort || body.reasoningEffort;
  if (level) return `${level}（显式）`;
  const thinking = body.generationConfig?.thinkingConfig || body.thinkingConfig;
  if (thinking?.thinkingLevel) return `${thinking.thinkingLevel}（显式）`;
  if (typeof thinking?.thinkingBudget === 'number') return `budget:${thinking.thinkingBudget}`;
  return '未设（auto）';
}

export function pinRoutePayload(body, config, openRouter = false) {
  if (!config?.enabled || config.safe) return;
  if (config.pin) {
    delete body.models;
    delete body.route;
    for (const key of ['allow_fallbacks', 'openrouter_allow_fallbacks', 'openrouter_use_fallback'])
      if (Object.hasOwn(body, key)) body[key] = false;
    if (openRouter || body.provider) body.provider = { ...body.provider, allow_fallbacks: false };
  }
  if (config.thinking && !body.reasoning_effort) body.reasoning_effort = 'high';
}

export function normalizeRouteModel(value) {
  let model = String(value || '')
    .trim()
    .toLowerCase();
  try {
    model = decodeURIComponent(model).toLowerCase();
  } catch {
    // A malformed escape is not evidence of a different model.
  }
  model = model.split(/[?#]/, 1)[0].replace(/:([a-z]+generatecontent|generatecontent)$/, '');
  if (/\/models\//.test(model)) model = model.slice(model.lastIndexOf('/models/') + 8);
  const prefix =
    /^(?:(?:models|google|openrouter|vertex_ai|vertex|gemini|custom|litellm|fireworks|together)\/|(?:pggo|bdgo|aihubmix|proxy|pg)-)/;
  while (prefix.test(model)) model = model.replace(prefix, '');
  if (['auto', 'router', 'default'].includes(model)) return '';
  return model;
}

export function includesRouteModel(model, { scope, scopeList } = {}) {
  if (!scope || scope === 'all') return true;
  const expected = normalizeRouteModel(model);
  const names = String(scopeList || '')
    .split(/[\s,，;；]+/)
    .map(normalizeRouteModel)
    .filter(Boolean);
  const matches = names.some((name) => expected.includes(name));
  return scope === 'only' ? matches : !matches;
}

export function newRouteAccumulator() {
  return {
    model: '',
    modelVersion: '',
    text: 0,
    thought: 0,
    thoughtTokens: -1,
    candidatesTokens: -1,
    finish: '',
    raw: '',
    status: 0,
    retries: 0,
    healed: false,
  };
}

export function absorbRouteResponse(acc, value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) absorbRouteResponse(acc, item);
    return;
  }
  if (typeof value.model === 'string') acc.model = value.model;
  if (typeof value.modelVersion === 'string') acc.modelVersion = value.modelVersion;
  const usage = value.usageMetadata;
  const thoughts =
    usage?.thoughtsTokenCount ?? value.usage?.completion_tokens_details?.reasoning_tokens;
  if (typeof thoughts === 'number') acc.thoughtTokens = thoughts;
  const tokens = usage?.candidatesTokenCount ?? value.usage?.completion_tokens;
  if (typeof tokens === 'number') acc.candidatesTokens = tokens;
  for (const choice of Array.isArray(value.choices) ? value.choices : []) {
    if (choice?.finish_reason) acc.finish = choice.finish_reason;
    const message = choice?.delta || choice?.message || {};
    const text = message.content;
    acc.text +=
      typeof text === 'string'
        ? text.length
        : Array.isArray(text)
          ? text.reduce((sum, part) => sum + (part?.text?.length || 0), 0)
          : 0;
    acc.thought += (message.reasoning_content?.length || 0) + (message.reasoning?.length || 0);
  }
  for (const candidate of Array.isArray(value.candidates) ? value.candidates : []) {
    if (candidate?.finishReason) acc.finish = candidate.finishReason;
    const parts = candidate?.content?.parts;
    for (const part of Array.isArray(parts) ? parts : [])
      acc[part?.thought ? 'thought' : 'text'] += part?.text?.length || 0;
  }
}

export function routeVerdict(requested, acc, config, channel, stage) {
  const actual = acc.modelVersion || acc.model;
  const expected = normalizeRouteModel(requested);
  const received = normalizeRouteModel(actual);
  if (stage) return { verdict: stage, respModel: actual };
  if (!includesRouteModel(requested, config)) return { verdict: 'skip', respModel: actual };
  if (channel === 'ignores-model') return { verdict: 'echo', respModel: actual };
  const noThinking =
    /argon|gemini-?4|gemini-?3(\.\d)?-?pro|\bpro\b|opus/i.test(expected) &&
    acc.text > 0 &&
    acc.thought === 0 &&
    acc.thoughtTokens === 0;
  return {
    verdict:
      received && expected
        ? expected === received
          ? noThinking
            ? 'thin'
            : 'same'
          : 'diff'
        : noThinking
          ? 'thin'
          : 'unknown',
    respModel: actual,
  };
}

/** Only repairs unmatched display tags; never repairs or guesses structured JSON data. */
export function healRouteTags(value) {
  let text = value;
  for (const name of ['thinking', 'think', 'Chain_of_Thought', 'konatan_planning~', 'plan']) {
    const stack = [];
    const expression = new RegExp(`<\\s*(/?)\\s*${name}\\s*>`, 'gi');
    for (const match of text.matchAll(expression)) {
      if (match[1]) stack.pop();
      else stack.push({ start: match.index, end: match.index + match[0].length });
    }
    for (const open of stack.reverse()) {
      const rest = text.slice(open.end);
      const boundary = /\n[ \t]*\n/.exec(rest);
      if (boundary) {
        const at = open.end + boundary.index;
        text = text.slice(0, at) + `\n</${name}>` + text.slice(at);
      } else text = text.slice(0, open.start) + text.slice(open.end);
    }
  }
  return text;
}
