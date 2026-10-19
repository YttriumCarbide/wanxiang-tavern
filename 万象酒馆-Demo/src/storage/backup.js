import { normalizePromptPreset } from '../ai/presets.js';
import { normalizeWorldbook, normalizeWorldSettings } from '../ai/worldbook.js';
import { normalizeRegexScripts } from '../ai/regex.js';

function withoutKeys(value) {
  const copy = structuredClone(value);
  for (const profile of [...Object.values(copy.profiles || {}), ...(copy.apiPresets || [])]) {
    profile.apiKey = '';
    profile.rememberKey = false;
  }
  return copy;
}

export async function exportDatabase(database, preferences) {
  const entries = [];
  for (const [key, original] of database.entries()) {
    let value = key === 'api.config' ? withoutKeys(original) : original;
    if (value instanceof Blob) {
      const bytes = new Uint8Array(await value.arrayBuffer());
      let text = '';
      for (let offset = 0; offset < bytes.length; offset += 8192)
        text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      value = { blob: true, mime: value.type, base64: btoa(text) };
    }
    entries.push([key, value]);
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
  const entries = raw.entries.map((entry) => {
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
    if (key.startsWith('portrait.')) {
      if (
        !value?.blob ||
        !/^image\/(png|jpeg|webp|gif|avif)$/.test(value.mime) ||
        typeof value.base64 !== 'string' ||
        value.base64.length > 8500000
      )
        throw Error('备份图片无效');
      return [
        key,
        new Blob([Uint8Array.from(atob(value.base64), (character) => character.charCodeAt(0))], {
          type: value.mime,
        }),
      ];
    }
    if (key.startsWith('world.book.')) normalizeWorldbook(value);
    if (key === 'world.settings') normalizeWorldSettings(value);
    if (key.startsWith('prompt.')) normalizePromptPreset(value, key.slice(7));
    if (key === 'regex') normalizeRegexScripts(value);
    if (key.startsWith('game.') && typeof value !== 'string') throw Error('备份存档格式无效');
    if (key === 'api.config') return [key, withoutKeys(value)];
    return [key, value];
  });
  if (!seen.has('installation') || !seen.has('game.wanxiang.worldbooks.v1'))
    throw Error('备份缺少游戏进度');
  const preferences = raw.preferences || {};
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
