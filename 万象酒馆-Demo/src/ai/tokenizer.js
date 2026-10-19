import { Tiktoken } from 'js-tiktoken/lite';
import o200k from 'js-tiktoken/ranks/o200k_base';
import { parseCharacterOutput } from './contracts.js';

/** Count only the final plain setting, never JSON punctuation or combat numbers. */
export function createWorldbookCounter() {
  const tokenizer = new Tiktoken(o200k);
  const cache = new Map();
  let characters = 0;
  return (text) => {
    if (cache.has(text)) return cache.get(text);
    const count = tokenizer.encode(text, [], []).length;
    // Chat windows repeatedly count unchanged history. Bound both retained text and entries.
    if (text.length <= 100000) {
      cache.set(text, count);
      characters += text.length;
      while (characters > 1000000 || cache.size > 512) {
        const oldest = cache.keys().next().value;
        characters -= oldest.length;
        cache.delete(oldest);
      }
    }
    return count;
  };
}

/** Only validate the character document format; prose targets belong to editable prompts. */
export function createCharacterReader() {
  return parseCharacterOutput;
}
