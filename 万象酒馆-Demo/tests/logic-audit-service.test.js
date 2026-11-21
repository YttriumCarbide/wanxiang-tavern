import test from 'node:test';
import assert from 'node:assert/strict';
import { newCampaign, firstCompanion } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { affectionRank } from '../src/relationships.js';
import {
  advanceLiveService,
  boostLiveStove,
  confirmLiveCookDc,
  inputLiveCookMiniGame,
  newLiveServiceShift,
  openLiveCookDc,
  openLiveCookMiniGame,
  queueLiveOrder,
  restoreLiveServiceShift,
  seatLiveGuest,
  serveLivePlate,
  SERVICE_CATALOG_MAP,
  SERVICE_PATRONS,
  settleLiveServiceShift,
} from '../src/service-live.js';

function serviceFixture() {
  const library = newCampaign(defaultProtagonist());
  firstCompanion(library);
  const memberId = library.characters[1].id;
  const staff = { front: memberId, cook: memberId, server: memberId, clean: memberId };
  const shift = newLiveServiceShift({
    library,
    staff,
    growth: library.daily.serviceGrowth,
    tutorial: true,
    seed: 42,
  });
  shift.nextGuestAt = Infinity;
  shift.autoTimer = Infinity;
  return { library, shift, memberId };
}

function seatGuest(shift, tableIdx = 0) {
  const uid = ++shift.guestSeq;
  shift.queue.push({
    uid,
    patron: SERVICE_PATRONS[0],
    patience: 26,
    maxPatience: 26,
  });
  assert.equal(seatLiveGuest(shift, uid, tableIdx), true);
  return shift.tables[tableIdx];
}

function finishRegularDish(shift, stoveIdx = 0) {
  for (let i = 0; i < 3; i++) {
    assert.equal(boostLiveStove(shift, stoveIdx), true);
  }
  if (shift.stoves[stoveIdx].status === 'dc_ready') {
    assert.ok(openLiveCookDc(shift, stoveIdx), 'cooking must open its DC modal');
    assert.ok(confirmLiveCookDc(shift), 'the current cooking ticket must complete its DC');
  }
}

test('live settlement adds affection above level one once per distinct staff member', () => {
  const { library, shift, memberId } = serviceFixture();
  library.relationships[memberId] = { affection: 150, gains: 1, agreed: true };

  settleLiveServiceShift(library, shift);

  assert.deepEqual(library.relationships[memberId], {
    affection: 152,
    gains: 1,
    agreed: true,
  });
  assert.deepEqual(affectionRank(library.relationships[memberId].affection), {
    level: 1,
    progress: 52,
  });
});

test('settling a restored settled shift leaves all library rewards and progression unchanged', () => {
  const { library, shift, memberId } = serviceFixture();
  library.relationships[memberId] = { affection: 10, gains: 0, agreed: false };
  shift.earnedGold = 37;
  shift.servedCount = 2;
  shift.repGain = 9;
  shift.completedByRole = { front: 2, cook: 3, server: 4, clean: 2 };
  shift.pantry.milk = 3;
  shift.bonusIngredients = { milk: 2 };
  shift.specialtiesSnapshot['herb-chicken'] = 2;
  const goldBefore = library.inventory.gold;
  const shiftsBefore = library.daily.serviceGrowth.shifts;

  settleLiveServiceShift(library, shift);

  assert.equal(library.inventory.gold, goldBefore + 37);
  assert.equal(library.dining.inventory.milk, 5);
  assert.equal(library.daily.serviceGrowth.shifts, shiftsBefore + 1);
  assert.equal(library.relationships[memberId].affection, 12);
  const settledLibrary = structuredClone(library);
  const restored = restoreLiveServiceShift(structuredClone(shift));
  const result = settleLiveServiceShift(library, restored);

  assert.deepEqual(result, {
    reputationChange: 0,
    trained: [],
    totalGold: 37,
    bonusIngredients: { milk: 2 },
  });
  assert.deepEqual(library, settledLibrary);
  assert.equal(restored.finished, true);
  assert.equal(restored.settled, true);
});

test('restoring a live shift clears transient minigame state without mutating or aliasing its input', () => {
  const { shift } = serviceFixture();
  seatGuest(shift);
  queueLiveOrder(shift, shift.tables[0], SERVICE_CATALOG_MAP['herb-chicken']);
  shift.paused = true;
  shift.activeMiniGame = { stoveIdx: 0, activity: { state: { progress: 0.5 } } };
  const before = structuredClone(shift);

  const restored = restoreLiveServiceShift(shift);

  assert.deepEqual(shift, before);
  assert.equal(restored.paused, false);
  assert.equal(restored.activeMiniGame, null);
  assert.deepEqual(restored.stoves, before.stoves);
  restored.stoves[0].ticket.recipeId = 'mushroom-soup';
  restored.tables[0].patience = 1;
  restored.pantry.milk = 99;
  assert.deepEqual(shift, before);
});

