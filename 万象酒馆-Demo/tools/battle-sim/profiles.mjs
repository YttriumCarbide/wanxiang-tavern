import { compileRoster, officialCharacter } from '../../src/ai/library.js';
import { assignParty, firstCompanion, newCampaign } from '../../src/campaign.js';
import { joinPandora, recordSettlement } from '../../src/companion-events.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { buyItem, ITEMS } from '../../src/content/items.js';
import { INGREDIENTS, MEAL_FOODS } from '../../src/content/dining.js';
import { buyIngredient, diningState, finishMeal, mealCost, prepareMeal } from '../../src/dining.js';
import { EMBLEM_ID, equipEmblem, OVERLOAD_EMBLEM_ID } from '../../src/emblems.js';
import {
  equip,
  grantEquipment,
  hashSeed,
  materializeEquipment,
  normalizeEquipment,
} from '../../src/equipment.js';
import { encounterLevel } from '../../src/enemy-growth.js';
import { newExploration, unlockDungeonMap } from '../../src/exploration.js';
import { restoreGrowth } from '../../src/growth.js';
import { claimBattleRewards } from '../../src/rewards.js';

export const PROFILES = Object.freeze({
  novice: Object.freeze({ policy: 'conservative', memberCount: 3, supplyCap: 1 }),
  standard: Object.freeze({ policy: 'balanced', memberCount: 6, supplyCap: 2 }),
  high: Object.freeze({ policy: 'aggressive', memberCount: 6, supplyCap: 3 }),
});

const ALIASES = Object.freeze({
  newcomer: 'novice',
  low: 'novice',
  beginner: 'novice',
  optimized: 'high',
  advanced: 'high',
});

export function profileName(key) {
  return Object.hasOwn(PROFILES, key) ? key : ALIASES[key];
}

