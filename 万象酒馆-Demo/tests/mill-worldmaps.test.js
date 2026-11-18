import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BIOMES, MAP_IDS } from '../src/content/biomes.js';
import { MILL_ENEMIES, MILL_BOSSES } from '../src/content/mill-adversaries.js';
import {
  MILL_ROUTES,
  millEncounterSpec,
  TUTORIAL_TARGETS,
} from '../src/content/mill-encounters.js';
import { MILL_MONSTER_LORE, ALL_MONSTER_LORE } from '../src/content/monsters.js';
import { MILL_DUNGEONS } from '../src/content/official-dungeons.js';
import { DEFINITIONS } from '../src/data.js';
import { REGIONS } from '../src/content/regions.js';
import { CITY_BLUEPRINTS, buildBlueprintSvg } from '../src/content/city-blueprints.js';
import { buildCitySubmapData } from '../src/exploration/city-submap.js';
import { IMPERIAL_DUNGEONS } from '../src/content/imperial-network.js';
import {
  newExploration,
  explorationSpec,
  completeExploration,
  explorationPreview,
  availableExplorations,
} from '../src/exploration.js';
import { MAINLINE_DUNGEONS, CITY_DUNGEONS } from '../src/worlds.js';
import { encounterLevel } from '../src/enemy-growth.js';
import {
  destinationMap,
  destinationMark,
  destinationRegionTerrain,
} from '../src/destination-map.js';
import { ARRIVAL_PROSE, EDITH_LESSONS } from '../src/content/edith-guide.js';

test('greenfern mill biome, 15 monsters, 5 routes, and alchemicalPuppet overlord match spec', () => {
  assert(MAP_IDS.includes('mill'));
  assert.equal(BIOMES.mill.asset, 'greenfern-mill');
  assert.equal(MILL_ENEMIES.length, 10);
  assert.equal(MILL_ENEMIES.filter((entry) => entry.elite).length, 3);
  assert.equal(MILL_BOSSES.length, 5);

  const puppet = DEFINITIONS.alchemicalPuppet;
  assert.equal(puppet.overlord, true);
  assert.equal(puppet.boss, true);
  assert.equal(puppet.standOnCard, true);
  assert.equal(puppet.toughness, 8);
  assert.deepEqual(puppet.weaknesses, ['fire', 'brawl', 'axe', 'lightning']);
  const actionIntent = puppet.intents.find(
    (intent) => intent.name.includes('错位') || intent.selfShield,
  );
  assert(actionIntent, 'alchemicalPuppet should expose Special_Action non-damage intent');
  assert(!actionIntent.effects.some((effect) => effect.type === 'damage'));

  assert.equal(MILL_ROUTES.length, 5);
  assert.equal(TUTORIAL_TARGETS.vulnerable, 'millNettle');
  assert.equal(TUTORIAL_TARGETS.slow, 'millGiantVole');
  assert.equal(TUTORIAL_TARGETS.armour, 'millVoleAlpha');
  assert.equal(millEncounterSpec(0, 4).enemyIds.includes('millVoleAlpha'), true);
  assert.equal(millEncounterSpec(4, 4).enemyIds.includes('alchemicalPuppet'), true);
});

test('builtin worldbook holds mill lore, 15 mill monsters, 5 outlines, and single updated combat encyclopedia', async () => {
  const book = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const entries = Object.values(book.entries);
  const encyclopedia = entries.filter(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'combat-encyclopedia',
  );
  assert.equal(encyclopedia.length, 1);
  for (const token of [
    'sword',
    'axe',
    'spear',
    'brawl',
    'special-weapon',
    'fire',
    'ice',
    'wind',
    'lightning',
    'light',
    'dark',
    'special-magic',
    'support',
  ]) {
    assert(encyclopedia[0].content.includes(token), `Missing type ${token} in encyclopedia`);
  }
  const millLore = entries.filter((entry) => entry.extensions?.wanxiang?.millLore);
  assert.equal(millLore.length, 2);
  for (const id of [...MILL_ENEMIES, ...MILL_BOSSES].map((enemy) => enemy.id)) {
    assert(MILL_MONSTER_LORE[id] && ALL_MONSTER_LORE[id], `Missing lore for ${id}`);
    const match = entries.find((entry) => entry.extensions?.wanxiang?.monsterId === id);
    assert(match && match.selective === true && match.constant === false);
  }
  for (const outline of MILL_DUNGEONS) {
    assert(
      entries.some((entry) => entry.extensions?.wanxiang?.officialDungeonId === outline.id),
      `Missing official outline ${outline.id}`,
    );
  }
});

