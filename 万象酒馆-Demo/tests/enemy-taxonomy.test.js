import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFINITIONS } from '../src/data.js';
import {
  ensureQuarrySummonEntry,
  reconcileLegacyMonsterNames,
} from '../tools/build-builtin-world.mjs';
import { ARENA_ARCHIVE_DEFINITIONS } from '../src/content/arena-adversaries.js';
import { ARENA_QUALIFIER_ARCHIVE_DEFINITIONS } from '../src/content/arena-qualifier-adversaries.js';
import { SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS } from '../src/content/silver-crown-syndicate-adversaries.js';
import {
  ENEMY_ARCHIVE_CATEGORIES,
  ENEMY_DISPLAY_NAME_OVERRIDES,
  ENEMY_LEGACY_DISPLAY_NAME_OVERRIDES,
  enemyTaxonomy,
} from '../src/enemy-taxonomy.js';
import {
  buildEnemyArchiveEntries,
  buildEnemyArchiveExport,
  filterEnemyArchiveBuckets,
} from '../src/archive-enemies.js';
import { mapInput, mapResponse } from '../src/ai/pipeline/map-request.js';
import { restoreWorlds } from '../src/worlds.js';
import { monsterNarrativeText } from '../src/ai/monster-narrative.js';
import { syncBuiltinWorldbook } from '../src/ai/worldbook.js';
import { overlordDialoguePack } from '../src/overlord-mechanics.js';
import { worldFixture } from './fixtures/multiverse.js';

const officialEnemyPools = [
  Object.fromEntries(Object.entries(DEFINITIONS).filter(([, entry]) => entry.speed)),
  ARENA_ARCHIVE_DEFINITIONS,
  ARENA_QUALIFIER_ARCHIVE_DEFINITIONS,
  SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS,
];
const roster = Object.assign({}, ...officialEnemyPools);

function monsterEntriesById(book) {
  return new Map(
    Object.values(book.entries)
      .filter((entry) => entry.extensions?.wanxiang?.monsterId)
      .map((entry) => [entry.extensions.wanxiang.monsterId, entry]),
  );
}

