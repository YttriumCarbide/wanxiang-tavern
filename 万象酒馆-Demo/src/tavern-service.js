import {
  SERVICE_BASIC_MENU,
  SERVICE_EXTRAS,
  SERVICE_MENU,
  SERVICE_NOTES,
  SERVICE_ORDER_OPENERS,
  SERVICE_PARTIES,
  SERVICE_TRAINING,
  SEAT_REQUESTS,
} from './content/tavern-service.js';
import {
  SERVICE_ENTRY,
  SERVICE_SEATS,
  counterPoint,
  seatPoint,
  servicePosition,
  serviceRoute,
  serviceSeat,
  startServiceWalk,
} from './service-walk.js';
import { applyServiceGesture, serviceActivity } from './service-gestures.js';
import { serviceSpecial } from './service-specials.js';
import {
  expectedServiceTables,
  serviceAutoChance,
  servicePriceBonus,
  serviceProficiency,
  serviceSeed,
  serviceWaitBonus,
  SERVICE_ROLES,
} from './service-progression.js';

const trainingArrivals = [1, 10, 17];
const jobs = {
  seat: ['front', '迎宾排座', 25],
  order: ['server', '确认点单', 23],
  cook: ['cook', '制作菜品', 38],
  deliver: ['server', '配盘送餐', 21],
  extra: ['server', '加点与补给', 17],
  pay: ['front', '算账找零', 23],
  clean: ['clean', '清理翻台', 29],
};

function shuffled(values, seed) {
  return values
    .map((value, index) => ({ value, rank: serviceSeed(`${seed}:${index}`) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ value }) => value);
}

function bookGuests(seed, limit, reservation) {
  const special = serviceSpecial(reservation?.id);
  const specialTables = special
    ? shuffled(
        Array.from({ length: limit - 1 }, (_, index) => index + 1),
        `${seed}:special`,
      ).slice(0, reservation.portions)
    : [];
  const profiles = SERVICE_PARTIES.map((profile, index) => ({ ...profile, appearance: index + 1 }));
  return Array.from({ length: Math.ceil(limit / profiles.length) }, (_, wave) =>
    shuffled(profiles, wave ? `${seed}:guests:${wave}` : `${seed}:guests`),
  )
    .flat()
    .slice(0, limit)
    .map((profile, index) => {
      const menu = special
        ? SERVICE_BASIC_MENU.filter((id) => id !== special.index)
        : SERVICE_BASIC_MENU;
      const order = shuffled(menu, `${seed}:orders:${index}`).slice(
        0,
        index === 0 ? 1 : profile.order.length,
      );
      if (specialTables.includes(index)) order[order.length - 1] = special.index;
      return {
        ...profile,
        order,
        notes: profile.notes ? ['做好一起上就好', '麻烦趁新鲜端来'] : [],
      };
    });
}

export function newServiceShift(
  staff,
  tutorial = false,
  seed = Math.floor(Math.random() * 2 ** 32),
  growth = null,
  special = null,
) {
  const reputation = growth?.reputation || 0;
  const limit = tutorial ? SERVICE_TRAINING.length : expectedServiceTables(reputation);
  return {
    version: 4,
    seed,
    staff: { ...staff },
    staffLevels: Object.fromEntries(
      Object.keys(SERVICE_ROLES).map((role) => [
        role,
        serviceProficiency(growth, staff?.[role], role),
      ]),
    ),
    reputation,
    completedByRole: {},
    bookings: tutorial ? null : bookGuests(seed, limit, special),
    special: tutorial ? null : special,
    tutorial,
    elapsed: 0,
    nextArrival: 1,
    arrived: 0,
    limit,
    guests: [],
    earned: 0,
    served: 0,
    missed: 0,
    cleaned: 0,
    revision: 0,
    finished: false,
  };
}

export function serviceGuest(shift, guest) {
  return (
    guest.legacy ||
    (shift.tutorial ? SERVICE_TRAINING : shift.bookings || SERVICE_PARTIES)[guest.id - 1]
  );
}

export function serviceMenuItem(name) {
  return SERVICE_MENU.find((item) => item.name === name) || null;
}

function chosen(lines, seed) {
  if (!lines?.length) return '';
  return lines[seed % lines.length];
}

