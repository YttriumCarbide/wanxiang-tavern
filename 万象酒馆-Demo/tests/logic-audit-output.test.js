import test from 'node:test';
import assert from 'node:assert/strict';
import { readOutputTags, streamingChatText } from '../src/ai/output-tags.js';
import { createPresetOutputProcessor } from '../src/ai/output-processor.js';
import { chatResponse } from '../src/ai/pipeline/chat-response.js';
import {
  extractGenerationEnvelope,
  OUTPUT_OPEN,
  OUTPUT_CLOSE,
} from '../src/ai/pipeline/output-envelope.js';

test('body boundaries inside multiline code fences remain literal payload', () => {
  for (const fence of ['```', '~~~']) {
    const body = `x\n${fence}text\n</wanxiang_output>\nx\n${fence}\nx`;
    const raw = `${OUTPUT_OPEN}${body}${OUTPUT_CLOSE}`;
    const sections = readOutputTags(raw, [{ tag: 'wanxiang_output' }]);

    assert.equal(sections.length, 1);
    assert.equal(sections[0].content, body);
    assert.equal(sections[0].complete, true);
    assert.equal(sections[0].end, raw.length);
  }
});

test('chat preserves fenced closing boundaries and reads subsequent actions', async () => {
  const body = 'x\n```text\n</wanxiang_output>\n```\nx';
  const actions = {
    affection: [{ id: 'x', delta: 1 }],
    agreeToAdventure: ['x'],
  };
  const raw =
    `${OUTPUT_OPEN}${body}${OUTPUT_CLOSE}` +
    `<wanxiang_actions>${JSON.stringify(actions)}</wanxiang_actions>`;
  const result = await chatResponse('chat', raw, {
    characters: [{ id: 'x' }],
  });

  assert.equal(result.content, body);
  assert.deepEqual(result.actions, actions);
});

test('JSON strings preserve exact protocol boundaries after escaped quotes and backslashes', () => {
  const value = {
    x: '"\\</wanxiang_output><wanxiang_output>x</wanxiang_output>',
    y: '<wanxiang_json></wanxiang_json> thinking',
    z: ['\\', '"', '</wanxiang_output>'],
  };
  const json = JSON.stringify(value);
  const prefix = 'x\n';
  const suffix = '\nx';
  const extracted = extractGenerationEnvelope(
    'character',
    `${prefix}${OUTPUT_OPEN}${json}${OUTPUT_CLOSE}${suffix}`,
  );

  assert.equal(extracted.candidateText, json);
  assert.deepEqual(JSON.parse(extracted.candidateText), value);
  assert.equal(extracted.envelope.ignoredCharacters, prefix.length + suffix.length);
});

test('streaming survives chunk boundaries within opening, closing and JSON sidecar tags', () => {
  const chunks = [
    '<wan',
    'xiang_out',
    'put>',
    'x',
    '</wan',
    'xiang_output',
    '><wanxiang_act',
    'ions>{"affection":[],"agreeToAdventure":[]}',
    '</wanxiang_actions>',
  ];
  const expected = [null, null, '', 'x', 'x', 'x', 'x', 'x', 'x'];
  let buffer = '';

  for (const [index, chunk] of chunks.entries()) {
    buffer += chunk;
    assert.equal(streamingChatText(buffer), expected[index], `chunk ${index}`);
  }
});

test('completed fenced bodies stream without exposing an internal closing tag as a boundary', () => {
  const body = 'x\n~~~text\n</wanxiang_output>\n~~~\nx';
  const raw = `${OUTPUT_OPEN}${body}${OUTPUT_CLOSE}`;

  assert.equal(streamingChatText(raw), body);
});

test('independent output processors preserve interleaved payloads and callbacks', () => {
  const firstEvents = [];
  const secondEvents = [];
  const first = createPresetOutputProcessor(undefined, (text) => firstEvents.push(text));
  const second = createPresetOutputProcessor(undefined, (text) => secondEvents.push(text));

  assert.equal(first.feed('<wanxiang_'), '<wanxiang_');
  assert.equal(second.feed('y'), 'y');
  assert.equal(first.feed('output>x'), 'output>x');
  assert.equal(second.finish(), 'y');
  assert.equal(first.feed('</wanxiang_output>'), '</wanxiang_output>');
  assert.equal(first.finish(), '<wanxiang_output>x</wanxiang_output>');
  assert.deepEqual(firstEvents, ['<wanxiang_', 'output>x', '</wanxiang_output>']);
  assert.deepEqual(secondEvents, ['y']);
});

