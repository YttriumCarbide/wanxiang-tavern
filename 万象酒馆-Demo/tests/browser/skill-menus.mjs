import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

/** Exercise production menu/planning controllers against the real DOM and the sole engine. */
export async function skillMenuChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  await legacySession(page);
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const result = await page.evaluate(async () => {
      const [
        { newBattle, preview },
        { HEROES },
        { defaultProtagonist },
        { EDITH },
        { createPlanning },
        { createDrag },
        { createSelection },
        { definition, abilityFor },
      ] = await Promise.all([
        import('/src/engine.js'),
        import('/src/data.js'),
        import('/src/content/qingyuan.js'),
        import('/src/content/edith.js'),
        import('/src/app/planning.js'),
        import('/src/app/drag.js'),
        import('/src/app/selection.js'),
        import('/src/catalog.js'),
      ]);
      const definitions = Object.fromEntries(
        HEROES.map((hero) => [hero.id, structuredClone(hero)]),
      );
      definitions.aegis = { ...defaultProtagonist().combat, id: 'aegis', emblemId: 'tan-hongyu' };
      definitions.lyria = { ...structuredClone(EDITH), id: 'lyria', emblemId: 'mizunatsuki-ran' };
      definitions.morrow.emblemId = 'kamui';
      const state = newBattle(['hound'], definitions);
      for (const id of ['aegis', 'lyria', 'morrow']) state.units[id].emblemCharge = 6;
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
      function reset() {
        session.battle.plan = [];
        context.selection.clearSelection(true);
        context.planning.recompute();
      }
      const menu = document.querySelector('#drag-menu');
      const checks = {};
      context.selection.selectUnit('aegis', 'Friendly', 0);
      const own = definitions.aegis.skills.find((skill) => skill.target === 'self');
      checks.self = !menu.hidden && Boolean(menu.querySelector(`[data-drop-skill="${own.id}"]`));
      menu.querySelector(`[data-drop-skill="${own.id}"]`).click();
      checks.selfQueued =
        session.battle.plan[0]?.target === 'aegis' && session.battle.forecast.valid;
      reset();
      context.selection.selectUnit('lyria', 'Friendly', 1);
      checks.noSelf = menu.hidden;
      for (const [actor, skill] of [
        ['lyria', 'emblem-overload'],
        ['morrow', 'emblem-dragon-vein'],
      ]) {
        reset();
        context.selection.selectUnit(actor, 'Friendly', state.formation.indexOf(actor));
        checks[skill + '-hidden'] =
          !menu.querySelector(`[data-drop-skill="${skill}"]`) || menu.hidden;
        context.selection.selectUnit(actor, 'Friendly', state.formation.indexOf(actor));
        const button = menu.querySelector(`[data-drop-skill="${skill}"]`);
        checks[skill] = !menu.hidden && button && !button.disabled;
        button?.click();
        checks[skill + '-queued'] =
          session.battle.plan[0]?.followUp?.skill === skill && session.battle.forecast.valid;
      }
      reset();
      context.selection.selectUnit('aegis', 'Friendly', 0);
      context.selection.selectUnit('aegis', 'Friendly', 0);
      context.drag.showDropMenu('aegis', 'hound', 'Enemy');
      const balance = menu.querySelector('[data-drop-skill="emblem-balance"]');
      checks.balance = Boolean(balance && !balance.disabled);
      balance?.click();
      checks.balanceQueued =
        session.battle.plan[0]?.followUp?.skill === 'emblem-balance' &&
        session.battle.forecast.valid;
      reset();
      state.heroDefinitions.aegis.emblemId = 'jiu-qi';
      state.units.hound.buffs = { weak: 1, vulnerable: 1, slow: 1 };
      context.planning.recompute();
      context.selection.selectUnit('aegis', 'Friendly', 0);
      context.selection.selectUnit('aegis', 'Friendly', 0);
      context.drag.showDropMenu('aegis', 'hound', 'Enemy');
      const moon = menu.querySelector('[data-drop-skill="emblem-moon-eye"]');
      checks.moonEye = Boolean(moon && !moon.disabled);
      moon?.click();
      checks.moonEyeQueued =
        session.battle.plan[0]?.followUp?.skill === 'emblem-moon-eye' &&
        session.battle.forecast.valid;
      reset();
      state.heroDefinitions.lyria.emblemId = 'wind-dance';
      context.planning.recompute();
      context.selection.selectUnit('lyria', 'Friendly', 1);
      context.selection.selectUnit('lyria', 'Friendly', 1);
      context.drag.showDropMenu('lyria', 'morrow', 'Friendly');
      const sacrifice = menu.querySelector('[data-drop-skill="emblem-deceit-sacrifice"]');
      checks.sacrifice = Boolean(sacrifice && !sacrifice.disabled);
      sacrifice?.click();
      checks.sacrificeQueued =
        session.battle.plan[0]?.followUp?.skill === 'emblem-deceit-sacrifice' &&
        session.battle.forecast.valid;
      reset();
      context.drag.showDropMenu('lyria', 'hound', 'Enemy');
      checks.hpTooltip = menu
        .querySelector('[data-drop-skill="cinnabar-eclipse"]')
        .dataset.tooltip.includes('6 hp');
      return checks;
    });
    for (const [name, passed] of Object.entries(result)) assert(passed, name);
    await page.screenshot({ path: path.join(output, 'skill-menu.png') });
    return result;
  } finally {
    await page.close();
  }
}
