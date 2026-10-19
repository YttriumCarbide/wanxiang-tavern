import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EDITH } from '../src/content/edith.js';
import {
  TUTORIAL_DUNGEON,
  CORRIDOR_DUNGEON,
  officialDungeonFor,
} from '../src/content/official-dungeons.js';
import { migrateTutorialWorldbook } from '../server/worldbook-tutorial.mjs';
import { newLibrary, officialCharacter, restoreLibrary, compileRoster } from '../src/ai/library.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { newCampaign } from '../src/campaign.js';
import { newEncounter, preview, makeAction } from '../src/engine.js';
import { tutorialSpec } from '../src/content/tutorial.js';
import { settingOnly, normalizeCharacter } from '../src/ai/contracts.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationInput, generationRequest } from '../server/prompts.mjs';
import { officialSummonPool } from '../src/summoning.js';
import { characterDocument } from './fixtures/ai.js';

test('tutorial migration preserves edited Pandora and injection controls while replacing the requested sheets', () => {
  const pandora = {
    content: '玩家重新编辑的潘多拉设定',
    disable: true,
    order: 432,
    extensions: { wanxiang: { characterId: 'official-pandora' } },
  };
  const source = {
    entries: {
      0: pandora,
      1: {
        content: '过期同伴资料',
        key: ['过期关键词'],
        disable: true,
        depth: 7,
        order: 987,
        extensions: { wanxiang: { characterId: 'official-aegis' }, custom: '保留' },
      },
      2: {
        content: TUTORIAL_DUNGEON.outline.replaceAll('伊蒂丝', '潘多拉') + '\n自定义线索',
        order: 789,
        extensions: { wanxiang: { officialDungeonId: TUTORIAL_DUNGEON.id } },
      },
    },
  };
  const migrated = migrateTutorialWorldbook(source);
  assert.deepEqual(migrated.entries[0], pandora);
  assert(migrated.entries[1].content.includes('长景月汐'));
  assert(!migrated.entries[1].content.includes('过期同伴资料'));
  for (const key of ['disable', 'depth', 'order', 'extensions'])
    assert.deepEqual(migrated.entries[1][key], source.entries[1][key]);
  assert(migrated.entries[2].content.includes('伊蒂丝'));
  assert(migrated.entries[2].content.includes('自定义线索'));
  assert.equal(migrated.entries[2].order, 789);
  assert(Object.values(migrated.entries).some((entry) => entry.content.includes('辰砂晦明')));
  assert(
    Object.values(migrated.entries).some((entry) => entry.content === CORRIDOR_DUNGEON.outline),
  );
  assert.equal(source.entries[1].content, '过期同伴资料');
  assert.equal(officialDungeonFor({ map: 'ruins', sequence: 1 }), CORRIDOR_DUNGEON);
  assert.equal(officialDungeonFor({ map: 'ruins', sequence: 2 }), null);
  assert.equal(officialDungeonFor({ map: 'forest', sequence: 1 }), null);
  assert.equal(officialDungeonFor({ map: 'ruins', sequence: 0, tutorial: true }), TUTORIAL_DUNGEON);
});

test('script guidance adds Chinese output and doubled first/last prose while preserving edited rules', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/script-guidance-'));
  const store = await createWorldbookStore(directory);
  const { book } = await store.get('tavern-world');
  const output = Object.values(book.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'script-output',
  );
  output.content = '自定义格式补充\n本次动态JSON Schema：\n{{outputSchema}}';
  output.depth = 3;
  output.order = 8765;
  await store.save({ id: 'tavern-world', book });
  await writeFile(path.join(directory, 'builtin-content.json'), '{"version":15}\n');
  const migrated = await createWorldbookStore(directory);
  const rule = (await migrated.get('tavern-world')).book.entries[output.uid];
  assert(rule.content.includes('自定义格式补充'));
  assert(rule.content.includes('必须使用中文'));
  assert(rule.content.includes('2:1:1:1:2'));
  assert.deepEqual([rule.depth, rule.order], [3, 8765]);
  const library = newCampaign(defaultProtagonist());
  const input = {
    brief: '生成本次旅程',
    boss: 'bossGate',
    party: library.characters.map(settingOnly),
  };
  const request = await generationRequest('script', input, null, {
    worldInfo: await migrated.resolve('script', input),
    countTokens: (value) => Math.ceil(value.length / 4),
  });
  assert(
    request.messages.some(
      (message) =>
        message.content.includes('必须使用中文') && message.content.includes('2:1:1:1:2'),
    ),
  );
  const restarted = await createWorldbookStore(directory);
  assert.equal(
    (await restarted.get('tavern-world')).book.entries[output.uid].content,
    rule.content,
  );
});

