import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { FOREST_ENEMIES, FOREST_BOSSES } from '../src/content/forest-adversaries.js';
import { FOREST_ROUTES, forestEncounterSpec } from '../src/content/forest-encounters.js';
import { FOREST_DUNGEONS, FOREST_NPCS } from '../src/content/forest-dungeons.js';
import { officialDungeonFor } from '../src/content/official-dungeons.js';
import { DEFINITIONS, enemySlots } from '../src/data.js';
import { validateGameData } from '../src/validation.js';
import { newExploration, explorationSpec, completeExploration } from '../src/exploration.js';
import { newBattle, newEncounter, preview, advance, intent, enemyTimeline } from '../src/engine.js';
import { definitionsFor } from '../src/catalog.js';
import { lockEnemyDecisions } from '../src/enemy-tactics.js';
import { upgradeForestWorldbook } from '../src/ai/forest-worldbook.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationRequest } from '../server/prompts.mjs';
import { createWorldbookCounter } from '../server/character-reader.mjs';
import { createBrowserStores } from '../src/ai/browser-stores.js';
import { newExpedition, beginEncounter, completeEncounter } from '../src/expedition.js';
import { claimBattleRewards, restoreInventory } from '../src/rewards.js';
import { forestEnemyBlocks } from '../tools/build-forest-enemies.mjs';
import { renderVoxelEnemyPortrait } from '../tools/voxel-enemy-art.mjs';

const all = [...FOREST_ENEMIES, ...FOREST_BOSSES];
const parts = ['moonCrown', 'moonEye', 'moonRoot'];
function roundAt(round, ids = parts) {
  const state = advance(preview(newBattle(ids), []));
  state.round = round;
  lockEnemyDecisions(state, definitionsFor(state));
  return state;
}

test('six authored forest chapters each have five matching encounters and a distinct final boss', () => {
  assert.deepEqual(validateGameData(), []);
  assert.equal(FOREST_ENEMIES.length, 16);
  assert.equal(FOREST_BOSSES.length, 8);
  const routes = newExploration(617);
  for (const [sequence, route] of FOREST_ROUTES.entries()) {
    const node = routes.forest.frontier[0];
    assert.equal(node.sequence, sequence);
    assert.equal(officialDungeonFor(node), FOREST_DUNGEONS[sequence]);
    for (const [index, battle] of route.battles.entries()) {
      const spec = explorationSpec(node, index);
      assert.deepEqual(spec.enemyIds, battle.enemyIds);
      assert.equal(spec.name, route.name);
      assert.equal(spec.boss, index === 4);
      for (const id of spec.enemyIds) assert(DEFINITIONS[id]);
      const state = newEncounter(spec);
      for (const id of spec.enemyIds) assert.equal(state.units[id].maxHp, DEFINITIONS[id].hp);
      assert(preview(state, []).valid);
    }
    assert(route.battles[4].enemyIds.includes(route.boss));
    completeExploration(routes, node, { runId: 'forest-' + sequence, title: route.name });
  }
  assert.equal(routes.forest.frontier[0].sequence, 6);
  assert.equal(officialDungeonFor(routes.forest.frontier[0]), null);
  assert.deepEqual(enemySlots(forestEncounterSpec(5, 4).enemyIds), parts);
  assert.equal(new Set(FOREST_ROUTES.map((r) => r.boss)).size, 6);
  assert(!FOREST_DUNGEONS.some((d) => /火系|阳属性|男身女相/.test(d.outline)));
  assert.match(FOREST_DUNGEONS[4].outline, /排水|石砖/);
  for (const npc of FOREST_NPCS) assert.equal(npc.design.split('。').filter(Boolean).length, 2);
});

test('mother parts always act crown, eye, root, including low hp and seeds with timeline collisions', () => {
  for (const seed of [0, 1, 17, 37, 993])
    for (const round of [1, 2, 3, 4, 7]) {
      const state = roundAt(round);
      state.seed = seed;
      state.units.moonCrown.hp = 20;
      lockEnemyDecisions(state, definitionsFor(state));
      assert.deepEqual(enemyTimeline(state).filter(Boolean), parts);
      assert.deepEqual(preview(state, []), preview(state, []));
      assert.deepEqual(
        preview(state, [])
          .events.filter((e) => e.type === 'enemy')
          .map((e) => e.actor),
        parts,
      );
    }
  for (const [round, damage] of [
    [1, 21],
    [4, 32],
    [7, 47],
  ]) {
    const state = roundAt(round, ['moonEye']);
    assert.deepEqual(intent(state, 'moonEye').slots, [1]);
    assert.equal(intent(state, 'moonEye').effects[0].value, damage);
    const hit = preview(state, []).events.find((e) => e.actor === 'moonEye');
    assert.equal(
      state.units.lyria.hp - hit.after.units.lyria.hp,
      Math.min(state.units.lyria.hp, damage),
    );
  }
});

