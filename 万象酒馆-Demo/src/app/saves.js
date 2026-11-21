import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';
import { restoreLibrary, purgeLegacyRuinsProgress, compileRoster } from '../ai/library.js';
import { loadCustomPortraits } from '../portraits.js';
import { packagePortraitAssets, restorePortraitAssets } from '../portrait-archive.js';
import { newBattle, preview } from '../engine.js';
import { discardUnfinishedTrip } from '../abandoned-trip.js';
import { adventureSnapshot, validAdventureSnapshot } from '../adventure/snapshot.js';
import { isRuinsAdventureSnapshot } from '../ai/library-ruins-migration.js';

export const SAVES_STORAGE_KEY = 'wanxiang.saves.v1';

export const SAVE_PAGE_SIZE = 4;
export const SAVE_PAGE_COUNT = 5;

export const SAVE_SLOTS = [
  {
    id: 'auto',
    label: '自动保存',
    tag: 'AUTO',
    isAuto: true,
    desc: '关键节点自动备份，可自由覆盖',
  },
  ...Array.from({ length: 19 }, (_, index) => {
    const number = index + 1;
    return {
      id: `slot${number}`,
      label: `存档位 ${number}`,
      tag: `SLOT ${number}`,
      isAuto: false,
      desc: `手动独立存档槽位 ${number}`,
    };
  }),
];

const SAVE_SLOT_IDS = SAVE_SLOTS.map((slot) => slot.id);

function getStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* Node or restricted iframe environment */
  }
  return null;
}

export function normalizeSaveName(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const codepoints = Array.from(trimmed);
  if (codepoints.length <= 24) return trimmed;
  return codepoints.slice(0, 24).join('');
}

