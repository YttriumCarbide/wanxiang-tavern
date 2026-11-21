import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { characterGenerationPlan, characterConstraintText } from '../src/character-generation.js';
import { characterOutputSchema } from '../src/ai/character-schema.js';
import { checkOutputSchema } from '../src/ai/schema-check.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { compactCharacterDocument } from './fixtures/ai.js';
import { generationInput } from '../src/ai/pipeline/prompts.js';
import { generationRequest } from '../server/prompts.mjs';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { newWorldEntry, syncBuiltinWorldbook } from '../src/ai/worldbook.js';
import { createBrowserStores } from '../src/ai/browser-stores.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { createWorldbookCounter } from '../server/character-reader.mjs';
import { readGenerationResult } from '../src/ai/pipeline/generation-result.js';

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
test('all six request schemas share supported mechanisms while prompts retain tier guidance', () => {
  for (let level = 1; level <= 6; level++) {
    const plan = characterGenerationPlan({ complexity: level }),
      schema = characterOutputSchema({ plan });
    assert.deepEqual(schema, characterOutputSchema());
    const event = design();
    assert.doesNotThrow(() => checkOutputSchema(event, schema));
    const normalized = normalizeCharacter(event, 'event-test', { complexity: level });
    assert.equal(normalized.combat.skills[1].passive, true);
    const rule = normalized.combat.skills[1].rules[0];
    assert.equal(rule.mode, 'event');
    assert.equal(rule.event, 'roundEnd');
    assert.deepEqual(rule.conditions, event.data.skills[1].rules[0].conditions);
    assert.equal(rule.effects[0].type, 'shield');
    if (level < 4) {
      assert.match(characterConstraintText(plan), /本次禁止event事件被动/);
      assert.deepEqual(
        generationInput('character', { brief: '巡狩者', complexity: level }).mechanics.passives
          .unifiedRules.events,
        {},
      );
    }
    const continuous = design('continuous');
    assert.doesNotThrow(() => checkOutputSchema(continuous, schema));
    assert.doesNotThrow(() => normalizeCharacter(continuous, 'aura-test', { complexity: level }));
    assert.equal(
      schema.properties.data.properties.skills.items.anyOf[0].properties.effects.maxItems,
      2,
    );
    assert.equal(Object.hasOwn(schema.properties.data.properties, 'mark'), true);
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
test('low-tier shared reader accepts event mechanisms without changing their structure', () => {
  const raw = design(),
    before = structuredClone(raw);
  const result = readGenerationResult('character', JSON.stringify(raw), {
    complexity: 1,
    rollId: 'low-tier-event',
  });
  assert.equal(result.diagnostic.stage, 'complete');
  assert.equal(result.entry.combat.skills[1].passive, true);
  const rule = result.entry.combat.skills[1].rules[0];
  assert.equal(rule.mode, 'event');
  assert.equal(rule.event, 'roundEnd');
  assert.equal(rule.scope, 'round');
  assert.deepEqual(rule.conditions, raw.data.skills[1].rules[0].conditions);
  assert.deepEqual(raw, before);
});
test('constraint migration is additive, editable, idempotent and limited to character requests', async () => {
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
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
  const upgraded = syncBuiltinWorldbook(source, builtin);
  assert.equal(upgraded.entries[0].content, source.entries[0].content);
  assert.equal(upgraded.entries[0].disable, true);
  const entry = Object.values(upgraded.entries).find(
    (e) => e.extensions?.wanxiang?.generationRule === 'character-output',
  );
  assert.deepEqual(entry.apiTargets, ['character']);
  assert.equal(entry.ignoreBudget, true);
  entry.content += '\n玩家编辑';
  entry.disable = true;
  assert.deepEqual(syncBuiltinWorldbook(upgraded, builtin), upgraded);
  assert.equal(Object.keys(source.entries).length, 1);
});
test('server and browser stores inject the same current-tier instruction and narrowed schema', async () => {
  const countTokens = createWorldbookCounter();
  const directory = await mkdtemp(
    path.join(process.cwd(), '.runtime/tests/character-constraints-'),
  );
  const server = await createWorldbookStore(directory);
  const { book } = await server.get('tavern-world');
  const records = new Map([['world.book.tavern-world', book]]);
  const old = structuredClone(book);
  for (const [id, entry] of Object.entries(old.entries))
    if (entry.extensions?.wanxiang?.generationRule === 'character-output') delete old.entries[id];
  records.set('world.book.tavern-world', old);
  const database = {
    get: (key) => structuredClone(records.get(key)),
    entries: () => [...records],
    write: async (entries) => {
      for (const [key, value] of entries) records.set(key, structuredClone(value));
    },
  };
  const browser = await createBrowserStores(database, readText, book);
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
      assert(request.messages.some((message) => message.content.includes('CHARACTER v4')));
      assert(request.messages.at(-1).content.includes('【数据生成输出边界】'));
      const marker = combined.indexOf('本次动态JSON Schema：');
      assert(marker >= 0);
      const expected = JSON.stringify(
        characterOutputSchema({ plan: characterGenerationPlan(input) }),
      );
      assert(combined.includes(expected), 'Visible @D must contain this request’s narrowed schema');
    }
  const restarted = await createWorldbookStore(directory);
  const again = Object.values((await restarted.get('tavern-world')).book.entries).filter(
    (e) => e.extensions?.wanxiang?.generationRule === 'character-output',
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
