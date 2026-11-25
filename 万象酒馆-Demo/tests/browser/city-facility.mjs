import assert from 'node:assert/strict';
import { cityFacilities } from '../../src/city-directory.js';
import { REGIONS } from '../../src/content/regions.js';
import { guildBountyBoard } from '../../src/guild.js';
import { openCityDirectory, travelTownScene } from './town-navigation.mjs';

export async function openCityFacility(page, facility) {
  await page.waitForFunction(
    () => document.querySelector('#inn-frame iframe')?.contentWindow?.modelReady,
  );
  await travelTownScene(page, 'city-center');
  const directory = await openCityDirectory(page);
  await directory.locator(`[data-city-facility="${facility}"]`).click();
  if (facility === 'blacksmith') await verifyBlacksmithWorkspace(page);
}

async function blacksmithLayout(smith) {
  return smith.evaluate((dialog) => {
    const stage = dialog.querySelector('.blacksmith-stage').getBoundingClientRect();
    const icon = dialog.querySelector('.blacksmith-workpiece svg').getBoundingClientRect();
    const controls = dialog.querySelector('.blacksmith-anvil');
    return {
      headroom: stage.height - icon.height,
      controlsSeparated: stage.bottom <= controls.getBoundingClientRect().top + 1,
      fits:
        dialog.scrollWidth <= dialog.clientWidth + 1 &&
        controls.clientHeight > 0 &&
        controls.scrollWidth <= controls.clientWidth + 1,
    };
  });
}

async function verifyBlacksmithStage(smith) {
  assert.equal(await smith.locator('.blacksmith-heading .blacksmith-mark').count(), 1);
  const stage = smith.locator('.blacksmith-stage[data-forge-reserve="true"]');
  await stage.waitFor();
  assert.equal(await stage.locator('.forge-operation-feedback').count(), 1);
  assert.equal(await smith.locator('[role="status"][aria-live="polite"]').count(), 1);
}

async function verifyMarketRules(shop) {
  assert.equal(await shop.getAttribute('data-shop-mode'), 'market');
  assert(await shop.locator('#shop-categories').isHidden());
  assert((await shop.locator('[data-food-select]').count()) > 0);
  assert.equal(await shop.locator('[data-shop-item], [data-buy]').count(), 0);
  assert.equal(await shop.locator('[data-food-buy]').count(), 1);
}

async function verifyGuildNoticeBoard(guild, cityId) {
  const notices = guild.locator('.guild-notice-board .guild-notice');
  assert((await notices.count()) > 0);
  assert.equal(await notices.locator('.guild-card-meta h3, .guild-card-desc').count(), 0);
  assert.equal(await notices.locator('.guild-card-obj').count(), await notices.count());
  assert.equal(await guild.locator('[data-guild-tab="supplies"], [data-guild-buy]').count(), 0);
  const { day, tavernQuests } = await guild.evaluate(() => {
    const library = demo.getLibrary();
    return { day: library.daily.day, tavernQuests: library.tavernQuests };
  });
  const expected = guildBountyBoard({ daily: { day }, tavernQuests }).map((bounty) => {
    const targets = bounty.targetMaps.map((id) => REGIONS[id].name);
    if (bounty.targetKind === 'any-road') targets.unshift('大地图游荡敌群');
    const active = tavernQuests.find(
      ({ bountyId, status }) => bountyId === bounty.id && status === 'active',
    );
    const current = active?.objectives?.[0]?.current ?? 0;
    return {
      id: bounty.id,
      objective: targets.join(' / ') + ' ' + current + '/' + bounty.targetCount,
    };
  });
  const rendered = await notices.evaluateAll((cards) =>
    cards.map((card) => {
      const objective = card.querySelector('.guild-card-obj')?.innerText ?? '';
      return {
        id: card.dataset.bountyId,
        objective: objective.trim().replace(/^◆\s*/u, '').replace(/\s+/gu, ' '),
      };
    }),
  );
  assert.deepEqual(
    rendered,
    expected,
    cityId + ' on day ' + day + ': the board must show the posted bounties and their targets',
  );
  const boardStyle = await notices.evaluateAll((cards) =>
    cards.map((card) => getComputedStyle(card).rotate),
  );
  assert(new Set(boardStyle).size > 1, 'posted slips must not align as identical cards');
}

