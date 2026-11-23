import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const APP_SCRIPT = '<script type="module" src="./src/app.js"></script>';
const ROUTE = '**/__ring-acquisition';
const DESKTOP = { width: 1365, height: 768 };
const MOBILE = { width: 844, height: 390 };
const READY_MIN = 2000;
const READY_MAX = 12000;
const LATE_WAIT = 3100;
const DIALOG = 'dialog.ring-acquisition';

export async function ringAcquisitionChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: DESKTOP, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(READY_MAX);
  const errors = [];
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: e.message, url: page.url() }));
  page.on('console', (m) => {
    if (m.type() === 'error')
      errors.push({ kind: 'console.error', text: m.text(), url: page.url() });
  });
  try {
    await installProbe(page);
    const markup = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      APP_SCRIPT,
      '',
    );
    await page.route(ROUTE, (route) => route.fulfill({ contentType: 'text/html', body: markup }));
    await page.goto(new URL('__ring-acquisition', baseURL).href);
    await page.waitForFunction(() => !!window.__ringProbe);

    const catalog = await page.evaluate(async () => {
      const [{ createRingAcquisition }, { EMBLEMS }, { RING_DESIGNS }] = await Promise.all([
        import('/src/app/ring-acquisition.js'),
        import('/src/emblems.js'),
        import('/src/emblem-rings.js'),
      ]);
      const ids = Object.keys(EMBLEMS);
      const rings = ids.map((id) => ({
        id,
        name: EMBLEMS[id].emblem.name,
        color: RING_DESIGNS[id].color,
      }));
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.id = 'ring-test-trigger';
      trigger.textContent = '背景按钮';
      trigger.style.position = 'fixed';
      trigger.style.left = '16px';
      trigger.style.top = '16px';
      trigger.style.zIndex = '2147483647';
      let clicks = 0;
      trigger.addEventListener('click', () => (clicks += 1));
      document.body.append(trigger);
      const controller = createRingAcquisition();
      const results = new Map();
      window.__ringFixture = {
        controller,
        trigger,
        clicks: () => clicks,
        start(id, key) {
          const promise = window.__ringFixture.controller.play(id);
          results.set(key, { settled: false });
          promise.then((value) => results.set(key, { settled: true, value }));
        },
        result: (key) => results.get(key) || { settled: false },
      };
      return { ids, designIds: Object.keys(RING_DESIGNS), rings };
    });
    assert.equal(catalog.ids.length, 6, 'six emblem ids');
    assert.deepEqual([...catalog.ids].sort(), [...catalog.designIds].sort(), 'catalogs share ids');
    for (const ring of catalog.rings) {
      assert(ring.name && ring.name.length > 0, `real name for ${ring.id}`);
      assert(ring.color && ring.color.length > 0, `real color for ${ring.id}`);
    }

    // ---- First emblem: natural play, reveal/ready screenshots, focus trap ----
    const first = catalog.rings[0];
    const firstPhase = await page.evaluate(
      ({ id }) => {
        window.__ringFixture.trigger.focus();
        window.__ringStart = performance.now();
        window.__ringFixture.start(id, 'first');
        return document.querySelector('dialog.ring-acquisition')?.dataset.phase;
      },
      { id: first.id },
    );
    assert.equal(firstPhase, 'gather', 'first phase gather synchronously');
    await waitPhase(page, 'gather');
    assert.equal(await pending(page, 'first'), true, 'pending during gather');
    await waitPhase(page, 'reveal');
    assert.equal(await pending(page, 'first'), true, 'pending during reveal');
    await waitDraws(page, 1);
    const revealSnap = await snapshot(page);
    assert.equal(revealSnap.phase, 'reveal', 'still reveal at screenshot');
    assert.equal(revealSnap.emblemId, first.id, 'first emblem id');
    assert.equal(revealSnap.name, first.name, 'first emblem name');
    assert.equal(normalizeColor(revealSnap.accent), normalizeColor(first.color), 'first accent');
    assert.equal(revealSnap.dialogs, 1, 'single dialog');
    assert.equal(revealSnap.canvases, 1, 'single canvas');
    assert.equal(revealSnap.fallback, false, 'no fallback');
    assert.equal(revealSnap.isModal, true, 'native modal');
    assert.equal(revealSnap.isHtmlDialog, true, 'HTMLDialogElement');
    assert(revealSnap.coversViewport, 'covers viewport');
    assert(revealSnap.canvasVisible, 'canvas visible');
    const gl = await readGl(page);
    assert(gl.context, 'real WebGL context');
    assert.equal(gl.lost, false, 'context not lost');
    assert(gl.width > 0 && gl.height > 0, 'drawing buffer sized');
    assert(gl.draws > 0, 'real triangle draws');
    await page.screenshot({ path: path.join(output, 'ring-desktop-reveal.png') });
    assert.equal((await snapshot(page)).phase, 'reveal', 'still reveal after screenshot');
    await waitPhase(page, 'ready');
    const readyAt = await page.evaluate(() => performance.now() - window.__ringStart);
    assert(readyAt >= READY_MIN && readyAt <= READY_MAX, `natural ready ${Math.round(readyAt)}ms`);
    await page.screenshot({ path: path.join(output, 'ring-desktop-ready.png') });
    assert.equal((await snapshot(page)).phase, 'ready', 'ready at screenshot');

    // focus trap at ready
    await page.evaluate(() => window.__ringFixture.trigger.focus());
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('dialog.ring-acquisition').contains(document.activeElement),
      ),
      true,
      'background focus cannot steal dialog focus',
    );
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('dialog.ring-acquisition').contains(document.activeElement),
        ),
        true,
        `focus trapped after ${key}`,
      );
    }
    const clicksBefore = await page.evaluate(() => window.__ringFixture.clicks());
    await page.locator(`${DIALOG} .ring-acquisition-continue`).click();
    await settle(page, 'first');
    assert.equal(await resultValue(page, 'first'), true, 'continue true');
    assert.equal(await isOpen(page), false, 'closed after continue');
    assert.equal(
      await page.evaluate(() => document.activeElement === window.__ringFixture.trigger),
      true,
      'focus restored',
    );
    await page.locator('#ring-test-trigger').click();
    assert(
      (await page.evaluate(() => window.__ringFixture.clicks())) > clicksBefore,
      'background clickable',
    );
    assert.equal(await dialogCount(page), 0, 'no dialog remains');

    // ---- Remaining five: verify catalog + WebGL, mixed skip/continue ----
    const rest = catalog.rings.slice(1);
    for (let i = 0; i < rest.length; i += 1) {
      const ring = rest[i];
      const key = `ring-${i}`;
      await page.evaluate(({ id, key }) => window.__ringFixture.start(id, key), {
        id: ring.id,
        key,
      });
      await page.waitForFunction(
        (id) => document.querySelector('dialog.ring-acquisition')?.dataset.emblemId === id,
        ring.id,
      );
      const snap = await snapshot(page);
      assert.equal(snap.dialogs, 1, `one dialog ${ring.id}`);
      assert.equal(snap.canvases, 1, `one canvas ${ring.id}`);
      assert.equal(snap.name, ring.name, `name ${ring.id}`);
      assert.equal(normalizeColor(snap.accent), normalizeColor(ring.color), `accent ${ring.id}`);
      assert.equal(snap.fallback, false, `no fallback ${ring.id}`);
      await waitDraws(page, 1);
      assert((await readGl(page)).draws > 0, `draws ${ring.id}`);
      if (i === 0) {
        await page.locator(`${DIALOG} .ring-acquisition-skip`).focus();
        await page.keyboard.press('Enter');
      } else {
        await page.locator(`${DIALOG} .ring-acquisition-skip`).click();
      }
      await waitPhase(page, 'ready');
      if (i === 0) {
        await page.locator(`${DIALOG} .ring-acquisition-continue`).focus();
        await page.keyboard.press('Space');
      } else {
        await page.locator(`${DIALOG} .ring-acquisition-continue`).click();
      }
      await settle(page, key);
      assert.equal(await resultValue(page, key), true, `continue true ${ring.id}`);
      assert.equal(await isOpen(page), false, `closed ${ring.id}`);
      assert.equal(await dialogCount(page), 0, `no dialog ${ring.id}`);
    }

    // ---- Escape: first Esc -> ready + pending, second Esc -> true ----
    await page.evaluate((id) => window.__ringFixture.start(id, 'escape'), catalog.rings[2].id);
    await waitPhase(page, 'gather');
    await page.keyboard.press('Escape');
    await waitPhase(page, 'ready');
    assert.equal(await pending(page, 'escape'), true, 'pending after first Esc');
    await page.keyboard.press('Escape');
    await settle(page, 'escape');
    assert.equal(await resultValue(page, 'escape'), true, 'Esc at ready true');
    assert.equal(await isOpen(page), false, 'Esc closed');

    // ---- Reduced motion: immediate ready, static frame, mobile continue ----
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedPhase = await page.evaluate((id) => {
      window.__ringFixture.start(id, 'reduced');
      return document.querySelector('dialog.ring-acquisition')?.dataset.phase;
    }, catalog.rings[3].id);
    assert.equal(reducedPhase, 'ready', 'reduced motion ready synchronously');
    await waitPhase(page, 'ready');
    assert.equal(await page.locator(`${DIALOG} .ring-acquisition-skip`).count(), 1, 'skip exists');
    assert.equal(
      await page.locator(`${DIALOG} .ring-acquisition-skip`).isVisible(),
      false,
      'skip hidden under reduced motion',
    );
    await waitDraws(page, 1);
    const drawsA = (await readGl(page)).draws;
    await page.waitForTimeout(300);
    assert.equal((await readGl(page)).draws, drawsA, 'reduced motion draws stable');
    await page.setViewportSize(MOBILE);
    await page.screenshot({ path: path.join(output, 'ring-mobile-ready.png') });
    const box = await page.locator(`${DIALOG} .ring-acquisition-continue`).boundingBox();
    assert(box, 'continue visible on mobile');
    assert(box.x >= 0 && box.x + box.width <= MOBILE.width, 'continue within width');
    assert(box.y >= 0 && box.y + box.height <= MOBILE.height, 'continue within height');
    await page.locator(`${DIALOG} .ring-acquisition-continue`).click();
    await settle(page, 'reduced');
    assert.equal(await resultValue(page, 'reduced'), true, 'reduced continue true');
    await page.setViewportSize(DESKTOP);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // ---- Replace + invalid ids ----
    const replace = await page.evaluate(
      async ({ first, second }) => {
        const fixture = window.__ringFixture;
        fixture.start(first, 'replace-old');
        fixture.start(second, 'replace-new');
        const dialog = document.querySelector('dialog.ring-acquisition');
        const canvas = dialog?.querySelector('canvas');
        const beforeId = dialog?.dataset.emblemId;
        const invalid = await Promise.all([
          fixture.controller.play('__invalid__'),
          fixture.controller.play(null),
        ]);
        const after = document.querySelector('dialog.ring-acquisition');
        const afterCanvas = after?.querySelector('canvas');
        return {
          oldSettled: fixture.result('replace-old').settled,
          oldValue: fixture.result('replace-old').value,
          newPending: !fixture.result('replace-new').settled,
          invalid,
          domStable:
            beforeId === after?.dataset.emblemId && dialog === after && canvas === afterCanvas,
          dialogs: document.querySelectorAll('dialog.ring-acquisition').length,
          canvases: document.querySelectorAll('dialog.ring-acquisition canvas').length,
          emblemId: after?.dataset.emblemId,
        };
      },
      { first: catalog.rings[0].id, second: catalog.rings[1].id },
    );
    assert.equal(replace.oldValue, false, 'replaced play false');
    assert.equal(replace.newPending, true, 'new play pending');
    assert.deepEqual(replace.invalid, [false, false], 'invalid ids false');
    assert.equal(replace.domStable, true, 'invalid ids keep DOM');
    assert.equal(replace.dialogs, 1, 'one dialog after replace');
    assert.equal(replace.canvases, 1, 'one canvas after replace');
    assert.equal(replace.emblemId, catalog.rings[1].id, 'new emblem shown');
    await page.locator(`${DIALOG} .ring-acquisition-skip`).click();
    await waitPhase(page, 'ready');
    await page.locator(`${DIALOG} .ring-acquisition-continue`).click();
    await settle(page, 'replace-new');
    assert.equal(await resultValue(page, 'replace-new'), true, 'replacement continue true');

    // ---- cancel / dispose / pagehide ----
    for (const mode of ['cancel', 'dispose', 'pagehide']) {
      await page.evaluate(({ id, mode }) => window.__ringFixture.start(id, mode), {
        id: catalog.rings[0].id,
        mode,
      });
      await page.waitForFunction(() => !!document.querySelector('dialog.ring-acquisition'));
      await page.evaluate((mode) => {
        const fixture = window.__ringFixture;
        if (mode === 'cancel') fixture.controller.cancel();
        else if (mode === 'dispose') fixture.controller.dispose();
        else window.dispatchEvent(new Event('pagehide'));
      }, mode);
      await settle(page, mode);
      assert.equal(await resultValue(page, mode), false, `${mode} false`);
      assert.equal(await isOpen(page), false, `${mode} closed`);
      assert.equal(await dialogCount(page), 0, `${mode} cleans DOM`);
      if (mode === 'dispose') {
        await page.evaluate(async () => {
          const { createRingAcquisition } = await import('/src/app/ring-acquisition.js');
          window.__ringFixture.controller = createRingAcquisition();
        });
      }
    }
    await page.evaluate(() => window.__ringFixture.controller.dispose());

    // ---- Emblem integration: real ruins reward, save-before-animation ----
    const integration = await page.evaluate(async () => {
      const [{ createEmblems }, { createEventScope }, { prepareBossEmblem }, { EMBLEMS }] =
        await Promise.all([
          import('/src/app/emblems.js'),
          import('/src/shared/events.js'),
          import('/src/emblem-progression.js'),
          import('/src/emblems.js'),
        ]);
      const events = createEventScope();
      const saves = [];
      const session = {
        ai: { library: { progression: { emblemLesson: 'done' }, emblems: [] } },
        runtime: { mode: 'battle' },
        battle: { playing: false, state: { phase: 'opening' } },
        journey: {},
      };
      const controller = createEmblems({
        session,
        events,
        generation: {
          save() {
            saves.push({
              shown: session.journey.expedition?.emblemArrival?.shown === true,
              dialogOpen: !!document.querySelector('dialog.ring-acquisition'),
              expedition: JSON.stringify(session.journey.expedition),
              library: JSON.stringify(session.ai.library),
            });
          },
        },
        audio: { play() {} },
        shell: { toast() {} },
      });
      session.journey.expedition = { index: 4, exploration: { map: 'ruins', sequence: 2 } };
      prepareBossEmblem(session.ai.library, session.journey.expedition);
      const arrivalId = session.journey.expedition.emblemArrival.id;
      controller.check();
      const dialog = document.querySelector('dialog.ring-acquisition');
      const dialogue = document.querySelector('#emblem-dialogue');
      window.__emblemFixture = { session, controller, events, saves, arrivalId };
      return {
        saveCount: saves.length,
        shown: saves[0]?.shown === true,
        dialogAtSave: saves[0]?.dialogOpen === true,
        savedArrivalShown: JSON.parse(saves[0]?.expedition || '{}').emblemArrival?.shown === true,
        savedLibraryHasReward: (JSON.parse(saves[0]?.library || '{}').emblems || []).includes(
          arrivalId,
        ),
        dialogAfterCheck: !!dialog,
        dialogueHidden: !dialogue || !dialogue.open,
        arrivalName: EMBLEMS[arrivalId].emblem.name,
      };
    });
    assert.equal(integration.saveCount, 1, 'check saves once');
    assert.equal(integration.shown, true, 'save snapshot shown=true');
    assert.equal(integration.savedArrivalShown, true, 'saved expedition arrival.shown true');
    assert.equal(integration.savedLibraryHasReward, true, 'saved library has reward id');
    assert.equal(integration.dialogAtSave, false, 'dialog not open at save');
    assert.equal(integration.dialogAfterCheck, true, 'dialog opens after check');
    assert.equal(integration.dialogueHidden, true, 'dialogue hidden during acquisition');
    const secondCheck = await page.evaluate(() => {
      const { controller, saves } = window.__emblemFixture;
      const before = saves.length;
      const node = document.querySelector('dialog.ring-acquisition');
      controller.check();
      controller.check();
      return {
        extraSaves: saves.length - before,
        dialogs: document.querySelectorAll('dialog.ring-acquisition').length,
        sameNode: node === document.querySelector('dialog.ring-acquisition'),
      };
    });
    assert.equal(secondCheck.extraSaves, 0, 'duplicate check no save');
    assert.equal(secondCheck.dialogs, 1, 'duplicate check keeps dialog');
    assert.equal(secondCheck.sameNode, true, 'duplicate check same DOM node');
    await page.locator(`${DIALOG} .ring-acquisition-skip`).click();
    await waitPhase(page, 'ready');
    await page.locator(`${DIALOG} .ring-acquisition-continue`).click();
    await page.locator('#emblem-dialogue').waitFor({ state: 'visible' });
    await page.locator('#emblem-dialogue button').click();
    assert.equal(
      await page.evaluate(
        (name) => document.querySelector('#emblem-dialogue').textContent.includes(name),
        integration.arrivalName,
      ),
      true,
      'dialogue shows real emblem name',
    );
    await page.locator('#emblem-dialogue button').click();
    await page.locator('#emblem-dialogue').waitFor({ state: 'hidden' });
    const afterDialogue = await page.evaluate(() => {
      const { controller, saves } = window.__emblemFixture;
      const before = saves.length;
      controller.check();
      return {
        replay: !!document.querySelector('dialog.ring-acquisition'),
        extraSaves: saves.length - before,
      };
    });
    assert.equal(afterDialogue.replay, false, 'no replay after dialogue');
    assert.equal(afterDialogue.extraSaves, 0, 'no extra save after dialogue');
    await page.evaluate(() => {
      window.__emblemFixture.controller.dispose();
      window.__emblemFixture.events.dispose();
    });

    // ---- Fallback: context loss -> data-fallback, ready, dialogue completes ----
    await page.evaluate(async () => {
      const [{ createEmblems }, { createEventScope }, { prepareBossEmblem }] = await Promise.all([
        import('/src/app/emblems.js'),
        import('/src/shared/events.js'),
        import('/src/emblem-progression.js'),
      ]);
      const events = createEventScope();
      const session = {
        ai: { library: { progression: { emblemLesson: 'done' }, emblems: [] } },
        runtime: { mode: 'battle' },
        battle: { playing: false, state: { phase: 'opening' } },
        journey: {},
      };
      const controller = createEmblems({
        session,
        events,
        generation: { save() {} },
        audio: { play() {} },
        shell: { toast() {} },
      });
      session.journey.expedition = { index: 4, exploration: { map: 'forest', sequence: 3 } };
      prepareBossEmblem(session.ai.library, session.journey.expedition);
      controller.check();
      window.__fallbackFixture = { controller, events };
    });
    await page.waitForFunction(() => !!document.querySelector('dialog.ring-acquisition canvas'));
    await page.evaluate(() => {
      document
        .querySelector('dialog.ring-acquisition canvas')
        .dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    await page.waitForFunction(
      () => document.querySelector('dialog.ring-acquisition')?.dataset.fallback === 'true',
    );
    await waitPhase(page, 'ready');
    assert.equal(
      await page.evaluate(
        () => document.querySelector('dialog.ring-acquisition')?.dataset.fallback === 'true',
      ),
      true,
      'fallback flag set',
    );
    assert.equal(
      await page.evaluate(() => {
        const b = document.querySelector('dialog.ring-acquisition .ring-acquisition-continue');
        return !!b && !b.hidden && !b.disabled;
      }),
      true,
      'fallback continue usable',
    );
    await page.locator(`${DIALOG} .ring-acquisition-continue`).click();
    await page.locator('#emblem-dialogue').waitFor({ state: 'visible' });
    await page.locator('#emblem-dialogue button').click();
    await page.locator('#emblem-dialogue button').click();
    await page.locator('#emblem-dialogue').waitFor({ state: 'hidden' });
    await page.evaluate(() => {
      window.__fallbackFixture.controller.dispose();
      window.__fallbackFixture.events.dispose();
    });

    // ---- Late callbacks: leave / dispose / pagehide ----
    for (const mode of ['leave', 'dispose', 'pagehide']) {
      await page.evaluate(async (mode) => {
        const [{ createEmblems }, { createEventScope }, { prepareBossEmblem }] = await Promise.all([
          import('/src/app/emblems.js'),
          import('/src/shared/events.js'),
          import('/src/emblem-progression.js'),
        ]);
        const events = createEventScope();
        const session = {
          ai: { library: { progression: { emblemLesson: 'done' }, emblems: [] } },
          runtime: { mode: 'battle' },
          battle: { playing: false, state: { phase: 'opening' } },
          journey: {},
        };
        const controller = createEmblems({
          session,
          events,
          generation: { save() {} },
          audio: { play() {} },
          shell: { toast() {} },
        });
        session.journey.expedition = { index: 4, exploration: { map: 'ruins', sequence: 2 } };
        prepareBossEmblem(session.ai.library, session.journey.expedition);
        controller.check();
        if (!document.querySelector('dialog.ring-acquisition'))
          throw new Error('acquisition not open');
        if (mode === 'leave') controller.leave();
        else if (mode === 'dispose') controller.dispose();
        else window.dispatchEvent(new Event('pagehide'));
        window.__lateFixture = { controller, events, mode };
      }, mode);
      await page.waitForTimeout(LATE_WAIT);
      const late = await page.evaluate(() => {
        const { controller, events, mode } = window.__lateFixture;
        const dialog = !!document.querySelector('dialog.ring-acquisition');
        const dialogue = document.querySelector('#emblem-dialogue');
        const dialogueOpen = !!dialogue && dialogue.open;
        let replay = false;
        if (mode !== 'dispose') {
          controller.check();
          replay = !!document.querySelector('dialog.ring-acquisition');
        }
        controller.dispose();
        events.dispose();
        return { dialog, dialogueOpen, replay };
      });
      assert.equal(late.dialog, false, `${mode} prevents late dialog`);
      assert.equal(late.dialogueOpen, false, `${mode} prevents late dialogue`);
      if (mode !== 'dispose') assert.equal(late.replay, false, `${mode} no replay`);
    }

    // ---- Corridor ring: real prepareCorridorRing, save-before-animation, cancel no replay ----
    const corridor = await page.evaluate(async () => {
      const [
        { createEmblems },
        { createEventScope },
        { prepareCorridorRing },
        { EMBLEM_ID, EMBLEMS },
      ] = await Promise.all([
        import('/src/app/emblems.js'),
        import('/src/shared/events.js'),
        import('/src/emblem-progression.js'),
        import('/src/emblems.js'),
      ]);
      const events = createEventScope();
      const saves = [];
      const session = {
        ai: {
          library: {
            progression: { emblemLesson: 'done' },
            emblems: [],
            characters: [],
            party: [],
          },
        },
        runtime: { mode: 'battle' },
        battle: { playing: false, state: { phase: 'opening', formation: [] } },
        journey: {},
      };
      const controller = createEmblems({
        session,
        events,
        generation: {
          save() {
            saves.push({
              shown: session.journey.expedition?.corridorRing?.shown === true,
              dialogOpen: !!document.querySelector('dialog.ring-acquisition'),
              expedition: JSON.stringify(session.journey.expedition),
              library: JSON.stringify(session.ai.library),
            });
          },
        },
        audio: { play() {} },
        shell: { toast() {} },
      });
      session.journey.expedition = { index: 4, exploration: { map: 'mill', sequence: 0 } };
      const granted = prepareCorridorRing(session.ai.library, session.journey.expedition, () => 0);
      const corridorRing = session.journey.expedition.corridorRing;
      const libraryHasRing = session.ai.library.emblems.includes(EMBLEM_ID);
      const lesson = session.ai.library.progression.emblemLesson;
      controller.check();
      const dialog = document.querySelector('dialog.ring-acquisition');
      window.__corridorFixture = { session, controller, events, saves, EMBLEM_ID, EMBLEMS };
      return {
        EMBLEM_ID,
        granted,
        libraryHasRing,
        actorAbsent: !corridorRing?.actor,
        lesson,
        saveCount: saves.length,
        savedShown: saves[0]?.shown === true,
        savedArrivalShown: JSON.parse(saves[0]?.expedition || '{}').corridorRing?.shown === true,
        savedLibraryHasRing: (JSON.parse(saves[0]?.library || '{}').emblems || []).includes(
          EMBLEM_ID,
        ),
        dialogAtSave: saves[0]?.dialogOpen === true,
        dialogAfterCheck: !!dialog,
        animationId: dialog?.dataset.emblemId,
        emblemName: EMBLEMS[EMBLEM_ID].emblem.name,
      };
    });
    assert.equal(corridor.granted, true, 'prepareCorridorRing grants');
    assert.equal(corridor.libraryHasRing, true, 'library has corridor ring');
    assert.equal(corridor.actorAbsent, true, 'corridorRing.actor absent');
    assert.equal(corridor.lesson, 'corridor-intro', 'lesson corridor-intro');
    assert.equal(corridor.saveCount, 1, 'corridor check saves once');
    assert.equal(corridor.savedShown, true, 'corridor save snapshot shown=true');
    assert.equal(corridor.savedArrivalShown, true, 'saved corridorRing.shown true');
    assert.equal(corridor.savedLibraryHasRing, true, 'saved library has corridor ring');
    assert.equal(corridor.dialogAtSave, false, 'corridor dialog not open at save');
    assert.equal(corridor.dialogAfterCheck, true, 'corridor dialog opens after check');
    assert.equal(corridor.animationId, corridor.EMBLEM_ID, 'corridor animation id');
    const corridorDup = await page.evaluate(() => {
      const { controller, saves } = window.__corridorFixture;
      const before = saves.length;
      const node = document.querySelector('dialog.ring-acquisition');
      controller.check();
      controller.check();
      return {
        extraSaves: saves.length - before,
        dialogs: document.querySelectorAll('dialog.ring-acquisition').length,
        sameNode: node === document.querySelector('dialog.ring-acquisition'),
      };
    });
    assert.equal(corridorDup.extraSaves, 0, 'corridor duplicate check no save');
    assert.equal(corridorDup.dialogs, 1, 'corridor duplicate check keeps dialog');
    assert.equal(corridorDup.sameNode, true, 'corridor duplicate check same DOM node');
    await page.evaluate(() => window.__corridorFixture.controller.leave());
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const corridorAfterLeave = await page.evaluate(() => {
      const { session } = window.__corridorFixture;
      const dialogue = document.querySelector('#emblem-dialogue');
      return {
        dialogs: document.querySelectorAll('dialog.ring-acquisition').length,
        dialogueOpen: !!dialogue && dialogue.open,
        shown: session.journey.expedition.corridorRing.shown === true,
      };
    });
    assert.equal(corridorAfterLeave.dialogs, 0, 'corridor leave removes dialog');
    assert.equal(corridorAfterLeave.dialogueOpen, false, 'corridor leave no dialogue');
    assert.equal(corridorAfterLeave.shown, true, 'corridor shown stays true after leave');
    const corridorRecheck = await page.evaluate(() => {
      const { controller, session, saves } = window.__corridorFixture;
      const before = saves.length;
      const emblemsBefore = JSON.stringify(session.ai.library.emblems);
      controller.check();
      const dialogue = document.querySelector('#emblem-dialogue');
      return {
        replay: !!document.querySelector('dialog.ring-acquisition'),
        extraSaves: saves.length - before,
        dialogueOpen: !!dialogue && dialogue.open,
        lesson: session.ai.library.progression.emblemLesson,
        emblemsUnchanged: JSON.stringify(session.ai.library.emblems) === emblemsBefore,
      };
    });
    assert.equal(corridorRecheck.replay, false, 'corridor recheck no animation');
    assert.equal(corridorRecheck.dialogueOpen, false, 'corridor recheck no dialogue');
    assert.equal(corridorRecheck.lesson, 'charge', 'corridor recheck lesson charge');
    assert.equal(corridorRecheck.extraSaves, 1, 'corridor recheck saves lesson transition');
    assert.equal(corridorRecheck.emblemsUnchanged, true, 'corridor recheck emblems unchanged');
    await page.evaluate(() => {
      window.__corridorFixture.controller.dispose();
      window.__corridorFixture.events.dispose();
    });

    // ---- Preview: playAcquisition + same-origin replay message, no save/library change ----
    const preview = await page.evaluate(async () => {
      const [{ createEmblems }, { createEventScope }] = await Promise.all([
        import('/src/app/emblems.js'),
        import('/src/shared/events.js'),
      ]);
      const events = createEventScope();
      let saveCount = 0;
      const session = {
        ai: { library: { progression: { emblemLesson: 'done' }, emblems: [] } },
        runtime: { mode: 'inn' },
        battle: { playing: false, state: { phase: 'opening' } },
        journey: {},
      };
      const controller = createEmblems({
        session,
        events,
        generation: {
          save() {
            saveCount += 1;
          },
        },
        audio: { play() {} },
        shell: { toast() {} },
      });
      window.__previewFixture = { session, controller, events, saveCount: () => saveCount };
      return { library: JSON.stringify(session.ai.library), saves: saveCount };
    });
    await page.evaluate(async () => {
      const { controller } = window.__previewFixture;
      const { EMBLEMS } = await import('/src/emblems.js');
      window.__previewResult = controller.playAcquisition(Object.keys(EMBLEMS)[0]);
    });
    await page.waitForFunction(() => !!document.querySelector('dialog.ring-acquisition'));
    await page.locator(`${DIALOG} .ring-acquisition-skip`).click();
    await waitPhase(page, 'ready');
    await page.locator(`${DIALOG} .ring-acquisition-continue`).click();
    await page.waitForFunction(() => !document.querySelector('dialog.ring-acquisition'));
    assert.equal(
      await page.evaluate(() => window.__previewResult),
      true,
      'preview playAcquisition true',
    );
    const afterPreview = await page.evaluate(() => {
      const { session, saveCount } = window.__previewFixture;
      const dialogue = document.querySelector('#emblem-dialogue');
      return {
        library: JSON.stringify(session.ai.library),
        saves: saveCount(),
        dialogueOpen: !!dialogue && dialogue.open,
      };
    });
    assert.equal(afterPreview.saves, preview.saves, 'preview does not save');
    assert.equal(afterPreview.library, preview.library, 'preview library unchanged');
    assert.equal(afterPreview.dialogueOpen, false, 'preview no dialogue');

    // same-origin replay message via real iframe inside existing #inn-frame container
    await page.evaluate(async () => {
      const { EMBLEMS } = await import('/src/emblems.js');
      const id = Object.keys(EMBLEMS)[1];
      let container = document.querySelector('#inn-frame');
      if (!container) {
        container = document.createElement('div');
        container.id = 'inn-frame';
        document.body.append(container);
      }
      const frame = document.createElement('iframe');
      frame.srcdoc = '<!doctype html><html><body></body></html>';
      container.append(frame);
      window.__previewReplayId = id;
    });
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('body').evaluate(() => {
      parent.postMessage(
        { type: 'tavern-emblem-replay', id: window.parent.__previewReplayId },
        parent.location.origin,
      );
    });
    await page.waitForFunction(
      (id) => document.querySelector('dialog.ring-acquisition')?.dataset.emblemId === id,
      await page.evaluate(() => window.__previewReplayId),
    );
    await page.locator(`${DIALOG} .ring-acquisition-skip`).click();
    await waitPhase(page, 'ready');
    await page.locator(`${DIALOG} .ring-acquisition-continue`).click();
    await page.waitForFunction(() => !document.querySelector('dialog.ring-acquisition'));
    const afterReplay = await page.evaluate(() => {
      const { session, saveCount } = window.__previewFixture;
      return { library: JSON.stringify(session.ai.library), saves: saveCount() };
    });
    assert.equal(afterReplay.saves, preview.saves, 'replay does not save');
    assert.equal(afterReplay.library, preview.library, 'replay library unchanged');
    await page.evaluate(() => {
      window.__previewFixture.controller.dispose();
      window.__previewFixture.events.dispose();
      document.querySelector('#inn-frame iframe')?.remove();
    });

    assert.deepEqual(errors, [], 'no page errors or console errors');
    return {
      catalog: catalog.rings.length,
      naturalReady: Math.round(readyAt),
      webglDraws: gl.draws,
      escape: true,
      reducedMotion: true,
      mobile: true,
      replace: true,
      cancelDispose: true,
      pagehide: true,
      integration: true,
      fallback: true,
      lateCallbacks: true,
      corridor: true,
      preview: true,
    };
  } catch (failure) {
    try {
      await page.screenshot({ path: path.join(output, 'failure.png') });
    } catch {
      /* ignore screenshot failure */
    }
    throw failure;
  } finally {
    await page.close();
  }
}

