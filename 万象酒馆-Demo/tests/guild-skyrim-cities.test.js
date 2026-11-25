import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { BASE_WORLDS, EMPIRE_TRANSITION_DUNGEONS } from '../src/worlds.js';
import { IMPERIAL_DUNGEONS, IMPERIAL_EXTRA_DUNGEONS } from '../src/content/imperial-network.js';
import { REGIONS } from '../src/content/regions.js';
import { encounterLevel } from '../src/enemy-growth.js';
import { explorationSpec, unlockDungeonMap } from '../src/exploration.js';
import { cityFacilities, cityForScene } from '../src/city-directory.js';
import {
  GUILD_BOUNTIES,
  GUILD_TRIALS,
  acceptGuildBounty,
  claimGuildBountyReward,
  guildBountyBoard,
  guildIntelList,
  guildRankInfo,
  isBountyReadyToClaim,
  recordGuildCombatProgress,
  recordGuildSparringWin,
  unlockGuildIntel,
} from '../src/guild.js';
import { createTavernQuests } from '../src/app/tavern-quests.js';

test('each city directory provides the three facilities at in-city locations', () => {
  const entries = { street: 'starbell', 'road-capital': 'silver-crown', 'eternal-city': 'eternal' };
  for (const [scene, city] of Object.entries(entries)) {
    assert.equal(cityForScene(scene), city);
    const facilities = cityFacilities(city);
    assert.deepEqual(
      facilities.map(({ id }) => id),
      [city + '-blacksmith', city + '-market', city + '-guild'],
    );
    assert(facilities.every(({ streetScene }) => cityForScene(streetScene) === city));
  }
});

test('empire transition dungeons cover low, mid, and high tiers cleanly using existing biomes', () => {
  assert.deepEqual([...BASE_WORLDS], ['mill', 'ruins', 'forest', 'frost', 'forge', 'tide']);
  assert.equal(EMPIRE_TRANSITION_DUNGEONS.length, 7);
  assert(EMPIRE_TRANSITION_DUNGEONS.includes('graystone-quarry'));
  const lib = newLibrary();

  for (const dungeon of IMPERIAL_EXTRA_DUNGEONS) {
    const region = REGIONS[dungeon.id];
    assert(region, `Missing region for ${dungeon.id}`);
    assert(region.biome, `Missing reusable biome for ${dungeon.id}`);
    assert.equal(region.sites.length, 6);
    const route = lib.exploration[dungeon.id];
    assert(route && route.frontier.length === 1);
    const spec = explorationSpec(route.frontier[0]);
    assert.equal(spec.map, dungeon.id);
    const lv = encounterLevel(route.frontier[0]);
    assert(lv >= 2 && lv <= 28, `${dungeon.id} initial level ${lv} in curve`);
    assert.equal(unlockDungeonMap(lib, dungeon.id), true);
  }

  const restored = restoreLibrary(JSON.parse(JSON.stringify(lib)));
  for (const dungeon of IMPERIAL_EXTRA_DUNGEONS) {
    assert(restored.unlockedDungeons.includes(dungeon.id));
  }
});

