import { createEventScope } from '../shared/events.js';
import { html } from '../shared/html.js';
import { activeModal, createPopoverSurface } from '../shared/top-layer.js';
import { developerOption } from '../generation-options.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';

const LOCKED_CLOSE_SELECTOR = [
  // Keep the preparation opener rendered for focus restoration after its modal closes.
  '#inn-backpack-open',
  '#workshop-open',
  '#generation-review',
  '#archives-open',
  '#records-open',
  '#memory-open',
  '#ledger-bookshelf-open',
  '#ledger-condenser-open',
  '#ledger-emblem-open',
  '#ledger-atlas-open',
  '#ledger-guild-open',
  '[data-daily="service"]',
  '[data-daily="promotion"]',
  '[data-daily="quests"]',
  '[data-daily="quest-step"]',
].join(',');

const OPEN_DRAG_THRESHOLD = 36;
const CLOSE_DRAG_THRESHOLD = 56;
const FLICK_VELOCITY = 0.25;
const CLOSE_ANIMATION_MS = 290;

/** Relocate a node together with its preceding DOM Comment anchor if present (e.g. latest-response). */
function moveWithAnchor(node, target) {
  if (!node || !target) return;
  const anchor = node.previousSibling?.nodeType === Node.COMMENT_NODE ? node.previousSibling : null;
  if (anchor && anchor.parentNode !== target) target.append(anchor);
  if (node.parentNode !== target) target.append(node);
}

/** Move the original button into a fixed-size action tile. */
function makeActionTile(grid, button) {
  const tile = document.createElement('div');
  tile.className = 'ledger-tile';
  if (button) moveWithAnchor(button, tile);
  grid.append(tile);
  return { tile, button };
}

/** Retain lock feedback without allocating a second line under the button. */
function setTileAvailability(entry, disabled, reason = '') {
  if (!entry?.button) return;
  entry.button.hidden = false;
  entry.button.disabled = Boolean(disabled);
  entry.tile.dataset.locked = String(Boolean(disabled));
  entry.tile.title = reason;
  entry.button.title = reason;
  if (reason) entry.button.setAttribute('aria-description', reason);
  else entry.button.removeAttribute('aria-description');
}

/** Ensure corner utility buttons render crisp line icons without visible text labels. */
function installCornerIcons({ savesBtn, audioBtn, fullscreenBtn, aiBtn }) {
  if (savesBtn) savesBtn.setAttribute('aria-label', '存档');
  if (audioBtn) audioBtn.setAttribute('aria-label', 'BGM 播放与声音设置');
  if (fullscreenBtn && !fullscreenBtn.getAttribute('aria-label'))
    fullscreenBtn.setAttribute('aria-label', '进入全屏');
  if (aiBtn) {
    aiBtn.setAttribute('aria-label', '设置');
    if (!aiBtn.getAttribute('title')) aiBtn.title = '接口与游戏设置';
  }
}

