import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { CHAT_PLACES, tavernActivities, mergeFutureScript, scriptProse } from '../src/chat.js';
import { normalizeScript, settingOnly } from '../src/ai/contracts.js';
import { normalizeQuestLead, restoreTavernQuests } from '../src/tavern-quests.js';
import { adventureTestScript, combatTestScript } from '../src/content/generation-mode.js';
import { newLibrary, officialCharacter, restoreLibrary } from '../src/ai/library.js';
import { createAiApi } from '../server/ai-api.mjs';
import { compatibleRequest } from '../server/compatible.mjs';
import { chatResponse } from '../src/ai/pipeline/chat-response.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { invitationRequest, invitationResponse } from '../src/ai/pipeline/invitation-request.js';
import { processPrompt } from '../server/prompt-processing.mjs';
import { requestTokenReport } from '../server/request-tokens.mjs';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { samplingFromPreset } from '../src/ai/sampling.js';
import { presetHelperScripts } from '../src/ai/helper-scripts.js';
import { restoreGenerationOptions } from '../src/generation-options.js';

test('chat keeps legacy quest hooks, but only saved state can carry quest progress', async () => {
  const fixture = adventureTestScript();
  const fields = {
    title: fixture.data.adventure.quest.title,
    description: fixture.data.adventure.quest.description,
    type: 'social',
    level: 3,
  };
  const legacy = { ...fields, hook: fields.description };
  const reply = await chatResponse(
    'chat',
    `<wanxiang_output>${fixture.story[0]}</wanxiang_output>` +
      `<wanxiang_quest>${JSON.stringify({
        ...legacy,
        status: 'completed',
        objectives: [{ current: 1, target: 1 }],
        rewards: { gold: 100 },
      })}</wanxiang_quest>`,
    { place: 'bar', questOffer: true },
  );
  assert.deepEqual(reply.quest, legacy);

  const savedLegacy = {
    ...legacy,
    id: 'legacy-lead',
    status: 'completed',
    hook: `  ${legacy.hook}\n`,
  };
  const savedWithoutHook = { ...fields, id: 'journal-only', status: 'offered' };
  assert.deepEqual(restoreTavernQuests([savedLegacy, savedWithoutHook]), [
    savedLegacy,
    { ...savedWithoutHook, hook: '' },
  ]);
});

test('the chat quest appendix accepts journal lead types but cannot create guild bounties', async () => {
  const fixture = adventureTestScript();
  const { title, description } = fixture.data.adventure.quest;
  const dialogue = `<wanxiang_output>${fixture.story[0]}</wanxiang_output>`;
  for (const type of ['social', 'character', 'battle', 'bounty', ['social']]) {
    const lead = { title, description, type, level: 3 };
    const footer = `<wanxiang_quest>${JSON.stringify(lead)}</wanxiang_quest>`;
    const reply = await chatResponse('chat', dialogue + footer, { place: 'bar', questOffer: true });
    assert.deepEqual(
      reply.quest,
      typeof type === 'string' && type !== 'bounty' ? { ...lead, hook: '' } : undefined,
    );
    assert.equal(reply.content, fixture.story[0]);
  }
});

test('the live pipeline preserves ensemble and optional quest guidance without a worldbook', async () => {
  const party = ['edith', 'pandora', 'lumi', 'aegis'].map((id) =>
    settingOnly(officialCharacter(id)),
  );
  const { title, description } = adventureTestScript().data.adventure.quest;
  const pipeline = createAiPipeline({
    settings: { get: () => ({ contextSize: 400000, promptProcessing: 'none' }) },
    worlds: { resolve: async () => ({ books: [], settings: {} }) },
    helperStorage: { get: () => ({}) },
    countTokens: (text) => text.length,
  });
  const preset = normalizePromptPreset({
    prompts: [{ identifier: 'taskContext', marker: true }],
  }).preset;
  const socialQuest = { hook: description };
  const script = await pipeline.buildRequest(
    'script',
    { brief: title, socialQuest, party },
    preset,
  );
  assert.equal(script.transport.format, 'tagged-json');
  assert.deepEqual(script.messages.at(-1), { role: 'user', content: JSON.stringify(socialQuest) });
  const focus = script.messages.filter(({ content }) =>
    content.includes('【多人队伍聚焦与反端水】'),
  );
  assert.equal(focus.length, 1);
  assert.equal(focus[0].role, 'system');
  assert.match(focus[0].content, /每个 story\[i\] 是一幕/);
  const roster = party.map(({ id, name }) => ({ id, name }));
  assert(focus[0].content.includes(`可用人物ID与姓名：${JSON.stringify(roster)}。`));

  const quick = await pipeline.buildRequest(
    'quick-chat',
    {
      place: 'bar',
      text: title,
      characters: party,
      selected: party.map(({ id }) => id),
      questOffer: true,
    },
    preset,
  );
  const quickPrompt = quick.messages.map(({ content }) => content).join('\n');
  assert.match(quickPrompt, /除本轮明确启用的附录外，不返回JSON/);
  assert.match(quickPrompt, /【任务日志线索】这是一份独立的可选日志附录/);
});

