import test from 'node:test';
import assert from 'node:assert/strict';
import { gainExperience, xpToNext, grownCombat, restoreGrowth } from '../src/growth.js';
import { combatScale } from '../src/combat-scale.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { newExpedition, beginEncounter, completeEncounter, chooseRest } from '../src/expedition.js';
import { newBattle, preview, makeReposition, advance, campRest } from '../src/engine.js';
import { performedRetreat } from '../src/companion-events.js';
import { mergedArchiveItems } from '../src/archives.js';
import { nextArcPhase, arcFor } from '../src/story-arc.js';
import { syncBuiltinWorldbook } from '../src/ai/worldbook.js';
import { createCheckpoint } from '../src/storage/checkpoint.js';
import { readFile } from 'node:fs/promises';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { applyEquipment } from '../src/equipment.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { characterDocument } from './fixtures/ai.js';
import { levelLines } from '../src/content/level-dialogue.js';

test('growth preserves legacy XP progress and reconciles reproducible curve gains', () => {
  assert.deepEqual([1, 2, 5].map(xpToNext), [180, 225, 360]);
  const id = defaultProtagonist().id;
  for (const [level, oldXp, newXp] of [
    [1, 120, 90],
    [5, 560, 180],
  ]) {
    const legacy = { level, xp: oldXp, revision: 1, seed: 7, rarity: 'common' };
    const migrated = restoreGrowth(legacy, id);
    assert.deepEqual([migrated.level, migrated.xp, migrated.revision], [level, newXp, 8]);
    assert.equal(migrated.rolls.length, level - 1);
    assert.deepEqual(restoreGrowth(migrated, id), migrated);
    assert.deepEqual(legacy, { level, xp: oldXp, revision: 1, seed: 7, rarity: 'common' });
  }
  const stats = (combat) => ({
    hp: combat.hp,
    mp: combat.mp,
    attack: combat.attack,
  });
  const scale = combatScale(2);
  for (let seed = 1; seed < 801; seed++) {
    const member = defaultProtagonist();
    member.growth = { level: 1, xp: 0, revision: 2, seed, rarity: 'common' };
    const authored = structuredClone(member.combat);
    const baseline = grownCombat(member);
    assert.deepEqual(stats(baseline), stats(authored));
    const copy = structuredClone(member);
    const award = gainExperience(member, xpToNext(1));
    assert.deepEqual(award, gainExperience(copy, xpToNext(1)));
    assert.deepEqual(award.before, { level: 1, xp: 0 });
    assert.deepEqual(award.after, { level: 2, xp: 0 });
    const combat = grownCombat(member);
    const expected = {
      hp: Math.round(authored.hp * scale),
      mp: Math.round(authored.mp * Math.sqrt(scale)),
      attack: Math.round(authored.attack * (1 + (member.growth.rolls[0]?.attack || 0) / 100)),
    };
    assert.deepEqual(stats(combat), expected);
    const roll = member.growth.rolls[0];
    const gains = Object.fromEntries(
      ['hp', 'mp']
        .map((key) => [key, expected[key] - baseline[key]])
        .filter(([, delta]) => delta > 0),
    );
    if (roll.attack) gains.attack = roll.attack;
    const power = (skill) => JSON.stringify([skill.effects, skill.rules, skill.endHeal]);
    for (const [target, oldSkill, newSkill] of [
      ['entrySkill', baseline.entrySkill, combat.entrySkill],
      ['skill1', baseline.skills[0], combat.skills[0]],
      ['skill2', baseline.skills[1], combat.skills[1]],
    ]) {
      if (roll[target] && power(oldSkill) !== power(newSkill)) gains[target] = roll[target];
      if (roll[`${target}Sp`] && oldSkill.mp > newSkill.mp)
        gains[`${target}Sp`] = oldSkill.mp - newSkill.mp;
    }
    assert.deepEqual(award.levels, [{ level: 2, gains }]);
    assert.deepEqual([member.growth.level, member.growth.xp], [2, 0]);
    assert.deepEqual(copy, member);
    assert.deepEqual(grownCombat(copy), combat);
    for (const skill of combat.skills.filter((skill) => !skill.passive)) {
      assert(!/[{}]|成长/.test(skill.text));
      for (const effect of skill.effects.filter((effect) => effect.type === 'damage')) {
        assert(skill.text.includes(String(effect.value)));
      }
    }
    assert.deepEqual(member.combat, authored);
  }
  const bulk = defaultProtagonist();
  bulk.growth = { level: 1, xp: 0, revision: 2, seed: 7, rarity: 'common' };
  const stepped = structuredClone(bulk);
  const thresholds = [1, 2, 3].map(xpToNext);
  const bulkAward = gainExperience(
    bulk,
    thresholds.reduce((sum, xp) => sum + xp, 17),
  );
  const levelRecords = [];
  for (const threshold of thresholds) {
    levelRecords.push(...gainExperience(stepped, threshold).levels);
  }
  const remainder = gainExperience(stepped, 17);
  assert.deepEqual(remainder.levels, []);
  assert.deepEqual(bulkAward.after, { level: 4, xp: 17 });
  assert.deepEqual(remainder.after, { level: 4, xp: 17 });
  assert.deepEqual([bulk.growth.level, bulk.growth.xp], [4, 17]);
  assert.deepEqual(bulkAward.levels, levelRecords);
  assert.deepEqual(bulk.growth, stepped.growth);
  assert.deepEqual(grownCombat(bulk), grownCombat(stepped));
});