test('crown random choices remain frozen, target their own sides, and third-round effects cover all players', () => {
  for (const round of [1, 2, 3]) {
    const state = roundAt(round);
    const choice = intent(state, 'moonCrown');
    const event = preview(state, []).events.find(
      (e) => e.actor === 'moonCrown' && e.type === 'enemy',
    );
    assert(event);
    if (round === 1) {
      assert.equal(choice.slots.length, 1);
      const effect = choice.effects[0],
        target = state.formation[choice.slots[0]];
      assert.equal(event.after.units[target].buffs[effect.buff], effect.value);
      for (const id of parts) assert(!event.after.units[id].buffs[effect.buff]);
    }
    if (round === 2) {
      const effect = choice.effects[0];
      for (const id of parts) assert.equal(event.after.units[id].buffs[effect.buff], effect.value);
      for (const id of state.formation.slice(0, 3))
        assert(!event.after.units[id].buffs[effect.buff]);
    }
    if (round === 3) {
      for (const id of parts) {
        assert.equal(event.after.units[id].buffs.strength, 1);
        assert.equal(event.after.units[id].buffs.iron, 1);
      }
      for (const id of state.formation.slice(0, 3)) {
        assert.equal(event.after.units[id].buffs.vulnerable, 2);
        assert.equal(event.after.units[id].buffs.weak, 2);
      }
    }
    state.formation = [
      state.formation[2],
      state.formation[0],
      state.formation[1],
      ...state.formation.slice(3),
    ];
    assert.deepEqual(
      intent(state, 'moonCrown'),
      choice,
      'Repositioning cannot retarget a frozen intention',
    );
  }
});

test('third-round root heals twenty percent of each living part and eye only charges', () => {
  const state = roundAt(3);
  for (const id of parts) state.units[id].hp = 10;
  state.units.moonCrown.hp = 0;
  lockEnemyDecisions(state, definitionsFor(state));
  const result = preview(state, []);
  const eye = result.events.find((e) => e.actor === 'moonEye' && e.type === 'enemy');
  const root = result.events.find((e) => e.actor === 'moonRoot' && e.type === 'enemy');
  assert.equal(intent(state, 'moonEye').charging, true);
  assert.deepEqual(intent(state, 'moonEye').effects, []);
  for (const id of state.formation.filter(Boolean))
    assert.equal(eye.after.units[id].hp, state.units[id].hp);
  assert.equal(root.after.units.moonCrown.hp, 0);
  assert.equal(root.after.units.moonEye.hp, 36);
  assert.equal(root.after.units.moonRoot.hp, 40);
  assert.notEqual(
    result.final.phase,
    'victory',
    'Dead crown alone does not end the composite fight',
  );
});

test('forest supports heal and shield enemies, never players; tactical targeting follows public resources', () => {
  const state = roundAt(1, ['honeyLarva', 'hiveGuard', 'scaleArcher']);
  state.units.hiveGuard.hp = 10;
  state.units.aegis.hp = 5;
  state.units.aegis.mp = 40;
  state.units.scaleArcher.buffs.bind = 1;
  lockEnemyDecisions(state, definitionsFor(state));
  assert.equal(intent(state, 'honeyLarva').name, '封伤蜜浆');
  assert.equal(intent(state, 'scaleArcher').slot, 0);
  const heal = preview(state, []).events.find(
    (e) => e.actor === 'honeyLarva' && e.type === 'enemy',
  );
  assert.equal(heal.after.units.hiveGuard.hp, 23);
  assert.equal(heal.after.units.aegis.hp, 5);
});

