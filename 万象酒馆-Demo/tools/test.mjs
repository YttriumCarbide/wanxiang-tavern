import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { projectRoot as root, command, withTestServer } from './testing/runtime.mjs';
import { allScopes, selectScopes } from './testing/scopes.mjs';
import { quality } from './testing/quality.mjs';
import { serverChecks, launchers } from './testing/server.mjs';
import { models } from './testing/models.mjs';
import { loadTestPlan } from './testing/plan.mjs';
import { runBatch } from './testing/batch.mjs';
import { browserJobs } from './testing/browser-jobs.mjs';

const output = path.join(root, '.runtime/tests');
const require = createRequire(import.meta.url);
const results = [];
let inherited = [];
let plan;
async function run(name, operation) {
  const started = performance.now();
  console.log(`START ${name}`);
  try {
    const detail = await operation();
    results.push({ name, passed: true, ms: Math.round(performance.now() - started), detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      ms: Math.round(performance.now() - started),
      error: error.stack || error.message,
    });
    console.error(
      `FAIL ${name}: ${String(error.message || error).split('\n')[0]} (details in report.json)`,
    );
  }
}
async function scopesForRun() {
  plan = await loadTestPlan(process.argv.slice(2), root);
  const args = plan.args;
  if (!args.includes('--failed')) {
    if (args.length) return new Set([...plan.scopes, ...selectScopes(args)]);
    return plan.scopes;
  }

  const previous = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
  inherited = previous.results;
  if (!plan.explicit && previous.results.some((result) => result.name === 'core' && !result.passed))
    plan.coreFiles = previous.coreFiles || [];
  const scopes = new Set(
    previous.results
      .filter((r) => !r.passed)
      .map((r) => (r.name === 'turn-flow' ? 'core' : r.name)),
  );
  for (const scope of scopes)
    if (!allScopes.includes(scope)) throw Error('Fix runner setup, then select --scope explicitly');
  const extra = args.filter((arg) => arg !== '--failed');
  if (extra.length) for (const scope of selectScopes(extra)) scopes.add(scope);
  if (plan.explicit) for (const scope of plan.scopes) scopes.add(scope);
  return scopes;
}
async function browserChecks(scopes) {
  const jobs = browserJobs(scopes, results, root);
  if (!jobs.length && !scopes.has('static')) return;
  let browser;
  try {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    browser = await playwright.chromium.launch({
      channel: process.env.TEST_BROWSER || 'msedge',
      headless: true,
      args: ['--enable-webgl', '--ignore-gpu-blocklist'],
    });
    // Building static assets writes shared build inputs, so finish it before other browser jobs.
    if (scopes.has('static'))
      await run('static', async () => {
        const { staticChecks } = await import('../tests/browser/static.mjs');
        const directory = path.join(output, 'static');
        await mkdir(directory, { recursive: true });
        return staticChecks({ browser, output: directory });
      });
    await runBatch(jobs, plan.browserConcurrency, (job) =>
      run(job.name, async () => {
        const directory = path.join(output, job.name);
        await mkdir(directory, { recursive: true });
        return withTestServer((baseURL) => job.operation({ browser, baseURL, output: directory }), {
          browserOnly: job.browserOnly,
        });
      }),
    );
  } catch (error) {
    for (const name of [
      ...jobs.map((job) => job.name),
      ...(scopes.has('static') ? ['static'] : []),
    ])
      if (!results.some((result) => result.name === name))
        await run(name, () => {
          throw error;
        });
  } finally {
    await browser?.close();
  }
}

async function main() {
  const scopes = await scopesForRun();
  console.log(`Selected scopes: ${[...scopes].join(', ')}`);
  if (plan.planPath) console.log(`Checklist: ${plan.planPath}`);
  if (plan.coreFiles.length && scopes.has('core'))
    console.log(`Core files: ${plan.coreFiles.join(', ')}`);
  if (plan.list) return;
  await mkdir(output, { recursive: true });
  if (!scopes.size) {
    console.log('No failed checks to rerun.');
    return;
  }
  const local = [];
  if (scopes.has('quality')) local.push({ name: 'quality', operation: quality });
  if (scopes.has('models')) local.push({ name: 'models', operation: models });
  if (scopes.has('core'))
    local.push({
      name: 'core',
      operation: async () => {
        const files = plan.coreFiles.length
          ? plan.coreFiles
          : (await readdir(path.join(root, 'tests')))
              .filter((name) => name.endsWith('.test.js'))
              .map((name) => 'tests/' + name);
        return command(process.execPath, ['--test', ...files]);
      },
    });
  if (scopes.has('provider-live'))
    local.push({
      name: 'provider-live',
      operation: async () => (await import('../tests/provider-live.mjs')).providerLiveChecks(),
    });
  await Promise.all([
    runBatch(local, 2, (job) => run(job.name, job.operation)),
    browserChecks(scopes),
    scopes.has('server') ? run('server', () => withTestServer(serverChecks)) : null,
  ]);
  // Full journeys remain explicit long checks, not part of the default checklist.
  if (scopes.has('expedition'))
    await run('expedition', () =>
      withTestServer((baseURL) =>
        command(process.execPath, ['tests/browser/expedition.cjs'], {
          env: {
            ...process.env,
            PLAYWRIGHT_MODULE: require.resolve('playwright'),
            DEMO_TEST_URL: baseURL,
            TEST_OUTPUT_DIR: output + path.sep,
          },
          timeout: 600000,
        }),
      ),
    );
  if (scopes.has('launcher')) await run('launcher', launchers);
}

try {
  await main();
} catch (error) {
  results.push({ name: 'runner', passed: false, error: error.message });
  console.error(error);
} finally {
  if (!plan?.list) {
    await mkdir(output, { recursive: true });
    const kept = inherited.filter((old) => !results.some((result) => result.name === old.name));
    const combined = [...kept, ...results];
    const report = {
      date: new Date().toISOString(),
      checklist: plan?.planPath || null,
      coreFiles: plan?.coreFiles || [],
      currentRun: results.map((r) => r.name),
      retainedWithoutRerun: kept.map((r) => r.name),
      results: combined,
      passed: combined.every((r) => r.passed),
    };
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Report: ${path.join(output, 'report.json')}`);
    process.exitCode = report.passed ? 0 : 1;
  }
}
