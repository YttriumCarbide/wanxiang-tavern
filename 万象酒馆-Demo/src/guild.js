import { IMPERIAL_DUNGEONS } from './content/imperial-network.js';
import { REGIONS } from './content/regions.js';
import { ITEMS, restoreBag } from './content/items.js';
import { createBountyQuest } from './tavern-quests.js';
import { LEARNABLE_SKILLS, LEARNABLE_SKILL_CATEGORIES } from './content/learnable-skills.js';
import { learnUniversalSkill, restoreLearnedSkills } from './learnable-skills.js';

export const GUILD_RANKS = Object.freeze([
  Object.freeze({ rank: 'E', title: '铁章新锐', minMerit: 0, discount: 0, bonusPct: 0 }),
  Object.freeze({ rank: 'D', title: '铜星旅人', minMerit: 100, discount: 0.05, bonusPct: 10 }),
  Object.freeze({ rank: 'C', title: '银月执剑', minMerit: 280, discount: 0.1, bonusPct: 20 }),
  Object.freeze({ rank: 'B', title: '辉金精锐', minMerit: 580, discount: 0.15, bonusPct: 30 }),
  Object.freeze({ rank: 'A', title: '秘银协理', minMerit: 1000, discount: 0.2, bonusPct: 45 }),
  Object.freeze({ rank: 'S', title: '星冠传奇', minMerit: 1600, discount: 0.25, bonusPct: 60 }),
]);

export const GUILD_BOUNTIES = Object.freeze([
  Object.freeze({
    id: 'bounty-mill-vermin',
    rank: 'E',
    tier: '低阶',
    title: '绿蕨磨坊 · 水渠清鼠',
    description: '星钟城外近郊绿蕨磨坊鼠患泛滥并频出齿轮响动，先清剿外围水渠与篱笆鼠巢。',
    level: 2,
    targetKind: 'dungeon',
    targetMaps: Object.freeze(['mill']),
    objectiveLabel: '完成绿蕨磨坊任意路线节点，含首领战，共 1 次',
    targetCount: 1,
    gold: 70,
    ether: 24,
    merit: 60,
  }),
  Object.freeze({
    id: 'bounty-moss-clear',
    rank: 'E',
    tier: '低阶',
    title: '翠苔浅谷 · 兽害清剿',
    description: '星钟城西南浅谷近期魔物滋生，协助驻防猎户清理游荡苔怪，打通新人历练通道。',
    level: 3,
    targetKind: 'dungeon',
    targetMaps: Object.freeze(['moss-hollow']),
    objectiveLabel: '完成翠苔浅谷任意路线节点，含首领战，共 1 次',
    targetCount: 1,
    gold: 75,
    ether: 28,
    merit: 65,
  }),
  Object.freeze({
    id: 'bounty-road-patrol',
    rank: 'E',
    tier: '低阶',
    title: '帝国官道 · 巡逻肃清',
    description: '大地图驿路沿线时有徘徊魔物阻道，击败任意 1 支路上遭遇或巡逻敌群以安行旅。',
    level: 5,
    targetKind: 'any-road',
    targetMaps: Object.freeze(['border-watch']),
    objectiveLabel: '击败大地图游荡敌群或通关断垣戍堡 1 次',
    targetCount: 1,
    gold: 105,
    ether: 36,
    merit: 85,
  }),
  Object.freeze({
    id: 'bounty-ruins-survey',
    rank: 'B',
    tier: '高阶',
    title: '界隙遗迹 · 高地深勘',
    description: '东境野果坡彼端的界隙遗迹地脉躁动加剧，须派老练队伍压制高阶守卫并取回读数。',
    level: 22,
    targetKind: 'dungeon',
    targetMaps: Object.freeze(['ruins']),
    objectiveLabel: '完成界隙遗迹任意路线节点，含首领战，共 1 次',
    targetCount: 1,
    gold: 440,
    ether: 180,
    merit: 310,
  }),
  Object.freeze({
    id: 'bounty-whisper-spores',
    rank: 'C',
    tier: '中阶',
    title: '微光苔林 · 荧光毒瘴',
    description: '微光苔林的菌群浓度异常攀升，深入西境林缘击散孢子簇与瘴泥魔核。',
    level: 11,
    targetKind: 'dungeon',
    targetMaps: Object.freeze(['whisper-grove', 'forest']),
    objectiveLabel: '完成微光苔林或月痕古林任意路线节点，含首领战，共 1 次',
    targetCount: 1,
    gold: 210,
    ether: 80,
    merit: 150,
  }),
  Object.freeze({
    id: 'bounty-cistern-check',
    rank: 'B',
    tier: '中阶',
    title: '旧都水窖 · 防线复核',
    description: '银冠城北麓旧水窖与霜晶矿窟防卫机关双双报警，协理高阶探险队前往镇压。',
    level: 16,
    targetKind: 'dungeon',
    targetMaps: Object.freeze(['silver-cistern', 'frost']),
    objectiveLabel: '完成旧都水窖或霜晶矿窟任意路线节点，含首领战，共 1 次',
    targetCount: 1,
    gold: 310,
    ether: 120,
    merit: 220,
  }),
  Object.freeze({
    id: 'bounty-ash-expedition',
    rank: 'A',
    tier: '高阶',
    title: '东境炽渊 · 古窑与星殿',
    description: '应对灰烬古窑、余烬铸坊乃至星陨古坛的高烈度异动，确保帝国东境防线无虞。',
    level: 22,
    targetKind: 'dungeon',
    targetMaps: Object.freeze(['ash-foundry', 'forge', 'astral-sanctum', 'tide']),
    objectiveLabel: '完成任一指定高阶副本的路线节点，含首领战，共 1 次',
    targetCount: 1,
    gold: 480,
    ether: 200,
    merit: 340,
  }),
]);

