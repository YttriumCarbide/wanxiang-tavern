import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import {
  pendingMemories,
  applyMemorySummaries,
  memoryChat,
  memoryHistory,
  previousDungeonMemory,
  scriptMemory,
  dungeonMemoryText,
  memoryHash,
  pendingAdventureMemories,
  withInvitationMemories,
  journeyMemories,
} from '../src/memory.js';
import { chatInput } from '../src/ai/pipeline/chat-request.js';
import { journeyMemoryBook } from '../src/ai/journey-memory-worldbook.js';
import { scanWorldbooks } from '../src/ai/worldbook-scan.js';

test('completed dungeon summaries replace split Gal originals in every history projection', () => {
  const record = {
    runId: 'split-gal',
    title: '五节点记录',
    complete: true,
    lines: [
      { speaker: '旁白', encounter: 0, text: '原文第一小段。' },
      { speaker: '伊蒂丝', encounter: 0, text: '原文第二小段。' },
    ],
  };
  record.summary = {
    text: '只发送这一份总结。',
    sourceHash: memoryHash(dungeonMemoryText(record)),
  };
  const library = { history: [record] };
  const book = {
    schemaVersion: 5,
    runId: record.runId,
    story: ['【旁白】原文第一小段。【对白:伊蒂丝】原文第二小段。', '其他原文'],
  };
  for (const projection of [
    previousDungeonMemory(library),
    scriptMemory(library, book),
    JSON.stringify(memoryHistory(library, [record])),
  ]) {
    assert(projection.includes(record.summary.text));
    assert(!projection.includes('原文'));
  }
  record.lines[0].text = '编辑后的全文';
  assert(previousDungeonMemory(library).includes('编辑后的全文'));
  assert(!previousDungeonMemory(library).includes(record.summary.text));
});
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { createAiApi } from '../server/ai-api.mjs';
import { summaryPlan, summaryRequest, summaryResponse } from '../server/summary-request.mjs';

test('a completed overland story is sent in full until summarized and then uses five recall words and its ID', () => {
  const library = newLibrary();
  library.history.push({
    runId: 'bridge-trip',
    kind: 'overland',
    title: '桥边的约定',
    complete: true,
    place: '旧石桥',
    people: ['伊蒂丝'],
    lines: [{ speaker: '旁白', text: '伊蒂丝在旧石桥拾到残页，约定明天归还。' }],
  });
  assert.equal(journeyMemories(library)[0].recent, true);
  const snapshot = pendingAdventureMemories(library);
  const keywords = ['旧石桥', '伊蒂丝', '拾到残页', '残页', '明天归还'];
  const results = summaryResponse(
    JSON.stringify({
      items: [{ id: 'overland:bridge-trip', summary: '伊蒂丝约好归还残页。', keywords }],
    }),
    snapshot,
  );
  applyMemorySummaries(library, [], snapshot, results);
  const saved = restoreLibrary(JSON.parse(JSON.stringify(library)));
  const memories = journeyMemories(saved);
  const book = journeyMemoryBook({ journeyMemories: memories });
  const [entry] = Object.values(book.entries);
  assert.deepEqual(entry.key, ['overland:bridge-trip', ...keywords]);
  const scan = (text) =>
    scanWorldbooks({
      books: [book],
      settings: {},
      countTokens: (value) => value.length,
      context: { kind: 'chat', messages: [{ role: 'user', content: text }] },
    }).entries;
  assert.equal(scan('天气怎样？').length, 0);
  assert.match(scan('还记得旧石桥吗？')[0].content, /约好归还残页/u);
});

test('one whole invitation joins the dungeon batch and follows its actor through a save', () => {
  const library = newLibrary();
  library.history = ['first', 'second'].map((runId) => ({
    runId,
    complete: true,
    adventureVersion: 1,
    lines: [{ text: '已经走完的旅程。' }],
  }));
  library.invitationHistory.push({
    id: 'tea',
    member: 'official-libet',
    title: '在广场试奏',
    text: '莉贝特打开琴盒。\n玩家：我在这里听。\n莉贝特拉完一段旋律。',
    recap: '莉贝特在广场试奏。',
  });
  const libet = { id: 'official-libet', name: '莉贝特', worldbook: '琴手' };
  const edith = { id: 'official-edith', name: '伊蒂丝', worldbook: '同行者' };
  const payload = { place: 'table', selected: [edith.id], characters: [libet, edith] };
  const input = (owner, text) =>
    chatInput('chat', withInvitationMemories('chat', { ...payload, text }, owner));
  assert.match(input(library, '莉贝特也来吗？').characters[0].invitationMemory, /广场试奏/);
  assert(!input(library, '今天聊点别的。').characters.some((member) => member.invitationMemory));
  const batch = pendingAdventureMemories(library);
  assert.deepEqual(
    batch.map((item) => item.kind),
    ['dungeon', 'dungeon', 'invitation'],
  );
  assert.equal(batch[2].text, library.invitationHistory[0].text);
  applyMemorySummaries(
    library,
    [],
    batch,
    batch.map(({ id }) => ({ id, summary: `摘要 ${id}` })),
  );
  const loaded = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.deepEqual(pendingAdventureMemories(loaded), []);
  assert.match(
    input(loaded, '莉贝特也来吗？').characters[0].invitationMemory,
    /摘要 invitation:tea/,
  );
  assert.equal(loaded.invitationHistory[0].text, batch[2].text);
  const [partyMember] = withInvitationMemories('script', { party: [libet] }, loaded).party;
  assert.match(partyMember.invitationMemory, /摘要 invitation:tea/);
  assert.equal(libet.invitationMemory, undefined);
});

