import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { DEFINITIONS, ENCOUNTERS, HEROES, encounterSpec } from '../../src/data.js';
import { EMBLEMS } from '../../src/emblems.js';
import { newEncounter } from '../../src/engine.js';
import { applyEquipment, normalizeEquipment } from '../../src/equipment.js';
import { hashSeed } from '../../src/equipment-scale.js';
import { Worker } from 'node:worker_threads';
import { simulateBattle } from './battle.mjs';
import { STRESS_AFFIXES, STRESS_ROSTERS } from './stress-fixtures.mjs';

export const STRESS_EMBLEMS = Object.freeze(Object.keys(EMBLEMS));
export const STRESS_ENEMIES = Object.freeze(
  Object.values(DEFINITIONS)
    .filter(({ speed }) => speed)
    .map(({ id }) => id)
    .sort(),
);

function makeEquipment(affix) {
  if (!affix.rules.length) return [];
  const id = `stress-${affix.id}`;
  return [
    normalizeEquipment(
      {
        name: id,
        description: '',
        category: 'pendant',
        stats: affix.stats,
        rules: affix.rules,
      },
      { id, name: id, value: 80 },
    ),
  ];
}

function makeRoster(roster, emblemId, equipment) {
  return Object.fromEntries(
    HEROES.map((slot, index) => {
      const templateId = roster.members[index];
      if (!templateId) return [slot.id, { ...slot, inactive: true }];
      const template =
        templateId === 'qingyuan' ? defaultProtagonist().combat : DEFINITIONS[templateId];
      const combat = applyEquipment(template, index === 0 ? equipment : []);
      return [slot.id, { ...combat, id: slot.id, ...(index === 0 ? { emblemId } : {}) }];
    }),
  );
}

function encounterFor(enemy) {
  if (!enemy.boss && !enemy.overlord) return { enemyIds: [enemy.id] };
  const boss = ['moonRoot', 'moonCrown'].includes(enemy.id) ? 'moonEye' : enemy.id;
  return encounterSpec(ENCOUNTERS.length - 1, boss);
}

function runCase(enemy, roster, emblem, affix, definitions, options) {
  const spec = encounterFor(enemy);
  const caseId = `${roster.id}/${emblem}/${affix.id}/${enemy.id}`;
  const seed = hashSeed(`${options.seed}:${caseId}`);
  const state = newEncounter(
    { ...spec, initialEmblemCharge: { [HEROES[0].id]: 6 } },
    null,
    0,
    definitions,
  );
  state.seed = seed;
  const battle = simulateBattle(state, {
    ...options,
    seed,
    keepTrace: false,
    exerciseEmblem: true,
  });
  return {
    caseId,
    seed,
    roster: roster.id,
    emblem,
    affix: affix.id,
    enemy: enemy.id,
    composition: spec.enemyIds,
    outcome: battle.outcome,
    rounds: battle.rounds,
    coverage: battle.coverage,
    violations: battle.violations,
    examples: battle.trace,
  };
}

function selectedKeys(options, key, all) {
  const requested = options[key] ?? all;
  if (!Array.isArray(requested) || !requested.length || requested.some((id) => !all.includes(id))) {
    throw new RangeError(`Unknown or empty stress matrix dimension: ${key}`);
  }
  return [...new Set(requested)];
}

export function runStressMatrixSerial(options = {}) {
  const seed = options.seed ?? 1;
  const maxRounds = options.maxRounds ?? 4;
  const candidateLimit = options.candidateLimit ?? 1;
  const policy = options.policy ?? 'balanced';
  const checkReplay = options.checkReplay ?? true;
  const auditEvents = options.auditEvents ?? true;
  const rosters = selectedKeys(
    options,
    'rosters',
    STRESS_ROSTERS.map(({ id }) => id),
  );
  const emblems = selectedKeys(options, 'emblems', STRESS_EMBLEMS);
  const affixes = selectedKeys(
    options,
    'affixes',
    STRESS_AFFIXES.map(({ id }) => id),
  );
  const enemies = selectedKeys(options, 'enemies', STRESS_ENEMIES);
  const dimensions = { rosters, emblems, affixes, enemies };
  const results = [];
  const outcomes = {};
  const bossCoverage = {};
  const equipmentCoverage = {};
  const emblemCoverage = {};
  const violations = [];
  let previews = 0;
  for (const roster of STRESS_ROSTERS.filter(({ id }) => rosters.includes(id))) {
    for (const emblem of emblems) {
      for (const affix of STRESS_AFFIXES.filter(({ id }) => affixes.includes(id))) {
        const definitions = makeRoster(roster, emblem, makeEquipment(affix));
        for (const id of enemies) {
          const enemy = DEFINITIONS[id];
          const result = runCase(enemy, roster, emblem, affix, definitions, {
            seed,
            maxRounds,
            candidateLimit,
            policy,
            checkReplay,
            auditEvents,
          });
          const { examples, ...row } = result;
          results.push(row);
          previews += row.coverage.previews;
          outcomes[row.outcome] = (outcomes[row.outcome] || 0) + 1;
          if (row.violations.length)
            violations.push({ caseId: row.caseId, seed: row.seed, violations: row.violations });
          const ring = (emblemCoverage[emblem] ||= { assigned: 0, engages: 0, skillCasts: 0 });
          ring.assigned++;
          ring.engages += row.coverage.engages;
          ring.skillCasts += row.coverage.emblemSkills[emblem] || 0;
          const gear = (equipmentCoverage[affix.id] ||= { assigned: 0, procs: 0 });
          gear.assigned++;
          gear.procs += Object.values(row.coverage.equipmentProcs).reduce((sum, n) => sum + n, 0);
          for (const [id, coverage] of Object.entries(row.coverage.bosses)) {
            const boss = (bossCoverage[id] ||= {
              appearances: 0,
              actions: 0,
              actionsByStage: {},
              phases: {},
              charges: 0,
              releases: 0,
              mechanics: 0,
              example: null,
            });
            boss.appearances++;
            boss.actions += coverage.actions;
            boss.charges += coverage.charges;
            boss.releases += coverage.releases;
            boss.mechanics += coverage.mechanics;
            for (const stage of coverage.phases) boss.phases[stage] = (boss.phases[stage] || 0) + 1;
            for (const [stage, count] of Object.entries(coverage.actionsByStage)) {
              boss.actionsByStage[stage] = (boss.actionsByStage[stage] || 0) + count;
            }
            const importance = (round) =>
              round.events.some((event) => event.actor === id && event.type === 'bossPhase')
                ? 2
                : Number(
                    round.events.some((event) => event.actor === id && event.type === 'enemy'),
                  );
            for (const example of examples) {
              if (importance(example) > (boss.example ? importance(boss.example.round) : 0)) {
                boss.example = { caseId: row.caseId, seed: row.seed, round: example };
              }
            }
          }
        }
      }
    }
  }
  return {
    seed,
    maxRounds,
    policy,
    candidateLimit,
    dimensions,
    total: results.length,
    previews,
    outcomes,
    bossCoverage,
    equipmentCoverage,
    emblemCoverage,
    violations,
    results,
  };
}

