import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  galEnabled,
  galRequestInput,
  parseGalText,
  paginateGalBeat,
  resolveGalActor,
  nextGalStage,
  authoredGalContent,
  readableGalText,
} from '../src/gal.js';
import { restoreGenerationOptions } from '../src/generation-options.js';
import { galInstruction } from '../src/ai/gal-prompt.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { runRegexTasks } from '../server/regex-runtime.mjs';

test('Gal mode is an explicit persistent developer choice and affects only narrative APIs', () => {
  assert.equal(galEnabled(restoreGenerationOptions(null)), false);
  assert.equal(galEnabled(restoreGenerationOptions({ galMode: true })), false);
  const options = restoreGenerationOptions({ developerMode: true, galMode: true });
  assert(galEnabled(restoreGenerationOptions(JSON.parse(JSON.stringify(options)))));
  const source = { brief: '出发' };
  for (const kind of ['script', 'chat', 'quick-chat']) {
    assert.equal(galRequestInput(kind, source, options).presentationMode, 'gal');
    assert.equal(galRequestInput(kind, source, {}).presentationMode, 'prose');
  }
  for (const kind of ['character', 'map', 'creation', 'summary'])
    assert.equal(galRequestInput(kind, source, options), source);
  assert.deepEqual(source, { brief: '出发' });
});

test('long novel prose survives local pagination, Unicode and marker parsing without invented attribution', () => {
  const prose = '木门轻响，星光照着旧木地板。\n她说：“我们出发吧。”🌙'.repeat(90);
  const beats = parseGalText(prose);
  assert.equal(beats.length, 1);
  assert.equal(beats[0].type, 'narration');
  const pages = paginateGalBeat(beats[0], 76);
  assert.equal(pages.map((page) => page.text).join(''), prose);
  assert(pages.every((page) => Array.from(page.text).length <= 76));
  const manyLines = { ...beats[0], text: '一句话。\n'.repeat(18) };
  const linePages = paginateGalBeat(manyLines, 76);
  assert(linePages.every((page) => page.text.split('\n').length <= 3));
  assert.equal(linePages.map((page) => page.text).join(''), manyLines.text);
  const structured = parseGalText(
    '【登场:edith】【旁白】门开了。【对白:edith】你好。【退场:edith】【对白:user】再见。【对白:npc:商人】慢走。【清场】',
  );
  assert.deepEqual(
    structured.map((beat) => beat.type),
    ['enter', 'narration', 'dialogue', 'exit', 'dialogue', 'dialogue', 'clear'],
  );
  assert.equal(structured[5].speaker, 'npc:商人');
  assert.equal(
    readableGalText('【对白:edith】你好。', [{ id: 'edith', name: '伊蒂丝' }]),
    '伊蒂丝：你好。',
  );
  assert.equal(
    readableGalText('【旁白】门开了。【对白:伊蒂丝】你好。'),
    '门开了。\n\n伊蒂丝：你好。',
  );
});

test('authored tutorial action prose is narration while known quoted speech keeps its speaker', () => {
  const result = authoredGalContent([
    { speaker: '潘多拉', text: '她抱紧小熊。“主人。”她抬头。“欢迎回来。”' },
  ]);
  assert.deepEqual(
    result.map((line) => line.speaker),
    ['旁白', '潘多拉', '旁白', '潘多拉'],
  );
  assert.deepEqual(
    result.map((line) => line.text),
    ['她抱紧小熊。', '主人。', '她抬头。', '欢迎回来。'],
  );
  assert.deepEqual(authoredGalContent([{ speaker: '旁白', text: '她说：“这是过去。”' }]), [
    { speaker: '旁白', text: '她说：“这是过去。”' },
  ]);
});

test('stage retains actors during narration, handles explicit exit and has safe user/NPC fallbacks', () => {
  const actors = [
    { id: 'hero', name: '旅人', user: true },
    { id: 'edith', name: '伊蒂丝', sprite: 'edith.png' },
    { id: 'pandora', name: '潘多拉', sprite: 'pandora.png' },
  ];
  const edith = resolveGalActor('edith', actors, 'hero');
  const stage = nextGalStage([], { type: 'dialogue' }, edith);
  assert.deepEqual(stage, ['edith']);
  assert.deepEqual(nextGalStage(stage, { type: 'narration' }, null), stage);
  assert.deepEqual(
    nextGalStage(stage, { type: 'dialogue' }, resolveGalActor('user', actors, 'hero')),
    stage,
  );
  assert.deepEqual(
    nextGalStage(stage, { type: 'dialogue' }, resolveGalActor('npc:陌生人', actors, 'hero')),
    stage,
  );
  assert.equal(resolveGalActor('npc:陌生人', actors).name, '陌生人');
  assert.deepEqual(nextGalStage(stage, { type: 'exit', speaker: 'edith' }, edith), []);
  assert.deepEqual(nextGalStage(stage, { type: 'clear' }, null), []);
  assert.deepEqual(nextGalStage(stage, { type: 'dialogue' }, actors[2]), ['edith', 'pandora']);
});

test('actual shared pipeline opts script and chat into Gal without changing the JSON or metadata contracts', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/gal-pipeline-'));
  const worlds = await createWorldbookStore(directory);
  const profile = { maxTokens: 32768, contextSize: 400000, promptProcessing: 'merge_tools' };
  const pipeline = createAiPipeline({
    worlds,
    settings: { get: () => profile },
    regexStore: { get: () => [] },
    helperStorage: { get: () => ({}) },
    countTokens: (text) => Math.ceil(text.length / 3),
    runRegexTasks,
    readText: (file) => readFile(new URL('../prompts/' + file, import.meta.url), 'utf8'),
  });
  const source = normalizePromptPreset({
    prompts: [{ identifier: 'taskContext', marker: true }],
  }).preset;
  const party = [{ id: 'hero', name: '旅人', worldbook: '谨慎的旅人' }];
  for (const kind of ['script', 'chat', 'quick-chat']) {
    const input =
      kind === 'script'
        ? { brief: '探索遗迹', party, boss: 'bossGate' }
        : { text: '喝茶', place: 'bar', characters: party, selected: ['hero'], history: [] };
    const off = await pipeline.buildRequest(kind, input, source);
    const on = await pipeline.buildRequest(kind, { ...input, presentationMode: 'gal' }, source);
    assert(!off.messages.some((message) => message.content.includes('【Gal叙事格式')));
    assert(on.messages.some((message) => message.content.includes('【Gal叙事格式')));
    assert.equal(on.transport.format, off.transport.format);
    assert.equal(on.transport.tag, off.transport.tag);
    const headings = {
      script: '【Gal剧本文风】',
      chat: '【Gal酒馆聊天文风】',
      'quick-chat': '【Gal局内闲聊文风】',
    };
    const instruction = galInstruction({ ...input, presentationMode: 'gal' }, kind);
    assert(instruction.includes('不增加第二套JSON'));
    assert(instruction.includes('【Gal共同写作要求】'));
    assert(instruction.includes(headings[kind]));
    for (const [otherKind, heading] of Object.entries(headings)) {
      if (otherKind !== kind) assert(!instruction.includes(heading));
    }
    assert(on.messages.some((message) => message.content.includes(headings[kind])));
  }
});
