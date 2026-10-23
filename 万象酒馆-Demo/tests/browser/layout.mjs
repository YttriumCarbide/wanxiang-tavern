import { legacySession } from './legacy-session.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const profiles = [
  { name: 'desktop', width: 1440, height: 836, touch: false },
  { name: 'wide', width: 2560, height: 1440, touch: false },
  { name: 'tablet', width: 1024, height: 768, touch: false },
  { name: 'landscape', width: 844, height: 390, touch: true },
];
const selectors = [
  '#battle',
  '#stage',
  '.right-rail',
  '#details',
  '.command-controls',
  '#commit',
  '#clear',
  '.rear-panel',
  '#rear-cards',
  '.rear-card',
  '.rear-name',
  '.rear-resources',
  '#ap-orb',
  '.round-indicator',
  '.turn-column',
  '#timeline',
  '#opening-preview',
  '.preview-grid',
  '.time-cell',
  '.unit-hit',
  '.unit-info',
  '.unit-resources',
  '.bar',
  '.resource-number',
  '.card-buffs',
  '.buff-icon',
  '.ability',
  '.hero-heading',
];

async function capture(page) {
  return page.evaluate(
    (selectors) =>
      selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)].map((element, index) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const properties = [
            'display',
            'position',
            'fontSize',
            'color',
            'backgroundColor',
            'borderColor',
            'gap',
            'padding',
            'margin',
            'zIndex',
            'overflow',
            'visibility',
            'opacity',
            'transform',
          ];
          return {
            key: `${selector}[${index}]`,
            raisedStatus: element.matches('.unit-hit .card-buffs, .unit-hit .buff-icon'),
            rect: Object.fromEntries(
              ['x', 'y', 'width', 'height'].map((key) => [key, Math.round(rect[key] * 100) / 100]),
            ),
            style: Object.fromEntries(properties.map((key) => [key, style[key]])),
          };
        }),
      ),
    selectors,
  );
}

