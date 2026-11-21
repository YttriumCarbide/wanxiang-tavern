import { decodeStorageImage, encodeStorageValue } from './value-codec.js';

const connectionKey = 'api.config';

class DiskResponseError extends Error {}

async function readResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw Error('本地存档服务没有返回有效数据，请重新启动游戏服务。');
  }
  if (!response.ok) throw new DiskResponseError(body?.error || '本地存档服务不可用');
  return body;
}

function decodeEntries(entries) {
  return entries.map(([key, value]) => [
    key,
    key.startsWith('portrait.') ? decodeStorageImage(value) : value,
  ]);
}

async function sameValue(left, right) {
  if (left === right) return true;
  if (left instanceof Blob || right instanceof Blob) {
    if (!(left instanceof Blob && right instanceof Blob)) return false;
    if (left.size !== right.size || left.type !== right.type) return false;
    const [leftBytes, rightBytes] = await Promise.all([left.arrayBuffer(), right.arrayBuffer()]);
    const a = new Uint8Array(leftBytes);
    const b = new Uint8Array(rightBytes);
    return a.every((byte, index) => byte === b[index]);
  }
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
  let uncertain = false;

  function serialized(operation) {
    const result = queue.catch(() => {}).then(operation);
    queue = result;
    return result;
  }

  async function mirror(entries, deleted) {
    const changed = [];
    for (const [key, value] of entries) {
      if (!(await sameValue(browserDatabase.get(key), value))) changed.push([key, value]);
    }
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
    const changed = [];
    for (const [key, value] of entries) {
      if (!(await sameValue(records.get(key), value))) changed.push([key, value]);
    }
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
    try {
      const result = await readResponse(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tavern-Storage': snapshot.token },
          body,
          keepalive: body.length <= 18000,
        }),
      );
      if (result?.revision !== payload.revision + 1) throw Error('本地存档写入结果无效');
    } catch (failure) {
      if (failure instanceof DiskResponseError) throw failure;
      const latest = await fetch(endpoint, { cache: 'no-store' })
        .then(readResponse)
        .catch(() => null);
      if (!(await matchesCommittedWrite(latest, payload, records))) {
        uncertain = true;
        throw Object.assign(Error('存档写入结果无法确认，请重新载入后查看。', { cause: failure }), {
          requiresReload: true,
        });
      }
    }
    revision = payload.revision + 1;
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
    if (uncertain)
      throw Object.assign(Error('存档写入结果无法确认，请重新载入后查看。'), {
        requiresReload: true,
      });
    const diskEntries = entries.filter(([key]) => key !== connectionKey);
    const diskDeleted = deleted.filter((key) => key !== connectionKey);
    const connection = entries.find(([key]) => key === connectionKey);
    const removeConnection = deleted.includes(connectionKey);
    if (!connection && !removeConnection) return commit(diskEntries, diskDeleted);

    const previous = browserDatabase.get(connectionKey);
    const next = connection?.[1];
    await browserDatabase.write(
      connection ? [connection] : [],
      removeConnection ? [connectionKey] : [],
      { expectedConnection: { value: previous } },
    );
    try {
      await commit(diskEntries, diskDeleted);
    } catch (failure) {
      if (failure.requiresReload) throw failure;
      try {
        await browserDatabase.write(
          previous === undefined ? [] : [[connectionKey, previous]],
          previous === undefined ? [connectionKey] : [],
          { expectedConnection: { value: next } },
        );
      } catch (restoreFailure) {
        const rollbackError = new AggregateError(
          [failure, restoreFailure],
          '硬盘存档写入失败，接口连接无法自动恢复。' + restoreFailure.message,
          { cause: failure },
        );
        throw rollbackError;
      }
      throw failure;
    }
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

async function matchesCommittedWrite(latest, payload, records) {
  if (
    latest?.app !== 'wanxiang-disk-storage' ||
    latest.revision !== payload.revision + 1 ||
    !Array.isArray(latest.entries) ||
    latest.entries.some(
      (entry) => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string',
    )
  )
    return false;
  const durable = new Map(latest.entries);
  if (durable.size !== latest.entries.length) return false;
  const expected = new Map();
  for (const [key, value] of records) expected.set(key, await encodeStorageValue(value));
  for (const key of payload.deleted) expected.delete(key);
  for (const [key, value] of payload.entries) expected.set(key, value);
  if (durable.size !== expected.size) return false;
  for (const [key, value] of expected) {
    if (!durable.has(key) || !(await sameValue(durable.get(key), value))) return false;
  }
  return true;
}
