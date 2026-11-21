import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { simulateCampaign } from './battle-sim/campaign.mjs';
import { nodeRowsCsv } from './battle-sim/csv.mjs';
import { runParallelMatrix } from './battle-sim/parallel.mjs';
import { runStressMatrix } from './battle-sim/stress.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const profiles = ['novice', 'standard', 'high'];
const modes = ['career', 'cohort'];

function numberOption(name, raw, min, max) {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw Error(`--${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function listOption(name, value, allowed) {
  if (value === undefined) return allowed;
  const items = [...new Set(value.split(','))];
  if (items.some((item) => !item || (allowed && !allowed.includes(item)))) {
    throw Error(`Invalid --${name}: ${value}`);
  }
  return items;
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean' },
      stress: { type: 'boolean' },
      campaign: { type: 'boolean' },
      replay: { type: 'boolean' },
      seed: { type: 'string', default: '1' },
      seeds: { type: 'string', default: '128' },
      sites: { type: 'string', default: '6' },
      rounds: { type: 'string', default: '32' },
      'stress-rounds': { type: 'string', default: '4' },
      jobs: { type: 'string', default: '4' },
      profiles: { type: 'string' },
      modes: { type: 'string' },
      maps: { type: 'string' },
      'hero-level': { type: 'string' },
      sequences: { type: 'string' },
      out: { type: 'string', default: '.runtime/tests/battle-sim/matrix.json' },
    },
  });
  if (values.help) {
    console.log(
      'node tools/battle-sim.mjs [--stress] [--campaign] [--seed 1] [--seeds 128] ' +
        '[--sites 6] [--rounds 32] [--stress-rounds 4] [--profiles novice,standard,high] ' +
        '[--modes career,cohort] [--maps mill,ruins] [--jobs 4] [--out FILE]\n' +
        'Cohort options: --modes cohort [--hero-level 25] [--sequences 5]\n' +
        'Replay one campaign sample: --replay --seed N --profiles NAME --modes MODE [--maps MAP]',
    );
    return;
  }
  const options = {
    firstSeed: numberOption('seed', values.seed, 0, 0xffffffff),
    seeds: numberOption('seeds', values.seeds, 1, 10_000),
    sites: numberOption('sites', values.sites, 1, 100),
    maxRounds: numberOption('rounds', values.rounds, 1, 200),
    stressRounds: numberOption('stress-rounds', values['stress-rounds'], 1, 200),
    profiles: listOption('profiles', values.profiles, profiles),
    modes: listOption('modes', values.modes, modes),
    maps: listOption('maps', values.maps),
  };
  if (values['hero-level'] !== undefined) {
    options.heroLevel = numberOption('hero-level', values['hero-level'], 1, 99);
  }
  if (values.sequences !== undefined) {
    options.sequences = listOption('sequences', values.sequences).map((sequence) =>
      numberOption('sequences', sequence, 0, Number.MAX_SAFE_INTEGER),
    );
  }
  if (options.firstSeed + options.seeds > 0x100000000) throw Error('Seed range overflows uint32');
  const jobs = numberOption('jobs', values.jobs, 1, 16);
  const result = { schemaVersion: 1, options };
  if (values.replay) {
    if (options.profiles.length !== 1 || options.modes.length !== 1) {
      throw Error('--replay needs one --profiles value and one --modes value');
    }
    result.replay = simulateCampaign({
      ...options,
      seed: options.firstSeed,
      profile: options.profiles[0],
      mode: options.modes[0],
    });
  } else {
    if (values.stress || !values.campaign) {
      console.log('Running battle combinations...');
      result.stress = await runStressMatrix({
        seed: options.firstSeed,
        maxRounds: options.stressRounds,
      });
    }
    if (values.campaign || !values.stress) {
      console.log('Running campaign samples...');
      result.campaign = await runParallelMatrix(options, jobs, (done, total) => {
        if (done % 6 === 0 || done === total) console.log(`Campaign partitions: ${done}/${total}`);
      });
      console.log(
        `Campaign: ${result.campaign.expeditions.length} expedition groups, ` +
          `${result.campaign.nodes.length} node groups`,
      );
    }
  }
  const output = path.resolve(project, values.out);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  if (result.campaign) {
    const csv = path.join(
      path.dirname(output),
      path.basename(output, path.extname(output)) + '.nodes.csv',
    );
    await writeFile(csv, '\uFEFF' + nodeRowsCsv(result.campaign.nodes), 'utf8');
    console.log(`Node table: ${csv}`);
  }
  console.log(`Report: ${output}`);
}

await main();