test('an expired guest cancels its cooking ticket and releases the stove', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  table.patience = 0.1;

  advanceLiveService(shift, 0.25);

  assert.equal(table.state, 'empty');
  assert.equal(shift.leftAngry, 1);
  for (let i = 0; i < 20; i++) {
    advanceLiveService(shift, 0.25);
  }

  assert.equal(shift.orders.length, 0);
  assert.equal(shift.plates.length, 0);
  assert.equal(shift.stoves[0].ticket, null);
  assert.equal(shift.stoves[0].status, 'idle');
});

test('a stale plate from a reused table cannot satisfy a new guest ordering the same recipe', () => {
  const { shift } = serviceFixture();
  const oldTable = seatGuest(shift);
  queueLiveOrder(shift, oldTable, SERVICE_CATALOG_MAP['herb-chicken']);
  finishRegularDish(shift);
  advanceLiveService(shift, 0.25);
  const oldPlate = shift.plates.find((plate) => plate.recipeId === 'herb-chicken');
  assert.ok(oldPlate, 'fixture must produce a ready old plate');

  oldTable.state = 'empty';
  oldTable.patron = null;

  const newTable = seatGuest(shift);
  queueLiveOrder(shift, newTable, SERVICE_CATALOG_MAP['herb-chicken']);

  assert.equal(newTable.state, 'waiting');
  assert.equal(newTable.recipeId, 'herb-chicken');
  const completedBefore = shift.completedByRole.server;
  const served = serveLivePlate(shift, oldPlate.uid);

  assert.equal(served, false);
  assert.equal(newTable.state, 'waiting');
  assert.equal(newTable.billGold, 0);
  assert.equal(shift.completedByRole.server, completedBefore);
});

test('a stale plate cannot satisfy the same guest after a replacement order', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  finishRegularDish(shift);
  advanceLiveService(shift, 0.25);
  const oldPlate = shift.plates.find((plate) => plate.recipeId === 'herb-chicken');
  assert.ok(oldPlate, 'fixture must produce a ready old plate');

  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);

  const served = serveLivePlate(shift, oldPlate.uid);

  assert.equal(served, false);
});

test('a plate whose recipe does not match the current order is rejected even with matching identities', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  finishRegularDish(shift);
  advanceLiveService(shift, 0.25);
  const plate = shift.plates.find((p) => p.recipeId === 'herb-chicken');
  assert.ok(plate, 'fixture must produce a ready plate');

  plate.recipeId = 'mushroom-soup';
  const stateBefore = table.state;
  const billBefore = table.billGold;
  const completedBefore = shift.completedByRole.server;

  const served = serveLivePlate(shift, plate.uid);

  assert.equal(served, false);
  assert.equal(table.state, stateBefore);
  assert.equal(table.billGold, billBefore);
  assert.equal(shift.completedByRole.server, completedBefore);
});

test('a plate matching the current order is delivered and billed', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  finishRegularDish(shift);
  advanceLiveService(shift, 0.25);
  const plate = shift.plates.find((p) => p.recipeId === 'herb-chicken');
  assert.ok(plate, 'fixture must produce a ready plate');

  const served = serveLivePlate(shift, plate.uid);

  assert.equal(served, true);
  assert.equal(table.state, 'eating');
  assert.ok(table.billGold > 0);
});

test('restoring a legacy shift without identity fields keeps a valid cooking ticket and delivers', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  shift.stoves[0].progress = 0.2;
  const progressBefore = shift.stoves[0].progress;
  const cookSecBefore = shift.stoves[0].cookSec;
  const recipeBefore = shift.stoves[0].ticket.recipeId;

  delete table.guestUid;
  delete table.orderUid;
  delete shift.stoves[0].ticket.guestUid;
  delete shift.stoves[0].ticket.orderUid;
  const sourceBefore = structuredClone(shift);

  const restored = restoreLiveServiceShift(shift);

  assert.deepEqual(shift, sourceBefore);
  assert.equal(restored.stoves[0].status, 'cooking');
  assert.equal(restored.stoves[0].progress, progressBefore);
  assert.equal(restored.stoves[0].cookSec, cookSecBefore);
  assert.equal(restored.stoves[0].ticket.recipeId, recipeBefore);

  finishRegularDish(restored);
  const plate = restored.plates.find((p) => p.recipeId === 'herb-chicken');
  assert.ok(plate, 'restored legacy shift must produce a ready plate');
  assert.equal(serveLivePlate(restored, plate.uid), true);
});

