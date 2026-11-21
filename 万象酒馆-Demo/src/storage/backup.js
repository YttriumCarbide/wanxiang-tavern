import { normalizeWorldbook, normalizeWorldSettings } from '../ai/worldbook.js';
import { decodeStorageImage, encodeStorageValue } from './value-codec.js';

const libraryKey = 'game.wanxiang.worldbooks.v1';

function validateGameLibrary(text) {
  let library;
  try {
    library = JSON.parse(text);
  } catch (cause) {
    throw Error('备份中的游戏进度不是有效的 JSON', { cause });
  }
  if (library?.version !== 1 || !Array.isArray(library.characters) || !Array.isArray(library.party))
    throw Error('备份中的游戏进度格式无效或版本不兼容');
}

function withoutKeys(value) {
  const copy = structuredClone(value);
  for (const profile of [...Object.values(copy.profiles || {}), ...(copy.apiPresets || [])]) {
    profile.apiKey = '';
  }
  return copy;
}

export async function exportDatabase(database, preferences) {
  const entries = [];
  for (const [key, original] of database.entries()) {
    if (key === 'regex' || key.startsWith('prompt.') || key.startsWith('helper.')) continue;
    const value = key === 'api.config' ? withoutKeys(original) : original;
    entries.push([key, await encodeStorageValue(value)]);
  }
  const settings = Object.fromEntries(
    Object.keys(preferences)
      .filter((key) => key.startsWith('wanxiang.'))
      .map((key) => [key, preferences.getItem(key)]),
  );
  return { app: 'wanxiang-static-backup', version: 1, entries, preferences: settings };
}

export function readDatabaseBackup(raw) {
  if (
    raw?.app !== 'wanxiang-static-backup' ||
    raw.version !== 1 ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 20000
  )
    throw Error('这不是有效的完整备份文件');
  const seen = new Set();
  const entries = raw.entries
    .map((entry) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        !/^(?:installation|api\.config|regex|(?:game|world|prompt|helper|portrait)\.[a-zA-Z0-9._-]+)$/.test(
          entry[0],
        ) ||
        seen.has(entry[0])
      )
        throw Error('备份记录损坏或重复');
      const [key, value] = entry;
      seen.add(key);
      if (key.startsWith('portrait.')) return [key, decodeStorageImage(value)];
      if (key.startsWith('world.book.')) normalizeWorldbook(value);
      if (key === 'world.settings') normalizeWorldSettings(value);
      if (key === 'regex' || key.startsWith('prompt.') || key.startsWith('helper.')) return null;
      if (key.startsWith('game.') && typeof value !== 'string') throw Error('备份存档格式无效');
      if (key === libraryKey) validateGameLibrary(value);
      if (key === 'installation' && value?.version !== 1) throw Error('备份安装记录无效');
      if (key === 'api.config') return [key, withoutKeys(value)];
      return [key, value];
    })
    .filter(Boolean);
  if (!seen.has('installation') || !seen.has(libraryKey)) throw Error('备份缺少游戏进度');
  const preferences = raw.preferences === undefined ? {} : raw.preferences;
  if (
    !preferences ||
    typeof preferences !== 'object' ||
    Array.isArray(preferences) ||
    Object.entries(preferences).some(
      ([key, value]) => !key.startsWith('wanxiang.') || typeof value !== 'string',
    )
  )
    throw Error('备份偏好设置无效');
  return { entries, preferences };
}
