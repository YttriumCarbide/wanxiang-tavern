export const BUILTIN_PROMPT_ID = 'meowssiah-2.1.7';
export const BUILTIN_PROMPT_PATH = `framework/${BUILTIN_PROMPT_ID}.json`;

const DEFAULT_OPTIONS = Object.freeze({
  style: 'cinematic',
  adult: 'original',
  length: 'standard',
  retelling: 'continue',
  perspective: 'character',
  lively: true,
  calm: false,
  avoidCliches: false,
  secondPerson: false,
  adultAsmr: true,
  adultOnRequest: true,
  toolTransport: false,
});

export function normalizePromptOptions(input = {}) {
  input ||= {};
  const choice = (key, values) => (values.includes(input[key]) ? input[key] : DEFAULT_OPTIONS[key]);
  const toggle = (key) => (typeof input[key] === 'boolean' ? input[key] : DEFAULT_OPTIONS[key]);
  return {
    style: choice('style', ['game', 'cinematic', 'sensory']),
    adult: choice('adult', ['original', 'soft', 'intense', 'disabled']),
    length: choice('length', ['short', 'standard', 'long']),
    retelling: choice('retelling', ['continue', 'retell']),
    perspective: choice('perspective', ['character', 'adaptive', 'wide']),
    lively: toggle('lively'),
    calm: toggle('calm'),
    avoidCliches: toggle('avoidCliches'),
    secondPerson: toggle('secondPerson'),
    adultAsmr: toggle('adultAsmr'),
    adultOnRequest: toggle('adultOnRequest'),
    toolTransport: toggle('toolTransport'),
  };
}

/** Project only the chosen, reviewed entries into the game's existing prompt framework. */
export function builtinPrompt(config, kind, options, tools = false) {
  const chatting = ['chat', 'quick-chat'].includes(kind);
  const storytelling = chatting || kind === 'script';
  const active = new Set(config.fixed.filter((row) => ![2, 25, 56].includes(row)));
  const pick = (choices, key) => config[choices].find((choice) => choice.key === key)?.row;
  if (storytelling) {
    active.add(56);
    active.add(pick('styleChoices', options.style));
    active.add(pick('adultChoices', options.adult));
    if (options.lively) active.add(22);
    if (options.calm) active.add(4);
    if (options.avoidCliches) active.add(29);
    if (options.secondPerson) active.add(32);
    if (options.length !== 'standard') active.add(41);
    if (options.adult !== 'disabled') {
      if (options.adultOnRequest) active.add(31);
      if (options.adultAsmr) active.add(42);
    }
  }
  if (chatting) {
    active.add(2);
    active.add(25);
    active.add(pick('retellingChoices', options.retelling));
  }
  if (kind === 'script') active.add(pick('perspectiveChoices', options.perspective));

  const prompts = config.prompts
    .filter((entry) => active.has(entry.row))
    .map((entry) => {
      if (entry.marker) return entry;
      const content = entry.content
        .replace(/^<<<\|catgodml\|(?:menu|radio):[^\r\n]*?>>>[ \t]*(?:\r?\n)?/u, '')
        .replace(/\s*<<<\|catgodml\|registerThinkingStep:[^\r\n]*?>>>/u, '');
      if (entry.row !== 41) return { ...entry, content };
      const length = chatting ? [150, 500] : [350, 1100];
      const target = options.length === 'short' ? length[0] : length[1];
      return { ...entry, content: `正文篇幅以约 ${target} 字为参考，遵守本次任务的输出协议。` };
    });
  const identifiers = new Map(prompts.map(({ row, identifier }) => [row, identifier]));
  return {
    id: BUILTIN_PROMPT_ID,
    name: config.name,
    prompts,
    prompt_order: [
      {
        character_id: 100001,
        order: config.order
          .filter((row) => identifiers.has(row))
          .map((row) => ({
            identifier: identifiers.get(row),
            enabled: true,
          })),
      },
    ],
    ...(tools && storytelling ? { extensions: { wanxiang: { builtinOutputTool: true } } } : {}),
  };
}

export async function createBuiltinPromptSource(readText, settings, fixture) {
  const config = JSON.parse(await readText(BUILTIN_PROMPT_PATH));
  return {
    attribution: config.attribution,
    async get(kind) {
      const profile = settings.get(kind);
      if (fixture && !profile.promptPresetId.endsWith('-default')) {
        return (await fixture(profile.promptPresetId)).preset;
      }
      if (kind === 'summary') return JSON.parse(await readText('framework/summary-default.json'));
      const options = settings.promptOptions();
      return builtinPrompt(
        config,
        kind,
        options,
        options.toolTransport && profile.promptProcessing === 'merge_tools',
      );
    },
  };
}
