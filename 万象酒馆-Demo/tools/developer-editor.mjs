import { DEVELOPER_CHANNEL, DEVELOPER_COPY_KEY } from '../src/developer-rules.js';
import { DEFINITIONS } from '../src/data.js';
import { REGIONS } from '../src/content/regions.js';
import { ENCOUNTER_COUNT } from '../src/content/journey-rules.js';
import { GENERATION_OPTIONS_KEY } from '../src/generation-options.js';

function isLocalDeveloperModeSaved() {
  try {
    const raw = globalThis.localStorage?.getItem(GENERATION_OPTIONS_KEY);
    return Boolean(raw && JSON.parse(raw)?.developerMode === true);
  } catch {
    return false;
  }
}

export function mountDeveloperEditor(workshop) {
  const { document, location } = globalThis;
  const panel = document.querySelector('#game-developer-editor');
  const preferred = new URLSearchParams(location.hash.slice(1)).get('developer');
  const tabs = [...document.querySelectorAll('[data-modifier-tab]')];
  let visible = Boolean(preferred);
  function tab(developer) {
    visible = developer;
    panel.hidden = !developer;
    workshop.hidden = developer;
    for (const button of tabs)
      button.setAttribute(
        'aria-pressed',
        String((button.dataset.modifierTab === 'developer') === developer),
      );
    if (developer) discover();
  }
  panel.innerHTML = `
    <div class="developer-target">
      <label class="developer-target-select"><span>游戏窗口</span> <select data-field="target"></select></label>
      <div class="developer-target-actions">
        <button type="button" class="developer-primary" data-command="fork">复制为测试档</button>
        <button type="button" data-command="export">导出状态 JSON</button>
      </div>
      <span data-state></span>
    </div>
    <p role="status" data-notice>请打开游戏并启用开发者模式。</p>
    <div class="developer-sections">
      <fieldset data-sandbox><legend>遭遇直达</legend>
        <div class="developer-group">
          <div class="developer-trio">
            <label>地图 <select data-field="map"></select></label>
            <label>节点 <select data-field="node"></select></label>
            <label>遭遇 <select data-field="encounter"></select></label>
          </div>
          <button type="button" class="developer-primary" data-command="encounter">开始遭遇</button>
        </div>
        <div class="developer-group developer-group-divider">
          <div class="developer-combo">
            <label>自定义战场 <select data-field="custom-map"></select></label>
            <button type="button" class="developer-primary" data-command="custom">开始自定义战斗</button>
          </div>
          <label>敌人（选一到三名）<select data-field="custom-enemies" multiple size="3"></select></label>
          <div class="developer-actions">
            <button type="button" data-command="puppet">炼金傀偶</button>
            <button type="button" data-command="apep">阿佩普</button>
          </div>
        </div>
      </fieldset>
      <fieldset data-sandbox><legend>战斗沙盒</legend>
        <div class="developer-group">
          <label>目标 <select data-field="enemy"></select></label>
          <div class="developer-actions">
            <button type="button" data-command="phase">压到下一阶段</button>
            <button type="button" data-command="one-hp">压到 1 HP</button>
            <button type="button" data-command="refill">补满 HP / SP</button>
            <button type="button" data-command="refill-ap">补满 AP（清空编排）</button>
            <button type="button" data-command="cleanse">清除我方异常</button>
            <button type="button" data-command="lock-hp" aria-pressed="false">我方锁血</button>
            <button type="button" data-command="bomb">立即引爆炼金炸弹</button>
          </div>
        </div>
        <div class="developer-group developer-group-divider developer-group-footer">
          <div class="developer-combo">
            <label>演出速度 <select data-field="speed"><option>1</option><option>2</option><option>4</option></select></label>
            <button type="button" data-command="speed">应用速度</button>
          </div>
          <button type="button" data-command="skip-scenes" aria-pressed="false">跳过 Gal / 剧场</button>
        </div>
      </fieldset>
      <fieldset data-sandbox><legend>队伍与资源</legend>
        <div class="developer-group">
          <div class="developer-combo">
            <label>全队等级 <select data-field="level"><option>1</option><option>10</option><option>15</option><option>20</option></select></label>
            <button type="button" data-command="level">应用等级</button>
          </div>
        </div>
        <div class="developer-group developer-group-divider developer-stack">
          <button type="button" data-command="supply">发放金币、以太、契约、药水</button>
          <button type="button" data-command="unlock">解锁官方地图和后场</button>
          <button type="button" data-command="tutorial">完成新手引导</button>
        </div>
      </fieldset>
      <fieldset data-sandbox><legend>接口模拟</legend>
        <div class="developer-group">
          <label class="developer-checkbox"><input type="checkbox" data-field="offline" /> <span>跳过界外行纪 API</span></label>
          <div class="developer-combo">
            <label>下一次生成 <select data-field="failure"><option value="none">无</option><option value="timeout">超时</option><option value="429">HTTP 429</option><option value="malformed">响应格式错误</option></select></label>
            <button type="button" data-command="failure">设置单次故障</button>
          </div>
          <output data-failure></output>
        </div>
      </fieldset>
      <fieldset data-sandbox><legend>重置</legend>
        <div class="developer-group">
          <div class="developer-combo">
            <label>官方地图 <select data-field="reset-map"></select></label>
            <button type="button" data-command="reset-route">重置这张地图的路线进度</button>
          </div>
        </div>
        <div class="developer-group developer-group-divider developer-group-footer">
          <button type="button" class="developer-danger" data-command="clear-checkpoint">返回酒馆并清除战局断点</button>
        </div>
      </fieldset>
      <fieldset class="developer-errors-card"><legend>运行错误</legend>
        <div class="developer-errors-toolbar">
          <span>异常捕获日志</span>
          <button type="button" data-command="clear-errors">清空错误</button>
        </div>
        <pre data-errors>暂无报错。</pre>
      </fieldset>
    </div>`;
  const field = (key) => panel.querySelector(`[data-field="${key}"]`);
  const notice = panel.querySelector('[data-notice]');
  const selection = field('target');
  const channel = new BroadcastChannel(DEVELOPER_CHANNEL);
  const client = globalThis.crypto.randomUUID();
  const targets = new Map();
  const awaiting = new Map();
  let target = preferred || '';
  let maps = [];
  let pendingAction = false;
  let customNotice = '';

  function setNotice(text) {
    customNotice = text;
    notice.textContent = text;
  }

  function defaultNotice(state) {
    if (state?.sandbox) return '已连接测试档沙盒，可直接调试下方全部遭遇、战局与资源。';
    if (state) return '已连接当前档。为保护正式存档，请先点击上方「复制为测试档」开启沙盒调试。';
    if (isLocalDeveloperModeSaved())
      return '开发者模式已开启，但未检测到正在运行的游戏标签页——请点击右上角「打开游戏」并保持该页面打开。';
    return '请打开游戏并启用开发者模式。';
  }

  function options(select, rows) {
    if (
      select.options.length === rows.length &&
      rows.every(
        ({ id, name }, i) =>
          select.options[i].value === id && select.options[i].textContent === name,
      )
    )
      return;
    const value = select.value;
    select.replaceChildren(...rows.map(({ id, name }) => new globalThis.Option(name, id)));
    if (rows.some((row) => row.id === value)) select.value = value;
  }
  const allMaps = Object.entries(REGIONS).map(([id, { name }]) => ({ id, name }));
  options(field('custom-map'), allMaps);
  options(
    field('custom-enemies'),
    Object.values(DEFINITIONS).filter(({ speed }) => speed),
  );
  options(
    field('encounter'),
    Array.from({ length: ENCOUNTER_COUNT }, (_, index) => ({
      id: String(index),
      name: `第 ${index + 1} 场`,
    })),
  );
  function discover() {
    channel.postMessage({ type: 'discover', client });
  }
  function request(action, args = {}) {
    if (!targets.has(target)) return Promise.reject(Error('请选择已开启开发者模式的游戏窗口。'));
    const id = globalThis.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        awaiting.delete(id);
        reject(Error('游戏窗口未响应，请确认页面还在运行。'));
      }, 45000);
      awaiting.set(id, { resolve, reject, timeout });
      channel.postMessage({ type: 'command', client, request: id, target, action, args });
    });
  }
  function nodes() {
    options(field('node'), maps.find((map) => map.id === field('map').value)?.nodes || []);
  }
  async function loadMaps() {
    const chosen = target;
    maps = await request('catalog');
    if (target !== chosen) return;
    options(field('map'), maps);
    options(
      field('reset-map'),
      maps.filter(({ id }) => Object.hasOwn(REGIONS, id)),
    );
    nodes();
  }
  function render() {
    const state = targets.get(target)?.status;
    const rows = [...targets].map(([id, { status }]) => ({
      id,
      name: `${status.label} · ${status.device} · ${id.slice(0, 6)}`,
    }));
    options(selection, rows.length ? rows : [{ id: '', name: '等待游戏窗口' }]);
    if (state) selection.value = target;
    if (!customNotice) {
      notice.textContent = defaultNotice(state);
    }
    panel.querySelector('[data-state]').textContent = state
      ? `${state.sandbox ? '测试档' : '当前档'} · ${state.mode === 'battle' ? '战斗中' : state.mode === 'inn' ? '酒馆' : '场景过渡'}`
      : '';
    panel.querySelectorAll('[data-sandbox]').forEach((el) => {
      el.disabled = !state?.sandbox;
    });
    for (const action of ['fork', 'export', 'clear-errors'])
      panel.querySelector(`[data-command="${action}"]`).disabled = !state;
    options(
      field('enemy'),
      (state?.enemies || []).map(({ id, name, hp, maxHp }) => ({
        id,
        name: `${name}　${hp}/${maxHp}`,
      })),
    );
    const ready = state?.mode === 'battle' && !state.playing;
    for (const action of ['phase', 'one-hp', 'refill', 'refill-ap', 'cleanse', 'lock-hp', 'bomb'])
      panel.querySelector(`[data-command="${action}"]`).disabled =
        !ready || (action === 'bomb' && !state.bomb);
    panel
      .querySelector('[data-command="lock-hp"]')
      .setAttribute('aria-pressed', String(!!state?.locked));
    panel
      .querySelector('[data-command="skip-scenes"]')
      .setAttribute('aria-pressed', String(!!state?.skip));
    field('offline').checked = !!state?.skipOverlandApi;
    panel.querySelector('[data-failure]').textContent = state?.nextFailure
      ? `已设置 ${state.nextFailure}，下一次请求触发。`
      : '';
    panel.querySelector('[data-errors]').textContent =
      state?.errors?.map(({ at, stack }) => `${at}\n${stack}`).join('\n\n') || '暂无报错。';
  }
  function receive(state) {
    const isNew = !targets.has(state.id);
    targets.set(state.id, { status: state, last: Date.now() });
    if (!target || (preferred === state.id && !targets.has(target)) || (isNew && state.sandbox)) {
      target = state.id;
      customNotice = '';
      maps = [];
    }
    if (target === state.id && !maps.length) {
      maps = [{ id: '', nodes: [] }];
      void loadMaps().catch((error) => {
        maps = [];
        setNotice(error.message);
      });
    }
    render();
  }
  channel.addEventListener('message', ({ data }) => {
    if (data?.client !== client) return;
    if (data.type === 'status') receive(data.status);
    if (data.type !== 'response') return;
    if (data.status) receive(data.status);
    const operation = awaiting.get(data.request);
    if (!operation) return;
    clearTimeout(operation.timeout);
    awaiting.delete(data.request);
    if (data.error) operation.reject(Error(data.error));
    else operation.resolve(data.value);
  });
  const clock = setInterval(() => {
    if (!visible) return;
    for (const [id, record] of targets) if (Date.now() - record.last > 7000) targets.delete(id);
    if (!targets.has(target)) {
      target = targets.keys().next().value || '';
      maps = [];
      customNotice = '';
      render();
    }
    discover();
  }, 1600);
  selection.addEventListener('change', () => {
    target = selection.value;
    maps = [];
    customNotice = '';
    void loadMaps().catch((error) => {
      setNotice(error.message);
    });
    render();
  });
  field('map').addEventListener('change', nodes);
  field('offline').addEventListener('change', async () => {
    try {
      await request('offline', { enabled: field('offline').checked });
    } catch (error) {
      setNotice(error.message);
      render();
    }
  });
  function argumentsFor(action) {
    if (action === 'encounter')
      return {
        map: field('map').value,
        node: field('node').value,
        encounter: Number(field('encounter').value),
      };
    if (action === 'custom')
      return {
        map: field('custom-map').value,
        enemies: [...field('custom-enemies').selectedOptions].map(({ value }) => value),
      };
    if (action === 'puppet') return { map: 'mill', enemies: ['alchemicalPuppet'] };
    if (action === 'apep') return { map: 'ruins', enemies: ['apepLamb'] };
    if (action === 'reset-route') return { map: field('reset-map').value };
    if (action === 'failure') return { kind: field('failure').value };
    if (action === 'level' || action === 'speed') return { [action]: Number(field(action).value) };
    return { enemy: field('enemy').value };
  }
  function download(value) {
    const href = globalThis.URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = '万象酒馆-调试快照.json';
    anchor.click();
    setTimeout(() => globalThis.URL.revokeObjectURL(href), 1000);
  }
  panel.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-command]');
    if (!button || pendingAction) return;
    const action = button.dataset.command;
    const args = argumentsFor(action);
    if (
      action === 'reset-route' &&
      !globalThis.confirm(
        `重置测试档的${DEFINITIONS[args.map]?.name || REGIONS[args.map]?.name || args.map}路线进度？`,
      )
    )
      return;
    if (
      action === 'clear-checkpoint' &&
      !globalThis.confirm('清除测试档的当前战局断点，并回到酒馆？')
    )
      return;
    if (action === 'custom' && !args.enemies.length) {
      setNotice('请选择一到三名敌人。');
      return;
    }
    const copy = action === 'fork' ? globalThis.open('about:blank', '_blank') : null;
    if (action === 'fork' && !copy) {
      setNotice('浏览器拦截了测试档窗口。');
      return;
    }
    pendingAction = true;
    setNotice('正在执行…');
    try {
      const value = await request(
        ['custom', 'puppet', 'apep'].includes(action) ? 'encounter' : action,
        args,
      );
      if (copy) {
        copy.sessionStorage.setItem(DEVELOPER_COPY_KEY, JSON.stringify(value));
        copy.opener = null;
        copy.location.replace(new URL('../?developerSandbox=1', location.href).href);
        setNotice('测试档已打开，请在游戏窗口列表选中测试档。');
      } else if (action === 'export') {
        download(value);
        setNotice('状态已导出。');
      } else {
        setNotice('操作完成。');
        if (action === 'reset-route') await loadMaps();
      }
    } catch (error) {
      copy?.close();
      setNotice(error.message);
    } finally {
      pendingAction = false;
    }
  });
  for (const button of tabs)
    button.addEventListener('click', () => tab(button.dataset.modifierTab === 'developer'));
  globalThis.addEventListener(
    'pagehide',
    () => {
      clearInterval(clock);
      channel.close();
    },
    { once: true },
  );
  render();
  tab(visible);
}
