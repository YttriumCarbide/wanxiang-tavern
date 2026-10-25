import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { encounterLevel, enemyGrowth, leveledIntent } from '../src/enemy-growth.js';
import {
  newExploration,
  explorationSpec,
  completeExploration,
  restoreExploration,
} from '../src/exploration.js';
import { newEncounter, intent } from '../src/engine.js';
import { newExpedition, beginEncounter, completeEncounter } from '../src/expedition.js';
import { recollectionScript, recollectionEther, canRecall } from '../src/recollections.js';
import { newLibrary } from '../src/ai/library.js';
import { claimBattleRewards } from '../src/rewards.js';
import { memoryHash, dungeonMemoryText } from '../src/memory.js';
import { characterGenerationPlan } from '../src/character-generation.js';
import { upgradeCharacterIdentity } from '../src/ai/character-identity-upgrade.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { createBrowserStores } from '../src/ai/browser-stores.js';
import { generationRequest } from '../server/prompts.mjs';

test('main six chapters grow slowly and endless/custom routes advance at every site', () => {
  assert.deepEqual(
    Array.from({ length: 9 }, (_, sequence) => encounterLevel({ map: 'ruins', sequence })),
    [1, 1, 2, 2, 3, 3, 4, 5, 6],
  );
  assert.deepEqual(
    Array.from({ length: 4 }, (_, sequence) =>
      encounterLevel({ map: 'forest', sequence, world: { id: 'custom' } }),
    ),
    [1, 2, 3, 4],
  );
  assert.equal(encounterLevel({ map: 'tide', sequence: 5 }), 11);
  for (let seed = 0; seed < 100; seed++) {
    const entry = { map: 'ruins', sequence: 8, seed };
    const growth = enemyGrowth(entry, 0, 'slime');
    assert.deepEqual(growth, enemyGrowth(entry, 0, 'slime'));
    assert(growth.level >= 5 && growth.level <= 7);
    assert(growth.bonus.hp >= 0 && growth.bonus.attack >= 0);
    assert(growth.bonus.hp + growth.bonus.attack > 0);
  }
});

test('enemy growth drives authoritative hp, intention and damage without changing original definitions', () => {
  const entry = { ...newExploration().tide.frontier[0], sequence: 20 };
  const spec = explorationSpec(entry, 0);
  const state = newEncounter(spec);
  const before = structuredClone(spec);
  for (const id of state.enemyIds) {
    assert(state.units[id].level >= spec.level - 1);
    assert(state.units[id].growth.hp > 0);
    const move = intent(state, id);
    assert(move.effects.every((effect) => effect.type !== 'damage' || effect.value > 0));
  }
  assert.deepEqual(spec, before);
  assert.equal(
    newEncounter({ ...spec, growthEntry: { ...spec.growthEntry, tutorial: true } }).units[
      spec.enemyIds[0]
    ].level,
    1,
  );
});

test('grown attack descriptions retain self protection and do not grow support or status damage', () => {
  const move = {
    name: '护身攻击',
    text: '旧说明',
    selfShield: 3,
    selfHeal: 4,
    effects: [
      { type: 'damage', value: 8 },
      { type: 'damage', value: 2, flat: true },
      { type: 'buff', buff: 'weak', value: 2 },
    ],
  };
  const grown = leveledIntent(move, 5);
  assert.deepEqual(
    grown.effects.map((effect) => effect.value),
    [13, 2, 2],
  );
  assert.match(grown.text, /13伤害/);
  assert.match(grown.text, /自身获得3护盾/);
  assert.match(grown.text, /自身回复4hp/);
  assert.equal(move.effects[0].value, 8);
  const support = { effects: [{ type: 'heal', value: 10, target: 'allAllies' }], text: '恢复同伴' };
  assert.equal(leveledIntent(support, 5), support);
});

function recalledLibrary() {
  const library = newLibrary();
  const entry = library.exploration.ruins.frontier[0];
  const encounters = Array.from({ length: 5 }, (_, index) => explorationSpec(entry, index));
  completeExploration(library.exploration, entry, {
    title: '第一次旅程',
    runId: 'first-run',
    scriptId: 'first-book',
    encounters,
    ether: 37,
  });
  library.scripts.push({
    id: 'first-book',
    title: '第一次旅程',
    story: Array.from({ length: 5 }, (_, i) => `首次正文${i}`),
    exploration: entry,
  });
  library.history.push({
    runId: 'first-run',
    scriptId: 'first-book',
    nodeId: entry.id,
    title: '第一次旅程',
    complete: true,
    lines: [{ encounter: 0, speaker: '旁白', text: '第一段原文', stage: 'before' }],
  });
  return { library, entry: { ...library.exploration.ruins.cleared[0], replay: true } };
}

