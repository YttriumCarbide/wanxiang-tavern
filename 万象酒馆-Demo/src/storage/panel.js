import { createEventScope } from '../shared/events.js';
import { exportDatabase, readDatabaseBackup } from './backup.js';
import { exportJsonFile } from './export-file.js';
import { installFolderBackup, supportsFolderBackup } from './folder-backup.js';

function excludedFromBackup(key) {
  return key === 'regex' || key.startsWith('prompt.') || key.startsWith('helper.');
}

export function restoreBackup(database, storage, backup, preferences) {
  return storage.replace(async () => {
    const previous = new Map(
      Object.keys(preferences)
        .filter((key) => key.startsWith('wanxiang.'))
        .map((key) => [key, preferences.getItem(key)]),
    );
    const next = new Map(Object.entries(backup.preferences));
    const changedPreferences = new Map();
    function writePreference(key, value) {
      if (value === null) preferences.removeItem(key);
      else preferences.setItem(key, value);
    }
    try {
      // Remove omitted preferences first so a replacement can reuse space.
      for (const key of previous.keys()) {
        if (next.has(key)) continue;
        writePreference(key, null);
        changedPreferences.set(key, null);
      }
      for (const [key, value] of next) {
        if (value === previous.get(key)) continue;
        writePreference(key, value);
        changedPreferences.set(key, value);
      }
      const imported = new Set(backup.entries.map(([key]) => key));
      const deleted = database
        .entries()
        .map(([key]) => key)
        .filter((key) => !excludedFromBackup(key) && !imported.has(key));
      await database.write(backup.entries, deleted, {
        guardGame: true,
        ...(imported.has('api.config') || deleted.includes('api.config')
          ? { expectedConnection: { value: database.get('api.config') } }
          : {}),
      });
    } catch (failure) {
      if (failure.requiresReload) throw failure;
      try {
        const restorable = [...changedPreferences].filter(
          ([key, value]) => preferences.getItem(key) === value,
        );
        for (const [key] of restorable) preferences.removeItem(key);
        for (const [key] of restorable) {
          if (previous.has(key)) writePreference(key, previous.get(key));
        }
      } catch (restoreFailure) {
        const rollbackError = new AggregateError(
          [failure, restoreFailure],
          '存档导入失败，部分偏好无法自动恢复。' + restoreFailure.message,
          { cause: failure },
        );
        throw rollbackError;
      }
      throw failure;
    }
  });
}

