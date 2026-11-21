import {
  DEVELOPER_CHANNEL,
  changeDeveloperBattle,
  developerEncounter,
  developerMaps,
  localDeveloperHost,
  sanitizeDeveloperData,
  tuneDeveloperLibrary,
} from '../developer-rules.js';
import { developerCopySeed } from '../storage/developer-copy.js';
import { definition } from '../catalog.js';

const BATTLE_ACTIONS = Object.freeze(['phase', 'one-hp', 'refill', 'cleanse', 'lock-hp']);

export function createDeveloperTools(context) {
  const { session, events } = context;
  const id = crypto.randomUUID();
  const local = localDeveloperHost(location.hostname);
  const sandbox = session.runtime.developerSandbox;
  const channel =
    local && typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(DEVELOPER_CHANNEL)
      : null;
  const entry = document.querySelector('#developer-tools-open');
  const quick = document.createElement('button');
  quick.type = 'button';
  quick.className = 'developer-quick';
  const errors = [];
  const failureBadge = document.createElement('button');
  failureBadge.type = 'button';
  failureBadge.className = 'developer-error-badge';
  const quickPanel = document.createElement('dialog');
  quickPanel.className = 'developer-battle-panel';
  quickPanel.setAttribute('aria-label', '战斗调试');
  quickPanel.innerHTML = `<header class="developer-battle-header">
      <p data-dev-info></p>
      <div class="developer-battle-tools">
        <button type="button" data-dev-editor>打开修改器</button>
        <form method="dialog"><button type="submit">关闭</button></form>
      </div>
    </header>
    <fieldset><label>目标 <select aria-label="调试目标"></select></label>
      <div class="developer-actions">
        <button type="button" data-dev-battle="phase">压到下一阶段</button>
        <button type="button" data-dev-battle="one-hp">压到 1 HP</button>
        <button type="button" data-dev-battle="refill">补满 HP / SP</button>
        <button type="button" data-dev-battle="refill-ap">补满 AP</button>
        <button type="button" data-dev-battle="cleanse">清除异常</button>
        <button type="button" data-dev-battle="lock-hp">锁血</button>
        <button type="button" data-dev-battle="bomb">引爆炸弹</button>
      </div>
    </fieldset><p role="status"></p>`;
  document.querySelector('#speed')?.insertAdjacentElement('afterend', quick);
  document.body.append(failureBadge, quickPanel);
  quick.textContent = '战斗调试';
  let skip = false;
  let nextFailure = null;
  let running = false;

  const enabled = () => session.ai.generationOptions.developerMode;
  function openEditor() {
    if (!enabled() || !channel) return;
    const url = new URL('../../tools/workshop-editor.html', import.meta.url);
    url.hash = `developer=${id}`;
    window.open(url.href, '_blank', 'noopener');
  }
  function sync() {
    if (entry) entry.hidden = !enabled() || !channel;
    quick.hidden = !enabled() || !channel || session.runtime.mode !== 'battle';
    failureBadge.hidden = !enabled() || !channel || !errors.length;
    failureBadge.textContent = `开发报错 ${errors.length}`;
    if (quick.hidden && quickPanel.open) quickPanel.close();
  }
  function showQuickPanel() {
    if (quick.hidden || quickPanel.open) return;
    const state = brief();
    const fieldset = quickPanel.querySelector('fieldset');
    const enemy = fieldset.querySelector('select');
    const previous = enemy.value;
    enemy.replaceChildren(
      ...state.enemies.filter(({ hp }) => hp > 0).map(({ id, name }) => new Option(name, id)),
    );
    if (state.enemies.some(({ id, hp }) => id === previous && hp > 0)) enemy.value = previous;
    fieldset.disabled = !sandbox || state.playing;
    quickPanel.querySelector('[data-dev-info]').textContent = sandbox
      ? '测试档 · 战斗调试'
      : '在修改器复制测试档后可调整战局。';
    quickPanel.querySelector('[data-dev-battle="bomb"]').disabled = !state.bomb;
    quickPanel
      .querySelector('[data-dev-battle="lock-hp"]')
      .setAttribute('aria-pressed', String(state.locked));
    quickPanel.querySelector('[role="status"]').textContent = '';
    quickPanel.showModal();
  }
  function recordFailure(value) {
    if (!enabled()) return;
    errors.unshift(
      sanitizeDeveloperData({
        at: new Date().toISOString(),
        stack: value?.stack || value?.message || String(value),
      }),
    );
    if (errors.length > 20) errors.pop();
    sync();
  }
  function brief() {
    sync();
    const state = session.battle.state;
    return {
      id,
      sandbox,
      mode: session.runtime.mode,
      playing: session.battle.playing,
      device: matchMedia('(pointer: coarse)').matches ? '手机' : '桌面',
      label: `${sandbox ? '测试档' : '当前档'} · ${location.port || '本机'}`,
      enemies:
        session.runtime.mode === 'battle'
          ? state.enemyIds.map((enemy) => ({
              id: enemy,
              name: definition(state, enemy)?.name || enemy,
              hp: state.units[enemy].hp,
              maxHp: state.units[enemy].maxHp,
            }))
          : [],
      locked: !!state.developerLockHp,
      skip,
      speed: session.battle.speed,
      bomb: !!state.activeAlchemicalBomb,
      skipOverlandApi: session.ai.generationOptions.skipOverlandApi,
      nextFailure,
      errors,
    };
  }
  function assertReady(mode) {
    if (
      session.runtime.disposed ||
      session.battle.playing ||
      session.ai.busy ||
      (mode && session.runtime.mode !== mode)
    )
      throw Error(
        mode
          ? `请等待并在${mode === 'battle' ? '战斗编排' : '酒馆'}中操作。`
          : '请等待当前行动完成。',
      );
  }
  function battleReady() {
    assertReady('battle');
    if (!['opening', 'plan'].includes(session.battle.state.phase))
      throw Error('请在回合编排时操作。');
  }
  async function command(action, data) {
    if (action === 'catalog')
      return developerMaps(session.ai.library).map(({ id, name, nodes }) => ({
        id,
        name,
        nodes: nodes.map((node) => ({
          id: node.id,
          name: node.name || node.siteName || node.title || node.label || node.id,
        })),
      }));
    if (action === 'fork') {
      assertReady();
      return developerCopySeed(session, context.checkpoint.snapshot());
    }
    if (action === 'export')
      return sanitizeDeveloperData({
        library: session.ai.library,
        state: session.runtime.mode === 'battle' ? session.battle.state : null,
        expedition: session.journey.expedition,
      });
    if (action === 'clear-errors') {
      errors.length = 0;
      return null;
    }
    if (!sandbox) throw Error('先复制当前档，再调整战斗、资源或进度。');
    if (action === 'offline') {
      context.generation.setOption('skipOverlandApi', !!data.enabled);
      return null;
    }
    if (action === 'skip-scenes') {
      skip = !skip;
      if (skip) {
        context.gal.skip();
        context.chapterTheater.skip();
      }
      return null;
    }
    if (action === 'failure') {
      if (!['timeout', '429', 'malformed', 'none'].includes(data.kind))
        throw Error('未知的接口故障。');
      nextFailure = data.kind === 'none' ? null : data.kind;
      if (nextFailure) context.generation.setOption('skipAiGeneration', false);
      return null;
    }
    if (action === 'speed') {
      if (![1, 2, 4].includes(data.speed)) throw Error('演出速度无效。');
      session.battle.speed = data.speed;
      document.querySelector('#speed').textContent = `演出 ×${data.speed}`;
      context.renderer.render({ animate: false });
      return null;
    }
    if (action === 'clear-checkpoint') {
      assertReady();
      if (['battle', 'event'].includes(session.runtime.mode))
        context.journey.returnInn({ developerReset: true });
      context.checkpoint.clear();
      return null;
    }
    if (BATTLE_ACTIONS.includes(action) || ['refill-ap', 'bomb'].includes(action)) {
      battleReady();
      if (action === 'bomb') {
        if (!context.overlordBattle.expireBombNowForTest())
          throw Error('当前没有正在计时的炼金炸弹。');
        return null;
      }
      if (action === 'refill-ap') session.battle.plan = [];
      else session.battle.state = changeDeveloperBattle(session.battle.state, action, data.enemy);
      context.planning.recompute();
      context.renderer.render({ animate: false });
      context.checkpoint.saveNow();
      return null;
    }
    assertReady('inn');
    if (action === 'encounter') {
      await context.journey.startDeveloperBattle(developerEncounter(session.ai.library, data));
    } else {
      session.ai.library = tuneDeveloperLibrary(session.ai.library, action, data);
      context.generation.save();
      context.shell.renderParty();
      context.onboarding.refresh();
      context.daily?.refresh();
    }
    return null;
  }
  if (channel)
    events.on(channel, 'message', async ({ data }) => {
      if (!enabled() || typeof data?.client !== 'string') return;
      if (data.type === 'discover') {
        channel.postMessage({ type: 'status', client: data.client, status: brief() });
        return;
      }
      if (data.type !== 'command' || data.target !== id || typeof data.request !== 'string') return;
      const reply = { type: 'response', client: data.client, request: data.request };
      if (running) {
        channel.postMessage({ ...reply, error: '上一条操作仍在执行。' });
        return;
      }
      running = true;
      try {
        const value = await command(data.action, data.args || {});
        if (!session.runtime.disposed) channel.postMessage({ ...reply, value, status: brief() });
      } catch (error) {
        if (!session.runtime.disposed)
          channel.postMessage({ ...reply, error: error.message || String(error) });
      } finally {
        running = false;
      }
    });
  if (entry) events.on(entry, 'click', openEditor);
  events.on(quick, 'click', showQuickPanel);
  events.on(quickPanel, 'click', async (event) => {
    if (event.target.closest('[data-dev-editor]')) {
      quickPanel.close();
      openEditor();
      return;
    }
    const action = event.target.closest('[data-dev-battle]')?.dataset.devBattle;
    if (!action || !enabled() || running) return;
    running = true;
    try {
      await command(action, { enemy: quickPanel.querySelector('select').value });
      quickPanel.close();
    } catch (error) {
      quickPanel.querySelector('[role="status"]').textContent = error.message;
    } finally {
      running = false;
    }
  });
  events.on(failureBadge, 'click', openEditor);
  events.on(window, 'error', (event) => recordFailure(event.error || event.message));
  events.on(window, 'unhandledrejection', (event) => recordFailure(event.reason));
  events.on(document, 'world-battle-ready', sync);
  sync();

  return {
    sync,
    report: recordFailure,
    skipScenes: () => enabled() && sandbox && skip,
    simulateRequest() {
      if (!enabled() || !sandbox || !nextFailure) return null;
      const kind = nextFailure;
      nextFailure = null;
      return async (signal) => {
        if (kind === 'timeout') {
          await new Promise((done) => {
            const timer = setTimeout(finish, 1800);
            function finish() {
              clearTimeout(timer);
              signal.removeEventListener('abort', finish);
              done();
            }
            signal.addEventListener('abort', finish, { once: true });
          });
          signal.throwIfAborted();
          throw new DOMException('请求超时 · 开发者模拟', 'TimeoutError');
        }
        if (kind === '429')
          throw Object.assign(Error('HTTP 429：请求频率过高 · 开发者模拟'), { status: 429 });
        throw new SyntaxError('响应 JSON 格式错误 · 开发者模拟');
      };
    },
    dispose() {
      channel?.close();
      quick.remove();
      quickPanel.remove();
      failureBadge.remove();
    },
  };
}
