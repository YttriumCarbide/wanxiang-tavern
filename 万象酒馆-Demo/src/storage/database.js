const DATABASE_NAME = 'wanxiang-tavern-static-v1';
const STORE = 'records';
const PREFIX = 'game.';
const GAME_REVISION = '__game-revision';
const gameKey = (key) => typeof key === 'string' && key.startsWith(PREFIX);

function withoutGameRevision(records) {
  records.delete(GAME_REVISION);
  return records;
}

function completed(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || Error('本地数据库事务被中止'));
    transaction.onerror = () => reject(transaction.error || Error('本地数据库写入失败'));
  });
}

async function readRecords(connection) {
  const records = new Map();
  const transaction = connection.transaction(STORE, 'readonly');
  const cursor = transaction.objectStore(STORE).openCursor();
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (!current) return;
    records.set(current.key, current.value);
    current.continue();
  };
  await completed(transaction);
  return records;
}

/** The database belongs to one application lifetime; every write waits for its transaction. */
export async function openDatabase({
  name = DATABASE_NAME,
  indexedDB = globalThis.indexedDB,
} = {}) {
  if (!indexedDB) throw Error('此浏览器无法使用本地数据库，请使用普通窗口打开游戏。');
  const connection = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('无法打开本地数据库'));
    request.onblocked = () => reject(Error('本地数据库被其他游戏页面占用，请关闭其他页面后重试。'));
  });
  connection.onversionchange = () => connection.close();
  const cache = await readRecords(connection);
  let gameRevision = cache.get(GAME_REVISION) ?? 0;
  withoutGameRevision(cache);
  return {
    get: (key) => structuredClone(cache.get(key)),
    entries: () => [...cache].map(([key, value]) => [key, structuredClone(value)]),
    async readEntries() {
      return [...withoutGameRevision(await readRecords(connection))];
    },
    async write(entries, deleted = [], { guardGame = false, expectedConnection } = {}) {
      const keys = [...entries.map(([key]) => key), ...deleted];
      const changesGame = keys.some(gameKey);
      const transaction = connection.transaction(
        STORE,
        'readwrite',
        keys.includes('api.config') ? { durability: 'strict' } : undefined,
      );
      const done = completed(transaction);
      const store = transaction.objectStore(STORE);
      let failure;
      let nextRevision;
      function apply() {
        try {
          for (const key of deleted) store.delete(key);
          for (const [key, value] of entries) store.put(value, key);
          if (changesGame) store.put(nextRevision, GAME_REVISION);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      }
      function checkConnection() {
        if (!expectedConnection) return apply();
        const request = store.get('api.config');
        request.onsuccess = () => {
          try {
            if (JSON.stringify(request.result) !== JSON.stringify(expectedConnection.value))
              throw Error('另一游戏页面已修改接口连接，请重新载入后继续。');
            apply();
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
      }
      if (changesGame || guardGame) {
        const request = store.get(GAME_REVISION);
        request.onsuccess = () => {
          const current = request.result ?? 0;
          if (guardGame && current !== gameRevision) {
            failure = Error('另一游戏页面已保存新进度，请重新载入后继续。');
            transaction.abort();
            return;
          }
          if (changesGame) nextRevision = current + 1;
          checkConnection();
        };
      } else {
        checkConnection();
      }
      await done.catch((reason) => {
        throw failure ?? reason;
      });
      if (changesGame) gameRevision = nextRevision;
      for (const key of deleted) cache.delete(key);
      for (const [key, value] of entries) cache.set(key, structuredClone(value));
    },
    async update(key, transform) {
      if (gameKey(key)) {
        const next = transform(structuredClone(cache.get(key)));
        if (next === undefined) return false;
        await this.write([[key, next]], [], { guardGame: true });
        return true;
      }
      const transaction = connection.transaction(STORE, 'readwrite');
      const done = completed(transaction);
      const store = transaction.objectStore(STORE);
      let next,
        changed = false;
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          next = transform(structuredClone(request.result));
          if (next === undefined) return;
          store.put(next, key);
          changed = true;
        } catch {
          transaction.abort();
        }
      };
      await done;
      if (changed) cache.set(key, structuredClone(next));
      return changed;
    },
    close: () => connection.close(),
  };
}

/** Small synchronous game ports read a cache; durable writes are ordered and observable. */
export function createGameStorage(database, onFailure = () => {}) {
  const values = new Map(
    database
      .entries()
      .filter(([key]) => gameKey(key))
      .map(([key, value]) => [key.slice(PREFIX.length), value]),
  );
  const durableValues = new Map(values);
  let writes = Promise.resolve();
  const failures = new Map();
  let frozen = false;
  function setItems(entries, deleted = []) {
    if (frozen) throw Error('正在导入存档，暂时无法保存进度。');
    const next = new Map(deleted.map((key) => [key, undefined]));
    for (const [key, value] of entries) next.set(key, String(value));
    for (const [key, text] of next) {
      if (text === undefined) values.delete(key);
      else values.set(key, text);
    }
    writes = writes
      .catch(() => {})
      .then(async () => {
        const changed = [...next].filter(
          ([key, text]) => durableValues.get(key) !== text || failures.has(key),
        );
        if (!changed.length) return;
        try {
          await database.write(
            changed
              .filter(([, text]) => text !== undefined)
              .map(([key, text]) => [PREFIX + key, text]),
            changed.filter(([, text]) => text === undefined).map(([key]) => PREFIX + key),
            { guardGame: true },
          );
          for (const [key, text] of changed) {
            failures.delete(key);
            if (text === undefined) durableValues.delete(key);
            else durableValues.set(key, text);
          }
        } catch (error) {
          for (const [key] of changed) failures.set(key, error);
          onFailure(error);
        }
      });
    void writes.catch(() => {});
  }
  async function flush() {
    await writes;
    if (failures.size) throw failures.values().next().value;
  }
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItems,
    setItem(key, value) {
      setItems([[key, value]]);
    },
    removeItem(key) {
      setItems([], [key]);
    },
    flush,
    async replace(operation) {
      if (frozen) throw Error('正在导入存档。');
      frozen = true;
      try {
        await flush();
        await operation();
      } catch (failure) {
        if (!failure.requiresReload) frozen = false;
        throw failure;
      }
    },
  };
}
