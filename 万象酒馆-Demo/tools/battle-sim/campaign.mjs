import { normalizeScript } from '../../src/ai/contracts.js';
import {
  acceptAdventureReply,
  adventureTurnContext,
  confirmEventChoice,
  createAdventureState,
  lockBoss,
} from '../../src/adventure/state.js';
import { claimCooperationAffection } from '../../src/cooperation.js';
import { firstCompanion } from '../../src/campaign.js';
import { joinPandora, prepareSwapLesson, recordSettlement } from '../../src/companion-events.js';
import { adventureTestScript } from '../../src/content/generation-mode.js';
import { computeMapDc, effectiveDcAttrs } from '../../src/dc.js';
import { resolveFixedChoiceCheck } from '../../src/dc-rp.js';
import { applyDiningToBattle, diningBattleCompleted } from '../../src/dining.js';
import {
  grantMidBattleOverlordEmblem,
  grantVictoryOverlordEmblem,
  prepareBossEmblem,
  prepareCorridorRing,
} from '../../src/emblem-progression.js';
import { claimEnemyDrops } from '../../src/enemy-drops.js';
import { encounterLevel } from '../../src/enemy-growth.js';
import {
  beginEncounter,
  chooseRest,
  completeAdventureNode,
  completeEncounter,
  currentEncounterSpec,
  expeditionNodeType,
  newExpedition,
} from '../../src/expedition.js';
import {
  availableExplorations,
  completeExploration,
  newExploration,
  unlockDungeonMap,
} from '../../src/exploration.js';
import {
  applyEncounterGrowth,
  claimCompletionExperience,
  claimKillExperience,
} from '../../src/growth.js';
import { resetRelationshipGains } from '../../src/relationships.js';
import { claimBattleRewards } from '../../src/rewards.js';
import { MAINLINE_DUNGEONS, UNLOCKABLE_DUNGEONS } from '../../src/worlds.js';
import { simulateBattle } from './battle.mjs';
import {
  compileRoster,
  createCareer,
  createCohort,
  equipmentSnapshot,
  orderMeal,
  partySnapshot,
  profileName,
  PROFILES,
  restock,
  rngFor,
} from './profiles.mjs';

export const CAMPAIGN_MAPS = UNLOCKABLE_DUNGEONS;

function resources(state, library) {
  const heroes = Object.values(state?.units ?? {}).filter((unit) => unit.side === 'hero');
  const living = heroes.filter((hero) => hero.hp > 0);
  const sum = (key) => heroes.reduce((total, hero) => total + hero[key], 0);
  const bag = Object.fromEntries(Object.entries(library.inventory.items).filter(([, n]) => n > 0));
  return {
    hp: sum('hp'),
    maxHp: sum('maxHp'),
    mp: sum('mp'),
    maxMp: sum('maxMp'),
    partySize: heroes.length,
    alive: living.length,
    down: heroes.length - living.length,
    critical: living.filter((hero) => hero.hp * 4 <= hero.maxHp).length,
    spEmpty: living.filter((hero) => hero.mp === 0).length,
    supplies: Object.values(bag).reduce((total, n) => total + n, 0),
    bag,
    gold: library.inventory.gold,
    ether: library.inventory.ether,
  };
}

function eventChoice(library, expedition, book, profile, rng) {
  const choiceIndex = Math.floor(rng() * book.adventure.event.choices.length);
  const choice = book.adventure.event.choices[choiceIndex];
  const raw = choice.dcCheck ?? { attr: ['str', 'wis', 'dex', 'cha'][choiceIndex % 4], dc: 9 };
  const spec = { ...raw, dc: computeMapDc(expedition.exploration.map, choiceIndex, raw.dc) };
  const score = (member) => effectiveDcAttrs(library, member).mods[spec.attr]?.mod ?? 0;
  const members = expedition.partyIds
    .filter(Boolean)
    .map((id) => library.characters.find((member) => member.id === id));
  const member =
    profile === 'novice' ? members[0] : [...members].sort((a, b) => score(b) - score(a))[0];
  const check = resolveFixedChoiceCheck({
    library,
    member,
    choice: { ...choice, dcCheck: spec },
    rng,
    seed: `${expedition.id}:event:${choice.id}:${member.id}`,
  });
  confirmEventChoice(book.adventure, expedition.adventure, choice.id, '', check);
  const turn = adventureTurnContext(expedition, book, '', check);
  acceptAdventureReply(
    library,
    expedition,
    book,
    turn,
    { content: '[SIM EVENT]' },
    `${expedition.id}:event`,
  );
  return { id: choice.id, check, reward: structuredClone(expedition.adventure.event.reward) };
}

