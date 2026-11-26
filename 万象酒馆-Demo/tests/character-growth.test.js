import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary, officialCharacter, restoreLibrary, compileRoster } from '../src/ai/library.js';
import { newCampaign } from '../src/campaign.js';
import { restoreAdventureResources } from '../src/adventure/restore-resources.js';
import { createAdventureState } from '../src/adventure/state.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { adventureTestScript } from '../src/content/generation-mode.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { OFFICIAL_VISITORS } from '../src/content/official-visitors.js';
import {
  DEFAULT_LEVEL_LINES,
  OFFICIAL_LEVEL_LINES,
  levelLines,
} from '../src/content/level-dialogue.js';
import {
  applyEncounterGrowth,
  compileCharacterCombat,
  deriveGrowthRates,
  gainExperience,
  GROWTH_LABELS,
  GROWTH_REVISION,
  growthGainText,
  grownCombat,
  PROMOTION_TIERS,
  restoreGrowth,
  xpToNext,
} from '../src/growth.js';
import { LEARNABLE_SKILLS } from '../src/learnable-skills.js';
import { EQUIPMENT_STATS } from '../src/equipment-scale.js';
import { advance, makeAction, newBattle, preview } from '../src/engine.js';
import {
  beginEncounter,
  completeAdventureNode,
  completeEncounter,
  newExpedition,
} from '../src/expedition.js';
import { createCheckpoint } from '../src/storage/checkpoint.js';
import { createGameStorage } from '../src/storage/database.js';

const DIRECT_TYPES = new Set(['damage', 'heal', 'selfHeal', 'shield', 'selfShield']);

const growth = (member, level, rolls) => ({
  ...member,
  growth: restoreGrowth(
    { revision: GROWTH_REVISION, level, xp: 0, seed: 415, rarity: 'epic', rolls },
    member.id,
    member.combat,
  ),
});

function flatAddEffects(effects, bonus, damageOnly = false) {
  return effects.map((effect) => {
    if (effect.flat) return effect;
    if (damageOnly)
      return effect.type === 'damage' ? { ...effect, value: effect.value + bonus } : effect;
    return DIRECT_TYPES.has(effect.type) && effect.value > 0
      ? { ...effect, value: effect.value + bonus }
      : effect;
  });
}

function effectsFor(combat, target) {
  if (target === 'attack') return [{ type: 'damage', value: combat.attack }];
  if (target === 'entrySkill') return combat.entrySkill.effects;
  return combat.skills[target === 'skill1' ? 0 : 1].effects;
}

test('each level independently adds flat integers per slot while attack +N scales all direct damage without modifying buffs', () => {
  for (const target of ['entrySkill', 'attack', 'skill1', 'skill2']) {
    const member = defaultProtagonist();
    const authored = structuredClone(member.combat);
    const baseline = grownCombat(growth(member, 1, []));
    const compiled = grownCombat(growth(member, 2, [{ [target]: 2 }]));
    assert.deepEqual(
      effectsFor(compiled, target),
      flatAddEffects(effectsFor(baseline, target), 2, target === 'attack'),
    );
    for (const other of ['entrySkill', 'attack', 'skill1', 'skill2']) {
      if (other === target) continue;
      if (target === 'attack') {
        assert.deepEqual(
          effectsFor(compiled, other),
          flatAddEffects(effectsFor(baseline, other), 2, true),
        );
      } else {
        assert.deepEqual(effectsFor(compiled, other), effectsFor(baseline, other));
      }
    }
    assert.equal(compiled.limit, baseline.limit);
    assert.deepEqual(member.combat, authored);
  }

  // Buff stacks (e.g. vulnerable / poison) are never scaled by attack or slot growth.
  const aegis = officialCharacter('aegis');
  const upgraded = grownCombat(growth(aegis, 3, [{ skill1: 2, attack: 3 }, { skill1: 1 }]));
  const buffEffect = upgraded.skills[0].effects.find((eff) => eff.type === 'buff');
  assert.equal(buffEffect.value, aegis.combat.skills[0].effects[1].value);
  assert.equal(upgraded.skills[0].effects[0].value, aegis.combat.skills[0].effects[0].value + 6);
});