test('recollection keeps source, uses summary before original, and missing prose is explicit', () => {
  const { library, entry } = recalledLibrary();
  assert(canRecall(library, entry));
  const before = structuredClone(library);
  assert.equal(recollectionScript(library, entry).story[0], '首次正文0');
  assert.equal(recollectionEther(library, entry), 37);
  assert.deepEqual(library, before);
  const record = library.history[0];
  record.summary = { text: '已总结的旅程', sourceHash: memoryHash(dungeonMemoryText(record)) };
  assert.equal(recollectionScript(library, entry).story[0], '已总结的旅程');
  assert(recollectionScript(library, entry).story.every((line) => line === '已总结的旅程'));
  library.history = [];
  library.scripts = [];
  assert(recollectionScript(library, entry).story.every((line) => line === '无'));
  const restored = restoreExploration(library.exploration);
  assert.equal(restored.ruins.cleared[0].recollection.ether, 37);
  for (let index = 0; index < 5; index++)
    assert.deepEqual(
      explorationSpec(entry, index).enemyIds,
      entry.recollection.encounters[index].enemyIds,
    );
});

test('recollection completion grants original ether once plus ordinary rewards, without opening successors', () => {
  const { library, entry } = recalledLibrary();
  const route = structuredClone(library.exploration);
  const trip = newExpedition('bossGate', {}, entry);
  trip.recollectionEther = recollectionEther(library, entry);
  trip.index = 4;
  const state = beginEncounter(trip);
  state.phase = 'victory';
  const result = completeEncounter(trip, state);
  const before = library.inventory.ether;
  assert.equal(result.rewards.ether, 37);
  assert.equal(result.rewards.summonContracts, 1);
  assert(claimBattleRewards(library, result.rewardId, result.rewards));
  assert.equal(library.inventory.ether, before + 37);
  assert(!claimBattleRewards(library, result.rewardId, result.rewards));
  assert.equal(completeExploration(library.exploration, entry), null);
  assert.deepEqual(library.exploration, route);
});

test('active recommendations approximate eighty percent and identity migration is additive and idempotent', () => {
  let active = 0;
  for (let i = 0; i < 1000; i++) {
    const plan = characterGenerationPlan({ rollId: 'identity-' + i });
    active += plan.preferredSkillKinds.filter((kind) => kind === 'active').length;
    assert(plan.activeDesignFocus);
  }
  assert(active / 2000 > 0.75 && active / 2000 < 0.85);
  const source = { entries: { 0: { content: '玩家自己的世界观' } } };
  const updated = upgradeCharacterIdentity(source, '新增写作要求');
  assert.equal(updated.entries[0].content, '玩家自己的世界观');
  assert.deepEqual(upgradeCharacterIdentity(updated, '其他文本'), updated);
});

test('browser and service really inject the v40 identity rule into character requests only', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/identity-world-'));
  const server = await createWorldbookStore(directory);
  const { book } = await server.get('tavern-world');
  const values = new Map([['world.book.tavern-world', book]]);
  const database = {
    get: (key) => structuredClone(values.get(key)),
    entries: () => [...values],
    write: async (entries) => {
      for (const [key, value] of entries) values.set(key, structuredClone(value));
    },
  };
  const browser = await createBrowserStores(
    database,
    (file) => readFile(new URL('../prompts/' + file, import.meta.url), 'utf8'),
    book,
  );
  assert.equal(values.get('world.character-identity.v40'), true);
  for (const worlds of [server, browser.worlds]) {
    const input = { brief: '有明确说话习惯的旅人', rollId: 'identity-live' };
    const request = await generationRequest('character', input, undefined, {
      worldInfo: await worlds.resolve('character', input),
      countTokens: (text) => Math.ceil(text.length / 3),
    });
    const messages = request.messages.map((message) => message.content).join('\n');
    assert(messages.includes('【角色特色与技能差异】'));
    assert(messages.includes('主动80%、被动20%'));
    assert(messages.includes('preferredSkillKinds'));
    const script = await worlds.resolve('script', { party: [] });
    assert(
      !script.books.some(({ entries }) =>
        Object.values(entries).some(
          (entry) =>
            entry.content.includes('【角色特色与技能差异】') &&
            entry.apiTargets?.includes('script'),
        ),
      ),
    );
  }
});
