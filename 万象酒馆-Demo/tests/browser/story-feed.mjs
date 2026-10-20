import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Narrative milestones, selection and modal paging share one isolated browser fixture. */
export async function storyFeedChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const document = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__story-feed-fixture', (route) =>
      route.fulfill({ contentType: 'text/html', body: document }),
    );
    await page.goto(new URL('__story-feed-fixture', baseURL).href);
    await page.evaluate(async () => {
      const [
        { createStoryFeed },
        { createBattleView },
        engine,
        { createEventScope },
        { mountBattleTextSelection },
      ] = await Promise.all([
        import('/src/app/story.js'),
        import('/src/scene.js'),
        import('/src/engine.js'),
        import('/src/shared/events.js'),
        import('/src/app/text-selection.js'),
      ]);
      document.body.classList.add('in-battle');
      document.querySelector('#battle').hidden = false;
      document.querySelector('#inn').hidden = true;
      document.querySelector('#scene-loading').hidden = true;
      document.querySelector('#round-label').textContent = '第 1 回合';
      const record = {
        runId: 'novel-run',
        scriptId: 'novel',
        title: '潮声 · 林中的旧桥',
        tags: ['旧桥'],
        played: [],
        lines: [],
      };
      const session = {
        runtime: { disposed: false, mode: 'battle' },
        ai: {
          generationOptions: { developerMode: true, editArchives: true },
          activeScript: {
            id: 'novel',
            runId: 'novel-run',
            schemaVersion: 4,
            party: [],
            npcs: [
              {
                name: '灰伯',
                appearance: '身穿旧灰袍的清扫老人，额头有许多细纹，眼睛温和，手中握着磨旧的扫帚。',
                history: '他在回廊外清扫多年，熟知这里的残墙与壁画，常在门前等待偶然抵达的旅人。',
                encounter: 0,
              },
            ],
            items: [{ name: '旧铜片', description: '刻着水道方向的铜片', value: 5, encounter: 1 }],
            story: Array.from(
              { length: 5 },
              (_, i) =>
                `小说第${i + 1}段。\n\n“潮声还在。”\n\n${'石阶尽头，一盏灯悬在水面上。风从门缝里穿过，带来潮湿的木头气味。\n\n'.repeat(9)}`,
            ),
            title: '潮声 · 林中的旧桥',
            chapter: 1,
            nextHook: { setting: '一盏未点亮的灯' },
          },
          library: { history: [record], chapter: 1 },
        },
      };
      const state = engine.newBattle();
      const view = await createBattleView(document.querySelector('#stage'), () => {});
      view.draw(state, engine.preview(state, []), null, null);
      const events = createEventScope();
      mountBattleTextSelection({ session, events });
      let saves = 0;
      const feed = createStoryFeed(session, () => saves++);
      session.ai.library.scripts = [session.ai.activeScript];
      const { createRecords } = await import('/src/app/records.js');
      const records = createRecords({
        session,
        events,
        generation: { save: () => saves++ },
        shell: { toast: () => {} },
      });
      feed.reset();
      for (let i = 0; i < 4; i++) {
        feed.showScene(i, 'before');
        feed.showScene(i, 'before');
        feed.showScene(i, 'after');
        feed.showScene(i, 'interlude');
      }
      feed.showScene(4, 'before');
      feed.recordRound(
        { events: [{ logs: ['实际战斗记录'] }] },
        { phase: 'normal', round: 1, encounter: 4 },
      );
      window.storyFixture = { session, record, feed, view, events, records, saves: () => saves };
    });
    assert.equal(await page.locator('#story-feed').isVisible(), false);
    const controls = await page.evaluate(() => {
      const el = document.querySelector('#round-label');
      const range = document.createRange();
      range.selectNodeContents(el);
      getSelection().addRange(range);
      return getComputedStyle(el).userSelect;
    });
    assert.equal(controls, 'none');
    await page.waitForFunction(() => getSelection().isCollapsed);
    await page.locator('#story-toggle').click();
    assert.equal(await page.locator('#story-feed').isVisible(), true);
    assert.equal(await page.locator('#story-pages button').count(), 5);
    assert((await page.locator('#story-lines').textContent()).includes('小说第5段'));
    assert.equal(await page.locator('#story-lines').evaluate((element) => element.scrollTop), 0);
    assert.equal(await page.evaluate(() => !!window.storyFixture.record.complete), false);
    await page.locator('[data-story-page="0"]').click();
    assert((await page.locator('#story-lines').textContent()).includes('小说第1段'));
    assert(!(await page.locator('#story-lines').textContent()).includes('小说第2段'));
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.story-line p'));
      getSelection().addRange(range);
    });
    await page.waitForTimeout(30);
    assert(
      await page.evaluate(() => !getSelection().isCollapsed),
      'Journal prose remains copyable',
    );
    await page.locator('#story-close').click();
    await page.locator('#story-feed').waitFor({ state: 'hidden' });
    assert(await page.evaluate(() => getSelection().isCollapsed));
    const toggle = await page.locator('#story-toggle').boundingBox();
    const round = await page.locator('#round-label').boundingBox();
    assert(round.x + round.width <= toggle.x, 'Round display sits at the left, beside the journal');
    await page.locator('#story-toggle').click();
    await page.locator('#story-next').click();
    assert((await page.locator('#story-lines').textContent()).includes('小说第2段'));
    await page.locator('#story-lines').evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: path.join(output, 'journal-desktop.png') });
    await page.keyboard.press('Escape');
    await page.locator('#story-feed').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#story-feed').isVisible(), false);
    await page.evaluate(() => {
      window.storyFixture.feed.showScene(4, 'after');
      window.storyFixture.feed.showScene(4, 'after');
    });
    const result = await page.evaluate(() => ({
      pages: window.storyFixture.session.ai.storyView.pages.map((page) =>
        page.map((line) => line.text),
      ),
      record: window.storyFixture.record,
      chapter: window.storyFixture.session.ai.library.chapter,
    }));
    assert(result.pages.every((page) => page.length === 1));
    assert(result.record.complete && result.chapter === 2);
    assert(result.record.lines.some((line) => line.stage === 'combat'));
    assert.equal(result.record.nextHook.setting, '一盏未点亮的灯');
    await page.evaluate(() => {
      document.querySelector('#result').showModal();
      window.storyFixture.feed.openStory();
    });
    assert(await page.locator('#story-feed').isVisible());
    await page.locator('#story-close').click();
    await page.locator('#story-feed').waitFor({ state: 'hidden' });
    assert(
      await page.locator('#result').isVisible(),
      'Closing the journal restores the result dialog below it',
    );
    await page.evaluate(() => document.querySelector('#result').close());
    await page.setViewportSize({ width: 844, height: 390 });
    const phoneToggle = await page.locator('#story-toggle').boundingBox();
    const phoneRound = await page.locator('#round-label').boundingBox();
    assert(phoneRound.x + phoneRound.width <= phoneToggle.x);
    await page.locator('#story-toggle').click();
    const box = await page.locator('#story-feed').boundingBox();
    assert(box.x > 0 && box.y > 0 && box.width > 844 * 0.75 && box.width < 844 && box.height < 390);
    assert(await page.locator('#story-lines').evaluate((el) => el.scrollHeight > el.clientHeight));
    await page.locator('[data-story-page="0"]').click();
    await page.locator('#story-lines').evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: path.join(output, 'journal-landscape.png') });
    await page.locator('#story-close').click();
    await page.locator('#story-feed').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#archives-open').click();
    assert.equal(await page.locator('#archive-list button').count(), 1);
    assert((await page.locator('.archive-sources').textContent()).includes('潮声 · 林中的旧桥'));
    await page.locator('#archive-text button').filter({ hasText: '调整设定' }).click();
    await page
      .locator('#archive-text textarea')
      .fill('外貌：灰袍老人。经历：曾经修缮过旧桥，现在守护回廊入口。');
    await page.locator('#archive-text button').filter({ hasText: '保存修改' }).click();
    await page.screenshot({ path: path.join(output, 'npc-archive-editor.png') });
    assert(
      (
        await page.evaluate(() => window.storyFixture.session.ai.library.archives.npcs[0].content)
      ).includes('修缮过旧桥'),
    );
    await page.locator('[data-archive-tab="items"]').click();
    assert((await page.locator('.archive-sources').textContent()).includes('价值 5 以太'));
    await page.locator('#archive-close').click();
    await page.locator('#records-open').click();
    await page.locator('#records-edit').click();
    await page.locator('#records-text input').nth(1).fill('旧桥，回廊');
    await page.locator('#records-text textarea').first().fill('编辑后的第一场已确认正文。');
    await page.locator('#records-text button').click();
    const edited = await page.evaluate(() => ({
      record: window.storyFixture.record,
      book: window.storyFixture.session.ai.activeScript,
    }));
    assert.deepEqual(edited.record.tags, ['旧桥', '回廊']);
    assert.equal(edited.book.story[0], '编辑后的第一场已确认正文。');
    assert(!edited.record.lines[0].summary);
    await page.evaluate(() => {
      window.storyFixture.session.runtime.mode = 'inn';
    });
    await page.locator('#records-delete').click();
    assert.equal(await page.locator('#records-list button').count(), 0);
    assert.equal(
      await page.evaluate(() => window.storyFixture.session.ai.library.scripts.length),
      0,
    );
    await page.locator('#records-close').click();
    await page.evaluate(() => {
      window.storyFixture.feed.dispose();
      window.storyFixture.records.dispose();
      window.storyFixture.view.dispose();
      window.storyFixture.events.dispose();
    });
    assert.deepEqual(errors, []);
    return {
      fiveIndependentPages: true,
      defaultCollapsed: true,
      noFutureSpoilers: true,
      finalProseAtBossStart: true,
      duplicateMilestonesPrevented: true,
      combatFactsKeptOutsideProse: true,
      dismissAndKeyboard: true,
      selectableProseOnly: true,
      phoneLandscape: true,
      errors,
    };
  } finally {
    await page.close();
  }
}