test('skill SP discounts follow their native skill, preserve HP costs and exclude free skills', () => {
  for (const target of ['skill1', 'skill2']) {
    const member = officialCharacter('pandora');
    member.combat.skills[0].mp = 8;
    member.combat.skills[1].mp = 8;
    const compiled = grownCombat(growth(member, 2, [{ [target]: 1, [`${target}Sp`]: 1 }]));
    const discountedIndex = target === 'skill1' ? 0 : 1;
    assert.equal(compiled.skills[discountedIndex].mp, 7);
    assert.equal(compiled.skills[1 - discountedIndex].mp, 8);
  }
  const edith = officialCharacter('edith');
  const legacyHpSkill = edith.combat.skills.find((skill) => skill.id === 'cinnabar-eclipse');
  const grownHpSkill = grownCombat(growth(edith, 2, [{ skill2: 1, skill2Sp: 1 }])).skills.find(
    (skill) => skill.id === 'cinnabar-eclipse',
  );
  assert.equal(legacyHpSkill.mp, 0);
  assert.equal(grownHpSkill.mp, 0);
  assert.equal(grownHpSkill.hp, legacyHpSkill.hp);
});

test('techniques receive shared flat attack and equipment damage, but not slot power or SP discounts', () => {
  const member = officialCharacter('pandora');
  member.equippedSkills = [LEARNABLE_SKILLS[0].id, LEARNABLE_SKILLS[1].id];
  const one = grownCombat(growth(member, 1, []));
  const advanced = growth(
    member,
    6,
    Array.from({ length: 5 }, () => ({
      entrySkill: 2,
      skill1: 2,
      skill1Sp: 1,
      skill2: 2,
      skill2Sp: 1,
    })),
  );
  const many = grownCombat(advanced);
  for (const skillId of member.equippedSkills) {
    const oneSpecial = one.skills.find((skill) => skill.id === skillId);
    const manySpecial = many.skills.find((skill) => skill.id === skillId);
    assert.deepEqual(manySpecial.effects, oneSpecial.effects);
    assert.equal(manySpecial.mp, oneSpecial.mp);
  }
  assert.notDeepEqual(many.skills[0].effects, one.skills[0].effects);

  const withAttack = growth(advanced, 6, [
    { ...advanced.growth.rolls[0], attack: 3 },
    ...advanced.growth.rolls.slice(1),
  ]);
  const trained = grownCombat(withAttack);
  const dealDamage = trained.skills.find((skill) => skill.id === LEARNABLE_SKILLS[1].id);
  const retreat = trained.skills.find((skill) => skill.id === LEARNABLE_SKILLS[0].id);
  assert.equal(dealDamage.effects[0].value, LEARNABLE_SKILLS[1].effects[0].value + 3);
  assert.equal(dealDamage.mp, LEARNABLE_SKILLS[1].mp);
  assert.deepEqual(
    retreat.effects.filter(({ type }) => type !== 'damage'),
    LEARNABLE_SKILLS[0].effects.filter(({ type }) => type !== 'damage'),
  );

  const gear = [{ stats: { attack: 2, skillDamage: 6 } }];
  const weaponized = compileCharacterCombat(withAttack, gear);
  const special = weaponized.skills.find((skill) => skill.id === LEARNABLE_SKILLS[1].id);
  const expectedDamage =
    Math.round(
      dealDamage.effects[0].value *
        ((member.combat.attack + gear[0].stats.attack) / member.combat.attack),
    ) + gear[0].stats.skillDamage;
  assert.equal(special.effects[0].value, expectedDamage);
});

test('startingShield grants opening block in newBattle and every expedition encounter', () => {
  const member = defaultProtagonist();
  const trained = growth(member, 4, [
    { startingShield: 2 },
    { startingShield: 1 },
    { startingShield: 2 },
  ]);
  const combat = grownCombat(trained);
  assert.equal(combat.startingShield, 5);

  const roster = { ...compileRoster(newLibrary()), aegis: { ...combat, id: 'aegis' } };
  const battle = newBattle(['hound'], roster);
  assert.equal(battle.units.aegis.block, 5);

  const expedition = newExpedition('bossGate', roster);
  const first = beginEncounter(expedition);
  assert.equal(first.units.aegis.block, 5);
  first.units.aegis.block = 0;
  first.phase = 'victory';
  completeEncounter(expedition, first);
  const second = beginEncounter(expedition);
  assert.equal(
    second.units.aegis.block,
    5,
    'startingShield refreshes at the start of every battle',
  );
});

