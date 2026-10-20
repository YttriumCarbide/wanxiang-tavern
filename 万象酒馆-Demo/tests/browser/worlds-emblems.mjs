import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { worldFixture } from '../fixtures/multiverse.js';
import { tavernPresetFixture } from '../fixtures/ai.js';

export async function worldsEmblemsChecks({ browser, baseURL, output }) {
  const errors = [];
  const calls = [];
  let invalidMap = true;
  const provider = createServer(async (req, res) => {
    try {
      let text = '';
      for await (const chunk of req) text += chunk;
      const payload = JSON.parse(text);
      calls.push(payload);
      const all = payload.messages.map((message) => message.content).join('\n');
      const input = all.includes('多元世界构筑器')
        ? { existing: !/"existing"\s*:\s*null/.test(all) }
        : null;
      let reply;
      if (input) {
        const fixture = worldFixture();
        if (input.existing) {
          fixture.enemies = [];
          fixture.enemyIds = [];
          fixture.background = '新航线穿过灯塔下方的旧渠，通往另一座被遗忘的港口。'.repeat(8);
          fixture.landmarks = ['地下水闸', '旧港议会', '熄灭的灯船'];
        }
        reply = invalidMap
          ? '<wanxiang_json>{"fixture":"broken-map"}</wanxiang_json>'
          : '<wanxiang_json>' + JSON.stringify(fixture) + '</wanxiang_json>';
        invalidMap = false;
      } else {
        assert(all.includes('dynamicWorld'));
        const ids = worldFixture().enemies.map((enemy) => enemy.id);
        reply =
          '<wanxiang_json>' +
          JSON.stringify({
            schemaVersion: 4,
            story: Array.from(
              { length: 5 },
              (_, index) => '队伍在港口查清第' + (index + 1) + '条线索，守灯人指向了下一座桥。',
            ),
            data: {
              title: '潮灯航路',
              tags: ['潮灯'],
              npcs: [],
              items: [],
              nextHook: { setting: '前往旧港议会', phase: '起' },
              encounters: [
                { enemyIds: ids.slice(0, 2) },
                ...Array(3).fill({ enemyIds: [ids[0]] }),
                { enemyIds: [ids.at(-1)] },
              ],
            },
          }) +
          '</wanxiang_json>';
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: reply } }],
          usage: { prompt_tokens: 150, completion_tokens: 120 },
        }),
      );
    } catch (failure) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: failure.message }));
    }
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  page.on('pageerror', (error) => errors.push(error.message));
  const post = async (route, data) => {
    const response = await fetch(baseURL + '/api/ai/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    assert(response.ok, result.error);
    return result;
  };
  async function openGate() {
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
    await frame.locator('#enter').click();
  }
  try {
    for (const kind of ['map', 'script'])
      await post('config', {
        kind,
        baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
        model: 'multiverse-fixture',
        tokenField: 'max_tokens',
      });
    const preset = await post('prompts/save', { preset: tavernPresetFixture() });
    for (const kind of ['script', 'map'])
      await post('prompts/select', { kind, id: preset.preset.id });
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await openGate();
    assert.equal(await page.locator('#destination-regions [data-region]').count(), 5);
    assert.equal(await page.locator('[data-region="dynasty"]').count(), 0);
    await page.getByRole('button', { name: '下一页地图', exact: true }).click();
    await page.locator('[data-region="singularity"]').click();
    assert(
      await page
        .locator('#destination-preview')
        .evaluate((element) => element.classList.contains('singularity')),
    );
    assert.equal(await page.locator('#destination-preview canvas').isVisible(), false);
    await page.screenshot({ path: path.join(output, 'singularity-redrawn.png') });
    assert(
      await page.locator('.singularity-core').evaluate((element) => {
        const r = element.getBoundingClientRect(),
          p = element.closest('#destination-preview').getBoundingClientRect();
        return r.x >= p.x && r.y >= p.y && r.right <= p.right && r.bottom <= p.bottom;
      }),
    );
    await page.locator('#destination-preview').click();
    await page.locator('#world-brief').fill('去往夜航港口，调查灯塔');
    await page.locator('[data-world-submit]').click();
    await page.locator('#map-raw-response').waitFor({ state: 'visible' });
    assert((await page.locator('#map-raw-response textarea').inputValue()).includes('broken-map'));
    assert.equal(calls.length, 1, 'No automatic retry of paid requests');
    await page.locator('#map-raw-response button').click();
    await page.locator('[data-world-submit]').click();
    await page.locator('#world-construction').waitFor({ state: 'hidden' });
    assert.equal((await page.evaluate(() => demo.getLibrary())).worlds.length, 1);
    await page.locator('#destination-expand').click();
    await page.locator('[data-world-submit]').click();
    await page.locator('#world-construction').waitFor({ state: 'hidden' });
    assert.equal((await page.evaluate(() => demo.getLibrary())).worlds[0].landmarks.length, 6);
    await page.locator('#destination-description').click();
    assert((await page.locator('#destination-lore article').textContent()).includes('新航线'));
    await page.screenshot({ path: path.join(output, 'world-background-expanded.png') });
    await page.locator('#destination-lore button').click();
    await page.locator('#destination-region-confirm').click();
    assert.equal(await page.locator('.destination-node').count(), 1);
    await page.screenshot({ path: path.join(output, 'custom-world-route.png') });
    await page.locator('#destination-close').click();
    await page.evaluate(() => {
      const lib = demo.getLibrary();
      lib.emblems = [];
      lib.progression = {
        settlements: ['one', 'two', 'three'],
        pandoraJoined: true,
        swapLesson: 'done',
        emblemLesson: 'none',
      };
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(lib));
      const options = JSON.parse(localStorage.getItem('wanxiang.generation-options.v1'));
      options.scriptApi = true;
      localStorage.setItem('wanxiang.generation-options.v1', JSON.stringify(options));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    while (await page.locator('#emblem-dialogue').isVisible())
      await page.locator('#emblem-dialogue button').click();
    const fate = page.frameLocator('#inn-frame iframe');
    await fate.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await fate.locator('canvas').evaluate(() => window.assetPreview.placeNow('fate'));
    await fate.locator('#emblem-open').click();
    while (await page.locator('#emblem-dialogue').isVisible())
      await page.locator('#emblem-dialogue button').click();
    assert((await page.evaluate(() => demo.getLibrary())).emblems.includes('tan-hongyu'));
    await page.locator('[data-prepare-slot="0"]').click();
    await page.locator('[data-emblem-character]').selectOption('tan-hongyu');
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).characters[0].emblemId,
      'tan-hongyu',
    );
    await page.locator('#prepare-character-close').click();
    await page.locator('#prepare-close').click();
    await openGate();
    await page.getByRole('button', { name: '下一页地图', exact: true }).click();
    await page.locator('[data-region="world-lantern"]').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'battle', { timeout: 60000 });
    assert.deepEqual((await page.evaluate(() => demo.getState())).enemyIds, [
      'enemy-lantern-scout',
      'enemy-lantern-guard',
    ]);
    assert.equal(await page.locator('.emblem-ring').count(), 1);
    if ((await page.locator('#speed').textContent()).includes('×1'))
      await page.locator('#speed').click();
    for (let turn = 0; turn < 7; turn++) {
      await page.waitForFunction(() => !demo.getStatus().animating);
      const state = await page.evaluate(() => demo.getState());
      if (state.units.aegis.emblemCharge === 6) break;
      for (let count = 0; count < Math.min(6 - (state.units.aegis.emblemCharge || 0), 1); count++) {
        await page.locator('[data-unit="aegis"]').click();
        await page.locator('[data-skill="attack"]').click();
        if ((await page.evaluate(() => demo.getStatus())).interactionStep === 'target')
          await page.locator('[data-unit="enemy-lantern-scout"]').click();
      }
      await page.locator('#commit').click();
      await page.waitForFunction(() => !demo.getStatus().playing, { timeout: 30000 });
    }
    assert.equal((await page.evaluate(() => demo.getState())).units.aegis.emblemCharge, 6);
    while (await page.locator('#emblem-dialogue').isVisible())
      await page.locator('#emblem-dialogue button').click();
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).progression.emblemLesson,
      'combine',
    );
    await page.waitForFunction(() => !demo.getStatus().animating);
    await page.locator('[data-unit="aegis"]').click();
    await page.locator('[data-unit="aegis"]').click();
    assert.equal((await page.evaluate(() => demo.getPlan()))[0].kind, 'engage');
    await page.locator('[data-skill="attack"]').click();
    await page.locator('[data-unit="enemy-lantern-scout"]').click();
    assert((await page.evaluate(() => demo.getPlan()))[0].followUp);
    assert(
      await page
        .locator('#battle')
        .evaluate((element) => element.classList.contains('emblem-active')),
    );
    assert(
      await page
        .locator('#emblem-screen')
        .evaluate((element) => element.classList.contains('active')),
    );
    assert.equal(await page.locator('.unit-hit.combined-unit').count(), 1);
    assert.equal(await page.locator('.unit-hit.combined-selected').count(), 1);
    await page.waitForFunction(() => demo.getEmblemStatus()?.active >= 1, null, {
      timeout: 5000,
    });
    assert((await page.evaluate(() => demo.getEmblemStatus().layers)) >= 4);
    assert(
      (await page.evaluate(() => demo.getAudioStatus().voices)) > 0,
      'Combining must start an audible cue',
    );
    await page.screenshot({ path: path.join(output, 'emblem-combine-preview.png') });
    await page.locator('[data-side="Friendly"]:not([data-unit="aegis"])').first().click();
    assert(
      !(await page
        .locator('#emblem-screen')
        .evaluate((element) => element.classList.contains('active'))),
    );
    assert.equal(await page.locator('.unit-hit.combined-unit').count(), 1);
    assert.equal(await page.locator('.unit-hit.combined-selected').count(), 0);
    assert(
      (await page.evaluate(() => demo.getEmblemStatus().active)) >= 1,
      'The ground aura belongs to the combined character, not the selection',
    );
    await page.locator('[data-remove]').click();
    assert.equal(
      (await page.evaluate(() => demo.getForecast())).final.units.aegis.combined,
      undefined,
    );
    await page.locator('[data-unit="aegis"]').click();
    await page.locator('[data-unit="aegis"]').click();
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing, { timeout: 30000 });
    assert((await page.evaluate(() => demo.getState())).units.aegis.combined > 0);
    assert((await page.evaluate(() => demo.getEmblemStatus()?.active)) >= 1);
    while (await page.locator('#emblem-dialogue').isVisible())
      await page.locator('#emblem-dialogue button').click();
    await page.waitForFunction(() => !demo.getStatus().animating);
    await page.locator('[data-unit="aegis"]').click();
    await page.locator('[data-skill="emblem-balance"]').click();
    await page.locator('[data-unit="enemy-lantern-scout"]').click();
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing, { timeout: 30000 });
    assert((await page.evaluate(() => demo.getState())).units['enemy-lantern-scout'].buffs.balance);
    assert.equal((await page.evaluate(() => demo.getLibrary())).progression.emblemLesson, 'done');
    await page.evaluate(() => demo.returnInn());
    const returned = page.frameLocator('#inn-frame iframe');
    await returned.locator('.spot[data-place="fate"].visible').waitFor({ timeout: 60000 });
    await page.screenshot({ path: path.join(output, 'return-facing-fate-table.png') });
    await page.locator('#archives-open').click();
    await page.locator('[data-archive-tab="enemies"]').click();
    assert((await page.locator('#archive-list').textContent()).includes('夜港执政官'));
    assert.deepEqual(errors, []);
    return {
      worldCreated: true,
      additiveExpansion: true,
      customEnemyBattle: true,
      emblemChargeAndCombine: true,
      balanceSkill: true,
      requests: calls.length,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'worlds-emblems-error.png') });
    throw error;
  } finally {
    await page.close();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
}
