import { exportDatabase } from './backup.js';
import { openDatabase } from './database.js';
import { createEventScope } from '../shared/events.js';
import { exportJsonFile, nativeBackupTarget, supportsNativeBackupFolder } from './export-file.js';

const interval = 5 * 60 * 1000;
const firstProgressCheck = 5000;
const retained = 12;
const settingsKey = 'target';
const creationPending = 'wanxiang.creation-pending.v1';
const folderName = '万象酒馆自动备份';
const filePattern = /^wanxiang-auto-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-[a-f0-9-]{36}\.json$/;
const readWrite = { mode: 'readwrite' };
const choosePrompt =
  '请先自行决定或创建一个用于存放游戏备份的文件夹。接下来请选择该文件夹；游戏会在其中建立「万象酒馆自动备份」子文件夹，每5分钟保存一次完整备份，最多保留12份，不包含API密钥。是否继续选择文件夹？';

async function fingerprint(content) {
  const bytes = new TextEncoder().encode(content);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function writeBackup(folder, content, name) {
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

export async function pruneBackups(folder) {
  const names = [];
  for await (const [name, file] of folder.entries()) {
    if (file.kind !== 'file' || !filePattern.test(name)) continue;
    const snapshot = await file.getFile().catch(() => null);
    // A write interrupted before commit can leave an empty file at the final path.
    if (snapshot?.size > 0) names.push(name);
  }
  names.sort().reverse();
  for (const name of names.slice(retained)) {
    await folder.removeEntry(name).catch((failure) => {
      if (failure.name !== 'NotFoundError') throw failure;
    });
  }
}

export function supportsFolderBackup() {
  return (
    supportsNativeBackupFolder() ||
    (window.isSecureContext && typeof window.showDirectoryPicker === 'function')
  );
}

async function saveToFolder(handle, content, savedAt) {
  const stamp = new Date(savedAt).toISOString().replace(/[:.]/g, '-');
  const name = 'wanxiang-auto-' + stamp + '-' + crypto.randomUUID() + '.json';
  if (typeof handle === 'string') {
    const result = await exportJsonFile(content, name, { folder: handle });
    return result.cleanupFailed;
  }
  const folder = await handle.getDirectoryHandle(folderName, { create: true });
  await writeBackup(folder, content, name);
  try {
    await pruneBackups(folder);
    return false;
  } catch {
    return true;
  }
}

async function hasFolderPermission(handle) {
  if (typeof handle === 'string') return handle === (await nativeBackupTarget());
  return (await handle.queryPermission(readWrite)) === 'granted';
}

/** Explicit folder selection from the save menu, then periodic portable backups. */
export async function installFolderBackup({ database, storage, status }) {
  const metadata = await openDatabase({ name: 'wanxiang-tavern-folder-backup-v1' });
  const events = createEventScope();
  let target = metadata.get(settingsKey);
  let allowed = target && (await hasFolderPermission(target.handle).catch(() => false));
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
    if (!disposed && allowed) timer = setTimeout(backup, delay);
  }

  function closeWhenIdle() {
    if (disposed && !writing && !authorizing) metadata.close();
  }

  async function backup() {
    if (disposed || writing || authorizing || !target || !allowed) return;
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
        if (!(await hasFolderPermission(target.handle))) {
          allowed = false;
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
        const cleanupFailed = await saveToFolder(target.handle, content, savedAt);
        target = { handle: target.handle, savedAt, hash };
        await metadata.write([[settingsKey, target]]);
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

  async function authorize() {
    if (disposed || authorizing || writing) return false;
    authorizing = true;
    try {
      const handle = supportsNativeBackupFolder()
        ? await nativeBackupTarget(true)
        : await window.showDirectoryPicker({ ...readWrite, id: 'wanxiang-backup' });
      if (disposed) return false;
      const selected = { handle, savedAt: 0, hash: '' };
      await locked(() => metadata.write([[settingsKey, selected]]));
      target = selected;
      allowed = true;
      ready(target.savedAt);
    } catch (failure) {
      report(
        failure.name === 'AbortError' || failure.code === 'cancelled'
          ? '自动备份等待选择文件夹'
          : '备份文件夹暂不可用 · ' + failure.message,
        true,
      );
      return false;
    } finally {
      authorizing = false;
      if (allowed) schedule(interval);
      closeWhenIdle();
    }
    if (allowed) void backup();
    return allowed;
  }

  events.on(document, 'visibilitychange', () => {
    if (!document.hidden) void backup();
  });
  if (allowed) {
    ready(target.savedAt);
    void backup();
  } else {
    report('文件夹备份未开启，请在存档界面选择备份文件夹', true);
  }

  return {
    choose() {
      if (disposed || authorizing || writing) return false;
      if (!window.confirm(choosePrompt)) return false;
      return authorize();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      events.dispose();
      // An in-flight write can finish its atomic file replacement.
      closeWhenIdle();
    },
  };
}
