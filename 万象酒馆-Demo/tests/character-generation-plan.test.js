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

test('v4 compiles confusion and full cleanse alongside existing flight and artifact', () => {
  const raw = design();
  raw.data.skills[0].ap = 2;
  raw.data.skills[1].ap = 1;
  raw.data.skills[0].effects = [{ type: 'buff', buff: 'confusion', power: 'standard' }];
  raw.data.skills[1].target = 'ally';
  raw.data.skills[1].effects = [{ type: 'cleanse', power: 'standard' }];
  raw.data.entrySkill.target = 'self';
  for (const buff of ['flying', 'artifact']) {
    raw.data.entrySkill.effects = [{ type: 'buff', buff, power: 'low' }];
    const { entry } = readGenerationResult('character', JSON.stringify(raw), {
      purpose: 'protagonist',
      complexity: 2,
    });
    assert.equal(entry.combat.skills[0].effects[0].buff, 'confusion');
    assert.deepEqual(entry.combat.skills[1].effects, [{ type: 'cleanse' }]);
    assert.equal(entry.combat.entrySkill.effects[0].buff, buff);
  }
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
          result.combat.skills[1].effects[0].value >=
            result.combat.skills[0].effects[0].value * 1.75,
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

test('complexity tiers preserve supported mark mechanisms without stripping metadata', () => {
  for (const complexity of [1, 2, 3, 4, 5, 6]) {
    const raw = design();
    raw.data.mark = { name: raw.setting.attack.name };
    raw.data.basicAttackMark = true;
    raw.data.skills[0].effects = [
      { type: 'damage', power: 'standard', perMark: true, consumeMark: true },
      { type: 'buff', buff: 'bleed', power: 'low', when: { type: 'hpBelow', value: 50 } },
    ];
    raw.data.skills[1].effects = [
      { type: 'shield', power: 'low', target: 'self', when: { type: 'mark', value: 3 } },
    ];
    const baseline = structuredClone(raw);
    const result = normalizeCharacter(raw, 'character-plan', {
      complexity,
      rollId: 'complexity-guidance',
    });
    assert.deepEqual(raw, baseline);
    assert.equal(result.combat.mechanicMark.name, raw.data.mark.name);
    assert.equal(result.combat.basicAttackMark, 1);
    assert.equal(result.combat.skills[0].effects.length, 2);
    assert(result.combat.skills[0].effects[0].perMark);
    assert.equal(result.combat.skills[0].effects[0].consumeMark, true);
    assert.deepEqual(
      result.combat.skills[0].effects[1].when,
      baseline.data.skills[0].effects[1].when,
    );
    assert.deepEqual(
      result.combat.skills[1].effects[0].when,
      baseline.data.skills[1].effects[0].when,
    );
  }
});

test('shared reader preserves cross-mark metadata at complexity 5', () => {
  const raw = design();
  raw.data.mark = { name: raw.setting.attack.name };
  raw.data.basicAttackMark = true;
  raw.data.skills[0].effects = [
    { type: 'damage', power: 'standard', perMark: true, consumeMark: true },
  ];
  raw.data.skills[1].effects = [
    { type: 'shield', power: 'low', target: 'self', when: { type: 'mark', value: 3 } },
  ];
  const original = structuredClone(raw);
  const result = readGenerationResult('character', JSON.stringify(raw), {
    complexity: 5,
    rollId: 'fifth-tier-cross-mark',
  });
  assert.equal(result.diagnostic.stage, 'complete');
  const combat = result.entry.combat;
  assert.equal(combat.mechanicMark.name, raw.data.mark.name);
  assert.equal(combat.basicAttackMark, 1);
  assert(combat.skills[0].effects[0].perMark);
  assert.equal(combat.skills[0].effects[0].consumeMark, true);
  assert.deepEqual(combat.skills[1].effects[0].when, { type: 'mark', value: 3 });
  assert.deepEqual(raw, original);
});

test('malformed mark mechanisms remain rejected at complexity 1', () => {
  const missingMark = design();
  missingMark.data.basicAttackMark = true;
  assert.throws(
    () => normalizeCharacter(missingMark, 'character-plan', { complexity: 1 }),
    /专属标记/,
  );

  const missingPerMark = design();
  missingPerMark.data.mark = { name: missingPerMark.setting.attack.name };
  missingPerMark.data.basicAttackMark = true;
  missingPerMark.data.skills[0].effects = [
    { type: 'damage', power: 'standard', consumeMark: true },
  ];
  assert.throws(
    () => normalizeCharacter(missingPerMark, 'character-plan', { complexity: 1 }),
    /消耗标记/,
  );
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
  const result = normalizeCharacter(raw, 'character-passive', { complexity: 1 });
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

test('2AP high striker skills reach above 36 up to 48 and passives/regen keep percentage stacks', () => {
  let peak = 0;
  for (let seed = 0; seed < 40; seed++) {
    const raw = design();
    raw.data.profile = 'striker';
    raw.data.skills[1].effects = [{ type: 'damage', power: 'high' }];
    const entry = normalizeCharacter(raw, 'character-peak', {
      rollId: 'peak-' + seed,
      complexity: 2,
      rarity: 'legendary',
    });
    const dmg = entry.combat.skills[1].effects[0].value;
    peak = Math.max(peak, dmg);
    assert(dmg <= 48);
  }
  assert(peak > 36 && peak <= 48, `expected > 36 and <= 48, got ${peak}`);

  const regenRaw = design();
  regenRaw.data.skills[0].target = 'self';
  regenRaw.data.skills[0].effects = [{ type: 'buff', buff: 'regen', power: 'high' }];
  regenRaw.data.skills[1].effects = [{ type: 'buff', buff: 'poison', power: 'high' }];
  const statusMember = normalizeCharacter(regenRaw, 'character-status', { complexity: 2 });
  assert.equal(statusMember.combat.skills[0].effects[0].value, 2);
  assert.equal(statusMember.combat.skills[1].effects[0].value, 6);
});
