import { createPresetOutputProcessor } from '../output-processor.js';
export { createPresetOutputProcessor } from '../output-processor.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { rebornReassemble } from '../reborn-processing.js';
import { presetHelperScripts } from '../helper-scripts.js';

function fingerprint(text) {
  const bytes = sha256(
    new TextEncoder().encode(
      String(text || '')
        .replaceAll('\r\n', '\n')
        .trim(),
    ),
  );
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

/** Describe only reviewed behavior, never send or evaluate user callbacks. */
export function presetProcessing(preset, storage = {}) {
  const sp = preset.extensions?.SPreset || {};
  const result = {};
  if (sp.OutputPreprocessing?.enabled) {
    if (
      fingerprint(sp.OutputPreprocessing.script) !==
      '20ec4f8c0faea5829618f6c2867047e97642a50e4422e6f05c3c7129b98df0a1'
    )
      throw Error('当前输出预处理脚本版本未适配，未执行未知脚本；原预设保留');
    result.output = 'reborn-2.4';
  }
  const squash = sp.ChatSquash;
  if (squash?.squashed_post_script_enable) {
    result.reassembly = {
      version:
        fingerprint(squash.squashed_post_script) ===
        '58b283a79322a45bc7703c52a0fdff1704428855da95b42e1f3f06e93994a500'
          ? 'reborn-2.4'
          : 'unknown',
      enabled: squash.enabled === true,
      conditional: squash.conditional_enabled === true,
      tag: squash.conditional_tag || '',
      settings: Object.fromEntries(
        Object.entries(squash).filter(([key]) => key !== 'squashed_post_script'),
      ),
    };
  }
  const kemini = presetHelperScripts(preset).find(
    (script) => script.id === '2c7d747c-22d4-4e8b-95f8-5620b552fe6e' && script.enabled,
  );
  if (kemini) {
    let scopes = {};
    try {
      scopes = JSON.parse(storage['wanxiang:variable-scopes'] || '{}');
    } catch {
      /* Unrelated older private storage does not enable arbitrary code. */
    }
    const state =
      scopes.script?.[kemini.id]?.keminiCompanion ||
      preset.extensions?.tavern_helper?.variables?.keminiCompanion;
    result.kemini = state?.antiTruncationEnabled !== false;
  }
  return result;
}

export function processPresetMessages(source, processing = {}) {
  let messages = structuredClone(source);
  const status = {};
  const assembly = processing.reassembly;
  if (assembly) {
    const active =
      !assembly.enabled ||
      !assembly.conditional ||
      Boolean(assembly.tag && messages.some((message) => message.content?.includes(assembly.tag)));
    status.reassembly = active ? 'enabled' : 'inactive';
    if (active) {
      if (assembly.version !== 'reborn-2.4')
        throw Error('当前消息重组脚本版本未适配，未执行未知脚本');
      if (assembly.enabled) {
        messages = messages.map((message) => ({
          ...message,
          content: assembly.conditional
            ? message.content.replaceAll(assembly.tag, '')
            : message.content,
        }));
        messages = squashReborn(messages, assembly.settings);
      } else messages = rebornReassemble(messages);
    }
  }
  return { messages, status };
}

export function presetStopStrings(processing = {}) {
  const assembly = processing.reassembly;
  const settings = assembly?.settings;
  if (!assembly?.enabled || !settings?.enable_stop_string || !settings.stop_string) return null;
  let stop;
  try {
    stop = JSON.parse(settings.stop_string);
  } catch {
    stop = [settings.stop_string];
  }
  if (
    !Array.isArray(stop) ||
    stop.length > 16 ||
    stop.some((text) => typeof text !== 'string' || !text || text.length > 500)
  )
    throw Error('预设停止字符串无效');
  return stop;
}

/** Kemini installs its transport after all message processing, as its original fetch wrapper does. */
export function prepareKeminiTransport(source, processing = {}, hasOutputTool = false) {
  const messages = structuredClone(source);
  const status = {};
  let outputTool = null;
  if (processing.kemini && !hasOutputTool) {
    const suffix = fingerprint(JSON.stringify(messages)).slice(0, 24);
    const name = `emit_complete_response_${suffix}`;
    outputTool = {
      name,
      description:
        'Emit the complete final user-visible reply exactly once. Put the entire reply in content and write no reply text outside this call.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The complete final reply shown to the user.' },
        },
        required: ['content'],
      },
    };
    const control = {
      role: 'system',
      content: `Call the \`${name}\` function exactly once and put your complete final reply in its \`content\` argument. Do not write any of the final reply outside that call. Use any other available tools normally when they are needed.`,
    };
    const anchor = messages.findIndex((message) => message.content?.includes('<format>'));
    if (anchor >= 0) messages.splice(anchor, 0, control);
    else
      messages.push({
        ...control,
        role: messages.at(-1)?.role === 'assistant' ? 'user' : 'system',
      });
    status.kemini = 'enabled';
  } else if (processing.kemini !== undefined)
    status.kemini = processing.kemini ? 'existing-tool' : 'disabled';
  return { messages, outputTool, status };
}

