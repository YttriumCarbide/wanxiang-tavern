import assert from 'node:assert/strict';
import path from 'node:path';

/** One visual inspection session for all new realms and creature studies. */
export async function artbookChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1904, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const views = [];
  try {
    await page.goto(new URL('artbook.html?scene=frost', baseURL).href);
    await page.waitForFunction(() => window.artbook && !window.artbook.status().loading);
    for (const id of ['frost', 'forge', 'tide']) {
      if (id !== 'frost') await page.evaluate((id) => window.artbook.select(id), id);
      await page.waitForTimeout(650);
      const before = await page.evaluate(() => window.artbook.status());
      assert(before.outerEnvironment.patches > 100);
      assert(before.outerEnvironment.drawBatches <= 2);
      assert.equal(before.insects, 8);
      assert(before.motes >= 80);
      if (before.mechanisms.length)
        await page.waitForFunction(
          (poses) =>
            JSON.stringify(window.artbook.status().mechanismPoses) !== JSON.stringify(poses),
          before.mechanismPoses,
          { timeout: 6000 },
        );
      const after = await page.evaluate(() => window.artbook.status());
      if (before.mechanisms.length)
        assert.notDeepEqual(
          before.mechanismPoses,
          after.mechanismPoses,
          `${id} mechanisms must actually move`,
        );
      if (id === 'frost')
        assert.equal(
          before.mechanisms.filter((name) => name.startsWith('Motion_Minecart')).length,
          4,
        );
      if (id === 'tide') assert.equal(before.ripples, 12);
      await page.screenshot({ path: path.join(output, `art-${id}.png`) });
      views.push({ id, mechanisms: before.mechanisms.length, insects: before.insects });
    }
    const landmarks = {
      dynasty: 'Landscape_Palace_Gallery_Roof',
      xianxia: 'Landscape_Immortal_Pavilion_Roof',
      castle: 'Landscape_Fortress_Masonry',
      arcane: 'Landscape_Observatory_Astrolabe',
      metropolis: 'Landscape_City_Block',
      nexus: 'Landscape_Reactor_Containment_Rings',
      wasteland: 'Landscape_Collapsed_Overpass',
      relic: 'Landscape_Stepped_Pyramid',
    };
    await page.evaluate(() => window.artbook.weather('clear'));
    await page.evaluate(() => window.artbook.select('ruins'));
    await page.waitForFunction(
      () => !window.artbook.status().loading && !window.artbook.status().animating,
    );
    await page.screenshot({ path: path.join(output, 'art-ruins-reference.png') });
    const originalEnvironment = await page.evaluate(() => window.artbook.status().outerEnvironment);
    assert(originalEnvironment.patches > 100);
    views.push({ id: 'ruins', outerEnvironment: originalEnvironment });
    const originalCards = await page.locator('.unit-hit').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.dataset.unit,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
    for (const id of [
      'forest',
      'dynasty',
      'xianxia',
      'castle',
      'arcane',
      'metropolis',
      'nexus',
      'wasteland',
      'relic',
    ]) {
      await page.evaluate((id) => window.artbook.select(id), id);
      await page.waitForFunction(
        () => !window.artbook.status().loading && !window.artbook.status().animating,
        null,
        { timeout: 60000 },
      );
      const status = await page.evaluate(() => window.artbook.status());
      if (landmarks[id])
        assert(
          status.landmarks.includes(landmarks[id]),
          `${id} must have its own architectural silhouette`,
        );
      assert(status.landmarks.includes('Decorated_Halves_With_Six_Grounded_Stone_Bases'));
      if (landmarks[id]) {
        assert.equal(status.outerEnvironment.mode, 'authored-large');
        assert(status.outerEnvironment.uniqueSpan[0] >= 7.9);
        assert(status.outerEnvironment.uniqueSpan[1] >= 19.1);
        assert(status.outerEnvironment.zones.length >= 5);
        assert.equal(status.outerEnvironment.drawBatches, 0);
      } else assert(status.outerEnvironment.patches > 100);
      assert(status.outerEnvironment.bounds.x > 20 && status.outerEnvironment.bounds.z > 15);
      assert(status.outerEnvironment.drawBatches <= 2);
      const cards = await page.locator('.unit-hit').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.dataset.unit,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }),
      );
      assert.equal(cards.length, originalCards.length);
      for (let index = 0; index < cards.length; index++) {
        assert.equal(cards[index].id, originalCards[index].id);
        for (const property of ['x', 'y', 'width', 'height'])
          assert(
            Math.abs(cards[index][property] - originalCards[index][property]) < 0.1,
            `${id}: card ${property} must match the original map`,
          );
      }
      assert(status.weather, `${id} must receive the independent weather layer`);
      assert(
        ['clear', 'rain', 'snow', 'thunder', 'mist'].includes(status.weather.type),
        `${id} received an unknown weather type`,
      );
      const weatherLayers = status.weather.layers;
      if (status.weather.type === 'rain') assert(weatherLayers.includes('Weather_Rain'));
      if (status.weather.type === 'thunder') {
        assert(weatherLayers.includes('Weather_Rain'));
        assert(weatherLayers.includes('Weather_Lightning_Flash'));
        assert(weatherLayers.includes('Weather_Lightning_Bolt'));
      }
      if (status.weather.type === 'snow') assert(weatherLayers.includes('Weather_Snow'));
      if (status.weather.type === 'mist') assert(weatherLayers.includes('Weather_Mist_0'));
      if (status.weather.type === 'clear') assert.equal(weatherLayers.length, 0);
      assert.equal(status.weather.renderedParticles, status.weather.particles);
      await page.screenshot({ path: path.join(output, `art-${id}.png`) });
      if (landmarks[id]) {
        await page.locator('.artbook-panel').evaluate((element) => {
          element.style.visibility = 'hidden';
        });
        await page.screenshot({ path: path.join(output, 'landscape-' + id + '.png') });
        await page.locator('.artbook-panel').evaluate((element) => {
          element.style.visibility = '';
        });
      }
      views.push({
        id,
        mechanisms: status.mechanisms.length,
        weather: status.weather.type,
        outerEnvironment: status.outerEnvironment,
      });
    }
    await page.evaluate(() => window.artbook.select('metropolis'));
    const weatherSamples = [];
    for (const type of ['rain', 'snow', 'thunder', 'mist']) {
      await page.evaluate((type) => window.artbook.weather(type), type);
      await page.waitForTimeout(type === 'thunder' ? 3200 : 1400);
      const sample = await page.evaluate(() => window.artbook.status().weather);
      assert.equal(sample.type, type);
      assert(sample.surfaceTriangles > 50);
      assert.equal(sample.mistAboveCombat, false);
      if (['rain', 'thunder'].includes(type)) {
        assert(sample.impacts > 20);
        assert(sample.visibleSplashes > 0);
        assert(sample.layers.includes('Weather_Puddles'));
        assert(sample.layers.includes('Weather_Impact_Droplets'));
      }
      if (type === 'snow') assert(sample.layers.includes('Weather_Snow_Deposits'));
      if (type === 'thunder') assert(sample.flashes >= 1);
      await page.screenshot({ path: path.join(output, `weather-${type}.png`) });
      weatherSamples.push(sample);
    }
    await page.evaluate(() => window.artbook.weather('clear'));
    await page.locator('#atlas-status').click();
    const statusSamples = [];
    for (const type of ['bleed', 'regen', 'poison']) {
      const selector = `[data-status-trigger="${type}"]`;
      await page.locator(selector).first().waitFor();
      const sample = await page
        .locator(selector)
        .first()
        .evaluate((halo) => {
          const animation = halo.getAnimations()[0];
          animation.pause();
          const { delay, duration } = animation.effect.getTiming();
          animation.currentTime = delay + duration * 0.32;
          const style = getComputedStyle(halo);
          const rect = halo.getBoundingClientRect();
          return {
            type: halo.dataset.statusTrigger,
            opacity: +style.opacity,
            width: rect.width,
            height: rect.height,
            color: style.color,
          };
        });
      assert(sample.opacity > 0.4, `${type} must be visible at its actual trigger`);
      assert(sample.width >= 100 && sample.height >= 100);
      statusSamples.push(sample);
      await page.screenshot({ path: path.join(output, `art-status-${type}.png`) });
      await page
        .locator(selector)
        .first()
        .evaluate((halo) => halo.getAnimations().forEach((a) => a.play()));
    }
    for (const id of ['crystal-beetle', 'cinder-imp', 'tide-jelly', 'boss-tide']) {
      await page.evaluate((id) => window.artbook.select(id, true), id);
      assert.equal(await page.locator('.battle-effects > *').count(), 0);
      await page.waitForTimeout(220);
      await page.screenshot({ path: path.join(output, `art-${id}.png`) });
    }
    assert.deepEqual(errors, []);
    return {
      views,
      cardLayoutMatchesOriginal: true,
      originalCardLayout: originalCards,
      weatherSamples,
      creatureModels: 4,
      triggeredStatuses: statusSamples,
      browserErrors: errors,
    };
  } finally {
    await page.evaluate(() => window.artbook?.dispose());
    await page.close();
  }
}
