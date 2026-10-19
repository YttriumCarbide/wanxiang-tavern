export function generationDiagnostic(kind, rawText = '', message = '', stage = 'transport') {
  return {
    kind,
    stage,
    rawText,
    candidateText: rawText,
    repairs: [],
    issues: message ? [{ path: stage, message }] : [],
  };
}

export function redactDiagnostic(diagnostic, secret) {
  if (!diagnostic) return undefined;
  const visit = (value) => {
    if (typeof value === 'string') return secret ? value.replaceAll(secret, '[密钥已隐藏]') : value;
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    return value;
  };
  return visit(diagnostic);
}