async function installProbe(page) {
  await page.addInitScript(() => {
    const contexts = new WeakMap();
    const draws = new WeakMap();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      const ctx = original.call(this, type, ...rest);
      if (ctx && (type === 'webgl' || type === 'webgl2')) {
        contexts.set(this, ctx);
        if (!draws.has(this)) draws.set(this, 0);
      }
      return ctx;
    };
    const count = (canvas, amount) => {
      if (canvas && amount > 0) draws.set(canvas, (draws.get(canvas) || 0) + 1);
    };
    const wrap = (proto, name, countOf) => {
      if (!proto || typeof proto[name] !== 'function') return;
      const fn = proto[name];
      proto[name] = function wrapped(...args) {
        const result = fn.apply(this, args);
        const mode = args[0];
        const triangles =
          mode === this.TRIANGLES || mode === this.TRIANGLE_STRIP || mode === this.TRIANGLE_FAN;
        if (triangles) count(this.canvas, countOf(args));
        return result;
      };
    };
    for (const proto of [
      window.WebGLRenderingContext?.prototype,
      window.WebGL2RenderingContext?.prototype,
    ]) {
      if (!proto) continue;
      wrap(proto, 'drawElements', (args) => args[1]);
      wrap(proto, 'drawArrays', (args) => args[2]);
      wrap(proto, 'drawElementsInstanced', (args) => (args[4] > 0 ? args[1] : 0));
      wrap(proto, 'drawArraysInstanced', (args) => (args[3] > 0 ? args[2] : 0));
    }
    window.__ringProbe = {
      contextOf: (canvas) => contexts.get(canvas) || null,
      drawsOf: (canvas) => draws.get(canvas) || 0,
    };
  });
}

