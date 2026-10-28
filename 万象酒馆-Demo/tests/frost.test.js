import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { FROST_ENEMIES, FROST_BOSSES } from '../src/content/frost-adversaries.js';
import { FROST_ROUTES, frostEncounterSpec } from '../src/content/frost-encounters.js';
import { FROST_DUNGEONS, FROST_NPCS } from '../src/content/frost-dungeons.js';
import { officialDungeonFor } from '../src/content/official-dungeons.js';
import { DEFINITIONS, HEROES, enemySlots } from '../src/data.js';
import { validateGameData } from '../src/validation.js';
import { newExploration, explorationSpec, completeExploration } from '../src/exploration.js';
import {
  newBattle,
  newEncounter,
  preview,
  advance,
  intent,
  enemyTimeline,
  makeAction,
} from '../src/engine.js';
import { upgradeFrostWorldbook } from '../src/ai/frost-worldbook.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationRequest } from '../server/prompts.mjs';
import { createWorldbookCounter } from '../server/character-reader.mjs';
import { createBrowserStores } from '../src/ai/browser-stores.js';
import { frostEnemyBlocks } from '../tools/build-frost-enemies.mjs';
import { renderVoxelEnemyPortrait } from '../tools/voxel-enemy-art.mjs';

const all = [...FROST_ENEMIES, ...FROST_BOSSES];
function bossRound(round, enraged = false) {
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [hero.id, { ...structuredClone(hero), hp: 1000, skills: [], buffs: {} }]),
  );
  const state = newBattle(['aresCannonLeft', 'ares', 'aresCannonRight'], heroes);
  state.phase = 'plan';
  state.round = round;
  Object.assign(state.units.ares, { enraged, phaseStartRound: 1 });
  return state;
}
const aresEvent = (result) =>
  result.events.find((event) => event.actor === 'ares' && event.type === 'enemy');

test('six frost chapters use matching casts, ordered locations and the final three-part formation', () => {
  assert.deepEqual(validateGameData(), []);
  assert.equal(FROST_ENEMIES.length, 18);
  assert.equal(FROST_BOSSES.length, 6);
  assert.equal(new Set(all.map((enemy) => enemy.id)).size, 24);
  const routes = newExploration(617);
  for (const [sequence, route] of FROST_ROUTES.entries()) {
    const node = routes.frost.frontier[0];
    assert.equal(node.sequence, sequence);
    assert.equal(officialDungeonFor(node), FROST_DUNGEONS[sequence]);
    assert.equal(route.battles.length, 5);
    for (const [index, battle] of route.battles.entries()) {
      const spec = explorationSpec(node, index);
      assert.deepEqual(spec.enemyIds, battle.enemyIds);
      assert.equal(spec.name, route.name);
      const state = newEncounter(spec);
      assert(preview(state, []).valid);
      assert(
        spec.enemyIds.every((id) => DEFINITIONS[id] && state.units[id].level >= spec.level - 1),
      );
    }
    completeExploration(routes, node, { runId: 'frost-' + sequence, title: route.name });
  }
  assert.equal(officialDungeonFor(routes.frost.frontier[0]), null);
  assert.deepEqual(enemySlots(frostEncounterSpec(5, 4).enemyIds), [
    'aresCannonLeft',
    'ares',
    'aresCannonRight',
  ]);
  assert.match(FROST_DUNGEONS[4].outline, /无人死亡|不得写成有人死亡/);
  assert.equal(DEFINITIONS.settlementLeader.nonlethal, true);
  for (const npc of FROST_NPCS) assert.equal(npc.design.split('。').filter(Boolean).length, 2);
});

test('Ares normal loop caps iron at two and distributes sword damage by position', () => {
  for (const [round, expected] of [
    [1, '导弹防线'],
    [2, '机甲重剑'],
    [3, '正面压制'],
    [4, '导弹防线'],
    [5, '导弹防线'],
  ]) {
    const state = bossRound(round);
    assert.equal(intent(state, 'ares').name, expected);
  }
  const capped = bossRound(4);
  capped.units.ares.buffs.iron = 2;
  assert.equal(intent(capped, 'ares').name, '链锯肃清');
  capped.round = 5;
  assert.equal(intent(capped, 'ares').selfBuff.iron, 0);
  const state = bossRound(2),
    result = preview(state, []),
    event = aresEvent(result);
  const before = result.events[result.events.indexOf(event) - 1]?.after || state;
  assert.deepEqual(
    state.formation.slice(0, 3).map((id) => before.units[id].hp - event.after.units[id].hp),
    [6, 13, 6],
  );
});

