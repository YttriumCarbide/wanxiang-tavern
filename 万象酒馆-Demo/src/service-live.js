export { settleLiveServiceShift } from './service-live-settlement.js';
import {
  SERVICE_CATALOG_MAP,
  SERVICE_LIVE_EVENTS,
  SERVICE_PATRONS,
  calcLiveDishPrice,
  defaultHubMenus,
  liveCraftableCount,
  liveFacilities,
  liveHubFateTokens,
  liveServiceTier,
  liveWeatherForDay,
} from './service-live-catalog.js';
export {
  SERVICE_CATALOG,
  SERVICE_CATALOG_MAP,
  SERVICE_FACILITIES,
  SERVICE_LIVE_EVENTS,
  SERVICE_PATRONS,
  SERVICE_TIERS,
  SERVICE_WEATHERS,
  autoFillLiveHubMenu,
  calcLiveDishPrice,
  defaultHubMenus,
  liveCraftableCount,
  liveFacilities,
  liveHubFateTokens,
  liveServiceTier,
  liveWeatherForDay,
  serviceFacilityCost,
  toggleLiveHubDish,
  upgradeLiveFacility,
} from './service-live-catalog.js';
import { INGREDIENTS } from './content/dining.js';
import {
  SERVICE_ROLES,
  serviceAutoChance,
  serviceProficiency,
  serviceSeed,
  serviceWaitBonus,
} from './service-progression.js';
import { applyServiceGesture, serviceActivity } from './service-gestures.js';
import { effectiveDcAttrs, evaluate2d6Check, isDcSuccess, roll2d6 } from './dc.js';

