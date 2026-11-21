import { html } from '../shared/html.js';
import { query as $ } from './dom.js';
import { tokenSummary, formatRequestPreview } from './request-preview.js';
import { API_LABELS, CONNECTION_KINDS } from './first-run-rules.js';

/** The editor owns its draft; the platform store keeps presets and credentials on this device. */
export function createAiPresetEditor({
  events,
  api,
  status,
  getProfiles,
  setProfiles,
  captureProfile,
  fillProfile,
  inputFor,
}) {
  let apiPresets = [];
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
  }
  async function refresh() {
    const connections = await api('presets');
    apiPresets = connections.presets;
    syncProfile();
  }
  const optionFields = [...document.querySelectorAll('[data-prompt-option]')];
  async function open() {
    const { options, attribution } = await api('prompt-options');
    optionFields.forEach((field) => {
      const value = options[field.dataset.promptOption];
      if (field.type === 'checkbox') field.checked = value;
      else field.value = value;
    });
    $('#prompt-attribution').textContent = attribution;
  }
  async function preview() {
    const result = await api('prompts/preview', {
      kind: kind(),
      input: inputFor(kind()),
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
      getProfiles()?.[$('#ai-kind').value]?.rememberKey === false
        ? '连接仅本次有效：密钥未记在设备，关闭或更新后需重填。可点击“长期保存此连接”。'
        : action === 'apply'
          ? '连接预设已应用，角色和剧本都可以从同一列表选用。'
          : action === 'delete'
            ? '连接预设已删除，当前接口配置保留。'
            : '连接预设已保存，包含URL、模型和API Key；可在角色与剧本接口中选用。',
    );
  }
  $('#api-apply-targets').innerHTML = CONNECTION_KINDS.map((id) => [
    id,
    id === 'chat' ? '聊天（共用）' : API_LABELS[id],
  ])
    .map(
      ([id, name]) =>
        html`<label><input type="checkbox" value="${id}" data-apply-kind />${name}</label>`,
    )
    .join('');
  events.on(
    $('#api-preset-apply-many'),
    'click',
    guard(async () => {
      let id = $('#api-preset-select').value;
      if (!id) {
        if (!$('#api-preset-name').value.trim()) $('#api-preset-name').value = '通用连接';
        await connection('save', true);
        id = $('#api-preset-select').value;
      }
      const targets = [...document.querySelectorAll('[data-apply-kind]:checked')];
      if (!targets.length) throw Error('请勾选要应用的 API');
      for (const target of targets) {
        const result = await api('presets', { action: 'apply', kind: target.value, id });
        setProfiles(result.profiles);
      }
      fillProfile();
      status(`已将所选连接预设应用到 ${targets.length} 个 API。`);
      $('#api-preset-apply-many').textContent = `已应用到 ${targets.length} 个 API ✓`;
      $('#api-preset-apply-many').animate(
        [
          { backgroundColor: '#d5c18b', color: '#11231f' },
          { backgroundColor: '#203a31', color: '#e5dfce' },
        ],
        { duration: 800 },
      );
    }),
  );
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
    $('#prompt-options-save'),
    'click',
    guard(async () => {
      const options = Object.fromEntries(
        optionFields.map((field) => [
          field.dataset.promptOption,
          field.type === 'checkbox' ? field.checked : field.value,
        ]),
      );
      await api('prompt-options', { options });
      status('已保存小猫之神的提示词选项。');
    }),
  );
  events.on($('#prompt-preview'), 'click', guard(preview));
  return { refresh, syncProfile };
}