test('normal play always generates; the combined developer switch migrates both old options', () => {
  const defaults = {
    skipAiGeneration: false,
    developerMode: false,
    allowRetreat: false,
    editArchives: false,
    unlockAllCodex: false,
    quickTestOverlords: false,
    quickTest: false,
    quickTestApep: false,
    protagonistApi: true,
    scriptApi: true,
    skipOverlandApi: false,
  };
  assert.deepEqual(restoreGenerationOptions(null), defaults);
  assert.deepEqual(restoreGenerationOptions({ tavernVisitors: false }), defaults);
  assert.deepEqual(restoreGenerationOptions({ protagonistApi: false, scriptApi: false }), defaults);
  assert.deepEqual(
    restoreGenerationOptions({ developerMode: true, protagonistApi: false, scriptApi: false }),
    {
      ...defaults,
      skipAiGeneration: true,
      developerMode: true,
      protagonistApi: false,
      scriptApi: false,
    },
  );
  assert.deepEqual(restoreGenerationOptions({ developerMode: true }), {
    ...defaults,
    developerMode: true,
  });
  assert.equal(
    restoreGenerationOptions({
      developerMode: true,
      protagonistApi: false,
      skipAiGeneration: false,
    }).protagonistApi,
    true,
  );
  assert.equal(restoreGenerationOptions({ skipAiGeneration: true }).skipAiGeneration, false);
});

test('a rewritten script can only replace future prose; visited scenes and combat metadata stay frozen', () => {
  const old = {
    ...normalizeScript(combatTestScript(), 'original'),
    party: ['original-party'],
    exploration: { seed: 23 },
    runId: 'run',
    generationInput: { brief: 'first input' },
    display: { story: Array(5).fill('old display') },
  };
  const next = normalizeScript(
    { ...combatTestScript(), story: Array.from({ length: 5 }, (_, index) => `new ${index}`) },
    'replacement',
  );
  const snapshot = structuredClone(old);
  const merged = mergeFutureScript(old, next, 2);
  assert.deepEqual(old, snapshot);
  assert.deepEqual(merged.story.slice(0, 3), old.story.slice(0, 3));
  assert.deepEqual(merged.story.slice(3), ['new 3', 'new 4']);
  for (const key of ['id', 'party', 'exploration', 'runId', 'generationInput'])
    assert.deepEqual(merged[key], old[key]);
  assert.deepEqual(merged.display.story.slice(0, 3), old.display.story.slice(0, 3));
  assert.deepEqual(mergeFutureScript(old, next, 4), old);
  assert(!scriptProse(merged).includes('schemaVersion'));
});

test('seat activities differ by location and chat text survives save restoration without gameplay changes', () => {
  const library = newLibrary(),
    snapshots = structuredClone(library.characters);
  const activities = Object.keys(CHAT_PLACES).map((place) =>
    tavernActivities(library.characters, place, () => 0),
  );
  assert.equal(
    new Set(activities.map((items) => items[0].text)).size,
    Object.keys(CHAT_PLACES).length,
  );
  library.tavernChat = [
    { role: 'user', content: '给我一把剑' },
    {
      role: 'assistant',
      content: '<b>这是木制小摆件。</b>',
      speakerIds: ['official-aegis'],
      speakerName: '长景月汐',
    },
  ];
  const restored = restoreLibrary(library);
  assert.deepEqual(restored.tavernChat, library.tavernChat);
  assert.deepEqual(restored.characters, snapshots);
  assert.deepEqual(restored.inventory, library.inventory);
});

