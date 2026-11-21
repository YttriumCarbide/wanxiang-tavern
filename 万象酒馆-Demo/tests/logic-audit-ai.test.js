import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOutputSchema, outputSchemaIssues } from '../src/ai/schema-check.js';
import { characterInputSchema } from '../src/ai/character-schema.js';
import { parseCharacterOutput } from '../src/ai/contracts.js';
import { readGenerationResult, repairJSONText } from '../src/ai/pipeline/generation-result.js';
import { compactCharacterDocument } from './fixtures/ai.js';
import {
  malformedJSONRoots,
  invalidNullableValues,
  unknownObjectKeys,
  truncatedJSONTexts,
  numericBoundaries,
} from './fixtures/logic-audit-ai.js';

const nullableDamageTypeSchema =
  characterInputSchema(3).properties.data.properties.skills.items.anyOf[0].properties.damageType;

function cloneDocument() {
  return JSON.parse(JSON.stringify(compactCharacterDocument()));
}

function withDamageType(value) {
  const raw = cloneDocument();
  raw.data.skills[0].damageType = value;
  return raw;
}

test('nullable damageType schema accepts null directly and via collector', () => {
  assert.doesNotThrow(() => checkOutputSchema(null, nullableDamageTypeSchema));
  assert.deepEqual(outputSchemaIssues(null, nullableDamageTypeSchema), []);
});

test('standalone null schema rejects missing values and accepts only null', () => {
  const schema = { type: 'null' };
  assert.doesNotThrow(() => checkOutputSchema(null, schema));
  assert.deepEqual(outputSchemaIssues(null, schema), []);
  assert.throws(() => checkOutputSchema(undefined, schema));
  assert.equal(outputSchemaIssues(undefined, schema)[0].path, 'output');
});

for (const value of invalidNullableValues) {
  const label = JSON.stringify(value);

  test(`nullable damageType direct check rejects ${label}`, () => {
    assert.throws(() => checkOutputSchema(value, nullableDamageTypeSchema));
  });

  test(`nullable damageType collector reports ${label}`, () => {
    const issues = outputSchemaIssues(value, nullableDamageTypeSchema);
    assert.ok(issues.length > 0, `expected issues for ${label}`);
  });
}

test('valid compactCharacterDocument passes schema and collector', () => {
  const raw = cloneDocument();
  assert.doesNotThrow(() => checkOutputSchema(raw, characterInputSchema(3)));
  assert.deepEqual(outputSchemaIssues(raw, characterInputSchema(3)), []);
});

test('valid compactCharacterDocument parses via parseCharacterOutput', () => {
  const raw = cloneDocument();
  const baseline = JSON.stringify(raw);
  assert.doesNotThrow(() => parseCharacterOutput(JSON.stringify(raw)));
  assert.equal(JSON.stringify(raw), baseline);
});

test('valid compactCharacterDocument reads via readGenerationResult', () => {
  const raw = cloneDocument();
  const baseline = JSON.stringify(raw);
  const result = readGenerationResult('character', JSON.stringify(raw), {});
  assert.ok(result);
  assert.equal(result.diagnostic.stage, 'complete');
  assert.equal(JSON.stringify(raw), baseline);
});

test('null damageType passes schema and collector', () => {
  const raw = withDamageType(null);
  assert.doesNotThrow(() => checkOutputSchema(raw, characterInputSchema(3)));
  assert.deepEqual(outputSchemaIssues(raw, characterInputSchema(3)), []);
});

test('null damageType parses via parseCharacterOutput', () => {
  const raw = withDamageType(null);
  const baseline = JSON.stringify(raw);
  assert.doesNotThrow(() => parseCharacterOutput(JSON.stringify(raw)));
  assert.equal(JSON.stringify(raw), baseline);
});

test('null damageType reads via readGenerationResult', () => {
  const raw = withDamageType(null);
  const baseline = JSON.stringify(raw);
  const result = readGenerationResult('character', JSON.stringify(raw), {});
  assert.ok(result);
  assert.equal(result.diagnostic.stage, 'complete');
  assert.equal(JSON.stringify(raw), baseline);
});

for (const value of invalidNullableValues) {
  const label = JSON.stringify(value);

  test(`parseCharacterOutput rejects damageType ${label}`, () => {
    const raw = withDamageType(value);
    assert.throws(() => parseCharacterOutput(JSON.stringify(raw)));
  });

  test(`readGenerationResult rejects damageType ${label} with schema stage`, () => {
    const raw = withDamageType(value);
    let failure = null;
    try {
      readGenerationResult('character', JSON.stringify(raw), {});
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, `expected readGenerationResult to throw for ${label}`);
    assert.equal(failure.diagnostic.stage, 'schema');
    assert.ok(failure.diagnostic.issues.length >= 1);
  });
}

const strictObjectSchema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: [],
};

test('strict object schema accepts baseline {ok:true} directly and via collector', () => {
  assert.doesNotThrow(() => checkOutputSchema({ ok: true }, strictObjectSchema));
  assert.deepEqual(outputSchemaIssues({ ok: true }, strictObjectSchema), []);
});