export const GUILD_SUPPLIES = Object.freeze([
  Object.freeze({
    id: 'supply-hp',
    kind: 'item',
    itemId: 'health-potion',
    qty: 1,
    price: 20,
    name: ITEMS['health-potion'].name,
    desc: ITEMS['health-potion'].text,
  }),
  Object.freeze({
    id: 'supply-mp',
    kind: 'item',
    itemId: 'mana-potion',
    qty: 1,
    price: 20,
    name: ITEMS['mana-potion'].name,
    desc: ITEMS['mana-potion'].text,
  }),
  Object.freeze({
    id: 'supply-fine-hp',
    kind: 'item',
    itemId: 'fine-health-potion',
    qty: 1,
    price: 40,
    name: ITEMS['fine-health-potion'].name,
    desc: ITEMS['fine-health-potion'].text,
  }),
  Object.freeze({
    id: 'supply-str',
    kind: 'item',
    itemId: 'strength-potion',
    qty: 1,
    price: 30,
    name: ITEMS['strength-potion'].name,
    desc: ITEMS['strength-potion'].text,
  }),
  Object.freeze({
    id: 'supply-ether',
    kind: 'ether',
    qty: 20,
    price: 85,
    name: '封存以太晶瓶',
    desc: '立即补充 20 点以太储备，用于酒馆工坊或角色突破。',
  }),
]);

