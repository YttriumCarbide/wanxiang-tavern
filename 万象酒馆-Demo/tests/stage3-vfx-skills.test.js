import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
  BREAKER_EMBLEM_ID,
  EMBLEM_VISUALS,
  emblemVisualFor,
} from '../src/emblems.js';
import { EFFECT_REGISTRY, renderEffectSample } from '../src/pixelfx-stage.js';
import {
  LEARNABLE_SKILL_CATEGORIES,
  LEARNABLE_SKILLS,
  STARTER_LEARNED_SKILL_IDS,
} from '../src/content/learnable-skills.js';
import {
  UNIVERSAL_SKILL_SLOTS,
  equipUniversalSkill,
  equippedUniversalSkills,
  restoreLearnedSkills,
} from '../src/learnable-skills.js';
import { guildSkillCatalog, buyGuildSkillManual } from '../src/guild.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { grownCombat, gainExperience } from '../src/growth.js';
import { newBattle, preview, advance, makeAction } from '../src/engine.js';
import { BUFFS, HEROES } from '../src/data.js';

const ALL_EMBLEM_IDS = [
  EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
  BREAKER_EMBLEM_ID,
];

test('all 6 emblems define distinct visual profiles mapped to valid PixelFX effects', () => {
  assert.equal(Object.keys(EMBLEM_VISUALS).length, 6);
  const cssClasses = new Set();
  const auraStyles = new Set();
  const primaries = new Set();

  for (const id of ALL_EMBLEM_IDS) {
    const visual = emblemVisualFor(id);
    assert.equal(visual.id, id);
    cssClasses.add(visual.cssClass);
    auraStyles.add(visual.auraStyle);
    primaries.add(visual.primary);
    assert(EFFECT_REGISTRY[visual.engageFx], `Missing engageFx: ${visual.engageFx}`);
    assert(EFFECT_REGISTRY[visual.skillFx], `Missing skillFx: ${visual.skillFx}`);
    assert(EFFECT_REGISTRY[visual.passiveFx], `Missing passiveFx: ${visual.passiveFx}`);
    assert.equal(visual.pixelfxPalette.length, 5);
  }

  assert.equal(cssClasses.size, 6);
  assert.equal(auraStyles.size, 6);
  assert.equal(primaries.size, 6);
});

test('PixelFX headless renderer produces non-empty RGBA frames for all emblem & skill VFX', () => {
  function assertVisibleFrame(sample, label) {
    assert.equal(sample.rgba.length, sample.width * sample.height * 4, label);
    const visible = sample.rgba.filter((channel, index) => index % 4 === 3 && channel > 0);
    assert(visible.length > 0, `${label} rendered zero visible pixels`);
    assert.equal(sample.visiblePixels, visible.length, label);
  }

  const checked = new Set();
  for (const id of ALL_EMBLEM_IDS) {
    const visual = emblemVisualFor(id);
    for (const fxId of [visual.engageFx, visual.skillFx, visual.passiveFx]) {
      checked.add(fxId);
      const sample = renderEffectSample(fxId, { palette: visual.pixelfxPalette });
      assertVisibleFrame(sample, `${fxId} for ${id}`);
    }
  }
  for (const skill of LEARNABLE_SKILLS) {
    assert(EFFECT_REGISTRY[skill.vfx], `Missing skill vfx: ${skill.vfx}`);
    checked.add(skill.vfx);
    const sample = renderEffectSample(skill.vfx, { palette: skill.vfxPalette });
    assertVisibleFrame(sample, `${skill.vfx} for ${skill.id}`);
  }
  assertVisibleFrame(renderEffectSample('dark-explosion'), 'dark-explosion');
  assert(checked.size >= 18);
});

test('learnable skill catalog defines 18 valid skills across 4 categories with valid buffs and damage types', () => {
  assert.equal(LEARNABLE_SKILLS.length, 18);
  assert.equal(new Set(LEARNABLE_SKILLS.map((s) => s.id)).size, 18);
  const categories = new Set(LEARNABLE_SKILLS.map((s) => s.category));
  assert.deepEqual(categories, new Set(Object.keys(LEARNABLE_SKILL_CATEGORIES)));

  for (const skill of LEARNABLE_SKILLS) {
    for (const eff of skill.effects) {
      if (eff.buff)
        assert(Object.hasOwn(BUFFS, eff.buff), `Unknown buff ${eff.buff} in ${skill.id}`);
      if (eff.type === 'cleanse') {
        for (const b of eff.buffs) assert(Object.hasOwn(BUFFS, b), `Unknown cleanse buff ${b}`);
      }
    }
  }
});

