/** Fire-Emblem-style wild skirmish pools, 3-wave pure-code encounters, and known-route tracking. */
import { DEFINITIONS } from './data.js';
import { INGREDIENTS } from './content/dining.js';
import { rollGemDrop } from './content/gems.js';
import { IMPERIAL_CROSSROADS } from './content/imperial-network.js';
import { claimBattleRewards } from './rewards.js';

export const SKIRMISH_SAFE_HUBS = Object.freeze(['outskirts', 'road-capital', 'eternal-city']);

export const SKIRMISH_ELIGIBLE_NODES = Object.freeze([
  ...IMPERIAL_CROSSROADS.map((node) => node.id),
  'road-bridge',
  'road-reeds',
  'eternal-road-orchard',
  'eternal-road-mill',
  'eternal-road-checkpoint',
  'ainoblin',
]);

export const SKIRMISH_ECOLOGIES = Object.freeze({
  plains: Object.freeze({
    label: '草原哨路巡逻队',
    mobs: [
      'mossSlime',
      'sprout',
      'pebble',
      'hound',
      'patrolHound',
      'greyProwler',
      'facetSkitter',
      'trailArbalist',
      'banditCutthroat',
      'banditPoacher',
      'goblinScavenger',
      'goblinSlinger',
    ],
    elites: [
      'warden',
      'corridorGuard',
      'hollowSentry',
      'oathlessDuelist',
      'banditExecutioner',
      'goblinWolfRider',
    ],
    bosses: ['ruinsGate', 'mossGulon', 'manyShellBeast', 'banditSyndicateKing', 'goblinKingGorg'],
    ingredients: ['flour', 'butter', 'herb', 'honey', 'tomato', 'egg', 'pork'],
  }),
  ruins: Object.freeze({
    label: '古迹游荡魔物群',
    mobs: [
      'stoneBallista',
      'viperShadow',
      'raptorStorm',
      'stoneBeetle',
      'brassSeeker',
      'tombBeetle',
      'cultistSpecter',
      'blackOoze',
      'voidParasite',
      'erosionCrawler',
      'erosionSpitter',
      'erosionHound',
    ],
    elites: ['shadowStalker', 'ruinsMudGolem', 'tombWarden', 'warden', 'erosionJuggernaut'],
    bosses: [
      'ruinsGate',
      'chasmBeast',
      'brassColossus',
      'cinderPriest',
      'bossGate',
      'erosionRiftTyrant',
    ],
    ingredients: ['mushroom', 'garlic', 'cheese', 'amber-root', 'frost-oyster', 'wine'],
  }),
  forest: Object.freeze({
    label: '深林异动妖植群',
    mobs: [
      'livingVine',
      'moonMoth',
      'bogLeech',
      'fogSpore',
      'moonWorker',
      'honeyLarva',
      'scaleWarrior',
      'scaleArcher',
      'twistedSapling',
      'barkAcolyte',
      'moonTendril',
      'goblinScavenger',
      'goblinShaman',
      'banditPoacher',
    ],
    elites: [
      'bogDrifter',
      'hiveGuard',
      'scaleShield',
      'rootHauler',
      'rootSentry',
      'goblinWolfRider',
    ],
    bosses: [
      'mossGulon',
      'bogElemental',
      'scaleCaptain',
      'maskedForester',
      'bossBloom',
      'goblinKingGorg',
    ],
    ingredients: ['mushroom', 'berry', 'honey', 'milk', 'chicken', 'fir-shoot', 'ruby-berry'],
  }),
  highland: Object.freeze({
    label: '北境矿道警戒群',
    mobs: [
      'rustMiner',
      'drillWorm',
      'railSpider',
      'greyStinger',
      'dustHexer',
      'veilMender',
      'banditBruiser',
      'banditAlchemist',
      'goblinSapper',
      'erosionWing',
    ],
    elites: [
      'frostBorer',
      'hollowSentry',
      'crystalBeetle',
      'banditExecutioner',
      'erosionJuggernaut',
    ],
    bosses: [
      'frostCrusher',
      'drillMatriarch',
      'crystalDevourer',
      'repairOverseer',
      'settlementLeader',
      'unmooredJudge',
      'banditSyndicateKing',
    ],
    ingredients: ['potato', 'beef', 'onion', 'chili', 'cheese', 'game-bird', 'wine'],
  }),
  coast: Object.freeze({
    label: '东境荒潮异兽群',
    mobs: [
      'cinderImp',
      'tideJelly',
      'hexer',
      'riftMote',
      'shellGatherer',
      'brassSeeker',
      'erosionCrawler',
      'erosionSpitter',
      'erosionWing',
    ],
    elites: ['crystalBeetle', 'hollowSentry', 'oathlessDuelist', 'tombWarden', 'erosionJuggernaut'],
    bosses: [
      'bossTide',
      'returningCore',
      'unmooredJudge',
      'manyShellBeast',
      'brassColossus',
      'erosionRiftTyrant',
    ],
    ingredients: ['fish', 'honey-kelp', 'mint-leaf', 'salt', 'silverfin', 'moonflower'],
  }),
});