async function verifyBlacksmithWorkspace(page) {
  const smith = page.locator('#city-blacksmith[open]');
  await smith.waitFor({ state: 'visible' });
  await verifyBlacksmithStage(smith);
  await page.waitForFunction(() =>
    [...document.styleSheets].some((sheet) => sheet.href?.endsWith('/styles/blacksmith.css')),
  );
  const weapon = smith.locator('[data-smith-category="weapon"]').first();
  await weapon.click();
  const rackArt = weapon.locator('svg.equipment-art');
  const stageArt = smith.locator('.blacksmith-workpiece svg.equipment-art');
  await rackArt.waitFor({ state: 'visible' });
  await stageArt.waitFor({ state: 'visible' });
  const paths = (art) =>
    art.locator('path[d]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('d')));
  const blade = await paths(rackArt);
  assert(blade.length > 1, 'weapon art must include a silhouette, not only a frame');
  assert.deepEqual(await paths(stageArt), blade, 'stage must preview the selected weapon');
  const wide = await blacksmithLayout(smith);
  assert(
    wide.headroom >= 32 && wide.controlsSeparated && wide.fits,
    'desktop forge stage must leave clear space above its controls',
  );

  const viewport = page.viewportSize();
  const reducedMotion = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const narrow = await blacksmithLayout(smith);
    assert(
      narrow.headroom > 0 && narrow.controlsSeparated && narrow.fits,
      'compact forge stage and controls must fit a narrow viewport',
    );
    await verifyBlacksmithReceipt(page, smith, stageArt);
  } finally {
    if (viewport) await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  }
}

async function verifyBlacksmithReceipt(page, smith, stageArt) {
  // Reforge the equipment suite's seeded weapon; its level and quality remain unchanged.
  const snapshot = () =>
    page.evaluate(() => {
      const { inventory, equipment } = demo.getLibrary();
      return { gold: inventory.gold, ether: inventory.ether, owned: equipment.owned };
    });
  const before = await snapshot();
  const service = smith.locator('[data-smith-service="reforge"]');
  const confirmation = page.locator('.equipment-feedback-dialog[open]');
  const status = smith.getByRole('status');
  const effect = smith.locator('.blacksmith-stage .forge-operation-feedback');

  await service.click();
  const quote = await confirmation.locator('.equipment-feedback-cost').innerText();
  const cost = Number(quote.match(/^支付 (\d+) 金币$/)?.[1]);
  assert(Number.isInteger(cost) && cost > 0, 'the confirmation must quote the gold cost');
  assert.deepEqual(await snapshot(), before, 'opening a quote must not execute a trade');
  await confirmation.locator('.equipment-feedback-cancel').click();
  await confirmation.waitFor({ state: 'hidden' });
  assert.deepEqual(await snapshot(), before, 'cancel must preserve coins and equipment');
  assert.equal(await status.textContent(), '');
  assert.equal(await effect.isVisible(), false, 'cancel must not play the forge effect');

  await service.click();
  await confirmation.locator('.equipment-feedback-confirm').click();
  await effect.and(smith.locator('[data-kind="reforge"]')).waitFor({ state: 'visible' });
  assert.equal(
    await stageArt.evaluate((icon) => icon.getAnimations().length),
    0,
    'reduced motion keeps the success cue static',
  );
  assert.equal(await status.innerText(), '重铸完成 · 金币 −' + cost);
  const after = await snapshot();
  assert.equal(after.gold, before.gold - cost, 'exactly the quoted gold must be charged once');
  assert.equal(after.ether, before.ether);
  assert.deepEqual(
    after.owned.map(({ id, level, quality }) => [id, level, quality]),
    before.owned.map(({ id, level, quality }) => [id, level, quality]),
  );
}

const CITY_FACILITY_EXPECTATIONS = {
  starbell: {
    name: '星钟城',
    facilities: {
      blacksmith: 'lantern-workshop',
      market: 'market',
      guild: 'city-center',
    },
  },
  'silver-crown': {
    name: '银冠城',
    facilities: {
      blacksmith: 'crown-mint',
      market: 'crown-arcade',
      guild: 'crown-ledger',
    },
  },
  eternal: {
    name: '艾尔鲁斯',
    facilities: {
      blacksmith: 'eternal-garrison',
      market: 'eternal-quay',
      guild: 'eternal-plaza',
    },
  },
};

