import { pendingMemories, applyMemorySummaries } from '../memory.js';
import { query as $ } from './dom.js';

/** Manual generation stages editable summaries; only explicit acceptance changes saved context. */
export function createMemory(context) {
  const chatApi = context.apiClient.request;
  const { session, events } = context;
  const dialog = $('#memory-dialog');
  let page = 0,
    snapshot = [],
    results = new Map(),
    owner = null,
    quickOwner = null,
    request = null;
  const status = (text) => {
    $('#memory-status').textContent = text;
  };
  function busy(value) {
    $('#memory-generate').disabled = value || !snapshot.length || results.size === snapshot.length;
    $('#memory-accept').disabled = value || !snapshot.length || results.size !== snapshot.length;
    $('#memory-cancel').hidden = !value;
    $('#memory-prev').disabled = value || page === 0;
    $('#memory-next').disabled = value || (page + 1) * 30 >= snapshot.length;
    $('#memory-items')
      .querySelectorAll('textarea')
      .forEach((area) => {
        area.disabled = value;
      });
  }
  function render() {
    $('#memory-count').textContent = snapshot.length
      ? `${snapshot.length}项待总结 · 每轮对话合并玩家发言与 AI 回应`
      : '暂无待总结的完整对话或副本记录';
    $('#memory-page').textContent = snapshot.length
      ? `${page + 1} / ${Math.ceil(snapshot.length / 30)}`
      : '0 / 0';
    $('#memory-items').replaceChildren(
      ...snapshot.slice(page * 30, (page + 1) * 30).map((item) => {
        const article = document.createElement('article');
        const title = document.createElement('h3');
        title.textContent = item.label;
        const details = document.createElement('details');
        const heading = document.createElement('summary');
        heading.textContent = '查看原文';
        const original = document.createElement('p');
        original.textContent = item.text;
        details.append(heading, original);
        const label = document.createElement('label');
        label.textContent = '摘要';
        const area = document.createElement('textarea');
        area.dataset.memoryId = item.id;
        area.setAttribute('aria-label', `${item.label}摘要`);
        area.maxLength = 12000;
        area.rows = 3;
        area.placeholder = '生成后可检查并修改，确认使用才会保存';
        area.value = results.get(item.id) || '';
        label.append(area);
        article.append(title, details, label);
        return article;
      }),
    );
    busy(false);
  }
  function reset() {
    request?.abort();
    request = null;
    snapshot = [];
    page = 0;
    results = new Map();
    owner = null;
    quickOwner = null;
    if (dialog.open) dialog.close();
  }
  function unchanged() {
    if (
      session.runtime.disposed ||
      session.ai.library !== owner ||
      (snapshot.some((item) => item.kind === 'quick') && session.ai.chat.quick !== quickOwner)
    )
      throw Error('存档或本趟闲聊已切换，请重新打开总结界面');
  }
  function open() {
    if (request) return;
    owner = session.ai.library;
    quickOwner = session.ai.chat.quick;
    snapshot = pendingMemories(owner, quickOwner);
    page = 0;
    results = new Map();
    status('只发送总结提示词与待总结原文；不加载预设、世界书或额外角色设定。');
    render();
    if (!dialog.open) dialog.showModal();
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
        for (const item of reply.items) results.set(item.id, item.summary);
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
      const rollback = applyMemorySummaries(
        owner,
        quickOwner,
        snapshot,
        [...results].map(([id, summary]) => ({ id, summary })),
      );
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
  for (const id of ['memory-open', 'chat-memory-open']) events.on($('#' + id), 'click', open);
  events.on($('#memory-close'), 'click', () => dialog.close());
  events.on(dialog, 'close', () => request?.abort());
  events.on($('#memory-cancel'), 'click', () => request?.abort());
  events.on($('#memory-generate'), 'click', () => void generate());
  events.on($('#memory-accept'), 'click', accept);
  for (const [id, direction] of [
    ['memory-prev', -1],
    ['memory-next', 1],
  ]) {
    events.on($('#' + id), 'click', () => {
      page = Math.max(0, Math.min(Math.ceil(snapshot.length / 30) - 1, page + direction));
      render();
      $('#memory-items').scrollTop = 0;
    });
  }
  events.on($('#memory-items'), 'input', (event) => {
    const id = event.target.dataset.memoryId;
    if (!id) return;
    if (event.target.value.trim()) results.set(id, event.target.value);
    else results.delete(id);
    busy(false);
  });
  return { open, reset, dispose: reset };
}
