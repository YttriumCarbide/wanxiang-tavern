import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../content/journey-rules.js';
import { MAP_IDS } from '../content/biomes.js';
import { adventureDefinitionSchema } from '../adventure/definition.js';
const string = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Used both in the final fixed format instruction and optional upstream strict mode. */
export function legacyScriptSchema(partyIds = [], { acceptLegacyIndex = false } = {}) {
  const speaker = [
    'narrator',
    ...partyIds,
    ...Array.from({ length: 8 }, (_, index) => `npc-${index + 1}`),
  ];
  const line = object({
    speaker: { type: 'string', enum: speaker },
    action: string(300),
    dialogue: string(120, 0),
  });
  const schema = object({
    schemaVersion: { type: 'integer', const: 2 },
    title: string(60),
    synopsis: string(200),
    setting: string(400),
    opening: string(220),
    tags: array(string(30), 0, 12),
    npcs: array(object({ name: string(30), setting: string(200) }), 0, 3),
    scenes: array(
      object({
        opening: string(240),
        before: array(line, 0, 3),
        after: array(line, 0, 3),
        interlude: array(line, 0, 3),
      }),
      ENCOUNTER_COUNT,
      ENCOUNTER_COUNT,
    ),
    nextHook: object({
      setting: string(200),
      map: { type: 'string', enum: MAP_IDS },
      artNodes: array(string(60), 0, 6),
    }),
  });
  if (acceptLegacyIndex)
    schema.properties.scenes.items.properties.encounter = {
      type: 'integer',
      minimum: 0,
      maximum: FINAL_ENCOUNTER,
    };
  return schema;
}

/** Free novel prose is grouped by milestones; metadata retains its existing contract. */
function novelV3Schema() {
  const legacy = legacyScriptSchema();
  const { title, synopsis, setting, tags, npcs, nextHook } = legacy.properties;
  return object({
    schemaVersion: { type: 'integer', const: 3 },
    story: array(string(24000), ENCOUNTER_COUNT, ENCOUNTER_COUNT),
    data: object({ title, synopsis, setting, tags, npcs, nextHook }),
  });
}

function novelV4Schema() {
  const schema = object({
    schemaVersion: { type: 'integer', const: 4 },
    story: array(string(24000), ENCOUNTER_COUNT, ENCOUNTER_COUNT),
    data: object({
      title: string(60),
      tags: array(string(30), 0, 12),
      npcs: array(
        object({
          name: string(30),
          appearance: string(800, 25),
          history: string(800, 25),
          encounter: { type: 'integer', minimum: 0, maximum: FINAL_ENCOUNTER },
        }),
        0,
        12,
      ),
      items: array(
        {
          anyOf: [
            object({
              name: string(40),
              description: string(120),
              category: string(30),
              value: { type: 'integer', minimum: 0, maximum: 10000 },
              encounter: { type: 'integer', minimum: 0, maximum: FINAL_ENCOUNTER },
            }),
            object({
              name: string(40),
              description: string(120),
              value: { type: 'integer', minimum: 0, maximum: 10000 },
              encounter: { type: 'integer', minimum: 0, maximum: FINAL_ENCOUNTER },
            }),
            object({
              name: string(40),
              encounter: { type: 'integer', minimum: 0, maximum: FINAL_ENCOUNTER },
            }),
            object({
              name: string(40),
              reference: { type: 'boolean' },
              encounter: { type: 'integer', minimum: 0, maximum: FINAL_ENCOUNTER },
            }),
            string(40),
          ],
        },
        0,
        24,
      ),
      nextHook: {
        type: 'object',
        properties: {
          setting: string(2000, 0),
          phase: { type: 'string', enum: ['起', '承1', '承2', '转1', '转2', '合'] },
        },
        required: ['setting'],
        additionalProperties: false,
      },
    }),
  });
  schema.properties.data.properties.encounters = array(
    object({ enemyIds: array(string(80), 1, 3) }),
    ENCOUNTER_COUNT,
    ENCOUNTER_COUNT,
  );
  return schema;
}

function scriptV5Schema({ requireTheater = true, allowTags = false } = {}) {
  const schema = novelV4Schema();
  schema.properties.schemaVersion.const = 5;
  schema.properties.data.required = schema.properties.data.required.filter((key) => key !== 'tags');
  if (!allowTags) {
    delete schema.properties.data.properties.tags;
  } else {
    schema.properties.data.properties.tags = array(string(30), 0, 12);
  }
  const data = schema.properties.data;
  data.properties.adventure = adventureDefinitionSchema();
  data.properties.prologue = string(1200);
  data.properties.battleLines = {
    type: 'object',
    additionalProperties: false,
    properties: {
      bossIntro: string(160),
      partyReply: string(160),
      bossDeclaration: string(160),
      bossEnraged: string(160),
      bossDefeat: string(160),
    },
    required: ['bossIntro', 'partyReply', 'bossEnraged', 'bossDefeat'],
  };
  data.properties.epilogueGal = string(6000);
  data.properties.epilogueProse = string(1000);
  data.required.push('adventure');
  if (requireTheater) {
    data.required.push('prologue', 'battleLines', 'epilogueGal', 'epilogueProse');
  }
  return schema;
}

export function scriptOutputSchema() {
  const schema = scriptV5Schema({ requireTheater: true, allowTags: false });
  for (const variant of schema.properties.data.properties.items.items.anyOf) {
    if (variant.properties?.description) {
      variant.properties.description.maxLength = 20;
    }
  }
  return schema;
}

/** Existing v2/v3/v4/early-v5 responses and saved chapters remain readable during migration. */
export function scriptInputSchema(partyIds = []) {
  return {
    anyOf: [
      scriptV5Schema({ requireTheater: true, allowTags: true }),
      scriptV5Schema({ requireTheater: false, allowTags: true }),
      novelV4Schema(),
      novelV3Schema(),
      legacyScriptSchema(partyIds, { acceptLegacyIndex: true }),
    ],
  };
}