for (const invalidOrderUid of [0, -1, NaN]) {
  test(`restoring rejects explicit invalid legacy orderUid ${invalidOrderUid}`, () => {
    const { shift } = serviceFixture();
    const table = seatGuest(shift);
    queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
    assert.ok(Number.isSafeInteger(shift.stoves[0].ticket.uid));
    delete table.orderUid;
    shift.stoves[0].ticket.orderUid = invalidOrderUid;

    const restored = restoreLiveServiceShift(shift);

    assert.equal(restored.stoves[0].ticket, null);
    assert.equal(restored.stoves[0].status, 'idle');
    assert.equal(restored.stoves[0].progress, 0);
    assert.equal(restored.stoves[0].dcWait, 0);
    assert.equal(restored.tables[0].state, 'waiting');
    assert.equal(restored.tables[0].orderUid, undefined);
  });
}

test('restoring a legacy ready plate without identity fields delivers it', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  finishRegularDish(shift);
  advanceLiveService(shift, 0.25);
  const plate = shift.plates.find((p) => p.recipeId === 'herb-chicken');
  assert.ok(plate, 'fixture must produce a ready plate');

  delete table.guestUid;
  delete table.orderUid;
  delete plate.guestUid;
  delete plate.orderUid;

  const restored = restoreLiveServiceShift(shift);
  const restoredPlate = restored.plates.find((p) => p.recipeId === 'herb-chicken');
  assert.ok(restoredPlate, 'restored legacy shift must keep the ready plate');
  assert.equal(serveLivePlate(restored, restoredPlate.uid), true);
});

test('a restored legacy queued order takes a stove released by an expired guest', () => {
  const { shift } = serviceFixture();
  for (const tableIdx of [0, 1, 2]) {
    const table = seatGuest(shift, tableIdx);
    queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  }
  assert.equal(shift.orders.length, 1);
  for (const table of shift.tables) {
    delete table.guestUid;
    delete table.orderUid;
  }
  for (const ticket of [...shift.orders, ...shift.stoves.flatMap((stove) => stove.ticket || [])]) {
    delete ticket.guestUid;
    delete ticket.orderUid;
  }
  const restored = restoreLiveServiceShift(shift);
  assert.equal(restored.orders.length, 1);
  assert.equal(restored.orders[0].tableIdx, 2);
  restored.tables[0].patience = 0.1;

  advanceLiveService(restored, 0.25);

  assert.equal(restored.tables[0].state, 'empty');
  assert.equal(restored.orders.length, 0);
  assert.equal(restored.stoves[0].ticket.tableIdx, 2);
  finishRegularDish(restored);
  const plate = restored.plates.find((entry) => entry.tableIdx === 2);
  assert.ok(plate);
  assert.equal(serveLivePlate(restored, plate.uid), true);
});

test('restoring drops a stale legacy recipe mismatch while keeping a separate valid legacy order', () => {
  const { shift } = serviceFixture();
  const staleTable = seatGuest(shift);
  queueLiveOrder(shift, staleTable, SERVICE_CATALOG_MAP['herb-chicken']);
  const validTable = seatGuest(shift, 1);
  queueLiveOrder(shift, validTable, SERVICE_CATALOG_MAP['mushroom-soup']);

  staleTable.recipeId = 'mushroom-soup';
  delete staleTable.guestUid;
  delete staleTable.orderUid;
  delete validTable.guestUid;
  delete validTable.orderUid;
  for (const stove of shift.stoves) {
    if (stove.ticket) {
      delete stove.ticket.guestUid;
      delete stove.ticket.orderUid;
    }
  }

  const restored = restoreLiveServiceShift(shift);

  const staleOrder = restored.orders.find((o) => o.recipeId === 'herb-chicken');
  assert.equal(staleOrder, undefined);
  const validOrder = restored.stoves[1].ticket;
  assert.ok(validOrder, 'valid legacy order must survive normalization');
  assert.equal(validOrder.recipeId, 'mushroom-soup');
  assert.equal(restored.stoves[0].ticket, null);
});

