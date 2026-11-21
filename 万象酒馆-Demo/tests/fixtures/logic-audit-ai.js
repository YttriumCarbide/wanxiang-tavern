export const malformedJSONRoots = [
  {
    id: 'json-null',
    text: 'null',
  },
  {
    id: 'json-false',
    text: 'false',
  },
  {
    id: 'json-true',
    text: 'true',
  },
  {
    id: 'json-zero',
    text: '0',
  },
  {
    id: 'json-one',
    text: '1',
  },
  {
    id: 'json-empty-string',
    text: '',
  },
  {
    id: 'json-empty-array',
    text: '[]',
  },
  {
    id: 'json-array-with-null',
    text: '[null]',
  },
];

export const invalidNullableValues = [
  'invalid',
  0,
  false,
  {},
  [],
];

export const unknownObjectKeys = [
  'constructor',
  'toString',
  '__proto__',
];

export const truncatedJSONTexts = [
  '{',
  '[',
  '{"setting":',
  '{"data":[',
];

export const numericBoundaries = {
  nan: NaN,
  positiveInfinity: Infinity,
  negativeInfinity: -Infinity,
  maxSafeInteger: Number.MAX_SAFE_INTEGER,
};
