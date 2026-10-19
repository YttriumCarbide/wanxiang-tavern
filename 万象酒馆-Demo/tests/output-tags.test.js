import test from 'node:test';
import assert from 'node:assert/strict';
import { readOutputTags, streamingChatText } from '../src/ai/output-tags.js';
import { chatResponse } from '../server/chat-response.mjs';

const planning = `<konatan_planning~>
- 唯一一组<wanxiang_chat>与</wanxiang_chat>，随后唯一一组<wanxiang_actions>与</wanxiang_actions>。
- JSON示例：<wanxiang_json>{"example":true}</wanxiang_json>。
- 好感度ID使用official-aegis和official-pandora。
</konatan_planning~>
<tucao>这里也提到了<wanxiang_chat>正文</wanxiang_chat>和<wanxiang_actions>{}</wanxiang_actions>。</tucao>
`;
const body = '<p>潘多拉将果盘推到青缘面前。</p>\n“先休息一会儿吧。”';
const actions = {
  affection: [
    { id: 'official-pandora', delta: 1 },
    { id: 'official-aegis', delta: 1 },
  ],
  agreeToAdventure: [],
};
const reply = `<wanxiang_chat>${body}</wanxiang_chat><wanxiang_actions>${JSON.stringify(actions)}</wanxiang_actions>`;

test('tavern and quick replies distinguish planning references from actual body and actions', async () => {
  const input = { characters: actions.affection.map(({ id }) => ({ id })) };
  const content = planning + reply;
  for (const kind of ['chat', 'quick-chat']) {
    const result = await chatResponse(kind, content, [], input);
    assert.equal(result.content, body);
    assert.equal(result.display, body);
    if (kind === 'chat') assert.deepEqual(result.actions, actions);
    else assert(!('actions' in result));
  }
  const withoutActions = await chatResponse(
    'chat',
    planning + `<wanxiang_chat>${body}</wanxiang_chat>`,
    [],
    input,
  );
  assert.deepEqual(withoutActions.actions, { affection: [], agreeToAdventure: [] });
});

test('streaming never displays planning references, including chunks split inside any boundary', () => {
  const raw = planning + reply;
  const start = raw.indexOf('<wanxiang_chat>', planning.length) + '<wanxiang_chat>'.length;
  for (let end = 1; end <= raw.length; end++) {
    const shown = streamingChatText(raw.slice(0, end));
    if (end < start) assert.equal(shown, null);
    else {
      assert(shown !== null);
      assert(body.startsWith(shown), `unexpected streaming text at ${end}: ${shown}`);
      assert(!shown.includes('wanxiang_'));
    }
  }
  assert.equal(streamingChatText(raw), body);
});

test('Reborn thinking and report wrappers tolerate the preset optional closing tilde without hiding the final reply', async () => {
  const input = { characters: actions.affection.map(({ id }) => ({ id })) };
  for (const name of ['think_nya', 'report_nya']) {
    for (const close of [name, `${name}~`]) {
      const raw =
        `<${name}~>格式：<wanxiang_chat>示例</wanxiang_chat><wanxiang_actions>{}</wanxiang_actions></${close}>` +
        reply;
      assert.equal(streamingChatText(raw), body);
      assert.equal((await chatResponse('chat', raw, [], input)).content, body);
    }
  }
});

test('all protocols ignore nested reasoning and inline references but preserve JSON and HTML content', () => {
  const json = JSON.stringify({ text: '<think>`<wanxiang_json>`</wanxiang_json>', escaped: '"\\' });
  const raw = `<THINK><analysis>${reply}</analysis></THINK>\n说明：\`<wanxiang_json>\`\n<wanxiang_json>${json}</wanxiang_json><reasoning>再次提及<wanxiang_json></reasoning>`;
  const sections = readOutputTags(raw, [{ tag: 'wanxiang_json', json: true }]);
  assert.equal(sections.length, 1);
  assert.deepEqual(JSON.parse(sections[0].content), JSON.parse(json));
  const text = '说明：`<wanxiang_chat>`和`</wanxiang_chat>`。<b>原样保留</b>';
  assert.equal(streamingChatText(`<wanxiang_chat>${text}</wanxiang_chat>`), text);
  const unpairedReference =
    '<konatan_planning~>格式自查中提到<analysis>和<wanxiang_chat>，这里仅是说明。</konatan_planning~>';
  assert.equal(streamingChatText(unpairedReference + reply), body);
  assert.equal(
    readOutputTags(unpairedReference + `<wanxiang_json>${json}</wanxiang_json>`, [
      { tag: 'wanxiang_json', json: true },
    ])[0].content,
    json,
  );
});

test('real duplicate, nested, crossing and incomplete boundaries still fail without accepting examples', async () => {
  for (const content of [
    planning,
    planning + reply + reply,
    '<wanxiang_chat><wanxiang_chat>嵌套</wanxiang_chat></wanxiang_chat>',
    '<wanxiang_chat>正文<wanxiang_actions>{}</wanxiang_chat></wanxiang_actions>',
    '<wanxiang_chat>正文',
    reply + '</wanxiang_chat>',
    reply + '<wanxiang_actions>{}</wanxiang_actions>',
    '<think>' + reply,
  ]) {
    await assert.rejects(chatResponse('chat', content, [], {}));
  }
  await assert.rejects(
    chatResponse(
      'chat',
      planning + '<wanxiang_chat>正文</wanxiang_chat><wanxiang_actions>{broken}</wanxiang_actions>',
      [],
      {},
    ),
    /JSON格式错误/u,
  );
});
