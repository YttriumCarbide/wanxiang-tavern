import { API_LABELS } from './first-run-rules.js';
/** Every paid/model request has a real AbortSignal and a visible control in its current panel. */
export function createRequestControls(client) {
  const active = new Set();
  function hostFor(kind, models) {
    const visible = (id) => {
      const panel = document.getElementById(id);
      return panel?.open ? panel : null;
    };
    if (models) return visible('ai-dialog') || document.body;
    const candidates = {
      map: ['world-construction'],
      creation: ['ether-forge'],
      summary: ['memory-dialog'],
      chat: ['chat-dialog'],
      'quick-chat': ['story-feed'],
      character: ['ai-dialog', 'new-game'],
      script: ['story-feed', 'party-panel', 'ai-dialog'],
    };
    return (candidates[kind] || []).map(visible).find(Boolean) || document.body;
  }
  return {
    ...client,
    async request(path, data, options = {}) {
      const match =
        /^(generate|models)\/(character|script|chat|quick-chat|summary|creation|map)$/.exec(path);
      if (!match) return client.request(path, data, options);
      const controller = new AbortController();
      const cancel = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
      const control = document.createElement('div');
      control.className = 'api-request-control';
      const label = document.createElement('span');
      label.textContent = (match[1] === 'models' ? '获取模型列表' : API_LABELS[match[2]]) + '…';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '终止';
      button.dataset.requestStop = match[2];
      control.append(label, button);
      const host = hostFor(match[2], match[1] === 'models');
      if (host === document.body) control.classList.add('floating');
      host.append(control);
      const record = { controller, control };
      active.add(record);
      const stop = () => {
        controller.abort();
        button.disabled = true;
        label.textContent = '正在终止…';
      };
      button.addEventListener('click', stop);
      try {
        controller.signal.throwIfAborted();
        const result = await client.request(path, data, { ...options, signal: controller.signal });
        controller.signal.throwIfAborted();
        return result;
      } finally {
        options.signal?.removeEventListener('abort', cancel);
        button.removeEventListener('click', stop);
        control.remove();
        active.delete(record);
      }
    },
    dispose() {
      for (const { controller, control } of active) {
        controller.abort();
        control.remove();
      }
      active.clear();
      client.dispose();
    },
  };
}
