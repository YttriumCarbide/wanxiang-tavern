import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { characterGenerationPlan, characterConstraintText } from '../src/character-generation.js';
import { characterOutputSchema } from '../src/ai/character-schema.js';
import { checkOutputSchema } from '../src/ai/schema-check.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { compactCharacterDocument } from './fixtures/ai.js';
import { generationInput } from '../src/ai/pipeline/prompts.js';
import { generationRequest } from '../server/prompts.mjs';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { upgradeCharacterConstraints } from '../src/ai/character-constraints-upgrade.js';
import { newWorldEntry } from '../src/ai/worldbook.js';
import { createBrowserStores } from '../src/ai/browser-stores.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { createWorldbookCounter } from '../server/character-reader.mjs';

const readText = (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8');
function design(mode = 'event') {
  const raw = compactCharacterDocument();
  raw.schemaVersion = 4;
  raw.setting.name = '安耶尔';
  raw.setting.skills[1] = { name: '翼蔽守律', description: '回合结束且在前场时获得护盾。' };
  raw.setting.entrySkill = { name: '降临压制', description: '禁锢对位敌人。' };
  raw.data = {
    archetype: 'rook',
    weapon: 'bow',
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
        kind: 'passive',
        rules: [
          {
            mode,
            conditions: [{ type: 'front', subject: 'self' }],
            target: 'self',
            effects:
              mode === 'event'
                ? [{ type: 'shield', power: 'standard' }]
                : [{ type: 'buff', power: 'standard', buff: 'iron' }],
            ...(mode === 'event' ? { event: 'roundEnd', limit: 'regular', scope: 'round' } : {}),
          },
        ],
      },
    ],
    entrySkill: {
      target: 'opposite',
      effects: [{ type: 'buff', power: 'standard', buff: 'bind', target: 'target' }],
    },
  };
  return raw;
}
test('all six request schemas follow the compiler event/condition permissions', () => {
  for (let level = 1; level <= 6; level++) {
    const plan = characterGenerationPlan({ complexity: level }),
      schema = characterOutputSchema({ plan });
    const event = design();
    if (level < 4) {
      assert.throws(() => checkOutputSchema(event, schema));
      assert.throws(() => normalizeCharacter(event, 'event-test', { complexity: level }));
      assert.match(characterConstraintText(plan), /本次禁止event事件被动/);
      assert.deepEqual(
        generationInput('character', { brief: '巡狩者', complexity: level }).mechanics.passives
          .unifiedRules.events,
        {},
      );
    } else {
      assert.doesNotThrow(() => checkOutputSchema(event, schema));
      assert.doesNotThrow(() => normalizeCharacter(event, 'event-test', { complexity: level }));
    }
    const continuous = design('continuous');
    if (level < 3) continuous.data.skills[1].rules[0].conditions = [];
    assert.doesNotThrow(() => checkOutputSchema(continuous, schema));
    assert.doesNotThrow(() => normalizeCharacter(continuous, 'aura-test', { complexity: level }));
    assert.equal(
      schema.properties.data.properties.skills.items.anyOf[0].properties.effects.maxItems,
      level === 1 ? 1 : 2,
    );
    assert.equal(Object.hasOwn(schema.properties.data.properties, 'mark'), level >= 5);
  }
});
test('changing event to continuous cannot smuggle recurring shield or recovery through the schema', () => {
  const plan = characterGenerationPlan({ complexity: 3 }),
    schema = characterOutputSchema({ plan });
  for (const effect of [
    { type: 'shield', power: 'standard' },
    { type: 'heal', power: 'standard' },
    { type: 'selfMana', power: 'standard' },
    { type: 'buff', power: 'standard', buff: 'regen' },
  ]) {
    const raw = design('continuous');
    raw.data.skills[1].rules[0].effects = [effect];
    assert.throws(() => checkOutputSchema(raw, schema));
    assert.throws(() => normalizeCharacter(raw, 'bad-aura', { complexity: 3 }));
  }
  const raw = design('continuous');
  raw.data.skills[1].rules[0].event = 'roundEnd';
  assert.throws(() => checkOutputSchema(raw, schema), /不是规定字段/);
});
test('low-tier event error identifies the actual tier and required tier without rerolling', () => {
  assert.throws(
    () => normalizeCharacter(design(), 'test', { complexity: 3 }),
    /当前第3档「条件强化」.*第4档/,
  );
});
test('constraint migration is additive, editable, idempotent and limited to character requests', async () => {
  const content = await readText('worldbook/character-complexity.md');
  const source = {
    name: '玩家世界书',
    entries: {
      0: {
        ...newWorldEntry(0),
        comment: '自定义设定',
        content: '不应覆盖',
        disable: true,
        apiTargets: ['map'],
      },
    },
  };
  const upgraded = upgradeCharacterConstraints(source, content);
  assert.deepEqual(upgraded.entries[0], source.entries[0]);
  const entry = Object.values(upgraded.entries).find(
    (e) => e.extensions?.wanxiang?.generationRule === 'character-complexity',
  );
  assert.deepEqual(entry.apiTargets, ['character']);
  assert.equal(entry.ignoreBudget, true);
  entry.content += '\n玩家编辑';
  entry.disable = true;
  assert.deepEqual(upgradeCharacterConstraints(upgraded, content), upgraded);
  assert.equal(Object.keys(source.entries).length, 1);
});
test('server and browser stores inject the same current-tier instruction and narrowed schema', async () => {
  const countTokens = createWorldbookCounter();
  const directory = await mkdtemp(
    path.join(process.cwd(), '.runtime/tests/character-constraints-'),
  );
  const server = await createWorldbookStore(directory);
  const { book } = await server.get('tavern-world');
  const records = new Map([
    ['world.book.tavern-world', book],
    ...[
      'game-rules.v26',
      'asset-rules.v27',
      'protagonist-rules.v28',
      'battle-display.v29',
      'ruins-roster.v30',
      'tutorial-equipment.v31',
      'enemy-appearances.v32',
      'character-generation.v33',
      'continuity.v34',
      'generation-experience.v35',
      'status-emblems.v36',
      'universal-enemies.v37',
    ].map((id) => ['world.' + id, true]),
  ]);
  // Simulate an installed v37 browser whose existing prose must be preserved.
  const old = structuredClone(book);
  for (const [id, entry] of Object.entries(old.entries))
    if (entry.extensions?.wanxiang?.generationRule === 'character-complexity')
      delete old.entries[id];
  records.set('world.book.tavern-world', old);
  const database = {
    get: (key) => structuredClone(records.get(key)),
    entries: () => [...records],
    write: async (entries) => {
      for (const [key, value] of entries) records.set(key, structuredClone(value));
    },
  };
  const browser = await createBrowserStores(database, readText, book);
  assert.equal(records.get('world.character-constraints.v38'), true);
  for (const level of [1, 3, 4, 6])
    for (const worlds of [server, browser.worlds]) {
      const input = { brief: '白翼巡狩者', rollId: 'constraints-' + level, complexity: level };
      const request = await generationRequest('character', input, undefined, {
        worldInfo: await worlds.resolve('character', input),
        countTokens,
      });
      const combined = request.messages.map((m) => m.content).join('\n');
      assert(combined.includes(`第${level}档`));
      assert.equal(combined.includes('{{characterLimits}}'), false);
      assert.equal(
        request.messages.filter((m) => m.content.includes('【本次角色机制权限')).length,
        1,
      );
      assert(request.messages.at(-1).content.includes('CHARACTER v4'));
      const marker = combined.indexOf('本次动态JSON Schema：');
      assert(marker >= 0);
      const expected = JSON.stringify(
        characterOutputSchema({ plan: characterGenerationPlan(input) }),
      );
      assert(combined.includes(expected), 'Visible @D must contain this request’s narrowed schema');
    }
  await writeFile(path.join(directory, 'builtin-content.json'), JSON.stringify({ version: 37 }));
  const restarted = await createWorldbookStore(directory);
  const again = Object.values((await restarted.get('tavern-world')).book.entries).filter(
    (e) => e.extensions?.wanxiang?.generationRule === 'character-complexity',
  );
  assert.equal(again.length, 1);
});
test('transport schema uses the same generation plan as prompt construction', () => {
  const pipeline = createAiPipeline({});
  for (const complexity of [1, 3, 4, 6]) {
    const input = { brief: '巡狩者', complexity, rollId: 'transport-' + complexity };
    const options = pipeline.completionOptions({
      kind: 'character',
      input,
      models: false,
      prepared: { transport: {} },
    });
    assert.deepEqual(
      options.responseSchema,
      characterOutputSchema({ plan: characterGenerationPlan(input) }),
    );
  }
});
