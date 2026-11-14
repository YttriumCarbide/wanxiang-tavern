import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

/** Actual town roster/interaction, production planning menus, native art decoding and detail views. */
export async function townGuestChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => Boolean(window.demo));
    await page.evaluate(() => {
      document.querySelector('#inn-frame iframe').src = './street.html?scene=city-center';
    });
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('canvas').waitFor();
    const seen = new Set();
    for (let index = 0; index < 6; index++) {
      await frame.locator('canvas').evaluate(
        () =>
          new Promise((resolve, reject) => {
            const start = performance.now();
            function ready() {
              const actors = window.streetPreview?.visitors().characters;
              if (actors?.length === 2 && actors.every((actor) => actor.loaded)) return resolve();
              if (performance.now() - start > 60000)
                return reject(Error('Town guests did not load'));
              requestAnimationFrame(ready);
            }
            ready();
          }),
      );
      const actors = await frame
        .locator('canvas')
        .evaluate(() => window.streetPreview.visitors().characters);
      for (const actor of actors) seen.add(actor.key);
      if (index < 5) await page.locator('#scene-visitors-refresh').click();
    }
    for (const id of ['libet', 'lumi', 'yuto-nakashi'])
      assert(seen.has(id), id + ' appears before recruitment');
    assert(
      !(await page.evaluate(() => demo.getLibrary())).characters.some(
        (member) => member.id === 'official-lumi',
      ),
    );
    await page.screenshot({ path: path.join(output, 'unrecruited-town-guests.png') });
    await page.locator('#scene-talk').click();
    await page.locator('.gal-people-launcher').click();
    for (const id of ['libet', 'lumi', 'yuto-nakashi'])
      assert.equal(
        await page.locator(`#chat-participants input[value="official-${id}"]`).count(),
        1,
      );
    const selected = await page
      .locator('#chat-participants input:checked')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    for (const id of selected)
      await page.locator(`#chat-participants input[value="${id}"]`).uncheck();
    await page.locator('#chat-participants input[value="official-lumi"]').check();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.gal-cast img')].some(
        (image) => image.dataset.actor === 'official-lumi' && image.naturalWidth > 0,
      ),
    );
    await page.screenshot({ path: path.join(output, 'lumi-gal-full-original.png') });
    await page.goto(baseURL);
    await page.waitForFunction(() => Boolean(window.demo));
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
    assert.deepEqual(errors, []);
    return {
      townResidents: 3,
      nativePortraits: checks.portraits.length,
      menuTargets: true,
      statuses: 3,
    };
  } finally {
    await page.close();
  }
}