test('restoring cleans up a stove ticket whose guestUid mismatches without canceling another valid stove', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  const validTable = seatGuest(shift, 1);
  queueLiveOrder(shift, validTable, SERVICE_CATALOG_MAP['mushroom-soup']);

  shift.stoves[0].ticket.guestUid = 'mismatched-guest';
  shift.stoves[0].status = 'cooking';
  shift.stoves[0].progress = 0.4;
  shift.stoves[0].dcWait = 0.3;
  shift.activeCookDc = { stoveIdx: 0, dc: 12 };

  const restored = restoreLiveServiceShift(shift);

  assert.equal(restored.stoves[0].ticket, null);
  assert.equal(restored.stoves[0].status, 'idle');
  assert.equal(restored.stoves[0].progress, 0);
  assert.equal(restored.stoves[0].dcWait, 0);
  assert.equal(restored.activeCookDc, null);
  assert.ok(restored.stoves[1].ticket, 'valid stove ticket must remain');
});

test('affection near MAX_SAFE_INTEGER saturates without touching gains or agreed', () => {
  const { library, shift, memberId } = serviceFixture();
  library.relationships[memberId] = {
    affection: Number.MAX_SAFE_INTEGER - 1,
    gains: 3,
    agreed: true,
  };

  settleLiveServiceShift(library, shift);

  assert.equal(library.relationships[memberId].affection, Number.MAX_SAFE_INTEGER);
  assert.equal(library.relationships[memberId].gains, 3);
  assert.equal(library.relationships[memberId].agreed, true);

  const settledLibrary = structuredClone(library);
  const restored = restoreLiveServiceShift(structuredClone(shift));
  settleLiveServiceShift(library, restored);

  assert.deepEqual(library, settledLibrary);
});

test('a stale DC callback cannot finish a replacement order on the same stove', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  shift.stoves[0].status = 'dc_ready';
  openLiveCookDc(shift, 0);
  const oldModal = structuredClone(shift.activeCookDc);
  assert.ok(oldModal, 'fixture must open a DC modal');

  const replacementTable = seatGuest(shift, 1);
  queueLiveOrder(shift, replacementTable, SERVICE_CATALOG_MAP['herb-chicken']);
  assert.ok(shift.stoves[1].ticket, 'replacement order must occupy stove 1');
  shift.stoves[0].ticket = structuredClone(shift.stoves[1].ticket);
  shift.stoves[0].status = 'dc_ready';
  shift.activeCookDc = oldModal;
  const currentTicket = structuredClone(shift.stoves[0].ticket);
  const platesBefore = structuredClone(shift.plates);
  const dcPassedBefore = shift.dcPassed;

  const result = confirmLiveCookDc(shift);

  assert.equal(result, null);
  assert.deepEqual(shift.stoves[0].ticket, currentTicket);
  assert.deepEqual(shift.plates, platesBefore);
  assert.equal(shift.dcPassed, dcPassedBefore);
});

test('a stale minigame callback cannot complete a replacement order on the same stove', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  openLiveCookMiniGame(shift, 0);
  const oldMiniGame = structuredClone(shift.activeMiniGame);
  assert.ok(oldMiniGame, 'fixture must open a minigame');

  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  assert.ok(shift.stoves[1].ticket, 'replacement order must occupy stove 1');
  shift.stoves[0].ticket = structuredClone(shift.stoves[1].ticket);
  shift.activeMiniGame = oldMiniGame;
  const currentTicket = structuredClone(shift.stoves[0].ticket);
  const platesBefore = structuredClone(shift.plates);

  const result = inputLiveCookMiniGame(shift, {});

  assert.deepEqual(result, { valid: false });
  assert.deepEqual(shift.stoves[0].ticket, currentTicket);
  assert.deepEqual(shift.plates, platesBefore);
  assert.equal(shift.activeMiniGame, null);
});

test('restoring removes ambiguous identityless legacy candidates while keeping the waiting table', () => {
  const { shift } = serviceFixture();
  const table = seatGuest(shift);
  queueLiveOrder(shift, table, SERVICE_CATALOG_MAP['herb-chicken']);
  shift.orders.push(structuredClone(shift.stoves[0].ticket));

  delete table.guestUid;
  delete table.orderUid;
  delete shift.stoves[0].ticket.guestUid;
  delete shift.stoves[0].ticket.orderUid;
  for (const order of shift.orders) {
    delete order.guestUid;
    delete order.orderUid;
  }

  const restored = restoreLiveServiceShift(shift);

  assert.equal(restored.stoves[0].ticket, null);
  assert.equal(restored.stoves[0].status, 'idle');
  assert.equal(restored.orders.length, 0);
  assert.equal(restored.tables[0].state, 'waiting');
  assert.equal(restored.tables[0].recipeId, 'herb-chicken');
});

