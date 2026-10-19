import { parentPort, workerData } from 'node:worker_threads';
import { applyRegexScripts } from '../src/ai/regex.js';
try {
  parentPort.postMessage({
    results: workerData.tasks.map((task) =>
      applyRegexScripts(task.text, workerData.scripts, task.placement, task.options),
    ),
  });
} catch (failure) {
  parentPort.postMessage({ error: failure.message });
}
