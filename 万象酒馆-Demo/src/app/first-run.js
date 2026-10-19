import { html } from '../shared/html.js';
import { API_LABELS, missingSetup } from './first-run-rules.js';

/** First-run setup reuses real settings without sending paid test requests. */
export function createFirstRun(context) {
  const { events, session } = context;
  const settings = document.querySelector('#ai-dialog');
  const storage = context.storage || localStorage;
  const title = document.createElement('dialog');
  title.id = 'start-screen';
  title.setAttribute('aria-labelledby', 'start-title');
  title.innerHTML = html`<div class="start-ornament" aria-hidden="true">✧</div>
    <main class="start-copy">
      <small>WANXIANG TAVERN</small>
      <h1 id="start-title">万象酒馆</h1>
      <p class="start-subtitle">群星之间，一盏为你留着的灯。</p>
      <span class="start-divider" aria-hidden="true">◇ ───── ✧ ───── ◇</span>
      <button id="start-journey" class="primary">开启旅程 <span>→</span></button>
      <button id="start-load">读取存档</button>
      <p class="start-note">使用自己的 AI 接口，书写属于你的异界故事。</p>
    </main>
    <small class="start-footer">星海无垠 · 此处是归途</small>`;
  document.body.append(title);
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
    '<p id="setup-status" role="status"></p><button id="setup-next" class="primary">下一步</button>';
  settings.append(footer);
  let stage = null;
  let completed = false;
  let busy = false;
  const element = (id) => document.getElementById(id);
  function describe() {
    settings.dataset.setup = stage || '';
    intro.hidden = footer.hidden = !stage;
    if (!stage) return;
    const connections = stage === 'connections';
    element('setup-count').textContent = connections ? '01 / 03 · 连接旅途' : '02 / 03 · 选择文风';
    element('setup-heading').textContent = connections
      ? '先配置你的 AI 接口'
      : '导入一个酒馆提示词预设';
    element('setup-description').textContent = connections
      ? '副本剧本 API 负责统筹剧情、理解设定和安排后续发展，建议使用理解、推理与长篇创作能力较强的模型。角色生成、酒馆交流、快速闲聊、记忆总结和以太造物可使用更轻量、费用较低的模型。六项用途都需保存连接；可在下方勾选其他用途，一键应用同一份 API 预设。'
      : '导入一份你喜欢的酒馆预设，即默认应用到角色生成、副本剧本、酒馆交流和快速闲聊。以后可分别更换；记忆总结和以太造物使用游戏内置提示词，无需导入。';
    element('setup-next').textContent = connections
      ? '下一步 · 导入提示词预设 →'
      : '下一步 · 创建角色 →';
    element('setup-status').textContent = '';
  }
  function open() {
    if (!title.open) title.showModal();
  }
  async function start() {
    title.close();
    if (
      session.ai.generationOptions.developerMode &&
      !session.ai.generationOptions.protagonistApi
    ) {
      completed = true;
      context.onboarding.open();
      return;
    }
    const status = await context.generation.setupStatus();
    if (
      storage.getItem('wanxiang.setup.completed.v1') === 'true' &&
      !missingSetup(status, 'connections').length &&
      !missingSetup(status, 'prompts').length
    ) {
      completed = true;
      context.onboarding.open();
      return;
    }
    stage = 'connections';
    describe();
    await context.generation.open('', 'character');
  }
  events.on(element('start-journey'), 'click', () => {
    void start().catch((failure) => {
      context.shell.toast(failure.message);
      open();
    });
  });
  events.on(element('start-load'), 'click', () => context.saves.open());
  events.on(title, 'cancel', (event) => event.preventDefault());
  events.on(settings, 'close', () => {
    if (!stage) return;
    stage = null;
    describe();
    open();
  });
  events.on(element('setup-next'), 'click', async () => {
    if (!stage || busy) return;
    busy = true;
    element('setup-next').disabled = true;
    try {
      if (stage === 'connections') await context.generation.saveConnection();
      const status = await context.generation.setupStatus();
      const missing = missingSetup(status, stage);
      if (missing.length) {
        element('setup-status').textContent =
          stage === 'connections'
            ? `还需配置：${missing.map((kind) => API_LABELS[kind]).join('、')}。请保存模型及密钥，或应用已保存的 API 预设。`
            : '请先导入提示词预设。导入后会自动应用到四项生成与交流用途。';
        return;
      }
      if (stage === 'connections') {
        stage = 'prompts';
        describe();
        await context.generation.openPrompts();
      } else {
        completed = true;
        storage.setItem('wanxiang.setup.completed.v1', 'true');
        stage = null;
        describe();
        settings.close();
        context.onboarding.open();
      }
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
      stage = null;
      describe();
      title.close();
    },
    dispose() {
      title.remove();
      intro.remove();
      footer.remove();
    },
  };
}