export async function layout({ browser, baseURL, fixture, update = false }) {
  const snapshots = {};
  const detailDiagnostics = {};
  for (const touch of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 836 }, hasTouch: touch });
    try {
      await legacySession(page);
      // Keep the original visual fixture's starting status icon. The new first
      // companion has no innate armour; this is only a layout-test sample.
      await page.route('**/src/content/changjing-yuexi.js', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        await route.fulfill({
          response,
          body: source.replace('limit: 1,', 'limit: 1,\n  buffs: { iron: 1 },'),
        });
      });
      await page.goto(baseURL);
      await page.evaluate(() => demo.startBattle());
      await page.waitForFunction(
        () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
        { timeout: 60000 },
      );
      await page.addStyleTag({
        content: '*,*::before,*::after{animation:none!important;transition:none!important}',
      });
      for (const profile of profiles.filter((profile) => profile.touch === touch)) {
        await page.setViewportSize({ width: profile.width, height: profile.height });
        await page.waitForTimeout(180);
        snapshots[profile.name] = await capture(page);
        detailDiagnostics[profile.name] = await page.evaluate(() => {
          const panel = document.querySelector('#details');
          const scroll = panel.querySelector('.details-actions-scroll');
          return {
            selected: window.demo.getStatus().selected,
            heading: panel.querySelector('h2')?.textContent,
            text: panel.innerText,
            scroll: scroll
              ? { clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight }
              : null,
            categories: [...panel.querySelectorAll('.action-category')].map((section) => ({
              title: section.querySelector('.action-category-title')?.textContent,
              height: section.getBoundingClientRect().height,
              children: section.childElementCount,
            })),
            buffs: panel.querySelector('.detail-buffs')?.innerHTML,
            style: {
              height: getComputedStyle(panel).height,
              maxHeight: getComputedStyle(panel).maxHeight,
              overflow: getComputedStyle(panel).overflow,
            },
          };
        });
      }
    } finally {
      await page.close();
    }
  }
  if (update) {
    await writeFile(
      fixture,
      JSON.stringify({ platform: process.platform, snapshots }, null, 2) + '\n',
    );
    return { captured: profiles.map((profile) => profile.name) };
  }
  const expected = JSON.parse(await readFile(fixture, 'utf8'));
  if (expected.platform !== process.platform)
    return { skipped: 'Pixel layout fixture is platform-specific; interaction checks still run' };
  const differences = [];
  for (const [name, actual] of Object.entries(snapshots)) {
    const baseline = expected.snapshots[name];
    // The current five ability categories need more height than the old disclosure panel.
    // Keep the golden fixture; verify category flow and dependent controls separately.
    const currentDetails = actual.find((entry) => entry.key === '#details[0]');
    const previousDetails = baseline.find((entry) => entry.key === '#details[0]');
    const detailHeightChange = previousDetails.rect.height - currentDetails.rect.height;
    assert(
      currentDetails.rect.height > 0 &&
        currentDetails.rect.y + currentDetails.rect.height <=
          profiles.find((profile) => profile.name === name).height,
      `${name}: details must remain inside the viewport. ${JSON.stringify(detailDiagnostics[name])}`,
    );
    const commands = actual.find((entry) => entry.key === '.command-controls[0]');
    assert(currentDetails.rect.y + currentDetails.rect.height <= commands.rect.y);
    assert(
      commands.rect.y + commands.rect.height <=
        profiles.find((profile) => profile.name === name).height,
    );
    const abilities = actual.filter((entry) => entry.key.startsWith('.ability['));
    for (const [index, ability] of abilities.entries()) {
      assert(ability.rect.x >= currentDetails.rect.x);
      assert(
        ability.rect.x + ability.rect.width <= currentDetails.rect.x + currentDetails.rect.width,
      );
      assert(ability.rect.width >= currentDetails.rect.width * 0.8);
      if (index)
        assert(ability.rect.y >= abilities[index - 1].rect.y + abilities[index - 1].rect.height);
    }
    if (actual.length !== baseline.length) {
      differences.push(`${name}: element count ${actual.length} != ${baseline.length}`);
      continue;
    }
    for (let index = 0; index < actual.length; index++) {
      const value = actual[index],
        previous = baseline[index];
      if (value.key !== previous.key) {
        differences.push(`${name}: element order ${value.key}`);
        continue;
      }
      // The requested round-label relocation replaces its old centered-button baseline.
      // Keep every other baseline comparison unchanged and check its new bounds explicitly.
      if (value.key === '.round-indicator[0]') {
        assert(
          value.rect.x >= 0 &&
            value.rect.x + value.rect.width <
              profiles.find((profile) => profile.name === name).width / 2,
        );
        assert(value.rect.y >= 0);
        assert.equal(value.style.transform, 'none');
        continue;
      }
      for (const key of Object.keys(value.rect)) {
        // Category headings and the scroll gutter intentionally change button flow.
        if (value.key.startsWith('.ability[') && ['y', 'width'].includes(key)) continue;
        if (['.command-controls[0]', '#commit[0]', '#clear[0]'].includes(value.key) && key === 'y')
          continue;
        if (
          Math.abs(
            value.rect[key] -
              previous.rect[key] +
              // The requested status row sits 33px above its former position.
              // Compare every other coordinate and style against the original baseline.
              (key === 'y' && value.raisedStatus
                ? 33
                : value.key === '#details[0]' && key === 'height'
                  ? detailHeightChange
                  : 0),
          ) > 1
        )
          differences.push(
            `${name} ${value.key} ${key}: ${value.rect[key]} != ${previous.rect[key]}`,
          );
      }
      for (const key of Object.keys(value.style))
        if (value.style[key] !== previous.style[key])
          differences.push(
            `${name} ${value.key} ${key}: ${value.style[key]} != ${previous.style[key]}`,
          );
    }
  }
  assert.deepEqual(
    differences.slice(0, 50),
    [],
    `${differences.length} layout differences; baseline is not updated automatically`,
  );
  return { matched: profiles.map((profile) => profile.name) };
}