function normalizeSnapshotName(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const name = normalizeSaveName(snapshot.name);
  if (name) snapshot.name = name;
  else delete snapshot.name;
  return snapshot;
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
    bossChoice: session?.journey?.bossChoice || 'millVoleAlpha',
    regionMap: session?.journey?.regionMap || 'mill',
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

function emptySavesStore() {
  const slots = {};
  for (const id of SAVE_SLOT_IDS) slots[id] = null;
  return { version: 1, slots };
}

export function loadSavesStore(storage = getStorage()) {
  const empty = emptySavesStore();
  if (!storage) return empty;
  try {
    const raw = storage.getItem(SAVES_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !parsed.slots) {
      return empty;
    }
    const slots = {};
    for (const id of SAVE_SLOT_IDS) {
      const candidate = parsed.slots[id];
      if (validateSaveSnapshot(candidate)) {
        slots[id] = normalizeSnapshotName(candidate);
      } else {
        slots[id] = null;
      }
    }
    return { version: 1, slots };
  } catch {
    return empty;
  }
}

export function writeSavesStore(store, storage = getStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(SAVES_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    console.warn('保存到 localStorage 失败:', err);
    return false;
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
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('存档文件不是合法的 JSON 格式');
  }
  if (parsed?.app === 'wanxiang-static-backup') {
    throw new Error('这是完整备份，请勾选“开启完整备份导入”后使用“导入完整备份”');
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
  const ruinsPurged = purgeLegacyRuinsProgress(session.ai.library);
  if (
    validAdventureSnapshot(snapshot.data.adventure) &&
    (!ruinsPurged || !isRuinsAdventureSnapshot(snapshot.data.adventure))
  ) {
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

function safeSummary(snapshot) {
  const summary =
    snapshot && typeof snapshot.summary === 'object' && snapshot.summary ? snapshot.summary : {};
  const partyNames = Array.isArray(summary.partyNames)
    ? summary.partyNames.filter((name) => typeof name === 'string' && name.trim())
    : [];
  const chapter = Number.isFinite(summary.chapter) ? summary.chapter : 1;
  const characterCount = Number.isFinite(summary.characterCount) ? summary.characterCount : 0;
  const scriptCount = Number.isFinite(summary.scriptCount) ? summary.scriptCount : 0;
  return { chapter, characterCount, scriptCount, partyNames };
}

function safeDateString(snapshot) {
  if (snapshot && typeof snapshot.dateString === 'string' && snapshot.dateString.trim()) {
    return snapshot.dateString;
  }
  if (snapshot && Number.isFinite(snapshot.timestamp)) {
    try {
      const date = new Date(snapshot.timestamp);
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    } catch {
      /* ignore */
    }
  }
  return '未知时间';
}

function slotLabel(slotId) {
  const config = SAVE_SLOTS.find((slot) => slot.id === slotId);
  return config?.label || slotId;
}

/** @param {import('./context.js').AppContext} context */
export function createSaveManager(context) {
  const { session, events } = context;
  const storage = context.storage || getStorage();
  let store = loadSavesStore(storage);
  let writeQueue = Promise.resolve();
  let importSequence = 0;
  let importing = false;
  let pendingWrites = 0;
  let disposed = false;
  let highlightTimer = null;
  let page = 0;
  let pendingImport = null;
  let importMessage = '';

  function mutationLocked({ allowPendingImport = false } = {}) {
    if (disposed) return '存档面板已关闭';
    if ($('#saves-dialog')?.dataset?.storageBusy === 'true') return '正在处理完整备份，请稍候';
    if (pendingImport && !allowPendingImport) return '请先选择导入栏位或取消导入';
    if (importing) return '正在读取存档，请稍候';
    if (pendingWrites) return '正在保存存档，请稍候';
    if (session.battle?.playing) return '战斗演出期间暂不可改动或读取存档';
    if (session.ai?.busy) return '接口生成期间暂不可改动或读取存档';
    return '';
  }

  function persistStore(nextStoreOrFactory, guard = () => true) {
    pendingWrites += 1;
    renderDialog();
    const write = writeQueue
      .catch(() => {})
      .then(async () => {
        const previous = storage?.getItem?.(SAVES_STORAGE_KEY) ?? null;
        const nextStore =
          typeof nextStoreOrFactory === 'function' ? nextStoreOrFactory(store) : nextStoreOrFactory;
        if (!guard()) throw new Error('导入期间游戏状态已改变，已取消载入');
        if (!writeSavesStore(nextStore, storage)) throw new Error('存档写入失败');
        try {
          await storage?.flush?.();
          if (!guard()) throw new Error('导入期间游戏状态已改变，已取消载入');
        } catch (failure) {
          try {
            if (previous === null) storage?.removeItem?.(SAVES_STORAGE_KEY);
            else storage?.setItem?.(SAVES_STORAGE_KEY, previous);
            await storage?.flush?.();
          } catch {
            // Preserve and report the original write or cancellation failure.
          }
          throw failure;
        }
        store = nextStore;
      });
    writeQueue = write.catch(() => {});
    return write.finally(() => {
      pendingWrites -= 1;
      if (!disposed) renderDialog();
    });
  }

  function updatedStore(update) {
    return persistStore((latest) => {
      const next = structuredClone(latest);
      update(next);
      return next;
    });
  }

  function pageSlots() {
    const start = page * SAVE_PAGE_SIZE;
    return SAVE_SLOTS.slice(start, start + SAVE_PAGE_SIZE);
  }

  function renderPager() {
    const prev = $('#saves-prev-page');
    const next = $('#saves-next-page');
    if (prev) prev.disabled = page <= 0;
    if (next) next.disabled = page >= SAVE_PAGE_COUNT - 1;
    const status = $('#saves-page-status');
    if (status) {
      const start = page * SAVE_PAGE_SIZE + 1;
      const end = Math.min((page + 1) * SAVE_PAGE_SIZE, SAVE_SLOTS.length);
      status.textContent = `第 ${page + 1} / ${SAVE_PAGE_COUNT} 页 · 第 ${start}-${end} / ${SAVE_SLOTS.length} 栏位`;
    }
  }

  function renderImportStatus() {
    const message = importing
      ? pendingImport
        ? '正在写入目标栏位，请稍候。'
        : '正在读取存档文件及立绘，请稍候，可取消导入。'
      : importMessage ||
        (pendingImport
          ? `已选择「${pendingImport.filename || '存档文件'}」，请选择要导入的栏位，或取消导入。`
          : '');
    const selection = $('#saves-import-selection');
    if (selection) selection.hidden = !message;
    const dialog = $('#saves-dialog');
    if (dialog?.dataset) {
      if (pendingImport || importing || pendingWrites) dialog.dataset.slotBusy = 'true';
      else delete dialog.dataset.slotBusy;
    }
    const status = $('#saves-import-status');
    const cancel = $('#saves-import-cancel');
    if (status) {
      status.textContent = message;
      status.hidden = !message;
    }
    if (cancel) cancel.hidden = !pendingImport && !importing;
  }

  function reportImportStatus(message) {
    importMessage = message;
    renderImportStatus();
    $('#saves-import-status')?.scrollIntoView?.({ block: 'nearest' });
    context.shell?.toast?.(message);
  }

  function renderDialog() {
    const container = $('#saves-slots-list');
    if (!container) return;
    const lockedReason = mutationLocked();
    const locked = Boolean(lockedReason);
    if ($('#saves-create-btn'))
      $('#saves-create-btn').disabled = locked || session.runtime.needsStart;
    if ($('#saves-new-game-btn')) $('#saves-new-game-btn').disabled = locked;
    if ($('#saves-import-input')) $('#saves-import-input').disabled = locked;
    if ($('#saves-import-btn')) $('#saves-import-btn').disabled = locked;

    renderPager();
    renderImportStatus();

    container.innerHTML = pageSlots()
      .map((slot) => {
        const item = store.slots[slot.id];
        const isEmpty = !item;
        const isAuto = slot.isAuto;
        const summary = isEmpty ? null : safeSummary(item);
        const dateString = isEmpty ? '' : safeDateString(item);
        const displayName = !isEmpty && item.name ? item.name : slot.label;
        const partyText = summary ? summary.partyNames.join(' · ') : '';

        return html`<article
          class="save-slot-card ${isAuto ? 'slot-auto' : ''} ${isEmpty ? 'is-empty' : 'is-filled'}"
          data-slot-id="${slot.id}"
        >
          <div class="slot-card-header">
            <div class="slot-badge-group">
              <span class="slot-tag">${slot.tag}</span>
              <strong class="slot-title">${escapeText(displayName)}</strong>
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
                      <small class="muted">保存时间：</small
                      ><strong>${escapeText(dateString)}</strong>
                    </div>
                    <div class="slot-detail-row">
                      <span class="slot-meta-pill"
                        >第 ${escapeText(String(summary.chapter))} 章</span
                      >
                      <span class="slot-meta-pill"
                        >${escapeText(String(summary.characterCount))} 位角色</span
                      >
                      <span class="slot-meta-pill"
                        >${escapeText(String(summary.scriptCount))} 篇剧本</span
                      >
                    </div>
                    <div class="slot-party-preview" title="${escapeText(partyText)}">
                      <small class="muted">出战小队：</small>
                      <span>${escapeText(partyText || '未配置')}</span>
                    </div>
                  </div>`
            }
          </div>

          <div class="slot-card-actions">
            ${
              pendingImport
                ? html`<button
                    class="save-btn save-btn-import"
                    data-import-slot="${slot.id}"
                    ${mutationLocked({ allowPendingImport: true }) ? 'disabled' : ''}
                    title="将已选择的存档导入到此栏位"
                  >
                    ${isEmpty ? '导入到此栏位' : '覆盖导入'}
                  </button>`
                : ''
            }
            ${
              isEmpty
                ? html`<button
                    class="save-btn save-btn-create"
                    data-save-slot="${slot.id}"
                    ${locked ? 'disabled' : ''}
                    title="${lockedReason || '将当前游戏进度新建至此槽位'}"
                  >
                    ＋ 新建存档
                  </button>`
                : html`<button
                    class="save-btn save-btn-write"
                    data-save-slot="${slot.id}"
                    ${locked ? 'disabled' : ''}
                    title="${lockedReason || '将当前游戏进度覆盖存入此槽位'}"
                  >
                    覆盖保存
                  </button>`
            }
            <button
              class="save-btn save-btn-load"
              data-load-slot="${slot.id}"
              ${isEmpty || locked ? 'disabled' : ''}
              title="${lockedReason || '读取此槽位存档并恢复游戏'}"
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
                    class="save-btn save-btn-rename"
                    data-rename-slot="${slot.id}"
                    ${locked ? 'disabled' : ''}
                    title="${lockedReason || '重命名此槽位存档'}"
                  >
                    重命名
                  </button>`
                : ''
            }
            ${
              !isEmpty
                ? html`<button
                    class="save-btn save-btn-clear"
                    data-clear-slot="${slot.id}"
                    ${locked ? 'disabled' : ''}
                    title="${lockedReason || '清空此槽位记录'}"
                  >
                    清空
                  </button>`
                : ''
            }
          </div>
        </article>`;
      })
      .join('');
  }

  function setPage(index) {
    if (!Number.isInteger(index) || index < 0 || index >= SAVE_PAGE_COUNT) return false;
    page = index;
    renderDialog();
    return true;
  }

  function getPage() {
    return page;
  }

  function getPendingImport() {
    return pendingImport ? pendingImport.snapshot : null;
  }

  function cancelImport() {
    if (!pendingImport && !importing) return false;
    importSequence += 1;
    importing = false;
    pendingImport = null;
    importMessage = '';
    renderDialog();
    return true;
  }

  function open() {
    if ($('#saves-dialog')?.open) {
      renderDialog();
      return;
    }
    importSequence += 1;
    importing = false;
    pendingImport = null;
    importMessage = '';
    store = loadSavesStore(storage);
    renderDialog();
    const dialog = $('#saves-dialog');
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  function close({ preserveImport = false } = {}) {
    if (!preserveImport) {
      importSequence += 1;
      importing = false;
      pendingImport = null;
      importMessage = '';
    }
    const dialog = $('#saves-dialog');
    if (dialog && dialog.open) {
      dialog.close();
    }
    renderImportStatus();
  }

  async function saveSlot(slotId, note = '') {
    const locked = mutationLocked();
    if (locked) return context.shell?.toast?.(locked);
    if (!SAVE_SLOT_IDS.includes(slotId)) return false;
    if (session.runtime.needsStart) return context.shell.toast('请先创建并确认主角，再保存冒险');
    const slotConfig = SAVE_SLOTS.find((s) => s.id === slotId);
    if (!slotConfig) return false;
    const snapshot = createSaveSnapshot(session, slotId, note);
    try {
      await updatedStore((next) => {
        const existing = next.slots[slotId];
        if (existing && existing.name) snapshot.name = existing.name;
        next.slots[slotId] = snapshot;
      });
    } catch (failure) {
      context.shell?.toast?.(`保存失败: ${failure.message}`);
      return false;
    }
    renderDialog();
    context.shell?.toast?.(`已覆盖保存至 [${slotConfig.label}]`);
    return true;
  }

  function loadSlot(slotId) {
    const locked = mutationLocked();
    if (locked) return context.shell?.toast?.(locked);
    if (!SAVE_SLOT_IDS.includes(slotId)) return false;
    const slotConfig = SAVE_SLOTS.find((s) => s.id === slotId);
    const snapshot = store.slots[slotId];
    if (!snapshot) {
      context.shell?.toast?.(`[${slotConfig?.label || slotId}] 暂无存档记录`);
      return false;
    }
    try {
      applySaveSnapshot(context, snapshot);
      close();
      context.shell?.toast?.(`已成功载入 [${slotConfig?.label || slotId}] 存档！`);
      return true;
    } catch (err) {
      context.shell?.toast?.(`载入失败: ${err.message}`);
      return false;
    }
  }

  async function clearSlot(slotId) {
    const locked = mutationLocked();
    if (locked) return context.shell?.toast?.(locked);
    if (!SAVE_SLOT_IDS.includes(slotId)) return false;
    const slotConfig = SAVE_SLOTS.find((s) => s.id === slotId);
    try {
      await updatedStore((next) => {
        next.slots[slotId] = null;
      });
    } catch (failure) {
      context.shell?.toast?.(`清空失败: ${failure.message}`);
      return false;
    }
    renderDialog();
    context.shell?.toast?.(`已清空 [${slotConfig?.label || slotId}] 记录`);
    return true;
  }

  async function renameSlot(slotId, name) {
    const locked = mutationLocked();
    if (locked) {
      context.shell?.toast?.(locked);
      return false;
    }
    if (!SAVE_SLOT_IDS.includes(slotId)) return false;
    if (!store.slots[slotId]) return false;
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (!trimmed) {
      context.shell?.toast?.('存档名称不能为空');
      return false;
    }
    if (Array.from(trimmed).length > 24) {
      context.shell?.toast?.('存档名称不能超过 24 个字符');
      return false;
    }
    try {
      await updatedStore((next) => {
        const target = next.slots[slotId];
        if (!target) return;
        target.name = trimmed;
      });
    } catch (failure) {
      context.shell?.toast?.(`重命名失败: ${failure.message}`);
      return false;
    }
    renderDialog();
    context.shell?.toast?.(`已重命名 [${slotLabel(slotId)}]`);
    return true;
  }

  async function exportSlot(slotId) {
    const snapshot = store.slots[slotId];
    if (!snapshot) {
      reportImportStatus('该槽位为空，无法导出');
      return;
    }
    try {
      await exportSnapshotToFile(snapshot);
      reportImportStatus('存档文件导出完成');
    } catch (failure) {
      reportImportStatus(`导出失败: ${failure.message}`);
    }
  }

  async function exportCurrent() {
    if (session.runtime.needsStart) return context.shell.toast('请先完成主角创建');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateTag = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    try {
      const snapshot = createSaveSnapshot(session, 'live', '实时进度导出');
      await exportSnapshotToFile(snapshot, `wanxiang-live-save-${dateTag}.json`);
      reportImportStatus('实时进度已导出为 JSON 文件');
    } catch (failure) {
      reportImportStatus(`导出失败: ${failure.message}`);
    }
  }

  async function importFromFile(file) {
    const locked = mutationLocked();
    if (locked) {
      reportImportStatus(locked);
      return false;
    }
    const request = ++importSequence;
    importMessage = '';
    importing = true;
    renderDialog();
    const runtimeToken = session.runtime.token;
    const library = session.ai.library;
    const mode = session.runtime.mode;
    const battleState = session.battle.state;
    const stillCurrent = () =>
      !disposed &&
      request === importSequence &&
      session.runtime.token === runtimeToken &&
      session.ai.library === library &&
      session.runtime.mode === mode &&
      session.battle.state === battleState &&
      !session.battle.playing &&
      !session.ai.busy;
    try {
      const snapshot = await readSaveFile(
        file,
        context.apiClient?.staticMode
          ? (dataUrl) => context.apiClient.request('portrait/save', { dataUrl })
          : undefined,
      );
      if (!stillCurrent()) throw new Error('导入期间游戏状态已改变，已取消载入');
      const staged = structuredClone(snapshot);
      pendingImport = {
        snapshot: staged,
        filename: file?.name || '存档文件',
        sourceSlotId: snapshot.slotId || null,
        runtimeToken,
        library,
        mode,
        battleState,
      };
      const dialog = $('#saves-dialog');
      if (dialog && !dialog.open) dialog.showModal();
      renderDialog();
      context.shell?.toast?.('请选择要导入的栏位');
      return true;
    } catch (err) {
      if (!disposed && request === importSequence) reportImportStatus(`导入失败: ${err.message}`);
      return false;
    } finally {
      if (request === importSequence) importing = false;
      if (!disposed) renderDialog();
    }
  }

  async function importToSlot(slotId) {
    if (disposed) return false;
    if (!pendingImport) {
      reportImportStatus('请先选择要导入的存档文件');
      return false;
    }
    if (!SAVE_SLOT_IDS.includes(slotId)) {
      reportImportStatus('无效的目标栏位，请重新选择');
      return false;
    }
    const locked = mutationLocked({ allowPendingImport: true });
    if (locked) {
      reportImportStatus(locked);
      return false;
    }
    const staged = pendingImport;
    const stillCurrent = () =>
      !disposed &&
      pendingImport === staged &&
      session.runtime.token === staged.runtimeToken &&
      session.ai.library === staged.library &&
      session.runtime.mode === staged.mode &&
      session.battle.state === staged.battleState &&
      !session.battle.playing &&
      !session.ai.busy;
    if (!stillCurrent()) {
      pendingImport = null;
      renderDialog();
      reportImportStatus('导入期间游戏状态已改变，已取消导入，请重新选择存档文件');
      return false;
    }

    const latestStore = loadSavesStore(storage);
    const occupant = latestStore.slots[slotId];
    if (occupant) {
      const occupantName = occupant.name || slotLabel(slotId);
      const confirmed = globalThis.confirm(
        `栏位 [${slotLabel(slotId)}] 已有存档「${occupantName}」，导入将覆盖且无法恢复，是否继续？`,
      );
      if (!confirmed) {
        reportImportStatus('已取消覆盖，可选择其他栏位或重试');
        return false;
      }
    }

    const targetRaw = JSON.stringify(occupant ?? null);
    const request = ++importSequence;
    importMessage = '';
    importing = true;
    const guard = () =>
      !disposed &&
      request === importSequence &&
      pendingImport === staged &&
      session.runtime.token === staged.runtimeToken &&
      session.ai.library === staged.library &&
      session.runtime.mode === staged.mode &&
      session.battle.state === staged.battleState &&
      !session.battle.playing &&
      !session.ai.busy;

    try {
      const snapshot = structuredClone(staged.snapshot);
      snapshot.slotId = slotId;
      const name = normalizeSaveName(snapshot.name);
      if (name) snapshot.name = name;
      else delete snapshot.name;

      await persistStore(() => {
        const latest = loadSavesStore(storage);
        const currentOccupant = latest.slots[slotId];
        if (JSON.stringify(currentOccupant ?? null) !== targetRaw) {
          throw new Error('目标栏位已被其他操作修改，请重试');
        }
        const next = structuredClone(latest);
        next.slots[slotId] = snapshot;
        return next;
      }, guard);
      if (!guard()) throw new Error('导入期间游戏状态已改变，已取消载入');
      pendingImport = null;
      renderDialog();
      reportImportStatus(`导入成功：已保存至 [${slotLabel(slotId)}]，点击该栏位的“读取”恢复游戏`);
      return true;
    } catch (err) {
      if (!disposed && request === importSequence) reportImportStatus(`导入失败: ${err.message}`);
      return false;
    } finally {
      if (request === importSequence) importing = false;
      if (!disposed) renderDialog();
    }
  }

  async function autoSave(reason = '自动保存') {
    if (
      disposed ||
      importing ||
      pendingImport ||
      $('#saves-dialog')?.dataset?.storageBusy === 'true' ||
      session.runtime?.disposed ||
      session.battle?.playing ||
      session.runtime.needsStart
    )
      return;
    const snapshot = createSaveSnapshot(session, 'auto', reason);
    if (
      session.runtime.mode !== 'inn' &&
      session.journey.expedition?.adventure &&
      !snapshot.data.adventure
    )
      return;
    try {
      await updatedStore((next) => {
        const existing = next.slots.auto;
        if (existing && existing.name) snapshot.name = existing.name;
        next.slots.auto = snapshot;
      });
      const dialog = $('#saves-dialog');
      if (dialog && dialog.open) renderDialog();
      return true;
    } catch (failure) {
      if (!disposed) context.shell?.toast?.(`自动保存失败: ${failure.message}`);
      return false;
    }
  }

  async function createNewSave(preferredSlotId = null) {
    const locked = mutationLocked();
    if (locked) return context.shell?.toast?.(locked);
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
      const saved = await saveSlot(targetId, isOverwriting ? '覆盖保存' : '新建存档');
      if (saved) {
        const targetIndex = SAVE_SLOTS.findIndex((s) => s.id === targetId);
        if (targetIndex >= 0) {
          const targetPage = Math.floor(targetIndex / SAVE_PAGE_SIZE);
          if (targetPage !== page) setPage(targetPage);
        }
        if (!isOverwriting)
          context.shell?.toast?.(`已成功新建存档至 [${slotConfig?.label || targetId}]！`);
      }
      return saved;
    }

    const cards = document.querySelectorAll('#saves-slots-list .save-slot-card');
    clearTimeout(highlightTimer);
    cards.forEach((c) => c.classList.add('slot-highlight'));
    highlightTimer = setTimeout(() => {
      highlightTimer = null;
      cards.forEach((c) => c.classList.remove('slot-highlight'));
    }, 1800);
    context.shell?.toast?.('手动存档位已满（共19个位置），请点击下方目标槽位的“覆盖保存”');
  }

  function startNewAdventure() {
    const locked = mutationLocked();
    if (locked) return context.shell?.toast?.(locked);
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
    events.on(dialog, 'cancel', () => {
      importSequence += 1;
      importing = false;
      pendingImport = null;
      importMessage = '';
      renderImportStatus();
    });
    events.on(dialog, 'close', () => {
      if (dialog.open) return;
      importSequence += 1;
      importing = false;
      pendingImport = null;
      importMessage = '';
      renderImportStatus();
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

  const prevPageBtn = $('#saves-prev-page');
  if (prevPageBtn) {
    events.on(prevPageBtn, 'click', () => setPage(page - 1));
  }

  const nextPageBtn = $('#saves-next-page');
  if (nextPageBtn) {
    events.on(nextPageBtn, 'click', () => setPage(page + 1));
  }

  const importCancelBtn = $('#saves-import-cancel');
  if (importCancelBtn) {
    events.on(importCancelBtn, 'click', () => cancelImport());
  }

  const importInput = $('#saves-import-input');
  const importButton = $('#saves-import-btn');
  if (importButton && importInput) {
    events.on(importButton, 'click', () => {
      const locked = mutationLocked();
      if (locked) reportImportStatus(locked);
      else importInput.click();
    });
  }
  if (importInput) {
    events.on(importInput, 'change', async (e) => {
      const file = e.target?.files?.[0];
      try {
        if (file) {
          await importFromFile(file);
        }
      } finally {
        importInput.value = '';
      }
    });
  }

  const slotsList = $('#saves-slots-list');
  if (slotsList) {
    events.on(slotsList, 'click', (e) => {
      const importTarget = e.target.closest('[data-import-slot]');
      if (importTarget) {
        importToSlot(importTarget.dataset.importSlot);
        return;
      }

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

      const renameSlotId = target.dataset.renameSlot;
      if (renameSlotId) {
        const existing = store.slots[renameSlotId];
        if (!existing) return;
        const currentName = existing.name || slotLabel(renameSlotId);
        const input = globalThis.prompt(
          `请输入新的存档名称（最多 24 个字符，留空或取消则不修改）：`,
          currentName,
        );
        if (input === null) return;
        renameSlot(renameSlotId, input);
        return;
      }

      const clearSlotId = target.dataset.clearSlot;
      if (clearSlotId) {
        clearSlot(clearSlotId);
        return;
      }
    });

    events.on(slotsList, 'keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const createTarget = e.target.closest('[data-create-slot]');
      if (!createTarget) return;
      e.preventDefault();
      createNewSave(createTarget.dataset.createSlot);
    });
  }

  return {
    getStore: () => store,
    open,
    close,
    saveSlot,
    loadSlot,
    clearSlot,
    renameSlot,
    exportSlot,
    exportCurrent,
    importFromFile,
    importToSlot,
    autoSave,
    createNewSave,
    startNewAdventure,
    renderDialog,
    setPage,
    getPage,
    getPendingImport,
    cancelImport,
    dispose: () => {
      disposed = true;
      importSequence += 1;
      importing = false;
      pendingImport = null;
      clearTimeout(highlightTimer);
      highlightTimer = null;
      close();
    },
  };
}
