import { DAMAGE_TYPE_IDS, isDamageType, resolveBasicAttackType } from './damage-types.js';

export const OFFICIAL_ENEMY_BREAK_PROFILES = Object.freeze({
  mossSlime: { maxToughness: 2, weaknesses: ['fire', 'sword', 'wind'] },
  sprout: { maxToughness: 2, weaknesses: ['fire', 'axe', 'ice'] },
  pebble: { maxToughness: 3, weaknesses: ['brawl', 'lightning', 'ice'] },
  hound: { maxToughness: 3, weaknesses: ['spear', 'fire', 'light'] },
  warden: { maxToughness: 5, weaknesses: ['axe', 'brawl', 'lightning', 'special-magic'] },
  hexer: { maxToughness: 3, weaknesses: ['ice', 'sword', 'light'] },
  crystalBeetle: { maxToughness: 5, weaknesses: ['brawl', 'axe', 'fire', 'lightning'] },
  cinderImp: { maxToughness: 3, weaknesses: ['ice', 'wind', 'spear'] },
  tideJelly: { maxToughness: 3, weaknesses: ['lightning', 'spear', 'fire'] },
  greyProwler: { maxToughness: 3, weaknesses: ['sword', 'fire', 'light'] },
  facetSkitter: { maxToughness: 3, weaknesses: ['brawl', 'fire', 'lightning'] },
  hollowSentry: { maxToughness: 5, weaknesses: ['axe', 'lightning', 'light', 'special-magic'] },
  veilMender: { maxToughness: 3, weaknesses: ['sword', 'dark', 'fire'] },
  dustHexer: { maxToughness: 3, weaknesses: ['light', 'wind', 'spear'] },
  greyStinger: { maxToughness: 3, weaknesses: ['ice', 'special-weapon', 'lightning'] },
  trailArbalist: { maxToughness: 3, weaknesses: ['sword', 'brawl', 'wind'] },
  shellGatherer: { maxToughness: 4, weaknesses: ['axe', 'brawl', 'lightning'] },
  riftMote: { maxToughness: 3, weaknesses: ['dark', 'light', 'special-weapon'] },
  oathlessDuelist: { maxToughness: 5, weaknesses: ['spear', 'lightning', 'light', 'dark'] },
  livingVine: { maxToughness: 3, weaknesses: ['fire', 'axe', 'ice'] },
  moonMoth: { maxToughness: 3, weaknesses: ['fire', 'wind', 'light'] },
  bogLeech: { maxToughness: 3, weaknesses: ['fire', 'lightning', 'spear'] },
  fogSpore: { maxToughness: 3, weaknesses: ['fire', 'wind', 'sword'] },
  bogDrifter: { maxToughness: 5, weaknesses: ['fire', 'light', 'axe', 'wind'] },
  moonWorker: { maxToughness: 3, weaknesses: ['fire', 'special-weapon', 'ice'] },
  hiveGuard: { maxToughness: 5, weaknesses: ['fire', 'brawl', 'axe', 'ice'] },
  honeyLarva: { maxToughness: 2, weaknesses: ['fire', 'sword', 'wind'] },
  scaleShield: { maxToughness: 5, weaknesses: ['lightning', 'brawl', 'fire', 'special-magic'] },
  scaleWarrior: { maxToughness: 4, weaknesses: ['ice', 'spear', 'light'] },
  scaleArcher: { maxToughness: 3, weaknesses: ['sword', 'brawl', 'lightning'] },
  twistedSapling: { maxToughness: 4, weaknesses: ['fire', 'axe', 'light'] },
  rootHauler: { maxToughness: 5, weaknesses: ['fire', 'axe', 'wind', 'special-weapon'] },
  barkAcolyte: { maxToughness: 3, weaknesses: ['fire', 'sword', 'light'] },
  rootSentry: { maxToughness: 5, weaknesses: ['fire', 'axe', 'ice', 'special-magic'] },
  moonTendril: { maxToughness: 3, weaknesses: ['fire', 'light', 'sword'] },
  rustMiner: { maxToughness: 4, weaknesses: ['lightning', 'brawl', 'fire'] },
  drillWorm: { maxToughness: 4, weaknesses: ['ice', 'lightning', 'brawl'] },
  railSpider: { maxToughness: 3, weaknesses: ['lightning', 'brawl', 'fire'] },
  frostBorer: { maxToughness: 5, weaknesses: ['fire', 'brawl', 'lightning', 'axe'] },
  crystalMiner: { maxToughness: 5, weaknesses: ['brawl', 'fire', 'lightning', 'axe'] },
  clingLarva: { maxToughness: 2, weaknesses: ['fire', 'brawl', 'lightning'] },
  oreMite: { maxToughness: 3, weaknesses: ['brawl', 'axe', 'lightning'] },
  shardSprite: { maxToughness: 3, weaknesses: ['fire', 'brawl', 'special-magic'] },
  rogueArm: { maxToughness: 5, weaknesses: ['lightning', 'axe', 'fire', 'special-weapon'] },
  partsCarrier: { maxToughness: 4, weaknesses: ['lightning', 'brawl', 'axe'] },
  lostWelder: { maxToughness: 4, weaknesses: ['ice', 'lightning', 'spear'] },
  cargoCrawler: { maxToughness: 5, weaknesses: ['lightning', 'axe', 'fire', 'brawl'] },
  insaneWorker: { maxToughness: 5, weaknesses: ['lightning', 'spear', 'ice', 'light'] },
  scrapHound: { maxToughness: 3, weaknesses: ['lightning', 'brawl', 'sword'] },
  sentryDrone: { maxToughness: 4, weaknesses: ['special-weapon', 'wind', 'brawl'] },
  conduitWisp: { maxToughness: 3, weaknesses: ['brawl', 'dark', 'special-weapon'] },
  aresCannonLeft: { maxToughness: 5, weaknesses: ['lightning', 'axe', 'brawl', 'special-weapon'] },
  aresCannonRight: { maxToughness: 5, weaknesses: ['lightning', 'ice', 'spear', 'special-magic'] },
  bossGate: { maxToughness: 7, weaknesses: ['axe', 'brawl', 'lightning', 'special-magic'] },
  bossBloom: { maxToughness: 7, weaknesses: ['fire', 'wind', 'light', 'sword'] },
  bossTide: { maxToughness: 7, weaknesses: ['lightning', 'dark', 'spear', 'special-weapon'] },
  manyShellBeast: { maxToughness: 8, weaknesses: ['brawl', 'axe', 'fire', 'lightning'] },
  unmooredJudge: {
    maxToughness: 8,
    weaknesses: ['dark', 'sword', 'special-weapon', 'special-magic'],
  },
  returningCore: { maxToughness: 9, weaknesses: ['special-magic', 'lightning', 'sword', 'light'] },
  mossGulon: { maxToughness: 7, weaknesses: ['fire', 'spear', 'ice', 'lightning'] },
  bogElemental: { maxToughness: 7, weaknesses: ['fire', 'wind', 'light', 'special-magic'] },
  moonQueen: { maxToughness: 8, weaknesses: ['fire', 'ice', 'special-weapon', 'light'] },
  scaleCaptain: { maxToughness: 8, weaknesses: ['lightning', 'spear', 'ice', 'light'] },
  maskedForester: { maxToughness: 8, weaknesses: ['fire', 'sword', 'light', 'wind'] },
  moonCrown: { maxToughness: 8, weaknesses: ['fire', 'axe', 'wind', 'light'] },
  moonEye: {
    maxToughness: 11,
    weaknesses: ['light', 'fire', 'special-weapon', 'lightning', 'sword'],
  },
  moonRoot: { maxToughness: 8, weaknesses: ['fire', 'axe', 'ice', 'spear'] },
  frostCrusher: { maxToughness: 8, weaknesses: ['fire', 'lightning', 'brawl', 'axe'] },
  drillMatriarch: { maxToughness: 8, weaknesses: ['ice', 'lightning', 'axe', 'fire'] },
  crystalDevourer: { maxToughness: 8, weaknesses: ['fire', 'brawl', 'lightning', 'special-magic'] },
  repairOverseer: { maxToughness: 8, weaknesses: ['lightning', 'fire', 'axe', 'spear'] },
  settlementLeader: { maxToughness: 9, weaknesses: ['sword', 'lightning', 'ice', 'special-magic'] },
  ares: { maxToughness: 12, weaknesses: ['lightning', 'brawl', 'axe', 'ice', 'special-magic'] },
  alchemicalPuppet: { maxToughness: 7, weaknesses: ['fire', 'brawl', 'axe', 'lightning'] },
  ladderWebSpider: { maxToughness: 8, weaknesses: ['fire', 'axe', 'ice', 'light'] },
  ladderCrowman: { maxToughness: 8, weaknesses: ['lightning', 'spear', 'fire', 'light'] },
});

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function speciesKeyOf(defOrId) {
  if (!defOrId) return '';
  if (typeof defOrId === 'string') return defOrId.replace(/#\d+$/, '');
  const raw = defOrId.speciesKey || defOrId.baseId || defOrId.kindId || defOrId.id || '';
  return String(raw).replace(/#\d+$/, '');
}

function deterministicWeaknesses(key, count, def) {
  const ownType = resolveBasicAttackType(def);
  const counterPool = {
    sword: ['spear', 'lightning', 'fire'],
    axe: ['sword', 'fire', 'wind'],
    spear: ['axe', 'ice', 'brawl'],
    brawl: ['sword', 'special-weapon', 'wind'],
    'special-weapon': ['brawl', 'lightning', 'fire'],
    fire: ['ice', 'spear', 'brawl'],
    ice: ['fire', 'brawl', 'axe'],
    wind: ['fire', 'ice', 'special-weapon'],
    lightning: ['wind', 'special-weapon', 'brawl'],
    light: ['dark', 'special-magic', 'sword'],
    dark: ['light', 'fire', 'spear'],
    'special-magic': ['special-weapon', 'dark', 'sword'],
  };
  const preferred = counterPool[ownType] || [];
  const chosen = [];
  let h = hashString(key || 'enemy');
  if (preferred.length) {
    const first = preferred[h % preferred.length];
    if (isDamageType(first)) chosen.push(first);
  }
  let guard = 0;
  while (chosen.length < count && guard < 64) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const candidate = DAMAGE_TYPE_IDS[h % DAMAGE_TYPE_IDS.length];
    if (!chosen.includes(candidate)) chosen.push(candidate);
    guard += 1;
  }
  return chosen;
}

export function resolveEnemyBreakProfile(defOrId) {
  const def = typeof defOrId === 'string' ? { id: defOrId } : defOrId || {};
  const speciesKey = speciesKeyOf(def);
  const official = OFFICIAL_ENEMY_BREAK_PROFILES[speciesKey];

  const explicitWeaknesses = Array.isArray(def.weaknesses)
    ? [...new Set(def.weaknesses.filter((w) => isDamageType(w)))].slice(0, 5)
    : null;
  const explicitToughness = Number.isFinite(def.maxToughness)
    ? Math.max(1, Math.round(def.maxToughness))
    : null;

  if (explicitWeaknesses && explicitWeaknesses.length >= 2 && explicitToughness) {
    return {
      speciesKey,
      maxToughness: explicitToughness,
      weaknesses: explicitWeaknesses,
    };
  }

  if (official) {
    return {
      speciesKey,
      maxToughness: explicitToughness || official.maxToughness,
      weaknesses:
        explicitWeaknesses && explicitWeaknesses.length > 0
          ? explicitWeaknesses
          : [...official.weaknesses],
    };
  }

  const h = hashString(speciesKey || def.name || 'enemy');
  const maxToughness = explicitToughness
    ? explicitToughness
    : def.overlord
      ? 8 + (h % 5)
      : def.boss
        ? 6 + (h % 4)
        : def.elite
          ? 4 + (h % 3)
          : 2 + (h % 3);

  const count = def.overlord ? 4 + (h % 2) : def.boss ? 4 : def.elite ? 3 + (h % 2) : 2 + (h % 2);
  const weaknesses =
    explicitWeaknesses && explicitWeaknesses.length > 0
      ? explicitWeaknesses
      : deterministicWeaknesses(speciesKey || def.name || 'enemy', count, def);

  return {
    speciesKey,
    maxToughness,
    weaknesses,
  };
}

export function revealedWeaknessesFor(revealedMap, defOrId) {
  const key = speciesKeyOf(defOrId);
  const list = revealedMap && Array.isArray(revealedMap[key]) ? revealedMap[key] : [];
  return [...new Set(list.filter((w) => isDamageType(w)))];
}

export function mergeRevealedWeaknessMap(baseMap = {}, incomingMap = {}) {
  const next = {};
  for (const source of [baseMap, incomingMap]) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, list] of Object.entries(source)) {
      if (!key || !Array.isArray(list)) continue;
      const prev = next[key] || [];
      for (const item of list) {
        if (isDamageType(item) && !prev.includes(item)) prev.push(item);
      }
      if (prev.length) next[key] = prev;
    }
  }
  return next;
}
