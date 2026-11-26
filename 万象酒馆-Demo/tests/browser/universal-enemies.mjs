import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } from '../../src/content/universal-adversaries.js';
import { enemyArchiveIntentText } from '../../src/archive-enemies.js';
import { ARENA_QUALIFIER_ARCHIVE_DEFINITIONS } from '../../src/content/arena-qualifier-adversaries.js';
import {
  SILVER_CROWN_SYNDICATE_ARCHON,
  SILVER_CROWN_SYNDICATE_ENEMIES,
} from '../../src/content/silver-crown-syndicate-adversaries.js';

async function checkSilverCrownArchive(page, output) {
  const entries = page.locator('#archive-list button');
  const detail = page.locator('#archive-text');
  const intents = detail.locator('.skyrim-archive-intent');
  for (const enemy of SILVER_CROWN_SYNDICATE_ENEMIES) {
    const tier = enemy.elite ? 'elite' : 'minion';
    await page.locator(`[data-enemy-tier="${tier}"]`).click();
    await entries.filter({ hasText: enemy.name }).click();
    const portrait = detail.getByRole('img', { name: enemy.name });
    await portrait.waitFor();
    await page.waitForFunction((name) => {
      const img = document.querySelector('#archive-text .skyrim-enemy-portrait');
      return img?.alt === name && img.complete && img.naturalWidth > 0;
    }, enemy.name);
    assert.equal(await portrait.getAttribute('src'), `./assets/portraits/${enemy.portrait}.svg`);
    assert.deepEqual(
      await intents.locator('span:last-child').allTextContents(),
      enemy.intents.map((move) => `${move.name}：${enemyArchiveIntentText(move)}`),
    );
    const intentText = (await intents.allInnerTexts()).join('\n');
    assert(!/\d+\s*点?\s*伤害/u.test(intentText));
    assert(!/\d+\s*层?\s*(?:中毒|流血)/u.test(intentText));
  }
  await page.locator('[data-enemy-tier="overlord"]').click();
  await entries.filter({ hasText: SILVER_CROWN_SYNDICATE_ARCHON.name }).click();
  assert((await detail.innerText()).includes('银冠城-白鸦展览馆'));
  assert((await detail.innerText()).includes('乌羽秘会'));
  const stage = detail.locator(
    '[data-overlord-id="silverCrownSyndicateArchon"][data-stage-ready="ready"][data-loaded-models="1"]',
  );
  await stage.waitFor({ timeout: 30000 });
  assert.deepEqual(
    await intents.locator('span:last-child').allTextContents(),
    [
      ...SILVER_CROWN_SYNDICATE_ARCHON.intents,
      ...(SILVER_CROWN_SYNDICATE_ARCHON.enragedIntents || []),
    ].map((move) => `${move.name}：${enemyArchiveIntentText(move)}`),
  );
  assert(!/undefined|NaN/.test(await page.locator('#archive-dialog').innerText()));
  const actions = stage.locator('[data-stage-anim]');
  assert.deepEqual(
    (await actions.evaluateAll((buttons) => buttons.map((btn) => btn.dataset.stageAnim))).sort(),
    [
      'Break_Stagger',
      'Charge_Up',
      'Idle',
      'Normal_Attack',
      'Special_Action',
      'Special_Attack',
      'Talon_Rend',
    ],
  );
  const charge = stage.locator('[data-stage-anim="Charge_Up"]');
  await charge.click();
  assert.equal(await charge.getAttribute('aria-pressed'), 'true');
  await stage.locator('[data-stage-anim="Idle"][aria-pressed="true"]').waitFor();
  await page.screenshot({ path: path.join(output, 'archive-overlord-silver-crown.png') });
}

async function checkArenaQualifierArchive(page, output) {
  const entries = page.locator('#archive-list button');
  const detail = page.locator('#archive-text');
  const intents = detail.locator('.skyrim-archive-intent');
  for (const [tier, name] of [
    ['minion', '木棍新手'],
    ['minion', '训练山羊'],
    ['elite', '双斧搏斗手'],
    ['elite', '披甲斗猪'],
    ['boss', '木塔盾队长'],
    ['boss', '猎犬领队'],
  ]) {
    await page.locator(`[data-enemy-tier="${tier}"]`).click();
    await entries.filter({ hasText: name }).click();
    assert.equal(await detail.locator('.skyrim-folio-title').innerText(), name);
    await page.waitForFunction((name) => {
      const image = document.querySelector('#archive-text .skyrim-enemy-portrait');
      return image?.alt === name && image.complete && image.naturalWidth > 0;
    }, name);
    const definition = Object.values(ARENA_QUALIFIER_ARCHIVE_DEFINITIONS).find(
      (entry) => entry.name === name,
    );
    assert.equal(
      await detail.getByRole('img', { name }).getAttribute('src'),
      `./assets/portraits/${definition.portrait}.svg`,
    );
    assert.equal(await intents.count(), 2, `${name}: two action intents`);
    assert.deepEqual(
      await intents.locator('strong').allTextContents(),
      definition.intents.map((move) => `${move.name}：`),
    );
  }
  await page.locator('[data-enemy-tier="overlord"]').click();
  await entries.filter({ hasText: '海选擂主·铁臂教头' }).click();
  const stage = detail.locator(
    '[data-overlord-id="arenaQualifierIronCoach"][data-stage-ready="ready"][data-loaded-models="1"]',
  );
  await stage.waitFor({ timeout: 30000 });
  assert.deepEqual(
    (
      await stage
        .locator('[data-stage-anim]')
        .evaluateAll((buttons) => buttons.map((button) => button.dataset.stageAnim))
    ).sort(),
    [
      'Break_Stagger',
      'Charge_Up',
      'Idle',
      'Normal_Attack',
      'Special_Action',
      'Special_Attack',
      'Talon_Rend',
    ],
  );
  assert.deepEqual(
    await intents.locator('span:last-child').allTextContents(),
    [
      ...ARENA_QUALIFIER_ARCHIVE_DEFINITIONS.arenaQualifierIronCoach.intents,
      ...(ARENA_QUALIFIER_ARCHIVE_DEFINITIONS.arenaQualifierIronCoach.enragedIntents || []),
    ].map((move) => `${move.name}：${enemyArchiveIntentText(move)}`),
  );
  assert(!/undefined|NaN/.test(await detail.innerText()));
  await page.screenshot({ path: path.join(output, 'archive-qualifier-coach.png') });
}

