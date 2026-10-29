import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { newLibrary, officialCharacter, compileRoster } from '../../src/ai/library.js';
import { normalizeScript } from '../../src/ai/contracts.js';
import { adventureTestScript } from '../../src/content/generation-mode.js';
import { createAdventureState } from '../../src/adventure/state.js';
import { newExpedition, beginEncounter } from '../../src/expedition.js';
import { adventureSnapshot } from '../../src/adventure/snapshot.js';

/** Resume directly into RP to inspect layout and folding without replaying unrelated battles. */
export async function rpLayoutChecks({ browser, baseURL, output }) {
  const results = [];
  for (const node of [1, 3]) {
    const page = await browser.newPage({ viewport: { width: 1193, height: 800 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await legacySession(page);
    const library = newLibrary();
    library.characters.push(officialCharacter('edith'));
    library.party[1] = 'official-edith';
    const book = normalizeScript(adventureTestScript(), `rp-layout-${node}`);
    const trip = newExpedition('bossGate', compileRoster(library));
    const battle = beginEncounter(trip);
    book.runId = trip.id;
    library.scripts.push(book);
    library.history.push({ runId: trip.id, lines: [], played: [], title: book.title });
    trip.adventure = createAdventureState(book);
    trip.index = node;
    const snapshot = adventureSnapshot({
      runtime: { mode: 'event' },
      journey: { expedition: trip },
      battle: { state: battle, plan: [], history: [], playing: false },
      ai: { activeScript: book, storyView: {}, chat: { quick: [] } },
    });
    snapshot.library = library;
    await page.addInitScript((value) => {
      if (origin === 'null') return;
      localStorage.setItem('wanxiang.battle-checkpoint.v1', JSON.stringify(value));
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(value.library));
      localStorage.setItem(
        'wanxiang.generation-options.v1',
        JSON.stringify({ developerMode: true, allowRetreat: false, skipAiGeneration: false }),
      );
    }, snapshot);
    const rawReply = `<wanxiang_chat>【对白:伊蒂丝】这次交流已被记下。</wanxiang_chat>${node === 3 ? '<wanxiang_adventure>本次任务原始标签</wanxiang_adventure>' : ''}`;
    let releaseReply;
    const replyReady = new Promise((resolve) => {
      releaseReply = resolve;
    });
    await page.route('**/api/ai/generate/quick-chat', async (route) => {
      await replyReady;
      return route.fulfill({
        json: {
          content: '【对白:伊蒂丝】这次交流已被记下。',
          ...(node === 3
            ? {
                adventure: {
                  episodeId: trip.id,
                  revision: 0,
                  tasks: [{ id: 'goal-1', status: 'completed', evidence: '这次交流已被记下。' }],
                  patches: [],
                },
              }
            : {}),
          diagnostic: {
            kind: 'quick-chat',
            stage: 'complete',
            rawText: rawReply,
            candidateText: rawReply,
            issues: [],
            repairs: [],
          },
        },
      });
    });
    try {
      await page.goto(baseURL + '/?display=landscape');
      await page.waitForFunction(() => window.demo?.getStatus().mode === 'event');
      await page.locator('#gal-stage[data-workspace="adventure"]').waitFor();
      assert(
        await page.locator('#rp-scene > .rp-content').count(),
        'the narrative remains in its original scene container',
      );
      await page.locator('[data-rp="settings"]').click();
      await page.locator('#ai-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-rp="retreat"]').isVisible(), false);
      await page.locator('[data-ai-tab="game"]').click();
      await page.locator('[data-generation-option="allowRetreat"]').check();
      await page.locator('#ai-close').click();
      assert.equal(await page.locator('[data-rp="retreat"]').isVisible(), true);
      if (node === 1) await page.locator('[data-rp-choice="choice-1"]').click();
      else {
        assert.equal(
          await page.locator('.rp-goals article p').count(),
          0,
          'objectives have no second explanation',
        );
        assert.equal(
          await page.locator('.rp-goals article h2').first().textContent(),
          '找到继续前进的路',
        );
        assert.equal(
          await page.locator('.rp-description').isVisible(),
          true,
          'a short event introduction appears below the title',
        );
        assert((await page.locator('.rp-event-introduction').textContent()).length >= 100);
        assert(await page.locator('h1 + .rp-event-introduction').count());
        assert(
          await page.locator('.rp-event-introduction ~ .rp-goals ~ .rp-environment').count(),
          'introduction precedes objectives and environment observations',
        );
        assert.equal(await page.locator('.rp-environment dt').count(), 3);
        assert((await page.locator('.rp-environment dd').first().textContent()).includes('岗亭'));
      }
      await page.locator('#rp-input').fill('保留这句补充。');
      await page.locator('#rp-input').focus();
      const focused = await page.locator('#rp-input').evaluate((input) => ({
        outline: getComputedStyle(input).outlineStyle,
        shadow: getComputedStyle(input).boxShadow,
      }));
      assert.equal(focused.outline, 'none');
      assert.notEqual(focused.shadow, 'none');
      const icon = await page.locator('[data-rp="send"] svg').boundingBox();
      assert(icon.width >= 18 && icon.height >= 18);
      await page.waitForTimeout(400);
      await page.locator('.rp-content').evaluate((content) => {
        window.rpOriginalContent = content;
        window.rpOriginalInput = document.querySelector('#rp-input');
      });
      const sampling = page.evaluate(
        () =>
          new Promise((resolve) => {
            const samples = [];
            const started = performance.now();
            const sample = () => {
              const content = document.querySelector('.rp-content');
              const rect = content.getBoundingClientRect();
              samples.push({
                width: rect.width,
                x: rect.x,
                top: rect.top,
                height: rect.height,
                visible: getComputedStyle(content).visibility,
                original:
                  content === window.rpOriginalContent && content.parentElement.id === 'rp-scene',
              });
              if (performance.now() - started < 650) requestAnimationFrame(sample);
              else resolve(samples);
            };
            requestAnimationFrame(sample);
          }),
      );
      await page.locator('.gal-composer [data-workspace="exit"]').click();
      const samples = await sampling;
      assert(
        samples.every((sample) => sample.original && sample.visible === 'visible'),
        'folding never detaches or flashes the text',
      );
      assert(
        Math.max(...samples.map((s) => s.width)) - Math.min(...samples.map((s) => s.width)) < 1,
        'folding does not rewrap the text',
      );
      assert(Math.max(...samples.map((s) => s.top)) - Math.min(...samples.map((s) => s.top)) < 1);
      assert(
        samples.some(
          (sample, index) => index && Math.abs(sample.height - samples[index - 1].height) > 0.1,
        ),
        'available space animates instead of jumping',
      );
      await page.locator('[data-rp="compose"]').click();
      await page.waitForTimeout(400);
      assert.equal(await page.locator('#rp-input').inputValue(), '保留这句补充。');
      assert(await page.locator('#rp-input').evaluate((input) => input === window.rpOriginalInput));
      for (const size of [
        { width: 1193, height: 800 },
        { width: 667, height: 375 },
      ]) {
        await page.setViewportSize(size);
        await page.waitForTimeout(400);
        const rect = await page.locator('.rp-content').boundingBox();
        assert(
          rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= size.width &&
            rect.y + rect.height <= size.height,
        );
        const overlaps = await page.evaluate(() => {
          const a = document.querySelector('.rp-tools').getBoundingClientRect();
          const b = document.querySelector('.rp-content').getBoundingClientRect();
          return a.bottom > b.top && a.left < b.right && a.right > b.left;
        });
        assert.equal(overlaps, false, 'toolbar and story occupy separate areas');
        await page.screenshot({ path: path.join(output, `node-${node}-${size.width}.png`) });
      }
      await page.locator('[data-rp="send"]').click();
      assert.equal(await page.locator('.gal-speaker span').textContent(), '提示');
      assert.equal(await page.locator('.gal-text').textContent(), '正在生成回复……');
      assert.equal(await page.locator('.gal-speaker img').isVisible(), false);
      assert.equal(
        await page.locator('.gal-controls').isVisible(),
        false,
        'only the scene header displays the title',
      );
      releaseReply();
      await page.waitForFunction(() => demo.getExpedition().adventure.responses.length === 1);
      const portrait = page.locator('.gal-cast img[data-actor="official-edith"]');
      await portrait.waitFor({ state: 'visible' });
      assert.equal(await page.locator('.gal-speaker span').textContent(), '伊蒂丝');
      await page.screenshot({ path: path.join(output, `reply-${node}-mobile.png`) });
      await page.setViewportSize({ width: 1193, height: 800 });
      assert(await portrait.isVisible(), 'speaker with a Gal portrait is visible on desktop');
      await page.screenshot({ path: path.join(output, `reply-${node}-desktop.png`) });
      for (
        let index = 0;
        index < 30 && (await page.locator('#gal-stage').getAttribute('data-playing')) === 'true';
        index++
      ) {
        if ((await page.locator('#gal-stage').getAttribute('data-leaving')) === 'true')
          await page.waitForFunction(
            () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
          );
        else await page.locator('.gal-page').click();
      }
      assert.equal(await portrait.isVisible(), false, 'portrait clears after the reply finishes');
      if (node === 3) {
        await page.locator('.rp-boss-ready').waitFor({ state: 'visible' });
        assert(await page.locator('[data-rp="boss"]').isVisible());
        await page.setViewportSize({ width: 667, height: 375 });
        await page
          .locator('.rp-boss-ready')
          .evaluate((element) =>
            Promise.all(element.getAnimations().map((animation) => animation.finished)),
          );
        await page.screenshot({ path: path.join(output, 'boss-prompt-mobile.png') });
        await page.locator('[data-rp="stay"]').click();
        const shortcut = page.locator('[data-rp="boss-shortcut"]');
        assert(await shortcut.isVisible());
        assert(await shortcut.isEnabled());
        const bounds = await shortcut.boundingBox();
        assert(
          bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= 667 &&
            bounds.y + bounds.height <= 375,
        );
        await page.screenshot({ path: path.join(output, 'boss-shortcut-mobile.png') });
      }
      await page.locator('[data-rp="raw"]').click();
      await page.locator('#generation-diagnostics').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#diagnostic-raw').inputValue(), rawReply);
      assert.equal(await page.locator('#diagnostic-validate').isVisible(), false);
      await page.locator('#diagnostic-close').click();
      await page.locator('[data-rp="retreat"]').click();
      await page.waitForFunction(() => demo.getStatus().mode === 'inn');
      assert.deepEqual(errors, []);
      results.push({
        node,
        stableTextDuringFold: true,
        settings: true,
        sendIcon: true,
        goldFocus: true,
      });
    } finally {
      await page.close();
    }
  }
  return results;
}
