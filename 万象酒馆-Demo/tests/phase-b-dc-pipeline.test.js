import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { characterOutputSchema } from '../src/ai/character-schema.js';
import {
  compileCharacterDesign,
  characterConstraintText,
  characterGenerationPlan,
} from '../src/character-generation.js';
import { scriptOutputSchema } from '../src/ai/script-schema.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { archiveOverlandLoot, resolveItemReferences } from '../src/archives.js';
import { creationItems } from '../src/ai/pipeline/creation-request.js';
import { compileEquipmentDesign } from '../src/equipment-generation.js';
import {
  normalizeOverlandItems,
  normalizeOverlandStory,
  overlandPlan,
} from '../src/overland-travel.js';
import { normalizeInvitationPlan } from '../src/invitation.js';
import {
  confirmEventChoice,
  adventureTurnContext,
  createAdventureState,
} from '../src/adventure/state.js';
import {
  DC_SPLIT_MARKER,
  prepareFreeDcContext,
  resolveFixedChoiceCheck,
  buildDcDisplayCheck,
  settleDcReward,
  applyDcPenalty,
} from '../src/dc-rp.js';
import { chatRequest } from '../src/ai/pipeline/chat-request.js';
import { chatResponse } from '../src/ai/pipeline/chat-response.js';
import { applyRelationshipActions } from '../src/relationships.js';
import { newLibrary, officialCharacter } from '../src/ai/library.js';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { normalizeWorldSettings, syncBuiltinWorldbook } from '../src/ai/worldbook.js';
import { tavernPresetFixture } from './fixtures/ai.js';

const passthroughRegex = async (_scripts, tasks) => tasks.map(({ text }) => ({ text }));

test('character generation schema & compiler validate dcAttrs while keeping legacy optional', () => {
  const plan = characterGenerationPlan({ rollId: 'dc-char', rarity: 'rare', complexity: 3 });
  const schema = characterOutputSchema({ plan });
  assert.ok(schema.properties.data.properties.dcAttrs);
  assert.match(characterConstraintText(plan), /dcAttrs/);

  const raw = {
    schemaVersion: 4,
    setting: {
      name: '洛琳',
      gender: '女',
      age: '22',
      appearance: '穿深蓝游侠短披风',
      personality: '说话干脆，不喜拖泥带水。',
      history: '原为边境斥候，踏入白光后来到酒馆。',
      attack: { name: '快箭', description: '射出一支铁羽箭。' },
      skills: [
        { name: '疾步连射', description: '造成敏捷伤害并附加流血。' },
        { name: '林地警觉', description: '自身获得敏捷光环。' },
      ],
      entrySkill: { name: '鹰眼照准', description: '对对位敌人造成伤害。' },
    },
    data: {
      archetype: 'lyria',
      weapon: 'bow',
      profile: 'striker',
      dcAttrs: { str: 10, dex: 16, con: 10, int: 12, wis: 14, cha: 10 },
      skills: [
        {
          kind: 'active',
          ap: 1,
          cost: 'standard',
          target: 'enemy',
          effects: [{ type: 'damage', power: 'standard' }],
        },
        {
          kind: 'passive',
          rules: [
            {
              mode: 'continuous',
              conditions: [{ type: 'front' }],
              target: 'self',
              effects: [{ type: 'buff', power: 'standard', buff: 'haste' }],
            },
          ],
        },
      ],
      entrySkill: {
        target: 'opposite',
        effects: [{ type: 'damage', power: 'low' }],
      },
    },
  };
  const compiled = compileCharacterDesign(raw, {
    rollId: 'dc-char',
    rarity: 'rare',
    complexity: 3,
  });
  assert.deepEqual(compiled.data.dcAttrs, { str: 10, dex: 16, con: 10, int: 12, wis: 14, cha: 10 });
});

