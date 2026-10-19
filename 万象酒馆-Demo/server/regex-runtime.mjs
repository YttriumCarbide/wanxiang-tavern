import { Worker } from 'node:worker_threads';

/** Imported expressions run in a disposable worker so a bad pattern cannot stall the game server. */
export async function runRegexTasks(scripts, tasks) {
  if (!scripts.length) return tasks.map((task) => ({ text: task.text, changes: [] }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./regex-worker.mjs', import.meta.url), {
      workerData: { scripts, tasks },
      resourceLimits: { maxOldGenerationSizeMb: 64 },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(Error('正则处理超时，请停用耗时表达式后重试'));
    }, 1500);
    worker.once('message', (result) => {
      clearTimeout(timer);
      void worker.terminate();
      if (result.error) reject(Error(result.error));
      else resolve(result.results);
    });
    worker.once('error', (failure) => {
      clearTimeout(timer);
      reject(failure);
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(Error('正则处理已终止'));
    });
  });
}
