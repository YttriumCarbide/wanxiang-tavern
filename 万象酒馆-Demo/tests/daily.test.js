import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateDaily,
  arrangeDaily,
  consumeOutingAction,
  dailyPlan,
  dailySceneTime,
  finishDaily,
  restoreDaily,
  serviceStaff,
  startDailyPlan,
} from '../src/daily.js';
import {
  advanceService,
  newServiceShift,
  performService,
  performServiceGesture,
  serviceGuest,
  serviceJob,
  serviceSeatAvailability,
  tryAutoService,
} from '../src/tavern-service.js';
import {
  restoreServiceGrowth,
  serviceAutoChance,
  serviceProficiency,
  settleServiceGrowth,
} from '../src/service-progression.js';
import { SERVICE_PATCHES, applyServiceGesture, serviceActivity } from '../src/service-gestures.js';
import { serviceGameMarkup } from '../src/app/service-game-view.js';
import { SERVICE_CUES } from '../src/audio/cues.js';
import { SERVICE_ENTRY, seatPoint, servicePosition, serviceSeat } from '../src/service-walk.js';
import {
  applyInvitationPatches,
  invitationAdvance,
  invitationBrief,
  invitationNextScene,
  invitationRecord,
  invitationSceneProse,
  invitationTrust,
  normalizeInvitationPlan,
} from '../src/invitation.js';
import { fullInvitation } from './fixtures/invitation.js';
import {
  invitationChatInstruction,
  invitationRequest,
  invitationResponse,
} from '../src/ai/pipeline/invitation-request.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { chatResponse } from '../src/ai/pipeline/chat-response.js';
import { createConnectionStore } from '../src/ai/connection-store.js';
import { claimEnemyDrops, enemyDropTable } from '../src/enemy-drops.js';
import { DEFINITIONS } from '../src/data.js';
import { worldReference } from '../src/worlds.js';
import { newLibrary } from '../src/ai/library.js';
import { DROP_GROUPS } from '../src/content/enemy-drops.js';
import { DISHES, INGREDIENTS } from '../src/content/dining.js';
import { SERVICE_BASIC_MENU, SERVICE_MENU } from '../src/content/tavern-service.js';
import {
  reserveServiceSpecial,
  returnServiceSpecialStock,
  serviceSpecial,
} from '../src/service-specials.js';
import { ITEMS } from '../src/content/items.js';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { applyRelationshipActions } from '../src/relationships.js';

test('nighttime follows the appointment slot and time spent on a multi-period outing', () => {
  assert.equal(dailySceneTime(null), null);
  assert.equal(dailySceneTime({ kind: 'invitation', at: 3 }), 'night');
  const outing = { kind: 'outing', at: 2, ap: 2, stage: 'roaming', remaining: 11 };
  assert.equal(dailySceneTime(outing), 'day');
  assert(consumeOutingAction(outing));
  assert.equal(dailySceneTime(outing), 'night');
});

test('four slots reject overlap and join only adjacent outings, with resumable receipts', () => {
  const state = restoreDaily();
  state.draft = arrangeDaily([], 'service', 0);
  state.draft = arrangeDaily(state.draft, 'outing', 1);
  state.draft = arrangeDaily(state.draft, 'outing', 2);
  assert.throws(() => arrangeDaily(state.draft, 'dungeon', 0), /已经安排/);
  assert.throws(() => arrangeDaily(state.draft, 'dungeon', 3), /放不进/);
  assert.deepEqual(arrangeDaily(state.draft, '', 2), [
    { kind: 'service', at: 0, ap: 1 },
    { kind: 'outing', at: 1, ap: 1 },
  ]);
  assert.equal(startDailyPlan(state).kind, 'service');
  assert.equal(finishDaily(state, 'service', '首班完成'), true);
  assert.equal(finishDaily(state, 'service', '不能重复收款'), false);
  const resumed = restoreDaily(state);
  assert.equal(activateDaily(resumed), null);
  assert.equal(resumed.report, '首班完成');
  resumed.report = null;
  const outing = activateDaily(resumed);
  assert.equal(outing.remaining, 20);
  assert.equal(consumeOutingAction(outing), false);
  outing.stage = 'roaming';
  for (let n = 0; n < 20; n++) assert(consumeOutingAction(outing));
  assert.equal(consumeOutingAction(outing), false);
  assert.equal(finishDaily(resumed, 'outing', '返馆'), true);
  resumed.report = null;
  assert.equal(activateDaily(resumed), null);
  assert.equal(resumed.day, 2);
  assert.deepEqual(dailyPlan(resumed.plan).slots, [null, null, null, null]);
});

function gesture(shift, guest, type, from, to, seconds = 0, start = from) {
  const kind = serviceJob(shift, guest).activity.kind;
  return performServiceGesture(shift, guest.id, kind, {
    type,
    from: { x: from[0], y: from[1] },
    to: { x: to[0], y: to[1] },
    start: { x: start[0], y: start[1] },
    seconds,
  });
}

function fixedService(staff = {}) {
  return { ...newServiceShift(staff, false, 17), version: 3, bookings: null, staffLevels: {} };
}

