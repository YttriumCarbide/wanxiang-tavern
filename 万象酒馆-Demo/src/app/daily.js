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
import { INVITATION_SCENES, invitationExcerpt } from '../invitation.js';
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
      if (detected) return detected === 'starlamp-street' ? 'street' : detected;
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
  const talkButton = document.createElement('button');
  talkButton.id = 'scene-talk';
  talkButton.className = 'talk-open';
  talkButton.type = 'button';
  talkButton.textContent = '交流';
  talkButton.hidden = true;
  document.body.append(talkButton);
  events.on(talkButton, 'click', () => {
    const current = activeScene();
    if (
      locked ||
      session.runtime.mode !== 'inn' ||
      current === 'tavern' ||
      current.startsWith('road-')
    )
      return;
    context.chat.open(current === 'city-center' ? 'city-square' : current);
  });
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
  let talkFrame = null;
  function alignSceneTalk() {
    if (talkButton.hidden) {
      talkButton.classList.remove('is-docked');
      talkButton.style.left = '';
      talkButton.style.top = '';
      return;
    }
    const doc = frame()?.contentDocument;
    const bar = doc?.querySelector('.street-actions');
    const mapBtn = doc?.querySelector('#street-map-open');
    const barRect = bar?.getBoundingClientRect();
    const mapRect = mapBtn?.getBoundingClientRect();
    if (!barRect || !mapRect || mapRect.left - barRect.left < 60) {
      talkButton.classList.remove('is-docked');
      talkButton.style.left = '';
      talkButton.style.top = '';
      return;
    }
    talkButton.classList.add('is-docked');
    const slotWidth = Math.max(40, mapRect.left - barRect.left - 8);
    const talkHeight = talkButton.offsetHeight || Math.max(30, barRect.height - 10);
    talkButton.style.left = `${barRect.left + 4 + slotWidth / 2}px`;
    talkButton.style.top = `${barRect.top + (barRect.height - talkHeight) / 2}px`;
  }
  events.on(window, 'resize', alignSceneTalk);

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
    getScene: () => scene,
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

  function hideAtlasOverlay() {
    atlasLoading.hide();
    const el = atlasFrame();
    if (el) {
      delete el.dataset.loading;
      el.hidden = true;
    }
    mapOpen = false;
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

  function createOutingActivity(destination = state().memory?.tavernExit || 'street') {
    const entry = startTavernActivity(state(), 'outing');
    if (!entry) return null;
    entry.scene = destination;
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

  function navigate(destination) {
    visitedDiscovery = null;
    if (scene === destination && frame()?.contentDocument?.readyState === 'complete') return;
    scene = destination;
    context.chat?.leave();
    context.shell.mountInn(destination);
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
    if (entry?.kind === 'invitation' && invitation.traveling())
      return '<button type="button" data-daily="invite-end">结束约见</button>';
    if (entry?.kind === 'invitation' && entry.run?.plan)
      return '<button type="button" data-daily="resume">继续约见</button>';
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
      ? `<section><b>行程</b><p>${escapeText(OUTING_SCENES[scene] || INVITATION_SCENES[scene] || '酒馆')} → ${escapeText(INVITATION_SCENES[destination])}</p></section>`
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
    if (
      (!visible || (active()?.kind && active().kind !== 'outing')) &&
      atlasFrame() &&
      !atlasFrame().hidden
    ) {
      hideAtlasOverlay();
    }
    root.hidden = !visible || mapOpen;
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
    const destination = frame()?.contentDocument;
    const entry = active();
    const dockTalk =
      visible &&
      !home &&
      !upstairs &&
      !current.startsWith('road-') &&
      !locked &&
      !(entry?.kind === 'invitation' && entry.stage === 'running');
    destination?.body?.classList.toggle('daily-parent-dock', visible && home);
    destination?.body?.classList.toggle('street-has-talk', dockTalk);
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
          entry?.kind === 'invitation' && entry.stage === 'running' && !invitation.traveling(),
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
    if (atlasFrame() && !atlasFrame().hidden) postAtlasManaged();
    renderInvitationRecord(visible);
    if (!visible) {
      talkButton.hidden = true;
      alignSceneTalk();
      root.dataset.outdoors = 'false';
      context.ledger?.sync();
      return;
    }
    dock.hidden = !home || locked || !!entry;
    talkButton.hidden = !dockTalk;
    root.dataset.outdoors = String(dockTalk);
    alignSceneTalk();
    if (dockTalk && talkFrame === null) {
      talkFrame = requestAnimationFrame(() => {
        talkFrame = null;
        alignSceneTalk();
      });
    }
    status.innerHTML = showStatus();
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
    const candidate =
      kind === 'invitation'
        ? invitationCandidates(library()).filter(
            (member) => !entry.recruitment || member.id === entry.recruitment,
          )
        : members();
    const staffed = kind === 'service' ? Object.values(local).filter(Boolean).length : 0;
    const scrollTop =
      kind === 'service' && setup.open ? setup.querySelector('.daily-setup-body')?.scrollTop : 0;
    let statusLine = message;
    let body;
    if (kind === 'service') {
      const menus = defaultHubMenus(state().serviceGrowth, library().dining.inventory);
      body = serviceSetupView({
        library: library(),
        growth: state().serviceGrowth,
        members: candidate,
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
        <div class="daily-people">${candidate
          .filter((member) => member.id !== library().campaign?.protagonistId)
          .map((member) => chooseMember(member, local.companions.includes(member.id)))
          .join('')}</div>`;
    } else {
      const member = candidate.find((item) => item.id === local.member);
      const topics = invitation.topics(member?.id);
      body = `<div class="daily-invite-slot"><small>约见对象</small><strong>${escapeText(member?.setting.name || '选一位角色')}</strong>
        ${member ? `<span>${affectionLabel(relationship(library(), member.id).affection)}</span>` : ''}</div>
        <div class="daily-people">${candidate.map((person) => chooseMember(person, person.id === local.member)).join('')}</div>
        <div class="daily-options">${Object.entries(INVITATION_ACTIVITIES)
          .map(
            ([id, title]) =>
              `<button type="button" data-daily-activity="${id}" aria-pressed="${id === local.activity && !local.topic}">${title}</button>`,
          )
          .join('')}</div>
        ${
          topics.length
            ? `<h3>可约见的主题</h3><div class="daily-options daily-topics">${topics
                .map(
                  (topic, index) =>
                    `<button type="button" data-daily-topic="${index}" aria-pressed="${topic === local.topic}">${escapeText(topic)}</button>`,
                )
                .join('')}</div>`
            : ''
        }`;
    }
    setup.innerHTML = `<header><div><small>${dailyDateTimeText(state())}</small><h2 id="daily-setup-title">${DAILY_ACTIONS[kind].name}整备</h2></div>
      <button type="button" data-daily-close ${invitation.busy() ? 'disabled' : ''}>收起</button></header>
      <div class="daily-setup-body">${body}</div><footer><p role="status">${escapeText(statusLine)}</p>
        <button type="button" class="daily-confirm" data-daily-start ${invitation.busy() || (kind === 'service' && staffed < 4) ? 'disabled' : ''}>
          ${invitation.busy() ? '正在生成约见…' : kind === 'service' ? '开班营业' : kind === 'outing' ? '保存同行' : '开始约见'}
        </button></footer>`;
    if (scrollTop) setup.querySelector('.daily-setup-body').scrollTop = scrollTop;
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
      local = {
        member: entry.recruitment || memory.member || '',
        activity: memory.activity || 'talk',
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
      navigate(entry.scene || 'street');
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
      if (!invitationCandidates(library()).some((candidate) => candidate.id === member))
        throw Error('先选择一位约见对象');
      const { activity, topic } = local;
      const playerIntent = await intent.ask('约见准备', topic || INVITATION_ACTIVITIES[activity]);
      if (playerIntent === null || active() !== entry) return;
      state().memory.invitation = { member, activity };
      const task = invitation.start({ member, activity, topic, playerIntent }, () => setup.close());
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

  function beginOuting(openMap = false, destination = 'street') {
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
          const unlocked = id === 'street' || state().unlocks.silverCrownTavern === true;
          return `<button type="button" data-tavern-exit="${id}" ${unlocked ? '' : 'disabled'}><b>${name}</b>
          <span>${id === 'street' ? '酒馆街角' : unlocked ? '黄铜星门庭' : '从黄铜星门庭进入酒馆后开启'}</span></button>`;
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
      message = '';
      showSetup();
    } catch (failure) {
      message = failure.message;
      if (setup.open) showSetup();
    }
  });
  events.on(setup, 'cancel', (event) => {
    if (invitation.busy()) event.preventDefault();
  });
  events.on(window, 'message', (event) => {
    if (event.origin !== location.origin) return;
    const fromAtlas = Boolean(
      atlasFrame()?.contentWindow && event.source === atlasFrame().contentWindow,
    );
    if (fromAtlas) {
      if (event.data?.type === 'atlas-only-ready') {
        const el = atlasFrame();
        if (el) delete el.dataset.loading;
        atlasLoading.hide();
        return postAtlasManaged(event.source);
      }
      if (event.data?.type === 'daily-outing-companions') return editOutingCompanions();
      if (event.data?.type === 'street-map-state') {
        mapOpen = event.data.open === true;
        if (!mapOpen) {
          hideAtlasOverlay();
          if (event.data.choice === 'walk') {
            beginOuting(false, state().memory?.tavernExit || 'street');
          }
        }
        return render();
      }
      if (event.data?.type === 'daily-overland-plan') {
        const destination = state().memory?.tavernExit || 'street';
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
    if (event.data?.type === 'daily-open-guild') return context.guild?.open?.();
    if (event.data?.type === 'daily-open-dungeon' && typeof event.data.dungeonId === 'string') {
      const dungeonId = event.data.dungeonId;
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
    if (event.data?.type === 'street-map-state') {
      mapOpen = event.data.open === true;
      if (!mapOpen && active()?.preview && event.data.choice !== 'route') {
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
      if (invitation.traveling()) return navigate('street');
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
      context.shell.toast('先完成眼下这段对话，换地方时手记会提示。');
      return;
    }
    if (event.data?.type !== 'scene-ready') return;
    mapOpen = false;
    scene = event.data.scene === 'starlamp-street' ? 'street' : event.data.scene;
    if (session.runtime.mode === 'inn') context.audio?.setScene?.(locationMusic(scene));
    if (event.data.title) sceneTitles.set(scene, event.data.title);
    if (scene === 'street') context.onboarding?.streetEntered?.();
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
      if (entry?.kind === 'invitation' && Object.hasOwn(OUTING_SCENES, entry.run?.scene))
        navigate(entry.run.scene);
      else if (entry && entry.kind !== 'invitation') queueMicrotask(launch);
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
      return Object.hasOwn(SILVER_CROWN_PLACES, current)
        ? '银冠城的地图自由探索。只回应眼前的交谈，不改变任务、战斗、装备或奖励。'
        : current !== 'tavern' && Object.hasOwn(TOWN_SCENES, current)
          ? '星钟城的地图自由探索。只回应眼前的交谈，不改变任务、战斗、装备或奖励。'
          : '';
    },
    goHome: () => navigate('tavern'),
    openAtlas() {
      const entry = active();
      if (entry?.kind === 'outing' && entry.stage === 'roaming') {
        frame()?.contentWindow?.postMessage({ type: 'daily-open-atlas' }, location.origin);
        return true;
      }
      if (!entry && !travel.busy()) {
        const originScene = state().memory?.tavernExit || 'street';
        const href =
          originScene === 'street'
            ? './street.html?atlas-only=1'
            : `./street.html?scene=${encodeURIComponent(originScene)}&atlas-only=1`;
        let el = atlasFrame();
        const host = document.querySelector('#inn') || document.body;
        if (!el) {
          el = document.createElement('iframe');
          el.id = 'daily-atlas-frame';
          el.title = '世界地图';
          el.setAttribute('allowtransparency', 'true');
          host.append(el);
        } else if (el.parentElement !== host) {
          host.append(el);
        }
        el.hidden = false;
        mapOpen = true;
        if (el.dataset.scene !== originScene) {
          el.dataset.loading = 'true';
          atlasLoading.show('正在展开泛生界大地图');
          el.dataset.scene = originScene;
          el.src = href;
        } else {
          delete el.dataset.loading;
          atlasLoading.hide();
          postAtlasManaged(el.contentWindow);
          el.contentWindow?.postMessage(
            { type: 'daily-open-atlas', preview: true },
            location.origin,
          );
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
      if (talkFrame !== null) cancelAnimationFrame(talkFrame);
      talkFrame = null;
      dungeonTransition.dispose();
      atlasLoading.dispose();
      atlasFrame()?.remove();
      travel.dispose();
      intent.dispose();
      promotion.remove();
      exitPicker.remove();
      recruitPanel.remove();
      talkButton.remove();
      service.dispose();
      invitation.dispose();
      record.remove();
      setup.remove();
      root.remove();
    },
  };
}