function isPositiveUid(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function maxPositiveUid(...values) {
  let max = 0;
  for (const value of values) {
    if (isPositiveUid(value) && value > max) max = value;
  }
  return max;
}

function allocateLiveUid(shift) {
  const used = new Set();
  const add = (value) => {
    if (isPositiveUid(value)) used.add(value);
  };
  for (const guest of shift.queue || []) {
    add(guest.uid);
    add(guest.guestUid);
    add(guest.orderUid);
  }
  for (const table of shift.tables || []) {
    add(table.guestUid);
    add(table.orderUid);
  }
  for (const order of shift.orders || []) {
    add(order.uid);
    add(order.guestUid);
    add(order.orderUid);
  }
  for (const stove of shift.stoves || []) {
    const ticket = stove.ticket;
    if (ticket) {
      add(ticket.uid);
      add(ticket.guestUid);
      add(ticket.orderUid);
    }
  }
  for (const plate of shift.plates || []) {
    add(plate.uid);
    add(plate.guestUid);
    add(plate.orderUid);
  }
  let candidate =
    isPositiveUid(shift.guestSeq) && shift.guestSeq < Number.MAX_SAFE_INTEGER
      ? shift.guestSeq + 1
      : 1;
  while (used.has(candidate)) {
    candidate = candidate === Number.MAX_SAFE_INTEGER ? 1 : candidate + 1;
  }
  shift.guestSeq = candidate;
  return candidate;
}

function resetStove(stove) {
  stove.status = 'idle';
  stove.ticket = null;
  stove.progress = 0;
  stove.dcWait = 0;
}

function currentOrderMatches(shift, ticket) {
  if (!ticket) return false;
  if (!isPositiveUid(ticket.guestUid) || !isPositiveUid(ticket.orderUid)) return false;
  const table = shift.tables?.[ticket.tableIdx];
  if (!table || table.state !== 'waiting') return false;
  if (table.recipeId !== ticket.recipeId) return false;
  if (table.guestUid !== ticket.guestUid) return false;
  if (table.orderUid !== ticket.orderUid) return false;
  return true;
}

function migrateLiveServiceShift(raw) {
  const shift = structuredClone(raw);
  shift.activeMiniGame = null;
  shift.paused = false;

  const tables = Array.isArray(shift.tables) ? shift.tables : [];
  const queue = Array.isArray(shift.queue) ? shift.queue : [];
  const orders = Array.isArray(shift.orders) ? shift.orders : [];
  const stoves = Array.isArray(shift.stoves) ? shift.stoves : [];
  const plates = Array.isArray(shift.plates) ? shift.plates : [];

  let maxUid = maxPositiveUid(shift.guestSeq);
  for (const table of tables) {
    maxUid = maxPositiveUid(maxUid, table.guestUid, table.orderUid);
  }
  for (const guest of queue) {
    maxUid = maxPositiveUid(maxUid, guest.uid, guest.guestUid, guest.orderUid);
  }
  for (const order of orders) {
    maxUid = maxPositiveUid(maxUid, order.uid, order.guestUid, order.orderUid);
  }
  for (const stove of stoves) {
    const ticket = stove.ticket;
    if (ticket) maxUid = maxPositiveUid(maxUid, ticket.uid, ticket.guestUid, ticket.orderUid);
  }
  for (const plate of plates) {
    maxUid = maxPositiveUid(maxUid, plate.uid, plate.guestUid, plate.orderUid);
  }
  shift.guestSeq = maxUid;

  for (const table of tables) {
    if (table.state !== 'empty' && !isPositiveUid(table.guestUid)) {
      table.guestUid = allocateLiveUid(shift);
    }
  }

  const candidateTickets = [];
  for (const stove of stoves) {
    if (stove.ticket) candidateTickets.push({ kind: 'stove', stove, ticket: stove.ticket });
  }
  for (const order of orders) {
    candidateTickets.push({ kind: 'order', ticket: order });
  }
  for (const plate of plates) {
    candidateTickets.push({ kind: 'plate', ticket: plate });
  }

  const usedCandidates = new Set();

  for (const table of tables) {
    if (table.state !== 'waiting') continue;
    const compatible = candidateTickets.filter((c) => {
      if (usedCandidates.has(c)) return false;
      const ticket = c.ticket;
      if (ticket.tableIdx !== table.idx) return false;
      if (ticket.recipeId !== table.recipeId) return false;
      if (ticket.orderUid != null && !isPositiveUid(ticket.orderUid)) return false;
      if (ticket.guestUid != null && ticket.guestUid !== table.guestUid) return false;
      if (
        ticket.orderUid != null &&
        isPositiveUid(table.orderUid) &&
        ticket.orderUid !== table.orderUid
      ) {
        return false;
      }
      return true;
    });

    if (compatible.length !== 1) continue;

    if (!isPositiveUid(table.orderUid)) {
      const first = compatible[0].ticket;
      if (isPositiveUid(first.orderUid)) {
        table.orderUid = first.orderUid;
      } else if (compatible[0].kind !== 'plate' && isPositiveUid(first.uid)) {
        table.orderUid = first.uid;
      } else {
        table.orderUid = allocateLiveUid(shift);
      }
    }

    const chosen = compatible[0];
    usedCandidates.add(chosen);
    const ticket = chosen.ticket;
    if (ticket.guestUid == null) ticket.guestUid = table.guestUid;
    if (ticket.orderUid == null) ticket.orderUid = table.orderUid;
  }

  for (const c of candidateTickets) {
    if (usedCandidates.has(c)) continue;
    const ticket = c.ticket;
    if (c.kind === 'stove') {
      resetStove(c.stove);
      if (shift.activeCookDc?.stoveIdx === c.stove.idx) shift.activeCookDc = null;
    } else if (c.kind === 'order') {
      const idx = orders.indexOf(ticket);
      if (idx >= 0) orders.splice(idx, 1);
    } else if (c.kind === 'plate') {
      const idx = plates.indexOf(ticket);
      if (idx >= 0) plates.splice(idx, 1);
    }
  }

  for (const table of tables) {
    if (table.state === 'empty') {
      table.guestUid = null;
      table.orderUid = null;
    }
  }

  const modal = shift.activeCookDc;
  if (modal) {
    const ticket = stoves[modal.stoveIdx]?.ticket;
    if (
      !currentOrderMatches(shift, ticket) ||
      (modal.dish?.id && modal.dish.id !== ticket.recipeId) ||
      (modal.guestUid != null && modal.guestUid !== ticket.guestUid) ||
      (modal.orderUid != null && modal.orderUid !== ticket.orderUid)
    ) {
      shift.activeCookDc = null;
    } else {
      modal.guestUid = ticket.guestUid;
      modal.orderUid = ticket.orderUid;
    }
  }

  return shift;
}

export function restoreLiveServiceShift(raw) {
  if (!raw || raw.mode !== 'live') return raw;
  return migrateLiveServiceShift(raw);
}

function rngFloat(shift, salt = '') {
  shift.rngCounter = (shift.rngCounter || 0) + 1;
  return serviceSeed(`${shift.seed}:${salt}:${shift.rngCounter}`) / 4294967296;
}

export function chefCookModForShift(shift) {
  return (shift.staffMods?.cook?.wis ?? 0) + Math.floor(((shift.facilities?.stove || 0) + 1) / 2);
}

export function newLiveServiceShift({
  library,
  staff,
  day = 1,
  growth,
  tutorial = false,
  seed = Math.floor(Math.random() * 2 ** 32),
}) {
  const tier = liveServiceTier(growth?.reputation || 0).current;
  const fac = liveFacilities(growth);
  const menus = tutorial
    ? { regMenu: ['herb-chicken', 'mushroom-soup', 'berry-crepe'], sigMenu: [] }
    : defaultHubMenus(growth, library.dining.inventory);
  const staffMods = {};
  const staffLevels = {};
  for (const role of Object.keys(SERVICE_ROLES)) {
    const id = staff?.[role];
    const member = library.characters.find((c) => c.id === id);
    const mods = member ? effectiveDcAttrs(library, member).mods : {};
    staffMods[role] = Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, v.mod || 0]));
    staffLevels[role] = serviceProficiency(growth, id, role);
  }
  const duration = tutorial ? 34 : 58;
  const tablesUnlocked = tutorial ? 3 : tier.tables;
  const stovesUnlocked = tutorial
    ? 2
    : Math.min(4, Math.max(tier.stoves, 2 + Math.floor(fac.stove / 2)));
  return {
    mode: 'live',
    version: 5,
    seed,
    rngCounter: 0,
    day,
    tutorial: Boolean(tutorial),
    duration,
    elapsed: 0,
    tablesUnlocked,
    stovesUnlocked,
    facilities: fac,
    weather: liveWeatherForDay(day),
    regMenu: menus.regMenu,
    sigMenu: menus.sigMenu,
    pantry: structuredClone(library.dining.inventory || {}),
    bonusIngredients: {},
    staff: { ...staff },
    staffMods,
    staffLevels,
    completedByRole: {},
    fateTokens: tutorial ? 1 : liveHubFateTokens(library, growth, staff),
    queue: [],
    tables: Array.from({ length: 6 }, (_, idx) => ({
      idx,
      unlocked: idx < tablesUnlocked,
      state: 'empty',
      patron: null,
      patience: 0,
      maxPatience: 0,
      recipeId: null,
      matchMult: 1,
      eatTimer: 0,
      billGold: 0,
      billRep: 0,
      quality: 'normal',
      guestUid: null,
      orderUid: null,
    })),
    stoves: Array.from({ length: 4 }, (_, idx) => ({
      idx,
      unlocked: idx < stovesUnlocked,
      status: 'idle',
      ticket: null,
      progress: 0,
      cookSec: 4.5,
      dcWait: 0,
    })),
    orders: [],
    plates: [],
    guestSeq: 0,
    guestsSpawned: 0,
    maxGuests: tutorial ? 3 : 6 + Math.min(5, tablesUnlocked),
    nextGuestAt: 0.4,
    kegCd: 0,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    fever: 0,
    feverLeft: 0,
    autoTimer: 2.2,
    lastAutoProc: null,
    eventTriggered: tutorial,
    activeEvent: null,
    activeCookDc: null,
    activeMiniGame: null,
    vipModalTableIdx: null,
    servedCount: 0,
    masterworkCount: 0,
    dcPassed: 0,
    vipsServed: 0,
    leftAngry: 0,
    earnedGold: 0,
    regGold: 0,
    sigGold: 0,
    tipGold: 0,
    eventGold: 0,
    repGain: 0,
    reputationSnapshot: growth?.reputation || 0,
    specialtiesSnapshot: structuredClone(growth?.specialties || {}),
    settled: false,
    finished: false,
  };
}