test('explicitly declared prototype-like keys remain valid own properties', () => {
  const properties = JSON.parse('{"constructor":{"type":"integer"}}');
  const schema = { type: 'object', properties };
  const value = JSON.parse('{"constructor":1}');
  assert.doesNotThrow(() => checkOutputSchema(value, schema));
  assert.deepEqual(outputSchemaIssues(value, schema), []);
});

for (const key of unknownObjectKeys) {
  test(`strict object schema direct check rejects unknown key ${key}`, () => {
    const value = JSON.parse('{"' + key + '":0}');
    assert.throws(() => checkOutputSchema(value, strictObjectSchema));
  });

  test(`strict object schema collector reports exact path for unknown key ${key}`, () => {
    const value = JSON.parse('{"' + key + '":0}');
    const issues = outputSchemaIssues(value, strictObjectSchema);
    assert.ok(issues.length > 0, `expected issues for ${key}`);
    const paths = issues.map((issue) => issue.path);
    assert.ok(
      paths.includes(`output.${key}`),
      `expected path output.${key}, got ${JSON.stringify(paths)}`,
    );
  });
}

const integerSchema = { type: 'integer', minimum: 1, maximum: 3 };

for (const value of [1, 2, 3]) {
  test(`integer schema accepts ${value} directly and via collector`, () => {
    assert.doesNotThrow(() => checkOutputSchema(value, integerSchema));
    assert.deepEqual(outputSchemaIssues(value, integerSchema), []);
  });
}

for (const value of [0, 4, 1.5, ...Object.values(numericBoundaries)]) {
  const label = String(value);

  test(`integer schema direct check rejects ${label}`, () => {
    assert.throws(() => checkOutputSchema(value, integerSchema));
  });

  test(`integer schema collector reports ${label}`, () => {
    const issues = outputSchemaIssues(value, integerSchema);
    assert.ok(issues.length > 0, `expected issues for ${label}`);
  });
}

for (const root of malformedJSONRoots) {
  const text = root.id === 'json-empty-string' ? JSON.stringify('') : root.text;

  test(`malformed root ${root.id} is valid JSON but not an object`, () => {
    assert.doesNotThrow(() => JSON.parse(text));
  });

  test(`malformed root ${root.id} script reader reports root schema failure`, () => {
    assert.throws(
      () => readGenerationResult('script', text, {}),
      (failure) => {
        assert.equal(failure.diagnostic.stage, 'schema');
        assert.equal(failure.diagnostic.rawText, text);
        assert.equal(failure.diagnostic.candidateText, text);
        assert.equal(failure.diagnostic.issues[0].path, 'script');
        assert.match(failure.diagnostic.issues[0].message, /必须是对象/u);
        assert.ok(!(failure instanceof TypeError));
        return true;
      },
    );
  });

  test(`malformed root ${root.id} direct parser throws controlled error`, () => {
    let failure = null;
    try {
      parseCharacterOutput(text);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, `expected parseCharacterOutput to throw for ${root.id}`);
    assert.ok(failure instanceof Error, `expected Error for ${root.id}`);
    assert.ok(!(failure instanceof TypeError), `unexpected TypeError for ${root.id}`);
  });

  test(`malformed root ${root.id} readGenerationResult reports schema stage`, () => {
    let failure = null;
    try {
      readGenerationResult('character', text, {});
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, `expected readGenerationResult to throw for ${root.id}`);
    assert.equal(failure.diagnostic.stage, 'schema');
    assert.equal(failure.diagnostic.rawText, text);
    assert.ok(failure.diagnostic.issues.length >= 1);
    assert.equal(failure.diagnostic.candidateText, text);
    assert.equal(failure.diagnostic.issues[0].path, 'character');
    assert.match(failure.diagnostic.issues[0].message, /必须是对象/u);
    assert.ok(!(failure instanceof TypeError), `unexpected TypeError for ${root.id}`);
  });
}

for (const text of truncatedJSONTexts) {
  test(`truncated JSON ${JSON.stringify(text)} readGenerationResult reports json stage`, () => {
    let failure = null;
    try {
      readGenerationResult('character', text, {});
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, `expected readGenerationResult to throw for ${JSON.stringify(text)}`);
    assert.equal(failure.diagnostic.stage, 'json');
    assert.equal(failure.diagnostic.rawText, text);
    assert.ok(failure.diagnostic.issues.length >= 1);
  });

  test(`truncated JSON ${JSON.stringify(text)} repairJSONText does not yield parseable JSON`, () => {
    const repaired = repairJSONText(text);
    assert.throws(() => JSON.parse(repaired.candidateText));
  });
}

test('repairJSONText preserves string integrity for neutral data', () => {
  const original = JSON.stringify({ literal: ',} ,] \\ "', n: 1 });
  const repaired = repairJSONText(original);
  assert.equal(repaired.candidateText, original);
  assert.deepEqual(repaired.repairs, []);
  assert.deepEqual(JSON.parse(repaired.candidateText), JSON.parse(original));
});

test('repairJSONText removes outside-string trailing comma', () => {
  const repaired = repairJSONText('{"n":1,}');
  assert.equal(repaired.candidateText, '{"n":1}');
  assert.equal(repaired.repairs.length, 1);
  assert.equal(JSON.parse(repaired.candidateText).n, 1);
});
