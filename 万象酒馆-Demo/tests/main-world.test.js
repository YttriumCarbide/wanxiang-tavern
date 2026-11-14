import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAIN_WORLD_LORE } from '../src/content/main-world-lore.js';
import { tavernCanonText } from '../src/content/world.js';
import { scanWorldbooks } from '../src/ai/worldbook-scan.js';
import { newWorldEntry, syncBuiltinWorldbook } from '../src/ai/worldbook.js';

const loadBuiltin = async () =>
  JSON.parse(await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'));

test('public worldbook migrates the actual canon and preserves unrelated custom triggers', async () => {
  const builtin = await loadBuiltin();
  const custom = {
    uid: 4,
    comment: '玩家自设',
    key: ['自己的词'],
    constant: false,
    content: '自己的内容',
  };
  const original = {
    entries: {
      1: {
        uid: 1,
        comment: '万象酒馆 · 基础设定',
        content: '旧设定',
        constant: true,
        extensions: { wanxiang: { canon: 'tavern' } },
      },
      4: custom,
      5: {
        uid: 5,
        key: ['script:main-chapter'],
        content: '旧主线规则',
        extensions: { wanxiang: { generationRule: 'script-main-chapter' } },
      },
    },
  };
  const migrated = syncBuiltinWorldbook(original, builtin);
  assert.equal(migrated.entries[1].content, tavernCanonText());
  assert(migrated.entries[1].content.includes('1463'));
  assert(!migrated.entries[1].content.includes('1340'));
  assert(!migrated.entries[1].content.includes('多元宇宙'));
  assert(!migrated.entries[1].content.includes('以太'));
  assert(!migrated.entries[5]);
  assert.equal(migrated.entries[4].content, custom.content);
  assert.equal(
    Object.values(migrated.entries).filter((entry) => entry.extensions?.wanxiang?.mainWorld).length,
    MAIN_WORLD_LORE.length,
  );
  assert.deepEqual(syncBuiltinWorldbook(migrated, builtin), migrated);
  const canon = Object.values(migrated.entries)
    .map((entry) => entry.content)
    .join('\n');
  assert(canon.includes('源生界'));
  assert(!canon.includes('原生界'));
  assert(!canon.includes('寄生黑龙'));
  assert(!canon.includes('律动'));
  assert(!canon.includes('1340'));
  assert(!canon.includes('多元宇宙'));
  assert(canon.includes('黑龙力量'));
  assert(canon.includes('不会借由抓咬或传染'));
  assert.equal(original.entries[1].content, '旧设定');
});

test('weather and rank entries match only relevant keywords in an upgraded worldbook', async () => {
  const builtin = await loadBuiltin();
  const custom = { ...newWorldEntry(0), key: ['我的传说'], content: '我的设定' };
  const oldRuins = {
    ...newWorldEntry(1),
    key: ['official-dungeon:ruins-curse'],
    content: '这里有瘟疫战乱，而这片区域也因为没有人能够造出远洋的大型航船，是个无人岛。',
    extensions: { wanxiang: { dungeonId: 'ruins-curse' } },
  };
  const migrated = syncBuiltinWorldbook(
    {
      entries: { 0: custom, 1: oldRuins },
      extensions: { wanxiang: { mainWorldRevision: 54 } },
    },
    builtin,
  );
  assert.equal(migrated.entries[0].content, custom.content);
  assert(migrated.entries[1].content.includes('偏远地带也因此少有人迹'));
  assert(!migrated.entries[1].content.includes('无人岛'));
  assert.deepEqual(syncBuiltinWorldbook(migrated, builtin), migrated);

  const matched = (content) =>
    scanWorldbooks({
      books: [{ ...migrated, id: 'tavern-world' }],
      settings: {
        globalSelect: ['tavern-world'],
        matchWholeWords: true,
        recursive: false,
        budgetCap: 10000,
      },
      context: { kind: 'chat', messages: [{ role: 'user', content }] },
      countTokens: (text) => text.length,
    })
      .entries.map((entry) => entry.extensions?.wanxiang?.mainWorld)
      .filter(Boolean);

  assert.deepEqual(matched('昨天发生了黑龙天蚀。').sort(), [
    'six-dragons-eras',
    'solarn-eclipse-weather',
  ]);
  assert.deepEqual(matched('快看，混沌云幕撕裂了！'), ['solarn-eclipse-weather']);
  assert.deepEqual(matched('这人的战力阶位在超凡阶。'), ['life-ranks']);
  assert.deepEqual(matched('这是一段普通的传说。'), []);
});

test('merged world lore prunes obsolete entries while keeping settings on surviving ones', async () => {
  const builtin = await loadBuiltin();
  const ranks = {
    ...newWorldEntry(2),
    key: ['玩家设置的触发词'],
    disable: true,
    content: '旧改写',
    extensions: { wanxiang: { mainWorld: 'life-ranks' } },
  };
  const obsoleteMythic = {
    ...newWorldEntry(4),
    content: '旧拆分神话阶',
    extensions: { wanxiang: { mainWorld: 'life-ranks-mythic' } },
  };
  const crossings = {
    ...newWorldEntry(3),
    content: '地理条目',
    extensions: { wanxiang: { mainWorld: 'three-realms-crossings' } },
  };
  const updated = syncBuiltinWorldbook(
    {
      entries: { 2: ranks, 3: crossings, 4: obsoleteMythic },
      extensions: { wanxiang: { mainWorldRevision: 62 } },
    },
    builtin,
  );
  assert(!updated.entries[4]);
  const { content } = updated.entries[2];
  assert.equal(updated.entries[2].disable, true);
  assert.deepEqual(updated.entries[2].key, ['玩家设置的触发词']);
  assert(content.includes('冒险者公会常以 F 至 S 级来评定委托贡献与战力'));
  assert(content.endsWith('开辟乃至毁灭一整片星系。'));
  assert.deepEqual(syncBuiltinWorldbook(updated, builtin), updated);
});