test('kit-driven growth rates ignore dcAttrs, drop passive/buff slots to zero, and boost heavy entry skills', () => {
  const baseA = deriveGrowthRates(officialCharacter('edith').combat, 'common', 42);
  const memberWithDifferentDc = officialCharacter('edith');
  memberWithDifferentDc.dcAttrs = { str: 18, dex: 6, con: 18, int: 6, wis: 6, cha: 18 };
  const baseB = deriveGrowthRates(memberWithDifferentDc.combat, 'common', 42);
  assert.deepEqual(baseA, baseB, 'dcAttrs never shifts combat growth rates');

  const lumi = deriveGrowthRates(officialCharacter('lumi').combat, 'common', 42);
  assert.equal(lumi.entrySkill, 0, 'pure-buff entry skill gets 0% slot rate');
  assert.equal(lumi.skill2, 0, 'passive skill2 gets 0% slot rate');
  assert.equal(lumi.skill2Sp, 0, 'passive skill2 gets 0% SP discount rate');
  assert.ok(lumi.skill1 > 0.35 && lumi.attack > 0.3);

  const heavyEntryCombat = structuredClone(defaultProtagonist().combat);
  heavyEntryCombat.entrySkill.effects = [{ type: 'damage', value: 18 }];
  const lightEntryCombat = structuredClone(defaultProtagonist().combat);
  lightEntryCombat.entrySkill.effects = [{ type: 'damage', value: 4 }];
  assert.ok(
    deriveGrowthRates(heavyEntryCombat, 'common', 7).entrySkill >
      deriveGrowthRates(lightEntryCombat, 'common', 7).entrySkill,
  );
});

test('deterministic rolls guarantee >=2 stats, respect rare jackpot caps, and apply tier promotions', () => {
  const member = defaultProtagonist();
  member.combat.skills[0].mp = 8;
  const seen = {
    hp: false,
    startingShield: false,
    mp: false,
    attack: false,
    entrySkill: false,
    skill1: false,
    skill2: false,
    limit: false,
    skill1Sp: false,
  };
  for (let seed = 0; seed < 256; seed += 1) {
    const rec = restoreGrowth(
      { revision: GROWTH_REVISION, level: 2, seed, rarity: 'rare' },
      member.id,
      member.combat,
    );
    const roll = rec.rolls[0];
    const coreHits = [
      'hp',
      'startingShield',
      'mp',
      'attack',
      'entrySkill',
      'skill1',
      'skill2',
    ].filter((key) => (roll[key] || 0) > 0).length;
    assert.ok(coreHits >= 2, `anti-blank floor hit count was ${coreHits}`);
    for (const key of Object.keys(seen)) if (roll[key]) seen[key] = true;
  }
  for (const [key, hit] of Object.entries(seen)) {
    assert.equal(hit, true, `expected ${key} to tick across seeds`);
  }

  // Tier promotions at Lv.20/40/60/80/90 grant major spikes and respect base floor.
  const promoted = restoreGrowth(
    { revision: GROWTH_REVISION, level: 20, seed: 123, rarity: 'common' },
    member.id,
    member.combat,
  );
  const compiled20 = grownCombat({ ...member, growth: promoted });
  assert.ok(compiled20.hp >= member.combat.hp + PROMOTION_TIERS[20].floor.hp);
  assert.ok(compiled20.startingShield >= PROMOTION_TIERS[20].floor.startingShield);
  assert.ok(compiled20.attack >= member.combat.attack + PROMOTION_TIERS[20].floor.attack);
  assert.ok((promoted.rolls[18].hp || 0) >= PROMOTION_TIERS[20].hp);

  // Action-limit growth is capped at +2 from growth even across 99 levels.
  const lv99 = restoreGrowth(
    { revision: GROWTH_REVISION, level: 99, seed: 17, rarity: 'legendary' },
    member.id,
    member.combat,
  );
  const totalLimitGrowth = lv99.rolls.reduce((sum, r) => sum + (r.limit || 0), 0);
  assert.ok(totalLimitGrowth <= 2);
});

