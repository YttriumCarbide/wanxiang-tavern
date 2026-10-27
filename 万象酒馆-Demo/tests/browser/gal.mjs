import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { dismissAutomaticJournals } from './legacy-session.mjs';
import { galWorkspaceChecks } from './gal-workspace.mjs';

export async function galChecks({ browser, baseURL, output }) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  async function revealPage() {
    await page.evaluate(() => {
      if (document.querySelector('#gal-stage').dataset.typing === 'true')
        document.querySelector('.gal-page').click();
    });
  }
  async function nextPage() {
    await revealPage();
    await page.locator('.gal-page').click();
  }
  async function checkComposition() {
    const viewport = page.viewportSize();
    const reading = await page.locator('.gal-reading').boundingBox();
    const controls = await page.locator('.gal-controls').boundingBox();
    assert(reading.y > viewport.height * 0.5, 'reading stays in the lower part of the scene');
    assert(controls.y + controls.height < reading.y, 'controls do not overlap the text');
    const prose = await page.locator('.gal-page').boundingBox();
    assert(
      prose.x > viewport.width * 0.08,
      'text retains side margins within the full-width gradient',
    );
    const icons = await page.locator('.gal-actionbar button:visible').all();
    const iconBoxes = [];
    for (const icon of icons) {
      assert.equal(await icon.locator('svg').count(), 1);
      const box = await icon.boundingBox();
      assert(
        box.y >= reading.y && box.y + box.height <= reading.y + reading.height,
        'icons stay inside dialogue area',
      );
      iconBoxes.push(box);
    }
    const firstIcon = iconBoxes[0];
    const lastIcon = iconBoxes.at(-1);
    assert(
      Math.abs((firstIcon.x + lastIcon.x + lastIcon.width) / 2 - viewport.width / 2) < 2,
      'icons are centered',
    );
    const sprites = await page.locator('.gal-cast img').all();
    const boxes = [];
    for (const sprite of sprites) {
      const box = await sprite.boundingBox();
      assert(
        box.height >= viewport.height * 0.8 && box.height <= viewport.height * 0.88,
        'portrait matches the reference standing scale',
      );
      assert(box.width <= viewport.width * 0.49, 'portrait retains background space');
      assert(box.y >= controls.y + controls.height - 1, 'portrait clears the top controls');
      if (sprites.length === 1)
        assert(
          Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2,
          'single portrait is centered like the reference',
        );
      assert(box.y + box.height * 0.36 < reading.y, 'face stays above reading area');
      assert(
        Math.abs(box.y + box.height - viewport.height) < 2,
        'portrait reaches screen bottom behind the translucent dialogue',
      );
      boxes.push(box);
    }
    if (boxes.length === 2) {
      boxes.sort((left, right) => left.x - right.x);
      assert(boxes[0].x + boxes[0].width < boxes[1].x, 'two actors remain separated');
    }
  }
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  await dismissAutomaticJournals(page);
  await page.addInitScript(() => {
    if (origin === 'null') return;
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({ developerMode: true, skipAiGeneration: true, galMode: true }),
    );
  });
  const calls = [];
  await page.route('**/api/ai/generate/*', (route) => {
    calls.push(route.request().url());
    return route.fulfill({ status: 500, json: { error: '本地教程不允许调用付费模型' } });
  });
  try {
    await page.goto(baseURL);
    await page.locator('#start-journey').click();
    await page.locator('#creation-start').click();
    await page.locator('#gal-stage').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#gal-stage').evaluate((element) => element.tagName),
      'SECTION',
    );
    assert.equal(await page.locator('#guide-dialogue').isVisible(), false);
    assert.equal(await page.locator('#gal-stage').getAttribute('data-kind'), 'narration');
    await page.locator('.gal-page').click();
    assert((await page.locator('.gal-text').textContent()).includes('白光'));
    await page.screenshot({ path: path.join(output, 'opening-narration.png') });
    await page.locator('.gal-page').click();
    await page.locator('.gal-cast img').waitFor();
    await page.locator('.gal-page').click();
    assert.equal(await page.locator('#gal-stage').getAttribute('data-kind'), 'narration');
    await page.locator('.gal-page').click();
    await page.waitForFunction(
      () => document.querySelector('#gal-stage').dataset.kind === 'dialogue',
    );
    await page.locator('.gal-page').click();
    assert((await page.locator('.gal-speaker').textContent()).includes('伊蒂丝'));
    await page.locator('.gal-cast img').evaluate(async (image) => {
      await image.decode();
      await Promise.all(
        image.getAnimations().map((animation) => animation.finished.catch(() => {})),
      );
    });
    await checkComposition();
    await page.screenshot({ path: path.join(output, 'edith-dialogue.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    for (const selector of ['.gal-controls', '.gal-reading', '.gal-page']) {
      const box = await page.locator(selector).boundingBox();
      assert(
        box.x >= 0 && box.y >= 0 && box.x + box.width <= 845 && box.y + box.height <= 391,
        selector,
      );
    }
    await checkComposition();
    await page.screenshot({ path: path.join(output, 'mobile-gal.png') });
    for (let index = 0; index < 100 && (await page.locator('#gal-stage').isVisible()); index++)
      await page.locator('.gal-page').click();
    assert.equal(await page.locator('#gal-stage').isVisible(), false);
    assert.equal(calls.length, 0);
    assert.notEqual((await page.evaluate(() => demo.getLibrary())).campaign.tutorial, 'arrival');
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
    assert(await page.locator('[data-generation-option="galMode"]').isChecked());
    await page.locator('[data-generation-option="galMode"]').uncheck();
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('wanxiang.generation-options.v1')).galMode,
      ),
      false,
    );
    await page.locator('#ai-close').click();

    // A permanent isolated UI fixture checks sequence behavior without requiring a whole expedition.
    const html = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__gal-fixture', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(new URL('__gal-fixture', baseURL).href);
    await page.evaluate(async () => {
      const [
        { createGalPlayer },
        { createDialogue },
        { createEventScope },
        { newLibrary },
        { createStoryFeed },
      ] = await Promise.all([
        import('/src/app/gal.js'),
        import('/src/app/dialogue.js'),
        import('/src/shared/events.js'),
        import('/src/ai/library.js'),
        import('/src/app/story.js'),
      ]);
      const library = newLibrary();
      library.characters.unshift({
        id: 'gal-player',
        source: 'generated',
        setting: { name: '青缘' },
        combat: { id: 'gal-player', portrait: 'guardian.svg' },
      });
      library.campaign = { protagonistId: library.characters[0].id };
      const session = {
        ai: { library, generationOptions: { developerMode: true, galMode: true } },
        runtime: {},
      };
      const gal = createGalPlayer({ session });
      const events = createEventScope();
      const dialogue = createDialogue(events, 'fixture-dialogue', gal);
      const feed = createStoryFeed(session, () => {}, gal);
      window.galFixture = { gal, dialogue, feed, session, completed: 0 };
      document.querySelector('#chat-dialog').showModal();
      void gal.play(
        '【对白:伊蒂丝】你好。【旁白】灯火微微摇动。【对白:长景月汐】剑已经带好了。【对白:user】出发。【对白:npc:守门人】走左边。【退场:伊蒂丝】【旁白】她走出了酒馆。【对白:潘多拉】主人……',
        { owner: 'fixture', title: '万象 · 星灯之间' },
      );
    });
    await revealPage();
    assert.equal(await page.locator('.gal-cast img.speaking').count(), 1);
    await nextPage();
    assert.equal(await page.locator('#gal-stage').getAttribute('data-kind'), 'narration');
    assert.equal(await page.locator('.gal-cast img.speaking').count(), 0);
    await nextPage();
    await revealPage();
    assert(
      (await page.locator('.gal-cast img.speaking').getAttribute('src')).includes('yuexi-half'),
    );
    await nextPage();
    assert.equal(await page.locator('#gal-stage').getAttribute('data-kind'), 'user');
    assert.equal(await page.locator('.gal-cast img.speaking').count(), 0);
    await nextPage();
    await revealPage();
    assert((await page.locator('.gal-speaker').textContent()).includes('守门人'));
    assert.equal(await page.locator('.gal-cast img.speaking').count(), 0);
    await page.locator('[data-gal="history"]').click();
    assert((await page.locator('.gal-history').textContent()).includes('你好'));
    await page.locator('[data-gal="history-close"]').click();
    await nextPage();
    assert.equal(await page.locator('.gal-cast img.speaking').count(), 0);
    await nextPage();
    await revealPage();
    await page.locator('.gal-cast img.speaking').evaluate(async (image) => {
      await image.decode();
      await Promise.all(
        image.getAnimations().map((animation) => animation.finished.catch(() => {})),
      );
    });
    await checkComposition();
    await page.screenshot({ path: path.join(output, 'two-character-stage.png') });
    await page.locator('[data-gal="close"]').click();
    assert.equal(await page.locator('#gal-stage').isVisible(), false);
    const requestModes = await page.evaluate(async () => {
      const { createRequestControls } = await import('/src/app/request-controls.js');
      const received = [];
      const controls = createRequestControls(
        {
          request: async (path, data) => {
            received.push({ path, data });
            return {};
          },
          dispose() {},
        },
        () => window.galFixture.session.ai.generationOptions,
      );
      await controls.request('generate/chat', { text: '你好' });
      await controls.request('generate/script', { brief: '继续探索' });
      await controls.request('prompts/preview', { kind: 'quick-chat', input: { text: '出发' } });
      controls.dispose();
      return received;
    });
    assert.equal(requestModes[0].data.presentationMode, 'gal');
    assert.equal(requestModes[1].data.presentationMode, 'gal');
    assert.equal(requestModes[2].data.input.presentationMode, 'gal');
    await page.evaluate(() => {
      window.galFixture.dialogue.show(
        [{ speaker: '潘多拉', text: '主人，欢迎回来。' }],
        () => window.galFixture.completed++,
      );
    });
    await revealPage();
    await page.locator('.gal-cast img').evaluate((image) => image.decode());
    await page.screenshot({ path: path.join(output, 'pandora-gal.png') });
    await nextPage();
    assert.equal(await page.evaluate(() => window.galFixture.completed), 1);
    const alpha = await page.evaluate(async () => {
      const results = [];
      for (const key of ['edith', 'pandora', 'yuexi']) {
        const image = new Image();
        image.src = `./assets/gal/${key}-half.png`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        results.push({
          key,
          corner: context.getImageData(0, 0, 1, 1).data[3],
          center: context.getImageData(
            Math.floor(image.width / 2),
            Math.floor(image.height / 2),
            1,
            1,
          ).data[3],
        });
      }
      return results;
    });
    assert(alpha.every((entry) => entry.corner === 0 && entry.center > 180));
    await page.evaluate(() => {
      window.galFixture.feed.dispose();
      window.galFixture.dialogue.dispose();
      window.galFixture.gal.dispose();
    });
    assert.equal(await page.locator('#gal-stage').count(), 0);
    assert.deepEqual(errors, []);
    const workspace = await galWorkspaceChecks({ browser, baseURL, output });
    return {
      originalTutorial: true,
      developerToggle: true,
      mobileLandscape: true,
      narrationAndUser: true,
      missingSprites: true,
      rgba: alpha,
      workspace,
    };
  } finally {
    await page.close();
  }
}
