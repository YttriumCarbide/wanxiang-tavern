import { HEROES } from './data.js';
import {
  BREAKER_EMBLEM_ID,
  EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
  EMBLEMS,
  applyEmblemStats,
} from './emblems.js';

/** This schedule is shared by actual grants and narrative requests. */
export function storyRingReward(route, owned = []) {
  if (!route || route.world || route.endless) return null;
  const seq = route.sequence;
  const id =
    route.map === 'mill'
      ? { 0: EMBLEM_ID }[seq]
      : route.map === 'ruins'
        ? { 2: OVERLOAD_EMBLEM_ID }[seq]
        : route.map === 'forest'
          ? { 3: MASK_EMBLEM_ID }[seq]
          : null;
  return id && !owned.includes(id) ? { id, name: EMBLEMS[id].emblem.name, encounter: 4 } : null;
}

/** Choose once at the actual reward boundary; never replace another equipped ring. */
function equipStoryRing(library, expedition, emblemId, random, preferredMemberId = null) {
  const party = expedition.partyIds || library.party || [];
  const formation =
    expedition.carried?.formation || HEROES.map((hero, index) => (party[index] ? hero.id : null));
  const candidates = (library.characters || []).filter((member) => !member.emblemId);
  const preferred = preferredMemberId
    ? candidates.find((member) => member.id === preferredMemberId && party.includes(member.id))
    : null;
  const fronts = candidates.filter((member) => {
    const actor = HEROES[party.indexOf(member.id)]?.id;
    return actor && formation.slice(0, 3).includes(actor);
  });
  const pool = fronts.length ? fronts : candidates;
  if (!preferred && !pool.length) return null;
  const member = preferred || pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  const actor = HEROES[party.indexOf(member.id)]?.id || null;
  member.emblemId = emblemId;
  for (const roster of [expedition.heroDefinitions, expedition.carried?.heroDefinitions]) {
    if (actor && roster?.[actor])
      roster[actor] = { ...applyEmblemStats(roster[actor], emblemId), emblemId };
  }
  return { memberId: member.id, actor, name: member.setting.name };
}

/** Grant the authored ring once at the corridor Boss boundary, never in a preview. */
export function prepareCorridorRing(library, expedition, random = Math.random) {
  if (storyRingReward(expedition.exploration)?.id !== EMBLEM_ID || expedition.index !== 4)
    return false;
  if (library.progression?.corridorRingAcquired) return false;
  library.emblems ||= [];
  if (library.emblems.includes(EMBLEM_ID)) return false;
  library.emblems.push(EMBLEM_ID);
  const recipient = equipStoryRing(
    library,
    expedition,
    EMBLEM_ID,
    random,
    library.campaign?.protagonistId || null,
  );
  expedition.corridorRing = {
    ...recipient,
    actor: recipient?.actor || null,
    encounter: 4,
    bossId: 'millVoleAlpha',
  };
  library.progression.corridorRingAcquired = true;
  library.progression.emblemLesson = 'corridor-intro';
  return true;
}

/** Authored Boss rewards are granted once on entering the matching final battle. */
export function prepareBossEmblem(library, expedition, random = Math.random) {
  if (expedition.index !== 4) return false;
  const id = storyRingReward(expedition.exploration)?.id;
  if (!id || id === EMBLEM_ID || library.emblems?.includes(id)) return false;
  library.emblems ||= [];
  library.emblems.push(id);
  const recipient = equipStoryRing(library, expedition, id, random);
  expedition.emblemArrival = { id, shown: false, recipient };
  if (id === OVERLOAD_EMBLEM_ID && library.progression)
    library.progression.overloadLesson = recipient ? 'done' : 'equip';
  return true;
}

export const OVERLORD_EMBLEM_UNLOCKS = Object.freeze({
  alchemicalPuppet: BREAKER_EMBLEM_ID,
  darkscaleWarlord: DRAGON_EMBLEM_ID,
  banditSyndicateKing: SUPREME_EMBLEM_ID,
});

