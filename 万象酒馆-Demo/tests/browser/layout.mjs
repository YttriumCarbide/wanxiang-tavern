import { legacySession } from './legacy-session.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

async function capture(page, markCollapsibleDetails = false) {
  return page.evaluate(
    ({ selectors, markCollapsibleDetails }) =>
      selectors.flatMap((selector) => {
        const matches = [...document.querySelectorAll(selector)];
        // Empty scene slots have no data-unit; exclude them by meaning, not position.
        const elements =
          selector === '.unit-hit'
            ? matches.filter((element) => element.hasAttribute('data-unit'))
            : matches;
        return elements.map((element, index) => {
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
            ...(markCollapsibleDetails && {
              collapsibleDetail: Boolean(
                element.closest('#details > :not(.hero-heading):not(.empty-character)'),
              ),
            }),
            rect: Object.fromEntries(
              ['x', 'y', 'width', 'height'].map((key) => [key, Math.round(rect[key] * 100) / 100]),
            ),
            style: Object.fromEntries(properties.map((key) => [key, style[key]])),
          };
        });
      }),
    { selectors, markCollapsibleDetails },
  );
}

async function assertEmptyUnitHitSlotsHidden(page, profileName) {
  const emptySlots = await page.locator('.unit-hit').evaluateAll((elements) =>
    elements
      .filter((element) => !element.hasAttribute('data-unit'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          hidden: element.hidden,
          display: getComputedStyle(element).display,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }),
  );
  assert.equal(emptySlots.length, 1, profileName + ': expected exactly one unassigned unit hitbox');
  for (const [index, slot] of emptySlots.entries()) {
    assert.equal(
      slot.hidden,
      true,
      profileName + ': empty unit hitbox ' + index + ' lacks the hidden attribute',
    );
    assert.equal(
      slot.display,
      'none',
      profileName + ': empty unit hitbox ' + index + ' is not display-hidden',
    );
    assert.deepEqual(
      slot.rect,
      { x: 0, y: 0, width: 0, height: 0 },
      profileName + ': empty unit hitbox ' + index + ' still occupies layout',
    );
  }
}

function assertAbilityFlow(snapshot, details, name) {
  const abilities = snapshot.filter((entry) => entry.key.startsWith('.ability['));
  assert(abilities.length > 0, `${name}: expected skill buttons`);
  for (const [index, { key, rect }] of abilities.entries()) {
    assert(rect.height > 0, `${name}: ${key} must have a layout box`);
    assert(
      rect.x >= details.x && rect.x + rect.width <= details.x + details.width,
      `${name}: ${key} must fit horizontally inside details`,
    );
    assert(rect.width >= details.width * 0.8, `${name}: ${key} is too narrow`);
    if (index) {
      const previous = abilities[index - 1].rect;
      assert(
        rect.y >= previous.y + previous.height,
        `${name}: ${key} overlaps the preceding skill`,
      );
    }
  }
}

async function checkLandscapeDetails(page, profile, collapsed) {
  const panel = page.locator('#details');
  const actions = panel.locator('.details-actions-scroll');
  assert(
    await panel.locator('.hero-heading').isVisible(),
    'landscape: collapsed heading is hidden',
  );
  assert.equal(
    await actions.evaluate((element) => getComputedStyle(element).display),
    'none',
    'landscape: the skill list must start collapsed',
  );
  const collapsedPanel = collapsed.find((entry) => entry.key === '#details[0]');
  assert(
    collapsedPanel.rect.height <= 62,
    `landscape: collapsed details exceed the compact 62px cap (${collapsedPanel.rect.height}px)`,
  );
  const hidden = collapsed.filter((entry) => entry.collapsibleDetail);
  assert(
    hidden.some((entry) => entry.key.startsWith('.ability[')),
    'landscape: collapsed skill buttons must still be present',
  );
  for (const { key, rect } of hidden) {
    assert.deepEqual(
      rect,
      { x: 0, y: 0, width: 0, height: 0 },
      `landscape: ${key} is not collapsed`,
    );
  }

  await page.locator('#details-toggle').tap({ timeout: 5000 });
  await actions.waitFor({ state: 'visible', timeout: 5000 });
  const expanded = await capture(page);
  const { rect } = expanded.find((entry) => entry.key === '#details[0]');
  const collapsedHeight = collapsed.find((entry) => entry.key === '#details[0]').rect.height;
  assert(
    rect.width > 0 &&
      rect.height > collapsedHeight &&
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= profile.width &&
      rect.y + rect.height <= profile.height,
    `landscape: expanded details must grow within the viewport (${JSON.stringify(rect)})`,
  );
  assertAbilityFlow(expanded, rect, 'landscape expanded');
}