test('adventurers guild bounties, intel, and sparring trials integrate with quests', () => {
  const lib = newLibrary();
  lib.inventory.gold = 300;
  assert.equal(guildRankInfo(lib.guild.merit).current.rank, 'E');

  const previouslyTracked = acceptGuildBounty(lib, GUILD_BOUNTIES[1].id);
  assert.equal(previouslyTracked.ok, true);
  assert.equal(previouslyTracked.quest.tracked, true);
  const firstBounty = GUILD_BOUNTIES[0];
  const accepted = acceptGuildBounty(lib, firstBounty.id);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.quest.type, 'bounty');
  assert.equal(accepted.quest.status, 'active');
  assert.equal(accepted.quest.tracked, true);
  assert.equal(previouslyTracked.quest.tracked, false);
  assert.equal(accepted.quest.id, `guild-${firstBounty.id}`);
  assert.equal(accepted.quest.sourceId, `guild:${firstBounty.id}`);
  assert.equal(accepted.quest.bountyId, firstBounty.id);
  assert.equal(accepted.quest.rank, firstBounty.rank);
  assert.equal(accepted.quest.hook, firstBounty.description);
  assert.equal(accepted.quest.level, firstBounty.level);
  assert.equal(accepted.quest.origin, 'outskirts');
  assert.equal(accepted.quest.targetKind, firstBounty.targetKind);
  assert.deepEqual(accepted.quest.targetMaps, [...firstBounty.targetMaps]);
  assert.deepEqual(accepted.quest.objectives, [
    {
      id: 'bounty-main',
      label: firstBounty.objectiveLabel,
      current: 0,
      target: firstBounty.targetCount,
    },
  ]);
  assert.deepEqual(accepted.quest.rewards, {
    gold: firstBounty.gold,
    ether: firstBounty.ether,
    merit: firstBounty.merit,
  });
  assert.equal(accepted.quest.claimed, false);
  const restoredActive = restoreLibrary(JSON.parse(JSON.stringify(lib))).tavernQuests.find(
    ({ id }) => id === accepted.quest.id,
  );
  assert(restoredActive);
  assert.equal(restoredActive.status, 'active');
  assert.equal(restoredActive.tracked, true);
  assert.equal(restoredActive.type, 'bounty');
  assert.equal(restoredActive.bountyId, firstBounty.id);
  assert.equal(restoredActive.objectives[0].current, 0);
  assert.equal(restoredActive.objectives[0].target, firstBounty.targetCount);
  assert.match(accepted.quest.objectives[0].label, /首领战/);
  recordGuildCombatProgress(lib, { kind: 'skirmish' });
  assert.equal(isBountyReadyToClaim(accepted.quest), false);

  const progress = recordGuildCombatProgress(lib, {
    kind: 'dungeon',
    map: firstBounty.targetMaps[0],
  });
  assert.equal(progress.readyQuests.length, 1);
  assert.equal(isBountyReadyToClaim(accepted.quest), true);

  const claimed = claimGuildBountyReward(lib, accepted.quest.id);
  assert.equal(claimed.ok, true);
  assert.equal(accepted.quest.status, 'completed');
  assert(lib.guild.completedBounties === 1);
  assert(lib.guild.merit >= firstBounty.merit);

  const intelBefore = guildIntelList(lib);
  assert.deepEqual(
    intelBefore.map(({ id }) => id).sort(),
    IMPERIAL_DUNGEONS.map(({ id }) => id).sort(),
  );
  const dossier = unlockGuildIntel(lib, 'moss-hollow');
  assert.equal(dossier.ok, true);
  assert.equal(lib.guild.unlockedIntel.includes('moss-hollow'), true);

  const spar = recordGuildSparringWin(lib, GUILD_TRIALS[0]);
  assert(spar.merit > 0 && lib.guild.sparringWins === 1);

  const restored = restoreLibrary(JSON.parse(JSON.stringify(lib)));
  assert.equal(restored.guild.completedBounties, 1);
  assert.equal(restored.guild.sparringWins, 1);
  assert(restored.guild.unlockedIntel.includes('moss-hollow'));
  assert(restored.tavernQuests.some((q) => q.id === accepted.quest.id && q.status === 'completed'));
});

test('guild rotates unclaimed notices when the game day changes and keeps active notices', () => {
  for (const bounty of GUILD_BOUNTIES) {
    assert(bounty.targetMaps.length > 0, bounty.id + ' needs an existing regional target');
    for (const mapId of bounty.targetMaps) {
      assert(REGIONS[mapId], bounty.id + ' references a known region: ' + mapId);
    }
  }

  const lib = newLibrary();
  const first = guildBountyBoard(lib).map(({ id }) => id);
  const unposted = GUILD_BOUNTIES.find(({ id }) => !first.includes(id));
  const special = GUILD_BOUNTIES.find(({ id, rank }) => rank !== 'E' && first.includes(id));
  assert.equal(acceptGuildBounty(lib, unposted.id).ok, false);
  assert.equal(acceptGuildBounty(lib, special.id).ok, true);
  const counts = new Set();
  const orders = new Set();
  for (let day = 2; day <= 8; day++) {
    lib.daily.day = day;
    const board = guildBountyBoard(lib).map(({ id }) => id);
    const fresh = newLibrary();
    fresh.daily.day = day;
    const freshBoard = guildBountyBoard(fresh);
    const freshIds = freshBoard.map(({ id }) => id);
    counts.add(freshIds.length);
    assert.deepEqual(
      guildBountyBoard(fresh).map(({ id }) => id),
      freshIds,
      'the same in-game day must reproduce the same posting set and order',
    );
    assert(freshBoard.every((bounty) => GUILD_BOUNTIES.includes(bounty)));
    assert(
      freshBoard.every((bounty) => bounty.targetMaps.every((mapId) => REGIONS[mapId])),
      'posted notices must use the existing regional task data',
    );
    assert(board.includes(special.id), 'active notices cannot disappear');
    assert.equal(new Set(board).size, board.length);
    orders.add(
      board.filter((id) => GUILD_BOUNTIES.find((entry) => entry.id === id).rank === 'E').join(),
    );
  }
  assert(counts.size > 1, 'the posted count must vary across game days');
  assert(
    [...counts].some((count) => count !== 6),
    'the board must not be fixed at six notices',
  );
  assert(orders.size > 1, 'starter notices may also change order');
  const second = guildBountyBoard(lib).map(({ id }) => id);
  assert.deepEqual(
    guildBountyBoard(restoreLibrary(lib)).map(({ id }) => id),
    second,
  );
});

