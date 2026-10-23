import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } from '../src/content/universal-adversaries.js';
import { DEFINITIONS } from '../src/data.js';
import { validateGameData } from '../src/validation.js';
import { newBattle, preview, advance, intent, makeReposition } from '../src/engine.js';
import { definitionsFor } from '../src/catalog.js';
import { lockEnemyDecisions } from '../src/enemy-tactics.js';
import { worldReference, normalizeWorld } from '../src/worlds.js';
import { upgradeUniversalEnemies } from '../src/ai/universal-enemy-upgrade.js';
import { universalEnemyBlocks } from '../tools/build-universal-enemies.mjs';
import { renderVoxelEnemyPortrait } from '../tools/voxel-enemy-art.mjs';

const all = [...UNIVERSAL_ENEMIES, ...UNIVERSAL_BOSSES];
const normal = (ids) => advance(preview(newBattle(ids), []));

test('ten neutral enemies and three phased bosses are usable by maps and the existing archive', () => {
  assert.equal(UNIVERSAL_ENEMIES.length, 10);
  assert.equal(UNIVERSAL_BOSSES.length, 3);
  assert.deepEqual(validateGameData(), []);
  const reference = worldReference();
  for (const enemy of all) {
    assert(reference.enemies.some((entry) => entry.id === enemy.id));
    assert(reference.appearances.some((entry) => entry.portrait === enemy.portrait));
    assert.equal(DEFINITIONS[enemy.id], enemy);
  }
  const world = normalizeWorld({
    id: 'world-universal',
    map: 'ruins',
    name: '无所属旅途',
    background: '路途、聚落与沿途生物组成一个自足的世界。'.repeat(9),
    landmarks: ['落脚点', '旧路', '离开此地的方向'],
    enemies: [],
    enemyIds: ['greyProwler', 'manyShellBeast'],
  });
  assert.deepEqual(world.enemyIds, ['greyProwler', 'manyShellBeast']);
});

test('hunter aims at a visible position once and a planned swap still dodges it', () => {
  const state = newBattle(['greyProwler']);
  state.units.lyria.hp = 18;
  state.units.greyProwler.buffs.slow = 3;
  const start = advance(preview(state, []));
  assert.equal(intent(start, 'greyProwler').slot, 1);
  const result = preview(start, [makeReposition(0, 1, 0)]);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  const event = result.events.find((entry) => entry.type === 'enemy');
  assert.deepEqual(event.targets, ['aegis']);
  assert.equal(event.after.units.lyria.hp, 18);
  assert.deepEqual(start.formation.slice(0, 2), ['aegis', 'lyria']);
  assert.equal(intent(event.after, 'greyProwler').slot, 1);
});

test('support enemies choose a wounded enemy ally without healing player characters', () => {
  const state = normal(['veilMender', 'hollowSentry']);
  state.units.hollowSentry.hp = 10;
  state.units.lyria.hp = 5;
  lockEnemyDecisions(state, definitionsFor(state));
  assert.equal(intent(state, 'veilMender').name, '紧急包扎');
  const result = preview(state, []);
  const heal = result.events.find(
    (entry) => entry.actor === 'veilMender' && entry.type === 'enemy',
  );
  assert.equal(heal.after.units.hollowSentry.hp, 22);
  assert.equal(heal.after.units.lyria.hp, 5);
  state.round = 2;
  lockEnemyDecisions(state, definitionsFor(state));
  assert.equal(intent(state, 'veilMender').name, '微光投射');
});

