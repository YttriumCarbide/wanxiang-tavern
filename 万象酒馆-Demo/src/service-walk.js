import { TAVERN_HALL } from './content/tavern-layout.js';

export const SERVICE_SEATS = Object.freeze([...TAVERN_HALL.tables, ...TAVERN_HALL.stools]);
export const SERVICE_ENTRY = TAVERN_HALL.entrance;

const spine = [SERVICE_ENTRY[0], -1.64];
const doorLane = [SERVICE_ENTRY[0], 2.65];

export function serviceSeat(id) {
  return SERVICE_SEATS.find((seat) => seat.id === id);
}

export function counterPoint(number, cash = false) {
  const col = number % 5;
  const row = Math.floor(number / 5);
  return [-4.8 + col * 0.72 + (cash ? 0.27 : 0), (cash ? -2.03 : -1.56) + row * 0.43];
}

export function seatPoint(seat) {
  const [x, z] = seat.at;
  if (!seat.radius) return seat.at;
  const offset = seat.radius + 0.32;
  return [x + (seat.id === 'window' ? -offset : offset), z];
}

export function serviceRoute(from, to, direction, seat) {
  if (direction === 'enter') return [from, doorLane, spine, [to[0], spine[1]], to];
  if (direction === 'toSeat') {
    if (!seat.radius) return [from, [to[0], spine[1]], to];
    const lane = seat.id === 'hall' ? 1.08 : 3.02;
    return [from, [from[0], spine[1]], [lane, spine[1]], [lane, to[1]], to];
  }
  if (direction === 'toPay') {
    const via = serviceRoute(to, from, 'toSeat', seat);
    return via.reverse();
  }
  return [from, [from[0], spine[1]], spine, doorLane, to];
}

export function startServiceWalk(points, at) {
  const path = [{ point: points[0], distance: 0 }];
  for (const point of points.slice(1)) {
    const previous = path.at(-1);
    const step = Math.hypot(point[0] - previous.point[0], point[1] - previous.point[1]);
    if (step) path.push({ point, distance: previous.distance + step });
  }
  return { path, at, until: at + Math.max(0.1, path.at(-1).distance / 3.3) };
}

export function servicePosition(guest, time) {
  if (!guest.walk) return guest.position;
  const { path, at, until } = guest.walk;
  const progress = Math.min(1, Math.max(0, (time - at) / (until - at)));
  const distance = progress * path.at(-1).distance;
  const index = path.findIndex((leg) => leg.distance >= distance);
  if (index <= 0) return path[0].point;
  const from = path[index - 1];
  const to = path[index];
  const t = (distance - from.distance) / (to.distance - from.distance);
  return from.point.map((value, axis) => value + (to.point[axis] - value) * t);
}