function awardOverlordEmblem(library, battleState, expedition, emblemId, random, midBattle) {
  if (!library || library.emblems?.includes(emblemId)) return null;
  library.emblems ||= [];
  library.emblems.push(emblemId);

  const party = expedition?.partyIds || library.party || [];
  const formation = Array.isArray(battleState?.formation) ? battleState.formation : [];
  const candidates = (library.characters || []).filter((member) => {
    if (member.emblemId) return false;
    const actor = HEROES[party.indexOf(member.id)]?.id;
    return !actor || !battleState?.units?.[actor] || battleState.units[actor].hp > 0;
  });
  const fronts = candidates.filter((member) => {
    const actor = HEROES[party.indexOf(member.id)]?.id;
    return actor && formation.slice(0, 3).includes(actor);
  });
  const pool = fronts.length ? fronts : candidates;
  let recipient = null;
  if (pool.length) {
    const member = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    const actor = HEROES[party.indexOf(member.id)]?.id || null;
    member.emblemId = emblemId;
    if (actor && battleState) {
      const baseHero =
        battleState.heroDefinitions?.[actor] ||
        expedition?.heroDefinitions?.[actor] ||
        expedition?.carried?.heroDefinitions?.[actor] ||
        HEROES.find((hero) => hero.id === actor);
      if (baseHero) {
        battleState.heroDefinitions ||= {};
        battleState.heroDefinitions[actor] = { ...baseHero, emblemId };
        if (expedition) {
          expedition.heroDefinitions ||= {};
          expedition.heroDefinitions[actor] = {
            ...(expedition.heroDefinitions[actor] || baseHero),
            emblemId,
          };
        }
        if (expedition?.carried) {
          expedition.carried.heroDefinitions ||= {};
          expedition.carried.heroDefinitions[actor] = {
            ...(expedition.carried.heroDefinitions[actor] || baseHero),
            emblemId,
          };
        }
      }
      if (midBattle && battleState.units?.[actor]) {
        battleState.units[actor].emblemCharge = 6;
      }
    }
    recipient = { memberId: member.id, actor, name: member.setting.name };
  }
  const arrival = { id: emblemId, shown: false, recipient, midBattle };
  if (expedition) expedition.emblemArrival = arrival;
  else if (battleState) battleState.midBattleEmblemArrival = arrival;
  return arrival;
}

/** Mid-battle drop during Overlord fights (Puppet -> Cang Ming, Darkscale -> Tan Hongyu, Black Market -> Jiu Qi). */
export function grantMidBattleOverlordEmblem(
  library,
  battleState,
  expedition = null,
  random = Math.random,
) {
  if (!library || !battleState || battleState.phase !== 'plan') return null;
  for (const [bossId, emblemId] of Object.entries(OVERLORD_EMBLEM_UNLOCKS)) {
    const unit = battleState.units?.[bossId];
    if (!unit || unit.hp <= 0 || library.emblems?.includes(emblemId)) continue;
    const triggered =
      Boolean(unit.breakWindow?.active) ||
      (battleState.round || 1) >= 2 ||
      (unit.bossStage || 1) >= 2 ||
      Boolean(unit.enraged);
    if (!triggered) continue;
    return awardOverlordEmblem(library, battleState, expedition, emblemId, random, true);
  }
  return null;
}

export const grantMidBattlePuppetEmblem = grantMidBattleOverlordEmblem;

/** Safety-net unlock on victory in case a player burst-defeated an Overlord on Round 1. */
export function grantVictoryOverlordEmblem(
  library,
  battleState,
  expedition = null,
  random = Math.random,
) {
  if (!library || !battleState || battleState.phase !== 'victory') return null;
  for (const [bossId, emblemId] of Object.entries(OVERLORD_EMBLEM_UNLOCKS)) {
    if (!battleState.enemyIds?.includes(bossId) || library.emblems?.includes(emblemId)) continue;
    return awardOverlordEmblem(library, battleState, expedition, emblemId, random, false);
  }
  return null;
}
