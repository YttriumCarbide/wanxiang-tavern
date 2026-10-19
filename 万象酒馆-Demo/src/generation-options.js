export const GENERATION_OPTIONS_KEY = 'wanxiang.generation-options.v1';

export function restoreGenerationOptions(value) {
  return {
    protagonistApi: value?.developerMode !== true || value?.protagonistApi !== false,
    scriptApi: value?.developerMode !== true || value?.scriptApi !== false,
    developerMode: value?.developerMode === true,
    allowRetreat: value?.allowRetreat === true,
    editArchives: value?.editArchives === true,
  };
}

/** Only an explicit developer override may bypass a real generation request. */
export function generationEnabled(options, key) {
  return options.developerMode !== true || options[key] !== false;
}

export const developerOption = (options, key) =>
  options.developerMode === true && options[key] === true;
