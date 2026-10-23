const DATABASE_NAME = 'wanxiang-tavern-static-v1';
const STORE = 'records';

function completed(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || Error('本地数据库事务被中止'));
    transaction.onerror = () => reject(transaction.error || Error('本地数据库写入失败'));
  });
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
  const cache = new Map();
  const read = connection.transaction(STORE, 'readonly');
  const cursor = read.objectStore(STORE).openCursor();
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (!current) return;
    cache.set(current.key, current.value);
    current.continue();
  };
  await completed(read);
  return {
    get: (key) => structuredClone(cache.get(key)),
    entries: () => [...cache].map(([key, value]) => [key, structuredClone(value)]),
    async write(entries, deleted = []) {
      const transaction = connection.transaction(
        STORE,
        'readwrite',
        entries.some(([key]) => key === 'api.config') ? { durability: 'strict' } : undefined,
      );
      const done = completed(transaction);
      const store = transaction.objectStore(STORE);
      for (const key of deleted) store.delete(key);
      for (const [key, value] of entries) store.put(value, key);
      await done;
      for (const key of deleted) cache.delete(key);
      for (const [key, value] of entries) cache.set(key, structuredClone(value));
    },
    async update(key, transform) {
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
  const prefix = 'game.';
  const values = new Map(
    database
      .entries()
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  );
  let writes = Promise.resolve();
  let failure = null;
  function enqueue(operation) {
    writes = writes
      .catch(() => {})
      .then(operation)
      .catch((error) => {
        failure = error;
        onFailure(error);
        throw error;
      });
    // The UI can continue while the failure remains visible and flush() still rejects.
    void writes.catch(() => {});
  }
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      const text = String(value);
      values.set(key, text);
      enqueue(() => database.write([[prefix + key, text]]));
    },
    removeItem(key) {
      values.delete(key);
      enqueue(() => database.write([], [prefix + key]));
    },
    async flush() {
      await writes;
      if (failure) throw failure;
    },
  };
}
