import { paintCookingTrail } from './service-cooking-view.js';
import { createServiceDragView } from './service-drag-view.js';
import { DAILY_ROLES } from '../daily.js';
import {
  advanceService,
  performService,
  performServiceGesture,
  serviceGuest,
  serviceJob,
  tryAutoService,
} from '../tavern-service.js';
import { portraitUrl } from '../portraits.js';
import { escapeText } from '../ui.js';
import { createServiceMap, serviceMapMarkup } from './service-map.js';
import { serviceIcon } from './service-icons.js';
import { paintServiceActivity, serviceGameMarkup } from './service-game-view.js';

const stations = Object.freeze({
  front: ['01', '♢', '迎宾 · 排座 · 收银'],
  cook: ['02', '◉', '备料 · 掌火 · 出菜'],
  server: ['03', '▱', '点单 · 托盘 · 加点'],
  clean: ['04', '✦', '清桌 · 去渍 · 翻台'],
});

const guides = Object.freeze({
  front: { side: 'left', label: '前台', hint: '迎宾 / 收银', icon: '订单' },
  cook: { side: 'top', label: '后厨', hint: '备料 / 掌火', icon: '锅' },
  server: { side: 'right', label: '堂前', hint: '点单 / 送餐', icon: '托盘' },
  clean: { side: 'bottom', label: '清台', hint: '收桌 / 翻台', icon: '餐篮' },
});