const FACILITY_ORDER = ['blacksmith', 'market', 'guild'];

export async function verifyTavernInteriorChatPlaces(page) {
  const chat = page.locator('.daily-dock [data-daily="chat"]');
  await chat.waitFor({ state: 'visible' });
  await chat.click();

  const workspace = page.locator('#gal-stage[data-workspace="chat"]');
  await workspace.waitFor({ state: 'visible' });
  const people = workspace.locator('.gal-people-launcher');
  const peopleBox = await people.boundingBox();
  assert(
    peopleBox && peopleBox.x + peopleBox.width < page.viewportSize().width / 2,
    'the conversation people launcher stays on the left side',
  );
  await people.click();

  const panel = workspace.locator('.gal-side');
  await panel.waitFor({ state: 'visible' });
  const select = panel.locator('#chat-place-select');
  await select.waitFor({ state: 'visible' });
  assert.deepEqual(
    await select.locator('option').evaluateAll((options) => options.map(({ value }) => value)),
    ['bar', 'bar2', 'table', 'table2'],
    'tavern chat only offers indoor hall locations',
  );
  assert.equal(
    await panel.locator('.chat-location-label .chat-location-value').isHidden(),
    true,
    'the location label yields to the selectable indoor location list',
  );
  await select.selectOption('bar2');
  assert.equal(await select.inputValue(), 'bar2');

  await workspace.locator('[data-gal="close"]').click();
  await workspace.waitFor({ state: 'hidden' });
}

