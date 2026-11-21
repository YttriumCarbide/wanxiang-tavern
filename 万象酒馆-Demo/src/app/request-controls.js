import { API_LABELS } from './first-run-rules.js';
import { skippingAi } from '../generation-options.js';
import { galRequestInput } from '../gal.js';
import { journeyContinuity, withInvitationMemories } from '../memory.js';
import { syncSummaryWorldbook } from '../ai/journey-memory-worldbook.js';
import { prepareFreeDcContext } from '../dc-rp.js';
/** Every paid/model request has a real AbortSignal and a visible control in its current panel. */
export function createRequestControls(
  client,
  generationOptions = () => null,
  getWorkshop = () => null,
  prepare = async () => {},
  received = () => {},
  library = () => null,
  simulate = () => null,
) {
  const active = new Set();
  const dock = document.createElement('div');
  dock.className = 'api-request-dock';
  const backgroundDock = document.createElement('div');
  backgroundDock.className = 'api-request-dock api-background-only';
  let stage = null;
  let backgroundHost = null;
  let stateChange = null;
  function notify() {
    stateChange?.();
  }
  function placeBackgroundDock() {
    if (!backgroundDock.childElementCount) return;
    const galVisible = stage && !stage.hidden;
    const target = galVisible ? stage : backgroundHost || document.body;
    if (backgroundDock.parentElement !== target) target.append(backgroundDock);
  }
  const stageObserver = new MutationObserver(placeBackgroundDock);
  function generationInput(kind, data, preview = false) {
    if (kind === 'summary') return data;
    const save = library();
    const archiveContext = data?.archiveContext;
    const fixedCheck =
      data?.dcContext?.choiceCheck ||
      (data?.adventure?.mode === 'event' ? data.adventure.choiceCheck : null);
    let dcContext = data?.dcContext;
    if (!preview && ['chat', 'quick-chat'].includes(kind) && !dcContext) {
      if (fixedCheck) {
        dcContext = { mode: 'fixed', choiceCheck: fixedCheck };
      } else if (data?.adventure?.mode === 'quest' || data?.dialogueContext || data?.invitation) {
        const selectedIds = new Set(Array.isArray(data.selected) ? data.selected : []);
        const actors = (save?.characters || []).filter((c) => selectedIds.has(c.id));
        const pool = actors.length ? actors : data.characters || [];
        const mapOrLevel = data?.mapOrLevel ?? data?.dialogueContext?.level ?? null;
        dcContext = {
          mode: 'free',
          forced: data?.adventure?.mode === 'quest',
          ...prepareFreeDcContext(save, pool, Math.random, mapOrLevel),
        };
      }
    }
    return galRequestInput(kind, {
      ...(['chat', 'quick-chat'].includes(kind) ? withInvitationMemories(kind, data, save) : data),
      ...(dcContext ? { dcContext } : {}),
      summaryWorldbook: data?.summaryWorldbook || syncSummaryWorldbook(save),
      ...(['script', 'chat', 'quick-chat'].includes(kind)
        ? { journeyContinuity: journeyContinuity(save) }
        : {}),
      ...(['chat', 'quick-chat'].includes(kind) && save
        ? {
            questOffer:
              !preview &&
              Math.random() < 0.45 &&
              (save.tavernQuests || []).filter(({ status }) => status !== 'completed').length < 10,
          }
        : {}),
      ...(archiveContext ? { archiveContext: { ...archiveContext, npcs: [], stories: [] } } : {}),
    });
  }
  function hostFor(kind, models) {
    const visible = (id) => {
      const panel = document.getElementById(id);
      return panel && (panel.tagName === 'DIALOG' ? panel.open : !panel.hidden) ? panel : null;
    };
    if (models) return visible('ai-dialog') || document.body;
    const candidates = {
      map: ['world-construction'],
      creation: ['ether-forge'],
      summary: ['archive-dialog', 'memory-dialog'],
      chat: ['gal-stage'],
      'quick-chat': ['gal-stage', 'rp-scene'],
      character: ['ai-dialog', 'new-game'],
      script: ['daily-setup', 'story-feed', 'party-panel', 'ai-dialog'],
    };
    return (candidates[kind] || []).map(visible).find(Boolean) || document.body;
  }
  return {
    ...client,
    async request(path, data, options = {}) {
      const match =
        /^(generate|models)\/(character|script|chat|quick-chat|summary|creation|map)$/.exec(path);
      if (!match) {
        const preview =
          path === 'prompts/preview' && data?.kind
            ? { ...data, input: generationInput(data.kind, data.input, true) }
            : data;
        return client.request(path, preview, options);
      }
      const simulated = match[1] === 'generate' && !options.background ? simulate(match[2]) : null;
      if (!simulated && match[1] === 'generate' && skippingAi(generationOptions()))
        throw Error('开发者模式已跳过AI生成，请关闭“跳过AI生成”后再使用。');
      const controller = new AbortController();
      const cancel = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
      const control = document.createElement('div');
      control.className = 'api-request-control';
      if (options.background) control.classList.add('api-background-control');
      const label = document.createElement('span');
      label.textContent = (match[1] === 'models' ? '获取模型列表' : API_LABELS[match[2]]) + '…';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '终止';
      button.dataset.requestStop = match[2];
      const workshop = getWorkshop();
      const work = document.createElement('button');
      work.type = 'button';
      work.textContent = '星隙工坊';
      work.dataset.workshopWait = match[2];
      const openWorkshop = () => workshop.open();
      const requestLabel = label.textContent.slice(0, -1);
      const requestId = Symbol();
      if (workshop) {
        workshop.begin(requestId, requestLabel);
        work.addEventListener('click', openWorkshop);
      }
      control.append(label);
      if (workshop) control.append(work);
      control.append(button);
      const host = options.background ? document.body : hostFor(match[2], match[1] === 'models');
      const galRequest = host.id === 'gal-stage' && !options.background;
      if (galRequest) {
        control.classList.add('gal-request-control');
        label.hidden = true;
        button.title = button.textContent;
        button.setAttribute('aria-label', button.textContent);
        button.textContent = '■';
        work.title = work.textContent;
        work.setAttribute('aria-label', work.textContent);
        work.textContent = '⚒';
      }
      if (options.background) {
        if (!stage) {
          stage = document.getElementById('gal-stage');
          if (stage)
            stageObserver.observe(stage, { attributes: true, attributeFilter: ['hidden'] });
        }
        backgroundDock.append(control);
        placeBackgroundDock();
      } else if (host === document.body) {
        if (!dock.isConnected) document.body.append(dock);
        dock.append(control);
      } else if (galRequest) host.querySelector('.gal-actionbar').append(control);
      else host.append(control);
      const record = { controller, control, background: Boolean(options.background) };
      active.add(record);
      notify();
      let outcome = 'error';
      const stop = () => {
        controller.abort();
        button.disabled = true;
        label.textContent = '正在终止…';
      };
      button.addEventListener('click', stop);
      try {
        controller.signal.throwIfAborted();
        if (simulated) await simulated(controller.signal);
        if (match[1] === 'generate') await prepare(match[2]);
        controller.signal.throwIfAborted();
        const input = match[1] === 'generate' ? generationInput(match[2], data) : data;
        const result = await client.request(path, input, { ...options, signal: controller.signal });
        received(match[2], result);
        controller.signal.throwIfAborted();
        outcome = 'success';
        if (
          match[1] === 'generate' &&
          ['chat', 'quick-chat'].includes(match[2]) &&
          input?.dcContext &&
          result &&
          typeof result === 'object'
        ) {
          return { ...result, dcPreRoll: input.dcContext };
        }
        return result;
      } catch (failure) {
        if (!controller.signal.aborted) received(match[2], null, failure);
        throw failure;
      } finally {
        if (controller.signal.aborted) outcome = 'cancel';
        workshop?.finish(requestId, outcome);
        options.signal?.removeEventListener('abort', cancel);
        button.removeEventListener('click', stop);
        work.removeEventListener('click', openWorkshop);
        control.remove();
        if (!dock.childElementCount) dock.remove();
        if (!backgroundDock.childElementCount) backgroundDock.remove();
        active.delete(record);
        notify();
      }
    },
    setBackgroundHost(host, onStateChange = null) {
      backgroundHost = host || null;
      stateChange = onStateChange;
      placeBackgroundDock();
    },
    activeCount: () => active.size,
    foregroundCount() {
      let count = 0;
      for (const record of active) if (!record.background) count++;
      return count;
    },
    backgroundCount: () => backgroundDock.childElementCount,
    dispose() {
      for (const { controller, control } of active) {
        controller.abort();
        control.remove();
      }
      active.clear();
      dock.remove();
      backgroundDock.remove();
      stageObserver.disconnect();
      client.dispose();
    },
  };
}
