import { normalizeWorldbook, newWorldEntry, characterWorldEntry } from '../ai/worldbook.js';
import { parseWorldKeywords } from './worldbook-fields.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';
import { formatRequestPreview, tokenSummary } from './request-preview.js';

/** One inline ST-style editor; entries keep all imported fields outside the visible subset. */
export function createWorldbookEditor({ session, events, api, inputFor, onSaved }) {
  const state = session.ai.worldEditor;
  let tokenTimer = null,
    tokenRevision = 0;
  const notice = (text) => {
    $('#world-status').textContent = text;
  };
  const guard =
    (action) =>
    async (...args) => {
      try {
        await action(...args);
      } catch (failure) {
        notice(failure.message);
      }
    };
  const positions = [
    ['0', '角色定义前（↑ Char）'],
    ['1', '角色定义后（↓ Char）'],
    ['4:0', '[系统⚙] 插入深度 @D'],
    ['4:1', '[用户] 插入深度 @D'],
    ['4:2', '[AI] 插入深度 @D'],
    ['2', '作者注释前'],
    ['3', '作者注释后'],
    ['5', '示例消息前'],
    ['6', '示例消息后'],
    ['7', 'Outlet'],
  ];
  const options = (items, value) =>
    items
      .map(
        ([id, label]) =>
          html`<option value="${id}" ${String(value) === id ? 'selected' : ''}>${label}</option>`,
      )
      .join('');
  function capture() {
    if (!state.draft) return;
    state.draft.name = $('#world-name').value.trim() || '万象酒馆世界书';
    for (const control of document.querySelectorAll('[data-world-head]')) {
      const entry = state.draft.entries[control.closest('[data-world-row]').dataset.worldRow];
      const key = control.dataset.worldHead;
      if (key === 'enabled') entry.disable = !control.checked;
      else if (key === 'comment') entry.comment = control.value;
      else if (key === 'position') {
        const [position, role] = control.value.split(':').map(Number);
        entry.position = position;
        if (position === 4) entry.role = role;
      } else if (key !== 'strategy') entry[key] = Number(control.value);
    }
    const entry = state.draft.entries[state.uid];
    if (!entry || !$('#world-entry-fields [data-world-field="content"]')) return;
    for (const control of document.querySelectorAll('#world-entry-fields [data-world-field]')) {
      const key = control.dataset.worldField;
      if (control.type === 'checkbox') entry[key] = control.checked;
      else if (key === 'content') entry.content = control.value;
      else if (['key', 'keysecondary'].includes(key))
        entry[key] = parseWorldKeywords(control.value);
      else if (['caseSensitive', 'matchWholeWords'].includes(key))
        entry[key] = control.value === '' ? null : control.value === 'true';
      else entry[key] = control.value === '' && key === 'scanDepth' ? null : Number(control.value);
    }
    const delayed = $('#world-delay-recursion').checked;
    entry.delayUntilRecursion = delayed ? entry.delayUntilRecursion || 1 : 0;
    entry.apiTargets = [...document.querySelectorAll('[data-world-target]:checked')].map(
      (input) => input.dataset.worldTarget,
    );
  }
  async function flush() {
    clearTimeout(state.saveTimer);
    if (state.savePromise) await state.savePromise;
    if (!state.dirty || !state.draft) return;
    capture();
    const revision = state.revision;
    const book = normalizeWorldbook(state.draft).book;
    state.savePromise = api('worldbooks/save', { id: state.id, book });
    try {
      await state.savePromise;
      if (session.runtime.disposed) return;
      if (revision === state.revision) state.dirty = false;
      onSaved?.(book);
      notice('已保存');
    } finally {
      state.savePromise = null;
    }
  }
  function dirty() {
    state.dirty = true;
    state.revision++;
    clearTimeout(state.saveTimer);
    notice('正在保存…');
    state.saveTimer = setTimeout(() => {
      if (!session.runtime.disposed) void guard(flush)();
    }, 650);
  }
  function countContent() {
    clearTimeout(tokenTimer);
    const revision = ++tokenRevision;
    tokenTimer = setTimeout(() => {
      void guard(async () => {
        const entry = state.draft?.entries[state.uid];
        if (!entry) return;
        const text = $('#world-entry-fields [data-world-field="content"]').value;
        const { counts } = await api('tokens', { texts: [text] });
        if (revision === tokenRevision && !session.runtime.disposed && $('#world-entry-tokens'))
          $('#world-entry-tokens').textContent = `(Token: ${counts[0]}) (UID: ${entry.uid})`;
      })();
    }, 300);
  }
  const check = (entry, key, label) =>
    html`<label class="world-check"
      ><input
        type="checkbox"
        data-world-field="${key}"
        ${entry[key] ? 'checked' : ''}
      />${label}</label
    >`;
  function renderEditor() {
    const entry = state.draft.entries[state.uid];
    if (!entry) {
      $('#world-entry-fields').replaceChildren();
      return;
    }
    const tri = (key, label) =>
      html`<label
        >${label}<select data-world-field="${key}">
          ${options(
            [
              ['', '使用全局'],
              ['true', '是'],
              ['false', '否'],
            ],
            entry[key] ?? '',
          )}
        </select></label
      >`;
    $('#world-entry-fields').innerHTML = html` <div class="world-key-fields">
        <label
          >主要关键字<textarea data-world-field="key" rows="2" placeholder="逗号分隔列表">
${escapeText(entry.key.join(', '))}</textarea></label
        ><label
          >逻辑<select data-world-field="selectiveLogic">
            ${options(
              [
                ['0', '与任意'],
                ['1', '非全部'],
                ['2', '非任意'],
                ['3', '与全部'],
              ],
              entry.selectiveLogic,
            )}
          </select></label
        ><label
          >可选过滤器<textarea
            data-world-field="keysecondary"
            rows="2"
            placeholder="逗号分隔列表（如果为空则忽略）"
          >
${escapeText(entry.keysecondary.join(', '))}</textarea>
        </label>
      </div>
      <div class="world-scan-fields">
        <label
          >扫描深度<input
            type="number"
            min="0"
            data-world-field="scanDepth"
            value="${entry.scanDepth ?? ''}"
            placeholder="使用全局设置" /></label
        >${tri('caseSensitive', '区分大小写')}${tri('matchWholeWords', '完整单词')}
      </div>
      <div class="world-targets">
        <span>发送给</span
        >${['character', 'script', 'chat', 'quick-chat', 'map', 'creation'].map((kind) => html`<label class="world-check"><input type="checkbox" data-world-target="${kind}" ${entry.apiTargets.includes(kind) ? 'checked' : ''} />${{ character: '角色 API', script: '剧本 API', chat: '酒馆交流 API', 'quick-chat': '快速闲聊 API', map: '地图 API', creation: '以太 API' }[kind]}</label>`).join('')}<small
          >仍需满足本条的触发条件；都不勾选则不发送。</small
        >
      </div>
      <div class="world-content-heading">
        <div>
          <span>内容</span><small id="world-entry-tokens">(Token: …) (UID: ${entry.uid})</small>
        </div>
        <div class="world-recursion-fields">
          ${check(entry, 'excludeRecursion', '不可递归（不会被其他条目激活）')}<label
            class="world-check"
            ><input
              type="checkbox"
              id="world-delay-recursion"
              ${entry.delayUntilRecursion ? 'checked' : ''}
            />延迟到递归</label
          >${check(entry, 'preventRecursion', '防止进一步递归')}${check(entry, 'ignoreBudget', '无视回复限额')}
        </div>
      </div>
      <textarea
        class="world-content"
        data-world-field="content"
        rows="11"
        aria-label="内容"
        spellcheck="false"
      >
${escapeText(entry.content)}</textarea>`;
    countContent();
  }
  function renderList() {
    const editor = $('.world-editor');
    $('#world-editor-parking').append(editor);
    const search = $('#world-search').value.trim().toLowerCase();
    const sort = $('#world-sort').value;
    const entries = Object.values(state.draft.entries).filter((entry) =>
      `${entry.comment} ${entry.key.join(' ')} ${entry.content}`.toLowerCase().includes(search),
    );
    entries.sort((a, b) =>
      sort === 'name'
        ? a.comment.localeCompare(b.comment)
        : sort === 'order'
          ? b.order - a.order
          : (a.displayIndex ?? a.uid) - (b.displayIndex ?? b.uid),
    );
    $('#world-count').textContent = `${entries.length} 条`;
    $('#world-entry-list').innerHTML =
      entries
        .map(
          (entry) =>
            html`<article
              class="world-entry-row ${entry.disable ? 'is-disabled' : ''}"
              data-world-row="${entry.uid}"
            >
              <div class="world-row-grid world-entry-bar">
                <button
                  data-world-uid="${entry.uid}"
                  class="world-expand"
                  aria-label="展开条目 ${entry.uid}"
                  aria-expanded="${!state.collapsed && String(state.uid) === String(entry.uid)}"
                >
                  <svg
                    class="world-expand-icon"
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 6.5 L8 10.5 L12 6.5" />
                  </svg>
                </button>
                <label class="world-switch" title="开关"
                  ><input
                    type="checkbox"
                    data-world-head="enabled"
                    aria-label="启用条目 ${entry.uid}"
                    ${entry.disable ? '' : 'checked'} /><span></span
                ></label>
                <input
                  data-world-head="comment"
                  aria-label="标题 ${entry.uid}"
                  value="${escapeText(entry.comment)}"
                  placeholder="标题（备注）"
                />
                <select
                  class="world-strategy"
                  data-world-head="strategy"
                  aria-label="触发策略 ${entry.uid}"
                  title="蓝灯：常驻；绿灯：关键词触发"
                >
                  ${options(
                    [
                      ['constant', '🔵'],
                      ['keyword', '🟢'],
                    ],
                    entry.constant ? 'constant' : 'keyword',
                  )}
                </select>
                <select data-world-head="position" aria-label="插入位置 ${entry.uid}">
                  ${options(positions, entry.position === 4 ? `4:${entry.role}` : entry.position)}
                </select>
                <input
                  type="number"
                  min="0"
                  data-world-head="depth"
                  aria-label="深度 ${entry.uid}"
                  value="${entry.depth}"
                  ${entry.position === 4 ? '' : 'disabled'}
                />
                <input
                  type="number"
                  min="0"
                  data-world-head="order"
                  aria-label="顺序 ${entry.uid}"
                  value="${entry.order}"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  data-world-head="probability"
                  aria-label="触发概率 ${entry.uid}"
                  value="${entry.probability}"
                />
                <button
                  data-world-copy="${entry.uid}"
                  title="复制条目"
                  aria-label="复制条目 ${entry.uid}"
                >
                  ⧉</button
                ><button
                  data-world-delete="${entry.uid}"
                  title="删除条目"
                  aria-label="删除条目 ${entry.uid}"
                >
                  ⌫
                </button>
              </div>
              <div data-world-expanded="${entry.uid}"></div>
            </article>`,
        )
        .join('') || '<p class="world-empty">没有匹配条目</p>';
    const slot = !state.collapsed && document.querySelector(`[data-world-expanded="${state.uid}"]`);
    (slot || $('#world-editor-parking')).append(editor);
  }
  function render() {
    $('#world-name').value = state.draft.name;
    renderEditor();
    renderList();
  }
  async function open() {
    const result = await api('worldbooks');
    state.settings = result.settings;
    state.books = result.books;
    state.id = result.books[0]?.id || 'tavern-world';
    const { book } = await api(`worldbooks/${state.id}`);
    state.draft = book;
    state.uid = null;
    state.collapsed = true;
    state.dirty = false;
    $('#world-preview-area').hidden = true;
    $('#world-edit-view').hidden = true;
    $('#world-dialog').classList.remove('show-preview');
    if (session.ai.library?.characters && state.id === 'tavern-world') {
      let uid = Math.max(-1, ...Object.keys(state.draft.entries).map(Number)) + 1;
      let added = false;
      for (const char of session.ai.library.characters) {
        const name = char.setting?.name;
        if (!name) continue;
        const comment = `人物详情：${name}`;
        const existing = Object.values(state.draft.entries).find(
          (entry) =>
            entry.comment === comment || entry.extensions?.wanxiang?.characterId === char.id,
        );
        if (!existing) {
          state.draft.entries[uid] = characterWorldEntry(char, uid);
          uid++;
          added = true;
        }
      }
      if (added) dirty();
    }
    render();
    notice('蓝灯常驻，绿灯按关键词触发。格式约束可从上方两个入口直接打开。');
    $('#world-dialog').showModal();
  }
  function nextUid() {
    return Math.max(-1, ...Object.keys(state.draft.entries).map(Number)) + 1;
  }
  function selectEntry(uid) {
    capture();
    state.uid = String(uid);
    state.collapsed = false;
    renderEditor();
    renderList();
  }
  events.on($('#ai-worldbooks'), 'click', guard(open));
  const close = async () => {
    await flush();
    $('#world-dialog').close();
  };
  events.on($('#world-close'), 'click', guard(close));
  events.on($('#world-dialog'), 'cancel', (event) => {
    event.preventDefault();
    void guard(close)();
  });
  events.on(
    $('#world-save'),
    'click',
    guard(async () => {
      capture();
      state.dirty = true;
      await flush();
    }),
  );
  events.on($('#world-collapse'), 'click', () => {
    capture();
    state.collapsed = true;
    renderList();
  });
  events.on(
    $('#world-search'),
    'input',
    guard(() => {
      capture();
      renderList();
    }),
  );
  events.on(
    $('#world-sort'),
    'change',
    guard(() => {
      capture();
      renderList();
    }),
  );
  events.on(
    $('#world-add'),
    'click',
    guard(() => {
      capture();
      const uid = nextUid();
      state.draft.entries[uid] = newWorldEntry(uid);
      selectEntry(uid);
      dirty();
    }),
  );
  events.on($('#world-dialog'), 'input', (event) => {
    if (
      !event.target.matches(
        '[data-world-head],[data-world-field],[data-world-target],#world-delay-recursion,#world-name',
      )
    )
      return;
    dirty();
    if (event.target.matches('[data-world-field="content"]')) countContent();
  });
  events.on(
    $('#world-dialog'),
    'change',
    guard((event) => {
      const control = event.target;
      if (control.matches('[data-world-head]')) {
        const uid = control.closest('[data-world-row]').dataset.worldRow;
        const entry = state.draft.entries[uid];
        if (control.dataset.worldHead === 'strategy') {
          entry.constant = control.value === 'constant';
          entry.vectorized = false;
        }
        if (control.dataset.worldHead === 'probability') entry.useProbability = true;
        capture();
        const row = control.closest('[data-world-row]');
        row.classList.toggle('is-disabled', entry.disable);
        row.querySelector('[data-world-head="depth"]').disabled = entry.position !== 4;
        dirty();
      } else if (control.matches('[data-world-field],[data-world-target],#world-delay-recursion')) {
        if (control.dataset.worldField === 'keysecondary')
          state.draft.entries[state.uid].selective = true;
        capture();
        dirty();
      }
    }),
  );
  events.on(
    $('#world-dialog'),
    'click',
    guard((event) => {
      const format = event.target.closest('[data-world-format]');
      if (format) {
        const entry = Object.values(state.draft.entries).find(
          (entry) =>
            entry.extensions?.wanxiang?.generationRule === `${format.dataset.worldFormat}-output`,
        );
        if (!entry) throw Error('未找到格式条目，请检查世界书是否已导入游戏格式要求。');
        $('#world-search').value = '';
        selectEntry(entry.uid);
        document
          .querySelector(`[data-world-row="${entry.uid}"]`)
          .scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const expand = event.target.closest('[data-world-uid]');
      if (expand) {
        const uid = expand.dataset.worldUid;
        if (String(state.uid) === uid && !state.collapsed) {
          capture();
          state.collapsed = true;
          renderList();
        } else selectEntry(uid);
        return;
      }
      const copy = event.target.closest('[data-world-copy]');
      if (copy) {
        capture();
        const uid = nextUid();
        state.draft.entries[uid] = {
          ...structuredClone(state.draft.entries[copy.dataset.worldCopy]),
          uid,
          displayIndex: uid,
        };
        selectEntry(uid);
        dirty();
      }
      const remove = event.target.closest('[data-world-delete]');
      if (remove) {
        capture();
        delete state.draft.entries[remove.dataset.worldDelete];
        state.uid = null;
        state.collapsed = true;
        render();
        dirty();
      }
    }),
  );
  events.on($('#world-import'), 'click', () => $('#world-import-file').click());
  events.on(
    $('#world-import-file'),
    'change',
    guard(async () => {
      await flush();
      const file = $('#world-import-file').files[0];
      if (!file) return;
      if (file.size > 1500000) throw Error('世界书文件不能超过1.5MB');
      const { book } = normalizeWorldbook(JSON.parse(await file.text()));
      const start = nextUid();
      Object.values(book.entries).forEach((entry, index) => {
        const uid = start + index;
        state.draft.entries[uid] = {
          ...entry,
          uid,
          displayIndex: uid,
          extensions: { ...entry.extensions, importedBook: book.name },
        };
      });
      selectEntry(start);
      dirty();
      await flush();
      $('#world-import-file').value = '';
    }),
  );
  events.on(
    $('#world-preview-button'),
    'click',
    guard(async () => {
      capture();
      const kind = $('#world-kind').value;
      const result = await api('prompts/preview', {
        kind,
        input: inputFor(kind),
        worldInfoOverride: { id: state.id, book: state.draft, settings: state.settings },
      });
      $('#world-token-summary').textContent = tokenSummary(result.tokens);
      $('#world-preview').textContent = formatRequestPreview(result);
      $('#world-preview-area').hidden = false;
      $('#world-edit-view').hidden = false;
      $('#world-dialog').classList.add('show-preview');
      notice('最终发送预览；没有调用模型。');
    }),
  );
  events.on($('#world-edit-view'), 'click', () => {
    $('#world-preview-area').hidden = true;
    $('#world-edit-view').hidden = true;
    $('#world-dialog').classList.remove('show-preview');
  });
  return {
    open,
    dispose() {
      clearTimeout(state.saveTimer);
      clearTimeout(tokenTimer);
      tokenRevision++;
    },
  };
}
