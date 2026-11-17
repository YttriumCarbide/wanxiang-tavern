import { sha256 } from '@noble/hashes/sha2.js';

/** Reviewed behavior from Miaosaiya 1.6. Imported callbacks are identified, never evaluated. */
export const MIAOSAIYA_FINGERPRINTS = {
  output: '8d9270a4fbef2ecb5245ceddacba7fcdb022baf50c9ecc7d9bd6fede02025486',
  formatter: 'dc51f5a35b4c3b24bfe90a6cb74140eba6e8efe522008ae0d7d8463329ffeac1',
  reassembly: '54848e13d37196addeb97085190c22cdda9317d1761183823ce622c399db4193',
  finalRequest: 'd2b891e09d851b5f8132b76a507bdd0949d974124516034b7f9061f1b08cb1e3',
};

export const MEOWSSIAH_COMPATIBILITY = 'meowssiah-2.0.10';

export const MEOWSSIAH_FORMATTER_FINGERPRINT =
  'f99d96da1a2cd800ca1934f7b803300d96c40c4557b27389bd1ff7c9f2f5b623';
export const MEOWSSIAH_FINAL_REQUEST_FINGERPRINT =
  'd3c49f8d2a3729574df6c1bc9bae2a1c01b4c8c6d30a0b0ce34b0356eda26527';

