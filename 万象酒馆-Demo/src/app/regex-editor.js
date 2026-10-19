import { normalizeRegexScripts, presetRegexScripts } from '../ai/regex.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';

/** Plain text regex editor/debugger; imported replacement HTML is shown as text. */
export function createRegexEditor({ events, api }) {
  let scripts = [],
    selected = -1,
    preset = null;
  const status = (text) => {
    $('#regex-status').textContent = text;
  };
  const guard =
    (action) =>
    async (...args) => {
      try {
        await action(...args);
      } catch (failure) {
        status(failure.message);
      }
    };
  function capture() {
    const item = scripts[selected];
    if (!item) return;
    for (const field of document.querySelectorAll('[data-regex-field]')) {
      const key = field.dataset.regexField;
      item[key] =
        field.type === 'checkbox'
          ? field.checked
          : ['minDepth', 'maxDepth'].includes(key)
            ? field.value === ''
              ? null
              : Number(field.value)
            : key === 'substituteRegex'
              ? Number(field.value)
              : field.value;
    }
    item.placement = [...document.querySelectorAll('[data-regex-placement]:checked')].map((field) =>
      Number(field.value),
    );
    item.trimStrings = $('#regex-trim').value.split('\n').filter(Boolean);
    item.apiTargets = JSON.parse($('#regex-targets').value);
  }
  function render() {
    $('#regex-list').innerHTML = scripts
      .map(
        (script, index) =>
          html`<button data-regex-index="${index}" aria-pressed="${selected === index}">
            <span>☰ ${script.disabled ? '○' : '●'}</span>${escapeText(script.scriptName)}
          </button>`,
      )
      .join('');
    const item = scripts[selected];
    $('#regex-fields').innerHTML = item
      ? html` <label
            >脚本名称<input data-regex-field="scriptName" value="${escapeText(item.scriptName)}"
          /></label>
          <label
            >查找正则<textarea data-regex-field="findRegex" rows="2">
${escapeText(item.findRegex)}</textarea>
          </label>
          <label
            >替换为<textarea data-regex-field="replaceString" rows="3">
${escapeText(item.replaceString)}</textarea>
          </label>
          <label
            >修剪捕获内容（每行一项）<textarea id="regex-trim" rows="2">
${escapeText(item.trimStrings.join('\n'))}</textarea>
          </label>
          <div class="regex-options">
            ${[
              [1, '用户输入'],
              [2, 'AI输出'],
              [5, '世界书'],
              [6, '思考内容（当前无独立思考块）'],
              [3, '斜杠命令（当前不执行）'],
            ]
              .map(
                ([value, label]) =>
                  html`<label
                    ><input
                      type="checkbox"
                      data-regex-placement
                      value="${escapeText(String(value))}"
                      ${item.placement.includes(value) ? 'checked' : ''}
                    />${label}</label
                  >`,
              )
              .join('')}
          </div>
          <div class="regex-options">
            ${[
              ['disabled', '禁用'],
              ['markdownOnly', '仅格式化显示'],
              ['promptOnly', '仅格式化提示词'],
              ['runOnEdit', '编辑时运行'],
            ]
              .map(
                ([key, label]) =>
                  html`<label
                    ><input
                      type="checkbox"
                      data-regex-field="${key}"
                      ${item[key] ? 'checked' : ''}
                    />${label}</label
                  >`,
              )
              .join('')}
          </div>
          <div class="prompt-injection">
            <label
              >最小深度<input
                data-regex-field="minDepth"
                type="number"
                min="-1"
                value="${item.minDepth ?? ''}" /></label
            ><label
              >最大深度<input
                data-regex-field="maxDepth"
                type="number"
                min="-1"
                value="${item.maxDepth ?? ''}"
            /></label>
            <label
              >替换查找宏<select data-regex-field="substituteRegex">
                ${['不替换', '原文替换', '转义后替换'].map((label, index) => html`<option value="${index}" ${Number(item.substituteRegex) === index ? 'selected' : ''}>${label}</option>`).join('')}
              </select></label
            >
            <label
              >发送对象<select id="regex-targets">
                ${[
                  ['["character","script"]', '生成与聊天'],
                  ['["chat"]', '酒馆交流'],
                  ['["quick-chat"]', '快速闲聊'],
                  ['["chat","quick-chat"]', '两种聊天'],
                  ['["character"]', '角色API'],
                  ['["script"]', '剧本API'],
                  ['[]', '都不发'],
                ]
                  .map(
                    ([value, label]) =>
                      html`<option
                        value="${escapeText(String(value))}"
                        ${JSON.stringify(item.apiTargets) === value ? 'selected' : ''}
                      >
                        ${label}
                      </option>`,
                  )
                  .join('')}
              </select></label
            >
          </div>`
      : '<p>导入酒馆正则 JSON，或新建一条。</p>';
  }
  events.on(
    $('#ai-regex'),
    'click',
    guard(async () => {
      const available = await api('prompts');
      $('#regex-scope').replaceChildren(
        new Option('全局正则', ''),
        ...available.presets.map((item) => new Option(`预设：${item.name}`, item.id)),
      );
      $('#regex-scope').value = '';
      preset = null;
      scripts = (await api('regex')).scripts;
      selected = scripts.length ? 0 : -1;
      render();
      $('#regex-dialog').showModal();
    }),
  );
  events.on(
    $('#regex-scope'),
    'change',
    guard(async () => {
      const id = $('#regex-scope').value;
      preset = id ? (await api(`prompts/${id}`)).preset : null;
      scripts = preset ? presetRegexScripts(preset) : (await api('regex')).scripts;
      selected = scripts.length ? 0 : -1;
      render();
      status(preset ? '正在编辑此预设内嵌的正则。保存后随该预设使用。' : '正在编辑全局正则。');
    }),
  );
  events.on(
    $('#regex-list'),
    'click',
    guard((event) => {
      const button = event.target.closest('[data-regex-index]');
      if (!button) return;
      capture();
      selected = Number(button.dataset.regexIndex);
      render();
    }),
  );
  events.on(
    $('#regex-add'),
    'click',
    guard(() => {
      capture();
      scripts.push(...normalizeRegexScripts({ scriptName: '新正则', findRegex: '/待替换内容/g' }));
      scripts.at(-1).id = crypto.randomUUID();
      selected = scripts.length - 1;
      render();
    }),
  );
  events.on($('#regex-delete'), 'click', () => {
    scripts.splice(selected, 1);
    selected = scripts.length ? Math.min(selected, scripts.length - 1) : -1;
    render();
  });
  for (const [id, offset] of [
    ['regex-up', -1],
    ['regex-down', 1],
  ])
    events.on(
      $('#' + id),
      'click',
      guard(() => {
        capture();
        const next = selected + offset;
        if (next < 0 || next >= scripts.length) return;
        [scripts[next], scripts[selected]] = [scripts[selected], scripts[next]];
        selected = next;
        render();
      }),
    );
  events.on(
    $('#regex-save'),
    'click',
    guard(async () => {
      capture();
      scripts = normalizeRegexScripts(scripts);
      if (preset) {
        preset.extensions = { ...preset.extensions, regex_scripts: scripts };
        await api('prompts/save', { id: preset.id, preset });
      } else scripts = (await api('regex', { scripts })).scripts;
      status('正则已保存；下一次预览与生成生效。预设内嵌正则随对应预设使用。');
      render();
    }),
  );
  events.on($('#regex-close'), 'click', () => $('#regex-dialog').close());
  events.on($('#regex-import'), 'click', () => $('#regex-import-file').click());
  events.on(
    $('#regex-import-file'),
    'change',
    guard(async () => {
      const file = $('#regex-import-file').files[0];
      if (!file) return;
      if (file.size > 1000000) throw Error('正则文件最多1MB');
      capture();
      const raw = JSON.parse(await file.text());
      scripts.push(...(raw.prompts ? presetRegexScripts(raw) : normalizeRegexScripts(raw)));
      scripts = normalizeRegexScripts(scripts);
      selected = scripts.length - 1;
      render();
      $('#regex-import-file').value = '';
      status('已导入，请保存。顺序为全局正则在前、当前预设内嵌正则在后。');
    }),
  );
  events.on(
    $('#regex-export'),
    'click',
    guard(() => {
      capture();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ scripts: normalizeRegexScripts(scripts) }, null, 2)], {
          type: 'application/json',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = '酒馆正则.json';
      link.click();
      URL.revokeObjectURL(url);
    }),
  );
  events.on(
    $('#regex-test'),
    'click',
    guard(async () => {
      capture();
      const result = await api('regex-test', {
        scripts: normalizeRegexScripts(scripts),
        text: $('#regex-test-input').value,
        placement: Number($('#regex-test-placement').value),
        options: {
          kind: $('#regex-test-kind').value,
          isPrompt: $('#regex-test-prompt').checked,
          isMarkdown: $('#regex-test-markdown').checked,
        },
      });
      $('#regex-test-output').textContent = result.text;
      status(`测试完成，${result.changes.length}条正则改变了文本；未调用模型。`);
    }),
  );
}
