import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';
import { restoreLibrary, compileRoster } from '../ai/library.js';
import { loadCustomPortraits } from '../portraits.js';
import { packagePortraitAssets, restorePortraitAssets } from '../portrait-archive.js';
import { newBattle, preview } from '../engine.js';
import { discardUnfinishedTrip } from '../abandoned-trip.js';
import { adventureSnapshot, validAdventureSnapshot } from '../adventure/snapshot.js';

export const SAVES_STORAGE_KEY = 'wanxiang.saves.v1';

export const SAVE_SLOTS = [
  {
    id: 'auto',
    label: '自动保存',
    tag: 'AUTO',
    isAuto: true,
    desc: '关键节点自动备份，可自由覆盖',
  },
  { id: 'slot1', label: '存档位 1', tag: 'SLOT 1', isAuto: false, desc: '手动独立存档槽位 1' },
  { id: 'slot2', label: '存档位 2', tag: 'SLOT 2', isAuto: false, desc: '手动独立存档槽位 2' },
  { id: 'slot3', label: '存档位 3', tag: 'SLOT 3', isAuto: false, desc: '手动独立存档槽位 3' },
];

function getStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* Node or restricted iframe environment */
  }
  return null;
}

export function validateSaveSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (snapshot.version !== 1) return false;
  if (!snapshot.data || typeof snapshot.data !== 'object') return false;
  const library = snapshot.data.library;
  if (!library || typeof library !== 'object') return false;
  if (!Array.isArray(library.characters) || !Array.isArray(library.party)) return false;
  return true;
}

export function createSaveSnapshot(session, slotId = 'slot1', note = '') {
  const library = session?.ai?.library;
  const customPortraits = loadCustomPortraits();
  const journey = {
    bossChoice: session?.journey?.bossChoice || 'bossGate',
    regionMap: session?.journey?.regionMap || 'ruins',
  };

  const partyNames = (library?.party || []).filter(Boolean).map((id) => {
    const char = library?.characters?.find((c) => c.id === id);
    return char?.setting?.name || char?.combat?.name || id;
  });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateString = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return {
    app: 'wanxiang-inn',
    version: 1,
    slotId,
    timestamp: Date.now(),
    dateString,
    note: note || (slotId === 'auto' ? '自动保存' : '手动存档'),
    summary: {
      chapter: library?.chapter || 1,
      mode: session?.runtime?.mode || 'inn',
      partyNames,
      characterCount: library?.characters?.length || 0,
      scriptCount: library?.scripts?.length || 0,
      regionMap: journey.regionMap,
      bossChoice: journey.bossChoice,
    },
    data: {
      library: structuredClone(library),
      customPortraits: structuredClone(customPortraits),
      journey,
      adventure: adventureSnapshot(session),
    },
  };
}

export function loadSavesStore(storage = getStorage()) {
  const empty = {
    version: 1,
    slots: {
      auto: null,
      slot1: null,
      slot2: null,
      slot3: null,
    },
  };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(SAVES_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !parsed.slots) {
      return empty;
    }
    return {
      version: 1,
      slots: {
        auto: validateSaveSnapshot(parsed.slots.auto) ? parsed.slots.auto : null,
        slot1: validateSaveSnapshot(parsed.slots.slot1) ? parsed.slots.slot1 : null,
        slot2: validateSaveSnapshot(parsed.slots.slot2) ? parsed.slots.slot2 : null,
        slot3: validateSaveSnapshot(parsed.slots.slot3) ? parsed.slots.slot3 : null,
      },
    };
  } catch {
    return empty;
  }
}

