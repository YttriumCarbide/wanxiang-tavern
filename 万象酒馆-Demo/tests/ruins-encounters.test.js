import test from 'node:test';
import assert from 'node:assert/strict';
import { RUINS_ROUTES, ruinsEncounterSpec } from '../src/content/ruins-encounters.js';
import { ALL_OFFICIAL_DUNGEONS } from '../src/content/official-dungeons.js';
import { RUINS_MONSTER_LORE } from '../src/content/monsters.js';
import { DEFINITIONS } from '../src/data.js';
import { explorationSpec, newExploration } from '../src/exploration.js';
import { newExpedition, beginEncounter, completeEncounter, chooseRest } from '../src/expedition.js';
import { generationInput } from '../src/ai/pipeline/prompts.js';
import { upgradeRuinsWorldbook } from '../src/ai/ruins-worldbook.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { settingOnly } from '../src/ai/contracts.js';

test('six authored ruins trips use their own fixed cast in both engine and generation requests', () => {
  const library = newCampaign(defaultProtagonist());
  const used = new Set();
  assert.equal(RUINS_ROUTES.length, 6);
  const expectedBosses = [
    'bossGate',
    'ruinsGate',
    'chasmBeast',
    'brassColossus',
    'cinderPriest',
    'apepLamb',
  ];
  for (const [sequence, route] of RUINS_ROUTES.entries()) {
    assert.equal(route.id, ALL_OFFICIAL_DUNGEONS[sequence].id);
    assert.equal(route.boss, expectedBosses[sequence]);
    const node = { ...newExploration(42).ruins.frontier[0], sequence };
    const context = generationInput('script', {
      brief: '沿遗迹官设大纲展开本次旅程',
      boss: route.boss,
      exploration: node,
      party: library.characters.map(settingOnly),
    });
    assert.equal(context.request.officialDungeon.id, route.id);
    assert.equal(context.request.location, route.name);
    const trip = newExpedition(route.boss, {}, node);
    for (let index = 0; index < 5; index++) {
      const spec = explorationSpec(node, index);
      assert.deepEqual(spec, explorationSpec({ ...node, seed: 771 }, index));
      assert.deepEqual(spec.enemyIds, route.battles[index].enemyIds);
      assert.equal(new Set(spec.enemyIds).size, spec.enemyIds.length);
      assert(spec.enemyIds.length >= 1 && spec.enemyIds.length <= 3);
      assert.equal(spec.name, route.name);
      assert.equal(spec.boss, index === 4);
      assert.deepEqual(
        spec.enemyIds.filter((id) => DEFINITIONS[id].boss),
        index === 4 ? [route.boss] : [],
      );
      const state = beginEncounter(trip);
      assert.deepEqual(state.enemyIds, spec.enemyIds);
      for (const id of state.enemyIds) {
        assert.equal(state.units[id].maxHp, DEFINITIONS[id].hp);
        used.add(id);
      }
      assert.deepEqual(
        context.encounters[index].enemies.map((enemy) => enemy.id),
        state.enemyIds,
      );
      assert(!('name' in context.encounters[index]));
      state.phase = 'victory';
      assert.equal(completeEncounter(trip, state).complete, index === 4);
      if (trip.restPending) chooseRest(trip, 'sleep');
    }
  }
  assert.equal(Object.keys(RUINS_MONSTER_LORE).length, 19);
  for (const id of Object.keys(RUINS_MONSTER_LORE)) assert(used.has(id), id);
  assert.throws(() => ruinsEncounterSpec(6, 0));
  assert.throws(() => ruinsEncounterSpec(0, 5));
  const endless = generationInput('script', {
    brief: '继续探索遗迹深处',
    boss: 'apepLamb',
    exploration: { ...newExploration().ruins.frontier[0], sequence: 6 },
    party: library.characters.map(settingOnly),
  });
  assert(!endless.request.officialDungeon);
  assert(endless.encounters.every((encounter) => !encounter.enemies));
});

test('ruins worldbook migration preserves edits and controls and is idempotent with no duplicate chapters', () => {
  const source = {
    entries: {
      42: {
        uid: 42,
        content: '自定义大纲',
        disable: true,
        order: 123,
        extensions: { wanxiang: { dungeonId: 'ruins-hall' } },
      },
    },
  };
  const migrated = upgradeRuinsWorldbook(source);
  assert.equal(source.entries[42].content, '自定义大纲');
  assert(migrated.entries[42].content.startsWith('自定义大纲'));
  assert.equal(migrated.entries[42].disable, true);
  assert.equal(migrated.entries[42].order, 123);
  assert.equal(
    Object.values(migrated.entries).filter((entry) => entry.extensions?.wanxiang?.monsterId).length,
    19,
  );
  for (const route of RUINS_ROUTES) {
    const matches = Object.values(migrated.entries).filter((entry) =>
      [
        entry.extensions?.wanxiang?.dungeonId,
        entry.extensions?.wanxiang?.officialDungeonId,
      ].includes(route.id),
    );
    assert.equal(matches.length, 1);
    assert(matches[0].content.includes(DEFINITIONS[route.boss].name));
  }
  assert.deepEqual(upgradeRuinsWorldbook(migrated), migrated);
});
