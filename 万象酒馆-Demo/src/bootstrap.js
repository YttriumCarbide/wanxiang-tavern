import { createApplication } from './app/application.js';
import { openDatabase, createGameStorage } from './storage/database.js';
import { createStaticBackend } from './ai/static-backend.js';
import { newCampaign } from './campaign.js';
import { defaultProtagonist } from './content/qingyuan.js';
import { createLocalDataPanel } from './storage/panel.js';

async function enablePortraitWorker() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.register(new URL('../service-worker.js', import.meta.url));
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const changed = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(resolve, 5000);
        navigator.serviceWorker.addEventListener('controllerchange', changed, { once: true });
      });
    }
    return Boolean(navigator.serviceWorker.controller);
  } catch {
    return false;
  }
}

export async function startGame() {
  // Service-backed browser fixtures opt in explicitly; published HTML never carries this marker.
  if (document.querySelector('meta[name="wanxiang-test-backend"]')?.content === 'local') {
    const application = createApplication();
    window.demo = { ...application.api, dispose: application.dispose };
    return;
  }
  const notice = document.createElement('p');
  notice.className = 'storage-notice';
  notice.textContent = '正在读取本地存档…';
  notice.setAttribute('role', 'status');
  document.body.append(notice);
  const database = await openDatabase();
  if (!database.get('installation')) {
    // User-authorized clean release. Run once on this browser, never on ordinary updates.
    for (const key of Object.keys(localStorage))
      if (key.startsWith('wanxiang.')) localStorage.removeItem(key);
    await database.write([
      ['installation', { version: 1 }],
      ['game.wanxiang.worldbooks.v1', JSON.stringify(newCampaign(defaultProtagonist()))],
      ['game.wanxiang.creation-pending.v1', 'true'],
    ]);
  }
  const storage = createGameStorage(database, () => {
    notice.hidden = false;
    notice.textContent = '本地保存失败，请检查设备空间并导出备份。';
  });
  const apiClient = await createStaticBackend(database, {
    virtualImages: await enablePortraitWorker(),
  });
  const application = createApplication({ storage, apiClient });
  const panel = createLocalDataPanel({
    database,
    storage,
    apiClient,
    dispose: application.dispose,
  });
  window.demo = { ...application.api, dispose: application.dispose };
  window.addEventListener('pagehide', () => panel.dispose(), { once: true });
  notice.hidden = true;
}

startGame().catch((failure) => {
  const notice = document.querySelector('.storage-notice') || document.createElement('p');
  notice.className = 'storage-notice';
  notice.textContent = '游戏启动失败：' + failure.message;
  document.body.append(notice);
});
