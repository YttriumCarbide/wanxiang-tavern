import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { readGenerationResult } from '../server/generation-result.mjs';
import { createCharacterReader } from '../server/character-reader.mjs';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { characterInputSchema, characterOutputSchema } from '../src/ai/character-schema.js';
import { checkOutputSchema } from '../src/ai/schema-check.js';
import { newLibrary, restoreLibrary, compileRoster } from '../src/ai/library.js';
import { newBattle, makeAction, preview } from '../src/engine.js';
import { abilityFor } from '../src/catalog.js';
import { characterDocument, compactCharacterDocument } from './fixtures/ai.js';

test('new output generates each name once while legacy duplicates remain optional input', () => {
  const raw = compactCharacterDocument();
  checkOutputSchema(raw, characterOutputSchema({ version: 3 }));
  const schema = characterOutputSchema().properties.data;
  for (const field of ['name', 'title', 'attackName']) assert(!schema.properties[field]);
  assert(!schema.properties.ultimate && !schema.properties.quest);
  assert(schema.properties.skills.items.anyOf.every((shape) => !shape.properties.name));
  const entry = readGenerationResult(
    'character',
    JSON.stringify(raw),
    {},
    createCharacterReader(),
  ).entry;
  assert.equal(entry.combat.name, raw.setting.name);
  assert.equal(entry.combat.title, undefined);
  assert.equal(entry.combat.attackName, raw.setting.attack.name);
  assert.equal(entry.combat.skills[1].name, raw.setting.skills[1].name);
  assert(!entry.combat.ultimate);
  raw.data.name = '旧数据层的另一个名字';
  raw.data.title = '旧数据层的另一个称号';
  raw.data.attackName = '旧普攻';
  raw.data.skills.forEach((skill) => {
    skill.name = '旧技能';
  });
  checkOutputSchema(raw, characterInputSchema());
  const legacy = readGenerationResult(
    'character',
    JSON.stringify(raw),
    {},
    createCharacterReader(),
  ).entry;
  assert.deepEqual(
    {
      ...legacy,
      id: entry.id,
      combat: {
        ...legacy.combat,
        id: entry.id,
        ...(legacy.combat.entrySkill
          ? {
              entrySkill: {
                ...legacy.combat.entrySkill,
                id: entry.combat.entrySkill?.id,
              },
            }
          : {}),
      },
    },
    entry,
  );
});

test('official character through legacy and compact responses retain executable combat data through saves', async () => {
  const original = characterDocument();
  const compact = structuredClone(original);
  for (const field of ['name', 'title', 'attackName']) delete compact.data[field];
  for (const skill of compact.data.skills) delete skill.name;
  for (const document of [original, compact]) {
    const before = JSON.stringify(document);
    const result = readGenerationResult('character', before, {}, createCharacterReader());
    const entry = result.entry;
    assert.equal(JSON.stringify(document), before);
    assert.equal(result.diagnostic.candidateText, before);
    assert.equal(entry.combat.name, original.setting.name);
    assert.equal(entry.combat.title, undefined);
    assert.equal(entry.combat.attackName, original.setting.attack.name);
    assert(entry.setting.worldbook.includes(original.setting.history));
    const library = newLibrary();
    library.characters.push(entry);
    library.party[0] = entry.id;
    const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
    const state = newBattle(undefined, compileRoster(restored));
    assert.equal(abilityFor(state, 'aegis', 'generated-2').name, original.setting.skills[1].name);
    const plan = preview(state, [makeAction(state, 'aegis', 'generated-1', 'mossSlime', 0)]);
    assert(plan.valid);
    assert.equal(plan.final.units.aegis.mp, original.data.mp - original.data.skills[0].mp);
    assert.deepEqual(entry.combat.skills[0].effects, original.data.skills[0].effects);
    assert(!entry.combat.ultimate && !entry.combat.quest);
    assert(!entry.setting.worldbook.includes('奥义'));
  }
});

test('sync updates stale unhashed character rules directly and preserves placement and custom edits', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/name-migration-'));
  const store = await createWorldbookStore(directory);
  const saved = await store.get('tavern-world');
  const rule = Object.values(saved.book.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'character-output',
  );
  rule.content = '两层名称须逐字一致。旧版格式\n{{outputSchema}}';
  delete rule.extensions.wanxiang.builtinHash;
  rule.depth = 2;
  rule.order = 4321;
  const unrelated = Object.values(saved.book.entries).find(
    (entry) => !entry.extensions?.wanxiang?.generationRule,
  );
  const untouched = structuredClone(unrelated);
  await store.save(saved);
  const upgraded = await createWorldbookStore(directory);
  const current = await upgraded.get('tavern-world');
  const updated = current.book.entries[rule.uid];
  assert(updated.content.includes('按槽位序号对应'));
  assert(!updated.content.includes('两层名称须逐字一致'));
  assert.deepEqual([updated.depth, updated.order], [2, 4321]);
  assert.deepEqual(current.book.entries[unrelated.uid], untouched);
  updated.content += '\n我的本地微调';
  await upgraded.save(current);
  const restarted = await createWorldbookStore(directory);
  assert.equal(
    (await restarted.get('tavern-world')).book.entries[rule.uid].content,
    updated.content,
  );
});
