import assert from 'node:assert/strict';
import path from 'node:path';
import { TOWN_SIDE_PLACES } from '../../src/content/town-side-places.js';
import { OVERLAND_ROAD } from '../../src/content/overland-road.js';

export async function townPlaceChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  function ready(id) {
    return page.waitForFunction(
      (id) => window.streetPreview?.state().sceneId === id && !window.streetPreview.state().moving,
      id,
      { timeout: 60000 },
    );
  }

  async function focusExit(id) {
    await page.evaluate((id) => {
      const view = window.streetPreview;
      const [x] = view.model.pointAnchor(id);
      view.look(-x / (view.state().framing.width * 0.35), 0);
    }, id);
    const target = page.locator(`[data-hotspot="${id}"]`);
    await target.click();
    await ready(id);
  }

  function state() {
    return page.evaluate(() => {
      const view = window.streetPreview;
      return { ...view.state(), visitors: view.visitors().characters.length };
    });
  }

  async function light(timeOfDay, file) {
    await page.evaluate((timeOfDay) => {
      window.postMessage({ type: 'daily-managed', timeOfDay }, location.origin);
    }, timeOfDay);
    await page.waitForFunction((file) => window.streetPreview?.state().image.endsWith(file), file);
  }

  const traversed = [];
  try {
    await page.goto(baseURL + '/tavern.html?return=street&time=night');
    await page.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await page.evaluate(() => window.assetPreview.placeNow('streetDoor'));
    await page.locator('#street-open').click();
    await ready('starlamp-street');
    const street = await state();
    assert.equal(street.timeOfDay, 'night');
    assert(street.image.endsWith('/town-night/street.png'));
    await light('day', '/street-hd-v4/connected.png');
    assert.deepEqual((await state()).framing, street.framing);
    await light('night', '/town-night/street.png');
    await page.screenshot({ path: path.join(output, 'street-night.png') });
    const mapButton = page.getByRole('button', { name: '大地图', exact: true });
    const worldMap = page.getByRole('dialog', { name: '泛生界大地图' });
    await mapButton.click();
    await worldMap.waitFor();
    await page.waitForFunction(() => {
      const sheet = document.querySelector('#street-map-sheet');
      return (
        sheet.querySelector('.street-map-world-rim').getBBox().width > 2400 &&
        sheet.querySelector('use[href$="#silver-road-route"]').getBBox().width === 48 &&
        sheet.querySelector('.street-map-paper use').getBBox().width > 3000
      );
    });
    const atlas = await page.evaluate(() => {
      const dialog = document.querySelector('#street-map');
      const sheet = document.querySelector('#street-map-sheet');
      const firstCity = document.querySelector('#atlas-starbell');
      const secondCity = document.querySelector('#atlas-silver-crown');
      const cityDistance = secondCity.x.baseVal[0].value - firstCity.x.baseVal[0].value;
      const hit = (x, y) => document.elementFromPoint(x, y)?.closest('#street-map') === dialog;
      return {
        cityDistance,
        worldWidth: sheet.querySelector('.street-map-world-rim').getBBox().width,
        coversCorners: [
          hit(1, 1),
          hit(innerWidth - 2, 1),
          hit(1, innerHeight - 2),
          hit(innerWidth - 2, innerHeight - 2),
        ],
        cityLabels: [firstCity.textContent, secondCity.textContent],
      };
    });
    function atlasView() {
      return page.locator('#street-map-sheet').evaluate((sheet) => {
        const { x, y, width, height } = sheet.viewBox.baseVal;
        return { x, y, width, height };
      });
    }
    const initialView = await atlasView();
    assert.deepEqual(atlas.cityLabels, ['星钟城', '银冠城']);
    assert.equal(initialView.width / atlas.cityDistance, 1.5);
    assert(atlas.worldWidth / atlas.cityDistance > 50);
    assert(atlas.coversCorners.every(Boolean), 'the map must cover the whole viewport');
    const sheet = page.locator('#street-map-sheet');
    const regionalMarkers = sheet.locator('.street-map-regional');
    const overview = sheet.locator('.street-map-world-labels');
    const territories = sheet.locator('.street-map-territories');
    const paper = sheet.locator('.street-map-paper');
    const localPatina = paper.locator('use[href$="#atlas-local-patina"]');
    const terrain = sheet.locator('.street-map-terrain');
    const scrub = sheet.locator('use[href$="#silver-road-scrub"]');
    await scrub.waitFor();
    assert(await paper.isVisible());
    await localPatina.waitFor();
    const patinaStart = await localPatina.boundingBox();
    await page.screenshot({ path: path.join(output, 'world-map.png') });

    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(740, 430, { steps: 6 });
    await page.mouse.up();
    const dragged = await atlasView();
    assert(dragged.x < initialView.x && dragged.y < initialView.y);
    assert.equal(dragged.width, initialView.width);
    const patinaAfterDrag = await localPatina.boundingBox();
    assert(patinaAfterDrag.x > patinaStart.x + 90 && patinaAfterDrag.y > patinaStart.y + 60);

    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -360);
    await page.waitForFunction(
      () => document.querySelector('#street-map-sheet').viewBox.baseVal.width < 72,
    );
    await page.mouse.wheel(0, 1000);
    await regionalMarkers.waitFor();
    assert((await atlasView()).width > initialView.width);
    assert(await terrain.isVisible());
    assert(!(await scrub.isVisible()));
    assert(await localPatina.isVisible());
    assert(!(await sheet.locator('use[href$="#silver-road-starbell"]').isVisible()));
    await page.screenshot({ path: path.join(output, 'world-map-region.png') });
    const dotWidth = await regionalMarkers
      .locator('circle')
      .first()
      .evaluate((circle) => circle.getBoundingClientRect().width);
    assert(dotWidth >= 7 && dotWidth <= 9, `unexpected regional symbol width: ${dotWidth}px`);

    await page.mouse.wheel(0, 4000);
    await overview.waitFor();
    await page.waitForFunction(() => {
      const { width, height } = document.querySelector('#street-map-sheet').viewBox.baseVal;
      return width >= 3072 && height >= 2048;
    });
    assert(!(await terrain.isVisible()));
    assert(!(await regionalMarkers.isVisible()));
    assert(await paper.isVisible());
    const landmarks = sheet.locator('[data-atlas-landmark]');
    await territories.waitFor();
    assert.equal(await landmarks.locator('g.street-map-landmark text').count(), 9);
    assert.equal(await landmarks.locator('circle:visible').count(), 9);
    assert.equal(await landmarks.locator('use:visible').count(), 0);
    const geography = await sheet.evaluate(async (svg) => {
      const loadSvg = async (fragment) => {
        const url = svg.querySelector(`use[href$="#${fragment}"]`).getAttribute('href');
        const response = await fetch(url);
        return new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      };
      const [atlas, politics] = await Promise.all([
        loadSvg('ring-outline'),
        loadSvg('continental-atlas'),
      ]);
      const asPath = (path) => new Path2D(path.getAttribute('d'));
      const worldShape = atlas.querySelector('#ring-outline');
      const frame = asPath(worldShape);
      const rim = new Path2D(
        worldShape
          .getAttribute('d')
          .trim()
          .split(/(?=M\s)/u)[0],
      );
      const coast = asPath(politics.querySelector('#coastline'));
      const unclaimedShapes = [...politics.querySelectorAll('#unclaimed [data-frontier]')];
      const wilderness = unclaimedShapes.map(asPath);
      const centralFrontier = asPath(politics.querySelector('[data-frontier="central"]'));
      const nations = [...politics.querySelectorAll('[data-nation]')].map((path) => [
        path.dataset.nation,
        asPath(path),
      ]);
      const canvas = document.createElement('canvas').getContext('2d');
      const inside = (path, x, y) => canvas.isPointInPath(path, x, y, 'evenodd');
      const onLand = (x, y) => inside(frame, x, y) && inside(coast, x, y);
      const onFrontier = (x, y) => wilderness.some((path) => inside(path, x, y));
      const owners = (x, y) => nations.filter(([, path]) => inside(path, x, y)).map(([id]) => id);
      let landSamples = 0;
      let unclaimed = 0;
      let centralUnclaimed = 0;
      let overlapping = 0;
      let coastalSpill = 0;
      for (let y = 6.71; y < 2048; y += 12) {
        for (let x = 6.23; x < 3072; x += 12) {
          if (inside(coast, x, y) && !inside(rim, x, y)) coastalSpill++;
          if (!onLand(x, y)) continue;
          landSamples++;
          if (onFrontier(x, y)) unclaimed++;
          if (inside(centralFrontier, x, y)) centralUnclaimed++;
          const count = owners(x, y).length;
          if (count > 1) overlapping++;
        }
      }
      const sites = [...svg.querySelectorAll('[data-atlas-landmark]')].map((node) => {
        const { e: x, f: y } = node.transform.baseVal.getItem(0).matrix;
        return [node.dataset.atlasLandmark, { x, y, land: onLand(x, y), owners: owners(x, y) }];
      });
      const labels = [...svg.querySelectorAll('[data-nation-label]')].map((node) => [
        node.dataset.nationLabel,
        node.textContent.replace(/\s+/gu, ''),
        owners(node.x.baseVal[0].value, node.y.baseVal[0].value),
      ]);
      const roadCities = [...svg.querySelectorAll('#atlas-starbell, #atlas-silver-crown')].map(
        (node) => {
          const [x, y] = [node.x.baseVal[0].value, node.y.baseVal[0].value];
          return { land: onLand(x, y), owners: owners(x, y), frontier: onFrontier(x, y) };
        },
      );
      const seaLabels = [...svg.querySelectorAll('.street-map-sea-name')].map((node) => {
        const [x, y] = [node.x.baseVal[0].value, node.y.baseVal[0].value];
        return inside(frame, x, y) && !inside(coast, x, y);
      });
      return {
        unclaimed: unclaimed / landSamples,
        centralUnclaimed: centralUnclaimed / landSamples,
        unclaimedRegions: unclaimedShapes.map((shape) => shape.dataset.frontier),
        overlapping: overlapping / landSamples,
        coastalSpill,
        seaLabels,
        sites: Object.fromEntries(sites),
        labels,
        roadCities,
      };
    });
    await page.screenshot({ path: path.join(output, 'world-map-overview.png') });
    assert(Math.abs(geography.unclaimed - 0.3) <= 0.015, `unclaimed share ${geography.unclaimed}`);
    assert(
      Math.abs(geography.centralUnclaimed - 0.15) <= 0.01,
      `central share ${geography.centralUnclaimed}`,
    );
    assert.deepEqual(geography.unclaimedRegions, [
      'central',
      'west-estuary',
      'north-ridge',
      'northeast-range',
      'southwest-basin',
      'southwest-ridge',
      'southeast-ridge',
      'eastern-watershed',
    ]);
    assert(geography.overlapping < 0.003, `territory overlap ${geography.overlapping}`);
    assert.equal(geography.coastalSpill, 0);
    assert.deepEqual(geography.seaLabels, [true, true]);
    assert.equal(geography.labels.length, 16);
    assert.deepEqual(
      geography.labels.filter(([id, , owners]) => owners.length !== 1 || owners[0] !== id),
      [],
    );
    assert(geography.labels.some(([id, name]) => id === 'moon' && name === '银月联邦'));
    assert(geography.labels.some(([id, name]) => id === 'ael' && name === '艾尔德兰帝国'));
    assert.deepEqual(geography.sites['jacobs-ladder'], {
      x: 1536,
      y: 1024,
      land: false,
      owners: [],
    });
    for (const [id, site] of Object.entries(geography.sites)) {
      if (id !== 'jacobs-ladder') assert(site.land, `${id} should be on the continent`);
    }
    assert.deepEqual(geography.sites['five-ports'].owners, ['rose']);
    assert.deepEqual(geography.sites['eternal-city'].owners, ['ael']);
    assert.deepEqual(geography.sites.yingtian.owners, ['tian']);
    assert(
      geography.roadCities.every((city) => city.land && city.frontier && city.owners.length === 0),
    );

    const ruins = sheet.locator('[data-atlas-landmark="ruins"]');
    const ruinsDot = await ruins.locator('circle').boundingBox();
    await page.mouse.move(ruinsDot.x + ruinsDot.width / 2, ruinsDot.y + ruinsDot.height / 2);
    const ruinsZoom = Math.log((await atlasView()).width / 67) / 0.0015;
    await page.mouse.wheel(0, -ruinsZoom);
    await ruins.locator('use[href$="#ruins-icon"]').waitFor();
    assert(await ruins.locator('use[href$="#ruins-terrain"]').isVisible());
    assert(!(await ruins.locator('circle').isVisible()));
    await page.screenshot({ path: path.join(output, 'world-map-ruins-detail.png') });

    await page.mouse.wheel(0, 5000);
    await overview.waitFor();
    const townDot = await overview.locator('circle').boundingBox();
    await page.mouse.move(townDot.x + townDot.width / 2, townDot.y + townDot.height / 2);
    await page.mouse.wheel(0, -4000);
    await scrub.waitFor();
    assert(!(await overview.isVisible()));
    assert(!(await territories.isVisible()));
    assert(await paper.isVisible());

    await worldMap.getByRole('button', { name: '关闭地图' }).click();
    await worldMap.waitFor({ state: 'hidden' });
    assert.equal(await mapButton.evaluate((button) => button === document.activeElement), true);
    assert.deepEqual((await state()).framing, street.framing);
    await page.locator('#street-return').click();
    await page.waitForURL('**/tavern.html?return=street&time=night');

    for (const parent of new Set(Object.values(TOWN_SIDE_PLACES).map((place) => place.parent))) {
      await page.goto(baseURL + `/street.html?scene=${parent}&time=night`);
      await ready(parent);
      const initial = await state();
      assert(initial.image.endsWith(`/town-night/${parent}.png`));
      await light('day', `/free-scenes-hd-v2/${parent}/connected.png`);
      assert.deepEqual((await state()).framing, initial.framing);
      await light('night', `/town-night/${parent}.png`);
      await page.screenshot({ path: path.join(output, `${parent}-night.png`) });

      for (const [id, place] of Object.entries(TOWN_SIDE_PLACES)) {
        if (place.parent !== parent) continue;
        await focusExit(id);
        const scene = await state();
        assert.equal(scene.timeOfDay, 'night');
        assert(scene.image.endsWith(`/${id}${place.openAir ? '-night' : ''}.png`));
        assert.equal(scene.visitors, 1);
        assert.equal(await page.locator('body').getAttribute('data-fixed-view'), 'true');
        await page.mouse.move(630, 470);
        await page.mouse.down();
        await page.mouse.move(1000, 220, { steps: 4 });
        await page.mouse.up();
        await page.keyboard.press('ArrowRight');
        assert.deepEqual((await state()).framing, scene.framing);
        await page.screenshot({ path: path.join(output, `${id}.png`) });
        if (id === 'clock-roof') {
          await light('day', '/clock-roof.png');
          await page.screenshot({ path: path.join(output, 'clock-roof-day.png') });
          await light('night', '/clock-roof-night.png');
        }
        await page.locator('#street-return').click();
        await ready(parent);
        assert((await state()).image.endsWith(`/town-night/${parent}.png`));
        traversed.push(id);
      }
    }
    assert.equal(traversed.length, 6);
    await page.goto(baseURL + '/street.html?scene=outskirts');
    await ready('outskirts');
    let previous = 'outskirts';
    for (const { id, name } of OVERLAND_ROAD) {
      await focusExit(id);
      const road = await state();
      assert(road.image.endsWith(`/overland-road/${id}-wide.png`));
      assert.equal(await page.locator('.street-header h1').textContent(), name);
      assert.equal(new URL(page.url()).searchParams.get('from'), previous);
      assert(await page.locator(`[data-hotspot="${previous}"]`).isVisible());
      assert.equal(road.visitors, 0);
      assert.equal(await page.locator('#visitor-refresh').count(), 0);
      await page.screenshot({ path: path.join(output, `${id}.png`) });
      if (id === 'road-bridge') {
        await page.mouse.move(640, 360);
        await page.mouse.down();
        await page.mouse.move(640, 520, { steps: 5 });
        await page.mouse.up();
        await ready(id);
        const up = (await state()).framing;
        assert(up.y > road.framing.y + 0.04 && up.y + up.height / 2 <= 0.5);
        await page.mouse.move(640, 530);
        await page.mouse.down();
        await page.mouse.move(640, 300, { steps: 5 });
        await page.mouse.up();
        await ready(id);
        const down = (await state()).framing;
        assert(down.y < road.framing.y - 0.04 && down.y - down.height / 2 >= -0.5);
        await page.evaluate(() => window.streetPreview.resetView());
        await ready(id);
      }
      previous = id;
    }
    assert.equal(await page.locator('[data-hotspot]').count(), 1);
    await page.setViewportSize({ width: 844, height: 390 });
    await mapButton.click();
    await worldMap.waitFor();
    await page.locator('#street-map-sheet').waitFor({ state: 'visible' });
    const mapBounds = await worldMap.boundingBox();
    assert(mapBounds.x <= 0 && mapBounds.y <= 0);
    assert(mapBounds.width >= 844 && mapBounds.height >= 390);
    const mobileAtlas = await atlasView();
    assert.equal(mobileAtlas.width, initialView.width);
    assert.equal(mobileAtlas.x, initialView.x);
    assert(mobileAtlas.height < initialView.height);
    await page.screenshot({ path: path.join(output, 'world-map-mobile.png') });
    const touch = await page.context().newCDPSession(page);
    const separated = [
      { x: 270, y: 195, id: 1 },
      { x: 574, y: 195, id: 2 },
    ];
    const together = [
      { x: 355, y: 195, id: 1 },
      { x: 489, y: 195, id: 2 },
    ];
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: separated });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: together });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await regionalMarkers.waitFor();
      assert((await atlasView()).width > mobileAtlas.width);

      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: together });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: separated });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await scrub.waitFor();
      assert(!(await regionalMarkers.isVisible()));
    } finally {
      await touch.detach();
    }
    await page.mouse.move(422, 195);
    await page.mouse.wheel(0, 5000);
    await page.waitForFunction(
      () => document.querySelector('#street-map-sheet').viewBox.baseVal.height >= 2048,
    );
    await page.screenshot({ path: path.join(output, 'world-map-overview-mobile.png') });
    const labelBoxes = await sheet
      .locator('.street-map-landmark text, .street-map-world-labels text')
      .evaluateAll((labels) =>
        labels.map((label) => ({
          ...label.getBoundingClientRect().toJSON(),
          name: label.textContent.trim(),
        })),
      );
    const overlaps = [];
    for (const [index, label] of labelBoxes.entries()) {
      assert(label.left >= 0 && label.right <= 844 && label.top >= 0 && label.bottom <= 390);
      for (const other of labelBoxes.slice(index + 1)) {
        if (
          label.left < other.right &&
          label.right > other.left &&
          label.top < other.bottom &&
          label.bottom > other.top
        ) {
          overlaps.push([label.name, other.name]);
        }
      }
    }
    assert.deepEqual(overlaps, [], 'map labels overlap');
    await page.keyboard.press('Escape');
    await worldMap.waitFor({ state: 'hidden' });
    const reverse = [...OVERLAND_ROAD].reverse();
    for (const [index, { id }] of reverse.entries()) {
      await ready(id);
      const back = reverse[index + 1]?.id ?? 'outskirts';
      const left = page.locator(`[data-hotspot="${back}"]`);
      if (index > 0) {
        const right = page.locator(`[data-hotspot="${reverse[index - 1].id}"]`);
        assert((await left.boundingBox()).x < (await right.boundingBox()).x);
      }
      await left.click();
      if (index === 0)
        await page.waitForFunction((id) => {
          const scene = window.streetPreview?.state();
          return scene?.sceneId === id && scene.framing.x > 0.005;
        }, back);
      await ready(back);
      if (back !== 'outskirts') assert.equal(new URL(page.url()).searchParams.get('from'), id);
    }
    assert.deepEqual(errors, []);
    return {
      traversed,
      unclaimedLandShare: geography.unclaimed,
      centralUnclaimedLandShare: geography.centralUnclaimed,
      nations: geography.labels.length,
    };
  } finally {
    await page.close();
  }
}
