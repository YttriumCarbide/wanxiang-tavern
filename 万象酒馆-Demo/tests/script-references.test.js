import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyScriptSchema, scriptInputSchema } from '../src/ai/script-schema.js';
import { checkOutputSchema } from '../src/ai/schema-check.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { settingOnly } from '../src/ai/contracts.js';
import { readGenerationResult } from '../server/generation-result.mjs';
import { scriptFixture } from './fixtures/ai.js';

test('script output references existing speakers and derives scene indices and display text once', () => {
  const library = newLibrary();
  const schema = legacyScriptSchema(library.party);
  const sceneSchema = schema.properties.scenes.items;
  assert(!sceneSchema.properties.encounter);
  const lineSchema = sceneSchema.properties.before.items;
  assert.deepEqual(Object.keys(lineSchema.properties), ['speaker', 'action', 'dialogue']);
  assert(lineSchema.properties.speaker.enum.includes(library.party[0]));
  assert(!lineSchema.properties.speaker.enum.includes('格雷'));
  const raw = scriptFixture(library.party);
  raw.scenes.forEach((scene) => {
    delete scene.encounter;
  });
  checkOutputSchema(raw, schema);
  const { entry } = readGenerationResult('script', JSON.stringify(raw), {
    party: library.characters.map(settingOnly),
  });
  assert.deepEqual(
    entry.scenes.map((scene) => scene.encounter),
    [0, 1, 2, 3, 4],
  );
  assert.equal(entry.scenes[0].before[0].speaker, library.party[0]);
  assert.equal(
    entry.scenes[0].before[0].text,
    raw.scenes[0].before[0].action + '\n“' + raw.scenes[0].before[0].dialogue + '”',
  );
  library.scripts.push({
    ...entry,
    party: library.characters.map(settingOnly),
    boss: 'bossGate',
    chapter: 1,
  });
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.deepEqual(restored.scripts[0].scenes, entry.scenes);
});

test('legacy scene numbers are optional compatibility fields and never override array order', () => {
  const library = newLibrary();
  const raw = scriptFixture(library.party);
  raw.scenes.forEach((scene) => {
    scene.encounter = 4;
  });
  checkOutputSchema(raw, scriptInputSchema(library.party));
  const original = JSON.stringify(raw);
  const { entry, diagnostic } = readGenerationResult('script', original, {
    party: library.characters.map(settingOnly),
  });
  assert.deepEqual(
    entry.scenes.map((scene) => scene.encounter),
    [0, 1, 2, 3, 4],
  );
  assert.equal(diagnostic.candidateText, original);
  raw.scenes[0].before[0].speaker = '格雷';
  assert.throws(() =>
    readGenerationResult('script', JSON.stringify(raw), {
      party: library.characters.map(settingOnly),
    }),
  );
  raw.scenes[0].before[0].speaker = library.party[0];
  raw.scenes.pop();
  assert.throws(() =>
    readGenerationResult('script', JSON.stringify(raw), {
      party: library.characters.map(settingOnly),
    }),
  );
});