test('portable sampling, strict no-tools and merge-tools use actual upstream behavior', () => {
  const sampling = samplingFromPreset({
    temperature: 0.8,
    top_k: 40,
    top_p: 0.9,
    presence_penalty: 0.4,
    frequency_penalty: -0.2,
    openai_max_context: 16000,
    openai_max_tokens: 2000,
    stream_openai: true,
    reasoning_effort: 'high',
  });
  assert.equal(sampling.stream, true);
  assert.equal(sampling.contextSize, 16000);
  const messages = [
    { role: 'system', content: 'a' },
    { role: 'system', content: 'b' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'x' }] },
    { role: 'tool', content: 'result', tool_call_id: 'x' },
    { role: 'system', content: 'tail' },
  ];
  const strict = processPrompt(messages, 'strict');
  assert.equal(strict[0].content, 'a\n\nb');
  assert.equal(strict[1].role, 'user');
  assert(!strict.some((message) => message.role === 'tool' || message.tool_calls));
  const merge = processPrompt(messages, 'merge_tools');
  assert(merge.some((message) => message.role === 'tool' && message.tool_call_id === 'x'));
  assert(messages[2].tool_calls);
  const scripts = presetHelperScripts({
    extensions: {
      tavern_helper: {
        scripts: [
          [
            'folder',
            {
              enabled: true,
              children: [
                ['script', { id: 'a', content: 'test' }],
                ['script', { id: 'b', content: 'skip', enabled: false }],
              ],
            },
          ],
        ],
      },
    },
  });
  assert.deepEqual(
    scripts.map((script) => [script.id, script.enabled]),
    [
      ['a', true],
      ['b', false],
    ],
  );
});

