import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { generationRequest } from '../src/ai/pipeline/prompts.js';
import { applyRegexScripts, presetRegexScripts } from '../src/ai/regex.js';
import { presetProcessing } from '../src/ai/pipeline/preset-processing.js';

test('supplied community preset imports, expands active portable layers and applies text regexes without executing HTML', async (t) => {
  let raw;
  try {
    raw = JSON.parse(
      await readFile(new URL('../.runtime/tests/input/community-ds.json', import.meta.url), 'utf8'),
    );
  } catch {
    t.skip('No explicitly supplied community preset');
    return;
  }
  const { preset, warnings } = normalizePromptPreset(raw, 'community-ds-review');
  assert.equal(preset.prompts.length, raw.prompts.length);
  const before = JSON.stringify(raw);
  const request = await generationRequest(
    'character',
    { brief: '测试成年旅人', party: [] },
    preset,
    {
      readText: (file) => readFile(new URL('../prompts/' + file, import.meta.url), 'utf8'),
      regexScripts: presetRegexScripts(preset),
      runRegexTasks: async (scripts, tasks) =>
        tasks.map((task) => applyRegexScripts(task.text, scripts, task.placement, task.options)),
      presetProcessing: presetProcessing(preset),
    },
  );
  assert(request.messages.some((message) => message.content.includes('测试成年旅人')));
  assert(
    !request.messages.some((message) => /\{\{(?:getvar|setvar|if|trim)::/i.test(message.content)),
  );
  assert.equal(JSON.stringify(raw), before, 'Imported preset remains unchanged');
  t.diagnostic(
    JSON.stringify({
      layers: preset.prompts.length,
      enabled: preset.prompt_order[0].order.filter((entry) => entry.enabled).length,
      regex: presetRegexScripts(preset).length,
      warnings,
    }),
  );
});