export const GUILD_TRIALS = Object.freeze([
  Object.freeze({
    id: 'trial-novice',
    name: '公会初阶合练',
    level: 4,
    tier: 'E 级模拟',
    description: '不耗精力也无需 API，与公会驯化魔偶及浅谷拟态体切磋磨合阵容连携。',
    enemyIds: Object.freeze(['mossSlime', 'sprout', 'pebble']),
    merit: 18,
    gold: 25,
  }),
  Object.freeze({
    id: 'trial-adept',
    name: '银月小队演武',
    level: 11,
    tier: 'C 级演练',
    description: '模拟帝国中游战区协同攻防，检验奶妈、护盾与集火破防节奏。',
    enemyIds: Object.freeze(['hound', 'warden', 'livingVine']),
    merit: 40,
    gold: 60,
  }),
  Object.freeze({
    id: 'trial-master',
    name: '高阶战术对抗演习',
    level: 19,
    tier: 'A 级高压',
    description: '面对高阶魔导核心与铁卫防线的高压模拟演习，胜出可获大额功勋。',
    enemyIds: Object.freeze(['cinderImp', 'hollowSentry', 'hexer']),
    merit: 75,
    gold: 120,
  }),
]);

export function newGuildState() {
  return {
    merit: 0,
    completedBounties: 0,
    sparringWins: 0,
    unlockedIntel: [],
  };
}

export function restoreGuildState(value) {
  const base = newGuildState();
  if (!value || typeof value !== 'object') return base;
  const merit =
    Number.isSafeInteger(value.merit) && value.merit >= 0 ? Math.min(9999999, value.merit) : 0;
  const completedBounties =
    Number.isSafeInteger(value.completedBounties) && value.completedBounties >= 0
      ? Math.min(99999, value.completedBounties)
      : 0;
  const sparringWins =
    Number.isSafeInteger(value.sparringWins) && value.sparringWins >= 0
      ? Math.min(99999, value.sparringWins)
      : 0;
  const validDungeonIds = new Set(IMPERIAL_DUNGEONS.map((d) => d.id));
  const unlockedIntel = Array.isArray(value.unlockedIntel)
    ? [...new Set(value.unlockedIntel.filter((id) => validDungeonIds.has(id)))]
    : [];
  return { merit, completedBounties, sparringWins, unlockedIntel };
}

export function guildRankInfo(merit = 0) {
  const currentMerit = Math.max(0, Number(merit) || 0);
  let currentIndex = 0;
  for (let i = 0; i < GUILD_RANKS.length; i++) {
    if (currentMerit >= GUILD_RANKS[i].minMerit) currentIndex = i;
  }
  const current = GUILD_RANKS[currentIndex];
  const next = GUILD_RANKS[currentIndex + 1] || null;
  const pct = next
    ? Math.min(
        100,
        Math.round(((currentMerit - current.minMerit) / (next.minMerit - current.minMerit)) * 100),
      )
    : 100;
  return { current, next, currentMerit, pct };
}

export function supplyCostForLibrary(library, supply) {
  const rank = guildRankInfo(library?.guild?.merit || 0).current;
  return Math.max(10, Math.round(supply.price * (1 - rank.discount)));
}

export function buyGuildSupply(library, supplyId) {
  if (!library) return { ok: false, reason: '存档未就绪' };
  const supply = GUILD_SUPPLIES.find((entry) => entry.id === supplyId);
  if (!supply) return { ok: false, reason: '补给品不存在' };
  const cost = supplyCostForLibrary(library, supply);
  const gold = library.inventory?.gold || 0;
  if (gold < cost) return { ok: false, reason: `金币不足（需要 ${cost} 金币）` };
  library.inventory.gold -= cost;
  if (supply.kind === 'item') {
    library.inventory.items = restoreBag(library.inventory.items);
    library.inventory.items[supply.itemId] = Math.min(
      9999,
      (library.inventory.items[supply.itemId] || 0) + supply.qty,
    );
    library.inventory.bagUnlocked = true;
  } else if (supply.kind === 'ether') {
    library.inventory.ether = Math.min(999999999, (library.inventory.ether || 0) + supply.qty);
  }
  return { ok: true, cost, supply };
}