export function writeSavesStore(store, storage = getStorage()) {
  if (!storage) return;
  try {
    storage.setItem(SAVES_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('保存到 localStorage 失败:', err);
  }
}

export async function exportSnapshotToFile(snapshot, fallbackFilename) {
  const json = JSON.stringify(await packagePortraitAssets(snapshot), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateTag = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  a.href = url;
  a.download = fallbackFilename || `wanxiang-save-${snapshot.slotId || 'backup'}-${dateTag}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readSaveFile(file, savePortrait) {
  if (!file) throw new Error('未选择任何文件');
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('存档文件不是合法的 JSON 格式');
  }
  if (!validateSaveSnapshot(parsed)) {
    throw new Error('存档数据结构损坏或格式不兼容');
  }
  return restorePortraitAssets(parsed, fetch, savePortrait);
}

export function applySaveSnapshot(context, snapshot) {
  if (!validateSaveSnapshot(snapshot)) {
    throw new Error('无效的存档数据');
  }
  const { session } = context;
  const storage = context.storage || getStorage();

  session.ai.library = restoreLibrary(snapshot.data.library);
  if (validAdventureSnapshot(snapshot.data.adventure)) {
    if (snapshot.data.customPortraits && typeof localStorage !== 'undefined')
      localStorage.setItem('wanxiang.portraits.v1', JSON.stringify(snapshot.data.customPortraits));
    context.gal?.cancel();
    context.adventure?.leave();
    context.chat?.leave();
    void context.journey.resume({ ...snapshot.data.adventure, library: session.ai.library });
    return;
  }
  discardUnfinishedTrip(session.ai.library);
  storage?.removeItem('wanxiang.battle-checkpoint.v1');
  session.runtime.mode = 'inn';
  session.battle.playing = false;
  session.ai.activeScript = null;
  session.journey.expedition = null;
  session.battle.history = [];
  session.selection.selected = null;
  session.selection.pending = null;
  session.selection.selectedCell = -1;
  try {
    if (storage) {
      storage.setItem('wanxiang.worldbooks.v1', JSON.stringify(session.ai.library));
    }
  } catch {
    /* ignore */
  }

  if (snapshot.data.customPortraits && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('wanxiang.portraits.v1', JSON.stringify(snapshot.data.customPortraits));
    } catch {
      /* ignore */
    }
  }

  if (snapshot.data.journey) {
    if (snapshot.data.journey.bossChoice) {
      session.journey.bossChoice = snapshot.data.journey.bossChoice;
    }
    if (snapshot.data.journey.regionMap) {
      session.journey.regionMap = snapshot.data.journey.regionMap;
    }
  }

  try {
    const roster = compileRoster(session.ai.library);
    session.battle.state = newBattle(undefined, roster);
    session.battle.forecast = preview(session.battle.state, []);
    session.battle.plan = [];
  } catch (err) {
    throw new Error('存档阵容无效', { cause: err });
  }

  if (context.journey?.returnInn) {
    context.journey.returnInn();
  }
  if (context.shell?.renderParty) {
    context.shell.renderParty();
  }
  if (context.destinations?.render) {
    context.destinations.render();
  }
  context.onboarding?.resumed();
  void context.generation?.syncCharacters();
}

/** @param {import('./context.js').AppContext} context */
export function createSaveManager(context) {
  const { session, events } = context;
  const storage = context.storage || getStorage();
  let store = loadSavesStore(storage);

  function renderDialog() {
    const container = $('#saves-slots-list');
    if (!container) return;

    container.innerHTML = SAVE_SLOTS.map((slot) => {
      const item = store.slots[slot.id];
      const isEmpty = !item;
      const isAuto = slot.isAuto;

      return html`<article
        class="save-slot-card ${isAuto ? 'slot-auto' : ''} ${isEmpty ? 'is-empty' : 'is-filled'}"
      >
        <div class="slot-card-header">
          <div class="slot-badge-group">
            <span class="slot-tag">${slot.tag}</span>
            <strong class="slot-title">${slot.label}</strong>
          </div>
          <span class="slot-status-badge">${isEmpty ? '空槽位' : '已保存'}</span>
        </div>

        <div class="slot-card-body">
          ${
            isEmpty
              ? html`<div
                  class="slot-empty-body"
                  data-create-slot="${slot.id}"
                  role="button"
                  tabindex="0"
                  title="点击在此槽位新建存档"
                >
                  <div class="slot-empty-state">
                    <span class="slot-add-icon">＋</span>
                    <p><strong>新建存档</strong></p>
                    <small class="muted"
                      >${
                        isAuto
                          ? '关键节点将自动同步，亦可点击立即新建'
                          : '点击在此槽位新建当前游戏进度存档'
                      }</small
                    >
                  </div>
                </div>`
              : html`<div class="slot-info">
                  <div class="slot-time">
                    <small class="muted">保存时间：</small><strong>${item.dateString}</strong>
                  </div>
                  <div class="slot-detail-row">
                    <span class="slot-meta-pill">第 ${item.summary.chapter} 章</span>
                    <span class="slot-meta-pill">${item.summary.characterCount} 位角色</span>
                    <span class="slot-meta-pill">${item.summary.scriptCount} 篇剧本</span>
                  </div>
                  <div class="slot-party-preview" title="${item.summary.partyNames.join(' · ')}">
                    <small class="muted">出战小队：</small>
                    <span>${escapeText(item.summary.partyNames.join(' · ') || '未配置')}</span>
                  </div>
                </div>`
          }
        </div>

        <div class="slot-card-actions">
          ${
            isEmpty
              ? html`<button
                  class="save-btn save-btn-create"
                  data-save-slot="${slot.id}"
                  title="将当前游戏进度新建至此槽位"
                >
                  ＋ 新建存档
                </button>`
              : html`<button
                  class="save-btn save-btn-write"
                  data-save-slot="${slot.id}"
                  title="将当前游戏进度覆盖存入此槽位"
                >
                  覆盖保存
                </button>`
          }
          <button
            class="save-btn save-btn-load"
            data-load-slot="${slot.id}"
            ${isEmpty ? 'disabled' : ''}
            title="读取此槽位存档并恢复游戏"
          >
            读取
          </button>
          <button
            class="save-btn save-btn-export"
            data-export-slot="${slot.id}"
            ${isEmpty ? 'disabled' : ''}
            title="导出此槽位存档为 JSON 文件"
          >
            导出
          </button>
          ${
            !isEmpty
              ? html`<button
                  class="save-btn save-btn-clear"
                  data-clear-slot="${slot.id}"
                  title="清空此槽位记录"
                >
                  清空
                </button>`
              : ''
          }
        </div>
      </article>`;
    }).join('');
  }

  function open() {
    store = loadSavesStore(storage);
    renderDialog();
    const dialog = $('#saves-dialog');
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  function close() {
    const dialog = $('#saves-dialog');
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function saveSlot(slotId, note = '') {
    if (session.runtime.needsStart) return context.shell.toast('请先创建并确认主角，再保存冒险');
    const slotConfig = SAVE_SLOTS.find((s) => s.id === slotId);
    if (!slotConfig) return;
    const snapshot = createSaveSnapshot(session, slotId, note);
    store.slots[slotId] = snapshot;
    writeSavesStore(store, storage);
    renderDialog();
    context.shell?.toast?.(`已覆盖保存至 [${slotConfig.label}]`);
  }

  function loadSlot(slotId) {
    const slotConfig = SAVE_SLOTS.find((s) => s.id === slotId);
    const snapshot = store.slots[slotId];
    if (!snapshot) {
      context.shell?.toast?.(`[${slotConfig?.label || slotId}] 暂无存档记录`);
      return;
    }
    try {
      applySaveSnapshot(context, snapshot);
      close();
      context.shell?.toast?.(`已成功载入 [${slotConfig?.label || slotId}] 存档！`);
    } catch (err) {
      context.shell?.toast?.(`载入失败: ${err.message}`);
    }
  }

  function clearSlot(slotId) {
    const slotConfig = SAVE_SLOTS.find((s) => s.id === slotId);
    store.slots[slotId] = null;
    writeSavesStore(store, storage);
    renderDialog();
    context.shell?.toast?.(`已清空 [${slotConfig?.label || slotId}] 记录`);
  }

  async function exportSlot(slotId) {
    const snapshot = store.slots[slotId];
    if (!snapshot) {
      context.shell?.toast?.('该槽位为空，无法导出');
      return;
    }
    try {
      await exportSnapshotToFile(snapshot);
      context.shell?.toast?.('存档文件导出完成');
    } catch (failure) {
      context.shell?.toast?.(failure.message);
    }
  }

  async function exportCurrent() {
    if (session.runtime.needsStart) return context.shell.toast('请先完成主角创建');
    const snapshot = createSaveSnapshot(session, 'live', '实时进度导出');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateTag = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    try {
      await exportSnapshotToFile(snapshot, `wanxiang-live-save-${dateTag}.json`);
      context.shell?.toast?.('实时进度已导出为 JSON 文件');
    } catch (failure) {
      context.shell?.toast?.(failure.message);
    }
  }

  async function importFromFile(file) {
    try {
      const snapshot = await readSaveFile(
        file,
        context.apiClient.staticMode
          ? (dataUrl) => context.apiClient.request('portrait/save', { dataUrl })
          : undefined,
      );
      // 载入存档，并同步写入 auto 槽位
      snapshot.slotId = 'auto';
      store.slots.auto = snapshot;
      writeSavesStore(store, storage);
      applySaveSnapshot(context, snapshot);
      close();
      context.shell?.toast?.('存档导入成功！已恢复游戏并同步至自动保存');
    } catch (err) {
      context.shell?.toast?.(`导入失败: ${err.message}`);
    }
  }

  function autoSave(reason = '自动保存') {
    if (session.runtime?.disposed || session.battle?.playing || session.runtime.needsStart) return;
    const snapshot = createSaveSnapshot(session, 'auto', reason);
    store.slots.auto = snapshot;
    writeSavesStore(store, storage);
    const dialog = $('#saves-dialog');
    if (dialog && dialog.open) {
      renderDialog();
    }
  }

  function createNewSave(preferredSlotId = null) {
    if (session.runtime.needsStart) return context.onboarding.open();
    let targetId = preferredSlotId;
    if (!targetId) {
      const emptySlot = SAVE_SLOTS.filter((s) => !s.isAuto).find((s) => !store.slots[s.id]);
      if (emptySlot) {
        targetId = emptySlot.id;
      }
    }

    if (targetId) {
      const slotConfig = SAVE_SLOTS.find((s) => s.id === targetId);
      const isOverwriting = !!store.slots[targetId];
      saveSlot(targetId, isOverwriting ? '覆盖保存' : '新建存档');
      context.shell?.toast?.(
        isOverwriting
          ? `已覆盖保存至 [${slotConfig?.label || targetId}]`
          : `已成功新建存档至 [${slotConfig?.label || targetId}]！`,
      );
      return;
    }

    const cards = document.querySelectorAll('#saves-slots-list .save-slot-card');
    cards.forEach((c) => c.classList.add('slot-highlight'));
    setTimeout(() => {
      cards.forEach((c) => c.classList.remove('slot-highlight'));
    }, 1800);
    context.shell?.toast?.('手动存档位已满（共3个位置），请点击下方目标槽位的“覆盖保存”');
  }

  function startNewAdventure() {
    close();
    context.onboarding.open();
  }

  // 事件绑定
  const openBtn = $('#saves-open');
  if (openBtn) {
    events.on(openBtn, 'click', () => open());
  }

  const closeBtn = $('#saves-close');
  if (closeBtn) {
    events.on(closeBtn, 'click', () => close());
  }

  const dialog = $('#saves-dialog');
  if (dialog) {
    events.on(dialog, 'click', (e) => {
      if (e.target === dialog) close();
    });
  }

  const createBtn = $('#saves-create-btn');
  if (createBtn) {
    events.on(createBtn, 'click', () => createNewSave());
  }

  const newGameBtn = $('#saves-new-game-btn');
  if (newGameBtn) {
    events.on(newGameBtn, 'click', () => startNewAdventure());
  }

  const exportCurrentBtn = $('#saves-export-current');
  if (exportCurrentBtn) {
    events.on(exportCurrentBtn, 'click', () => exportCurrent());
  }

  const importInput = $('#saves-import-input');
  if (importInput) {
    events.on(importInput, 'change', async (e) => {
      const file = e.target?.files?.[0];
      if (file) {
        await importFromFile(file);
        importInput.value = '';
      }
    });
  }

  const slotsList = $('#saves-slots-list');
  if (slotsList) {
    events.on(slotsList, 'click', (e) => {
      const createTarget = e.target.closest('[data-create-slot]');
      if (createTarget) {
        createNewSave(createTarget.dataset.createSlot);
        return;
      }

      const target = e.target.closest('button');
      if (!target) return;

      const saveSlotId = target.dataset.saveSlot;
      if (saveSlotId) {
        createNewSave(saveSlotId);
        return;
      }

      const loadSlotId = target.dataset.loadSlot;
      if (loadSlotId) {
        loadSlot(loadSlotId);
        return;
      }

      const exportSlotId = target.dataset.exportSlot;
      if (exportSlotId) {
        exportSlot(exportSlotId);
        return;
      }

      const clearSlotId = target.dataset.clearSlot;
      if (clearSlotId) {
        clearSlot(clearSlotId);
        return;
      }
    });
  }

  return {
    getStore: () => store,
    open,
    close,
    saveSlot,
    loadSlot,
    clearSlot,
    exportSlot,
    exportCurrent,
    importFromFile,
    autoSave,
    createNewSave,
    startNewAdventure,
    renderDialog,
    dispose: () => {
      close();
    },
  };
}
