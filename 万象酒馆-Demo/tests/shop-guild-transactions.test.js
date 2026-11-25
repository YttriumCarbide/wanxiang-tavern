import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary } from '../src/ai/library.js';
import { ITEMS } from '../src/content/items.js';
import { diningState, ingredientSalePrice } from '../src/dining.js';
import {
  acceptGuildBounty,
  guildBountyBoard,
  guildIntelList,
  guildSkillCatalog,
} from '../src/guild.js';
import { commitCityTrade } from '../src/app/city-trade.js';

function createContext(lib) {
  const context = {
    session: {
      ai: { library: lib },
      runtime: { mode: 'inn', disposed: false },
    },
    save: () => true,
    flush: () => true,
  };
  context.generation = { save: () => context.save() };
  context.storage = { flush: () => context.flush() };
  return context;
}

function makeReady() {
  const lib = newLibrary();
  lib.inventory.gold = 1000;
  lib.inventory.ether = 0;
  lib.inventory.items = {};
  lib.inventory.bagUnlocked = false;
  lib.guild = lib.guild || {};
  lib.tavernQuests = lib.tavernQuests || [];
  lib.learnedSkills = lib.learnedSkills || [];
  lib.dining = lib.dining || {};
  return lib;
}

test('market ingredient sale persists currency and stock while rejecting invalid sales', async () => {
  const lib = makeReady();
  const dining = diningState(lib);
  dining.inventory.cheese = 2;
  const startingGold = lib.inventory.gold;
  const unitPrice = ingredientSalePrice('cheese');
  const ctx = createContext(lib);
  const sold = await commitCityTrade(ctx, 'ingredientSale', 'cheese');
  assert.equal(sold.ok, true);
  assert.equal(sold.gold, unitPrice);
  assert.equal(lib.inventory.gold, startingGold + unitPrice);
  assert.equal(lib.dining.inventory.cheese, 1);
  ctx.save = () => assert.fail('invalid sales must not touch storage');
  await assert.rejects(commitCityTrade(ctx, 'ingredientSale', 'mana-potion'), /食材不存在/);
  await assert.rejects(commitCityTrade(ctx, 'ingredientSale', 'bread'), /行囊中没有这份食材/);
  lib.inventory.gold = 999_999_998;
  await assert.rejects(commitCityTrade(ctx, 'ingredientSale', 'cheese'), /金币将超过持有上限/);
  assert.equal(lib.dining.inventory.cheese, 1);
});

test('accepting a posted bounty commits tracking to the quest journal', async () => {
  const lib = makeReady();
  lib.tavernQuests.push({ id: 'old-active', type: 'social', status: 'active', tracked: true });
  const ctx = createContext(lib);
  const bounty = guildBountyBoard(lib)[0];
  let savedQuests;
  ctx.save = () => {
    savedQuests = structuredClone(lib.tavernQuests);
    return true;
  };
  const result = await commitCityTrade(ctx, 'accept', bounty.id);
  assert.equal(result.ok, true);
  assert.equal(result.quest.tracked, true);
  assert.equal(lib.tavernQuests.find(({ id }) => id === 'old-active').tracked, false);
  assert.equal(lib.tavernQuests.find(({ id }) => id === result.quest.id).tracked, true);
  assert.deepEqual(savedQuests, lib.tavernQuests);
});

test('gated flush records gold before/after and blocks a concurrent trade', async () => {
  const lib = makeReady();
  const ctx = createContext(lib);
  const item = Object.values(ITEMS)[0];
  const gate = Promise.withResolvers();
  const saves = [];
  let first = true;
  ctx.save = () => {
    saves.push({ gold: lib.inventory.gold });
    if (first) {
      first = false;
      return gate.promise;
    }
    return Promise.resolve();
  };
  ctx.flush = () => Promise.resolve();

  const pending = commitCityTrade(ctx, 'item', item.id);
  await assert.rejects(commitCityTrade(ctx, 'ingredient', 'bread'), /正在保存存档/);
  gate.resolve();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].gold, 1000 - item.price);
  assert.equal(lib.inventory.items[item.id], 1);
});

test('removed guild supply route cannot change an existing bag or charge gold', async () => {
  const lib = makeReady();
  lib.inventory.items['health-potion'] = 2;
  const ctx = createContext(lib);
  ctx.save = () => assert.fail('invalid transaction must never reach storage');
  const inventory = structuredClone(lib.inventory);
  await assert.rejects(commitCityTrade(ctx, 'supply', 'supply-hp'), /未知的交易操作/);
  assert.deepEqual(lib.inventory, inventory);
});

