/** Content uses an exact local o200k count; envelope/provider overhead remains an estimate. */
export function requestTokenReport(
  messages,
  countTokens,
  responseSchema = null,
  maxOutput = 0,
  toolRequest = null,
) {
  const perMessage = messages.map((message, index) => ({
    index,
    role: message.role,
    content: countTokens(message.content),
    characters: message.content.length,
  }));
  const contentTokens = perMessage.reduce((sum, item) => sum + item.content, 0);
  const overheadEstimate = messages.length * 3 + 3;
  const responseFormatTokens = responseSchema
    ? countTokens(
        JSON.stringify({
          type: 'json_schema',
          json_schema: { name: 'wanxiang_generation', strict: true, schema: responseSchema },
        }),
      )
    : 0;
  const toolTokens = toolRequest ? countTokens(JSON.stringify(toolRequest)) : 0;
  return {
    tokenizer: 'o200k_base',
    contentTokens,
    overheadEstimate,
    responseFormatTokens,
    ...(toolRequest ? { toolTokens } : {}),
    inputEstimate: contentTokens + overheadEstimate + responseFormatTokens + toolTokens,
    maxOutput,
    totalBudgetEstimate:
      contentTokens + overheadEstimate + responseFormatTokens + toolTokens + maxOutput,
    perMessage,
    note: '正文为本地参考分词数；消息封装与结构化格式开销为估算，不是服务商账单。实际用量以接口usage为准。',
  };
}
