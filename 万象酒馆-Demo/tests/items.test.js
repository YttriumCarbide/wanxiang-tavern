import test from 'node:test';
import assert from 'node:assert/strict';
import { newBattle, newEncounter, preview, advance, makeItem, makeAction } from '../src/engine.js';
import { restoreInventory } from '../src/rewards.js';
import { restoreLibrary, compileRoster } from '../src/ai/library.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { tutorialSpec } from '../src/content/tutorial.js';
import { demonstrated, tutorialCommitIssue } from '../src/tutorial-progress.js';

function supplied() {
  const state = newBattle(['warden']);
  state.phase = 'plan';
  state.round = 1;
  state.items = { 'mana-potion': 1, 'slow-potion': 1 };
  return state;
}

test('items consume one real AP and one charge only in the accepted simulation, with no source mutation', () => {
  const state = supplied();
  state.units.aegis.mp = 12;
  const source = structuredClone(state);
  const potion = makeItem('mana-potion', 'aegis', 0);
  const result = preview(state, [potion]);
  assert(result.valid);
  assert.equal(potion.ap, 1);
  assert.equal(result.final.units.aegis.mp, 18);
  assert.equal(result.final.units.aegis.used, 0);
  assert.equal(result.final.items['mana-potion'], 0);
  assert.deepEqual(state, source);
  assert.equal(preview(state, []).final.items['mana-potion'], 1);
  const twice = preview(state, [potion, makeItem('mana-potion', 'aegis', 2)]);
  assert(!twice.valid && twice.invalid.some((issue) => issue.message.includes('数量不足')));
  assert.deepEqual(state, source);
  assert(!preview(state, [makeItem('mana-potion', 'warden', 0)]).valid);
  assert(!preview(state, [{ ...potion, ap: 0 }]).valid);
  state.units.aegis.hp = 0;
  const dead = preview(state, [potion]);
  assert(!dead.valid);
  assert.equal(dead.final.items['mana-potion'], 1);
});

test('a slow potion moves a pending enemy action but cannot retroactively move one already executed', () => {
  const state = supplied();
  const original = preview(state, []).slots.indexOf('warden');
  const early = preview(state, [makeItem('slow-potion', 'warden', 0)]);
  assert(early.valid);
  assert(early.slots.indexOf('warden') > original);
  assert(demonstrated(early, 'slow'));
  assert.equal(early.final.items['slow-potion'], 0);
  const late = preview(state, [makeItem('slow-potion', 'warden', 2)]);
  assert(late.valid);
  assert.equal(late.slots.indexOf('warden'), original);
  assert.equal(late.final.units.warden.buffs.slow, 1);
  assert(!demonstrated(late, 'slow'));
});

test('inventory survives saves, encounter carry-over and keeps ether archives separate', () => {
  const library = newCampaign(defaultProtagonist());
  library.inventory = restoreInventory({
    bagUnlocked: true,
    items: { 'mana-potion': 2, 'slow-potion': -1, arbitrary: 999 },
    ether: 14,
  });
  const restored = restoreLibrary(library);
  assert.deepEqual(restored.inventory, library.inventory);
  assert.equal(restored.inventory.items['mana-potion'], 2);
  assert.equal(restored.inventory.items['slow-potion'], 0);
  assert(!('arbitrary' in restored.inventory.items));
  const state = newEncounter(tutorialSpec(0), null, 0, compileRoster(restored));
  state.items = structuredClone(restored.inventory.items);
  const next = newEncounter(tutorialSpec(1), state, 1);
  assert.deepEqual(next.items, state.items);
  assert.equal(restored.inventory.ether, 14);
});

test('tutorial gates require the slow item before action and actual recovered mana before the final kill', () => {
  const library = newCampaign(defaultProtagonist());
  const state = newEncounter(tutorialSpec(2), null, 2, compileRoster(library));
  state.items['slow-potion'] = 1;
  const normal = advance(preview(state, []));
  assert(tutorialCommitIssue(library, normal, preview(normal, [])).includes('迟缓药水'));
  const slow = preview(normal, [makeItem('slow-potion', 'warden', 0)]);
  assert.equal(tutorialCommitIssue(library, normal, slow), '');
  const boss = newEncounter(tutorialSpec(4), null, 4, compileRoster(library));
  boss.items['mana-potion'] = 1;
  const full = preview(boss, [makeItem('mana-potion', 'lyria', 0)]);
  assert(tutorialCommitIssue(library, boss, full).includes('实际回复法力'));
  boss.units.lyria.mp -= 8;
  const refill = preview(boss, [makeItem('mana-potion', 'lyria', 0)]);
  assert(demonstrated(refill, 'mana'));
  assert.equal(tutorialCommitIssue(library, boss, refill), '');
});

test('meteor stance increases the real action limit without granting extra AP', () => {
  const state = newBattle(['sprout']);
  state.phase = 'plan';
  state.round = 1;
  state.units.aegis.buffs.haste = 1;
  const actions = [
    makeAction(state, 'aegis', 'attack', 'sprout', 0),
    makeAction(state, 'aegis', 'attack', 'sprout', 1),
  ];
  assert(preview(state, actions).valid);
  assert(!preview(state, [...actions, makeAction(state, 'aegis', 'attack', 'sprout', 2)]).valid);
  const stance = preview(newBattle(['sprout']), [
    makeAction(state, 'aegis', 'meteor-stance', 'aegis', 0),
  ]);
  assert(stance.valid);
  assert.equal(stance.final.units.aegis.buffs.haste, 1);
});
