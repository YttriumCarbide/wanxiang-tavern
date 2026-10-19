import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ITEMS, buyItem } from '../src/content/items.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { newBattle, preview, makeAction, makeItem, makeSwap } from '../src/engine.js';
import {
  claimKillExperience,
  claimCompletionExperience,
  gainExperience,
  grownCombat,
  restoreGrowth,
  xpToNext,
  applyEncounterGrowth,
} from '../src/growth.js';
import {
  relevantArchives,
  archiveMilestone,
  itemConflicts,
  resolveItemConflict,
  resolveItemReferences,
  settleEther,
} from '../src/archives.js';
import { readGenerationResult } from '../server/generation-result.mjs';
import { chatInput } from '../server/chat-request.mjs';
import { restoreLibrary } from '../src/ai/library.js';
import { compactCharacterDocument } from './fixtures/ai.js';
import { createCharacterReader } from '../server/character-reader.mjs';

test('twelve supplies have real 64px icons and purchases persist atomically without spending ether', async () => {
  const library = newCampaign(defaultProtagonist());
  library.inventory.gold = 1000;
  library.inventory.ether = 100;
  assert.equal(Object.keys(ITEMS).length, 12);
  for (const item of Object.values(ITEMS)) {
    assert.match(
      await readFile(new URL('../' + item.icon, import.meta.url), 'utf8'),
      /width="64" height="64"/,
    );
    const before = library.inventory.gold;
    assert(buyItem(library, item.id).ok);
    assert.equal(library.inventory.gold, before - item.price);
    assert.equal(library.inventory.items[item.id], 1);
  }
  assert.equal(library.inventory.ether, 100);
  library.inventory.gold = 0;
  const snapshot = structuredClone(library.inventory);
  assert(!buyItem(library, 'mana-potion').ok);
  assert.deepEqual(library.inventory, snapshot);
  assert.deepEqual(restoreLibrary(library).inventory, snapshot);
});

test('bleeding resolves before actions and lethal bleeding prevents damage, healing, cost and swaps', () => {
  const state = newBattle(['mossSlime']);
  state.units.aegis.hp = 2;
  state.units.aegis.buffs.bleed = 3;
  const result = preview(state, [makeAction(state, 'aegis', 'bastion', 'mossSlime', 0)]);
  assert(result.valid);
  assert.equal(result.final.units.mossSlime.hp, state.units.mossSlime.hp);
  assert.equal(result.final.units.aegis.mp, state.units.aegis.mp);
  assert(
    result.events.some(
      (event) =>
        event.type === 'status' && event.statusTriggers.some((trigger) => trigger.type === 'bleed'),
    ),
  );
  assert(!result.events.some((event) => event.type === 'hero'));
  state.phase = 'plan';
  state.round = 1;
  state.units.aegis.hp = 48;
  state.units.aegis.buffs = {};
  state.units.mossSlime.hp = 2;
  state.units.mossSlime.buffs.bleed = 3;
  const enemy = preview(state, []);
  assert.equal(enemy.final.units.aegis.hp, state.units.aegis.hp);
  assert(!enemy.events.some((event) => event.type === 'enemy'));
  state.units.aegis.hp = 0;
  const replacement = preview(state, [makeSwap('serin', 0, 0)]);
  assert(replacement.valid);
  assert.equal(replacement.final.formation[0], 'serin');
  state.units.aegis.hp = 2;
  state.units.aegis.buffs.bleed = 3;
  const cancelled = preview(state, [makeSwap('serin', 0, 0)]);
  assert.equal(cancelled.final.formation[0], 'aegis');
});

test('normal and fine supply effects use the exact same event preview as playback', () => {
  const state = newBattle(['warden']);
  state.units.aegis.hp = 10;
  state.units.aegis.mp = 0;
  for (const item of Object.values(ITEMS)) {
    state.items[item.id] = 1;
    const target = item.target === 'enemy' ? 'warden' : 'aegis';
    const result = preview(state, [makeItem(item.id, target, 0)]);
    assert(result.valid, item.name);
    assert.equal(result.final.items[item.id], 0);
    for (const effect of item.effects) {
      const unit = result.final.units[target];
      if (effect.type === 'buff') assert.equal(unit.buffs[effect.buff], effect.value);
      if (effect.type === 'mana') assert.equal(unit.mp, Math.min(effect.value, unit.maxMp));
      if (effect.type === 'heal') assert.equal(unit.hp, Math.min(10 + effect.value, unit.maxHp));
    }
  }
});

