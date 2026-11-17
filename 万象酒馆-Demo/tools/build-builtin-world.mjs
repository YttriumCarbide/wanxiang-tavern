import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorldEntry, normalizeWorldbook } from '../src/ai/worldbook.js';
import { isMonsterWorldEntry, monsterNarrativeText } from '../src/ai/monster-narrative.js';
import { COMBAT_ENCYCLOPEDIA_APPEND, MILL_WORLDBOOK_ENTRIES } from '../src/content/mill-lore.js';
import { ALL_MONSTER_LORE, monsterWorldbook } from '../src/content/monsters.js';
import { MILL_DUNGEONS } from '../src/content/official-dungeons.js';
import { DEFINITIONS } from '../src/data.js';

const root = fileURLToPath(new URL('../', import.meta.url));

function updateCombatEncyclopediaInPlace(raw) {
  const target = Object.values(raw.entries || {}).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'combat-encyclopedia',
  );
  if (!target) return;
  const cleaned = String(target.content || '')
    .replace(/\n*(?:五、武器与魔法伤害类型|四、武器与魔法伤害类型)[\s\S]*$/u, '')
    .replace(/\n*四、【后续开发与维护提示】[\s\S]*$/u, '')
    .trimEnd();
  target.content = [
    cleaned,
    COMBAT_ENCYCLOPEDIA_APPEND.trim(),
    `七、【后续开发与维护提示】\n今后若游戏内新增、删改通用 Buff、Debuff 或伤害类型与韧性规则，请直接原地编辑本条目说明；**禁止再另建版本号或“修正/补充”类 \`EX\` 补丁条目**。`,
  ].join('\n\n');
}

function upsertEntry(raw, matchFn, makeEntry, nextUidRef) {
  const existing = Object.values(raw.entries || {}).find(matchFn);
  if (existing) {
    const updated = makeEntry(existing.uid);
    raw.entries[existing.uid] = {
      ...existing,
      ...updated,
      uid: existing.uid,
      extensions: {
        ...existing.extensions,
        ...updated.extensions,
        wanxiang: {
          ...existing.extensions?.wanxiang,
          ...updated.extensions?.wanxiang,
        },
      },
    };
    return;
  }
  const uid = nextUidRef.current++;
  raw.entries[uid] = makeEntry(uid);
}

/** Normalizes and supplements monster lore, mill worldbook data, and the combat encyclopedia. */
export async function buildBuiltinWorld() {
  const assetPath = path.join(root, 'assets/builtin-worldbook.json');
  const raw = JSON.parse(await readFile(assetPath, 'utf8'));
  for (const entry of Object.values(raw.entries || {})) {
    if (isMonsterWorldEntry(entry)) {
      entry.content = monsterNarrativeText(entry.content);
      if (Array.isArray(entry.key) && entry.key.some(Boolean)) {
        entry.constant = false;
        entry.selective = true;
      }
    }
  }
  const existingMonsterIds = new Set(
    Object.values(raw.entries || {})
      .map((entry) => entry.extensions?.wanxiang?.monsterId)
      .filter(Boolean),
  );
  const nextUidRef = {
    current: Math.max(-1, ...Object.keys(raw.entries || {}).map(Number)) + 1,
  };
  for (const id of Object.keys(ALL_MONSTER_LORE)) {
    const def = DEFINITIONS[id];
    if (!def || existingMonsterIds.has(id)) continue;
    const uid = nextUidRef.current++;
    raw.entries[uid] = {
      ...newWorldEntry(uid),
      comment: `怪物图鉴：${def.name}`,
      key: [id, def.name],
      content: monsterNarrativeText(monsterWorldbook(id, def.name)),
      constant: false,
      selective: true,
      order: 180,
      position: 1,
      matchScenario: true,
      excludeRecursion: true,
      preventRecursion: true,
      apiTargets: ['script', 'chat'],
      extensions: {
        wanxiang: {
          monsterId: id,
          apiTargets: ['script', 'chat'],
        },
      },
    };
  }
  for (const lore of MILL_WORLDBOOK_ENTRIES) {
    upsertEntry(
      raw,
      (entry) => entry.extensions?.wanxiang?.millLore === lore.id,
      (uid) => ({
        ...newWorldEntry(uid),
        comment: lore.comment,
        key: [...lore.key],
        content: lore.content,
        constant: false,
        selective: true,
        order: lore.order,
        position: lore.position,
        matchScenario: true,
        excludeRecursion: true,
        preventRecursion: true,
        apiTargets: [...lore.apiTargets],
        extensions: {
          wanxiang: {
            millLore: lore.id,
            apiTargets: [...lore.apiTargets],
          },
        },
      }),
      nextUidRef,
    );
  }
  for (const dungeon of MILL_DUNGEONS) {
    upsertEntry(
      raw,
      (entry) => entry.extensions?.wanxiang?.officialDungeonId === dungeon.id,
      (uid) => ({
        ...newWorldEntry(uid),
        comment: `官设副本：${dungeon.name}`,
        key: [dungeon.key],
        content: dungeon.outline,
        constant: false,
        selective: true,
        order: 850,
        position: 1,
        matchScenario: true,
        excludeRecursion: true,
        preventRecursion: true,
        apiTargets: ['script'],
        extensions: {
          wanxiang: {
            officialDungeonId: dungeon.id,
            apiTargets: ['script'],
          },
        },
      }),
      nextUidRef,
    );
  }
  updateCombatEncyclopediaInPlace(raw);
  const { book } = normalizeWorldbook(raw, '万象酒馆世界书');
  await writeFile(assetPath, JSON.stringify(book, null, 2) + '\n');
  return book;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildBuiltinWorld();