test('seating, order, gestures and arithmetic settle one live party while others keep their deadlines', () => {
  const members = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  assert.throws(
    () => serviceStaff({ front: 'a', cook: 'b', server: 'a', clean: 'd' }, members),
    /四名不同/,
  );
  const staff = serviceStaff({ front: 'a', cook: 'b', server: 'c', clean: 'd' }, members);
  const shift = fixedService(staff);
  advanceService(shift, 1);
  const [first] = shift.guests;
  assert.equal(first.phase, 'enter');
  assert.deepEqual(servicePosition(first, shift.elapsed).slice(1), SERVICE_ENTRY.slice(1));
  advanceService(shift, first.walk.until - shift.elapsed);
  assert.equal(serviceJob(shift, first).cards.length, 5);
  assert(!performService(shift, first.id, 'bar-1'));
  assert(performService(shift, first.id, 'hall'));
  advanceService(shift, first.walk.until - shift.elapsed);
  assert.deepEqual(servicePosition(first, shift.elapsed), seatPoint(serviceSeat('hall')));
  assert(performService(shift, first.id, '香草烤鸡'));

  assert.equal(serviceJob(shift, first).activity.kind, 'heat');
  assert(!performService(shift, first.id, '出锅'));
  for (let i = 0; i < 12; i++) gesture(shift, first, 'hold', [0.62, 0.5], [0.62, 0.5], 0.1);
  assert.equal(serviceJob(shift, first).activity.kind, 'balance');
  for (let i = 0; i < 20 && first.phase === 'deliver'; i++) {
    const y = 0.9 - i * 0.04;
    gesture(shift, first, 'move', [0.5, y], [0.5, y - 0.04], 0.07);
  }
  assert.equal(first.phase, 'eat');
  advanceService(shift, 12);
  assert(shift.arrived >= 2);
  const bill = serviceJob(shift, first);
  assert.equal(new Set(bill.choices).size, 4);
  assert(bill.choices.every((choice) => /^\d+$/.test(choice)));
  assert(
    !performService(
      shift,
      first.id,
      bill.choices.find((choice) => choice !== '3'),
    ),
  );
  assert.deepEqual(serviceJob(shift, first).choices, bill.choices);
  assert(performService(shift, first.id, '3'));
  assert(!performService(shift, first.id, '3'));
  const gold = shift.earned;
  assert(!performService(shift, first.id, '剩菜', 'dishes'));
  assert(performService(shift, first.id, '空碟', 'dishes'));
  assert(performService(shift, first.id, '餐具', 'dishes'));
  assert(performService(shift, first.id, '剩菜', 'scraps'));
  assert.equal(shift.cleaned, 1);
  assert.equal(shift.earned, gold);
  advanceService(shift, 240);
  assert.equal(shift.served, 1);
  assert.equal(shift.finished, true);
  assert.equal(shift.arrived, 7);
});

test('split cash, seat requirements, cooking progress and sorting are checked by the shift', () => {
  const shift = fixedService();
  advanceService(shift, 15);
  const party = shift.guests.find(({ id }) => id === 2);
  if (party.phase === 'enter') advanceService(shift, party.walk.until - shift.elapsed);
  const act = (choice, target) => assert(performService(shift, party.id, choice, target), choice);
  assert(!performService(shift, party.id, 'hall'));
  act('window');
  advanceService(shift, party.walk.until - shift.elapsed);
  act('田园煎鱼');
  act('薄荷蜜茶');
  assert.match(serviceJob(shift, party).note, /少盐|酱汁另放|汤别太烫/);
  assert(gesture(shift, party, 'move', [0.18, 0.52], [0.8, 0.52]));
  assert.equal(serviceJob(shift, party).activity.kind, 'pour');
  for (let i = 0; i < 12; i++) gesture(shift, party, 'hold', [0.59, 0.28], [0.59, 0.28], 0.1);
  assert(gesture(shift, party, 'move', [0.59, 0.28], [0.32, 0.28]));
  act('田园煎鱼', '0');
  act('薄荷蜜茶', '1');
  advanceService(shift, 6);
  act(serviceJob(shift, party).sort.items[0], 'supply');
  advanceService(shift, party.walk.until - shift.elapsed);
  act('1');
  assert.equal(shift.earned, 0);
  act('1');
  assert(shift.earned > 0);
  assert.equal(serviceJob(shift, party).activity.kind, 'mop');
  assert(gesture(shift, party, 'move', [0.15, 0.84], [0.83, 0.16]));
  assert.equal(shift.cleaned, 1);
});

test('the menu has broad choices, real dish art and varied spoken orders', () => {
  assert(SERVICE_MENU.length >= 15);
  assert(SERVICE_MENU.every((item) => DISHES[item.artId]?.name));
  const verbs = new Set(SERVICE_MENU.map((item) => item.activity));
  assert(verbs.size >= 9);
  for (const verb of ['whisk', 'sear', 'skim', 'knead', 'pipe', 'plate']) assert(verbs.has(verb));
  assert.equal(SERVICE_BASIC_MENU.length, 16);
  const dishes = new Set();
  const firstGuests = new Set();
  const lines = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const shift = newServiceShift({}, false, seed);
    for (const party of shift.bookings) for (const dish of party.order) dishes.add(dish);
    firstGuests.add(shift.bookings[0].name);
    advanceService(shift, 1);
    const [guest] = shift.guests;
    assert(guest?.request?.orderLine, `seed ${seed} has a spoken order`);
    lines.add(guest.request.orderLine);
  }
  assert.deepEqual(dishes, new Set(SERVICE_BASIC_MENU));
  assert(firstGuests.size >= 8);
  assert(lines.size >= 3, 'order wording changes between shifts');
});

