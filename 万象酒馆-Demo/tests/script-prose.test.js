import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scriptProseReport, scriptRepetitionWarnings } from '../src/ai/script-prose.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { readGenerationResult } from '../server/generation-result.mjs';
import { scriptFixture } from './fixtures/ai.js';
import { newLibrary } from '../src/ai/library.js';
import { generationInput } from '../server/prompts.mjs';

test('new trips carry only bounded previous summaries and copied prose is a nonblocking diagnostic', () => {
  const library = newLibrary();
  const context = generationInput('script', {
    brief: '继续旅程',
    boss: 'bossGate',
    chapter: 1,
    visitId: 'new-visit',
    party: library.characters.map((entry) => ({ id: entry.id, name: entry.setting.name })),
    previousStories: [{ title: '旧篇', synopsis: '旧事件', story: ['不得发送整篇作为示例'] }],
  });
  assert.equal(context.request.visitId, 'new-visit');
  assert.deepEqual(context.request.previousStories, [{ title: '旧篇', tags: [] }]);
  assert(!JSON.stringify(context).includes('不得发送整篇作为示例'));
  assert(!JSON.stringify(context.encounters).includes('旧渠装置相关的零件'));
  assert(!JSON.stringify(context.encounters).includes('寻找封印核心'));
  const original = {
    schemaVersion: 3,
    title: '旧篇',
    story: Array.from({ length: 5 }, (_, i) => `第${i}段。`),
  };
  const copy = { ...original, title: '新标题', story: original.story.map((text) => '\n' + text) };
  assert.equal(scriptRepetitionWarnings(copy, [original])[0].path, 'output.repetition');
  copy.story[0] = '一个新的开篇。';
  assert.deepEqual(scriptRepetitionWarnings(copy, [original]), []);
});

test('script count includes only visible authored prose once, counts Unicode and excludes metadata', () => {
  const report = scriptProseReport({
    title: '不计标题',
    setting: '不计设定',
    nextHook: { setting: '不计未来' },
    opening: '甲 乙\n',
    scenes: [
      {
        opening: '丙。',
        before: [{ speaker: 'narrator', action: '丁𠮷', dialogue: '戊', text: '重复编译正文' }],
        after: [],
        interlude: [],
      },
    ],
  });
  assert.equal(report.characters, 7);
  assert.equal(report.target, 1500);
});

test('fresh scripts accept a plot with one speaking hero and keep the whole chapter near 1500 characters', () => {
  const ids = newLibrary().party;
  const raw = scriptFixture(ids);
  const result = readGenerationResult('script', JSON.stringify(raw), {
    party: ids.map((id) => ({ id })),
  });
  const report = result.diagnostic.prose;
  assert(report.characters >= report.minimum && report.characters <= report.maximum);
  assert.deepEqual(
    [
      ...new Set(
        raw.scenes
          .flatMap((scene) => [...scene.before, ...scene.after, ...scene.interlude])
          .map((line) => line.speaker)
          .filter((id) => id !== 'narrator'),
      ),
    ],
    [ids[0]],
  );
  assert.equal(scriptProseReport(result.entry).characters, report.characters);
});

test('prose outside the prompt target is counted without rejecting or rewriting a well-formed script', () => {
  const ids = newLibrary().party;
  for (const oversized of [false, true]) {
    const raw = scriptFixture(ids);
    raw.opening = '进入旧渠。';
    for (const scene of raw.scenes) {
      scene.opening = '检查闸门。';
      scene.before = oversized
        ? Array.from({ length: 3 }, () => ({
            speaker: 'narrator',
            action: '水'.repeat(300),
            dialogue: '',
          }))
        : [];
      scene.after = [];
      scene.interlude = [];
    }
    const text = JSON.stringify(raw);
    const { entry, diagnostic } = readGenerationResult('script', text, {
      party: ids.map((id) => ({ id })),
    });
    assert.equal(diagnostic.stage, 'complete');
    assert.deepEqual(diagnostic.issues, []);
    assert.equal(diagnostic.rawText, text);
    assert.equal(diagnostic.candidateText, text);
    assert.equal(diagnostic.prose.characters > 1800, oversized);
    assert.equal(entry.opening, raw.opening);
    // Restore old saved chapters independently of the current generation budget.
    assert.doesNotThrow(() => normalizeScript(raw, 'old-saved-book', ids));
  }
});

test('the new example counts five prose blocks once and excludes the metadata layer', async () => {
  const raw = JSON.parse(
    await readFile(new URL('../prompts/worldbook/script-example.json', import.meta.url), 'utf8'),
  );
  const { entry, diagnostic } = readGenerationResult('script', JSON.stringify(raw), { party: [] });
  assert.deepEqual(entry.story, raw.story);
  assert.equal(
    diagnostic.prose.characters,
    Array.from(raw.story.join('').replace(/\s/gu, '')).length,
  );
  assert(!entry.data && !entry.scenes && !entry.opening);
});
