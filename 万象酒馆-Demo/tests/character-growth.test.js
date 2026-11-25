import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary, officialCharacter, restoreLibrary, compileRoster } from '../src/ai/library.js';
import { newCampaign } from '../src/campaign.js';
import { restoreAdventureResources } from '../src/adventure/restore-resources.js';
import { createAdventureState } from '../src/adventure/state.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { adventureTestScript } from '../src/content/generation-mode.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import {
  applyEncounterGrowth,
  compileCharacterCombat,
  gainExperience,
  GROWTH_LABELS,
  growthGainText,
  grownCombat,
  restoreGrowth,
  xpToNext,
} from '../src/growth.js';
import { LEARNABLE_SKILLS } from '../src/learnable-skills.js';
import { EQUIPMENT_STATS } from '../src/equipment-scale.js';
import { scaleLevelEffects, scaleMoveEffects } from '../src/combat-scale.js';
import { advance, makeAction, newBattle, preview } from '../src/engine.js';
import {
  beginEncounter,
  completeAdventureNode,
  completeEncounter,
  newExpedition,
} from '../src/expedition.js';
import { createCheckpoint } from '../src/storage/checkpoint.js';
import { createGameStorage } from '../src/storage/database.js';
import { applyEquipment } from '../src/equipment-combat.js';

const growth = (member, level, rolls) => ({
  ...member,
  growth: restoreGrowth({ revision: 6, level, xp: 0, seed: 415, rarity: 'epic', rolls }, member.id),
});

function effectsFor(combat, target) {
  if (target === 'attack') return [{ type: 'damage', value: combat.attack }];
  if (target === 'entrySkill') return combat.entrySkill.effects;
  return combat.skills[target === 'skill1' ? 0 : 1].effects;
}

test('each level independently grows its slot while attack growth is shared across damage', () => {
  for (const target of ['entrySkill', 'attack', 'skill1', 'skill2']) {
    const member = defaultProtagonist();
    const authored = structuredClone(member.combat);
    const baseline = grownCombat(growth(member, 1, []));
    const compiled = grownCombat(growth(member, 2, [{ [target]: 20 }]));
    assert.deepEqual(
      effectsFor(compiled, target),
      scaleLevelEffects(effectsFor(baseline, target), 1.2),
    );
    for (const other of ['entrySkill', 'attack', 'skill1', 'skill2']) {
      if (other === target) continue;
      if (target === 'attack') {
        assert.deepEqual(
          effectsFor(compiled, other),
          scaleMoveEffects(effectsFor(baseline, other), 1.2),
        );
      } else {
        assert.deepEqual(effectsFor(compiled, other), effectsFor(baseline, other));
      }
    }
    assert.equal(compiled.limit, baseline.limit);
    assert.deepEqual(member.combat, authored);
  }
});

test('skill SP discounts follow their native skill, preserve HP costs and exclude free skills', () => {
  for (const target of ['skill1', 'skill2']) {
    const member = officialCharacter('pandora');
    member.combat.skills[0].mp = 8;
    member.combat.skills[1].mp = 8;
    const compiled = grownCombat(growth(member, 2, [{ [target]: 20, [`${target}Sp`]: 1 }]));
    const discountedIndex = target === 'skill1' ? 0 : 1;
    assert.equal(compiled.skills[discountedIndex].mp, 7);
    assert.equal(compiled.skills[1 - discountedIndex].mp, 8);
  }
  const edith = officialCharacter('edith');
  const legacyHpSkill = edith.combat.skills.find((skill) => skill.id === 'cinnabar-eclipse');
  const grownHpSkill = grownCombat(growth(edith, 2, [{ skill2: 20, skill2Sp: 1 }])).skills.find(
    (skill) => skill.id === 'cinnabar-eclipse',
  );
  assert.equal(legacyHpSkill.mp, 0);
  assert.equal(grownHpSkill.mp, 0);
  assert.equal(grownHpSkill.hp, legacyHpSkill.hp);
});

