import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  readdir,
  unlink,
  copyFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const CURRENT = '当前存档.json';
const PREVIOUS = '上次存档.json';
const HISTORY = '备份';
const APP = 'wanxiang-disk-storage';
const validKey = (key) =>
  typeof key === 'string' &&
  /^(?:installation|regex|(?:game|world|prompt|helper|portrait)\.[a-zA-Z0-9._-]+)$/.test(key);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const imageTypes = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

async function atomicWrite(file, text) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

function parseSnapshot(text) {
  const raw = JSON.parse(text);
  if (
    raw?.app !== APP ||
    raw.version !== 1 ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 1 ||
    !Array.isArray(raw.records) ||
    raw.records.length > 20000 ||
    digest(JSON.stringify(raw.records)) !== raw.checksum
  )
    throw Error('磁盘存档格式或校验失败');
  const records = new Map();
  for (const entry of raw.records) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validKey(entry[0]) || records.has(entry[0]))
      throw Error('磁盘存档记录损坏');
    records.set(entry[0], entry[1]);
  }
  return { ...raw, records };
}

/** One local service owns the serial commit queue and its recoverable snapshots. */
export function createDiskStore({
  directory,
  now = Date.now,
  backupInterval = 60000,
  backupCount = 12,
}) {
  let state = null;
  let loaded = false;
  let queued = Promise.resolve();
  let lastBackup = 0;

  function serialized(operation) {
    const result = queued.catch(() => {}).then(operation);
    queued = result;
    return result;
  }

  async function imageValue(value) {
    if (!value?.blobFile) return value;
    if (
      !/^[a-f0-9]{64}\.(png|jpg|webp|gif|avif)$/.test(value.blobFile) ||
      !imageTypes[value.mime] ||
      !Number.isSafeInteger(value.bytes)
    )
      throw Error('存档立绘引用损坏');
    const bytes = await readFile(path.join(directory, '立绘', value.blobFile));
    if (bytes.length !== value.bytes || digest(bytes) !== value.blobFile.split('.')[0])
      throw Error('存档立绘文件损坏');
    return { blob: true, mime: value.mime, base64: bytes.toString('base64') };
  }

  async function readSnapshot(file) {
    const text = await readFile(path.join(directory, file), 'utf8');
    const snapshot = parseSnapshot(text);
    try {
      await Promise.all([...snapshot.records.values()].map(imageValue));
    } catch (failure) {
      throw Error('存档引用的立绘缺失或损坏', { cause: failure });
    }
    return snapshot;
  }

  async function historyFiles() {
    try {
      return (await readdir(path.join(directory, HISTORY)))
        .filter((file) => /^save-[0-9]+-[a-f0-9-]+\.json$/.test(file))
        .sort()
        .reverse();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return [];
    }
  }

  async function load() {
    if (loaded) return;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const candidates = [
      CURRENT,
      PREVIOUS,
      ...(await historyFiles()).map((file) => path.join(HISTORY, file)),
    ];
    let damaged = false;
    for (const file of candidates) {
      let snapshot;
      try {
        snapshot = await readSnapshot(file);
      } catch (error) {
        if (error.code !== 'ENOENT') damaged = true;
        continue;
      }
      if (file !== CURRENT) {
        await copyFile(
          path.join(directory, CURRENT),
          path.join(directory, '损坏存档-' + now() + '-' + randomUUID() + '.json'),
        ).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
        await atomicWrite(path.join(directory, CURRENT), snapshotText(snapshot));
      }
      state = snapshot;
      loaded = true;
      return;
    }
    if (damaged) throw Error('磁盘存档损坏，现有文件已保留。请从存档文件夹恢复备份。');
    state = { revision: 0, records: new Map() };
    loaded = true;
  }

  function snapshotText(snapshot) {
    const records = [...snapshot.records];
    return JSON.stringify({
      app: APP,
      version: 1,
      revision: snapshot.revision,
      updatedAt: new Date(now()).toISOString(),
      records,
      checksum: digest(JSON.stringify(records)),
    });
  }

  async function storeValue(key, value) {
    if (!key.startsWith('portrait.')) {
      if (value?.blob || value?.blobFile) throw Error('无效的存档二进制记录');
      if (key.startsWith('game.') && typeof value !== 'string')
        throw Error('游戏存档记录必须是文本');
      return value;
    }
    if (
      !value?.blob ||
      !imageTypes[value.mime] ||
      typeof value.base64 !== 'string' ||
      value.base64.length > 8500000 ||
      !/^[a-zA-Z0-9+/]*={0,2}$/.test(value.base64)
    )
      throw Error('存档立绘格式无效');
    const bytes = Buffer.from(value.base64, 'base64');
    const name = digest(bytes) + '.' + imageTypes[value.mime];
    if (!bytes.length || bytes.length > 6 * 1024 * 1024 || key !== 'portrait.' + name)
      throw Error('存档立绘大小或校验无效');
    const folder = path.join(directory, '立绘');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await atomicWrite(path.join(folder, name), bytes);
    return { blobFile: name, mime: value.mime, bytes: bytes.length };
  }

  async function backup() {
    if (!state.revision) return;
    const text = snapshotText(state);
    await atomicWrite(path.join(directory, PREVIOUS), text);
    if (lastBackup && now() - lastBackup < backupInterval) return;
    await mkdir(path.join(directory, HISTORY), { recursive: true, mode: 0o700 });
    const file = 'save-' + now() + '-' + randomUUID() + '.json';
    await writeFile(path.join(directory, HISTORY, file), text, { flag: 'wx', mode: 0o600 });
    lastBackup = now();
    for (const previous of (await historyFiles()).slice(backupCount))
      await unlink(path.join(directory, HISTORY, previous));
  }

  return {
    directory,
    snapshot: () =>
      serialized(async () => {
        await load();
        const entries = await Promise.all(
          [...state.records].map(async ([key, value]) => [key, await imageValue(value)]),
        );
        return { app: APP, revision: state.revision, entries, directory };
      }),
    write: (input) =>
      serialized(async () => {
        await load();
        if (input?.revision !== state.revision) {
          const error = Error('另一游戏页面已保存新进度。请保留当前页面，关闭其他页面后重新载入。');
          error.status = 409;
          throw error;
        }
        if (
          !Array.isArray(input.entries) ||
          !Array.isArray(input.deleted) ||
          input.entries.length > 20000 ||
          input.deleted.length > 20000
        )
          throw Error('无效的存档写入请求');
        const keys = input.entries.map((entry) =>
          Array.isArray(entry) && entry.length === 2 ? entry[0] : null,
        );
        if (
          [...keys, ...input.deleted].some((key) => !validKey(key)) ||
          new Set(keys).size !== keys.length ||
          new Set(input.deleted).size !== input.deleted.length ||
          keys.some((key) => input.deleted.includes(key))
        )
          throw Error('存档记录名称无效或重复');
        const records = new Map(state.records);
        for (const key of input.deleted) records.delete(key);
        for (const [key, value] of input.entries) records.set(key, await storeValue(key, value));
        if (records.size > 20000) throw Error('存档记录过多');
        const next = { revision: state.revision + 1, records };
        await backup();
        await atomicWrite(path.join(directory, CURRENT), snapshotText(next));
        state = next;
        return { revision: state.revision };
      }),
  };
}
