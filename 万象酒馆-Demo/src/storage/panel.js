import { createEventScope } from '../shared/events.js';
import { exportDatabase, readDatabaseBackup } from './backup.js';

export function createLocalDataPanel({ database, storage, apiClient, dispose }) {
  const events = createEventScope();
  const panel = document.createElement('section');
  panel.className = 'local-data-panel';
  panel.innerHTML =
    '<h3>本地存档与设置</h3><p>存档、预设、世界书、聊天与立绘保存在此浏览器。完整备份不包含API密钥。</p><div><button id="data-export">导出完整备份</button><button id="data-import">导入完整备份</button><button id="data-persist">保护本地数据</button></div><input id="data-file" type="file" accept="application/json,.json" hidden><p id="data-status" role="status"></p>';
  document.querySelector('[data-ai-page="game"]').append(panel);
  const status = (text) => {
    panel.querySelector('#data-status').textContent = text;
  };
  events.on(panel.querySelector('#data-export'), 'click', async () => {
    try {
      await storage.flush();
      const backup = await exportDatabase(database, localStorage);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `wanxiang-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('完整备份已导出，换浏览器或网址时可用它恢复。');
    } catch (failure) {
      status('备份失败：' + failure.message);
    }
  });
  events.on(panel.querySelector('#data-import'), 'click', () =>
    panel.querySelector('#data-file').click(),
  );
  events.on(panel.querySelector('#data-file'), 'change', async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 512 * 1024 * 1024) throw Error('备份文件超过512MB');
      const backup = readDatabaseBackup(JSON.parse(await file.text()));
      apiClient.dispose();
      await storage.flush();
      const imported = new Set(backup.entries.map(([key]) => key));
      await database.write(
        backup.entries,
        database
          .entries()
          .map(([key]) => key)
          .filter((key) => !imported.has(key)),
      );
      for (const key of Object.keys(localStorage))
        if (key.startsWith('wanxiang.')) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(backup.preferences))
        localStorage.setItem(key, value);
      dispose();
      location.reload();
    } catch (failure) {
      status('导入失败：' + failure.message);
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
      events.dispose();
      panel.remove();
    },
  };
}