function requestFor(shift, guest) {
  if (guest.request) return guest.request;
  const profile = serviceGuest(shift, guest);
  const seed = seedFor(shift, guest, 43);
  const notes =
    profile.notes ||
    (profile.note
      ? [profile.note]
      : SERVICE_NOTES.filter((note) => profile.size > 1 || !note.includes('孩子')));
  const note = chosen(notes, seed);
  const extra = chosen(
    profile.extras || (profile.extra ? [profile.extra] : SERVICE_EXTRAS),
    seed >>> 7,
  );
  const dishes = profile.order.map((item) => SERVICE_MENU[item].name).join('、');
  const openers =
    profile.size > 1
      ? SERVICE_ORDER_OPENERS
      : SERVICE_ORDER_OPENERS.filter((line) => !line.includes('孩子'));
  const opener = chosen(openers, seed >>> 13);
  const orderLine = opener.replace('{dishes}', dishes).replace('{note}', note ? `，${note}` : '');
  return (guest.request = { note, extra, orderLine });
}

function setPhase(shift, guest, phase, seconds = jobs[phase]?.[2] ?? 0) {
  const profile = serviceGuest(shift, guest);
  guest.phase = phase;
  guest.step = 0;
  guest.course = 0;
  guest.error = '';
  guest.activity = null;
  if (phase === 'cook') guest.cookSince = shift.elapsed;
  const cookTime = phase === 'cook' && !shift.tutorial ? (profile.order.length - 1) * 10 : 0;
  guest.deadline = shift.elapsed + seconds + cookTime + (jobs[phase] && shift.tutorial ? 18 : 0);
  if (!shift.tutorial && jobs[phase]) {
    guest.deadline += serviceWaitBonus(shift.staffLevels?.[jobs[phase][0]] || 0);
  }
  if (profile.quick && ['order', 'deliver', 'extra'].includes(phase)) guest.deadline -= 5;
  shift.revision++;
}

function walk(shift, guest, direction, to, stagger = 0) {
  const from = servicePosition(guest, shift.elapsed);
  guest.walk = startServiceWalk(
    serviceRoute(from, to, direction, serviceSeat(guest.seat)),
    shift.elapsed + stagger,
  );
  if (direction !== 'leave') {
    setPhase(shift, guest, direction);
    guest.deadline = guest.walk.until;
  }
}

function queuePlace(shift, phases) {
  const slots = new Set(
    shift.guests.filter((guest) => phases.includes(guest.phase)).map((guest) => guest.queue),
  );
  let place = 0;
  while (slots.has(place)) place++;
  return place;
}

function admit(shift) {
  const queue = queuePlace(shift, ['enter', 'seat']);
  const guest = { id: ++shift.arrived, position: [...SERVICE_ENTRY], seat: null, queue };
  requestFor(shift, guest);
  walk(shift, guest, 'enter', counterPoint(queue));
  shift.guests.push(guest);
  const interval = shift.bookings
    ? 10 + (serviceSeed(`${shift.seed}:arrival:${guest.id}`) % 7)
    : guest.id === 1
      ? 10 + (seedFor(shift, guest, 101) % 3)
      : 11 + (seedFor(shift, guest, 101) % 6);
  shift.nextArrival = shift.tutorial
    ? Math.max(shift.elapsed + 3, trainingArrivals[shift.arrived] ?? 0)
    : shift.elapsed + interval;
}

function checkout(shift, guest) {
  guest.queue = queuePlace(shift, ['toPay', 'pay']);
  walk(shift, guest, 'toPay', counterPoint(guest.queue, true));
}

function depart(shift, guest) {
  setPhase(shift, guest, guest.seat ? 'clean' : 'exit');
  walk(shift, guest, 'leave', SERVICE_ENTRY);
  if (guest.phase === 'exit') guest.deadline = guest.walk.until;
}

function remove(shift, guest) {
  shift.guests.splice(shift.guests.indexOf(guest), 1);
  shift.revision++;
  if (shift.arrived >= shift.limit && !shift.guests.length) shift.finished = true;
}

function transition(shift, guest) {
  if (guest.walk && guest.walk.until <= shift.elapsed) {
    guest.position = guest.walk.path.at(-1).point;
    guest.walk = null;
    shift.revision++;
  }
  if (guest.deadline > shift.elapsed) return;
  switch (guest.phase) {
    case 'enter':
      setPhase(shift, guest, 'seat');
      break;
    case 'toSeat':
      setPhase(shift, guest, 'order');
      break;
    case 'eat':
      if (serviceGuest(shift, guest).extra && !guest.extraServed) setPhase(shift, guest, 'extra');
      else checkout(shift, guest);
      break;
    case 'toPay':
      setPhase(shift, guest, 'pay');
      break;
    case 'clean':
    case 'exit':
      remove(shift, guest);
      break;
    default:
      shift.missed++;
      depart(shift, guest);
  }
}

