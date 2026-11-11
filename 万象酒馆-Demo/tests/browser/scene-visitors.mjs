import assert from 'node:assert/strict';
import path from 'node:path';

/** Each actual room model is probed at every authored spot, then its live roster is refreshed. */
export async function sceneVisitorChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  const failures = [];
  const results = [];
  try {
    for (const [id, href, preview] of [
      ['tavern', '/tavern.html', 'assetPreview'],
      ['corridor', '/corridor.html', 'corridorPreview'],
      ['room-a', '/guest-room.html?room=a', 'guestRoomPreview'],
      ['room-b', '/guest-room.html?room=b', 'guestRoomPreview'],
      ['room-master', '/master-bedroom.html', 'guestRoomPreview'],
      ['starlamp-street', '/street.html', 'streetPreview'],
      ['city-center', '/street.html?scene=city-center', 'streetPreview'],
    ]) {
      try {
        await page.goto(baseURL + href);
        const spotCount = await page.evaluate(async (id) => {
          const { SCENE_VISITOR_SPOTS } = await import('/src/content/tavern-visitors.js');
          return SCENE_VISITOR_SPOTS[id].length;
        }, id);
        const expectedCount = Math.min(spotCount, id === 'tavern' ? 3 : 2);
        const officialCount = await page.evaluate(async () => {
          const { TAVERN_VISITORS } = await import('/src/content/tavern-visitors.js');
          return TAVERN_VISITORS.length;
        });
        await page.waitForFunction(
          ({ key, count }) => window[key]?.visitors().characters.length === count,
          { key: preview, count: expectedCount },
          { timeout: 60000 },
        );
        const blocked = await page.evaluate(
          async ({ id, preview }) => {
            if (id === 'starlamp-street' || id === 'city-center') return [];
            const THREE = await import('/vendor/build/three.module.js');
            const { SCENE_VISITOR_SPOTS } = await import('/src/content/tavern-visitors.js');
            const view = window[preview];
            const ray = new THREE.Raycaster();
            return SCENE_VISITOR_SPOTS[id]
              .filter(({ position: [x, , z] }) =>
                [
                  [0, 0],
                  [-0.24, 0],
                  [0.24, 0],
                  [0, -0.24],
                  [0, 0.24],
                ].some(([dx, dz]) => {
                  ray.set(new THREE.Vector3(x + dx, 1.85, z + dz), new THREE.Vector3(0, -1, 0));
                  const y = ray.intersectObject(view.model, true)[0]?.point.y;
                  return y === undefined || y > 0.1 || y < -0.1;
                }),
              )
              .map(({ id }) => id);
          },
          { id, preview },
        );
        assert.deepEqual(blocked, [], `${id}: all standing footprints clear walls and furniture`);
        assert(spotCount >= 1 && spotCount <= 3, `${id}: use one to three positions`);
        const seen = new Set();
        const seenSpots = new Set();
        for (let refresh = 0; refresh <= officialCount; refresh++) {
          await page.waitForFunction(
            ({ preview, count }) => window[preview].visitors().characters.length === count,
            { preview, count: expectedCount },
          );
          const actors = await page.evaluate(
            (preview) => window[preview].visitors().characters,
            preview,
          );
          assert.equal(new Set(actors.map((actor) => actor.spot)).size, actors.length);
          for (const actor of actors) {
            seen.add(actor.key);
            if (seenSpots.has(actor.spot)) continue;
            seenSpots.add(actor.spot);
            await page.screenshot({ path: path.join(output, `${id}-${actor.spot}.png`) });
          }
          await page.locator('#visitor-refresh').click();
        }
        assert.equal(seen.size, officialCount, `${id}: all official characters can appear`);
        assert.equal(seenSpots.size, spotCount, `${id}: inspect every assigned standing point`);
        if (id === 'starlamp-street') {
          await page.evaluate(() =>
            window.postMessage(
              {
                type: 'tavern-visitors',
                enabled: true,
                characters: [
                  { key: 'yuexi', id: 'official-aegis' },
                  {
                    key: 'personal-visitor',
                    id: 'character-personal',
                    name: '自定义角色',
                    image: './assets/tavern-visitors/edith-full-v1.png',
                  },
                  {
                    key: 'generic-npc',
                    id: 'npc-guard',
                    image: './assets/gal-npc-cast/town-guard-man.png',
                  },
                ],
              },
              location.origin,
            ),
          );
          await page.waitForFunction(() => {
            const actors = window.streetPreview.visitors().characters;
            return actors.length === 2 && actors.some((actor) => actor.key === 'personal-visitor');
          });
          const keys = await page.evaluate(() =>
            window.streetPreview
              .visitors()
              .characters.map((actor) => actor.key)
              .sort(),
          );
          assert.deepEqual(
            keys,
            ['personal-visitor', 'yuexi'],
            'dedicated official and custom sprites remain eligible, generic NPC sprites do not',
          );
          await page.locator('#visitor-refresh').click();
          await page.screenshot({ path: path.join(output, 'street-dedicated-only.png') });
        }
        results.push({ id, allOfficial: true, officialCount });
      } catch (error) {
        failures.push(`${id}: ${error.message}`);
      }
    }
    assert.deepEqual(failures, []);
    return results;
  } finally {
    await page.close();
  }
}
