import test from 'node:test';
import assert from 'node:assert/strict';
import { newCampaign, assignParty } from '../src/campaign.js';
import { compileRoster, restoreLibrary } from '../src/ai/library.js';
import { normalizeCharacter, settingOnly } from '../src/ai/contracts.js';
import { characterDocument } from './fixtures/ai.js';
import { newEncounter, preview, advance, makeAction, makeReposition } from '../src/engine.js';
import { heroesFor } from '../src/catalog.js';
import { tutorialSpec } from '../src/content/tutorial.js';
import { newExpedition, beginEncounter, completeEncounter } from '../src/expedition.js';
import { explorationSpec } from '../src/exploration.js';
import { generationInput } from '../server/prompts.mjs';
import { debrisRandom, debrisShape } from '../src/voxel-debris.js';
import { createSaveSnapshot } from '../src/app/saves.js';

const campaign = () =>
  newCampaign(normalizeCharacter(characterDocument(), 'character-protagonist'));

test('moving into an empty base before an enemy attack dodges it and still costs one AP', () => {
  const opening = newEncounter(tutorialSpec(), null, 0, compileRoster(campaign()));
  const state = advance(preview(opening, []));
  const idle = preview(state, []);
  const moved = preview(state, [makeReposition(0, 2, 0)]);
  assert(moved.valid);
  assert.equal(moved.final.formation[0], null);
  assert.equal(moved.final.formation[2], 'aegis');
  const attack = moved.events.find((event) => event.type === 'enemy');
  assert.deepEqual(attack.targets, []);
  assert(idle.final.units.aegis.hp < moved.final.units.aegis.hp);
  assert.equal(moved.final.units.aegis.hp, state.units.aegis.hp);
  const late = preview(state, [makeReposition(0, 2, 2)]);
  assert(late.valid);
  assert(late.final.units.aegis.hp < moved.final.units.aegis.hp);
  assert.equal(makeReposition(0, 2, 0).ap, 1);
});

test('the vulnerability lesson starts with a visible weakness in enemy armour; the next lesson uses slow items', () => {
  const opening = newEncounter(tutorialSpec(1), null, 1, compileRoster(campaign()));
  assert.equal(opening.units.cinderImp.buffs.vulnerable, 1);
  const hit = preview(opening, [makeAction(opening, 'lyria', 'attack', 'cinderImp', 0)]);
  assert(hit.valid);
  assert(hit.final.units.cinderImp.hp < opening.units.cinderImp.hp - 7);
  const stone = newEncounter(tutorialSpec(2), null, 2, compileRoster(campaign()));
  assert.deepEqual(stone.enemyIds, ['warden']);
  assert(stone.units.warden.maxHp > 50);
});

test('a new campaign starts with the protagonist and Edith; other slots stay empty after reload', () => {
  const library = campaign();
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(restored.characters.length, 2);
  assert.deepEqual(restored.party, [
    'character-protagonist',
    'official-edith',
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(createSaveSnapshot({ ai: { library: restored } }).summary.partyNames, [
    restored.characters[0].setting.name,
    '伊蒂丝',
  ]);
  const state = newEncounter(tutorialSpec(), null, 0, compileRoster(restored));
  assert.equal(heroesFor(state).length, 2);
  assert.equal(Object.values(state.units).filter((unit) => unit.side === 'hero').length, 2);
  assert.deepEqual(state.formation, ['aegis', 'lyria', null, null, null, null]);
  assert(preview(state, []).valid);
});

test('Edith is already present without summoning and protagonist cannot be removed', () => {
  const library = campaign();
  const companion = library.characters[1];
  assert.equal(companion.setting.name, '伊蒂丝');
  assert(!library.characters.some((entry) => entry.setting.name === '长景月汐'));
  assert.throws(() => assignParty(library, 0, null), /主角/);
  assignParty(library, 0, companion.id);
  assert.equal(library.party[1], library.campaign.protagonistId);
  assignParty(library, 0, null);
  assert.deepEqual(library.party.slice(0, 3), [null, 'character-protagonist', null]);
  library.campaign.firstRecruit = true;
  const restored = restoreLibrary(library);
  assert.equal(restored.characters.length, 2);
  assert.equal(restored.campaign.firstRecruit, true);
});

test('tutorial descriptors, AI reference and five encounter progression share the same sparse battle rules', () => {
  const library = campaign();
  const node = { ...library.exploration.ruins.frontier[0], tutorial: true };
  const expedition = newExpedition('bossGate', compileRoster(library), node);
  for (let index = 0; index < 5; index++) {
    const spec = explorationSpec(node, index);
    assert.deepEqual(spec, tutorialSpec(index));
    assert(spec.enemyIds.length <= 2);
    let state = beginEncounter(expedition);
    assert.equal(heroesFor(state).length, 2);
    state = advance(preview(state, [makeAction(state, 'aegis', 'attack', state.enemyIds[0], 0)]));
    assert.doesNotThrow(() => preview(state, []));
    const beforeMp = state.units.aegis.mp;
    state.phase = 'victory';
    const result = completeEncounter(expedition, state);
    assert.equal(result.complete, index === 4);
    if (index < 4) assert.equal(expedition.carried.units.aegis.mp, beforeMp);
  }
  const input = {
    brief: '自然推进故事',
    boss: 'bossGate',
    party: library.characters.map(settingOnly),
    exploration: node,
  };
  const context = generationInput('script', input);
  assert.equal(context.characters.greenLight.length, 2);
  assert.deepEqual(
    context.encounters.map((item) => item.enemyCount),
    [1, 2, 1, 2, 1],
  );
  assert.equal(
    generationInput('character', { brief: '主角名：旅人', purpose: 'protagonist' }).request.role,
    '玩家主角',
  );
});

test('procedural debris varies topology as well as size, including between deaths', () => {
  const shapes = (seed) => {
    const random = debrisRandom(seed);
    return Array.from({ length: 8 }, (_, index) => debrisShape(index, random));
  };
  const first = shapes(911),
    second = shapes(1924);
  assert.equal(new Set(first.map((shape) => shape.signature)).size, 8);
  assert(first.every((shape) => shape.cells.length > 5));
  assert(first.every((shape, index) => shape.signature !== second[index].signature));
});
