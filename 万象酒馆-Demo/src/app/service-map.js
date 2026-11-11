import { TAVERN_HALL } from '../content/tavern-layout.js';
import { SERVICE_ENTRY, SERVICE_SEATS, servicePosition } from '../service-walk.js';
import { serviceGuest } from '../tavern-service.js';
import { createServiceWorld } from './service-world.js';

const phases = Object.freeze({
  enter: '走向前台',
  seat: '等待排座',
  toSeat: '走向座位',
  order: '等点单',
  cook: '等做菜',
  deliver: '等上菜',
  eat: '用餐中',
  extra: '等加点',
  toPay: '走去结账',
  pay: '等待结账',
  clean: '待翻台',
  exit: '离店',
});

export function serviceMapMarkup() {
  return `<section class="service-floor" aria-label="酒馆一楼">
    <div class="service-map-caption"><strong>一楼 · 木梁大厅</strong><span><i></i> 实时客流</span></div>
    <div class="service-map" aria-label="酒馆三维俯视地图">
      <canvas aria-hidden="true"></canvas>
      <svg data-service-routes aria-hidden="true"></svg>
      <div class="service-waypoints" aria-hidden="true">
        <span data-service-point="entry">外出门</span><span data-service-point="counter">前台</span>
      </div>
      <div data-service-seats>${SERVICE_SEATS.map(
        (seat, index) =>
          `<span data-service-seat="${seat.id}" data-status="free" title="${seat.label}">${index < 2 ? ['大厅桌', '靠窗桌'][index] : index - 1}</span>`,
      ).join('')}</div>
      <div data-service-actors></div>
      <div data-service-loading></div>
    </div>
    <nav class="service-callouts" data-service-callouts aria-label="待办方向指引"></nav>
    <div class="service-map-key"><span><i></i> 空桌</span><span><i></i> 使用中</span><span><i></i> 待翻台</span></div>
  </section>`;
}

export function createServiceMap(board) {
  const map = board.querySelector('.service-map');
  const world = createServiceWorld(map);
  const routes = map.querySelector('[data-service-routes]');
  const actors = map.querySelector('[data-service-actors]');
  const seats = SERVICE_SEATS.map((seat) => [
    seat,
    map.querySelector(`[data-service-seat="${seat.id}"]`),
  ]);
  const [barX, barZ, barW] = TAVERN_HALL.bar;
  const waypoints = [
    [SERVICE_ENTRY, map.querySelector('[data-service-point="entry"]')],
    [[barX + barW / 2, barZ - 0.2], map.querySelector('[data-service-point="counter"]')],
  ];
  const markerNodes = new Map();
  const routeNodes = new Map();
  let dirty = true;

  function update(shift, focused) {
    const guests = shift.guests.filter((guest) => guest.phase !== 'clean' || guest.walk);
    routes.innerHTML = guests
      .filter((guest) => guest.walk)
      .map(
        (guest) =>
          `<polyline data-route-guest="${guest.id}" data-direction="${guest.phase}" data-selected="${guest.id === focused}"/>`,
      )
      .join('');
    routeNodes.clear();
    for (const node of routes.children) routeNodes.set(Number(node.dataset.routeGuest), node);
    const live = new Set(guests.map((guest) => guest.id));
    for (const [id, node] of markerNodes) {
      if (live.has(id)) continue;
      node.remove();
      markerNodes.delete(id);
    }
    for (const guest of guests) {
      const profile = serviceGuest(shift, guest);
      let node = markerNodes.get(guest.id);
      if (!node) {
        node = document.createElement('span');
        node.dataset.serviceActor = String(guest.id);
        node.innerHTML = `<strong>${guest.id}</strong>${profile.size > 1 ? `<small>×${profile.size}</small>` : ''}`;
        markerNodes.set(guest.id, node);
        actors.append(node);
      }
      const description = profile.name + ' · ' + phases[guest.phase];
      node.dataset.phase = guest.phase;
      node.dataset.selected = String(guest.id === focused);
      node.title = description;
      node.setAttribute('aria-label', description);
    }
    for (const [seat, node] of seats) {
      const guest = shift.guests.find((entry) => entry.seat === seat.id);
      node.dataset.status = guest ? (guest.phase === 'clean' ? 'dirty' : 'taken') : 'free';
    }
    dirty = true;
  }

  function place(node, point, height) {
    const [x, y] = world.project(point, height);
    node.style.setProperty('--service-x', x.toFixed(1) + 'px');
    node.style.setProperty('--service-y', y.toFixed(1) + 'px');
  }

  function paint(shift, now) {
    const resized = world.resize();
    if (dirty || resized) {
      const [width, height] = world.dimensions();
      routes.setAttribute('viewBox', `0 0 ${width || 1} ${height || 1}`);
      for (const [point, node] of waypoints) place(node, point, 0.15);
      for (const [seat, node] of seats) place(node, seat.at, seat.radius ? 0.83 : 0.45);
      for (const guest of shift.guests) {
        const node = routeNodes.get(guest.id);
        if (node && guest.walk)
          node.setAttribute(
            'points',
            guest.walk.path.map(({ point }) => world.project(point).join(',')).join(' '),
          );
      }
      dirty = false;
    }
    for (const guest of shift.guests) {
      const node = markerNodes.get(guest.id);
      if (!node) continue;
      place(node, servicePosition(guest, shift.elapsed), guest.walk ? 1.37 : 1.23);
      node.dataset.urgent = String(guest.deadline - shift.elapsed <= 8);
    }
    world.draw(shift, now);
  }

  return { ready: world.ready, update, paint, dispose: world.dispose };
}
