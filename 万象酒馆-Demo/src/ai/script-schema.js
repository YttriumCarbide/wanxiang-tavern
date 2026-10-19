import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../content/journey-rules.js';
import { MAP_IDS } from '../content/biomes.js';
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

export function scriptOutputSchema() {
  return object({
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
            string(30),
            object({
              name: string(30),
              encounter: { type: 'integer', minimum: 0, maximum: FINAL_ENCOUNTER },
            }),
            object({
              name: string(30),
              description: string(20),
              value: { type: 'integer', minimum: 0, maximum: 10000 },
              encounter: { type: 'integer', minimum: 0, maximum: FINAL_ENCOUNTER },
            }),
          ],
        },
        0,
        24,
      ),
      nextHook: object({ setting: string(200, 0) }),
    }),
  });
}

/** Existing v2 responses and saved chapters remain readable during preset migration. */
export function scriptInputSchema(partyIds = []) {
  return {
    anyOf: [
      scriptOutputSchema(),
      novelV3Schema(),
      legacyScriptSchema(partyIds, { acceptLegacyIndex: true }),
    ],
  };
}
