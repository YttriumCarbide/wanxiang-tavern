import { newLibrary } from '../../src/ai/library.js';
import { applyGeneratedReset } from '../../src/app/generated-reset.js';
import { BASE_WORLDS } from '../../src/worlds.js';
import { addWorldRoute } from '../../src/exploration.js';

export async function openShelfPanel(page, action) {
  const frame = page.frameLocator('#inn-frame iframe');
  await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
  await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('bookshelf'));
  await frame.locator('#bookshelf-archives').click();
  await page.locator('#archive-dialog').waitFor({ state: 'visible' });
  const targetTab = action === 'archives' ? 'npcs' : action;
  if (targetTab && targetTab !== 'npcs') {
    await page.locator(`#archive-dialog [data-archive-tab="${targetTab}"]`).click();
  }
}

/** These suites exercise existing six-member saves; fresh creation has its own real API suite. */
export async function legacySession(
  page,
  { dismissJournals = true, worlds = [], unlockSilverCrownTavern = false } = {},
) {
  if (dismissJournals) await dismissAutomaticJournals(page);
  const values = new Map();
  applyGeneratedReset({
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  });
  const legacy = newLibrary();
  legacy.unlockedDungeons = [...BASE_WORLDS];
  legacy.worlds = worlds;
  if (unlockSilverCrownTavern) legacy.daily.unlocks.silverCrownTavern = true;
  for (const world of worlds) addWorldRoute(legacy.exploration, world, 17371);
  values.set('wanxiang.worldbooks.v1', JSON.stringify(legacy));
  await page.addInitScript(
    (entries) => {
      if (window.origin === 'null') return;
      if (localStorage.getItem('wanxiang.worldbooks.v1')) return;
      localStorage.setItem(
        'wanxiang.generation-options.v1',
        JSON.stringify({
          developerMode: true,
          allowRetreat: true,
          protagonistApi: false,
          scriptApi: false,
        }),
      );
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    [...values],
  );
}

/** Simulate closing each automatic journal; manually opened journals stay available to tests. */
export async function dismissAutomaticJournals(
  page,
  { dismissAllTheaters = false, dismissTheaters = true } = {},
) {
  await page.addInitScript(
    ({ dismissAllTheaters, dismissTheaters }) => {
      document.addEventListener('DOMContentLoaded', () => {
        const journal = document.querySelector('#story-feed');
        if (!journal) return;
        window.automaticJournals = JSON.parse(
          sessionStorage.getItem('test-automatic-journals') || '[]',
        );
        window.automaticTheaters = JSON.parse(
          sessionStorage.getItem('test-automatic-theaters') || '[]',
        );
        let scheduled = false;
        let theaterScheduled = false;
        let theaterTimer = null;
        let recordedTheater = '';
        function advanceAutomaticTheater() {
          const theater = document.querySelector('#chapter-theater');
          if (
            !theater ||
            theater.hidden ||
            !dismissTheaters ||
            (!dismissAllTheaters && theater.dataset.automatic !== 'true') ||
            theater.classList.contains('is-closing')
          ) {
            if (!dismissAllTheaters) {
              clearInterval(theaterTimer);
              theaterTimer = null;
            }
            recordedTheater = '';
            return;
          }
          const key = `${theater.dataset.mode}:${theater.dataset.theme}:${theater.querySelector('.chapter-theater-title')?.textContent || ''}`;
          if (theater.dataset.revealed === 'true' && key !== recordedTheater) {
            recordedTheater = key;
            window.automaticTheaters.push({
              mode: theater.dataset.mode,
              theme: theater.dataset.theme,
              heading: theater.querySelector('.chapter-theater-title')?.textContent || '',
            });
            sessionStorage.setItem(
              'test-automatic-theaters',
              JSON.stringify(window.automaticTheaters),
            );
          }
          theater.querySelector('#chapter-theater-continue')?.click();
        }
        const observer = new MutationObserver(() => {
          const theater = document.querySelector('#chapter-theater');
          if (
            theater &&
            !theater.hidden &&
            dismissTheaters &&
            (dismissAllTheaters || theater.dataset.automatic === 'true') &&
            !theater.classList.contains('is-closing') &&
            !theaterScheduled
          ) {
            theaterScheduled = true;
            setTimeout(() => {
              theaterScheduled = false;
              advanceAutomaticTheater();
              if (!theaterTimer) theaterTimer = setInterval(advanceAutomaticTheater, 120);
            }, 0);
          }
          const stage = document.querySelector('#gal-stage');
          if (
            stage &&
            !stage.hidden &&
            stage.dataset.owner === 'script' &&
            stage.dataset.automatic === 'true' &&
            stage.dataset.leaving !== 'true' &&
            !scheduled
          ) {
            scheduled = true;
            setTimeout(() => {
              scheduled = false;
              if (
                !stage.hidden &&
                stage.dataset.owner === 'script' &&
                stage.dataset.automatic === 'true' &&
                stage.dataset.leaving !== 'true'
              )
                stage.querySelector('.gal-page').click();
            }, 0);
          }
          if (journal.open && journal.dataset.automatic === 'true') {
            window.automaticJournals.push({
              page: document.querySelector('#story-page-count').textContent,
              resultVisible: document.querySelector('#result').open,
            });
            sessionStorage.setItem(
              'test-automatic-journals',
              JSON.stringify(window.automaticJournals),
            );
            document.querySelector('#story-close').click();
          }
        });
        observer.observe(document.body, {
          attributes: true,
          subtree: true,
          attributeFilter: [
            'open',
            'hidden',
            'class',
            'data-owner',
            'data-automatic',
            'data-typing',
            'data-leaving',
            'data-revealed',
            'data-test-script',
          ],
        });
        if (dismissTheaters && dismissAllTheaters) setInterval(advanceAutomaticTheater, 250);
      });
    },
    { dismissAllTheaters, dismissTheaters },
  );
}

/** Read an authored Gal sequence; this never advances an action-gated lesson by itself. */
export async function finishGalDialogue(page, owner) {
  for (let index = 0; index < 500; index++) {
    const state = await page.locator('#gal-stage').evaluate((stage) => ({
      hidden: stage.hidden,
      owner: stage.dataset.owner,
      leaving: stage.dataset.leaving === 'true',
    }));
    if (state.hidden || (owner && state.owner !== owner)) return;
    if (state.leaving)
      await page.waitForFunction(
        () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
      );
    else await page.locator('.gal-page').click();
  }
  throw Error('Gal dialogue did not reach its next interaction');
}

/** Settlement narration follows the completed experience animation. */
export async function finishSettlement(page) {
  await page.locator('#result').waitFor({ state: 'visible' });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-experience]')].every(
      (row) => row.dataset.experienceState === 'complete',
    ),
  );
  while (await page.locator('#level-dialogue').isVisible())
    await page.locator('#level-dialogue button').click();
  await page.waitForFunction(
    () => !document.querySelector('#result .result-buttons button:not([hidden]):disabled'),
  );
}
