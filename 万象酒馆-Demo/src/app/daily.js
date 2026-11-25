import { mountTavernPromotion } from './daily-promotion.js';
import { recordJourneyActivity } from '../memory.js';
import {
  DAILY_ACTIONS,
  DAILY_ROLES,
  INVITATION_ACTIVITIES,
  OUTING_ACTIONS,
  OUTING_SCENES,
  TOWN_SCENES,
  advanceOuting,
  advanceTavernTime,
  dailyCalendarDate,
  dailyDateTimeText,
  dailyUnlocked,
  startTavernActivity,
  tavernPromotion,
  tavernTime,
  finishDaily,
  serviceStaff,
} from '../daily.js';
import { settleServiceGrowth } from '../service-progression.js';
import {
  autoFillLiveHubMenu,
  defaultHubMenus,
  newLiveServiceShift,
  settleLiveServiceShift,
  toggleLiveHubDish,
  upgradeLiveFacility,
} from '../service-live.js';
import { returnServiceSpecialStock } from '../service-specials.js';
import { invitationExcerpt } from '../invitation.js';
import { affectionLabel, relationship } from '../relationships.js';
import { recruitmentStatus, RECRUITMENT_DIFFICULTY } from '../recruitment.js';
import { escapeText } from '../ui.js';
import { portraitUrl } from '../portraits.js';
import { createDailyInvitation, invitationCandidates } from './daily-invitation.js';
import { createServiceBoard } from './tavern-service.js';
import { serviceSetupView } from './service-setup-view.js';
import { createOverlandTravel } from './overland-travel.js';
import {
  SILVER_CROWN_PLACES,
  SILVER_CROWN_TAVERN,
  TAVERN_EXITS,
} from '../content/silver-crown-scenes.js';
import { townResidents } from '../town-residents.js';
import { CITIES, cityDungeons, cityFacility, cityForScene } from '../city-directory.js';
import { chatPlaceForScene } from '../chat-places.js';
import {
  availableInvitationCities,
  invitationCityVenues,
  sameCityStreet,
} from '../invitation-location.js';
import { invitationSetupView } from './invitation-setup-view.js';

import { createPlayerIntentPrompt } from './player-intent.js';
import { createWorldLoadingOverlay } from '../shared/scene-loading.js';
import { IMPERIAL_DUNGEONS } from '../content/imperial-network.js';
import { REGIONS } from '../content/regions.js';
import { unlockDungeonMap } from '../exploration.js';
import { worldRegion } from '../worlds.js';
import { learning } from '../campaign.js';
import { locationMusic } from '../audio/config.js';