function isPaused(shift) {
  return Boolean(
    shift.finished ||
    shift.paused ||
    shift.activeEvent ||
    shift.activeCookDc ||
    shift.activeMiniGame ||
    shift.vipModalTableIdx !== null,
  );
}

function shiftGrowthProxy(shift) {
  return {
    reputation: shift.reputationSnapshot || 0,
    facilities: shift.facilities,
    specialties: shift.specialtiesSnapshot || {},
  };
}

function spawnGuest(shift) {
  const pool = shift.tutorial ? SERVICE_PATRONS.filter((p) => !p.vip) : SERVICE_PATRONS;
  const vipRate = shift.tutorial
    ? 0
    : Math.min(0.45, 0.14 + (shift.facilities?.lamp || 0) * 0.04 + (shift.weather?.vipBonus || 0));
  const wantVip = !shift.tutorial && rngFloat(shift, 'vip') < vipRate;
  const candidates = wantVip ? pool.filter((p) => p.vip) : pool.filter((p) => !p.vip);
  const patron = candidates[Math.floor(rngFloat(shift, 'patron') * candidates.length)] || pool[0];
  const frontWait = serviceWaitBonus(shift.staffLevels?.front || 0);
  const tableWait = (shift.facilities?.table || 0) * 2;
  const maxPatience = Math.max(
    18,
    patron.patience + frontWait + tableWait + (shift.weather?.patienceDelta || 0),
  );
  shift.queue.push({
    uid: allocateLiveUid(shift),
    patron,
    patience: maxPatience,
    maxPatience,
  });
  shift.guestsSpawned++;
}

function consumeDishIngredients(shift, dish) {
  if (!dish?.recipe) return true;
  if (liveCraftableCount(dish, shift.pantry) <= 0) return false;
  for (const [ingId, n] of Object.entries(dish.recipe)) {
    shift.pantry[ingId] = Math.max(0, (shift.pantry[ingId] || 0) - n);
  }
  return true;
}

