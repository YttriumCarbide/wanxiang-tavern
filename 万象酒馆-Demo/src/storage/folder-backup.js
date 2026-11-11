import { exportDatabase } from './backup.js';
import { openDatabase } from './database.js';
import { createEventScope } from '../shared/events.js';

const interval = 5 * 60 * 1000;
const firstProgressCheck = 5000;
const retained = 12;
const settingsKey = 'target';
const creationPending = 'wanxiang.creation-pending.v1';
const folderName = '万象酒馆自动备份';
const filePattern = /^wanxiang-auto-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-[a-f0-9-]{36}\.json$/;
const readWrite = { mode: 'readwrite' };

async function fingerprint(content) {
  const bytes = new TextEncoder().encode(content);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function writeBackup(folder, content, savedAt) {
  const stamp = new Date(savedAt).toISOString().replace(/[:.]/g, '-');
  const name = 'wanxiang-auto-' + stamp + '-' + crypto.randomUUID() + '.json';
  const file = await folder.getFileHandle(name, { create: true });
  let writer;
  try {
    writer = await file.createWritable();
    await writer.write(content);
    await writer.close();
  } catch (failure) {
    await writer?.abort().catch(() => {});
    await folder.removeEntry(name).catch(() => {});
    throw failure;
  }
}

async function pruneBackups(folder) {
  const names = [];
  for await (const [name, file] of folder.entries()) {
    if (file.kind === 'file' && filePattern.test(name)) names.push(name);
  }
  names.sort().reverse();
  for (const name of names.slice(retained)) {
    await folder.removeEntry(name).catch((failure) => {
      if (failure.name !== 'NotFoundError') throw failure;
    });
  }
}

export function supportsFolderBackup() {
  return window.isSecureContext && typeof window.showDirectoryPicker === 'function';
}

/** One folder selection from a normal game interaction, then periodic portable backups. */
export async function installFolderBackup({ database, storage, status }) {
  const metadata = await openDatabase({ name: 'wanxiang-tavern-folder-backup-v1' });
  const events = createEventScope();
  const seenDocuments = new WeakSet();
  let target = metadata.get(settingsKey);
  let permission = await target?.handle.queryPermission(readWrite).catch(() => 'prompt');
  let attempted = false;
  let authorizing = false;
  let writing = false;
  let disposed = false;
  let timer;

  function report(message, retry = false) {
    if (!disposed) status(message, retry);
  }

  function ready(savedAt, cleanupFailed = false) {
    const last = savedAt ? ' · 上次备份 ' + new Date(savedAt).toLocaleString() : '';
    const cleanup = cleanupFailed ? ' · 旧备份暂未清理' : '';
    report('每 5 分钟自动备份' + last + cleanup);
  }

  function locked(operation) {
    return navigator.locks
      ? navigator.locks.request('wanxiang-folder-backup', operation)
      : operation();
  }

  function schedule(delay) {
    clearTimeout(timer);
    if (!disposed && permission === 'granted') timer = setTimeout(backup, delay);
  }

  function closeWhenIdle() {
    if (disposed && !writing && !authorizing) metadata.close();
  }

  async function backup() {
    if (disposed || writing || authorizing || !target || permission !== 'granted') return;
    clearTimeout(timer);
    if (storage.getItem(creationPending) === 'true') {
      report('已选备份文件夹，创建角色后自动备份');
      schedule(firstProgressCheck);
      return;
    }
    writing = true;
    let nextCheck = interval;
    try {
      await locked(async () => {
        if (disposed) return;
        const latest = new Map(await metadata.readEntries()).get(settingsKey);
        if (!latest) return;
        target = latest;
        if ((await target.handle.queryPermission(readWrite)) !== 'granted') {
          permission = 'prompt';
          attempted = false;
          report('自动备份需要重新授权文件夹', true);
          return;
        }
        const remaining = (target.savedAt || 0) + interval - Date.now();
        if (remaining > 0) {
          nextCheck = remaining;
          return;
        }
        await storage.flush();
        const entries = await database.readEntries();
        if (entries.some(([key, value]) => key === 'game.' + creationPending && value === 'true')) {
          report('已选备份文件夹，创建角色后自动备份');
          nextCheck = firstProgressCheck;
          return;
        }
        const content = JSON.stringify(
          await exportDatabase({ entries: () => entries }, localStorage),
        );
        const hash = await fingerprint(content);
        if (hash === target.hash || disposed) return;
        const savedAt = Date.now();
        const folder = await target.handle.getDirectoryHandle(folderName, { create: true });
        await writeBackup(folder, content, savedAt);
        target = { handle: target.handle, savedAt, hash };
        await metadata.write([[settingsKey, target]]);
        let cleanupFailed = false;
        try {
          await pruneBackups(folder);
        } catch {
          cleanupFailed = true;
        }
        ready(savedAt, cleanupFailed);
      });
    } catch (failure) {
      report('自动备份失败 · ' + failure.message, true);
    } finally {
      writing = false;
      schedule(nextCheck);
      closeWhenIdle();
    }
  }

  async function authorize({ chooseNew = false } = {}) {
    if (disposed || authorizing || writing) return;
    authorizing = true;
    attempted = true;
    try {
      if (target && !chooseNew) {
        permission = await target.handle.requestPermission(readWrite);
        if (permission !== 'granted') {
          report('自动备份等待文件夹授权', true);
          return;
        }
      } else {
        const handle = await window.showDirectoryPicker({ ...readWrite, id: 'wanxiang-backup' });
        if (disposed) return;
        const selected = { handle, savedAt: 0, hash: '' };
        await locked(() => metadata.write([[settingsKey, selected]]));
        target = selected;
        permission = 'granted';
      }
      ready(target.savedAt);
    } catch (failure) {
      report(
        failure.name === 'AbortError'
          ? '自动备份等待选择文件夹'
          : '备份文件夹暂不可用 · ' + failure.message,
        true,
      );
    } finally {
      authorizing = false;
      closeWhenIdle();
    }
    if (permission === 'granted') void backup();
  }

  function firstInteraction(event) {
    if (!event.isTrusted || attempted || permission === 'granted') return;
    if (event.target.closest?.('#data-backup-folder')) return;
    if (document.querySelector('#start-screen[open]') && !event.target.closest('#start-journey'))
      return;
    void authorize();
  }

  function watch(source) {
    if (!source || seenDocuments.has(source)) return;
    seenDocuments.add(source);
    events.on(source, 'click', firstInteraction, true);
  }

  watch(document);
  const inn = document.querySelector('#inn-frame');
  watch(inn.querySelector('iframe')?.contentDocument);
  events.on(
    inn,
    'load',
    (event) => {
      if (event.target instanceof HTMLIFrameElement) watch(event.target.contentDocument);
    },
    true,
  );
  events.on(document, 'visibilitychange', () => {
    if (!document.hidden) void backup();
  });
  if (permission === 'granted') {
    ready(target.savedAt);
    void backup();
  } else {
    report('自动备份将在首次操作时请求选择文件夹');
    const note = document.querySelector('#start-screen[open] .start-note');
    if (note) note.append(' 开启旅程时，浏览器会请求选择存档备份文件夹。');
  }

  return {
    choose: () => authorize({ chooseNew: true }),
    dispose() {
      disposed = true;
      clearTimeout(timer);
      events.dispose();
      // An in-flight write can finish its atomic file replacement.
      closeWhenIdle();
    },
  };
}
