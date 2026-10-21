import { readFile, writeFile } from 'node:fs/promises';
import { compatibleRequest } from '../src/ai/compatible.js';

const evidenceFile = new URL('../.runtime/provider-evidence.json', import.meta.url);
async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
async function preflight(baseUrl) {
  try {
    const response = await fetch(baseUrl + '/chat/completions', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:4180',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers':
          'authorization,content-type,x-opencode-session,x-opencode-client,x-opencode-request',
      },
      signal: AbortSignal.timeout(20000),
    });
    return {
      baseUrl,
      status: response.status,
      allowedOrigin: response.headers.get('access-control-allow-origin'),
      allowedHeaders: response.headers.get('access-control-allow-headers'),
    };
  } catch (error) {
    return { baseUrl, error: error.message };
  }
}

/** An explicit private run ID authorizes at most three tiny completions; reruns use evidence. */
export async function providerLiveChecks() {
  const prior = await readJson(evidenceFile);
  const fixture = await readJson(new URL('../.runtime/provider-check.json', import.meta.url));
  if (!fixture || prior?.runId === fixture.runId)
    return prior || { skipped: 'No explicitly authorized private provider fixture' };
  const profile = {
    ...fixture,
    sessionId: 'ses_wanxiang_compatibility_' + fixture.runId,
    maxTokens: 512,
    tokenField: 'max_tokens',
    temperature: null,
  };
  delete profile.runId;
  const report = {
    runId: fixture.runId,
    provider: 'OpenCode Go',
    modelsAuthenticated: false,
    generationVerified: false,
    attempts: [],
    automaticRetry: false,
  };
  const persist = () => writeFile(evidenceFile, JSON.stringify(report, null, 2));
  const headers = ['x-opencode-session', 'x-opencode-request', 'x-opencode-client'];
  const modern = 'https://opencode.ai/inference/go/openai/v1';
  try {
    const models = await compatibleRequest(profile, [], {
      models: true,
      signal: AbortSignal.timeout(30000),
    });
    report.modelsAuthenticated = true;
    report.modelCount = models.models.length;
    const first = models.models.find((id) => /deepseek/i.test(id)) || models.models[0];
    const alternative = models.models.find((id) => /glm/i.test(id) && id !== first);
    const cases = [
      { baseUrl: profile.baseUrl, model: first },
      ...(alternative ? [{ baseUrl: profile.baseUrl, model: alternative }] : []),
      { baseUrl: modern, model: first },
    ];
    for (const testCase of cases) {
      const record = { ...testCase, headers, completed: false };
      report.attempts.push(record);
      // Save before sending: interruption cannot silently authorize a second batch on rerun.
      await persist();
      try {
        const result = await compatibleRequest(
          { ...profile, ...testCase },
          [{ role: 'user', content: 'Connectivity check. Reply only with OK.' }],
          {
            signal: AbortSignal.timeout(45000),
            sampling: { stream: true },
            outputEnvelope: true,
            fetchImpl: async (url, options) => {
              const response = await fetch(url, options);
              record.status = response.status;
              return response;
            },
          },
        );
        record.completed = !!result.content.trim();
        record.reply = result.content.slice(0, 80);
        record.usage = result.usage;
        report.generationVerified = record.completed;
      } catch (error) {
        record.error = error.message.replaceAll(profile.apiKey, '[redacted]').slice(0, 500);
      }
      await persist();
      if (report.generationVerified) break;
    }
  } catch (error) {
    report.error = error.message.replaceAll(profile.apiKey, '[redacted]').slice(0, 500);
  }
  report.preflights = await Promise.all([preflight(profile.baseUrl), preflight(modern)]);
  await persist();
  return report;
}