test('service experience persists by role and reputation increases orders and prices', () => {
  const growth = restoreServiceGrowth({ reputation: 24 });
  const staff = { front: 'a', cook: 'b', server: 'c', clean: 'd' };
  const before = serviceProficiency(growth, staff.front, 'front');
  const cook = serviceProficiency(growth, staff.front, 'cook');
  const regular = newServiceShift(staff, false, 17, growth);
  const progress = settleServiceGrowth(growth, {
    staff,
    completedByRole: { front: 12, cook: 2 },
    served: 4,
    missed: 2,
  });
  assert.equal(progress.reputationChange, 2);
  const restored = restoreDaily({ serviceGrowth: growth }).serviceGrowth;
  assert.equal(serviceProficiency(restored, staff.front, 'front'), before + 8);
  assert.equal(serviceProficiency(restored, staff.front, 'cook'), cook);
  assert.equal(regular.limit, 7);
  assert.equal(newServiceShift(staff, false, 17, restored).limit, 8);

  const high = newServiceShift(staff, false, 17, {
    reputation: 100,
    training: { a: { front: 100 } },
  });
  assert.equal(high.limit, 11);
  for (const shift of [regular, high]) {
    advanceService(shift, 1);
    const [guest] = shift.guests;
    advanceService(shift, guest.walk.until - shift.elapsed);
    guest.phase = 'pay';
  }
  assert(high.guests[0].deadline > regular.guests[0].deadline);
  const highBill = serviceJob(high, high.guests[0]).note;
  const standardBill = serviceJob(regular, regular.guests[0]).note;
  assert.notEqual(highBill, standardBill);
});

test('opening a skilled ticket resolves the entire order once using the normal phase transition', () => {
  assert.equal(serviceAutoChance(39), 0);
  const outcomes = new Set();
  for (let seed = 1; seed <= 25; seed++) {
    const shift = newServiceShift({ server: 'a' }, false, seed, {
      training: { a: { server: 100 } },
    });
    const guest = { id: 2, phase: 'order', step: 0, course: 0, deadline: 30 };
    shift.guests = [guest];
    const restored = JSON.parse(JSON.stringify(shift));
    const auto = tryAutoService(shift, guest.id);
    outcomes.add(auto);
    assert.equal(tryAutoService(restored, guest.id), auto);
    assert.equal(guest.phase, auto ? 'cook' : 'order');
    assert.equal(shift.completedByRole.server, auto ? 1 : undefined);
    if (!auto) assert.equal(tryAutoService(shift, guest.id), false);
  }
  assert.deepEqual(outcomes, new Set([true, false]));
});

test('arrivals wait for a compatible free seat instead of generating a standing queue', () => {
  const shift = fixedService();
  shift.arrived = 1;
  shift.nextArrival = 0;
  shift.elapsed = 0;
  shift.guests = [
    {
      id: 1,
      seat: 'window',
      phase: 'order',
      deadline: 99,
      step: 0,
      course: 0,
      error: '',
      position: [0, 0],
      queue: 1,
    },
  ];
  advanceService(shift, 1);
  assert.equal(shift.arrived, 1);
  assert.equal(shift.guests.length, 1);
  shift.guests[0].seat = null;
  advanceService(shift, 1);
  assert.equal(shift.arrived, 2, 'the window party enters once the requested seat is free');
});

