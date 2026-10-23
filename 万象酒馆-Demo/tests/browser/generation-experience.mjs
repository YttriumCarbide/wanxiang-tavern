import assert from 'node:assert/strict';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { legacySession } from './legacy-session.mjs';
import { newLibrary } from '../../src/ai/library.js';
import { completeExploration } from '../../src/exploration.js';
import { worldFixture } from '../fixtures/multiverse.js';
import { mapResponse } from '../../src/ai/pipeline/map-request.js';
import { normalizeScript } from '../../src/ai/contracts.js';
import { tavernPresetFixture } from '../fixtures/ai.js';

export async function generationExperienceChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [],
    summaries = [],
    mapCalls = [],
    scriptCalls = [];
  let releaseChat;
  let announceChat;
  const chatStarted = new Promise((resolve) => {
    announceChat = resolve;
  });
  const library = newLibrary();
  library.inventory.ether = 100;
  for (let sequence = 0; sequence < 6; sequence++) {
    const node = library.exploration.ruins.frontier[0];
    const id = 'journey-' + sequence;
    library.scripts.push({
      id,
      schemaVersion: 4,
      title: '章节' + sequence,
      tags: [],
      story: Array.from({ length: 5 }, (_, index) => `真实正文 ${sequence}-${index}`),
      npcs: [],
      items: [],
      nextHook: { setting: '' },
      exploration: structuredClone(node),
    });
    library.history.push({
      runId: id,
      scriptId: id,
      nodeId: node.id,
      map: 'ruins',
      complete: true,
      title: '章节' + sequence,
      lines: Array.from({ length: 5 }, (_, encounter) => ({
        speaker: '旁白',
        text: `真实正文 ${sequence}-${encounter}`,
        encounter,
        stage: 'before',
      })),
    });
    completeExploration(library.exploration, node, { runId: id, title: '章节' + sequence });
  }
  await legacySession(page);
  await page.addInitScript((value) => {
    if (location.origin === 'null' || sessionStorage.getItem('experience-seeded')) return;
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(value));
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({
        developerMode: true,
        allowRetreat: true,
        protagonistApi: false,
        scriptApi: true,
      }),
    );
    sessionStorage.setItem('experience-seeded', 'true');
  }, library);
  page.on('pageerror', (failure) => errors.push(failure.message));
  async function post(route, data) {
    const response = await page.request.post(new URL('/api/ai/' + route, baseURL).href, { data });
    const result = await response.json();
    assert(response.ok(), result.error);
    return result;
  }
  async function innReady() {
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    return frame;
  }
  async function shelf() {
    const frame = await innReady();
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('bookshelf'));
    await frame.locator('#bookshelf-open').click();
    await page.locator('#bookshelf-dialog').waitFor({ state: 'visible' });
  }
  try {
    await page.route('**/api/ai/generate/summary', async (route) => {
      const input = route.request().postDataJSON();
      summaries.push(...input.items);
      await route.fulfill({
        json: {
          items: input.items.map((item) => ({
            id: item.id,
            summary: '整趟副本摘要：' + item.label,
          })),
          usage: { input: 100, output: 30 },
        },
      });
    });
    await page.route('**/api/ai/generate/chat', async (route) => {
      await new Promise((resolve) => {
        releaseChat = resolve;
        announceChat();
      });
      await route.fulfill({
        json: {
          content: '我在这里等你。',
          usage: {},
          request: { tokens: { inputEstimate: 20 }, warnings: [] },
        },
      });
    });
    await page.route('**/api/ai/generate/map', async (route) => {
      const input = route.request().postDataJSON();
      mapCalls.push(input);
      const raw = {
        ...worldFixture(),
        map: 'ruins',
        goals: ['前往北港接回失踪商队', '到山城拜访解咒学者', '进入地下水道修复星盘'],
      };
      await route.fulfill({
        json: {
          world: mapResponse(JSON.stringify(raw), input),
          request: { tokens: { inputEstimate: 100 } },
        },
      });
    });
    await page.route('**/api/ai/generate/script', async (route) => {
      const input = route.request().postDataJSON();
      scriptCalls.push(input);
      const ids = worldFixture().enemies.map((enemy) => enemy.id);
      const entry = normalizeScript(
        {
          schemaVersion: 4,
          story: Array.from(
            { length: 5 },
            (_, index) => '旅人沿着北港货单找到了第' + index + '份证据。',
          ),
          data: {
            title: '继续探索的航路',
            tags: ['港口'],
            npcs: [],
            items: [],
            nextHook: { setting: '前往山城' },
            encounters: [...Array(4).fill({ enemyIds: [ids[0]] }), { enemyIds: [ids[2]] }],
          },
        },
        'continuation-script',
      );
      await route.fulfill({
        json: {
          entry,
          diagnostic: {
            kind: 'script',
            rawText: 'fixture',
            candidateText: '{}',
            issues: [],
            repairs: [],
            request: {
              messages: [],
              warnings: [],
              tokens: {
                inputEstimate: 100,
                contentTokens: 100,
                overheadEstimate: 0,
                responseFormatTokens: 0,
                maxOutput: 8192,
                perMessage: [],
              },
            },
          },
        },
      });
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    assert.equal(
      await page
        .locator('.app-header #memory-open,.app-header #archives-open,.app-header #records-open')
        .count(),
      0,
    );
    await page.locator('#ai-open').click();
    await page.locator('#ai-provider').selectOption('vertex');
    assert.equal(await page.locator('#ai-vertexAuth').inputValue(), 'service-account');
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = JSON.stringify({
      type: 'service_account',
      project_id: 'tavern-fixture',
      client_email: 'test@tavern-fixture.iam.gserviceaccount.com',
      private_key: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });
    await page.locator('#ai-service-account').fill(account);
    await page.locator('#ai-service-validate').click();
    await page.locator('#ai-service-status').filter({ hasText: 'JSON 有效' }).waitFor();
    await page.locator('#ai-model').fill('my-manual-model');
    await page.locator('#ai-profile-save').click();
    await page.locator('#ai-status').filter({ hasText: '已保存' }).waitFor();
    const profiles = await (await page.request.get(baseURL + '/api/ai/config')).json();
    assert.equal(profiles.character.vertexProject, 'tavern-fixture');
    assert.equal(profiles.character.hasApiKey, true);
    assert(!JSON.stringify(profiles).includes('PRIVATE KEY'));
    await page.screenshot({ path: path.join(output, 'vertex-service-json.png') });
    await page.locator('#ai-close').click();

    const frame = await innReady();
    for (const from of ['table', 'fate', 'table2', 'gate']) {
      const blockers = await frame.locator('canvas').evaluate(async (_, place) => {
        const THREE = await import('/vendor/build/three.module.js');
        const view = window.assetPreview;
        view.placeNow(place);
        const anchor = new THREE.Vector3(...view.places.bookshelf.anchor);
        view.camera.lookAt(anchor);
        view.look(view.camera.rotation.y, view.camera.rotation.x);
        const direction = anchor.clone().sub(view.camera.position);
        const ray = new THREE.Raycaster(
          view.camera.position,
          direction.clone().normalize(),
          0,
          direction.length() - 0.22,
        );
        return ray.intersectObject(view.model, true).map((hit) => hit.object.name);
      }, from);
      assert.deepEqual(blockers, [], 'Bookshelf marker is visible from ' + from);
      const button = frame.locator('.spot[data-place="bookshelf"]:enabled');
      await button.waitFor({ state: 'visible' });
      if (from === 'fate')
        await page.screenshot({ path: path.join(output, 'bookshelf-approach-marker.png') });
      await button.click();
      await frame.locator('#bookshelf-open').waitFor({ state: 'visible' });
      assert.equal(
        await frame.locator('canvas').evaluate(() => window.assetPreview.getState().current),
        'bookshelf',
      );
    }
    const bounds = await frame.locator('canvas').evaluate(async () => {
      const THREE = await import('/vendor/build/three.module.js');
      const view = window.assetPreview;
      const bookcase = view.model.getObjectByName('16_Arcane_Bookcase');
      const box = new THREE.Box3().setFromObject(bookcase);
      return { min: box.min.toArray(), max: box.max.toArray() };
    });
    assert(bounds.min[0] > 5.3 && bounds.max[0] < 6.1, 'Bookcase stands against the east wall');
    await page.screenshot({ path: path.join(output, 'bookshelf-against-wall.png') });
    await shelf();
    assert.equal(await page.locator('#bookshelf-books button').count(), 4);
    await page.locator('#memory-open').click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('#memory-items article').length === 6 &&
        [...document.querySelectorAll('#memory-items article > small')].every((node) =>
          /\d+ TK/.test(node.textContent),
        ),
    );
    assert.equal(await page.locator('#memory-items input[type="checkbox"]').count(), 0);
    await page.locator('#memory-generate').click();
    await page.waitForFunction(() => !document.querySelector('#memory-accept').disabled);
    assert.equal(summaries.length, 6);
    assert(
      summaries.every(
        (item) => item.text.includes('真实正文') && item.text.split('真实正文').length === 6,
      ),
    );
    await page.screenshot({ path: path.join(output, 'whole-dungeon-memory.png') });
    await page.locator('#memory-accept').click();
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).history.filter((record) => record.summary)
        .length,
      6,
    );

    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('table'));
    await frame.locator('#talk-open').click();
    await page.locator('#chat-input').fill('我在这里等下一段故事。');
    await page.locator('#chat-send').click();
    await page.locator('[data-request-stop="chat"]').waitFor();
    await chatStarted;
    assert.equal(await page.locator('[data-request-arcade],#arcade-dialog').count(), 0);
    assert(releaseChat);
    releaseChat();
    await page.locator('[data-request-stop="chat"]').waitFor({ state: 'detached' });
    await page.locator('#chat-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.ether, 100);
    const sharedControls = await page.evaluate(async () => {
      const { createRequestControls } = await import('/src/app/request-controls.js');
      const resolutions = [];
      const client = createRequestControls({
        request: () => new Promise((resolve) => resolutions.push(resolve)),
        dispose() {},
      });
      const kinds = ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation', 'map'];
      const requests = kinds.map((kind) => client.request('generate/' + kind, {}));
      const stops = document.querySelectorAll('[data-request-stop]').length;
      const games = document.querySelectorAll('[data-request-arcade]').length;
      resolutions.forEach((resolve) => resolve({}));
      await Promise.all(requests);
      client.dispose();
      return { stops, games, remaining: document.querySelectorAll('.api-request-control').length };
    });
    assert.deepEqual(sharedControls, { stops: 7, games: 0, remaining: 0 });

    await post('config', {
      kind: 'script',
      baseUrl: 'http://127.0.0.1:9999/v1',
      model: 'continuation-fixture',
      tokenField: 'max_tokens',
      maxTokens: 8192,
    });
    const preset = await post('prompts/save', { preset: tavernPresetFixture() });
    await post('prompts/select', { kind: 'script', id: preset.preset.id });
    const nextFrame = await innReady();
    await nextFrame.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
    await nextFrame.locator('#enter').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.locator('#world-construction').waitFor({ state: 'visible' });
    assert.equal(scriptCalls.length, 0);
    await page.locator('[data-world-submit]').click();
    await page.locator('#world-construction').waitFor({ state: 'hidden' });
    assert.equal(mapCalls.length, 1);
    assert.equal(mapCalls[0].continuation.completedStories.length, 6);
    assert.equal(await page.locator('#destination-start').textContent(), '继续探索 →');
    await page.screenshot({ path: path.join(output, 'continuation-world-ready.png') });
    await page.locator('#destination-start').click();
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
      null,
      { timeout: 60000 },
    );
    assert.equal(scriptCalls.length, 1);
    assert.equal(scriptCalls[0].exploration.world.goals.length, 3);
    assert(
      (await page.evaluate(() => demo.getState())).enemyIds.every((id) =>
        id.startsWith('enemy-lantern-'),
      ),
    );
    assert.deepEqual(errors, []);
    return {
      vertexJsonValidatedAndSaved: true,
      bookcaseWallPlacement: bounds,
      bookshelfNavigation: true,
      wholeDungeonSummariesAndTokens: true,
      retiredMinigameAndKeptAllStopButtons: true,
      sixthToEndlessWorldGate: true,
      previousSixStories: true,
      endlessEncountersFromNewWorld: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'failure.png') });
    await writeFile(
      path.join(output, 'failure.json'),
      JSON.stringify(
        {
          errors,
          scriptCalls: scriptCalls.length,
          state: await page.evaluate(() => ({
            status: window.demo?.getStatus(),
            api: document.querySelector('#ai-status')?.textContent,
            dialogs: [...document.querySelectorAll('dialog[open]')].map((node) => node.id),
            diagnostic: document.querySelector('#diagnostic-summary')?.textContent,
          })),
        },
        null,
        2,
      ),
    );
    throw failure;
  } finally {
    releaseChat?.();
    await page.close();
  }
}
