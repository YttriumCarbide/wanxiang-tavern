import { readFile } from 'node:fs/promises';
import { readGenerationResult } from '../server/generation-result.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SETTINGS } from '../src/content/official-characters.js';
import { HEROES, BUFFS } from '../src/data.js';
import { formatCharacterSetting } from '../src/ai/character-setting.js';
import { createWorldbookCounter, createCharacterReader } from '../server/character-reader.mjs';
import {
  parseCharacterOutput,
  normalizeCharacter,
  normalizeScript,
  settingOnly,
} from '../src/ai/contracts.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { generationMessages } from '../server/prompts.mjs';
import { checkOutputSchema } from '../src/ai/schema-check.js';
import { scriptInputSchema } from '../src/ai/script-schema.js';
import { characterInputSchema } from '../src/ai/character-schema.js';
import {
  characterDocument,
  characterResponse,
  requestContext,
  scriptFixture,
} from './fixtures/ai.js';

test('official sheets retain complete character prose and concise histories after retiring ultimates', () => {
  const count = createWorldbookCounter();
  const library = newLibrary();
  for (const hero of HEROES) {
    const setting = OFFICIAL_SETTINGS[hero.id];
    const worldbook = formatCharacterSetting(setting);
    assert(
      count(worldbook) >= 700 && count(worldbook) <= 1500,
      `${hero.name}: ${count(worldbook)}`,
    );
    assert(setting.history.length >= 150 && setting.history.length <= 260);
    assert(
      setting.history.includes('白') &&
        setting.history.includes('酒馆') &&
        setting.history.includes('召唤'),
    );
    assert.equal(setting.attack.name, hero.attackName);
    assert.deepEqual(
      setting.skills.map((item) => item.name),
      hero.skills.map((item) => item.name),
    );
    assert(!setting.ultimate && !hero.ultimate);
    assert(!worldbook.includes('奥义'));
    const entry = library.characters.find((entry) => entry.archetype === hero.id);
    assert.equal(entry.setting.worldbook, worldbook);
    assert.deepEqual(
      entry.combat,
      hero,
      'Filling worldbooks must preserve shipped gameplay values',
    );
    const text = settingOnly(entry);
    assert(!text.data && !text.combat && !text.hp && !text.skills);
  }
});

test('fresh character JSON compiles names from setting and strips both wrappers', () => {
  const raw = createCharacterReader()(characterResponse());
  checkOutputSchema(raw, characterInputSchema());
  const entry = normalizeCharacter(raw, 'character-new');
  assert.equal(entry.combat.weapon, 'staff');
  assert.equal(entry.setting.formatVersion, 3);
  assert(
    entry.setting.worldbook.includes('性别：') &&
      entry.setting.worldbook.includes('技能动作描写｜凝灯'),
  );
  assert(!JSON.stringify(entry.setting).includes('"description"'));
  const library = newLibrary();
  library.characters.push(entry);
  library.party[0] = entry.id;
  assert.equal(
    restoreLibrary(JSON.parse(JSON.stringify(library))).characters.at(-1).setting.worldbook,
    entry.setting.worldbook,
  );
  for (const edit of [
    (value) => {
      value.data.skills[0].name = '不同的技能';
    },
    (value) => {
      value.data.attackName = '另一种普攻';
    },
  ]) {
    const invalid = characterDocument();
    edit(invalid);
    const compiled = normalizeCharacter(invalid, 'character-inherited');
    assert.equal(compiled.combat.skills[0].name, invalid.setting.skills[0].name);
    assert.equal(compiled.combat.attackName, invalid.setting.attack.name);
    assert(!compiled.combat.ultimate);
  }
  const extra = characterDocument();
  extra.setting.chapterOpening = '不应有小说开场字段';
  assert.throws(() => parseCharacterOutput(JSON.stringify(extra)), /chapterOpening/);
  const malformed = characterDocument();
  malformed.data.skills[0].mp = '2蓝';
  assert.throws(() => parseCharacterOutput(JSON.stringify(malformed)), /mp/);
});

test('age is optional free lore and accepts prose, numbers, empty or missing values without content checks', () => {
  for (const age of [
    '二十九岁',
    '外貌二十岁左右，实际年龄未知',
    '自从来到裂隙以后就没有计算过年龄，旧历与这里的时间完全不同。',
    29,
    0,
    '',
    null,
    undefined,
  ]) {
    const raw = characterDocument();
    if (age === undefined) delete raw.setting.age;
    else raw.setting.age = age;
    const result = readGenerationResult(
      'character',
      JSON.stringify(raw),
      {},
      createCharacterReader(),
    );
    assert.equal(result.diagnostic.issues.length, 0);
    const expected = age == null || age === '' ? null : `年龄：${age}`;
    if (expected) assert(result.entry.setting.worldbook.includes(expected));
    else assert(!/^年龄：/m.test(result.entry.setting.worldbook));
    const library = newLibrary();
    library.characters.push(result.entry);
    assert.equal(
      restoreLibrary(library).characters.at(-1).setting.worldbook,
      result.entry.setting.worldbook,
    );
  }
});