function squashReborn(messages, settings) {
  if (settings.squashed_separator_regex || settings.re_split || settings.separate_chat_history)
    throw Error('当前Reborn消息合并配置未适配，未擅自改变发送方式');
  const affixes = {
    user: [settings.user_prefix || '', settings.user_suffix || ''],
    assistant: [settings.char_prefix || '', settings.char_suffix || ''],
    system: [settings.prefix_system || '', settings.suffix_system || ''],
  };
  const result = [];
  let text = '',
    lastRole = '';
  const flush = () => {
    if (lastRole) text += affixes[lastRole][1];
    if (text)
      result.push({
        role:
          settings.role === 'follow' ? messages[0]?.role || 'user' : settings.role || 'assistant',
        content: text,
      });
    text = '';
    lastRole = '';
  };
  for (const original of messages) {
    const message = { ...original };
    if (
      Object.keys(message).some((key) => !['role', 'content'].includes(key)) ||
      typeof message.content !== 'string' ||
      !affixes[message.role]
    ) {
      flush();
      result.push(message);
      continue;
    }
    const marker = settings.enable_squashed_separator ? settings.squashed_separator_string : '';
    if (marker && message.content.includes(marker)) {
      flush();
      result.push({ ...message, content: message.content.replace(marker, '') });
      continue;
    }
    if (settings.parse_clewd && message.content.includes('<|no-trans|>')) {
      flush();
      result.push({ ...message, content: message.content.replace('<|no-trans|>', '') });
      continue;
    }
    const role = settings.user_role_system && message.role === 'system' ? 'user' : message.role;
    if (lastRole && lastRole !== role) text += affixes[lastRole][1];
    text += role === lastRole ? '\n' : affixes[role][0];
    text += message.content;
    lastRole = role;
  }
  flush();
  return result;
}

/** Match the preset's streaming processor with per-request state and bounded buffers. */

/** Structured game JSON is parsed first so text processing cannot break escaped JSON strings. */
export function processGeneratedProse(entry, kind, processing) {
  if (processing?.output !== 'reborn-2.4') return;
  const process = (text) => {
    const reader = createPresetOutputProcessor(processing);
    reader.feed(text);
    return reader.finish();
  };
  if (kind === 'character') entry.setting.worldbook = process(entry.setting.worldbook);
  else if (entry.schemaVersion >= 3) entry.story = entry.story.map(process);
  else {
    entry.opening = process(entry.opening);
    for (const scene of entry.scenes) {
      scene.opening = process(scene.opening);
      for (const stage of ['before', 'after', 'interlude'])
        for (const line of scene[stage]) line.text = process(line.text);
    }
  }
}