test('the official enemy pools use 14 standard species and six categories, with protected names unchanged', () => {
  assert.deepEqual(
    officialEnemyPools.map((pool) => Object.keys(pool).length),
    [149, 7, 27, 7],
  );
  assert.equal(new Set(officialEnemyPools.flatMap((pool) => Object.keys(pool))).size, 190);
  assert.deepEqual(
    ENEMY_ARCHIVE_CATEGORIES.map(({ label }) => label),
    ['野兽/魔兽', '虫甲/奇异', '构装/机械', '人形阵营', '灵体/能量', '其他'],
  );
  assert.equal(new Set(ENEMY_ARCHIVE_CATEGORIES.flatMap(({ species }) => species)).size, 14);

  const counts = Object.fromEntries(ENEMY_ARCHIVE_CATEGORIES.map(({ id }) => [id, 0]));
  let speciesCount = 0;
  for (const [id, enemy] of Object.entries(roster)) {
    assert.equal(enemy.id, id);
    assert(Object.hasOwn(counts, enemy.category), `${id} category`);
    if (enemy.baseSpecies) {
      assert.equal(enemyTaxonomy({ baseSpecies: enemy.baseSpecies }).category, enemy.category, id);
      speciesCount += 1;
    }
    counts[enemy.category] += 1;
  }
  assert.deepEqual(counts, {
    beast: 12,
    insect: 15,
    construct: 19,
    humanoid: 19,
    spirit: 9,
    other: 116,
  });
  assert.equal(speciesCount, 74);

  const archivedMinionNames = {
    arenaClockworkLion: '发条机兵',
    arenaQualifierWoodShield: '木盾剑士',
    arenaQualifierKnives: '双刃剑士',
    syndicateVelvetBlade: '银渠剑士',
    syndicateRepeatingArbalest: '乌羽弓手',
  };
  for (const [id, name] of Object.entries(archivedMinionNames)) {
    const enemy = roster[id];
    assert(enemy, id + ' must remain in the official archive');
    assert.equal(enemy.name, name, id + ' archive name');
    assert(name.endsWith(enemy.baseSpecies), id + ' species suffix');
    assert.equal([...name].length - [...enemy.baseSpecies].length, 2, id + ' two-character prefix');
    assert(!enemy.boss && !enemy.overlord && !enemy.elite, id + ' remains an ordinary minion');
  }

  // The brief explicitly names these four non-Boss enemies even where they serve as elites.
  const namedElites = {
    corridorGuard: '回廊魔像',
    ruinsMudGolem: '泥石魔像',
    hollowSentry: '空壳魔像',
    oathlessDuelist: '无誓剑士',
  };
  for (const [id, name] of Object.entries(namedElites)) {
    assert.equal(roster[id].name, name);
    assert.equal(roster[id].elite, true, id + ' retains its elite tier');
  }
  const renamed = Object.entries(ENEMY_DISPLAY_NAME_OVERRIDES);
  assert.equal(renamed.length, 43);
  for (const [id, name] of renamed) {
    const enemy = roster[id];
    assert.equal(enemy.name, name, `${id} display name`);
    assert(name.endsWith(enemy.baseSpecies), `${id} species suffix`);
    assert.equal([...name].length - [...enemy.baseSpecies].length, 2, `${id} prefix length`);
    assert(
      !enemy.boss &&
        !enemy.overlord &&
        !enemy.archiveSource &&
        (!enemy.elite || Object.hasOwn(namedElites, id)),
      `${id} display-name overrides must not rename protected identities`,
    );
  }
  for (const [id, name] of Object.entries({
    mossGulon: '苔背巨蛙·咕隆',
    bossGate: '缚界巨像',
    bossBloom: '夜蕈母体',
    bossTide: '星潮司灯者',
    ares: '战斗机兵·阿瑞斯',
    apepLamb: '阿佩普的羔羊',
  })) {
    assert.equal(roster[id].name, name, `${id} protected identity`);
  }
});

test('archive categories narrow each tier without bypassing seen IDs or splitting the Mother Tree', () => {
  const buckets = buildEnemyArchiveEntries(roster);
  assert.deepEqual(Object.keys(buckets), ['minion', 'elite', 'boss', 'overlord']);
  const entries = Object.values(buckets).flat();
  const rosterIds = Object.keys(roster).sort();
  const archivedIds = entries.flatMap(({ speciesIds }) => speciesIds).sort();
  assert.deepEqual(
    archivedIds,
    rosterIds,
    'every official enemy ID appears once without aliases or orphan IDs',
  );
  const knownCategories = new Set(ENEMY_ARCHIVE_CATEGORIES.map(({ id }) => id));
  assert(entries.every((item) => knownCategories.has(item.category)));

  const discovered = filterEnemyArchiveBuckets(buckets, { seenMonsters: ['mossSlime', 'moonEye'] });
  assert.deepEqual(
    discovered.visibleBuckets.minion.map(({ id }) => id),
    ['mossSlime'],
  );
  assert.equal(discovered.unlockedCount, 2);
  const [motherTree] = discovered.visibleBuckets.overlord;
  assert.equal(motherTree.id, 'moonTree');
  assert.equal(motherTree.category, 'other');
  assert.deepEqual(
    motherTree.parts.map(({ id }) => id),
    ['moonCrown', 'moonEye', 'moonRoot'],
  );

  const aresPartEncounter = buildEnemyArchiveExport(buckets, {
    seenMonsters: ['aresCannonLeft'],
  });
  assert(
    aresPartEncounter.categories.flatMap(({ enemies }) => enemies).some(({ id }) => id === 'ares'),
    'encountering an Ares cannon keeps the existing Ares codex discovery alias',
  );
  const motherTreeEncounter = buildEnemyArchiveExport(buckets, { seenMonsters: ['moonTree'] });
  assert(
    motherTreeEncounter.categories
      .flatMap(({ enemies }) => enemies)
      .some(({ id }) => id === 'moonTree'),
    'the composite Mother Tree remains discoverable by its stable group ID',
  );

  const filtered = filterEnemyArchiveBuckets(buckets, {
    seenMonsters: ['mossSlime', 'moonEye'],
    category: 'insect',
  });
  assert.deepEqual(
    Object.values(filtered.visibleBuckets)
      .flat()
      .map(({ id }) => id),
    ['mossSlime'],
  );
  assert.equal(filtered.tierStats.minion.unlocked, 1);
  assert.equal(filtered.categoryStats.insect.unlocked, 1);
  assert.equal(filtered.categoryStats.all.total, entries.length);
  assert.equal(filtered.unlockedCount, 2);

  const locked = filterEnemyArchiveBuckets(buckets, { category: 'spirit' });
  assert.equal(locked.categoryStats.spirit.unlocked, 0);
  assert(Object.values(locked.visibleBuckets).every((tier) => tier.length === 0));
  const full = filterEnemyArchiveBuckets(buckets, { category: 'construct', unlockAll: true });
  const constructs = Object.values(full.visibleBuckets).flat();
  assert(constructs.some(({ id }) => id === 'corridorGuard'));
  assert(constructs.every((item) => item.category === 'construct'));
  assert.deepEqual(full.categoryStats.construct, { unlocked: 19, total: 19 });
  assert.equal(constructs.length, full.categoryStats.construct.total);
});

