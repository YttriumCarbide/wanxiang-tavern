import { Worker } from 'node:worker_threads';
import { CAMPAIGN_MAPS } from './campaign.mjs';
import { runCampaignMatrix } from './matrix.mjs';

function runPartition(options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./matrix-worker.mjs', import.meta.url), {
      workerData: options,
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(Error(`Simulation worker exited with status ${code}`));
    });
  });
}

function partitions(options) {
  const jobs = [];
  for (const mode of options.modes) {
    for (const profile of options.profiles) {
      const job = { ...options, profiles: [profile], modes: [mode] };
      if (mode === 'career') jobs.push(job);
      else {
        for (const map of options.maps ?? CAMPAIGN_MAPS) jobs.push({ ...job, maps: [map] });
      }
    }
  }
  return jobs;
}

export async function runParallelMatrix(options, jobs, progress = () => {}) {
  if (jobs === 1) return runCampaignMatrix(options);
  const queue = partitions(options);
  const results = new Array(queue.length);
  let next = 0;
  let finished = 0;
  async function consume() {
    while (next < queue.length) {
      const index = next++;
      results[index] = await runPartition(queue[index]);
      progress(++finished, queue.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, consume));
  return {
    careers: results.flatMap((result) => result.careers),
    expeditions: results.flatMap((result) => result.expeditions),
    nodes: results.flatMap((result) => result.nodes),
  };
}