export function createLocalDataPanel({ database, storage, dispose }) {
  const events = createEventScope();
  const panel = document.createElement('section');
  panel.className = 'local-data-panel';
  panel.innerHTML =
    '<h3>本地存档与设置</h3><p>存档、预设、世界书、聊天与立绘保存在当前设备。完整备份不包含API密钥。</p><div><button id="data-export">导出完整备份</button><button id="data-import">导入完整备份</button><button id="data-persist">保护本地数据</button><button id="data-backup-folder" hidden>重新选择备份文件夹</button></div><p id="data-folder-status" role="status" hidden></p><p id="data-status" role="status"></p>';
  if (database.directory) {
    panel.querySelector('p').textContent =
      '进度、预设、世界书、聊天和立绘自动保存到 ' + database.directory + '，并保留历史备份。';
    panel.querySelector('#data-persist').hidden = true;
  }
  document.querySelector('[data-ai-page="game"]').append(panel);
  const saveToolbar = document.querySelector('#saves-dialog .saves-toolbar');
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'saves-tool-btn';
  importButton.id = 'saves-import-full';
  importButton.textContent = '导入完整备份';
  importButton.disabled = true;
  saveToolbar.append(importButton);
  const enableFullImport = document.createElement('input');
  enableFullImport.type = 'checkbox';
  enableFullImport.id = 'saves-enable-full-import';
  enableFullImport.disabled = true;
  const enableFullImportLabel = document.createElement('label');
  enableFullImportLabel.htmlFor = 'saves-enable-full-import';
  enableFullImportLabel.className = 'saves-tool-btn saves-backup-toggle';
  enableFullImportLabel.append(enableFullImport, '开启完整备份导入');
  saveToolbar.append(enableFullImportLabel);
  const exportFullButton = document.createElement('button');
  exportFullButton.type = 'button';
  exportFullButton.className = 'saves-tool-btn';
  exportFullButton.id = 'saves-export-full';
  exportFullButton.textContent = '导出完整备份';
  saveToolbar.append(exportFullButton);
  const backupFolderButton = document.createElement('button');
  backupFolderButton.type = 'button';
  backupFolderButton.className = 'saves-tool-btn';
  backupFolderButton.id = 'saves-backup-folder';
  backupFolderButton.textContent = '选择备份文件夹';
  saveToolbar.append(backupFolderButton);
  const saveStatus = document.createElement('p');
  saveStatus.className = 'muted';
  saveStatus.setAttribute('role', 'status');
  saveStatus.hidden = true;
  document.querySelector('#saves-dialog .saves-header').append(saveStatus);
  const saveBackupStatus = document.createElement('p');
  saveBackupStatus.className = 'muted';
  saveBackupStatus.id = 'saves-backup-status';
  saveBackupStatus.setAttribute('role', 'status');
  saveBackupStatus.hidden = true;
  document.querySelector('#saves-dialog .saves-header').append(saveBackupStatus);
  const folderStatus = panel.querySelector('#data-folder-status');
  const chooseFolder = panel.querySelector('#data-backup-folder');
  const dataFile = document.createElement('input');
  dataFile.id = 'data-file';
  dataFile.type = 'file';
  dataFile.accept = '.json,application/json';
  dataFile.hidden = true;
  saveToolbar.append(dataFile);
  const savesDialog = document.querySelector('#saves-dialog');
  const savesOpen = document.querySelector('#saves-open');
  let folderBackup;
  let disposed = false;
  let importing = false;
  let exporting = false;
  let importSequence = 0;
  let folderInstalling = false;
  let folderReady = false;
  let folderChoosing = false;
  function updateFolderButtons() {
    const disabled = !folderReady || folderInstalling || folderChoosing || importing || disposed;
    backupFolderButton.disabled = disabled;
    chooseFolder.disabled = disabled;
  }
  function updateImportGate() {
    const open = Boolean(savesDialog?.open);
    const slotBusy = savesDialog?.dataset.slotBusy === 'true';
    const checked = enableFullImport.checked;
    enableFullImport.disabled = importing || slotBusy || !open;
    importButton.disabled = importing || slotBusy || !open || !checked;
    exportFullButton.disabled = exporting || importing || slotBusy;
    panel.querySelector('#data-export').disabled = exportFullButton.disabled;
  }
  function resetImportGate() {
    enableFullImport.checked = false;
    enableFullImport.disabled = true;
    importButton.disabled = true;
  }
  const dialogObserver = new MutationObserver(() => {
    if (savesDialog.open) updateImportGate();
    else {
      resetImportGate();
      importSequence += 1;
    }
  });
  dialogObserver.observe(savesDialog, {
    attributes: true,
    attributeFilter: ['open', 'data-slot-busy'],
  });
  updateImportGate();
  function backupStatus(text, retry = false) {
    if (disposed) return;
    folderStatus.hidden = false;
    folderStatus.textContent = text;
    saveBackupStatus.hidden = false;
    saveBackupStatus.textContent = text;
    chooseFolder.hidden = !retry;
  }
  if (!database.directory) {
    if (supportsFolderBackup()) {
      folderInstalling = true;
      updateFolderButtons();
      void installFolderBackup({ database, storage, status: backupStatus })
        .then((controller) => {
          folderInstalling = false;
          if (disposed) {
            controller.dispose();
            return;
          }
          folderBackup = controller;
          folderReady = true;
          updateFolderButtons();
        })
        .catch((failure) => {
          folderInstalling = false;
          updateFolderButtons();
          backupStatus('自动备份暂不可用 · ' + failure.message);
        });
    } else {
      backupStatus('此浏览器可通过「导出完整备份」保存文件');
    }
  } else {
    backupStatus('已由本机目录备份');
  }
  updateFolderButtons();
  async function chooseBackupFolder() {
    if (!folderBackup || folderInstalling || folderChoosing || importing || disposed) return;
    folderChoosing = true;
    updateFolderButtons();
    try {
      await folderBackup.choose();
    } catch (failure) {
      backupStatus('备份文件夹选择失败 · ' + failure.message);
    } finally {
      folderChoosing = false;
      updateFolderButtons();
    }
  }
  events.on(chooseFolder, 'click', () => void chooseBackupFolder());
  events.on(backupFolderButton, 'click', () => void chooseBackupFolder());
  const status = (text) => {
    if (disposed) return;
    panel.querySelector('#data-status').textContent = text;
    saveStatus.hidden = false;
    saveStatus.textContent = text;
  };
  async function exportFullBackup() {
    if (exporting || importing || savesDialog?.dataset.slotBusy === 'true') return;
    exporting = true;
    updateImportGate();
    status('正在准备完整备份…');
    try {
      await storage.flush();
      const backup = await exportDatabase(database, localStorage);
      const name = `wanxiang-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const { method } = await exportJsonFile(JSON.stringify(backup), name);
      status(
        method === 'native'
          ? '完整备份已导出，换浏览器或网址时可用它恢复。'
          : '完整备份文件已开始下载。',
      );
    } catch (failure) {
      status(
        failure.code === 'cancelled' ? '已取消导出完整备份。' : '备份失败：' + failure.message,
      );
    } finally {
      exporting = false;
      if (!disposed) updateImportGate();
    }
  }
  events.on(panel.querySelector('#data-export'), 'click', () => void exportFullBackup());
  events.on(exportFullButton, 'click', () => void exportFullBackup());
  events.on(panel.querySelector('#data-import'), 'click', () => {
    if (savesOpen) savesOpen.click();
    else if (savesDialog && !savesDialog.open) savesDialog.showModal?.();
    status('请在存档界面勾选「开启完整备份导入」后再导入完整备份。');
  });
  events.on(enableFullImport, 'change', () => updateImportGate());
  events.on(importButton, 'click', () => {
    if (importing || savesDialog?.dataset.slotBusy === 'true') return;
    if (!savesDialog?.open) return;
    if (!enableFullImport.checked) return;
    dataFile.click();
  });
  events.on(savesDialog, 'close', () => {
    resetImportGate();
    importSequence += 1;
  });
  events.on(savesDialog, 'cancel', () => {
    resetImportGate();
    importSequence += 1;
  });
  events.on(dataFile, 'change', async (event) => {
    if (
      importing ||
      savesDialog?.dataset.slotBusy === 'true' ||
      !savesDialog?.open ||
      !enableFullImport.checked
    ) {
      event.target.value = '';
      return;
    }
    importing = true;
    savesDialog.dataset.storageBusy = 'true';
    updateImportGate();
    updateFolderButtons();
    const sequence = ++importSequence;
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 512 * 1024 * 1024) throw Error('备份文件超过512MB');
      const backup = readDatabaseBackup(JSON.parse(await file.text()));
      if (disposed) return;
      if (sequence !== importSequence) return;
      if (!savesDialog?.open) return;
      if (!enableFullImport.checked) return;
      const confirmed = window.confirm(
        '导入完整备份将替换当前游戏进度、全部存档栏位及设置，无法自动撤销。建议先导出当前完整备份。是否确认覆盖并导入？',
      );
      if (!confirmed) {
        status('已取消导入完整备份。');
        return;
      }
      if (disposed) return;
      if (sequence !== importSequence) return;
      if (!savesDialog?.open) return;
      if (!enableFullImport.checked) return;
      await restoreBackup(database, storage, backup, localStorage);
      dispose();
      location.reload();
    } catch (failure) {
      if (!disposed && sequence === importSequence) status('导入失败：' + failure.message);
    } finally {
      importing = false;
      delete savesDialog.dataset.storageBusy;
      event.target.value = '';
      updateImportGate();
      updateFolderButtons();
    }
  });
  events.on(panel.querySelector('#data-persist'), 'click', async () => {
    try {
      const accepted = await navigator.storage?.persist?.();
      status(
        accepted
          ? '浏览器已允许持久保存；仍可随时导出备份。'
          : '浏览器暂未批准持久存储，现有数据保留，请定期导出备份。',
      );
    } catch (failure) {
      status('无法设置持久存储：' + failure.message);
    }
  });
  return {
    dispose: () => {
      disposed = true;
      importSequence += 1;
      folderBackup?.dispose();
      dialogObserver.disconnect();
      events.dispose();
      importButton.remove();
      dataFile.remove();
      enableFullImport.remove();
      enableFullImportLabel.remove();
      exportFullButton.remove();
      backupFolderButton.remove();
      saveStatus.remove();
      saveBackupStatus.remove();
      panel.remove();
    },
  };
}