test('manual summaries preserve each original layer and replace only confirmed context after acceptance', () => {
  const library = newLibrary();
  library.tavernChat = [
    { role: 'user', content: '我给潘多拉倒水，并答应明天再来。' },
    { role: 'assistant', content: '<p>潘多拉接过水杯。</p>' },
  ];
  library.history = [
    {
      runId: 'run-one',
      title: '遗迹初探',
      complete: false,
      lines: [
        { speaker: '旁白', text: '主角和灰伯交流，随后抵达回廊。', encounter: 0, stage: 'before' },
      ],
    },
  ];
  library.scripts = [{ story: ['未展示的未来剧情禁止发送'] }];
  const quick = [{ role: 'user', content: '当心前方。' }];
  const original = structuredClone(library);
  const items = pendingMemories(library, quick);
  assert.equal(items.length, 2);
  assert(!JSON.stringify(items).includes('未展示的未来剧情'));
  assert.equal(
    items[0].text,
    '玩家：我给潘多拉倒水，并答应明天再来。\n\nAI回应：<p>潘多拉接过水杯。</p>',
  );
  assert(
    !items.some((item) => item.kind === 'quick'),
    'Unanswered player messages are not summarized',
  );
  assert(items.every((item) => Object.keys(item).sort().join(',') === 'id,kind,label,text'));
  const response = items.map((item) => ({ id: item.id, summary: `摘要：${item.label}` }));
  assert.equal(memoryChat(library.tavernChat)[0].content, original.tavernChat[0].content);
  const rollback = applyMemorySummaries(library, quick, items, response);
  assert.equal(pendingMemories(library, quick).length, 0);
  assert.equal(library.tavernChat[0].content, original.tavernChat[0].content);
  assert.equal(library.history[0].lines[0].text, original.history[0].lines[0].text);
  assert.deepEqual(library.characters, original.characters);
  assert.deepEqual(library.inventory, original.inventory);
  assert(memoryChat(library.tavernChat)[0].content.startsWith('【已确认对话摘要】'));
  const copiedHistory = [
    {
      title: '遗迹初探',
      confirmedEvents: structuredClone(original.history[0].lines),
      unresolvedHook: null,
    },
  ];
  assert(
    memoryHistory(library, copiedHistory)[0].confirmedEvents[0].text.startsWith(
      '【已确认副本摘要】',
    ),
  );
  assert(!previousDungeonMemory(library).includes('未展示的未来剧情'));
  assert(previousDungeonMemory(library).includes('【已确认副本摘要】'));
  const book = {
    schemaVersion: 3,
    runId: 'run-one',
    story: [library.history[0].lines[0].text, '未经历的未来必须保留'],
  };
  const projected = scriptMemory(library, book);
  assert(projected.includes('【已确认副本摘要】'));
  assert(projected.includes('未经历的未来必须保留'));
  assert.equal(book.story[0], original.history[0].lines[0].text);
  rollback();
  assert.equal(pendingMemories(library, quick).length, 2);
  assert.deepEqual(library, original);
});

test('changed sources or incomplete IDs reject atomically; restored summaries survive without trimming old records', () => {
  const library = newLibrary();
  library.tavernChat = [
    { role: 'user', content: '原发言' },
    { role: 'assistant', content: '原回应' },
  ];
  library.history = Array.from({ length: 30 }, (_, index) => ({
    runId: `run-${index}`,
    title: `经历${index}`,
    lines: [{ speaker: '旁白', text: `实际经历${index}` }],
  }));
  const items = pendingMemories(library);
  const results = items.map((item) => ({ id: item.id, summary: `摘要${item.id}` }));
  assert.throws(() => applyMemorySummaries(library, [], items, results.slice(1)));
  library.tavernChat[1].content = '已经被编辑';
  assert.throws(() => applyMemorySummaries(library, [], items, results));
  assert(!library.tavernChat[0].summary);
  const fresh = pendingMemories(library);
  applyMemorySummaries(
    library,
    [],
    fresh,
    fresh.map((item) => ({ id: item.id, summary: '已确认的精简记忆' })),
  );
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(restored.history.length, 30);
  assert.deepEqual(restored.tavernChat, library.tavernChat);
  assert.equal(pendingMemories(restored).length, 0);
  restored.tavernChat[0].content = '之后修改的新原文';
  assert.equal(memoryChat(restored.tavernChat)[0].content, '之后修改的新原文');
  assert.equal(pendingMemories(restored).length, 1);
});