test('script / overland / creation pipeline preserves optional category, DC choices and rejects gem crafting', () => {
  const schema = scriptOutputSchema();
  const choiceProps =
    schema.properties.data.properties.adventure.properties.event.properties.choices.items
      .properties;
  assert.ok(choiceProps.attr && choiceProps.dc);

  const novelData = {
    title: '雾桥暗哨',
    prologue: '天色将明未明。\n\n石阶还留着露水。',
    battleLines: {
      bossIntro: '止步！',
      partyReply: '让开！',
      bossEnraged: '休想过去！',
      bossDefeat: '石桥裂开了。',
    },
    epilogueGal: '【旁白】众人舒了口气。',
    epilogueProse: '晨雾消散，众人在铃声中踏回暖灯下的酒馆。',
    adventure: {
      event: {
        title: '生锈闸门',
        description: '水闸卡在半空。',
        choices: [
          { label: '硬撬铁链', detail: '用臂力拉开', attr: 'str', dc: 11 },
          { label: '观察榫卯', detail: '寻找松动锁销', attr: 'int', dc: 9 },
        ],
      },
      quest: {
        title: '越过桥楼',
        description: '必须找到通行机关并解除警铃。',
        overview: [
          { location: '桥墩', detail: '湿滑苔藓下压着铜牌' },
          { location: '塔顶', detail: '风铃绳系在铁钩上' },
          { location: '东门', detail: '油灯未熄' },
          { location: '水渠', detail: '漂着木筏' },
        ],
        goals: [
          { objective: '打开石桥通路', required: true },
          { objective: '安抚惊慌的哨兵', required: false },
        ],
        dcHints: [{ action: '拆除风铃报警线', attr: 'dex', dc: 10 }],
        commonState: '石桥通路敞开。',
      },
    },
    npcs: [],
    items: [
      {
        name: '哨兵皮甲',
        description: '耐磨的巡逻轻甲',
        category: 'armor',
        value: 18,
        encounter: 0,
      },
    ],
    nextHook: { setting: '伏笔：起·远处塔楼仍有火光', phase: '起' },
  };
  const novel = normalizeScript(
    {
      schemaVersion: 5,
      story: ['开战前', '抉择前', '精英战前', '任务前', '首领战前'],
      data: novelData,
    },
    'script-cat-test',
  );
  assert.equal(novel.items[0].category, 'armor');
  assert.deepEqual(novel.adventure.event.choices[0].dcCheck, { attr: 'str', dc: 11 });
  assert.equal(novel.adventure.quest.dcHints[0].attr, 'dex');

  const resolvedRefs = resolveItemReferences(
    [{ name: '哨兵皮甲', reference: true, encounter: 2 }],
    novel.items,
  );
  assert.equal(resolvedRefs[0].category, 'armor');

  assert.throws(
    () =>
      normalizeScript(
        {
          schemaVersion: 5,
          story: novel.story,
          data: {
            ...novelData,
            items: [
              {
                name: '非法宝石',
                description: '想造宝石',
                category: 'gem',
                value: 20,
                encounter: 0,
              },
            ],
          },
        },
        'bad-gem',
      ),
    /道具分类无效/,
  );

  const plan = overlandPlan('cross-meadow', 'ruins', null);
  const evTestPlan = {
    ...plan,
    stages: [{ ...plan.stages[0], id: 'ev-dc-1', type: 'event' }],
  };
  const overlandActs = [
    {
      id: 'ev-dc-1',
      title: '路边奇遇',
      story: '【旁白】一名行商拦住了去路。',
      choices: ['开口盘问', { label: '观察马车暗格', attr: 'wis', dc: 10 }],
    },
  ];
  const overlandStory = normalizeOverlandStory(
    {
      prologue: '朝阳初升。\n\n石路尚带露水。',
      acts: overlandActs,
      epilogueGal: '【旁白】众人收拾行囊归返。',
      epilogueProse: '回到酒馆时炉火正旺。',
    },
    evTestPlan,
  );
  const evStage = overlandStory.find((stage) => stage.choices);
  assert.equal(evStage.choices[1].dcCheck.attr, 'wis');
  assert.equal(evStage.choices[1].dcCheck.dc, 10);
  const loot = normalizeOverlandItems(
    [
      {
        stageId: plan.stages[0].id,
        name: '巡林短弓',
        description: '轻便木弓',
        category: 'weapon',
        value: 15,
      },
    ],
    plan,
  );
  assert.equal(loot[0].category, 'weapon');

  const lib = newLibrary();
  const archived = archiveOverlandLoot(lib, {
    runId: 'overland-cat',
    title: '遗迹之路',
    leg: plan.stages[0],
    items: loot,
  });
  assert.equal(archived[0].category, 'weapon');

  const prepared = creationItems({
    items: [{ ...archived[0], script: '路上捡到短弓' }],
  });
  assert.equal(prepared[0].category, 'weapon');

  const crafted = compileEquipmentDesign(
    {
      id: prepared[0].id,
      name: '巡林短弓',
      description: '射程稳定',
      design: { statFocus: ['attack'], rules: [] },
    },
    prepared[0],
  );
  assert.equal(crafted.category, 'weapon');

  const inv = normalizeInvitationPlan({
    title: '支援断章｜微雨茶会',
    prologue: '午后落起了小雨。\n\n茶壶正冒着白气。',
    premise: '商讨修补茶具',
    stages: [
      {
        title: '修补裂口',
        scene: 'tavern',
        description: '瓷盖有道细纹',
        hint: '试着用金漆',
        intro: '【旁白】桌上摊着工具。',
        tasks: ['稳住裂口'],
        choices: ['顺势托住茶杯', { label: '以巧手调漆', attr: 'dex', dc: 10 }],
      },
      {
        title: '试茶',
        scene: 'tavern',
        description: '水温刚好',
        hint: '控制倾倒角度',
        intro: '【旁白】茶叶沉入杯底。',
        tasks: ['斟出头汤'],
        choices: ['稳稳提壶', '先温杯盏'],
      },
      {
        title: '定约',
        scene: 'tavern',
        description: '雨渐停了',
        hint: '告别前留句准话',
        intro: '【旁白】窗外天晴。',
        tasks: ['约好下次再聚'],
        choices: ['明晚老地方', '挑本曲谱带来'],
      },
    ],
    finale: { title: '茶香犹在', scene: 'tavern', intro: '【旁白】雨过天晴。' },
  });
  assert.deepEqual(inv.stages[0].choices, ['顺势托住茶杯', '以巧手调漆']);
  assert.equal(inv.stages[0].choiceChecks[1].attr, 'dex');
  assert.equal(inv.stages[0].choiceChecks[1].dc, 10);
});

