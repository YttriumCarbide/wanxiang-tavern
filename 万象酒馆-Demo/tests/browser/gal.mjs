import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { dismissAutomaticJournals } from './legacy-session.mjs';
import { galWorkspaceChecks } from './gal-workspace.mjs';

async function checkGalReactions(page) {
  const stage = page.locator('#gal-stage');
  const prose = stage.locator('.gal-text');
  const portraits = stage.locator('.gal-cast img');
  const advance = () =>
    stage.evaluate((element) => {
      const button = element.querySelector('.gal-page');
      if (element.dataset.typing === 'true') button.click();
      button.click();
    });
  const reveal = () =>
    stage.evaluate((element) => {
      if (element.dataset.typing === 'true') element.querySelector('.gal-page').click();
    });
  async function assertReaction(
    actor,
    symbol,
    moving = false,
    nudging = false,
    transform = '',
    expectedCast = [edith, yuexi],
  ) {
    const state = await stage.evaluate((element) => ({
      cast: [...element.querySelectorAll('.gal-cast img')]
        .filter((image) => !image.closest('.gal-portrait-slot').dataset.leaving)
        .map((image) => image.dataset.actor)
        .sort(),
      emoting: [...element.querySelectorAll('.gal-portrait-slot[data-emote]')].map(
        (slot) => slot.dataset.actor,
      ),
      cues: [...element.querySelectorAll('.gal-emote:not([hidden])')].map((bubble) => ({
        actor: bubble.closest('.gal-portrait-slot').dataset.actor,
        symbol: bubble.textContent,
        moving: bubble.getAnimations().length > 0,
      })),
      gestures: [...element.querySelectorAll('.gal-portrait-slot')]
        .map((slot) => {
          const animations = slot.querySelector('.gal-portrait-reaction').getAnimations();
          return {
            actor: slot.dataset.actor,
            transforms: animations
              .flatMap((animation) => animation.effect?.getKeyframes() || [])
              .map((frame) => frame.transform)
              .filter(Boolean),
            animated: animations.length > 0,
          };
        })
        .filter((gesture) => gesture.animated),
      speaking: element.querySelector('.gal-cast img.speaking')?.dataset.actor || '',
      nudging: element.querySelector('.gal-reading').getAnimations().length > 0,
    }));
    assert.deepEqual(state.cast, [...expectedCast].sort(), 'only stage portraits remain active');
    assert.deepEqual(
      state.emoting,
      moving ? [actor] : [],
      'only an active reaction owns an emote state',
    );
    assert.deepEqual(state.cues, actor && symbol ? [{ actor, symbol, moving }] : []);
    assert.deepEqual(
      state.gestures.map((gesture) => gesture.actor),
      moving ? [actor] : [],
      'only the tagged speaker receives a portrait Web Animation',
    );
    assert.equal(state.nudging, nudging, 'only alert and shake nudge the dialogue band');
    if (actor) assert.equal(state.speaking, actor, 'the active speaker owns the reaction');
    if (moving && transform)
      assert(
        state.gestures[0].transforms.some((frame) => frame.includes(transform)),
        `the ${actor} reaction animates ${transform}`,
      );
  }

  const line = '甲，乙——丙丁。';
  const dialogue = (speaker, emotion, text = line) =>
    `【对白:${speaker}${emotion ? `|${emotion}` : ''}】${text}`;
  const scene = [
    '【登场:伊蒂丝】【登场:official-aegis】【旁白】A。',
    dialogue('伊蒂丝', 'hop', 'B'.repeat(90)),
    dialogue('official-aegis', 'hop:alert'),
    dialogue('伊蒂丝', 'shake'),
    dialogue('伊蒂丝', '', 'C。'),
    dialogue('official-aegis', 'question'),
    dialogue('official-aegis', '', 'F。'),
    dialogue('official-aegis', '', line),
    dialogue('伊蒂丝', 'hop:note'),
    dialogue('official-aegis', 'sweat'),
    dialogue('伊蒂丝', 'lean'),
    dialogue('official-aegis', 'back'),
    dialogue('伊蒂丝', 'nod'),
    dialogue('official-aegis', 'sway'),
    dialogue('official-aegis', 'question'),
    dialogue('official-aegis', '', 'G。'),
    dialogue('伊蒂丝', 'hop', 'H。'),
    '【退场:伊蒂丝】',
    dialogue('official-aegis', '', 'I。'),
    dialogue('伊蒂丝', 'question', 'J。'),
    '【清场】',
    dialogue('official-aegis', '', 'K。'),
  ].join('');
  const clockStart = Date.UTC(2026, 0, 1);
  await page.clock.install({ time: clockStart });
  await page.evaluate((scene) => {
    void window.galFixture.gal.play(scene, { owner: 'dialogue-reactions' });
  }, scene);
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('#gal-stage .gal-cast img')];
    return images.length === 2 && images.every((image) => image.complete && image.naturalWidth);
  });
  await portraits.evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  const [edith, yuexi] = await portraits.evaluateAll((images) =>
    images.map((image) => image.dataset.actor),
  );
  await page.clock.pauseAt(clockStart + 60_000);
  try {
    await advance();
    await assertReaction(edith, '✨', true, false, 'translateY(-20px)');
    await advance();
    await assertReaction(); // A later page of one tagged beat must not replay its reaction.
    await advance();
    await assertReaction(yuexi, '❗', true, true, 'translateY(-20px)');
    await advance();
    await assertReaction(edith, '💢', true, true, 'translateX(-6px)');
    await page.evaluate(() => {
      window.galFixture.motionPreferenceChanged = new Promise((resolve) => {
        matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', resolve, {
          once: true,
        });
      });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(async () => {
      await window.galFixture.motionPreferenceChanged;
      delete window.galFixture.motionPreferenceChanged;
    });
    await assertReaction(edith, '💢'); // The symbol remains but all reaction motion stops.
    await advance();
    await reveal();
    await assertReaction(); // Untagged dialogue never auto-triggers in reduced-motion mode.
    assert.equal(await prose.textContent(), 'C。');
    await advance();
    await reveal();
    await assertReaction(yuexi, '❓'); // Reduced motion keeps the question symbol static.
    assert.equal(await prose.textContent(), line);
    await advance();
    await reveal();
    await assertReaction(); // A following untagged page stays reaction-free.
    assert.equal(await prose.textContent(), 'F。');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await advance();
    await page.clock.runFor(16);
    assert.equal(await prose.textContent(), '甲', 'untagged text keeps the normal pace');
    await assertReaction();
    await advance();
    await assertReaction(edith, '🎵', true, false, 'translateY(-20px)');
    await page.clock.runFor(16);
    assert.equal(await prose.textContent(), '甲，', 'the energetic line reaches the comma first');
    await advance();
    await assertReaction(yuexi, '💧', true, false, 'translateY(18px)');
    await page.clock.runFor(350);
    assert.equal(await prose.textContent(), '甲，', 'hesitation pauses after the comma');
    await page.clock.runFor(170);
    assert.equal(await prose.textContent(), '甲，乙——', 'the paired dash gets one pause');
    await page.clock.runFor(650);
    assert.equal(await prose.textContent(), line);
    await assertReaction();
    await advance();
    await assertReaction(edith, null, true, false, 'scale(1.08)');
    await advance();
    await assertReaction(yuexi, null, true, false, 'scale(0.95)');
    await advance();
    await assertReaction(edith, null, true, false, 'translateY(6px)');
    await advance();
    await assertReaction(yuexi, '…', true, false, 'translateX(-6px)');
    const swayFilters = await stage
      .locator('[data-emote="sway"] .gal-portrait-reaction')
      .evaluate((portrait) =>
        portrait
          .getAnimations()
          .flatMap((animation) => animation.effect.getKeyframes().map(({ filter }) => filter)),
      );
    assert(swayFilters.includes('brightness(0.75)'), 'silence briefly dims only its portrait');
    await advance();
    await assertReaction(yuexi, '❓', true, false, 'rotate(3deg)');
    await reveal();
    assert.equal(await prose.textContent(), line);
    await advance();
    await reveal();
    await assertReaction();
    assert.equal(await prose.textContent(), 'G。');

    await advance();
    await assertReaction(edith, '✨', true, false, 'translateY(-20px)');
    await advance();
    await assertReaction(null, null, false, false, '', [yuexi]); // Exit clears the former speaker's reaction.
    await advance();
    await assertReaction(edith, '❓', true, false, 'rotate(3deg)'); // Her next line brings her back.
    await advance();
    await assertReaction(null, null, false, false, '', [yuexi]); // Scene clear cancels the prior reaction.
    await reveal();
    assert.equal(await prose.textContent(), 'K。');
  } finally {
    await page.clock.resume();
  }
  await stage.locator('[data-gal="close"]').click();
  await stage.waitFor({ state: 'hidden' });
}

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
    if ((await page.locator('#gal-stage').getAttribute('data-leaving')) === 'true')
      await page.waitForFunction(
        () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
      );
  }
  async function waitForSpeakerPortrait() {
    await page.waitForFunction(() => {
      const image = document.querySelector('.gal-cast img.speaking');
      return image?.complete && image.naturalWidth > 0;
    });
  }
  async function checkComposition() {
    const decoration = await page.locator('.gal-reading').evaluate((element) => ({
      blur: getComputedStyle(element).backdropFilter,
      shadow: getComputedStyle(element).boxShadow,
      pageBlur: getComputedStyle(element.querySelector('.gal-page')).backdropFilter,
    }));
    assert.deepEqual(
      decoration,
      { blur: 'none', shadow: 'none', pageBlur: 'none' },
      'Gal keeps its original transparent reading band without button-shaped background blur',
    );
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
      JSON.stringify({ developerMode: true, skipAiGeneration: true, galMode: false }),
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
    for (
      let index = 0;
      index < 20 && (await page.locator('#gal-stage').getAttribute('data-kind')) !== 'dialogue';
      index++
    )
      await nextPage();
    await revealPage();
    assert((await page.locator('.gal-speaker').textContent()).includes('伊蒂丝'));
    // The asset store assigns a blob URL asynchronously, after creating the portrait node.
    const portrait = '.gal-cast img.speaking';
    await page.waitForFunction((selector) => {
      const image = document.querySelector(selector);
      return image?.complete && image.naturalWidth > 0;
    }, portrait);
    await page.locator(portrait).evaluate(async (image) => {
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
      await nextPage();
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });
    assert.equal(calls.length, 0);
    assert.notEqual((await page.evaluate(() => demo.getLibrary())).campaign.tutorial, 'arrival');
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
    assert.equal(await page.locator('[data-generation-option="galMode"]').count(), 0);
    await page.locator('[data-generation-option="developerMode"]').uncheck();
    assert(await page.locator('body').evaluate((body) => body.classList.contains('gal-mode')));
    assert.equal(
      await page.evaluate(() =>
        Object.hasOwn(
          JSON.parse(localStorage.getItem('wanxiang.generation-options.v1')),
          'galMode',
        ),
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
        ai: {
          library,
          generationOptions: { developerMode: true, galMode: true },
          activeScript: {
            npcs: [
              {
                id: 'npc-1',
                name: '守门人',
                appearance: '成年男性，城门守卫，穿着青蓝色制服与轻甲。',
              },
            ],
          },
        },
        runtime: {},
      };
      const { createAssetStore } = await import('/src/shared/asset-store.js');
      const assets = createAssetStore();
      const gal = createGalPlayer({ session, assets });
      const events = createEventScope();
      const dialogue = createDialogue(events, 'fixture-dialogue', gal);
      const feed = createStoryFeed(session, () => {}, gal);
      window.galFixture = { gal, dialogue, feed, session, assets, completed: 0 };
      document.querySelector('#ai-dialog').showModal();
      void gal.play(
        '【对白:伊蒂丝】你好。【旁白】灯火微微摇动。【对白:长景月汐】剑已经带好了。【对白:user】出发。【对白:npc:守门人|guardWoman】走左边。【退场:伊蒂丝】【旁白】她走出了酒馆。【对白:潘多拉】主人……',
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
      (await page.locator('.gal-cast img.speaking').getAttribute('data-asset')).includes(
        'yuexi-full',
      ),
    );
    await nextPage();
    assert.equal(await page.locator('#gal-stage').getAttribute('data-kind'), 'user');
    assert.equal(await page.locator('.gal-cast img.speaking').count(), 0);
    await nextPage();
    await revealPage();
    assert((await page.locator('.gal-speaker').textContent()).includes('守门人'));
    await waitForSpeakerPortrait();
    assert(
      (await page.locator('.gal-cast img.speaking').getAttribute('data-asset')).includes(
        'town-guard-woman.png',
      ),
    );
    await page.locator('[data-gal="history"]').click();
    const transcript = page.getByRole('region', { name: '本次对话' });
    assert.deepEqual(await transcript.locator('li strong').allTextContents(), [
      '伊蒂丝',
      '旁白',
      '长景月汐',
      '青缘',
      '守门人',
    ]);
    assert.equal(await transcript.locator('li p').first().textContent(), '你好。');
    await page.keyboard.press('Escape');
    await transcript.waitFor({ state: 'hidden' });
    await nextPage();
    assert.equal(await page.locator('.gal-cast img.speaking').count(), 0);
    await nextPage();
    await revealPage();
    await waitForSpeakerPortrait();
    await page.locator('.gal-cast img.speaking').evaluate(async (image) => {
      await Promise.all(
        image.getAnimations().map((animation) => animation.finished.catch(() => {})),
      );
    });
    await checkComposition();
    await page.screenshot({ path: path.join(output, 'two-character-stage.png') });
    await page.evaluate(() => {
      const target = document.createElement('button');
      target.id = 'gal-exit-target';
      target.textContent = '下一屏';
      target.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647';
      target.addEventListener('click', () => {
        target.dataset.clicked = 'true';
      });
      document.querySelector('#ai-dialog').append(target);
    });
    await page.locator('[data-gal="close"]').click();
    await page.waitForFunction(
      () => document.querySelector('#gal-stage')?.dataset.leaving === 'true',
    );
    const exitState = await page.locator('#gal-stage').evaluate((element) => ({
      inert: element.inert,
      ariaHidden: element.getAttribute('aria-hidden'),
      pointerEvents: getComputedStyle(element).pointerEvents,
      parentIsBody: element.parentElement === document.body,
      galPlaying: document.body.classList.contains('gal-playing'),
      targetAtPoint: (() => {
        const rect = document.querySelector('#gal-exit-target').getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.id;
      })(),
    }));
    assert.equal(exitState.inert, true);
    assert.equal(exitState.ariaHidden, 'true');
    assert.equal(exitState.pointerEvents, 'none');
    assert.equal(exitState.parentIsBody, true);
    assert.equal(exitState.galPlaying, false);
    assert.equal(exitState.targetAtPoint, 'gal-exit-target');
    await page.locator('#gal-exit-target').click();
    assert.equal(await page.locator('#gal-exit-target').getAttribute('data-clicked'), 'true');
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });
    await page.locator('#gal-exit-target').evaluate((element) => element.remove());
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
    await page.setViewportSize({ width: 844, height: 390 });
    const speech =
      '先别急着开门，门后的脚步一直停在同一个地方。我们先把灯放低，看看地上的影子会不会跟着动。要是影子还在原地，就沿着左边的石阶走，记得留意身后的动静。';
    const narration =
      '她把书压在桌角，侧耳听了一会儿，随后轻轻推开身旁的木椅。走廊里的灯晃了两下，细小的灰尘从门框上落下来。门后的人没有回应，只有衣料擦过石墙的声音。';
    await page.evaluate(
      ({ speech, narration }) => {
        void window.galFixture.gal.play(`【对白:伊蒂丝】${speech}【旁白】${narration}`, {
          owner: 'short-pages',
          onComplete: () => window.galFixture.completed++,
        });
      },
      { speech, narration },
    );
    await revealPage();
    const firstPage = await page.locator('.gal-text').textContent();
    await nextPage();
    await revealPage();
    assert((await page.locator('.gal-speaker span').textContent()).includes('伊蒂丝'));
    assert.notEqual(await page.locator('.gal-text').textContent(), firstPage);
    await page.locator('[data-gal="back"]').click();
    await revealPage();
    assert.equal(await page.locator('.gal-text').textContent(), firstPage);
    await page.screenshot({ path: path.join(output, 'short-page-dialogue.png') });
    const chunks = { dialogue: [], narration: [] };
    for (let index = 0; index < 30 && (await page.locator('#gal-stage').isVisible()); index++) {
      await revealPage();
      const type = await page.locator('#gal-stage').getAttribute('data-kind');
      const text = await page.locator('.gal-text').textContent();
      assert(Array.from(text).length <= (type === 'dialogue' ? 48 : 60));
      chunks[type].push(text);
      await nextPage();
    }
    assert(chunks.dialogue.length > 1 && chunks.narration.length > 1);
    assert.equal(chunks.dialogue.join(''), speech);
    assert.equal(chunks.narration.join(''), narration);
    assert.equal(await page.evaluate(() => window.galFixture.completed), 2);
    await page.evaluate(() => {
      const result = document.querySelector('#result');
      result.showModal();
      window.galFixture.dialogue.show([
        {
          speaker: '伊蒂丝 · Lv.2',
          text: '记住了。下一次，我会更稳一些。',
          bonuses: ['hp +2', '技能伤害 +1'],
        },
      ]);
    });
    await revealPage();
    assert.equal(await page.locator('#fixture-dialogue').isVisible(), false);
    assert.equal(
      await page.locator('#gal-stage').evaluate((node) => node.parentElement.id),
      'result',
    );
    assert.equal(await page.locator('.gal-cast img.speaking').count(), 1);
    assert((await page.locator('.gal-speaker span').textContent()).includes('Lv.2'));
    assert((await page.locator('.gal-bonuses').textContent()).includes('hp +2'));
    const host = await page.locator('#result').evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      filter: getComputedStyle(node).backdropFilter,
      backdrop: getComputedStyle(node, '::backdrop').backdropFilter,
      bounds: {
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      },
    }));
    assert.equal(host.background, 'rgba(0, 0, 0, 0)');
    assert.equal(host.filter, 'none');
    assert.equal(host.backdrop, 'none');
    assert(host.bounds.width >= 843 && host.bounds.height >= 389);
    assert.equal(
      await page.locator('#chat-dialog').count(),
      0,
      'the old chat modal has been removed',
    );
    await page.locator('#result').evaluate((node) =>
      Promise.all(
        node
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    await page.screenshot({ path: path.join(output, 'gal-level-up-mobile.png') });
    await nextPage();
    await page.evaluate(() => document.querySelector('#result').close());
    const alpha = await page.evaluate(async () => {
      const results = [];
      const { TAVERN_VISITORS, standingSprite } = await import('/src/content/tavern-visitors.js');
      for (const definition of TAVERN_VISITORS) {
        const key = definition.id;
        const image = new Image();
        image.src = standingSprite(definition);
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      void window.galFixture.gal.play('【旁白】减少动态退场检查。', {
        owner: 'reduced-motion-exit',
      });
    });
    await page.locator('#gal-stage').waitFor({ state: 'visible' });
    await page.locator('[data-gal="close"]').click();
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#gal-stage').getAttribute('data-leaving'), null);
    assert.equal(
      await page.locator('body').evaluate((body) => body.classList.contains('gal-playing')),
      false,
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.evaluate(() => {
      void window.galFixture.gal.play('【旁白】退场重开检查。', { owner: 'exit-reopen' });
    });
    await page.locator('#gal-stage').waitFor({ state: 'visible' });
    await page.locator('[data-gal="close"]').click();
    await page.waitForFunction(
      () => document.querySelector('#gal-stage')?.dataset.leaving === 'true',
    );
    await page.evaluate(() => {
      window.galFixture.gal.workspace({
        owner: 'reopened-workspace',
        title: '重新打开',
        actors: [],
        selection: [],
        composer: [],
        auxiliary: [],
        history: [],
      });
    });
    const reopenedState = await page.locator('#gal-stage').evaluate((element) => ({
      leaving: element.dataset.leaving,
      inert: element.inert,
      ariaHidden: element.getAttribute('aria-hidden'),
      galPlaying: document.body.classList.contains('gal-playing'),
    }));
    assert.equal(reopenedState.leaving, undefined);
    assert.equal(reopenedState.inert, false);
    assert.equal(reopenedState.ariaHidden, 'false');
    assert.equal(reopenedState.galPlaying, true);
    await page.locator('[data-gal="close"]').click();
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });

    await checkGalReactions(page);
    await page.evaluate(() => {
      window.galFixture.feed.dispose();
      window.galFixture.dialogue.dispose();
      void window.galFixture.gal.play('【对白:伊蒂丝|hop】X。', { owner: 'dispose-during-exit' });
    });
    await page.locator('#gal-stage').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#gal-stage [data-emote="hop"]'));
    await page.locator('[data-gal="close"]').click();
    await page.waitForFunction(
      () => document.querySelector('#gal-stage')?.dataset.leaving === 'true',
    );
    const exitReaction = await page.locator('#gal-stage').evaluate((element) => ({
      taggedSlots: element.querySelectorAll('.gal-portrait-slot[data-emote]').length,
      visibleSymbols: element.querySelectorAll('.gal-emote:not([hidden])').length,
      reactionAnimations: [...element.querySelectorAll('.gal-portrait-reaction')].reduce(
        (count, portrait) => count + portrait.getAnimations().length,
        0,
      ),
    }));
    assert.deepEqual(exitReaction, { taggedSlots: 0, visibleSymbols: 0, reactionAnimations: 0 });
    await page.evaluate(() => window.galFixture.gal.dispose());
    assert.equal(await page.locator('#gal-stage').count(), 0);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#gal-stage').count(), 0);
    assert.deepEqual(errors, []);
    const workspace = await galWorkspaceChecks({ browser, baseURL, output });
    return {
      originalTutorial: true,
      ordinaryPlayDefaultsToGal: true,
      normalExitPassThrough: true,
      reducedMotionExit: true,
      dialogueReactionsAndCadence: true,
      exitReopen: true,
      disposeDuringExit: true,
      retiredToggleRemoved: true,
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