test('staggered seven-table shifts keep a prompt player busy without timing them out', () => {
  const move = (from, to, seconds = 0.16) => ['move', from, to, seconds];
  const hold = (point, ticks) => Array.from({ length: ticks }, () => ['hold', point, point, 0.1]);
  const strokes = (count) =>
    Array.from({ length: count }, (_, index) => {
      const x = index % 2 ? 0.82 : 0.18;
      return move([x, 0.5], [1 - x, 0.5], 0.38);
    });
  const stir = (step) => [0.5 + Math.cos(step * 0.3) * 0.17, 0.5 + Math.sin(step * 0.3) * 0.33];
  const routes = {
    heat: hold([0.62, 0.8], 12),
    balance: Array.from({ length: 18 }, (_, i) =>
      move([0.5, 0.92 - i * 0.042], [0.5, 0.878 - i * 0.042], 0.09),
    ),
    cut: [move([0.18, 0.52], [0.8, 0.52], 0.38)],
    pour: [...hold([0.59, 0.28], 12), move([0.59, 0.28], [0.32, 0.28])],
    season: [move([0.18, 0.46], [0.82, 0.46], 0.5)],
    skim: SERVICE_PATCHES.skim.map(([x, y]) => move([x - 0.03, y], [x + 0.03, y], 0.45)),
    stir: Array.from({ length: 34 }, (_, i) => move(stir(i), stir(i + 1))),
    pipe: SERVICE_PATCHES.pipe.map(([x, y]) => move([x - 0.02, y], [x + 0.02, y], 0.32)),
    knead: SERVICE_PATCHES.knead.map((point) => move(point, [0.5, 0.51], 0.5)),
    roll: strokes(3),
    whisk: strokes(5),
    sear: SERVICE_PATCHES.sear.flatMap((point) => hold(point, 5)),
    flip: [move([0.73, 0.71], [0.73, 0.31], 0.3)],
    catch: [0.27, 0.72, 0.46].flatMap((x) => hold([x, 0.85], 11)),
    mop: [move([0.15, 0.84], [0.83, 0.16], 0.8)],
    wipe: SERVICE_PATCHES.wipe.map(([x, y]) => move([x - 0.02, y], [x + 0.02, y], 0.3)),
  };
  const patterns = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const inventory = { 'frost-oyster': 2, milk: 3 };
    const special =
      seed === 20 ? reserveServiceSpecial(inventory, { id: 'frost-chowder', portions: 2 }) : null;
    const shift = newServiceShift({}, false, seed, null, special);
    if (special) {
      const dish = serviceSpecial(special.id).index;
      assert.equal(shift.bookings.filter(({ order }) => order.includes(dish)).length, 2);
      assert.deepEqual(inventory, { 'frost-oyster': 0, milk: 1 });
    }
    const arrivals = [];
    let parallel = false;
    let idle = 0;
    let longestIdle = 0;
    function spend(seconds) {
      advanceService(shift, seconds);
      for (const guest of shift.guests) {
        if (guest.phase === 'enter' && arrivals[guest.id - 1] == null)
          arrivals[guest.id - 1] = guest.walk.at;
      }
      assert(shift.guests.filter((guest) => !['clean', 'exit'].includes(guest.phase)).length <= 3);
    }
    while (!shift.finished && shift.elapsed < 240) {
      const queue = shift.guests
        .filter((guest) => serviceJob(shift, guest))
        .sort((a, b) => a.deadline - b.deadline);
      parallel ||= queue.length > 1;
      const [guest] = queue;
      if (!guest) {
        spend(0.2);
        if (shift.served < shift.limit) longestIdle = Math.max(longestIdle, (idle += 0.2));
        continue;
      }
      idle = 0;
      const job = serviceJob(shift, guest);
      spend(1.6);
      if (job.activity) {
        const kind = job.activity.kind;
        let done = false;
        for (const [type, from, to, seconds] of routes[kind]) {
          spend(seconds);
          done = gesture(shift, guest, type, from, to, seconds);
          if (done) break;
        }
        assert(done, `${seed} ${guest.id} ${kind}`);
      } else if (job.sort) {
        for (const target of job.sort.targets) {
          for (const name of job.sort.items.filter(
            (item) =>
              item === target.label ||
              target.id === 'supply' ||
              (target.id === 'main' && item === job.dish) ||
              (target.id === 'garnish' && item !== job.dish) ||
              (target.id === 'dishes' && item !== '剩菜') ||
              (target.id === 'scraps' && item === '剩菜'),
          )) {
            spend(0.65);
            assert(performService(shift, guest.id, name, target.id));
          }
        }
      } else {
        let choice = job.dish;
        if (job.phase === 'seat') {
          const profile = serviceGuest(shift, guest);
          choice = serviceSeatAvailability(shift, profile).find(({ id }) =>
            job.choices.includes(id),
          ).id;
        }
        if (job.phase === 'pay') {
          const [a, b] = job.note.match(/\d+/g).slice(-2).map(Number);
          choice = String(
            job.note.includes('一共') ? a + b : job.note.includes('实收') ? a - b : b - a,
          );
        }
        assert(performService(shift, guest.id, choice), `${seed} ${guest.id} ${job.phase}`);
      }
    }
    assert(shift.finished);
    assert.equal(shift.served, 7, `seed ${seed}`);
    assert.equal(shift.missed, 0, `seed ${seed}`);
    if (special) {
      assert.equal(special.sold, 2);
      assert.equal(special.paid, 2);
      assert.equal(returnServiceSpecialStock(inventory, special), 0);
      assert.deepEqual(inventory, { 'frost-oyster': 0, milk: 1 });
      assert.equal(settleServiceGrowth(restoreServiceGrowth(), shift).reputationChange, 9);
    }
    assert(parallel, `seed ${seed} has overlapping tickets`);
    assert(longestIdle < 10, `seed ${seed} waits ${longestIdle.toFixed(1)} seconds`);
    assert.equal(arrivals.filter(Number.isFinite).length, 7);
    assert(arrivals.slice(1).every((time, i) => time - arrivals[i] >= 7));
    patterns.add(arrivals.join(','));
  }
  assert(patterns.size >= 6);
});

test('specials reserve only available ingredients and return unsold portions once after reload', () => {
  const inventory = { 'frost-oyster': 2, milk: 3 };
  assert.throws(() => reserveServiceSpecial(inventory, { id: 'frost-chowder', portions: 3 }));
  assert.deepEqual(inventory, { 'frost-oyster': 2, milk: 3 });
  const special = reserveServiceSpecial(inventory, { id: 'frost-chowder', portions: 2 });
  const restored = JSON.parse(JSON.stringify({ ...special, sold: 1 }));
  assert.equal(returnServiceSpecialStock(inventory, restored), 1);
  assert.equal(returnServiceSpecialStock(inventory, restored), 0);
  assert.deepEqual(inventory, { 'frost-oyster': 1, milk: 2 });
});

test('plating a cold dish is a drag-to-plate puzzle instead of a fire gesture', () => {
  const shift = fixedService();
  while (shift.arrived < 4 && shift.elapsed < 90) advanceService(shift, 1);
  const guest = shift.guests.find(({ id }) => id === 4);
  assert(guest, 'the fourth guest arrives');
  guest.phase = 'cook';
  guest.seat = 'hall';
  guest.step = 0;
  guest.course = 1;
  guest.deadline = shift.elapsed + 30;
  guest.activity = null;
  const job = serviceJob(shift, guest);
  assert.equal(job.sort.targets.length, 2);
  assert(job.sort.items.includes('旅人奶酪拼盘'));
  assert(!job.activity, 'plating is not a fire gesture');
  for (const item of job.sort.items) {
    const target = job.sort.targets.find(
      (entry) => entry.label === (item === '旅人奶酪拼盘' ? '主盘' : '点缀碟'),
    );
    assert(performService(shift, guest.id, item, target.id));
  }
  assert.equal(guest.phase, 'deliver');
});

