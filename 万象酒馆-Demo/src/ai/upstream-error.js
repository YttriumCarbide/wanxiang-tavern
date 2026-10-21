/** Classify provider failures without retrying or treating an error as generated prose. */
export function upstreamError(message, status = 0) {
  const detail = String(message || `HTTP ${status}`);
  if (status === 429 || /\b429\b|RESOURCE_EXHAUSTED|Quota exceeded/i.test(detail)) {
    return {
      stage: 'upstream-quota',
      message:
        '上游额度或请求限额不足（429）。请检查反代服务的额度、账号池及模型限额；短期限流可稍后手动重试，额度耗尽需服务方恢复。延长超时无法解决，未自动重试。\n上游原始错误：' +
        detail,
    };
  }
  return { stage: 'transport', message: detail };
}
