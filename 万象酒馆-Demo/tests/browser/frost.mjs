import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The same engine events drive a real card counterattack and dead-ally revival targeting. */
export async function frostChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const document = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__frost', (route) =>
      route.fulfill({ contentType: 'text/html', body: document }),
    );
    await page.goto(baseURL + '/__frost');
    const checked = await page.evaluate(async () => {
      const [
        engine,
        data,
        { createBattleView },
        { officialCharacter },
        { createSession },
        { createSelection },
        { abilityFor },
        { GLTFLoader },
        frost,
      ] = await Promise.all([
        import('/src/engine.js'),
        import('/src/data.js'),
        import('/src/scene.js'),
        import('/src/ai/library.js'),
        import('/src/app/session.js'),
        import('/src/app/selection.js'),
        import('/src/catalog.js'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('/src/content/frost-adversaries.js'),
      ]);
      const loaded = [];
      for (const enemy of [...frost.FROST_ENEMIES, ...frost.FROST_BOSSES]) {
        const image = new Image();
        image.src = '/assets/portraits/' + enemy.portrait + '.svg';
        await image.decode();
        const model = (await new GLTFLoader().loadAsync('/assets/' + enemy.model)).scene;
        let meshes = 0;
        model.traverse((object) => {
          if (object.isMesh) {
            meshes++;
            object.geometry.dispose();
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              material.dispose();
          }
        });
        loaded.push({ id: enemy.id, width: image.naturalWidth, meshes });
      }
      document.body.classList.add('in-battle');
      for (const id of ['inn', 'scene-loading']) document.querySelector('#' + id).hidden = true;
      document.querySelector('#battle').hidden = false;
      const defs = Object.fromEntries(
        data.HEROES.map((hero) => [hero.id, { ...structuredClone(hero), skills: [], buffs: {} }]),
      );
      defs.aegis = { ...officialCharacter('luo-gongxu').combat, id: 'aegis' };
      defs.lyria = { ...officialCharacter('silica-laps').combat, id: 'lyria' };
      const enemy = {
        ...structuredClone(data.DEFINITIONS.frostCrusher),
        hp: 1000,
        boss: false,
        speed: 1,
        intents: [{ name: '试探', slot: 0, effects: [{ type: 'damage', value: 1 }] }],
        tactic: { target: 'fixed' },
      };
      const state = engine.newBattle(['frostCrusher'], defs, { frostCrusher: enemy });
      state.phase = 'plan';
      state.round = 1;
      state.soulLoans = { lyria: 'morrow' };
      state.units.aegis.mp = 5;
      const clicks = [];
      const view = await createBattleView(
        document.querySelector('#battle'),
        (...args) => {
          clicks.push(args);
          window.frostFixture?.selection.selectUnit(...args);
        },
        {
          map: 'frost',
          enemyIds: state.enemyIds,
          heroDefinitions: defs,
          enemyDefinitions: state.enemyDefinitions,
        },
      );
      const result = engine.preview(state, []);
      view.draw(state, result, null, null);
      let before = state;
      for (const event of result.events) {
        if (event.type === 'counter') {
          const duration = view.playEvent(event, before);
          await new Promise((resolve) => setTimeout(resolve, duration + 50));
        }
        before = event.after;
      }
      const session = createSession();
      session.battle.state = state;
      state.soulLoans = { lyria: 'serin' };
      state.units.morrow.hp = 0;
      session.battle.forecast = engine.preview(state, []);
      session.selection.interactionStep = 'target';
      session.selection.selected = 'lyria';
      session.selection.selectedCell = 0;
      session.selection.pending = { kind: 'skill', actor: 'lyria', skill: 'soul-revive', ap: 2 };
      const queued = [];
      const selection = createSelection({
        session,
        roster: { ability: (id, skill) => abilityFor(state, id, skill) },
        planning: { put: () => queued.push(session.selection.pending.target) },
        viewport: { canPlan: () => true, compactHUD: () => false },
        renderer: { render() {} },
      });
      const eligible = selection.eligibleTargets();
      view.draw(state, session.battle.forecast, 'lyria', null);
      selection.refreshInteraction();
      window.frostFixture = { view, selection, clicks, queued };
      return {
        loaded,
        eligible,
        counters: result.events.filter((event) => event.type === 'counter').length,
      };
    });
    assert.equal(checked.loaded.length, 24);
    assert(checked.loaded.every((entry) => entry.width === 600 && entry.meshes > 0));
    assert.equal(checked.counters, 1);
    assert.deepEqual(checked.eligible, ['morrow']);
    const target = page.locator('[data-unit="morrow"]').first();
    assert(await target.isVisible());
    await target.click();
    assert.deepEqual(await page.evaluate(() => window.frostFixture.queued), ['morrow']);
    await page.screenshot({ path: path.join(output, 'official-visitors-frost.png') });
    await page.evaluate(() => window.frostFixture.view.dispose());
    // Review all original silhouettes in a single contact sheet; browser decoding uses actual shipped assets.
    await page.evaluate(async () => {
      const { FROST_ENEMIES, FROST_BOSSES } = await import('/src/content/frost-adversaries.js');
      document.body.replaceChildren();
      document.body.style.cssText =
        'margin:0;background:#142428;display:grid;grid-template-columns:repeat(8,1fr);gap:8px;padding:12px;overflow:auto';
      for (const enemy of [...FROST_ENEMIES, ...FROST_BOSSES]) {
        const card = document.createElement('figure');
        card.style.cssText = 'margin:0;color:#e8dfbf;text-align:center;font:13px sans-serif';
        const image = new Image();
        image.src = '/assets/portraits/' + enemy.portrait + '.svg';
        image.style.cssText = 'width:100%;height:225px;object-fit:contain';
        await image.decode();
        const label = document.createElement('figcaption');
        label.textContent = enemy.name;
        card.append(image, label);
        document.body.append(card);
      }
    });
    await page.screenshot({
      path: path.join(output, 'frost-enemy-contact-sheet.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    return checked;
  } finally {
    await page.close();
  }
}