test('a missed deadline sends the guest away and is counted on the shift receipt', () => {
  const shift = newServiceShift({}, false, 17);
  advanceService(shift, 1);
  const guest = shift.guests[0];
  guest.phase = 'order';
  guest.seat = 'hall';
  guest.deadline = shift.elapsed + 1;
  const missed = shift.missed;
  advanceService(shift, 2);
  assert.equal(shift.missed, missed + 1);
  assert.equal(guest.phase, 'clean');
  assert.equal(guest.seat, 'hall');
});

test('the first shift admits a new party while cooking progress is preserved', () => {
  const shift = newServiceShift({}, true);
  advanceService(shift, 5);
  const [first] = shift.guests;
  assert(performService(shift, first.id, 'hall'));
  advanceService(shift, 9);
  const second = shift.guests.find(({ id }) => id === 2);
  assert.equal(first.phase, 'order');
  assert.equal(second.phase, 'seat');
  assert(performService(shift, first.id, '香草烤鸡'));
  gesture(shift, first, 'hold', [0.64, 0.5], [0.64, 0.5], 0.1);
  const progress = serviceJob(shift, first).activity.state.progress;
  assert(performService(shift, second.id, 'bar-1'));
  advanceService(shift, 4);
  assert(progress > 0);
  assert.equal(serviceJob(shift, first).activity.state.progress, progress);
  assert.equal(second.phase, 'order');
  assert.equal(shift.arrived, 2);
  advanceService(shift, 52);
  assert.equal(shift.arrived, 3);
});

test('whisking, searing, skimming, kneading and piping add different cooking motions', () => {
  const whisk = serviceActivity('whisk', { cookSince: 0 }, 2);
  let whiskState = { ...whisk.state };
  let whisked = false;
  let from = { x: 0.2, y: 0.5 };
  for (let stroke = 0; stroke < 7 && !whisked; stroke++) {
    const to = { x: from.x < 0.5 ? 0.8 : 0.2, y: 0.5 };
    const result = applyServiceGesture(
      { ...whisk, state: whiskState },
      { type: 'move', from, to, start: from, seconds: 0 },
    );
    whiskState = result.state;
    whisked = result.done;
    from = to;
  }
  assert(whisked, 'six back-and-forth strokes finish the whisking game');

  const sear = serviceActivity('sear', { cookSince: 0 }, 2);
  let searState = { ...sear.state };
  let seared = false;
  for (const [x, y] of SERVICE_PATCHES.sear) {
    for (let press = 0; press < 4 && !seared; press++) {
      const result = applyServiceGesture(
        { ...sear, state: searState },
        {
          type: 'hold',
          from: { x, y },
          to: { x, y },
          start: { x, y },
          seconds: 0.2,
        },
      );
      searState = result.state;
      seared = result.done;
    }
  }
  assert(seared, 'holding each steak finishes searing');

  const skim = serviceActivity('skim', { cookSince: 0 }, 2);
  let skimState = { ...skim.state };
  let skimmed = false;
  for (const [x, y] of SERVICE_PATCHES.skim) {
    const result = applyServiceGesture(
      { ...skim, state: skimState },
      {
        type: 'move',
        from: { x: x - 0.01, y },
        to: { x: x + 0.01, y },
        start: { x: x - 0.01, y },
        seconds: 0,
      },
    );
    skimState = result.state;
    skimmed = result.done;
  }
  assert(skimmed, 'skimming clears every marked spot');

  const knead = serviceActivity('knead', { cookSince: 0 }, 2);
  let kneadState = { ...knead.state };
  let kneaded = false;
  for (const [x, y] of SERVICE_PATCHES.knead) {
    const result = applyServiceGesture(
      { ...knead, state: kneadState },
      { type: 'move', from: { x, y }, to: { x: 0.5, y: 0.51 }, start: { x, y }, seconds: 0 },
    );
    kneadState = result.state;
    kneaded = result.done;
  }
  assert(kneaded, 'folding from each edge finishes kneading');

  const pipe = serviceActivity('pipe', { cookSince: 0 }, 2);
  let pipeState = { ...pipe.state };
  let piped = false;
  for (const [x, y] of SERVICE_PATCHES.pipe) {
    const result = applyServiceGesture(
      { ...pipe, state: pipeState },
      {
        type: 'move',
        from: { x: x - 0.01, y },
        to: { x: x + 0.01, y },
        start: { x: x - 0.01, y },
        seconds: 0,
      },
    );
    pipeState = result.state;
    piped = result.done;
  }
  assert(piped, 'following the four star points finishes piping');
});

test('tavern cooking and service actions have dedicated sound cues', () => {
  for (const name of [
    'service-bell',
    'service-chop',
    'service-sizzle',
    'service-pour',
    'service-stir',
    'service-whisk',
    'service-knead',
    'service-pipe',
    'service-skim',
    'service-tray',
    'service-cleaning',
    'service-done',
    'service-fail',
    'service-coin',
    'service-lost',
  ])
    assert(SERVICE_CUES[name]?.length > 0, name);
});

