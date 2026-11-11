import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { tavernPresetFixture } from '../fixtures/ai.js';
import { travelChapterScene } from './chapter-navigation.mjs';
import { abilityFor } from '../../src/catalog.js';
import { buildPlan } from '../planner.js';
import { STARBELL_ENABLED } from '../../src/chapters/starbell-state.js';

async function hiddenChapterChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/generate')) requests.push(request.url());
  });
  await legacySession(page);
  await page.addInitScript(() => {
    if (origin === 'null') return;
    const library = JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1'));
    library.progression.settlements = ['trip-1', 'trip-2'];
    library.progression.pandoraJoined = true;
    library.starbell.phase = 'afternoon';
    library.starbell.flags = ['permit'];
    library.starbell.read = ['morning', 'revelation'];
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
  });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    await page.waitForFunction(() => {
      const frame = document.querySelector('#inn-frame iframe')?.contentWindow;
      return frame?.modelReady && frame.assetPreview;
    });
    const before = await page.evaluate(() => demo.getLibrary().starbell);
    for (const scene of ['street', 'city-center', 'market', 'rampart', 'outskirts', 'tavern']) {
      await travelChapterScene(page, scene);
      for (const id of [
        'chapter-open',
        'chapter-next',
        'chapter-tracker',
        'chapter-panel',
        'chapter-actions',
        'gal-stage',
      ])
        assert.equal(
          await page.locator('#' + id).isVisible(),
          false,
          `${scene}: ${id} stays hidden`,
        );
      const frame = page.frameLocator('#inn-frame iframe');
      if (scene !== 'tavern') {
        assert.equal(await frame.locator('.investigation-target').isVisible(), false);
        assert.equal(await page.locator('#chapter-talk').isVisible(), true);
      }
      if (scene === 'outskirts') {
        await page.setViewportSize({ width: 844, height: 390 });
        await page.screenshot({ path: path.join(output, 'exploration-without-main-quest.png') });
      }
    }
    assert.deepEqual(await page.evaluate(() => demo.getLibrary().starbell), before);
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    return {
      mainQuestHidden: true,
      investigationsHidden: true,
      explorationPreserved: true,
      progressPreserved: true,
    };
  } finally {
    await page.close();
  }
}

/** Pixel landmarks were checked on the full painting, independent of production hitboxes. */
async function locateClue(page, pixel) {
  const point = [pixel[0] / 3762, pixel[1] / 1254];
  const canvas = page.frameLocator('#inn-frame iframe').locator('canvas');
  await canvas.evaluate((canvas, point) => {
    const view = window.streetPreview;
    const image = view.model.panorama.material.map.image;
    const aspect = image.width / image.height;
    view.look((-(point[0] - 0.5) * aspect) / (0.35 * view.state().framing.width), 0);
  }, point);
  await page.waitForFunction(
    () => !document.querySelector('#inn-frame iframe').contentWindow.streetPreview.state().moving,
  );
  return canvas.evaluate((canvas, point) => {
    const view = window.streetPreview,
      camera = view.camera;
    const image = view.model.panorama.material.map.image;
    const aspect = image.width / image.height;
    return {
      x: (((point[0] - 0.5) * aspect - camera.left) / (camera.right - camera.left)) * innerWidth,
      y: ((camera.top - (0.5 - point[1])) / (camera.top - camera.bottom)) * innerHeight,
    };
  }, point);
}