test('enemy archive export contains only unlocked, whitelisted entries grouped in every stable category', () => {
  const buckets = buildEnemyArchiveEntries(roster);
  const exported = buildEnemyArchiveExport(buckets, { seenMonsters: ['mossSlime', 'moonEye'] });

  assert.deepEqual(Object.keys(exported), ['schemaVersion', 'categories']);
  assert.equal(exported.schemaVersion, 1);
  assert.deepEqual(
    exported.categories.map((category) => Object.keys(category)),
    ENEMY_ARCHIVE_CATEGORIES.map(() => ['id', 'label', 'enemies']),
  );
  assert.deepEqual(
    exported.categories.map(({ id, label }) => [id, label]),
    ENEMY_ARCHIVE_CATEGORIES.map(({ id, label }) => [id, label]),
  );
  const byCategory = new Map(exported.categories.map(({ id, enemies }) => [id, enemies]));
  assert.deepEqual(byCategory.get('insect'), [
    { id: 'mossSlime', name: '苔藓史莱姆', tier: 'minion', baseSpecies: '史莱姆' },
  ]);
  assert.deepEqual(byCategory.get('other'), [
    {
      id: 'moonTree',
      name: '母树',
      tier: 'overlord',
      partIds: ['moonCrown', 'moonEye', 'moonRoot'],
    },
  ]);
  assert.equal(byCategory.get('spirit').length, 0, 'unseen categories remain present and empty');
  const exportedEntries = exported.categories.flatMap(({ enemies }) => enemies);
  assert.deepEqual(
    exportedEntries.flatMap(({ id, partIds }) => partIds || [id]).sort(),
    ['moonCrown', 'moonEye', 'moonRoot', 'mossSlime'].sort(),
    'the export ignores current tier/category filters and never exposes unseen entries',
  );
  for (const entry of exportedEntries) {
    assert.deepEqual(
      Object.keys(entry).filter(
        (key) => !['id', 'name', 'tier', 'baseSpecies', 'partIds'].includes(key),
      ),
      [],
      'the export contains no raw definition or archive source fields',
    );
  }

  const developerExport = buildEnemyArchiveExport(buckets, { unlockAll: true });
  assert.equal(
    developerExport.categories.reduce((sum, category) => sum + category.enemies.length, 0),
    Object.values(buckets).flat().length,
    'developer full-codex mode includes each visible codex entry exactly once',
  );
});

