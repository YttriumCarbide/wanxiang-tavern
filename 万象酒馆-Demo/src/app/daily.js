import {
  DAILY_ACTIONS,
  DAILY_PERIODS,
  DAILY_ROLES,
  INVITATION_ACTIVITIES,
  OUTING_ACTIONS,
  OUTING_SCENES,
  activateDaily,
  arrangeDaily,
  consumeOutingAction,
  dailyPlan,
  dailySceneTime,
  dailyUnlocked,
  editableDailyPlan,
  finishDaily,
  serviceStaff,
  startDailyPlan,
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
import { relationship } from '../relationships.js';
import { escapeText } from '../ui.js';
import { portraitUrl } from '../portraits.js';
import {
  canRecruitInvitation,
  createDailyInvitation,
  invitationCandidates,
} from './daily-invitation.js';
import { createServiceBoard } from './tavern-service.js';
import { serviceSetupView } from './service-setup-view.js';
import { createOverlandTravel } from './overland-travel.js';

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
    <div class="daily-status" aria-live="polite"></div>
    <nav class="daily-dock" aria-label="酒馆行动"><button type="button" data-daily="chat">交流</button>
      <button class="daily-open" type="button" data-daily="open" aria-controls="daily-rail" aria-expanded="false"><span aria-hidden="true">▦</span>安排</button>
      <button type="button" data-daily="meal">用餐</button></nav>
    <section id="daily-rail" class="daily-rail" aria-label="四段日程" hidden></section>`;
  document.body.append(root);
  const setup = document.createElement('dialog');
  setup.id = 'daily-setup';
  setup.setAttribute('aria-labelledby', 'daily-setup-title');
  document.body.append(setup);
  const dock = root.querySelector('.daily-dock');
  const rail = root.querySelector('.daily-rail');
  const status = root.querySelector('.daily-status');
  const record = root.querySelector('.daily-invitation-record');
  const galStage = document.querySelector('#gal-stage');
  let scene = 'tavern';
  let editing = false;
  let barMotion = null;
  let cell = null;
  let slot = null;
  let local = {};
  let serviceDraftEntry = null;
  let serviceSelection = {};
  let message = '';
  let locked = false;
  let intro = false;
  let mapOpen = false;
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
    scene: () => scene,
    navigate,
    save,
    render,
  });

  function navigate(destination) {
    if (scene === destination && frame()?.contentDocument?.readyState === 'complete') return;
    scene = destination;
    context.chat?.leave();
    context.shell.mountInn(destination);
    render();
  }

  function complete(kind, report, details) {
    if (!finishDaily(state(), kind, report, details)) return;
    editing = scene === 'tavern' && kind !== 'invitation';
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
    const recruit = daily.memory.invitation?.member;
    return `<span>${escapeText(daily.report)}</span>
      ${canRecruitInvitation(library(), recruit) ? '<button data-daily="recruit">邀请入队</button>' : ''}
      <button type="button" data-daily="next">继续 →</button>`;
  }

  function showStatus() {
    if (state().report) return showReport();
    const entry = active();
    if (entry?.kind === 'dungeon')
      return `<span>已进入${DAILY_PERIODS[entry.at]} · 到副本之门出发</span>`;
    if (entry?.kind === 'outing' && entry.stage === 'roaming')
      return (
        travel.status() ||
        `<span>外出 · 剩余行动 <b>${entry.remaining}</b></span><button type="button" data-daily="home">结束外出</button>`
      );
    if (entry?.kind === 'outing' && entry.stage === 'ready')
      return '<span>前往酒馆外出门，推门后整备同行者</span>';
    if (entry?.kind === 'invitation' && invitation.traveling())
      return '<button type="button" data-daily="invite-end">结束约见</button>';
    if (entry?.kind === 'invitation' && entry.run?.plan)
      return '<button type="button" data-daily="resume">继续约见</button>';
    if (entry)
      return `<button type="button" data-daily="setup">${DAILY_ACTIONS[entry.kind].name}整备</button>`;
    if (state().tutorial !== 'done') return '<span>第一次排班 · 点「安排」，选一段营业</span>';
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

  function showRail() {
    const daily = state();
    const { slots } = dailyPlan(daily.running ? daily.plan : daily.draft);
    const choice = !daily.running && cell !== null;
    rail.innerHTML = `<header><span>酒馆日程</span><strong>第 ${daily.day} 天</strong></header>
      ${
        choice
          ? `<nav class="daily-options" aria-label="为${DAILY_PERIODS[cell]}选行动">
        ${Object.entries(DAILY_ACTIONS)
          .map(
            ([id, action]) =>
              `<button data-daily-action="${id}" type="button"><i>${action.glyph}</i>${action.name}<small>${action.ap} AP</small></button>`,
          )
          .join('')}
        <button type="button" data-daily-action="">清空</button></nav>`
          : ''
      }
      <div class="daily-grid">${DAILY_PERIODS.map((period, index) => {
        const entry = slots[index];
        const action = entry && DAILY_ACTIONS[entry.kind];
        const done =
          daily.running &&
          entry &&
          daily.plan.findIndex((item) => item.at === entry.at) < daily.cursor;
        return `<button class="daily-slot" data-daily-slot="${index}" data-kind="${entry?.kind || 'empty'}"
          data-current="${entry?.at === active()?.at && Boolean(entry)}" data-done="${Boolean(done)}"
          aria-pressed="${index === cell}" ${daily.running ? 'disabled' : ''}>
          <small>0${index + 1} / ${period}</small>
          <span>${action ? `${action.glyph} ${index !== entry.at && entry.kind === 'dungeon' ? '远行中' : action.name}` : '＋'}</span>
        </button>`;
      }).join('')}</div>
      <footer><button type="button" data-daily="switch">‹ 切换</button>
        <span role="status">${escapeText(message || (daily.running ? '安排已锁定' : '点时段安排 · 空格留作休息'))}</span>
        <button type="button" class="daily-confirm" data-daily="confirm" ${daily.running ? 'disabled' : ''}>确认安排 →</button>
      </footer>`;
  }

  function render() {
    const visible = enabled() && session.runtime.mode === 'inn' && !session.runtime.needsStart;
    root.hidden = !visible || mapOpen;
    const home = scene === 'tavern';
    root.dataset.outdoors = String(!home);
    const destination = frame()?.contentDocument;
    destination?.body?.classList.toggle('daily-parent-dock', visible && home);
    const entry = active();
    frame()?.contentWindow?.postMessage(
      {
        type: 'daily-managed',
        enabled: visible,
        timeOfDay: visible ? dailySceneTime(entry) : null,
        invitation:
          entry?.kind === 'invitation' && entry.stage === 'running' && !invitation.traveling(),
        outing:
          visible && entry?.kind === 'outing' && entry.stage === 'roaming'
            ? {
                remaining: entry.remaining,
                locked: travel.busy(),
              }
            : null,
      },
      location.origin,
    );
    renderInvitationRecord(visible);
    if (!visible) return;
    const bars = home && !locked && !invitation.traveling();
    const railVisible = barMotion ? !editing : editing;
    dock.hidden = !bars || railVisible;
    rail.hidden = !bars || !railVisible;
    dock.querySelector('[data-daily="open"]').setAttribute('aria-expanded', String(editing));
    status.innerHTML = showStatus();
    status.hidden = !status.children.length;
    if (!rail.hidden) showRail();
    if (setup.open) showSetup();
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
    const candidate = kind === 'invitation' ? invitationCandidates(library()) : members();
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
      body = `<p>可行动 <b>${entry.remaining}</b> 次。选最多两位同行者，也可以独自出门。</p>
        <div class="daily-people">${candidate
          .filter((member) => member.id !== library().campaign?.protagonistId)
          .map((member) => chooseMember(member, local.companions.includes(member.id)))
          .join('')}</div>`;
    } else {
      const member = candidate.find((item) => item.id === local.member);
      body = `<div class="daily-invite-slot"><small>约见对象</small><strong>${escapeText(member?.setting.name || '选一位角色')}</strong>
        ${member ? `<span>好感 ${relationship(library(), member.id).affection} / 100</span>` : ''}</div>
        <div class="daily-people">${candidate.map((person) => chooseMember(person, person.id === local.member)).join('')}</div>
        <div class="daily-options">${Object.entries(INVITATION_ACTIVITIES)
          .map(
            ([id, title]) =>
              `<button type="button" data-daily-activity="${id}" aria-pressed="${id === local.activity}">${title}</button>`,
          )
          .join('')}</div>`;
    }
    setup.innerHTML = `<header><div><small>${kind === 'service' ? `第 ${state().day} 天 · ` : ''}${DAILY_PERIODS[entry.at]} / ${entry.ap} AP</small><h2 id="daily-setup-title">${DAILY_ACTIONS[kind].name}整备</h2></div>
      <button type="button" data-daily-close ${invitation.busy() ? 'disabled' : ''}>收起</button></header>
      <div class="daily-setup-body">${body}</div><footer><p role="status">${escapeText(statusLine)}</p>
        ${kind === 'invitation' && canRecruitInvitation(library(), local.member) ? '<button type="button" data-daily-recruit>邀请入队</button>' : ''}
        <button type="button" class="daily-confirm" data-daily-start ${invitation.busy() || (kind === 'service' && staffed < 4) ? 'disabled' : ''}>
          ${invitation.busy() ? '正在生成约见…' : kind === 'service' ? '开班营业' : kind === 'outing' ? '出门' : '开始约见'}${kind === 'service' ? '' : ' →'}
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
      local = { member: memory.member || '', activity: memory.activity || 'talk' };
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
      if (!entry.remaining && !entry.overlandReached) return returnOuting();
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
        : reserveServiceSpecial(library().dining.inventory, serviceSelection);
      entry.shift = newServiceShift(staff, tutorial, undefined, state().serviceGrowth, special);
      entry.stage = 'running';
      state().memory.service = { ...local };
      setup.close();
      save();
      launch();
    } else if (entry.kind === 'outing') {
      entry.companions = [...local.companions];
      entry.scene = 'street';
      entry.stage = 'roaming';
      state().memory.outing = structuredClone(local);
      setup.close();
      save();
      navigate(entry.scene);
    } else {
      if (!invitationCandidates(library()).some((member) => member.id === local.member))
        throw Error('先选择一位约见对象');
      state().memory.invitation = { ...local };
      const task = invitation.start(local.member, local.activity, () => setup.close());
      showSetup();
      await task;
      if (entry.run?.plan) setup.close();
      else if (setup.open) showSetup();
    }
  }

  function returnOuting() {
    if (travel.busy()) return false;
    if (active()?.kind !== 'outing' || active().stage !== 'roaming') return false;
    const used = active().ap * OUTING_ACTIONS - active().remaining;
    navigate('tavern');
    complete('outing', `外出结束 · 已使用 ${used} 次行动`);
    return true;
  }

  function allowDungeon() {
    if (!enabled() || active()?.kind === 'dungeon') return true;
    context.shell.toast('请先在「安排」中放入连续两段的副本行程。');
    return false;
  }

  function switchBars(open) {
    if (editing === open) return;
    barMotion?.cancel();
    barMotion = null;
    editing = open;
    cell = null;
    message = '';
    const outgoing = open ? dock : rail;
    if (outgoing.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return render();
    const motion = outgoing.animate(
      [
        { translate: '0 0', opacity: 1 },
        { translate: '0 36px', opacity: 0 },
      ],
      { duration: 150, easing: 'ease-in', fill: 'forwards' },
    );
    barMotion = motion;
    void motion.finished
      .catch(() => {})
      .then(() => {
        if (barMotion !== motion) return;
        barMotion = null;
        render();
        motion.cancel();
      });
  }

  function closeRail() {
    if (!root.hidden && editing && scene === 'tavern' && !locked) switchBars(false);
  }

  function action(id) {
    const daily = state();
    if (id.startsWith('travel:'))
      return void travel.act(id.slice(7)).catch((failure) => context.shell.toast(failure.message));
    if (id === 'open' || id === 'switch') return switchBars(id === 'open');
    if (id === 'chat') context.chat.open('table');
    if (id === 'meal') {
      if (library().dining.tutorial === 'ready') context.dining.tutorial();
      else context.dining.open('table');
    }
    if (id === 'setup' || id === 'resume') launch();
    if (id === 'invite-end') invitation.endTravel();
    if (id === 'home') returnOuting();
    if (id === 'recruit') invitation.recruit(daily.memory.invitation?.member);
    if (id === 'confirm') {
      if (daily.tutorial !== 'done' && dailyPlan(daily.draft).plan[0]?.kind !== 'service')
        throw Error('先安排一次营业练习，把它放在今天第一项。');
      startDailyPlan(daily);
      cell = null;
      save();
      launch();
    }
    if (id === 'next') {
      daily.report = null;
      daily.reportDetails = null;
      activateDaily(daily);
      cell = null;
      save();
      launch();
    }
    render();
  }

  events.on(root, 'click', (event) => {
    if (barMotion && (dock.contains(event.target) || rail.contains(event.target))) return;
    try {
      const selected = event.target.closest('[data-daily-slot]');
      if (selected && !state().running) {
        cell = Number(selected.dataset.dailySlot);
        message = '';
        return render();
      }
      const option = event.target.closest('[data-daily-action]');
      if (option && cell !== null && !state().running) {
        state().draft = editableDailyPlan(
          arrangeDaily(state().draft, option.dataset.dailyAction, cell),
        );
        cell = null;
        message = '';
        save();
        return render();
      }
      const button = event.target.closest('[data-daily]');
      if (button) action(button.dataset.daily);
    } catch (failure) {
      message = failure.message;
      render();
    }
  });
  events.on(
    document,
    'click',
    (event) => {
      if (!rail.contains(event.target) && !dock.contains(event.target)) closeRail();
    },
    { capture: true },
  );
  events.on(record, 'click', (event) => event.stopPropagation());
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
        serviceSpecial(serviceSelection.id),
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
      if (event.target.closest('[data-daily-recruit]')) return invitation.recruit(local.member);
      if (active()?.kind === 'service') return editServiceSetup(event.target.closest('button'));
      const person = event.target.closest('[data-daily-person]');
      if (person) {
        const { dailyPerson: id } = person.dataset;
        if (active().kind === 'outing') {
          if (local.companions.includes(id))
            local.companions = local.companions.filter((key) => key !== id);
          else if (local.companions.length < 2) local.companions.push(id);
          else throw Error('最多两名同行者');
        } else local.member = local.member === id ? '' : id;
      }
      const activity = event.target.closest('[data-daily-activity]');
      if (activity) local.activity = activity.dataset.dailyActivity;
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
    if (event.data?.type === 'street-map-state') {
      mapOpen = event.data.open === true;
      return render();
    }
    if (event.data?.type === 'daily-scene-click') return closeRail();
    if (event.data?.type === 'daily-overland-plan' && enabled())
      return void travel.start(event.data.to);
    if (event.data?.type === 'daily-outing-door') {
      if (!enabled() || session.runtime.mode !== 'inn') return;
      if (invitation.traveling()) return navigate('street');
      if (active()?.kind !== 'outing' || active().stage === 'roaming') {
        context.shell.toast('在日程中安排外出后，就能从这里整备出门。');
        return;
      }
      active().stage = 'setup';
      save();
      openSetup();
    }
    if (event.data?.type === 'daily-invitation-leave') {
      context.shell.toast('先完成眼下这段对话，换地方时手记会提示。');
      return;
    }
    if (event.data?.type !== 'scene-ready') return;
    mapOpen = false;
    scene = event.data.scene === 'starlamp-street' ? 'street' : event.data.scene;
    if (active()?.overland) {
      void travel.arrive(scene);
      return render();
    }
    if (scene === 'tavern' || Object.hasOwn(OUTING_SCENES, scene)) invitation.arrive(scene);
    if (active()?.kind === 'outing' && active().stage === 'roaming') {
      if (scene === 'tavern') returnOuting();
      else if (Object.hasOwn(OUTING_SCENES, scene) && scene !== active().scene) {
        active().scene = scene;
        consumeOutingAction(active());
        save();
        if (!active().remaining) returnOuting();
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
      if (active()?.kind !== 'dungeon') return;
      active().stage = 'departed';
      save();
      render();
    },
    allowTalk() {
      return (
        !enabled() ||
        !(active()?.kind === 'outing' && active().stage === 'roaming') ||
        active().remaining > 0
      );
    },
    talkFinished() {
      if (!consumeOutingAction(active())) return false;
      save();
      render();
      return active().remaining === 0;
    },
    returnOuting,
    overlandRun: travel.run,
    overlandDialogueScenes: travel.dialogueScenes,
    overlandDialogueContext: travel.dialogueContext,
    recordOverlandDialogue: travel.recordDialogue,
    outOfTavern: () => scene !== 'tavern',
    finishOverlandBattle: travel.finishBattle,
    outingCompanions: () => (active()?.kind === 'outing' ? active().companions : null),
    async rescued() {
      if (!enabled() || intro || state().tutorial !== 'intro') return;
      intro = true;
      try {
        await context.gal.play(
          [
            {
              speaker: '伊蒂丝',
              text: '现在我们有四个人了。平日也可以像在副本里一样，把事情排进时间轴。上午、中午、下午、夜晚，每段办一件事。',
            },
            {
              speaker: '潘多拉',
              text: '主人，桌边有「安排」。先排一段营业吧？我们四个人刚好一人一个岗位。我会跟着您学。',
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
      const motion = barMotion;
      barMotion = null;
      motion?.cancel();
      service.dispose();
      invitation.dispose();
      record.remove();
      setup.remove();
      root.remove();
    },
  };
}
