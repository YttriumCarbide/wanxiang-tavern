import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureTestScript } from '../src/content/generation-mode.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { scriptOutputSchema, scriptInputSchema } from '../src/ai/script-schema.js';
import { checkOutputSchema } from '../src/ai/schema-check.js';
import {
  normalizeAdventureDefinition,
  normalizeSceneOverview,
} from '../src/adventure/definition.js';
import {
  createAdventureState,
  confirmEventChoice,
  adventureTurnContext,
  acceptAdventureReply,
  adventureReady,
  lockBoss,
} from '../src/adventure/state.js';
import { applyBossPatches, linesProse } from '../src/adventure/patches.js';
import { newLibrary, restoreLibrary, compileRoster } from '../src/ai/library.js';
import { newExpedition, beginEncounter, completeAdventureNode } from '../src/expedition.js';
import { pendingDungeonMemories, pendingMemories, applyMemorySummaries } from '../src/memory.js';
import { adventureSnapshot, validAdventureSnapshot } from '../src/adventure/snapshot.js';
import { createCheckpoint } from '../src/storage/checkpoint.js';
import { chatResponse } from '../src/ai/pipeline/chat-response.js';
import { adventureChatRules } from '../src/ai/adventure-prompt.js';
import { upgradeAdventureWorldbook } from '../src/ai/adventure-upgrade.js';
import { tutorialCommitIssue } from '../src/tutorial-progress.js';
import { chatRequest } from '../src/ai/pipeline/chat-request.js';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { normalizeWorldSettings } from '../src/ai/worldbook.js';
import { tavernPresetFixture } from './fixtures/ai.js';
import { readGenerationResult } from '../server/generation-result.mjs';
import { RP_CHAPTERS, rpChapterDirection } from '../src/content/rp-outlines.js';
import { ALL_OFFICIAL_DUNGEONS } from '../src/content/official-dungeons.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';

test('RP raw replies retain protocol tags for review while redacting the connection secret', async () => {
  const f = fixture();
  f.expedition.index = 3;
  const turn = adventureTurnContext(f.expedition, f.book, '看看四周');
  const content =
    '<wanxiang_chat>【旁白】远处传来鸟鸣。</wanxiang_chat><wanxiang_adventure>' +
    JSON.stringify({ episodeId: turn.episodeId, revision: 0, tasks: [], patches: [] }) +
    '</wanxiang_adventure>';
  const pipeline = createAiPipeline({
    worlds: { async commit() {} },
    regexStore: { get: () => [] },
    runRegexTasks: async (_scripts, tasks) => tasks.map(({ text }) => ({ text, changes: [] })),
  });
  const result = await pipeline.acceptResult(
    {
      kind: 'quick-chat',
      input: { text: '看看四周', characters: [], adventure: turn },
      profile: { apiKey: 'fixture-secret' },
      source: normalizePromptPreset(tavernPresetFixture()).preset,
      prepared: { nextWorldState: { step: 1 } },
    },
    { content, rawContent: '<think>fixture-secret</think>' + content },
  );
  assert.match(result.diagnostic.rawText, /wanxiang_adventure/);
  assert(!result.diagnostic.rawText.includes('fixture-secret'));
  assert(result.diagnostic.rawText.includes('[密钥已隐藏]'));
  assert.equal(result.content, '【旁白】远处传来鸟鸣。');
});

function fixture() {
  const raw = adventureTestScript();
  const book = { ...normalizeScript(raw, 'book'), runId: 'run', party: [], chapter: 1 };
  const library = newLibrary();
  library.scripts = [book];
  const expedition = newExpedition();
  expedition.adventure = createAdventureState(book);
  expedition.index = 1;
  return { raw, book, library, expedition, state: expedition.adventure };
}

