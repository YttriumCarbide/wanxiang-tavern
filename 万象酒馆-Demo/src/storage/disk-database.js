import { decodeStorageImage, encodeStorageValue } from './value-codec.js';

const connectionKey = 'api.config';

async function readResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw Error('本地存档服务没有返回有效数据，请重新启动游戏服务。');
  }
  if (!response.ok) throw Error(body.error || '本地存档服务不可用');
  return body;
}

function decodeEntries(entries) {
  return entries.map(([key, value]) => [
    key,
    key.startsWith('portrait.') ? decodeStorageImage(value) : value,
  ]);
}

function sameValue(left, right) {
  if (left === right || (left instanceof Blob && right instanceof Blob)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The disk is authoritative. IndexedDB mirrors it for older clients and the portrait worker. */
export async function openDiskDatabase(endpoint, browserDatabase, onCacheFailure) {
  const snapshot = await readResponse(await fetch(endpoint, { cache: 'no-store' }));
  if (
    snapshot.app !== 'wanxiang-disk-storage' ||
    !Number.isSafeInteger(snapshot.revision) ||
    !Array.isArray(snapshot.entries) ||
    typeof snapshot.token !== 'string'
  )
    throw Error('本地存档服务协议无效');

  const records = new Map(decodeEntries(snapshot.entries));
  let revision = snapshot.revision;
  let queue = Promise.resolve();
  let cacheAvailable = true;

  function serialized(operation) {
    const result = queue.catch(() => {}).then(operation);
    queue = result;
    return result;
  }

  async function mirror(entries, deleted) {
    const changed = entries.filter(([key, value]) => !sameValue(browserDatabase.get(key), value));
    const removed = deleted.filter((key) => browserDatabase.get(key) !== undefined);
    if (!changed.length && !removed.length) return;
    try {
      await browserDatabase.write(changed, removed);
    } catch (failure) {
      cacheAvailable = false;
      onCacheFailure(failure);
    }
  }

  async function commit(entries, deleted) {
    const changed = entries.filter(([key, value]) => !sameValue(records.get(key), value));
    const removed = deleted.filter((key) => records.has(key));
    if (!changed.length && !removed.length) return;
    const payload = {
      revision,
      entries: await Promise.all(
        changed.map(async ([key, value]) => [key, await encodeStorageValue(value)]),
      ),
      deleted: removed,
    };
    const body = JSON.stringify(payload);
    const result = await readResponse(
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tavern-Storage': snapshot.token },
        body,
        keepalive: body.length <= 18000,
      }),
    );
    revision = result.revision;
    for (const key of removed) records.delete(key);
    for (const [key, value] of changed) records.set(key, structuredClone(value));
    await mirror(changed, removed);
  }

  if (revision === 0 && browserDatabase.get('installation')) {
    await commit(
      browserDatabase.entries().filter(([key]) => key !== connectionKey),
      [],
    );
  } else if (revision > 0) {
    await mirror(
      [...records],
      browserDatabase
        .entries()
        .filter(([key]) => key !== connectionKey && !records.has(key))
        .map(([key]) => key),
    );
  }

  function get(key) {
    return key === connectionKey ? browserDatabase.get(key) : structuredClone(records.get(key));
  }

  async function write(entries, deleted) {
    await commit(
      entries.filter(([key]) => key !== connectionKey),
      deleted.filter((key) => key !== connectionKey),
    );
    const connection = entries.find(([key]) => key === connectionKey);
    if (connection || deleted.includes(connectionKey))
      await browserDatabase.write(
        connection ? [connection] : [],
        deleted.filter((key) => key === connectionKey),
      );
  }

  return {
    directory: snapshot.directory,
    get cacheAvailable() {
      return cacheAvailable;
    },
    get,
    entries() {
      const entries = [...records].map(([key, value]) => [key, structuredClone(value)]);
      const connection = get(connectionKey);
      if (connection !== undefined) entries.push([connectionKey, connection]);
      return entries;
    },
    write: (entries, deleted = []) => serialized(() => write(entries, deleted)),
    update: (key, transform) =>
      serialized(async () => {
        const next = transform(get(key));
        if (next === undefined) return false;
        await write([[key, next]], []);
        return true;
      }),
    close: () => browserDatabase.close(),
  };
}
