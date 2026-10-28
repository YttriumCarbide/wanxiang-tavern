export function tokenSummary(tokens) {
  if (!tokens) return '暂无统计';
  return `输入约 ${tokens.inputEstimate.toLocaleString()} TK · 消息正文 ${tokens.contentTokens.toLocaleString()} · 封装估算 ${tokens.overheadEstimate} · 结构化格式估算 ${tokens.responseFormatTokens}${tokens.toolTokens ? ` · 工具定义 ${tokens.toolTokens} TK` : ''} · 最大输出 ${tokens.maxOutput.toLocaleString()} TK（o200k_base参考）`;
}
export function formatRequestPreview(result) {
  const lines = [tokenSummary(result.tokens), result.tokens?.note || ''];
  if (result.transport?.format === 'tagged-json')
    lines.push(
      `输出读取：只读取 <${result.transport.tag}> 标签内的JSON；不发送上游response_format，本地严格校验。`,
    );
  if (result.usage)
    lines.push(`接口实际usage：输入 ${result.usage.input} TK，输出 ${result.usage.output} TK`);
  if (result.transport?.outputTool)
    lines.push(
      '正文输出工具（正文仍按游戏标签校验）：' + JSON.stringify(result.transport.outputTool),
    );
  if (result.transport?.processingStatus && Object.keys(result.transport.processingStatus).length)
    lines.push('预设特殊处理：' + JSON.stringify(result.transport.processingStatus));
  if (result.transport?.contextTool)
    lines.push('上下文工具（随请求发送）：' + JSON.stringify(result.transport.contextTool));
  if (result.transport?.presetProcessing?.output)
    lines.push('输出预处理：' + result.transport.presetProcessing.output);
  if (result.transport?.advice)
    lines.push('Advice消息转移（仅酒馆聊天）：' + JSON.stringify(result.transport.advice));
  if (result.worldInfo) {
    lines.push(
      `\n【世界书：激活正文 ${result.worldInfo.usedTokens} TK / 预算 ${result.worldInfo.budget} TK】`,
    );
    for (const entry of result.worldInfo.report)
      lines.push(
        `${entry.active ? '●' : '○'} ${entry.book} / ${entry.title}｜${entry.reason}${entry.tokens ? `｜${entry.tokens} TK` : ''}`,
      );
    lines.push(...result.worldInfo.warnings);
  }
  if (result.sampling && Object.keys(result.sampling).length)
    lines.push('预设采样参数：' + JSON.stringify(result.sampling));
  if (result.regex) {
    lines.push(`正则：${result.regex.scripts}条，发生${result.regex.changes.length}次文本替换`);
    for (const change of result.regex.changes)
      lines.push(`· ${change.name}：${change.beforeCharacters}→${change.afterCharacters}字符`);
  }
  lines.push(...(result.warnings || []));
  for (const [index, message] of result.messages.entries())
    lines.push(
      `\n【${index + 1} · ${message.role.toUpperCase()} · ${result.tokens?.perMessage[index]?.content ?? '?'} TK】\n${message.content}`,
    );
  return lines.join('\n\n');
}