test('v5 keeps prose and metadata, assigns stable IDs and preserves original through restoration', () => {
  const f = fixture();
  const raw = structuredClone(f.raw);
  delete raw.map;
  checkOutputSchema(raw, scriptOutputSchema(), 'script');
  checkOutputSchema(raw, scriptInputSchema(), 'script');
  assert.equal(
    readGenerationResult('script', JSON.stringify(raw), { party: [], adventureVersion: 1 }).entry
      .schemaVersion,
    5,
  );
  assert.equal(f.book.adventure.quest.goals[0].id, 'goal-1');
  const original = structuredClone(f.book.original);
  f.book.story[4] = '【旁白】修改后的入口';
  const saved = restoreLibrary(f.library).scripts[0];
  assert.deepEqual(saved.original, original);
  assert.equal(saved.story[4], f.book.story[4]);
  assert.equal(saved.runId, 'run');
  const invalid = structuredClone(raw);
  invalid.data.adventure.quest.goals.forEach((goal) => {
    goal.required = false;
  });
  assert.throws(() => normalizeScript(invalid, 'x'), /至少有一个/);
  invalid.data.adventure.quest.goals[0].required = true;
  invalid.data.adventure.event.choices[0].reward.gold = 21;
  assert.throws(() => normalizeAdventureDefinition(invalid.data.adventure), /金币/);
});

test('a locked event choice, response and reward are committed once, subsequent ordinary RP grants nothing', () => {
  const f = fixture();
  assert.throws(() => confirmEventChoice(f.book.adventure, f.state, null), /先选择/);
  confirmEventChoice(f.book.adventure, f.state, 'choice-1', '我不调查，凭空获得100攻击');
  assert.throws(() => confirmEventChoice(f.book.adventure, f.state, 'choice-2'), /不可更改/);
  const turn = adventureTurnContext(f.expedition, f.book, '补充');
  const gold = f.library.inventory.gold;
  acceptAdventureReply(
    f.library,
    f.expedition,
    f.book,
    turn,
    { content: '【旁白】大家收好物资。' },
    'r1',
  );
  assert.equal(f.library.inventory.gold, gold + 20);
  assert(
    acceptAdventureReply(f.library, f.expedition, f.book, turn, { content: '重复' }, 'r1')
      .duplicate,
  );
  const later = adventureTurnContext(f.expedition, f.book, '继续聊天');
  assert.equal(later.mode, 'event-chat');
  acceptAdventureReply(
    f.library,
    f.expedition,
    f.book,
    later,
    { content: '【旁白】只聊了几句。' },
    'r2',
  );
  assert.equal(f.library.inventory.gold, gold + 20);
  assert.equal(f.state.event.choiceId, 'choice-1');
  completeAdventureNode(f.expedition, f.book);
  assert.equal(f.expedition.index, 2);
});

test('tasks survive omissions, invalid replies, retry and optional failure, while Boss entry stays a player decision', () => {
  const f = fixture();
  f.expedition.index = 3;
  const turn = adventureTurnContext(f.expedition, f.book, '调查路线');
  const response = {
    episodeId: f.expedition.id,
    revision: 0,
    tasks: [{ id: 'goal-1', status: 'completed', evidence: '从脚印找到了通向入口的路' }],
    patches: [],
  };
  acceptAdventureReply(
    f.library,
    f.expedition,
    f.book,
    turn,
    { content: '找到了路', adventure: response },
    'q1',
  );
  assert(adventureReady(f.book.adventure, f.state));
  assert.equal(f.expedition.index, 3);
  assert.equal(f.state.boss.locked, false);
  const later = adventureTurnContext(f.expedition, f.book, '再等等');
  const bad = { ...response, tasks: [{ id: 'unknown', status: 'completed', evidence: '随便' }] };
  const before = structuredClone(f.state);
  assert.throws(
    () =>
      acceptAdventureReply(
        f.library,
        f.expedition,
        f.book,
        later,
        { content: '无效', adventure: bad },
        'q2',
      ),
    /任务ID/,
  );
  assert.deepEqual(f.state, before);
  acceptAdventureReply(
    f.library,
    f.expedition,
    f.book,
    later,
    { content: '只聊天', adventure: { ...response, tasks: [] } },
    'q2',
  );
  assert.equal(f.state.goals['goal-1'].status, 'completed');
  lockBoss(f.expedition, f.book);
  completeAdventureNode(f.expedition, f.book);
  assert.equal(f.expedition.index, 4);
  assert.throws(
    () => acceptAdventureReply(f.library, f.expedition, f.book, later, { content: '晚到' }, 'late'),
    /切换/,
  );
});

