import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { openCityDirectory } from './town-navigation.mjs';
import { chatResponse } from '../../server/chat-response.mjs';

/** Actual town roster/interaction, production planning menus, native art decoding and detail views. */
export async function townGuestChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page, { unlockSilverCrownTavern: true, enableAi: true });
  const cityReply = Promise.withResolvers();
  await page.route('**/api/ai/generate/*', async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint !== '/api/ai/generate/chat') {
      errors.push('Unexpected AI request: ' + endpoint);
      return route.abort();
    }
    const input = route.request().postDataJSON();
    const reply =
      '【环境】本轮交流的地点开头来自银工连廊。【环境结束】【对白:露弥】我们就在这条廊道上聊聊吧。';
    const result = await chatResponse(
      'chat',
      '<wanxiang_output>' + reply + '</wanxiang_output>',
      [],
      input,
    );
    await cityReply.promise;
    return route.fulfill({
      json: {
        ...result,
        request: { tokens: { inputEstimate: 20 }, warnings: [] },
        usage: { input: 20, output: 7 },
      },
    });
  });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => Boolean(window.demo), null, { timeout: 10000 });
    await page.locator('[data-daily="outing"]').click({ timeout: 10000 });
    await page.locator('#tavern-exit-picker[open]').waitFor({ timeout: 10000 });
    const silverCrownExit = page.locator('[data-tavern-exit="crown-tavern-door"]');
    assert.equal(
      await silverCrownExit.isEnabled(),
      true,
      'the unlocked Silver Crown exit is usable',
    );
    await silverCrownExit.click();

    const frame = page.frameLocator('#inn-frame iframe');
    async function waitForStreet(sceneId) {
      try {
        await page.waitForFunction(
          (expected) => {
            const frameWindow = document.querySelector('#inn-frame iframe')?.contentWindow;
            return (
              frameWindow?.modelReady === true &&
              frameWindow.streetPreview?.definition?.id === expected
            );
          },
          sceneId,
          { timeout: 20000 },
        );
      } catch (error) {
        const state = await page.evaluate(() => {
          const frameWindow = document.querySelector('#inn-frame iframe')?.contentWindow;
          return {
            scene: frameWindow?.streetPreview?.definition?.id,
            ready: frameWindow?.modelReady === true,
            loading: frameWindow?.document?.querySelector('#street-status')?.textContent,
          };
        });
        throw new Error(
          `Street ${sceneId} did not load within 20s: ${JSON.stringify(state)}; ${error.message}`,
          { cause: error },
        );
      }
      await frame.locator('canvas').waitFor({ state: 'visible', timeout: 5000 });
    }

    async function waitForLoadedVisitors(sceneId) {
      return frame.locator('canvas').evaluate(async (_canvas, expected) => {
        const deadline = performance.now() + 15000;
        let status = null;
        while (performance.now() < deadline) {
          const view = window.streetPreview;
          if (view?.definition?.id !== expected)
            throw Error(`Expected ${expected}, got ${view?.definition?.id || 'no street view'}`);
          status = view.visitors();
          if (
            status.enabled &&
            status.spots > 0 &&
            status.characters.length > 0 &&
            status.characters.every((actor) => actor.loaded)
          )
            return status;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw Error(
          `Town visitors did not load at ${expected} within 15s: ${JSON.stringify(status)}`,
        );
      }, sceneId);
    }

    async function findVisibleTownGuest(sceneId) {
      let status = await waitForLoadedVisitors(sceneId);
      const eligible = new Set(['libet', 'lumi', 'yuto-nakashi']);
      for (let attempt = 0; attempt < 6; attempt++) {
        const guest = status.characters.find((actor) => eligible.has(actor.key));
        if (guest) return guest;
        const previousKeys = status.characters.map((actor) => actor.key);
        await page.locator('#scene-visitors-refresh').click({ timeout: 5000 });
        await frame.locator('canvas').evaluate(async (_canvas, previous) => {
          const deadline = performance.now() + 15000;
          let status = null;
          while (performance.now() < deadline) {
            status = window.streetPreview?.visitors();
            const keys = status?.characters.map((actor) => actor.key) || [];
            if (
              keys.join('|') !== previous.join('|') &&
              status?.characters.length > 0 &&
              status.characters.every((actor) => actor.loaded)
            )
              return;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw Error(
            `Visitor refresh did not load a new cast within 15s: ${JSON.stringify(status)}`,
          );
        }, previousKeys);
        status = await waitForLoadedVisitors(sceneId);
      }
      throw Error(
        `No unrecruited official guest appeared at ${sceneId}: ${JSON.stringify(status)}`,
      );
    }

    await waitForStreet('crown-tavern-door');
    const doorVisitors = await waitForLoadedVisitors('crown-tavern-door');
    assert.equal(
      doorVisitors.spots,
      1,
      'Silver Crown tavern entrance retains its authored visitor spot',
    );

    const directory = await openCityDirectory(page);
    await directory.locator('[data-city-node="crown-arcade"]').click();
    await waitForStreet('crown-arcade');
    await page.waitForFunction(
      () => demo.getLibrary().daily.active?.scene === 'crown-arcade',
      null,
      { timeout: 10000 },
    );
    const arcadeVisitors = await waitForLoadedVisitors('crown-arcade');
    assert.equal(
      arcadeVisitors.spots,
      2,
      'Silver Crown arcade retains both authored visitor spots',
    );
    const townGuest = await findVisibleTownGuest('crown-arcade');
    const originalRoster = await page.evaluate(() => demo.getLibrary());
    for (const id of ['official-libet', 'official-lumi', 'official-yuto-nakashi']) {
      assert(
        !originalRoster.characters.some((member) => member.id === id),
        `${id} starts unrecruited`,
      );
      assert(!originalRoster.party.includes(id), `${id} starts outside the party`);
    }
    await page.screenshot({ path: path.join(output, 'unrecruited-town-guests.png') });

    await page.waitForFunction(() => {
      const view = document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview;
      return view && !view.state().moving;
    });
    const guestTarget = await frame.locator('canvas').evaluate(async (canvas, key) => {
      const THREE = await import('/vendor/build/three.module.js');
      const view = window.streetPreview;
      let mesh = null;
      view.scene.traverse((object) => {
        if (object.userData.visitor === key) mesh = object;
      });
      if (!mesh) throw Error(`No rendered visitor mesh for ${key}`);
      const image = mesh.material.map?.image;
      if (!image?.complete || !image.naturalWidth)
        throw Error(`Visitor image for ${key} is not ready`);
      const probe = document.createElement('canvas');
      probe.width = 48;
      probe.height = 72;
      const context = probe.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, probe.width, probe.height);
      const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
      const rect = canvas.getBoundingClientRect();
      const width = mesh.geometry.parameters.width;
      const height = mesh.geometry.parameters.height;
      mesh.updateWorldMatrix(true, false);
      view.camera.updateMatrixWorld();
      for (let y = 14; y < 68; y += 2) {
        for (let x = 5; x < 43; x += 2) {
          if (pixels[(y * probe.width + x) * 4 + 3] < 96) continue;
          const point = new THREE.Vector3(
            ((x + 0.5) / probe.width - 0.5) * width,
            (0.5 - (y + 0.5) / probe.height) * height,
            0,
          )
            .applyMatrix4(mesh.matrixWorld)
            .project(view.camera);
          if (point.z < -1 || point.z > 1) continue;
          const localX = ((point.x + 1) / 2) * rect.width;
          const localY = ((1 - point.y) / 2) * rect.height;
          if (localX < 0 || localX >= rect.width || localY < 0 || localY >= rect.height) continue;
          const hit = view.pickVisitor(localX + rect.left, localY + rect.top);
          if (hit?.key === key) return { point: { x: localX, y: localY }, hit: hit.key };
        }
      }
      throw Error(`Could not find a visible click point on ${key}`);
    }, townGuest.key);
    assert.equal(
      guestTarget.hit,
      townGuest.key,
      'the click target is confirmed by the street visitors canvas hit-test',
    );
    const backdropBeforeGuestHover = await frame
      .locator('canvas')
      .evaluate(() => window.streetPreview.state().framing);
    await frame.locator('canvas').hover({ position: guestTarget.point, timeout: 5000 });
    await page.waitForTimeout(180);
    const backdropAfterGuestHover = await frame
      .locator('canvas')
      .evaluate(() => window.streetPreview.state().framing);
    assert(
      Math.abs(backdropAfterGuestHover.x - backdropBeforeGuestHover.x) < 0.003 &&
        Math.abs(backdropAfterGuestHover.y - backdropBeforeGuestHover.y) < 0.003,
      'hovering a visible visitor keeps the city illustration anchored for interaction',
    );
    await frame.locator('canvas').click({ position: guestTarget.point, timeout: 5000 });
    const visitorTalk = frame.locator('[data-visitor-talk]');
    await visitorTalk.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(
      await visitorTalk.isVisible(),
      true,
      'clicking a visible Silver Crown street guest shows the exchange action',
    );
    await visitorTalk.click();

    const chat = page.locator('#gal-stage[data-workspace="chat"]');
    await chat.waitFor({ state: 'visible', timeout: 10000 });
    const locationLabel = chat.locator('.chat-location-label .chat-location-value');
    assert.equal(
      await chat.locator('.scene-environment').isHidden(),
      true,
      'the local environment intro appears only with its matching chat response',
    );
    assert.equal(
      await chat.locator('.gal-bg').isHidden(),
      true,
      'local city chat does not add a backdrop image',
    );
    await chat.locator('.gal-people-launcher').click();
    await locationLabel.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await locationLabel.innerText(), '银冠城 · 银工连廊');
    assert.equal(await chat.locator('#chat-place-select').isHidden(), true);
    const guestInput = chat.locator(`#chat-participants input[value="official-${townGuest.key}"]`);
    assert.equal(await guestInput.count(), 1, 'the interacted official guest is available in chat');
    assert.equal(
      await guestInput.isChecked(),
      true,
      'directly choosing the guest opens their local exchange',
    );
    await chat.locator('.gal-workspace-menu [data-workspace="compose"]').click();
    await chat
      .locator('.gal-composer')
      .evaluate((node) =>
        Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {}))),
      );
    const environment = chat.locator('.scene-environment');
    const chatSend = chat.locator('#chat-send');
    await chat.locator('#chat-input').fill('看看眼前的长廊');
    try {
      const [request] = await Promise.all([
        page.waitForRequest((item) => new URL(item.url()).pathname === '/api/ai/generate/chat', {
          timeout: 10000,
        }),
        chatSend.click(),
      ]);
      const input = request.postDataJSON();
      assert.equal(input.place, 'crown-arcade', 'the actual request uses the locked street');
      assert.deepEqual(input.selected, [`official-${townGuest.key}`]);
      assert.equal(
        await environment.isHidden(),
        true,
        'the street environment stays hidden while the response is pending',
      );
    } finally {
      cityReply.resolve();
    }
    await page.waitForFunction(
      () => {
        const environment = document.querySelector('#gal-stage .scene-environment');
        return environment && !environment.hidden && environment.dataset.place === 'crown-arcade';
      },
      null,
      { timeout: 10000 },
    );
    assert.equal(
      await environment.locator('.scene-environment-title').innerText(),
      '银冠城 · 银工连廊',
    );
    assert.match(
      await environment.locator('.scene-environment-text').innerText(),
      /本轮交流的地点开头来自银工连廊/,
    );
    assert.equal(await environment.locator('img').count(), 0, 'the environment has no image');
    assert.equal(
      await chat.locator('.gal-bg').isVisible(),
      false,
      'the city conversation keeps its existing text-only environment intro',
    );
    await chat.locator('[data-gal="close"]').click();
    await chat.waitFor({ state: 'hidden', timeout: 10000 });

    await frame.locator('#scene-talk').waitFor({ state: 'visible', timeout: 5000 });
    await frame.locator('#scene-talk').click();
    await chat.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(
      await chat.locator('.scene-environment').isHidden(),
      true,
      'the standalone local exchange has no stale environment intro',
    );
    assert.equal(
      await chat.locator('.gal-bg').isHidden(),
      true,
      'the local city exchange has no backdrop image',
    );
    await chat.locator('.gal-people-launcher').click();
    await locationLabel.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await locationLabel.innerText(), '银冠城 · 银工连廊');
    const lumi = chat.locator('#chat-participants input[value="official-lumi"]');
    assert.equal(
      await lumi.count(),
      1,
      'the official unrecruited guest is available in the current-city selector',
    );
    assert.equal(
      await lumi.isChecked(),
      false,
      'opening the city conversation does not select an unrecruited guest',
    );
    await lumi.check();
    assert.equal(await lumi.isChecked(), true, 'the player can choose the official guest');
    const finalRoster = await page.evaluate(() => demo.getLibrary());
    for (const id of ['official-libet', 'official-lumi', 'official-yuto-nakashi']) {
      assert(
        !finalRoster.characters.some((member) => member.id === id),
        `${id} remains unrecruited`,
      );
      assert(!finalRoster.party.includes(id), `${id} is not added to the party`);
    }
    await page.screenshot({ path: path.join(output, 'lumi-gal-full-original.png') });
    await chat.locator('[data-gal="close"]').click();
    await chat.waitFor({ state: 'hidden', timeout: 10000 });

    await page.goto(baseURL);
    await page.waitForFunction(() => Boolean(window.demo), null, { timeout: 10000 });
    const checks = await page.evaluate(async () => {
      const [
        { HEROES, DEFINITIONS },
        { newBattle, preview },
        { officialCharacter },
        { createPlanning },
        { createDrag },
        { createSelection },
        { definition, abilityFor },
        { statusIcons },
        { characterSheet },
        { standingSprite, TAVERN_VISITORS },
      ] = await Promise.all([
        import('/src/data.js'),
        import('/src/engine.js'),
        import('/src/ai/library.js'),
        import('/src/app/planning.js'),
        import('/src/app/drag.js'),
        import('/src/app/selection.js'),
        import('/src/catalog.js'),
        import('/src/ui.js'),
        import('/src/app/character-sheet.js'),
        import('/src/content/tavern-visitors.js'),
      ]);
      const definitions = Object.fromEntries(
        HEROES.map((hero) => [hero.id, { ...structuredClone(hero), buffs: {}, skills: [] }]),
      );
      for (const [slot, key] of [
        ['aegis', 'lumi'],
        ['lyria', 'libet'],
        ['morrow', 'yuto-nakashi'],
      ])
        definitions[slot] = { ...officialCharacter(key).combat, id: slot };
      const enemies = Object.fromEntries(
        ['mossSlime', 'sprout'].map((id) => [
          id,
          {
            ...structuredClone(DEFINITIONS[id]),
            hp: 100,
            speed: 1,
            tactic: undefined,
            buffs: { blind: 2 },
            intents: [
              { name: '观察', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] },
            ],
          },
        ]),
      );
      const state = newBattle(Object.keys(enemies), definitions, enemies);
      state.phase = 'plan';
      state.round = 1;
      state.units.aegis.buffs.flying = 2;
      state.units.morrow.mark = 5;
      const session = {
        runtime: { mode: 'battle' },
        battle: { state, plan: [], forecast: preview(state, []) },
        selection: { selectedCell: -1 },
        ai: { library: {} },
      };
      const context = {
        session,
        viewport: { canPlan: () => true, compactHUD: () => false, openCharacterHUD() {} },
        renderer: { render() {} },
        audio: { play() {} },
        shell: {
          toast(message) {
            throw Error(message);
          },
        },
        roster: {
          get: (id) => definition(state, id),
          ability: (id, skill) => abilityFor(state, id, skill),
        },
      };
      context.planning = createPlanning(context);
      context.drag = createDrag(context);
      context.selection = createSelection(context);
      context.selection.selectUnit('lyria', 'Friendly', 1);
      const guardian = document.querySelector('[data-drop-skill="guardian-wings"]');
      const selfMenu =
        guardian && !guardian.disabled && !document.querySelector('#drag-menu').hidden;
      guardian?.click();
      const guarded = session.battle.forecast.events.find(
        (event) => event.skill === 'guardian-wings',
      );
      const adjacent = session.battle.forecast.valid && guarded?.targets.length === 3;
      session.battle.plan = [];
      context.selection.clearSelection(true);
      context.planning.recompute();
      context.drag.showDropMenu('morrow', 'mossSlime', 'Enemy');
      document.querySelector('[data-drop-skill="attack"]').click();
      const attack = session.battle.forecast.events.find(
        (event) => event.actor === 'morrow' && event.type === 'hero',
      );
      const aoe =
        session.battle.forecast.valid &&
        attack?.targets.length === 2 &&
        attack.after.units.morrow.mark === 7;
      const icons =
        statusIcons(state, 'aegis') +
        statusIcons(state, 'mossSlime') +
        statusIcons(state, 'morrow');
      const fixture = document.createElement('section');
      fixture.id = 'town-guest-details';
      fixture.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:#18202b;color:#eee;overflow:auto;padding:20px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px';
      fixture.innerHTML =
        ['libet', 'lumi', 'yuto-nakashi']
          .map((key) => `<article>${characterSheet(officialCharacter(key))}</article>`)
          .join('') + `<footer>${icons}</footer>`;
      document.body.append(fixture);
      const portraits = [];
      for (const key of ['libet', 'lumi', 'yuto-nakashi']) {
        const member = officialCharacter(key);
        const visitor = TAVERN_VISITORS.find((entry) => entry.combatId === key);
        for (const [kind, src] of [
          ['card', './assets/portraits/' + member.combat.portrait],
          ['full', standingSprite(visitor)],
        ]) {
          const image = new Image();
          image.src = src;
          await image.decode();
          let alpha = null;
          if (kind === 'full') {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const paint = canvas.getContext('2d', { willReadFrequently: true });
            paint.drawImage(image, 0, 0);
            alpha = paint.getImageData(0, 0, 1, 1).data[3];
          }
          portraits.push({
            key,
            kind,
            width: image.naturalWidth,
            height: image.naturalHeight,
            alpha,
          });
        }
      }
      return { selfMenu, adjacent, aoe, icons, portraits, details: fixture.textContent };
    });
    assert(
      checks.selfMenu && checks.adjacent && checks.aoe,
      'production menus queue the authored targeting rules',
    );
    for (const key of ['flying', 'blind', 'melody'])
      assert(checks.icons.includes(`data-buff="${key}"`));
    for (const image of checks.portraits) {
      assert.deepEqual([image.width, image.height], [1024, 1536]);
      if (image.kind === 'full') assert.equal(image.alpha, 0);
    }
    assert(!checks.details.includes('undefined AP'));
    await page.screenshot({ path: path.join(output, 'three-character-details.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: path.join(output, 'three-character-details-mobile.png') });
    const cueExit = await page.evaluate(async () => {
      const { createSceneEnvironment } = await import(
        new URL('src/app/scene-environment.js', document.baseURI).href
      );
      const host = document.body.appendChild(document.createElement('div'));
      const cue = createSceneEnvironment(host);
      try {
        cue.show(
          { placeId: 'crown-arcade', title: '银工连廊', text: '环境回归' },
          { intro: false },
        );
        const root = host.firstElementChild;
        cue.clear();
        const [fade] = root.getAnimations();
        const fading = !root.hidden && root.inert && root.dataset.place === 'crown-arcade';
        fade?.finish();
        await fade?.finished;
        return { fading, cleared: root.hidden && !root.dataset.place };
      } finally {
        cue.dispose();
        host.remove();
      }
    });
    assert.deepEqual(cueExit, { fading: true, cleared: true });
    assert.deepEqual(errors, []);
    return {
      townResidents: 3,
      cityChatLockedRequestAndTextOnlyReply: true,
      sceneEnvironmentExit: true,
      nativePortraits: checks.portraits.length,
      menuTargets: true,
      statuses: 3,
    };
  } finally {
    await page.close();
  }
}
