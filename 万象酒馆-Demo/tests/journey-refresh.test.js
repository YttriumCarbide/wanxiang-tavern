import test from 'node:test';
import assert from 'node:assert/strict';
import { gainExperience, xpToNext, grownCombat } from '../src/growth.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { newExpedition, beginEncounter, completeEncounter, chooseRest } from '../src/expedition.js';
import { newBattle, preview, makeReposition, advance, campRest } from '../src/engine.js';
import { performedRetreat } from '../src/companion-events.js';
import { mergedArchiveItems } from '../src/archives.js';
import { nextArcPhase, arcFor } from '../src/story-arc.js';
import { upgradeGameRules } from '../src/ai/game-rules-upgrade.js';
import { createCheckpoint } from '../src/storage/checkpoint.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { applyEquipment } from '../src/equipment.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { characterDocument } from './fixtures/ai.js';
import { levelLines } from '../src/content/level-dialogue.js';

test('slower growth awards a total of one to three points with reproducible weighted choices', () => {
  assert(xpToNext(1) >= 240);
  assert(xpToNext(5) > xpToNext(1) * 3);
  const counts = { hp: 0, mp: 0, attack: 0, skillDamage: 0, limit: 0, manaCost: 0 };
  for (let seed = 1; seed < 801; seed++) {
    const member = defaultProtagonist();
    member.growth = { level: 1, xp: 0, seed, rarity: 'common' };
    const copy = structuredClone(member);
    const award = gainExperience(member, xpToNext(1));
    assert.deepEqual(award, gainExperience(copy, xpToNext(1)));
    assert.deepEqual(award.before, { level: 1, xp: 0 });
    assert.deepEqual(award.after, { level: 2, xp: 0 });
    const gains = award.levels[0].gains;
    const points = Object.values(gains).reduce((a, b) => a + b, 0);
    assert(points >= 1 && points <= 3);
    for (const [key, value] of Object.entries(gains)) counts[key] += value;
    for (const skill of grownCombat(member).skills.filter((skill) => !skill.passive)) {
      assert(!/[{}]|成长/.test(skill.text));
      for (const effect of skill.effects.filter((effect) => effect.type === 'damage'))
        assert(skill.text.includes(String(effect.value)));
    }
  }
  assert(counts.hp > counts.mp && counts.mp > counts.attack);
  assert(counts.attack > counts.skillDamage && counts.attack > counts.limit);
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
      assert.equal(
        change.after,
        choice === 'sleep' ? Math.min(change.maxHp, 4 + Math.floor(change.maxHp * 0.4)) : 4,
      );
      assert.equal(change.mp, choice === 'meal' ? change.maxMp : 1);
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
  const book = {
    entries: {
      a: {
        content: '玩家自己的文风。第五段在Boss获胜后展示',
        extensions: { wanxiang: { generationRule: 'script-output' } },
      },
    },
  };
  const upgraded = upgradeGameRules(book);
  assert(upgraded.entries.a.content.includes('玩家自己的文风。'));
  assert(!upgraded.entries.a.content.includes('第五段在Boss获胜后展示'));
  assert(upgraded.entries.a.content.includes('70%'));
  assert.deepEqual(upgradeGameRules(upgraded), upgraded);
  assert.equal(book.entries.a.content, '玩家自己的文风。第五段在Boss获胜后展示');
  assert.equal(levelLines({ id: 'unknown' }).length, 10);
  assert.equal(levelLines({ id: 'official-pandora' }).length, 5);
  assert.equal(levelLines({ id: 'official-edith' }).length, 5);
  const library = newCampaign(defaultProtagonist());
  assert(library.characters.length > 0);
});

test('accepted settlement and rest choice survive a static refresh as one coherent snapshot', () => {
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
  assert.equal(checkpoint.pending().journey.expedition.restPending, true);
  chooseRest(expedition, 'meal');
  checkpoint.saveNow();
  const restored = checkpoint.pending().journey.expedition;
  assert.equal(restored.restPending, false);
  assert.equal(restored.pendingResult.encounter, 2);
  assert.equal(restored.carried.units.aegis.mp, restored.carried.units.aegis.maxMp);
  assert.throws(() => chooseRest(restored, 'sleep'));
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

test('current authored worldbook rules are injected once and legacy growth and active-only guidance are retired', () => {
  const legacy = {
    entries: {
      grow: {
        content: '升级由程序对六项分别判定，生命成长+2、其余成长+1',
        extensions: { wanxiang: { generationRule: 'growth-numbers' } },
      },
      skill: {
        content: '两个技能至少一个主动。保留这段自定义描述。',
        extensions: { wanxiang: { generationRule: 'character-mechanics' } },
      },
      current: {
        content: '【1.3 行程与成长规则更新】\n新的推进指导。',
        extensions: { wanxiang: { generationRule: 'script-output' } },
      },
    },
  };
  const next = upgradeGameRules(legacy);
  assert(!next.entries.grow.content.includes('分别判定'));
  assert(next.entries.grow.content.includes('1～3点'));
  assert(!next.entries.skill.content.includes('至少一个主动'));
  assert(next.entries.skill.content.includes('保留这段自定义描述。'));
  assert(next.entries.current.content.startsWith(legacy.entries.current.content));
  assert(next.entries.current.content.includes('【多元探索规则】'));
  assert.deepEqual(upgradeGameRules(next), next);
});