function questConfirmation(library, expedition, book) {
  const turn = adventureTurnContext(expedition, book, '[SIM QUEST]');
  const first = turn.boss.lines[0];
  const reply = {
    content: '[SIM QUEST RESULT]',
    adventure: {
      episodeId: expedition.id,
      revision: turn.boss.revision,
      tasks: turn.goals
        .filter((goal) => goal.required)
        .map(({ id }) => ({ id, status: 'completed', evidence: '[SIM CONFIRMED]' })),
      patches: first
        ? [{ op: 'replace', id: first.id, speaker: first.speaker, text: first.text }]
        : [],
    },
  };
  const { warnings } = acceptAdventureReply(
    library,
    expedition,
    book,
    turn,
    reply,
    `${expedition.id}:quest`,
  );
  if (lockBoss(expedition, book)) {
    claimBattleRewards(library, `${expedition.id}:quest-4`, { summonContracts: 0, gold: 20 });
    expedition.adventure.questRewardClaimed = true;
  }
  return {
    locked: expedition.adventure.boss.locked,
    revision: expedition.adventure.boss.revision,
    warnings,
  };
}

function recoveryChoice(state, library, profile) {
  if (profile === 'novice') return 'sleep';
  const { hp, maxHp, mp, maxMp, down } = resources(state, library);
  if (down > 0 || hp / maxHp < 0.57) return 'sleep';
  return mp / Math.max(1, maxMp) < hp / maxHp ? 'meal' : 'sleep';
}

function runBattle(library, expedition, profile, rng, { maxRounds, keepTrace }) {
  const index = expedition.index;
  const type = expeditionNodeType(expedition);
  if (expedition.carried) applyEncounterGrowth(expedition, library.characters);
  prepareCorridorRing(library, expedition, rng);
  prepareBossEmblem(library, expedition, rng);
  const state = beginEncounter(expedition);
  applyDiningToBattle(library, state, expedition.partyIds);
  const meal = Object.fromEntries(
    Object.values(state.units)
      .filter((unit) => unit.mealBonus)
      .map((unit) => [unit.id, unit.mealBonus.applied]),
  );
  if (expedition.exploration.tutorial && (index === 2 || index === 4)) {
    const potion = index === 2 ? 'slow-potion' : 'mana-potion';
    claimBattleRewards(library, `${expedition.id}:tutorial:${index}`, {
      summonContracts: 0,
      items: { [potion]: 1 },
    });
  }
  state.items = structuredClone(library.inventory.items);
  const start = resources(state, library);
  const enemies = state.enemyIds.map((id) => ({
    id,
    level: state.units[id].level,
    hp: state.units[id].hp,
  }));
  const boss = currentEncounterSpec(expedition).boss ? expedition.boss : null;
  const levels = [];
  const drops = [];
  const ringGrants = [
    expedition.corridorRing?.encounter === index && expedition.corridorRing,
    index === 4 && expedition.emblemArrival,
  ].filter(Boolean);
  const battle = simulateBattle(state, {
    seed: Math.floor(rng() * 4294967296),
    maxRounds,
    policy: PROFILES[profile].policy,
    candidateLimit: profile === 'novice' ? 3 : 5,
    exerciseEmblem: profile !== 'novice',
    keepTrace,
    checkReplay: keepTrace,
    auditEvents: keepTrace,
    onRound({ before, result, next }) {
      levels.push(
        ...claimKillExperience(library, expedition, before, result).filter(
          (gain) => gain.levels.length,
        ),
      );
      library.inventory.items = structuredClone(result.final.items);
      drops.push(...claimEnemyDrops(library, expedition, before, result));
      claimCooperationAffection(library, expedition, result);
      if (next.phase !== 'victory' && next.phase !== 'defeat') {
        const ring = grantMidBattleOverlordEmblem(library, next, expedition, rng);
        if (ring) ringGrants.push(ring);
      }
    },
  });
  const bossCoverage = battle.coverage.bosses[boss];
  const coverage = {
    ...battle.coverage,
    ...(bossCoverage && {
      bossActed: bossCoverage.actions > 0,
      bossMechanicSeen: Boolean(
        bossCoverage.mechanics ||
        bossCoverage.charges ||
        bossCoverage.releases ||
        bossCoverage.phases.length,
      ),
    }),
  };
  const end = resources(battle.state, library);
  let next;
  if (battle.outcome === 'victory') {
    next = completeEncounter(expedition, battle.state);
    const ring = grantVictoryOverlordEmblem(library, battle.state, expedition, rng);
    if (ring) ringGrants.push(ring);
    claimBattleRewards(library, next.rewardId, next.rewards);
  }
  if (battle.outcome === 'victory' || battle.outcome === 'defeat') {
    diningBattleCompleted(library, `${expedition.id}:${index}`);
  }
  return {
    index,
    type,
    outcome: battle.outcome,
    rounds: battle.rounds,
    start,
    end,
    enemies,
    boss,
    battle: { trace: battle.trace, coverage, violations: battle.violations },
    meal,
    drops,
    ringGrants,
    levels,
    rewards: next?.rewards,
  };
}