function pickGuestDish(shift, patron) {
  const stockedSigs = shift.sigMenu
    .map((id) => SERVICE_CATALOG_MAP[id])
    .filter((d) => d && liveCraftableCount(d, shift.pantry) > 0);
  const regs = shift.regMenu.map((id) => SERVICE_CATALOG_MAP[id]).filter(Boolean);
  const all = [...stockedSigs, ...regs];
  if (!all.length) return SERVICE_CATALOG_MAP['herb-chicken'];
  const scored = all
    .map((dish) => {
      const likes = dish.tags.filter((t) => patron.likes.includes(t)).length;
      const sigBias = dish.kind === 'signature' ? 1.5 : 0;
      return { dish, weight: 1 + likes * 2 + sigBias + rngFloat(shift, dish.id) };
    })
    .sort((a, b) => b.weight - a.weight);
  const picked = scored[0].dish;
  if (picked.kind === 'signature' && consumeDishIngredients(shift, picked)) return picked;
  return regs[Math.floor(rngFloat(shift, 'reg') * regs.length)] || picked;
}

function assignOrderToStove(shift) {
  while (shift.orders.length) {
    const stove = shift.stoves.find((s) => s.unlocked && s.status === 'idle');
    if (!stove) break;
    const ticket = shift.orders.shift();
    if (!currentOrderMatches(shift, ticket)) continue;
    const cookSpd =
      1 + (shift.facilities?.stove || 0) * 0.12 + (shift.staffLevels?.cook || 0) * 0.004;
    const baseSec = SERVICE_CATALOG_MAP[ticket.recipeId]?.kind === 'signature' ? 4.8 : 3.8;
    stove.status = 'cooking';
    stove.ticket = ticket;
    stove.progress = 0;
    stove.cookSec = Math.max(2.2, baseSec / cookSpd);
    stove.dcWait = 0;
  }
}

function pushReadyPlate(shift, ticket, quality = 'normal') {
  shift.plates.push({
    uid: allocateLiveUid(shift),
    tableIdx: ticket.tableIdx,
    recipeId: ticket.recipeId,
    quality,
    matchMult: ticket.matchMult || 1,
    guestUid: ticket.guestUid,
    orderUid: ticket.orderUid,
  });
}

export function seatLiveGuest(shift, guestUid = null, preferredTableIdx = null) {
  if (!shift.queue.length) return false;
  const gIdx = guestUid ? shift.queue.findIndex((g) => g.uid === guestUid) : 0;
  if (gIdx < 0) return false;
  const table =
    preferredTableIdx !== null &&
    shift.tables[preferredTableIdx]?.unlocked &&
    shift.tables[preferredTableIdx]?.state === 'empty'
      ? shift.tables[preferredTableIdx]
      : shift.tables.find((t) => t.unlocked && t.state === 'empty');
  if (!table) return false;
  const [guest] = shift.queue.splice(gIdx, 1);
  const maxPatience = guest.maxPatience;
  table.state = 'ordering';
  table.patron = guest.patron;
  table.patience = maxPatience;
  table.maxPatience = maxPatience;
  table.recipeId = null;
  table.matchMult = 1;
  table.quality = 'normal';
  table.guestUid = guest.uid;
  table.orderUid = null;
  shift.completedByRole.front = (shift.completedByRole.front || 0) + 1;
  return true;
}

export function queueLiveOrder(shift, table, dish, matchMult = 1) {
  table.state = 'waiting';
  table.recipeId = dish.id;
  table.matchMult = matchMult;
  table.patience = Math.min(table.maxPatience, table.patience + 4);
  if (!isPositiveUid(table.guestUid)) table.guestUid = allocateLiveUid(shift);
  const orderUid = allocateLiveUid(shift);
  table.orderUid = orderUid;
  shift.orders.push({
    uid: orderUid,
    tableIdx: table.idx,
    recipeId: dish.id,
    matchMult,
    guestUid: table.guestUid,
    orderUid,
  });
  assignOrderToStove(shift);
  shift.completedByRole.server = (shift.completedByRole.server || 0) + 1;
  return true;
}

export function chooseLiveVipDish(shift, tableIdx, recipeId) {
  const table = shift.tables[tableIdx];
  const dish = SERVICE_CATALOG_MAP[recipeId];
  shift.vipModalTableIdx = null;
  if (!table || table.state !== 'ordering' || !dish) return false;
  if (dish.kind === 'signature' && !consumeDishIngredients(shift, dish)) return false;
  const hits = dish.tags.filter((t) => table.patron?.likes?.includes(t)).length;
  const matchMult = hits >= 2 ? 1.45 : hits === 1 ? 1.2 : 1;
  return queueLiveOrder(shift, table, dish, matchMult);
}

