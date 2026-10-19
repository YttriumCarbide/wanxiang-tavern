/** Bounded scheduling with dependencies; every job settles before the batch returns. */
export async function runBatch(jobs, concurrency = 2, execute = (job) => job.operation()) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw Error('Invalid batch concurrency');
  const pending = new Map(jobs.map((job) => [job.name, job]));
  if (pending.size !== jobs.length) throw Error('Duplicate batch job');
  for (const job of jobs) {
    if ((job.after || []).some((name) => !pending.has(name)))
      throw Error(`Unknown dependency: ${job.name}`);
  }
  const active = new Map();
  const completed = new Map();
  while (pending.size || active.size) {
    for (const [name, job] of pending) {
      if (active.size >= concurrency) break;
      if (!(job.after || []).every((dependency) => completed.has(dependency))) continue;
      pending.delete(name);
      const operation = Promise.resolve()
        .then(() => execute(job))
        .then(
          (value) => completed.set(name, { name, status: 'fulfilled', value }),
          (reason) => completed.set(name, { name, status: 'rejected', reason }),
        )
        .finally(() => active.delete(name));
      active.set(name, operation);
    }
    if (!active.size && pending.size) throw Error('Cyclic batch dependencies');
    if (active.size) await Promise.race(active.values());
  }
  return jobs.map((job) => completed.get(job.name));
}