function runExpedition(library, entry, profile, seed, mode, battleOptions) {
  const id = `sim:${mode}:${profile}:${seed}:${entry.id}:${Boolean(entry.tutorial)}`;
  const rng = rngFor(id);
  const book = normalizeScript(adventureTestScript(entry.map), `${id}:script`);
  resetRelationshipGains(library);
  prepareSwapLesson(library);
  restock(library, profile);
  const dining = orderMeal(library, profile);
  const spec = currentEncounterSpec({ exploration: entry, index: 4 });
  const boss =
    entry.boss && spec.enemyIds.includes(entry.boss)
      ? entry.boss
      : spec.enemyIds[Math.floor(spec.enemyIds.length / 2)];
  const expedition = newExpedition(boss, compileRoster(library), entry);
  expedition.id = id;
  expedition.partyIds = [...library.party];
  expedition.adventure = createAdventureState(book, id);
  const party = partySnapshot(library);
  const report = {
    map: entry.map,
    sequence: entry.sequence,
    tutorial: Boolean(entry.tutorial),
    party,
    equipment: equipmentSnapshot(library),
    nodes: [],
    dining,
    entry: {
      id: entry.id,
      nodeId: entry.nodeId ?? null,
      seed: entry.seed,
      boss,
      level: encounterLevel(entry),
      fixtureUnlock: mode === 'cohort',
      assumedPriorSettlements: mode === 'cohort' ? library.progression.settlements.length : 0,
      heroLevels: party.filter(Boolean).map((member) => member.level),
    },
  };
  while (expedition.status === 'active') {
    const index = expedition.index;
    const type = expeditionNodeType(expedition);
    if (type === 'event' || type === 'quest') {
      const start = resources(expedition.carried, library);
      const node = { index, type, start, outcome: 'complete' };
      if (type === 'event') node.choice = eventChoice(library, expedition, book, profile, rng);
      else {
        const rest = recoveryChoice(expedition.carried, library, profile);
        const changes = chooseRest(expedition, rest);
        node.recovery = { choice: rest, changes };
        node.confirmation = questConfirmation(library, expedition, book);
      }
      completeAdventureNode(expedition, book);
      node.end = resources(expedition.carried, library);
      report.nodes.push(node);
      continue;
    }
    const node = runBattle(library, expedition, profile, rng, battleOptions);
    report.nodes.push(node);
    if (node.outcome !== 'victory') {
      report.outcome = node.outcome;
      return report;
    }
  }
  if (entry.tutorial) {
    library.campaign.completed = true;
    library.campaign.tutorial = 'ether';
    claimBattleRewards(library, `${id}:tutorial-ether`, { summonContracts: 0, ether: 10 });
  }
  claimCompletionExperience(library, expedition);
  recordSettlement(library, id);
  report.outcome = 'victory';
  return report;
}