export function serveLivePlate(shift, plateUid) {
  const idx = shift.plates.findIndex((p) => p.uid === plateUid);
  if (idx < 0) return false;
  const plate = shift.plates[idx];
  const table = shift.tables[plate.tableIdx];
  const valid =
    table &&
    table.state === 'waiting' &&
    table.recipeId === plate.recipeId &&
    isPositiveUid(plate.guestUid) &&
    isPositiveUid(plate.orderUid) &&
    table.guestUid === plate.guestUid &&
    table.orderUid === plate.orderUid;
  if (!valid) {
    shift.plates.splice(idx, 1);
    return false;
  }
  shift.plates.splice(idx, 1);
  const dish = SERVICE_CATALOG_MAP[plate.recipeId];
  if (!dish) return false;
  const { price } = calcLiveDishPrice(dish, { growth: shiftGrowthProxy(shift), day: shift.day });
  const qMult =
    plate.quality === 'divine'
      ? 1.75
      : plate.quality === 'great'
        ? 1.35 + (shift.facilities?.dice || 0) * 0.04
        : plate.quality === 'burnt'
          ? 0.8
          : 1;
  const comboMult = 1 + Math.min(0.6, shift.combo * 0.06);
  const feverMult = shift.feverLeft > 0 ? 1.35 : 1;
  const bill = Math.max(
    4,
    Math.round(price * qMult * (plate.matchMult || 1) * comboMult * feverMult),
  );
  const tipRate = (table.patron?.tipRate || 0.12) + (shift.facilities?.table || 0) * 0.05;
  const tip = Math.max(
    1,
    Math.round(
      bill * tipRate * (plate.quality === 'divine' || plate.quality === 'great' ? 1.25 : 1),
    ),
  );
  table.state = 'eating';
  table.eatTimer = 2.6;
  table.billGold = bill + tip;
  table.billRep = Math.round(
    (dish.kind === 'signature' ? 7 : 4) *
      (1 + (shift.facilities?.lamp || 0) * 0.12) *
      (plate.quality === 'divine' ? 1.5 : plate.quality === 'great' ? 1.25 : 1),
  );
  table.quality = plate.quality;
  table._tipPart = tip;
  table._kind = dish.kind;
  shift.completedByRole.server = (shift.completedByRole.server || 0) + 1;
  return true;
}

export function collectLiveTablePay(shift, tableIdx) {
  const table = shift.tables[tableIdx];
  if (!table || table.state !== 'pay') return null;
  const gold = table.billGold || 10;
  const rep = table.billRep || 4;
  const tip = table._tipPart || 1;
  const isSig = table._kind === 'signature';
  const quality = table.quality;
  if (table.patron?.vip) shift.vipsServed++;
  shift.servedCount++;
  if (quality === 'great' || quality === 'divine') shift.masterworkCount++;
  shift.combo++;
  shift.comboTimer = 9 + (shift.facilities?.barrel || 0) * 0.7;
  if (shift.combo > shift.maxCombo) shift.maxCombo = shift.combo;
  shift.fever = Math.min(100, shift.fever + (isSig ? 24 : 16));
  shift.earnedGold += gold;
  shift.tipGold += tip;
  if (isSig) shift.sigGold += gold - tip;
  else shift.regGold += gold - tip;
  shift.repGain += rep;
  shift.specialtiesSnapshot[table.recipeId] = (shift.specialtiesSnapshot[table.recipeId] || 0) + 1;
  shift.completedByRole.clean = (shift.completedByRole.clean || 0) + 1;
  table.state = 'empty';
  table.patron = null;
  table.recipeId = null;
  table.billGold = 0;
  table.billRep = 0;
  table.quality = 'normal';
  table.guestUid = null;
  table.orderUid = null;
  return { gold, rep };
}

export function clickLiveTable(shift, tableIdx) {
  const table = shift.tables[tableIdx];
  if (!table || !table.unlocked) return { action: 'none' };
  if (table.state === 'empty') {
    const ok = seatLiveGuest(shift, null, tableIdx);
    return { action: ok ? 'seat' : 'none' };
  }
  if (table.state === 'ordering') {
    if (table.patron?.vip) {
      shift.vipModalTableIdx = tableIdx;
      return { action: 'vip-modal' };
    }
    const dish = pickGuestDish(shift, table.patron);
    queueLiveOrder(shift, table, dish, 1);
    return { action: 'order', dishName: dish.name };
  }
  if (table.state === 'waiting') {
    const plate = shift.plates.find((p) => p.tableIdx === tableIdx);
    if (plate) {
      serveLivePlate(shift, plate.uid);
      return { action: 'serve' };
    }
    return { action: 'waiting' };
  }
  if (table.state === 'pay') {
    const res = collectLiveTablePay(shift, tableIdx);
    return { action: 'pay', ...res };
  }
  return { action: 'eating' };
}

export function openLiveCookDc(shift, stoveIdx) {
  const stove = shift.stoves[stoveIdx];
  if (!stove || stove.status !== 'dc_ready' || !stove.ticket) return null;
  const dish = SERVICE_CATALOG_MAP[stove.ticket.recipeId];
  const dc = Math.max(5, Math.min(12, (dish?.dc || 8) + (shift.weather?.dcDelta || 0)));
  const mod = chefCookModForShift(shift);
  const dice = roll2d6();
  const check = evaluate2d6Check({ dice, mod, dc });
  shift.activeCookDc = {
    stoveIdx,
    dish,
    dc,
    mod,
    check,
    guestUid: stove.ticket.guestUid,
    orderUid: stove.ticket.orderUid,
  };
  return shift.activeCookDc;
}

