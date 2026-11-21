// Hostile path-traversal input fixtures.
// Covers relative traversal, absolute paths, Windows separators,
// URL-encoded variants, double-encoding, mixed separators, and edge tokens.
export const PATH_TRAVERSAL_INPUTS = Object.freeze([
  '../outside.json',
  '../../outside.json',
  '..\\outside.json',
  '..\\..\\outside.json',
  '/outside.json',
  'C:\\outside.json',
  'C:outside.json',
  '%2e%2e%2foutside.json',
  '%2e%2e%5coutside.json',
  '%252e%252e%252foutside.json',
  'safe/../../outside.json',
  'safe\\..\\..\\outside.json',
  '..',
  '.',
  '',
]);

// Malformed JSON bodies that should fail strict parsing.
// Covers truncation, unterminated strings, invalid escapes, trailing commas,
// non-standard literals, concatenated documents, missing separators, and BOM.
export const MALFORMED_JSON_BODIES = Object.freeze([
  '{"a": 1', // truncated object
  '[1, 2, 3', // truncated array
  '{"a": "unterminated}', // unterminated string
  '{"a": "bad\\escape"}', // invalid escape sequence
  '{"a": 1,}', // trailing comma in object
  'undefined', // bare undefined literal
  'NaN', // bare NaN literal
  '{"a": 1}{"b": 2}', // two concatenated objects
  '{"a" 1}', // missing colon
  '\uFEFF{"a": 1}', // BOM-prefixed object
]);

// Valid JSON documents whose top-level value is not an object.
// Covers null, booleans, numbers, strings, and arrays.
export const NON_OBJECT_JSON_BODIES = Object.freeze([
  'null',
  'true',
  '1',
  '"just a string"',
  '[]',
]);

// Materializes an oversized JSON body on demand without performing I/O.
// The payload string exceeds limitBytes by one byte to trigger size guards.
export function makeOversizedJsonBody(limitBytes) {
  return JSON.stringify({ payload: 'x'.repeat(limitBytes + 1) });
}