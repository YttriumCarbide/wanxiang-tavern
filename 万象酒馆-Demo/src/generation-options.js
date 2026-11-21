export const GENERATION_OPTIONS_KEY = 'wanxiang.generation-options.v1';

export function restoreGenerationOptions(value) {
  const skipAiGeneration = skippingAi(value);
  const quickTestOverlords =
    typeof value?.quickTestOverlords === 'boolean'
      ? value.quickTestOverlords
      : value?.quickTest === true || value?.quickTestApep === true;
  return {
    skipAiGeneration,
    protagonistApi: !skipAiGeneration,
    scriptApi: !skipAiGeneration,
    skipOverlandApi: value?.skipOverlandApi === true,
    developerMode: value?.developerMode === true,
    allowRetreat: value?.allowRetreat === true,
    editArchives: value?.editArchives === true,
    unlockAllCodex: value?.unlockAllCodex === true,
    quickTestOverlords,
    quickTest: quickTestOverlords,
    quickTestApep: quickTestOverlords,
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

export function quickTestOverlordsEnabled(options) {
  if (options?.developerMode !== true) return false;
  return typeof options.quickTestOverlords === 'boolean'
    ? options.quickTestOverlords
    : options.quickTest === true || options.quickTestApep === true;
}