export function createServiceBoard(context, closeShift) {
  const board = document.createElement('dialog');
  board.id = 'daily-service';
  board.setAttribute('aria-labelledby', 'service-title');
  document.body.append(board);
  let shift = null;
  let map = null;
  let focused = null;
  let frame = 0;
  let last = 0;
  let revision = 0;
  let savedAt = 0;
  let roster = new Map();
  let gesture = null;
  let cookingFinish = 0;
  const drag = createServiceDragView(board);
  let picked = null;
  let lastMissed = 0;
  let lastArrived = 0;
  let wasFinished = false;
  let alertTimer = 0;
  const cookingCues = Object.freeze({
    cut: 'service-chop',
    heat: 'service-sizzle',
    sear: 'service-sizzle',
    pour: 'service-pour',
    stir: 'service-stir',
    whisk: 'service-whisk',
    roll: 'service-stir',
    knead: 'service-knead',
    pipe: 'service-pipe',
    season: 'service-pipe',
    skim: 'service-skim',
    flip: 'service-sizzle',
    balance: 'service-tray',
    catch: 'service-tray',
    wipe: 'service-cleaning',
    mop: 'service-cleaning',
  });
  function playCue(name) {
    context.audio?.play(name);
  }
  function feedback(text, tone = 'good') {
    const host = board.querySelector('.service-float-layer');
    if (!host) return;
    const node = document.createElement('span');
    node.className = 'service-float';
    node.dataset.tone = tone;
    node.textContent = text;
    host.append(node);
    window.setTimeout(() => node.remove(), 900);
    if (tone === 'good') {
      const card = board.querySelector('.service-workcard');
      if (!card) return;
      card.classList.remove('service-success');
      void card.offsetWidth;
      card.classList.add('service-success');
      window.setTimeout(() => card.classList.remove('service-success'), 460);
    }
  }
  function shakeCard() {
    const card = board.querySelector('.service-workcard');
    if (!card) return;
    card.classList.remove('service-shake');
    void card.offsetWidth;
    card.classList.add('service-shake');
  }

  function jobs() {
    return new Map(
      shift.guests.flatMap((guest) => {
        const job = serviceJob(shift, guest);
        return job ? [[guest.id, { guest, ...job }]] : [];
      }),
    );
  }

  function station(id, queue) {
    const staff = context.session.ai.library.characters.find(
      (entry) => entry.id === shift.staff[id],
    );
    const [number, symbol, duty] = stations[id];
    return `<header class="service-role">
      <span class="service-avatar">${staff ? `<img src="${escapeText(portraitUrl(staff.combat))}" alt="">` : symbol}</span>
      <span><small>${number} / ${escapeText(staff?.setting.name || '')}</small><strong>${DAILY_ROLES[id]}</strong></span>
      <span class="service-queue" aria-label="${queue.length} 张单">${queue.length}</span>
    </header>
    ${
      queue.length
        ? `<div class="service-tickets" aria-label="待办票签">${queue
            .map(({ guest, title }) => {
              const name = serviceGuest(shift, guest).name;
              return `<button type="button" title="${escapeText(name)}" data-service-ticket="${guest.id}" aria-pressed="${focused === guest.id}">
        <span>${guest.id}号 · ${title}</span><small data-service-time="${guest.id}"></small></button>`;
            })
            .join('')}</div>`
        : `<p class="service-empty">${duty}</p>`
    }`;
  }

  function mount() {
    const wing = (roles) => {
      const panels = roles.map(
        (id) => `<section class="service-station" data-station="${id}"></section>`,
      );
      return `<div class="service-wing">${panels.join('')}</div>`;
    };
    board.innerHTML = `<header class="service-heading">
      <div class="service-title"><span class="service-mark" aria-hidden="true">✦</span><div><small>万象酒馆 · 营业手帐</small><h2 id="service-title">${shift.tutorial ? '初灯试营业' : '酒馆营业'}</h2></div></div>
      <div class="service-stats"><span>到店 <b data-service-stat="arrived"></b>/<b data-service-stat="limit"></b></span><span>已结账 <b data-service-stat="served"></b></span><span>收入 <b data-service-stat="earned"></b></span><span>超时 <b data-service-stat="missed"></b></span></div>
    </header>
    <div class="service-layout">${wing(['front', 'cook'])}${serviceMapMarkup()}${wing(['server', 'clean'])}</div>
    <section class="service-workspace" data-service-workspace hidden aria-label="当前营业小游戏"></section>
    <div class="service-float-layer" aria-hidden="true"></div>
    <footer class="service-foot"><span></span><button type="button" data-service-end disabled>收班结算</button></footer>
    <div class="service-alert" role="status" hidden></div>
    <span class="service-drag-preview" hidden aria-hidden="true"></span>`;
  }

  function renderWorkspace(job) {
    if (cookingFinish) return;
    const node = board.querySelector('[data-service-workspace]');
    node.hidden = !job;
    const markup = job
      ? `<div class="service-workcard"><header tabindex="-1">
      <div><small>${job.guest.id}号 · ${escapeText(serviceGuest(shift, job.guest).name)}</small><strong>${escapeText(job.title)}</strong></div>
      <small data-service-time="${job.guest.id}"></small><button type="button" data-service-dismiss aria-label="关闭小游戏">×</button>
    </header>${serviceGameMarkup(job)}</div>`
      : '';
    if (node.renderedWorkspace === markup) return;
    const current = node.firstElementChild;
    const key = job ? [job.guest.id, job.phase, job.course].join(':') : '';
    const previous = document.activeElement;
    const choice = node.contains(previous) ? previous.dataset.serviceChoice : null;
    node.renderedWorkspace = markup;
    const reuse = current && key && current.dataset.task === key;
    node.innerHTML = markup;
    if (node.firstElementChild) {
      node.firstElementChild.dataset.task = key;
      node.firstElementChild.toggleAttribute('data-same-task', Boolean(reuse));
    }
    if (choice)
      [...node.querySelectorAll('[data-service-choice]')]
        .find((button) => button.dataset.serviceChoice === choice && !button.disabled)
        ?.focus({ preventScroll: true });
  }

  function roleQueue(role) {
    return [...roster.values()]
      .filter((job) => job.role === role)
      .sort((a, b) => a.guest.deadline - b.guest.deadline);
  }

  function renderGuides() {
    const root = board.querySelector('[data-service-callouts]');
    root.innerHTML = Object.entries(guides)
      .map(([role, guide]) => {
        const next = roleQueue(role)[0];
        if (!next) return '';
        const time = Math.max(0, Math.ceil(next.guest.deadline - shift.elapsed));
        return `<button type="button" class="service-callout" data-service-guide="${role}"
          data-side="${guide.side}" data-guest="${next.guest.id}" data-urgent="${time <= 8}"
          aria-label="${guide.label}：${next.guest.id}号${escapeText(next.title)}，还剩${time}秒">
          <span class="service-guide-arrow" aria-hidden="true"></span>
          <span class="service-guide-icon">${serviceIcon(guide.icon)}</span>
          <span class="service-guide-copy"><b>${guide.label}</b><small>${next.guest.id}号 · ${escapeText(next.title)}</small></span>
          <em data-guide-time="${role}">${time}s</em>
        </button>`;
      })
      .join('');
  }

  function flashAlert(message) {
    const node = board.querySelector('.service-alert');
    if (!node) return;
    clearTimeout(alertTimer);
    node.textContent = message;
    node.hidden = false;
    node.classList.remove('is-visible');
    void node.offsetWidth;
    node.classList.add('is-visible');
    alertTimer = window.setTimeout(() => {
      node.classList.remove('is-visible');
      alertTimer = window.setTimeout(() => (node.hidden = true), 260);
    }, 2600);
  }

  function render() {
    roster = jobs();
    if (!roster.has(focused)) focused = null;
    for (const [id, value] of Object.entries({
      arrived: shift.arrived,
      limit: shift.limit,
      served: shift.served,
      earned: shift.earned,
      missed: shift.missed,
    }))
      board.querySelector(`[data-service-stat="${id}"]`).textContent = value;
    for (const id of Object.keys(stations)) {
      const node = board.querySelector(`[data-station="${id}"]`);
      const queue = [...roster.values()]
        .filter((job) => job.role === id)
        .sort((a, b) => a.guest.deadline - b.guest.deadline);
      node.dataset.active = String(queue.length > 0);
      const markup = station(id, queue);
      if (node.renderedStation !== markup) {
        const previous = document.activeElement;
        const ticket = previous?.dataset.serviceTicket;
        const restore = node.contains(previous);
        node.renderedStation = markup;
        node.innerHTML = markup;
        if (restore) {
          const replacement = [...node.querySelectorAll('[data-service-ticket]')].find(
            (button) => ticket && button.dataset.serviceTicket === ticket,
          );
          replacement?.focus({ preventScroll: true });
        }
      }
    }
    renderWorkspace(roster.get(focused));
    renderGuides();
    map.update(shift, focused);
    map.paint(shift, performance.now());
    board.querySelector('.service-foot span').textContent = shift.finished
      ? '本班结束 · 已翻台 ' + shift.cleaned + ' 处'
      : '按四边提示去对应岗位接单 · 红色表示即将超时 · 客人还在等你。';
    board.querySelector('[data-service-end]').disabled = !shift.finished;
    if (shift.finished && !wasFinished) playCue('service-done');
    wasFinished = shift.finished;
    board.dataset.finished = String(shift.finished);
    if (shift.arrived > lastArrived) {
      playCue('service-bell');
      lastArrived = shift.arrived;
    }
    if (shift.missed > lastMissed) {
      playCue('service-lost');
      flashAlert(`客人等太久离开了 · 目前超时 ${shift.missed} 桌`);
      lastMissed = shift.missed;
    }
    meters();
  }

  function meters() {
    let rush = false;
    for (const element of board.querySelectorAll('[data-service-time]')) {
      const guest = roster.get(Number(element.dataset.serviceTime))?.guest;
      if (!guest) continue;
      const time = Math.max(0, Math.ceil(guest.deadline - shift.elapsed));
      if (element.textContent !== time + 's') element.textContent = time + 's';
      element.classList.toggle('service-urgent', time <= 8);
      rush ||= time <= 8;
    }
    for (const station of board.querySelectorAll('[data-station]')) {
      const time = roleQueue(station.dataset.station)[0]?.guest.deadline;
      station.toggleAttribute('data-urgent', time != null && time - shift.elapsed <= 8);
    }
    for (const guide of board.querySelectorAll('[data-service-guide]')) {
      const queue = roleQueue(guide.dataset.serviceGuide);
      const next = queue[0];
      if (!next) continue;
      const time = Math.max(0, Math.ceil(next.guest.deadline - shift.elapsed));
      const meter = guide.querySelector('[data-guide-time]');
      if (meter && meter.textContent !== time + 's') meter.textContent = time + 's';
      guide.dataset.urgent = String(time <= 8);
      rush ||= time <= 8;
    }
    board.dataset.rush = String(rush);
    const area = board.querySelector('[data-activity]');
    const job = roster.get(focused);
    const card = board.querySelector('.service-workcard');
    card?.classList.toggle(
      'service-urgent',
      Boolean(job && job.guest.deadline - shift.elapsed <= 8),
    );
    if (area && job && !cookingFinish) {
      const current = serviceJob(shift, job.guest)?.activity;
      paintServiceActivity(area, current, gesture?.mode === 'activity');
    }
  }

  function selectGuest(id, keyboard = false) {
    const job = roster.get(id);
    if (!job) return;
    clearInput();
    clearCookingFinish();
    if (tryAutoService(shift, id)) {
      focused = null;
      render();
      save();
      playCue(job.phase === 'pay' ? 'service-coin' : 'service-done');
      feedback('自动完成', 'good');
      return;
    }
    focused = id;
    render();
    if (board.clientWidth <= 650)
      board.querySelector('.service-floor').scrollIntoView({ block: 'nearest' });
    if (keyboard) board.querySelector('.service-workcard header')?.focus({ preventScroll: true });
  }

  function save() {
    savedAt = shift.elapsed;
    revision = shift.revision;
    context.generation.save();
  }

  function paint(time) {
    if (!shift || !board.open) return;
    const seconds = (time - last) / 1000;
    advanceService(shift, seconds);
    last = time;
    if (
      gesture?.mode === 'activity' &&
      ['heat', 'pour', 'catch', 'balance', 'sear'].includes(gesture.kind)
    ) {
      activityInput(gesture, 'hold', gesture.point, seconds);
    } else if (!gesture && !cookingFinish) {
      const area = board.querySelector('[data-activity="heat"]');
      const guest = roster.get(focused)?.guest;
      if (area && guest?.activity?.recipe === 2) {
        const point = { x: guest.activity.heat, y: 0.81 };
        activityInput(
          { guest: guest.id, kind: 'heat', area, point, start: point },
          'idle',
          point,
          seconds,
        );
      }
    }
    if (shift.revision !== revision) {
      render();
      save();
    } else {
      map.paint(shift, time);
      meters();
      if (shift.elapsed - savedAt >= 5) save();
    }
    if (!shift.finished) frame = requestAnimationFrame(paint);
  }

  function choose(id, choice, target) {
    const job = roster.get(id);
    if (!job) return false;
    focused = id;
    const phase = job.guest.phase;
    const ok = performService(shift, id, choice, target);
    if (job.guest.phase !== phase || !shift.guests.includes(job.guest)) focused = null;
    render();
    save();
    if (ok) {
      playCue(phase === 'pay' ? 'service-coin' : 'service-done');
      feedback(phase === 'pay' ? '收账' : '记下', 'good');
    } else {
      playCue('service-fail');
      feedback('差一点', 'bad');
      shakeCard();
    }
    return ok;
  }

  function clearCookingFinish() {
    clearTimeout(cookingFinish);
    cookingFinish = 0;
  }

  function clearInput() {
    gesture = null;
    picked = null;
    drag.reset();
  }

  function normalized(area, event) {
    const clamp = (value) => Math.max(0, Math.min(1, value));
    const svg = area.querySelector('[data-cook-art]');
    const matrix = svg?.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return { x: clamp(point.x / 600), y: clamp(point.y / 300) };
    }
    const rect = area.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.x) / rect.width),
      y: clamp((event.clientY - rect.y) / rect.height),
    };
  }

  function showCookingFinish(area, activity) {
    paintServiceActivity(area, activity, false);
    area.setAttribute('data-complete', '');
    cookingFinish = window.setTimeout(
      () => {
        cookingFinish = 0;
        if (shift && board.open) render();
      },
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420,
    );
  }

  function activityInput(active, type, to, seconds) {
    const guest = roster.get(active.guest)?.guest;
    if (
      !guest ||
      !shift.guests.includes(guest) ||
      shift.elapsed >= guest.deadline ||
      serviceJob(shift, guest)?.activity?.kind !== active.kind
    ) {
      clearInput();
      return;
    }
    const phase = guest.phase;
    const previousError = guest.error;
    const marksBefore = guest.activity?.marks?.length ?? 0;
    let result;
    const done = performServiceGesture(
      shift,
      guest.id,
      active.kind,
      {
        type,
        from: active.point,
        to,
        start: active.start,
        seconds,
      },
      (frame) => {
        result = frame;
      },
    );
    const marked = (result?.state.marks?.length ?? 0) > marksBefore;
    if (marked) playCue(cookingCues[active.kind] || 'service-tray');
    active.point = to;
    if (done) {
      if (guest.phase !== phase || !shift.guests.includes(guest)) focused = null;
      clearInput();
      if (phase === 'cook') showCookingFinish(active.area, result);
      render();
      save();
      playCue('service-done');
      feedback('完成', 'good');
    } else if (type === 'release') {
      const failed = Boolean(guest.error && guest.error !== previousError);
      clearInput();
      render();
      save();
      if (failed) {
        playCue('service-fail');
        feedback('差一点', 'bad');
        shakeCard();
      }
    } else if (type !== 'idle') meters();
  }

  context.events.on(board, 'pointerdown', (event) => {
    if (!shift || gesture || cookingFinish || event.button !== 0) return;
    const area = event.target.closest('[data-activity]');
    const item = event.target.closest('[data-drag-choice]');
    if (!area && !item) return;
    event.preventDefault();
    clearInput();
    board.setPointerCapture(event.pointerId);
    if (area) {
      const point = normalized(area, event);
      gesture = {
        id: event.pointerId,
        mode: 'activity',
        guest: Number(area.dataset.activityFor),
        kind: area.dataset.activity,
        area,
        start: point,
        point,
        trail: [point],
        time: event.timeStamp,
      };
      if (gesture.kind !== 'cut') playCue(cookingCues[gesture.kind] || 'service-tray');
      activityInput(gesture, 'start', point, 0);
    } else {
      gesture = {
        id: event.pointerId,
        mode: 'item',
        guest: Number(item.dataset.serviceFor),
        choice: item.dataset.dragChoice,
      };
      drag.start(item, event);
    }
  });

  context.events.on(board, 'pointermove', (event) => {
    if (gesture?.id !== event.pointerId) return;
    if (gesture.mode === 'item') {
      drag.move(event);
      return;
    }
    const active = gesture;
    const points = event.getCoalescedEvents?.();
    for (const sample of points?.length ? points : [event]) {
      if (gesture !== active) break;
      const seconds = active.kind === 'balance' ? (sample.timeStamp - active.time) / 1000 : 0;
      active.time = sample.timeStamp;
      const point = normalized(active.area, sample);
      if (active.area.hasAttribute('data-kitchen')) {
        active.trail.push(point);
        if (active.trail.length > 9) active.trail.shift();
        paintCookingTrail(active.area, active.trail);
      }
      activityInput(active, 'move', point, seconds);
    }
  });

  function release(event) {
    if (gesture?.id !== event.pointerId) return;
    const active = gesture;
    if (event.type !== 'pointerup') {
      clearInput();
      if (active.mode === 'activity') meters();
      return;
    }
    if (active.mode === 'activity') {
      activityInput(active, 'release', normalized(active.area, event), 0);
      return;
    }
    gesture = null;
    drag.release((target) => choose(active.guest, active.choice, target), event);
  }
  context.events.on(board, 'pointerup', release);
  context.events.on(board, 'pointercancel', release);
  context.events.on(board, 'lostpointercapture', release);

  function dismiss() {
    const id = focused;
    clearCookingFinish();
    clearInput();
    focused = null;
    render();
    board
      .querySelector(`.service-tickets [data-service-ticket="${id}"]`)
      ?.focus({ preventScroll: true });
  }

  context.events.on(board, 'cancel', (event) => {
    event.preventDefault();
    if (focused) dismiss();
  });
  context.events.on(board, 'click', (event) => {
    if (!shift) return;
    const button = event.target.closest('[data-service-choice]');
    if (button) return choose(Number(button.dataset.serviceFor), button.dataset.serviceChoice);
    const item = event.target.closest('[data-drag-choice]');
    if (item && event.detail === 0) {
      picked = item;
      for (const tile of board.querySelectorAll('[data-drag-choice]'))
        tile.setAttribute('aria-pressed', String(tile === picked));
      return;
    }
    const target = event.target.closest('[data-service-dropzone]');
    if (target && picked) {
      const { serviceFor, dragChoice } = picked.dataset;
      picked = null;
      return choose(Number(serviceFor), dragChoice, target.dataset.serviceDropzone);
    }
    const ticket = event.target.closest('[data-service-ticket]');
    if (ticket) return selectGuest(Number(ticket.dataset.serviceTicket), event.detail === 0);
    const guide = event.target.closest('[data-service-guide]');
    if (guide) return selectGuest(Number(guide.dataset.guest), event.detail === 0);
    if (event.target.closest('[data-service-dismiss]')) return dismiss();
    if (event.target.closest('[data-service-end]') && shift.finished) {
      const settled = shift;
      close();
      closeShift(settled);
    }
  });

  function close() {
    cancelAnimationFrame(frame);
    clearTimeout(alertTimer);
    shift = null;
    clearCookingFinish();
    clearInput();
    map?.dispose();
    map = null;
    board.close();
  }

  return {
    open(value) {
      if (shift === value && board.open) return;
      close();
      shift = value;
      focused = null;
      revision = shift.revision;
      savedAt = shift.elapsed;
      lastMissed = shift.missed;
      lastArrived = shift.arrived;
      wasFinished = shift.finished;
      clearTimeout(alertTimer);
      mount();
      board.showModal();
      playCue('service-bell');
      map = createServiceMap(board);
      const instance = map;
      render();
      void instance.ready.then(() => {
        if (map !== instance || !shift) return;
        render();
        last = performance.now();
        if (!shift.finished) frame = requestAnimationFrame(paint);
      });
    },
    close,
    dispose() {
      close();
      board.remove();
    },
  };
}