test('legacy saves (revisions 2-10) reroll once to revision 11 across all 9 official characters and remain stable', () => {
  for (const revision of [2, 3, 6, 9, 10]) {
    const library = newLibrary();
    for (const key of Object.keys(OFFICIAL_VISITORS))
      library.characters.push(officialCharacter(key));
    library.characters.push(officialCharacter('edith'), officialCharacter('pandora'));
    assert.equal(library.characters.length, 13);

    for (const char of library.characters) {
      char.growth = {
        revision,
        level: 5,
        xp: 42,
        seed: 771,
        rarity: 'rare',
        rolls: [{ attack: 20 }, { skill1: 18 }, { skill2: 22 }, { entrySkill: 24 }],
      };
    }

    const migrated = restoreLibrary(structuredClone(library));
    for (const char of migrated.characters) {
      assert.equal(char.growth.revision, GROWTH_REVISION);
      assert.equal(char.growth.level, 5);
      assert.equal(char.growth.xp, 42);
      assert.equal(char.growth.rolls.length, 4);
      const recalculated = restoreGrowth(
        { revision: GROWTH_REVISION, level: 5, xp: 42, seed: 771, rarity: 'rare' },
        char.id,
        char.combat,
      );
      assert.deepEqual(char.growth.rolls, recalculated.rolls);
    }

    const reloaded = restoreLibrary(JSON.parse(JSON.stringify(migrated)));
    for (let i = 0; i < migrated.characters.length; i += 1) {
      assert.deepEqual(reloaded.characters[i].growth, migrated.characters[i].growth);
      assert.deepEqual(grownCombat(reloaded.characters[i]), grownCombat(migrated.characters[i]));
    }
  }
});

test('higher-level recruits receive full level and promotion scaling upon creation', () => {
  const recruit = officialCharacter('luo-gongxu', { level: 22 });
  assert.equal(recruit.growth.revision, GROWTH_REVISION);
  assert.equal(recruit.growth.level, 22);
  assert.equal(recruit.growth.rolls.length, 21);
  const compiled = grownCombat(recruit);
  assert.ok(compiled.hp >= recruit.combat.hp + PROMOTION_TIERS[20].floor.hp);
  assert.ok(compiled.startingShield >= PROMOTION_TIERS[20].floor.startingShield);
});

test('same-revision level-ups refresh frozen combat at the next boundary', () => {
  const library = newCampaign(defaultProtagonist());
  const member = library.characters[0];
  const blueprint = LEARNABLE_SKILLS[1];
  member.equippedSkills = [blueprint.id];
  member.growth = restoreGrowth(
    { revision: GROWTH_REVISION, level: 1, xp: 0, seed: 91, rarity: 'common', rolls: [] },
    member.id,
    member.combat,
  );
  const roster = compileRoster(library);
  const frozen = structuredClone(roster.aegis);
  const expedition = newExpedition('bossGate', { aegis: frozen });
  expedition.partyIds = [...library.party];
  expedition.carried = newBattle(['hound'], { aegis: frozen });
  member.growth = restoreGrowth(
    {
      revision: GROWTH_REVISION,
      level: 2,
      xp: 0,
      seed: 91,
      rarity: 'common',
      rolls: [{ attack: 2, startingShield: 1, skill1: 1, skill1Sp: 1, skill2Sp: 1 }],
    },
    member.id,
    member.combat,
  );
  const expected = grownCombat(member);
  applyEncounterGrowth(expedition, library.characters);

  const refreshed = expedition.carried.heroDefinitions.aegis;
  assert.equal(refreshed.growthRevision, GROWTH_REVISION);
  assert.equal(refreshed.startingShield, 1);
  assert.deepEqual(refreshed.skills[0].effects, expected.skills[0].effects);
  assert.deepEqual(refreshed.skills[1].effects, expected.skills[1].effects);
  const special = refreshed.skills.find((skill) => skill.id === blueprint.id);
  const frozenSpecial = frozen.skills.find((skill) => skill.id === blueprint.id);
  assert.equal(special.effects[0].value, frozenSpecial.effects[0].value + 2);
  assert.equal(special.mp, blueprint.mp);
});