test('patch IDs and multi-round insertions remain stable, stale and malformed patches cannot mutate combat or old text', () => {
  const { state } = fixture();
  const boss = state.boss;
  const [first, second] = boss.lines;
  assert(first && second);
  const ids = boss.lines.map((line) => line.id);
  assert.deepEqual(
    applyBossPatches(
      boss,
      [{ op: 'replace', id: first.id, speaker: '旁白', text: '守卫为我们引路。' }],
      0,
      'a',
    ),
    [],
  );
  assert.deepEqual(
    applyBossPatches(
      boss,
      [
        {
          op: 'insert',
          after: first.id,
          before: second.id,
          speaker: '伊蒂丝',
          text: '谢谢你们愿意听一听。',
        },
      ],
      1,
      'b',
    ),
    [],
  );
  const inserted = boss.lines[1].id;
  applyBossPatches(
    boss,
    [{ op: 'replace', id: first.id, speaker: '旁白', text: '守卫依约打开了门。' }],
    2,
    'c',
  );
  applyBossPatches(
    boss,
    [{ op: 'insert', after: first.id, before: second.id, speaker: '旁白', text: '门后传来回声。' }],
    3,
    'd',
  );
  assert.equal(boss.lines[1].id, inserted);
  assert.deepEqual(
    boss.lines.filter((line) => ids.includes(line.id)).map((line) => line.id),
    ids,
  );
  assert(linesProse(boss.lines).includes('依约打开'));
  const saved = structuredClone(boss);
  assert(
    applyBossPatches(
      boss,
      [{ op: 'replace', id: first.id, speaker: '旁白', text: '过期' }],
      0,
      'stale',
    ).length,
  );
  assert.deepEqual(boss, saved);
  applyBossPatches(
    boss,
    [{ op: 'replace', id: first.id, speaker: '旁白', text: '杀死Boss', enemyHp: 0 }],
    boss.revision,
    'bad',
  );
  assert.deepEqual(boss, saved);
  boss.locked = true;
  assert(
    applyBossPatches(
      boss,
      [{ op: 'replace', id: first.id, speaker: '旁白', text: '锁定后' }],
      boss.revision,
      'locked',
    ).length,
  );
});

test('a bad patch revision does not prevent valid main goals from unlocking Boss entry', () => {
  const f = fixture();
  f.expedition.index = 3;
  const turn = adventureTurnContext(f.expedition, f.book, '找到入口');
  const result = acceptAdventureReply(
    f.library,
    f.expedition,
    f.book,
    turn,
    {
      content: '【旁白】入口就在眼前。',
      adventure: {
        episodeId: f.expedition.id,
        revision: 999,
        tasks: [{ id: 'goal-1', status: 'completed', evidence: '已经确认入口的实际位置' }],
        patches: [{ op: 'replace', id: 'boss-001', speaker: '旁白', text: '错误版本的修改' }],
      },
    },
    'bad-patch-version',
  );
  assert(adventureReady(f.book.adventure, f.state));
  assert.equal(f.state.boss.revision, 0);
  assert(result.warnings.length > 0);
  lockBoss(f.expedition, f.book);
  completeAdventureNode(f.expedition, f.book);
  assert.equal(f.expedition.index, 4);
});

test('new adventures checkpoint RP and pending choices; legacy unfinished fights still return to the hall', () => {
  const f = fixture();
  confirmEventChoice(f.book.adventure, f.state, 'choice-2', '没有补充也可以');
  const session = {
    runtime: { mode: 'event' },
    journey: { expedition: f.expedition },
    ai: { activeScript: f.book, library: f.library, storyView: {}, chat: { quick: [] } },
    battle: { playing: false, state: beginEncounter(newExpedition()), plan: [], history: [] },
  };
  const snapshot = adventureSnapshot(session);
  assert(validAdventureSnapshot(snapshot));
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  const checkpoint = createCheckpoint({ session, storage, apiClient: { staticMode: true } });
  checkpoint.saveNow();
  assert.equal(checkpoint.pending().journey.expedition.adventure.event.choiceId, 'choice-2');
  snapshot.journey.expedition.adventure.goals['goal-1'].status = 'malformed';
  assert.equal(validAdventureSnapshot(snapshot), false);
  snapshot.activeScript.adventure.quest.goals = null;
  assert.equal(validAdventureSnapshot(snapshot), false);
  checkpoint.dispose();
});

