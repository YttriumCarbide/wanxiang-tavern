import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

/** One authorized, bounded browser → local relay → OpenCode streaming check. */
export async function opencodeBrowserChecks({ browser, baseURL }) {
  const file = new URL('../../.runtime/provider-evidence.json', import.meta.url);
  let fixture;
  try {
    fixture = JSON.parse(
      await readFile(new URL('../../.runtime/provider-check.json', import.meta.url), 'utf8'),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return { skipped: 'No authorized private provider fixture' };
    throw error;
  }
  const evidence = JSON.parse(await readFile(file, 'utf8'));
  if (evidence.browserRunId === fixture.runId) {
    assert(evidence.browserGenerationVerified, evidence.browserError);
    return { browserGenerationVerified: true, transport: 'local-relay', reusedEvidence: true };
  }
  const model = evidence.attempts.find((attempt) => attempt.completed)?.model;
  assert(model, 'A working upstream model must be verified first');
  evidence.browserRunId = fixture.runId;
  evidence.browserGenerationVerified = false;
  await writeFile(file, JSON.stringify(evidence, null, 2));
  const page = await browser.newPage();
  const external = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'opencode.ai') external.push(request.url());
  });
  try {
    await page.goto(baseURL);
    const result = await page.evaluate(
      async ({ profile, model }) => {
        const { compatibleRequest } = await import('/src/ai/compatible.js');
        const { createOpencodeBrowserFetch } = await import('/src/ai/opencode-browser.js');
        const transport = await createOpencodeBrowserFetch(fetch);
        if (transport === fetch) throw Error('Local relay was not detected');
        const result = await compatibleRequest(
          {
            ...profile,
            model,
            sessionId: 'ses_wanxiang_browser_check',
            maxTokens: 512,
            tokenField: 'max_tokens',
            temperature: null,
          },
          [{ role: 'user', content: 'Connectivity check. Reply only with OK.' }],
          {
            fetchImpl: transport,
            signal: AbortSignal.timeout(45000),
            sampling: { stream: true },
            outputEnvelope: true,
          },
        );
        return { content: result.content, usage: result.usage };
      },
      { profile: fixture, model },
    );
    assert(result.content.trim());
    assert.deepEqual(external, []);
    evidence.browserGenerationVerified = true;
    evidence.browserTransport = 'local-relay';
    evidence.browserReply = result.content.slice(0, 80);
    evidence.browserUsage = result.usage;
    await writeFile(file, JSON.stringify(evidence, null, 2));
    return {
      browserGenerationVerified: true,
      model,
      transport: 'local-relay',
      usage: result.usage,
    };
  } catch (error) {
    evidence.browserError = error.message.replaceAll(fixture.apiKey, '[redacted]').slice(0, 500);
    await writeFile(file, JSON.stringify(evidence, null, 2));
    throw Error(evidence.browserError, { cause: error });
  } finally {
    await page.close();
  }
}