/** Right-edge slide-out parchment ledger + clean top-right stroke-icon toolbar. */
export function createLedgerSidebar(context) {
  const { session } = context;
  const events = createEventScope();
  let disposed = false;
  let isOpen = false;
  let isClosing = false;
  let cornerShown = false;
  let handleShown = false;
  let closeTimer = null;
  let restoreHandle = false;
  let preparationPortal = false;
  let reopenAfterPreparation = false;
  let cityDirectoryShown = false;
  let taskShown = false;
  let cityDirectoryWasOpen = false;
  const dailyEls = context.daily?.elements?.() || {};
  const preparation = $('#party-panel');

  const corner = document.createElement('div');
  corner.id = 'ledger-corner';
  corner.className = 'ledger-corner';
  corner.hidden = true;
  const returnTavern = $('#scene-return-tavern');
  const visitorRefresh = $('#scene-visitors-refresh');
  const savesBtn = $('#saves-open');
  const audioBtn = $('#audio-toggle');
  const fullscreenBtn = $('#fullscreen-toggle');
  const aiOpenBtn = $('#ai-open');
  installCornerIcons({ savesBtn, audioBtn, fullscreenBtn, aiBtn: aiOpenBtn });

  for (const btn of [
    returnTavern,
    visitorRefresh,
    savesBtn,
    audioBtn,
    fullscreenBtn,
    aiOpenBtn,
  ].filter(Boolean)) {
    moveWithAnchor(btn, corner);
  }
  document.body.append(corner);
  const cornerSurface = createPopoverSurface(corner);

  const handle = document.createElement('button');
  handle.id = 'ledger-handle';
  handle.type = 'button';
  handle.className = 'ledger-edge-handle';
  handle.setAttribute('aria-label', '打开掌柜账簿（点击或向左滑动）');
  handle.setAttribute('aria-controls', 'ledger-drawer');
  handle.setAttribute('aria-expanded', 'false');
  handle.title = '点击或向左拉动展开账簿';
  handle.hidden = true;
  handle.innerHTML = html`<svg viewBox="0 0 16 24" fill="none" aria-hidden="true">
      <path
        d="M10.5 6 5.5 12l5 6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      /></svg
    ><span class="ledger-handle-text">账簿</span
    ><span class="ledger-handle-dot" data-ledger-badge hidden aria-hidden="true"></span>`;
  document.body.append(handle);
  const handleSurface = createPopoverSurface(handle);

  const cityDirectoryButton = document.createElement('button');
  cityDirectoryButton.id = 'ledger-city-directory-open';
  cityDirectoryButton.type = 'button';
  cityDirectoryButton.className = 'ledger-edge-handle ledger-city-directory-handle';
  cityDirectoryButton.setAttribute('aria-label', '打开城区图');
  cityDirectoryButton.setAttribute('aria-controls', 'street-city-submap');
  cityDirectoryButton.innerHTML =
    '<span aria-hidden="true">◇</span><span class="ledger-handle-text">城区图</span>';
  cityDirectoryButton.hidden = true;
  document.body.append(cityDirectoryButton);
  const directorySurface = createPopoverSurface(cityDirectoryButton);

  const taskButton = dailyEls.clockActions?.querySelector('[data-daily="quests"]') || null;
  if (taskButton) {
    taskButton.id = 'ledger-quests-open';
    taskButton.className = 'ledger-edge-handle ledger-quests-handle';
    taskButton.setAttribute('aria-label', '打开任务手记');
    taskButton.setAttribute('aria-controls', 'tavern-quests');
    taskButton.innerHTML =
      '<span aria-hidden="true">◆</span><span class="ledger-handle-text">任务</span>';
    taskButton.hidden = true;
    document.body.append(taskButton);
  }

  const taskSurface = taskButton ? createPopoverSurface(taskButton) : null;

  const host = document.createElement('div');
  host.id = 'ledger-drawer-host';
  host.className = 'ledger-drawer-host';
  host.hidden = true;
  host.innerHTML = html`<div class="ledger-backdrop" data-ledger-close></div>
    <aside id="ledger-drawer" class="ledger-drawer" aria-label="掌柜账簿" tabindex="-1">
      <header class="ledger-head">
        <div class="ledger-eyebrow-row">
          <small>WANXIANG TAVERN · LEDGER</small>
          <span class="ledger-mode-tag" data-ledger-mode>酒馆大厅</span>
          <button id="ledger-close" class="ledger-return-btn" type="button" aria-label="关闭账簿">
            <span>关闭</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m9 6 6 6-6 6"
                stroke="currentColor"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
        <div class="ledger-title-row">
          <h2>掌柜账簿</h2>
          <div class="ledger-date-meta">
            <span data-ledger-date>1463年8月24日 · 上午</span>
            <em class="ledger-rank-chip" data-ledger-rank>0 阶</em>
          </div>
        </div>
        <div class="ledger-wallet" data-ledger-wallet-slot></div>
      </header>
      <div class="ledger-scroll">
        <section class="ledger-section ledger-live-section" aria-label="当前动态与任务">
          <h3 class="ledger-section-title">眼下事务</h3>
          <div class="ledger-live-slot" data-ledger-live-slot>
            <div class="ledger-foreground-api" data-ledger-fg-api hidden></div>
          </div>
          <div class="ledger-quest-slot" data-ledger-quest-slot></div>
          <div class="ledger-invitation-slot" data-ledger-invitation-slot></div>
          <p class="ledger-empty-note" data-ledger-live-empty>眼下暂无紧急待办或后台请求。</p>
        </section>

        <section class="ledger-section" aria-label="经营与整备">
          <h3 class="ledger-section-title">经营与整备</h3>
          <div class="ledger-grid" data-ledger-main-grid></div>
        </section>

        <section class="ledger-section" aria-label="藏书与据点">
          <h3 class="ledger-section-title">藏书与据点</h3>
          <div class="ledger-grid-compact" data-ledger-archive-grid></div>
        </section>
      </div>
      <footer class="ledger-foot" data-ledger-foot>
        <button id="ledger-speed-toggle" type="button">演出倍速 · ×1</button>
        <button id="ledger-raw-btn" type="button">原始返回</button>
        <button id="ledger-retreat-btn" type="button" hidden>返回酒馆</button>
      </footer>
    </aside>`;
  document.body.append(host);
  const drawerSurface = createPopoverSurface(host);
  const drawer = host.querySelector('#ledger-drawer');
  const backdrop = host.querySelector('.ledger-backdrop');

  const walletSlot = host.querySelector('[data-ledger-wallet-slot]');
  const resources = $('#inn-resources');
  if (resources) walletSlot.append(resources);

  const serviceBtn = dailyEls.clockActions?.querySelector('[data-daily="service"]') || null;
  const promoBtn = dailyEls.clockActions?.querySelector('[data-daily="promotion"]') || null;
  const questsBtn = taskButton;
  const mealBtn = dailyEls.dock?.querySelector('[data-daily="meal"]') || null;

  const liveSlot = host.querySelector('[data-ledger-live-slot]');
  const fgApiBanner = host.querySelector('[data-ledger-fg-api]');
  const questSlot = host.querySelector('[data-ledger-quest-slot]');
  const invitationSlot = host.querySelector('[data-ledger-invitation-slot]');
  const liveEmpty = host.querySelector('[data-ledger-live-empty]');
  if (dailyEls.questHud) questSlot.append(dailyEls.questHud);
  if (dailyEls.invitationRecord) invitationSlot.append(dailyEls.invitationRecord);
  context.apiClient?.setBackgroundHost?.(liveSlot, () => sync());
  context.memory?.setNoticeHost?.(document.body, () => sync());

  const mainGrid = host.querySelector('[data-ledger-main-grid]');
  const mainTiles = {
    service: makeActionTile(mainGrid, serviceBtn),
    dining: makeActionTile(mainGrid, mealBtn),
    party: makeActionTile(mainGrid, $('#party-toggle')),
    bag: makeActionTile(mainGrid, $('#inn-backpack-open')),
    workshop: makeActionTile(mainGrid, $('#workshop-open')),
    promotion: makeActionTile(mainGrid, promoBtn),
  };

  const bookshelfBtn = document.createElement('button');
  bookshelfBtn.id = 'ledger-bookshelf-open';
  bookshelfBtn.type = 'button';
  bookshelfBtn.textContent = '酒馆手册';
  const shopBtn = document.createElement('button');
  shopBtn.id = 'ledger-shop-open';
  shopBtn.type = 'button';
  shopBtn.textContent = '药剂售货机';
  const condenserBtn = document.createElement('button');
  condenserBtn.id = 'ledger-condenser-open';
  condenserBtn.type = 'button';
  condenserBtn.textContent = '以太凝聚';
  const emblemBtn = document.createElement('button');
  emblemBtn.id = 'ledger-emblem-open';
  emblemBtn.type = 'button';
  emblemBtn.textContent = '纹章戒指';
  const atlasBtn = document.createElement('button');
  atlasBtn.id = 'ledger-atlas-open';
  atlasBtn.type = 'button';
  atlasBtn.textContent = '世界地图';
  const guildBtn = document.createElement('button');
  guildBtn.id = 'ledger-guild-open';
  guildBtn.type = 'button';
  guildBtn.textContent = '冒险者公会';

  const archiveGrid = host.querySelector('[data-ledger-archive-grid]');
  const hiddenActions = document.createElement('div');
  hiddenActions.hidden = true;
  hiddenActions.setAttribute('aria-hidden', 'true');
  for (const legacyBtn of [$('#records-open'), $('#memory-open'), bookshelfBtn].filter(Boolean)) {
    hiddenActions.append(legacyBtn);
  }
  host.append(hiddenActions);
  const archiveTiles = {
    archives: makeActionTile(archiveGrid, $('#archives-open')),
    shop: makeActionTile(archiveGrid, shopBtn),
    condenser: makeActionTile(archiveGrid, condenserBtn),
    emblem: makeActionTile(archiveGrid, emblemBtn),
    atlas: makeActionTile(archiveGrid, atlasBtn),
    guild: makeActionTile(archiveGrid, guildBtn),
  };

  const foot = host.querySelector('[data-ledger-foot]');
  const speedToggle = host.querySelector('#ledger-speed-toggle');
  const rawBtn = host.querySelector('#ledger-raw-btn');
  const retreatBtn = host.querySelector('#ledger-retreat-btn');
  const rawReviewBtn = $('#generation-review');
  if (rawReviewBtn) rawReviewBtn.hidden = true;

  function computeState() {
    const mode = session.runtime.mode;
    const inBattle =
      mode === 'battle' || mode === 'loading' || document.body.classList.contains('in-battle');
    const inEvent = mode === 'event' || document.body.classList.contains('in-adventure');
    const playingBattle = session.battle?.playing === true;
    const foregroundApiBusy =
      session.ai?.busy === true || (context.apiClient?.foregroundCount?.() || 0) > 0;
    const anyApiBusy = foregroundApiBusy || (context.apiClient?.activeCount?.() || 0) > 0;
    const needsStart = session.runtime.needsStart === true;
    const scene = context.daily?.scene?.() || 'tavern';
    const inTavernHall = !inBattle && !inEvent && !needsStart && scene === 'tavern';
    const dailyLocked = context.daily?.isLocked?.() === true;
    const dailyBusy = context.daily?.isBusy?.() === true;
    const dailyActive = Boolean(context.daily?.activeKind?.());
    const dailyUnlocked = context.daily?.unlocked?.() === true;
    return {
      mode,
      inBattle,
      inEvent,
      playingBattle,
      foregroundApiBusy,
      anyApiBusy,
      needsStart,
      scene,
      inTavernHall,
      dailyLocked,
      dailyBusy,
      dailyActive,
      dailyUnlocked,
    };
  }

  function modeTagText(state) {
    if (state.foregroundApiBusy) return '接口请求中';
    if (state.inBattle) return state.playingBattle ? '回合演出中' : '战斗备战中';
    if (state.inEvent) return '副本事件中';
    if (state.scene === 'tavern') return '酒馆大厅';
    if (['corridor', 'guest-room', 'master-bedroom'].includes(state.scene)) return '酒馆二楼';
    return '外出探索';
  }

  function finishClose() {
    clearTimeout(closeTimer);
    closeTimer = null;
    isClosing = false;
    if (disposed) return;
    host.classList.remove('is-open', 'is-closing', 'is-dragging');
    drawer.style.transform = '';
    backdrop.style.opacity = '';
    if (!isOpen) {
      host.hidden = true;
      drawerSurface.hide();
      context.memory?.setNoticeHost?.(document.body, () => sync());
    }
    syncTopLayer();
    if (restoreHandle && handleShown) {
      const focused = document.activeElement;
      if (focused === document.body || host.contains(focused)) {
        handle.focus({ preventScroll: true });
      }
    }
    restoreHandle = false;
  }

  function syncSurfaceVisibility(element, surface, currentlyShown, shouldShow, forcePromote) {
    if (!shouldShow) {
      element.hidden = true;
      if (currentlyShown) surface.hide();
      return false;
    }
    element.hidden = false;
    if (forcePromote || !currentlyShown) {
      if (currentlyShown) surface.hide();
      surface.show();
      return true;
    }
    return currentlyShown;
  }

  // A modal makes everything outside its subtree inert, including manual popovers.
  // Move the ledger into preparation only while that modal owns input.
  function syncPreparationPortal(inside) {
    if (preparationPortal === inside) return;
    clearTimeout(closeTimer);
    closeTimer = null;
    restoreHandle = false;
    drawerSurface.hide();
    handleSurface.hide();
    handleShown = false;
    if (inside) reopenAfterPreparation = isOpen;
    isOpen = !inside && reopenAfterPreparation;
    isClosing = false;
    preparationPortal = inside;
    if (!inside) reopenAfterPreparation = false;
    handle.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('ledger-open', isOpen);
    host.classList.remove('is-closing', 'is-dragging');
    host.classList.toggle('is-open', isOpen);
    drawer.style.transform = '';
    backdrop.style.opacity = '';
    (inside ? preparation : document.body).append(handle, host);
    if (isOpen) {
      queueMicrotask(() => {
        if (isOpen && !activeModal(document)) $('#party-toggle')?.focus({ preventScroll: true });
      });
    }
  }

  function syncTopLayer(forcePromote = false) {
    if (disposed) return;
    const modal = activeModal(document);
    const galEl = document.getElementById('gal-stage');
    if (
      modal &&
      document.body.classList.contains('gal-playing') &&
      (!galEl || !modal.contains(galEl))
    ) {
      context.gal?.suspendForModal?.(modal);
    }

    const theaterVisible = Boolean(document.querySelector('#chapter-theater:not([hidden])'));
    const loadingVisible = Boolean(document.querySelector('.world-loading-scene:not([hidden])'));
    const baseVisible = !session.runtime.needsStart && !modal && !theaterVisible && !loadingVisible;
    const cityMapOpen = context.daily?.cityDirectoryOpen?.() === true;
    syncPreparationPortal(Boolean(preparation?.open));
    const edgeBase =
      (baseVisible || modal === preparation) && !cityMapOpen && !isOpen && !isClosing;
    cityDirectoryShown = syncSurfaceVisibility(
      cityDirectoryButton,
      directorySurface,
      cityDirectoryShown,
      edgeBase &&
        !document.body.classList.contains('gal-playing') &&
        modal !== preparation &&
        context.daily?.cityDirectoryAvailable?.() === true,
      forcePromote,
    );
    if (taskButton) {
      taskShown = syncSurfaceVisibility(
        taskButton,
        taskSurface,
        taskShown,
        edgeBase &&
          !document.body.classList.contains('gal-playing') &&
          session.runtime.mode === 'inn',
        forcePromote,
      );
    }
    if (
      cityDirectoryWasOpen &&
      !cityMapOpen &&
      cityDirectoryShown &&
      document.activeElement?.tagName === 'IFRAME'
    ) {
      cityDirectoryButton.focus({ preventScroll: true });
    }
    cityDirectoryWasOpen = cityMapOpen;
    cornerShown = syncSurfaceVisibility(
      corner,
      cornerSurface,
      cornerShown,
      baseVisible && !cityMapOpen && !isOpen,
      forcePromote,
    );

    if (dragOpenSession?.dragging || dragCloseSession?.dragging) {
      handleShown = syncSurfaceVisibility(handle, handleSurface, handleShown, false, false);
      return;
    }

    if (isOpen || isClosing) {
      const interactive = !modal || modal === preparation;
      host.hidden = !interactive;
      if (forcePromote || isClosing || !interactive) drawerSurface.hide();
      if (interactive) drawerSurface.show();
      handleShown = syncSurfaceVisibility(handle, handleSurface, handleShown, false, false);
      return;
    }

    host.hidden = true;
    drawerSurface.hide();
    handleShown = syncSurfaceVisibility(
      handle,
      handleSurface,
      handleShown,
      (baseVisible && !cityMapOpen) || modal === preparation,
      forcePromote,
    );
  }

  function sync(forcePromote = false) {
    if (disposed) return;
    const state = computeState();
    const dateText = context.daily?.dateTimeText?.() || '1463年8月24日 · 上午';
    const rankInfo = context.daily?.promotionStatus?.();

    host.querySelector('[data-ledger-mode]').textContent = modeTagText(state);
    host.querySelector('[data-ledger-date]').textContent = dateText;
    host.querySelector('[data-ledger-rank]').textContent = `${rankInfo?.rank ?? 0} 阶`;
    const battleOrEventReason = state.inBattle
      ? '战斗中暂不可改'
      : state.inEvent
        ? '副本事件中暂不可用'
        : '';
    const apiReason = state.foregroundApiBusy ? 'AI 请求进行中' : '';
    const promoReason =
      battleOrEventReason || apiReason || (state.dailyLocked ? '行动中暂不可用' : '');
    setTileAvailability(
      mainTiles.promotion,
      Boolean(promoReason),
      promoReason || (rankInfo?.ready ? '可进阶' : ''),
    );

    const serviceReason =
      battleOrEventReason ||
      apiReason ||
      (!state.dailyUnlocked
        ? '待同伴入馆解锁'
        : !state.inTavernHall
          ? '回酒馆大厅可用'
          : state.dailyLocked || state.dailyActive
            ? '结束当前日程后可用'
            : '');
    setTileAvailability(mainTiles.service, Boolean(serviceReason), serviceReason);

    const questsReason = battleOrEventReason || apiReason || (state.dailyBusy ? '外出移动中' : '');
    if (questsBtn) {
      questsBtn.disabled = Boolean(questsReason);
      questsBtn.title = questsReason || '查看当前、可接与已完成任务';
    }
    const mealReason =
      battleOrEventReason || apiReason || (state.dailyLocked ? '行动中暂不可用' : '');
    setTileAvailability(mainTiles.dining, Boolean(mealReason), mealReason);

    const partyReason =
      battleOrEventReason ||
      (state.foregroundApiBusy && !session.ai.departureParty ? '生成中暂缓整备' : '');
    setTileAvailability(mainTiles.party, Boolean(partyReason), partyReason);

    setTileAvailability(mainTiles.bag, false, state.inBattle ? '战斗中只读' : '');

    setTileAvailability(mainTiles.workshop, state.needsStart);

    if (savesBtn) {
      const saveLocked = state.playingBattle || state.foregroundApiBusy;
      savesBtn.disabled = saveLocked;
      savesBtn.title = state.playingBattle
        ? '演出结算中暂缓读存'
        : state.foregroundApiBusy
          ? '生成中暂缓读存'
          : '打开存档管理';
    }

    setTileAvailability(archiveTiles.archives, false);
    const shopReason = battleOrEventReason || apiReason || (state.dailyBusy ? '外出移动中' : '');
    setTileAvailability(archiveTiles.shop, Boolean(shopReason), shopReason);

    const condenserReason = battleOrEventReason || apiReason;
    setTileAvailability(archiveTiles.condenser, Boolean(condenserReason), condenserReason);

    const emblemReason =
      battleOrEventReason ||
      apiReason ||
      (!state.inTavernHall ? '需在酒馆大厅查看' : state.dailyBusy ? '行动中暂不可用' : '');
    setTileAvailability(archiveTiles.emblem, Boolean(emblemReason), emblemReason);

    const atlasReason =
      battleOrEventReason ||
      apiReason ||
      (state.dailyActive && state.scene === 'tavern' ? '结束当前日程后可用' : '');
    setTileAvailability(archiveTiles.atlas, Boolean(atlasReason), atlasReason);

    const guildReason = battleOrEventReason || apiReason;
    setTileAvailability(archiveTiles.guild, Boolean(guildReason), guildReason);

    if (fgApiBanner) {
      const progressEl = $('#generation-progress');
      const apiTitle =
        progressEl && !progressEl.hidden
          ? $('#generation-title')?.textContent || 'AI 生成进行中'
          : 'AI 接口请求进行中';
      const activeCount = context.apiClient?.activeCount?.() || 0;
      fgApiBanner.hidden = !state.foregroundApiBusy;
      if (state.foregroundApiBusy) {
        fgApiBanner.innerHTML = html`<strong>${escapeText(apiTitle)}</strong
          ><small
            >当前有 ${Math.max(1, activeCount)}
            项接口正在等待返回；设置、音量与资料仍可使用。</small
          >`;
      }
    }

    const bgCount = context.apiClient?.backgroundCount?.() || 0;
    const hasMemoryNotice = context.memory?.hasNotice?.() === true;
    context.memory?.setNoticeHost?.(isOpen ? liveSlot : document.body, () => sync());
    const hasQuest = Boolean(dailyEls.questHud && !dailyEls.questHud.hidden);
    const hasInvitation = Boolean(
      dailyEls.invitationRecord &&
      !dailyEls.invitationRecord.hidden &&
      dailyEls.invitationRecord.parentElement === invitationSlot,
    );
    questSlot.hidden = !hasQuest;
    invitationSlot.hidden = !hasInvitation;
    liveSlot.hidden = !state.foregroundApiBusy && !bgCount && !hasMemoryNotice;
    liveEmpty.hidden = !questSlot.hidden || !invitationSlot.hidden || !liveSlot.hidden;

    if (speedToggle) {
      const speed = session.battle?.speed === 2 ? 2 : 1;
      speedToggle.textContent = `演出倍速 · ×${speed}`;
      speedToggle.setAttribute('aria-pressed', String(speed === 2));
    }
    if (retreatBtn) {
      const canRetreat =
        developerOption(session.ai.generationOptions, 'allowRetreat') &&
        (state.inEvent || state.inBattle);
      retreatBtn.hidden = !canRetreat;
    }
    if (foot) {
      foot.dataset.hasRetreat = retreatBtn && !retreatBtn.hidden ? 'true' : 'false';
    }

    const badge = handle.querySelector('[data-ledger-badge]');
    const needsAttention = Boolean(state.anyApiBusy || hasMemoryNotice || rankInfo?.ready);
    if (badge) {
      badge.hidden = !needsAttention;
      badge.dataset.kind = state.anyApiBusy
        ? 'api'
        : hasMemoryNotice
          ? 'memory'
          : rankInfo?.ready
            ? 'promo'
            : '';
    }

    if (visitorRefresh && corner.contains(visitorRefresh)) {
      const devMode = session.ai.generationOptions?.developerMode === true;
      const inGal = document.body.classList.contains('gal-playing');
      const available =
        visitorRefresh.dataset.available === 'true' &&
        session.runtime.mode === 'inn' &&
        !session.runtime.needsStart;
      visitorRefresh.hidden = !devMode || !available || state.inBattle || inGal;
    }

    cityDirectoryButton.setAttribute(
      'aria-expanded',
      String(context.daily?.cityDirectoryOpen?.() === true),
    );
    taskButton?.setAttribute('aria-expanded', String(Boolean(context.quests?.isOpen?.())));
    syncTopLayer(forcePromote);
  }

  function open(focusTarget = null) {
    if (disposed || session.runtime.needsStart) return;
    clearTimeout(closeTimer);
    closeTimer = null;
    restoreHandle = false;
    isClosing = false;
    isOpen = true;
    handle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('ledger-open');
    host.hidden = false;
    drawerSurface.show();
    host.classList.remove('is-closing', 'is-dragging');
    void drawer.offsetWidth;
    host.classList.add('is-open');
    drawer.style.transform = '';
    backdrop.style.opacity = '';
    sync();
    if (focusTarget === 'audio') {
      drawer.focus({ preventScroll: true });
    } else {
      drawer.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!isOpen || disposed) return;
    if (preparationPortal) reopenAfterPreparation = false;
    restoreHandle =
      document.activeElement === document.body || host.contains(document.activeElement);
    clearTimeout(closeTimer);
    isOpen = false;
    isClosing = true;
    handle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('ledger-open');
    host.classList.remove('is-dragging', 'is-open');
    host.classList.add('is-closing');
    drawer.style.transform = '';
    backdrop.style.opacity = '';
    syncTopLayer();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishClose();
    else closeTimer = setTimeout(finishClose, CLOSE_ANIMATION_MS);
  }

  events.on(drawer, 'transitionend', (event) => {
    if (event.target === drawer && event.propertyName === 'transform' && isClosing) {
      finishClose();
    }
  });

  let dragOpenSession = null;
  events.on(handle, 'pointerdown', (event) => {
    if (disposed || session.runtime.needsStart || isOpen) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearTimeout(closeTimer);
    closeTimer = null;
    isClosing = false;
    dragOpenSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startTime: performance.now(),
      pull: 0,
      width: Math.min(402, Math.max(260, window.innerWidth - 24)),
      dragging: false,
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic pointer coordinates without active capture remain supported. */
    }
  });

  events.on(handle, 'pointermove', (event) => {
    if (!dragOpenSession || event.pointerId !== dragOpenSession.pointerId) return;
    const pull = Math.max(0, dragOpenSession.startX - event.clientX);
    dragOpenSession.pull = pull;
    if (!dragOpenSession.dragging && pull < 6) return;
    if (!dragOpenSession.dragging) {
      dragOpenSession.dragging = true;
      host.hidden = false;
      drawerSurface.show();
      host.classList.remove('is-open', 'is-closing');
      host.classList.add('is-dragging');
      dragOpenSession.width = drawer.getBoundingClientRect().width || dragOpenSession.width;
    }
    const offset = Math.max(0, dragOpenSession.width - pull);
    const ratio = Math.min(1, pull / Math.max(120, dragOpenSession.width));
    drawer.style.transform = `translateX(${offset}px)`;
    backdrop.style.opacity = String(ratio);
  });

  let lastOpenDragEnd = -Infinity;
  function finishOpenDrag(event) {
    if (!dragOpenSession || event.pointerId !== dragOpenSession.pointerId) return;
    const drag = dragOpenSession;
    dragOpenSession = null;
    try {
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* Ignore release on detached handle. */
    }
    // Let the native click open on a tap. Opening on pointerup hides the handle
    // before touch browsers dispatch click, which can retarget it to the backdrop.
    if (!drag.dragging) return;
    lastOpenDragEnd = performance.now();
    const elapsed = Math.max(1, lastOpenDragEnd - drag.startTime);
    const velocity = drag.pull / elapsed;
    if (
      event.type === 'pointerup' &&
      (drag.pull >= OPEN_DRAG_THRESHOLD || (drag.pull >= 18 && velocity > FLICK_VELOCITY))
    ) {
      open();
      return;
    }
    void drawer.offsetWidth;
    isOpen = false;
    isClosing = true;
    host.classList.remove('is-dragging', 'is-open');
    host.classList.add('is-closing');
    drawer.style.transform = '';
    backdrop.style.opacity = '';
    syncTopLayer();
    closeTimer = setTimeout(finishClose, CLOSE_ANIMATION_MS);
  }

  events.on(handle, 'pointerup', finishOpenDrag);
  events.on(handle, 'pointercancel', finishOpenDrag);
  events.on(handle, 'click', (event) => {
    if (disposed || session.runtime.needsStart || isOpen) return;
    if (event.detail > 0 && performance.now() - lastOpenDragEnd < 120) return;
    open();
  });

  events.on(handle, 'keydown', (event) => {
    if (disposed || session.runtime.needsStart) return;
    if (['ArrowLeft', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (isOpen) close();
      else open();
    }
  });

  let dragCloseSession = null;
  events.on(drawer, 'pointerdown', (event) => {
    if (!isOpen || disposed) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button, input, textarea, select, a')) return;
    dragCloseSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      push: 0,
      width: drawer.getBoundingClientRect().width || 380,
      dragging: false,
      abortedVertical: false,
    };
  });

  events.on(drawer, 'pointermove', (event) => {
    if (!dragCloseSession || event.pointerId !== dragCloseSession.pointerId) return;
    if (dragCloseSession.abortedVertical) return;
    const dx = event.clientX - dragCloseSession.startX;
    const dy = Math.abs(event.clientY - dragCloseSession.startY);
    if (!dragCloseSession.dragging) {
      if (dy > 12 && dy > dx) {
        dragCloseSession.abortedVertical = true;
        return;
      }
      if (dx < 10) return;
      dragCloseSession.dragging = true;
      host.classList.remove('is-closing');
      host.classList.add('is-dragging');
      try {
        drawer.setPointerCapture(event.pointerId);
      } catch {
        /* Safe fallback if capture is unavailable. */
      }
    }
    const push = Math.max(0, dx);
    dragCloseSession.push = push;
    const ratio = Math.max(0, 1 - push / Math.max(140, dragCloseSession.width));
    drawer.style.transform = `translateX(${push}px)`;
    backdrop.style.opacity = String(ratio);
  });

  function finishCloseDrag(event) {
    if (!dragCloseSession || event.pointerId !== dragCloseSession.pointerId) return;
    const drag = dragCloseSession;
    dragCloseSession = null;
    try {
      if (drawer.hasPointerCapture?.(event.pointerId)) {
        drawer.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* Ignore release on detached drawer. */
    }
    if (!drag.dragging) return;
    const elapsed = Math.max(1, performance.now() - drag.startTime);
    const velocity = drag.push / elapsed;
    void drawer.offsetWidth;
    if (drag.push >= CLOSE_DRAG_THRESHOLD || (drag.push >= 24 && velocity > FLICK_VELOCITY)) {
      close();
      return;
    }
    host.classList.remove('is-dragging');
    host.classList.add('is-open');
    drawer.style.transform = '';
    backdrop.style.opacity = '';
  }

  events.on(drawer, 'pointerup', finishCloseDrag);
  events.on(drawer, 'pointercancel', finishCloseDrag);

  events.on(backdrop, 'pointerdown', (event) => {
    // Keep the focused drawer control until dismissal can restore the edge handle.
    if (event.pointerType === 'mouse' && event.button === 0) event.preventDefault();
  });

  let closingTrigger = null;
  events.on(
    host,
    'click',
    (event) => {
      const trigger = event.target.closest(LOCKED_CLOSE_SELECTOR);
      closingTrigger = trigger && !trigger.disabled ? trigger : null;
    },
    { capture: true },
  );
  events.on(host, 'click', (event) => {
    if (event.target.closest('[data-ledger-close], #ledger-close')) {
      closingTrigger = null;
      close();
      return;
    }
    const trigger = event.target.closest(LOCKED_CLOSE_SELECTOR);
    if (trigger && trigger === closingTrigger) {
      close();
    }
    closingTrigger = null;
  });

  events.on(cityDirectoryButton, 'click', () => {
    context.daily?.openCityDirectory?.();
  });
  events.on(shopBtn, 'click', () => {
    if (shopBtn.disabled) return;
    close();
    context.shop?.open({ vendingMachine: true });
  });
  events.on(bookshelfBtn, 'click', () => {
    close();
    context.bookshelf?.open();
  });
  events.on(condenserBtn, 'click', () => {
    if (condenserBtn.disabled) return;
    close();
    context.equipment?.openCondenser?.();
  });
  events.on(emblemBtn, 'click', () => {
    if (emblemBtn.disabled) return;
    close();
    context.emblems?.openGallery?.();
  });
  events.on(atlasBtn, 'click', () => {
    if (atlasBtn.disabled) return;
    close();
    context.daily?.openAtlas?.();
  });
  events.on(guildBtn, 'click', () => {
    if (guildBtn.disabled) return;
    close();
    context.guild?.open?.();
  });
  events.on(speedToggle, 'click', () => {
    const next = session.battle.speed === 1 ? 2 : 1;
    session.battle.speed = next;
    const battleSpeed = $('#speed');
    if (battleSpeed) battleSpeed.textContent = `演出 ×${next}`;
    sync();
  });
  events.on(rawBtn, 'click', () => {
    close();
    context.generation?.openReview?.();
  });
  events.on(retreatBtn, 'click', () => {
    close();
    context.journey?.returnInn?.();
  });

  events.on(
    window,
    'keydown',
    (event) => {
      const modal = activeModal(document);
      if (isOpen && event.key === 'Escape' && (!modal || modal === preparation)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    },
    { capture: true },
  );

  const modalObserver = new MutationObserver((mutations) => {
    if (disposed) return;
    const relevant = mutations.some(
      (mutation) =>
        (mutation.type === 'attributes' &&
          (mutation.target.nodeName === 'DIALOG' ||
            mutation.target.id === 'chapter-theater' ||
            mutation.target.classList?.contains('world-loading-scene'))) ||
        [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) => node.nodeName === 'DIALOG',
        ),
    );
    if (relevant) sync();
  });
  modalObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open', 'hidden'],
  });
  events.on(document, 'close', () => sync(), { capture: true });

  sync(true);

  return {
    open,
    close,
    isOpen: () => isOpen,
    invitationHost: () => invitationSlot,
    sync: () => sync(false),
    syncTopLayer: () => syncTopLayer(true),
    dispose() {
      disposed = true;
      clearTimeout(closeTimer);
      modalObserver.disconnect();
      events.dispose();
      document.body.classList.remove('ledger-open');
      directorySurface.hide();
      taskSurface?.hide();
      cityDirectoryButton.remove();
      taskButton?.remove();
      cornerSurface.hide();
      handleSurface.hide();
      drawerSurface.hide();
      corner.remove();
      handle.remove();
      host.remove();
    },
  };
}