test('mill starts Lv.1-5 near Starbell, ruins moves east to Lv.20-25, and starbell-undercroft enters parchment city map', () => {
  const millAtlas = IMPERIAL_DUNGEONS.find((entry) => entry.id === 'mill');
  const ruinsAtlas = IMPERIAL_DUNGEONS.find((entry) => entry.id === 'ruins');
  assert.equal(millAtlas.level, 1);
  assert.equal(ruinsAtlas.level, 22);
  assert(encounterLevel({ map: 'mill', sequence: 0 }) === 1);
  assert(encounterLevel({ map: 'ruins', sequence: 0 }) === 20);
  assert(ARRIVAL_PROSE.join('\n').includes('绿蕨磨坊'));
  assert(
    JSON.stringify(EDITH_LESSONS).includes('绿蕨磨坊') ||
      JSON.stringify(EDITH_LESSONS).includes('田鼠'),
  );

  assert(CITY_DUNGEONS.includes('starbell-undercroft'));
  const submap = buildCitySubmapData('street');
  const undercroft = submap.nodes.find((node) => node.id === 'starbell-undercroft');
  assert(
    undercroft && undercroft.action === 'dungeon' && undercroft.dungeonId === 'starbell-undercroft',
  );
  const svg = buildBlueprintSvg(CITY_BLUEPRINTS.starbell);
  assert(
    !svg.includes('city-block') && !svg.includes('stroke-width="10.5"'),
    'Overland city map should use borderless paper and single-stroke trails without walls or pipes',
  );
  assert(svg.includes('fansheng-atlas.svg#paper-quarter'));
  assert(svg.includes('city-submap-trail'));
});

test('all 6 mainline dungeons use 4-step branching graph with side branches and overlord endless continuation', () => {
  assert.deepEqual([...MAINLINE_DUNGEONS], ['mill', 'ruins', 'forest', 'frost', 'forge', 'tide']);
  const routes = newExploration(99);
  for (const map of MAINLINE_DUNGEONS) {
    const bp = REGIONS[map].nodes;
    assert(bp && bp.length >= 5, `${map} must define declarative nodes`);
    const overlordBp = bp.find((node) => node.overlord);
    assert(overlordBp && overlordBp.label === '4', `${map} must end mainline at Overlord node 4`);
    const preview = explorationPreview(routes[map], map);
    const layout = destinationMap(preview);
    assert.equal(layout.positions.size, preview.length);
    const terrain = destinationRegionTerrain(map, layout.width, layout.height, layout.positions);
    assert(terrain.includes('destination-terrain-layer'));
    assert(terrain.includes('fansheng-atlas.svg#paper-quarter'));
    assert(!terrain.includes('terrain-frame-outer'));
    assert(destinationMark(1, false, { overlord: true }).includes('is-overlord-crest'));
    assert(destinationMark(1, false, { branch: false }).includes('is-diamond'));
  }

  const mill = routes.mill;
  completeExploration(routes, mill.frontier[0]);
  completeExploration(routes, mill.frontier[0]);
  const open = availableExplorations(mill);
  assert.equal(open.length, 2, 'Clearing mill node 2 opens branch a and mainline 3');
  assert.deepEqual(open.map((node) => node.label).sort(), ['3', 'a']);
  assert.equal(explorationSpec(open.find((node) => node.label === 'a')).level, 3);

  const nonMainline = routes['starbell-undercroft'];
  assert.equal(explorationPreview(nonMainline, 'starbell-undercroft').length, 1);
  completeExploration(routes, nonMainline.frontier[0]);
  assert.equal(explorationPreview(nonMainline, 'starbell-undercroft').length, 2);
});
