import { pendingMemories, pendingAdventureMemories, applyMemorySummaries } from '../memory.js';
import { query as $ } from './dom.js';

/** Manual generation stages editable summaries inside #archive-dialog; only explicit acceptance changes saved context. */
export function createMemory(context) {
  const chatApi = context.apiClient.request;
  const { session, events } = context;
  const dialog = $('#archive-dialog');
  let page = 0,
    snapshot = [],
    results = new Map(),
    owner = null,
    quickOwner = null,
    request = null,
    activeCardId = null;
  let counts = new Map();
  let autoRequest = null;
  let noticeHost = null;
  let noticeChanged = null;

  const automatic = document.createElement('aside');
  automatic.id = 'automatic-memory';
  automatic.hidden = true;
  automatic.innerHTML =
    '<span role="status"></span><button data-summary-retry hidden>重试</button><button data-summary-hide aria-label="收起总结提示">×</button>';
  document.body.append(automatic);

  function showNotice(visible) {
    if (noticeHost && automatic.parentElement !== noticeHost) noticeHost.append(automatic);
    automatic.hidden = !visible;
    noticeChanged?.();
  }

  async function autoSummarize() {
    if (autoRequest || session.runtime.mode !== 'inn') return;
    const library = session.ai.library;
    if (pendingAdventureMemories(library).length < 3) return;
    const controller = new AbortController();
    autoRequest = controller;
    showNotice(false);
    automatic.querySelector('[data-summary-retry]').hidden = true;
    const message = (text) => {
      automatic.querySelector('span').textContent = text;
    };
    async function summarize() {
      while (library === session.ai.library && !session.runtime.disposed) {
        controller.signal.throwIfAborted();
        const chunk = pendingAdventureMemories(library).slice(0, 3);
        if (chunk.length < 3) break;
        showNotice(false);
        const plan = await chatApi('summary/plan', { items: chunk }, { signal: controller.signal });
        const byId = new Map(chunk.map((item) => [item.id, item]));
        const items = [];
        for (const batch of plan.batches) {
          const response = await chatApi(
            'generate/summary',
            {
              items: batch.ids.map((id) => byId.get(id)),
            },
            { signal: controller.signal, background: true },
          );
          controller.signal.throwIfAborted();
          items.push(...response.items);
        }
        if (library !== session.ai.library || session.runtime.disposed) return;
        const rollback = applyMemorySummaries(library, [], chunk, items);
        try {
          if (!context.generation.save()) throw Error('本地保存失败，原记录保留');
          await context.storage.flush?.();
        } catch (failure) {
          rollback();
          throw failure;
        }
        message('三段经历的总结已保存');
        showNotice(true);
      }
    }
    try {
      if (context.mapExpansion) await context.mapExpansion.afterMaps(summarize);
      else await summarize();
    } catch (failure) {
      if (library === session.ai.library && !session.runtime.disposed) {
        message('经历总结未完成：' + failure.message + '。原记录保留，可稍后重试。');
        automatic.querySelector('[data-summary-retry]').hidden = false;
        showNotice(true);
      }
    } finally {
      if (autoRequest === controller) autoRequest = null;
    }
  }

  events.on(automatic.querySelector('[data-summary-retry]'), 'click', () => void autoSummarize());
  events.on(automatic.querySelector('[data-summary-hide]'), 'click', () => {
    showNotice(false);
  });

  const status = (text) => {
    const el = $('#memory-status');
    if (el) el.textContent = text;
  };

  function busy(value) {
    const gen = $('#memory-generate');
    const acceptBtn = $('#memory-accept');
    const cancelBtn = $('#memory-cancel');
    const prevBtn = $('#memory-prev');
    const nextBtn = $('#memory-next');
    const itemsHost = $('#memory-items');
    if (!gen || !itemsHost) return;
    gen.disabled = value || !snapshot.length || results.size === snapshot.length;
    acceptBtn.disabled = value || !snapshot.length || results.size !== snapshot.length;
    cancelBtn.hidden = !value;
    prevBtn.disabled = value || page === 0;
    nextBtn.disabled = value || (page + 1) * 30 >= snapshot.length;
    itemsHost.querySelectorAll('textarea').forEach((area) => {
      area.disabled = value;
    });
  }

  function render() {
    const countEl = $('#memory-count');
    const pageEl = $('#memory-page');
    const itemsHost = $('#memory-items');
    const indexHost = $('#memory-index');
    if (!countEl || !itemsHost) return;

    countEl.textContent = snapshot.length
      ? `${snapshot.length} 条等待总结 · 每个副本一条，每轮聊天一条`
      : '暂无待总结的完整对话或副本记录';
    pageEl.textContent = snapshot.length
      ? `${page + 1} / ${Math.ceil(snapshot.length / 30)}`
      : '0 / 0';

    const slice = snapshot.slice(page * 30, (page + 1) * 30);
    if (!activeCardId || !slice.some((item) => item.id === activeCardId)) {
      activeCardId = slice[0]?.id || null;
    }

    const progressBar = dialog?.querySelector('.archive-codex-progress');
    if (
      progressBar &&
      dialog?.querySelector('[data-archive-tab="memory"]')?.getAttribute('aria-pressed') === 'true'
    ) {
      progressBar.hidden = false;
      progressBar.innerHTML = `<span class="archive-codex-label">记忆总结 · 待处理</span><strong class="archive-codex-count">${snapshot.length} 条</strong>`;
    }

    if (indexHost) {
      indexHost.replaceChildren(
        ...slice.map((item) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'skyrim-archive-item';
          button.dataset.memoryJump = item.id;
          button.setAttribute('aria-pressed', String(item.id === activeCardId));
          const pointer = document.createElement('span');
          pointer.className = 'skyrim-pointer';
          pointer.setAttribute('aria-hidden', 'true');
          pointer.textContent = item.id === activeCardId ? '◆' : '◇';
          const copy = document.createElement('span');
          copy.className = 'skyrim-archive-item-copy';
          const titleEl = document.createElement('strong');
          titleEl.textContent = item.label;
          const metaEl = document.createElement('small');
          const tk = counts.has(item.id) ? `${counts.get(item.id)} TK` : '统计 TK…';
          metaEl.textContent = `${tk}${results.has(item.id) ? ' · 已生成摘要' : ''}`;
          copy.append(titleEl, metaEl);
          button.append(pointer, copy);
          return button;
        }),
      );
    }

    itemsHost.replaceChildren(
      ...slice.map((item) => {
        const article = document.createElement('article');
        article.dataset.memoryArticle = item.id;
        const title = document.createElement('h3');
        title.textContent = item.label;
        const tokens = document.createElement('small');
        tokens.textContent = counts.has(item.id) ? `${counts.get(item.id)} TK` : '统计 TK…';
        const label = document.createElement('label');
        label.textContent = '摘要';
        const area = document.createElement('textarea');
        area.dataset.memoryId = item.id;
        area.setAttribute('aria-label', `${item.label}摘要`);
        area.maxLength = 12000;
        area.rows = 3;
        area.placeholder = '生成后可检查并修改，确认使用才会保存';
        area.value = results.get(item.id)?.summary || '';
        label.append(area);
        article.append(title, tokens);
        if (results.has(item.id)) article.append(label);
        return article;
      }),
    );
    busy(false);
  }

  function reset() {
    autoRequest?.abort();
    autoRequest = null;
    request?.abort();
    request = null;
    snapshot = [];
    page = 0;
    results = new Map();
    owner = null;
    quickOwner = null;
    activeCardId = null;
    context.records?.closeIfTab?.('memory');
  }

  function unchanged() {
    if (
      session.runtime.disposed ||
      session.ai.library !== owner ||
      (snapshot.some((item) => item.kind === 'quick') && session.ai.chat.quick !== quickOwner)
    )
      throw Error('存档或本趟闲聊已切换，请重新打开总结界面');
  }

  async function syncPanel() {
    if (request) {
      render();
      return;
    }
    owner = session.ai.library;
    quickOwner = session.ai.chat.quick;
    snapshot = pendingMemories(owner, quickOwner);
    page = 0;
    results = new Map();
    counts = new Map();
    activeCardId = null;
    status('点击全部总结，处理所有待总结记录。TK为原文参考分词数量。');
    render();
    const items = snapshot;
    if (!items.length) return;
    try {
      for (let offset = 0; offset < items.length; offset += 1000) {
        const batch = items.slice(offset, offset + 1000);
        const result = await chatApi('tokens', { texts: batch.map((item) => item.text) });
        if (snapshot !== items) return;
        batch.forEach((item, index) => counts.set(item.id, result.counts[index]));
      }
      if (snapshot === items) render();
    } catch (failure) {
      if (snapshot === items) status(failure.message);
    }
  }

  async function open() {
    context.records?.openTab?.('memory');
  }

  async function generate() {
    if (request || !snapshot.length) return;
    const controller = new AbortController();
    request = controller;
    busy(true);
    try {
      unchanged();
      const missing = snapshot.filter((item) => !results.has(item.id));
      const plan = await chatApi('summary/plan', { items: missing }, { signal: controller.signal });
      const byId = new Map(missing.map((item) => [item.id, item]));
      let input = 0,
        output = 0,
        sourceTokens = 0,
        summaryTokens = 0;
      for (const [index, batch] of plan.batches.entries()) {
        unchanged();
        status(
          `正在总结 ${index + 1}/${plan.batches.length} 批 · 预计输入共约 ${plan.inputEstimate} TK（${plan.tokenizer}） · 已完成 ${results.size}/${snapshot.length} 条`,
        );
        const reply = await chatApi(
          'generate/summary',
          { items: batch.ids.map((id) => byId.get(id)) },
          { signal: controller.signal },
        );
        if (request !== controller || controller.signal.aborted) return;
        unchanged();
        for (const item of reply.items) results.set(item.id, item);
        input += reply.usage?.input || 0;
        output += reply.usage?.output || 0;
        sourceTokens += reply.textTokens?.source || 0;
        summaryTokens += reply.textTokens?.summary || 0;
      }
      render();
      const usage =
        input || output ? `实际输入 ${input} / 输出 ${output} TK` : '接口未提供实际用量';
      const compression = sourceTokens
        ? ` · 本批原文 ${sourceTokens} → 摘要 ${summaryTokens} TK（参考分词）`
        : '';
      status(
        `已生成 ${results.size} 条待确认摘要 · ${usage}${compression}。请检查或修改，再点“确认使用摘要”。原文保留。`,
      );
    } catch (failure) {
      if (request === controller && !session.runtime.disposed) {
        render();
        status(
          failure.name === 'AbortError'
            ? '已取消，尚未保存。已完成的摘要可继续检查或补全。'
            : `${failure.message}。尚未保存；可检查总结API连接，或手动重试未完成条目。`,
        );
      }
    } finally {
      if (request === controller) {
        request = null;
        busy(false);
      }
    }
  }

  function accept() {
    if (request || results.size !== snapshot.length || !snapshot.length) return;
    try {
      unchanged();
      const rollback = applyMemorySummaries(owner, quickOwner, snapshot, [...results.values()]);
      if (!context.generation.save()) {
        rollback();
        throw Error('浏览器未能保存，本次摘要尚未启用。请导出记录并整理存储空间');
      }
      context.shell.toast(`已启用 ${snapshot.length} 条摘要，原始记录完整保留。`);
      reset();
    } catch (failure) {
      status(failure.message);
    }
  }

  for (const id of ['memory-open', 'chat-memory-open']) {
    const trigger = $('#' + id);
    if (trigger) events.on(trigger, 'click', open);
  }
  if (dialog) events.on(dialog, 'close', () => request?.abort());
  const cancelBtn = $('#memory-cancel');
  if (cancelBtn) events.on(cancelBtn, 'click', () => request?.abort());
  const genBtn = $('#memory-generate');
  if (genBtn) events.on(genBtn, 'click', () => void generate());
  const acceptBtn = $('#memory-accept');
  if (acceptBtn) events.on(acceptBtn, 'click', accept);
  for (const [id, direction] of [
    ['memory-prev', -1],
    ['memory-next', 1],
  ]) {
    const btn = $('#' + id);
    if (btn)
      events.on(btn, 'click', () => {
        page = Math.max(0, Math.min(Math.ceil(snapshot.length / 30) - 1, page + direction));
        render();
        const pane = $('#memory-pane');
        if (pane) pane.scrollTop = 0;
      });
  }
  const indexEl = $('#memory-index');
  if (indexEl) {
    events.on(indexEl, 'click', (event) => {
      const btn = event.target.closest('[data-memory-jump]');
      if (!btn) return;
      activeCardId = btn.dataset.memoryJump;
      for (const node of indexEl.querySelectorAll('[data-memory-jump]')) {
        const isCurrent = node.dataset.memoryJump === activeCardId;
        node.setAttribute('aria-pressed', String(isCurrent));
        const pointer = node.querySelector('.skyrim-pointer');
        if (pointer) pointer.textContent = isCurrent ? '◆' : '◇';
      }
      const target = [...document.querySelectorAll('#memory-items article')].find(
        (el) => el.dataset.memoryArticle === activeCardId,
      );
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  const itemsEl = $('#memory-items');
  if (itemsEl) {
    events.on(itemsEl, 'input', (event) => {
      const id = event.target.dataset.memoryId;
      if (!id) return;
      if (event.target.value.trim())
        results.set(id, { ...results.get(id), id, summary: event.target.value });
      else results.delete(id);
      busy(false);
    });
  }

  return {
    open,
    syncPanel,
    reset,
    autoSummarize,
    setNoticeHost(host, onChange = null) {
      noticeHost = host || null;
      noticeChanged = onChange;
      if (noticeHost && automatic.parentElement !== noticeHost) noticeHost.append(automatic);
    },
    hasNotice: () => !automatic.hidden,
    dispose() {
      reset();
      automatic.remove();
    },
  };
}
