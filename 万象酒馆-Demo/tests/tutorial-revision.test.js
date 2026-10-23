import test from 'node:test';
import assert from 'node:assert/strict';
import { newCampaign, firstCompanion } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { compileRoster, restoreLibrary } from '../src/ai/library.js';
import { prepareCorridorRing, prepareBossEmblem } from '../src/emblem-progression.js';
import { newExpedition, beginEncounter, completeEncounter, chooseRest } from '../src/expedition.js';
import { preview, advance, makeEngage, intent } from '../src/engine.js';
import { COMBINE_SKILL, EMBLEM_ID, OVERLOAD_EMBLEM_ID } from '../src/emblems.js';
import { upgradeTutorialRevision } from '../src/ai/tutorial-revision.js';

test('new Edith begins with 48 hp while saved level growth is retained', () => {
  const library = newCampaign(defaultProtagonist());
  const edith = library.characters.find((member) => member.id === 'official-edith');
  assert.equal(edith.combat.hp, 48);
  edith.growth = { level: 3, xp: 20, rarity: 'rare', seed: 12, bonus: { hp: 4 } };
  const restored = restoreLibrary(library).characters.find((member) => member.id === edith.id);
  assert.equal(restored.combat.hp, 48);
  assert.equal(restored.growth.level, 3);
  assert.equal(restored.growth.bonus.hp, 4);
});

export function corridorFixture() {
  const library = newCampaign(defaultProtagonist());
  library.campaign.completed = true;
  library.inventory.summonContracts = 1;
  firstCompanion(library);
  library.campaign.tutorial = 'complete';
  const route = { ...library.exploration.ruins.frontier[0], sequence: 1 };
  const expedition = newExpedition('ruinsGate', compileRoster(library), route);
  expedition.partyIds = [...library.party];
  for (let index = 0; index < 4; index++) {
    assert.equal(prepareCorridorRing(library, expedition), false);
    const state = beginEncounter(expedition);
    state.phase = 'victory';
    completeEncounter(expedition, state);
    if (expedition.restPending) chooseRest(expedition, 'sleep');
  }
  return { library, expedition };
}

test('a new adventure resets borrowed protagonist growth while loading a save preserves its levels', () => {
  const saved = defaultProtagonist();
  saved.growth = { level: 8, xp: 90, bonus: { hp: 9, attack: 2 }, rarity: 'epic', seed: 42 };
  const library = newCampaign(saved);
  assert.equal(library.characters[0].growth.level, 1);
  assert.equal(library.characters[0].growth.xp, 0);
  assert.equal(library.characters[0].growth.bonus.hp, 0);
  assert.equal(library.characters[0].growth.rarity, 'epic');
  assert.equal(saved.growth.level, 8);
  library.characters[0].growth = structuredClone(saved.growth);
  assert.equal(restoreLibrary(library).characters[0].growth.level, 8);
});

test('corridor Boss grants and equips a full ring exactly once; balance precedes a single opening lightning strike', () => {
  const { library, expedition } = corridorFixture();
  assert(prepareCorridorRing(library, expedition));
  assert.equal(prepareCorridorRing(library, expedition), false);
  assert.deepEqual(library.emblems, [EMBLEM_ID]);
  assert.equal(library.characters[0].emblemId, EMBLEM_ID);
  assert.equal(restoreLibrary(library).progression.emblemLesson, 'corridor-intro');
  const opening = beginEncounter(expedition);
  const actor = expedition.corridorRing.actor;
  assert.equal(opening.units[actor].emblemCharge, 6);
  const combine = {
    ...makeEngage(actor, 0),
    followUp: { skill: COMBINE_SKILL.id, target: 'ruinsGate' },
  };
  const result = preview(opening, [combine]);
  assert(result.valid, JSON.stringify(result.invalid));
  const state = advance(result);
  assert.equal(state.units.ruinsGate.buffs.balance, 1);
  assert.equal(intent(state, 'ruinsGate').effects[0].value, 24);
  const hit = preview(state, []);
  assert(hit.valid);
  const index = hit.events.findIndex(
    (event) => event.type === 'enemy' && event.actor === 'ruinsGate',
  );
  assert(index >= 0);
  const before = index ? hit.events[index - 1].after : state;
  const after = hit.events[index].after;
  for (const id of state.formation.slice(0, 3))
    assert.equal(before.units[id].hp - after.units[id].hp, 8 - (before.units[id].buffs.iron || 0));
  assert(after.units.ruinsGate.openingAttackUsed);
  const next = advance(hit);
  assert(!intent(next, 'ruinsGate').name.includes('开幕'));
  assert.equal(opening.units[actor].emblemCharge, 6, 'preview does not mutate charge');
  assert.deepEqual(restoreLibrary(library).emblems, [EMBLEM_ID]);
  const thirdBoss = { index: 4, exploration: { map: 'ruins', sequence: 2 } };
  assert(prepareBossEmblem(library, thirdBoss));
  assert(library.emblems.includes(OVERLOAD_EMBLEM_ID));
  assert(!prepareBossEmblem(library, thirdBoss));
});

test('ring worldbook migration appends narrative without altering player text or injection switches', () => {
  const source = {
    entries: {
      0: {
        content: '自定义石门故事',
        disable: true,
        order: 888,
        extensions: { wanxiang: { dungeonId: 'ruins-corridor' } },
      },
    },
  };
  const result = upgradeTutorialRevision(source);
  assert(result.entries[0].content.includes('重要节点5修订'));
  assert(result.entries[0].content.startsWith('自定义石门故事'));
  assert.equal(result.entries[0].disable, true);
  assert.equal(result.entries[0].order, 888);
  assert.deepEqual(upgradeTutorialRevision(result), result);
  assert.equal(source.entries[0].content, '自定义石门故事');
});