export function guildIntelList(library) {
  const unlocked = new Set(library?.guild?.unlockedIntel || []);
  const visited = new Set(library?.unlockedDungeons || []);
  return [...IMPERIAL_DUNGEONS]
    .sort((a, b) => a.level - b.level)
    .map((dungeon) => {
      const region = REGIONS[dungeon.id] || {};
      const cost = 20 + Math.floor(dungeon.level / 5) * 15;
      return {
        id: dungeon.id,
        name: dungeon.name,
        tier: dungeon.tier || region.tier || '常规',
        level: dungeon.level,
        biome: dungeon.biome || region.biome || dungeon.id,
        boss: region.boss || null,
        hookTitle: region.taskHooks?.[0]?.title || '',
        hookDesc: region.taskHooks?.[0]?.description || region.description || '',
        bossName: region.taskHooks?.[0]?.bossName || '',
        enemies: dungeon.enemyIds || region.enemies || [],
        unlocked: unlocked.has(dungeon.id),
        visitedOnMap: visited.has(dungeon.id),
        cost,
      };
    });
}

export function unlockGuildIntel(library, dungeonId) {
  if (!library) return { ok: false, reason: '存档未就绪' };
  library.guild = restoreGuildState(library.guild);
  const item = guildIntelList(library).find((entry) => entry.id === dungeonId);
  if (!item) return { ok: false, reason: '情报条目不存在' };
  if (item.unlocked) return { ok: true, already: true, item };
  if ((library.inventory?.gold || 0) < item.cost) {
    return { ok: false, reason: `金币不足（查阅卷宗需 ${item.cost} 金币）` };
  }
  library.inventory.gold -= item.cost;
  library.guild.unlockedIntel.push(dungeonId);
  return { ok: true, cost: item.cost, item: { ...item, unlocked: true } };
}

export function acceptGuildBounty(library, bountyId) {
  if (!library) return { ok: false, reason: '存档未就绪' };
  const spec = GUILD_BOUNTIES.find((entry) => entry.id === bountyId);
  if (!spec) return { ok: false, reason: '悬赏令不存在' };
  const quests = (library.tavernQuests ||= []);
  const existing = quests.find((entry) => entry.bountyId === spec.id);
  if (existing && existing.status === 'active') {
    return { ok: false, reason: '该悬赏已在委托名录中' };
  }
  const quest = createBountyQuest(spec);
  if (existing && existing.status === 'completed') {
    const idx = quests.indexOf(existing);
    quests[idx] = quest;
  } else {
    quests.push(quest);
  }
  return { ok: true, quest };
}

export function isBountyReadyToClaim(quest) {
  if (!quest || quest.type !== 'bounty' || quest.claimed || quest.status === 'completed') {
    return false;
  }
  return (
    Array.isArray(quest.objectives) &&
    quest.objectives.length > 0 &&
    quest.objectives.every((obj) => (obj.current || 0) >= (obj.target || 1))
  );
}

export function recordGuildCombatProgress(library, { kind, map } = {}) {
  if (!library) return { updatedQuests: [], readyQuests: [], passiveMerit: 0 };
  library.guild = restoreGuildState(library.guild);
  const passiveMerit = kind === 'dungeon' ? 12 : kind === 'skirmish' ? 8 : 0;
  if (passiveMerit > 0) library.guild.merit += passiveMerit;

  const updatedQuests = [];
  const readyQuests = [];
  for (const quest of library.tavernQuests || []) {
    if (quest.type !== 'bounty' || quest.status !== 'active') continue;
    const matchesDungeon =
      kind === 'dungeon' && (!quest.targetMaps?.length || quest.targetMaps.includes(map));
    const matchesRoad =
      quest.targetKind === 'any-road' &&
      (kind === 'skirmish' || (kind === 'dungeon' && quest.targetMaps?.includes(map)));
    if (!matchesDungeon && !matchesRoad) continue;
    let changed = false;
    for (const obj of quest.objectives || []) {
      if ((obj.current || 0) < (obj.target || 1)) {
        obj.current = Math.min(obj.target || 1, (obj.current || 0) + 1);
        changed = true;
      }
    }
    if (changed) {
      updatedQuests.push(quest);
      if (isBountyReadyToClaim(quest)) readyQuests.push(quest);
    }
  }
  return { updatedQuests, readyQuests, passiveMerit };
}