test('ordinary victory preserves resources and the third battle grants exactly one rest choice', () => {
  for (const choice of ['sleep', 'meal']) {
    const expedition = newExpedition();
    for (let index = 0; index < 3; index++) {
      const state = beginEncounter(expedition);
      state.phase = 'victory';
      for (const id of state.formation.filter(Boolean)) {
        state.units[id].hp = 4;
        state.units[id].mp = 1;
      }
      completeEncounter(expedition, state);
      for (const id of state.formation.filter(Boolean)) {
        assert.equal(expedition.carried.units[id].hp, 4);
        assert.equal(expedition.carried.units[id].mp, 1);
      }
    }
    assert.equal(expedition.restPending, true);
    assert.throws(() => beginEncounter(expedition), /睡眠|用餐/);
    const changes = chooseRest(expedition, choice);
    assert(changes.length > 0);
    for (const change of changes) {
      assert.equal(change.after, choice === 'sleep' ? 4 + Math.ceil((change.maxHp - 4) * 0.6) : 4);
      assert.equal(change.mp, choice === 'meal' ? 1 + Math.ceil((change.maxMp - 1) * 0.6) : 1);
    }
    assert.throws(() => chooseRest(expedition, choice));
    assert.equal(beginEncounter(expedition).encounter, 3);
    const second = campRest(expedition.carried);
    assert.equal(second.state.units[changes[0].id].hp, changes[0].after);
  }
});

test('a front character can retreat to an empty rear slot and all front slots may remain empty', () => {
  const state = newBattle(['mossSlime']);
  state.formation = ['aegis', null, null, null, null, null];
  const result = preview(state, [makeReposition(0, 3, 0)]);
  assert(result.valid, JSON.stringify(result.invalid));
  assert(performedRetreat(state, result));
  assert.deepEqual(result.final.formation.slice(0, 3), [null, null, null]);
  assert.notEqual(result.outcome, 'defeat');
  const next = advance(result);
  const attack = preview(next, []);
  assert(
    attack.events
      .filter((event) => event.type === 'enemy')
      .every((event) => event.targets.length === 0),
  );
});

test('archive catalog merges same-name acquisitions into one row and retains every distinct source', () => {
  const items = ['ruins', 'forest', 'ruins'].map((map, index) => ({
    id: 'item-' + index,
    name: '残晶',
    description: '晶体',
    value: 10,
    source: { runId: 'run-' + index, encounter: index, map, title: '旅途' + index },
  }));
  const merged = mergedArchiveItems(items);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].sources.length, 3);
  assert.equal(merged[0].archiveIds.length, 3);
  assert.equal(items.length, 3, 'physical rewards remain available for exact per-run accounting');
});

test('six story phases advance concretely and worldbook migration preserves personal prose', () => {
  let hook = null;
  const phases = [];
  for (let index = 0; index < 7; index++) {
    const phase = nextArcPhase(hook);
    phases.push(phase);
    hook = { phase, setting: '下一步到大厅开门' };
  }
  assert.deepEqual(phases, ['起', '承1', '承2', '转1', '转2', '合', '起']);
  assert.equal(arcFor({ storyArc: { phase: '承2' } }).phase, '承2');
  assert.equal(levelLines({ id: 'unknown' }).length, 10);
  assert.equal(levelLines({ id: 'official-pandora' }).length, 5);
  assert.equal(levelLines({ id: 'official-edith' }).length, 5);
  const library = newCampaign(defaultProtagonist());
  assert(library.characters.length > 0);
});

