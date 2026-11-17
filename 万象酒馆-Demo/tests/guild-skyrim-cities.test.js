import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { BASE_WORLDS, EMPIRE_TRANSITION_DUNGEONS } from '../src/worlds.js';
import { IMPERIAL_EXTRA_DUNGEONS } from '../src/content/imperial-network.js';
import { REGIONS } from '../src/content/regions.js';
import { encounterLevel } from '../src/enemy-growth.js';
import { explorationSpec, unlockDungeonMap } from '../src/exploration.js';
import { CITY_BLUEPRINTS, buildBlueprintSvg } from '../src/content/city-blueprints.js';
import { buildCitySubmapData } from '../src/exploration/city-submap.js';
import {
  GUILD_BOUNTIES,
  GUILD_SUPPLIES,
  GUILD_TRIALS,
  acceptGuildBounty,
  buyGuildSupply,
  claimGuildBountyReward,
  guildIntelList,
  guildRankInfo,
  isBountyReadyToClaim,
  recordGuildCombatProgress,
  recordGuildSparringWin,
  unlockGuildIntel,
} from '../src/guild.js';

test('city parchment SVG blueprints render architectural layers and Guild Halls for all three hubs', () => {
  for (const sceneId of ['street', 'road-capital', 'eternal-city']) {
    const submap = buildCitySubmapData(sceneId);
    assert(submap && submap.blueprint);
    assert(submap.nodes.some((node) => node.action === 'guild' && node.id === 'guild-hall'));
    const svg = buildBlueprintSvg(CITY_BLUEPRINTS[submap.region]);
    assert.match(svg, /city-vellum-/);
    assert.match(svg, /stroke="#79523a"/);
    assert.match(svg, /fill="#8f5d40"/);
  }
});

test('empire transition dungeons cover low, mid, and high tiers cleanly using existing biomes', () => {
  assert.deepEqual([...BASE_WORLDS], ['ruins', 'forest', 'frost', 'forge', 'tide']);
  assert.equal(EMPIRE_TRANSITION_DUNGEONS.length, 6);
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

test('adventurers guild bounties, intel, quartermaster supplies, and sparring trials integrate with quests', () => {
  const lib = newLibrary();
  lib.inventory.gold = 300;
  assert.equal(guildRankInfo(lib.guild.merit).current.rank, 'E');

  const firstBounty = GUILD_BOUNTIES[0];
  const accepted = acceptGuildBounty(lib, firstBounty.id);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.quest.type, 'bounty');
  assert.equal(accepted.quest.status, 'active');
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
  assert(intelBefore.length === 11);
  const dossier = unlockGuildIntel(lib, 'moss-hollow');
  assert.equal(dossier.ok, true);
  assert.equal(lib.guild.unlockedIntel.includes('moss-hollow'), true);

  const bought = buyGuildSupply(lib, GUILD_SUPPLIES[0].id);
  assert.equal(bought.ok, true);
  assert((lib.inventory.items[GUILD_SUPPLIES[0].itemId] || 0) >= 1);

  const spar = recordGuildSparringWin(lib, GUILD_TRIALS[0]);
  assert(spar.merit > 0 && lib.guild.sparringWins === 1);

  const restored = restoreLibrary(JSON.parse(JSON.stringify(lib)));
  assert.equal(restored.guild.completedBounties, 1);
  assert.equal(restored.guild.sparringWins, 1);
  assert(restored.guild.unlockedIntel.includes('moss-hollow'));
  assert(restored.tavernQuests.some((q) => q.id === accepted.quest.id && q.status === 'completed'));
});
