import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCooperationHit, claimCooperationAffection } from '../src/cooperation.js';
import { newLibrary, officialCharacter, restoreLibrary } from '../src/ai/library.js';
import { gainExperience, grownCombat, xpToNext } from '../src/growth.js';
import { equipEmblem, EMBLEMS } from '../src/emblems.js';
import { rulesFor, ruleAvailable, ruleUsageKey } from '../src/triggers.js';
import { upgradePlaytestWorldbook } from '../src/ai/playtest-upgrade.js';
import { PANDORA } from '../src/content/pandora.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { compactCharacterDocument } from './fixtures/ai.js';

test('cooperation selects only the last two direct hits and current adjacent positions', () => {
  const state = {
    formation: ['aegis', 'lyria', 'morrow', 'serin', null, null],
    units: {
      aegis: { side: 'hero' },
      lyria: { side: 'hero' },
      morrow: { side: 'hero' },
      hound: { side: 'enemy', hp: 20 },
    },
  };
  recordCooperationHit(state, 'aegis', 'hound', 4);
  recordCooperationHit(state, 'morrow', 'hound', 4);
  state.units.hound.hp = 0;
  recordCooperationHit(state, 'lyria', 'hound', 12);
  assert.deepEqual(state.cooperations, [{ enemy: 'hound', actors: ['morrow', 'lyria'] }]);
  const lone = structuredClone(state);
  lone.cooperationHits = {};
  lone.cooperations = [];
  recordCooperationHit(lone, 'aegis', 'hound', 20);
  assert.deepEqual(lone.cooperations, []);
  const distant = structuredClone(lone);
  distant.cooperationHits = { hound: ['aegis'] };
  recordCooperationHit(distant, 'morrow', 'hound', 20);
  assert.deepEqual(distant.cooperations, []);
  const repeated = structuredClone(lone);
  repeated.cooperationHits = { hound: ['aegis'] };
  recordCooperationHit(repeated, 'aegis', 'hound', 20);
  assert.deepEqual(repeated.cooperations, []);
});

test('cooperation affection requires protagonist and is claimed once per encounter', () => {
  const library = newLibrary();
  library.campaign = { protagonistId: library.party[0] };
  const expedition = { id: 'test-cooperation', partyIds: [...library.party] };
  const result = { final: { encounter: 0, cooperations: [{ actors: ['aegis', 'lyria'] }] } };
  assert.equal(claimCooperationAffection(library, expedition, result).delta, 1);
  assert.equal(claimCooperationAffection(library, expedition, result), null);
  assert.equal(library.relationships[library.party[1]].affection, 1);
  result.final.encounter = 1;
  assert.equal(claimCooperationAffection(library, expedition, result).delta, 1);
  result.final.encounter = 2;
  result.final.cooperations[0].actors = ['lyria', 'morrow'];
  assert.equal(claimCooperationAffection(library, expedition, result), null);
});

test('growth stops choosing action and mana reduction at the requested caps', () => {
  const member = officialCharacter('pandora');
  member.combat.skills.forEach((skill) => {
    skill.mp = 3;
  });
  member.growth.bonus.limit = 12;
  member.growth.bonus.manaCost = 12;
  const awards = gainExperience(member, xpToNext(1) + xpToNext(2) + xpToNext(3));
  assert(awards.levels.every((level) => !level.gains.limit && !level.gains.manaCost));
  const combat = grownCombat(member);
  assert.equal(combat.limit, 2);
  assert(combat.skills.every((skill) => skill.mp === 3));
  assert.deepEqual([PANDORA.skills[1].ap, PANDORA.skills[1].mp], [1, 18]);
});

test('rings transfer atomically between party members and survive restoration', () => {
  const library = newLibrary();
  const ring = Object.keys(EMBLEMS)[0];
  library.emblems = [ring];
  equipEmblem(library, library.party[0], ring);
  equipEmblem(library, library.party[1], ring);
  assert.equal(library.characters[0].emblemId, null);
  assert.equal(library.characters[1].emblemId, ring);
  assert.equal(
    restoreLibrary(library).characters.filter((member) => member.emblemId === ring).length,
    1,
  );
});

test('equipment availability reads the same condition and scope counter as the engine', () => {
  const definition = {
    id: 'a',
    skills: [],
    equipment: [
      {
        id: 'ring',
        name: '晶环',
        rules: [
          {
            mode: 'event',
            event: 'damageDealt',
            target: 'self',
            conditions: [{ type: 'front' }],
            effects: [{ type: 'heal', value: 1 }],
            scope: 'battle',
            limit: 1,
          },
        ],
      },
    ],
  };
  const state = {
    units: { a: { hp: 30, buffs: {} } },
    formation: ['a'],
    encounter: 2,
    procUses: {},
  };
  const rule = rulesFor(definition)[0];
  assert(ruleAvailable(state, 'a', rule));
  state.procUses[ruleUsageKey(state, 'a', rule)] = 1;
  assert(!ruleAvailable(state, 'a', rule));
  state.encounter++;
  assert(ruleAvailable(state, 'a', rule));
});

test('cleanup removes inactive migration entries, preserves user prose and strips retired profession', () => {
  const old = {
    entries: {
      1: {
        comment: '旧迁移',
        disable: true,
        content: '旧提示',
        extensions: { wanxiangMigration: { preserved: true } },
      },
      2: { comment: '我的设定', disable: true, content: '保留我的文本' },
      3: {
        comment: '人物',
        content: '姓名：小雨\n\n职业：旧职业\n旧描述\n\n性格：安静。',
        extensions: { wanxiang: { characterId: 'character-rain' } },
      },
    },
  };
  const book = upgradePlaytestWorldbook(old);
  assert(!book.entries[1]);
  assert.equal(book.entries[2].content, old.entries[2].content);
  assert(!book.entries[3].content.includes('旧职业'));
  assert(book.entries[3].content.includes('性格：安静。'));
  assert.deepEqual(upgradePlaytestWorldbook(book), book);
  assert.equal(old.entries[1].content, '旧提示');
});

test('generated mana bands are program-owned and new settings omit profession', () => {
  const raw = compactCharacterDocument();
  raw.schemaVersion = 4;
  raw.setting.entrySkill = { name: '先行', description: '步入阵前。' };
  raw.data = {
    archetype: 'aegis',
    weapon: 'sword',
    profile: 'balanced',
    skills: [
      {
        kind: 'active',
        ap: 1,
        cost: 'low',
        target: 'enemy',
        effects: [{ type: 'damage', power: 'low' }],
      },
      {
        kind: 'active',
        ap: 2,
        cost: 'high',
        target: 'enemy',
        effects: [{ type: 'damage', power: 'high' }],
      },
    ],
    entrySkill: { target: 'opposite', effects: [{ type: 'damage', power: 'low' }] },
  };
  for (let i = 0; i < 12; i++) {
    const member = normalizeCharacter(raw, 'character-cost-' + i, { rollId: 'cost-' + i });
    assert(member.combat.skills[0].mp >= 5 && member.combat.skills[0].mp <= 7);
    assert(member.combat.skills[1].mp >= 12 && member.combat.skills[1].mp <= 15);
    assert(!member.setting.worldbook.includes('职业：'));
  }
});
