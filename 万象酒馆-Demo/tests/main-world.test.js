import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WORLD_LORE } from '../src/content/main-world-lore.js';
import { tavernCanonText } from '../src/content/world.js';
import { upgradeMainWorld } from '../src/ai/main-world-upgrade.js';
import { scanWorldbooks } from '../src/ai/worldbook-scan.js';
import { newWorldEntry } from '../src/ai/worldbook.js';
import { adventureChatRules, ADVENTURE_SCRIPT_RULES } from '../src/ai/adventure-prompt.js';
import { chapterTaskTurn } from '../src/chapters/starbell-rp.js';
import { restoreStarbell } from '../src/chapters/starbell-state.js';

test('public worldbook migrates the actual canon and preserves unrelated custom triggers', () => {
  const custom = {
    uid: 4,
    comment: '玩家自设',
    key: ['自己的词'],
    constant: false,
    content: '自己的内容',
  };
  const original = {
    entries: {
      1: { uid: 1, comment: '万象酒馆 · 基础设定', content: '旧设定', constant: true },
      4: custom,
    },
  };
  const migrated = upgradeMainWorld(original, '当前输出格式');
  assert.equal(migrated.entries[1].content, tavernCanonText());
  assert(migrated.entries[1].content.includes('1463'));
  assert(migrated.entries[1].content.includes('关键因果'));
  assert.deepEqual(migrated.entries[4], custom);
  assert.equal(
    Object.values(migrated.entries).filter((entry) => entry.extensions?.wanxiang?.mainWorld).length,
    MAIN_WORLD_LORE.length,
  );
  assert.deepEqual(upgradeMainWorld(migrated), migrated);
  const canon = Object.values(migrated.entries)
    .map((entry) => entry.content)
    .join('\n');
  assert(canon.includes('源生界'));
  assert(!canon.includes('原生界'));
  assert(!canon.includes('寄生黑龙'));
  assert(!canon.includes('律动'));
  assert(canon.includes('黑龙力量'));
  assert(canon.includes('各个体并不负责传播'));
  assert.equal(original.entries[1].content, '旧设定');
});

test('weather and rank entries match only relevant keywords in an upgraded worldbook', () => {
  const custom = { ...newWorldEntry(0), key: ['我的传说'], content: '我的设定' };
  const oldRuins = {
    ...newWorldEntry(1),
    key: ['official-dungeon:ruins-curse'],
    content: '这里有瘟疫战乱，而这片区域也因为没有人能够造出远洋的大型航船，是个无人岛。',
    extensions: { wanxiang: { dungeonId: 'ruins-curse' } },
  };
  const migrated = upgradeMainWorld({
    entries: { 0: custom, 1: oldRuins },
    extensions: { wanxiang: { mainWorldRevision: 54 } },
  });
  assert.deepEqual(migrated.entries[0], custom);
  assert.deepEqual(migrated.entries[1], {
    ...oldRuins,
    content: '这里有瘟疫战乱，遗迹所在的偏远地带也因此少有人迹。',
  });
  assert.deepEqual(upgradeMainWorld(migrated), migrated);

  const matched = (content) =>
    scanWorldbooks({
      books: [{ ...migrated, id: 'tavern-world' }],
      settings: { globalSelect: ['tavern-world'], matchWholeWords: true, budgetCap: 10000 },
      context: { kind: 'chat', messages: [{ role: 'user', content }] },
      countTokens: (text) => text.length,
    }).entries.map((entry) => entry.extensions?.wanxiang?.mainWorld);

  assert.deepEqual(matched('昨天发生了黑龙天蚀。').sort(), ['black-eclipse', 'dragon-lenses']);
  assert.deepEqual(matched('快看，混沌云幕撕裂了！'), ['solarn-veil']);
  assert.deepEqual(matched('这人的战力阶位在超凡级。').sort(), ['life-ranks', 'life-ranks-mortal']);
  assert.deepEqual(matched('这是一段普通的传说。'), []);
});

test('the original text replaces paraphrases in existing worldbooks and keeps their entry settings', () => {
  const ranks = {
    ...newWorldEntry(2),
    key: ['玩家设置的触发词'],
    disable: true,
    content: '旧改写',
    extensions: { wanxiang: { mainWorld: 'life-ranks-mythic' } },
  };
  const crossings = {
    ...newWorldEntry(3),
    content: '地理条目',
    extensions: { wanxiang: { mainWorld: 'three-realms-crossings' } },
  };
  const updated = upgradeMainWorld({
    entries: { 2: ranks, 3: crossings },
    extensions: { wanxiang: { mainWorldRevision: 62 } },
  });
  const { content, ...settings } = updated.entries[2];
  assert.deepEqual({ ...settings, content: ranks.content }, ranks);
  assert(content.includes('当然，重伤沉睡后的他侵蚀位面，养精蓄锐，归来后实力犹未可知了。'));
  assert(
    content.endsWith(
      '起源：（111-120级）熄灭星辰只是易如反掌，他们可以创造出一片星系，当然也能毁灭他。',
    ),
  );
  assert.deepEqual(updated.entries[3], crossings);
  assert.deepEqual(upgradeMainWorld(updated), updated);
});

test('chapter tasks use the dungeon task protocol without future scenes and share objective adjudication', () => {
  const state = restoreStarbell();
  const turn = chapterTaskTurn(state, 'warn', '我问村长昨晚去了哪里。');
  assert.deepEqual(turn.fullScript, []);
  assert.equal(turn.scene.overview.length, 4);
  const rules = adventureChatRules(turn);
  assert(rules.includes('不必一次完成'));
  assert(rules.includes('不替玩家补说关键台词'));
  assert(rules.includes('没有提前生成的整章剧本'));
  assert(ADVENTURE_SCRIPT_RULES.includes('固定4项'));
});
