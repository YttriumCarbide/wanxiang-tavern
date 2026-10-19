import { query as $ } from './dom.js';
import { formatRequestPreview, tokenSummary } from './request-preview.js';

/** Raw responses live only in this page session, outside saved worldbooks and AI context. */
export function createGenerationDiagnostics({ session, events, api, accept, toast }) {
  const current = () => session.ai.diagnostics[session.ai.diagnosticKind];
  function refreshButtons() {
    const kind =
      session.runtime.mode === 'battle'
        ? 'script'
        : session.runtime.mode === 'inn' && session.runtime.summonVisible
          ? 'character'
          : null;
    const button = $('#generation-review');
    button.hidden = !kind;
    button.disabled = !session.ai.diagnostics[kind];
    button.title = session.ai.diagnostics[kind]
      ? `查看上一次${kind === 'character' ? '角色' : '剧本'}API的原始回复`
      : '尚无原始回复';
    document.querySelectorAll('[data-generation-review="character"]').forEach((button) => {
      button.hidden = !session.ai.diagnostics.character;
    });
  }
  function render() {
    const record = current();
    refreshButtons();
    if (!record) return;
    $('#diagnostic-title').textContent = `${record.kind === 'character' ? '角色' : '剧本'}生成诊断`;
    $('#diagnostic-request').hidden = !record.request;
    $('#diagnostic-token-summary').textContent = record.request
      ? tokenSummary(record.request.tokens)
      : '';
    $('#diagnostic-messages').textContent = record.request
      ? formatRequestPreview(record.request)
      : '';
    $('#diagnostic-summary').textContent = record.issues.length
      ? `未通过校验，共${record.issues.length}处问题。原文已保留，尚未保存生成结果。`
      : record.repairs.length
        ? '已通过完整校验，下方列出自动修复的格式问题。'
        : '格式与规则校验通过。';
    if (record.prose)
      $('#diagnostic-summary').textContent +=
        ` 整章正文${record.prose.characters}字（${record.prose.unit}）。`;
    const describeIssues = (issues) =>
      issues
        .map(
          (issue) =>
            `${issue.path}${issue.line ? ` · 第${issue.line}行${issue.column}列（校验文本）` : ''}\n${issue.message}`,
        )
        .join('\n\n');
    $('#diagnostic-issues').textContent =
      describeIssues(record.issues) ||
      (record.resolvedIssues?.length
        ? '已修正的问题：\n' + describeIssues(record.resolvedIssues)
        : '没有发现格式或规则问题。');
    if (record.warnings?.length)
      $('#diagnostic-issues').textContent +=
        '\n\n参考信息（不影响接收）：\n' + describeIssues(record.warnings);
    $('#diagnostic-repairs').textContent =
      record.repairs
        .map(
          (repair) =>
            `• ${repair.message}${repair.line ? `（第${repair.line}行${repair.column}列，移除前文本）` : ''}`,
        )
        .join('\n') || '未自动修改内容。';
    $('#diagnostic-raw').value = record.rawText;
    $('#diagnostic-edit').value = record.candidateText;
    $('#diagnostic-edit').readOnly = record.accepted;
    $('#diagnostic-validate').hidden = record.accepted;
    $('#diagnostic-note').textContent = record.accepted
      ? '此结果已通过校验；本窗口仅供查看。原文只保留到刷新页面，不进入世界书或后续提示词。'
      : '可修改右侧文本并本地重新校验；不会调用模型。只修复格式，不补写设定、猜数值或绕过规则校验。';
  }
  function show(kind = session.ai.diagnosticKind) {
    session.ai.diagnosticKind = kind;
    render();
    if (current() && !$('#generation-diagnostics').open) $('#generation-diagnostics').showModal();
  }
  function record(diagnostic, input, accepted = false) {
    const kind = diagnostic.kind;
    session.ai.diagnosticKind = kind;
    session.ai.diagnostics[kind] = { ...diagnostic, input: structuredClone(input), accepted };
    render();
  }
  for (const button of document.querySelectorAll('[data-generation-review]'))
    events.on(button, 'click', () => {
      if (button.hidden || button.disabled) return;
      show(
        button.dataset.generationReview === 'character' || session.runtime.mode === 'inn'
          ? 'character'
          : 'script',
      );
    });
  events.on($('#diagnostic-close'), 'click', () => $('#generation-diagnostics').close());
  events.on($('#diagnostic-copy'), 'click', async () => {
    try {
      await navigator.clipboard.writeText(current().rawText);
      $('#diagnostic-note').textContent = '已复制原始返回。';
    } catch {
      $('#diagnostic-raw').select();
      $('#diagnostic-note').textContent = '已选中原文，可手动复制。';
    }
  });
  events.on($('#diagnostic-download'), 'click', () => {
    const url = URL.createObjectURL(
      new Blob([current().rawText], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${current().kind}-原始返回.txt`;
    link.click();
    URL.revokeObjectURL(url);
  });
  events.on($('#diagnostic-validate'), 'click', async () => {
    const record = current();
    if (!record || record.accepted || session.ai.busy || session.runtime.mode !== 'inn') return;
    if (
      record.kind === 'script' &&
      JSON.stringify(record.input.party.map((item) => item.id)) !==
        JSON.stringify(session.ai.library.party.filter(Boolean))
    ) {
      $('#diagnostic-note').textContent = '同行队伍已改变，请恢复生成时的队伍后再接收这份剧本。';
      return;
    }
    if (
      record.kind === 'script' &&
      (record.input.exploration
        ? record.input.exploration.id !== session.journey.selectedNode?.id ||
          record.input.chapter !==
            session.ai.library.exploration[record.input.exploration.map]?.completed + 1
        : record.input.boss !== session.journey.bossChoice ||
          record.input.chapter !== session.ai.library.chapter)
    ) {
      $('#diagnostic-note').textContent = '副本或章节已改变，请重新生成对应的剧本。';
      return;
    }
    session.ai.busy = true;
    $('#diagnostic-validate').disabled = true;
    const content = $('#diagnostic-edit').value;
    try {
      const result = await api(`validate/${record.kind}`, {
        content,
        input: record.input,
        requestId: record.request?.id,
      });
      if (session.runtime.disposed) return;
      session.ai.diagnostics[record.kind] = {
        ...record,
        ...result.diagnostic,
        rawText: record.rawText,
        accepted: true,
        resolvedIssues: [...(record.resolvedIssues || []), ...record.issues],
        repairs: [
          ...record.repairs,
          { message: '用户编辑校验文本后通过本地校验；原始返回保留供对照' },
          ...result.diagnostic.repairs,
        ],
      };
      render();
      $('#generation-diagnostics').close();
      session.ai.busy = false;
      await accept(record.kind, result.entry, record.input);
      toast('本地校验通过，已接收；没有重新调用模型。');
    } catch (failure) {
      if (session.runtime.disposed) return;
      if (failure.diagnostic) {
        session.ai.diagnostics[record.kind] = {
          ...record,
          ...failure.diagnostic,
          rawText: record.rawText,
          accepted: false,
          resolvedIssues: [...(record.resolvedIssues || []), ...record.issues],
          repairs: [...record.repairs, ...failure.diagnostic.repairs],
        };
        render();
      }
      $('#diagnostic-note').textContent = failure.message;
    } finally {
      session.ai.busy = false;
      $('#diagnostic-validate').disabled = false;
    }
  });
  return { record, show, refreshButtons, latest: (kind) => session.ai.diagnostics[kind] };
}
