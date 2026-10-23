import test from 'node:test';
import assert from 'node:assert/strict';
import { characterGenerationPlan, officialStatReferences } from '../src/character-generation.js';
import { characterInputSchema, characterOutputSchema } from '../src/ai/character-schema.js';
import { checkOutputSchema } from '../src/ai/schema-check.js';
import { normalizeCharacter, parseCharacterOutput } from '../src/ai/contracts.js';
import { readGenerationResult } from '../src/ai/pipeline/generation-result.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { restoreLibrary } from '../src/ai/library.js';
import { finalPassiveText } from '../src/skill-text.js';
import { compactCharacterDocument } from './fixtures/ai.js';

function design() {
  const raw = compactCharacterDocument();
  raw.schemaVersion = 4;
  raw.setting.entrySkill = { name: '破阵', description: '步入前场，挥出清晰的一击。' };
  raw.data = {
    archetype: 'aegis',
    weapon: 'sword',
    profile: 'balanced',
    skills: [
      {
        kind: 'active',
        ap: 1,
        cost: 'standard',
        target: 'enemy',
        effects: [{ type: 'damage', power: 'standard' }],
      },
      {
        kind: 'active',
        ap: 2,
        cost: 'standard',
        target: 'enemy',
        effects: [{ type: 'damage', power: 'standard' }],
      },
    ],
    entrySkill: { target: 'opposite', effects: [{ type: 'damage', power: 'low' }] },
  };
  return raw;
}

test('character requests expose only four authored base references and stable program-owned rolls', () => {
  const references = officialStatReferences();
  assert.deepEqual(
    references.map((hero) => hero.name),
    ['青缘', '伊蒂丝', '长景月汐', '潘多拉'],
  );
  assert.equal(references[1].hp, 48);
  const input = { brief: '试炼剑士', rollId: 'same-request', purpose: 'protagonist' };
  const plan = characterGenerationPlan(input);
  assert.deepEqual(characterGenerationPlan(input), plan);
  assert.equal(plan.fixed.limit, 2);
  assert(plan.fixed.attack >= 9);
  assert.equal(
    Object.values(plan.complexityProbabilities).reduce((a, b) => a + b, 0),
    100,
  );
  assert(plan.complexity >= 1 && plan.complexity <= 6);
});

test('v4 forbids model-written base values and compiles repeatable stronger 2AP skills', () => {
  const raw = design();
  checkOutputSchema(raw, characterOutputSchema());
  const invalid = structuredClone(raw);
  invalid.data.attack = 999;
  assert.throws(() => parseCharacterOutput(JSON.stringify(invalid)), /不是规定字段/);
  for (let seed = 0; seed < 50; seed++) {
    const input = {
      brief: '试炼剑士',
      rollId: 'case-' + seed,
      complexity: 2,
      purpose: 'protagonist',
    };
    const before = structuredClone(raw);
    const a = normalizeCharacter(raw, 'character-plan', input);
    const b = normalizeCharacter(raw, 'character-plan', input);
    assert.deepEqual(a, b);
    assert.deepEqual(raw, before);
    assert.equal(a.combat.limit, 2);
    assert(a.combat.hp >= 64 && a.combat.mp >= 26);
    const [one, two] = a.combat.skills;
    assert(two.effects[0].value > one.effects[0].value + 5);
    assert(one.text.includes(String(one.effects[0].value)));
    assert(two.text.includes(String(two.effects[0].value)));
  }
});

test('compiled mark and effect metadata survive acceptance-style normalization and a real library restore', () => {
  const raw = design();
  raw.data.mark = { name: '剑印' };
  raw.data.basicAttackMark = true;
  raw.data.skills[0].effects = [
    { type: 'damage', power: 'standard', perMark: true, consumeMark: true },
  ];
  raw.data.skills[1].effects = [
    { type: 'shield', power: 'low', target: 'self', when: { type: 'mark', value: 3 } },
  ];
  const input = { brief: '试炼剑士', rollId: 'mark-save', complexity: 6, purpose: 'protagonist' };
  const { entry } = readGenerationResult('character', JSON.stringify(raw), input);
  const accepted = normalizeCharacter(
    {
      schemaVersion: 2,
      setting: entry.setting,
      data: { ...entry.combat, archetype: entry.archetype },
    },
    entry.id,
  );
  assert.deepEqual(accepted.combat.mechanicMark, { name: '剑印', max: 3 });
  assert.equal(accepted.combat.basicAttackMark, 1);
  assert(accepted.combat.skills[0].effects[0].consumeMark);
  const library = newCampaign(defaultProtagonist());
  library.characters.push(accepted);
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library))).characters.find(
    (member) => member.id === accepted.id,
  );
  assert.deepEqual(restored.combat, accepted.combat);
});