test('each trade action rolls back its own state when flush fails first', async () => {
  const item = Object.values(ITEMS)[0];
  const intel = guildIntelList(makeReady())[0];
  const cases = [
    ['item', item.id],
    ['ingredient', 'bread'],
    ['ingredientSale', 'cheese'],
    ['intel', intel.id],
    ['learn', null],
    ['accept', guildBountyBoard(makeReady())[0].id],
    ['claim', null],
  ];

  for (const [action, id] of cases) {
    const lib = makeReady();
    const ctx = createContext(lib);
    if (action === 'ingredient' || action === 'ingredientSale') {
      const dining = diningState(lib);
      dining.stock = [{ id: 'bread', left: 2 }];
      dining.inventory = dining.inventory || {};
      dining.inventory.cheese = 1;
      dining.tutorial = 'buy';
    }
    let targetId = id;
    if (action === 'learn') {
      const skill = guildSkillCatalog(lib).find(
        ({ learned, unlockedByMerit, discountedCost }) =>
          !learned && unlockedByMerit && discountedCost > 0 && discountedCost <= lib.inventory.gold,
      );
      assert(skill, 'rollback fixture needs an affordable, unlocked, unlearned skill');
      targetId = skill.id;
    }
    if (action === 'accept')
      lib.tavernQuests.push({
        id: 'previous-tracked',
        type: 'social',
        status: 'active',
        tracked: true,
      });
    if (action === 'claim') {
      const accepted = acceptGuildBounty(lib, guildBountyBoard(lib)[0].id);
      for (const objective of accepted.quest.objectives) objective.current = objective.target;
      targetId = accepted.quest.id;
    }

    const refs = {
      inventory: lib.inventory,
      items: lib.inventory.items,
      dining: lib.dining,
      diningInventory: lib.dining?.inventory,
      diningStock: lib.dining?.stock?.[0],
      guild: lib.guild,
      learnedSkills: lib.learnedSkills,
      quests: lib.tavernQuests,
      quest: lib.tavernQuests[0],
    };
    const snapshot = structuredClone({
      gold: lib.inventory.gold,
      ether: lib.inventory.ether,
      items: lib.inventory.items,
      bagUnlocked: lib.inventory.bagUnlocked,
      dining: lib.dining,
      guild: lib.guild,
      learnedSkills: lib.learnedSkills,
      quests: lib.tavernQuests,
    });

    let calls = 0;
    ctx.flush = () => {
      calls++;
      if (action === 'learn') {
        const expectedSkills =
          calls === 1 ? [...snapshot.learnedSkills, targetId] : snapshot.learnedSkills;
        assert.deepEqual(lib.learnedSkills, expectedSkills);
      }
      return calls === 1 ? Promise.reject(new Error('flush failed')) : Promise.resolve();
    };

    await assert.rejects(commitCityTrade(ctx, action, targetId), /flush failed/);
    assert.equal(calls, 2);
    assert.equal(lib.inventory, refs.inventory);
    assert.equal(lib.inventory.items, refs.items);
    assert.equal(lib.dining, refs.dining);
    if (refs.diningInventory) assert.equal(lib.dining.inventory, refs.diningInventory);
    if (refs.diningStock) assert.equal(lib.dining.stock[0], refs.diningStock);
    assert.equal(lib.guild, refs.guild);
    assert.equal(lib.learnedSkills, refs.learnedSkills);
    assert.equal(lib.tavernQuests, refs.quests);
    if (refs.quest) assert.equal(lib.tavernQuests[0], refs.quest);
    assert.deepEqual(
      {
        gold: lib.inventory.gold,
        ether: lib.inventory.ether,
        items: lib.inventory.items,
        bagUnlocked: lib.inventory.bagUnlocked,
        dining: lib.dining,
        guild: lib.guild,
        learnedSkills: lib.learnedSkills,
        quests: lib.tavernQuests,
      },
      snapshot,
    );
  }
});

test('failed save rolls back a ready claim before allowing a later retry', async () => {
  const lib = makeReady();
  const ctx = createContext(lib);
  const accepted = acceptGuildBounty(lib, guildBountyBoard(lib)[0].id);
  for (const objective of accepted.quest.objectives) objective.current = objective.target;
  const quest = accepted.quest;
  const gold = lib.inventory.gold;
  const ether = lib.inventory.ether;
  const merit = lib.guild.merit;
  const completed = lib.guild.completedBounties;
  const claimedBefore = structuredClone(quest);

  let saves = 0;
  ctx.save = () => {
    saves++;
    return saves === 1 ? Promise.resolve(false) : Promise.resolve();
  };
  ctx.flush = () => Promise.resolve();

  await assert.rejects(commitCityTrade(ctx, 'claim', quest.id), /存档保存失败/);
  assert.equal(lib.inventory.gold, gold);
  assert.equal(lib.inventory.ether, ether);
  assert.equal(lib.guild.merit, merit);
  assert.equal(lib.guild.completedBounties, completed);
  assert.deepEqual(quest, claimedBefore);
  assert.equal(saves, 2, 'failed write and compensating rollback are both saved');

  const result = await commitCityTrade(ctx, 'claim', quest.id);
  assert.equal(result.ok, true);
  assert.equal(lib.inventory.gold, gold + result.rewards.gold);
  assert.equal(lib.inventory.ether, ether + result.rewards.ether);
  assert.equal(lib.guild.merit, merit + result.rewards.merit);
  assert.equal(lib.guild.completedBounties, completed + 1);
  assert.equal(quest.status, 'completed');
  assert.equal(quest.claimed, true);
});

