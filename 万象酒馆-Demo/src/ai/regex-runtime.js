/** One disposable module worker keeps imported regular expressions off the UI thread. */
export async function runRegexTasks(scripts, tasks) {
  if (!scripts.length) return tasks.map((task) => ({ text: task.text, changes: [] }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./regex-worker.js', import.meta.url), { type: 'module' });
    const finish = (failure, result) => {
      clearTimeout(timer);
      worker.terminate();
      if (failure) reject(failure);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(Error('正则处理超时，请停用耗时表达式后重试')), 1500);
    worker.onmessage = ({ data }) => finish(data.error ? Error(data.error) : null, data.results);
    worker.onerror = () => finish(Error('正则处理失败，请检查表达式'));
    worker.postMessage({ scripts, tasks });
  });
}