export function claimGuildBountyReward(library, questOrBountyId) {
  if (!library) return { ok: false, reason: '存档未就绪' };
  library.guild = restoreGuildState(library.guild);
  const quest = (library.tavernQuests || []).find(
    (entry) => entry.id === questOrBountyId || entry.bountyId === questOrBountyId,
  );
  if (!quest || !isBountyReadyToClaim(quest)) {
    return { ok: false, reason: '悬赏目标尚未达成或已领奖' };
  }
  const beforeRank = guildRankInfo(library.guild.merit).current.rank;
  const bonusPct = guildRankInfo(library.guild.merit).current.bonusPct || 0;
  const scale = 1 + bonusPct / 100;
  const gold = Math.round((quest.rewards?.gold || 0) * scale);
  const ether = Math.round((quest.rewards?.ether || 0) * scale);
  const merit = quest.rewards?.merit || 0;

  library.inventory.gold = Math.min(999999999, (library.inventory?.gold || 0) + gold);
  library.inventory.ether = Math.min(999999999, (library.inventory?.ether || 0) + ether);
  library.guild.merit += merit;
  library.guild.completedBounties += 1;
  quest.status = 'completed';
  quest.claimed = true;
  const afterRank = guildRankInfo(library.guild.merit).current;
  return {
    ok: true,
    quest,
    rewards: { gold, ether, merit },
    rankedUp: afterRank.rank !== beforeRank ? afterRank : null,
  };
}

export function recordGuildSparringWin(library, trial) {
  if (!library) return { merit: 0, gold: 0, rankedUp: null };
  library.guild = restoreGuildState(library.guild);
  const beforeRank = guildRankInfo(library.guild.merit).current.rank;
  const merit = trial?.merit || 15;
  const gold = trial?.gold || 20;
  library.guild.merit += merit;
  library.guild.sparringWins += 1;
  library.inventory.gold = Math.min(999999999, (library.inventory?.gold || 0) + gold);
  const afterRank = guildRankInfo(library.guild.merit).current;
  return { merit, gold, rankedUp: afterRank.rank !== beforeRank ? afterRank : null };
}

export function guildSkillCatalog(library) {
  const guildState = restoreGuildState(library?.guild);
  const rank = guildRankInfo(guildState.merit).current;
  const learnedSet = new Set(restoreLearnedSkills(library?.learnedSkills));
  return LEARNABLE_SKILLS.map((skill) => ({
    ...skill,
    categoryLabel: LEARNABLE_SKILL_CATEGORIES[skill.category] || skill.category,
    learned: learnedSet.has(skill.id),
    unlockedByMerit: guildState.merit >= (skill.meritReq || 0),
    discountedCost:
      skill.price > 0 ? Math.max(1, Math.round(skill.price * (1 - rank.discount))) : 0,
  }));
}

export function buyGuildSkillManual(library, skillId) {
  if (!library) return { ok: false, reason: '存档未就绪' };
  library.guild = restoreGuildState(library.guild);
  library.learnedSkills = restoreLearnedSkills(library.learnedSkills);
  const item = guildSkillCatalog(library).find((entry) => entry.id === skillId);
  if (!item) return { ok: false, reason: '未知的战技秘籍' };
  if (item.learned) return { ok: false, reason: '已研习该通用战技' };
  if (!item.unlockedByMerit) {
    return { ok: false, reason: `需要公会功勋达到 ${item.meritReq} 后方可研习` };
  }
  const cost = item.discountedCost;
  const gold = library.inventory?.gold || 0;
  if (gold < cost) return { ok: false, reason: `金币不足（需要 ${cost} 金币）` };
  library.inventory.gold = gold - cost;
  learnUniversalSkill(library, skillId);
  return { ok: true, skill: item, cost };
}
