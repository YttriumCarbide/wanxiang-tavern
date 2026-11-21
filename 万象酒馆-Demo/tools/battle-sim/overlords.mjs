import {
  createCohort,
  compileRoster,
  partySnapshot,
  equipmentSnapshot,
  restock,
  rngFor,
} from './profiles.mjs';
import { simulateBattle } from './battle.mjs';
import { summarizeNode } from './statistics.mjs';
import { newEncounter } from '../../src/engine.js';
import { encounterSpec } from '../../src/data.js';
import { grantMidBattleOverlordEmblem } from '../../src/emblem-progression.js';

export const OVERLORD_LEVEL10_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'banditSyndicateKing', map: 'black-market' }),
  Object.freeze({ id: 'darkscaleWarlord', map: 'graystone-quarry' }),
]);

const PARTY_SIZE = 6;
const HERO_LEVEL = 10;
const BOSS_LEVEL = 10;

function assertSafeInteger(name, value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a safe integer in [${min}, ${max}], got ${value}`);
  }
}

function validateOptions({ seeds, firstSeed, maxRounds, candidateLimit }) {
  assertSafeInteger('seeds', seeds, 1, 128);
  assertSafeInteger('firstSeed', firstSeed, 1, 0xffffffff);
  assertSafeInteger('maxRounds', maxRounds, 1, 60);
  assertSafeInteger('candidateLimit', candidateLimit, 1, 20);
  if (firstSeed + seeds - 1 > 0xffffffff) {
    throw new RangeError(
      `firstSeed + seeds - 1 must be <= 0xffffffff, got ${firstSeed} + ${seeds} - 1 = ${firstSeed + seeds - 1}`,
    );
  }
}

function resources(state) {
  const units = Object.values(state.units);
  const heroes = units.filter((unit) => unit.side === 'hero');
  const alive = heroes.filter((unit) => unit.hp > 0);
  const down = heroes.length - alive.length;
  const supplies = Object.values(state.items || {}).reduce(
    (total, count) => total + (Number.isFinite(count) ? count : 0),
    0,
  );
  return {
    hp: heroes.reduce((total, unit) => total + unit.hp, 0),
    maxHp: heroes.reduce((total, unit) => total + unit.maxHp, 0),
    mp: heroes.reduce((total, unit) => total + unit.mp, 0),
    maxMp: heroes.reduce((total, unit) => total + unit.maxMp, 0),
    partySize: heroes.length,
    alive: alive.length,
    down,
    supplies,
  };
}

function ironStacksOf(state, bossId) {
  const boss = state.units[bossId];
  const stacks = boss?.buffs?.iron;
  return Number.isFinite(stacks) ? stacks : 0;
}

function summonedSpecies(state, bossId) {
  const species = new Map();
  for (const unit of Object.values(state.units)) {
    if (unit.side !== 'enemy') continue;
    if (unit.id === bossId) continue;
    if (unit.speciesKey !== 'riftDarkDust') continue;
    const key = unit.speciesKey;
    if (!species.has(key)) species.set(key, new Set());
    species.get(key).add(unit.id);
  }
  return species;
}

function mergeSpecies(target, source) {
  for (const [key, ids] of source) {
    if (!target.has(key)) target.set(key, new Set());
    for (const id of ids) target.get(key).add(id);
  }
}

function speciesSummary(species) {
  return Object.fromEntries(
    [...species.entries()]
      .map(([key, ids]) => [key, ids.size])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function speciesIds(species) {
  return Object.fromEntries(
    [...species.entries()]
      .map(([key, ids]) => [key, [...ids].sort()])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function bossMechanicSeen(coverage, bossId, hiddenLocks, summoned) {
  const boss = coverage.bosses?.[bossId];
  if (boss && (boss.mechanics > 0 || boss.phases.length > 0)) return true;
  if (hiddenLocks > 0) return true;
  if (summoned.size > 0) return true;
  return false;
}

function buildEncounter(scenario, entry, heroDefinitions) {
  const spec = encounterSpec(4, scenario.id);
  const config = {
    ...spec,
    map: scenario.map,
    level: BOSS_LEVEL,
    growthEntry: entry,
    enemyIds: [scenario.id],
  };
  return newEncounter(config, null, 4, heroDefinitions);
}

function runScenarioSeed(scenario, seed, options) {
  const { firstSeed, maxRounds, candidateLimit, keepTrace } = options;
  const entry = {
    id: `overlord-calibration:${scenario.id}:${seed}`,
    map: scenario.map,
    boss: scenario.id,
    level: BOSS_LEVEL,
    seed,
    sequence: 3,
  };

  const library = createCohort(seed, 'standard', entry, { heroLevel: HERO_LEVEL });
  restock(library, 'standard');
  const heroDefinitions = compileRoster(library);

  const state = buildEncounter(scenario, entry, heroDefinitions);
  state.seed = seed;
  state.items = structuredClone(library.inventory.items);

  const rng = rngFor(`overlord-calibration:${scenario.id}:${seed}`);
  const expedition = {
    id: entry.id,
    index: 4,
    exploration: entry,
    heroDefinitions,
  };

  const initialParty = structuredClone(partySnapshot(library));
  const initialEquipment = structuredClone(equipmentSnapshot(library));

  const before = resources(state);

  const bossInitial = state.units[scenario.id];
  const bossHp = bossInitial ? bossInitial.maxHp : null;

  const summoned = new Map();
  const hiddenWeaponBuffSet = new Set();
  let hiddenWeaponLocks = 0;
  let maxIronStacks = ironStacksOf(state, scenario.id);
  const emblemArrivals = [];

  const battle = simulateBattle(state, {
    seed,
    maxRounds,
    policy: 'balanced',
    candidateLimit,
    keepTrace,
    exerciseEmblem: true,
    checkReplay: seed === firstSeed,
    auditEvents: seed === firstSeed,
    onRound: ({ result, next }) => {
      library.inventory.items = structuredClone(next.items);
      if (next.phase === 'plan') {
        const granted = grantMidBattleOverlordEmblem(library, next, expedition, rng);
        if (granted) {
          emblemArrivals.push({
            id: granted.id,
            round: next.round,
            actor: granted.recipient?.actor,
          });
        }
      }
      for (const event of result.events || []) {
        if (event.type === 'hiddenWeaponLock') {
          hiddenWeaponLocks++;
          if (event.weapon?.buff) hiddenWeaponBuffSet.add(event.weapon.buff);
        }
        if (event.after) {
          maxIronStacks = Math.max(maxIronStacks, ironStacksOf(event.after, scenario.id));
        }
      }
      mergeSpecies(summoned, summonedSpecies(next, scenario.id));
      maxIronStacks = Math.max(maxIronStacks, ironStacksOf(next, scenario.id));
    },
  });

  maxIronStacks = Math.max(maxIronStacks, ironStacksOf(battle.state, scenario.id));

  const after = resources(battle.state);

  const bossCoverage = battle.coverage.bosses?.[scenario.id];
  const bossActed = Boolean(bossCoverage && bossCoverage.actions > 0);
  const bossLevel = battle.state.units[scenario.id]?.level ?? null;

  const sample = {
    seed,
    outcome: battle.outcome,
    rounds: battle.rounds,
    before,
    after,
    bossActed,
    enteredBoss: true,
    bossMechanicSeen: bossMechanicSeen(battle.coverage, scenario.id, hiddenWeaponLocks, summoned),
    party: initialParty,
    equipment: initialEquipment,
    bossLevel,
    bossHp,
    emblemArrivals,
    hiddenWeaponBuffs: [...hiddenWeaponBuffSet].sort(),
    hiddenWeaponLocks,
    summonedMinions: speciesSummary(summoned),
    maxIronStacks,
    violations: battle.violations,
    damage: battle.coverage.damageToHeroesByEvent,
  };
  if (keepTrace) sample.trace = battle.trace;
  return { sample, summoned };
}

function meanDamageByEvent(samples) {
  const totals = {};
  for (const sample of samples) {
    for (const [type, value] of Object.entries(sample.damage || {})) {
      totals[type] = (totals[type] || 0) + value;
    }
  }
  const count = samples.length || 1;
  return Object.fromEntries(
    Object.entries(totals)
      .map(([type, total]) => [type, total / count])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function runScenario(scenario, options) {
  const samples = [];
  const summonedAll = new Map();
  for (let index = 0; index < options.seeds; index++) {
    const seed = options.firstSeed + index;
    const { sample, summoned } = runScenarioSeed(scenario, seed, options);
    samples.push(sample);
    mergeSpecies(summonedAll, summoned);
  }

  const summary = summarizeNode(samples);
  const meanHeroCasualtyFraction =
    samples.reduce((total, sample) => total + sample.after.down, 0) / (samples.length * PARTY_SIZE);

  return {
    ...scenario,
    ...summary,
    meanHeroCasualtyFraction,
    meanDamageByEvent: meanDamageByEvent(samples),
    summonedSpecies: speciesSummary(summonedAll),
    summonedSpeciesIds: speciesIds(summonedAll),
    samples,
  };
}

export function runOverlordCalibration({
  seeds = 8,
  firstSeed = 1,
  maxRounds = 24,
  candidateLimit = 5,
  keepTrace = false,
} = {}) {
  validateOptions({ seeds, firstSeed, maxRounds, candidateLimit });
  const options = { seeds, firstSeed, maxRounds, candidateLimit, keepTrace };
  const bosses = OVERLORD_LEVEL10_SCENARIOS.map((scenario) => runScenario(scenario, options));
  return {
    schemaVersion: 1,
    scenario: {
      heroLevel: HERO_LEVEL,
      bossLevel: BOSS_LEVEL,
      profile: 'standard',
      partySize: PARTY_SIZE,
      seeds,
      firstSeed,
      maxRounds,
      candidateLimit,
      resourceBaseline: 'fresh-single-battle',
      emblemPolicy: 'official round-2/phase unlock',
      target: {
        winRateMin: 0.8,
        meanRounds: [5, 7],
        casualtyRate: [0.1, 0.3],
        casualtyDenominator: 'encounters with at least one dead hero',
      },
    },
    bosses,
  };
}
