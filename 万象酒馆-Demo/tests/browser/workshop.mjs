import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { newLibrary } from '../../src/ai/library.js';
import { validateWorkshopCatalog } from '../../src/workshop/catalog.js';

export async function workshopChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let harness;
  async function open() {
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
    await page.locator('#workshop-open').click();
    await page.locator('#workshop-dialog').waitFor({ state: 'visible' });
  }
  const editor = page.locator('#workshop-editor');
  async function grant(amount = 100) {
    await editor.locator('[data-we-type]').selectOption('progress');
    await editor.locator('[data-we-grant-id]').selectOption('stardust');
    await editor.locator('[data-we-grant-number]').fill(String(amount));
    await editor.locator('[data-we-grant]').click();
    await editor.locator('[data-we-coins]').fill('100');
    await editor.locator('[data-we-set-coins]').click();
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await page.evaluate(async (library) => {
      const { openDatabase } = await import('/src/storage/database.js');
      const db = await openDatabase();
      await db.write([
        ['game.wanxiang.worldbooks.v1', JSON.stringify(library)],
        ['game.wanxiang.creation-pending.v1', 'false'],
        ['game.wanxiang.setup.completed.v1', 'true'],
        [
          'game.wanxiang.generation-options.v1',
          JSON.stringify({ developerMode: true, skipAiGeneration: true }),
        ],
      ]);
      db.close();
    }, newLibrary());
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await open();
    assert.equal(await page.locator('.ws-node').count(), 3);
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(output, 'workshop-start.png') });
    await page.locator('.ws-node [data-ws-action="craft"][data-id="stardust"]').click();
    await page.waitForFunction(
      () => parseFloat(document.querySelector('[data-ws-progress="stardust"]').style.width) > 5,
    );
    await page.waitForFunction(
      () => document.querySelector('[data-ws-quantity="stardust"]').textContent === '1',
    );
    await page.locator('[data-ws-editor]').click();
    await grant();
    await editor.locator('[data-we-close]').click();
    await page.locator('.ws-inspector [data-ws-action="build"][data-id="collector"]').click();
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).workshop.stations.collector.count,
      1,
    );
    await page.locator('[data-ws-active="collector"]').fill('0');
    await page.locator('[data-ws-active="collector"]').dispatchEvent('change');
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).workshop.stations.collector.active,
      0,
    );
    await page.locator('[data-ws-active="collector"]').fill('1');
    await page.locator('[data-ws-active="collector"]').dispatchEvent('change');
    await page.locator('[data-ws-editor]').click();
    await editor.locator('[data-we-type]').selectOption('items');
    await editor.locator('[data-we-select="stardust"]').click();
    await editor.locator('[data-we-field="name"]').fill('微光星尘');
    await editor.locator('[data-we-field="seconds"]').fill('1');
    await editor.locator('button[type="submit"]').click();
    await editor.locator('[data-we-apply]').click();
    assert.match(await page.locator('.ws-inspector h2').textContent(), /微光星尘/);
    await editor.locator('[data-we-undo]').click();
    await editor.locator('[data-we-apply]').click();
    assert.equal(await page.locator('.ws-inspector h2').textContent(), '星尘');
    await editor.locator('[data-we-redo]').click();
    await editor.locator('[data-we-apply]').click();
    await editor.locator('[data-we-delete]').click();
    assert.match(await editor.locator('[data-we-status]').textContent(), /仍被引用/);
    const node = editor.locator('[data-we-node="stardust"]');
    const box = await node.boundingBox();
    await page.mouse.move(box.x + 80, box.y + 35);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await editor.locator('[data-we-copy]').click();
    await editor.locator('[data-we-field="name"]').fill('试制星屑');
    await editor.locator('button[type="submit"]').click();
    await editor.locator('[data-we-apply]').click();
    const customId = await editor.locator('[data-we-field="id"]').inputValue();
    await editor.locator('[data-we-type]').selectOption('progress');
    await editor.locator('[data-we-grant-id]').selectOption(customId);
    await editor.locator('[data-we-grant-number]').fill('7');
    await editor.locator('[data-we-grant]').click();
    await editor.locator('[data-we-type]').selectOption('items');
    const downloadPromise = page.waitForEvent('download');
    await editor.locator('[data-we-export]').click();
    const download = await downloadPromise;
    const exported = path.join(output, 'workshop-export.json');
    await download.saveAs(exported);
    const exportedCatalog = validateWorkshopCatalog(JSON.parse(await readFile(exported, 'utf8')));
    assert.equal(exportedCatalog.items.length, 44);
    assert(exportedCatalog.items[0].position.x > 42);
    await editor.locator('[data-we-file]').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":99}'),
    });
    await page.waitForFunction(() =>
      document.querySelector('[data-we-status]').textContent.includes('版本不支持'),
    );
    await editor.locator('[data-we-file]').setInputFiles(exported);
    await editor.locator('[data-we-apply]').click();
    await editor.locator('[data-we-chain]').click();
    await editor.locator('[data-we-chain-names]').fill('酒馆试酿\n酒馆陈酿\n酒馆珍酿');
    await editor.locator('[data-we-create-chain]').click();
    assert.equal(await editor.locator('[data-we-field="name"]').inputValue(), '酒馆珍酿');
    await page.screenshot({ path: path.join(output, 'workshop-editor.png') });
    await editor.locator('[data-we-undo]').click();
    await editor.locator('[data-we-close]').click();
    const before = (await page.evaluate(() => demo.getLibrary())).inventory;
    await page.locator('[data-ws-close]').click();
    await page.evaluate(() => demo.flushStorage());
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await open();
    assert.equal((await page.evaluate(() => demo.getLibrary())).workshop.items[customId], 7);
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).workshop.stations.collector.count,
      1,
    );
    assert.deepEqual((await page.evaluate(() => demo.getLibrary())).inventory, before);
    assert.equal(await page.locator('[data-ws-node="stardust"] strong').textContent(), '微光星尘');
    await page.locator('[data-ws-tab="inventory"]').click();
    assert.match(await page.locator('.ws-inventory').textContent(), /试制星屑/);
    await page.locator('[data-ws-tab="research"]').click();
    assert.match(await page.locator('.ws-empty').textContent(), /尚未开启/);
    await page.locator('[data-ws-tab="production"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'workshop-production.png') });
    await page.setViewportSize({ width: 960, height: 480 });
    await page.waitForTimeout(300);
    const bounds = await page.locator('#workshop-dialog').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.width <= 960 && bounds.height <= 480);
    const inspectorBounds = await page.locator('.ws-inspector').boundingBox();
    assert(inspectorBounds.width >= 250 && inspectorBounds.height > 200);
    await page.screenshot({ path: path.join(output, 'workshop-mobile-landscape.png') });
    await page.locator('[data-ws-close]').click();
    await page.locator('#ai-close').click();
    await page.evaluate(() => demo.newAdventure());
    await page.locator('#creation-start').click();
    await page.waitForFunction(() => demo.getLibrary().campaign?.version);
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).workshop.items[customId],
      7,
      'Confirming a generated protagonist must retain waiting-game progress',
    );

    // Exercise the actual request wrapper and workshop together, with a held local
    // transport. No service credentials or paid provider are read by this fixture.
    harness = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    harness.on('pageerror', (error) => errors.push(error.message));
    await harness.route('**/src/app.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await harness.goto(baseURL);
    await harness.evaluate(async () => {
      const { createWorkshop } = await import('/src/app/workshop.js');
      const { createRequestControls } = await import('/src/app/request-controls.js');
      const { newLibrary } = await import('/src/ai/library.js');
      const store = new Map();
      const context = {
        storage: {
          getItem: (k) => store.get(k) || null,
          setItem: (k, v) => store.set(k, v),
          flush: async () => {},
        },
        session: { ai: { library: newLibrary(), generationOptions: { developerMode: true } } },
        generation: { save: () => true },
      };
      const workshop = createWorkshop(context),
        pending = new Map(),
        outcomes = [];
      const client = createRequestControls(
        {
          request: (path, _data, { signal }) =>
            new Promise((resolve, reject) => {
              pending.set(path, { resolve, reject });
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
          dispose() {},
        },
        () => null,
        () => workshop,
      );
      window.workshopTest = {
        context,
        workshop,
        client,
        pending,
        outcomes,
        start(path) {
          client.request(path, {}).then(
            () => outcomes.push('success'),
            () => outcomes.push('error'),
          );
        },
      };
    });
    const kinds = ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation', 'map'];
    for (const operation of ['generate', 'models'])
      for (const kind of kinds) {
        const request = operation + '/' + kind;
        await harness.evaluate((p) => window.workshopTest.start(p), request);
        assert.equal(await harness.locator(`[data-workshop-wait="${kind}"]`).count(), 1);
        await harness.locator(`[data-workshop-wait="${kind}"]`).click();
        assert.equal(await harness.locator('#workshop-dialog').isVisible(), true);
        await harness.evaluate((p) => window.workshopTest.pending.get(p).resolve({}), request);
        await harness.locator('#workshop-completion').waitFor({ state: 'visible' });
        assert.match(await harness.locator('#workshop-completion p').textContent(), /已完成/);
        await harness.locator('[data-ws-stay]').click();
        await harness.locator('[data-ws-close]').click();
      }
    await harness.evaluate(() => {
      window.workshopTest.start('generate/chat');
      window.workshopTest.start('generate/map');
    });
    await harness.locator('[data-workshop-wait="chat"]').click();
    await harness.locator('[data-ws-close]').click();
    assert.equal(
      await harness.locator('[data-request-stop]').count(),
      2,
      'Closing workshop must not cancel either request',
    );
    await harness.locator('[data-workshop-wait="map"]').click();
    await harness.evaluate(() =>
      window.workshopTest.pending.get('generate/map').reject(Error('fixture failure')),
    );
    await harness.locator('#workshop-completion').waitFor({ state: 'visible' });
    assert.match(await harness.locator('#workshop-completion p').textContent(), /返回错误/);
    await harness.locator('[data-ws-return]').click();
    await harness.locator('[data-request-stop="chat"]').click();
    await harness.locator('[data-request-stop]').waitFor({ state: 'detached' });
    await harness.evaluate(() => {
      window.workshopTest.start('generate/script');
      document.querySelector('[data-workshop-wait="script"]').click();
      window.workshopTest.workshop.dispose();
      window.workshopTest.client.dispose();
    });
    assert.equal(
      await harness.locator('#workshop-dialog,#workshop-editor,.api-request-control').count(),
      0,
    );
    assert.deepEqual(errors, []);
    return {
      manualProduction: true,
      facilitiesAndPause: true,
      persistentCustomCatalog: true,
      editorHistoryAndDrag: true,
      referenceProtection: true,
      importExportAndChains: true,
      isolatedInventory: true,
      landscape: true,
      all14WaitEntrances: true,
      concurrentCompletionAndAbort: true,
      disposedWithoutLateUI: true,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'workshop-failure.png') });
    if (harness)
      await harness.screenshot({ path: path.join(output, 'workshop-request-failure.png') });
    throw error;
  } finally {
    await page.close();
    await harness?.close();
  }
}
