import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { AnimationClip, VectorKeyframeTrack } from '../vendor/build/three.module.js';
import { characterDocument } from './fixtures/ai.js';
import { normalizeCharacter, normalizeScript, settingOnly } from '../src/ai/contracts.js';
import { characterPresentation } from '../src/ai/character-presentation.js';
import { characterSheet } from '../src/app/character-sheet.js';
import { MONSTER_LORE } from '../src/content/monsters.js';
import { ENEMIES, BOSSES, encounterSpec } from '../src/data.js';
import { newLibrary } from '../src/ai/library.js';
import { encounterEnemies } from '../server/encounter-reference.mjs';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationRequest } from '../server/prompts.mjs';
import { createWorldbookCounter } from '../server/character-reader.mjs';
import { synchronizeSummonCrystals } from '../src/tavern/animation.js';

test('identity and motion prose join compiled numbers without persisting another AI data layer', () => {
  const entry = normalizeCharacter(characterDocument(), 'character-ui');
  const before = JSON.stringify(entry);
  const sheet = characterPresentation(entry);
  assert.equal(sheet.gender, '男');
  assert.equal(sheet.age, '二十九岁');
  assert.equal(sheet.profession, '巡灯术士');
  assert.deepEqual(
    sheet.sections.map((section) => section.title),
    ['外貌', '职业', '性格', '经历'],
  );
  assert.equal(sheet.attack.name, entry.combat.attackName);
  assert.deepEqual(
    sheet.skills.map((skill) => skill.name),
    entry.combat.skills.map((skill) => skill.name),
  );
  const markup = characterSheet(entry);
  assert(markup.includes('基础伤害 10') && markup.includes('迟缓 +1层'));
  assert(markup.includes('1 AP · 2 sp'));
  assert(markup.includes(sheet.skills[0].description));
  assert.equal((markup.match(/<details /g) || []).length, 3);
  assert.equal(JSON.stringify(entry), before);
  assert(!('data' in settingOnly(entry)));
});

test('editable worldbook text is escaped in the merged sheet and legacy prose remains visible', () => {
  const entry = normalizeCharacter(characterDocument(), 'character-ui');
  entry.setting.worldbook = '外貌：<img src=x onerror=alert(1)>\n\n性格：会笑，也会发火。';
  const markup = characterSheet(entry);
  assert(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert(!markup.includes('<img src=x'));
  entry.setting.worldbook = '旧存档里的一段人物设定，依然可以完整阅读。';
  assert(characterSheet(entry).includes(entry.setting.worldbook));
});

test('passive sheets show executable timing and effects instead of the action prose', () => {
  const entry = normalizeCharacter(characterDocument(), 'character-passive-sheet');
  entry.combat.skills[0] = {
    id: 'passive-fixture',
    name: '守护',
    passive: true,
    location: '前场',
    buff: 'iron',
    value: 2,
    text: '错误的动作说明',
  };
  entry.setting.worldbook = entry.setting.worldbook.replace(
    /技能动作描写｜[^：]+：[^\n]*/,
    '技能动作描写｜守护：抬起手臂，光芒围绕身体旋转。',
  );
  const markup = characterSheet(entry);
  const section = markup.slice(markup.indexOf('data-character-ability="被动"'));
  assert(section.includes('自身持续获得2层铁皮'));
  assert(!section.includes('抬起手臂，光芒围绕身体旋转'));
  assert(!section.includes('错误的动作说明'));
});

test('both full routes send the exact game enemy cast, while an editable bestiary supplies only relevant lore', async () => {
  assert.deepEqual(
    Object.keys(MONSTER_LORE).sort(),
    [...ENEMIES, ...BOSSES].map((enemy) => enemy.id).sort(),
  );
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/monster-lore-'));
  const store = await createWorldbookStore(directory);
  const initial = await store.get('tavern-world');
  initial.book.entries[0].content += '\n玩家补充：触碰留下细小苔痕。';
  await store.save({ id: 'tavern-world', book: initial.book });
  const restored = await createWorldbookStore(directory);
  assert((await restored.get('tavern-world')).book.entries[0].content.includes('玩家补充'));
  const countTokens = createWorldbookCounter();
  for (const { id: boss } of BOSSES) {
    const input = {
      brief: '沿旧路探索',
      boss,
      party: newLibrary().characters.map(settingOnly),
      history: [],
    };
    for (let index = 0; index < 5; index++)
      assert.deepEqual(
        encounterEnemies(index, boss).map((enemy) => enemy.id),
        encounterSpec(index, boss).enemyIds,
      );
    const request = await generationRequest('script', input, undefined, {
      worldInfo: await restored.resolve('script', input),
      countTokens,
    });
    const activated = request.worldInfo.report.filter(
      (entry) =>
        entry.active && [...ENEMIES, ...BOSSES].some((enemy) => enemy.name === entry.title),
    );
    const expected = new Set(
      Array.from({ length: 5 }, (_, index) => encounterSpec(index, boss).enemyIds).flat(),
    );
    assert.deepEqual(
      new Set(
        activated.map(
          (entry) => [...ENEMIES, ...BOSSES].find((enemy) => enemy.name === entry.title).id,
        ),
      ),
      expected,
    );
    assert(request.messages.some((message) => message.content.includes('习性与能力：')));
    assert(
      !activated.some((entry) =>
        BOSSES.some((other) => other.id !== boss && other.name === entry.title),
      ),
    );
    assert(!request.messages.some((message) => message.content.includes('老舍《断魂枪》')));
    assert(request.messages.some((message) => message.content.includes('自由叙事与伏笔')));
  }
});

test('the editable novel example contains five free prose strings and unchanged game metadata', async () => {
  const raw = JSON.parse(
    await readFile(new URL('../prompts/worldbook/script-example.json', import.meta.url), 'utf8'),
  );
  const script = normalizeScript(raw, 'example', newLibrary().party);
  assert.equal(script.story.length, 5);
  assert(script.story.every((part) => typeof part === 'string' && part.includes('。')));
  assert.deepEqual(script.nextHook, raw.data.nextHook);
  assert(!script.scenes);
});

test('legacy crystal animations retain their original clip but both playback tracks use the same vertical phase', () => {
  const time = [0, 1, 2];
  const first = new VectorKeyframeTrack(
    '20_Summoning_Crystal_0.position',
    time,
    [0, 0, 0, 0, 0.06, 0, 0, 0, 0],
  );
  const second = new VectorKeyframeTrack(
    '20_Summoning_Crystal_1.position',
    time,
    [0, 0, 0, 0, -0.06, 0, 0, 0, 0],
  );
  const clip = new AnimationClip('Summoning_Crystals_Idle', 2, [first, second]);
  const playback = synchronizeSummonCrystals(clip);
  assert.deepEqual(playback.tracks[0].values, playback.tracks[1].values);
  assert(playback.tracks[1].values[4] > 0);
  assert(clip.tracks[1].values[4] < 0);
});