test('new map metadata survives both compilation paths and old saves default to other', () => {
  const raw = worldFixture();
  const [tiered, numeric] = raw.enemies;
  delete tiered.hp;
  Object.assign(tiered, {
    name: DEFINITIONS.mossSlime.name,
    category: 'insect',
    baseSpecies: '史莱姆',
    tier: 'medium',
    intents: [
      {
        name: tiered.intents[0].name,
        slots: [0],
        effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
      },
    ],
  });
  Object.assign(numeric, { name: DEFINITIONS.hound.name, category: 'beast', baseSpecies: '猎犬' });
  Object.assign(raw.enemies[2], { name: '夜港执政祭司', category: 'other' });
  const world = mapResponse(JSON.stringify(raw), {});
  const boss = world.enemyDefinitions[raw.enemies[2].id];
  assert.equal(boss.name, raw.enemies[2].name);
  assert.equal(boss.category, 'other');
  assert(!Object.hasOwn(boss, 'baseSpecies'), 'a named boss is not classified by its title suffix');
  const request = mapInput({ brief: world.name, knownEnemies: world.enemyDefinitions });
  assert.equal(request.reference.enemyTaxonomy.namingPattern, '[2字词缀]+[基础种]');
  assert.deepEqual(request.reference.enemyTaxonomy.categories, ENEMY_ARCHIVE_CATEGORIES);
  const [restored] = restoreWorlds([world]);
  assert(restored, 'compiled world can be reloaded');
  for (const { id, category, baseSpecies } of [tiered, numeric]) {
    for (const enemy of [
      world.enemyDefinitions[id],
      restored.enemyDefinitions[id],
      request.reference.enemies.find((entry) => entry.id === id),
    ]) {
      assert.equal(enemy.id, id);
      assert.equal(enemy.category, category);
      assert.equal(enemy.baseSpecies, baseSpecies);
    }
  }

  const legacy = structuredClone(world);
  for (const enemy of Object.values(legacy.enemyDefinitions)) {
    delete enemy.category;
    delete enemy.baseSpecies;
  }
  const [restoredLegacy] = restoreWorlds([legacy]);
  assert(restoredLegacy, 'world without taxonomy fields can be reloaded');
  assert.deepEqual(restoredLegacy.enemyIds, legacy.enemyIds);
  for (const enemy of Object.values(restoredLegacy.enemyDefinitions)) {
    assert.equal(enemy.category, 'other');
    assert(!Object.hasOwn(enemy, 'baseSpecies'));
  }

  tiered.category = 'beast';
  assert.throws(() => mapResponse(JSON.stringify(raw), {}), /分类与基础种不匹配/);
  tiered.category = 'unreviewed';
  assert.throws(() => mapResponse(JSON.stringify(raw), {}), /敌人分类无效/);
  tiered.category = 'insect';
  tiered.baseSpecies = '未知基础种';
  assert.throws(() => mapResponse(JSON.stringify(raw), {}), /敌人基础种无效/);

  const missingCategory = structuredClone(raw);
  delete missingCategory.enemies[0].category;
  assert.throws(() => mapResponse(JSON.stringify(missingCategory), {}), /敌人分类必须填写/);

  const missingBaseSpecies = structuredClone(raw);
  delete missingBaseSpecies.enemies[0].baseSpecies;
  assert.throws(
    () => mapResponse(JSON.stringify(missingBaseSpecies), {}),
    /非「其他」分类的敌人必须填写基础种/,
  );
});

