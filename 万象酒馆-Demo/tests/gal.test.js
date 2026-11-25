import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  galRequestInput,
  parseGalText,
  galTypingDelay,
  paginateGalBeat,
  resolveGalActor,
  nextGalStage,
  selectedGalStage,
  authoredGalContent,
  readableGalText,
  galActorsForBeats,
} from '../src/gal.js';
import { restoreGenerationOptions } from '../src/generation-options.js';
import { galInstruction } from '../src/ai/gal-prompt.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { galNpcPortrait, GAL_NPC_PORTRAITS } from '../src/content/gal-npc-portraits.js';
import { generationInput } from '../src/ai/pipeline/prompts.js';
import { storyRingReward } from '../src/emblem-progression.js';
import { officialCharacter } from '../src/ai/library.js';
import { galSceneLines, linesProse } from '../src/adventure/patches.js';
import { resolveGalBackdrop } from '../src/app/gal-backdrop.js';

test('city chat waits for returned environment text and has no city image backdrop', () => {
  for (const sceneId of ['city-center', 'crown-gateward', 'eternal-city']) {
    assert.equal(resolveGalBackdrop({ sceneId }), null);
    const invitation = resolveGalBackdrop({ sceneId, invitationMode: true });
    assert.ok(invitation?.image);
    assert.equal(invitation.environment, null);
  }
});

test('Gal NPCs use matching western-fantasy stand-ins and gendered anonymous shadows', () => {
  assert.equal(
    galNpcPortrait({ name: '卫兵', appearance: '成年女性，城门守卫，短发' }),
    GAL_NPC_PORTRAITS.guardWoman,
  );
  assert.equal(
    galNpcPortrait({ name: '村民', appearance: '男性村民，穿着粗布衣服' }),
    GAL_NPC_PORTRAITS.villagerMan,
  );
  assert.equal(
    galNpcPortrait({ name: '小女孩', appearance: '年约九岁的女童' }),
    GAL_NPC_PORTRAITS.girl,
  );
  assert.equal(
    galNpcPortrait({ name: '陌生男子', appearance: '成年男性，身份与来历无人知晓' }),
    GAL_NPC_PORTRAITS.shadowMan,
  );
  assert.equal(
    galNpcPortrait({ name: '陌生女子', appearance: '成年女性，身份与来历无人知晓' }),
    GAL_NPC_PORTRAITS.shadowWoman,
  );
  assert.equal(
    galNpcPortrait({ id: 'unknown-npc', name: '未具名来客' }),
    galNpcPortrait({ id: 'unknown-npc', name: '未具名来客' }),
  );
});

test('NPC markers bind real assets and stable identities without changing official portraits', () => {
  const actors = [
    { id: 'edith', name: '伊蒂丝', sprite: 'edith.png' },
    { id: 'archive-npc', name: '灰伯', npc: true, sprite: GAL_NPC_PORTRAITS.shadowWoman },
  ];
  const source = structuredClone(actors);
  const text =
    '【对白:npc:灰伯|scholar】你好。【对白:npc:女卫兵|guardWoman】请进。' +
    '【对白:npc:女卫兵|guardMan】慢走。【对白:npc:伊蒂丝|boy】别急。' +
    '【对白:npc:陌生人|https://bad.example/a.png】停下。';
  const beats = parseGalText(text);
  const cast = galActorsForBeats(actors, beats);
  assert.equal(resolveGalActor(beats[0].speaker, cast).sprite, GAL_NPC_PORTRAITS.scholar);
  assert.equal(resolveGalActor(beats[1].speaker, cast).sprite, GAL_NPC_PORTRAITS.guardWoman);
  assert.equal(resolveGalActor(beats[2].speaker, cast).sprite, GAL_NPC_PORTRAITS.guardWoman);
  assert.equal(resolveGalActor(beats[3].speaker, cast).sprite, 'edith.png');
  assert.equal(resolveGalActor(beats[4].speaker, cast).sprite, GAL_NPC_PORTRAITS.shadowMan);
  assert.equal(cast.filter((actor) => actor.name === '女卫兵').length, 1);
  assert.equal(resolveGalActor('npc:女卫兵', cast).name, '女卫兵');
  assert.equal(readableGalText(text, cast).includes('|'), false);
  assert.deepEqual(actors, source);
  assert.equal(
    galNpcPortrait({ galPortrait: 'girl', appearance: '男守卫' }),
    GAL_NPC_PORTRAITS.girl,
  );
});