test('2AP rewards remain distinctly higher for every power tier and single/group target', () => {
  for (const target of ['enemy', 'allEnemies', 'ally', 'allAllies']) {
    for (const power of ['low', 'standard', 'high']) {
      for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
        const raw = design();
        for (const skill of raw.data.skills) {
          skill.target = target;
          skill.effects[0] = {
            type: target.includes('Allies') || target === 'ally' ? 'heal' : 'damage',
            power,
          };
        }
        const result = normalizeCharacter(raw, 'character-cost', {
          rollId: 'ap-budget',
          complexity: 2,
          rarity,
        });
        assert(
          result.combat.skills[1].effects[0].value > result.combat.skills[0].effects[0].value + 5,
          `${target}/${power}/${rarity}`,
        );
      }
    }
  }
});

test('generated effects cannot heal enemies, harm allies or accumulate marks on another unit', () => {
  for (const effect of [
    { type: 'heal', power: 'standard' },
    { type: 'buff', buff: 'strength', power: 'standard' },
    { type: 'damage', power: 'standard', target: 'self' },
  ]) {
    const raw = design();
    raw.data.skills[0].effects = [effect];
    assert.throws(
      () => normalizeCharacter(raw, 'character-direction', { complexity: 2 }),
      /必须指向/,
    );
  }
  const raw = design();
  raw.data.mark = { name: '剑印' };
  raw.data.skills[0].effects = [
    { type: 'mark', power: 'low', target: 'target' },
    { type: 'damage', power: 'low', perMark: true },
  ];
  assert.throws(
    () => normalizeCharacter(raw, 'character-direction', { complexity: 6 }),
    /只积累在自身/,
  );
});

test('complexity tiers reject unsupported complexity instead of stripping a mechanism', () => {
  const raw = design();
  raw.data.skills[0].effects.push({ type: 'buff', buff: 'bleed', power: 'low' });
  assert.throws(() => normalizeCharacter(raw, 'character-plan', { complexity: 1 }), /效果数量/);
  raw.data.skills[0].effects.pop();
  raw.data.skills[0].effects[0].when = { type: 'hpBelow', value: 50 };
  assert.throws(() => normalizeCharacter(raw, 'character-plan', { complexity: 2 }), /条件强化/);
  delete raw.data.skills[0].effects[0].when;
  raw.data.mark = { name: '剑印' };
  raw.data.basicAttackMark = true;
  raw.data.skills[0].effects[0].perMark = true;
  assert.throws(() => normalizeCharacter(raw, 'character-plan', { complexity: 4 }), /专属标记/);
});

test('event passives compile bounded actual effects and precise activation limits', () => {
  const raw = design();
  raw.data.skills[1] = {
    kind: 'passive',
    rules: [
      {
        mode: 'event',
        event: 'damageTaken',
        conditions: [{ type: 'front' }],
        target: 'self',
        effects: [{ type: 'shield', power: 'standard' }],
        limit: 'once',
        scope: 'round',
      },
    ],
  };
  const result = normalizeCharacter(raw, 'character-passive', { complexity: 4 });
  const passive = result.combat.skills[1];
  assert(passive.passive);
  assert.equal(passive.rules[0].limit, 1);
  assert.equal(passive.rules[0].scope, 'round');
  assert.match(finalPassiveText(passive), /受到hp伤害.*前场.*护盾.*每回合最多1次/);
  assert(!finalPassiveText(passive).includes(raw.setting.skills[1].description));
});

test('older v3 documents keep their authored numeric values readable', () => {
  const raw = compactCharacterDocument();
  checkOutputSchema(raw, characterInputSchema());
  const entry = normalizeCharacter(parseCharacterOutput(JSON.stringify(raw)), 'character-old');
  assert.equal(entry.combat.hp, raw.data.hp);
  assert.equal(entry.combat.attack, raw.data.attack);
});