export function rerollLiveCookDc(shift) {
  const modal = shift.activeCookDc;
  if (!modal || shift.fateTokens <= 0) return false;
  shift.fateTokens--;
  modal.check = evaluate2d6Check({ dice: roll2d6(), mod: modal.mod, dc: modal.dc });
  return true;
}

export function confirmLiveCookDc(shift) {
  const modal = shift.activeCookDc;
  if (!modal) return null;
  const stove = shift.stoves[modal.stoveIdx];
  shift.activeCookDc = null;
  if (
    !currentOrderMatches(shift, stove?.ticket) ||
    modal.guestUid !== stove.ticket.guestUid ||
    modal.orderUid !== stove.ticket.orderUid
  )
    return null;
  const out = modal.check.outcome;
  const quality =
    out === 'crit' ? 'divine' : out === 'success' ? 'great' : out === 'fumble' ? 'burnt' : 'normal';
  if (isDcSuccess(out)) shift.dcPassed++;
  pushReadyPlate(shift, stove.ticket, quality);
  resetStove(stove);
  shift.completedByRole.cook = (shift.completedByRole.cook || 0) + 1;
  assignOrderToStove(shift);
  return { quality, outcome: out };
}

export function openLiveCookMiniGame(shift, stoveIdx) {
  const stove = shift.stoves[stoveIdx];
  if (!stove || stove.status !== 'cooking' || !stove.ticket) return null;
  const dish = SERVICE_CATALOG_MAP[stove.ticket.recipeId];
  const activity = serviceActivity(dish.activity, { cookSince: shift.elapsed }, shift.elapsed);
  shift.activeMiniGame = {
    stoveIdx,
    guestUid: stove.ticket.guestUid,
    orderUid: stove.ticket.orderUid,
    dish,
    kind: activity.kind,
    activity,
  };
  return shift.activeMiniGame;
}

export function inputLiveCookMiniGame(shift, input) {
  const mg = shift.activeMiniGame;
  if (!mg) return { valid: false };
  const stove = shift.stoves[mg.stoveIdx];
  if (
    !currentOrderMatches(shift, stove?.ticket) ||
    mg.guestUid !== stove.ticket.guestUid ||
    mg.orderUid !== stove.ticket.orderUid
  ) {
    shift.activeMiniGame = null;
    return { valid: false };
  }
  const res = applyServiceGesture(mg.activity, input);
  if (!res.valid) return { valid: false };
  mg.activity = { ...mg.activity, state: res.state };
  if (!res.done) return { valid: true, done: false, activity: mg.activity };
  shift.activeMiniGame = null;
  if (stove && stove.ticket) {
    pushReadyPlate(shift, stove.ticket, 'great');
    resetStove(stove);
    shift.completedByRole.cook = (shift.completedByRole.cook || 0) + 1;
    assignOrderToStove(shift);
  }
  return { valid: true, done: true };
}

export function closeLiveCookMiniGame(shift) {
  shift.activeMiniGame = null;
}

export function clickLiveStove(shift, stoveIdx) {
  const stove = shift.stoves[stoveIdx];
  if (!stove || !stove.unlocked) return { action: 'none' };
  if (stove.status === 'dc_ready') {
    openLiveCookDc(shift, stoveIdx);
    return { action: 'dc-modal' };
  }
  if (stove.status === 'cooking') {
    openLiveCookMiniGame(shift, stoveIdx);
    return { action: 'minigame' };
  }
  return { action: 'idle' };
}

export function boostLiveStove(shift, stoveIdx) {
  const stove = shift.stoves[stoveIdx];
  if (!stove || stove.status !== 'cooking' || !stove.ticket) return false;
  stove.progress = Math.min(1, stove.progress + 0.34);
  if (stove.progress >= 1) {
    if (shift.activeMiniGame?.stoveIdx === stoveIdx) shift.activeMiniGame = null;
    const dish = SERVICE_CATALOG_MAP[stove.ticket.recipeId];
    if (dish?.kind === 'signature') {
      stove.status = 'dc_ready';
      stove.dcWait = 0;
    } else {
      pushReadyPlate(shift, stove.ticket, 'normal');
      resetStove(stove);
      assignOrderToStove(shift);
    }
  }
  return true;
}

/** End an active live shift early so the midnight ledger modal opens cleanly. */
export function closeLiveShiftEarly(shift) {
  if (!shift) return;
  shift.finished = true;
  shift.activeEvent = null;
  shift.activeCookDc = null;
  shift.activeMiniGame = null;
  shift.vipModalTableIdx = null;
}

export function pickLiveEventOption(shift, optIndex) {
  const ev = shift.activeEvent;
  if (!ev || ev.roll) return null;
  const opt = ev.def.opts[optIndex];
  if (!opt) return null;
  const mod = shift.staffMods?.[opt.post]?.[opt.attr] ?? 0;
  const check = evaluate2d6Check({ dice: roll2d6(), mod, dc: opt.dc });
  ev.pickedIndex = optIndex;
  ev.mod = mod;
  ev.roll = check;
  return ev;
}