test('three archived actual records produce independent atomic summaries; unplayed and incomplete stories never count', () => {
  const library = newLibrary();
  for (let index = 0; index < 4; index++)
    library.history.push({
      runId: `r${index}`,
      title: `独立旅程${index}`,
      adventureVersion: 1,
      complete: index < 3,
      lines: [{ speaker: '旁白', text: `真实经历${index}` }],
    });
  assert.equal(pendingDungeonMemories(library).length, 3);
  assert.equal(pendingMemories(library).length, 0);
  const batch = pendingDungeonMemories(library).slice(0, 3);
  assert.throws(
    () => applyMemorySummaries(library, [], batch, [{ id: batch[0].id, summary: '遗漏' }]),
    /数量/,
  );
  assert(library.history.every((record) => !record.summary));
  applyMemorySummaries(
    library,
    [],
    batch,
    batch.map((item, index) => ({ id: item.id, summary: `这仅是第${index}次经历` })),
  );
  assert.equal(pendingDungeonMemories(library).length, 0);
  assert.deepEqual(
    library.history.slice(0, 3).map((record) => record.summary.text),
    ['这仅是第0次经历', '这仅是第1次经历', '这仅是第2次经历'],
  );
});

test('RP protocol separates data from prose and rejects malformed task data without treating it as dialogue', async () => {
  const f = fixture();
  f.expedition.index = 3;
  const turn = adventureTurnContext(f.expedition, f.book, '调查');
  const json = JSON.stringify({ episodeId: turn.episodeId, revision: 0, tasks: [], patches: [] });
  const regex = async (_scripts, tasks) => tasks.map(({ text }) => ({ text }));
  const response = await chatResponse(
    'quick-chat',
    `<wanxiang_chat>【旁白】你听见了回声。</wanxiang_chat><wanxiang_adventure>${json}</wanxiang_adventure>`,
    [],
    { adventure: turn },
    regex,
  );
  assert.equal(response.content, '【旁白】你听见了回声。');
  assert(response.adventure);
  const sample =
    '<wanxiang_adventure>{"episodeId":"示例副本","revision":0,"tasks":[],"patches":[]}</wanxiang_adventure>';
  const final = `<wanxiang_chat>【旁白】你听见了回声。</wanxiang_chat><wanxiang_adventure>${json}</wanxiang_adventure>`;
  const noisy = `<think>${sample}<analysis>${sample}</analysis></think>\n\`\`\`example\n${sample}\n\`\`\`\n${sample}${final}`;
  assert.deepEqual(
    (await chatResponse('quick-chat', noisy, [], { adventure: turn }, regex)).adventure,
    response.adventure,
  );
  await assert.rejects(
    chatResponse(
      'quick-chat',
      final + `<wanxiang_adventure>${json}</wanxiang_adventure>`,
      [],
      { adventure: turn },
      regex,
    ),
    /多组/,
  );
  await assert.rejects(
    chatResponse(
      'quick-chat',
      '<wanxiang_chat>正文</wanxiang_chat>',
      [],
      { adventure: turn },
      regex,
    ),
    /缺少任务/,
  );
  await assert.rejects(
    chatResponse(
      'quick-chat',
      '<wanxiang_chat>正文</wanxiang_chat><wanxiang_adventure>{broken}</wanxiang_adventure>',
      [],
      { adventure: turn },
      regex,
    ),
    /任务数据无效/,
  );
  const rules = adventureChatRules(turn);
  assert(rules.includes('未来') && rules.includes('不改') && rules.includes('patches'));
  assert(!adventureChatRules({ mode: 'event' }).includes('wanxiang_adventure'));
});