test('skitter, breaker, poison spread and boss tactics respond to different start-of-round states', () => {
  const state = normal(['facetSkitter', 'hollowSentry', 'greyStinger']);
  state.units.facetSkitter.hp = 10;
  state.units.lyria.buffs.iron = 3;
  state.units.lyria.buffs.poison = 4;
  state.units.morrow.buffs.poison = 3;
  lockEnemyDecisions(state, definitionsFor(state));
  assert.equal(intent(state, 'facetSkitter').name, '闭壳修复');
  assert.equal(intent(state, 'hollowSentry').name, '碎盾重锤');
  assert.equal(intent(state, 'hollowSentry').slot, 1);
  assert.equal(intent(state, 'greyStinger').slot, 0);
  const boss = normal(['manyShellBeast']);
  assert.deepEqual(intent(boss, 'manyShellBeast').slots, [0, 1, 2]);
  boss.formation[0] = null;
  boss.formation[1] = null;
  boss.units.manyShellBeast.hp = 80;
  lockEnemyDecisions(boss, definitionsFor(boss));
  assert.equal(intent(boss, 'manyShellBeast').name, '裂牙追猎');
  assert.deepEqual(intent(boss, 'manyShellBeast').slots, [2]);
  const result = preview(boss, []);
  assert.deepEqual(preview(boss, []), result);
  assert(result.valid);
});

test('judge locks armor and adjacent positions, while the core repairs only its own side on cooldown', () => {
  const judge = normal(['unmooredJudge']);
  judge.units.lyria.buffs.strength = 2;
  lockEnemyDecisions(judge, definitionsFor(judge));
  assert.equal(intent(judge, 'unmooredJudge').slot, 1);
  assert.equal(intent(judge, 'unmooredJudge').name, '强者裁定');
  judge.units.unmooredJudge.hp = 70;
  lockEnemyDecisions(judge, definitionsFor(judge));
  assert.deepEqual(intent(judge, 'unmooredJudge').slots, [1, 2]);
  judge.units.aegis.buffs.iron = 2;
  lockEnemyDecisions(judge, definitionsFor(judge));
  assert.equal(intent(judge, 'unmooredJudge').name, '壁垒终裁');
  assert.deepEqual(intent(judge, 'unmooredJudge').slots, [0]);
  const core = normal(['returningCore', 'greyProwler']);
  core.units.greyProwler.hp = 1;
  core.units.greyProwler.buffs.bind = 1;
  core.round = 2;
  lockEnemyDecisions(core, definitionsFor(core));
  assert.equal(intent(core, 'returningCore').name, '光潮扩散');
  core.round = 3;
  lockEnemyDecisions(core, definitionsFor(core));
  assert.equal(intent(core, 'returningCore').name, '返光修补');
  const event = preview(core, []).events.find(
    (entry) => entry.actor === 'returningCore' && entry.type === 'enemy',
  );
  assert.equal(event.after.units.greyProwler.hp, 17);
  assert.equal(event.after.units.aegis.hp, core.units.aegis.hp);
});

test('every enemy has reproducible matching GLB source and full-size plinth-free card art', async () => {
  for (const enemy of all) {
    const blocks = universalEnemyBlocks(enemy);
    const source = JSON.parse(
      await readFile(
        new URL(`../../万象异境-体素模型/通用敌人/${enemy.portrait}.json`, import.meta.url),
        'utf8',
      ),
    );
    assert.deepEqual(source.blocks, JSON.parse(JSON.stringify(blocks)));
    assert(blocks.length >= 25 && new Set(blocks.map((block) => block.group)).size >= 4);
    assert(!blocks.some((block) => /base|plinth|pedestal/i.test(block.group)));
    const svg = await readFile(
      new URL(`../assets/portraits/${enemy.portrait}.svg`, import.meta.url),
      'utf8',
    );
    assert.equal(svg, renderVoxelEnemyPortrait(enemy, blocks));
    const glb = await readFile(new URL(`../assets/${enemy.model}`, import.meta.url));
    assert.equal(glb.toString('ascii', 0, 4), 'glTF');
    assert.equal(glb.readUInt32LE(8), glb.length);
  }
});

test('the additive prompt migration is idempotent and preserves custom entries and switches', () => {
  const source = {
    entries: { 2: { uid: 2, content: '玩家自定义的背景', disable: true, order: 123 } },
  };
  const next = upgradeUniversalEnemies(source);
  assert.deepEqual(next.entries[2], source.entries[2]);
  assert.deepEqual(upgradeUniversalEnemies(next), next);
  const entry = Object.values(next.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'universal-enemies',
  );
  assert.deepEqual(entry.apiTargets, ['map', 'script']);
  for (const enemy of all) assert(entry.content.includes(enemy.id));
  assert.equal(Object.keys(source.entries).length, 1);
});