const ECOLOGIES = SKIRMISH_ECOLOGIES;

const NODE_ECOLOGY_MAP = Object.freeze({
  'cross-meadow': { ecology: 'plains', level: 5 },
  'road-bridge': { ecology: 'plains', level: 3 },
  'road-reeds': { ecology: 'plains', level: 2 },
  'cross-downs': { ecology: 'plains', level: 9 },
  'eternal-road-orchard': { ecology: 'plains', level: 2 },
  'eternal-road-mill': { ecology: 'forest', level: 3 },
  'eternal-road-checkpoint': { ecology: 'ruins', level: 4 },
  ruins: { ecology: 'ruins', level: 8 },
  'cross-pines': { ecology: 'forest', level: 12 },
  forest: { ecology: 'forest', level: 14 },
  'cross-ridge': { ecology: 'highland', level: 17 },
  frost: { ecology: 'highland', level: 19 },
  ainoblin: { ecology: 'highland', level: 18 },
  'cross-orchard': { ecology: 'coast', level: 18 },
  'cross-aqueduct': { ecology: 'coast', level: 22 },
  forge: { ecology: 'coast', level: 24 },
  'cross-causeway': { ecology: 'coast', level: 26 },
  tide: { ecology: 'coast', level: 29 },
  'moss-hollow': { ecology: 'plains', level: 3 },
  'border-watch': { ecology: 'ruins', level: 7 },
  'whisper-grove': { ecology: 'forest', level: 11 },
  'silver-cistern': { ecology: 'highland', level: 16 },
  'ash-foundry': { ecology: 'coast', level: 22 },
  'astral-sanctum': { ecology: 'coast', level: 27 },
});

