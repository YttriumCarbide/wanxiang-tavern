import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { projectRoot as root, command, withTestServer } from './testing/runtime.mjs';
import { allScopes, selectScopes } from './testing/scopes.mjs';
import { quality } from './testing/quality.mjs';
import { serverChecks, launchers } from './testing/server.mjs';
import { models } from './testing/models.mjs';

const output = path.join(root, '.runtime/tests');
const require = createRequire(import.meta.url);
const results = [];
let inherited = [];
async function run(name, operation) {
  const started = performance.now();
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
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
  }
}
async function scopesForRun() {
  const args = process.argv.slice(2);
  if (!args.includes('--failed')) return selectScopes(args);

  const previous = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
  inherited = previous.results;
  const scopes = new Set(
    previous.results
      .filter((r) => !r.passed)
      .map((r) => (r.name === 'turn-flow' ? 'core' : r.name)),
  );
  for (const scope of scopes)
    if (!allScopes.includes(scope)) throw Error('Fix runner setup, then select --scope explicitly');
  const extra = args.filter((arg) => arg !== '--failed');
  if (extra.length) for (const scope of selectScopes(extra)) scopes.add(scope);
  return scopes;
}
async function browserChecks(scopes, baseURL) {
  const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await playwright.chromium.launch({
    channel: process.env.TEST_BROWSER || 'msedge',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  try {
    if (scopes.has('static'))
      await run('static', async () => {
        const { staticChecks } = await import('../tests/browser/static.mjs');
        return staticChecks({ browser, output });
      });
    if (scopes.has('environment') || scopes.has('rooms') || scopes.has('artbook'))
      await run(
        scopes.has('environment') ? 'environment' : scopes.has('artbook') ? 'artbook' : 'rooms',
        async () => {
          const { artbookChecks } = await import('../tests/browser/artbook.mjs');
          const { guestRoomChecks } = await import('../tests/browser/guest-room.mjs');
          const { roomChatChecks } = await import('../tests/browser/room-chat.mjs');
          const results = await Promise.allSettled([
            scopes.has('environment') || scopes.has('artbook')
              ? artbookChecks({ browser, baseURL, output })
              : Promise.resolve(null),
            scopes.has('environment') || scopes.has('rooms')
              ? guestRoomChecks({ browser, baseURL, output })
              : Promise.resolve(null),
            scopes.has('environment') || scopes.has('rooms')
              ? roomChatChecks({ browser, baseURL, output })
              : Promise.resolve(null),
          ]);
          const failures = results.filter((result) => result.status === 'rejected');
          if (failures.length)
            throw new AggregateError(
              failures.map((result) => result.reason),
              failures.map((result) => result.reason.stack).join('\n'),
            );
          return { artbook: results[0].value, rooms: results[1].value, chat: results[2].value };
        },
      );
    if (scopes.has('settings'))
      await run('settings', async () => {
        const { apiSettingsChecks } = await import('../tests/browser/api-settings.mjs');
        const { equipmentChecks } = await import('../tests/browser/equipment.mjs');
        const { generationOptionsChecks } = await import('../tests/browser/generation-options.mjs');
        const settings = await apiSettingsChecks({ browser, baseURL, output });
        return {
          ...settings,
          generationOptions: await generationOptionsChecks({ browser, baseURL, output }),
          equipment: await equipmentChecks({ browser, baseURL, output }),
        };
      });
    if (scopes.has('chat'))
      await run('chat', async () => {
        const { chatChecks } = await import('../tests/browser/chat.mjs');
        return chatChecks({ browser, baseURL, output });
      });
    if (scopes.has('audio'))
      await run('audio', async () => {
        const { battleMusicChecks } = await import('../tests/browser/audio.mjs');
        return battleMusicChecks({ browser, baseURL });
      });
    if (scopes.has('ai'))
      await run('ai', async () => {
        const { generationChecks } = await import('../tests/browser/generation.mjs');
        return generationChecks({ browser, baseURL, output });
      });
    if (scopes.has('ui'))
      await run('ui', async () => {
        const { smoke } = await import('../tests/browser/smoke.mjs');
        return smoke({
          browser,
          baseURL,
          output,
          settingsChecked: results.find((result) => result.name === 'settings' && result.passed)
            ?.detail,
          environmentChecked: results.find(
            (result) => ['environment', 'rooms', 'artbook'].includes(result.name) && result.passed,
          )?.detail,
        });
      });
    if (scopes.has('layout'))
      await run('layout', async () => {
        const { layout } = await import('../tests/browser/layout.mjs');
        return layout({ browser, baseURL, fixture: path.join(root, 'tests/fixtures/layout.json') });
      });
    if (scopes.has('death-effects'))
      await run('death-effects', async () => {
        const checked = results.find((result) => result.name === 'ui' && result.passed)?.detail
          .cardDeaths;
        if (checked) return checked;
        const { cardDeathChecks } = await import('../tests/browser/card-death.mjs');
        return cardDeathChecks({ browser, baseURL, output });
      });
    if (scopes.has('intents'))
      await run('intents', async () => {
        const checked = results.find((result) => result.name === 'ui' && result.passed)?.detail
          .enemyIntents;
        if (checked) return checked;
        const { enemyIntentChecks } = await import('../tests/browser/enemy-intents.mjs');
        return enemyIntentChecks({ browser, baseURL, output });
      });
    if (scopes.has('destinations'))
      await run('destinations', async () => {
        const checked = results.find((result) => result.name === 'ui' && result.passed)?.detail
          .destinationPager;
        if (checked) return checked;
        const { destinationPagerChecks } = await import('../tests/browser/destination-pager.mjs');
        return destinationPagerChecks({ browser, baseURL, output });
      });
    if (scopes.has('onboarding'))
      await run('onboarding', async () => {
        const { onboardingChecks } = await import('../tests/browser/onboarding.mjs');
        return onboardingChecks({ browser, baseURL, output });
      });
  } finally {
    await browser.close();
  }
}
async function main() {
  const scopes = await scopesForRun();
  await mkdir(output, { recursive: true });
  if (!scopes.size) {
    console.log('No failed checks to rerun.');
    return;
  }
  console.log(`Selected scopes: ${[...scopes].join(', ')}`);
  if (scopes.has('quality')) await run('quality', quality);
  if (scopes.has('models')) await run('models', models);
  if (scopes.has('core'))
    await run('core', async () => {
      const files = (await readdir(path.join(root, 'tests')))
        .filter((name) => name.endsWith('.test.js'))
        .map((name) => 'tests/' + name);
      return command(process.execPath, ['--test', ...files]);
    });
  const serviceScopes = [
    'static',
    'environment',
    'rooms',
    'artbook',
    'server',
    'chat',
    'settings',
    'ui',
    'layout',
    'expedition',
    'ai',
    'death-effects',
    'intents',
    'destinations',
    'audio',
    'onboarding',
  ].filter((scope) => scopes.has(scope));
  if (serviceScopes.length) {
    try {
      await withTestServer(async (baseURL, port) => {
        if (scopes.has('server')) await run('server', () => serverChecks(baseURL, port));
        if (
          scopes.has('environment') ||
          scopes.has('rooms') ||
          scopes.has('artbook') ||
          scopes.has('settings') ||
          scopes.has('chat') ||
          scopes.has('ui') ||
          scopes.has('layout') ||
          scopes.has('ai') ||
          scopes.has('death-effects') ||
          scopes.has('intents') ||
          scopes.has('destinations') ||
          scopes.has('audio') ||
          scopes.has('onboarding') ||
          scopes.has('static')
        ) {
          try {
            await browserChecks(scopes, baseURL);
          } catch (error) {
            for (const name of [
              'static',
              'environment',
              'rooms',
              'artbook',
              'settings',
              'chat',
              'ui',
              'layout',
              'ai',
              'death-effects',
              'intents',
              'destinations',
              'audio',
              'onboarding',
            ].filter((name) => scopes.has(name) && !results.some((r) => r.name === name)))
              await run(name, () => {
                throw error;
              });
          }
        }
        if (scopes.has('expedition'))
          await run('expedition', () =>
            command(process.execPath, ['tests/browser/expedition.cjs'], {
              env: {
                ...process.env,
                PLAYWRIGHT_MODULE: require.resolve('playwright'),
                DEMO_TEST_URL: baseURL,
                TEST_OUTPUT_DIR: output + path.sep,
              },
              timeout: 600000,
            }),
          );
      });
    } catch (error) {
      for (const name of serviceScopes.filter((name) => !results.some((r) => r.name === name)))
        await run(name, () => {
          throw error;
        });
    }
  }
  if (scopes.has('launcher')) await run('launcher', launchers);
}
try {
  await main();
} catch (error) {
  results.push({ name: 'runner', passed: false, error: error.message });
  console.error(error);
} finally {
  await mkdir(output, { recursive: true });
  const kept = inherited.filter((old) => !results.some((result) => result.name === old.name));
  const combined = [...kept, ...results];
  const report = {
    date: new Date().toISOString(),
    currentRun: results.map((r) => r.name),
    retainedWithoutRerun: kept.map((r) => r.name),
    results: combined,
    passed: combined.every((r) => r.passed),
  };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${path.join(output, 'report.json')}`);
  process.exitCode = report.passed ? 0 : 1;
}
