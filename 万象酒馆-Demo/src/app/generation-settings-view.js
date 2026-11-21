import { HEROES } from '../data.js';
import { rearUnlocked } from '../formation-access.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { developerOption } from '../generation-options.js';
import { hasGeneratedRecovery } from './generated-reset.js';
import { query as $ } from './dom.js';

export function createGenerationSettingsView({ context, library, storage, getPendingPortal }) {
  const { session } = context;
  function renderDeveloperOptions() {
    document.body.classList.add('gal-mode');
    $('#developer-options').hidden = !session.ai.generationOptions.developerMode;
    for (const checkbox of document.querySelectorAll('[data-generation-option]'))
      checkbox.checked = session.ai.generationOptions[checkbox.dataset.generationOption];
    if (session.runtime.mode === 'battle')
      $('#back-inn').hidden = !developerOption(session.ai.generationOptions, 'allowRetreat');
    context.shell?.syncInnVisitors?.();
    context.generationAccess?.refresh();
    context.records?.refreshArchive?.();
    context.destinations?.refreshQuickTest?.();
    context.developer?.sync();
  }

  function render() {
    $('#ai-party').innerHTML = HEROES.slice(0, rearUnlocked(library()) ? 6 : 3)
      .map(
        (slot, index) =>
          html`<label
            >${index + 1} · ${index < 3 ? '前场' : '后场'}<select data-party-slot="${index}">
              ${library().campaign ? '<option value="">空位</option>' : ''}
              ${library()
                .characters.map(
                  (entry) =>
                    html`<option
                      value="${entry.id}"
                      ${library().party[index] === entry.id ? 'selected' : ''}
                    >
                      ${escapeText(entry.setting.name)}
                    </option>`,
                )
                .join('')}
            </select></label
          >`,
      )
      .join('');
    $('#ai-pool').innerHTML = library()
      .characters.map(
        (entry) =>
          html`<article class="ai-entry">
            <span
              class="worldbook-light ${library().party.includes(entry.id) ? 'active' : ''}"
              title="${library().party.includes(entry.id) ? '绿灯：在队' : '暂留酒馆'}"
            ></span>
            <div>
              <b>${escapeText(entry.setting.name)}</b
              ><small> ${entry.source === 'official' ? '官方' : '来客'}</small>
            </div>
            <button data-lore="${entry.id}">阅读设定</button>
          </article>`,
      )
      .join('');
    $('#ai-books').innerHTML =
      library()
        .scripts.map(
          (book) =>
            html`<article class="ai-entry">
              <div>
                <b>${escapeText(book.title)}</b
                ><small>第${book.chapter}章 · ${escapeText((book.tags || []).join('、'))}</small>
              </div>
              <button data-book="${escapeText(book.id)}">阅读记录</button>
            </article>`,
        )
        .join('') || '<p>尚未启程。在副本门点击“进入剧本”开始本章。</p>';
    $('#ai-cancel').hidden = !session.ai.busy;
    $('#generation-reset-undo').hidden = !hasGeneratedRecovery(storage);
    renderCredentialRetention();
  }

  function setTab(tab) {
    $('#ai-dialog').dataset.tab = tab;
    $('#ai-dialog').dataset.preview = 'false';
    $('#ai-lore-editor').hidden = true;
    $('#ai-preview').hidden = false;
    $('#ai-token-summary').textContent = '';
    $('#ai-result-title').textContent = tab === 'prompts' ? '最终发送消息预览' : '世界书正文';
    document.querySelectorAll('[data-ai-page]').forEach((page) => {
      page.hidden = page.dataset.aiPage !== tab;
    });
    document
      .querySelectorAll('[data-ai-tab]')
      .forEach((button) =>
        button.setAttribute('aria-selected', String(button.dataset.aiTab === tab)),
      );
  }

  function renderTransport() {
    if (context.apiClient.staticMode) {
      $('#ai-requestMode').value = 'browser';
      $('#ai-requestMode').disabled = true;
      $('#ai-rememberKey').disabled = false;
      $('#ai-transport-hint').textContent =
        '所有数据保存在此浏览器，AI由本页直接请求。勾选记住密钥后，刷新和重启仍可使用；普通备份不包含密钥。';
      return;
    }
    const direct = $('#ai-requestMode').value === 'browser';
    $('#ai-rememberKey').disabled = direct;
    $('#ai-transport-hint').textContent = direct
      ? '由本页请求AI，接口需允许跨域。密钥仅在当前页面保留；本阶段预设准备与结果校验仍使用本机服务。'
      : '由本机服务请求AI，可使用保存在本机的连接密钥。';
  }

  function renderCredentialRetention() {
    const pendingPortal = getPendingPortal();
    const browser = $('#ai-requestMode').value === 'browser';
    const temporary = browser && (!context.apiClient.staticMode || !$('#ai-rememberKey').checked);
    $('#ai-key-retention').textContent = browser
      ? temporary
        ? '当前仅本次使用：密钥不会写入设备，更新页面或关机后需要重新输入。'
        : '密钥会保存在此设备，刷新、代码更新及正常关机重启后保留；不会进入普通备份。'
      : '';
    $('#ai-remember-and-save').hidden = !context.apiClient.staticMode || !temporary;
    $('#ai-profile-save').textContent = temporary
      ? '仅本次使用（关闭后需重填）'
      : pendingPortal
        ? `保存并${pendingPortal === 'character' ? '召唤' : '进入剧本'}`
        : '保存当前连接';
  }

  function renderProvider() {
    const base = $('#ai-baseUrl').value;
    const native =
      $('#ai-provider').value === 'vertex' ||
      ($('#ai-provider').value === 'auto' &&
        /aiplatform\.googleapis\.com/.test(base) &&
        !base.includes('/endpoints/'));
    $('#ai-vertex-auth').hidden = !native;
    $('#ai-provider-hint').hidden = !native;
    const serviceAccount = native && $('#ai-vertexAuth').value === 'service-account';
    $('#ai-service-account-fields').hidden = !serviceAccount;
    $('#ai-key').closest('label').hidden = serviceAccount;
    $('#ai-provider-hint').textContent = serviceAccount
      ? '导入或粘贴服务账号 JSON，验证后保存。项目自动识别，地区默认为 global；模型名自行填写。私钥只用于本地签名，访问令牌自动获取，不会进入普通备份。'
      : $('#ai-vertexAuth').value === 'oauth'
        ? '标准模式：Base URL 填 https://区域-aiplatform.googleapis.com/v1/projects/项目ID/locations/区域，全球区域用 aiplatform.googleapis.com；密钥栏填有效OAuth访问令牌。令牌过期后需更新，本页不保存服务账号私钥。模型ID手动填写。'
        : '快捷模式：Base URL 填 https://aiplatform.googleapis.com/v1，密钥栏填Vertex API Key，模型栏填Google控制台中的Gemini模型ID。原生接口无需 /chat/completions，模型ID手动填写。';
  }
  return {
    renderDeveloperOptions,
    render,
    setTab,
    renderTransport,
    renderCredentialRetention,
    renderProvider,
  };
}
