import { rebornPreprocess } from './reborn-processing.js';

export function createPresetOutputProcessor(processing, onText = () => {}) {
  let state = {},
    hold = '',
    result = '';
  function feed(text, final = false) {
    const transformed =
      processing?.output === 'reborn-2.4'
        ? rebornPreprocess({ buffer: hold + text, final, state })
        : { output: text, hold: '', state };
    hold = transformed.hold;
    state = transformed.state;
    result += transformed.output;
    if (result.length + hold.length > 2000000) throw Error('预处理后的正文超过容量');
    if (transformed.output) onText(transformed.output);
    return transformed.output;
  }
  return {
    feed,
    finish: () => {
      feed('', true);
      return result;
    },
  };
}
