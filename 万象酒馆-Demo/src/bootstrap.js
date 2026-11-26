import { configureGameLayout, mountLandscapeHost, mountOuterGestures } from './app/display.js';
import { createApplication } from './app/application.js';
import { openDatabase, createGameStorage } from './storage/database.js';
import { openDiskDatabase } from './storage/disk-database.js';
import { createStaticBackend } from './ai/static-backend.js';
import { newCampaign } from './campaign.js';
import { defaultProtagonist } from './content/qingyuan.js';
import { applyGeneratedDatabaseReset } from './app/generated-reset.js';
import { createLocalDataPanel } from './storage/panel.js';
import { createContentUpdates } from './updates/content-updates.js';
import { loadUpdateRelease, TUTORIAL_GATE } from './updates/manifest.js';
import { createCacheUpdateStore } from './updates/storage.js';
import { createNativeUpdateStore } from './updates/native-storage.js';
import { createWorldLoadingOverlay } from './shared/scene-loading.js';
import {
  isDeveloperCopy,
  openDeveloperCopyDatabase,
  developerCopyFetch,
} from './storage/developer-copy.js';

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
  configureGameLayout();
  if (mountLandscapeHost()) {
    mountOuterGestures();
    return;
  }
  if (isDeveloperCopy()) {
    const database = openDeveloperCopyDatabase();
    const storage = createGameStorage(database);
    const apiClient = await createStaticBackend(database, {
      virtualImages: false,
      fetchImpl: developerCopyFetch,
    });
    const application = createApplication({ storage, apiClient, developerSandbox: true });
    window.demo = { ...application.api, dispose: application.dispose };
    document.title = '万象酒馆 · 开发者测试档';
    return;
  }
  // Service-backed browser fixtures opt in explicitly; published HTML never carries this marker.
  if (document.querySelector('meta[name="wanxiang-test-backend"]')?.content === 'local') {
    const application = createApplication();
    window.demo = { ...application.api, dispose: application.dispose };
    return;
  }
  const notice = document.createElement('p');
  notice.className = 'storage-notice';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  document.body.append(notice);
  const bootLoading = createWorldLoadingOverlay('正在推开万象酒馆之门');
  const bootPhase = bootLoading.element.querySelector('.scene-loading-phase');
  if (bootPhase) bootPhase.textContent = '正在唤醒酒馆与旅途档案…';
  bootLoading.show('正在推开万象酒馆之门');
  try {
    const browserDatabase = await openDatabase();
    const diskEndpoint = document.querySelector('meta[name="wanxiang-disk-storage"]')?.content;
    let cacheWarning = false;
    const database =
      diskEndpoint === '/__demo/storage'
        ? await openDiskDatabase(diskEndpoint, browserDatabase, () => {
            cacheWarning = true;
            notice.hidden = false;
            notice.textContent = '硬盘进度已保存，浏览器缓存写入失败。';
          })
        : browserDatabase;
    await applyGeneratedDatabaseReset(database, localStorage);
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
    const storage = createGameStorage(database, (failure) => {
      notice.hidden = false;
      notice.textContent = diskEndpoint
        ? '硬盘保存失败：' + failure.message
        : '本地保存失败，请检查设备空间并导出备份。';
    });
    const base = new URL('../', import.meta.url);
    const nativeStore = createNativeUpdateStore({ base });
    const apiClient = await createStaticBackend(database, {
      virtualImages:
        !globalThis.wanxiangNativeUpdate &&
        database.cacheAvailable !== false &&
        (await enablePortraitWorker()),
    });
    const updateMeta = document.querySelector('meta[name="wanxiang-update-manifest"]');
    const manifestUrl = updateMeta?.content && new URL(updateMeta.content, base);
    const contentUpdates =
      manifestUrl?.origin === base.origin
        ? createContentUpdates({
            load: (signal) =>
              loadUpdateRelease(manifestUrl, {
                signal,
                expectedVersion: updateMeta.dataset.version,
              }),
            store: nativeStore ?? createCacheUpdateStore({ base }),
            emptyGates: updateMeta.dataset.tutorialGate === 'empty' ? [TUTORIAL_GATE] : [],
          })
        : undefined;
    const application = createApplication({ storage, apiClient, contentUpdates });
    const panel = createLocalDataPanel({
      database,
      storage,
      apiClient,
      dispose: application.dispose,
    });
    window.demo = { ...application.api, contentUpdates, dispose: application.dispose };
    bootLoading.dispose();
    function disposePanel(event) {
      if (event.persisted) return;
      window.removeEventListener('pagehide', disposePanel);
      panel.dispose();
    }
    window.addEventListener('pagehide', disposePanel);
    notice.hidden = !cacheWarning;
  } catch (failure) {
    bootLoading.dispose();
    throw failure;
  }
}

startGame().catch((failure) => {
  const notice = document.querySelector('.storage-notice') || document.createElement('p');
  notice.className = 'storage-notice';
  notice.hidden = false;
  notice.textContent = '游戏启动失败：' + failure.message;
  document.body.append(notice);
});