/** Real exterior task replies, live portraits and the shared header on desktop and touch. */
export async function chapterUiChecks({ browser, baseURL, output, includeBattle = false }) {
  if (!STARBELL_ENABLED) return hiddenChapterChecks({ browser, baseURL, output });
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 }, hasTouch: true });
  const errors = [];
  const replies = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  await page.addInitScript(() => {
    const library = JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1') || 'null');
    if (!library) return;
    library.progression.settlements = ['trip-1', 'trip-2'];
    library.progression.pandoraJoined = true;
    library.starbell.phase = 'afternoon';
    library.starbell.flags = ['permit'];
    library.starbell.read = ['morning', 'revelation', 'tracks'];
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({
        developerMode: true,
        skipAiGeneration: false,
      }),
    );
  });
  await page.route('**/api/ai/config', async (route) => {
    const config = await (await route.fetch()).json();
    config['quick-chat'] = {
      ...config['quick-chat'],
      model: 'fixture',
      baseUrl: 'http://127.0.0.1:9999/v1',
      promptPresetId: 'chapter-ui',
    };
    await route.fulfill({ json: config });
  });
  await page.route('**/api/ai/prompts/chapter-ui', (route) =>
    route.fulfill({
      json: { preset: { ...tavernPresetFixture(), id: 'chapter-ui' } },
    }),
  );
  await page.route('**/api/ai/generate/quick-chat', (route) => {
    const input = route.request().postDataJSON();
    assert.deepEqual(
      input.adventure.investigation.found.map((clue) => clue.id),
      ['scales', 'cart'],
    );
    assert(!JSON.stringify(input.adventure.scene.overview).includes('草茎朝道路'));
    if (input.text === '故障')
      return route.fulfill({
        status: 502,
        json: {
          error: '模拟上游失败',
          diagnostic: { rawText: 'upstream failure body' },
        },
      });
    const content =
      '【对白:潘多拉】主人，车辙还没有看清。' +
      '【对白:伊迪斯】别急，我们先看看路边。' +
      '【对白:长景月汐】我留意林子，你们慢慢查。' +
      '【旁白】风吹过草叶，队伍暂时停下。';
    const rawText = `原文第${replies.length + 1}次\n<wanxiang_chat>${content}</wanxiang_chat>`;
    replies.push(rawText);
    return route.fulfill({
      json: {
        content,
        adventure: {
          episodeId: input.adventure.episodeId,
          revision: input.adventure.boss.revision,
          tasks:
            input.text === '完成推理'
              ? input.adventure.goals.map((goal) => ({
                  id: goal.id,
                  status: 'completed',
                  evidence: '玩家将断口、擦痕与车损对应，提出并检验袭击方向。',
                }))
              : [],
          patches: [],
        },
        diagnostic: { kind: 'quick-chat', rawText },
      },
    });
  });
  async function frameReady() {
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow?.modelReady,
      null,
      { timeout: 60000 },
    );
  }
  async function headerRow() {
    const boxes = await Promise.all(
      ['#ai-open', '#chapter-open', '#generation-review'].map((selector) =>
        page.locator(selector).boundingBox(),
      ),
    );
    assert(boxes.every(Boolean));
    const center = boxes[1].y + boxes[1].height / 2;
    assert(
      boxes.every((box) => Math.abs(box.y + box.height / 2 - center) < 4),
      'all controls share the settings row',
    );
    for (const box of boxes) assert(box.x >= 0 && box.x + box.width <= page.viewportSize().width);
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++)
        assert(
          boxes[a].x + boxes[a].width <= boxes[b].x || boxes[b].x + boxes[b].width <= boxes[a].x,
          'header buttons do not overlap',
        );
  }
  async function next() {
    const { width, height } = page.viewportSize();
    if ((await page.locator('#gal-stage').getAttribute('data-typing')) === 'true')
      await page.mouse.click(width / 2, height * 0.4);
    await page.mouse.click(width / 2, height * 0.4);
  }
  async function readStory() {
    for (let index = 0; index < 150; index++) {
      const active = await page
        .locator('#gal-stage')
        .evaluate((node) => !node.hidden && node.dataset.playing === 'true');
      if (!active) return;
      if ((await page.locator('#gal-stage').getAttribute('data-leaving')) === 'true')
        await page.waitForFunction(
          () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
        );
      else await page.locator('.gal-page').click();
    }
    throw Error('story did not finish');
  }
  try {
    await page.goto(baseURL + '/?display=landscape');
    await page.waitForFunction(() => !!window.demo);
    await frameReady();
    await headerRow();
    await page.locator('#generation-review').click();
    assert.match(await page.locator('#latest-api-response textarea').inputValue(), /暂无返回/);
    await page.locator('#latest-api-response button').click();
    await page.locator('#chapter-open').click();
    assert.equal(
      await page.locator('#chapter-panel button').count(),
      1,
      'task introduction has no navigation or archive menu',
    );
    await page.locator('[data-chapter-collapse]').click();
    await travelChapterScene(page, 'outskirts');
    await frameReady();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition.id ===
        'outskirts',
    );
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#chapter-next').innerText(), '调查');
    await page.locator('#chapter-next').click();
    await page.locator('.chapter-investigation-notice').waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(output, 'investigation-start.png') });
    await page.locator('.chapter-investigation-notice').waitFor({ state: 'hidden' });
    assert(await page.locator('#chapter-next').isDisabled());
    async function discover(id) {
      const pixel = id === 'scales' ? [846, 853] : [2910, 741];
      const point = await locateClue(page, pixel);
      const target = page.frameLocator('#inn-frame iframe').locator('.investigation-target');
      if (id === 'scales') {
        await page.mouse.move(point.x, point.y);
        await target.waitFor({ state: 'visible' });
        assert.equal(await target.getAttribute('data-clue'), id);
        assert(
          (
            await target
              .locator('span')
              .evaluate((node) => getComputedStyle(node, '::before').animationName)
          ).includes('investigation-orbit'),
        );
        await page.screenshot({ path: path.join(output, 'clue-hover.png') });
        await target.click();
      } else {
        // Touch has no hover; tapping near the clue still uses the same generous hit area.
        await page.touchscreen.tap(point.x + 20, point.y);
      }
      await page.locator('.chapter-clue-art').waitFor({ state: 'visible' });
      await page.waitForFunction(
        () => document.querySelector('.chapter-clue-art').naturalWidth > 0,
      );
      await page.waitForFunction(
        () => document.querySelector('#gal-stage').dataset.typing === 'false',
      );
      await page.screenshot({ path: path.join(output, id + '.png') });
      await page.locator('[data-gal="close"]').click();
      await page.locator('#gal-stage').waitFor({ state: 'hidden' });
    }
    const grass = await locateClue(page, [1180, 790]);
    await page.mouse.move(grass.x, grass.y);
    await page
      .frameLocator('#inn-frame iframe')
      .locator('.investigation-target')
      .waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'grass-location.png') });
    await page.mouse.move(20, 60);
    await discover('scales');
    assert.equal(await page.locator('#chapter-next').getAttribute('data-progress'), '1/2');
    assert(await page.locator('#chapter-next').isDisabled());
    await discover('cart');
    assert.equal(await page.locator('#chapter-next').getAttribute('data-progress'), '2/2');
    assert(await page.locator('#chapter-next').isEnabled());
    for (const viewport of [
      { width: 1440, height: 836 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await headerRow();
      const actionBox = await page.locator('#chapter-next').boundingBox();
      const talkBox = await page.locator('#chapter-talk').boundingBox();
      assert.equal(actionBox.width, talkBox.width, 'both scene buttons use the same width');
      assert.equal(actionBox.height, talkBox.height, 'both scene buttons use the same height');
      assert(
        actionBox.y > viewport.height * 0.65 &&
          talkBox.y > viewport.height * 0.65 &&
          Math.abs((actionBox.x + talkBox.x + talkBox.width) / 2 - viewport.width / 2) < 5 &&
          Math.abs(actionBox.y + actionBox.height / 2 - talkBox.y - talkBox.height / 2) < 5,
        'investigation and shared chat stay together at bottom center',
      );
      assert.equal(
        await page.frameLocator('#inn-frame iframe').locator('.street-header').innerText(),
        '城外旧哨塔',
      );
      assert(await page.locator('#chapter-tracker').isVisible());
      assert(await page.locator('#scene-visitors-refresh').isVisible());
      assert(
        (await page.evaluate(
          () =>
            document.querySelector('#inn-frame iframe').contentWindow.streetPreview.visitors()
              .characters.length,
        )) > 0,
      );
      assert.equal(
        await page.frameLocator('#inn-frame iframe').locator('[data-kind="调查"]:visible').count(),
        0,
      );
      await page.screenshot({ path: path.join(output, `header-${viewport.width}.png`) });
      await page.locator('#chapter-next').click();
      await page.locator('.chapter-chat-form textarea').fill('我先看看车辙，再听大家的看法。');
      await page.locator('.chapter-chat-form button[type="submit"]').click();
      for (const name of ['潘多拉', '伊蒂丝', '长景月汐']) {
        await page.waitForFunction(
          (name) => document.querySelector('.gal-speaker span').textContent === name,
          name,
        );
        await page.locator(`.gal-cast img.speaking[alt="${name}"]`).waitFor({ state: 'visible' });
        await page.waitForFunction(
          (name) =>
            document.querySelector(`.gal-cast img.speaking[alt="${name}"]`)?.naturalWidth > 0,
          name,
        );
        if (name === '潘多拉') {
          await page.locator('#generation-review').click();
          assert.equal(
            await page.locator('#latest-api-response textarea').inputValue(),
            replies.at(-1),
          );
          await page.locator('#latest-api-response textarea').press('Escape');
          await page.locator('#latest-api-response').waitFor({ state: 'hidden' });
          assert(
            await page.locator('#gal-stage').isVisible(),
            'closing raw reply keeps the story open',
          );
        }
        await next();
      }
      assert.equal(
        await page.locator('.gal-cast img.speaking').count(),
        0,
        'narration dims the cast',
      );
      await page.screenshot({ path: path.join(output, `portraits-${viewport.width}.png`) });
      await next();
      await page.locator('.chapter-chat-form textarea').waitFor({ state: 'visible' });
      await page.locator('[data-gal="close"]').click();
      await page.locator('#gal-stage').waitFor({ state: 'hidden' });
      await headerRow();
      await page.locator('#generation-review').click();
      assert.equal(
        await page.locator('#latest-api-response textarea').inputValue(),
        replies.at(-1),
      );
      await page.locator('#latest-api-response button').click();
    }
    assert.equal(replies.length, 2);
    await page.locator('#chapter-next').click();
    await page.locator('.chapter-chat-form textarea').fill('故障');
    await page.locator('.chapter-chat-form button[type="submit"]').click();
    await page.locator('#chapter-raw').waitFor({ state: 'visible' });
    await page.locator('#chapter-raw button').click();
    await page.locator('#generation-review').click();
    assert.equal(
      await page.locator('#latest-api-response textarea').inputValue(),
      'upstream failure body',
    );
    await page.locator('#latest-api-response button').click();
    await page.locator('[data-gal="close"]').click();
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });
    await travelChapterScene(page, 'market');
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition.id ===
        'market',
    );
    await page.locator('#scene-visitors-refresh').waitFor({ state: 'hidden' });
    assert.match(
      await page.frameLocator('#inn-frame iframe').locator('#street-present-npcs').innerText(),
      /诺薇、米蕾/,
    );
    await page.screenshot({ path: path.join(output, 'present-npcs.png') });
    await page.locator('#chapter-talk').click();
    assert.equal(await page.locator('#gal-stage').getAttribute('data-workspace'), 'chat');
    await page.locator('.gal-people-launcher').click();
    await page.locator('.gal-side').waitFor({ state: 'visible' });
    await page
      .locator('.gal-side')
      .evaluate((node) =>
        Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {}))),
      );
    assert.equal(
      await page.locator('#chat-participants .chat-person strong').first().innerText(),
      '诺薇',
    );
    const selectedIds = await page
      .locator('#chat-participants input:checked')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    for (const id of selectedIds)
      await page.locator(`#chat-participants input[value="${id}"]`).uncheck();
    await page.locator('#chat-participants input[value="starbell-novi"]').check();
    const standing = page.locator('.gal-cast img[alt="诺薇"]');
    await standing.waitFor({ state: 'visible' });
    assert((await standing.getAttribute('data-asset')).includes('/gal-npc-cast/'));
    await standing.evaluate(async (image) => {
      await image.decode();
      await Promise.all(
        image.getAnimations().map((animation) => animation.finished.catch(() => {})),
      );
    });
    assert(
      (
        await page
          .locator('.chat-person')
          .filter({ has: page.locator('input[value="starbell-novi"]') })
          .locator('img')
          .getAttribute('src')
      ).includes('/npc-cards/'),
    );
    const launcher = await page.locator('.gal-people-launcher').boundingBox();
    assert(
      launcher.x > page.viewportSize().width * 0.06 &&
        launcher.x < page.viewportSize().width * 0.2 &&
        launcher.y > page.viewportSize().height / 2,
    );
    assert(launcher.width >= 48 && launcher.height >= 48);
    await page.screenshot({ path: path.join(output, 'shared-chat.png') });
    await page.locator('.gal-side [data-workspace="compose"]').click();
    for (const viewport of [
      { width: 844, height: 390 },
      { width: 1440, height: 836 },
    ]) {
      await page.setViewportSize(viewport);
      await page
        .locator('.gal-composer')
        .evaluate((node) =>
          Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {}))),
        );
      const bounds = await page.locator('#gal-stage').evaluate((stage) => {
        const button = stage.querySelector('.gal-people-launcher').getBoundingClientRect();
        const input = stage.querySelector('#chat-input').getBoundingClientRect();
        return { buttonRight: button.right, inputLeft: input.left };
      });
      assert(
        bounds.buttonRight + 12 <= bounds.inputLeft,
        'the character selector has its own space beside the input',
      );
      await page.screenshot({ path: path.join(output, `shared-composer-${viewport.width}.png`) });
    }
    await page.mouse.click(page.viewportSize().width * 0.6, page.viewportSize().height * 0.4);
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });
    await page.locator('#scene-return-tavern').click();
    await frameReady();
    await page.waitForFunction(
      () => !!document.querySelector('#inn-frame iframe').contentWindow.assetPreview,
    );
    if (includeBattle) {
      await page.setViewportSize({ width: 1440, height: 836 });
      await travelChapterScene(page, 'outskirts');
      await page.locator('#chapter-next').click();
      await page.locator('.chapter-chat-form textarea').fill('完成推理');
      await page.locator('.chapter-chat-form button[type="submit"]').click();
      await page.locator('[data-chapter-confirm]').waitFor({ state: 'attached' });
      await readStory();
      await page.locator('[data-chapter-confirm]').click();
      await readStory();
      await page.locator('#party-panel').waitFor({ state: 'visible' });
      await page.locator('#prepare-done').click();
      await readStory();
      await page.locator('.world-battle-transition').waitFor({ state: 'visible' });
      await page.waitForFunction(
        () => Number(document.querySelector('.world-battle-transition')?.dataset.cellSize) > 5,
      );
      await page.screenshot({ path: path.join(output, 'battle-mosaic.png') });
      await page.waitForFunction(() => demo.getStatus().mode === 'battle', null, {
        timeout: 60000,
      });
      await page.locator('.world-battle-transition').waitFor({ state: 'detached' });
      const settled = () =>
        page.waitForFunction(() => !demo.getStatus().playing && !demo.getStatus().animating, null, {
          timeout: 60000,
        });
      for (let round = 0; round < 20; round++) {
        await settled();
        const current = await page.evaluate(() => demo.getState());
        if (current.phase === 'victory') break;
        assert.notEqual(current.phase, 'defeat');
        for (const action of buildPlan(current)) {
          await settled();
          await page.locator(`[data-start="${action.start}"]`).click();
          if (action.kind === 'swap') {
            await page.locator(`[data-rear="${action.incoming}"]`).click();
            await page.locator(`[data-side="Friendly"][data-slot="${action.slot}"]`).click();
          } else if (action.kind === 'skill') {
            await page.locator(`[data-unit="${action.actor}"]`).click();
            await page.locator(`[data-skill="${action.skill}"]`).first().click();
            if (
              ['enemy', 'ally'].includes(abilityFor(current, action.actor, action.skill).target) &&
              (await page.evaluate(() => demo.getStatus().interactionStep === 'target'))
            )
              await page
                .locator(`[data-unit="${action.target}"],[data-rear="${action.target}"]`)
                .first()
                .click();
          } else throw Error('unexpected action in scout check');
        }
        await page.locator('#commit').click();
      }
      await page.locator('#result-back').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#result-back').innerText(), '结束战斗');
      await page.evaluate(() => {
        window.returnedSceneLoads = [];
        const frame = document.querySelector('#inn-frame iframe');
        new MutationObserver(() => {
          const current = document.querySelector('#inn-frame iframe');
          if (current && current !== frame)
            window.returnedSceneLoads.push(current.getAttribute('src'));
        }).observe(document.querySelector('#inn-frame'), { childList: true });
      });
      await page.locator('#result-back').click();
      await frameReady();
      await page.waitForFunction(
        () =>
          document.querySelector('#inn-frame iframe').contentWindow.streetPreview?.definition.id ===
          'outskirts',
      );
      assert.deepEqual(await page.evaluate(() => window.returnedSceneLoads), [
        './street.html?scene=outskirts',
      ]);
      await readStory();
    }
    const tower = await browser.newPage({ viewport: { width: 1440, height: 836 } });
    try {
      tower.on('pageerror', (error) => errors.push(error.message));
      await legacySession(tower);
      await tower.addInitScript(() => {
        const library = JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1') || 'null');
        library.progression.settlements = ['trip-1', 'trip-2'];
        library.progression.pandoraJoined = true;
        library.starbell.phase = 'day2';
        library.starbell.flags = ['permit', 'tracks', 'cart', 'scout', 'warn'];
        library.starbell.read = ['morning', 'day2'];
        localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
      });
      await tower.goto(baseURL + '/?display=landscape');
      await tower.waitForFunction(
        () =>
          !!window.demo && document.querySelector('#inn-frame iframe')?.contentWindow?.modelReady,
      );
      await tower
        .frameLocator('#inn-frame iframe')
        .locator('#status')
        .waitFor({ state: 'detached', timeout: 60000 });
      const readTower = async () => {
        for (let index = 0; index < 160; index++) {
          if (
            await tower
              .locator('#gal-stage')
              .evaluate((node) => node.hidden || node.dataset.playing !== 'true')
          )
            return;
          if ((await tower.locator('#gal-stage').getAttribute('data-leaving')) === 'true')
            await tower.waitForFunction(
              () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
            );
          else await tower.locator('.gal-page').click();
        }
      };
      await readTower();
      await tower.locator('#inn-frame iframe').evaluate((frame) => {
        frame.src = './street.html?scene=outskirts';
      });
      await tower.waitForFunction(
        () =>
          document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition
            .id === 'outskirts' &&
          document.querySelector('#inn-frame iframe').contentWindow.modelReady,
      );
      assert.equal(
        await tower.locator('#chapter-next').getAttribute('data-chapter-action'),
        'tower',
      );
      await tower.locator('#chapter-next').click();
      await tower.locator('.chapter-investigation-notice').waitFor({ state: 'hidden' });
      for (const [id, pixel] of [
        ['supplies', [1892, 706]],
        ['threshold', [1990, 701]],
        ['rope', [2001, 257]],
      ]) {
        const point = await locateClue(tower, pixel);
        await tower.mouse.move(point.x, point.y);
        const target = tower.frameLocator('#inn-frame iframe').locator('.investigation-target');
        await target.waitFor({ state: 'visible' });
        assert.equal(await target.getAttribute('data-clue'), id);
        await tower.screenshot({ path: path.join(output, 'tower-' + id + '-location.png') });
        await target.click();
        await tower.locator('#gal-stage').waitFor({ state: 'visible' });
        await tower.locator('[data-gal="close"]').click();
        await tower.locator('#gal-stage').waitFor({ state: 'hidden' });
      }
      assert.equal(await tower.locator('#chapter-next').getAttribute('data-progress'), '3/2');
      assert(!(await tower.evaluate(() => demo.getLibrary().starbell.flags)).includes('tower'));
    } finally {
      await tower.close();
    }
    assert.deepEqual(errors, []);
    return {
      oneHeaderRow: true,
      desktopAndMobile: true,
      latestRawInGalAndExploration: true,
      speakerPortraits: 3,
      scoutBattleAndDirectReturn: includeBattle,
      hoverAndTouchClues: true,
      investigationNotice: true,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'error.png') });
    error.message += '\nBrowser errors: ' + errors.join(' | ');
    throw error;
  } finally {
    await page.close();
  }
}

export function chapterBattleChecks(options) {
  return chapterUiChecks({ ...options, includeBattle: true });
}