test('builtin UID 28 documents taxonomy and fresh and saved monster entries keep their lore and aliases', async () => {
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const mapEntry = builtin.entries['28'];
  assert.equal(mapEntry.uid, 28);
  assert.deepEqual(mapEntry.apiTargets, ['map']);
  for (const { id, species } of ENEMY_ARCHIVE_CATEGORIES) {
    assert(mapEntry.content.includes(id), `UID 28 category ${id}`);
    for (const name of species) assert(mapEntry.content.includes(name), `UID 28 species ${name}`);
  }
  assert(mapEntry.content.includes('[2字词缀]+[基础种]'));
  for (const name of [
    '苔藓史莱姆',
    '黑液史莱姆',
    '腐木魔菇',
    '蓝瘴魔菇',
    '碎石魔灵',
    '游隙魔灵',
    '灰炉机兵',
    '噬灵巨蛇',
    '裂风怪鸟',
    '坑道甲虫',
    '墓室甲虫',
    '灰翼巨蜂',
    '逐迹弓手',
    '蒙面祭司',
  ]) {
    assert(mapEntry.content.includes(name), `UID 28 naming example: ${name}`);
  }

  const mapSystemPrompt = await readFile(
    new URL('../prompts/map.system.md', import.meta.url),
    'utf8',
  );
  assert(mapSystemPrompt.includes('"category":"insect","baseSpecies":"史莱姆"'));
  assert(
    mapSystemPrompt.includes(
      'category必须且只能是beast/insect/construct/humanoid/spirit/other之一',
    ),
  );
  for (const { id, species } of ENEMY_ARCHIVE_CATEGORIES) {
    assert(mapSystemPrompt.includes(id), `map system prompt category ${id}`);
    for (const name of species)
      assert(mapSystemPrompt.includes(name), `map system prompt species ${name}`);
  }

  const sourceEntries = monsterEntriesById(builtin);
  const fresh = monsterEntriesById(syncBuiltinWorldbook({ entries: {} }, builtin));
  const legacyEntries = {};
  const customText = '\n用户保存的补充字段。';
  for (const [id, name] of Object.entries(ENEMY_DISPLAY_NAME_OVERRIDES)) {
    const source = sourceEntries.get(id);
    const entry = fresh.get(id);
    const legacyName = ENEMY_LEGACY_DISPLAY_NAME_OVERRIDES[id];
    assert(source && entry, `${id} builtin entry`);
    assert(legacyName && source.key.includes(legacyName), `${id} legacy display-name alias`);
    assert.deepEqual(source.key.slice(0, 2), [id, name], `${id} builtin primary keys`);
    assert.equal(source.comment, `怪物图鉴：${name}`, `${id} builtin title`);
    assert.equal(source.content.split('\n')[0], `名称：${name}`, `${id} builtin name line`);
    const lore = source.content.slice(source.content.indexOf('\n') + 1);
    assert.deepEqual(entry.key, [
      id,
      name,
      ...source.key.filter((key) => key !== id && key !== name),
    ]);
    assert.equal(entry.comment, `怪物图鉴：${name}`);
    assert.equal(entry.content, `名称：${name}\n${lore}`);

    const saved = structuredClone(source);
    saved.key = [
      id,
      legacyName,
      ...source.key.filter((key) => key !== id && key !== name && key !== legacyName),
    ];
    saved.comment = `怪物图鉴：${legacyName}`;
    saved.content = saved.content.replace(/^名称：[^\r\n]*/, `名称：${legacyName}`) + customText;
    saved.key.push(`用户自定义触发词:${id}`);
    legacyEntries[saved.uid] = saved;
  }
  const migrated = syncBuiltinWorldbook({ entries: legacyEntries }, builtin);
  const migratedById = monsterEntriesById(migrated);
  for (const [id, name] of Object.entries(ENEMY_DISPLAY_NAME_OVERRIDES)) {
    const entry = migratedById.get(id);
    const source = sourceEntries.get(id);
    assert.equal(entry.uid, source.uid);
    assert.deepEqual(entry.key, [
      id,
      name,
      ...source.key.filter((key) => key !== id && key !== name),
      `用户自定义触发词:${id}`,
    ]);
    assert.equal(entry.comment, `怪物图鉴：${name}`);
    assert.equal(entry.content, fresh.get(id).content + customText);
  }
  for (const id of ['bossGate', 'bossBloom', 'bossTide', 'ares', 'apepLamb']) {
    const source = sourceEntries.get(id);
    const entry = migratedById.get(id);
    assert.deepEqual(entry.key, source.key);
    assert.equal(entry.comment, source.comment);
    assert.equal(entry.content, source.content);
  }
  assert.deepEqual(syncBuiltinWorldbook(migrated, builtin), migrated);
});

