import { newLibrary } from '../../src/ai/library.js';
import { applyGeneratedReset } from '../../src/app/generated-reset.js';

/** These suites exercise existing six-member saves; fresh creation has its own real API suite. */
export async function legacySession(page) {
  await dismissAutomaticJournals(page);
  const values = new Map();
  applyGeneratedReset({
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  });
  values.set('wanxiang.worldbooks.v1', JSON.stringify(newLibrary()));
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
export async function dismissAutomaticJournals(page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const journal = document.querySelector('#story-feed');
      if (!journal) return;
      window.automaticJournals = JSON.parse(
        sessionStorage.getItem('test-automatic-journals') || '[]',
      );
      const observer = new MutationObserver(() => {
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
      observer.observe(journal, { attributes: true, attributeFilter: ['open'] });
    });
  });
}
