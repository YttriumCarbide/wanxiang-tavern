import { renderSampling, captureSampling } from './sampling-editor.js';
import { normalizePromptPreset } from '../ai/presets.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import { query as $ } from './dom.js';
import { tokenSummary, formatRequestPreview } from './request-preview.js';

/** Settings editor owns only its draft; persisted presets and secrets belong to the local service. */
export function createAiPresetEditor({
  events,
  api,
  status,
  getProfiles,
  setProfiles,
  captureProfile,
  fillProfile,
  inputFor,
  setTab,
}) {
  let apiPresets = [],
    promptPresets = [],
    formats = {},
    draft = null,
    warnings = [],
    editing = null;
  const kind = () => $('#prompt-kind').value;
  const guard =
    (action) =>
    async (...args) => {
      try {
        await action(...args);
      } catch (failure) {
        status(failure.message);
      }
    };
  function options(select, entries, selected, placeholder = false) {
    select.replaceChildren(
      ...(placeholder ? [new Option('未选择', '')] : []),
      ...entries.map(
        (entry) => new Option(entry.name + (entry.invalid ? '（格式损坏）' : ''), entry.id),
      ),
    );
    select.value = selected || '';
  }
  function syncProfile() {
    const profile = getProfiles()?.[$('#ai-kind').value];
    if (!profile) return;
    options($('#api-preset-select'), apiPresets, profile.apiPresetId, true);

    $('#api-preset-name').value =
      apiPresets.find((entry) => entry.id === profile.apiPresetId)?.name || '';
    $('#prompt-contract').textContent = formats[kind()] || '';
  }
  async function refresh() {
    const [connections, prompts] = await Promise.all([api('presets'), api('prompts')]);
    apiPresets = connections.presets;
    promptPresets = prompts.presets;
    formats = prompts.formats;
    syncProfile();
  }
  function renderDraft() {
    options(
      $('#prompt-select'),
      promptPresets.filter((entry) => !entry.invalid),
      draft?.id,
      true,
    );
    for (const id of [
      'prompt-name',
      'prompt-use',
      'prompt-save',
      'prompt-copy',
      'prompt-delete',
      'prompt-export',
      'prompt-add',
      'prompt-preview',
    ])
      $('#' + id).disabled = !draft;
    renderSampling($('#prompt-sampling'), draft);
    if (!draft) {
      $('#prompt-name').value = '';
      $('#prompt-messages').replaceChildren();
      $('#prompt-source').textContent = '尚未导入提示词预设。请导入你自己的酒馆预设。';
      $('#prompt-warnings').textContent = '';
      return;
    }
    $('#prompt-name').value = draft.name;
    $('#prompt-source').textContent =
      `导入的预设：${draft.name} · 游戏输出格式在世界书顶部的“角色格式 / 剧本格式”中编辑。`;
    $('#prompt-warnings').textContent = warnings.join('\n');
    $('#prompt-contract').textContent = formats[kind()] || '';
    const order = draft.prompt_order[0].order;
    $('#prompt-messages').innerHTML =
      html`<div class="prompt-table-heading">
        <span>提示词</span><span>角色 / 位置</span><span>启用</span>
      </div>` +
      order
        .map((item, index) => {
          const entry = draft.prompts.find((prompt) => prompt.identifier === item.identifier);
          return html`<article
            class="prompt-message"
            draggable="true"
            data-prompt-entry="${entry.identifier}"
          >
            <span class="prompt-handle" title="拖拽调整顺序">☰</span
            ><button class="prompt-edit-name" data-prompt-edit>${escapeText(entry.name)}</button>
            <small
              >${entry.marker ? '占位层' : entry.role.toUpperCase()}${entry.injection_position === 1 ? ` · 深度${entry.injection_depth}` : ''}</small
            >
            <input
              type="checkbox"
              data-prompt-enabled
              ${item.enabled ? 'checked' : ''}
              aria-label="启用${escapeText(entry.name)}"
            />
            <button data-prompt-edit aria-label="编辑${escapeText(entry.name)}">✎</button>
            <button data-prompt-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="上移此层">
              ↑
            </button>
            <button
              data-prompt-move="1"
              ${index === order.length - 1 ? 'disabled' : ''}
              aria-label="下移此层"
            >
              ↓
            </button>
            <button data-prompt-remove aria-label="删除此层">×</button>
          </article>`;
        })
        .join('');
  }
  function captureEdit() {
    if (!editing) return;
    const entry = draft.prompts.find((item) => item.identifier === editing);
    for (const field of document.querySelectorAll('#prompt-entry-dialog [data-prompt-field]')) {
      const key = field.dataset.promptField;
      entry[key] =
        key.startsWith('injection_') && key !== 'injection_trigger'
          ? Number(field.value)
          : key === 'injection_trigger'
            ? field.value
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            : field.value;
    }
  }
  function editEntry(id) {
    editing = id;
    const entry = draft.prompts.find((item) => item.identifier === id);
    $('#prompt-entry-fields').innerHTML = html`<label
        >名称<input data-prompt-field="name" value="${escapeText(entry.name)}" maxlength="80"
      /></label>
      <div class="prompt-injection">
        <label
          >角色<select data-prompt-field="role" ${entry.marker ? 'disabled' : ''}>
            ${['system', 'user', 'assistant'].map((role) => html`<option value="${role}" ${entry.role === role ? 'selected' : ''}>${role.toUpperCase()}</option>`).join('')}
          </select></label
        >
        <label
          >位置<select data-prompt-field="injection_position">
            <option value="0" ${entry.injection_position === 0 ? 'selected' : ''}>相对位置</option>
            <option value="1" ${entry.injection_position === 1 ? 'selected' : ''}>聊天深度</option>
          </select></label
        >
        <label
          >深度<input
            data-prompt-field="injection_depth"
            type="number"
            min="0"
            max="100"
            value="${entry.injection_depth}"
        /></label>
        <label
          >顺序<input
            data-prompt-field="injection_order"
            type="number"
            min="0"
            max="9999"
            value="${entry.injection_order}"
        /></label>
      </div>
      <label
        >提示词<textarea
          data-prompt-field="content"
          rows="14"
          maxlength="128000"
          ${entry.marker ? 'readonly' : ''}
        >
${escapeText(entry.content)}</textarea>
      </label>
      <p class="ai-hint">
        ${entry.marker ? `自动占位：${escapeText(entry.identifier)}` : '支持酒馆变量；内容按预设顺序发送。'}
      </p>`;
    $('#prompt-entry-dialog').showModal();
  }
  function capture() {
    if (!draft) throw Error('请先选择提示词预设');
    captureEdit();
    captureSampling($('#prompt-sampling'), draft);
    draft.name = $('#prompt-name').value.trim() || '未命名预设';
    for (const row of document.querySelectorAll('[data-prompt-entry]')) {
      draft.prompt_order[0].order.find(
        (item) => item.identifier === row.dataset.promptEntry,
      ).enabled = row.querySelector('[data-prompt-enabled]').checked;
    }
    return normalizePromptPreset(draft, draft.id).preset;
  }
  async function load(id) {
    if (!id) {
      draft = null;
      renderDraft();
      return;
    }
    const result = await api(`prompts/${id}`);
    draft = result.preset;
    warnings = result.warnings;
    renderDraft();
  }
  async function open() {
    setTab('prompts');
    const selected = getProfiles()[kind()].promptPresetId;
    await load(
      promptPresets.some((entry) => entry.id === selected)
        ? selected
        : promptPresets.find((entry) => !entry.invalid)?.id,
    );
    $('#ai-result-title').textContent = '最终发送消息预览';
    $('#ai-preview').textContent =
      '点击“预览最终请求”。这里只展示messages，不调用模型，也不显示密钥。';
  }
  async function select(id) {
    setProfiles(await api('prompts/select', { kind: kind(), id }));
    syncProfile();
    window.dispatchEvent(new CustomEvent('preset-selected', { detail: { kind: kind() } }));
    status('提示词预设已应用到当前接口；另一接口可独立选择同一份预设。');
  }
  async function preview(useDraft = true) {
    const result = await api('prompts/preview', {
      kind: kind(),
      input: inputFor(kind()),
      ...(useDraft ? { preset: capture() } : {}),
    });
    $('#ai-dialog').dataset.preview = 'true';
    $('#ai-result-title').textContent = '最终发送消息预览 · 未调用模型';
    $('#ai-lore-editor').hidden = true;
    $('#ai-preview').hidden = false;
    $('#ai-token-summary').textContent = tokenSummary(result.tokens);
    $('#ai-preview').textContent = formatRequestPreview(result);
    status(
      `共${result.messages.length}条消息，输入约${result.tokens.inputEstimate} TK；输出格式由世界书 @D 条目注入，这次没有调用API模型。`,
    );
  }
  async function save(copy = false) {
    const preset = capture();
    if (copy) preset.name = preset.name + ' · 副本';
    const result = await api('prompts/save', { ...(copy ? {} : { id: draft.id }), preset });
    draft = result.preset;
    warnings = result.warnings;
    await refresh();
    await select(draft.id);
    renderDraft();
    status('分层提示词已保存，下一次门口生成立即使用。');
  }
  async function connection(action, isNew = false) {
    const selected = $('#api-preset-select').value;
    const name = $('#api-preset-name').value;
    if (action !== 'save' && !selected) throw Error('请先选择API预设');
    if (action === 'save' && !isNew && !selected)
      throw Error('更新前请先选择已有API预设，或保存为新预设');
    const result = await api('presets', {
      action,
      kind: $('#ai-kind').value,
      ...(action === 'save' ? { profile: captureProfile() } : {}),
      ...(isNew ? {} : { id: selected }),
      name,
    });
    apiPresets = result.presets;
    setProfiles(result.profiles);
    fillProfile();
    syncProfile();
    status(
      action === 'apply'
        ? '连接预设已应用，角色和剧本都可以从同一列表选用。'
        : action === 'delete'
          ? '连接预设已删除，当前接口配置保留。'
          : '连接预设已保存，包含URL、模型和API Key；可在角色与剧本接口中选用。',
    );
  }
  events.on(
    $('#api-preset-save'),
    'click',
    guard(() =>
      connection(
        'save',
        !apiPresets.some(
          (entry) =>
            entry.id === $('#api-preset-select').value &&
            entry.name === $('#api-preset-name').value.trim(),
        ),
      ),
    ),
  );
  events.on(
    $('#api-preset-delete'),
    'click',
    guard(() => connection('delete')),
  );
  events.on(
    $('#api-preset-select'),
    'change',
    guard(async () => {
      if ($('#api-preset-select').value) await connection('apply');
    }),
  );
  events.on(document.querySelector('[data-ai-tab="prompts"]'), 'click', guard(open));
  events.on(
    $('#prompt-kind'),
    'change',
    guard(async () => {
      await open();
    }),
  );
  events.on(
    $('#prompt-select'),
    'change',
    guard(async () => {
      const id = $('#prompt-select').value;
      await load(id);
      if (id) await select(id);
    }),
  );
  events.on(
    $('#prompt-use'),
    'click',
    guard(() => select(draft.id)),
  );
  events.on(
    $('#prompt-save'),
    'click',
    guard(() => save()),
  );
  events.on(
    $('#prompt-copy'),
    'click',
    guard(() => save(true)),
  );
  events.on(
    $('#prompt-delete'),
    'click',
    guard(async () => {
      await api('prompts/delete', { id: draft.id });
      setProfiles(await api('config'));
      await refresh();
      await open();
    }),
  );
  events.on(
    $('#prompt-add'),
    'click',
    guard(() => {
      draft = capture();
      const identifier = `message-${crypto.randomUUID()}`;
      draft.prompts.push({
        identifier,
        name: '自定义消息',
        role: 'system',
        content: '',
        marker: false,
        system_prompt: true,
        injection_position: 0,
        injection_depth: 0,
        injection_order: 100,
      });
      draft.prompt_order[0].order.push({ identifier, enabled: true });
      renderDraft();
      editEntry(identifier);
      $('#prompt-messages').lastElementChild.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }),
  );
  events.on(
    $('#prompt-messages'),
    'click',
    guard((event) => {
      const button = event.target.closest(
        '[data-prompt-move],[data-prompt-remove],[data-prompt-edit]',
      );
      if (!button) return;
      draft = capture();
      const id = button.closest('[data-prompt-entry]').dataset.promptEntry;
      const order = draft.prompt_order[0].order;
      const index = order.findIndex((entry) => entry.identifier === id);
      if (button.hasAttribute('data-prompt-edit')) {
        editEntry(id);
        return;
      }
      if (button.hasAttribute('data-prompt-remove')) {
        if (order.length === 1) throw Error('至少保留一条提示词消息');
        order.splice(index, 1);
        draft.prompts = draft.prompts.filter((entry) => entry.identifier !== id);
      } else {
        const next = index + Number(button.dataset.promptMove);
        if (next >= 0 && next < order.length)
          [order[index], order[next]] = [order[next], order[index]];
      }
      renderDraft();
    }),
  );
  const closeEntry = () => {
    captureEdit();
    editing = null;
    $('#prompt-entry-dialog').close();
    renderDraft();
  };
  events.on($('#prompt-entry-save'), 'click', closeEntry);
  events.on($('#prompt-entry-dialog'), 'cancel', (event) => {
    event.preventDefault();
    closeEntry();
  });
  events.on($('#prompt-messages'), 'dragstart', (event) => {
    const row = event.target.closest('[data-prompt-entry]');
    if (row) event.dataTransfer.setData('text/plain', row.dataset.promptEntry);
  });
  events.on($('#prompt-messages'), 'dragover', (event) => event.preventDefault());
  events.on(
    $('#prompt-messages'),
    'drop',
    guard((event) => {
      event.preventDefault();
      const source = event.dataTransfer.getData('text/plain');
      const target = event.target.closest('[data-prompt-entry]')?.dataset.promptEntry;
      if (!source || !target || source === target) return;
      draft = capture();
      const order = draft.prompt_order[0].order;
      const from = order.findIndex((item) => item.identifier === source);
      if (from < 0) return;
      const [item] = order.splice(from, 1);
      order.splice(
        order.findIndex((entry) => entry.identifier === target),
        0,
        item,
      );
      renderDraft();
    }),
  );
  events.on(
    $('#prompt-preview'),
    'click',
    guard(() => preview()),
  );
  events.on(
    $('#ai-preview-request'),
    'click',
    guard(() => preview(false)),
  );
  events.on($('#prompt-import'), 'click', () => $('#prompt-import-file').click());
  events.on(
    $('#prompt-import-file'),
    'change',
    guard(async () => {
      const file = $('#prompt-import-file').files[0];
      if (!file) return;
      if (file.size > 8000000) throw Error('预设文件不能超过8MB');
      const raw = JSON.parse(await file.text());
      if (!raw.name) raw.name = file.name.replace(/\.json$/i, '');
      const result = await api('prompts/save', { preset: raw });
      draft = result.preset;
      warnings = result.warnings;
      await refresh();
      renderDraft();
      await select(draft.id);
      $('#prompt-import-file').value = '';
      status('预设已导入共享库，所有 API 均可选择；各接口独立选择使用哪一份。');
    }),
  );
  events.on(
    $('#prompt-export'),
    'click',
    guard(() => {
      const preset = capture();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = preset.name + '.json';
      link.click();
      URL.revokeObjectURL(url);
    }),
  );
  return { refresh, syncProfile };
}