test('every cooking verb renders its own play surface', () => {
  const base = {
    guest: { id: 1, error: '' },
    phase: 'cook',
    step: 0,
    course: 0,
    order: ['香草烤鸡'],
    dish: '香草烤鸡',
    note: '',
    choices: [],
    cards: null,
    sort: null,
  };
  const verbs = new Set(
    SERVICE_MENU.map((item) => item.activity).filter((kind) => kind !== 'plate'),
  );
  for (const kind of verbs) {
    const markup = serviceGameMarkup({
      ...base,
      activity: serviceActivity(kind, { cookSince: 0 }, 2),
    });
    assert.match(markup, new RegExp(`data-activity="${kind}"`), `${kind} has a play area`);
    assert.match(markup, /data-cook-art/);
    assert.match(markup, /data-cook-tool/);
  }
  const plate = serviceGameMarkup({
    ...base,
    phase: 'cook',
    sort: {
      targets: [
        { id: 'main', label: '主盘' },
        { id: 'garnish', label: '点缀碟' },
      ],
      items: ['旅人奶酪拼盘', '香草', '柠檬片'],
    },
  });
  assert.match(plate, /class="service-sort"/);
});

test('a stationary cup fills only when the kettle docks and can be finished by moving away', () => {
  let activity = serviceActivity('pour', { cookSince: 0 }, 2);
  function sample(type, x, y, seconds = 0) {
    const to = { x, y };
    const result = applyServiceGesture(activity, { type, from: to, to, start: to, seconds });
    activity = { ...activity, state: result.state };
    return result;
  }
  for (let i = 0; i < 8; i++) sample('hold', 0.59, 0.75, 0.1);
  assert.equal(activity.state.fill || 0, 0, 'below the rim the kettle stays upright');
  for (let i = 0; i < 12; i++) sample('hold', 0.59, 0.28, 0.1);
  assert(activity.state.fill > 0.68 && activity.state.flow);
  assert(sample('move', 0.3, 0.28).done);
  assert(!activity.state.flow);
});

test('one held sweep cuts multiple ingredients before pointer release', () => {
  const activity = serviceActivity('cut', { cookSince: 0 }, 2);
  const from = { x: 0.18, y: 0.52 };
  const to = { x: 0.8, y: 0.52 };
  const missed = applyServiceGesture(activity, {
    type: 'move',
    from: { ...from, y: 0.15 },
    to: { ...to, y: 0.15 },
    start: from,
    seconds: 0,
  });
  assert.equal(missed.state.marks.length, 0);
  const swept = applyServiceGesture(activity, { type: 'move', from, to, start: from, seconds: 0 });
  assert(swept.done);
  assert.equal(swept.state.marks.length, 3);
});

test('stirring, rolling, flipping, seasoning and catching use different gesture rules', () => {
  function run(kind, move) {
    let activity = serviceActivity(kind, { cookSince: 0 }, 2);
    for (const [from, to, seconds = 0.08, type = 'move'] of move) {
      const result = applyServiceGesture(activity, {
        from: { x: from[0], y: from[1] },
        to: { x: to[0], y: to[1] },
        start: { x: from[0], y: from[1] },
        seconds,
        type,
      });
      if (result.done) return true;
      activity = { ...activity, state: result.state };
    }
    return false;
  }
  const point = (index) => [0.5 + Math.cos(index * 0.3) * 0.17, 0.5 + Math.sin(index * 0.3) * 0.33];
  assert(
    run(
      'stir',
      Array.from({ length: 34 }, (_, index) => [point(index), point(index + 1)]),
    ),
  );
  assert(
    run('roll', [
      [
        [0.5, 0.5],
        [0.2, 0.5],
      ],
      [
        [0.2, 0.5],
        [0.8, 0.5],
      ],
      [
        [0.8, 0.5],
        [0.2, 0.5],
      ],
      [
        [0.2, 0.5],
        [0.8, 0.5],
      ],
    ]),
  );
  assert(run('flip', [[[0.5, 0.8], [0.5, 0.2], 0, 'move']]));
  assert(
    run('season', [
      [
        [0.15, 0.46],
        [0.85, 0.46],
      ],
    ]),
  );
  assert(
    run(
      'catch',
      [0.27, 0.72, 0.46].flatMap((x) =>
        Array.from({ length: 11 }, () => [[x, 0.85], [x, 0.85], 0.1, 'hold']),
      ),
    ),
  );
});

test('an in-progress old service save preserves receipts and resumes on a real seat', () => {
  const state = restoreDaily();
  state.draft = arrangeDaily([], 'service', 0);
  const entry = startDailyPlan(state);
  entry.stage = 'running';
  entry.shift = {
    staff: {},
    tutorial: false,
    elapsed: 79,
    nextArrival: 81,
    arrived: 7,
    limit: 8,
    guests: [{ id: 7, table: 2, menu: 2, phase: 'cook', step: 2, deadline: 90 }],
    earned: 24,
    served: 2,
    missed: 4,
    finished: false,
  };
  const shift = restoreDaily(state).active.shift;
  assert.equal(shift.earned, 24);
  assert.equal(shift.guests[0].seat, 'window');
  assert.equal(serviceJob(shift, shift.guests[0]).role, 'cook');
  advanceService(shift, 200);
  assert.equal(shift.arrived, 8);
  assert(shift.finished);
});