function hashSeed(input) {
  let hash = 2166136261;
  for (const ch of String(input || 'skirmish')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function validEnemy(id) {
  return Boolean(DEFINITIONS[id]);
}

function pickFrom(list, seed, offset = 0) {
  const valid = list.filter(validEnemy);
  if (!valid.length) return 'mossSlime';
  return valid[hashSeed(`${seed}:${offset}`) % valid.length];
}

export function edgeExploreKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function routeExploreKey(from, to) {
  return `${from}->${to}`;
}

export function restoreOverlandExploration(value) {
  const routes = Array.isArray(value?.routes)
    ? [
        ...new Set(value.routes.filter((item) => typeof item === 'string' && item.includes('->'))),
      ].slice(-200)
    : [];
  const legs = Array.isArray(value?.legs)
    ? [
        ...new Set(value.legs.filter((item) => typeof item === 'string' && item.includes(':'))),
      ].slice(-200)
    : [];
  return { routes, legs };
}

export function isOverlandRouteKnown(library, from, to) {
  if (!from || !to) return false;
  return Boolean(library?.overlandExploration?.routes?.includes(routeExploreKey(from, to)));
}

export function isAtlasLegKnown(library, a, b) {
  if (!a || !b) return false;
  return Boolean(library?.overlandExploration?.legs?.includes(edgeExploreKey(a, b)));
}

/** Record an overland plan as explored (full origin->destination route plus each road edge). */
export function markOverlandRouteExplored(library, planOrFrom, maybeTo) {
  if (!library) return;
  const plan =
    typeof planOrFrom === 'string' && typeof maybeTo === 'string'
      ? { from: planOrFrom, to: maybeTo, legs: [] }
      : planOrFrom;
  if (!plan?.from || !plan?.to) return;
  const store = (library.overlandExploration ||= { routes: [], legs: [] });
  const key = routeExploreKey(plan.from, plan.to);
  if (!store.routes.includes(key)) store.routes.push(key);
  for (const leg of plan.legs || []) {
    if (!leg?.from?.id || !leg?.to?.id) continue;
    const legKey = edgeExploreKey(leg.from.id, leg.to.id);
    if (!store.legs.includes(legKey)) store.legs.push(legKey);
  }
  store.routes = store.routes.slice(-200);
  store.legs = store.legs.slice(-200);
}

/** Refresh 4~5 Fire-Emblem-style wild skirmish markers inside 艾尔德兰帝国. */
export function refreshWorldSkirmishes(library, seedInput = Date.now()) {
  const prev = library?.skirmishes || {};
  const generation = (Number.isInteger(prev.generation) ? prev.generation : 0) + 1;
  const seed = `${seedInput}:gen-${generation}`;
  const count = 4 + (hashSeed(`${seed}:count`) % 2);
  const pool = [...SKIRMISH_ELIGIBLE_NODES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = hashSeed(`${seed}:shuffle:${i}`) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, count);
  const nodes = {};
  for (let i = 0; i < picked.length; i++) {
    const nodeId = picked[i];
    const meta = NODE_ECOLOGY_MAP[nodeId] || { ecology: 'plains', level: 3 };
    const ecology = ECOLOGIES[meta.ecology] || ECOLOGIES.plains;
    const tierRoll = hashSeed(`${seed}:${nodeId}:tier`) % 100;
    const tier = tierRoll < 18 ? 'boss' : tierRoll < 52 ? 'elite' : 'normal';
    const level = meta.level;
    nodes[nodeId] = {
      id: `skirmish-${generation}-${nodeId}`,
      nodeId,
      ecology: meta.ecology,
      label:
        tier === 'boss'
          ? `${ecology.label} · 游荡头目`
          : tier === 'elite'
            ? `${ecology.label} · 精英游击`
            : ecology.label,
      tier,
      level,
      seed: hashSeed(`${seed}:${nodeId}`),
    };
  }
  const state = { version: 1, generation, nodes };
  if (library) library.skirmishes = state;
  return state;
}

export function restoreSkirmishes(value) {
  if (!value || typeof value !== 'object' || !value.nodes || typeof value.nodes !== 'object') {
    return { version: 1, generation: 0, nodes: {} };
  }
  const nodes = {};
  for (const [nodeId, raw] of Object.entries(value.nodes)) {
    if (!SKIRMISH_ELIGIBLE_NODES.includes(nodeId) || !raw || typeof raw !== 'object') continue;
    nodes[nodeId] = {
      id: typeof raw.id === 'string' ? raw.id.slice(0, 80) : `skirmish-${nodeId}`,
      nodeId,
      ecology: Object.hasOwn(ECOLOGIES, raw.ecology) ? raw.ecology : 'plains',
      label: typeof raw.label === 'string' ? raw.label.slice(0, 60) : '荒野遭遇战',
      tier: raw.tier === 'boss' || raw.tier === 'normal' ? raw.tier : 'elite',
      level: Number.isInteger(raw.level) ? Math.min(99, Math.max(1, raw.level)) : 2,
      seed: Number(raw.seed) >>> 0,
    };
  }
  return {
    version: 1,
    generation: Number.isInteger(value.generation) ? Math.max(0, value.generation) : 0,
    nodes,
  };
}

export function clearWorldSkirmish(library, nodeId) {
  if (!library?.skirmishes?.nodes?.[nodeId]) return;
  delete library.skirmishes.nodes[nodeId];
}

/** Generate the exact 3 pure-code battle waves and loot table for a wild skirmish node. */
export function buildSkirmishEncounterPlan(skirmish, fallbackLevel = 1) {
  const ecology = ECOLOGIES[skirmish?.ecology] || ECOLOGIES.plains;
  const seed = skirmish?.seed ?? 1;
  const level = Math.max(fallbackLevel, skirmish?.level || 2);
  const isBoss = skirmish?.tier === 'boss';

  const wave1 = [
    pickFrom(ecology.mobs, seed, 11),
    pickFrom(ecology.mobs, seed, 12),
    ...(level >= 5 ? [pickFrom(ecology.mobs, seed, 13)] : []),
  ];
  const wave2 = [
    pickFrom(ecology.elites, seed, 21),
    pickFrom(ecology.mobs, seed, 22),
    ...(level >= 6 ? [pickFrom(ecology.mobs, seed, 23)] : []),
  ];
  const wave3 = isBoss
    ? [
        pickFrom(ecology.bosses, seed, 31),
        ...(level >= 7 ? [pickFrom(ecology.mobs, seed, 32)] : []),
      ]
    : skirmish?.tier === 'normal'
      ? [
          pickFrom(ecology.mobs, seed, 31),
          pickFrom(ecology.mobs, seed, 32),
          ...(level >= 15 ? [pickFrom(ecology.elites, seed, 33)] : []),
        ]
      : [
          pickFrom(ecology.elites, seed, 31),
          pickFrom(ecology.elites, seed, 32),
          pickFrom(ecology.mobs, seed, 33),
        ];

  const gold = (isBoss ? 55 : 35) + level * 4;
  const ether = (isBoss ? 14 : 8) + Math.floor(level * 1.2);
  const ingredients = {};
  const ingCount = isBoss ? 3 : 2;
  for (let i = 0; i < ingCount; i++) {
    const candidate =
      ecology.ingredients[hashSeed(`${seed}:ing:${i}`) % ecology.ingredients.length];
    if (INGREDIENTS[candidate]) {
      ingredients[candidate] = (ingredients[candidate] || 0) + 1;
    }
  }
  const gem = rollGemDrop(`${skirmish?.id || seed}:reward`, isBoss ? 0.14 : 0.07);

  return {
    id: skirmish?.id || `skirmish-${seed}`,
    nodeId: skirmish?.nodeId || 'cross-meadow',
    label: skirmish?.label || ecology.label,
    level,
    tier: isBoss ? 'boss' : 'elite',
    encounters: [
      { name: '先遣遭遇', enemies: wave1, level, boss: false },
      { name: '中坚伏击', enemies: wave2, level, boss: false },
      { name: isBoss ? '游荡头目' : '精锐收尾', enemies: wave3, level, boss: isBoss },
    ],
    rewards: {
      summonContracts: 0,
      gold,
      ether,
      ingredients,
      gems: gem ? [{ gemId: gem.id, instanceId: `gem-${skirmish?.id || seed}` }] : [],
    },
  };
}

/** Claim 3-wave skirmish rewards (gold, ether, ingredients, optional gem) and clear node. */
export function settleSkirmishVictory(library, plan) {
  if (!library || !plan?.rewards) return { claimed: false };
  const claimId = `skirmish:${plan.id}`;
  const claimed = claimBattleRewards(library, claimId, {
    summonContracts: plan.rewards.summonContracts || 0,
    gold: plan.rewards.gold || 0,
    ether: plan.rewards.ether || 0,
    gems: plan.rewards.gems || [],
  });
  if (claimed && plan.rewards.ingredients) {
    library.dining ||= { inventory: {}, active: null, tutorial: 'done' };
    library.dining.inventory ||= {};
    for (const [id, count] of Object.entries(plan.rewards.ingredients)) {
      if (!Object.hasOwn(INGREDIENTS, id) || count <= 0) continue;
      library.dining.inventory[id] = Math.min(9999, (library.dining.inventory[id] || 0) + count);
    }
  }
  clearWorldSkirmish(library, plan.nodeId);
  return { claimed, rewards: plan.rewards };
}
