import {
  DEVELOPER_COPY_KEY,
  localDeveloperHost,
  sanitizeDeveloperData,
} from '../developer-rules.js';
import { GENERATION_OPTIONS_KEY } from '../generation-options.js';

export function isDeveloperCopy() {
  return (
    localDeveloperHost(location.hostname) &&
    new URLSearchParams(location.search).has('developerSandbox')
  );
}

export function developerCopySeed(session, checkpoint) {
  const values = [
    ['wanxiang.worldbooks.v1', session.ai.library],
    [
      GENERATION_OPTIONS_KEY,
      {
        ...session.ai.generationOptions,
        developerMode: true,
        skipAiGeneration: true,
        skipOverlandApi: true,
        allowRetreat: true,
      },
    ],
  ];
  if (checkpoint) values.push(['wanxiang.battle-checkpoint.v1', checkpoint]);
  return sanitizeDeveloperData(values).map(([key, value]) => [
    `game.${key}`,
    JSON.stringify(value),
  ]);
}

/** Each copied game owns a database in its own tab, independent of the live save and AI settings. */
export function openDeveloperCopyDatabase(storage = sessionStorage) {
  const saved = JSON.parse(storage.getItem(DEVELOPER_COPY_KEY) || 'null');
  if (!Array.isArray(saved)) throw Error('请在游戏调试页复制当前档后进入测试档。');
  const rows = new Map(saved);
  function persist(updated) {
    storage.setItem(DEVELOPER_COPY_KEY, JSON.stringify([...updated]));
    rows.clear();
    for (const [key, value] of updated) rows.set(key, value);
  }
  return {
    cacheAvailable: false,
    get: (key) => structuredClone(rows.get(key)),
    entries: () => structuredClone([...rows]),
    async readEntries() {
      return structuredClone([...rows]);
    },
    async write(entries, deleted = []) {
      const next = new Map(rows);
      for (const key of deleted) next.delete(key);
      for (const [key, value] of entries) next.set(key, structuredClone(value));
      persist(next);
    },
    async update(key, transform) {
      const value = transform(structuredClone(rows.get(key)));
      if (value === undefined) return false;
      await this.write([[key, value]]);
      return true;
    },
    close() {},
  };
}

export function developerCopyFetch(input, options) {
  const url = new URL(input?.url || input, location.href);
  if (url.origin !== location.origin || /^\/(?:api|__demo)\//.test(url.pathname))
    throw Error('测试档使用离线数据，真实接口请求已暂停。');
  return fetch(input, options);
}