test('quick-chat negotiation accepts inclusive integer limits and rejects invalid scores', async () => {
  const input = { questNegotiation: true };
  const body = `${OUTPUT_OPEN}x${OUTPUT_CLOSE}`;

  for (const score of [0, 5]) {
    const raw = `${body}<wanxiang_negotiation>${JSON.stringify({ score })}</wanxiang_negotiation>`;
    const result = await chatResponse('quick-chat', raw, input);

    assert.equal(result.content, 'x');
    assert.equal(result.questNegotiation, score);
  }

  for (const score of [-1, 6, 1.5, '3', null]) {
    const raw = `${body}<wanxiang_negotiation>${JSON.stringify({ score })}</wanxiang_negotiation>`;

    await assert.rejects(chatResponse('quick-chat', raw, input), /缺少有效的交涉评分/u);
  }
});

test('A10-A nested fenced matrix preserves exact body for markers, indents and lengths', () => {
  for (const marker of ['`', '~']) {
    for (const indentCount of [0, 1, 2, 3]) {
      for (const openingLength of [3, 4]) {
        for (const closingLength of [openingLength, openingLength + 2]) {
          const indent = ' '.repeat(indentCount);
          const body = [
            'x',
            indent + marker.repeat(openingLength) + 'text',
            '</wanxiang_output>',
            indent + marker.repeat(closingLength),
            'x',
          ].join('\n');
          const raw = `${OUTPUT_OPEN}${body}${OUTPUT_CLOSE}`;
          const sections = readOutputTags(raw, [{ tag: 'wanxiang_output' }]);

          assert.equal(sections.length, 1);
          assert.equal(sections[0].content, body);
          assert.equal(sections[0].complete, true);
          assert.equal(sections[0].end, raw.length);
          assert.equal(streamingChatText(raw), body);
        }
      }
    }
  }
});

test('A10-B false closers do not end an open fence', () => {
  for (const marker of ['`', '~']) {
    const other = marker === '`' ? '~' : '`';
    for (const falseCloser of [marker.repeat(3), other.repeat(4)]) {
      const body = [
        'x',
        marker.repeat(4) + 'text',
        falseCloser,
        OUTPUT_CLOSE,
        marker.repeat(4),
        'x',
      ].join('\n');
      const raw = `${OUTPUT_OPEN}${body}${OUTPUT_CLOSE}`;
      const sections = readOutputTags(raw, [{ tag: 'wanxiang_output' }]);

      assert.equal(sections.length, 1);
      assert.equal(sections[0].content, body);
      assert.equal(sections[0].complete, true);
      assert.equal(sections[0].end, raw.length);
      assert.equal(streamingChatText(raw), body);
    }
  }
});

test('A10-C unclosed fences preserve literal closing tags in partial payloads', () => {
  for (const marker of ['`', '~']) {
    for (const tail of [OUTPUT_CLOSE, '</wanxiang_output']) {
      const body = ['x', marker.repeat(3) + 'text', tail].join('\n');
      const raw = `${OUTPUT_OPEN}${body}`;
      const sections = readOutputTags(raw, [{ tag: 'wanxiang_output' }], { partial: true });

      assert.equal(sections.length, 1);
      assert.equal(sections[0].content, body);
      assert.equal(sections[0].complete, false);
      assert.equal(streamingChatText(raw), body);
      assert.throws(() => readOutputTags(raw, [{ tag: 'wanxiang_output' }]), /结束标签/);
    }
  }
});

test('A10-D completed indented fenced body keeps fake close literal and reads actions', async () => {
  const body = ['x', '   ' + '`'.repeat(4) + 'text', OUTPUT_CLOSE, '   ' + '`'.repeat(6), 'x'].join(
    '\n',
  );
  const actions = {
    affection: [{ id: 'x', delta: 1 }],
    agreeToAdventure: ['x'],
  };
  const raw =
    `${OUTPUT_OPEN}${body}${OUTPUT_CLOSE}` +
    `<wanxiang_actions>${JSON.stringify(actions)}</wanxiang_actions>`;
  const result = await chatResponse('chat', raw, {
    characters: [{ id: 'x' }],
  });

  assert.equal(result.content, body);
  assert.deepEqual(result.actions, actions);
  assert.equal(streamingChatText(raw), body);
});

test('A10-E inline code preserves literal closing tag payload', () => {
  const body = 'x `</wanxiang_output>` x';
  const raw = `${OUTPUT_OPEN}${body}${OUTPUT_CLOSE}`;
  const sections = readOutputTags(raw, [{ tag: 'wanxiang_output' }]);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].content, body);
  assert.equal(sections[0].complete, true);
  assert.equal(sections[0].end, raw.length);
  assert.equal(streamingChatText(raw), body);
});

test('A10-F JSON branch preserves fenced text and escaped quote exactly', () => {
  const value = {
    text: ['x', '~~~text', OUTPUT_CLOSE, '~~~', 'x'].join('\n'),
    quote: '"' + String.fromCharCode(92),
  };
  const json = JSON.stringify(value);
  const extracted = extractGenerationEnvelope('character', `${OUTPUT_OPEN}${json}${OUTPUT_CLOSE}`);

  assert.equal(extracted.candidateText, json);
  assert.deepEqual(JSON.parse(extracted.candidateText), value);
});