async function verifySilverCrownTalkPlace(page) {
  const placeId = 'crown-arcade';
  const title = '银冠城 · 银工连廊';
  const outing = () =>
    page.evaluate(() => {
      const { scene, turns } = demo.getLibrary().daily.active || {};
      return { scene, turns };
    });
  const before = await outing();

  const talk = page.locator('#scene-talk');
  await talk.waitFor({ state: 'visible' });
  await talk.click();

  const workspace = page.locator('#gal-stage[data-workspace="chat"]');
  await workspace.waitFor({ state: 'visible' });
  const opener = workspace.locator('.gal-people-launcher');
  await opener.waitFor({ state: 'visible' });
  const box = await opener.boundingBox();
  assert(
    box && box.x + box.width < page.viewportSize().width / 2,
    'People opens from the left edge',
  );
  await opener.click();
  const people = workspace.locator('.gal-side');
  await people.waitFor({ state: 'visible' });
  const guidance = people.locator('#chat-focus-guidance');
  await guidance.waitFor();
  assert.match(await guidance.innerText(), /建议选择不超过两位/);
  const location = people.locator('.chat-location-label .chat-location-value');
  await location.waitFor({ state: 'visible' });
  assert.equal(await location.innerText(), title);

  const select = people.locator('#chat-place-select');
  assert.deepEqual(
    await select.locator('option').evaluateAll((options) => options.map(({ value }) => value)),
    [placeId],
    'an outdoor city conversation only retains the current place',
  );
  assert.equal(
    await select.isHidden(),
    true,
    'an outdoor city conversation locks its effective place',
  );
  assert.equal(await select.inputValue(), placeId);
  await select.evaluate((element) => {
    element.value = 'table';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(
    (id) => document.querySelector('#chat-place-select')?.value === id,
    placeId,
  );

  assert.deepEqual(await outing(), before, 'chat location selection cannot move the outing');

  await workspace.locator('[data-gal="close"]').click();
  await workspace.waitFor({ state: 'hidden' });
}

const FACILITY_DIALOGS = {
  blacksmith: {
    dialog: '#city-blacksmith',
    heading: '#blacksmith-title',
    close: '[aria-label="离开铁匠铺"]',
    label: '铁匠铺',
  },
  market: {
    dialog: '#void-shop',
    heading: '#market-title',
    close: '#shop-close',
    label: '市场',
  },
  guild: {
    dialog: '#guild-dialog',
    heading: '.guild-head h2',
    close: '.guild-close',
    label: '冒险者公会',
  },
};

export async function verifyCityFacilityDistribution(page, cityId) {
  const expectation = CITY_FACILITY_EXPECTATIONS[cityId];
  assert.ok(expectation, `verifyCityFacilityDistribution: unknown cityId "${cityId}"`);

  await page.waitForFunction(
    () => document.querySelector('#inn-frame iframe')?.contentWindow?.modelReady,
  );

  const mappedFacilities = Object.fromEntries(
    cityFacilities(cityId).map(({ facility, streetScene }) => [facility, streetScene]),
  );
  assert.deepEqual(
    mappedFacilities,
    expectation.facilities,
    'city directory facility locations should match the expected city map for ' + cityId,
  );

  const sceneId = await page.evaluate(
    () => document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition?.id,
  );
  if (cityId === 'silver-crown') {
    assert.equal(sceneId, 'crown-arcade', 'run the Silver Crown chat check in a real city street');
    await verifySilverCrownTalkPlace(page);
  }

  const submap = await openCityDirectory(page);

  const dialogCity = await submap.getAttribute('data-city');
  assert.equal(
    dialogCity,
    cityId,
    `street city-directory dialog data-city should be "${cityId}", got "${dialogCity}"`,
  );

  const entries = submap.locator('[data-city-facility]');
  const entryCount = await entries.count();
  assert.equal(
    entryCount,
    FACILITY_ORDER.length,
    `street city-directory for "${cityId}" should render exactly ${FACILITY_ORDER.length} facility entries, got ${entryCount}`,
  );

  const renderedKinds = [];
  for (let i = 0; i < entryCount; i += 1) {
    const kind = await entries.nth(i).getAttribute('data-city-facility');
    renderedKinds.push(kind);
  }
  assert.deepEqual(
    [...renderedKinds].sort(),
    [...FACILITY_ORDER].sort(),
    `street city-directory for "${cityId}" should render facility kinds ${FACILITY_ORDER.join(', ')}, got ${renderedKinds.join(', ')}`,
  );

  for (const facility of FACILITY_ORDER) {
    const expectedNode = `${cityId}-${facility}`;
    const entry = submap.locator(`[data-city-facility="${facility}"]`);
    const nodeValue = await entry.getAttribute('data-city-node');
    assert.equal(
      nodeValue,
      expectedNode,
      `facility "${facility}" in "${cityId}" should have data-city-node "${expectedNode}", got "${nodeValue}"`,
    );
    assert.equal(
      await entry.locator('strong').innerText(),
      FACILITY_DIALOGS[facility].label,
      `facility "${facility}" in "${cityId}" should display its facility name`,
    );
    assert.equal(
      await entry.isEnabled(),
      true,
      `facility "${facility}" in "${cityId}" should be enabled from an entered city`,
    );
  }

  for (const facility of FACILITY_ORDER) {
    const config = FACILITY_DIALOGS[facility];
    const expectedHeading = `${expectation.name} · ${config.label}`;

    const directory = await openCityDirectory(page);
    await directory.locator(`[data-city-facility="${facility}"]`).click();

    const serviceDialog = page.locator(config.dialog);
    await serviceDialog.waitFor({ state: 'visible' });

    const isOpen = await serviceDialog.evaluate((el) => el.open === true);
    assert.equal(
      isOpen,
      true,
      `service dialog "${config.dialog}" for "${facility}" in "${cityId}" should have native open property true`,
    );

    const headingText = await page.locator(config.heading).innerText();
    assert.equal(
      headingText.trim(),
      expectedHeading,
      `service dialog "${config.dialog}" heading for "${facility}" in "${cityId}" should be "${expectedHeading}", got "${headingText.trim()}"`,
    );

    const submapStillOpen = await submap.evaluate((el) => el.hasAttribute('open'));
    assert.equal(
      submapStillOpen,
      false,
      `street city-directory dialog should close after opening "${facility}" in "${cityId}"`,
    );

    if (facility === 'blacksmith') await verifyBlacksmithStage(serviceDialog);
    if (facility === 'market') await verifyMarketRules(serviceDialog);
    if (facility === 'guild') await verifyGuildNoticeBoard(serviceDialog, cityId);
    await page.locator(config.close).click();
    await serviceDialog.waitFor({ state: 'hidden' });

    const closedOpen = await serviceDialog.evaluate((el) => el.open === true);
    assert.equal(
      closedOpen,
      false,
      `service dialog "${config.dialog}" for "${facility}" in "${cityId}" should be closed after clicking "${config.close}"`,
    );
  }
}