export function rerollLiveEventCheck(shift) {
  const ev = shift.activeEvent;
  if (!ev?.roll || shift.fateTokens <= 0) return false;
  shift.fateTokens--;
  const opt = ev.def.opts[ev.pickedIndex];
  ev.roll = evaluate2d6Check({ dice: roll2d6(), mod: ev.mod || 0, dc: opt.dc });
  return true;
}

export function confirmLiveEventCheck(shift) {
  const ev = shift.activeEvent;
  if (!ev?.roll) return null;
  const opt = ev.def.opts[ev.pickedIndex];
  const won = isDcSuccess(ev.roll.outcome);
  shift.activeEvent = null;
  const effects = won ? opt.reward : opt.penalty;
  const summary = { won, text: won ? opt.winText : opt.loseText, ingName: null };
  if (won) {
    shift.dcPassed++;
    if (effects.gold) {
      shift.earnedGold += effects.gold;
      shift.eventGold += effects.gold;
    }
    if (effects.rep) shift.repGain += effects.rep;
    if (effects.fever) shift.fever = Math.min(100, shift.fever + effects.fever);
    if (effects.calm) {
      for (const g of shift.queue) g.patience = Math.min(g.maxPatience, g.patience + effects.calm);
      for (const t of shift.tables) {
        if (t.state === 'ordering' || t.state === 'waiting')
          t.patience = Math.min(t.maxPatience, t.patience + effects.calm);
      }
    }
    if (effects.randIng) {
      const keys = Object.keys(INGREDIENTS);
      const picked = keys[Math.floor(rngFloat(shift, 'event-ing') * keys.length)] || 'wheat';
      shift.bonusIngredients[picked] = (shift.bonusIngredients[picked] || 0) + 1;
      summary.ingName = INGREDIENTS[picked]?.name || picked;
    }
    shift.completedByRole[opt.post] = (shift.completedByRole[opt.post] || 0) + 2;
  } else {
    if (effects.gold) {
      const delta = Math.max(-shift.earnedGold, effects.gold);
      shift.earnedGold += delta;
      shift.eventGold += delta;
    }
    if (effects.rep) shift.repGain = Math.max(0, shift.repGain + effects.rep);
    if (effects.patience) {
      for (const t of shift.tables) {
        if (t.state === 'ordering' || t.state === 'waiting')
          t.patience = Math.max(3, t.patience + effects.patience);
      }
    }
  }
  return summary;
}

export function pourLiveAle(shift) {
  if (shift.kegCd > 0) return null;
  const gold = 6 + (shift.facilities?.barrel || 0) * 3;
  shift.kegCd = 6;
  shift.earnedGold += gold;
  shift.tipGold += gold;
  const candidates = [
    ...shift.tables.filter((t) => t.state === 'ordering' || t.state === 'waiting'),
    ...shift.queue,
  ].sort((a, b) => a.patience - b.patience);
  if (candidates[0]) {
    candidates[0].patience = Math.min(candidates[0].maxPatience, candidates[0].patience + 7);
  }
  return { gold, targetName: candidates[0]?.patron?.name || null };
}

export function triggerLiveFever(shift) {
  if (shift.fever < 100 || shift.feverLeft > 0) return false;
  shift.fever = 0;
  shift.feverLeft = 10;
  return true;
}

function tryAutoTick(shift) {
  const tryRoll = (role, weight = 1) =>
    rngFloat(shift, role) * 100 < serviceAutoChance(shift.staffLevels?.[role] || 0) * weight;

  if (shift.queue.length && shift.tables.some((t) => t.unlocked && t.state === 'empty')) {
    if (tryRoll('front', 1.1)) {
      seatLiveGuest(shift, shift.queue[0].uid);
      shift.lastAutoProc = { role: 'front', note: '前台自动迎宾入座' };
      return;
    }
  }
  const orderingNormal = shift.tables.find(
    (t) => t.unlocked && t.state === 'ordering' && !t.patron?.vip,
  );
  if (orderingNormal && tryRoll('server', 1)) {
    const dish = pickGuestDish(shift, orderingNormal.patron);
    queueLiveOrder(shift, orderingNormal, dish, 1);
    shift.lastAutoProc = { role: 'server', note: `服务员自动接单「${dish.name}」` };
    return;
  }
  if (shift.plates.length && tryRoll('server', 1)) {
    const plate = shift.plates[0];
    serveLivePlate(shift, plate.uid);
    shift.lastAutoProc = { role: 'server', note: '服务员自动上菜' };
    return;
  }
  const payTable = shift.tables.find((t) => t.unlocked && t.state === 'pay');
  if (payTable && tryRoll('clean', 1.1)) {
    const res = collectLiveTablePay(shift, payTable.idx);
    shift.lastAutoProc = { role: 'clean', note: `保洁收银翻台 +${res?.gold || 0}G` };
  }
}