test('permanent flush failure rejects fresh transaction without another save', async () => {
  const lib = makeReady();
  const ctx = createContext(lib);
  const item = Object.values(ITEMS)[0];
  let saves = 0;
  ctx.save = () => {
    saves++;
    return Promise.resolve();
  };
  ctx.flush = () => Promise.reject(new Error('flush failed'));

  await assert.rejects(commitCityTrade(ctx, 'item', item.id));
  const writes = saves;
  await assert.rejects(commitCityTrade(ctx, 'item', item.id));
  assert.equal(saves, writes);
});

test('deferred storage durability suppresses early refresh and blocks re-entry', async () => {
  const lib = makeReady();
  const ctx = createContext(lib);
  const item = Object.values(ITEMS)[0];
  const gate = Promise.withResolvers();
  const flushStarted = Promise.withResolvers();
  const saveArgs = [];
  let flushEntries = 0;
  let refreshCount = 0;
  let syncCount = 0;
  ctx.generation.save = (options) => {
    saveArgs.push(options);
    return Promise.resolve(true);
  };
  ctx.flush = () => {
    flushEntries++;
    flushStarted.resolve();
    return gate.promise;
  };
  ctx.summoning = {
    refresh: () => {
      refreshCount++;
    },
  };
  ctx.shell = {
    syncInnVisitors: () => {
      syncCount++;
    },
  };

  const pending = commitCityTrade(ctx, 'item', item.id);
  await flushStarted.promise;
  assert.equal(refreshCount, 0);
  assert.equal(syncCount, 0);
  await assert.rejects(commitCityTrade(ctx, 'item', item.id), /正在保存存档/);
  assert.equal(saveArgs.length, 1);
  assert.equal(flushEntries, 1);

  gate.resolve();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(saveArgs.length, 1);
  assert.deepEqual(saveArgs[0], { refresh: false });
  assert.equal(flushEntries, 1);
  assert.equal(refreshCount, 1);
  assert.equal(syncCount, 1);
});

test('library replacement during pending flush rejects and rolls back original owner', async () => {
  const lib = makeReady();
  const ctx = createContext(lib);
  const item = Object.values(ITEMS)[0];
  const gate = Promise.withResolvers();
  const flushStarted = Promise.withResolvers();
  let refreshCount = 0;
  let syncCount = 0;
  ctx.generation.save = () => Promise.resolve(true);
  ctx.flush = () => {
    flushStarted.resolve();
    return gate.promise;
  };
  ctx.summoning = {
    refresh: () => {
      refreshCount++;
    },
  };
  ctx.shell = {
    syncInnVisitors: () => {
      syncCount++;
    },
  };

  const goldBefore = lib.inventory.gold;
  const itemsBefore = structuredClone(lib.inventory.items);
  const pending = commitCityTrade(ctx, 'item', item.id);
  await flushStarted.promise;

  const replacement = makeReady();
  const replacementGold = replacement.inventory.gold;
  const replacementItems = structuredClone(replacement.inventory.items);
  ctx.session.ai.library = replacement;

  gate.resolve();
  await assert.rejects(pending, /存档状态未能确认|重新载入/);
  assert.equal(lib.inventory.gold, goldBefore);
  assert.deepEqual(lib.inventory.items, itemsBefore);
  assert.equal(replacement.inventory.gold, replacementGold);
  assert.deepEqual(replacement.inventory.items, replacementItems);
  assert.equal(refreshCount, 0);
  assert.equal(syncCount, 0);
  assert.equal(ctx.session.runtime.cityTrade, 'blocked');
});

test('session disposal during pending flush rejects and rolls back trade mutation', async () => {
  const lib = makeReady();
  const ctx = createContext(lib);
  const item = Object.values(ITEMS)[0];
  const gate = Promise.withResolvers();
  const flushStarted = Promise.withResolvers();
  let refreshCount = 0;
  let syncCount = 0;
  ctx.generation.save = () => Promise.resolve(true);
  ctx.flush = () => {
    flushStarted.resolve();
    return gate.promise;
  };
  ctx.summoning = {
    refresh: () => {
      refreshCount++;
    },
  };
  ctx.shell = {
    syncInnVisitors: () => {
      syncCount++;
    },
  };

  const goldBefore = lib.inventory.gold;
  const itemsBefore = structuredClone(lib.inventory.items);
  const pending = commitCityTrade(ctx, 'item', item.id);
  await flushStarted.promise;

  ctx.session.runtime.disposed = true;
  gate.resolve();
  await assert.rejects(pending, /存档状态未能确认|重新载入/);
  assert.equal(lib.inventory.gold, goldBefore);
  assert.deepEqual(lib.inventory.items, itemsBefore);
  assert.equal(refreshCount, 0);
  assert.equal(syncCount, 0);
  assert.equal(ctx.session.runtime.cityTrade, 'blocked');
});