test('rescuing Yueling grants exactly two real potions once, and invalid rewards are atomic', () => {
  const trip = newExpedition('mossGulon', {}, newExploration().forest.frontier[0]);
  const state = beginEncounter(trip);
  state.phase = 'victory';
  const result = completeEncounter(trip, state);
  assert.deepEqual(result.rewards.items, { 'health-potion': 1, 'mana-potion': 1 });
  const library = { inventory: restoreInventory(), rewardClaims: [] };
  assert(claimBattleRewards(library, result.rewardId, result.rewards));
  assert.equal(library.inventory.items['health-potion'], 1);
  assert.equal(library.inventory.items['mana-potion'], 1);
  assert.equal(claimBattleRewards(library, result.rewardId, result.rewards), false);
  assert.equal(forestEncounterSpec(0, 1).itemRewards, undefined);
  const before = structuredClone(library);
  assert.throws(
    () =>
      claimBattleRewards(library, 'invalid', {
        gold: 10,
        summonContracts: 1,
        items: { unknown: 1 },
      }),
    /道具/,
  );
  assert.deepEqual(library, before);
});

test('worldbook adds six outlines, two NPCs and twenty-four bestiary entries without overwriting edits', () => {
  const source = { entries: { 2: { uid: 2, content: '玩家的世界', disable: true, order: 199 } } };
  const book = upgradeForestWorldbook(source);
  assert.equal(Object.keys(book.entries).length, 33);
  assert.deepEqual(book.entries[2], source.entries[2]);
  const chapter = Object.values(book.entries).find(
    (e) => e.extensions?.wanxiang?.officialDungeonId === 'forest-fringe',
  );
  chapter.content += '\n自定义线索';
  chapter.disable = true;
  assert.deepEqual(upgradeForestWorldbook(book), book);
  assert.equal(Object.keys(source.entries).length, 1);
});

test('browser and server send actual forest outline, NPC design and matching monsters in the real request', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/forest-world-'));
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
  assert.equal(values.get('world.forest-chapters.v39'), true);
  const countTokens = createWorldbookCounter();
  for (const worlds of [server, browser.worlds])
    for (const sequence of [0, 2, 4, 5]) {
      const exploration = { ...newExploration().forest.frontier[0], sequence };
      const input = {
        brief: '按官设大纲展开本次古林旅程',
        boss: FOREST_ROUTES[sequence].boss,
        exploration,
        party: [{ id: 'player', name: '测试旅人', worldbook: '正在探索古林的酒馆主人。' }],
      };
      const request = await generationRequest('script', input, undefined, {
        worldInfo: await worlds.resolve('script', input),
        countTokens,
      });
      const text = request.messages.map((message) => message.content).join('\n');
      assert(text.includes(FOREST_DUNGEONS[sequence].name));
      assert(text.includes(FOREST_NPCS[0].design));
      if (sequence >= 2) assert(text.includes(FOREST_NPCS[1].design));
      for (const id of new Set(
        FOREST_ROUTES[sequence].battles.flatMap((battle) => battle.enemyIds),
      ))
        if (all.some((enemy) => enemy.id === id))
          assert(
            text.includes(DEFINITIONS[id].description),
            JSON.stringify(
              request.worldInfo.report.find(
                (entry) => entry.title === '古林怪物图鉴：' + DEFINITIONS[id].name,
              ),
            ),
          );
    }
});

test('all forest enemies have matching full-body voxel portraits and valid plinth-free GLBs', async () => {
  for (const enemy of all) {
    const blocks = forestEnemyBlocks(enemy);
    const source = JSON.parse(
      await readFile(
        new URL('../../万象异境-体素模型/月痕古林/' + enemy.portrait + '.json', import.meta.url),
        'utf8',
      ),
    );
    assert.deepEqual(source.blocks, JSON.parse(JSON.stringify(blocks)));
    assert(blocks.length >= 25);
    assert(!blocks.some((block) => /plinth|pedestal|base/i.test(block.group)));
    const svg = await readFile(
      new URL('../assets/portraits/' + enemy.portrait + '.svg', import.meta.url),
      'utf8',
    );
    assert.equal(svg, renderVoxelEnemyPortrait(enemy, blocks));
    const glb = await readFile(new URL('../assets/' + enemy.model, import.meta.url));
    assert.equal(glb.toString('ascii', 0, 4), 'glTF');
    assert.equal(glb.readUInt32LE(8), glb.length);
  }
});
