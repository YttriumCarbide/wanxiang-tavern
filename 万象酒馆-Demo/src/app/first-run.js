import { html } from '../shared/html.js';
import { createDialogExit } from '../shared/dialog-exit.js';
import { API_LABELS, CONNECTION_KINDS, missingSetup } from './first-run-rules.js';

const DOWNLOADS = Object.freeze({
  windows:
    'https://github.com/YttriumCarbide/wanxiang-tavern/releases/download/v2.3.1/wanxiang-tavern-2.3.1-windows-x64.zip',
  android:
    'https://github.com/YttriumCarbide/wanxiang-tavern/releases/download/v2.3.1/wanxiang-tavern-2.3.1-android.apk',
});

const WIZARD_HEADERS = Object.freeze({
  mode: ['FIRST SETUP · 连接向导', '选择 API 配置方式'],
  'lazy-primary': ['01 / 02 · 懒人配置', '配置基础 AI 接口'],
  'lazy-split': ['02 / 02 · 双模型分工', '是否区分剧本与非剧本模型？'],
  'lazy-secondary': ['02 / 02 · 非剧本接口', '为非剧本 API 配置模型'],
});

/** First-run setup reuses real settings without sending paid test requests. */
export function createFirstRun(context) {
  const { events, session } = context;
  const settings = document.querySelector('#ai-dialog');
  const storage = context.storage || localStorage;
  const title = document.createElement('dialog');
  title.id = 'start-screen';
  title.setAttribute('aria-labelledby', 'start-title');
  title.innerHTML = html`<main class="start-copy">
    <small>WANXIANG TAVERN</small>
    <h1 id="start-title">万象酒馆</h1>
    <p class="start-subtitle">群星之间，一盏为你留着的灯。</p>
    <button id="start-journey" class="primary">开启旅程 <span>→</span></button>
    <button id="start-load">读取存档</button>
    <p class="start-note">使用自己的 AI 接口，书写属于你的异界故事。</p>
    <nav class="start-downloads" aria-label="下载游戏">
      <a id="start-download-windows" href="${DOWNLOADS.windows}">Windows ZIP</a>
      <a id="start-download-android" href="${DOWNLOADS.android}">Android APK</a>
    </nav>
  </main>`;
  document.body.append(title);

  const wizard = document.createElement('dialog');
  wizard.id = 'setup-wizard';
  const titleMotion = createDialogExit(title);
  const wizardMotion = createDialogExit(wizard);
  wizard.setAttribute('aria-labelledby', 'wizard-title');
  wizard.innerHTML = html`<header class="wizard-head">
      <div>
        <small id="wizard-kicker">FIRST SETUP · 连接向导</small>
        <h2 id="wizard-title">选择 API 配置方式</h2>
      </div>
      <button id="wizard-close" type="button" aria-label="返回开始界面">×</button>
    </header>
    <div class="wizard-body">
      <section class="wizard-panel" data-wizard-step="mode">
        <p class="wizard-lead">首次开启旅程前，连接自己的 AI 接口。</p>
        <div class="wizard-mode-grid">
          <button id="setup-mode-lazy" type="button" class="wizard-mode-card is-recommended">
            <span class="wizard-mode-badge">推荐新手</span>
            <strong>懒人配置</strong>
            <small>只需 Base URL、API Key 与模型三项，可为剧本选用单独的模型。</small>
          </button>
          <button id="setup-mode-free" type="button" class="wizard-mode-card">
            <span class="wizard-mode-badge">完整面板</span>
            <strong>自由配置</strong>
            <small>直接打开完整设置窗口，自主微调接口协议、传输方式与全部高级兼容选项。</small>
          </button>
        </div>
      </section>

      <section class="wizard-panel" data-wizard-step="lazy-primary" hidden>
        <p class="wizard-lead">
          填入接口地址、密钥并获取或填写模型名称。确认后将进入模型分工推荐。
        </p>
        <div class="wizard-form">
          <label>
            <span>Base URL</span>
            <input
              id="wizard-url"
              type="url"
              autocomplete="off"
              value="https://api.openai.com/v1"
              placeholder="https://服务地址/v1"
            />
          </label>
          <label>
            <span>API Key</span>
            <input
              id="wizard-key"
              type="password"
              autocomplete="off"
              placeholder="输入密钥（本地免密模型可留空）"
            />
          </label>
          <label>
            <span>模型 ID</span>
            <div class="wizard-model-row">
              <input id="wizard-model" autocomplete="off" placeholder="填写或获取模型 ID" />
              <button id="wizard-fetch-models" type="button">获取模型</button>
            </div>
          </label>
          <select id="wizard-model-list" size="5" hidden aria-label="基础接口可用模型"></select>
        </div>
        <div class="wizard-actions">
          <button id="wizard-primary-back" type="button">返回</button>
          <button id="wizard-primary-next" type="button" class="primary">确定</button>
        </div>
      </section>

      <section class="wizard-panel" data-wizard-step="lazy-split" hidden>
        <div class="wizard-callout">
          <strong>推荐为不同功能配置两个模型</strong>
          <p>
            建议让推理与文笔更强的模型专职负责「剧本
            API」，将其余用途（角色、聊天、记忆总结、地图、以太造物）交给性价比更高或响应更快的模型；也可全部共用当前模型。
          </p>
          <small id="wizard-primary-summary"></small>
        </div>
        <div class="wizard-actions">
          <button id="wizard-split-back" type="button">上一步</button>
          <button id="wizard-split-no" type="button">否 · 全部共用当前模型</button>
          <button id="wizard-split-yes" type="button" class="primary">
            是 · 为非剧本 API 另选模型
          </button>
        </div>
      </section>

      <section class="wizard-panel" data-wizard-step="lazy-secondary" hidden>
        <p class="wizard-lead">
          剧本 API 将使用
          <strong id="wizard-script-model-badge"></strong
          >；此处配置将应用于角色、聊天、记忆总结、地图与以太造物 API。
        </p>
        <div class="wizard-sec-tools">
          <small>已默认沿用刚才填写的地址与密钥，可直接换模型，也可清空重填另一家服务。</small>
          <button id="wizard-sec-clear" type="button">清空地址与密钥</button>
        </div>
        <div class="wizard-form">
          <label>
            <span>非剧本 Base URL</span>
            <input
              id="wizard-sec-url"
              type="url"
              autocomplete="off"
              placeholder="https://服务地址/v1"
            />
          </label>
          <label>
            <span>非剧本 API Key</span>
            <input
              id="wizard-sec-key"
              type="password"
              autocomplete="off"
              placeholder="输入密钥（本地免密模型可留空）"
            />
          </label>
          <label>
            <span>非剧本模型 ID</span>
            <div class="wizard-model-row">
              <input
                id="wizard-sec-model"
                autocomplete="off"
                placeholder="填写或获取非剧本模型 ID"
              />
              <button id="wizard-sec-fetch-models" type="button">获取模型</button>
            </div>
          </label>
          <select id="wizard-sec-model-list" size="5" hidden aria-label="非剧本可用模型"></select>
        </div>
        <div class="wizard-actions">
          <button id="wizard-secondary-back" type="button">返回</button>
          <button id="wizard-secondary-next" type="button" class="primary">确定并应用</button>
        </div>
      </section>
    </div>
    <p id="wizard-status" role="status"></p>`;
  document.body.append(wizard);

  const intro = document.createElement('section');
  intro.id = 'setup-intro';
  intro.hidden = true;
  intro.innerHTML =
    '<small id="setup-count"></small><h3 id="setup-heading"></h3><p id="setup-description"></p>';
  settings.querySelector('.ai-heading').after(intro);
  const footer = document.createElement('footer');
  footer.id = 'setup-footer';
  footer.hidden = true;
  footer.innerHTML =
    '<p id="setup-status" role="status"></p><button id="setup-apply" type="button">确定应用到勾选的 API</button><button id="setup-models" type="button">获取模型名称</button><button id="setup-next" class="primary">下一步</button>';
  settings.append(footer);
  let stage = null;
  let completed = false;
  let busy = false;
  let switching = false;
  let primaryDraft = null;
  const element = (id) => document.getElementById(id);

  function setWizardStatus(text = '') {
    element('wizard-status').textContent = text;
  }

  function setWizardStep(step) {
    wizard.dataset.step = step;
    const [kicker, heading] = WIZARD_HEADERS[step] || WIZARD_HEADERS.mode;
    element('wizard-kicker').textContent = kicker;
    element('wizard-title').textContent = heading;
    for (const panel of wizard.querySelectorAll('.wizard-panel')) {
      panel.hidden = panel.dataset.wizardStep !== step;
    }
    setWizardStatus('');
  }

  function validateDraft(url, key, model, { requireModel = true } = {}) {
    const baseUrl = String(url || '').trim();
    const apiKey = String(key || '').trim();
    const modelId = String(model || '').trim();
    let hostname;
    try {
      hostname = new URL(baseUrl).hostname;
    } catch {
      throw Error('请填写有效的 Base URL（例如 https://api.openai.com/v1）');
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
    if (!local && !apiKey) throw Error('请填写 API Key（本地模型可留空）');
    if (requireModel && !modelId) throw Error('请填写模型 ID 或先获取模型列表并选择');
    return { baseUrl, apiKey, model: modelId };
  }

  async function runBusy(buttonId, action) {
    if (busy) return;
    busy = true;
    const target = element(buttonId);
    if (target) target.disabled = true;
    try {
      await action();
    } catch (failure) {
      setWizardStatus(failure.message);
    } finally {
      busy = false;
      if (target) target.disabled = false;
    }
  }

  function describe() {
    settings.dataset.setup = stage || '';
    intro.hidden = footer.hidden = !stage;
    if (!stage) return;
    element('setup-count').textContent = '首次配置';
    element('setup-heading').textContent = '连接 AI';
    element('setup-description').textContent =
      '填写地址、密钥和模型。相同配置可一次应用到多个用途。';
    element('setup-next').textContent = '下一步 · 创建角色 →';
    element('setup-status').textContent = '';
  }
  async function finishSetup() {
    const status = await context.generation.setupStatus();
    const missing = missingSetup(status);
    if (missing.length) {
      throw Error('还需配置：' + missing.map((kind) => API_LABELS[kind]).join('、'));
    }
    storage.setItem('wanxiang.setup.completed.v1', 'true');
    completed = true;
    stage = null;
    describe();
    if (wizard.open) {
      switching = true;
      wizardMotion.close();
    }
    if (settings.open) settings.close();
    context.onboarding.open();
  }
  function open() {
    titleMotion.show();
  }
  async function start() {
    titleMotion.close();
    if (
      session.ai.generationOptions.developerMode &&
      !session.ai.generationOptions.protagonistApi
    ) {
      completed = true;
      context.onboarding.open();
      return;
    }
    const status = await context.generation.setupStatus();
    if (storage.getItem('wanxiang.setup.completed.v1') === 'true' && !missingSetup(status).length) {
      completed = true;
      context.onboarding.open();
      return;
    }
    setWizardStep('mode');
    switching = false;
    wizardMotion.show();
  }
  events.on(element('start-journey'), 'click', () => {
    void start().catch((failure) => {
      context.shell.toast(failure.message);
      open();
    });
  });
  events.on(element('start-load'), 'click', () => context.saves.open());
  events.on(element('setup-apply'), 'click', () => element('api-preset-apply-many').click());
  events.on(title, 'cancel', (event) => event.preventDefault());
  events.on(settings, 'close', () => {
    if (!stage) return;
    stage = null;
    describe();
    open();
  });

  function dismissWizard() {
    switching = false;
    wizardMotion.close();
    open();
  }
  events.on(element('wizard-close'), 'click', dismissWizard);
  events.on(wizard, 'cancel', (event) => {
    event.preventDefault();
    dismissWizard();
  });
  events.on(wizard, 'close', () => {
    if (switching) {
      switching = false;
      return;
    }
    if (!completed && !stage) open();
  });
  events.on(element('setup-mode-lazy'), 'click', () => setWizardStep('lazy-primary'));
  events.on(element('setup-mode-free'), 'click', async () => {
    stage = 'connections';
    describe();
    if (wizard.open) {
      switching = true;
      wizardMotion.close();
    }
    await context.generation.open('', 'character');
  });

  events.on(element('wizard-primary-back'), 'click', () => setWizardStep('mode'));
  events.on(
    element('wizard-fetch-models'),
    'click',
    () =>
      void runBusy('wizard-fetch-models', async () => {
        const draft = validateDraft(
          element('wizard-url').value,
          element('wizard-key').value,
          element('wizard-model').value,
          { requireModel: false },
        );
        setWizardStatus('正在获取可用模型列表…');
        const models = await context.generation.fetchModelsForDraft('script', draft);
        const list = element('wizard-model-list');
        list.replaceChildren(...models.map((id) => new Option(id, id)));
        list.hidden = false;
        list.value = element('wizard-model').value;
        setWizardStatus(
          models.length
            ? `已获取 ${models.length} 个模型，点击列表即可选用。`
            : '接口返回了空模型列表，请手动填写模型 ID。',
        );
      }),
  );
  events.on(element('wizard-model-list'), 'change', () => {
    element('wizard-model').value = element('wizard-model-list').value;
    setWizardStatus(`已选择模型：${element('wizard-model').value}`);
  });
  events.on(element('wizard-model'), 'input', () => {
    element('wizard-model-list').value = element('wizard-model').value;
  });
  events.on(
    element('wizard-primary-next'),
    'click',
    () =>
      void runBusy('wizard-primary-next', async () => {
        primaryDraft = validateDraft(
          element('wizard-url').value,
          element('wizard-key').value,
          element('wizard-model').value,
        );
        element('wizard-primary-summary').textContent =
          `已选基础模型：${primaryDraft.model}（${primaryDraft.baseUrl}）`;
        setWizardStep('lazy-split');
      }),
  );

  events.on(element('wizard-split-back'), 'click', () => setWizardStep('lazy-primary'));
  events.on(
    element('wizard-split-no'),
    'click',
    () =>
      void runBusy('wizard-split-no', async () => {
        setWizardStatus('正在应用配置到全部 API…');
        await context.generation.applyQuickConnection(CONNECTION_KINDS, primaryDraft);
        await finishSetup();
      }),
  );
  events.on(element('wizard-split-yes'), 'click', () => {
    if (!primaryDraft) return;
    element('wizard-script-model-badge').textContent = primaryDraft.model;
    element('wizard-sec-url').value = primaryDraft.baseUrl;
    element('wizard-sec-key').value = primaryDraft.apiKey;
    element('wizard-sec-model').value = '';
    element('wizard-sec-model-list').replaceChildren();
    element('wizard-sec-model-list').hidden = true;
    setWizardStep('lazy-secondary');
  });

  events.on(element('wizard-sec-clear'), 'click', () => {
    element('wizard-sec-url').value = '';
    element('wizard-sec-key').value = '';
    element('wizard-sec-model').value = '';
    element('wizard-sec-model-list').replaceChildren();
    element('wizard-sec-model-list').hidden = true;
    setWizardStatus('已清空非剧本 API 的地址与密钥，可填写新的服务商配置。');
  });
  events.on(element('wizard-secondary-back'), 'click', () => setWizardStep('lazy-split'));
  events.on(
    element('wizard-sec-fetch-models'),
    'click',
    () =>
      void runBusy('wizard-sec-fetch-models', async () => {
        const draft = validateDraft(
          element('wizard-sec-url').value,
          element('wizard-sec-key').value,
          element('wizard-sec-model').value,
          { requireModel: false },
        );
        setWizardStatus('正在获取非剧本 API 可用模型列表…');
        const models = await context.generation.fetchModelsForDraft('character', draft);
        const list = element('wizard-sec-model-list');
        list.replaceChildren(...models.map((id) => new Option(id, id)));
        list.hidden = false;
        list.value = element('wizard-sec-model').value;
        setWizardStatus(
          models.length
            ? `已获取 ${models.length} 个模型，点击列表即可填入。`
            : '接口返回了空模型列表，请手动填写模型 ID。',
        );
      }),
  );
  events.on(element('wizard-sec-model-list'), 'change', () => {
    element('wizard-sec-model').value = element('wizard-sec-model-list').value;
    setWizardStatus(`已选择非剧本模型：${element('wizard-sec-model').value}`);
  });
  events.on(element('wizard-sec-model'), 'input', () => {
    element('wizard-sec-model-list').value = element('wizard-sec-model').value;
  });
  events.on(
    element('wizard-secondary-next'),
    'click',
    () =>
      void runBusy('wizard-secondary-next', async () => {
        const secondaryDraft = validateDraft(
          element('wizard-sec-url').value,
          element('wizard-sec-key').value,
          element('wizard-sec-model').value,
        );
        setWizardStatus('正在保存双模型分工配置…');
        await context.generation.applyQuickConnection(['script'], primaryDraft);
        await context.generation.applyQuickConnection(
          CONNECTION_KINDS.filter((kind) => kind !== 'script'),
          secondaryDraft,
        );
        await finishSetup();
      }),
  );

  events.on(element('setup-next'), 'click', async () => {
    if (!stage || busy) return;
    busy = true;
    element('setup-next').disabled = true;
    try {
      await context.generation.saveConnection();
      await finishSetup();
    } catch (failure) {
      element('setup-status').textContent = failure.message;
    } finally {
      busy = false;
      element('setup-next').disabled = false;
    }
  });
  return {
    open,
    get completed() {
      return completed;
    },
    resumed() {
      titleMotion.clear();
      wizardMotion.clear();
      stage = null;
      describe();
      if (wizard.open) {
        switching = true;
        wizard.close();
      } else {
        switching = false;
      }
      title.close();
    },
    dispose() {
      titleMotion.clear();
      wizardMotion.clear();
      title.remove();
      wizard.remove();
      intro.remove();
      footer.remove();
    },
  };
}
