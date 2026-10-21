import test from 'node:test';
import assert from 'node:assert/strict';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { archiveMilestone, settleEther, relevantArchives } from '../src/archives.js';
import { applyRelationshipActions, resetRelationshipGains } from '../src/relationships.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { readGenerationResult } from '../server/generation-result.mjs';
import { newEncounter, preview, makeAction, advance } from '../src/engine.js';
import { compileRoster, restoreLibrary } from '../src/ai/library.js';
import { tutorialSpec } from '../src/content/tutorial.js';
import { tutorialCommitIssue, recordTutorialResult } from '../src/tutorial-progress.js';
import {
  newExploration,
  availableExplorations,
  explorationPreview,
  completeExploration,
} from '../src/exploration.js';
import { mergeFutureScript } from '../src/chat.js';
import { resourceBars, statusIcons } from '../src/ui.js';
import { chatResponse } from '../server/chat-response.mjs';

const document = () => ({
  schemaVersion: 4,
  story: Array.from({ length: 5 }, (_, index) => `第${index + 1}程已经抵达。`),
  data: {
    title: '回廊旧事',
    tags: ['灰伯'],
    npcs: [
      {
        name: '灰伯',
        appearance: '他穿着洗得褪色的灰色外衣，光秃的头顶映着晨光，手里始终握着旧扫帚。',
        history: '他在遗迹外围清扫了许多年，见过旅人来去，也记得回廊还未坍塌时的模样。',
        encounter: 0,
      },
    ],
    items: [{ name: '回廊残晶', description: '青灰石缝里留下的微光晶体', value: 17, encounter: 2 }],
    nextHook: { setting: '' },
  },
});

test('new script schema rejects party NPCs and incomplete archive fields; reached entries merge and settle once', () => {
  const library = newCampaign(defaultProtagonist());
  const raw = document();
  const input = { party: [{ id: 'player', name: '青缘' }] };
  const { entry: book } = readGenerationResult('script', JSON.stringify(raw), input);
  assert.equal(book.schemaVersion, 4);
  assert(!('map' in book.nextHook));
  const bad = structuredClone(raw);
  bad.data.npcs[0].name = '青缘';
  assert.throws(() => readGenerationResult('script', JSON.stringify(bad), input));
  bad.data.npcs[0] = { ...raw.data.npcs[0], history: '过短' };
  assert.throws(() => readGenerationResult('script', JSON.stringify(bad), input));
  const record = {
    runId: 'first',
    lines: [{ stage: 'before', text: '灰伯带队走过回廊。' }],
    tags: ['灰伯'],
  };
  book.party = input.party;
  archiveMilestone(library, book, record, 0);
  archiveMilestone(library, book, record, 0);
  assert.equal(library.archives.npcs.length, 1);
  assert.equal(library.archives.items.length, 0);
  archiveMilestone(library, book, record, 2);
  assert.equal(settleEther(library, record.runId), 17);
  assert.equal(settleEther(library, record.runId), 0);
  assert.equal(library.inventory.ether, 17);
  const second = { runId: 'second' };
  archiveMilestone(library, book, second, 0);
  assert.equal(library.archives.npcs.length, 1);
  assert.equal(library.archives.npcs[0].sources.length, 2);
  library.history.push(record);
  assert.equal(relevantArchives(library, '再去找灰伯').npcs.length, 1);
  assert.equal(relevantArchives(library, '无关话题').stories.length, 0);
  const restored = restoreLibrary(library);
  assert.deepEqual(restored.archives, library.archives);
  assert.equal(restored.inventory.ether, 17);
});

test('future rewrite retains reached loot and NPCs and never mutates the source book', () => {
  const original = normalizeScript(document(), 'original');
  const replacement = normalizeScript(document(), 'new');
  replacement.story.fill('新的未发生正文');
  replacement.items = [{ name: '新碎片', description: '一枚碎片', value: 3, encounter: 4 }];
  replacement.npcs[0].history = '被改写的经历';
  const snapshot = structuredClone(original);
  const merged = mergeFutureScript(original, replacement, 2);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(merged.story.slice(0, 3), original.story.slice(0, 3));
  assert.deepEqual(merged.npcs, original.npcs);
  assert.equal(merged.items.length, 2);
  assert.equal(merged.items[0].value, 17);
  assert.equal(merged.story[3], '新的未发生正文');
});

test('affection counts only three positive replies per companion until departure and excludes player', async () => {
  const library = newCampaign(defaultProtagonist());
  const player = library.campaign.protagonistId;
  const actions = {
    affection: [
      { id: 'official-edith', delta: 3 },
      { id: 'official-edith', delta: 3 },
      { id: player, delta: 5 },
    ],
    agreeToAdventure: ['official-edith'],
  };
  for (let index = 0; index < 5; index++) applyRelationshipActions(library, actions);
  assert.deepEqual(library.relationships['official-edith'], {
    affection: 9,
    gains: 3,
    agreed: true,
  });
  assert(!library.relationships[player]);
  resetRelationshipGains(library);
  applyRelationshipActions(library, actions);
  assert.equal(library.relationships['official-edith'].affection, 12);
  const response = await chatResponse(
    'chat',
    '<wanxiang_chat>好，我们一起去。</wanxiang_chat><wanxiang_actions>{"affection":[{"id":"official-edith","delta":2}],"agreeToAdventure":["official-edith"]}</wanxiang_actions>',
    [],
    { characters: [{ id: 'official-edith' }] },
  );
  assert.equal(response.content, '好，我们一起去。');
  assert.equal(response.actions.affection[0].delta, 2);
  await assert.rejects(chatResponse('chat', '没有正文边界', []));
});

test('tutorial requires actual intended vulnerability event and shield lives beside resources, outside buffs', () => {
  const library = newCampaign(defaultProtagonist());
  const state = newEncounter(tutorialSpec(1), null, 1, compileRoster(library));
  const opening = preview(state, []);
  assert.equal(tutorialCommitIssue(library, state, opening), '');
  const normal = advance(opening);
  assert(tutorialCommitIssue(library, normal, preview(normal, [])).includes('易伤'));
  const result = preview(normal, [makeAction(normal, 'lyria', 'attack', 'pebble', 0)]);
  assert(result.valid);
  assert.equal(tutorialCommitIssue(library, normal, result), '');
  recordTutorialResult(library.campaign, false, result);
  assert(library.campaign.tasks.vulnerable);
  const unit = state.units.aegis;
  const markup = resourceBars(unit, { ...unit, block: unit.block + 8 });
  assert(markup.includes('resource-shield forecast'));
  assert(!statusIcons(state, 'aegis').includes('data-buff="shield"'));
});

test('map preview retains entrance and unlocks exactly the next number, including old branches', () => {
  const routes = newExploration(42);
  const route = routes.ruins;
  const first = route.frontier[0];
  for (let index = 0; index < 6; index++) {
    assert.equal(availableExplorations(route).length, 1);
    assert.equal(availableExplorations(route)[0].sequence, index);
    assert.equal(explorationPreview(route, 'ruins')[0].id, first.id);
    completeExploration(routes, availableExplorations(route)[0]);
  }
  route.frontier.push({ ...first, sequence: 19, id: 'old-branch' });
  assert.equal(availableExplorations(route).length, 1);
  assert.equal(availableExplorations(route)[0].sequence, 6);
  assert.equal(explorationPreview(route, 'ruins').length, 7);
  assert.equal(completeExploration(routes, route.frontier[1]), null);
});
