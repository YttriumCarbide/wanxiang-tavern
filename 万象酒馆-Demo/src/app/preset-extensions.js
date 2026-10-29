import { presetHelperScripts } from '../ai/helper-scripts.js';
import { query as $ } from './dom.js';
import { createEventScope } from '../shared/events.js';
import { adviceBinding } from '../ai/advice.js';

/** Imported scripts own one disposable opaque-origin window, with narrow preset-only RPC. */
export function createPresetExtensions(context) {
  const api = context.apiClient.request;
  const { events, session } = context;
  let active = null,
    frame = null,
    frameEvents = null,
    generation = 0;
  function unload() {
    active?.flush?.reject(Error('预设已切换，请重新发送'));
    frameEvents?.dispose();
    frameEvents = null;
    frame?.remove();
    frame = null;
    active = null;
  }
  function initialize() {
    if (!frame || !active) return;
    frame.contentWindow.postMessage(
      {
        type: 'helper-init',
        capability: active.capability,
        preset: active.preset,
        storage: active.storage,
        scripts: presetHelperScripts(active.preset).filter((script) => script.enabled),
      },
      '*',
    );
  }
  async function activate(kind) {
    const ticket = ++generation;
    const profiles = await api('config');
    const id = profiles[kind]?.promptPresetId;
    if (session.runtime.disposed || ticket !== generation) return;
    if (!id) {
      unload();
      return;
    }
    const { preset } = await api(`prompts/${id}`);
    if (ticket !== generation || session.runtime.disposed) return;
    if (active?.id === id && JSON.stringify(active.preset) === JSON.stringify(preset)) {
      active.kind = kind;
      return;
    }
    const { storage } = await api(`helper-storage/${id}`);
    if (ticket !== generation || session.runtime.disposed) return;
    unload();
    active = {
      id,
      kind,
      preset,
      storage,
      capability: crypto.randomUUID(),
      advice: Boolean(adviceBinding(preset)),
    };
    if (!presetHelperScripts(preset).some((script) => script.enabled)) {
      active.ready = true;
      $('#helper-status').textContent = '此预设没有已启用的扩展脚本。';
      return;
    }
    frame = document.createElement('iframe');
    frame.id = 'helper-frame';
    frame.title = '预设扩展';
    frame.setAttribute('sandbox', 'allow-scripts allow-modals');
    const base = new URL('.', document.baseURI).href.replace(/\/$/, '');
    const origin = location.origin;
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: https: ${origin}; style-src 'unsafe-inline' https: ${origin}; img-src https: data: ${origin}; font-src https: data:; connect-src https:; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="${base}/styles/helper-window.css"><body><div id="script-buttons"></div><script src="${base}/vendor/jquery/jquery.min.js"></script><script src="${base}/vendor/lodash/lodash.min.js"></script><script src="${base}/src/chat/helper-runtime.js"></script>`;
    frameEvents = createEventScope();
    frameEvents.on(frame, 'load', initialize);
    $('#helper-content').replaceChildren(frame);
    $('#helper-status').textContent = '';
  }
  events.on(window, 'message', async (event) => {
    if (
      !frame ||
      event.source !== frame.contentWindow ||
      event.data?.capability !== active?.capability
    )
      return;
    const { type, requestId, preset } = event.data;
    if (type === 'helper-ready') {
      active.ready = true;
      return;
    }
    if (type === 'helper-flushed') {
      const task = active.flush;
      if (task && task.id === requestId) {
        if (event.data.error) task.reject(Error(event.data.error));
        else task.resolve();
      }
      return;
    }
    if (type === 'helper-error') {
      $('#helper-status').textContent = event.data.error;
      return;
    }
    if (type === 'helper-storage') {
      const current = active;
      let error;
      try {
        await api(`helper-storage/${active.id}`, { storage: event.data.storage });
      } catch (failure) {
        $('#helper-status').textContent = failure.message;
        error = failure.message;
      }
      if (requestId && active === current)
        frame.contentWindow.postMessage(
          {
            type: 'helper-result',
            capability: current.capability,
            requestId,
            ...(error ? { error } : {}),
          },
          '*',
        );
      return;
    }
    if (type !== 'helper-save') return;
    const current = active;
    try {
      // No imported code can select arbitrary files, API credentials or game objects.
      const next = {
        ...current.preset,
        prompts: preset.prompts,
        prompt_order: preset.prompt_order,
        ...preset.sampling,
        extensions: {
          ...current.preset.extensions,
          tavern_helper: {
            ...current.preset.extensions?.tavern_helper,
            variables: preset.variables,
          },
        },
      };
      const result = await api('prompts/save', { id: current.id, preset: next });
      if (active !== current) return;
      active.preset = result.preset;
      frame.contentWindow.postMessage(
        { type: 'helper-result', capability: active.capability, requestId },
        '*',
      );
    } catch (failure) {
      if (active === current)
        frame.contentWindow.postMessage(
          {
            type: 'helper-result',
            capability: active.capability,
            requestId,
            error: failure.message,
          },
          '*',
        );
    }
  });
  events.on($('#helper-open'), 'click', async () => {
    try {
      await activate($('#prompt-kind').value);
      if (!$('#helper-dialog').open) $('#helper-dialog').showModal();
    } catch (failure) {
      context.shell.toast(failure.message);
    }
  });
  events.on($('#helper-close'), 'click', () => $('#helper-dialog').close());
  events.on(window, 'preset-selected', (event) => {
    void activate(event.detail.kind).catch((failure) => context.shell.toast(failure.message));
  });
  return {
    activate,
    async flush() {
      if (!active?.advice || !active.ready || !frame) return;
      const current = active;
      const id = crypto.randomUUID();
      let timer;
      try {
        await new Promise((resolve, reject) => {
          current.flush = { id, resolve, reject };
          timer = setTimeout(() => reject(Error('保存Advice设置超时，请重试')), 15000);
          frame.contentWindow.postMessage(
            { type: 'helper-flush', capability: current.capability, requestId: id },
            '*',
          );
        });
      } finally {
        clearTimeout(timer);
        if (current.flush?.id === id) delete current.flush;
      }
    },
    dispose() {
      generation++;
      unload();
    },
  };
}