test('all thirty official chapter directions leave methods open and overview survives old and new saves', () => {
  assert.equal(Object.values(RP_CHAPTERS).flat().length, 30);
  for (const map of Object.keys(RP_CHAPTERS)) {
    assert.equal(RP_CHAPTERS[map].length, 6);
    assert.match(rpChapterDirection({ map, sequence: 0 }), /第四节点RP改编/);
  }
  const f = fixture();
  assert.match(f.book.adventure.quest.overview[0].detail, /岗亭/);
  assert.equal(f.book.adventure.quest.goals[0].title, '找到继续前进的路');
  delete f.raw.data.adventure.quest.overview;
  assert.deepEqual(
    normalizeScript(f.raw, 'legacy').adventure.quest.overview,
    normalizeSceneOverview(f.raw.data.adventure.quest.description),
  );
  const legacyGoal = f.raw.data.adventure.quest.goals[0];
  legacyGoal.title = legacyGoal.objective;
  legacyGoal.description = '旧版任务说明';
  delete legacyGoal.objective;
  assert.equal(
    normalizeScript(f.raw, 'legacy-goals').adventure.quest.goals[0].title,
    legacyGoal.title,
  );
  const previous = {
    entries: Object.fromEntries(
      ALL_OFFICIAL_DUNGEONS.map((chapter, uid) => [
        uid,
        {
          uid,
          content: chapter.outline,
          extensions: { wanxiang: { officialDungeonId: chapter.id } },
        },
      ]),
    ),
    extensions: { wanxiang: { adventureRevision: 47 } },
  };
  const upgraded = upgradeAdventureWorldbook(previous);
  assert.equal(
    Object.values(upgraded.entries).filter((entry) => entry.content.includes('第四节点RP改编'))
      .length,
    18,
  );
  assert.deepEqual(upgradeAdventureWorldbook(upgraded), upgraded);
});

test('new tutorial elite retains vulnerable, slow and multiple-intent gates in the same battle', () => {
  const library = newLibrary();
  library.campaign = {
    protagonistId: library.party[0],
    completed: false,
    adventureTutorial: true,
    tasks: { vulnerable: false },
  };
  const expedition = newExpedition('bossGate', compileRoster(library), {
    ...library.exploration.ruins.frontier[0],
    tutorial: true,
  });
  const f = fixture();
  expedition.adventure = f.state;
  expedition.index = 2;
  const state = beginEncounter(expedition);
  assert.deepEqual(state.enemyIds.filter(Boolean), ['pebble', 'warden']);
  const forecast = { final: structuredClone(state), events: [] };
  assert.equal(tutorialCommitIssue(library, state, forecast), '');
  state.phase = 'plan';
  assert(tutorialCommitIssue(library, state, forecast).includes('易伤'));
  library.campaign.tasks.vulnerable = true;
  assert(tutorialCommitIssue(library, state, forecast).includes('迟缓'));
});

test('worldbook migration retires only owned output rules, retains user lore and is idempotent', () => {
  const source = {
    entries: {
      0: { content: '我的世界观' },
      1: { content: '旧格式', extensions: { wanxiang: { generationRule: 'script-output' } } },
    },
  };
  const migrated = upgradeAdventureWorldbook(source, '新格式');
  assert.equal(migrated.entries[0].content, '我的世界观');
  assert.equal(migrated.entries[1].content, '新格式');
  assert.equal(migrated.extensions.wanxiang.retiredPromptArchive[0].entry.content, '旧格式');
  assert.deepEqual(upgradeAdventureWorldbook(migrated, '不再覆盖'), migrated);
});

test('RP prompt carries task state and latest Boss IDs while sending actual conversation history once', async () => {
  const f = fixture();
  f.expedition.index = 3;
  const history = [{ role: 'assistant', content: '这是一条唯一的真实RP历史x731' }];
  const turn = adventureTurnContext(f.expedition, f.book, '继续调查');
  turn.history = history;
  const request = await chatRequest(
    'quick-chat',
    { text: '继续调查', characters: [], selected: [], history, adventure: turn },
    normalizePromptPreset(tavernPresetFixture()).preset,
    {
      profile: { maxTokens: 1000, contextSize: 131072, promptProcessing: 'none' },
      worldInfo: { books: [], settings: normalizeWorldSettings({}), state: {} },
      regexScripts: [],
      countTokens: (text) => String(text).length,
      runRegexTasks: async (_scripts, tasks) => tasks.map(({ text }) => ({ text })),
    },
  );
  const text = request.messages.map((message) => message.content).join('\n');
  assert.equal(text.split(history[0].content).length - 1, 1);
  assert(text.includes('boss-001') && text.includes('goal-1') && text.includes('未来预定'));
  assert.equal(turn.history, history);
  const boundary = request.messages.at(-1).content;
  assert.match(boundary, /任务结果输出边界/);
  assert(
    boundary.includes(
      JSON.stringify({
        episodeId: turn.episodeId,
        revision: turn.boss.revision,
        tasks: [],
        patches: [],
      }),
    ),
  );
  assert.match(boundary, /不能省略数据块/);
});