export function rngFor(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createCareer(seed) {
  const library = newCampaign(defaultProtagonist());
  library.exploration = newExploration(seed);
  library.dining.seed = hashSeed(`${seed}:dining`);
  unlockDungeonMap(library, 'mill');
  return library;
}

function addOfficial(library, archetype, slot) {
  const member = officialCharacter(archetype);
  if (!library.characters.some((entry) => entry.id === member.id)) library.characters.push(member);
  assignParty(library, slot, member.id);
}

export function fillRear(library, profile) {
  if (PROFILES[profile].memberCount === 3 || !library.progression.pandoraJoined) return;
  if (!library.party[4]) addOfficial(library, 'morrow', 4);
  if (!library.party[5]) addOfficial(library, 'vesper', 5);
}

function equipmentDesign(profile, category, role) {
  const support = role === 'aegis' || role === 'edith';
  if (profile === 'standard') {
    if (category === 'armor') return { statFocus: ['hp', 'mp'], rules: [] };
    return { statFocus: support ? ['mp', 'attack'] : ['attack', 'skillDamage'], rules: [] };
  }
  if (category === 'armor') {
    return {
      statFocus: ['hp', 'mp'],
      rules: [
        {
          mode: 'event',
          event: 'battleStart',
          target: 'self',
          effects: [{ type: 'shield', power: 'high' }],
        },
      ],
    };
  }
  if (category === 'pendant') {
    return {
      statFocus: ['manaCost', 'mp', 'hp'],
      rules: [
        {
          mode: 'event',
          event: 'manaSpent',
          target: 'self',
          effects: [{ type: 'mana', power: 'high' }],
        },
      ],
    };
  }
  return {
    statFocus: support ? ['limit', 'mp', 'attack'] : ['limit', 'attack', 'skillDamage'],
    rules: [
      {
        mode: 'event',
        event: 'afterAttack',
        target: 'self',
        effects: [{ type: 'buff', buff: 'strength', power: 'high' }],
      },
    ],
  };
}

function bestRoll(design, level, quality, seed, count) {
  let best = null;
  for (let index = 0; index < count; index++) {
    const candidate = materializeEquipment({
      design,
      level,
      quality,
      seed: hashSeed(`${seed}:${index}`),
    });
    if (!best || candidate.rollPercent > best.rollPercent) best = candidate;
  }
  return best;
}

function normalizeSimulationEquipment(roll, raw, source) {
  const candidate = { ...raw, stats: { ...(raw.stats || {}) } };
  const trimOrder = ['hp', 'mp', 'skillDamage', 'attack'];
  for (let attempt = 0; attempt < 256; attempt++) {
    try {
      return normalizeEquipment(candidate, source);
    } catch (error) {
      if (!String(error?.message || '').startsWith('装备超过原物品的以太强度预算')) throw error;
      const key = trimOrder.find(
        (stat) => Number.isInteger(candidate.stats[stat]) && candidate.stats[stat] > 1,
      );
      if (!key) throw error;
      candidate.stats[key] -= 1;
    }
  }
  throw Error(`仿真装备预算修剪未收敛：${roll?.quality || 'unknown'}`);
}

function furnishEquipment(library, profile, level, seed, early) {
  if (profile === 'novice') return;
  const enhanced = profile === 'high';
  const quality = enhanced ? 'legendary' : early ? 'common' : 'rare';
  const categories = enhanced ? ['weapon', 'armor', 'pendant'] : ['weapon', 'armor'];
  for (const [position, memberId] of library.party.entries()) {
    if (!memberId || (!enhanced && position >= 3)) continue;
    const member = library.characters.find((entry) => entry.id === memberId);
    for (const [slot, category] of categories.entries()) {
      const id = `sim-${profile}-${position}-${category}`;
      const design = equipmentDesign(profile, category, member.archetype);
      const roll = bestRoll(design, level, quality, `${seed}:${id}`, enhanced ? 4 : 1);
      const name = `SIM ${position + 1} ${category}`;
      library.equipment.catalog.push(
        normalizeSimulationEquipment(
          roll,
          { ...roll, name, description: roll.description, category, design },
          { id, value: 40, name, category },
        ),
      );
      grantEquipment(library, id, id, { level, quality, seed: roll.seed });
      equip(library, memberId, slot, id);
    }
  }
}

export function createCohort(seed, profile, entry, { heroLevel: requestedHeroLevel } = {}) {
  if (
    requestedHeroLevel !== undefined &&
    (!Number.isInteger(requestedHeroLevel) || requestedHeroLevel < 1 || requestedHeroLevel > 99)
  ) {
    throw Error(`无效的角色等级覆盖：${requestedHeroLevel}`);
  }
  const library = createCareer(seed);
  const level = encounterLevel(entry);
  if (entry.tutorial) {
    if (requestedHeroLevel !== undefined) {
      for (const member of library.characters) {
        member.growth = restoreGrowth({ ...member.growth, level: requestedHeroLevel }, member.id);
      }
    }
    return library;
  }

  unlockDungeonMap(library, entry.map);
  const early = entry.map === 'mill' && entry.sequence <= 1;
  const priorSettlements = early ? Math.max(1, entry.sequence) : 2;
  for (let i = 0; i < priorSettlements; i++) recordSettlement(library, `cohort-fixture:${i}`);
  library.campaign.completed = true;
  library.campaign.tutorial = 'done';
  claimBattleRewards(library, 'cohort-fixture', {
    summonContracts: 1,
    gold: profile === 'novice' ? 18 : profile === 'standard' ? 100 : 300,
  });
  firstCompanion(library);
  if (!early) joinPandora(library);
  if (profile !== 'novice') fillRear(library, profile);
  else if (library.progression.pandoraJoined) assignParty(library, 3, null);
  library.campaign.tutorial = 'done';

  const heroLevel =
    requestedHeroLevel ??
    Math.max(1, Math.min(99, level + { novice: -3, standard: -1, high: 3 }[profile]));
  for (const member of library.characters) {
    member.growth = restoreGrowth(
      {
        ...member.growth,
        level: heroLevel,
        rarity: profile === 'high' ? 'legendary' : member.growth.rarity,
      },
      member.id,
    );
  }

  const priorRing = entry.map !== 'mill' || entry.sequence > 0;
  if (priorRing) {
    library.emblems.push(EMBLEM_ID);
    equipEmblem(library, library.campaign.protagonistId, EMBLEM_ID);
    library.progression.corridorRingAcquired = true;
    library.progression.emblemLesson = 'done';
  }
  if (profile === 'high' && level >= 22 && !(entry.map === 'ruins' && entry.sequence === 2)) {
    library.emblems.push(OVERLOAD_EMBLEM_ID);
    equipEmblem(library, library.party[1], OVERLOAD_EMBLEM_ID);
  }

  furnishEquipment(library, profile, heroLevel, `${seed}:${entry.id}`, early);
  if (profile !== 'novice') {
    library.dining.inventory.bread = 2;
    library.dining.inventory.cheese = 1;
    if (profile === 'high') library.dining.inventory.milk = 1;
  }
  return library;
}

export function restock(library, profile) {
  if (!library.campaign.completed) return;
  const { supplyCap } = PROFILES[profile];
  const ids =
    profile === 'novice' ? ['health-potion'] : ['health-potion', 'mana-potion', 'slow-potion'];
  if (profile === 'high') ids.push('strength-potion', 'recovery-potion');
  for (const id of ids) {
    const limit = id === 'slow-potion' ? 1 : supplyCap;
    for (
      let count = library.inventory.items[id];
      count < limit && library.inventory.gold >= ITEMS[id].price;
      count++
    ) {
      buyItem(library, id);
    }
  }
}

export function orderMeal(library, profile) {
  if (profile === 'novice' || !library.campaign.completed) return null;
  const dining = diningState(library);
  const menus = [['cheese-board'], ['cheese'], ['bread']];
  if (profile === 'high') menus.unshift(['cheese-board', 'milk']);
  for (const foods of menus) {
    if (foods.some((id) => !MEAL_FOODS[id])) continue;
    const cost = mealCost(foods);
    if (
      Object.entries(cost).some(
        ([id, count]) =>
          (dining.inventory[id] || 0) + (dining.stock.find((item) => item.id === id)?.left || 0) <
          count,
      )
    )
      continue;
    if (Object.entries(cost).some(([id, count]) => (dining.inventory[id] || 0) < count)) {
      const missing = Object.entries(cost).flatMap(([id, count]) =>
        Array(Math.max(0, count - dining.inventory[id])).fill(id),
      );
      const price = missing.reduce((total, id) => total + INGREDIENTS[id].price, 0);
      if (price > library.inventory.gold) continue;
      for (const id of missing) buyIngredient(library, id);
    }
    prepareMeal(
      library,
      library.party.slice(0, 3).filter(Boolean),
      foods,
      profile === 'high' ? 'excellent' : 'ordinary',
    );
    return finishMeal(library);
  }
  return null;
}

export function partySnapshot(library) {
  return library.party.map((id) => {
    if (!id) return null;
    const member = library.characters.find((entry) => entry.id === id);
    return { id, level: member.growth.level, emblem: member.emblemId || null };
  });
}

export function equipmentSnapshot(library) {
  const equipped = new Set(library.characters.flatMap((member) => member.equipment || []));
  return library.equipment.owned
    .filter((entry) => equipped.has(entry.id))
    .map(({ id, level, quality, seed, stats, rules }) => ({
      id,
      level,
      quality,
      seed,
      stats,
      rules,
    }));
}

export { compileRoster };
