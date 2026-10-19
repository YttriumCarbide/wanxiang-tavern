import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { memoryHash, memoryHistory } from '../src/memory.js';
import { summaryPlan, summaryRequest } from '../server/summary-request.mjs';

test('restoring uses one portrait snapshot while preserving saved data and the random sequence', () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const random = Math.random;
  let reads = 0,
    rolls = 0;
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem() {
          reads++;
          return JSON.stringify({ 'official-morrow': 'data:image/png;base64,dGVzdA==' });
        },
      },
    });
    Math.random = () => {
      rolls++;
      return 0.5;
    };
    const input = newLibrary();
    input.characters[1].setting.edited = true;
    input.characters[1].setting.worldbook += '\n保留自定义人物设定。';
    const original = structuredClone(input);
    reads = 0;
    rolls = 0;
    const restored = restoreLibrary(input);
    assert.deepEqual(restored, original);
    assert.deepEqual(input, original);
    assert.equal(reads, 1);
    assert.equal(rolls, 7, 'unused library seeds must not shift subsequent random results');
    assert.equal(
      restored.characters.find((entry) => entry.id === 'official-morrow').combat.customPortrait,
      'data:image/png;base64,dGVzdA==',
    );
  } finally {
    Math.random = random;
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else delete globalThis.localStorage;
  }
});

test('history projection preserves duplicate speaker matching, stale local summaries and last valid matches', () => {
  const text = '灰伯向主角介绍了遗迹的入口。';
  const summary = (value) => ({ text: value, sourceHash: memoryHash(text) });
  let irrelevantReads = 0;
  const library = {
    history: [
      {
        lines: [
          { speaker: '旁白', text, summary: summary('旧摘要') },
          { speaker: '灰伯', text, summary: summary('其他说话人摘要') },
          { speaker: '旁白', text, summary: summary('最新有效摘要') },
          { speaker: '旁白', text, summary: { text: '失效摘要', sourceHash: 'invalid' } },
          {
            speaker: '旁白',
            text: '无关经历',
            summary: {
              text: '无关摘要',
              get sourceHash() {
                irrelevantReads++;
                return memoryHash('无关经历');
              },
            },
          },
        ],
      },
    ],
  };
  const records = [
    {
      title: '初探',
      confirmedEvents: [
        { speaker: '旁白', text },
        { speaker: '灰伯', text },
        { speaker: '旁白', text, summary: { text: '失效的本地摘要', sourceHash: 'invalid' } },
        { speaker: '旁白', text, summary: summary('本条独立摘要') },
      ],
      unresolvedHook: null,
    },
  ];
  const original = structuredClone(records);
  const result = memoryHistory(library, records);
  assert.deepEqual(
    result[0].confirmedEvents.map((line) => line.text),
    [
      '【已确认摘要】最新有效摘要',
      '【已确认摘要】其他说话人摘要',
      text,
      '【已确认摘要】本条独立摘要',
    ],
  );
  assert.deepEqual(records, original);
  assert.equal(irrelevantReads, 0);
});

test('every planned batch keeps the exact final request token estimate across both flush boundaries', async () => {
  const items = Array.from({ length: 37 }, (_, index) => ({
    id: `chat:${index}`,
    kind: 'chat',
    label: `第${index}层`,
    text: `第${index}条记录\n${'引号"、换行、中文与星光✨'.repeat(10 + (index % 5))}`,
  }));
  for (const profile of [
    {
      maxTokens: 2000,
      tokenField: 'max_tokens',
      contextSize: 5000,
      promptProcessing: 'merge_tools',
    },
    { maxTokens: 8192, tokenField: 'max_tokens', contextSize: 131072, promptProcessing: 'strict' },
    { maxTokens: 8192, tokenField: 'none', contextSize: 1500, promptProcessing: 'merge_tools' },
  ]) {
    const plan = await summaryPlan({ items }, profile, (text) => text.length);
    assert.deepEqual(
      plan.batches.flatMap((batch) => batch.ids),
      items.map((item) => item.id),
    );
    for (const batch of plan.batches) {
      const request = await summaryRequest(
        { items: items.filter((item) => batch.ids.includes(item.id)) },
        profile,
        (text) => text.length,
      );
      assert.equal(batch.inputEstimate, request.tokens.inputEstimate);
    }
    assert.equal(
      plan.inputEstimate,
      plan.batches.reduce((sum, batch) => sum + batch.inputEstimate, 0),
    );
  }
});