test('Gal reaction suffixes keep the speaker, NPC portrait and readable text independent', () => {
  const { id, setting } = officialCharacter('edith');
  const actors = [{ id, name: setting.name }];
  const beat = { type: 'dialogue', speaker: id, text: 'A。' };
  const tagged = `【对白:${id}|hop:alert】A。`;
  assert.deepEqual(parseGalText(tagged), [{ ...beat, emotion: 'hop:alert' }]);
  for (const suffix of ['', '|unknown', '|constructor', '|hop|shake', '|unknown|hop'])
    assert.deepEqual(parseGalText(`【对白:${id}${suffix}】A。`), [beat]);
  assert.equal(readableGalText(tagged, actors), `${setting.name}：A。`);
  assert.deepEqual(parseGalText('A。'), [{ type: 'narration', speaker: '', text: 'A。' }]);
  const npc = `npc:${setting.name}|guardWoman`;
  assert.deepEqual(parseGalText(`【登场:${npc}|hop】【对白:${npc}|sweat】A。`), [
    { type: 'enter', speaker: npc, text: '' },
    { ...beat, speaker: npc, emotion: 'sweat' },
  ]);
  assert.deepEqual(parseGalText(`【对白:${npc}|unknown】A。`), [{ ...beat, speaker: npc }]);
  assert.equal(linesProse(galSceneLines(tagged, 'fixture')), tagged);
});

test('Gal cadence accelerates energetic cues and pauses after hesitation punctuation', () => {
  const normal = galTypingDelay(undefined, '，', 'A');
  const slow = galTypingDelay('sweat', 'A', '。');
  assert.equal(normal, 20);
  assert.equal(galTypingDelay('unknown', '，', 'A'), normal);
  assert(galTypingDelay('hop', '，', 'A') < normal);
  assert(slow > normal);
  assert.equal(galTypingDelay('sweat', '，', 'A'), slow + 300);
  assert.equal(galTypingDelay('sweat', '—', '—'), slow);
  assert.equal(galTypingDelay('sweat', '—', 'A'), slow + 300);
});
test('script requests bind ring scenes to the same fifth-node schedule as actual rewards', async () => {
  const edith = officialCharacter('edith');
  const party = [{ id: edith.id, name: edith.setting.name }];
  for (const [map, sequence, boss] of [
    ['mill', 0, 'millVoleAlpha'],
    ['ruins', 2, 'bossGate'],
    ['forest', 3, 'moonEye'],
  ]) {
    const route = { map, sequence, seed: 1 };
    const input = generationInput('script', {
      brief: '沿官方大纲继续',
      boss,
      party,
      exploration: route,
    });
    assert.deepEqual(input.request.storyRingReward, storyRingReward(route));
    assert.equal(input.request.storyRingReward.encounter, 4);
    assert.equal(input.request.storyRingInstruction, undefined);
    const { buildTriggerIds } = await import('../src/ai/worldbook-triggers.js');
    assert(
      buildTriggerIds('script', {
        brief: '沿官方大纲继续',
        boss,
        party,
        exploration: route,
      }).includes('script:story-ring'),
    );
  }
  assert.equal(storyRingReward({ map: 'ruins', sequence: 0 }), null);
  assert.equal(storyRingReward({ map: 'ruins', sequence: 1 }), null);
  assert.equal(storyRingReward({ map: 'ruins', sequence: 5 }), null);
  assert.equal(storyRingReward({ map: 'forest', sequence: 1 }), null);
  assert.equal(storyRingReward({ map: 'ruins', sequence: 2, world: {} }), null);
  const route = { map: 'ruins', sequence: 2, seed: 1 };
  const reward = storyRingReward(route);
  const request = generationInput('script', {
    brief: '再次探索回廊',
    boss: 'bossGate',
    party,
    exploration: route,
    ownedEmblems: [reward.id],
  });
  assert.equal(request.request.storyRingReward, null);
});

