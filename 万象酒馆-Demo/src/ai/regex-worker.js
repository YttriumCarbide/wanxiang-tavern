import { applyRegexScripts } from './regex.js';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      results: data.tasks.map((task) =>
        applyRegexScripts(task.text, data.scripts, task.placement, task.options),
      ),
    });
  } catch (failure) {
    self.postMessage({ error: failure.message });
  }
};