test('upstream streaming decodes split UTF-8, usage, sampling and length failures', async () => {
  let payload;
  const encode = new TextEncoder();
  const source = encode.encode(
    'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: {"choices":[{"delta":{"content":"来客"},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\ndata: [DONE]\n\n'.replaceAll(
      '\n',
      '\r\n',
    ),
  );
  const chunks = [];
  const result = await compatibleRequest(
    {
      baseUrl: 'https://example.com/v1',
      model: 'mock',
      temperature: null,
      tokenField: 'max_tokens',
      maxTokens: 500,
    },
    [{ role: 'user', content: 'hi' }],
    {
      sampling: { stream: true, top_k: 24, reasoning_effort: 'high', maxTokens: 1000 },
      onDelta: (delta) => chunks.push(delta),
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body);
        return new Response(
          new ReadableStream({
            start(controller) {
              for (let index = 0; index < source.length; index += 7)
                controller.enqueue(source.slice(index, index + 7));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      },
    },
  );
  assert.equal(result.content, '你好来客');
  assert.deepEqual(result.usage, { input: 12, output: 4 });
  assert.equal(chunks.join(''), result.content);
  assert.equal(payload.top_k, 24);
  assert.equal(payload.max_tokens, 1000);
  assert.equal(payload.stream, true);
  assert.equal(payload.reasoning_effort, 'high');
});

test('city chat separates one valid opening environment block and preserves dialogue and actions', async () => {
  const edith = settingOnly(officialCharacter('edith'));
  const input = { place: 'city-square', characters: [edith] };
  const prose = `【对白:${edith.id}|nod】A。`;
  const output = (body) => `<wanxiang_output>${body}</wanxiang_output>`;
  const lead = '【环境】环境测试。\n第二行。【环境结束】';
  const actions = { affection: [{ id: edith.id, delta: 1 }], agreeToAdventure: [] };
  assert.deepEqual(
    await chatResponse(
      'chat',
      `${output(`${lead}\n${prose}`)}<wanxiang_actions>${JSON.stringify(actions)}</wanxiang_actions>`,
      input,
    ),
    {
      content: prose,
      actions,
      environment: {
        placeId: 'city-center',
        title: CHAT_PLACES['city-square'].name,
        text: '环境测试。\n第二行。',
      },
    },
  );
  const unclosed = '【环境】环境测试。';
  const oversized = '测'.repeat(801);
  for (const [kind, place, body, expectedText] of [
    ['chat', 'city-square', prose, prose],
    ['chat', 'city-square', unclosed + prose, '环境测试。' + prose],
    ['chat', 'city-square', `【环境】${oversized}【环境结束】${prose}`, oversized + prose],
    ['chat', 'city-square', prose + lead, prose + '环境测试。\n第二行。'],
    ['chat', 'bar', lead + prose, '环境测试。\n第二行。' + prose],
    ['quick-chat', 'city-square', lead + prose, '环境测试。\n第二行。' + prose],
  ]) {
    const result = await chatResponse(kind, output(body), { ...input, place });
    assert.deepEqual(
      result.environment,
      kind === 'chat' && place === 'city-square'
        ? {
            placeId: 'city-center',
            title: CHAT_PLACES[place].name,
            text: CHAT_PLACES[place].environment,
          }
        : undefined,
    );
    assert.equal(result.content, expectedText);
  }
});
test('city appointment prompts and response normalization stay inside the current venue snapshot', () => {
  const member = officialCharacter('edith');
  const allowedScenes = { 'city-center': 'P', market: 'M' };
  const invitation = {
    activity: 'walk',
    member: member.id,
    topic: 'A',
    city: 'starbell',
    startScene: 'city-center',
    allowedScenes,
    stageCount: 3,
  };
  const profile = { tokenField: 'none', contextSize: 32000, promptProcessing: 'none' };
  const preset = normalizePromptPreset({ prompts: [{ content: 'P' }] }).preset;
  const request = invitationRequest(
    { invitation, party: [{ id: member.id, name: member.setting.name }] },
    preset,
    profile,
    (value) => value.length,
  );
  const boundaryPrompt = request.messages.find((message) =>
    message.content.includes('城内约见地点边界'),
  );
  assert(boundaryPrompt);
  assert(
    boundaryPrompt.content.includes(
      JSON.stringify({ city: 'starbell', startScene: 'city-center', allowedScenes }),
    ),
  );
  assert(!boundaryPrompt.content.includes('road-bridge'));
  assert.match(
    boundaryPrompt.content,
    /每幕 stages\[\]\.intro 和 finale\.intro 均必须以“【环境】\.\.\.【环境结束】”开头/,
  );
  const makeScene = (scene, name) => ({
    title: name,
    scene,
    intro: '【环境】A。【环境结束】' + String.fromCharCode(10) + '【对白:official-edith|hop】A。',
    tasks: ['A'],
    choices: ['A', 'B'],
  });
  const rawPlan = {
    title: '支援断章｜T',
    premise: 'A',
    stages: [makeScene('city-center', 'S1'), makeScene('market', 'S2'), makeScene('market', 'S3')],
    finale: makeScene('market', 'F'),
  };
  const tagged = (plan) => `<wanxiang_output>${JSON.stringify(plan)}</wanxiang_output>`;
  const result = invitationResponse(tagged(rawPlan), invitation);
  assert.equal(result.stages[0].scene, invitation.startScene);
  assert.equal(result.stages[0].environment, 'A。');
  assert.equal(result.stages[0].intro, '【对白:official-edith|hop】A。');
  const missingLead = {
    ...rawPlan,
    stages: [
      { ...makeScene('city-center', 'S1'), intro: '【对白:official-edith】我们走进广场。' },
      ...rawPlan.stages.slice(1),
    ],
  };
  assert.throws(() => invitationResponse(tagged(missingLead), invitation), /缺少环境描写/);
  for (const invalid of [
    { ...rawPlan, stages: [makeScene('road-bridge', 'S1'), ...rawPlan.stages.slice(1)] },
    { ...rawPlan, stages: [makeScene('market', 'S1'), ...rawPlan.stages.slice(1)] },
  ])
    assert.throws(() => invitationResponse(tagged(invalid), invitation), /地点/);
  assert.throws(
    () => invitationResponse(tagged(rawPlan), { ...invitation, allowedScenes: { market: 'M' } }),
    /开场地点/,
  );
  assert.throws(
    () => invitationResponse(tagged(rawPlan), { ...invitation, city: 'unknown' }),
    /城市/,
  );
});
test('chat API assembles world, green-light mentions, prose-only history and exact final TK without touching game data', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/chat-unit-'));
  const requests = [];
  let responseOverride = null;
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'presets'),
    worldInfoDirectory: path.join(directory, 'world'),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Response.json({
        choices: [
          {
            message: {
              content:
                responseOverride ??
                (requests
                  .at(-1)
                  .messages.some((message) => message.content.includes('<wanxiang_output>'))
                  ? '<wanxiang_output>你好，来客。</wanxiang_output>'
                  : '<p>你好，来客。</p>'),
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      });
    },
  });
  const server = createServer((req, res) => {
    void api(req, res, req.url);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(route, body, expectedStatus = 200) {
    const response = await fetch(base + '/api/ai/' + route, {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, expectedStatus, result.error);
    return result;
  }
  try {
    // This case compares preview bytes; random entropy has its own transport coverage.
    await post('anti-route', { action: 'save', config: { entropy: false } });
    for (const kind of ['chat', 'quick-chat'])
      await post('config', {
        kind,
        baseUrl: 'https://example.com/v1',
        model: 'mock',
        apiKey: 'PRIVATE_CHAT_KEY',
        tokenField: 'max_tokens',
        maxTokens: 2000,
        promptProcessing: 'merge_tools',
      });
    const preset = {
      name: 'chat-test',
      prompts: [
        { identifier: 'main', content: '自然交流', role: 'system' },
        { identifier: 'chatHistory', marker: true },
      ],
      top_k: 20,
      top_p: 0.8,
      extensions: {
        tavern_helper: { scripts: [{ id: 'sample', content: 'test', enabled: true }] },
      },
    };
    const saved = await post('prompts/save', { preset });
    assert.equal(saved.preset.extensions.tavern_helper.scripts.length, 1);
    await post('prompts/select', { kind: 'chat', id: saved.preset.id });
    const input = {
      text: '没有勾选乙，但我想问乙：你好。',
      place: 'bar',
      selected: ['a'],
      characters: [
        { id: 'a', name: '甲', worldbook: '甲是安静的人' },
        { id: 'b', name: '乙', worldbook: '乙喜欢读书' },
        { id: 'c', name: '丙', worldbook: 'SHOULD_NOT_SEND' },
      ],
      previousScript: '上次副本的原文。',
      history: [
        { role: 'user', content: '之前的话' },
        { role: 'assistant', content: '之前的回应' },
      ],
    };
    const preview = await post('prompts/preview', { kind: 'chat', input });
    assert.equal(requests.length, 0);
    const generated = await post('generate/chat', input);
    assert.deepEqual(generated.request.messages, preview.messages);
    assert.equal(generated.display, undefined);
    assert(generated.content.includes('来客'));
    const text = preview.messages.map((message) => message.content).join('\n');
    assert(text.includes('甲（id：a）') && text.includes('乙（id：b）'));
    assert(!text.includes('丙（id：c）'));
    assert(text.includes('不能填写角色姓名'));
    assert(
      text.includes('甲是安静的人') &&
        text.includes('乙喜欢读书') &&
        text.includes('吧台') &&
        text.includes('上次副本的原文'),
    );
    assert(
      text.includes('战斗道具') &&
        !text.includes('SHOULD_NOT_SEND') &&
        !text.includes('CHARACTER v3') &&
        !text.includes('SCRIPT v3'),
    );
    assert.equal(
      preview.messages.filter((message) => message.content.includes(input.text)).length,
      1,
    );
    const counts = await post('tokens', {
      texts: preview.messages.map((message) => message.content),
    });
    assert.equal(
      counts.counts.reduce((sum, count) => sum + count, 0),
      preview.tokens.contentTokens,
    );
    assert.equal(requests[0].top_k, 20);
    const quick = await post('generate/quick-chat', { ...input, environment: '第三战的遗迹大厅' });
    assert.equal(quick.content, '你好，来客。');
    responseOverride =
      '<konatan_planning~>唯一一组<wanxiang_chat>与</wanxiang_chat>，随后一组<wanxiang_actions>与</wanxiang_actions>。</konatan_planning~><tucao>这里只是格式说明。</tucao><wanxiang_chat>你好，来客。</wanxiang_chat><wanxiang_actions>{"affection":[{"id":"a","delta":1}],"agreeToAdventure":[]}</wanxiang_actions>';
    const taggedChat = await post('generate/chat', input);
    assert.equal(taggedChat.content, '你好，来客。');
    assert.deepEqual(taggedChat.actions.affection, [{ id: 'a', delta: 1 }]);
    const taggedQuick = await post('generate/quick-chat', input);
    assert.equal(taggedQuick.content, '你好，来客。');
    await post('prompts/save', {
      id: saved.preset.id,
      preset: { ...saved.preset, contextSize: 4096, maxTokens: 512, stream: true },
    });
    const longInput = {
      ...input,
      history: Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: `往事${index}：${'山河旧事，篝火旁的同行者低声交谈。'.repeat(150)}`,
      })),
    };
    const shortened = await post('prompts/preview', { kind: 'chat', input: longInput });
    assert(shortened.tokens.totalBudgetEstimate <= 4096);
    const shortenedPrompt = shortened.messages.map(({ content }) => content).join('\n');
    assert.equal(shortenedPrompt.split('按情绪条件使用，不强制每句触发').length - 1, 1);
    assert(shortenedPrompt.includes('【对白:npc:姓名|立绘编号|hop】'));
    assert(shortened.warnings.some((warning) => warning.includes('本地记录保留')));
    assert(!shortened.messages.some((message) => message.content.includes('往事0：')));
    assert.equal(longInput.history.length, 8);
    const streamed = await fetch(base + '/api/ai/generate/chat', {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(longInput),
    });
    assert(streamed.headers.get('content-type').includes('text/event-stream'));
    const events = (await streamed.text())
      .split('\n\n')
      .filter(Boolean)
      .map((event) => JSON.parse(event.slice(6)));
    assert.equal(events[0].type, 'request');
    assert.equal(events.at(-1).type, 'complete');
    assert.equal(events.at(-1).result.content, '你好，来客。');
    assert.deepEqual(events.at(-1).result.actions.affection, [{ id: 'a', delta: 1 }]);
    responseOverride = null;
    // The 4096-TK override only belongs to the history-trimming case above.
    await post('prompts/save', { id: saved.preset.id, preset: saved.preset });
    const edith = settingOnly(officialCharacter('edith'));
    const cityInput = {
      text: '测试输入',
      place: 'city-square',
      timeOfDay: 'night',
      selected: [edith.id],
      characters: [edith],
    };
    for (const presetId of ['chat-default', saved.preset.id]) {
      await post('prompts/select', { kind: 'chat', id: presetId });
      const cityPreview = await post('prompts/preview', { kind: 'chat', input: cityInput });
      const cityRule = cityPreview.messages.filter((message) =>
        message.content.includes('【城内交流环境开头】'),
      );
      assert.equal(cityRule.length, 1);
      const { content } = cityRule[0];
      assert(content.includes('星钟广场（夜晚）'));
      assert(content.includes('紧接开标签必须先写一组 【环境】纯文本环境描写【环境结束】'));
      assert(content.includes('不在标记内填写地点名、ID 或其他参数'));
      assert(content.includes('闭合环境块后另起一行接本轮 Gal 对白或旁白'));
      const tavernPreview = await post('prompts/preview', {
        kind: 'chat',
        input: { ...cityInput, place: 'table' },
      });
      assert(
        !tavernPreview.messages.some((message) => message.content.includes('【城内交流环境开头】')),
      );
    }
    const quickPreview = await post('prompts/preview', { kind: 'quick-chat', input: cityInput });
    assert(
      !quickPreview.messages.some((message) => message.content.includes('【城内交流环境开头】')),
    );
    const invalidPreview = await post(
      'prompts/preview',
      { kind: 'chat', input: { ...cityInput, place: 'unknown-city-place' } },
      400,
    );
    assert.equal(invalidPreview.error, '请先选择交流地点');
    await post('prompts/select', { kind: 'chat', id: 'chat-default' });
    const inactive = await post('generate/chat', input);
    assert.equal(inactive.display, undefined);
    assert.equal(inactive.content, '你好，来客。');
    const questParty = [
      edith,
      settingOnly(officialCharacter('pandora')),
      settingOnly(officialCharacter('lumi')),
      settingOnly(officialCharacter('aegis')),
    ];
    const questFixture = adventureTestScript();
    const questInput = {
      text: questFixture.data.adventure.quest.description,
      place: 'bar',
      selected: questParty.map(({ id }) => id),
      characters: questParty,
      questOffer: true,
    };
    const callsBeforeQuestPreview = requests.length;
    const questPreview = await post('prompts/preview', { kind: 'chat', input: questInput });
    assert.equal(requests.length, callsBeforeQuestPreview, 'Preview never calls the provider');
    const questPrompt = questPreview.messages.map(({ content }) => content).join('\n');
    const example = questPrompt.match(/<wanxiang_quest>(\{[^}]+\})<\/wanxiang_quest>/u);
    assert(example, 'Chat adds a quest footer in the actual output protocol');
    assert.deepEqual(Object.keys(JSON.parse(example[1])), [
      'title',
      'description',
      'type',
      'level',
    ]);
    assert.match(questPrompt, /标题与简介采用《上古卷轴》式任务日志口吻/);
    assert.match(questPrompt, /任务目标、完成条件、进度、结算和奖励由游戏掌控/);
    assert.match(questPrompt, /title 用凝练的委托标题，最多 50 个字符/);
    assert.match(questPrompt, /description 用简短纪事.*最多 400 个字符/u);
    assert.match(questPrompt, /先记已知事实，再记仍可追查的线索/);
    assert.match(questPrompt, /不得虚构本轮未出现的人物或目标/);
    assert.match(questPrompt, /文风不是程序拒收条件/);
    assert.equal(questPrompt.split('【多人队伍聚焦与反端水】').length - 1, 1);
    const questPartyRoster = questParty.map(({ id, name }) => ({ id, name }));
    assert(questPrompt.includes(`可用人物ID与姓名：${JSON.stringify(questPartyRoster)}。`));
    assert.match(questPrompt, /仅写作指导，不作硬校验/);
    assert.match(
      questPrompt,
      /满编也只让最契合局势的 2～3 名同伴或现场 NPC 开口，同屏最多 2～3 人/,
    );
    assert.match(questPrompt, /非焦点不开口、不新登场/);
    assert.match(questPrompt, /一句【旁白】交代分工/);
    assert.match(questPrompt, /已在场则用【退场:角色ID】切出/);
    assert.match(questPrompt, /跨幕轮换焦点，各有高光/);
    assert.match(questPrompt, /围绕一件事深谈 3～5 个来回/);
    assert.match(questPrompt, /同一角色连写 2～3 条/);

    const fixtureDialogue = questFixture.story[0];
    const lead = {
      title: questFixture.data.adventure.quest.title,
      description: questFixture.data.adventure.quest.description,
      type: 'social',
      level: 3,
    };
    responseOverride =
      `<wanxiang_output>${fixtureDialogue}</wanxiang_output>` +
      '<wanxiang_actions>{"affection":[],"agreeToAdventure":[]}</wanxiang_actions>' +
      `<wanxiang_quest>${JSON.stringify(lead)}</wanxiang_quest>`;
    const questReply = await post('generate/chat', questInput);
    assert.deepEqual(questReply.request.messages, questPreview.messages);
    const sentQuestPrompt = requests
      .at(-1)
      .messages.map(({ content }) => content)
      .join('\n');
    assert(sentQuestPrompt.includes(example[0]));
    assert.equal(sentQuestPrompt.split('【多人队伍聚焦与反端水】').length - 1, 1);
    assert.equal(questReply.content, fixtureDialogue);
    assert.deepEqual(questReply.quest, { ...lead, hook: '' });
    assert.deepEqual(normalizeQuestLead(questReply.quest), questReply.quest);
    assert(
      !JSON.stringify(await (await fetch(base + '/api/ai/config')).json()).includes(
        'PRIVATE_CHAT_KEY',
      ),
    );
    assert.equal(
      requestTokenReport(preview.messages, (value) => value.length).perMessage.length,
      preview.messages.length,
    );
    responseOverride =
      '<wanxiang_chat>没有丢失的正文 PRIVATE_CHAT_KEY</wanxiang_chat><wanxiang_actions>{"affection":[{"id":"a","delta":99}],"agreeToAdventure":[]}</wanxiang_actions>';
    for (const live of [false, true]) {
      await post('prompts/save', {
        id: saved.preset.id,
        preset: { ...saved.preset, stream: live },
      });
      await post('prompts/select', { kind: 'chat', id: saved.preset.id });
      const response = await fetch(base + '/api/ai/generate/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: live ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(input),
      });
      const report = live
        ? (await response.text())
            .split('\n\n')
            .filter(Boolean)
            .map((event) => JSON.parse(event.slice(6)))
            .at(-1)
        : await response.json();
      assert(report.error.includes('好感度或同行指令无效'));
      assert.equal(report.diagnostic.stage, 'chat-response');
      assert.equal(
        report.diagnostic.rawText,
        responseOverride.replace('PRIVATE_CHAT_KEY', '[密钥已隐藏]'),
      );
      assert.equal(report.diagnostic.request.usage.output, 8);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