function arrivalTime(shift) {
  if (shift.arrived >= shift.limit || !Number.isFinite(shift.nextArrival)) return Infinity;
  const present = shift.guests.filter((guest) => !['clean', 'exit'].includes(guest.phase));
  if (present.length >= (shift.tutorial ? 2 : 3)) return Infinity;
  const next = serviceGuest(shift, { id: shift.arrived + 1 });
  if (!next || !canSeatWaiting(shift, [...waitingProfiles(shift), next])) return Infinity;
  const idle = !shift.guests.some((guest) => jobs[guest.phase]);
  return shift.nextArrival - (!shift.tutorial && shift.arrived && idle ? 3 : 0);
}

export function advanceService(shift, seconds) {
  if (shift.finished || !Number.isFinite(seconds) || seconds <= 0) return;
  const end = shift.elapsed + seconds;
  while (!shift.finished) {
    const nextArrival = arrivalTime(shift);
    const next = Math.min(
      nextArrival,
      ...shift.guests.map((guest) => Math.min(guest.deadline, guest.walk?.until ?? Infinity)),
    );
    if (next > end) break;
    shift.elapsed = Math.max(shift.elapsed, next);
    for (const guest of [...shift.guests]) transition(shift, guest);
    if (arrivalTime(shift) <= shift.elapsed) admit(shift);
  }
  shift.elapsed = end;
}

function seedFor(shift, guest, offset = 0) {
  return Math.imul((shift.seed || 0) ^ (guest.id * 131 + offset), 2654435761) >>> 0;
}

function matchingSeat(profile, seat) {
  if (profile.size > seat.capacity) return false;
  if (profile.seat === 'window') return seat.id === 'window';
  if (profile.seat === 'table') return Boolean(seat.radius);
  if (profile.seat === 'bar') return !seat.radius;
  if (profile.seat === 'either') return seat.id !== 'window';
  return true;
}

function occupiedSeats(shift) {
  return new Set(shift.guests.map((entry) => entry.seat).filter(Boolean));
}

export function serviceSeatAvailability(shift, profile) {
  const occupied = occupiedSeats(shift);
  return SERVICE_SEATS.filter((seat) => !occupied.has(seat.id) && matchingSeat(profile, seat));
}

function waitingProfiles(shift, exclude) {
  return shift.guests
    .filter((guest) => guest !== exclude && ['enter', 'seat'].includes(guest.phase))
    .map((guest) => serviceGuest(shift, guest));
}

function canSeatWaiting(shift, profiles, reserved) {
  const occupied = occupiedSeats(shift);
  if (reserved) occupied.add(reserved);
  function assign(index) {
    if (index === profiles.length) return true;
    for (const seat of SERVICE_SEATS) {
      if (occupied.has(seat.id) || !matchingSeat(profiles[index], seat)) continue;
      occupied.add(seat.id);
      if (assign(index + 1)) return true;
      occupied.delete(seat.id);
    }
    return false;
  }
  return assign(0);
}

function seating(shift, guest, profile) {
  const occupied = occupiedSeats(shift);
  const waiting = waitingProfiles(shift, guest);
  const available = SERVICE_SEATS.filter(
    (seat) =>
      !occupied.has(seat.id) &&
      seat.capacity >= profile.size &&
      canSeatWaiting(shift, waiting, seat.id),
  );
  const lines = SEAT_REQUESTS[profile.seat] || SEAT_REQUESTS.any;
  return {
    note: `${profile.size} 位客人 · “${lines[seedFor(shift, guest) % lines.length]}”`,
    cards: SERVICE_SEATS.map((seat) => ({
      id: seat.id,
      label: seat.label,
      detail: `${seat.capacity} 人位 · ${seat.id === 'window' ? '看得见街景' : seat.radius ? '宽桌面' : '临柜台'}`,
      disabled: !available.includes(seat),
    })),
    choices: available.map((seat) => seat.id),
    answers: available.filter((seat) => matchingSeat(profile, seat)).map((seat) => seat.id),
  };
}