test('guest allocation at MAX_SAFE_INTEGER keeps existing identities and produces safe new identities', () => {
  const { shift } = serviceFixture();
  const originalTable = seatGuest(shift, 0);
  queueLiveOrder(shift, originalTable, SERVICE_CATALOG_MAP['herb-chicken']);
  const originalGuestUid = originalTable.guestUid;
  const originalOrderUid = originalTable.orderUid;
  const originalTicket = shift.stoves[0].ticket;
  assert.ok(originalTicket, 'fixture must occupy stove 0');
  const originalTicketGuestUid = originalTicket.guestUid;
  const originalTicketOrderUid = originalTicket.orderUid;

  shift.guestSeq = Number.MAX_SAFE_INTEGER;
  const restored = restoreLiveServiceShift(shift);

  assert.equal(restored.tables[0].guestUid, originalGuestUid);
  assert.equal(restored.tables[0].orderUid, originalOrderUid);
  assert.equal(restored.stoves[0].ticket.guestUid, originalTicketGuestUid);
  assert.equal(restored.stoves[0].ticket.orderUid, originalTicketOrderUid);

  restored.nextGuestAt = 0;
  restored.maxGuests = 10;
  restored.guestsSpawned = 0;
  restored.autoTimer = Infinity;
  advanceLiveService(restored, 0.25);

  assert.equal(restored.queue.length, 1);
  const spawnUid = restored.queue[0].uid;
  assert.ok(Number.isSafeInteger(spawnUid));
  assert.ok(spawnUid > 0);
  assert.notEqual(spawnUid, originalGuestUid);
  assert.notEqual(spawnUid, originalOrderUid);
  assert.notEqual(spawnUid, originalTicketGuestUid);
  assert.notEqual(spawnUid, originalTicketOrderUid);

  assert.equal(seatLiveGuest(restored, spawnUid, 1), true);
  const newTable = restored.tables[1];
  queueLiveOrder(restored, newTable, SERVICE_CATALOG_MAP['herb-chicken']);

  assert.ok(Number.isSafeInteger(newTable.guestUid));
  assert.equal(newTable.guestUid, spawnUid);
  assert.ok(Number.isSafeInteger(newTable.orderUid));
  assert.ok(newTable.orderUid > 0);
  assert.notEqual(newTable.orderUid, originalGuestUid);
  assert.notEqual(newTable.orderUid, originalOrderUid);
  assert.notEqual(newTable.orderUid, originalTicketGuestUid);
  assert.notEqual(newTable.orderUid, originalTicketOrderUid);
  assert.notEqual(newTable.orderUid, spawnUid);

  const newTicket = restored.stoves[1].ticket;
  assert.ok(newTicket, 'new order must occupy stove 1');
  assert.equal(newTicket.guestUid, newTable.guestUid);
  assert.equal(newTicket.orderUid, newTable.orderUid);

  finishRegularDish(restored, 1);
  const newPlate = restored.plates.find((plate) => plate.tableIdx === 1);
  assert.ok(newPlate, 'new dish must produce a plate at table 1');
  assert.ok(Number.isSafeInteger(newPlate.uid));
  assert.ok(newPlate.uid > 0);
  assert.notEqual(newPlate.uid, originalGuestUid);
  assert.notEqual(newPlate.uid, originalOrderUid);
  assert.notEqual(newPlate.uid, originalTicketGuestUid);
  assert.notEqual(newPlate.uid, originalTicketOrderUid);
  assert.notEqual(newPlate.uid, spawnUid);
  assert.notEqual(newPlate.uid, newTable.orderUid);
  assert.equal(newPlate.orderUid, newTable.orderUid);
  assert.equal(newPlate.guestUid, newTable.guestUid);

  assert.equal(serveLivePlate(restored, newPlate.uid), true);
  assert.equal(newTable.state, 'eating');

  assert.equal(restored.tables[0].state, 'waiting');
  assert.equal(restored.tables[0].guestUid, originalGuestUid);
  assert.equal(restored.tables[0].orderUid, originalOrderUid);
  assert.ok(restored.stoves[0].ticket, 'original stove 0 ticket must remain');
  assert.equal(restored.stoves[0].ticket.guestUid, originalTicketGuestUid);
  assert.equal(restored.stoves[0].ticket.orderUid, originalTicketOrderUid);

  assert.ok(Number.isSafeInteger(restored.guestSeq));
});