test('shared attack growth scales marked damage once and describes it using the character mark', () => {
  const member = defaultProtagonist();
  member.combat.mechanicMark = { name: '测试标记', max: 3 };
  const strike = member.combat.skills[1].effects.find((effect) => effect.type === 'damage');
  strike.perMark = 5;
  const baseline = grownCombat(growth(member, 1, [])).skills[1];
  const trained = grownCombat(growth(member, 2, [{ attack: 20 }])).skills[1];
  assert.deepEqual(trained.effects, scaleMoveEffects(baseline.effects, 1.2));
  assert.equal(trained.effects.find((effect) => effect.type === 'damage').perMark, 6);
  assert.deepEqual(
    trained.effects.filter((effect) => effect.type !== 'damage'),
    [...member.combat.skills[1].effects.filter((effect) => effect.type !== 'damage')],
  );
  assert.deepEqual(
    grownCombat(growth(member, 2, [{ attack: 20 }])).skills[0].effects,
    member.combat.skills[0].effects,
  );
  const damage = trained.effects.find((effect) => effect.type === 'damage').value;
  assert(trained.text.includes(`造成${damage}伤害`));
  assert(trained.text.includes('每层测试标记增加6伤害'));
});

test('techniques receive shared attack and equipment damage, but not slot power or SP discounts', () => {
  const member = officialCharacter('pandora');
  member.equippedSkills = [LEARNABLE_SKILLS[0].id, LEARNABLE_SKILLS[1].id];
  const one = grownCombat(growth(member, 1, []));
  const advanced = growth(
    member,
    8,
    Array.from({ length: 7 }, () => ({
      entrySkill: 28,
      skill1: 28,
      skill1Sp: 1,
      skill2: 28,
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
  assert.equal(many.limit, one.limit);

  const withAttack = growth(advanced, 8, [
    { ...advanced.growth.rolls[0], attack: 28 },
    ...advanced.growth.rolls.slice(1),
  ]);
  const trained = grownCombat(withAttack);
  const dealDamage = trained.skills.find((skill) => skill.id === LEARNABLE_SKILLS[1].id);
  const retreat = trained.skills.find((skill) => skill.id === LEARNABLE_SKILLS[0].id);
  assert.deepEqual(dealDamage.effects, scaleMoveEffects(LEARNABLE_SKILLS[1].effects, 1.28));
  assert.ok(dealDamage.effects[0].value > LEARNABLE_SKILLS[1].effects[0].value);
  assert.equal(dealDamage.mp, LEARNABLE_SKILLS[1].mp);
  assert.deepEqual(retreat.effects, scaleMoveEffects(LEARNABLE_SKILLS[0].effects, 1.28));
  assert.deepEqual(
    retreat.effects.filter(({ type }) => type !== 'damage'),
    LEARNABLE_SKILLS[0].effects.filter(({ type }) => type !== 'damage'),
  );

  const gear = [{ stats: { attack: 2, skillDamage: 6 } }];
  const weaponized = compileCharacterCombat(withAttack, gear);
  const specialId = LEARNABLE_SKILLS[1].id;
  const special = weaponized.skills.find((skill) => skill.id === specialId);
  const unarmed = dealDamage;
  const expectedDamage =
    Math.round(
      unarmed.effects[0].value *
        ((member.combat.attack + gear[0].stats.attack) / member.combat.attack),
    ) + gear[0].stats.skillDamage;
  assert.equal(special.effects[0].value, expectedDamage);
  assert.equal(special.mp, unarmed.mp);
});

test('deterministic rolls cover every target and skill SP combination across seeds', () => {
  const member = defaultProtagonist();
  const seen = {
    entrySkill: [false, false],
    attack: [false, false],
    skill1: [false, false],
    skill2: [false, false],
  };
  const spSeen = { skill1: [false, false], skill2: [false, false] };
  const combos = { skill1: new Set(), skill2: new Set() };
  let empty = false;
  let attackHits = 0;
  let slotHits = 0;
  for (let seed = 0; seed < 4096; seed += 1) {
    const record = restoreGrowth({ revision: 6, level: 2, seed, rarity: 'common' }, member.id);
    const prior = restoreGrowth({ revision: 5, level: 2, seed, rarity: 'common' }, member.id);
    for (const target of ['entrySkill', 'skill1', 'skill2', 'skill1Sp', 'skill2Sp'])
      assert.equal(record.rolls[0][target], prior.rolls[0][target]);
    const roll = record.rolls[0];
    if (!roll || Object.keys(roll).length === 0) empty = true;
    for (const target of ['entrySkill', 'attack', 'skill1', 'skill2']) {
      const hit = Boolean(roll && roll[target]);
      seen[target][hit ? 1 : 0] = true;
      if (target === 'attack') attackHits += Number(hit);
      if (target === 'entrySkill') slotHits += Number(hit);
      if (target === 'skill1' || target === 'skill2') {
        const sp = Boolean(roll && roll[`${target}Sp`]);
        spSeen[target][sp ? 1 : 0] = true;
        combos[target].add(`${hit ? 1 : 0}${sp ? 1 : 0}`);
      }
    }
  }
  for (const target of ['entrySkill', 'attack', 'skill1', 'skill2']) {
    assert.deepEqual(seen[target], [true, true]);
  }
  assert.equal(empty, true);
  assert(attackHits < slotHits * 0.3, 'attack power should be substantially rarer than slot power');
  for (const target of ['skill1', 'skill2']) {
    assert.deepEqual(spSeen[target], [true, true]);
    assert.deepEqual([...combos[target]].sort(), ['00', '01', '10', '11']);
  }
});

test('a valid empty level roll remains empty after saving and reloading', () => {
  const member = defaultProtagonist();
  const first = restoreGrowth(
    { revision: 5, level: 2, seed: 415, rarity: 'common', rolls: [{}] },
    member.id,
  );
  assert.deepEqual(first.rolls, [{}]);
  assert.deepEqual(restoreGrowth(JSON.parse(JSON.stringify(first)), member.id).rolls, [{}]);
});

test('legacy growth migrates to saved deterministic rolls and reloading never rerolls them', () => {
  const savedRolls = {
    4: [{ attack: 21 }, { skill1: 18 }, { skill2: 22 }, { entrySkill: 24 }],
    5: [{}, { skill1: 19, skill1Sp: 1 }, { attack: 18 }, { skill2: 22 }],
    6: [{ attack: 28 }, {}, { entrySkill: 19 }, { skill2: 20, skill2Sp: 1 }],
    7: [{ attack: 24 }, { skill2Sp: 1 }, {}, { entrySkill: 22 }],
    8: [{ attack: 25 }, { skill1: 24, skill1Sp: 1 }, {}, { skill2: 18, skill2Sp: 1 }],
  };
  for (const revision of [2, 3, 4, 5, 6, 7, 8]) {
    const library = newLibrary();
    const member = library.characters[0];
    member.growth = {
      revision,
      level: 5,
      xp: 91,
      seed: 771,
      rarity: 'rare',
      ...(savedRolls[revision] ? { rolls: savedRolls[revision] } : {}),
      bonus: { manaCost: 9 },
    };
    const migrated = restoreLibrary(structuredClone(library));
    const record = migrated.characters.find((entry) => entry.id === member.id).growth;
    assert.equal(record.revision, 9);
    assert.equal(record.level, 5);
    assert.equal(record.xp, 91);
    assert.equal(record.seed, 771);
    assert.equal(record.rarity, 'rare');
    assert.equal(record.rolls.length, 4);
    if (savedRolls[revision]) assert.deepEqual(record.rolls, savedRolls[revision]);
    assert.equal(Object.hasOwn(record, 'bonus'), false);
    const reloaded = restoreLibrary(JSON.parse(JSON.stringify(migrated)));
    assert.deepEqual(reloaded.characters.find((entry) => entry.id === member.id).growth, record);
    assert.deepEqual(
      grownCombat(reloaded.characters.find((entry) => entry.id === member.id)),
      grownCombat(migrated.characters.find((entry) => entry.id === member.id)),
    );
  }
});

test('growth migration restores only a currently defined entry skill missing from an old snapshot', () => {
  const library = newCampaign(defaultProtagonist());
  const member = library.characters[0];
  const baselineEntry = grownCombat(growth(member, 1, [])).entrySkill;
  const frozen = structuredClone(compileRoster(library).aegis);
  delete frozen.entrySkill;
  frozen.growthRevision = 2;
  member.growth = restoreGrowth(
    { revision: 5, level: 2, xp: 0, seed: 91, rarity: 'common', rolls: [{ entrySkill: 20 }] },
    member.id,
  );
  const createExpedition = () => {
    const expedition = newExpedition('bossGate', { aegis: frozen });
    expedition.partyIds = [...library.party];
    expedition.carried = newBattle(['hound'], { aegis: frozen });
    return expedition;
  };

  const expedition = createExpedition();
  applyEncounterGrowth(expedition, library.characters);
  const migratedEntry = expedition.carried.heroDefinitions.aegis.entrySkill;
  assert.equal(migratedEntry.id, baselineEntry.id);
  assert.deepEqual(migratedEntry.effects, scaleLevelEffects(baselineEntry.effects, 1.2));

  const memberWithoutEntry = structuredClone(member);
  delete memberWithoutEntry.combat.entrySkill;
  delete memberWithoutEntry.setting.entrySkill;
  const legacyExpedition = createExpedition();
  applyEncounterGrowth(legacyExpedition, [memberWithoutEntry]);
  assert.equal(Object.hasOwn(legacyExpedition.carried.heroDefinitions.aegis, 'entrySkill'), false);
});

test('legacy growth refresh changes only the next battle boundary and is repeat-safe', () => {
  const library = newCampaign(defaultProtagonist());
  const member = library.characters[0];
  const frozen = structuredClone(compileRoster(library).aegis);
  assert.equal(frozen.entrySkill.id, 'entry-qingyuan');
  frozen.growthRevision = 2;
  const expedition = newExpedition('bossGate', { aegis: frozen });
  expedition.id = 'growth-boundary-run';
  expedition.partyIds = [...library.party];
  expedition.records.push({ index: 0, rewardId: 'growth-boundary-run:0' });
  expedition.index = 1;
  expedition.carried = newBattle(['hound'], { aegis: frozen });
  member.growth = restoreGrowth(
    { revision: 5, level: 2, xp: 17, seed: 91, rarity: 'common', rolls: [{ entrySkill: 20 }] },
    member.id,
  );
  const beforeHp = expedition.carried.units.aegis.hp;
  const partyIds = [...expedition.partyIds];
  const records = structuredClone(expedition.records);
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(restored.characters[0].combat.entrySkill.id, `${member.id}-entry`);
  applyEncounterGrowth(expedition, restored.characters);
  const entry = expedition.carried.heroDefinitions.aegis.entrySkill;
  assert.equal(entry.id, frozen.entrySkill.id);
  assert.equal(entry.effects[0].value, 14);
  assert(entry.text.includes('14伤害'));
  const migrated = structuredClone(expedition.carried);
  assert.equal(expedition.id, 'growth-boundary-run');
  assert.deepEqual(expedition.partyIds, partyIds);
  assert.deepEqual(expedition.records, records);
  assert.equal(expedition.carried.heroDefinitions.aegis.growthRevision, 9);
  assert.equal(expedition.carried.heroDefinitions.aegis.level, 2);
  assert.equal(expedition.carried.units.aegis.hp >= beforeHp, true);
  applyEncounterGrowth(expedition, restored.characters);
  assert.deepEqual(expedition.carried, migrated);
});

test('same-revision level-ups refresh frozen combat and final descriptions at the next boundary', () => {
  const library = newCampaign(defaultProtagonist());
  const member = library.characters[0];
  const blueprint = LEARNABLE_SKILLS[1];
  member.equippedSkills = [blueprint.id];
  member.growth = restoreGrowth(
    { revision: 6, level: 1, xp: 0, seed: 91, rarity: 'common', rolls: [] },
    member.id,
  );
  const roster = compileRoster(library);
  const frozen = structuredClone(roster.aegis);
  const expedition = newExpedition('bossGate', { aegis: frozen });
  expedition.partyIds = [...library.party];
  expedition.carried = newBattle(['hound'], { aegis: frozen });
  member.growth = restoreGrowth(
    {
      revision: 6,
      level: 2,
      xp: 0,
      seed: 91,
      rarity: 'common',
      rolls: [{ attack: 20, skill1: 20, skill1Sp: 1, skill2Sp: 1 }],
    },
    member.id,
  );
  const expected = grownCombat(member);
  member.equippedSkills = [LEARNABLE_SKILLS[0].id];

  applyEncounterGrowth(expedition, library.characters);

  const refreshed = expedition.carried.heroDefinitions.aegis;
  assert.equal(frozen.growthRevision, 9);
  assert.equal(refreshed.growthRevision, 9);
  assert.deepEqual(refreshed.skills[0].effects, expected.skills[0].effects);
  assert.deepEqual(refreshed.skills[1].effects, expected.skills[1].effects);
  assert.equal(refreshed.skills[0].text, expected.skills[0].text);
  assert.deepEqual(
    refreshed.skills.map(({ id }) => id),
    frozen.skills.map(({ id }) => id),
  );
  const special = refreshed.skills.find((skill) => skill.id === blueprint.id);
  const frozenSpecial = frozen.skills.find((skill) => skill.id === blueprint.id);
  assert.equal(frozenSpecial.effects[0].value, 8);
  assert.equal(
    special.effects[0].value,
    Math.round(frozenSpecial.effects[0].value * 1.2),
    'the frozen equipped technique receives only shared attack growth at the next encounter',
  );
  assert.equal(special.mp, blueprint.mp);
  for (const skill of refreshed.skills.filter((entry) => !entry.passive)) {
    for (const effect of skill.effects.filter((entry) => entry.type === 'damage'))
      assert(skill.text.includes(String(effect.value)));
  }
});

test('a revision 4 battle keeps its frozen combat until the next encounter', () => {
  const library = newCampaign(defaultProtagonist());
  const [member] = library.characters;
  member.growth.revision = 4;
  const roster = compileRoster(library);
  roster.aegis.growthRevision = 4;
  roster.aegis.attack += 7;
  const expedition = newExpedition('bossGate', roster);
  expedition.partyIds = [...library.party];
  const activeScript = normalizeScript(adventureTestScript('forest'), 'growth-v4');
  expedition.adventure = createAdventureState(activeScript, expedition.id);
  const state = beginEncounter(expedition);
  state.units.aegis.hp -= 2;
  const session = {
    runtime: { mode: 'battle' },
    journey: { expedition },
    ai: { library, activeScript, chat: { quick: [] } },
    battle: { state, plan: [], history: [] },
  };
  const rows = new Map();
  const storage = {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, value),
    removeItem: (key) => rows.delete(key),
  };
  const checkpoint = createCheckpoint({ session, storage, apiClient: { staticMode: true } });
  checkpoint.saveLibrary();
  const saved = checkpoint.pending();
  assert.ok(saved);
  const restored = restoreLibrary(saved.library);
  restoreAdventureResources(saved, restored);
  assert.equal(restored.characters.find(({ id }) => id === member.id).growth.revision, 9);
  assert.equal(saved.state.heroDefinitions.aegis.growthRevision, 4);
  assert.deepEqual(saved.state, JSON.parse(JSON.stringify(state)));

  const trip = saved.journey.expedition;
  saved.state.phase = 'victory';
  completeEncounter(trip, saved.state);
  assert.equal(trip.carried.heroDefinitions.aegis.growthRevision, 4);
  trip.adventure.event.resolved = true;
  completeAdventureNode(trip, activeScript);
  applyEncounterGrowth(trip, restored.characters);
  const next = beginEncounter(trip).heroDefinitions.aegis;
  assert.equal(next.growthRevision, 9);
  assert.equal(next.attack, compileRoster(restored).aegis.attack);
  assert.notEqual(next.attack, roster.aegis.attack);
});

test('a persisted revision 8 battle resumes frozen combat and migrates equipped growth next time', async () => {
  const library = newCampaign(defaultProtagonist());
  const member = library.characters[0];
  const specialIds = LEARNABLE_SKILLS.slice(0, 2).map(({ id }) => id);
  const equipment = [
    { stats: { attack: 3, skillDamage: 6 }, rules: [] },
    { stats: { attack: 2, skillDamage: 4 }, rules: [] },
  ];
  member.equippedSkills = specialIds;
  member.growth = {
    revision: 8,
    level: 2,
    xp: 17,
    seed: 91,
    rarity: 'common',
    rolls: [{ attack: 28, skill1: 20, skill1Sp: 1, skill2: 24, skill2Sp: 1 }],
  };
  const legacyMember = {
    ...member,
    growth: {
      ...member.growth,
      rolls: member.growth.rolls.map(({ attack: _attack, ...roll }) => roll),
    },
  };
  const legacyCombat = compileCharacterCombat(legacyMember, equipment);
  const roster = compileRoster(library);
  roster.aegis = {
    ...legacyCombat,
    id: 'aegis',
    growthRevision: 8,
  };

  const expedition = newExpedition('bossGate', roster);
  expedition.partyIds = [...library.party];
  const activeScript = normalizeScript(adventureTestScript('forest'), 'growth-v8-durable');
  expedition.adventure = createAdventureState(activeScript, expedition.id);
  const state = advance(preview(beginEncounter(expedition), []));
  const targetId = state.enemyIds[0];
  for (const enemyId of state.enemyIds) {
    if (enemyId !== targetId) state.units[enemyId].hp = 0;
  }
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

  const reopenedStorage = createGameStorage(database);
  const reopened = createCheckpoint({
    session,
    storage: reopenedStorage,
    apiClient: { staticMode: true },
  }).pending();
  assert.ok(reopened, 'the legacy checkpoint remains resumable after storage reload');
  assert.equal(reopened.state.heroDefinitions.aegis.growthRevision, 8);
  const resumedLibrary = restoreLibrary(reopened.library);
  restoreAdventureResources(reopened, resumedLibrary);
  assert.equal(resumedLibrary.characters[0].growth.revision, 9);
  assert.equal(reopened.state.heroDefinitions.aegis.growthRevision, 8);

  const resumedSession = {
    ...session,
    journey: reopened.journey,
    ai: { ...session.ai, library: resumedLibrary },
    battle: { ...session.battle, state: reopened.state },
  };
  const resumedCheckpoint = createCheckpoint({
    session: resumedSession,
    storage: reopenedStorage,
    apiClient: { staticMode: true },
  });
  resumedCheckpoint.saveLibrary();
  await reopenedStorage.flush();

  const persistedStorage = createGameStorage(database);
  const persisted = createCheckpoint({
    session: resumedSession,
    storage: persistedStorage,
    apiClient: { staticMode: true },
  }).pending();
  assert.ok(persisted);
  assert.equal(persisted.library.characters[0].growth.revision, 9);
  assert.equal(persisted.state.heroDefinitions.aegis.growthRevision, 8);
  const frozenSpecial = persisted.state.heroDefinitions.aegis.skills.find(
    ({ id }) => id === specialIds[1],
  );
  const legacyDamage = legacyCombat.skills.find(({ id }) => id === specialIds[1]).effects[0].value;
  assert.equal(frozenSpecial.effects[0].value, legacyDamage);
  assert.equal(frozenSpecial.mp, LEARNABLE_SKILLS[1].mp);

  // Continue from the durable checkpoint readback, not the pre-read journey clone.
  resumedSession.journey = persisted.journey;
  const actionResult = preview(persisted.state, [
    makeAction(persisted.state, 'aegis', specialIds[1], targetId, 0),
  ]);
  assert.equal(actionResult.valid, true);
  assert.equal(actionResult.outcome, 'victory');
  assert.equal(
    actionResult.events.find(({ skill }) => skill === specialIds[1])?.after.units[targetId].hp,
    0,
    'the resumed battle resolves an action using the frozen legacy special',
  );

  completeEncounter(persisted.journey.expedition, advance(actionResult));
  persisted.journey.expedition.adventure.event.resolved = true;
  completeAdventureNode(persisted.journey.expedition, activeScript);
  applyEncounterGrowth(persisted.journey.expedition, resumedLibrary.characters);
  const nextState = beginEncounter(persisted.journey.expedition);
  const nextDefinition = nextState.heroDefinitions.aegis;
  const upgradedSpecial = nextDefinition.skills.find(({ id }) => id === specialIds[1]);
  const expected = compileCharacterCombat(resumedLibrary.characters[0], equipment);
  const expectedSpecial = expected.skills.find(({ id }) => id === specialIds[1]);
  assert.equal(nextDefinition.growthRevision, 9);
  assert.equal(nextDefinition.attack, expected.attack);
  assert.deepEqual(upgradedSpecial.effects, expectedSpecial.effects);
  assert.equal(upgradedSpecial.mp, LEARNABLE_SKILLS[1].mp);
  assert.notEqual(upgradedSpecial.effects[0].value, legacyDamage);
  assert.notDeepEqual(
    upgradedSpecial.effects,
    applyEquipment(expected, equipment).skills.find(({ id }) => id === specialIds[1]).effects,
    'the next-encounter migration does not stack the frozen equipment a second time',
  );

  resumedSession.battle.state = nextState;
  resumedCheckpoint.saveLibrary();
  await reopenedStorage.flush();
  const finalStorage = createGameStorage(database);
  const finalSnapshot = createCheckpoint({
    session: resumedSession,
    storage: finalStorage,
    apiClient: { staticMode: true },
  }).pending();
  assert.ok(finalSnapshot, 'the migrated next encounter is saved as a playable checkpoint');
  assert.equal(finalSnapshot.library.characters[0].growth.revision, 9);
  assert.equal(finalSnapshot.state.heroDefinitions.aegis.growthRevision, 9);
  assert.deepEqual(
    finalSnapshot.state.heroDefinitions.aegis.skills.find(({ id }) => id === specialIds[1]).effects,
    expectedSpecial.effects,
  );
});

test('revision 6–8 snapshots switch to shared attack only for techniques at the next encounter', () => {
  for (const [revision, legacyDamage] of [
    [6, 12],
    [7, 8],
    [8, 8],
  ]) {
    const library = newCampaign(defaultProtagonist());
    const [member] = library.characters;
    const techniques = LEARNABLE_SKILLS.slice(0, 2);
    const rolls = [{ attack: 28 }, { skill1: 20, skill1Sp: 1 }, {}];
    member.growth = { revision, level: 4, xp: 39, seed: 91, rarity: 'common', rolls };
    member.equippedSkills = techniques.map(({ id }) => id);
    const roster = compileRoster(library);
    roster.aegis.growthRevision = revision;
    for (const technique of techniques) {
      const historicalDamage = technique === techniques[0] ? 9 : legacyDamage;
      roster.aegis.skills.find(({ id }) => id === technique.id).effects[0].value = historicalDamage;
    }
    const expedition = newExpedition('bossGate', roster);
    expedition.partyIds = [...library.party];
    const state = beginEncounter(expedition);
    const frozenDamage = Object.fromEntries(
      techniques.map(({ id }) => [
        id,
        state.heroDefinitions.aegis.skills.find((skill) => skill.id === id).effects[0].value,
      ]),
    );

    const saved = JSON.parse(JSON.stringify({ library, state, journey: { expedition } }));
    const restored = restoreLibrary(saved.library);
    restoreAdventureResources(saved, restored);
    const trip = saved.journey.expedition;
    const restoredMember = restored.characters.find(({ id }) => id === member.id);
    assert.deepEqual(restoredMember.growth, { ...member.growth, revision: 9 });
    assert.deepEqual(saved.state, JSON.parse(JSON.stringify(state)));
    assert.equal(saved.state.heroDefinitions.aegis.growthRevision, revision);
    for (const technique of techniques) {
      assert.equal(
        saved.state.heroDefinitions.aegis.skills.find(({ id }) => id === technique.id).effects[0]
          .value,
        frozenDamage[technique.id],
      );
    }

    saved.state.phase = 'victory';
    completeEncounter(trip, saved.state);
    applyEncounterGrowth(trip, restored.characters);
    const next = beginEncounter(trip).heroDefinitions.aegis;
    assert.equal(next.growthRevision, 9);
    assert.equal(next.level, 4);
    assert.equal(next.attack, roster.aegis.attack);
    for (const technique of techniques) {
      const refreshed = next.skills.find(({ id }) => id === technique.id);
      assert.deepEqual(refreshed.effects, scaleMoveEffects(technique.effects, 1.28));
      assert.equal(refreshed.mp, technique.mp);
    }
    assert.deepEqual(restoredMember.growth.rolls, rolls);
  }
});

test('bulk and incremental experience awards persist identical independent level rolls', () => {
  const bulk = defaultProtagonist();
  bulk.growth = restoreGrowth(
    { revision: 5, level: 1, xp: 0, seed: 713, rarity: 'legendary' },
    bulk.id,
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
});

test('growth and equipment attack labels use attack power', () => {
  assert.equal(GROWTH_LABELS.attack, '攻击力');
  assert.equal(growthGainText('attack', 20), '攻击力 +20%');
  assert.equal(EQUIPMENT_STATS.attack, '攻击力');
});