function pick(note, choices, answer, extra = {}) {
  return { note, choices: [...new Set(choices)], answers: [answer], ...extra };
}

function foodChoices(dish, index, shift, guest) {
  if (shift.bookings) {
    const distractors = shuffled(
      SERVICE_BASIC_MENU.filter((entry) => entry !== index),
      `${shift.seed}:choices:${guest.id}:${guest.step}`,
    ).slice(0, 3);
    return shuffled([index, ...distractors], `${shift.seed}:options:${guest.id}:${guest.step}`).map(
      (entry) => SERVICE_MENU[entry].name,
    );
  }
  return [
    dish.name,
    ...[1, 3, 4].map((offset) => SERVICE_MENU[(index + offset) % SERVICE_MENU.length].name),
  ].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function orderedSpecial(shift, profile) {
  const special = serviceSpecial(shift.special?.id);
  return special && profile.order.includes(special.index)
    ? { ...special, price: shift.special.price || special.price }
    : null;
}

function totalBill(shift, profile) {
  const special = orderedSpecial(shift, profile);
  const base = profile.order.reduce(
    (sum, index) => sum + (index === special?.index ? special.price : SERVICE_MENU[index].price),
    0,
  );
  const bonus = shift.tutorial ? 0 : servicePriceBonus(shift.staffLevels, shift.reputation);
  return base + Math.floor((base * bonus) / 100) - (profile.coupon || 0);
}

function payPuzzle(shift, guest, profile) {
  const total = totalBill(shift, profile);
  const seed = seedFor(shift, guest, guest.step * 17 + 3);
  const prices = profile.order.map((item) => SERVICE_MENU[item].price);
  const bill = profile.split ? (guest.step ? Math.ceil(total / 2) : Math.floor(total / 2)) : total;
  const paid = Math.ceil((bill + 1) / 5) * 5;
  let note = profile.split
    ? `分开结账 ${guest.step + 1}/2 · 应收 ${bill}，付了 ${paid}，该找多少？`
    : `应收 ${bill}，付了 ${paid}，该找多少？`;
  let answer = paid - bill;
  if (!profile.split && prices.length === 2 && prices[0] + prices[1] === total && seed % 2 === 0) {
    note = `这两样分别是 ${prices[0]} 和 ${prices[1]} 金币，一共多少？`;
    answer = total;
  } else if (!profile.split && profile.coupon) {
    note = `原价 ${total + profile.coupon} 金币，抵扣 ${profile.coupon} 金币，实收多少？`;
    answer = total;
  }
  const candidates = [1, -1, 2, -2, 3, -3, 4]
    .map((offset) => answer + offset)
    .filter((value) => value >= 0);
  const options = Array.from(
    { length: 3 },
    (_, index) => candidates.splice((seed >>> (index * 6)) % candidates.length, 1)[0],
  );
  options.splice((seed >>> 23) % 4, 0, answer);
  return pick(note, options.map(String), String(answer));
}

function sortPuzzle(note, targets) {
  return { note, choices: [], answers: [], sort: targets };
}

function activityPuzzle(kind, shift, guest, label = '') {
  const activity = serviceActivity(kind, guest, shift.elapsed);
  const note = label ? `${label} · ${activity.note}` : activity.note;
  return { note, activity, choices: [], answers: [] };
}

function puzzle(shift, guest) {
  const profile = serviceGuest(shift, guest);
  const request = requestFor(shift, guest);
  const order = profile.order;
  switch (guest.phase) {
    case 'seat':
      return seating(shift, guest, profile);
    case 'order': {
      const index = order[guest.step];
      const dish = SERVICE_MENU[index];
      return pick(
        `${request.orderLine} · 确认第 ${guest.step + 1}/${order.length} 道`,
        foodChoices(dish, index, shift, guest),
        dish.name,
      );
    }
    case 'cook': {
      const dish = SERVICE_MENU[order[guest.course]];
      const label = request.note ? `${dish.name}（${request.note}）` : dish.name;
      if (dish.activity === 'plate')
        return sortPuzzle(`${label} · 把主菜和点缀放进对应盘子`, [
          { id: 'main', label: '主盘', items: [dish.name] },
          { id: 'garnish', label: '点缀碟', items: ['香草', '柠檬片'] },
        ]);
      return activityPuzzle(dish.activity, shift, guest, label);
    }
    case 'deliver': {
      const seat = serviceSeat(guest.seat);
      const mode = shift.bookings
        ? serviceSeed(`${shift.seed}:deliver:${guest.id}`) % 3
        : (guest.id - 1) % 3;
      if (mode === 1)
        return sortPuzzle(
          `${seat.label} · 把每道菜放进对应托盘格`,
          order.map((item, index) => ({
            id: String(index),
            label: SERVICE_MENU[item].name,
            items: [SERVICE_MENU[item].name],
          })),
        );
      return activityPuzzle(mode === 0 ? 'balance' : 'catch', shift, guest, seat.label);
    }
    case 'extra':
      return sortPuzzle(`${serviceSeat(guest.seat).label} · 补上${request.extra}`, [
        { id: 'supply', label: '补给盘', items: [request.extra] },
      ]);
    case 'pay':
      return payPuzzle(shift, guest, profile);
    case 'clean': {
      if (profile.spill === '水渍') return activityPuzzle('mop', shift, guest);
      if (profile.spill === '碎屑' || profile.spill === '油渍')
        return activityPuzzle('wipe', shift, guest);
      return sortPuzzle('把用过的餐具和剩菜分别收进大筐', [
        { id: 'dishes', label: '餐具筐', items: ['空碟', '餐具'] },
        { id: 'scraps', label: '剩菜筐', items: ['剩菜'] },
      ]);
    }
    default:
      return null;
  }
}

export function serviceJob(shift, guest) {
  const job = jobs[guest.phase];
  if (!job) return null;
  const profile = serviceGuest(shift, guest);
  const request = requestFor(shift, guest);
  const current = guest.phase === 'order' ? profile.order[guest.step] : profile.order[guest.course];
  const { answers: _answers, ...game } = puzzle(shift, guest);
  const placed = guest.activity?.placed || [];
  const sort = game.sort && {
    targets: game.sort.map(({ id, label, items }) => ({
      id,
      label,
      placed: items.filter((item) => placed.includes(item)),
    })),
    tokens: [...new Set(game.sort.flatMap((target) => target.items))]
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map((name) => ({ name, placed: placed.includes(name) })),
  };
  if (sort) sort.items = sort.tokens.filter((token) => !token.placed).map((token) => token.name);
  return {
    ...game,
    sort,
    role: job[0],
    title: job[1],
    time: Math.max(0, Math.ceil(guest.deadline - shift.elapsed)),
    phase: guest.phase,
    step: guest.step,
    course: guest.course,
    order: profile.order.map((item) => SERVICE_MENU[item].name),
    dish: current == null ? '' : SERVICE_MENU[current].name,
    note: game.note || request.note,
  };
}

function applySuccess(shift, guest, choice) {
  const profile = serviceGuest(shift, guest);
  switch (guest.phase) {
    case 'seat': {
      const seat = serviceSeat(choice);
      guest.seat = seat.id;
      walk(shift, guest, 'toSeat', seatPoint(seat));
      break;
    }
    case 'order':
      if (++guest.step >= profile.order.length) setPhase(shift, guest, 'cook');
      break;
    case 'cook':
      if (++guest.course === profile.order.length) setPhase(shift, guest, 'deliver');
      else {
        guest.activity = null;
        guest.cookSince = shift.elapsed;
      }
      break;
    case 'deliver':
      if (orderedSpecial(shift, profile)) shift.special.sold++;
      setPhase(shift, guest, 'eat', 6);
      break;
    case 'extra':
      guest.extraServed = true;
      checkout(shift, guest);
      break;
    case 'pay':
      if (profile.split && guest.step++ === 0) break;
      shift.earned += totalBill(shift, profile) + Math.floor((guest.deadline - shift.elapsed) / 8);
      shift.served++;
      if (orderedSpecial(shift, profile)) shift.special.paid++;
      depart(shift, guest);
      break;
    case 'clean':
      shift.cleaned++;
      guest.seat = null;
      if (!guest.walk) remove(shift, guest);
      else {
        setPhase(shift, guest, 'exit');
        guest.deadline = guest.walk.until;
      }
      break;
  }
}

function success(shift, guest, choice) {
  const phase = guest.phase;
  applySuccess(shift, guest, choice);
  if (guest.phase === phase && shift.guests.includes(guest)) return;
  const role = jobs[phase][0];
  const completed = (shift.completedByRole ||= {});
  completed[role] = (completed[role] || 0) + 1;
}

function activeGuest(shift, guestId) {
  if (shift.finished) return null;
  return shift.guests.find((guest) => guest.id === guestId && shift.elapsed < guest.deadline);
}

export function tryAutoService(shift, guestId) {
  const guest = activeGuest(shift, guestId);
  const phase = guest?.phase;
  const job = jobs[phase];
  if (!job || shift.tutorial) return false;
  const chance = serviceAutoChance(shift.staffLevels?.[job[0]] || 0);
  const roll = serviceSeed(`${shift.seed}:auto:${guest.id}:${phase}`) % 100;
  if (roll >= chance) return false;
  const choice = phase === 'seat' ? puzzle(shift, guest).answers[0] : undefined;
  if (phase === 'seat' && !choice) return false;
  do {
    success(shift, guest, choice);
  } while (guest.phase === phase && shift.guests.includes(guest));
  guest.error = '';
  shift.revision++;
  return true;
}

function serviceMistake(guest, game) {
  if (guest.phase === 'seat') return '这个位置不合适 · 先看人数，再看客人想要的桌型';
  if (guest.phase === 'order') return '不是这道菜 · 对照点单图标再选一次';
  if (guest.phase === 'pay') return '数目不对 · 重新算一遍，客人还在等找零';
  if (game.sort) return '这样分不对 · 把东西放进正确的筐里';
  return '再试一次 · 客人还在等候';
}

export function performService(shift, guestId, choice, targetId) {
  const guest = activeGuest(shift, guestId);
  if (!guest) return false;
  const game = puzzle(shift, guest);
  if (!game) return false;
  let correct;
  if (game.sort) {
    const placed = ((guest.activity ||= {}).placed ||= []);
    const target = game.sort.find((entry) => entry.id === targetId);
    correct = Boolean(target?.items.includes(choice) && !placed.includes(choice));
    if (correct) {
      placed.push(choice);
      if (game.sort.every((entry) => entry.items.every((item) => placed.includes(item))))
        success(shift, guest);
    }
  } else {
    if (!game.choices.includes(choice)) return false;
    correct = game.answers.includes(choice);
    if (correct) success(shift, guest, choice);
  }
  guest.error = correct ? '' : serviceMistake(guest, game);
  shift.revision++;
  return correct;
}

export function performServiceGesture(shift, guestId, kind, input, onFrame) {
  const guest = activeGuest(shift, guestId);
  if (!guest) return false;
  const activity = puzzle(shift, guest)?.activity;
  if (activity?.kind !== kind) return false;
  const marksBefore = guest.activity?.marks?.length ?? 0;
  const result = applyServiceGesture(activity, input);
  if (!result.valid) return false;
  guest.activity = result.state;
  onFrame?.({ ...activity, state: result.state });
  const marksChanged = (guest.activity?.marks?.length ?? 0) !== marksBefore;
  if (input.type === 'release' || result.done || marksChanged) {
    guest.error = result.error;
    shift.revision++;
  }
  if (result.done) success(shift, guest);
  return result.done;
}

export function restoreServiceShift(raw) {
  if (raw.version === 4 || raw.version === 3) return raw;
  if (raw.version === 2) {
    const shift = { ...raw, version: 3, seed: 0, revision: raw.revision || 0 };
    shift.guests = raw.guests.map((guest) => ({
      ...guest,
      activity: null,
      step:
        guest.phase === 'order'
          ? Math.min(guest.step || 0, serviceGuest(shift, guest).order.length - 1)
          : guest.step,
      cookSince: raw.elapsed,
    }));
    return shift;
  }
  const shift = {
    ...newServiceShift({}, raw.tutorial, 0),
    ...raw,
    bookings: null,
    version: 3,
    revision: 0,
  };
  shift.nextArrival = raw.elapsed + 2;
  shift.limit = Math.max(shift.arrived, raw.limit);
  shift.guests = raw.guests.map((guest) => {
    const seat = SERVICE_SEATS[guest.table - 1];
    return {
      id: guest.id,
      seat: seat.id,
      position: seatPoint(seat),
      legacy: {
        ...SERVICE_PARTIES[guest.id - 1],
        order: [guest.menu],
        note: '',
        extra: '',
        split: false,
        coupon: 0,
        spill: '',
      },
      phase: guest.phase,
      deadline: Math.max(raw.elapsed + 6, guest.deadline),
      step: 0,
      course: 0,
      error: '',
      cookSince: raw.elapsed,
    };
  });
  return shift;
}
