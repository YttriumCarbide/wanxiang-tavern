import { simulateCampaign } from './campaign.mjs';
import { summarizeNode } from './statistics.mjs';

function resources(snapshot) {
  if (!snapshot) return undefined;
  return {
    ...snapshot,
    alive: snapshot.alive ?? snapshot.partySize - snapshot.down,
  };
}

function createGroup(identity) {
  return { ...identity, samples: [], examples: {} };
}

function rememberExample(group, kind, replay) {
  if (!Object.hasOwn(group.examples, kind)) group.examples[kind] = replay;
}

function summarizeGroups(groups) {
  return [...groups.values()].map(({ samples, ...group }) => ({
    ...group,
    ...summarizeNode(samples),
  }));
}

function getGroup(groups, identity) {
  const key = Object.values(identity).join(':');
  if (!groups.has(key)) groups.set(key, createGroup(identity));
  return groups.get(key);
}

export function runCampaignMatrix({
  profiles,
  modes,
  firstSeed,
  seeds,
  maps,
  sites,
  maxRounds,
  heroLevel,
  sequences,
}) {
  const expeditions = new Map();
  const nodes = new Map();
  const careers = new Map();
  for (const mode of modes) {
    for (const profile of profiles) {
      for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
        const run = simulateCampaign({
          profile,
          seed,
          mode,
          maps,
          sites,
          maxRounds,
          heroLevel,
          sequences,
        });
        if (mode === 'career') {
          const career = getGroup(careers, { mode, profile });
          const outcome = run.blocked?.outcome ?? (run.blocked ? 'blocked' : 'complete');
          career.samples.push({ outcome });
          if (run.blocked) rememberExample(career, outcome, { seed, blocked: run.blocked });
        }
        for (const trip of run.expeditions) {
          const identity = {
            mode,
            profile,
            map: trip.map,
            sequence: trip.sequence,
            tutorial: Boolean(trip.tutorial),
          };
          const expedition = getGroup(expeditions, identity);
          const fixture = { seed, party: trip.party, equipment: trip.equipment, entry: trip.entry };
          if (!expedition.fixture) expedition.fixture = fixture;
          const first = trip.nodes[0];
          const last = trip.nodes.at(-1);
          expedition.samples.push({
            outcome: trip.outcome,
            before: resources(first?.start),
            after: resources(last?.end),
            rounds: trip.nodes.reduce((sum, node) => sum + (node.rounds ?? 0), 0),
          });
          if (trip.outcome !== 'victory' && trip.outcome !== 'complete') {
            rememberExample(expedition, trip.outcome, { ...fixture, stoppedAt: last?.index });
          }
          for (const node of trip.nodes) {
            const group = getGroup(nodes, { ...identity, index: node.index, type: node.type });
            const boss = node.battle?.coverage?.bosses?.[node.boss];
            const sample = {
              outcome: node.outcome,
              rounds: node.rounds,
              before: resources(node.start),
              after: resources(node.end),
              enteredBoss: node.type === 'boss',
              bossActed: boss ? boss.actions > 0 : undefined,
              bossMechanicSeen: boss
                ? boss.phases.length > 0 || boss.charges > 0 || boss.releases > 0
                : undefined,
            };
            group.samples.push(sample);
            const replay = {
              seed,
              entry: trip.entry,
              enemies: node.enemies,
              boss: node.boss,
              before: sample.before,
              after: sample.after,
              rounds: sample.rounds,
              coverage: node.battle?.coverage,
              violations: node.battle?.violations,
              trace: node.battle?.trace?.slice(0, 4),
              choice: node.choice,
              recovery: node.recovery,
            };
            if (!group.examples.first)
              rememberExample(group, 'first', { seed, outcome: node.outcome });
            if (node.outcome !== 'victory' && node.outcome !== 'complete') {
              rememberExample(group, node.outcome, replay);
            }
            if (sample.enteredBoss && node.outcome === 'victory') {
              if (sample.rounds === 1) rememberExample(group, 'oneRound', replay);
              if (sample.bossActed === false) rememberExample(group, 'noBossAction', replay);
              if (sample.bossMechanicSeen === false)
                rememberExample(group, 'noBossMechanic', replay);
            }
          }
        }
      }
    }
  }
  return {
    careers: summarizeGroups(careers),
    expeditions: summarizeGroups(expeditions),
    nodes: summarizeGroups(nodes),
  };
}
