import { presetHelperScripts } from './helper-scripts.js';

/** Declarative message transfer, shared by Izumi and presets opting into the same capability. */
export function adviceBinding(preset) {
  const declaration = preset.extensions?.wanxiang?.advice;
  const izumi = presetHelperScripts(preset).some(
    (script) => script.enabled && script.id === '7c19636a-77b4-4c18-b26b-673872cb8dcf',
  );
  if (!izumi && (!declaration || typeof declaration !== 'object')) return null;
  return {
    enabledKey: izumi ? 'izumi_floating_window_advice_enabled_v1' : 'wanxiang:advice-enabled',
    configKey: izumi ? 'izumi_floating_window_advice_config_v1' : 'wanxiang:advice-config',
    defaults: izumi ? {} : declaration,
  };
}

export function adviceSettings(preset, storage = {}) {
  const binding = adviceBinding(preset);
  if (!binding) return null;
  let saved = {};
  try {
    saved = JSON.parse(storage[binding.configKey] || '{}') || {};
  } catch {
    // Match the preset's fallback to defaults for an unreadable saved preference.
  }
  const config = { ...binding.defaults, ...saved };
  const enabled = storage[binding.enabledKey];
  const replacement = config.replacementText;
  if (typeof replacement === 'string' && replacement.length > 10000)
    throw Error('Advice续写指令最多10000字');
  return {
    enabled: enabled == null ? config.enabled === true : enabled !== 'false',
    position: config.position === 'head' ? 'head' : 'tail',
    stripModelAdvice: config.position === 'head' || config.stripModelAdvice !== false,
    replacementText:
      typeof replacement === 'string' && replacement.trim()
        ? replacement
        : '就按照advice说的来吧，注意一下advice内容还没实际发生，要从头开始执行advice。',
  };
}

function assistantWithAdvice(text, input, config) {
  const pattern =
    /<advice\b[^>]*>(?:(?!<advice\b|<\/(?:konatan_planning(?:~[^>]*)?|details|script|think(?:ing)?)\s*>)[\s\S])*?<\/advice\s*>/gi;
  let body = text;
  if (config.stripModelAdvice || config.position === 'head') body = body.replace(pattern, '');
  else if (
    [...body.matchAll(pattern)].some(
      (match) => match[0].replace(/^<advice\b[^>]*>|<\/advice\s*>$/gi, '') === input,
    )
  )
    return body;
  const advice = `<advice>${input}</advice>`;
  if (config.position === 'head') {
    const plans = [...body.matchAll(/<\/konatan_planning(?:~[^>]*)?\s*>/gi)];
    const last = plans.at(-1);
    if (last) {
      const end = last.index + last[0].length;
      return [body.slice(0, end).trimEnd(), advice, body.slice(end).trim()]
        .filter(Boolean)
        .join('\n\n');
    }
    return [advice, body.trim()].filter(Boolean).join('\n\n');
  }
  return [body.trimEnd(), advice].filter(Boolean).join('\n\n');
}

/** Project retained conversation pairs only; never mutate saved history or invent an AI turn. */
export function adviceTranscript(source, config) {
  const messages = source.map((message) => ({ ...message }));
  let transferred = 0;
  if (!config?.enabled) return { messages, transferred };
  let previous = -1;
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === 'system') continue;
    if (message.role === 'user' && previous >= 0 && messages[previous].role === 'assistant') {
      messages[previous].content = assistantWithAdvice(
        messages[previous].content,
        message.content,
        config,
      );
      message.content = config.replacementText;
      transferred++;
    }
    previous = index;
  }
  return { messages, transferred };
}
