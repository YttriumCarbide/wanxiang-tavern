import { travelChapterScene, clickChapterAction } from './chapter-navigation.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { tavernPresetFixture } from '../fixtures/ai.js';
import { abilityFor } from '../../src/catalog.js';
import { buildPlan } from '../planner.js';

/** Five actual battles and recoverable outdoor conversations; no paid requests. */
export async function starbellStoryChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  const calls = [];
  await page.addInitScript(() => {
    const library = JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1') || 'null');
    if (library && !library.progression.settlements.length) {
      library.progression.settlements = ['trip-1', 'trip-2'];
      library.progression.pandoraJoined = true;
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    }
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({ developerMode: true, allowRetreat: true, skipAiGeneration: false }),
    );
  });
  await page.route('**/api/ai/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config['quick-chat'] = {
      ...config['quick-chat'],
      baseUrl: 'http://127.0.0.1:9999/v1',
      model: 'fixture',
      promptPresetId: 'chapter-fixture',
    };
    await route.fulfill({ json: config });
  });
  await page.route('**/api/ai/prompts/chapter-fixture', (route) =>
    route.fulfill({ json: { preset: { ...tavernPresetFixture(), id: 'chapter-fixture' } } }),
  );
  await page.route('**/api/ai/generate/quick-chat', (route) => {
    const input = route.request().postDataJSON();
    const turn = input.adventure;
    calls.push(input);
    const partial = input.text.includes('只观察');
    return route.fulfill({
      json: {
        content: partial
          ? '【旁白】泥地上有新旧交叠的车辙，还不能确定异常的来源。'
          : '【对白:伊蒂丝】我们核对了现场和口述，事情有了明确结果。',
        ...(turn?.mode === 'quest'
          ? {
              adventure: {
                episodeId: input.text.includes('错误格式') ? 'wrong-stage' : turn.episodeId,
                revision: turn.boss.revision,
                tasks: partial
                  ? []
                  : turn.goals.map((goal) => ({
                      id: goal.id,
                      status: 'completed',
                      evidence: '本轮按提出的行动核对实物，获得明确回应并落实安排。',
                    })),
                patches: [],
              },
            }
          : {}),
      },
    });
  });
  const state = () => page.evaluate(() => demo.getLibrary().starbell);
  async function read() {
    for (let index = 0; index < 700; index++) {
      const stage = await page.locator('#gal-stage').evaluate((node) => ({
        hidden: node.hidden,
        playing: node.dataset.playing,
        leaving: node.dataset.leaving,
      }));
      if (stage.hidden || stage.playing === 'false') break;
      if (stage.leaving === 'true')
        await page.waitForFunction(
          () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
        );
      else await page.locator('.gal-page').click();
    }
    await page.waitForTimeout(40);
  }
  async function travel(id) {
    await travelChapterScene(page, id, read);
  }
  async function action(id) {
    await clickChapterAction(page, id);
    await read();
    if (['tracks', 'warn', 'tower', 'defense', 'evacuation', 'aid', 'barricade'].includes(id)) {
      assert.equal(await page.locator('.chapter-chat-progress dl dt').count(), 4);
      const submit = async (text) => {
        const waiting = page.waitForResponse((response) =>
          response.url().endsWith('/api/ai/generate/quick-chat'),
        );
        await page.locator('.chapter-chat-form textarea').fill(text);
        await page.locator('.chapter-chat-form button').click();
        await waiting;
        await page.waitForTimeout(150);
        await read();
      };
      if (id === 'tracks') {
        await submit('我只观察路边的车辙。');
        assert.equal(await page.locator('[data-chapter-confirm]').count(), 0);
        await submit('错误格式');
        assert.equal(await page.locator('.chapter-chat-form textarea').inputValue(), '错误格式');
        assert.match(await page.locator('.gal-feedback').innerText(), /未能确认/);
        assert(!(await state()).flags.includes('tracks'));
      }
      await submit('我核对现场，询问相关人员，并按商定的安排实际行动。');
      assert(await page.locator('.chapter-chat-progress [data-chapter-confirm]').isVisible());
      if (['tracks', 'tower'].includes(id)) {
        await page.locator('[data-gal="close"]').click();
        await page.locator('#gal-stage').waitFor({ state: 'hidden' });
        assert(!(await state()).flags.includes(id), 'closing a reply does not confirm the task');
        await page.locator('#chapter-next').click();
        await page
          .locator('.chapter-chat-progress [data-chapter-confirm]')
          .waitFor({ state: 'visible' });
      }
      await page.locator('.chapter-chat-progress [data-chapter-confirm]').click();
    }
    await read();
    if (!['tracks', 'tower'].includes(id))
      await page.waitForFunction(() => !document.querySelector('#chapter-next:disabled'));
    if (['tracks', 'tower'].includes(id)) {
      await page.locator('#party-panel').waitFor({ state: 'visible' });
      assert.equal((await state()).pendingBattle, null, 'preparation has not started a battle');
      if (id === 'tracks') {
        await page.locator('#prepare-close').click();
        await page.waitForFunction(() => !document.querySelector('#chapter-next').disabled);
        assert.equal(await page.locator('#chapter-next').innerText(), '整备出战');
      }
    }
  }
  async function settled() {
    await page.waitForFunction(
      () => !demo.getStatus().playing && !demo.getStatus().animating,
      null,
      { timeout: 60000 },
    );
    await read();
  }
  async function queue(action) {
    await settled();
    await page.locator(`[data-start="${action.start}"]`).click();
    if (action.kind === 'swap') {
      await page.locator(`[data-rear="${action.incoming}"]`).click();
      await page.locator(`[data-side="Friendly"][data-slot="${action.slot}"]`).click();
    } else if (action.kind === 'item') {
      await page.locator('#backpack-open').click();
      await page.locator(`[data-item="${action.item}"]`).click();
      await page
        .locator(`[data-unit="${action.target}"],[data-rear="${action.target}"]`)
        .first()
        .click();
    } else if (action.kind === 'skill') {
      const current = await page.evaluate(() => demo.getState());
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
    }
  }
  async function fight(key) {
    if (await page.locator('#party-panel').isHidden()) {
      assert.equal(
        await page.locator('#chapter-next').getAttribute('data-chapter-action'),
        `battle-${key}`,
      );
      await page.locator('#chapter-next').click();
    }
    await page.locator('#party-panel').waitFor({ state: 'visible' });
    await page.locator('#prepare-done').click();
    await read();
    await page.waitForFunction(() => demo.getStatus().mode === 'battle', null, { timeout: 60000 });
    await page.locator('.world-battle-transition').waitFor({ state: 'detached' });
    await read();
    const count = key === 'boss' ? 3 : 1;
    for (let encounter = 0; encounter < count; encounter++) {
      for (let round = 0; round < 45; round++) {
        await settled();
        const current = await page.evaluate(() => demo.getState());
        if (current.phase === 'victory') break;
        assert.notEqual(current.phase, 'defeat', key + ' remains achievable without recruiting');
        for (const planned of buildPlan(current)) await queue(planned);
        await page.locator('#commit').click();
      }
      assert.equal((await page.evaluate(() => demo.getState())).phase, 'victory');
      await page.locator('#result').waitFor({ state: 'visible' });
      for (let n = 0; n < 200; n++) {
        await read();
        const buttons = page.locator('#result .result-buttons button:visible');
        if (
          (await buttons.count()) &&
          !(await page.locator('#result .result-buttons button:visible:disabled').count()) &&
          (await page.locator('#gal-stage').isHidden())
        )
          break;
        await page.waitForTimeout(100);
      }

      await page.screenshot({ path: path.join(output, `${key}-${encounter}-victory.png`) });
      if (encounter === count - 1) {
        await page.locator('#result-back').click();
        break;
      }
      await page.locator('#continue').click();
      if (encounter === 1) {
        await page.locator('[data-rest="sleep"]').click();
        await page.locator('#rest-continue').click();
      }
      await read();
      await page.waitForFunction(() => demo.getStatus().mode === 'event');
      await read();
      if (encounter === 0) {
        await page.locator('[data-rp-choice="choice-1"]').click();
      }
      const waiting = page.waitForResponse((response) =>
        response.url().endsWith('/api/ai/generate/quick-chat'),
      );
      await page.locator('#rp-input').fill('我们按现场情况协助居民，并与相关人员确认分工。');
      await page.locator('[data-rp="send"]').click();
      await waiting;
      await page.waitForTimeout(150);
      await read();
      if (encounter === 0) await page.locator('[data-rp="next"]').click();
      else await page.locator('[data-rp="boss"]').click();
      await page.waitForFunction(() => demo.getStatus().mode === 'battle');
      await read();
    }
    const target = key === 'boss' ? 'city-center' : 'outskirts';
    await page.waitForFunction(
      (id) =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition.id ===
        id,
      target,
      { timeout: 60000 },
    );
    await page.waitForTimeout(120);
    await read();
  }
  try {
    await page.goto(baseURL + '/?display=landscape');
    await page.waitForFunction(() => !!window.demo);
    await page
      .frameLocator('#inn-frame iframe')
      .locator('#status')
      .waitFor({ state: 'detached', timeout: 60000 });
    await read();
    await travel('street');
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition.id ===
        'starlamp-street',
    );
    await page.waitForTimeout(100);
    await read();
    await travel('city-center');
    await action('festival');
    await action('fountain');
    await travel('market');
    await travel('rampart');
    await travel('tavern');
    assert.equal((await state()).phase, 'afternoon');
    await travel('rampart');
    await action('permit');
    await action('meet-eirin');
    await action('help-eirin');
    await travel('outskirts');
    await action('tracks');
    await fight('scout');
    assert.equal((await state()).phase, 'day1done');
    await travel('rampart');
    await action('mayor-absent');
    await travel('tavern');
    await action('next-day');
    await travel('rampart');
    await action('warn');
    await travel('outskirts');
    await action('tower');
    await fight('elite');
    await travel('rampart');
    await action('defense');
    await travel('tavern');
    await action('next-day');
    await travel('city-center');
    await action('evacuation');
    await travel('market');
    await page.setViewportSize({ width: 844, height: 390 });
    await action('aid');
    await page.screenshot({ path: path.join(output, 'day3-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 836 });
    await travel('rampart');
    await action('barricade');
    await fight('boss');
    assert.equal((await state()).phase, 'won');
    assert.deepEqual((await state()).recruited, [], 'a good ending does not require recruitment');
    await travel('rampart');
    await action('finish-eirin');
    await action('invite-eirin');
    assert(
      (await page.evaluate(() => demo.getLibrary().characters)).some(
        (member) => member.id === 'starbell-eirin',
      ),
    );
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page
      .frameLocator('#inn-frame iframe')
      .locator('#status')
      .waitFor({ state: 'detached', timeout: 60000 });
    assert.equal((await state()).phase, 'won');
    assert(
      (await page.evaluate(() => demo.getLibrary().characters)).some(
        (member) => member.id === 'starbell-eirin',
      ),
    );
    assert.equal(
      (await page.evaluate(() => demo.getLibrary().history)).filter(
        (record) => record.runId === 'starbell-1',
      ).length,
      1,
    );
    assert.deepEqual(errors, []);
    return {
      days: 3,
      realBattles: 5,
      multiTurnTasks: calls.filter((input) => input.adventure?.chapter).length,
      outdoorRecovery: [
        'pending',
        'invalid-retry',
        'close-reopen',
        'cancel-preparation',
        'automatic-preparation',
      ],
      fullDefenseExpedition: true,
      optionalRecruitment: true,
      goodEnding: true,
      saves: true,
      mobile: true,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'story-error.png') });
    error.message += '\nBrowser errors: ' + errors.join(' | ');
    throw error;
  } finally {
    await page.close();
  }
}
