import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createAiApi } from '../server/ai-api.mjs';
import { readGenerationResult } from '../server/generation-result.mjs';
import { parseCharacterOutput } from '../src/ai/contracts.js';
import { compactCharacterDocument } from './fixtures/ai.js';

test('creation API uses an independent connection, exact source IDs and value budget, with shared presets, worldbook formats and no automatic retries', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/creation-api-'));
  const calls = [];
  let invalid = false;
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'prompts'),
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      const items = [{ id: 'source-ore', name: '石片' }];
      assert(payload.messages.some((message) => message.content.includes('玩家在回廊拾起石片。')));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                schemaVersion: 2,
                items: items.map((item) => ({
                  id: item.id,
                  name: item.name,
                  description: '增加生命',
                  design: { statFocus: invalid ? ['limit'] : ['hp'], rules: [] },
                })),
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 40 },
      });
    },
  });
  const server = createServer((req, res) => void api(req, res, req.url));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  async function post(route, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    await post('config', {
      kind: 'creation',
      baseUrl: 'http://127.0.0.1:9876/v1',
      model: 'creation-model',
      apiKey: '',
      maxTokens: 2048,
      contextSize: 16000,
      tokenField: 'max_tokens',
    });
    const input = {
      items: [
        {
          id: 'source-ore',
          name: '石片',
          description: '一枚晶体石片',
          value: 4,
          script: '玩家在回廊拾起石片。',
          map: 'ruins',
        },
      ],
      characters: '禁止额外角色注入',
      world: '禁止额外世界注入',
    };
    assert.equal((await post('creation/plan', input)).status, 200);
    assert.equal(calls.length, 0);
    const accepted = await post('generate/creation', input);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.items[0].price, 4);
    assert.equal(calls[0].model, 'creation-model');
    assert(!JSON.stringify(calls[0]).includes('禁止额外角色注入'));
    assert(!JSON.stringify(calls[0]).includes('禁止额外世界注入'));
    assert(calls[0].messages.some((message) => message.content.includes('以太装备设计者')));
    assert.equal(
      (await post('prompts/select', { kind: 'creation', id: 'character-default' })).status,
      200,
    );
    await post('prompts/select', { kind: 'creation', id: 'creation-default' });
    invalid = true;
    assert.equal((await post('generate/creation', input)).status, 400);
    assert.equal(calls.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('NPC refinement preserves identity and ephemeral dialogue while generic passive rules compile through the character schema', () => {
  const raw = compactCharacterDocument();
  raw.data.skills[1] = {
    passive: true,
    text: '受伤后恢复生命，一趟三次',
    rules: [
      {
        mode: 'event',
        event: 'damageTaken',
        conditions: [{ type: 'front' }],
        target: 'self',
        effects: [{ type: 'heal', value: 2 }],
        limit: 3,
      },
    ],
  };
  raw.arrivalDialogue = [
    { speaker: 'character', text: '又见面了。' },
    { speaker: 'player', text: '欢迎。' },
  ];
  const input = {
    purpose: 'npc',
    npc: { id: 'known', name: raw.setting.name },
    brief: '细化已知NPC',
  };
  const result = readGenerationResult(
    'character',
    JSON.stringify(raw),
    input,
    parseCharacterOutput,
  );
  assert.equal(result.entry.combat.skills[1].rules[0].event, 'damageTaken');
  assert.equal(result.arrivalDialogue.length, 2);
  assert.equal('arrivalDialogue' in result.entry, false);
  assert(!result.entry.setting.worldbook.includes('又见面了'));
  assert.throws(
    () =>
      readGenerationResult(
        'character',
        JSON.stringify(raw),
        { ...input, npc: { name: '另一个人' } },
        parseCharacterOutput,
      ),
    /原姓名/,
  );
  raw.arrivalDialogue = [{ speaker: 'character', text: '只有一句' }];
  assert.throws(
    () => readGenerationResult('character', JSON.stringify(raw), input, parseCharacterOutput),
    /格式/,
  );
});