test('guild notices stay outside the tavern journal until an official notice is accepted', () => {
  const lib = newLibrary();
  const initialJournal = structuredClone(lib.tavernQuests);
  const posted = guildBountyBoard(lib);
  const officialNotice = GUILD_BOUNTIES.find(({ id }) => id === 'bounty-moss-clear');

  assert(officialNotice, 'use the existing Starbell guild notice');
  assert(posted.includes(officialNotice), 'the existing E-rank notice is available');
  assert.deepEqual(lib.tavernQuests, initialJournal, 'reading the board does not enqueue notices');

  const unposted = GUILD_BOUNTIES.find(({ id }) => !posted.some((notice) => notice.id === id));
  assert(unposted, 'the daily board leaves some catalog notices for later days');
  assert.equal(acceptGuildBounty(lib, unposted.id).ok, false);
  assert.deepEqual(
    lib.tavernQuests,
    initialJournal,
    'an unavailable notice cannot enter the journal',
  );

  const accepted = acceptGuildBounty(lib, officialNotice.id);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.quest.title, officialNotice.title);
  assert.deepEqual(
    lib.tavernQuests.map(({ bountyId }) => bountyId),
    [officialNotice.id],
    'only the accepted notice becomes a tavern journal quest',
  );
  assert.equal(lib.tavernQuests[0], accepted.quest);
});

function createQuestUiFixture(t) {
  const lib = newLibrary();
  const accepted = acceptGuildBounty(lib, GUILD_BOUNTIES[0].id);
  assert.equal(accepted.ok, true);
  for (const objective of accepted.quest.objectives) objective.current = objective.target;
  assert.equal(isBountyReadyToClaim(accepted.quest), true);

  const toasts = [];
  const handlers = new Map();
  const elements = new Map();
  const makeElement = (tag) => {
    const listeners = new Map();
    const el = {
      tagName: String(tag).toUpperCase(),
      id: '',
      className: '',
      hidden: false,
      open: false,
      innerHTML: '',
      dataset: {},
      attributes: {},
      children: [],
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      append(child) {
        this.children.push(child);
        if (child && child.id) elements.set(child.id, child);
      },
      remove() {
        if (this.id) elements.delete(this.id);
      },
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      querySelector() {
        return makeElement('button');
      },
      querySelectorAll() {
        return [];
      },
      focus() {},
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
    };
    return el;
  };
  const body = makeElement('body');
  const previousDocument = globalThis.document;
  globalThis.document = {
    body,
    createElement: (tag) => makeElement(tag),
  };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  const saves = [];
  const refreshes = [];
  const context = {
    session: {
      ai: { library: lib },
      runtime: { mode: 'inn', disposed: false },
    },
    events: {
      on(target, type, handler) {
        if (target?.id === 'tavern-quests' && type === 'click')
          handlers.set('click:tavern-quests', handler);
      },
    },
    shell: {
      toast(message) {
        toasts.push(message);
      },
    },
    daily: {
      scene: () => 'tavern',
      refresh() {
        refreshes.push(true);
      },
    },
    generation: {
      save(options) {
        saves.push(options);
        return true;
      },
    },
    storage: {
      flush: () => Promise.resolve(),
    },
  };

  const component = createTavernQuests(context);
  t.after(() => component.dispose());
  const dialog = elements.get('tavern-quests');
  const banner = elements.get('skyrim-quest-banner');
  assert(dialog && banner);

  const click = (selector, dataset) => {
    const handler = handlers.get('click:tavern-quests');
    assert(handler, 'dialog click handler registered');
    const button = { dataset, disabled: false };
    const target = {
      closest(wanted) {
        return wanted === 'button' || wanted === selector ? button : null;
      },
    };
    return handler({ target });
  };

  return {
    lib,
    context,
    component,
    dialog,
    banner,
    toasts,
    saves,
    refreshes,
    click,
    quest: accepted.quest,
  };
}

const claimEntries = [
  [
    'detail button',
    (fx) => fx.click('[data-quest-claim]', { questClaim: fx.quest.id }),
    (fx) => fx.click('[data-quest-pick]', { questPick: fx.quest.id }),
  ],
  [
    'list button',
    (fx) => fx.click('[data-quest-pick]', { questPick: fx.quest.id }),
    (fx) => fx.click('[data-quest-claim]', { questClaim: fx.quest.id }),
  ],
  [
    'HUD advance',
    (fx) => fx.component.advance(),
    (fx) => fx.click('[data-quest-claim]', { questClaim: fx.quest.id }),
  ],
];