test('growth claims kills and complete bonus once, persists random gains and keeps base definitions unchanged', () => {
  const library = newCampaign(defaultProtagonist());
  const member = library.characters[0];
  const original = structuredClone(member.combat);
  member.growth = restoreGrowth({ rarity: 'legendary' }, member.id);
  const expedition = { id: 'one', boss: 'bossGate', partyIds: library.party.filter(Boolean) };
  const state = {
    encounter: 0,
    units: { mossSlime: { side: 'enemy' }, bossGate: { side: 'enemy' } },
  };
  const first = claimKillExperience(library, expedition, state, {
    deaths: [{ id: 'mossSlime' }, { id: 'bossGate' }],
  });
  assert.equal(first[0].amount, 12);
  assert.equal(first[2].amount, 60);
  assert.equal(
    claimKillExperience(library, expedition, state, { deaths: [{ id: 'mossSlime' }] }).length,
    0,
  );
  claimCompletionExperience(library, expedition);
  const snapshot = structuredClone(member.growth);
  assert.deepEqual(claimCompletionExperience(library, expedition), []);
  assert(snapshot.level >= 2);
  assert(grownCombat(member).hp > original.hp);
  assert.deepEqual(member.combat, original);
  assert.deepEqual(
    restoreLibrary(library).characters.find((entry) => entry.id === member.id).growth,
    snapshot,
  );
  const copy = structuredClone(member);
  const a = gainExperience(member, xpToNext(member.growth.level));
  const b = gainExperience(copy, xpToNext(copy.growth.level));
  assert.deepEqual(a, b);
  const carried = newBattle(['mossSlime'], { aegis: { ...original, id: 'aegis' } });
  carried.units.aegis.hp = 11;
  carried.units.aegis.mp = 3;
  const expeditionGrowth = { carried, heroDefinitions: { aegis: original }, partyIds: [member.id] };
  applyEncounterGrowth(expeditionGrowth, [member]);
  assert.equal(carried.units.aegis.hp, 11 + member.growth.bonus.hp);
  assert.equal(carried.units.aegis.mp, 3 + member.growth.bonus.mp);
  const unchanged = structuredClone(carried);
  applyEncounterGrowth(expeditionGrowth, [member]);
  assert.deepEqual(carried, unchanged);
});

test('map item references resolve only known loot and conflicting values wait for a user choice', () => {
  const library = newCampaign(defaultProtagonist());
  const book = {
    id: 'book',
    title: '遗迹',
    exploration: { map: 'ruins' },
    items: [{ name: '残晶', description: '青色晶体', value: 5, encounter: 0 }],
  };
  archiveMilestone(library, book, { runId: 'old' }, 0);
  const known = relevantArchives(library, '', 'ruins').items;
  assert.equal(known.length, 1);
  assert.equal(relevantArchives(library, '', 'forest').items.length, 0);
  assert.equal(
    resolveItemReferences([{ name: '残晶', reference: true, encounter: 2 }], known)[0].value,
    5,
  );
  assert.throws(() => resolveItemReferences([{ name: '未知', reference: true }], known));
  book.items[0] = { name: '残晶', description: '红色晶体', value: 9, encounter: 0 };
  archiveMilestone(library, book, { runId: 'new' }, 0);
  assert.equal(itemConflicts(library, 'new').length, 1);
  assert.throws(() => settleEther(library, 'new'));
  const id = itemConflicts(library, 'new')[0].id;
  resolveItemConflict(library, id, 'rename-new', '赤色残晶');
  assert.equal(settleEther(library, 'new'), 9);
  assert.equal(settleEther(library, 'new'), 0);
  assert.equal(relevantArchives(library, '', 'ruins').items.length, 2);
  const raw = {
    schemaVersion: 4,
    story: ['一', '二', '三', '四', '五'],
    data: {
      title: '归来',
      tags: [],
      npcs: [],
      items: [{ name: '残晶', encounter: 2 }],
      nextHook: { setting: '' },
    },
  };
  const result = readGenerationResult('script', JSON.stringify(raw), {
    party: [],
    archiveContext: { items: known },
  });
  assert.equal(result.entry.items[0].value, 5);
  raw.data.items = ['残晶'];
  const named = readGenerationResult('script', JSON.stringify(raw), {
    party: [],
    archiveContext: { items: known },
  });
  assert.equal(named.entry.items[0].encounter, 4);
  assert.equal(named.entry.items[0].value, 5);
  const legacy = newCampaign(defaultProtagonist());
  legacy.history.push({ runId: 'old-forest', title: '林地之行', map: 'forest', lines: [] });
  legacy.archives.items.push({
    id: 'legacy-item',
    name: '林晶',
    description: '林地晶体',
    value: 3,
    source: { runId: 'old-forest', encounter: 1 },
  });
  const restored = restoreLibrary(legacy);
  assert.equal(restored.archives.items[0].map, 'forest');
  assert.equal(relevantArchives(restored, '', 'ruins').items.length, 0);
  assert.equal(relevantArchives(restored, '', 'forest').items.length, 1);
});

test('protagonist generation enforces two base actions and stores the same declared rarity across retries', () => {
  const raw = compactCharacterDocument();
  raw.data.limit = 1;
  const input = { purpose: 'protagonist', brief: '旅人', rollId: 'stable-roll' };
  const a = readGenerationResult(
    'character',
    JSON.stringify(raw),
    input,
    createCharacterReader(),
  ).entry;
  const b = readGenerationResult(
    'character',
    JSON.stringify(raw),
    input,
    createCharacterReader(),
  ).entry;
  assert.equal(a.combat.limit, 2);
  assert.deepEqual(a.growth, b.growth);
  assert.equal(newCampaign(defaultProtagonist()).characters[1].combat.limit, 1);
});

test('an unselected character mentioned only in past assistant text does not rejoin the active cast', () => {
  const input = {
    place: 'table',
    text: '接着聊吧',
    selected: ['edith'],
    characters: [
      { id: 'edith', name: '伊蒂丝', worldbook: '资料' },
      { id: 'yuexi', name: '长景月汐', worldbook: '资料' },
    ],
    history: [
      { role: 'assistant', content: '长景月汐坐在桌边。' },
      { role: 'system', content: '长景月汐离开了。' },
    ],
  };
  assert.deepEqual(
    chatInput('chat', input).characters.map((member) => member.id),
    ['edith'],
  );
  input.text = '长景月汐刚才说了什么？';
  assert.equal(chatInput('chat', input).characters.length, 2);
});