export function createDaily(context) {
  const { session, events } = context;
  const SCENE_NAVIGATION_TIMEOUT_MS = 30_000;
  const library = () => session.ai.library;
  const state = () => library().daily;
  const active = () => state().active;
  const enabled = () => dailyUnlocked(library());
  const frame = () => document.querySelector('#inn-frame iframe');
  const atlasFrame = () => document.getElementById('daily-atlas-frame');
  const atlasLoading = createWorldLoadingOverlay('正在展开泛生界大地图');
  const dungeonTransition = createWorldLoadingOverlay('正在前往异境副本');
  const dungeonDisplayName = (id) =>
    IMPERIAL_DUNGEONS.find((entry) => entry.id === id)?.name ||
    worldRegion(library(), id)?.name ||
    REGIONS[id]?.name ||
    id;
  const save = () => context.generation.save();
  const root = document.createElement('section');
  root.id = 'daily-hud';
  root.hidden = true;
  root.innerHTML = `<div class="daily-top-hud">
      <div class="daily-plaque" id="hud-plaque" aria-live="polite">
        <span class="daily-place-chip" data-tavern-place>酒馆大厅</span>
        <span class="daily-clock-pill">
          <span data-tavern-clock></span>
          <em class="daily-rank-chip" data-tavern-rank>0 阶</em>
        </span>
      </div>
      <div class="daily-status" aria-live="polite"></div>
    </div>
    <aside class="daily-invitation-record" hidden aria-label="约见手记"></aside>
    <div class="daily-clock">
      <button type="button" data-daily="service">营业</button>
      <button type="button" data-daily="promotion">酒馆进阶</button>
      <button type="button" data-daily="quests">任务</button>
    </div>
    <aside class="daily-quest" hidden aria-live="polite"></aside>
    <nav class="daily-dock" aria-label="酒馆行动">
      <button type="button" data-daily="chat">闲聊</button>
      <button type="button" data-daily="meal">用餐</button>
      <button type="button" data-daily="invitation">约见</button>
      <button type="button" data-daily="dungeon">冒险</button>
      <button type="button" data-daily="outing">外出</button>
    </nav>`;
  document.body.append(root);
  const setup = document.createElement('dialog');
  setup.id = 'daily-setup';
  setup.setAttribute('aria-labelledby', 'daily-setup-title');
  document.body.append(setup);
  const dock = root.querySelector('.daily-dock');
  const placeChip = root.querySelector('[data-tavern-place]');
  const clock = root.querySelector('[data-tavern-clock]');
  const clockActions = root.querySelector('.daily-clock');
  const questHud = root.querySelector('.daily-quest');
  const rankChip = root.querySelector('[data-tavern-rank]');
  const serviceButton = clockActions.querySelector('[data-daily="service"]');
  const promoButton = clockActions.querySelector('[data-daily="promotion"]');
  const questsButton = clockActions.querySelector('[data-daily="quests"]');
  const mealButton = dock.querySelector('[data-daily="meal"]');
  const status = root.querySelector('.daily-status');
  const record = root.querySelector('.daily-invitation-record');
  const galStage = document.querySelector('#gal-stage');
  const PLACE_TITLES = Object.freeze({
    tavern: '酒馆大厅',
    corridor: '二层走廊',
    'guest-room': '二层 · 客房',
    'master-bedroom': '主卧 · 主人房',
  });
  const sceneTitles = new Map(Object.entries(PLACE_TITLES));
  let scene = 'tavern';
  let readyStreet = null;
  let navigationToken = 0;
  let pendingScene = null;
  function clearPendingScene(attempt) {
    if (!attempt) return;
    clearTimeout(attempt.timeout);
    if (pendingScene === attempt) pendingScene = null;
  }
  let visitedDiscovery = null;
  function activeScene() {
    try {
      const win = frame()?.contentWindow;
      const bodyScene = win?.document?.body?.dataset?.scene;
      const paramScene = win ? new URLSearchParams(win.location.search).get('scene') : null;
      const detected =
        bodyScene ||
        paramScene ||
        (win?.location?.pathname?.endsWith('/tavern.html')
          ? 'tavern'
          : win?.location?.pathname?.endsWith('/corridor.html')
            ? 'corridor'
            : win?.location?.pathname?.endsWith('/master-bedroom.html')
              ? 'master-bedroom'
              : win?.location?.pathname?.endsWith('/guest-room.html')
                ? 'guest-room'
                : '');
      if (detected)
        return detected === 'street' || detected === 'starlamp-street' ? 'city-center' : detected;
    } catch {
      /* Fallback to tracked scene before iframe is same-origin ready. */
    }
    return scene;
  }
  let pendingAtlas = false;
  let chatActivity = false;
  let slot = null;
  let local = {};
  let serviceDraftEntry = null;
  let serviceSelection = {};
  let message = '';
  let locked = false;
  let intro = false;
  let mapOpen = false;
  let enteringDungeon = false;
  let atlasOpening = false;
  let queuedAtlasTarget = null;
  let atlasExitAnimation = null;
  let atlasReturnFocus = null;

  async function openDungeonWithTransition(
    dungeonId,
    phaseText = '正在踏入异境入口，展开探索舆图…',
    titlePrefix = '正在前往 · ',
    beforeOpen = null,
  ) {
    if (enteringDungeon || session.runtime.disposed) return;
    enteringDungeon = true;
    try {
      await dungeonTransition.transition(`${titlePrefix}${dungeonDisplayName(dungeonId)}`, {
        phaseText,
        durationMs: 520,
        onCovered: () => {
          if (session.runtime.disposed) return;
          if (beforeOpen && beforeOpen() === false) return;
          closeMapsBehindCurtain();
          visitedDiscovery = dungeonId;
          context.destinations?.openDiscovery?.(dungeonId);
          render();
        },
      });
    } finally {
      enteringDungeon = false;
    }
  }
  async function closeDiscoveryWithTransition(performClose) {
    if (session.runtime.disposed) return;
    if (enteringDungeon) {
      performClose?.();
      return;
    }
    enteringDungeon = true;
    const placeName =
      TOWN_SCENES[activeScene()]?.title || SILVER_CROWN_PLACES[activeScene()]?.name || '万象酒馆';
    try {
      await dungeonTransition.transition(`正在返回 · ${placeName}`, {
        phaseText: '正在退出异境舆图，返回原先所在处…',
        durationMs: 420,
        onCovered: () => {
          if (session.runtime.disposed) return;
          performClose?.();
          render();
        },
      });
    } finally {
      enteringDungeon = false;
    }
  }
  const intent = createPlayerIntentPrompt(events);
  const promotion = document.createElement('dialog');
  promotion.id = 'tavern-promotion';
  document.body.append(promotion);
  const exitPicker = document.createElement('dialog');
  exitPicker.id = 'tavern-exit-picker';
  exitPicker.setAttribute('aria-label', '选择出门地点');
  document.body.append(exitPicker);
  const recruitPanel = document.createElement('dialog');
  recruitPanel.id = 'tavern-recruitment';
  document.body.append(recruitPanel);
  let recruitId = null;

  function showRecruitment(id) {
    const progress = recruitmentStatus(library(), id);
    const member = invitationCandidates(library()).find((item) => item.id === id);
    if (!progress || !member || travel.busy()) return;
    recruitId = id;
    recruitPanel.innerHTML = `<header><h2>${escapeText(member.setting.name)}</h2><button data-recruit-close aria-label="关闭">×</button></header>
      <ul><li>酒馆阶数 <b>${progress.tavern} / 2</b></li><li>好感等级 <b>${progress.affection} / 2</b></li>
      ${progress.difficulty !== 'none' ? `<li>交涉难度 <b>${RECRUITMENT_DIFFICULTY[progress.difficulty]}</b></li>` : ''}</ul>
      <button type="button" data-recruit-confirm ${progress.ready ? '' : 'disabled'}>招募</button>`;
    if (!recruitPanel.open) recruitPanel.showModal();
  }

  events.on(recruitPanel, 'click', (event) => {
    if (event.target.closest('[data-recruit-close]')) recruitPanel.close();
    if (!event.target.closest('[data-recruit-confirm]')) return;
    const id = recruitId;
    const progress = recruitmentStatus(library(), id);
    if (!progress?.ready || travel.busy()) return;
    if (progress.difficulty === 'none') {
      if (invitation.recruit(id)) recruitPanel.close();
      return;
    }
    if (active()?.kind === 'outing') complete('outing', '外出结束');
    const entry = startTavernActivity(state(), 'invitation');
    if (!entry) return;
    entry.recruitment = id;
    recruitPanel.close();
    openSetup();
  });
  function hasBlockingSceneOverlay() {
    if (mapOpen || document.body.classList.contains('gal-playing')) return true;
    if (
      document.querySelector(
        'dialog[open], .world-loading-scene:not([hidden]), .scene-loading:not(.complete):not([hidden]), #chapter-theater:not([hidden])',
      )
    )
      return true;
    const doc = frame()?.contentDocument;
    if (!doc || doc.readyState !== 'complete') return true;
    if (doc.defaultView?.modelReady !== true) return true;
    if (doc.body?.classList?.contains('leaving')) return true;
    const statusEl = doc.querySelector('#street-status');
    if (statusEl && !statusEl.classList.contains('complete') && !statusEl.hidden) return true;
    if (doc.querySelector('dialog[open]')) return true;
    return false;
  }
  function readyCity() {
    const doc = frame()?.contentDocument;
    if (doc !== readyStreet || normalizeCityScene(doc?.body?.dataset.scene) !== scene) return null;
    if (session.runtime.mode !== 'inn' || session.runtime.needsStart || session.runtime.disposed)
      return null;
    if (
      locked ||
      enteringDungeon ||
      travel.busy() ||
      (active() && active().kind !== 'outing') ||
      hasBlockingSceneOverlay()
    )
      return null;
    return cityForScene(scene);
  }

  function cityDirectoryOpen() {
    return Boolean(readyStreet?.querySelector('#street-city-submap[open]'));
  }

  function cityDirectoryAvailable() {
    return Boolean(readyCity());
  }

  function openCityDirectory() {
    if (!cityDirectoryAvailable()) return false;
    frame()?.contentWindow?.postMessage({ type: 'daily-open-city-directory' }, location.origin);
    return true;
  }

  function openCityFacility(data) {
    const cityId = readyCity();
    const legacyGuild = data.type === 'daily-open-guild';
    const facility = legacyGuild ? 'guild' : data.facility;
    const requestedCity = legacyGuild ? (data.cityId ?? data.region) : data.cityId;
    if (!cityId || !cityFacility(cityId, facility)) return;
    if (!legacyGuild && normalizeCityScene(data.scene) !== scene) return;
    if (legacyGuild && data.scene != null && normalizeCityScene(data.scene) !== scene) return;
    if (!(legacyGuild && requestedCity == null)) {
      const requested = legacyGuild && requestedCity === 'eternal-city' ? 'eternal' : requestedCity;
      if (requested !== cityId) return;
    }
    if (facility === 'blacksmith') return context.equipment?.openBlacksmith?.(cityId);
    if (facility === 'market') return context.shop?.open({ cityId });
    return context.guild?.open('bounties', { cityId });
  }

  function streetTalkPlace() {
    const entry = active();
    if (
      session.runtime.mode !== 'inn' ||
      session.runtime.needsStart ||
      session.runtime.disposed ||
      locked ||
      enteringDungeon ||
      travel.busy() ||
      !readyStreet ||
      frame()?.contentDocument !== readyStreet ||
      readyStreet.defaultView?.modelReady !== true ||
      (entry?.kind === 'invitation' && entry.stage === 'running')
    )
      return null;
    return chatPlaceForScene(activeScene());
  }

  const renderPromotion = mountTavernPromotion({ promotion, events, library, state, save });
  const service = createServiceBoard(context, (shift) => {
    if (active()?.shift !== shift || !shift.finished) return;
    locked = false;
    if (shift.mode === 'live') {
      const { reputationChange, trained, totalGold, bonusIngredients } = settleLiveServiceShift(
        library(),
        shift,
      );
      const progress = trained.map(
        ({ id, role, points }) => `${names(id)} · ${DAILY_ROLES[role]} +${points}`,
      );
      const reputation = reputationChange >= 0 ? `+${reputationChange}` : reputationChange;
      const bonusCount = Object.values(bonusIngredients || {}).reduce((s, n) => s + n, 0);
      complete(
        'service',
        [
          `本班接待 ${shift.servedCount} 桌 · 收入 ${totalGold} 金币 · ${shift.leftAngry} 桌离席 · 知名度 ${reputation}`,
          ...(bonusCount ? [`奇遇获赠食材 ×${bonusCount}`] : []),
          ...progress,
        ].join(' / '),
      );
      return;
    }
    const { reputationChange, trained } = settleServiceGrowth(state().serviceGrowth, shift);
    const returned = returnServiceSpecialStock(library().dining.inventory, shift.special);
    library().inventory.gold = Math.min(999999999, library().inventory.gold + shift.earned);
    const progress = trained.map(
      ({ id, role, points }) => `${names(id)} · ${DAILY_ROLES[role]} +${points}`,
    );
    const reputation = reputationChange >= 0 ? `+${reputationChange}` : reputationChange;
    complete(
      'service',
      [
        `本班接待 ${shift.served} 桌 · 收入 ${shift.earned} 金币 · ${shift.missed} 桌等候超时 · 知名度 ${reputation}`,
        ...(shift.special ? [`招牌上桌 ${shift.special.sold} 份 · 返还 ${returned} 份用料`] : []),
        ...progress,
      ].join(' / '),
    );
  });
  const invitation = createDailyInvitation(context, {
    getScene: activeScene,
    sceneReady: readyForInvitation,
    navigate,
    complete,
    refresh: render,
  });
  const travel = createOverlandTravel(context, {
    active,
    intent,
    scene: () => scene,
    navigate,
    save,
    render,
    spendTurns: (turns) => advanceOuting(state(), turns),
  });

  function atlasOpen(el = atlasFrame()) {
    return Boolean(el && !el.hidden && !el.inert);
  }

  function cancelAtlasExit(el) {
    const animation = atlasExitAnimation;
    atlasExitAnimation = null;
    animation?.cancel();
    if (el) delete el.dataset.closing;
  }

  function hideAtlasFrame(el) {
    el.hidden = true;
    cancelAtlasExit(el);
  }

  function restoreAtlasFocus(el, opener) {
    const focused = document.activeElement;
    if (
      focused &&
      focused !== el &&
      focused !== document.body &&
      focused !== document.documentElement
    )
      return;
    for (const target of [opener, document.getElementById('ledger-handle')]) {
      if (
        !(target instanceof HTMLElement) ||
        target === el ||
        target === document.body ||
        target === document.documentElement ||
        !target.isConnected ||
        target.matches(':disabled') ||
        target.closest('[hidden], [inert], #ledger-drawer-host:not(.is-open)') ||
        !target.getClientRects().length
      )
        continue;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
  }

  function hideAtlasOverlay({ animate = false } = {}) {
    mapOpen = false;
    atlasOpening = false;
    queuedAtlasTarget = null;
    atlasReturnFocus = null;
    atlasLoading.hide();
    const el = atlasFrame();
    if (!el) return;
    const canFade =
      animate &&
      atlasOpen(el) &&
      el.dataset.loading !== 'true' &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.activeElement === el) {
      el.contentDocument?.activeElement?.blur?.();
      el.blur();
    }
    el.inert = true;
    el.setAttribute('aria-hidden', 'true');
    if (!canFade) return hideAtlasFrame(el);

    el.dataset.closing = 'true';
    const animation = el
      .getAnimations?.()
      .find((candidate) => candidate.transitionProperty === 'opacity');
    if (!animation) return hideAtlasFrame(el);
    atlasExitAnimation = animation;
    const finish = () => {
      if (atlasExitAnimation === animation) hideAtlasFrame(el);
    };
    void animation.finished.then(finish, finish);
  }

  function closeMapsBehindCurtain() {
    hideAtlasOverlay();
    frame()?.contentWindow?.postMessage({ type: 'daily-close-atlas' }, location.origin);
    atlasFrame()?.contentWindow?.postMessage({ type: 'daily-close-atlas' }, location.origin);
  }

  function resetAtlasWalker() {
    frame()?.contentWindow?.postMessage({ type: 'daily-reset-atlas-walker' }, location.origin);
    atlasFrame()?.contentWindow?.postMessage({ type: 'daily-reset-atlas-walker' }, location.origin);
  }

  function openAtlasMap(target, { preview = false, questTarget = null } = {}) {
    if (!target) return false;
    target.postMessage({ type: 'daily-open-atlas', preview, questTarget }, location.origin);
    return true;
  }

  function postAtlasManaged(target = atlasFrame()?.contentWindow) {
    const entry = active();
    target?.postMessage(
      {
        type: 'daily-managed',
        enabled: true,
        talkVisible: false,
        timeOfDay: tavernTime(state()),
        discoveries: library().atlasDiscoveries,
        exploration: library().overlandExploration,
        skirmishes: library().skirmishes,
        unlockedDungeons: library().unlockedDungeons,
        invitation: false,
        outing: {
          turns: entry?.turns || 0,
          locked: travel.busy(),
          preview: true,
        },
      },
      location.origin,
    );
  }

  function normalizeCityScene(value) {
    return value === 'street' || value === 'starlamp-street' ? 'city-center' : value;
  }

  function createOutingActivity(
    destination = normalizeCityScene(state().memory?.tavernExit) || 'city-center',
  ) {
    const entry = startTavernActivity(state(), 'outing');
    if (!entry) return null;
    entry.scene = normalizeCityScene(destination);
    entry.stage = 'roaming';
    entry.companions = state().memory.outing?.companions || [];
    save();
    return entry;
  }

  function editOutingCompanions() {
    const opened = context.departure?.openOuting?.(() => {
      const protagonist = library().campaign?.protagonistId;
      const companions = library().party.filter((memberId) => memberId && memberId !== protagonist);
      state().memory.outing = { companions: [...companions] };
      const entry = active();
      if (entry?.kind === 'outing') entry.companions = [...companions];
      save();
      render();
    });
    if (!opened && active()) openSetup();
  }

  function readyForInvitation(destination) {
    const doc = frame()?.contentDocument;
    return Boolean(
      doc &&
      doc === readyStreet &&
      doc.defaultView?.modelReady === true &&
      !doc.body.classList.contains('leaving') &&
      sameCityStreet(doc.body.dataset.scene, destination),
    );
  }

  function navigate(destination) {
    const target = normalizeCityScene(destination);
    visitedDiscovery = null;
    const doc = frame()?.contentDocument;
    if (
      (pendingScene?.target === target &&
        pendingScene.token === navigationToken &&
        pendingScene.frame === frame()) ||
      (scene === target &&
        activeScene() === target &&
        doc?.defaultView?.modelReady === true &&
        !doc.body.classList.contains('leaving'))
    )
      return;
    clearPendingScene(pendingScene);
    const attempt = { target, token: ++navigationToken, frame: null, timeout: null };
    pendingScene = attempt;
    readyStreet = null;
    scene = target;
    context.chat?.leave();
    context.shell.mountInn(target);
    attempt.frame = frame();
    attempt.timeout = setTimeout(() => {
      if (
        navigationToken !== attempt.token ||
        pendingScene !== attempt ||
        frame() !== attempt.frame
      )
        return;
      clearPendingScene(attempt);
      const entry = active();
      if (entry?.kind === 'invitation' && entry.run?.arriving) invitation.restoreLocation();
      render();
    }, SCENE_NAVIGATION_TIMEOUT_MS);
    render();
  }

  function complete(kind, report, details) {
    const entry = active();
    if (!finishDaily(state(), kind, report, details)) return;
    if (kind === 'service' || (kind === 'outing' && !entry?.overlandReached)) {
      const place = OUTING_SCENES[entry?.scene];
      recordJourneyActivity(
        library(),
        kind,
        kind === 'outing' && place
          ? '外出走访' + place + ' · ' + (entry.turns || 0) + ' 回合'
          : report,
      );
    }
    save();
    render();
  }

  function members() {
    return library().characters;
  }

  function names(id) {
    return members().find((member) => member.id === id)?.setting.name || '选择角色';
  }

  function showReport() {
    const daily = state();
    return `<span>${escapeText(daily.report)}</span>
      <button type="button" data-daily="dismiss">收起</button>`;
  }

  function showStatus() {
    if (state().report) return showReport();
    const entry = active();
    if (entry?.kind === 'dungeon') return '';
    const current = activeScene();
    const atDungeon = IMPERIAL_DUNGEONS.find((item) => item.id === current);
    const dungeonBtn = atDungeon
      ? `<button type="button" data-daily="enter-dungeon:${escapeText(atDungeon.id)}">进入${escapeText(atDungeon.name)} ›</button>`
      : '';
    if (entry?.kind === 'outing' && entry.stage === 'roaming')
      return (
        travel.status() ||
        `${dungeonBtn}<span>外出 · 已行 <b>${entry.turns || 0}</b> 回合</span><button type="button" data-daily="companions">同行</button><button type="button" data-daily="home">结束外出</button>`
      );
    if (!entry && atDungeon) {
      return `${dungeonBtn}<button type="button" data-daily="go-tavern">返回酒馆</button>`;
    }
    if (entry?.kind === 'invitation' && invitation.traveling()) {
      const { destination, arriving } = entry.run;
      const name = invitation.placeName(destination);
      const route = invitation.constrained()
        ? `<span>${escapeText(name)}</span><button type="button" data-daily="invite-go" ${arriving ? 'disabled' : ''}>${arriving ? '前往中…' : '前往 ›'}</button>`
        : '';
      return route + '<button type="button" data-daily="invite-end">结束约见</button>';
    }
    if (entry?.kind === 'invitation' && entry.run?.plan && !invitation.presenting()) {
      return '<button type="button" data-daily="resume">继续约见</button>';
    }
    return travel.status() || dungeonBtn;
  }

  function renderInvitationRecord(visible) {
    const report = visible && state().reportDetails;
    const entry = report
      ? {
          overall: invitationExcerpt(report.premise || report.title, Infinity),
          current: invitationExcerpt(report.stages.at(-1)?.summary || '', Infinity),
        }
      : visible && invitation.brief();
    const destination = visible && active()?.run?.destination;
    const travel = destination
      ? `<section><b>行程</b><p>${escapeText(invitation.placeName(active().run.scene) || OUTING_SCENES[scene] || '酒馆')} → ${escapeText(invitation.placeName(destination))}</p></section>`
      : '';
    const fallbackHost = context.ledger?.invitationHost?.() || root;
    const host = entry && invitation.presenting() ? galStage : fallbackHost;
    if (record.parentElement !== host) host.prepend(record);
    record.hidden = !entry;
    const markup = entry
      ? `${travel}<section><b>来意</b><p>${escapeText(entry.overall)}</p></section>
        ${
          entry.current
            ? `<section><b>${report ? '结果' : '眼下'}</b><p>${escapeText(entry.current)}</p></section>`
            : ''
        }
        ${entry.tasks?.length ? `<section class="daily-invitation-tasks"><b>任务</b><ul>${entry.tasks.map(({ text, done }) => `<li>${escapeText(text)}${done ? ' <small>已完成</small>' : ''}</li>`).join('')}</ul></section>` : ''}`
      : '';
    if (record.renderedRecord !== markup) {
      record.renderedRecord = markup;
      record.innerHTML = markup;
    }
  }

  function render() {
    const running = active();
    if (running && !running.direct) {
      state().running = false;
      state().draft = [];
      state().plan = [];
      state().cursor = 0;
      if (['ready', 'setup'].includes(running.stage)) state().active = null;
      else {
        running.direct = true;
        state().period = running.at;
      }
      if (active()?.kind === 'outing') {
        running.turns = Math.max(
          0,
          running.ap * OUTING_ACTIONS - (running.remaining ?? running.ap * OUTING_ACTIONS),
        );
        delete running.remaining;
        advanceTavernTime(state(), Math.floor(running.turns / OUTING_ACTIONS));
      }
    }
    const current = activeScene();
    const visible = session.runtime.mode === 'inn' && !session.runtime.needsStart;
    const overlay = atlasFrame();
    if (
      (!visible || (active()?.kind && active().kind !== 'outing')) &&
      overlay &&
      !overlay.hidden
    ) {
      hideAtlasOverlay();
    }
    const destination = frame()?.contentDocument;
    const cityDirectoryOpen = Boolean(destination?.querySelector('#street-city-submap[open]'));
    root.hidden = !visible || mapOpen || cityDirectoryOpen;
    const home = current === 'tavern';
    const upstairs = ['corridor', 'guest-room', 'master-bedroom'].includes(current);
    const progress = tavernPromotion(state(), library().workshop);
    placeChip.textContent = sceneTitles.get(current) || OUTING_SCENES[current] || '万象酒馆';
    rankChip.textContent = `${progress.rank} 阶`;
    clock.textContent = dailyDateTimeText(state());
    const quest = context.quests?.status();
    questHud.hidden = !quest;
    questHud.innerHTML = quest
      ? `<b>${escapeText(quest.title)}</b>
      ${quest.location ? `<span>${escapeText(quest.location)}</span>` : ''}
      ${quest.action ? `<button data-daily="quest-step">${escapeText(quest.action)}</button>` : ''}`
      : '';
    if (serviceButton) serviceButton.disabled = !enabled() || !!active() || !home;
    promoButton.dataset.promotionReady = String(progress.ready);
    promoButton.title =
      progress.rank === 0
        ? progress.ready
          ? '已满足升阶条件，点击升至 1 阶'
          : `营业 ${Math.min(progress.shifts, 2)}/2 · 工坊机芯 ${Math.min(progress.cores, 10)}/10`
        : `当前酒馆 ${progress.rank} 阶`;
    const entry = active();
    const dockTalk = !mapOpen && Boolean(streetTalkPlace());
    destination?.body?.classList.toggle('daily-parent-dock', visible && home);
    frame()?.contentWindow?.postMessage(
      {
        type: 'daily-managed',
        enabled: visible,
        talkVisible: dockTalk,
        timeOfDay: visible ? tavernTime(state()) : null,
        discoveries: library().atlasDiscoveries,
        exploration: library().overlandExploration,
        skirmishes: library().skirmishes,
        unlockedDungeons: library().unlockedDungeons,
        invitation:
          entry?.kind === 'invitation' &&
          entry.stage === 'running' &&
          (invitation.constrained() || !invitation.traveling()),
        environment: visible ? invitation.streetEnvironment(current) : null,
        outing:
          visible && entry?.kind === 'outing' && entry.stage === 'roaming'
            ? {
                turns: entry.turns || 0,
                locked: travel.busy(),
                preview: entry.preview === true,
              }
            : visible && !home && !upstairs && !entry && learning(library())
              ? {
                  turns: 0,
                  locked: travel.busy(),
                  preview: false,
                  tutorialMillOnly: !library().unlockedDungeons?.includes('mill'),
                  tutorialRuinsOnly: !library().unlockedDungeons?.includes('mill'),
                }
              : null,
      },
      location.origin,
    );
    if (atlasOpen(overlay)) postAtlasManaged(overlay.contentWindow);
    renderInvitationRecord(visible);
    if (!visible) {
      root.dataset.outdoors = 'false';
      context.ledger?.sync();
      return;
    }
    dock.hidden = !home || locked || !!entry;
    root.dataset.outdoors = String(dockTalk);
    const statusMarkup = showStatus();
    if (status.renderedStatus !== statusMarkup) {
      status.renderedStatus = statusMarkup;
      status.innerHTML = statusMarkup;
    }
    status.hidden = !status.children.length;
    if (setup.open) showSetup();
    if (promotion.open) renderPromotion();
    context.ledger?.sync();
  }

  function chooseMember(member, selected) {
    return `<button type="button" class="daily-person" data-daily-person="${escapeText(member.id)}" aria-pressed="${selected}">
      <img src="${escapeText(portraitUrl(member.combat))}" alt=""><span>${escapeText(member.setting.name)}</span>
    </button>`;
  }

  function showSetup() {
    const entry = active();
    if (!entry) return;
    const kind = entry.kind;
    setup.dataset.kind = kind;
    const staffed = kind === 'service' ? Object.values(local).filter(Boolean).length : 0;
    const scrollTop = setup.open ? setup.querySelector('.daily-setup-body')?.scrollTop : 0;
    const invitationRoster = setup.querySelector('.daily-invite-roster');
    const rosterScroll = invitationRoster?.scrollTop || 0;
    const focus =
      setup.open && setup.contains(document.activeElement) ? document.activeElement : null;
    const focusAttribute =
      kind === 'invitation' && focus
        ? [...focus.attributes].find(({ name }) => name.startsWith('data-daily-'))
        : null;
    const focusKey = focusAttribute
      ? { name: focusAttribute.name, value: focusAttribute.value }
      : null;
    let statusLine = message;
    let body;
    if (kind === 'service') {
      const menus = defaultHubMenus(state().serviceGrowth, library().dining.inventory);
      body = serviceSetupView({
        library: library(),
        growth: state().serviceGrowth,
        members: members(),
        staff: local,
        slot,
        selection: serviceSelection,
        tutorial: state().tutorial === 'service',
      });
      statusLine ||=
        staffed < 4
          ? `已安排 ${staffed}/4 岗，排满后开班`
          : `四岗就绪 · 挂牌特色菜 ${menus.sigMenu.length} 道 · 基础菜 ${menus.regMenu.length} 道`;
    } else if (kind === 'outing') {
      body = `<p>选最多两位同行者，也可以独自出门。</p>
        <div class="daily-people">${members()
          .filter((member) => member.id !== library().campaign?.protagonistId)
          .map((member) => chooseMember(member, local.companions.includes(member.id)))
          .join('')}</div>`;
    } else {
      const cities = availableInvitationCities(library(), activeScene()).map((id) => {
        const venues = invitationCityVenues(library(), id);
        return {
          id,
          name: CITIES[id].name,
          image: CITIES[id].image,
          venues: {
            places: venues.filter((place) => place.category === 'places'),
            facilities: venues.filter((place) => place.category === 'facilities'),
            dungeons: venues.filter((place) => place.category === 'dungeons'),
          },
        };
      });
      if (!cities.some(({ id }) => id === local.city)) local.city = cities[0]?.id || '';
      const selectedCity = cities.find(({ id }) => id === local.city);
      const venues = selectedCity
        ? [
            ...selectedCity.venues.places,
            ...selectedCity.venues.facilities,
            ...selectedCity.venues.dungeons,
          ]
        : [];
      if (!venues.some(({ id }) => id === local.startScene)) local.startScene = venues[0]?.id || '';
      const candidates = invitationCandidates(library(), local.city).filter(
        ({ id }) => !entry.recruitment || id === entry.recruitment,
      );
      const member = candidates.find(({ id }) => id === (entry.recruitment || local.member));
      local.member = member?.id || '';
      if (!member) local.topic = '';
      const topics = invitation.topics(member?.id);
      const activityMarkup = `<div class="daily-options">${Object.entries(INVITATION_ACTIVITIES)
        .map(
          ([id, title]) =>
            `<button type="button" data-daily-activity="${id}" aria-pressed="${id === local.activity && !local.topic}">${title}</button>`,
        )
        .join('')}</div>`;
      const topicMarkup = topics.length
        ? `<div class="daily-options daily-topics" aria-label="可约见主题">${topics
            .map(
              (topic, index) =>
                `<button type="button" data-daily-topic="${index}" aria-pressed="${topic === local.topic}">${escapeText(topic)}</button>`,
            )
            .join('')}</div>`
        : '';
      body = invitationSetupView({
        cities,
        city: local.city,
        place: local.startScene,
        candidates,
        selected: local.member,
        affection: member ? affectionLabel(relationship(library(), member.id).affection) : '',
        activityMarkup,
        topicMarkup,
        intent: local.playerIntent,
      });
    }
    setup.innerHTML = `<header><div><small>${dailyDateTimeText(state())}</small><h2 id="daily-setup-title">${DAILY_ACTIONS[kind].name}整备</h2></div>
      <button type="button" data-daily-close ${invitation.busy() ? 'disabled' : ''}>收起</button></header>
      <div class="daily-setup-body">${body}</div><footer><p role="status">${escapeText(statusLine)}</p>
        <button type="button" class="daily-confirm" data-daily-start ${invitation.busy() || (kind === 'service' && staffed < 4) || (kind === 'invitation' && !local.member) ? 'disabled' : ''}>
          ${invitation.busy() ? '正在生成约见…' : kind === 'service' ? '开班营业' : kind === 'outing' ? '保存同行' : '开始约见'}
        </button></footer>`;
    if (focusKey) {
      const replacement = [...setup.querySelectorAll(`[${focusKey.name}]`)].find(
        (node) => node.getAttribute(focusKey.name) === focusKey.value,
      );
      (replacement?.disabled ? setup.querySelector('[data-daily-close]') : replacement)?.focus({
        preventScroll: true,
      });
    }
    if (scrollTop) setup.querySelector('.daily-setup-body').scrollTop = scrollTop;
    if (rosterScroll) {
      const newRoster = setup.querySelector('.daily-invite-roster');
      if (newRoster) newRoster.scrollTop = rosterScroll;
    }
  }

  function openSetup() {
    const entry = active();
    if (!entry || entry.kind === 'dungeon' || setup.open) return;
    const memory = state().memory[entry.kind] || {};
    if (entry.kind === 'service' && serviceDraftEntry !== entry) {
      serviceDraftEntry = entry;
      serviceSelection = {
        tab: 'menu',
        menuTab: state().tutorial === 'service' ? 'regular' : 'signature',
      };
      const available = new Set(members().map((member) => member.id));
      local = Object.fromEntries(
        Object.keys(DAILY_ROLES).map((role) => [
          role,
          available.has(memory[role]) ? memory[role] : '',
        ]),
      );
      if (Object.values(local).filter(Boolean).length < 4 && members().length >= 4) {
        const first = [
          ...new Set([...library().party.filter(Boolean), ...members().map((member) => member.id)]),
        ];
        const used = new Set(Object.values(local).filter(Boolean));
        for (const role of Object.keys(DAILY_ROLES)) {
          if (!local[role]) {
            const pick = first.find((id) => !used.has(id));
            if (pick) {
              local[role] = pick;
              used.add(pick);
            }
          }
        }
      }
      slot = Object.keys(DAILY_ROLES).find((key) => !local[key]) || 'cook';
    } else if (entry.kind === 'outing') {
      local = {
        companions: (memory.companions || []).filter((id) =>
          members().some((member) => member.id === id),
        ),
      };
    } else if (entry.kind === 'invitation') {
      const currentCity = cityForScene(activeScene());
      const availableCities = availableInvitationCities(library(), activeScene());
      const city =
        currentCity || (availableCities.includes(memory.city) ? memory.city : availableCities[0]);
      local = {
        member: entry.recruitment || memory.member || '',
        activity: memory.activity || 'talk',
        city,
        startScene: currentCity
          ? activeScene()
          : memory.city === city
            ? memory.startScene || ''
            : '',
        playerIntent: '',
      };
    }
    message = '';
    showSetup();
    setup.showModal();
  }

  function launch() {
    const entry = active();
    if (!entry || session.runtime.mode !== 'inn') return;
    if (entry.kind === 'service' && entry.shift) {
      locked = true;
      service.open(entry.shift);
      return render();
    }
    if (entry.kind === 'invitation' && entry.run?.plan) return invitation.resume();
    if (entry.kind === 'outing' && entry.stage === 'roaming') {
      if (travel.resume()) return;
      navigate(entry.scene || 'city-center');
      return;
    }
    if (['service', 'invitation'].includes(entry.kind) || entry.stage === 'setup') openSetup();
  }

  async function confirmSetup() {
    const entry = active();
    if (!entry || invitation.busy()) return;
    message = '';
    if (entry.kind === 'service') {
      if (entry.shift) return;
      const staff = serviceStaff(local, members());
      const tutorial = state().tutorial === 'service';
      entry.shift = newLiveServiceShift({
        library: library(),
        staff,
        day: state().day,
        growth: state().serviceGrowth,
        tutorial,
      });
      entry.stage = 'running';
      state().memory.service = { ...local };
      setup.close();
      save();
      launch();
    } else if (entry.kind === 'outing') {
      entry.companions = [...local.companions];
      state().memory.outing = structuredClone(local);
      setup.close();
      save();
      render();
    } else {
      const member = entry.recruitment || local.member;
      const { activity, topic, city, startScene } = local;
      if (!invitationCandidates(library(), city).some((candidate) => candidate.id === member))
        throw Error('先选择一位约见对象');
      const currentCity = cityForScene(activeScene());
      if (
        !availableInvitationCities(library(), activeScene()).includes(city) ||
        (currentCity && currentCity !== city) ||
        !invitationCityVenues(library(), city).some((place) => place.id === startScene)
      )
        throw Error('请选择当前可约见城市中的有效地点');
      const playerIntent = String(local.playerIntent || '')
        .trim()
        .slice(0, 2000);
      state().memory.invitation = { member, activity, city, startScene };
      const task = invitation.start(
        { member, activity, topic, playerIntent, city, startScene },
        () => setup.close(),
      );
      showSetup();
      await task;
      if (entry.run?.plan) setup.close();
      else if (setup.open) showSetup();
    }
  }

  function returnOuting() {
    if (travel.busy()) return false;
    const entry = active();
    if (entry?.kind !== 'outing' || entry.stage !== 'roaming') return false;
    complete('outing', `外出结束 · 已行 ${entry.turns || 0} 回合`);
    navigate('tavern');
    return true;
  }

  function allowDungeon() {
    const entry = active();
    return (
      !entry ||
      entry.kind === 'dungeon' ||
      (entry.kind === 'outing' && entry.stage === 'roaming' && !travel.busy())
    );
  }

  function beginOuting(openMap = false, destination = 'city-center') {
    if (active()) return;
    const entry = createOutingActivity(destination);
    if (!entry) return;
    entry.preview = openMap;
    pendingAtlas = openMap;
    save();
    navigate(entry.scene);
  }

  function openExitPicker() {
    if (active() || exitPicker.open) return;
    exitPicker.innerHTML = `<header><h2>从哪里出门</h2><form method="dialog"><button aria-label="关闭">×</button></form></header>
      <div class="tavern-exit-options">${Object.entries(TAVERN_EXITS)
        .map(([id, name]) => {
          const unlocked = id === 'city-center' || state().unlocks.silverCrownTavern === true;
          return `<button type="button" data-tavern-exit="${id}" ${unlocked ? '' : 'disabled'}><b>${name}</b>
          <span>${id === 'city-center' ? '星钟广场' : unlocked ? '黄铜星门庭' : '从黄铜星门庭进入酒馆后开启'}</span></button>`;
        })
        .join('')}</div>`;
    exitPicker.showModal();
  }
  events.on(exitPicker, 'click', (event) => {
    const button = event.target.closest('[data-tavern-exit]');
    if (!button || button.disabled || active()) return;
    const destination = button.dataset.tavernExit;
    state().memory.tavernExit = destination;
    exitPicker.close();
    beginOuting(false, destination);
  });

  function advanceTime() {
    advanceTavernTime(state());
    save();
    render();
  }

  function action(id) {
    if (id.startsWith('enter-dungeon:')) {
      const dungeonId = id.slice('enter-dungeon:'.length);
      void openDungeonWithTransition(dungeonId, '正在踏入异境入口，展开探索舆图…', '正在前往 · ');
      return;
    }
    if (id === 'go-tavern') {
      context.chat?.leave();
      navigate('tavern');
      return;
    }
    if (id.startsWith('travel:'))
      return void travel.act(id.slice(7)).catch((failure) => context.shell.toast(failure.message));
    if (id === 'promotion') {
      renderPromotion();
      return promotion.showModal();
    }
    if (id === 'quests') return context.quests?.open();
    if (id === 'quest-step') return void context.quests?.advance();
    if (id === 'chat') return context.chat.open('table', null, true);
    if (id === 'meal') {
      if (library().dining.tutorial === 'ready') return context.dining.tutorial();
      return context.dining.open('table');
    }
    if (id === 'dungeon') return context.destinations.open();
    if (id === 'outing') return openExitPicker();
    if (id === 'service' || id === 'invitation') {
      if (startTavernActivity(state(), id)) return openSetup();
    }
    if (id === 'setup' || id === 'resume') launch();
    if (id === 'companions' && active()?.kind === 'outing' && !travel.busy()) {
      editOutingCompanions();
    }
    if (id === 'invite-go') invitation.goToDestination();
    if (id === 'invite-end') invitation.endTravel();
    if (id === 'home') returnOuting();
    if (id === 'dismiss') {
      state().report = null;
      state().reportDetails = null;
      save();
    }
    render();
  }

  for (const host of [dock, status, questHud, serviceButton, promoButton, questsButton].filter(
    Boolean,
  ))
    events.on(host, 'click', (event) => {
      const button = event.target.closest('[data-daily]');
      if (button && !button.disabled) action(button.dataset.daily);
    });
  events.on(mealButton, 'click', () => {
    if (!mealButton.disabled) action('meal');
  });
  events.on(record, 'click', (event) => event.stopPropagation());
  events.on(setup, 'close', () => {
    const entry = active();
    if (entry?.direct && entry.stage === 'ready' && !invitation.busy()) {
      state().active = null;
      save();
      render();
    }
  });
  function editServiceSetup(button) {
    if (!button) return;
    const { dailyRole, dailyPerson, serviceTab, serviceMenutab, serviceDish, serviceFac } =
      button.dataset;
    if (serviceTab) {
      serviceSelection.tab = serviceTab;
    } else if (serviceMenutab) {
      serviceSelection.menuTab = serviceMenutab;
    } else if (button.hasAttribute('data-service-autofill')) {
      autoFillLiveHubMenu(library());
      save();
    } else if (serviceDish) {
      toggleLiveHubDish(library(), serviceDish);
      save();
    } else if (serviceFac) {
      upgradeLiveFacility(library(), serviceFac);
      save();
    } else if (button.hasAttribute('data-service-open-promo')) {
      renderPromotion();
      promotion.showModal();
      return;
    } else if (dailyRole) {
      slot = dailyRole;
    } else if (dailyPerson) {
      const targetRole = Object.hasOwn(DAILY_ROLES, slot) ? slot : 'cook';
      const previous = Object.keys(DAILY_ROLES).find((key) => local[key] === dailyPerson);
      if (previous && previous !== targetRole) local[previous] = local[targetRole];
      local[targetRole] = dailyPerson;
      slot = Object.keys(DAILY_ROLES).find((key) => !local[key]) || targetRole;
    } else return;
    message = '';
    showSetup();
  }

  events.on(setup, 'click', async (event) => {
    try {
      if (event.target.closest('[data-daily-close]')) {
        if (active()?.kind === 'service')
          serviceSelection.basic = Boolean(setup.querySelector('.setup-basic-menu')?.open);
        return setup.close();
      }
      if (event.target.closest('[data-daily-start]')) return await confirmSetup();
      if (active()?.kind === 'service') return editServiceSetup(event.target.closest('button'));
      if (event.target.closest('[data-daily-city], [data-daily-place], [data-daily-intent]'))
        return;
      const person = event.target.closest('[data-daily-person]');
      if (person) {
        const { dailyPerson: id } = person.dataset;
        if (active().kind === 'outing') {
          if (local.companions.includes(id))
            local.companions = local.companions.filter((key) => key !== id);
          else if (local.companions.length < 2) local.companions.push(id);
          else throw Error('最多两名同行者');
        } else if (!active().recruitment) {
          local.member = local.member === id ? '' : id;
          local.topic = '';
        }
      }
      const activity = event.target.closest('[data-daily-activity]');
      if (activity) {
        local.activity = activity.dataset.dailyActivity;
        local.topic = '';
      }
      const topic = event.target.closest('[data-daily-topic]');
      if (topic) local.topic = invitation.topics(local.member)[Number(topic.dataset.dailyTopic)];
      if (!person && !activity && !topic) return;
      message = '';
      showSetup();
    } catch (failure) {
      message = failure.message;
      if (setup.open) showSetup();
    }
  });
  events.on(setup, 'change', (event) => {
    if (active()?.kind !== 'invitation') return;
    if (event.target.matches('[data-daily-city]')) {
      local.city = event.target.value;
      local.startScene = '';
      message = '';
      showSetup();
    } else if (event.target.matches('[data-daily-place]')) {
      local.startScene = event.target.value;
      message = '';
      showSetup();
    }
  });
  events.on(setup, 'input', (event) => {
    if (active()?.kind === 'invitation' && event.target.matches('[data-daily-intent]'))
      local.playerIntent = event.target.value.slice(0, 2000);
  });
  events.on(setup, 'cancel', (event) => {
    if (invitation.busy()) event.preventDefault();
  });
  events.on(window, 'message', (event) => {
    if (event.origin !== location.origin) return;
    const overlay = atlasFrame();
    if (overlay?.contentWindow && event.source === overlay.contentWindow) {
      if (event.data?.type === 'atlas-only-ready') {
        delete overlay.dataset.loading;
        if (!atlasOpen(overlay)) return;
        atlasLoading.hide();
        context.ledger?.syncTopLayer?.();
        postAtlasManaged(event.source);
        if (queuedAtlasTarget) {
          openAtlasMap(event.source, { preview: true, questTarget: queuedAtlasTarget });
          queuedAtlasTarget = null;
        }
        return;
      }
      if (!atlasOpen(overlay)) return;
      if (event.data?.type === 'daily-outing-companions') return editOutingCompanions();
      if (event.data?.type === 'street-leaving' || event.data?.type === 'street-dialog-state')
        return render();
      if (event.data?.type === 'street-map-state') {
        if (event.data.open === true) {
          atlasOpening = false;
          mapOpen = true;
          return render();
        }
        // A close from the previous opening may arrive while a reopen is in flight.
        if (atlasOpening || overlay.contentDocument?.getElementById('street-map')?.open) return;
        const dismissal = event.data.choice === '';
        const opener = atlasReturnFocus;
        hideAtlasOverlay({ animate: dismissal });
        if (event.data.choice === 'walk') {
          beginOuting(false, normalizeCityScene(state().memory?.tavernExit) || 'city-center');
        }
        render();
        if (dismissal) restoreAtlasFocus(overlay, opener);
        return;
      }
      if (event.data?.type === 'daily-overland-plan') {
        const destination = normalizeCityScene(state().memory?.tavernExit) || 'city-center';
        return void travel.start(event.data.to, {
          fromTavern: true,
          destination,
          ensureOuting: () =>
            !enabled() && learning(library()) ? null : createOutingActivity(destination),
        });
      }
      return;
    }
    if (event.source !== frame()?.contentWindow) return;
    if (event.data?.type === 'daily-street-talk') {
      if (normalizeCityScene(event.data.scene) !== activeScene() || hasBlockingSceneOverlay())
        return;
      const place = streetTalkPlace();
      if (place) context.chat.open(place);
      return;
    }
    if (['daily-open-city-facility', 'daily-open-guild'].includes(event.data?.type))
      return openCityFacility(event.data);
    if (event.data?.type === 'daily-open-dungeon' && typeof event.data.dungeonId === 'string') {
      const { dungeonId, cityId } = event.data;
      if (readyCity() !== cityId || normalizeCityScene(event.data.scene) !== scene) return;
      if (!cityDungeons(cityId, library().atlasDiscoveries).some(({ id }) => id === dungeonId))
        return;
      unlockDungeonMap(library(), dungeonId);
      save();
      void openDungeonWithTransition(
        dungeonId,
        '正在穿过城区暗道，展开异境探索舆图…',
        '正在前往 · ',
      );
      return;
    }
    if (event.data?.type === 'tavern-recruit') return showRecruitment(event.data.characterId);
    if (event.data?.type === 'daily-outing-companions' && active()?.preview) return openSetup();
    if (event.data?.type === 'street-leaving' || event.data?.type === 'street-dialog-state')
      return render();
    if (event.data?.type === 'street-map-state') {
      const streetMapOpen = event.data.open === true;
      mapOpen = streetMapOpen || atlasOpen(overlay);
      if (!streetMapOpen && active()?.preview && event.data.choice !== 'route') {
        if (event.data.choice === 'walk') {
          delete active().preview;
          save();
        } else {
          state().active = null;
          save();
          navigate('tavern');
        }
      }
      return render();
    }
    if (event.data?.type === 'daily-overland-plan') {
      if (active()?.preview) delete active().preview;
      return void travel.start(event.data.to);
    }
    if (event.data?.type === 'daily-outing-door') {
      if (session.runtime.mode !== 'inn') return;
      if (invitation.traveling()) return navigate('city-center');
      return openExitPicker();
    }
    if (event.data?.type === 'silver-crown-tavern-enter') {
      if (
        scene !== SILVER_CROWN_TAVERN ||
        session.runtime.mode !== 'inn' ||
        travel.busy() ||
        active()?.kind !== 'outing'
      )
        return;
      const firstVisit = !state().unlocks.silverCrownTavern;
      state().unlocks.silverCrownTavern = true;
      state().memory.tavernExit = SILVER_CROWN_TAVERN;
      returnOuting();
      if (firstVisit) context.shell.toast('已开启银冠城酒馆传送点');
      return;
    }
    if (event.data?.type === 'daily-invitation-leave') {
      context.shell.toast('约见期间只能前往本幕指定地点。');
      return;
    }
    if (event.data?.type !== 'scene-ready') return;
    const currentFrame = frame();
    const readyScene = normalizeCityScene(event.data.scene);
    if (pendingScene) {
      if (pendingScene.token !== navigationToken || pendingScene.frame !== currentFrame) {
        clearPendingScene(pendingScene);
      } else if (pendingScene.target !== readyScene) {
        return;
      } else {
        clearPendingScene(pendingScene);
      }
    }
    const sourceDoc = currentFrame?.contentDocument;
    // The map can already be open when its scene finishes loading.
    mapOpen = Boolean(sourceDoc?.querySelector('#street-map[open]')) || atlasOpen(overlay);
    scene = readyScene;
    readyStreet =
      sourceDoc?.documentElement.dataset.embedded === 'true' &&
      sourceDoc.querySelector('#street-city-submap') &&
      normalizeCityScene(sourceDoc.body?.dataset.scene) === scene
        ? sourceDoc
        : null;
    if (session.runtime.mode === 'inn') context.audio?.setScene?.(locationMusic(scene));
    if (event.data.title) sceneTitles.set(scene, event.data.title);
    if (scene === 'city-center') context.onboarding?.streetEntered?.();
    if (scene === 'tavern') context.onboarding?.tavernEntered?.();
    if (pendingAtlas && scene === active()?.scene) {
      pendingAtlas = false;
      frame()?.contentWindow?.postMessage({ type: 'daily-open-atlas' }, location.origin);
    }
    if (active()?.overland) {
      void travel.arrive(scene);
      return render();
    }
    if (scene === 'tavern' || Object.hasOwn(OUTING_SCENES, scene)) invitation.arrive(scene);
    if (active()?.kind === 'outing' && active().stage === 'roaming') {
      if (scene === 'tavern') returnOuting();
      else {
        if (Object.hasOwn(OUTING_SCENES, scene) && scene !== active().scene) {
          active().scene = scene;
          advanceOuting(state());
          save();
        }
        travel.checkSkirmish?.(scene);
      }
    }
    render();
  });

  return {
    allowDungeon,
    onInvitation: () => active()?.kind === 'invitation' && active().stage === 'running',
    invitedMember: invitation.member,
    refresh: render,
    activeKind: () => active()?.kind || null,
    isLocked: () => locked,
    unlocked: enabled,
    sceneTitle: () => placeChip.textContent || '万象酒馆',
    dateLabel: () => dailyCalendarDate(state().day),
    dateTimeText: () => dailyDateTimeText(state()),
    promotionStatus: () => tavernPromotion(state(), library().workshop),
    elements: () => ({
      clockActions,
      dock,
      questHud,
      invitationRecord: record,
    }),
    returning() {
      visitedDiscovery = null;
      hideAtlasOverlay();
      service.close();
      invitation.close();
      setup.close();
      locked = false;
      scene = 'tavern';
      if (active()?.kind === 'dungeon' && active().stage === 'departed') {
        complete('dungeon', '副本远行结束 · 已结算两个时段');
        return;
      }
      const entry = active();
      const restoredCityInvitation =
        session.runtime.mode === 'inn' &&
        !session.journey.expedition &&
        entry?.kind === 'invitation' &&
        entry.run?.city &&
        entry.run?.plan;
      if (restoredCityInvitation) {
        invitation.restoreLocation();
      } else if (entry?.kind === 'invitation' && Object.hasOwn(OUTING_SCENES, entry.run?.scene)) {
        navigate(entry.run.scene);
      } else if (entry && entry.kind !== 'invitation') queueMicrotask(launch);
      render();
    },
    departed() {
      if (active()?.kind === 'outing' && active().stage === 'roaming') {
        finishDaily(state(), 'outing', `外出衔接副本 · 已行 ${active().turns || 0} 回合`);
      }
      if (!active()) startTavernActivity(state(), 'dungeon');
      if (active()?.kind !== 'dungeon') return;
      active().stage = 'departed';
      save();
      render();
    },
    allowTalk: () => true,
    trackChat(activity) {
      chatActivity = activity;
    },
    talkFinished() {
      if (advanceOuting(state())) {
        save();
        render();
      } else if (chatActivity) {
        chatActivity = false;
        advanceTime();
      }
      return false;
    },
    mealFinished: advanceTime,
    returnOuting,
    scene: () => visitedDiscovery || activeScene(),
    leaveDiscovery() {
      visitedDiscovery = null;
      render();
    },
    closeDiscoveryWithTransition,
    cityDirectoryAvailable,
    cityDirectoryOpen,
    openCityDirectory,
    chatPlace: () => chatPlaceForScene(activeScene()),
    chatPlaceLocked: () => activeScene() !== 'tavern',
    closeAtlasOverlay: closeMapsBehindCurtain,
    cancelAtlasPlan: resetAtlasWalker,
    arriveDiscovery(id) {
      void openDungeonWithTransition(id, '正在踏入异境入口，展开探索舆图…', '正在踏入 · ', () => {
        if (!returnOuting()) return false;
        return !context.quests?.arrived(id);
      });
    },
    arriveDungeon(id) {
      if (id === 'mill' || id === 'ruins') context.onboarding?.ruinsReached?.();
      void openDungeonWithTransition(id, '正在勘测遗迹入口与探索路线…', '正在抵达 · ');
    },
    overlandRun: travel.run,
    overlandDialogueScenes: travel.dialogueScenes,
    overlandDialogueContext: travel.dialogueContext,
    recordOverlandDialogue: travel.recordDialogue,
    outOfTavern: () => activeScene() !== 'tavern',
    finishOverlandBattle: travel.finishBattle,
    chatCharacters: () => {
      const current = activeScene();
      return current === 'tavern' ? [] : townResidents(library(), current);
    },
    chatEnvironment: () => {
      const current = activeScene();
      const cityId = cityForScene(current);
      if (cityId === 'silver-crown')
        return '银冠城的地图自由探索。只回应眼前的交谈，不改变任务、战斗、装备或奖励。';
      if (cityId === 'eternal')
        return '艾尔鲁斯的地图自由探索。只回应眼前的交谈，不改变任务、战斗、装备或奖励。';
      return cityId === 'starbell' && current !== 'tavern'
        ? '星钟城的地图自由探索。只回应眼前的交谈，不改变任务、战斗、装备或奖励。'
        : '';
    },
    goHome: () => navigate('tavern'),
    openAtlas(questTarget = null) {
      if (session.runtime.disposed) return false;
      const entry = active();
      if (entry?.kind === 'outing' && entry.stage === 'roaming') {
        return openAtlasMap(frame()?.contentWindow, { questTarget });
      }
      if (!entry && !travel.busy()) {
        const originScene = normalizeCityScene(state().memory?.tavernExit) || 'city-center';
        const href = `./street.html?scene=${encodeURIComponent(originScene)}&atlas-only=1`;
        let el = atlasFrame();
        const host = document.querySelector('#inn') || document.body;
        if (!el) {
          el = document.createElement('iframe');
          el.id = 'daily-atlas-frame';
          el.title = '世界地图';
          el.hidden = true;
          el.setAttribute('allowtransparency', 'true');
          host.append(el);
        } else if (el.parentElement !== host) {
          host.append(el);
        }
        if (!atlasOpen(el)) atlasReturnFocus = document.activeElement;
        cancelAtlasExit(el);
        el.inert = false;
        el.removeAttribute('aria-hidden');
        el.hidden = false;
        mapOpen = true;
        if (el.dataset.scene !== originScene) {
          el.dataset.loading = 'true';
          el.dataset.scene = originScene;
          el.src = href;
        }
        const loading = el.dataset.loading === 'true';
        atlasOpening = loading || !el.contentDocument?.getElementById('street-map')?.open;
        if (loading) {
          queuedAtlasTarget = questTarget;
          atlasLoading.show('正在展开泛生界大地图');
        } else {
          atlasLoading.hide();
          postAtlasManaged(el.contentWindow);
          openAtlasMap(el.contentWindow, { preview: true, questTarget });
        }
        render();
        return true;
      }
      return false;
    },
    outingCompanions: () => (active()?.kind === 'outing' ? active().companions : null),
    async rescued() {
      if (!enabled() || intro || state().tutorial !== 'intro') return;
      intro = true;
      try {
        await context.gal.play(
          [
            {
              speaker: '伊蒂丝',
              text: '现在我们有四个人了。酒馆可以营业了，办完一件事，时间会往后走一段。',
            },
            {
              speaker: '潘多拉',
              text: '主人，点左上角的「营业」就可以排班。我们四个人刚好一人一个岗位。',
            },
          ],
          { owner: 'daily-tutorial', title: '酒馆 · 第一天', mandatory: true },
        );
        if (!session.runtime.disposed) {
          state().tutorial = 'planning';
          save();
          render();
        }
      } finally {
        intro = false;
      }
    },
    dispose() {
      hideAtlasOverlay();
      navigationToken++;
      clearPendingScene(pendingScene);
      dungeonTransition.dispose();
      atlasLoading.dispose();
      atlasFrame()?.remove();
      travel.dispose();
      intent.dispose();
      promotion.remove();
      exitPicker.remove();
      recruitPanel.remove();
      service.dispose();
      invitation.dispose();
      record.remove();
      setup.remove();
      root.remove();
    },
  };
}