test('chatRequest hides fixed-choice numbers, exposes free 2D6 pool, and chatResponse parses wanxiang_dc + signed affection', async () => {
  const library = newLibrary();
  const qingyuan = library.characters[0];
  const preset = normalizePromptPreset(tavernPresetFixture()).preset;
  const worldInfo = { books: [], settings: normalizeWorldSettings({}), state: {} };
  const opts = {
    profile: { maxTokens: 1000, contextSize: 131072, promptProcessing: 'none' },
    worldInfo,
    regexScripts: [],
    countTokens: (t) => String(t).length,
    runRegexTasks: passthroughRegex,
  };

  // Fixed choice hides numeric DC & roll from prompt
  const book = {
    id: 'b1',
    title: '试炼',
    story: ['战1', '选2', '战3', '任4', '王5'],
    adventure: {
      event: {
        title: '断桥',
        description: '桥索快断了',
        choices: [
          { id: 'c1', label: '飞身跃过', detail: '助跑起跳', dcCheck: { attr: 'dex', dc: 12 } },
        ],
      },
      quest: {
        description: 'desc',
        overview: [],
        goals: [{ id: 'g1', objective: '过桥', required: true }],
        commonState: 'ok',
      },
    },
    npcs: [],
  };
  const exp = { id: 'ep-1', index: 1, adventure: null };
  exp.adventure = createAdventureState(book, 'ep-1');
  const fixedCheck = resolveFixedChoiceCheck({
    library,
    member: qingyuan,
    choice: book.adventure.event.choices[0],
    rng: () => 0.99, // double 6 -> crit!
  });
  confirmEventChoice(book.adventure, exp.adventure, 'c1', '', fixedCheck);
  const turn = adventureTurnContext(exp, book, '飞身跃过');

  const fixedReq = await chatRequest(
    'quick-chat',
    {
      text: '飞身跃过',
      characters: [{ id: qingyuan.id, name: qingyuan.setting.name, worldbook: '主角' }],
      selected: [qingyuan.id],
      history: [],
      adventure: turn,
      dcContext: { mode: 'fixed', choiceCheck: fixedCheck },
    },
    preset,
    opts,
  );
  const fixedText = fixedReq.messages.map((m) => m.content).join('\n');
  assert.match(fixedText, /大成功/);
  assert.doesNotMatch(fixedText, /dcCheck|"dc":12/);

  // Free mode injects pre-rolled 2D6 pool & rules
  const freeCtx = prepareFreeDcContext(library, [qingyuan], () => 0.5);
  const freeReq = await chatRequest(
    'chat',
    {
      text: '我试图单手掰弯酒馆铁叉。',
      place: 'bar',
      characters: [{ id: qingyuan.id, name: qingyuan.setting.name, worldbook: '主角' }],
      selected: [qingyuan.id],
      history: [],
      dcContext: { mode: 'free', ...freeCtx },
    },
    preset,
    opts,
  );
  const freeText = freeReq.messages.map((m) => m.content).join('\n');
  assert.match(freeText, /本轮 2D6 预抽判定池/);
  assert.match(freeText, /\[\[DC_CHECK\]\]/);

  // chatResponse parses signed -5..5 affection & [[DC_CHECK]] split + <wanxiang_dc>
  const res = await chatResponse(
    'chat',
    `<wanxiang_output>【旁白】你捏紧了叉柄。\n${DC_SPLIT_MARKER}\n【旁白】咔哒一声，铁叉反而刮伤了你的指节。</wanxiang_output><wanxiang_actions>{"affection":[{"id":"official-edith","delta":-3}],"agreeToAdventure":[]}</wanxiang_actions><wanxiang_dc>{"triggered":true,"actorId":"${qingyuan.id}","attr":"str","dc":13,"outcome":"fail","reward":{"tier":"none","kind":"none"},"penalty":{"hpLoss":6,"mpLoss":0,"debuff":"bleed","goldLoss":5,"affection":[{"id":"official-edith","delta":-2}],"ambush":false,"summary":"指节擦伤并赔了杯钱"}}</wanxiang_dc>`,
    [],
    {
      characters: [
        { id: qingyuan.id, name: qingyuan.setting.name },
        { id: 'official-edith', name: '伊蒂丝' },
      ],
    },
    passthroughRegex,
  );
  assert.ok(!res.content.includes(DC_SPLIT_MARKER));
  assert.equal(res.dcSplit.beforeText, '【旁白】你捏紧了叉柄。');
  assert.equal(res.dcSplit.afterText, '【旁白】咔哒一声，铁叉反而刮伤了你的指节。');
  assert.equal(res.dcOutcome.outcome, 'fail');
  assert.equal(res.dcOutcome.penalty.hpLoss, 6);
  assert.equal(res.actions.affection[0].delta, -3);

  // Signed affection applies cleanly in applyRelationshipActions without burning gain slots
  library.characters.push(officialCharacter('edith'));
  library.relationships['official-edith'] = { affection: 10, gains: 3, agreed: false };
  const changes = applyRelationshipActions(library, res.actions);
  assert.equal(changes[0].delta, -3);
  assert.equal(library.relationships['official-edith'].affection, 7);
  assert.equal(library.relationships['official-edith'].gains, 3);

  // Black-box math reconciliation keeps UI math consistent with prose outcome
  const reconciled = buildDcDisplayCheck({
    library,
    member: qingyuan,
    dcOutcome: res.dcOutcome,
    preRoll: freeCtx,
    seed: 'reconcile-1',
  });
  assert.equal(reconciled.outcome, 'fail');
  assert.equal(reconciled.success, false);
  assert.ok(reconciled.total < reconciled.dc);

  // Code-owned reward settlement + penalty application
  library.inventory.gold = 20;
  const reward = settleDcReward(library, 'dc-claim-1', { tier: 'medium', kind: 'gold' });
  assert.ok(reward.gold >= 16 && reward.gold <= 28);
  const pen = applyDcPenalty(library, res.dcOutcome.penalty, qingyuan.id, {
    carried: { units: { [qingyuan.id]: { side: 'player', hp: 50, mp: 20, buffs: {} } } },
  });
  assert.equal(pen.hpLoss, 6);
  assert.equal(pen.debuff, 'bleed');
  assert.equal(pen.goldLoss, 5);
  assert.equal(library.relationships['official-edith'].affection, 5);
});