export function advanceLiveService(shift, rawSeconds) {
  const seconds = Math.min(0.25, Math.max(0, Number(rawSeconds) || 0));
  if (!seconds || isPaused(shift)) return;

  shift.elapsed = Math.min(shift.duration, shift.elapsed + seconds);
  if (shift.kegCd > 0) shift.kegCd = Math.max(0, shift.kegCd - seconds);
  if (shift.feverLeft > 0) shift.feverLeft = Math.max(0, shift.feverLeft - seconds);
  if (shift.comboTimer > 0) {
    shift.comboTimer = Math.max(0, shift.comboTimer - seconds);
    if (shift.comboTimer === 0) shift.combo = 0;
  }

  if (
    !shift.eventTriggered &&
    !shift.activeEvent &&
    shift.elapsed >= shift.duration * 0.35 &&
    shift.servedCount >= 1
  ) {
    shift.eventTriggered = true;
    const def =
      SERVICE_LIVE_EVENTS[Math.floor(rngFloat(shift, 'ev') * SERVICE_LIVE_EVENTS.length)] ||
      SERVICE_LIVE_EVENTS[0];
    shift.activeEvent = { def, ttl: 20, roll: null, pickedIndex: 0, mod: 0 };
    return;
  }

  if (
    shift.guestsSpawned < shift.maxGuests &&
    shift.elapsed >= shift.nextGuestAt &&
    shift.queue.length < 4 &&
    shift.elapsed < shift.duration - 4
  ) {
    spawnGuest(shift);
    shift.nextGuestAt = shift.elapsed + (shift.tutorial ? 5.5 : 4.2);
  }

  if (shift.feverLeft <= 0) {
    for (let i = shift.queue.length - 1; i >= 0; i--) {
      shift.queue[i].patience -= seconds;
      if (shift.queue[i].patience <= 0) {
        shift.queue.splice(i, 1);
        shift.leftAngry++;
      }
    }
  }

  let expiredAny = false;
  for (const t of shift.tables) {
    if (!t.unlocked || t.state === 'empty') continue;
    if (t.state === 'eating') {
      t.eatTimer -= seconds;
      if (t.eatTimer <= 0) t.state = 'pay';
    } else if (t.state === 'ordering' || t.state === 'waiting') {
      if (shift.feverLeft <= 0) t.patience -= seconds;
      if (t.patience <= 0) {
        shift.orders = shift.orders.filter((o) => o.tableIdx !== t.idx);
        shift.plates = shift.plates.filter((p) => p.tableIdx !== t.idx);
        for (const s of shift.stoves) {
          if (s.ticket && s.ticket.tableIdx === t.idx) {
            resetStove(s);
            if (shift.activeCookDc?.stoveIdx === s.idx) shift.activeCookDc = null;
            if (shift.activeMiniGame?.stoveIdx === s.idx) shift.activeMiniGame = null;
          }
        }
        if (shift.vipModalTableIdx === t.idx) shift.vipModalTableIdx = null;
        t.state = 'empty';
        t.patron = null;
        t.recipeId = null;
        t.guestUid = null;
        t.orderUid = null;
        shift.leftAngry++;
        expiredAny = true;
      }
    }
  }

  if (expiredAny) assignOrderToStove(shift);

  for (const s of shift.stoves) {
    if (!s.unlocked) continue;
    if (s.status === 'cooking' && s.ticket) {
      const feverBoost = shift.feverLeft > 0 ? 1.4 : 1;
      s.progress = Math.min(1, s.progress + (seconds * feverBoost) / s.cookSec);
      if (s.progress >= 1) {
        const dish = SERVICE_CATALOG_MAP[s.ticket.recipeId];
        if (dish?.kind === 'signature') {
          s.status = 'dc_ready';
          s.dcWait = 9;
        } else {
          pushReadyPlate(shift, s.ticket, 'normal');
          resetStove(s);
          assignOrderToStove(shift);
        }
      }
    } else if (s.status === 'dc_ready' && s.ticket) {
      s.dcWait -= seconds;
      if (s.dcWait <= 0) {
        pushReadyPlate(shift, s.ticket, 'normal');
        resetStove(s);
        assignOrderToStove(shift);
      }
    }
  }

  shift.autoTimer -= seconds;
  if (shift.autoTimer <= 0) {
    shift.autoTimer = 2.5;
    tryAutoTick(shift);
  }

  const floorBusy =
    shift.queue.length > 0 ||
    shift.tables.some((t) => t.unlocked && t.state !== 'empty') ||
    shift.stoves.some((s) => s.status !== 'idle') ||
    shift.plates.length > 0;
  if (
    (shift.elapsed >= shift.duration && !floorBusy) ||
    (shift.guestsSpawned >= shift.maxGuests && !floorBusy)
  ) {
    shift.finished = true;
  }
}