test('a complete invitation uses the visible tasks for scoring and advances without a script reply', async () => {
  const plan = normalizeInvitationPlan(fullInvitation);
  const actor = { id: 'official-libet', name: '莉贝特' };
  const profile = { tokenField: 'none', contextSize: 32000, promptProcessing: 'none' };
  const preset = normalizePromptPreset({ prompts: [{ content: '测试预设' }] }).preset;
  const request = invitationRequest(
    {
      invitation: { activity: 'walk' },
      party: [actor],
    },
    preset,
    profile,
    (text) => text.length,
  );
  assert.equal(request.transport.tag, 'wanxiang_output');
  assert(request.messages.some((entry) => entry.content.includes('"finale"')));
  assert.deepEqual(
    invitationResponse(`<wanxiang_output>${JSON.stringify(fullInvitation)}</wanxiang_output>`),
    plan,
  );
  assert.throws(
    () =>
      normalizeInvitationPlan({
        ...fullInvitation,
        finale: { ...fullInvitation.finale, scene: 'example.com' },
      }),
    /地点/,
  );
  const run = { plan, index: 0, turns: [] };
  const regex = async (_scripts, tasks) => tasks;
  const payload = { invitation: { stageId: 'stage-1', goals: plan.stages[0].goals } };
  const reply = (score, goal = 'goal-1') =>
    chatResponse(
      'quick-chat',
      `<wanxiang_chat>【对白:official-libet】那我们走吧。</wanxiang_chat><wanxiang_invitation>{"stageId":"stage-1","score":${score},"completed":["${goal}"]}</wanxiang_invitation>`,
      [],
      payload,
      regex,
    );
  await assert.rejects(reply(99), /评分/);
  run.turns.push((await reply(4)).invitation);
  assert.equal(invitationAdvance(run), false);
  assert.deepEqual(invitationBrief(run).tasks, [
    { text: fullInvitation.stages[0].tasks[0], done: true },
    { text: fullInvitation.stages[0].tasks[1], done: false },
  ]);
  run.turns.push((await reply(5, 'goal-2')).invitation);
  assert.equal(invitationAdvance(run), true);
  assert.equal(invitationTrust(run), 5);
});

test('invitation chat patches the next scene by version and preserves Gal cues and scoring', async () => {
  const plan = normalizeInvitationPlan(fullInvitation);
  const stage = plan.stages[1];
  stage.intro = '【登场:official-libet】【旁白】琴还在桌上。【对白:official-libet】再试一遍吧。';
  const actors = [
    { id: 'character-qingyuan', name: '青缘' },
    { id: 'official-libet', name: '莉贝特' },
  ];
  const run = { plan, index: 0, turns: [] };
  const nextScene = invitationNextScene(run);
  const [cue, first, last] = nextScene.lines;
  const patches = [
    { op: 'replace', id: last.id, speaker: 'official-libet', text: '我们从刚才停下的地方再试。' },
    {
      op: 'insert',
      after: first.id,
      before: last.id,
      speaker: '旁白',
      text: '她敲了一次刚才说好的节拍。',
    },
    { op: 'replace', id: cue.id, speaker: 'official-libet', text: '不应覆盖登场。' },
  ];
  const data = {
    stageId: 'stage-1',
    score: 4,
    completed: ['goal-1'],
    nextSceneId: nextScene.id,
    revision: 0,
    patches,
  };
  const request = { stageId: data.stageId, goals: plan.stages[0].goals, nextScene };
  assert.match(invitationChatInstruction(request), /stage-2-003/);
  const reply = async (result, context = request) =>
    chatResponse(
      'quick-chat',
      `<wanxiang_chat>【旁白】她点了点头。</wanxiang_chat><wanxiang_invitation>${JSON.stringify(result)}</wanxiang_invitation>`,
      [],
      { invitation: context },
      async (_scripts, tasks) => tasks,
    );
  const result = (await reply(data)).invitation;
  applyInvitationPatches(run, result, actors, actors[0].id);
  const updated = invitationSceneProse(run, stage);
  assert.match(updated, /【登场:official-libet】.*琴还在桌上.*说好的节拍.*从刚才停下的地方/s);
  assert.doesNotMatch(updated, /不应覆盖|再试一遍吧/);
  assert.match(stage.intro, /再试一遍吧/);
  assert.equal(invitationNextScene(JSON.parse(JSON.stringify(run))).revision, 1);
  const stale = (await reply(data, { ...request, nextScene: invitationNextScene(run) })).invitation;
  assert.deepEqual(stale, { stageId: 'stage-1', score: 4, completed: ['goal-1'] });
  const invalid = {
    ...data,
    revision: 1,
    patches: [
      {
        op: 'insert',
        after: first.id,
        before: last.id,
        speaker: 'character-qingyuan',
        text: '替玩家说的话。',
      },
      { op: 'replace', id: last.id, speaker: 'official-libet', text: '【清场】' },
      { op: 'replace', id: 'stage-3-001', speaker: '旁白', text: '改更远的一幕。' },
    ],
  };
  applyInvitationPatches(run, invalid, actors, actors[0].id);
  applyInvitationPatches(run, data, actors, actors[0].id);
  assert.equal(invitationSceneProse(run, stage), updated);
  assert.equal(invitationNextScene(run).revision, 1);
});