function runWorker(options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./stress-worker.mjs', import.meta.url), {
      workerData: options,
      execArgv: [],
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error('Stress worker exited with code ' + code));
    });
  });
}

export async function runStressMatrix(options = {}) {
  const enemies = selectedKeys(options, 'enemies', STRESS_ENEMIES);
  const concurrency = Math.max(1, Math.min(4, options.concurrency ?? 4));
  if (concurrency === 1 || enemies.length === 1) {
    return runStressMatrixSerial({ ...options, enemies });
  }
  const shards = Array.from({ length: Math.min(concurrency, enemies.length) }, () => []);
  enemies.forEach((enemy, index) => shards[index % shards.length].push(enemy));
  const parts = await Promise.all(
    shards.map((shard) => runWorker({ ...options, enemies: shard, concurrency: 1 })),
  );
  const results = parts.flatMap((part) => part.results);
  const keyOrder = Object.fromEntries(
    Object.entries(parts[0].dimensions).map(([key, values]) => [
      { rosters: 'roster', emblems: 'emblem', affixes: 'affix', enemies: 'enemy' }[key],
      new Map(values.map((value, index) => [value, index])),
    ]),
  );
  results.sort((left, right) => {
    for (const key of ['roster', 'emblem', 'affix', 'enemy']) {
      const difference = keyOrder[key].get(left[key]) - keyOrder[key].get(right[key]);
      if (difference) return difference;
    }
    return 0;
  });
  const outcomes = {};
  const bossCoverage = {};
  const equipmentCoverage = {};
  const emblemCoverage = {};
  const violations = [];
  let previews = 0;
  for (const part of parts) {
    previews += part.previews;
    violations.push(...part.violations);
    for (const [key, value] of Object.entries(part.outcomes))
      outcomes[key] = (outcomes[key] || 0) + value;
    for (const [id, row] of Object.entries(part.bossCoverage)) {
      const total = (bossCoverage[id] ||= {
        appearances: 0,
        actions: 0,
        actionsByStage: {},
        phases: {},
        charges: 0,
        releases: 0,
        mechanics: 0,
        example: null,
      });
      for (const key of ['appearances', 'actions', 'charges', 'releases', 'mechanics'])
        total[key] += row[key];
      for (const key of ['actionsByStage', 'phases']) {
        for (const [stage, value] of Object.entries(row[key]))
          total[key][stage] = (total[key][stage] || 0) + value;
      }
      const isPhaseReplay = (example) =>
        example?.round.events.some((event) => event.type === 'bossPhase');
      if (!total.example || (!isPhaseReplay(total.example) && isPhaseReplay(row.example)))
        total.example = row.example;
    }
    for (const [id, row] of Object.entries(part.equipmentCoverage)) {
      const total = (equipmentCoverage[id] ||= { assigned: 0, procs: 0 });
      total.assigned += row.assigned;
      total.procs += row.procs;
    }
    for (const [id, row] of Object.entries(part.emblemCoverage)) {
      const total = (emblemCoverage[id] ||= { assigned: 0, engages: 0, skillCasts: 0 });
      total.assigned += row.assigned;
      total.engages += row.engages;
      total.skillCasts += row.skillCasts;
    }
  }
  return {
    seed: options.seed ?? 1,
    maxRounds: options.maxRounds ?? 4,
    policy: options.policy ?? 'balanced',
    candidateLimit: options.candidateLimit ?? 1,
    dimensions: {
      rosters: parts[0].dimensions.rosters,
      emblems: parts[0].dimensions.emblems,
      affixes: parts[0].dimensions.affixes,
      enemies,
    },
    total: results.length,
    previews,
    outcomes,
    bossCoverage,
    equipmentCoverage,
    emblemCoverage,
    violations,
    results,
  };
}