test('conversation summaries require an adjacent completed pair and are invalidated by edits to either side', () => {
  const library = newLibrary();
  library.tavernChat = [
    { role: 'assistant', content: '独立开场' },
    { role: 'user', content: '未获得回应' },
    { role: 'system', content: '换了位置', divider: true },
    { role: 'assistant', content: '另一处的开场' },
    { id: 'p', role: 'user', content: '你好' },
    { id: 'a', role: 'assistant', content: '欢迎回来' },
    { role: 'user', content: '尚未回复的草稿' },
  ];
  const source = pendingMemories(library);
  assert.equal(source.length, 1);
  applyMemorySummaries(library, [], source, [{ id: source[0].id, summary: '双方互相问候' }]);
  assert.equal(memoryChat(library.tavernChat).length, 6);
  assert.equal(library.tavernChat.length, 7);
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(pendingMemories(restored).length, 0);
  restored.tavernChat[5].content = '新的回答';
  assert.equal(pendingMemories(restored).length, 1);
  assert.equal(memoryChat(restored.tavernChat).length, 7);
});

test('summary planning splits every item within context and output budgets without importing extra material', async () => {
  const profile = {
    maxTokens: 2000,
    tokenField: 'max_tokens',
    contextSize: 5000,
    promptProcessing: 'merge_tools',
  };
  const items = Array.from({ length: 7 }, (_, index) => ({
    id: `chat:${index}`,
    kind: 'chat',
    label: `第${index}条`,
    text: '原文内容'.repeat(250),
  }));
  const plan = await summaryPlan({ items }, profile, (text) => text.length);
  assert(plan.batches.length > 1);
  assert.deepEqual(
    plan.batches.flatMap((batch) => batch.ids),
    items.map((item) => item.id),
  );
  for (const batch of plan.batches)
    assert(batch.inputEstimate + profile.maxTokens <= profile.contextSize);
  const request = await summaryRequest(
    { items: items.slice(0, 1), characters: '额外角色绝不能注入', world: '额外世界观绝不能注入' },
    profile,
    (text) => text.length,
  );
  assert(!JSON.stringify(request.messages).includes('绝不能注入'));
  assert.equal(request.messages.length, 2);
  assert(request.messages[0].content.includes('每个item独立总结'));
  assert.throws(() => summaryResponse('{"items":[]}', items));
  assert.throws(() =>
    summaryResponse(
      JSON.stringify({ items: items.map(() => ({ id: items[0].id, summary: '重复条目' })) }),
      items,
    ),
  );
  await assert.rejects(
    () =>
      summaryPlan({ items: [items[0]] }, { ...profile, contextSize: 1024 }, (text) => text.length),
    /超过上下文/u,
  );
});

test('real summary API uses its own connection and built-in prompt without presets, regex or worldbooks', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/summary-api-'));
  const calls = [];
  let omit = false;
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'prompts'),
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      const items = JSON.parse(payload.messages.at(-1).content).items;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: omit
                  ? []
                  : items.map((item) => ({ id: item.id, summary: `独立摘要${item.id}` })),
              }),
            },
          },
        ],
        usage: { prompt_tokens: 123, completion_tokens: 20 },
      });
    },
  });
  const server = createServer((req, res) => void api(req, res, req.url));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const post = async (route, data) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const connection = {
      kind: 'summary',
      baseUrl: 'http://127.0.0.1:9876/v1',
      model: 'memory-model',
      apiKey: 'summary-test-key',
      rememberKey: true,
      maxTokens: 2048,
      contextSize: 16000,
      tokenField: 'max_tokens',
    };
    assert.equal((await post('config', connection)).status, 200);
    const input = {
      items: [{ id: 'chat:0', kind: 'chat', label: '酒馆第1层', text: '玩家向潘多拉道谢。' }],
      world: '禁止额外世界观',
      characters: ['禁止额外人物'],
      history: ['禁止额外历史'],
    };
    const plan = await post('summary/plan', input);
    assert.equal(plan.status, 200);
    assert.equal(calls.length, 0, 'planning cannot call the paid upstream');
    const result = await post('generate/summary', input);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.deepEqual(result.data.items, [{ id: 'chat:0', summary: '独立摘要chat:0' }]);
    assert.equal(result.data.usage.input, 123);
    assert.equal(calls[0].model, 'memory-model');
    assert.equal(calls[0].stream, false);
    assert(!JSON.stringify(calls[0]).includes('禁止额外'));
    assert(!JSON.stringify(calls[0]).includes('wanxiang_json'));
    assert(!JSON.stringify(result.data).includes(connection.apiKey));
    omit = true;
    assert.equal((await post('generate/summary', input)).status, 400);
    assert.equal(calls.length, 2, 'failed summaries are not automatically retried');
    assert.equal(
      (await post('prompts/select', { kind: 'summary', id: 'chat-default' })).status,
      400,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
