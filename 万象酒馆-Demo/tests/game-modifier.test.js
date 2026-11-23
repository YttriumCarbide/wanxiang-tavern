import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRoster, newLibrary, restoreLibrary } from '../src/ai/library.js';
import { gainExperience } from '../src/growth.js';
import {
  modifierCharacterSections,
  modifyCharacter,
  modifyResources,
  restoreModifiedCharacter,
  undoResourceModification,
} from '../src/game-modifier.js';

test('resource undo survives restoring a save and preserves ordinary earnings', () => {
  const library = newLibrary();
  library.inventory.gold = 120;
  const first = modifyResources(library, { gold: 5000, ether: 100 });
  const second = modifyResources(first, { gold: 5500 });
  const restored = restoreLibrary(JSON.parse(JSON.stringify(second)));
  restored.inventory.gold += 200;
  const once = undoResourceModification(restored);
  assert.equal(once.inventory.gold, 5200);
  assert.equal(once.inventory.ether, 100);
  const twice = undoResourceModification(once);
  assert.equal(twice.inventory.gold, 320);
  assert.equal(twice.inventory.ether, library.inventory.ether);
  assert.equal(undoResourceModification(twice), twice);
});

test('an unaffordable resource undo keeps the whole operation intact', () => {
  const modified = modifyResources(newLibrary(), { gold: 1000, ether: 80 });
  modified.inventory.gold = 50;
  assert.throws(() => undoResourceModification(modified), /余额不足/);
  assert.equal(modified.inventory.gold, 50);
  assert.equal(modified.inventory.ether, 80);
  assert.equal(modified.modifierResourceHistory.length, 1);
});

test('saved role and skill changes affect the compiled roster and can be restored separately', () => {
  const library = newLibrary();
  const index = library.characters.findIndex(({ id }) => id === 'official-aegis');
  const member = library.characters[index];
  const original = compileRoster(library).aegis;
  const skill = modifierCharacterSections(member).skills.find((entry) =>
    entry.fields.some(({ key }) => key.endsWith(':mp')),
  );
  const cost = skill.fields.find(({ key }) => key.endsWith(':mp'));
  const effect = skill.fields.find(({ path }) => path.includes('effects'));
  assert(effect);
  library.characters[index] = modifyCharacter(member, {
    hp: member.combat.hp + 10,
    [cost.key]: cost.value + 7,
    [effect.key]: effect.value + 1,
  });
  gainExperience(library.characters[index], 30);
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  const changed = compileRoster(restored).aegis;
  assert.equal(changed.hp, original.hp + 10);
  assert.equal(changed.skills[cost.path[1]].mp, cost.value + 7);
  assert.equal(changed.skills[cost.path[1]].effects[effect.path[3]].value, effect.value + 1);

  restored.characters[index] = restoreModifiedCharacter(restored.characters[index], skill.key);
  const skillRestored = compileRoster(restored).aegis;
  assert.equal(skillRestored.skills[cost.path[1]].mp, original.skills[cost.path[1]].mp);
  assert.equal(skillRestored.hp, original.hp + 10);
  restored.characters[index] = restoreModifiedCharacter(restored.characters[index]);
  assert.equal(compileRoster(restored).aegis.hp, original.hp);
  assert.equal(restored.characters[index].growth.xp, 30);
});