test('outline pacing migration removes fixed scene allocation and reaches the real generation request', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/outline-pacing-'));
  const store = await createWorldbookStore(directory);
  const { book } = await store.get('tavern-world');
  const output = Object.values(book.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'script-output',
  );
  const oldTail =
    '第一段增加进入副本、环境铺陈、人物交流和事件起因的细节；第六段仍在最终Boss获胜后展示，增加战后反应、任务收束、人物互动与返程或后续伏笔。扩写应增加有效内容，不重复段落凑字数，也不改变六场战斗和正文展示时点。';
  output.content = `保留自定义输出补充\n${oldTail}\n本次动态JSON Schema：\n{{outputSchema}}`;
  output.depth = 2;
  output.order = 8765;
  const outline = Object.values(book.entries).find(
    (entry) => entry.extensions?.wanxiang?.officialDungeonId === TUTORIAL_DUNGEON.id,
  );
  const oldIntro =
    '叙述使用第三人称，主角统一写作<user>。这是需要沿着扩写的剧情大纲，保留人物、线索与事件的先后关系；文风与细节由当前预设决定。扩写为六段正文，战斗名单、场次、胜负和已发生事实以本次请求的数据为准。';
  const [heading, , , body] = TUTORIAL_DUNGEON.outline.split('\n');
  assert(body && !TUTORIAL_DUNGEON.outline.includes('\n\n遗迹门口'));
  outline.content = `${heading}\n${oldIntro}\n\n${body.replace('遗迹门口', '\n\n遗迹门口')}\n自定义大纲补充`;
  outline.order = 789;
  await store.save({ id: 'tavern-world', book });
  await writeFile(path.join(directory, 'builtin-content.json'), '{"version":16}\n');
  const migrated = await createWorldbookStore(directory);
  const updated = (await migrated.get('tavern-world')).book;
  const rule = updated.entries[output.uid];
  const reference = updated.entries[outline.uid];
  assert(!rule.content.includes(oldTail));
  assert(rule.content.includes('保留自定义输出补充'));
  assert.deepEqual([rule.depth, rule.order, reference.order], [2, 8765, 789]);
  assert(reference.content.includes(TUTORIAL_DUNGEON.outline));
  assert(reference.content.includes('自定义大纲补充'));
  const library = newCampaign(defaultProtagonist());
  const input = {
    brief: '扩写完整教程',
    boss: 'bossGate',
    party: library.characters.map(settingOnly),
    exploration: { ...library.exploration.ruins.frontier[0], tutorial: true },
  };
  const request = await generationRequest('script', input, null, {
    worldInfo: await migrated.resolve('script', input),
    countTokens: (value) => Math.ceil(value.length / 4),
  });
  const messages = request.messages.map((message) => message.content).join('\n');
  assert(messages.includes('一次回复内完成整份大纲'));
  assert(messages.includes('不与大纲的自然段、句子或事件一一对应'));
  assert(messages.includes('由AI根据实际战斗进度自行安排事件'));
  assert(messages.includes('自定义大纲补充'));
  assert(!messages.includes(oldTail));
  const restarted = await createWorldbookStore(directory);
  assert.deepEqual((await restarted.get('tavern-world')).book, updated);
});