test('builtin worldbook rebuild migrates monster aliases and restores missing quarry summon entries', () => {
  const raw = {
    entries: {
      40: {
        uid: 40,
        key: ['mossSlime', '苔团', '玩家额外触发词'],
        comment: '怪物图鉴：苔团',
        content: '名称：苔团\n玩家补充过的设定。',
        extensions: { wanxiang: { monsterId: 'mossSlime' } },
      },
    },
  };
  reconcileLegacyMonsterNames(raw);
  assert.deepEqual(raw.entries[40].key, ['mossSlime', '苔藓史莱姆', '苔团', '玩家额外触发词']);
  assert.equal(raw.entries[40].comment, '怪物图鉴：苔藓史莱姆');
  assert.equal(raw.entries[40].content, '名称：苔藓史莱姆\n玩家补充过的设定。');

  const nextUidRef = { current: 41 };
  ensureQuarrySummonEntry(raw, nextUidRef);
  const { id, name } = DEFINITIONS.riftDarkDust;
  const entry = Object.values(raw.entries).find(
    (candidate) => candidate.extensions?.wanxiang?.monsterId === id,
  );
  assert(entry, 'the special summoned monster is recreated when its entry is missing');
  assert.deepEqual(entry.key, [id, name, '裂隙游离暗尘']);
  assert.equal(entry.comment, '怪物图鉴：' + name);
  assert.equal(
    entry.content,
    `名称：${name}\n行动方式：${overlordDialoguePack('darkscaleWarlord').rallyDust}`,
  );
  assert.deepEqual(entry.apiTargets, ['script', 'chat']);
  assert.deepEqual(entry.extensions.wanxiang.apiTargets, ['script', 'chat']);
  assert.equal(nextUidRef.current, 42);
});

test('builtin monster lore reuses canon excerpts and adds the quarry summon as a separate entry', async () => {
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const entries = monsterEntriesById(builtin);
  for (const id of ['veilMender', 'sentryDrone']) {
    const { name, description } = DEFINITIONS[id];
    const { content } = entries.get(id);
    const [heading, lore] = content.split('\n');
    assert.equal(heading, `名称：${name}`);
    assert(lore?.startsWith('设定：'), `${id} lore heading`);
    const excerpt = lore.slice('设定：'.length);
    assert(excerpt.trim() && description.startsWith(excerpt), `${id} uses existing canon`);
    assert.equal(monsterNarrativeText(content), content, `${id} survives the lore builder`);
  }

  const { id, name } = DEFINITIONS.riftDarkDust;
  const summon = entries.get(id);
  const summonEntries = Object.values(builtin.entries).filter(
    (entry) => entry.extensions?.wanxiang?.monsterId === id,
  );
  assert.equal(summonEntries.length, 1);
  assert.deepEqual(summon.key, [id, name, '裂隙游离暗尘']);
  assert.equal(summon.comment, `怪物图鉴：${name}`);
  assert.equal(
    summon.content,
    `名称：${name}\n行动方式：${overlordDialoguePack('darkscaleWarlord').rallyDust}`,
  );
  assert.deepEqual(summon.apiTargets, ['script', 'chat']);
  assert.deepEqual(summon.extensions.wanxiang.apiTargets, summon.apiTargets);
  assert.equal(summon.constant, false);
  assert.equal(summon.selective, true);
  assert.equal(monsterNarrativeText(summon.content), summon.content);
});