test('builtin worldbook preserves idempotent sync after Phase B DC and loot updates', async () => {
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const migrated = syncBuiltinWorldbook({ name: 'sync-test', entries: {} }, builtin);
  assert.deepEqual(syncBuiltinWorldbook(migrated, builtin), migrated);
  assert.match(builtin.entries['196'].content, /-5～5/);
  assert.match(builtin.entries['29'].content, /weapon.*armor.*pendant/);
  assert.match(builtin.entries['198'].content, /\[\[DC_CHECK\]\]/);
});

test('choice events always synthesize DC outcome/split while free events suppress DC triggers', async () => {
  const preset = normalizePromptPreset(tavernPresetFixture()).preset;
  const worldInfo = { books: [], settings: normalizeWorldSettings({}), state: {} };
  const opts = {
    profile: { maxTokens: 1000, contextSize: 131072, promptProcessing: 'none' },
    worldInfo,
    regexScripts: [],
    countTokens: (t) => String(t).length,
    runRegexTasks: passthroughRegex,
  };
  const fixedCheck = {
    choiceId: 'choice-1',
    choiceLabel: '硬撬铁链',
    actorId: 'hero-qingyuan',
    actorName: '青缘',
    attr: 'str',
    attrLabel: '力量',
    dc: 10,
    dice: [4, 5],
    diceSum: 9,
    baseMod: 2,
    gemBonus: 0,
    mod: 2,
    total: 11,
    outcome: 'success',
    label: '成功',
    success: true,
  };
  const choiceRes = await chatResponse(
    'quick-chat',
    '<wanxiang_output>【旁白】青缘握紧铁链。\n\n【旁白】锈锁应声崩开。</wanxiang_output>',
    [],
    {
      characters: [{ id: 'hero-qingyuan', name: '青缘' }],
      dcContext: { mode: 'fixed', choiceCheck: fixedCheck },
    },
    passthroughRegex,
  );
  assert.equal(choiceRes.dcOutcome.triggered, true);
  assert.equal(choiceRes.dcOutcome.outcome, 'success');
  assert.equal(choiceRes.dcSplit.beforeText, '【旁白】青缘握紧铁链。');
  assert.equal(choiceRes.dcSplit.afterText, '【旁白】锈锁应声崩开。');

  const questReq = await chatRequest(
    'quick-chat',
    {
      text: '我试着推开石门。',
      characters: [{ id: 'hero-qingyuan', name: '青缘', worldbook: '主角' }],
      selected: ['hero-qingyuan'],
      history: [],
      adventure: {
        mode: 'quest',
        episodeId: 'ep-1',
        goals: [{ id: 'goal-1', title: '开锁', status: 'pending', required: true }],
        boss: { revision: 1, lines: [] },
      },
    },
    preset,
    opts,
  );
  const questPrompt = questReq.messages.map((m) => m.content).join('\n');
  assert.match(questPrompt, /严禁进行属性\/DC检定/);

  const questRes = await chatResponse(
    'quick-chat',
    `<wanxiang_output>【旁白】石门沉重。\n${DC_SPLIT_MARKER}\n【旁白】门缝纹丝不动。</wanxiang_output><wanxiang_adventure>{"episodeId":"ep-1","revision":1,"tasks":[],"patches":[]}</wanxiang_adventure><wanxiang_dc>{"triggered":true,"actorId":"hero-qingyuan","attr":"str","dc":10,"outcome":"fail"}</wanxiang_dc>`,
    [],
    {
      characters: [{ id: 'hero-qingyuan', name: '青缘' }],
      adventure: {
        mode: 'quest',
        episodeId: 'ep-1',
        goals: [{ id: 'goal-1', title: '开锁', status: 'pending', required: true }],
        boss: { revision: 1, lines: [] },
      },
    },
    passthroughRegex,
  );
  assert.equal(questRes.dcOutcome, undefined);
  assert.equal(questRes.dcSplit, undefined);
  assert.ok(!questRes.content.includes(DC_SPLIT_MARKER));
});