test('checkpoint captures accepted rest coherently but loading discards battle and preserves earned inventory', () => {
  const expedition = newExpedition();
  let state;
  for (let index = 0; index < 3; index++) {
    state = beginEncounter(expedition);
    state.phase = 'victory';
    state.units.aegis.hp = 8;
    state.units.aegis.mp = 2;
    completeEncounter(expedition, state);
  }
  expedition.pendingResult = {
    won: true,
    encounter: 2,
    awards: [],
    loot: [],
    rewards: { gold: 20 },
  };
  const values = new Map();
  const context = {
    apiClient: { staticMode: true },
    storage: {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    session: {
      runtime: { mode: 'battle' },
      battle: { state, plan: [], history: [] },
      journey: { expedition },
      ai: { library: newLibrary(), chat: { quick: [] } },
    },
  };
  const checkpoint = createCheckpoint(context);
  checkpoint.saveNow();
  const key = 'wanxiang.battle-checkpoint.v1';
  assert.equal(JSON.parse(values.get(key)).journey.expedition.restPending, true);
  chooseRest(expedition, 'meal');
  checkpoint.saveNow();
  const restored = JSON.parse(values.get(key)).journey.expedition;
  assert.equal(restored.restPending, false);
  assert.equal(restored.pendingResult.encounter, 2);
  assert.equal(
    restored.carried.units.aegis.mp,
    2 + Math.ceil((restored.carried.units.aegis.maxMp - 2) * 0.6),
  );
  assert.throws(() => chooseRest(restored, 'sleep'));
  const inventory = structuredClone(context.session.ai.library.inventory);
  assert.equal(checkpoint.pending(), null);
  assert(!values.has(key));
  assert.deepEqual(context.session.ai.library.inventory, inventory);
  checkpoint.dispose();
});

test('equipment final damage and protagonist level dialogue remain correct after save reload', () => {
  const member = normalizeCharacter(characterDocument(), 'character-level-quotes');
  member.levelUpLines = Array.from({ length: 5 }, (_, index) => `继续前行${index + 1}。`);
  const library = newLibrary();
  library.characters.push(member);
  const restored = restoreLibrary(library).characters.find((entry) => entry.id === member.id);
  assert.deepEqual(restored.levelUpLines, member.levelUpLines);
  const combat = applyEquipment(grownCombat(member), [{ stats: { skillDamage: 3 } }]);
  for (const skill of combat.skills.filter((skill) => !skill.passive)) {
    for (const effect of skill.effects.filter((effect) => effect.type === 'damage'))
      assert(skill.text.includes(String(effect.value)));
    assert(!/[{}]|成长/.test(skill.text));
  }
});

test('current authored worldbook rules are injected once and legacy growth and active-only guidance are retired', async () => {
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const legacy = {
    entries: {
      0: {
        content: '升级由程序对六项分别判定，生命成长+2、其余成长+1',
        extensions: { wanxiang: { generationRule: 'character-numbers' } },
      },
      1: {
        content: '两个技能至少一个主动。保留这段自定义描述。',
        extensions: { wanxiang: { generationRule: 'character-mechanics' } },
      },
      2: {
        content: '旧版剧本规则',
        extensions: { wanxiang: { generationRule: 'script-facts' } },
      },
    },
  };
  const original = structuredClone(legacy);
  const next = syncBuiltinWorldbook(legacy, builtin);
  assert.equal(
    Object.values(next.entries).some((entry) =>
      ['character-numbers', 'character-mechanics'].includes(
        entry.extensions?.wanxiang?.generationRule,
      ),
    ),
    false,
  );
  assert.equal(next.entries[1], undefined);
  for (const key of ['character-output', 'script-facts']) {
    const rules = (book) =>
      Object.values(book.entries).filter(
        (entry) => entry.extensions?.wanxiang?.generationRule === key,
      );
    assert.deepEqual(
      rules(next).map(({ content }) => content),
      [rules(builtin)[0].content],
    );
  }
  assert.equal(next.entries[2].extensions.wanxiang.generationRule, 'script-facts');
  assert.deepEqual(syncBuiltinWorldbook(next, builtin), next);
  assert.deepEqual(legacy, original);
});
