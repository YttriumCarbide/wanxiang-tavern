/** Compatibility surface inside an opaque iframe; no reference to the game DOM or state. */
(function startHelperRuntime() {
  let preset = null,
    capability = null,
    sequence = 0,
    scriptId = '',
    scriptName = '';
  const pending = new Map(),
    listeners = new Map(),
    variables = {},
    buttons = document.getElementById('script-buttons');
  const settingsKeys = {
    max_context: 'openai_max_context',
    max_completion_tokens: 'openai_max_tokens',
    should_stream: 'stream_openai',
  };
  let storageTimer = null;
  const persistentStorage = {};
  let variableScopes = { global: {}, script: {} };
  function scopedVariables(options) {
    if (options?.type === 'global') return variableScopes.global;
    if (options?.type === 'script') return (variableScopes.script[scriptId] ||= {});
    return variables;
  }
  function saveVariableScope(options) {
    if (!['global', 'script'].includes(options?.type)) return save();
    persistentStorage['wanxiang:variable-scopes'] = JSON.stringify(variableScopes);
    return savePrivateStorage();
  }
  function savePrivateStorage() {
    clearTimeout(storageTimer);
    const requestId = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(Error('保存脚本变量超时'));
      }, 15000);
      pending.set(requestId, { resolve, reject, timer });
      parent.postMessage(
        { type: 'helper-storage', capability, requestId, storage: persistentStorage },
        '*',
      );
    });
  }
  function isolatedStorage(persist) {
    const transient = {};
    const data = () => (persist ? persistentStorage : transient);
    const changed = () => {
      if (!persist || !preset) return;
      clearTimeout(storageTimer);
      storageTimer = setTimeout(() => {
        parent.postMessage({ type: 'helper-storage', capability, storage: persistentStorage }, '*');
      }, 400);
    };
    return {
      get length() {
        return Object.keys(data()).length;
      },
      key(index) {
        return Object.keys(data())[index] ?? null;
      },
      getItem(key) {
        return Object.hasOwn(data(), key) ? String(data()[key]) : null;
      },
      setItem(key, value) {
        data()[String(key)] = String(value);
        changed();
      },
      removeItem(key) {
        delete data()[key];
        changed();
      },
      clear() {
        for (const key of Object.keys(data())) delete data()[key];
        changed();
      },
    };
  }
  Object.defineProperty(window, 'localStorage', {
    value: isolatedStorage(true),
    configurable: true,
  });
  Object.defineProperty(window, 'sessionStorage', {
    value: isolatedStorage(false),
    configurable: true,
  });
  function emit(name, ...args) {
    for (const listener of listeners.get(name) || []) listener(...args);
  }
  function on(name, listener) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(listener);
    return () => listeners.get(name)?.delete(listener);
  }
  function toHelper() {
    const settings = { ...preset };
    for (const [key, value] of Object.entries(settingsKeys)) settings[key] = preset[value];
    settings.max_context = preset.contextSize ?? settings.max_context;
    settings.max_completion_tokens = preset.maxTokens ?? settings.max_completion_tokens;
    settings.should_stream = preset.stream ?? settings.should_stream;
    return {
      settings,
      prompts: preset.prompt_order[0].order
        .map((entry) => preset.prompts.find((prompt) => prompt.identifier === entry.identifier))
        .filter(Boolean)
        .map((prompt) => ({
          ...prompt,
          id: prompt.identifier,
          enabled:
            preset.prompt_order[0].order.find((entry) => entry.identifier === prompt.identifier)
              ?.enabled ?? false,
          position: {
            type: prompt.injection_position === 1 ? 'in_chat' : 'relative',
            depth: prompt.injection_depth,
            order: prompt.injection_order,
          },
        })),
      prompts_unused: [],
      extensions: structuredClone(preset.extensions || {}),
    };
  }
  function save() {
    const requestId = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(Error('保存预设超时'));
      }, 15000);
      pending.set(requestId, { resolve, reject, timer });
      const sampling = {};
      for (const key of [
        'temperature',
        'top_k',
        'top_p',
        'frequency_penalty',
        'presence_penalty',
        'openai_max_context',
        'openai_max_tokens',
        'stream_openai',
        'reasoning_effort',
        'contextSize',
        'maxTokens',
        'stream',
      ])
        if (preset[key] !== undefined) sampling[key] = preset[key];
      parent.postMessage(
        {
          type: 'helper-save',
          capability,
          requestId,
          preset: {
            prompts: preset.prompts,
            prompt_order: preset.prompt_order,
            sampling,
            variables,
          },
        },
        '*',
      );
    });
  }
  async function setPreset(first, second) {
    const name = typeof first === 'string' ? first : typeof second === 'string' ? second : 'in_use';
    const value = typeof first === 'string' ? second : first;
    if (![preset.name, 'in_use', undefined].includes(name)) throw Error('只能修改当前选用的预设');
    const settings = value.settings || {};
    for (const key of [
      'temperature',
      'top_k',
      'top_p',
      'frequency_penalty',
      'presence_penalty',
      'reasoning_effort',
    ])
      if (settings[key] !== undefined) preset[key] = settings[key];
    for (const [key, target] of Object.entries(settingsKeys))
      if (settings[key] !== undefined) preset[target] = settings[key];
    for (const [source, target] of [
      ['max_context', 'contextSize'],
      ['max_completion_tokens', 'maxTokens'],
      ['should_stream', 'stream'],
    ])
      if (settings[source] !== undefined) preset[target] = settings[source];
    const prompts = value.prompts || [];
    for (const prompt of prompts) {
      const id = prompt.id || prompt.identifier;
      const old = preset.prompts.find((entry) => entry.identifier === id);
      if (old) {
        Object.assign(old, { ...prompt, identifier: id });
        if (prompt.position)
          Object.assign(old, {
            injection_position: prompt.position.type === 'in_chat' ? 1 : 0,
            injection_depth: prompt.position.depth || 0,
            injection_order: prompt.position.order ?? 100,
          });
        const order = preset.prompt_order[0].order.find((entry) => entry.identifier === id);
        if (order) order.enabled = prompt.enabled !== false;
      } else {
        preset.prompts.push({
          ...prompt,
          identifier: id,
          marker: [
            'worldInfoBefore',
            'worldInfoAfter',
            'charDescription',
            'charPersonality',
            'scenario',
            'personaDescription',
            'dialogueExamples',
            'chatHistory',
          ].includes(id),
          injection_position: prompt.position?.type === 'in_chat' ? 1 : 0,
          injection_depth: prompt.position?.depth || 0,
          injection_order: prompt.position?.order ?? 100,
        });
        preset.prompt_order[0].order.push({ identifier: id, enabled: prompt.enabled !== false });
      }
    }
    await save();
    emit('preset_changed', preset.name);
    return structuredClone(toHelper());
  }
  function toast(message) {
    const element = document.createElement('p');
    element.className = 'helper-toast';
    element.textContent = String(message);
    document.body.append(element);
    setTimeout(() => element.remove(), 4500);
  }
  function replaceButtons(items) {
    buttons.replaceChildren(
      ...items
        .filter((item) => item.visible !== false)
        .map((item) => {
          const button = document.createElement('button');
          button.textContent = item.name;
          button.onclick = () => emit(`button:${item.name}`);
          return button;
        }),
    );
  }
  const api = {
    getPreset: (name = 'in_use') => {
      if (!['in_use', preset.name].includes(name)) throw Error('只能读取当前选用的预设');
      return structuredClone(toHelper());
    },
    setPreset,
    replacePreset: setPreset,
    updatePresetWith: async (first, second) => {
      const updater = typeof first === 'function' ? first : second;
      const name = typeof first === 'function' ? 'in_use' : first;
      return setPreset(name, await updater(structuredClone(toHelper())));
    },
    getPresetNames: () => [preset.name],
    getLoadedPresetName: () => preset.name,
    getCurrentPresetName: () => preset.name,
    getScriptId: () => scriptId,
    getScriptName: () => scriptName,
    isPresetNormalPrompt: (prompt) =>
      !preset.prompts.find((entry) => entry.identifier === prompt.id)?.marker,
    isPresetPlaceholderPrompt: (prompt) =>
      !!preset.prompts.find((entry) => entry.identifier === prompt.id)?.marker,
    isPresetSystemPrompt: (prompt) =>
      ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'].includes(prompt.id),
    getVariables: (options) => structuredClone(scopedVariables(options)),
    replaceVariables: async (value, options) => {
      const target = scopedVariables(options);
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, value);
      await saveVariableScope(options);
    },
    updateVariablesWith: async (updater, options) => {
      const target = scopedVariables(options);
      const value = await updater(structuredClone(target));
      Object.assign(target, value);
      await saveVariableScope(options);
      return structuredClone(target);
    },
    insertOrAssignVariables: async (value, options) => {
      Object.assign(scopedVariables(options), value);
      await saveVariableScope(options);
    },
    eventOn: on,
    eventEmit: emit,
    eventOnce: (name, listener) => {
      const off = on(name, (...args) => {
        off();
        listener(...args);
      });
      return off;
    },
    eventRemoveListener: (name, listener) => listeners.get(name)?.delete(listener),
    eventClearAll: () => listeners.clear(),
    getButtonEvent: (name) => `button:${name}`,
    replaceScriptButtons: replaceButtons,
    appendInexistentScriptButtons: (items) => {
      for (const item of items) {
        if ([...buttons.children].some((button) => button.textContent === item.name)) continue;
        const button = document.createElement('button');
        button.textContent = item.name;
        button.onclick = () => emit(`button:${item.name}`);
        buttons.append(button);
      }
    },
    getScriptButtons: () =>
      [...buttons.children].map((button) => ({ name: button.textContent, visible: true })),
    substituteParams: (text) =>
      String(text).replaceAll('{{user}}', '玩家').replaceAll('{{char}}', '酒馆来客'),
    triggerSlash: async (command) => {
      const match = command.match(/^\/(?:toggle|prompt)\s+(\S+)\s+(on|off|true|false)$/);
      if (match) {
        const order = preset.prompt_order[0].order.find((entry) => entry.identifier === match[1]);
        if (order) order.enabled = ['on', 'true'].includes(match[2]);
        await save();
        return '';
      }
      if (command.startsWith('/echo ')) {
        toast(command.slice(6));
        return '';
      }
      throw Error(`尚未适配的酒馆命令：${command.split(' ')[0]}`);
    },
  };
  Object.assign(window, api, {
    TavernHelper: api,
    toastr: { info: toast, success: toast, warning: toast, error: toast },
    tavern_events: {
      APP_READY: 'app_ready',
      CHAT_CHANGED: 'chat_changed',
      SETTINGS_UPDATED: 'settings_updated',
      OAI_PRESET_CHANGED_AFTER: 'preset_changed',
    },
  });
  window.SillyTavern = {
    getContext: () => ({
      name1: '玩家',
      name2: '酒馆来客',
      chat: [],
      extensionSettings: variables,
      eventSource: { on, emit, removeListener: api.eventRemoveListener },
      event_types: window.tavern_events,
      saveSettingsDebounced: save,
      getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    }),
  };
  window.errorCatched =
    (fn) =>
    (...args) =>
      Promise.resolve()
        .then(() => fn(...args))
        .catch((failure) => {
          toast(failure.message);
          throw failure;
        });
  window.addEventListener('error', (event) => {
    parent.postMessage({ type: 'helper-error', capability, error: event.message }, '*');
  });
  window.addEventListener('unhandledrejection', (event) => {
    parent.postMessage(
      { type: 'helper-error', capability, error: String(event.reason?.message || event.reason) },
      '*',
    );
  });
  window.addEventListener('message', async (event) => {
    if (event.source !== parent) return;
    if (event.data?.type === 'helper-result' && event.data.capability === capability) {
      const result = pending.get(event.data.requestId);
      if (!result) return;
      clearTimeout(result.timer);
      pending.delete(event.data.requestId);
      if (event.data.error) result.reject(Error(event.data.error));
      else result.resolve();
    }
    if (event.data?.type === 'helper-flush' && event.data.capability === capability) {
      let error;
      try {
        await savePrivateStorage();
      } catch (failure) {
        error = failure.message;
      }
      parent.postMessage(
        {
          type: 'helper-flushed',
          capability,
          requestId: event.data.requestId,
          ...(error ? { error } : {}),
        },
        '*',
      );
      return;
    }
    if (event.data?.type !== 'helper-init' || preset) return;
    preset = event.data.preset;
    capability = event.data.capability;
    Object.assign(persistentStorage, event.data.storage || {});
    try {
      const stored = JSON.parse(persistentStorage['wanxiang:variable-scopes'] || '{}');
      variableScopes = { global: stored.global || {}, script: stored.script || {} };
    } catch {
      variableScopes = { global: {}, script: {} };
    }
    Object.assign(
      variables,
      preset.extensions?.tavern_helper?.variables ||
        preset.extensions?.tavern_helper?.variales ||
        {},
    );
    parent.postMessage({ type: 'helper-ready', capability }, '*');
    const kemini = event.data.scripts.find(
      (script) => script.id === '2c7d747c-22d4-4e8b-95f8-5620b552fe6e',
    );
    if (kemini) {
      const button = document.createElement('button');
      button.dataset.keminiTransport = '';
      const settings = () => ((variableScopes.script[kemini.id] ||= {}).keminiCompanion ||= {});
      const render = () => {
        button.textContent = `Kemini 特殊传输：${settings().antiTruncationEnabled === false ? '已关闭' : '已开启'}`;
      };
      render();
      button.onclick = async () => {
        const previous = settings().antiTruncationEnabled;
        settings().antiTruncationEnabled = previous === false;
        button.disabled = true;
        try {
          await saveVariableScope({ type: 'script' });
        } catch (failure) {
          settings().antiTruncationEnabled = previous;
          toast(failure.message);
        }
        render();
        button.disabled = false;
      };
      buttons.prepend(button);
    }
    for (const script of event.data.scripts) {
      scriptId = script.id;
      scriptName = script.name;
      api.appendInexistentScriptButtons(script.buttons || []);
      const element = document.createElement('script');
      element.type = 'module';
      const blob = URL.createObjectURL(new Blob([script.content], { type: 'text/javascript' }));
      element.src = blob;
      await new Promise((resolve) => {
        element.onload = element.onerror = resolve;
        document.head.append(element);
      });
      URL.revokeObjectURL(blob);
    }
    emit('app_ready');
  });
})();