test('Guild skill shop, 2-slot character equipping, persistence, and level scaling work cleanly', () => {
  const library = newLibrary();
  assert.deepEqual(restoreLearnedSkills(library.learnedSkills), STARTER_LEARNED_SKILL_IDS);

  const denied = buyGuildSkillManual(library, 'uni-crimson-reap');
  assert.equal(denied.ok, false);

  library.inventory.gold = 500;
  const bought = buyGuildSkillManual(library, 'uni-smoke-veil');
  assert.equal(bought.ok, true);
  assert.equal(bought.cost, 55);
  assert.equal(library.inventory.gold, 445);
  assert(library.learnedSkills.includes('uni-smoke-veil'));

  library.guild.merit = 100; // Rank D (5% discount)
  const catalog = guildSkillCatalog(library);
  const quickstep = catalog.find((entry) => entry.id === 'uni-quickstep-order');
  assert.equal(quickstep.unlockedByMerit, true);
  assert.equal(quickstep.discountedCost, Math.round(110 * 0.95));

  const hero = library.characters[0];
  assert.equal(hero.combat.skills.length, 2);

  equipUniversalSkill(library, hero.id, 0, 'uni-feint-retreat');
  equipUniversalSkill(library, hero.id, 1, 'uni-serrated-cut');
  assert.deepEqual(hero.equippedSkills, ['uni-feint-retreat', 'uni-serrated-cut']);
  assert.equal(UNIVERSAL_SKILL_SLOTS, 2);

  // Equipping duplicate clears the other slot instead of duplicating on one unit.
  equipUniversalSkill(library, hero.id, 1, 'uni-feint-retreat');
  assert.deepEqual(hero.equippedSkills, [null, 'uni-feint-retreat']);

  // Core saved skills stay intact while grownCombat compiles scaled universal skills.
  assert.equal(hero.combat.skills.length, 2);
  gainExperience(hero, 1200);
  const compiled = grownCombat(hero);
  assert.equal(compiled.skills.length, 3);
  const universalCompiled = compiled.skills.find((s) => s.id === 'uni-feint-retreat');
  assert.equal(universalCompiled.universal, true);
  assert(universalCompiled.effects[0].value > LEARNABLE_SKILLS[0].effects[0].value);
  assert(universalCompiled.text.includes('后场'));

  // Round-trip save restore preserves learnedSkills and equippedSkills.
  const restored = restoreLibrary(structuredClone(library));
  assert(restored.learnedSkills.includes('uni-smoke-veil'));
  const restoredHero = restored.characters.find((c) => c.id === hero.id);
  assert.deepEqual(restoredHero.equippedSkills, [null, 'uni-feint-retreat']);
  assert.equal(equippedUniversalSkills(restoredHero).length, 1);
});

test('retreatSwap universal skill swaps front caster to rear & triggers incoming entrySkill consistently', () => {
  const retreatSkill = equippedUniversalSkills({ equippedSkills: ['uni-feint-retreat'] })[0];
  const frontId = HEROES[0].id;
  const rearId = HEROES[3].id;
  const frontBase = HEROES.find((h) => h.id === frontId);
  const rearBase = HEROES.find((h) => h.id === rearId);

  const heroDefinitions = {
    [frontId]: {
      ...structuredClone(frontBase),
      skills: [...structuredClone(frontBase.skills), retreatSkill],
    },
    [rearId]: {
      ...structuredClone(rearBase),
      entrySkill: {
        id: 'test-rear-entry',
        name: '幻影突袭',
        target: 'opposite',
        effects: [{ type: 'damage', value: 4 }],
      },
    },
  };

  let state = advance(preview(newBattle(['hound', 'warden', 'hexer'], heroDefinitions), []));
  const startFormation = [...state.formation];
  assert.equal(startFormation[0], frontId);
  assert.equal(startFormation[3], rearId);
  state.units[rearId].entryReady = true;

  const action = makeAction(state, frontId, 'uni-feint-retreat', 'hound', 0);
  const pv = preview(state, [action]);
  assert.equal(pv.valid, true);
  assert.equal(pv.final.formation[0], rearId);
  assert.equal(pv.final.formation[3], frontId);
  assert(pv.events.some((ev) => ev.type === 'swap' && ev.actor === rearId));
  assert(pv.events.some((ev) => ev.type === 'entrySkill' && ev.actor === rearId));

  const adv = advance(pv);
  assert.deepEqual(adv.formation, pv.final.formation);
  assert.equal(adv.units.hound.hp, pv.final.units.hound.hp);
});
