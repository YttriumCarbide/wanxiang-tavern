import { portraitFrameLayout } from '../src/portrait-frame.js';
import { statusIcons } from '../src/ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newBattle, preview, advance, makeAction, makeReposition } from '../src/engine.js';
import { PANDORA } from '../src/content/pandora.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { characterDocument } from './fixtures/ai.js';
import { newCampaign } from '../src/campaign.js';
import { compileRoster, restoreLibrary } from '../src/ai/library.js';
import { abilityFor } from '../src/catalog.js';
import { combatTestScript } from '../src/content/generation-mode.js';
import { savedPortrait } from '../src/portraits.js';

test('square and wide illustrations retain their original proportions at the top of a card', () => {
  for (const [width, height] of [
    [1254, 1254],
    [1920, 1080],
    [1024, 1536],
  ]) {
    const fitted = portraitFrameLayout(width, height);
    assert.equal(fitted.y, 0);
    assert(Math.abs(fitted.width / fitted.height - width / height) < 0.0001);
    assert(fitted.width <= 512 && fitted.height <= 768);
  }
  assert.equal(portraitFrameLayout(1254, 1254).height, 512);
});

test('bind cancels exactly the remaining enemy action, expires this round and preview is immutable', () => {
  const state = advance(
    preview(newBattle(['warden'], { morrow: { ...PANDORA, id: 'morrow' } }), []),
  );
  const before = structuredClone(state);
  const result = preview(state, [makeAction(state, 'morrow', 'clock-bind', 'warden', 0)]);
  assert(result.valid);
  assert(statusIcons(state, 'warden', result.final, result.events).includes('future-buff'));
  assert(
    result.events.some(
      (event) => event.actor === 'warden' && event.type === 'skip' && event.label.includes('禁锢'),
    ),
  );
  assert(!result.events.some((event) => event.actor === 'warden' && event.type === 'enemy'));
  assert.equal(result.final.units.morrow.mp, state.units.morrow.mp - 10);
  assert(!result.final.units.warden.buffs.bind);
  assert.deepEqual(state, before);
  const next = advance(result);
  assert(
    preview(next, []).events.some((event) => event.actor === 'warden' && event.type === 'enemy'),
  );
  const late = preview(state, [makeAction(state, 'morrow', 'clock-bind', 'warden', 2)]);
  assert(late.valid);
  assert(late.events.some((event) => event.actor === 'warden' && event.type === 'enemy'));
  assert(
    !advance(late).units.warden.buffs.bind,
    'Applying after an enemy acted must not bind next round',
  );
});

test('generated art belongs to a character, survives formation swaps and cannot leak through its template', () => {
  const raw = characterDocument();
  raw.data.archetype = 'aegis';
  const hero = normalizeCharacter(raw, 'character-art-owner');
  assert.equal(hero.combat.portrait, 'guardian');
  assert(!savedPortrait({ aegis: 'other-character-image' }, hero));
  hero.combat.customPortrait = 'data:image/webp;base64,AAAA';
  const library = newCampaign(hero);
  [library.party[0], library.party[1]] = [library.party[1], library.party[0]];
  const restored = restoreLibrary(library);
  const roster = compileRoster(restored);
  assert.equal(roster.lyria.customPortrait, hero.combat.customPortrait);
  assert(!roster.aegis.customPortrait);
  const battle = newBattle(['sprout'], roster);
  const moved = preview(battle, [makeReposition(0, 1, 0)]);
  assert(moved.valid);
  assert.equal(moved.final.formation[0], 'lyria');
  assert.equal(moved.final.heroDefinitions.lyria.customPortrait, hero.combat.customPortrait);
  assert.equal(abilityFor(battle, 'aegis', 'tidal-moonlight').name, '汐月凝辉');
});

test('combat testing has five identical local story parts and no retired abilities in generated characters', () => {
  assert.equal(combatTestScript().story.length, 5);
  assert.equal(new Set(combatTestScript().story).size, 1);
  const old = characterDocument();
  old.setting.ultimate = { name: '旧奥义', description: '退役动作' };
  old.data.ultimate = { malformed: true };
  old.data.quest = { malformed: true };
  const compiled = normalizeCharacter(old, 'character-compatibility');
  assert(!compiled.combat.ultimate && !compiled.combat.quest);
  assert(!compiled.setting.worldbook.includes('旧奥义'));
});
