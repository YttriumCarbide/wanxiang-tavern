import { recordJourneyActivity } from '../memory.js';
import {
  DAILY_ACTIONS,
  DAILY_PERIODS,
  DAILY_ROLES,
  INVITATION_ACTIVITIES,
  OUTING_ACTIONS,
  OUTING_SCENES,
  TOWN_SCENES,
  advanceOuting,
  advanceTavernTime,
  dailyUnlocked,
  startTavernActivity,
  tavernPromotion,
  tavernTime,
  finishDaily,
  serviceStaff,
} from '../daily.js';
import { newServiceShift } from '../tavern-service.js';
import { settleServiceGrowth } from '../service-progression.js';
import {
  reserveServiceSpecial,
  returnServiceSpecialStock,
  serviceSpecial,
  serviceSpecialCapacity,
} from '../service-specials.js';
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

export function createDaily(context) {
  const { session, events } = context;
  const library = () => session.ai.library;
  const state = () => library().daily;
  const active = () => state().active;
  const enabled = () => dailyUnlocked(library());
  const frame = () => document.querySelector('#inn-frame iframe');
  const save = () => context.generation.save();
  const root = document.createElement('section');
  root.id = 'daily-hud';
  root.hidden = true;
  root.innerHTML = `<aside class="daily-invitation-record" hidden aria-label="约见手记"></aside>
    <div class="daily-clock">
      <div class="daily-clock-pill">
        <em class="daily-rank-chip" data-tavern-rank>0 阶</em>
        <span data-tavern-clock></span>
      </div>
      <button type="button" data-daily="service">营业</button>
      <button type="button" data-daily="promotion">酒馆进阶</button>
      <button type="button" data-daily="quests">任务</button>
    </div>
    <aside class="daily-quest" hidden aria-live="polite"></aside>
    <div class="daily-status" aria-live="polite"></div>
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
  const clock = root.querySelector('[data-tavern-clock]');
  const rankChip = root.querySelector('[data-tavern-rank]');
  const promoButton = root.querySelector('[data-daily="promotion"]');
  const status = root.querySelector('.daily-status');
  const record = root.querySelector('.daily-invitation-record');
  const galStage = document.querySelector('#gal-stage');
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
        (win?.location?.pathname?.endsWith('/tavern.html') ? 'tavern' : '');
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
  function renderPromotion() {
    const progress = tavernPromotion(state(), library().workshop);
    promotion.innerHTML = `<header><h2>酒馆 · ${progress.rank} 阶</h2><button type="button" data-promotion-close aria-label="关闭">×</button></header>
      ${
        progress.rank === 0
          ? `<ul><li>完成营业 <b>${Math.min(progress.shifts, 2)} / 2</b></li>
      <li>持有工坊机芯 <b>${Math.min(progress.cores, 10)} / 10</b></li></ul>
      <button type="button" data-promotion-confirm ${progress.ready ? '' : 'disabled'}>升至 1 阶</button>`
          : '<p>下一阶目标待开放</p>'
      }`;
  }
  events.on(promotion, 'click', (event) => {
    if (event.target.closest('[data-promotion-close]')) promotion.close();
    if (
      event.target.closest('[data-promotion-confirm]') &&
      tavernPromotion(state(), library().workshop).ready
    ) {
      state().rank++;
      recordJourneyActivity(library(), 'promotion', '酒馆升至 ' + state().rank + ' 阶');
      save();
      renderPromotion();
    }
  });
  const service = createServiceBoard(context, (shift) => {
    if (active()?.shift !== shift || !shift.finished) return;
    locked = false;
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
    if (entry?.kind === 'outing' && entry.stage === 'roaming')
      return (
        travel.status() ||
        `<span>外出 · 已行 <b>${entry.turns || 0}</b> 回合</span><button type="button" data-daily="companions">同行</button><button type="button" data-daily="home">结束外出</button>`
      );
    if (entry?.kind === 'invitation' && invitation.traveling())
      return '<button type="button" data-daily="invite-end">结束约见</button>';
    if (entry?.kind === 'invitation' && entry.run?.plan)
      return '<button type="button" data-daily="resume">继续约见</button>';
    if (entry)
      return `<button type="button" data-daily="setup">${DAILY_ACTIONS[entry.kind].name}整备</button>`;
    return '';
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
    const host = entry && invitation.presenting() ? galStage : root;
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
    root.hidden = !visible || mapOpen;
    const home = current === 'tavern';
    root.dataset.outdoors = String(!home);
    const progress = tavernPromotion(state(), library().workshop);
    rankChip.textContent = `${progress.rank} 阶`;
    clock.textContent = `第 ${state().day} 天 · ${DAILY_PERIODS[state().period]}`;
    const quest = context.quests?.status();
    const questHud = root.querySelector('.daily-quest');
    questHud.hidden = !quest;
    questHud.innerHTML = quest
      ? `<b>${escapeText(quest.title)}</b>
      ${quest.location ? `<span>${escapeText(quest.location)}</span>` : ''}
      ${quest.action ? `<button data-daily="quest-step">${escapeText(quest.action)}</button>` : ''}`
      : '';
    root.querySelector('[data-daily="service"]').disabled = !enabled() || !!active() || !home;
    promoButton.dataset.promotionReady = String(progress.ready);
    promoButton.title =
      progress.rank === 0
        ? progress.ready
          ? '已满足升阶条件，点击升至 1 阶'
          : `营业 ${Math.min(progress.shifts, 2)}/2 · 工坊机芯 ${Math.min(progress.cores, 10)}/10`
        : `当前酒馆 ${progress.rank} 阶`;
    const destination = frame()?.contentDocument;
    destination?.body?.classList.toggle('daily-parent-dock', visible && home);
    const entry = active();
    frame()?.contentWindow?.postMessage(
      {
        type: 'daily-managed',
        enabled: visible,
        timeOfDay: visible ? tavernTime(state()) : null,
        discoveries: library().atlasDiscoveries,
        invitation:
          entry?.kind === 'invitation' && entry.stage === 'running' && !invitation.traveling(),
        outing:
          visible && entry?.kind === 'outing' && entry.stage === 'roaming'
            ? {
                turns: entry.turns || 0,
                locked: travel.busy(),
                preview: entry.preview === true,
              }
            : null,
      },
      location.origin,
    );
    renderInvitationRecord(visible);
    if (!visible) {
      talkButton.hidden = true;
      return;
    }
    dock.hidden = !home || locked || !!entry;
    talkButton.hidden =
      home ||
      current.startsWith('road-') ||
      locked ||
      (entry?.kind === 'invitation' && entry.stage === 'running');
    root.querySelector('.daily-clock').hidden = locked;
    status.innerHTML = showStatus();
    status.hidden = !status.children.length;
    if (setup.open) showSetup();
    if (promotion.open) renderPromotion();
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
      if (setup.open)
        serviceSelection.basic = setup.querySelector('.setup-basic-menu')?.open || false;
      body = serviceSetupView({
        growth: state().serviceGrowth,
        members: candidate,
        staff: local,
        slot,
        selection: serviceSelection,
        inventory: library().dining.inventory,
        tutorial: state().tutorial === 'service',
      });
      statusLine ||=
        staffed < 4
          ? `已安排 ${staffed}/4 岗，排满后开班`
          : `四岗就绪 · ${serviceSelection.id ? `招牌预留 ${serviceSelection.portions} 份` : '基础菜单'}`;
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
    setup.innerHTML = `<header><div><small>第 ${state().day} 天 · ${DAILY_PERIODS[state().period]}</small><h2 id="daily-setup-title">${DAILY_ACTIONS[kind].name}整备</h2></div>
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
      serviceSelection = { id: '', portions: 0, menu: false, basic: false };
      const available = new Set(members().map((member) => member.id));
      local = Object.fromEntries(
        Object.keys(DAILY_ROLES).map((role) => [
          role,
          available.has(memory[role]) ? memory[role] : '',
        ]),
      );
      if (state().tutorial === 'service' && !Object.values(local).some(Boolean)) {
        const first = [
          ...new Set([...library().party.filter(Boolean), ...members().map((member) => member.id)]),
        ].slice(0, 4);
        Object.keys(DAILY_ROLES).forEach((role, i) => (local[role] = first[i]));
      }
      slot = Object.keys(DAILY_ROLES).find((key) => !local[key]) || null;
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
      const special = tutorial
        ? null
        : reserveServiceSpecial(
            library().dining.inventory,
            serviceSelection,
            state().serviceGrowth,
          );
      entry.shift = newServiceShift(staff, tutorial, undefined, state().serviceGrowth, special);
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
    return !active() || active().kind === 'dungeon';
  }

  function beginOuting(openMap = false, destination = 'street') {
    if (active()) return;
    const entry = startTavernActivity(state(), 'outing');
    entry.scene = destination;
    entry.stage = 'roaming';
    entry.companions = state().memory.outing?.companions || [];
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
    if (id === 'outing')
      return beginOuting(
        true,
        state().unlocks.silverCrownTavern && state().memory.tavernExit === SILVER_CROWN_TAVERN
          ? SILVER_CROWN_TAVERN
          : 'street',
      );
    if (id === 'service' || id === 'invitation') {
      if (startTavernActivity(state(), id)) return openSetup();
    }
    if (id === 'setup' || id === 'resume') launch();
    if (id === 'companions' && active()?.kind === 'outing' && !travel.busy()) openSetup();
    if (id === 'invite-end') invitation.endTravel();
    if (id === 'home') returnOuting();
    if (id === 'dismiss') {
      state().report = null;
      state().reportDetails = null;
      save();
    }
    render();
  }

  events.on(root, 'click', (event) => {
    const button = event.target.closest('[data-daily]');
    if (button) action(button.dataset.daily);
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
    const { dailyRole, dailyPerson, serviceRecipe, servicePortion } = button.dataset;
    let focus;
    if (dailyRole) {
      slot = slot === dailyRole ? null : dailyRole;
      focus = `[data-daily-role="${dailyRole}"]`;
    } else if (dailyPerson && slot) {
      const previous = Object.keys(DAILY_ROLES).find((key) => local[key] === dailyPerson);
      if (previous && previous !== slot) local[previous] = local[slot];
      local[slot] = dailyPerson;
      focus = `[data-daily-role="${slot}"]`;
      slot = Object.keys(DAILY_ROLES).find((key) => !local[key]) || null;
    } else if (serviceRecipe !== undefined) {
      serviceSelection.id = serviceRecipe;
      serviceSelection.portions = serviceRecipe ? 1 : 0;
      serviceSelection.menu = false;
      focus = '[data-service-recipes]';
    } else if (servicePortion) {
      const capacity = serviceSpecialCapacity(
        serviceSpecial(serviceSelection.id, state().serviceGrowth),
        library().dining.inventory,
      );
      serviceSelection.portions = Math.max(
        1,
        Math.min(capacity, serviceSelection.portions + Number(servicePortion)),
      );
      focus = `[data-service-portion="${servicePortion}"]`;
    } else if (button.hasAttribute('data-service-recipes')) {
      serviceSelection.menu = !serviceSelection.menu;
      focus = '[data-service-recipes]';
    } else return;
    message = '';
    showSetup();
    const next = setup.querySelector(focus);
    (next?.disabled ? setup.querySelector('[data-service-portion]:enabled') : next)?.focus({
      preventScroll: true,
    });
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
    if (event.origin !== location.origin || event.source !== frame()?.contentWindow) return;
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
      else if (Object.hasOwn(OUTING_SCENES, scene) && scene !== active().scene) {
        active().scene = scene;
        advanceOuting(state());
        save();
      }
    }
    render();
  });

  return {
    allowDungeon,
    onInvitation: () => active()?.kind === 'invitation' && active().stage === 'running',
    invitedMember: invitation.member,
    refresh: render,
    returning() {
      visitedDiscovery = null;
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
    arriveDiscovery(id) {
      queueMicrotask(() => {
        if (!returnOuting()) return;
        visitedDiscovery = id;
        if (!context.quests?.arrived(id)) context.destinations.openDiscovery(id);
        render();
      });
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