test('Ares emergency loop heals, acts first despite slow, cleanses, charges immediately and repeats', () => {
  const one = bossRound(1, true);
  one.units.ares.hp = 150;
  const first = aresEvent(preview(one, []));
  assert.equal(first.after.units.ares.block, 21);
  assert.equal(first.after.units.ares.hp, 150 + Math.round(one.units.ares.maxHp * 0.1));
  const two = bossRound(2, true);
  two.units.ares.buffs.slow = 20;
  two.units.aegis.hp = 800;
  two.units.lyria.hp = 700;
  two.units.morrow.hp = 900;
  assert.equal(enemyTimeline(two)[0], 'ares');
  assert.deepEqual(intent(two, 'ares').slots, [1]);
  const three = bossRound(3, true);
  Object.assign(three.units.ares.buffs, { weak: 2, vulnerable: 2, poison: 4, bleed: 0 });
  const spray = aresEvent(preview(three, []));
  assert(!spray.after.units.ares.buffs.weak && !spray.after.units.ares.buffs.poison);
  assert.equal(spray.after.units.ares.buffs.regen, 5);
  assert.deepEqual(
    three.formation.slice(0, 3).map((id) => spray.after.units[id].buffs.bleed),
    [3, 2, 1],
  );
  const four = bossRound(4, true),
    charged = preview(four, []);
  assert.equal(charged.events[0].after.units.ares.block, 105);
  assert.equal(aresEvent(charged).after.units.ares.block, 105);
  assert.equal(intent(bossRound(5, true), 'ares').effects[0].value, 44);
  assert.equal(intent(bossRound(6, true), 'ares').name, '紧急维修');
});

test('Ares phase starts below sixty percent or on the second cannon loss and persists after healing', () => {
  const state = bossRound(1);
  state.units.ares.hp = state.units.ares.maxHp * 0.6;
  assert.equal(intent(state, 'ares').enraged, false);
  state.units.ares.hp--;
  const phase = preview(state, []);
  assert.equal(phase.events.filter((event) => event.type === 'bossPhase').length, 1);
  const carried = advance(phase);
  carried.units.ares.hp = carried.units.ares.maxHp;
  assert.equal(intent(carried, 'ares').enraged, true);
  const cannons = bossRound(1);
  cannons.units.aresCannonLeft.hp = 1;
  cannons.units.aresCannonRight.hp = 0;
  cannons.heroDefinitions.aegis.attack = 100;
  const hit = preview(cannons, [makeAction(cannons, 'aegis', 'attack', 'aresCannonLeft', 0)]);
  assert(hit.valid);
  assert.equal(hit.events.filter((event) => event.type === 'bossPhase').length, 1);
  assert.equal(hit.final.units.ares.enraged, true);
});

test('frost worldbook upgrades are idempotent and real browser/server requests include chapter NPCs and monsters', async () => {
  const empty = { entries: {} },
    upgraded = upgradeFrostWorldbook(empty);
  assert.equal(Object.keys(upgraded.entries).length, 35);
  assert.deepEqual(upgradeFrostWorldbook(upgraded), upgraded);
  assert.deepEqual(empty, { entries: {} });
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/frost-world-'));
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
    (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8'),
    book,
  );
  assert.equal(values.get('world.frost-chapters.v44'), true);
  const countTokens = createWorldbookCounter();
  for (const worlds of [server, browser.worlds])
    for (let sequence = 0; sequence < 6; sequence++) {
      const exploration = { ...newExploration().frost.frontier[0], sequence };
      const input = {
        brief: '按矿窟官设大纲展开',
        boss: FROST_ROUTES[sequence].boss,
        exploration,
        party: [{ id: 'player', name: '测试旅人', worldbook: '酒馆旅人' }],
      };
      const request = await generationRequest('script', input, undefined, {
        worldInfo: await worlds.resolve('script', input),
        countTokens,
      });
      const text = request.messages.map((message) => message.content).join('\n');
      assert(text.includes(FROST_DUNGEONS[sequence].name));
      assert(text.includes(FROST_NPCS[0].design));
      for (const id of new Set(FROST_ROUTES[sequence].battles.flatMap((battle) => battle.enemyIds)))
        assert(text.includes(DEFINITIONS[id].description), id);
    }
});

test('every frost portrait and GLB comes from its own reproducible voxel source without a display plinth', async () => {
  for (const enemy of all) {
    const blocks = frostEnemyBlocks(enemy);
    assert(blocks.length >= 8);
    assert(!blocks.some((block) => /plinth|pedestal/i.test(block.group)));
    const source = JSON.parse(
      await readFile(
        new URL('../../万象异境-体素模型/霜晶矿窟/' + enemy.portrait + '.json', import.meta.url),
        'utf8',
      ),
    );
    assert.deepEqual(source.blocks, blocks);
    assert.equal(
      await readFile(
        new URL('../assets/portraits/' + enemy.portrait + '.svg', import.meta.url),
        'utf8',
      ),
      renderVoxelEnemyPortrait(enemy, blocks),
    );
    const glb = await readFile(new URL('../assets/' + enemy.model, import.meta.url));
    assert.equal(glb.toString('ascii', 0, 4), 'glTF');
    assert.equal(glb.readUInt32LE(8), glb.length);
  }
});