for (const [label, trigger, duplicate] of claimEntries) {
  test(`quest claim via ${label} awaits the persisted transaction and locks the UI`, async (t) => {
    const fx = createQuestUiFixture(t);
    const gate = Promise.withResolvers();
    let flushes = 0;
    fx.context.storage.flush = () => {
      flushes++;
      return gate.promise;
    };
    const goldBefore = fx.lib.inventory.gold;
    const meritBefore = fx.lib.guild.merit;

    fx.component.open(fx.quest.id);
    assert.match(fx.dialog.innerHTML, /data-quest-claim=/);
    const pending = trigger(fx);
    assert(pending && typeof pending.then === 'function', 'claim returns a promise');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(fx.saves.length, 1, 'exactly one save before confirmation');
    assert.deepEqual(fx.saves[0], { refresh: false });
    assert.equal(flushes, 1, 'flush actually called');
    assert.equal(fx.banner.hidden, true, 'no success banner before flush confirms');
    assert.equal(fx.toasts.length, 0, 'no success toast before flush confirms');
    assert.equal(fx.refreshes.length, 0, 'no daily refresh before flush confirms');
    assert.match(fx.dialog.innerHTML, /data-quest-claim="[^"]*"[^>]*disabled/);
    assert.match(fx.dialog.innerHTML, /data-quest-pick="[^"]*"[^>]*disabled/);

    duplicate(fx);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fx.saves.length, 1, 'pending claim does not save twice');
    assert.equal(flushes, 1, 'pending claim does not flush twice');
    assert.equal(fx.dialog.open, true, 'alternate entry does not close the journal');

    gate.resolve();
    await pending;

    assert.equal(fx.quest.status, 'completed');
    assert.equal(fx.lib.inventory.gold, goldBefore + fx.quest.rewards.gold);
    assert.equal(fx.lib.guild.merit, meritBefore + fx.quest.rewards.merit);
    assert.equal(fx.banner.hidden, false);
    assert.equal(fx.toasts.length, 1);
    assert.equal(fx.refreshes.length, 1);
  });
}

test('quest log tracking can be enabled and cancelled by clicking the same task again', (t) => {
  const fx = createQuestUiFixture(t);
  fx.quest.tracked = false;
  fx.component.open(fx.quest.id);

  fx.click('[data-quest-track]', { questTrack: fx.quest.id });
  assert.equal(fx.quest.tracked, true);
  assert.equal(fx.saves.length, 1);

  fx.click('[data-quest-track]', { questTrack: fx.quest.id });
  assert.equal(fx.quest.tracked, false);
  assert.equal(fx.saves.length, 2);
  assert.equal(fx.refreshes.length, 2);
});
test('quest claim failure restores the ready UI and toasts the transaction message', async (t) => {
  const fx = createQuestUiFixture(t);
  let flushes = 0;
  fx.context.storage.flush = () => {
    flushes++;
    return Promise.resolve(flushes > 1);
  };
  const goldBefore = fx.lib.inventory.gold;

  fx.component.open(fx.quest.id);
  await fx.click('[data-quest-claim]', { questClaim: fx.quest.id });

  assert.equal(fx.quest.status, 'active');
  assert.equal(fx.lib.inventory.gold, goldBefore);
  assert.equal(fx.banner.hidden, true);
  assert.equal(fx.toasts.length, 1);
  assert.match(fx.toasts[0], /存档写入未能确认/);
  assert.match(fx.dialog.innerHTML, /data-quest-claim="[^"]*"(?![^>]*disabled)/);
  assert(fx.saves.length >= 2, 'compensating save attempted');
  assert.equal(fx.refreshes.length, 0);
});

test('quest claim awaiting flush suppresses stale UI after disposal or library replacement', async (t) => {
  for (const stale of ['disposed', 'replaced']) {
    const fx = createQuestUiFixture(t);
    const gate = Promise.withResolvers();
    fx.context.storage.flush = () => gate.promise;
    const goldBefore = fx.lib.inventory.gold;

    fx.component.open(fx.quest.id);
    const pending = fx.click('[data-quest-claim]', { questClaim: fx.quest.id });
    await new Promise((resolve) => setImmediate(resolve));
    const htmlBefore = fx.dialog.innerHTML;

    if (stale === 'disposed') fx.context.session.runtime.disposed = true;
    else fx.context.session.ai.library = newLibrary();

    gate.resolve();
    await pending;

    assert.equal(fx.dialog.innerHTML, htmlBefore, `${stale}: dialog not repainted`);
    assert.equal(fx.banner.hidden, true, `${stale}: banner stays hidden`);
    assert.equal(fx.toasts.length, 0, `${stale}: no toast`);
    assert.equal(fx.refreshes.length, 0, `${stale}: no daily refresh`);
    assert.equal(fx.lib.inventory.gold, goldBefore, `${stale}: no currency granted`);
    assert.equal(fx.quest.status, 'active', `${stale}: quest stays active`);
  }
});
