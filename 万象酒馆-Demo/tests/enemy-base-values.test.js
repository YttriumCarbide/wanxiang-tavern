import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { DEFINITIONS } from '../src/data.js';
import { newBattle, newEncounter, intent } from '../src/engine.js';
import { mapInput, mapResponse } from '../src/ai/pipeline/map-request.js';
import { normalizeEnemy, restoreWorlds } from '../src/worlds.js';
import { restoreEnemyBaseValues } from '../src/enemy-base-values.js';
import { worldFixture } from './fixtures/multiverse.js';
import { addWorldRoute, newExploration, explorationSpec } from '../src/exploration.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { upgradeEnemyBaseWorldbook } from '../src/ai/enemy-base-upgrade.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { createBrowserStores } from '../src/ai/browser-stores.js';
import { generationRequest } from '../server/prompts.mjs';
import { createWorldbookCounter } from '../server/character-reader.mjs';

test('all official authored templates contain the previous balance exactly once, including both phases and opening attacks', async () => {
  const expected = JSON.parse(
    await readFile(new URL('./fixtures/enemy-base-values.json', import.meta.url), 'utf8'),
  );
  assert.equal(expected.length, Object.values(DEFINITIONS).filter((enemy) => enemy.speed).length);
  for (const saved of expected) {
    const enemy = DEFINITIONS[saved.id];
    assert.equal(enemy.hp, saved.hp, saved.id);
    assert.deepEqual(
      [enemy.openingIntent, ...enemy.intents, ...(enemy.enragedIntents || [])]
        .filter(Boolean)
        .map((move) =>
          move.effects.filter((effect) => effect.type === 'damage').map((effect) => effect.value),
        ),
      saved.intents,
      saved.id,
    );
    assert.equal(newBattle([saved.id]).units[saved.id].maxHp, saved.hp, saved.id);
  }
});

test('new map API values remain exact in references, saves and combat, with growth added separately', () => {
  const world = mapResponse(JSON.stringify(worldFixture()), {});
  const ordinary = world.enemyDefinitions[world.enemyIds[0]],
    boss = world.enemyDefinitions[world.enemyIds[2]];
  assert.equal(ordinary.hp, 120);
  assert.equal(boss.hp, 200);
  assert.equal(ordinary.baseRevision, 1);
  assert.equal(boss.baseRevision, 1);
  for (const enemy of [ordinary, boss]) {
    const state = newEncounter({ enemyIds: [enemy.id], enemyDefinitions: world.enemyDefinitions });
    assert.equal(state.units[enemy.id].maxHp, enemy.hp);
    assert.equal(intent(state, enemy.id).effects[0].value, 1);
  }
  assert.deepEqual(restoreWorlds([world]), [world]);
  const routes = newExploration(1);
  addWorldRoute(routes, world, 1);
  const node = { ...routes[world.id].frontier[0], sequence: 10 };
  const state = newEncounter(explorationSpec(node, 0));
  for (const id of state.enemyIds) {
    assert.equal(state.units[id].maxHp, world.enemyDefinitions[id].hp + state.units[id].growth.hp);
    assert.equal(intent(state, id).effects[0].value, 1 + state.units[id].growth.attack);
  }
  const input = mapInput({ brief: '设计新世界' });
  assert.deepEqual(input.reference.enemyNumbers.ordinary.hp, [12, 360]);
  assert.deepEqual(input.reference.enemyNumbers.boss.hp, [12, 1035]);
  assert.equal(input.reference.enemies.find((enemy) => enemy.id === 'ares').hp, 299);
  const max = {
    ...worldFixture().enemies[0],
    hp: 360,
    intents: [
      { name: '极限', text: '41伤害', slots: [0], effects: [{ type: 'damage', value: 41 }] },
    ],
  };
  assert.equal(normalizeEnemy(max).hp, 360);
  assert.throws(() => normalizeEnemy({ ...max, hp: 361 }), /生命/);
});

test('legacy map enemies migrate once across library reload, expansion references and repeated exports', () => {
  const raw = worldFixture();
  const original = structuredClone(raw.enemies[0]);
  original.intents[0].effects.push({ type: 'heal', value: 4, target: 'self' });
  const converted = restoreEnemyBaseValues(original);
  assert.equal(converted.hp, 144);
  assert.deepEqual(
    converted.intents[0].effects.map((effect) => effect.value),
    [2, 4],
  );
  assert.deepEqual(restoreEnemyBaseValues(converted), converted);
  assert.equal(original.hp, 120);
  const library = newLibrary();
  library.worlds = [
    {
      ...raw,
      enemyIds: raw.enemies.map((enemy) => enemy.id),
      enemyDefinitions: Object.fromEntries(raw.enemies.map((enemy) => [enemy.id, enemy])),
    },
  ];
  const restored = restoreLibrary(library);
  assert.equal(restored.worlds[0].enemyDefinitions[raw.enemies[0].id].hp, 144);
  assert.equal(restored.worlds[0].enemyDefinitions[raw.enemies[2].id].hp, 230);
  assert.deepEqual(restoreLibrary(restored).worlds, restored.worlds);
  const existing = restored.worlds[0];
  const expanded = mapResponse(JSON.stringify({ ...raw, enemies: [], enemyIds: [] }), { existing });
  assert.deepEqual(expanded.enemyDefinitions, existing.enemyDefinitions);
});

test('browser/server upgrades remove old balance instructions and real map requests send final base ranges', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/base-enemy-'));
  const server = await createWorldbookStore(directory),
    { book } = await server.get('tavern-world');
  const entry = Object.values(book.entries).find(
    (item) => item.extensions?.wanxiang?.generationRule === 'enemy-base-values',
  );
  assert(entry);
  assert.deepEqual(upgradeEnemyBaseWorldbook(book), book);
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
  assert.equal(values.get('world.enemy-base.v45'), true);
  for (const worlds of [server, browser.worlds]) {
    const input = { brief: '无所属机械的荒原' };
    const request = await generationRequest('map', input, undefined, {
      assetContext: { task: 'map', request: { brief: input.brief }, data: mapInput(input) },
      worldInfo: await worlds.resolve('map', input),
      countTokens: createWorldbookCounter(),
    });
    const text = request.messages.map((message) => message.content).join('\n');
    assert.match(text, /hp12～360/);
    assert.match(text, /1035/);
    assert(!text.includes('普通敌人基础hp由代码乘'));
    assert(!text.includes('AI仍填写未缩放基础值'));
    assert.match(text, /不自行叠加全局hp倍率/);
  }
});