function nextEntry(route) {
  return [...availableExplorations(route)].sort((a, b) => a.sequence - b.sequence)[0];
}

function routeEntries(seed, map, sites) {
  const routes = newExploration(seed);
  const entries = [];
  while (entries.length < sites) {
    const entry = nextEntry(routes[map]);
    if (!entry || (MAINLINE_DUNGEONS.includes(map) && entry.endless)) break;
    entries.push(entry);
    completeExploration(routes, entry);
  }
  return entries;
}

function runCareer(report, maps, sites, battleOptions) {
  const { seed, profile } = report;
  const library = createCareer(seed);
  if (!maps.includes('mill')) {
    report.blocked = { map: 'mill', outcome: 'starter-excluded' };
    return;
  }
  const route = library.exploration.mill;
  for (let index = 0; index < sites; index++) {
    const routeEntry = nextEntry(route);
    if (!routeEntry || routeEntry.endless) break;
    const entry = { ...routeEntry, tutorial: !library.campaign.completed };
    const trip = runExpedition(library, entry, profile, seed, 'career', battleOptions);
    report.expeditions.push(trip);
    if (trip.outcome !== 'victory') {
      report.blocked = {
        map: entry.map,
        sequence: entry.sequence,
        index: trip.nodes.at(-1)?.index,
        outcome: trip.outcome,
      };
      return;
    }
    completeExploration(library.exploration, entry);
    if (!library.campaign.firstRecruit) {
      firstCompanion(library);
      library.campaign.tutorial = 'done';
    }
    joinPandora(library);
  }
}

export function simulateCampaign({
  profile = 'standard',
  seed = 1,
  mode = 'cohort',
  maps = CAMPAIGN_MAPS,
  sites = 6,
  maxRounds = 32,
  keepTrace = false,
  heroLevel,
  sequences,
} = {}) {
  const resolved = profileName(profile);
  if (!resolved) throw Error(`Unknown simulation profile: ${profile}`);
  if (mode !== 'career' && mode !== 'cohort') throw Error(`Unknown campaign mode: ${mode}`);
  if (!maps.length || maps.some((map) => !CAMPAIGN_MAPS.includes(map)))
    throw Error('Unknown campaign map');
  if (
    heroLevel !== undefined &&
    (!Number.isInteger(heroLevel) || heroLevel < 1 || heroLevel > 99)
  ) {
    throw Error('heroLevel must be an integer from 1 to 99');
  }
  if (
    sequences !== undefined &&
    (!Array.isArray(sequences) ||
      sequences.length === 0 ||
      sequences.some((sequence) => !Number.isSafeInteger(sequence) || sequence < 0))
  ) {
    throw Error('sequences must be a nonempty array of nonnegative safe integers');
  }
  if (mode !== 'cohort' && (heroLevel !== undefined || sequences !== undefined)) {
    throw Error('heroLevel and sequences are supported only in cohort mode');
  }
  const report = { profile: resolved, seed, mode, expeditions: [], blocked: null };
  const battleOptions = { maxRounds, keepTrace };
  if (mode === 'career') runCareer(report, maps, sites, battleOptions);
  else {
    for (const map of new Set(maps)) {
      const count = sequences
        ? Math.max(sites, ...sequences.map((sequence) => sequence + 1))
        : sites;
      const entries = routeEntries(seed, map, count);
      for (const entry of entries) {
        if (sequences && !sequences.includes(entry.sequence)) continue;
        const library = createCohort(seed, resolved, entry, { heroLevel });
        unlockDungeonMap(library, map);
        report.expeditions.push(runExpedition(library, entry, resolved, seed, mode, battleOptions));
      }
    }
  }
  return report;
}