async function waitPhase(page, phase) {
  await page.waitForFunction(
    (phase) => document.querySelector('dialog.ring-acquisition')?.dataset.phase === phase,
    phase,
    { timeout: READY_MAX },
  );
}

async function waitDraws(page, minimum) {
  await page.waitForFunction(
    (minimum) => {
      const canvas = document.querySelector('dialog.ring-acquisition canvas');
      return !!canvas && window.__ringProbe.drawsOf(canvas) >= minimum;
    },
    minimum,
    { timeout: READY_MAX },
  );
}

async function readGl(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('dialog.ring-acquisition canvas');
    if (!canvas) return { context: false, lost: true, width: 0, height: 0, draws: 0 };
    const ctx = window.__ringProbe.contextOf(canvas);
    const isGl =
      !!ctx &&
      ((typeof WebGLRenderingContext !== 'undefined' && ctx instanceof WebGLRenderingContext) ||
        (typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext));
    return {
      context: isGl,
      lost: isGl ? ctx.isContextLost() : true,
      width: isGl ? ctx.drawingBufferWidth : 0,
      height: isGl ? ctx.drawingBufferHeight : 0,
      draws: window.__ringProbe.drawsOf(canvas),
    };
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('dialog.ring-acquisition');
    const canvas = dialog?.querySelector('canvas');
    const rect = dialog?.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    return {
      phase: dialog?.dataset.phase,
      emblemId: dialog?.dataset.emblemId,
      name: dialog?.querySelector('.ring-acquisition-name')?.textContent,
      accent: dialog?.style.getPropertyValue('--ring-accent'),
      fallback: dialog?.dataset.fallback === 'true',
      dialogs: document.querySelectorAll('dialog.ring-acquisition').length,
      canvases: document.querySelectorAll('dialog.ring-acquisition canvas').length,
      isModal: dialog?.matches(':modal') ?? false,
      isHtmlDialog: dialog instanceof HTMLDialogElement,
      coversViewport:
        !!rect &&
        rect.left <= 1 &&
        rect.top <= 1 &&
        rect.right >= window.innerWidth - 1 &&
        rect.bottom >= window.innerHeight - 1,
      canvasVisible: !!canvasRect && canvasRect.width > 0 && canvasRect.height > 0,
    };
  });
}

async function pending(page, key) {
  return page.evaluate((key) => !window.__ringFixture.result(key).settled, key);
}

async function settle(page, key) {
  await page.waitForFunction((key) => window.__ringFixture.result(key).settled, key, {
    timeout: READY_MAX,
  });
}

async function resultValue(page, key) {
  return page.evaluate((key) => window.__ringFixture.result(key).value, key);
}

async function isOpen(page) {
  return page.evaluate(() => window.__ringFixture.controller.isOpen());
}

async function dialogCount(page) {
  return page.evaluate(() => document.querySelectorAll('dialog.ring-acquisition').length);
}

function normalizeColor(value) {
  if (!value) return '';
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3)
      return (
        '#' +
        hex
          .split('')
          .map((c) => c + c)
          .join('')
      );
    return '#' + hex;
  }
  return trimmed;
}