test('persisted revision 8 battle resumes frozen combat and migrates at next encounter', async () => {
  const library = newCampaign(defaultProtagonist());
  const member = library.characters[0];
  const specialIds = LEARNABLE_SKILLS.slice(0, 2).map(({ id }) => id);
  const equipment = [{ stats: { attack: 3, skillDamage: 6 }, rules: [] }];
  member.equippedSkills = specialIds;
  member.growth = {
    revision: 8,
    level: 2,
    xp: 17,
    seed: 91,
    rarity: 'common',
    rolls: [{ attack: 28, skill1: 20, skill1Sp: 1, skill2: 24, skill2Sp: 1 }],
  };
  const legacyCombat = compileCharacterCombat(member, equipment);
  const roster = compileRoster(library);
  roster.aegis = { ...legacyCombat, id: 'aegis', growthRevision: 8 };

  const expedition = newExpedition('bossGate', roster);
  expedition.partyIds = [...library.party];
  const activeScript = normalizeScript(adventureTestScript('forest'), 'growth-v8-durable');
  expedition.adventure = createAdventureState(activeScript, expedition.id);
  const state = advance(preview(beginEncounter(expedition), []));
  const targetId = state.enemyIds[0];
  for (const enemyId of state.enemyIds) if (enemyId !== targetId) state.units[enemyId].hp = 0;
  state.units[targetId].hp = 1;

  const durable = new Map();
  const database = {
    entries: () => [...durable],
    async write(entries, deleted = []) {
      for (const key of deleted) durable.delete(key);
      for (const [key, value] of entries) durable.set(key, structuredClone(value));
    },
  };
  const storage = createGameStorage(database);
  const session = {
    runtime: { mode: 'battle', disposed: false, needsStart: false },
    journey: { expedition },
    ai: { library, activeScript, storyView: null, chat: { quick: [] } },
    battle: { state, plan: [], history: [], playing: false },
  };
  const checkpoint = createCheckpoint({ session, storage, apiClient: { staticMode: true } });
  checkpoint.saveNow();
  await storage.flush();

  const reopened = createCheckpoint({
    session,
    storage: createGameStorage(database),
    apiClient: { staticMode: true },
  }).pending();
  const resumedLibrary = restoreLibrary(reopened.library);
  restoreAdventureResources(reopened, resumedLibrary);
  assert.equal(resumedLibrary.characters[0].growth.revision, GROWTH_REVISION);
  assert.equal(reopened.state.heroDefinitions.aegis.growthRevision, 8);

  const actionResult = preview(reopened.state, [
    makeAction(reopened.state, 'aegis', specialIds[1], targetId, 0),
  ]);
  completeEncounter(reopened.journey.expedition, advance(actionResult));
  reopened.journey.expedition.adventure.event.resolved = true;
  completeAdventureNode(reopened.journey.expedition, activeScript);
  applyEncounterGrowth(reopened.journey.expedition, resumedLibrary.characters);
  const nextDefinition = beginEncounter(reopened.journey.expedition).heroDefinitions.aegis;
  const expected = compileCharacterCombat(resumedLibrary.characters[0], equipment);
  assert.equal(nextDefinition.growthRevision, GROWTH_REVISION);
  assert.equal(nextDefinition.attack, expected.attack);
  assert.deepEqual(nextDefinition.skills, expected.skills);
});

test('bulk and incremental experience awards persist identical rolls and produce FE level rows', () => {
  const bulk = defaultProtagonist();
  bulk.growth = restoreGrowth(
    { revision: 5, level: 1, xp: 0, seed: 713, rarity: 'legendary' },
    bulk.id,
    bulk.combat,
  );
  const stepped = structuredClone(bulk);
  const total = xpToNext(1) + xpToNext(2) + 23;
  const allAtOnce = gainExperience(bulk, total);
  const first = gainExperience(stepped, xpToNext(1));
  const second = gainExperience(stepped, xpToNext(2));
  const remainder = gainExperience(stepped, 23);
  assert.deepEqual(allAtOnce.levels, [...first.levels, ...second.levels]);
  assert.deepEqual(bulk.growth, stepped.growth);
  assert.deepEqual(allAtOnce.after, remainder.after);
  assert.deepEqual(grownCombat(bulk), grownCombat(stepped));
  assert.ok(allAtOnce.levels[0].rows.some((row) => row.key === 'startingShield'));
  assert.ok(allAtOnce.levels[0].rows.some((row) => row.delta > 0));
});

test('pure integer growth labels exclude percentages and all 6 remaining official companions have 5 authored lines', () => {
  assert.equal(GROWTH_LABELS.attack, '攻击力');
  assert.equal(GROWTH_LABELS.startingShield, '开场护盾');
  assert.equal(growthGainText('attack', 2), '攻击力 +2');
  assert.equal(growthGainText('skill1Sp', 1), '技能1消耗 −1 SP');
  assert.equal(EQUIPMENT_STATS.attack, '攻击力');

  for (const id of [
    'official-aegis',
    'official-libet',
    'official-lumi',
    'official-yuto-nakashi',
    'official-luo-gongxu',
    'official-silica-laps',
    'official-edith',
    'official-pandora',
  ]) {
    const lines = levelLines({ id });
    assert.equal(lines.length, 5, `${id} should have 5 special level-up lines`);
    assert.notDeepEqual(lines, DEFAULT_LEVEL_LINES);
  }
  assert.equal(Object.hasOwn(OFFICIAL_LEVEL_LINES, 'character-qingyuan'), false);
});