export async function universalEnemyChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];
  page.on('pageerror', (failure) => failures.push(failure.message));
  try {
    await page.goto(baseURL + '/artbook.html');
    await page.waitForFunction(() => window.artbook && !window.artbook.status().loading);
    await page.evaluate(() => {
      window.artbook.dispose();
      document
        .querySelectorAll('aside, footer, #atlas-loading')
        .forEach((element) => (element.hidden = true));
    });
    for (const [name, ids] of [
      ['universal-battle-cards', ['greyProwler', 'veilMender', 'hollowSentry']],
      ['universal-boss-cards', ['manyShellBeast', 'unmooredJudge', 'returningCore']],
    ]) {
      await page.evaluate(async (enemyIds) => {
        const { createBattleView } = await import('/src/scene.js');
        const { newBattle, preview } = await import('/src/engine.js');
        const stage = document.querySelector('#art-stage');
        stage.style.inset = '0';
        const state = newBattle(enemyIds);
        window.universalView = await createBattleView(stage, () => {}, {
          map: 'ruins',
          enemyIds,
          weather: 'clear',
        });
        window.universalView.draw(state, preview(state, []), null, null);
      }, ids);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(output, name + '.png') });
      await page.evaluate(() => window.universalView.dispose());
    }
    const overlordResults = [];
    for (const [name, mapId, ids, expectBadges, expectMounted] of [
      ['overlords-standing-on-cards', 'relic', ['apepLamb', 'radiantWyvern', 'ares'], 3, 3],
      ['ares-formation-on-cards', 'frost', ['aresCannonLeft', 'ares', 'aresCannonRight'], 1, 3],
      ['moon-tree-formation', 'forest', ['moonCrown', 'moonEye', 'moonRoot'], 3, 3],
      [
        'mill-overlord-battlefield',
        'mill',
        ['millVoleAlpha', 'alchemicalPuppet', 'millMoldSlimeBoss'],
        1,
        1,
      ],
    ]) {
      const check = await page.evaluate(
        async ({ mapId, enemyIds }) => {
          const { createBattleView } = await import('/src/scene.js');
          const { newBattle, preview } = await import('/src/engine.js');
          const { Box3, Vector3 } = await import('three');
          const stage = document.querySelector('#art-stage');
          stage.style.inset = '0';
          const state = newBattle(enemyIds);
          window.universalView = await createBattleView(stage, () => {}, {
            map: mapId,
            enemyIds,
            weather: 'clear',
          });
          window.universalView.draw(state, preview(state, []), null, null);
          let visibleBattleCards = 0;
          window.universalView.scene.traverse((node) => {
            if (node.name && node.name.includes('Battle_Card') && node.visible) {
              visibleBattleCards++;
            }
          });
          let tree = null;
          if (enemyIds.includes('moonEye')) {
            await window.universalView.whenSettled();
            const scene = window.universalView.scene;
            const left = scene
              .getObjectByName('Overlord_Figure_moonCrown')
              .getObjectByName('Moon_Tree_Left');
            const right = scene
              .getObjectByName('Overlord_Figure_moonRoot')
              .getObjectByName('Moon_Tree_Right');
            const leftBounds = new Box3().setFromObject(left);
            const rightBounds = new Box3().setFromObject(right);
            const eye = scene.getObjectByName('Overlord_Figure_moonEye');
            const crown = eye.getObjectByName('Moon_Crown_Continuous_Canopy');
            const crownBounds = new Box3().setFromObject(crown);
            tree = {
              span: leftBounds.clone().union(rightBounds).getSize(new Vector3()).x,
              crownWidth: Math.min(-crownBounds.min.x, crownBounds.max.x),
              mirroredBounds: Math.max(
                Math.abs(leftBounds.min.x + rightBounds.max.x),
                Math.abs(leftBounds.max.x + rightBounds.min.x),
                Math.abs(leftBounds.min.y - rightBounds.min.y),
                Math.abs(leftBounds.min.z - rightBounds.min.z),
              ),
              hasSpeakerBoxes: Boolean(
                scene.getObjectByName('Shoulder_Missile_Pod_L') ||
                scene.getObjectByName('Shoulder_Missile_Pod_R'),
              ),
            };
          }
          return {
            tree,
            status: window.universalView.overlordStatus(),
            overlordBadges: document.querySelectorAll(
              '.unit-hit.is-overlord .enemy-tier-badge.is-overlord',
            ).length,
            visibleBattleCards,
            breakRails: document.querySelectorAll('.enemy-break-rail').length,
            unknownWeaknesses: document.querySelectorAll(
              '.enemy-weakness-row .enemy-weakness-pill.is-unknown',
            ).length,
          };
        },
        { mapId, enemyIds: ids },
      );
      assert.equal(
        check.status.mounted.length,
        expectMounted,
        `${name}: expected ${expectMounted} mounted card units`,
      );
      assert.equal(check.overlordBadges, expectBadges, `${name}: overlord badge count`);
      assert.equal(check.visibleBattleCards, 0, `${name}: Battle_Card base must stay hidden`);
      assert.equal(check.breakRails, 0, `${name}: no permanent break bar outside active window`);
      assert.equal(check.unknownWeaknesses, 0, `${name}: no ? hidden weakness pills`);
      for (const entry of check.status.mounted) {
        assert.equal(entry.standOnCard, true);
        assert.equal(entry.nonVoxel, true);
        assert.equal(entry.visible, true);
        assert(entry.triangles >= 4000, `${entry.id}: triangles >= 4000`);
        assert(entry.mountLocalY > 0.3, `${entry.id}: mounted atop card`);
        assert(entry.height > 1.0, `${entry.id}: visible 3D height`);
      }
      if (name === 'mill-overlord-battlefield') {
        const puppet = check.status.mounted.find((entry) => entry.id === 'alchemicalPuppet');
        assert(
          puppet && puppet.height > 3.0,
          `alchemicalPuppet height > 3.0 (got ${puppet?.height})`,
        );
        for (const clipName of [
          'Idle',
          'Normal_Attack',
          'Special_Attack',
          'Special_Action',
          'Charge_Up',
          'Break_Stagger',
        ]) {
          assert(puppet.animations.includes(clipName), `Missing puppet clip ${clipName}`);
        }
      }
      if (name === 'moon-tree-formation') {
        assert(
          check.tree.span > 9.6,
          `Moon Tree crown and roots should span all three cards (${check.tree.span})`,
        );
        assert(check.tree.mirroredBounds < 0.04, 'Mother Tree must be mirrored in its battle pose');
        assert(check.tree.crownWidth > 1.8, 'Mother Tree should have one continuous crown');
        assert.equal(check.tree.hasSpeakerBoxes, false);
      }
      if (name === 'ares-formation-on-cards') {
        const ares = check.status.mounted.find(({ id }) => id === 'ares');
        for (const clip of ['Idle', 'Normal_Attack', 'Special_Attack', 'Special_Action']) {
          assert(ares.animations.includes(clip), `Missing Ares clip ${clip}`);
        }
      }
      overlordResults.push({ name, mounted: check.status.mounted });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(output, name + '.png') });
      await page.evaluate(() => window.universalView.dispose());
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(async () => {
      const [{ createRecords }, { createEventScope }] = await Promise.all([
        import('/src/app/records.js'),
        import('/src/shared/events.js'),
      ]);
      const archivesOpen = document.createElement('button');
      archivesOpen.id = 'archives-open';
      archivesOpen.hidden = true;
      const recordsOpen = document.createElement('button');
      recordsOpen.id = 'records-open';
      recordsOpen.hidden = true;
      document.body.append(archivesOpen, recordsOpen);
      const events = createEventScope();
      const session = {
        runtime: { mode: 'tavern', disposed: false },
        ai: {
          library: {
            history: [],
            scripts: [],
            worlds: [],
            archives: {
              npcs: [
                {
                  id: 'npc-bridge',
                  name: '灰袍守桥人',
                  content: '在旧石桥旁守候夜行人。',
                  keywords: ['守桥人'],
                  sources: [{ title: '潮声 · 林中的旧桥', map: 'ruins', encounter: 0 }],
                },
              ],
              items: [
                {
                  id: 'item-coin',
                  name: '旧铜片',
                  description: '刻着水道方向的铜片',
                  value: 5,
                  map: 'ruins',
                  level: 1,
                  quality: 'common',
                  converted: false,
                  source: { title: '潮声 · 林中的旧桥', map: 'ruins', encounter: 1 },
                },
              ],
            },
            seenMonsters: ['mossSlime', 'chaosBadlandFalcon', 'ladderCrowman'],
          },
          generationOptions: { developerMode: false, editArchives: false, unlockAllCodex: false },
        },
      };
      const controller = createRecords({
        session,
        events,
        generation: { save: () => true },
        shell: { toast: () => {} },
      });
      window.archiveTestHost = {
        setOptions(next) {
          Object.assign(session.ai.generationOptions, next);
          controller.refreshArchive();
        },
        cleanup() {
          controller.dispose();
          events.dispose();
          archivesOpen.remove();
          recordsOpen.remove();
        },
      };
      archivesOpen.click();
    });
    await page.locator('#archive-dialog').waitFor({ state: 'visible' });
    const tabsBox = await page.locator('.archive-tabs').boundingBox();
    const archiveBox = await page.locator('#archive-dialog').boundingBox();
    assert(tabsBox.x > archiveBox.x + archiveBox.width / 2);
    assert.equal(await page.locator('#archive-list button').count(), 1);
    await page.locator('[data-archive-tab="items"]').click();
    assert.equal(await page.locator('#archive-list button').count(), 1);
    assert((await page.locator('#archive-text').innerText()).includes('以太'));
    await page.locator('[data-archive-tab="enemies"]').click();
    assert.equal(await page.locator('[data-enemy-tier]').count(), 4);
    assert.equal(await page.locator('.archive-enemy-category-toggle').isVisible(), false);
    assert.equal(await page.locator('.archive-enemy-categories').isVisible(), false);
    await page.locator('[data-enemy-tier="minion"]').click();
    assert.equal(await page.locator('.archive-enemy-category-toggle').isVisible(), true);
    assert.equal(await page.locator('.archive-enemy-categories').isVisible(), true);
    const defaultProgress = await page.locator('.archive-codex-count').textContent();
    const [, totalMonsters] = defaultProgress.match(/3\s*\/\s*(\d+)/) || [];
    assert(Number(totalMonsters) > 50, `Expected seen count 3 / >50, got ${defaultProgress}`);
    assert.equal(await page.locator('#archive-list button').count(), 1);
    assert.equal(await page.locator('#archive-text img').count(), 1);
    await page.locator('[data-enemy-tier="elite"]').click();
    assert.equal(await page.locator('.archive-enemy-category-toggle').isVisible(), false);
    assert.equal(await page.locator('.archive-enemy-categories').isVisible(), false);
    assert.equal(await page.locator('#archive-list button').count(), 1);
    assert.equal(await page.locator('#archive-text img').count(), 1);
    await page.locator('[data-enemy-tier="boss"]').click();
    assert.equal(await page.locator('#archive-list button').count(), 1);
    assert(
      (await page.locator('#archive-list button').first().innerText()).includes('天梯鸦人'),
      'Seen boss ladderCrowman must display in Boss tier',
    );
    assert.equal(await page.locator('#archive-text img').count(), 1);
    await page.locator('[data-enemy-tier="overlord"]').click();
    assert.equal(await page.locator('#archive-list button').count(), 0);
    assert.equal(
      await page.locator('#archive-text .records-empty h3').innerText(),
      '当前筛选下暂无已解锁魔物',
    );
    assert(
      (await page.locator('#archive-text .records-empty p').innerText()).includes(
        '遭遇符合筛选条件的新敌人后将自动收录于此。',
      ),
    );

    const exportButton = page.locator('#archive-enemy-export');
    assert.equal(await exportButton.isVisible(), true);
    const seenExportPromise = page.waitForEvent('download');
    await exportButton.click();
    const seenDownload = await seenExportPromise;
    assert.equal(seenDownload.suggestedFilename(), 'wanxiang-enemy-codex.json');
    const seenExport = JSON.parse(await readFile(await seenDownload.path(), 'utf8'));
    assert.deepEqual(
      seenExport.categories.map(({ id }) => id),
      ['beast', 'insect', 'construct', 'humanoid', 'spirit', 'other'],
      'the export always contains all six stable categories',
    );
    const seenEntries = seenExport.categories.flatMap(({ enemies }) => enemies);
    assert.deepEqual(
      seenEntries.map(({ id }) => id).sort(),
      ['chaosBadlandFalcon', 'ladderCrowman', 'mossSlime'].sort(),
      'ordinary export contains exactly the three encountered enemies, even with the Overlord filter selected',
    );
    assert(seenExport.categories.some(({ enemies }) => enemies.length === 0));
    assert.equal(
      await page.locator('[data-enemy-tier="overlord"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('[data-enemy-category="all"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'archive-enemy-export');

    // Turning on unlockAllCodex without developerMode master switch must stay locked
    await page.evaluate(() =>
      window.archiveTestHost.setOptions({ developerMode: false, unlockAllCodex: true }),
    );
    assert.equal(
      (await page.locator('.archive-codex-count').textContent()).trim(),
      `3 / ${totalMonsters}`,
    );

    const gatedExportPromise = page.waitForEvent('download');
    await exportButton.click();
    const gatedDownload = await gatedExportPromise;
    const gatedExport = JSON.parse(await readFile(await gatedDownload.path(), 'utf8'));
    assert.deepEqual(
      gatedExport.categories.flatMap(({ enemies }) => enemies.map(({ id }) => id)).sort(),
      ['chaosBadlandFalcon', 'ladderCrowman', 'mossSlime'].sort(),
      'unlockAllCodex cannot bypass the developer-mode master switch in exports',
    );

    // Enable both developerMode + unlockAllCodex -> shows all monsters
    await page.evaluate(() =>
      window.archiveTestHost.setOptions({ developerMode: true, unlockAllCodex: true }),
    );
    assert.equal(
      (await page.locator('.archive-codex-count').textContent()).trim(),
      `${totalMonsters} / ${totalMonsters}`,
    );
    const developerExportPromise = page.waitForEvent('download');
    await exportButton.click();
    const developerDownload = await developerExportPromise;
    const developerExport = JSON.parse(await readFile(await developerDownload.path(), 'utf8'));
    assert.equal(
      developerExport.categories.reduce((sum, category) => sum + category.enemies.length, 0),
      Number(totalMonsters),
      'developer-mode export matches every codex entry shown as unlocked',
    );

    await page.locator('[data-archive-tab="enemies"]').click();
    assert.equal(await page.locator('[data-enemy-category]').count(), 7);
    await page.locator('[data-enemy-tier="minion"]').click();
    assert.equal(await page.locator('.archive-enemy-category-toggle').isVisible(), true);
    await page.locator('[data-enemy-category-toggle]').click();
    assert.equal(await page.locator('.archive-enemy-categories').isVisible(), false);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('wanxiang.codex.enemy-categories-expanded.v1'),
      ),
      'false',
    );
    await page.locator('[data-enemy-tier="elite"]').click();
    await page.locator('[data-enemy-tier="minion"]').click();
    assert.equal(await page.locator('.archive-enemy-categories').isVisible(), false);
    await page.locator('[data-enemy-category-toggle]').click();
    assert.equal(await page.locator('.archive-enemy-categories').isVisible(), true);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('wanxiang.codex.enemy-categories-expanded.v1'),
      ),
      'true',
    );
    for (const [category, label] of [
      ['beast', '野兽/魔兽'],
      ['insect', '虫甲/奇异'],
      ['construct', '构装/机械'],
      ['humanoid', '人形阵营'],
      ['spirit', '灵体/能量'],
    ]) {
      await page.locator(`[data-enemy-category="${category}"]`).click();
      const categoryRows = page.locator('#archive-list button small');
      const rowCategories = await categoryRows.allTextContents();
      assert(rowCategories.length > 0, `${category} displays its unlocked entries`);
      assert(
        rowCategories.every((text) => text.includes(label)),
        `${category} contains only ${label}`,
      );
    }
    await page.locator('[data-enemy-category="other"]').click();
    assert.equal(
      await page.locator('#archive-list button').count(),
      0,
      'cleaned official minions leave other empty',
    );
    assert(
      (await page.locator('#archive-text').innerText()).includes('当前筛选下暂无已解锁魔物'),
      'empty other category shows empty codex state',
    );
    await page.locator('[data-enemy-category="insect"]').click();
    await page.locator('#archive-list button').filter({ hasText: '苔藓史莱姆' }).click();
    assert.equal(await page.locator('#archive-text .skyrim-folio-title').innerText(), '苔藓史莱姆');
    const monsterBadges = await page
      .locator('#archive-text .skyrim-folio-badges span')
      .allTextContents();
    assert(monsterBadges.includes('虫甲/奇异'));
    assert(monsterBadges.includes('史莱姆'));
    const codexDetail = await page.locator('#archive-text').innerText();
    assert(!codexDetail.includes('基础生命'));
    assert(!/\d+\s*点?\s*伤害/u.test(codexDetail), 'codex detail omits fixed level-one damage');
    assert(
      !/\d+\s*层?\s*(?:中毒|流血)/u.test(codexDetail),
      'codex detail omits fixed poison/bleed stacks',
    );
    await page.locator('[data-enemy-category="all"]').click();
    await page.locator('[data-enemy-tier="boss"]').click();
    const bossNames = await page.locator('#archive-list button strong').allTextContents();
    assert(bossNames.includes('天梯魔蛛'), 'Upgraded ladderWebSpider should list under 首领');
    assert(bossNames.includes('天梯鸦人'), 'New ladderCrowman should list under 首领');

    const archiveEntries = page.locator('#archive-list button');
    const archiveIntents = page.locator('#archive-text .skyrim-archive-intent');
    for (const [tier, name, moves] of [
      ['minion', '沙场网斗士', ['三叉戟刺击', '投网']],
      ['minion', '发条机兵', ['扑咬', '炉心吐息']],
      ['minion', '铁笼驯兽官', ['金属鞭击', '震兽号角']],
      ['minion', '银星重盾卫', ['短矛突刺', '塔盾防御']],
      ['elite', '重装战轮破阵者', ['双斧横扫', '战轮冲撞']],
      ['elite', '万圣裁决卫队长', ['重剑斩击', '裁决光环']],
    ]) {
      await page.locator(`[data-enemy-tier="${tier}"]`).click();
      await archiveEntries.filter({ hasText: name }).click();
      assert.equal(await page.locator('#archive-text .skyrim-folio-title').innerText(), name);
      assert.deepEqual(
        await archiveIntents.locator('strong').allTextContents(),
        moves.map((move) => `${move}：`),
        `${name}: archive action intents`,
      );
    }

    await page.locator('[data-enemy-tier="overlord"]').click();
    const overlordNames = await archiveEntries.locator('strong').allTextContents();
    for (const name of [
      '阿佩普的羔羊',
      '母树',
      '战斗机兵·阿瑞斯',
      '辉光亚龙',
      '失败的炼金傀偶',
      '初生暗鳞督军',
      '暗巷匪王·黑鸦',
      '帝都大冠军·奥勒留',
    ]) {
      assert(overlordNames.includes(name), `${name}: missing from the overlord archive`);
    }
    assert.equal(await page.locator('#archive-text img').count(), 0);
    await page
      .locator(
        '#archive-dialog .archive-overlord-stage[data-stage-ready="ready"][data-loaded-models="1"]',
      )
      .waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'archive-overlord-single.png') });
    await page.locator('#archive-list button').filter({ hasText: '失败的炼金傀偶' }).click();
    await page
      .locator(
        '#archive-dialog .archive-overlord-stage[data-stage-ready="ready"][data-loaded-models="1"]',
      )
      .waitFor({ timeout: 30000 });
    const puppetAnims = await page
      .locator('#archive-dialog .archive-stage-anims [data-stage-anim]')
      .evaluateAll((buttons) => buttons.map((btn) => btn.dataset.stageAnim));
    for (const clipName of [
      'Idle',
      'Normal_Attack',
      'Special_Attack',
      'Special_Action',
      'Bomb_Toss',
    ]) {
      assert(puppetAnims.includes(clipName), `Missing archive puppet animation button ${clipName}`);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'archive-overlord-puppet.png') });
    await page.locator('#archive-list button').filter({ hasText: '母树' }).click();
    await page
      .locator(
        '#archive-dialog .archive-overlord-stage[data-stage-ready="ready"][data-loaded-models="3"]',
      )
      .waitFor({ timeout: 30000 });
    const overlordText = await page.locator('#archive-text').innerText();
    for (const partName of ['月蚀树冠', '月之魔眼', '月痕树根']) {
      assert(overlordText.includes(partName), `Missing Mother Tree part ${partName}`);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'archive-overlord-moontree.png') });

    await archiveEntries.filter({ hasText: '帝都大冠军·奥勒留' }).click();
    const championStage = page.locator(
      '#archive-dialog .archive-overlord-stage[data-stage-ready="ready"][data-loaded-models="1"]',
    );
    await championStage.waitFor({ timeout: 30000 });
    const championActions = championStage.locator('.archive-stage-anims [data-stage-anim]');
    assert.deepEqual(
      (
        await championActions.evaluateAll((buttons) => buttons.map((btn) => btn.dataset.stageAnim))
      ).sort(),
      [
        'Break_Stagger',
        'Charge_Up',
        'Idle',
        'Normal_Attack',
        'Special_Action',
        'Special_Attack',
        'Talon_Rend',
      ],
    );
    const finishingMove = championStage.locator('[data-stage-anim="Talon_Rend"]');
    await finishingMove.click();
    assert.equal(await finishingMove.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(
      await archiveIntents.evaluateAll((rows) =>
        rows.map((row) =>
          row.lastElementChild.textContent
            .replace(row.querySelector('strong').textContent, '')
            .trim(),
        ),
      ),
      ['行动文本待定。'],
    );

    await checkSilverCrownArchive(page, output);
    await checkArenaQualifierArchive(page, output);

    // Turning off unlockAllCodex reverts immediately back to the save's real seen count (3 / total)
    await page.evaluate(() =>
      window.archiveTestHost.setOptions({ developerMode: true, unlockAllCodex: false }),
    );
    assert.equal(
      (await page.locator('.archive-codex-count').textContent()).trim(),
      `3 / ${totalMonsters}`,
    );
    assert.equal(await page.locator('#archive-list button').count(), 0);

    await page.locator('#archive-close').click();
    await page.evaluate(() => window.archiveTestHost.cleanup());
    await page.setViewportSize({ width: 1500, height: 990 });
    const loaded = await page.evaluate(async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } =
        await import('/src/content/universal-adversaries.js');
      const stage = document.querySelector('#art-stage');
      stage.replaceChildren();
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1500, 990);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setScissorTest(true);
      stage.append(renderer.domElement);
      const records = [];
      for (const [index, enemy] of [...UNIVERSAL_ENEMIES, ...UNIVERSAL_BOSSES].entries()) {
        const model = (await new GLTFLoader().loadAsync('/assets/' + enemy.model)).scene;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#142428');
        scene.add(model, new THREE.HemisphereLight('#e2eee7', '#465253', 2.1));
        const light = new THREE.DirectionalLight('#fff0d7', 3.1);
        light.position.set(9, 18, 7);
        scene.add(light);
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const half = Math.max(size.x, size.y, size.z) * 0.76;
        const camera = new THREE.OrthographicCamera(-half, half, half * 1.1, -half * 1.1, 0.1, 200);
        camera.position.copy(center).add(new THREE.Vector3(20, 14, 20));
        camera.lookAt(center);
        renderer.setViewport((index % 5) * 300, (2 - Math.floor(index / 5)) * 330, 300, 330);
        renderer.setScissor((index % 5) * 300, (2 - Math.floor(index / 5)) * 330, 300, 330);
        renderer.render(scene, camera);
        let meshes = 0;
        model.traverse((object) => {
          if (!object.isMesh) return;
          meshes++;
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        });
        records.push({
          id: enemy.id,
          meshes,
          height: size.y,
          finite: bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite),
        });
      }
      window.universalRenderer = renderer;
      return records;
    });
    assert.equal(loaded.length, 13);
    assert(loaded.every((entry) => entry.meshes >= 4 && entry.height > 3 && entry.finite));
    await page.screenshot({ path: path.join(output, 'universal-glb-models.png') });
    await page.evaluate(() => window.universalRenderer.dispose());
    const enemies = [
      { name: '原有 · 晶背甲虫', portrait: 'crystal-beetle' },
      { name: '原有 · 石甲虫', portrait: 'stone-beetle' },
      ...UNIVERSAL_ENEMIES,
      ...UNIVERSAL_BOSSES,
    ];
    await page.setViewportSize({ width: 1350, height: 1100 });
    await page.setContent(
      `<html lang="zh"><head><style>body{margin:0;padding:20px;background:#102420;color:#dfd6b9;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}article{text-align:center}img{display:block;width:100%;aspect-ratio:2/3}p{margin:9px}</style></head><body><main>${enemies.map((entry) => `<article><img src="${baseURL}/assets/portraits/${entry.portrait}.svg"/><p>${entry.name}</p></article>`).join('')}</main></body></html>`,
    );
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );
    await page.screenshot({
      path: path.join(output, 'universal-style-comparison.png'),
      fullPage: true,
    });
    const expandedCards = await page.evaluate(async () => {
      const [{ LADDER_ENEMIES, LADDER_BOSSES }, { COMMON_ENEMIES, COMMON_BOSSES }] =
        await Promise.all([
          import('/src/content/ladder-adversaries.js'),
          import('/src/content/common-adversaries.js'),
        ]);
      return [
        { name: '霸主 · 阿佩普的羔羊', portrait: 'apep-lamb' },
        { name: '霸主 · 阿瑞斯', portrait: 'ares' },
        { name: '霸主 · 月蚀树冠', portrait: 'moon-crown' },
        { name: '霸主 · 月之魔眼', portrait: 'moon-eye' },
        { name: '霸主 · 月痕树根', portrait: 'moon-root' },
        ...LADDER_ENEMIES,
        ...LADDER_BOSSES,
        ...COMMON_ENEMIES,
        ...COMMON_BOSSES,
      ];
    });
    await page.setViewportSize({ width: 1500, height: 1200 });
    await page.setContent(
      `<html lang="zh"><head><style>body{margin:0;padding:20px;background:#0f1922;color:#dfd6b9;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(8,1fr);gap:12px}article{text-align:center}img{display:block;width:100%;aspect-ratio:2/3}p{margin:6px 0}</style></head><body><main>${expandedCards.map((entry) => `<article><img src="${baseURL}/assets/portraits/${entry.portrait}.svg"/><p>${entry.name}</p></article>`).join('')}</main></body></html>`,
    );
    const portraitWidths = await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth === 600),
    );
    assert(portraitWidths);
    await page.screenshot({
      path: path.join(output, 'expanded-monsters-gallery.png'),
      fullPage: true,
    });

    const fixtureHtml = (
      await readFile(new URL('../../index.html', import.meta.url), 'utf8')
    ).replace('<script type="module" src="./src/app.js"></script>', '');

    const hudPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    hudPage.on('pageerror', (failure) => failures.push(failure.message));
    try {
      await hudPage.route('**/__combat-hud-fixture', (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
      );
      await hudPage.goto(new URL('__combat-hud-fixture', baseURL).href);
      const hudCheck = await hudPage.evaluate(async () => {
        const [
          { createBattleView },
          { createSession },
          { createRoster },
          { createPlanning },
          { createDetails },
          { createTimeline },
          { createSelection },
          { newBattle, openBreakWindow, preview, makeAction, enemyTimeline },
        ] = await Promise.all([
          import('/src/scene.js'),
          import('/src/app/session.js'),
          import('/src/app/roster.js'),
          import('/src/app/planning.js'),
          import('/src/app/details.js'),
          import('/src/app/timeline.js'),
          import('/src/app/selection.js'),
          import('/src/engine.js'),
        ]);
        document.body.classList.add('in-battle');
        document.querySelector('#battle').hidden = false;
        document.querySelector('#inn').hidden = true;
        document.querySelector('#scene-loading').hidden = true;
        document.querySelector('#story-toggle').hidden = false;

        const enemyIds = ['millVoleAlpha', 'alchemicalPuppet', 'millMoldSlimeBoss'];
        const session = createSession();
        session.runtime.mode = 'battle';
        const state = newBattle(enemyIds);
        state.phase = 'plan';
        state.round = 2;
        for (const eid of enemyIds) openBreakWindow(state, eid);
        const heroId = state.formation[0];
        state.units[heroId].maxHp = 72;
        state.units[heroId].hp = 69;
        state.units[heroId].block = 15;
        session.battle.state = state;
        const slots = enemyTimeline(state);
        const freeSlot = slots.findIndex((entry) => entry === null);
        session.battle.plan = [makeAction(state, heroId, 'attack', 'alchemicalPuppet', freeSlot)];
        session.battle.forecast = preview(state, session.battle.plan);
        session.selection.selected = heroId;

        const context = {
          session,
          viewport: {
            canPlan: () => true,
            compactHUD: () => false,
            compactLandscape: () => false,
            openCharacterHUD() {},
          },
          drag: { clearDropHighlights() {} },
          audio: { play() {} },
          shell: { toast() {} },
        };
        context.roster = createRoster(context);
        context.planning = createPlanning(context);
        context.details = createDetails(context);
        context.timeline = createTimeline(context);
        context.selection = createSelection(context);

        const view = await createBattleView(
          document.querySelector('#stage'),
          (...args) => context.selection.selectUnit(...args),
          { map: 'mill', enemyIds, weather: 'clear' },
        );
        session.runtime.view = view;
        context.renderer = {
          render() {
            view.draw(
              session.battle.state,
              session.battle.forecast,
              session.selection.selected,
              null,
              false,
            );
            context.details.renderDetails(session.battle.state);
            context.timeline.renderTimeline();
          },
        };
        context.renderer.render();
        const dummyDailyHud = document.createElement('section');
        dummyDailyHud.id = 'daily-hud';
        dummyDailyHud.innerHTML =
          '<div class="daily-top-hud"><div class="daily-plaque"><span data-tavern-clock>1463年8月24日</span></div><div class="daily-status"><span>外出 · 已行 2 回合</span></div></div>';
        document.body.append(dummyDailyHud);

        window.combatHudView = view;
        const parseRgb = (cssColor) => {
          const m = cssColor.match(/\d+/g);
          return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
        };
        const centerYDiff = (selector) => {
          const bar = document.querySelector(selector);
          const num = bar?.querySelector('.resource-number');
          if (!bar || !num) return 999;
          const bRect = bar.getBoundingClientRect();
          const nRect = num.getBoundingClientRect();
          return Math.abs(nRect.top + nRect.height / 2 - (bRect.top + bRect.height / 2));
        };
        const heroEl = document.querySelector(`[data-unit="${heroId}"]`);
        const shieldSpan = heroEl?.querySelector('.bar.hp .bar-shield-text');
        const shieldRgb = shieldSpan ? parseRgb(getComputedStyle(shieldSpan).color) : [0, 0, 0];
        const detailChips = [...document.querySelectorAll('#details .dmg-type-chip')];
        const chipLefts = detailChips.map((el) => el.getBoundingClientRect().left);
        const timelineNumbers = [
          ...document.querySelectorAll(
            '#timeline .time-cell .num, #timeline .time-action .action-number',
          ),
        ];
        const numTops = timelineNumbers.map((el) => el.getBoundingClientRect().top);
        const entryCard = [...document.querySelectorAll('#details .passive-card')].find((el) =>
          el.textContent.includes('霜月·星陨穿刺'),
        );
        return {
          dailyHudDisplay: getComputedStyle(dummyDailyHud).display,
          heroShieldText: heroEl?.querySelector('.bar.hp .resource-number')?.textContent || '',
          shieldSpanText: shieldSpan?.textContent || '',
          shieldBlueDelta: shieldRgb[2] - shieldRgb[0],
          heroShieldFill: heroEl?.querySelectorAll('.bar.hp .bar-shield-fill').length || 0,
          barCenterDiffs: [
            centerYDiff(`[data-unit="${heroId}"] .bar.hp`),
            centerYDiff(`[data-unit="${heroId}"] .bar.mp`),
            centerYDiff('[data-side="Enemy"] .bar.hp'),
            centerYDiff('#details .hero-resources .bar.hp'),
          ],
          breakRailCount: document.querySelectorAll('.enemy-break-rail').length,
          majorWeaknessCount: document.querySelectorAll('.enemy-weakness-pill.is-major').length,
          revealedWeakness: document.querySelectorAll('.enemy-weakness-pill[data-weakness="fire"]')
            .length,
          unknownWeakness: document.querySelectorAll('.enemy-weakness-pill.is-unknown').length,
          timelineIcons: document.querySelectorAll('#timeline .dmg-type-svg').length,
          detailsChips: detailChips.length,
          labelTextCount: document.querySelectorAll('.dmg-type-label').length,
          chipLeftSpread:
            chipLefts.length > 1 ? Math.max(...chipLefts) - Math.min(...chipLefts) : 999,
          timelineNumTopSpread:
            numTops.length > 1 ? Math.max(...numTops) - Math.min(...numTops) : 999,
          entryHasSvg: Boolean(entryCard?.querySelector('.dmg-type-chip svg')),
          entryGarbledHtml:
            Boolean(entryCard?.textContent.includes('<span')) ||
            Boolean(entryCard?.textContent.includes('<svg')),
        };
      });
      await hudPage.waitForFunction(() => !window.combatHudView.isAnimating());
      assert.equal(hudCheck.dailyHudDisplay, 'none');
      assert(hudCheck.heroShieldText.includes('69/72（15）'), hudCheck.heroShieldText);
      assert.equal(hudCheck.shieldSpanText, '（15）');
      assert(
        hudCheck.shieldBlueDelta > 60,
        `Expected blue shield text, delta=${hudCheck.shieldBlueDelta}`,
      );
      assert.equal(hudCheck.heroShieldFill, 1);
      for (const diff of hudCheck.barCenterDiffs) {
        assert(diff <= 2.5, `Expected .resource-number centered on .bar, diff=${diff}`);
      }
      assert.equal(hudCheck.breakRailCount, 3);
      assert.equal(hudCheck.majorWeaknessCount, 3);
      assert(hudCheck.revealedWeakness >= 1);
      assert.equal(hudCheck.unknownWeakness, 0);
      assert(hudCheck.timelineIcons >= 3);
      assert(hudCheck.detailsChips >= 4);
      assert.equal(hudCheck.labelTextCount, 0);
      assert(
        hudCheck.chipLeftSpread <= 1.5,
        `Expected details chips left-aligned, spread=${hudCheck.chipLeftSpread}`,
      );
      assert(
        hudCheck.timelineNumTopSpread <= 1.5,
        `Expected timeline numbers top-aligned, spread=${hudCheck.timelineNumTopSpread}`,
      );
      assert.equal(hudCheck.entryHasSvg, true);
      assert.equal(hudCheck.entryGarbledHtml, false);
      await hudPage.screenshot({ path: path.join(output, 'combat-overhaul-hud.png') });
      await hudPage.evaluate(() => {
        const panel = document.querySelector('#details');
        if (panel) panel.scrollTop = panel.scrollHeight;
      });
      await hudPage.screenshot({ path: path.join(output, 'combat-overhaul-details-entry.png') });
      await hudPage.evaluate(() => window.combatHudView.dispose());
    } finally {
      await hudPage.close();
    }

    const prepPage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    prepPage.on('pageerror', (failure) => failures.push(failure.message));
    try {
      await prepPage.route('**/__mobile-prep-fixture', (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
      );
      await prepPage.goto(new URL('__mobile-prep-fixture', baseURL).href);
      await prepPage.evaluate(async () => {
        const [
          { createSession },
          { createShell },
          { createDeparture },
          { createEventScope },
          { newCampaign, firstCompanion },
          { defaultProtagonist },
        ] = await Promise.all([
          import('/src/app/session.js'),
          import('/src/app/shell.js'),
          import('/src/app/departure.js'),
          import('/src/shared/events.js'),
          import('/src/campaign.js'),
          import('/src/content/qingyuan.js'),
        ]);
        const session = createSession();
        const library = newCampaign(defaultProtagonist());
        firstCompanion(library);
        library.campaign.tutorial = 'complete';
        library.progression.pandoraJoined = true;
        library.learnedSkills = ['uni-feint-retreat', 'uni-serrated-cut', 'uni-ember-flare'];
        session.ai.library = library;
        session.ai.preparationTab = 'skill';
        const context = {
          session,
          events: createEventScope(),
          audio: { attachFrame() {} },
          equipment: { refresh() {} },
          onboarding: { preparationOpened() {} },
        };
        context.shell = createShell(context);
        context.departure = createDeparture(context);
        document.querySelector('#party-panel').addEventListener('click', (event) => {
          const tab = event.target.closest('[data-prepare-tab]');
          if (!tab) return;
          session.ai.preparationTab = tab.dataset.prepareTab;
          context.shell.renderParty();
        });
        const active = context.departure.equip({ pending: true });
        active.ready();
        window.mobilePrepFixture = context;
      });
      await prepPage.locator('#party-panel.script-ready').waitFor({ state: 'visible' });
      await prepPage.locator('#prepare-done.depart-ready-fx').waitFor({ state: 'visible' });
      const skillCheck = await prepPage.evaluate(() => ({
        headCount: document.querySelectorAll('.pp-skill-ico.is-dmg-emblem svg.dmg-type-svg').length,
        universalHead: document.querySelector('.prepare-universal-head small')?.textContent || '',
        options: [...document.querySelectorAll('.prepare-universal-slot select option')].map(
          (o) => o.textContent,
        ),
      }));
      assert(skillCheck.headCount >= 3, 'prep skill cards render damage type icons');
      assert(skillCheck.universalHead.includes('/18'), skillCheck.universalHead);
      assert(
        skillCheck.options.some((text) => text.includes('[火]')),
        'universal skill options include [type] prefix',
      );
      await prepPage.locator('#prepare-expand-left').click();
      await prepPage.locator('#party-panel.left-expanded').waitFor({ state: 'visible' });
      await prepPage.waitForTimeout(260);
      const expandedMetrics = await prepPage.evaluate(() => ({
        expanded: document.querySelector('#party-panel').classList.contains('left-expanded'),
        readyFx: document.querySelector('#prepare-done').classList.contains('depart-ready-fx'),
        stageHidden:
          getComputedStyle(document.querySelector('.prepare-stage-col')).display === 'none',
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      assert.equal(expandedMetrics.expanded, true);
      assert.equal(expandedMetrics.readyFx, true);
      assert.equal(expandedMetrics.stageHidden, true);
      assert.equal(expandedMetrics.overflow, false);
      await prepPage.screenshot({ path: path.join(output, 'mobile-prep-expanded-and-ready.png') });
      await prepPage.evaluate(() => {
        window.mobilePrepFixture.departure.dispose();
        window.mobilePrepFixture.shell.dispose();
        window.mobilePrepFixture.events.dispose();
      });
    } finally {
      await prepPage.close();
    }

    assert.deepEqual(failures, []);
    return {
      enemies: 10,
      bosses: 3,
      expandedMonsters: expandedCards.length,
      overlordResults,
      actualGlbModels: loaded,
      realBattleCards: 6,
      originalReferences: 2,
    };
  } finally {
    await page.close();
  }
}
