export const GENERATION_OPTIONS_KEY = 'wanxiang.generation-options.v1';

export function restoreGenerationOptions(value) {
  const skipAiGeneration = skippingAi(value);
  return {
    skipAiGeneration,
    protagonistApi: !skipAiGeneration,
    scriptApi: !skipAiGeneration,
    developerMode: value?.developerMode === true,
    allowRetreat: value?.allowRetreat === true,
    editArchives: value?.editArchives === true,
    galMode: value?.galMode === true,
  };
}

/** Only an explicit developer override may bypass a real generation request. */
export function skippingAi(options) {
  if (options?.developerMode !== true) return false;
  if (typeof options.skipAiGeneration === 'boolean') return options.skipAiGeneration;
  return options.protagonistApi === false || options.scriptApi === false;
}

export function generationEnabled(options) {
  return !skippingAi(options);
}

export const developerOption = (options, key) =>
  options.developerMode === true && options[key] === true;