test('selection fixes the first two identities without substituting missing portraits', () => {
  const actors = [
    { id: 'a', sprite: 'a.png' },
    { id: 'b', sprite: 'b.png' },
    { id: 'c', sprite: 'c.png' },
    { id: 'missing' },
  ];
  assert.deepEqual(selectedGalStage(['a'], actors), ['a']);
  assert.deepEqual(selectedGalStage(['a', 'b', 'c'], actors), ['a', 'b']);
  assert.deepEqual(selectedGalStage(['b', 'c'], actors), ['b', 'c']);
  assert.deepEqual(selectedGalStage(['missing', 'b', 'c'], actors), ['b']);
  assert.deepEqual(selectedGalStage(['missing'], actors), []);
});

test('Gal is the only narrative presentation and ignores retired mode preferences', () => {
  const options = restoreGenerationOptions({ developerMode: false, galMode: false });
  assert(!('galMode' in options));
  const source = { brief: '出发' };
  for (const kind of ['script', 'chat', 'quick-chat']) {
    assert.equal(galRequestInput(kind, source, options).presentationMode, 'gal');
    assert.equal(galRequestInput(kind, source, {}).presentationMode, 'gal');
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

test('short pages keep consecutive speakers and narration intact at natural pauses', () => {
  for (const type of ['dialogue', 'narration']) {
    const text = '门还没有开。先听一听。这次别急。我们还有时间。';
    const beat = { type, speaker: type === 'dialogue' ? 'edith' : '', text };
    const pages = paginateGalBeat(beat, 155);
    assert.deepEqual(
      pages.map((page) => page.text),
      ['门还没有开。先听一听。', '这次别急。我们还有时间。'],
    );
    assert(pages.every((page) => page.type === type && page.speaker === beat.speaker));
    assert.equal(pages.map((page) => page.text).join(''), text);
  }
  const quoted = { type: 'narration', text: '她低声说：“先等等？！”随后合上书。\n门外传来脚步。' };
  const quotedPages = paginateGalBeat(quoted, 155);
  assert.equal(quotedPages[0].text, '她低声说：“先等等？！”随后合上书。');
  assert.equal(quotedPages.map((page) => page.text).join(''), quoted.text);
  const long = { type: 'dialogue', speaker: 'edith', text: '沿着石阶慢慢走'.repeat(22) + '。”' };
  const desktop = paginateGalBeat(long, 155);
  const mobile = paginateGalBeat(long, 76);
  assert(desktop.every((page) => Array.from(page.text).length <= 64));
  assert(mobile.every((page) => Array.from(page.text).length <= 48));
  assert(mobile.length > desktop.length);
  for (const pages of [desktop, mobile]) {
    assert.equal(pages.map((page) => page.text).join(''), long.text);
    assert(pages.every((page) => !/^[。”]/u.test(page.text)));
  }
  const repeated = parseGalText('【对白:edith】先等等。【对白:edith】再听听。【旁白】灯熄了。');
  assert.deepEqual(
    repeated.map((beat) => beat.speaker),
    ['edith', 'edith', ''],
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

    helperStorage: { get: () => ({}) },
    countTokens: (text) => Math.ceil(text.length / 3),

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
    assert(off.messages.some((message) => message.content.includes('【Gal叙事格式')));
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
    assert(instruction.includes('普通交谈和连续接话沿用无后缀写法'));
    assert(instruction.includes('【Gal共同写作要求】'));
    assert(instruction.includes(headings[kind]));
    for (const [otherKind, heading] of Object.entries(headings)) {
      if (otherKind !== kind) assert(!instruction.includes(heading));
    }
    assert(on.messages.some((message) => message.content.includes(headings[kind])));
    for (const request of [off, on]) {
      const finalText = request.messages.map((message) => message.content).join('\n');
      assert(finalText.includes('【对白:npc:姓名|立绘编号】'));
      assert(finalText.includes('女守卫·玛莎'));
      assert.equal(finalText.split('【Gal对白反应】').length - 1, 1);
      assert.equal(finalText.split('【多人队伍聚焦与反端水】').length - 1, 1);
      assert.match(finalText, /单幕也只选最契合局势的 2～3 名/);
      assert.match(finalText, /非焦点队友不参与本幕对白，也不要在开场新登场/);
      assert.match(finalText, /一件事深谈 3～5 个来回/);
      assert(finalText.includes('【对白:npc:姓名|立绘编号|hop】'));
      assert(!finalText.includes('【对白:npc:城门女卫兵|guardWoman】'));
      assert(finalText.includes('老年男性学者'));
      assert(finalText.includes('不在剧本或聊天正文写戒指的具体游戏效果'));
    }
  }
});