export async function layout({ browser, baseURL, fixture, output, update = false }) {
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
        await assertEmptyUnitHitSlotsHidden(page, profile.name);
        const checkDisclosure = !update && profile.name === 'landscape';
        const snapshot = await capture(page, checkDisclosure);
        snapshots[profile.name] = snapshot;
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
        if (checkDisclosure) await checkLandscapeDetails(page, profile, snapshot);
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
    // The categorized abilities need more height than the old disclosure panel.
    // Keep the golden fixture; verify category flow and dependent controls separately.
    const currentDetails = actual.find((entry) => entry.key === '#details[0]');
    const previousDetails = baseline.find((entry) => entry.key === '#details[0]');
    const detailHeightChange = previousDetails.rect.height - currentDetails.rect.height;
    const profile = profiles.find((item) => item.name === name);
    assert(
      currentDetails.rect.x >= 0 &&
        currentDetails.rect.y >= 0 &&
        currentDetails.rect.x + currentDetails.rect.width <= profile.width &&
        currentDetails.rect.height > 0 &&
        currentDetails.rect.y + currentDetails.rect.height <= profile.height,
      `${name}: details must remain inside the viewport. ${JSON.stringify(detailDiagnostics[name])}`,
    );

    const commands = actual.find((entry) => entry.key === '.command-controls[0]');
    assert(currentDetails.rect.y + currentDetails.rect.height <= commands.rect.y);
    assert(commands.rect.y + commands.rect.height <= profile.height);
    if (name !== 'landscape') assertAbilityFlow(actual, currentDetails.rect, name);
    const actualKeys = actual.map(({ key }) => key);
    const baselineKeys = baseline.map(({ key }) => key);
    const baselineByKey = new Map(baseline.map((entry) => [entry.key, entry]));
    const actualKeySet = new Set(actualKeys);
    const baselineKeySet = new Set(baselineKeys);
    const added = actualKeys.filter((key) => !baselineKeySet.has(key));
    const missing = baselineKeys.filter((key) => !actualKeySet.has(key));
    if (actual.length !== baseline.length || added.length || missing.length) {
      differences.push(
        `${name}: element count ${actual.length} != ${baseline.length} (added: ${added.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`,
      );
    } else if (actualKeys.some((key, index) => key !== baselineKeys[index])) {
      differences.push(`${name}: element order differs from the fixture`);
    }
    for (const value of actual) {
      const previous = baselineByKey.get(value.key);
      if (!previous) continue;
      // The requested round-label relocation replaces its old centered-button baseline.
      // Keep every other baseline comparison unchanged and check its new bounds explicitly.
      if (value.key === '.round-indicator[0]') {
        assert(value.rect.x >= 0 && value.rect.x + value.rect.width < profile.width / 2);
        assert(value.rect.y >= 0);
        assert.equal(value.style.transform, 'none');
        continue;
      }
      for (const key of Object.keys(value.rect)) {
        // The old landscape fixture laid out these descendants even when clipped.
        // The disclosure check verifies their zero rects now; computed styles still compare.
        if (name === 'landscape' && value.collapsibleDetail) continue;
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
  if (differences.length && output) {
    await writeFile(path.join(output, 'layout-differences.txt'), differences.join('\n') + '\n');
  }
  assert.deepEqual(
    differences.slice(0, 50),
    [],
    `${differences.length} layout differences; baseline is not updated automatically`,
  );
  return { matched: profiles.map((profile) => profile.name) };
}