test('character request classifies canon, design, complete mechanics and current intent into distinct sections', async () => {
  const messages = await generationMessages('character', { brief: '光明水晶法师', existing: [] });
  const context = requestContext(messages);
  assert(context.world.location.includes('多元宇宙裂缝'));
  assert(context.world.purpose.includes('下一任酒馆主人'));
  assert(context.world.summoning.includes('四周变白'));
  assert.deepEqual(context.design.settingTextTokens, [1000, 1500]);
  assert.deepEqual(
    context.mechanics.statuses.map((entry) => entry.id).sort(),
    Object.keys(BUFFS).sort(),
  );
  assert.deepEqual(context.mechanics.passives.locations, ['前场', '后场', '全战斗', '战斗外']);
  assert.equal(context.request.brief, '光明水晶法师');
  assert(messages.at(-1).content.includes('CHARACTER v3'));
});

test('script v2 allows sparse casts, narration, silent actions and empty optional stages', () => {
  const ids = newLibrary().party;
  const raw = scriptFixture(ids);
  checkOutputSchema(raw, scriptInputSchema(ids));
  const book = normalizeScript(raw, 'script-new', ids);
  assert(book.opening && book.scenes.every((scene) => scene.opening));
  assert(book.scenes[0].before[0].text.includes('“'));
  for (const scene of raw.scenes) {
    scene.before = [];
    scene.interlude = [];
    scene.after[0].speaker = 'narrator';
  }
  checkOutputSchema(raw, scriptInputSchema(ids));
  assert.doesNotThrow(() => normalizeScript(raw, 'narrator-only', ids));
  raw.scenes[0].before = [{ speaker: ids[0], action: '抬手指向闸杆。', dialogue: '' }];
  assert.doesNotThrow(() => normalizeScript(raw, 'silent-actor', ids));
  raw.scenes[0].before[0].action = '';
  assert.throws(() => normalizeScript(raw, 'blank-action', ids));
  raw.scenes[0].before[0].action = '检查闸杆。';
  raw.scenes[0].before[0].speaker = 'unknown';
  assert.throws(() => normalizeScript(raw, 'unknown-actor', ids));
});

test('new script context sends complete setting prose and environment while keeping numeric runtime definitions out', async () => {
  const library = newLibrary();
  const messages = await generationMessages('script', {
    brief: '探索路线上安排休息与交谈',
    boss: 'bossBloom',
    party: library.characters.map(settingOnly),
    history: [],
  });
  const context = requestContext(messages);
  assert.equal(context.characters.greenLight.length, 6);
  assert(!context.outputBudget);
  assert(context.encounters.every((entry) => !entry.milestone));
  assert(!context.pacing);
  assert(
    context.characters.greenLight.every(
      (entry) => entry.worldbook.includes('技能动作描写') && !entry.worldbook.includes('奥义'),
    ),
  );
  assert(!context.mechanics && !JSON.stringify(context.characters).includes('"effects"'));
  assert(context.encounters.every((entry) => entry.environment && !entry.hp && !entry.enemyIds));
});

test('Xinyi and alternative history wording pass format checks without changing the supplied character', async () => {
  const document = JSON.parse(
    await readFile(new URL('./fixtures/xinyi-character.json', import.meta.url), 'utf8'),
  );
  const read = createCharacterReader();
  for (const history of [
    document.setting.history,
    '她正在处理伤口，醒来时已来到一扇陌生的门前。',
    '从医多年。'.repeat(90),
  ]) {
    const raw = structuredClone(document);
    raw.setting.history = history;
    const result = readGenerationResult('character', JSON.stringify(raw), {}, read);
    assert.equal(result.diagnostic.stage, 'complete');
    assert(result.entry.setting.worldbook.includes(history));
    assert.equal(result.entry.combat.hp, 35);
    assert.equal(result.entry.combat.mp, 30);
    assert.equal(result.entry.combat.skills[1].endHeal, 2);
  }
  for (const edit of [
    (raw) => {
      raw.setting.history = 42;
    },
    (raw) => {
      delete raw.setting.history;
    },
    (raw) => {
      raw.data.hp = '35';
    },
    (raw) => {
      raw.data.skills[0].effects[0].type = 'unknown';
    },
  ]) {
    const invalid = structuredClone(document);
    edit(invalid);
    assert.throws(() => readGenerationResult('character', JSON.stringify(invalid), {}, read));
  }
});
