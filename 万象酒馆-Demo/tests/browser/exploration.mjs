import { finishSettlement } from './legacy-session.mjs';
import { legacySession } from './legacy-session.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requestContext, tavernPresetFixture } from '../fixtures/ai.js';
import { buildPlan } from '../planner.js';
import { abilityFor } from '../../src/catalog.js';
import { explorationSpec } from '../../src/exploration.js';

/** One program exercises the region catalog and an actual second forest expedition. */
export async function explorationJourneyChecks({ browser, baseURL, output }) {
  const calls = [],
    errors = [],
    results = [];
  const provider = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const context = requestContext(JSON.parse(text).messages);
    calls.push(context);
    const document = {
      schemaVersion: 3,
      story: Array.from({ length: 5 }, (_, i) =>
        i === 4
          ? '五场探索完成，队伍抵达了古堡入口。'
          : i === 0
            ? context.request.continuation || `走入${context.request.region.name}。`
            : `旅程来到第${i + 1}程。`,
      ),
      data: {
        title: `${context.request.region.name}第${calls.length}程`,
        synopsis: '这是一段已经推进的旅程。',
        setting: context.request.region.atmosphere,
        tags: [],
        npcs: [],
        nextHook: { setting: '进入林中古堡内部，查看门后的动静。', map: 'ruins', artNodes: [] },
      },
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: `<wanxiang_json>\n${JSON.stringify(document)}\n</wanxiang_json>` },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  page.on('pageerror', (error) => errors.push(error.message));
  const post = async (route, data) => {
    const response = await fetch(`${baseURL}/api/ai/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    assert(response.ok, body.error);
    return body;
  };
  async function openGate() {
    await page
      .frameLocator('#inn-frame iframe')
      .locator('#status')
      .waitFor({ state: 'detached', timeout: 60000 });
    const frame = page.frames().find((frame) => frame.url().includes('tavern.html'));
    await frame.evaluate(() => window.assetPreview.placeNow('gate'));
    await frame.locator('#enter').click();
    await page.locator('#destination-dialog').waitFor({ state: 'visible' });
  }
  try {
    await post('config', {
      kind: 'script',
      baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
      model: 'local-expedition-fixture',
      tokenField: 'max_tokens',
    });
    const saved = await post('prompts/save', { preset: tavernPresetFixture() });
    await post('prompts/select', { kind: 'script', id: saved.preset.id });
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await page.evaluate(async () => {
      const { newExploration } = await import('/src/exploration.js');
      const library = JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1'));
      library.exploration = newExploration(817);
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    });
    await page.reload();
    for (const [turn, map] of ['forest', 'frost', 'forge', 'tide', 'ruins', 'forest'].entries()) {
      await openGate();
      assert.equal(await page.locator('#destination-regions [data-region]').count(), 5);
      assert.equal(calls.length, 0, 'Combat testing must not request the script API');
      await page.locator(`#destination-regions button[data-region="${map}"]`).click();
      await page.locator('#destination-region-confirm').click();
      const progress = await page.evaluate(() => window.demo.getExploration());
      const selected =
        turn === 5
          ? progress.forest.frontier.find((node) => node.continuation)
          : progress[map].frontier[0];
      assert(selected);
      await page.locator('[data-map-node="' + selected.id + '"]').click();
      assert.equal(await page.locator(`[data-destination="${selected.id}"]`).count(), 1);
      assert.equal(await page.locator('.destination-site').count(), 1);
      if (turn === 0) {
        await page.screenshot({ path: path.join(output, 'exploration-desktop.png') });
        await page.setViewportSize({ width: 844, height: 390 });
        const footer = await page.locator('#destination-start').boundingBox();
        assert(footer.y + footer.height <= 390);
        await page.screenshot({ path: path.join(output, 'exploration-landscape.png') });
        await page.setViewportSize({ width: 1440, height: 836 });
      }
      await page.locator('#destination-start').click();
      await page.locator('#prepare-done').click();
      await page.locator('#prepare-done').click();
      await page.waitForFunction(() => window.demo.getStatus().mode === 'battle', {
        timeout: 60000,
      });
      await page.waitForFunction(() => !window.demo.getStatus().animating);
      const initial = await page.evaluate(() => window.demo.getState());
      assert.equal(initial.map, map);
      assert.deepEqual(initial.enemyIds, explorationSpec(selected).enemyIds);
      assert.equal(calls.length, 0);
      const activeBook = await page.evaluate(() => demo.getLibrary().scripts.at(-1));
      assert.equal(activeBook.story.length, 5);
      assert.equal(new Set(activeBook.story).size, 1);
      if (turn === 5) {
        assert(progress.forest.history.length > 0);
        assert.equal(initial.map, 'forest');
      }
      if (turn === 0) {
        if ((await page.locator('#speed').textContent()).includes('×1'))
          await page.locator('#speed').click();
        for (let room = 0; room < 5; room++) {
          await page.waitForFunction(() => !window.demo.getStatus().animating);
          const entering = await page.evaluate(() => window.demo.getState());
          assert.equal(entering.encounter, room);
          assert.deepEqual(entering.enemyIds, explorationSpec(selected, room).enemyIds);
          assert.equal(entering.map, 'forest');
          for (let rounds = 0; rounds < 45; rounds++) {
            const state = await page.evaluate(() => window.demo.getState());
            if (['victory', 'defeat'].includes(state.phase)) break;
            const plan = buildPlan(state);
            for (const action of plan) {
              await page.waitForFunction(() => !window.demo.getStatus().animating);
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
              } else {
                await page.locator(`[data-unit="${action.actor}"]`).click();
                await page.locator(`[data-skill="${action.skill}"]`).click();
                if (
                  ['enemy', 'ally'].includes(abilityFor(state, action.actor, action.skill).target)
                )
                  await page
                    .locator(`[data-unit="${action.target}"],[data-rear="${action.target}"]`)
                    .first()
                    .click();
              }
            }
            const forecast = await page.evaluate(() => window.demo.getForecast());
            assert(forecast.valid, JSON.stringify(forecast.invalid));
            await page.locator('#commit').click();
            await page.waitForFunction(() => !window.demo.getStatus().playing, { timeout: 30000 });
            const actual = await page.evaluate(() => window.demo.getState());
            for (const [id, unit] of Object.entries(forecast.final.units)) {
              assert.equal(actual.units[id].hp, unit.hp);
              assert.equal(actual.units[id].mp, unit.mp);
            }
          }

          assert.equal((await page.evaluate(() => window.demo.getState())).phase, 'victory');
          await finishSettlement(page);
          const afterRoom = await page.evaluate(() => window.demo.getExploration());
          assert.equal(afterRoom.forest.completed, room === 4 ? 1 : 0);
          if (room < 4) {
            assert(afterRoom.forest.frontier.some((node) => node.id === selected.id));
            await page.locator('#continue').click();
            if (room === 2) {
              await page.locator('[data-rest="sleep"]').click();
              await page.locator('#rest-continue').click();
            }
            await page.waitForFunction(
              (room) =>
                window.demo.getState().encounter === room + 1 &&
                window.demo.getStatus().mode === 'battle',
              room,
              { timeout: 60000 },
            );
          }
          console.log(`Forest fight ${room + 1}/5 completed`);
        }
        assert.equal((await page.evaluate(() => window.demo.getExpedition())).records.length, 5);
        assert.equal(await page.locator('#continue').count(), 0);
        const completed = await page.evaluate(() => window.demo.getExploration());
        assert(!completed.forest.frontier.some((node) => node.id === selected.id));
        assert.equal(completed.forest.frontier.length, 1);
        assert.equal(completed.forest.cleared.length, 1);
        await page.screenshot({ path: path.join(output, 'exploration-five-complete.png') });
        await page.locator('#result-back').click();
      } else {
        await page.evaluate(() => window.demo.returnInn());
      }
      const after = await page.evaluate(() => window.demo.getExploration());
      assert.equal(after[map].completed, map === 'forest' ? 1 : 0);
      assert.equal(after[map].frontier.length, 1);
      if (turn > 0)
        assert(
          after[map].frontier.some((node) => node.id === selected.id),
          'Aborting must not open or consume a destination',
        );
      results.push({
        map,
        completedTrips: after[map].completed,
        enemies: initial.enemyIds,
        playedAllSix: turn === 0,
      });
      await page.reload();
      await page.waitForFunction(() => !!window.demo);
      assert.equal(
        (await page.evaluate(() => window.demo.getExploration()))[map].completed,
        after[map].completed,
      );
      console.log(`Destination ${turn + 1}/6 checked: ${map}`);
    }
    assert.deepEqual(errors, []);
    const report = { regionsAndContinuation: results, requests: calls.length, errors };
    await writeFile(
      path.join(output, '1.2探索流程验证.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    return report;
  } finally {
    await page.close();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
}