test('player identity and protocol reminders migrate without copying the outline placeholder into prose', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/script-player-'));
  const store = await createWorldbookStore(directory);
  const { book } = await store.get('tavern-world');
  for (const entry of Object.values(book.entries)) {
    if (entry.extensions?.wanxiang?.generationRule?.endsWith('-output')) {
      entry.content = entry.content.replace(/\n\n【输出标签唯一性】[\s\S]*?(?=\n\n|$)/u, '');
    }
    if (entry.extensions?.wanxiang?.generationRule === 'script-output') {
      entry.content +=
        '\nJSON字段名、标签名、<user>占位符、程序规定的ID与map等枚举值保持原样，不翻译、不改写。\n自定义补充';
      entry.depth = 2;
    }
    if (entry.extensions?.wanxiang?.officialDungeonId) {
      entry.content = entry.content.replace(
        TUTORIAL_DUNGEON.outline.split('\n')[1].split('这是')[0],
        '叙述使用第三人称，主角统一写作<user>。',
      );
    }
    if (entry.extensions?.wanxiang?.generationRule === 'script-player')
      delete book.entries[entry.uid];
  }
  await store.save({ id: 'tavern-world', book });
  await writeFile(path.join(directory, 'builtin-content.json'), '{"version":17}\n');
  const migrated = await createWorldbookStore(directory);
  const updated = (await migrated.get('tavern-world')).book;
  const entries = Object.values(updated.entries);
  for (const kind of ['character', 'script']) {
    assert(
      entries
        .find((entry) => entry.extensions?.wanxiang?.generationRule === `${kind}-output`)
        .content.includes('不要在思考、规划'),
    );
  }
  const output = entries.find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'script-output',
  );
  assert(output.content.includes('自定义补充'));
  assert(!output.content.includes('标签名、<user>占位符'));
  assert.equal(output.depth, 2);
  assert.equal(
    entries.filter((entry) => entry.extensions?.wanxiang?.generationRule === 'script-player')
      .length,
    1,
  );
  const library = newCampaign(defaultProtagonist());
  const player = library.characters.find((entry) => entry.id === library.campaign.protagonistId);
  player.setting.name = '林舟';
  library.party.reverse();
  const input = {
    brief: '生成本次旅程',
    boss: 'bossGate',
    protagonistId: player.id,
    party: library.party
      .filter(Boolean)
      .map((id) => settingOnly(library.characters.find((entry) => entry.id === id))),
    exploration: { ...library.exploration.ruins.frontier[0], tutorial: true },
  };
  const request = await generationRequest('script', input, null, {
    worldInfo: await migrated.resolve('script', input),
    countTokens: (value) => Math.ceil(value.length / 4),
  });
  const content = request.messages.map((message) => message.content).join('\n');
  assert.deepEqual(generationInput('script', input).characters.player, {
    id: player.id,
    name: '林舟',
    role: '玩家创建的主角；设定见greenLight中同一ID的角色，不是额外NPC',
  });
  assert(content.includes('不是另一个同行NPC'));
  assert(content.includes('不输出字面量<user>'));
  assert(!content.includes('主角统一写作<user>'));
  const restarted = await createWorldbookStore(directory);
  assert.deepEqual((await restarted.get('tavern-world')).book, updated);
});

test('Edith restores as an official guest and pays health for real capped mana and damage', () => {
  const library = newCampaign(defaultProtagonist());
  library.party[1] = null;
  library.party[0] = 'official-edith';
  library.party[2] = library.campaign.protagonistId;
  const restored = restoreLibrary(library);
  assert.equal(restored.characters.find((entry) => entry.id === 'official-edith').combat.hp, 77);
  const legacy = newLibrary();
  legacy.characters.push(officialCharacter('edith'));
  assert(restoreLibrary(legacy).characters.some((entry) => entry.id === 'official-aegis'));
  const state = newEncounter(tutorialSpec(2), null, 2, compileRoster(restored));
  state.units.aegis.hp = 40;
  state.units.aegis.mp = 19;
  state.units.aegis.block = 20;
  const action = makeAction(state, 'aegis', 'cinnabar-eclipse', 'warden', 0);
  const result = preview(state, [action]);
  assert(result.valid, JSON.stringify(result.invalid));
  assert.equal(result.final.units.aegis.hp, 34);
  assert.equal(result.final.units.aegis.mp, 22);
  assert.equal(result.final.units.aegis.block, 20);
  assert(result.final.units.warden.hp < state.units.warden.hp);
  state.units.aegis.hp = 6;
  const rejected = preview(state, [action]);
  assert(!rejected.valid);
  assert.equal(rejected.final.units.aegis.hp, 6);
  assert.equal(rejected.final.units.aegis.mp, 19);
  state.units.aegis.hp = 40;
  state.units.aegis.mp = 10;
  const heal = preview(state, [makeAction(state, 'aegis', 'tidal-moonlight', 'warden', 0)]);
  assert(heal.valid);
  assert.equal(heal.final.units.aegis.hp, 47);
  assert.equal(heal.final.units.aegis.mp, 5);
  const raw = characterDocument();
  raw.data.skills[1] = { ...EDITH.skills[1] };
  const compiled = normalizeCharacter(raw, 'character-health-cost');
  assert.equal(compiled.combat.skills[1].hp, 6);
  assert.equal(compiled.combat.skills[1].effects[0].type, 'selfMana');
});