test('invitation hints are short and only change to an objective after the opening', () => {
  const tagged = (value) => `<wanxiang_json>${JSON.stringify(value)}</wanxiang_json>`;
  const plan = invitationResponse(tagged(fullInvitation));
  assert.throws(() => invitationResponse(tagged({ ...fullInvitation, stages: [] })), /3～5 幕/);
  const run = {
    plan,
    index: 1,
    scene: 'tavern',
    unread: { type: 'intro' },
    notes: {
      'stage-1': { scene: 'tavern', recap: '两人在靠窗的桌旁定下试奏的曲目。' },
    },
    turns: [{ stageId: 'stage-1', completed: ['goal-1'], score: 3 }],
  };
  const record = invitationRecord(run, 'ended');
  assert.equal(record.stages.length, 1);
  assert.equal(record.stages[0].summary, '两人在靠窗的桌旁定下试奏的曲目。');
  assert.deepEqual(record.stages[0].goals, fullInvitation.stages[0].tasks.slice(0, 1));
  assert.deepEqual(invitationBrief(run), {
    overall: fullInvitation.premise,
    current: fullInvitation.stages[1].description,
    tasks: [],
  });
  run.unread = null;
  assert.equal(invitationBrief(run).current, fullInvitation.stages[1].hint);
  run.plan.premise = '莉贝特拿出了她昨晚刚刚找到的那首很久以前的曲子。';
  run.plan.stages[1].hint = '再听一听广场钟声散去之后，那首曲子里的低音还剩多少。';
  assert.deepEqual(invitationBrief(run), {
    overall: run.plan.premise,
    current: run.plan.stages[1].hint,
    tasks: [{ text: fullInvitation.stages[1].tasks[0], done: false }],
  });
});

test('invitation keeps the model reply separate from diagnostics and accepts short bookends', async () => {
  const tagged = (value) => `<wanxiang_json>${JSON.stringify(value)}</wanxiang_json>`;
  const pipe = createAiPipeline({});
  const job = {
    kind: 'script',
    input: { invitation: { activity: 'walk' } },
    requestReport: { warnings: ['diagnostic only'] },
  };
  const raw = tagged({
    ...fullInvitation,
    stages: fullInvitation.stages.map((stage) => ({ ...stage, intro: '【旁白】她取出了琴。' })),
    finale: { ...fullInvitation.finale, intro: '【旁白】她把琴收了起来。' },
  });
  const response = await pipe.acceptResult(job, { content: raw, usage: { input: 12, output: 20 } });
  assert.equal(response.diagnostic.rawText, raw);
  assert.deepEqual(response.request.warnings, ['diagnostic only']);
  assert.equal(response.invitation.stages[0].intro, '【旁白】她取出了琴。');
  assert.equal(response.invitation.finale.intro, '【旁白】她把琴收了起来。');
});

test('shared chat connection migrates legacy quick chat without losing either prompt preset', async () => {
  let snapshot;
  const store = createConnectionStore({
    snapshot: {
      version: 4,
      profiles: {
        chat: { promptPresetId: 'tavern-style', model: '' },
        'quick-chat': {
          promptPresetId: 'travel-style',
          model: 'old-quick',
          baseUrl: 'http://localhost:9999/v1',
        },
      },
    },
    save(value) {
      snapshot = value;
    },
  });
  assert.equal(store.get('chat').model, 'old-quick');
  await store.saveProfile({
    kind: 'quick-chat',
    ...store.get('quick-chat'),
    model: 'shared-model',
  });
  assert.equal(store.get('chat').model, 'shared-model');
  assert.equal(store.get('quick-chat').promptPresetId, 'travel-style');
  assert.equal(store.get('chat').promptPresetId, 'tavern-style');
  assert.deepEqual(snapshot.profiles['quick-chat'], { promptPresetId: 'travel-style' });
  assert.equal(createConnectionStore({ snapshot }).get('quick-chat').model, 'shared-model');
});

test('town residents gain affection from normal chat when present and selected', () => {
  const library = newLibrary();
  applyRelationshipActions(
    library,
    {
      affection: [
        { id: 'official-libet', delta: 4 },
        { id: 'official-lumi', delta: 5 },
      ],
      agreeToAdventure: ['official-libet'],
    },
    ['official-libet'],
  );
  assert.deepEqual(library.relationships['official-libet'], {
    affection: 4,
    gains: 1,
    agreed: false,
  });
  assert.equal(library.relationships['official-lumi'], undefined);
});

test('all enemy cards resolve to named loot and actual accepted kills can only mint one claim', () => {
  const covered = new Set(Object.values(DROP_GROUPS).flat());
  for (const { portrait } of worldReference().appearances) {
    assert(covered.has(portrait), portrait);
    const drop = enemyDropTable({ portrait });
    assert(INGREDIENTS[drop.primary] || ITEMS[drop.primary]);
  }
  assert.deepEqual(
    enemyDropTable({ portrait: 'boss-tide' }),
    enemyDropTable({ portrait: 'boss-tide', boss: false, name: '任意生成名' }),
  );
  const library = newLibrary();
  const state = { units: { bossTide: { side: 'enemy' } }, encounter: 3 };
  const result = { deaths: [{ id: DEFINITIONS.bossTide.id }] };
  const expedition = { id: 'daily-loot-demo' };
  let awarded = claimEnemyDrops(library, expedition, state, result);
  for (let seed = 0; !awarded.length && seed < 12; seed++) {
    expedition.id = `daily-loot-${seed}`;
    awarded = claimEnemyDrops(library, expedition, state, result);
  }
  assert(awarded.length);
  const saved = structuredClone(library);
  assert.deepEqual(claimEnemyDrops(library, expedition, state, result), []);
  assert.deepEqual(library, saved);
});