export function presetScriptFingerprint(text) {
  const bytes = sha256(
    new TextEncoder().encode(
      String(text || '')
        .replaceAll('\r\n', '\n')
        .trim(),
    ),
  );
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function isMeowssiahScriptMatch(script, knownHash, pattern) {
  return (
    typeof script === 'string' &&
    (presetScriptFingerprint(script) === knownHash || pattern.test(script))
  );
}

export function isMeowssiahPreset(preset) {
  const sp = preset?.extensions?.SPreset;
  const output = sp?.OutputPreprocessing;
  const formatter = output?.toolCallFormatter;
  const finalRequest = sp?.FinalRequestProcessing;
  const squash = sp?.ChatSquash;
  const hasCatGodIdentity =
    preset?.extensions?.wanxiang?.adapter === 'meowssiah' ||
    (Array.isArray(preset?.prompts) &&
      preset.prompts.some(
        (entry) =>
          String(entry?.identifier || '').startsWith('catgod-') ||
          (typeof entry?.content === 'string' && /<<<\|catgodml\|/i.test(entry.content)),
      ));
  if (!hasCatGodIdentity) return false;
  if (
    output?.enabled &&
    !isMeowssiahScriptMatch(
      output.script,
      MIAOSAIYA_FINGERPRINTS.output,
      /(?:think_nya|report_nya)/iu,
    )
  )
    return false;
  if (
    formatter?.enabled &&
    !isMeowssiahScriptMatch(
      formatter.script,
      MEOWSSIAH_FORMATTER_FINGERPRINT,
      /(?:soliumbra_reply|think_nya)/iu,
    )
  )
    return false;
  if (
    finalRequest?.enabled &&
    !isMeowssiahScriptMatch(
      finalRequest.script,
      MEOWSSIAH_FINAL_REQUEST_FINGERPRINT,
      /(?:catgodml|CatGod|soliumbra_reply)/iu,
    )
  )
    return false;
  if (
    squash?.squashed_post_script_enable &&
    squash.squashed_post_script?.trim() &&
    !isMeowssiahScriptMatch(
      squash.squashed_post_script,
      MIAOSAIYA_FINGERPRINTS.reassembly,
      /(?:catgodml|soliumbra|小猫之神)/iu,
    )
  )
    return false;
  return true;
}

export const isMeowssiah2010 = isMeowssiahPreset;

function isOptionsPrompt(entry) {
  return (
    entry.identifier === '046af93d-0c63-4561-b0b2-052cd265fecd' ||
    /行动选[项择]/u.test(entry.name || '') ||
    /<<<\|catgodml\|(?:menu|radio):[^>\n]*<options>|<options>\s*<option>/iu.test(
      entry.content || '',
    )
  );
}

function isCommentPrompt(entry) {
  return (
    entry.identifier === '48863da8-9556-4f14-b5bf-1816e4d4207b' ||
    /猫猫留言|猫猫悄悄话/u.test(entry.name || '') ||
    /<<<\|catgodml\|(?:menu|radio):[^>\n]*<comment>|在\s*<comment>\s*<\/comment>/iu.test(
      entry.content || '',
    )
  );
}

function isSummaryPrompt(entry) {
  return (
    entry.identifier === '3867af9e-9bad-4fdf-9ef8-83ca07d8c68e' ||
    /小总结|场记状态卡|高密度场记卡/u.test(entry.name || '') ||
    /<<<\|catgodml\|(?:menu|radio):[^>\n]*<summary>|必须在\s*<summary>\s*<\/summary>/iu.test(
      entry.content || '',
    )
  );
}

function isGameTagPrompt(entry) {
  return (
    entry.identifier === 'f65144f0-d39e-43e6-84e7-5c1d78a1a23d' ||
    /<game>\s*标签|<game>\s*正文/iu.test(entry.name || '') ||
    /<<<\|catgodml\|(?:menu|radio):[^>\n]*<game>|要用\s*<game>\s*<\/game>/iu.test(
      entry.content || '',
    )
  );
}

function replaceGameTags(text) {
  return String(text || '')
    .replaceAll('<game>', '<wanxiang_output>')
    .replaceAll('</game>', '</wanxiang_output>');
}

/** One-time adaptation on import for Meowssiah 2.x+: disable noisy modules and swap <game> to <wanxiang_output>. */
export function adaptMeowssiahPreset(preset) {
  if (!isMeowssiahPreset(preset) || preset?.extensions?.wanxiang?.meowssiahAdapted === 1) {
    return { preset, adapted: false };
  }
  const disableIds = new Set();
  const gameIds = new Set();
  const prompts = preset.prompts.map((entry) => {
    if (entry.marker) return entry;
    if (isOptionsPrompt(entry) || isCommentPrompt(entry) || isSummaryPrompt(entry)) {
      disableIds.add(entry.identifier);
      return { ...entry, enabled: false };
    }
    if (isGameTagPrompt(entry)) {
      gameIds.add(entry.identifier);
      return {
        ...entry,
        name: replaceGameTags(entry.name),
        content: replaceGameTags(entry.content),
        enabled: true,
      };
    }
    return entry;
  });
  const prompt_order = (preset.prompt_order || []).map((group) => ({
    ...group,
    order: (group.order || []).map((item) => {
      if (disableIds.has(item.identifier)) return { ...item, enabled: false };
      if (gameIds.has(item.identifier)) return { ...item, enabled: true };
      return item;
    }),
  }));
  return {
    preset: {
      ...preset,
      prompts,
      prompt_order,
      extensions: {
        ...(preset.extensions || {}),
        wanxiang: {
          ...(preset.extensions?.wanxiang || {}),
          adapter: 'meowssiah',
          meowssiahAdapted: 1,
        },
      },
    },
    adapted: true,
  };
}

/** Translate the active prompt at request time while retaining the user's saved source. */
export function meowssiahGamePreset(preset) {
  const stripHeaders =
    /<<<\|catgodml\|(?:menu|radio|registerThinkingStep|deepthink|registerPart):[^\n]*?>>>[ \t]*\r?\n?/giu;
  const controls =
    /<run_tool_replacement>|<\|(?:merge|sep)\|>|<<<\|catgodml\||<\/?(?:think_nya|report_nya|game)\b|<8wanxiang_output>|\b(?:game_content|soliumbra_reply)\b/iu;
  const disabled = new Set();
  const prompts = preset.prompts.map((prompt) => {
    if (prompt.marker) return prompt;
    const content = prompt.content.replace(stripHeaders, '').trim();
    const visible = content.replace(/\{\{\/\/[\s\S]*?\}\}/g, '').trim();
    if (
      !visible ||
      prompt.identifier === 'SPresetSettings' ||
      prompt.identifier === 'version_info' ||
      controls.test(content)
    )
      disabled.add(prompt.identifier);
    return { ...prompt, content };
  });
  return {
    ...preset,
    prompts,
    prompt_order: preset.prompt_order.map((group) => ({
      ...group,
      order: group.order.map((item) =>
        disabled.has(item.identifier) ? { ...item, enabled: false } : item,
      ),
    })),
    function_calling: false,
    extensions: preset.extensions?.wanxiang
      ? { wanxiang: structuredClone(preset.extensions.wanxiang) }
      : {},
    assistant_prefill: '',
    assistant_impersonation: '',
    continue_prefill: '',
  };
}

/** The preset starts with this header; keep game-injected context behind its boundary. */
export function miaosaiyaPromptMessages(source, processing) {
  const messages = structuredClone(source);
  if (processing?.finalRequest !== 'miaosaiya-1.6') return messages;
  const anchor = messages.findIndex(
    (message) =>
      message.role === 'system' &&
      typeof message.content === 'string' &&
      message.content.includes('<run_tool_replacement>'),
  );
  if (anchor > 0) messages.unshift(...messages.splice(anchor, 1));
  return messages;
}

export function miaosaiyaReassemble(content) {
  const usernamePattern = /\|用户：(.*?)\|/u;
  const username = content.match(usernamePattern)?.[1] ?? '用户';
  let result = content.replace(usernamePattern, '').replace(/\|delete\|[\s\S]*?\|\/delete\|/gu, '');
  const positions = [...result.matchAll(/<summary>/gu)]
    .filter(
      (match) => !/details>\s*$/u.test(result.slice(Math.max(0, match.index - 10), match.index)),
    )
    .map((match) => match.index)
    .slice(0, -3);
  for (let index = positions.length - 1; index >= 0; index--) {
    const insertion = positions[index] + '<summary>'.length;
    result =
      result.slice(0, insertion) + `\n---第${index + 1}段剧情总结---` + result.slice(insertion);
  }
  return result.replace(
    /[\n]*\|(小猫之神|用户)\|/gu,
    (_marker, role) =>
      `\n"}, {"role": "${role === '小猫之神' ? 'soliumbra' : username}", "content": "\n`,
  );
}

/** Run after ordinary prompt processing, matching the author's marker and slicing rules. */
export function miaosaiyaFinalRequest(source, processing) {
  const messages = structuredClone(source);
  if (processing?.finalRequest !== 'miaosaiya-1.6') return { messages, status: {} };
  const marker = '<run_tool_replacement>';
  const toText = (content) =>
    Array.isArray(content)
      ? content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('\n')
      : String(content ?? '');
  const system = messages[0];
  if (system?.role !== 'system' || !toText(system.content).includes(marker))
    return { messages, status: { finalRequest: 'inactive' } };
  const consumeMarker = (content) => {
    if (typeof content === 'string') return content.replaceAll(marker, '');
    if (!Array.isArray(content)) return content;
    return content.map((part) =>
      typeof part === 'string'
        ? part.replaceAll(marker, '')
        : typeof part?.text === 'string'
          ? { ...part, text: part.text.replaceAll(marker, '') }
          : part,
    );
  };
  const hasFinalUser = messages.at(-1)?.role === 'user';
  return {
    messages: [
      { ...system, content: consumeMarker(system.content) },
      hasFinalUser ? messages.at(-1) : { role: 'user', content: '", "function": ' },
    ],
    contextTool: {
      name: 'context',
      description: messages
        .slice(1, hasFinalUser ? -1 : messages.length)
        .map((message) => toText(message.content))
        .join('\n\n'),
      parameters: { type: 'object', properties: {} },
    },
    status: { finalRequest: 'miaosaiya-1.6' },
  };
}