test('editable canon and official tutorial outline migrate once and only match the tutorial request', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/official-content-'));
  const store = await createWorldbookStore(directory);
  const { book } = await store.get('tavern-world');
  const canon = Object.values(book.entries).find(
    (entry) => entry.extensions?.wanxiang?.canon === 'tavern',
  );
  assert(canon.content.includes('外勤中转站'));
  assert(canon.content.includes('完全忠诚于<user>'));
  assert(!canon.content.includes('没有已确认的酒馆主人'));
  const outline = Object.values(book.entries).find(
    (entry) => entry.extensions?.wanxiang?.officialDungeonId === 'ruins-tutorial',
  );
  assert(outline.content.includes('灰伯') && outline.content.includes('<user>'));
  assert(!outline.content.includes('你们'));
  outline.content += '\n大纲编辑回写验证';
  await store.save({ id: 'tavern-world', book });
  const restored = await createWorldbookStore(directory);
  const fresh = (await restored.get('tavern-world')).book;
  assert.equal(
    Object.values(fresh.entries).filter((entry) => entry.extensions?.wanxiang?.officialDungeonId)
      .length,
    2,
  );
  const library = newCampaign(defaultProtagonist());
  assert(officialSummonPool(library, fresh).some((entry) => entry.id === 'official-aegis'));
  const input = {
    brief: '生成本次旅程',
    boss: 'bossGate',
    chapter: 1,
    party: library.characters.map(settingOnly),
    exploration: { ...library.exploration.ruins.frontier[0], tutorial: true },
  };
  const options = {
    worldInfo: await restored.resolve('script', input),
    countTokens: (value) => Math.ceil(value.length / 4),
  };
  const tutorial = await generationRequest('script', input, null, options);
  assert(tutorial.messages.some((message) => message.content.includes('大纲编辑回写验证')));
  const normal = await generationRequest(
    'script',
    { ...input, exploration: { ...input.exploration, tutorial: false } },
    null,
    options,
  );
  assert(!normal.messages.some((message) => message.content.includes('大纲编辑回写验证')));
});

test('five-fight migration updates stored rules and examples while preserving controls and custom additions', async () => {
  const { migrateJourneyWorldbook } = await import('../server/worldbook-journey.mjs');
  const source = {
    entries: {
      0: {
        content:
          'story恰好六段；前五段对应五场普通战斗，第六段收尾。0～5，story[5]，2:1:1:1:1:2。自定义补充。',
        disable: true,
        order: 8765,
        depth: 3,
        extensions: { wanxiang: { generationRule: 'script-output' } },
      },
      1: {
        content:
          '<wanxiang_json>' +
          JSON.stringify({
            story: ['一', '二', '三', '四', '五', '六'],
            data: { items: [{ encounter: 5 }] },
          }) +
          '</wanxiang_json>',
        extensions: { wanxiang: { generationExample: 'script' } },
      },
      2: { content: '六段自定义文字', extensions: {} },
    },
  };
  const migrated = migrateJourneyWorldbook(source);
  assert(migrated.entries[0].content.includes('前四段对应四场普通战斗，第五段'));
  assert(migrated.entries[0].content.includes('0～4，story[4]，2:1:1:1:2'));
  assert(migrated.entries[0].content.includes('自定义补充'));
  for (const key of ['disable', 'order', 'depth'])
    assert.equal(migrated.entries[0][key], source.entries[0][key]);
  const example = JSON.parse(migrated.entries[1].content.replace(/<\/?wanxiang_json>/g, ''));
  assert.equal(example.story.length, 5);
  assert.equal(example.story[3], '四\n\n五');
  assert.equal(example.data.items[0].encounter, 4);
  assert.deepEqual(migrated.entries[2], source.entries[2]);
  assert.equal(source.entries[1].content.includes('四\n\n五'), false);
});
