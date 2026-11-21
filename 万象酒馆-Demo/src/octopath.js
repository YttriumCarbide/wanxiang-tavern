import { DAMAGE_TYPE_IDS, isDamageType, resolveBasicAttackType } from './damage-types.js';

const PLAIN_ORDINARY_LAYERS = Object.freeze({
  hound: 2,
  hexer: 1,
  cinderImp: 2,
  greyProwler: 1,
  trailArbalist: 2,
  riftMote: 1,
  riftDarkDust: 1,
  livingVine: 2,
  bogLeech: 1,
  moonWorker: 2,
  scaleArcher: 1,
  barkAcolyte: 2,
  railSpider: 1,
  shardSprite: 2,
  lostWelder: 2,
  scrapHound: 1,
  conduitWisp: 2,
  millDustBat: 1,
  patrolHound: 2,
  stoneBallista: 2,
  stoneBeetle: 1,
  cultistSpecter: 2,
  drakeBadlandScorpion: 1,
  ladderCarrionBat: 1,
  banditCutthroat: 2,
  goblinShaman: 1,
  erosionCrawler: 2,
});

const NO_BREAK_ELITES = new Set([
  'millGiantVole',
  'shellGatherer',
  'rootSentry',
  'crystalMiner',
  'cargoCrawler',
  'shadowStalker',
  'tombWarden',
  'relicHermitCrab',
  'bicolorScalePython',
  'overloadCreationElemental',
]);

const SPECIAL_BREAK_PRESETS = Object.freeze({
  // Elites (20 / 30 ~= 2/3)
  warden: { layers: 3, weaknesses: ['lightning', 'axe', 'brawl', 'special-magic'] },
  crystalBeetle: { layers: 3, weaknesses: ['brawl', 'axe', 'fire', 'lightning'] },
  hollowSentry: { layers: 3, weaknesses: ['axe', 'lightning', 'light', 'special-magic'] },
  oathlessDuelist: { layers: 3, weaknesses: ['spear', 'lightning', 'light', 'dark'] },
  bogDrifter: { layers: 3, weaknesses: ['fire', 'light', 'axe', 'wind'] },
  hiveGuard: { layers: 3, weaknesses: ['fire', 'brawl', 'axe', 'ice'] },
  scaleShield: { layers: 3, weaknesses: ['lightning', 'brawl', 'fire', 'special-magic'] },
  rootHauler: { layers: 3, weaknesses: ['fire', 'axe', 'wind', 'special-weapon'] },
  frostBorer: { layers: 3, weaknesses: ['fire', 'brawl', 'lightning', 'axe'] },
  rogueArm: { layers: 3, weaknesses: ['lightning', 'axe', 'fire', 'special-weapon'] },
  insaneWorker: { layers: 3, weaknesses: ['lightning', 'spear', 'ice', 'light'] },
  millMiniMoldSlime: { layers: 2, weaknesses: ['fire', 'wind', 'special-magic'] },
  millPaleSlug: { layers: 2, weaknesses: ['fire', 'lightning', 'sword'] },
  corridorGuard: { layers: 2, weaknesses: ['lightning', 'spear', 'axe'] },
  ruinsMudGolem: { layers: 3, weaknesses: ['wind', 'ice', 'brawl'] },
  chaosBadlandFalcon: { layers: 2, weaknesses: ['ice', 'spear', 'wind'] },
  overloadDestructionElemental: { layers: 3, weaknesses: ['ice', 'light', 'special-magic'] },
  ladderRockGiant: { layers: 3, weaknesses: ['brawl', 'axe', 'lightning'] },
  banditExecutioner: { layers: 2, weaknesses: ['sword', 'fire', 'light'] },
  goblinWolfRider: { layers: 2, weaknesses: ['fire', 'spear', 'wind'] },
  erosionJuggernaut: { layers: 3, weaknesses: ['light', 'brawl', 'fire'] },
  aresCannonLeft: { layers: 2, weaknesses: ['lightning', 'axe', 'brawl'] },
  aresCannonRight: { layers: 2, weaknesses: ['lightning', 'ice', 'special-magic'] },

  // Bosses (100%)
  millVoleAlpha: { layers: 2, weaknesses: ['special-magic', 'wind', 'sword', 'fire'] },
  millRoachSwarm: { layers: 3, weaknesses: ['fire', 'wind', 'brawl'] },
  millVampireBat: { layers: 3, weaknesses: ['light', 'wind', 'spear'] },
  millMoldSlimeBoss: { layers: 3, weaknesses: ['fire', 'lightning', 'sword'] },
  bossGate: { layers: 3, weaknesses: ['lightning', 'axe', 'brawl', 'special-magic'] },
  bossBloom: { layers: 3, weaknesses: ['fire', 'wind', 'light', 'sword'] },
  bossTide: { layers: 3, weaknesses: ['lightning', 'dark', 'spear', 'special-weapon'] },
  manyShellBeast: { layers: 3, weaknesses: ['brawl', 'axe', 'fire', 'lightning'] },
  unmooredJudge: { layers: 3, weaknesses: ['dark', 'sword', 'special-weapon', 'special-magic'] },
  returningCore: { layers: 3, weaknesses: ['special-magic', 'lightning', 'sword', 'light'] },
  mossGulon: { layers: 3, weaknesses: ['fire', 'spear', 'ice', 'lightning'] },
  bogElemental: { layers: 3, weaknesses: ['fire', 'wind', 'light', 'special-magic'] },
  moonQueen: { layers: 3, weaknesses: ['fire', 'ice', 'special-weapon', 'light'] },
  scaleCaptain: { layers: 3, weaknesses: ['lightning', 'spear', 'ice', 'light'] },
  maskedForester: { layers: 3, weaknesses: ['fire', 'sword', 'light', 'wind'] },
  frostCrusher: { layers: 3, weaknesses: ['fire', 'lightning', 'brawl', 'axe'] },
  drillMatriarch: { layers: 3, weaknesses: ['ice', 'lightning', 'axe', 'fire'] },
  crystalDevourer: { layers: 3, weaknesses: ['fire', 'brawl', 'lightning', 'special-magic'] },
  repairOverseer: { layers: 3, weaknesses: ['lightning', 'fire', 'axe', 'spear'] },
  settlementLeader: { layers: 3, weaknesses: ['sword', 'lightning', 'ice', 'special-magic'] },
  ruinsGate: { layers: 3, weaknesses: ['lightning', 'brawl', 'sword', 'fire'] },
  chasmBeast: { layers: 3, weaknesses: ['ice', 'spear', 'fire', 'brawl'] },
  brassColossus: { layers: 3, weaknesses: ['lightning', 'brawl', 'axe', 'fire'] },
  cinderPriest: { layers: 3, weaknesses: ['ice', 'light', 'spear', 'wind'] },
  bicolorSingularityLizard: { layers: 3, weaknesses: ['ice', 'fire', 'special-weapon', 'light'] },
  eclipseWatcher: { layers: 3, weaknesses: ['light', 'special-magic', 'sword', 'lightning'] },
  abyssDevourerPython: { layers: 3, weaknesses: ['light', 'fire', 'axe', 'spear'] },
  dragonscaleSandworm: { layers: 3, weaknesses: ['ice', 'brawl', 'wind', 'lightning'] },
  ladderWebSpider: { layers: 3, weaknesses: ['fire', 'axe', 'ice', 'light'] },
  ladderCrowman: { layers: 3, weaknesses: ['lightning', 'spear', 'fire', 'light'] },
  banditSyndicateKing: { layers: 3, weaknesses: ['sword', 'fire', 'lightning', 'brawl'] },
  goblinKingGorg: { layers: 3, weaknesses: ['fire', 'spear', 'light', 'axe'] },
  erosionRiftTyrant: { layers: 3, weaknesses: ['light', 'special-magic', 'brawl', 'fire'] },

  // Overlords (100%)
  alchemicalPuppet: { layers: 2, weaknesses: ['fire', 'brawl', 'axe', 'lightning'] },
  moonCrown: { layers: 3, weaknesses: ['fire', 'axe', 'wind', 'light'] },
  moonEye: { layers: 3, weaknesses: ['light', 'fire', 'special-weapon', 'lightning', 'sword'] },
  moonRoot: { layers: 3, weaknesses: ['fire', 'axe', 'ice', 'spear'] },
  ares: { layers: 3, weaknesses: ['lightning', 'brawl', 'axe', 'ice', 'special-magic'] },
  apepLamb: { layers: 3, weaknesses: ['light', 'fire', 'spear', 'special-magic'] },
  radiantWyvern: { layers: 3, weaknesses: ['ice', 'spear', 'dark', 'lightning'] },
  darkscaleWarlord: { layers: 3, weaknesses: ['light', 'fire', 'spear', 'axe'] },
});

function buildOfficialTable() {
  const entries = {};
  for (const [id, layers] of Object.entries(PLAIN_ORDINARY_LAYERS)) {
    entries[id] = { hasBreak: true, mode: 'plain', maxToughness: layers, weaknesses: [] };
  }
  for (const [id, preset] of Object.entries(SPECIAL_BREAK_PRESETS)) {
    entries[id] = {
      hasBreak: true,
      mode: 'special',
      maxToughness: preset.layers,
      weaknesses: [...preset.weaknesses],
      majorWeakness: preset.weaknesses[0],
      minorWeaknesses: preset.weaknesses.slice(1),
    };
  }
  return Object.freeze(entries);
}

export const OFFICIAL_ENEMY_BREAK_PROFILES = buildOfficialTable();

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

function splitWeaknesses(weaknesses, explicitMajor = null) {
  const clean = [...new Set((weaknesses || []).filter((w) => isDamageType(w)))].slice(0, 5);
  if (!clean.length) return { majorWeakness: null, minorWeaknesses: [], weaknesses: [] };
  const majorWeakness = explicitMajor && isDamageType(explicitMajor) ? explicitMajor : clean[0];
  const minorWeaknesses = clean.filter((w) => w !== majorWeakness);
  return {
    majorWeakness,
    minorWeaknesses,
    weaknesses: [majorWeakness, ...minorWeaknesses],
  };
}

/** Resolve conditional Break Window profile by enemy tier and stage. */
export function resolveEnemyBreakProfile(defOrId, stage = 1) {
  const def = typeof defOrId === 'string' ? { id: defOrId } : defOrId || {};
  const speciesKey = speciesKeyOf(def);
  const official = OFFICIAL_ENEMY_BREAK_PROFILES[speciesKey];
  const s = Math.max(1, Math.min(3, Number(stage) || 1));

  if (def.breakProfile && typeof def.breakProfile === 'object') {
    const bp = def.breakProfile;
    if (bp.hasBreak === false) {
      return {
        speciesKey,
        hasBreak: false,
        mode: 'none',
        maxToughness: 0,
        majorWeakness: null,
        minorWeaknesses: [],
        weaknesses: [],
        alwaysBreakWindow: false,
      };
    }
    const mode = bp.mode || (bp.majorWeakness || bp.weaknesses?.length ? 'special' : 'plain');
    const split =
      mode === 'special'
        ? splitWeaknesses(
            bp.weaknesses || [bp.majorWeakness, ...(bp.minorWeaknesses || [])],
            bp.majorWeakness,
          )
        : { majorWeakness: null, minorWeaknesses: [], weaknesses: [] };
    return {
      speciesKey,
      hasBreak: true,
      mode,
      maxToughness: Math.max(1, Math.round(Number(bp.layers ?? bp.maxToughness) || 2)),
      ...split,
      alwaysBreakWindow: Boolean(bp.alwaysBreakWindow),
    };
  }

  // Overlord stage-specific overrides (e.g. alchemicalPuppet shifts core weakness on Phase 2).
  if (speciesKey === 'alchemicalPuppet') {
    const layers = def.breakLayersByPhase?.[s - 1] ?? (s >= 3 ? 3 : 2);
    const ordered =
      s === 2
        ? ['lightning', 'fire', 'axe', 'special-magic']
        : ['fire', 'lightning', 'brawl', 'axe'];
    return {
      speciesKey,
      hasBreak: true,
      mode: 'special',
      maxToughness: layers,
      ...splitWeaknesses(ordered, ordered[0]),
      alwaysBreakWindow: false,
    };
  }

  // Custom / synthetic test definitions with explicit maxToughness (and no official table override).
  if (!official && Number.isFinite(def.maxToughness)) {
    const layers = Math.max(0, Math.round(def.maxToughness));
    if (layers <= 0) {
      return {
        speciesKey,
        hasBreak: false,
        mode: 'none',
        maxToughness: 0,
        majorWeakness: null,
        minorWeaknesses: [],
        weaknesses: [],
        alwaysBreakWindow: false,
      };
    }
    const rawList = Array.isArray(def.weaknesses) ? def.weaknesses : [];
    const mode = def.breakMode || (rawList.length || def.majorWeakness ? 'special' : 'plain');
    const split =
      mode === 'special'
        ? splitWeaknesses(rawList.length ? rawList : ['sword', 'fire'], def.majorWeakness)
        : { majorWeakness: null, minorWeaknesses: [], weaknesses: [] };
    return {
      speciesKey,
      hasBreak: true,
      mode,
      maxToughness: layers,
      ...split,
      alwaysBreakWindow: def.alwaysBreakWindow !== false,
    };
  }

  if (official) {
    const layers =
      def.overlord && s >= 3
        ? Math.min(4, official.maxToughness + 1)
        : def.breakLayersByPhase?.[s - 1] || official.maxToughness;
    return {
      speciesKey,
      hasBreak: true,
      mode: official.mode,
      maxToughness: layers,
      majorWeakness: official.majorWeakness || null,
      minorWeaknesses: [...(official.minorWeaknesses || [])],
      weaknesses: [...(official.weaknesses || [])],
      alwaysBreakWindow: false,
    };
  }

  if (NO_BREAK_ELITES.has(speciesKey)) {
    return {
      speciesKey,
      hasBreak: false,
      mode: 'none',
      maxToughness: 0,
      majorWeakness: null,
      minorWeaknesses: [],
      weaknesses: [],
      alwaysBreakWindow: false,
    };
  }

  // Fallback for authored ordinary enemies omitted from PLAIN_ORDINARY_LAYERS & dynamic AI enemies.
  if (!def.overlord && !def.boss && !def.elite) {
    const h = hashString(speciesKey || def.name || 'enemy');
    // Authoritative mill / region ordinary enemies not in PLAIN_ORDINARY_LAYERS keep ~2/3 no-break ratio.
    const isDynamic = Boolean(
      def.source === 'generated' || def.baseRevision || speciesKey.startsWith('enemy-'),
    );
    if (!isDynamic || h % 3 !== 0) {
      return {
        speciesKey,
        hasBreak: false,
        mode: 'none',
        maxToughness: 0,
        majorWeakness: null,
        minorWeaknesses: [],
        weaknesses: [],
        alwaysBreakWindow: false,
      };
    }
    return {
      speciesKey,
      hasBreak: true,
      mode: 'plain',
      maxToughness: 1 + ((h >> 3) % 2),
      majorWeakness: null,
      minorWeaknesses: [],
      weaknesses: [],
      alwaysBreakWindow: false,
    };
  }

  const h = hashString(speciesKey || def.name || 'enemy');
  if (def.elite && !def.boss && !def.overlord && h % 3 === 0) {
    return {
      speciesKey,
      hasBreak: false,
      mode: 'none',
      maxToughness: 0,
      majorWeakness: null,
      minorWeaknesses: [],
      weaknesses: [],
      alwaysBreakWindow: false,
    };
  }

  const layers = def.overlord ? (s >= 3 ? 4 : 3) : def.boss ? 3 : 2 + (h % 2);
  const weaknesses =
    Array.isArray(def.weaknesses) && def.weaknesses.length >= 2
      ? def.weaknesses
      : deterministicWeaknesses(speciesKey || def.name || 'enemy', def.overlord ? 4 : 3, def);
  return {
    speciesKey,
    hasBreak: true,
    mode: 'special',
    maxToughness: layers,
    ...splitWeaknesses(weaknesses, def.majorWeakness),
    alwaysBreakWindow: false,
  };
}

/** Decide whether an enemy opens its single-round Break Window at the start of a planning round. */
export function shouldOpenBreakWindow(state, id, def, enemyIndex = 0) {
  if (!state || state.phase === 'opening' || !def) return false;
  const unit = state.units?.[id];
  if (!unit || unit.hp <= 0) return false;
  const stage = unit.bossStage || (unit.enraged ? 2 : 1);
  const profile = resolveEnemyBreakProfile(def, stage);
  if (!profile.hasBreak) return false;
  if (profile.alwaysBreakWindow || unit.forceBreakWindow) return true;
  if (def.chargeMechanic) return Boolean(unit.chargingMove);
  const round = Math.max(1, Number(state.round) || 1);
  if (def.overlord) return round >= 2 && round % 2 === 0;
  if (def.boss) return Boolean(unit.justEnragedWindow) || (round >= 2 && round % 2 === 0);
  if (def.elite) return round >= 2 && round % 2 === 0;
  return (round + enemyIndex) % 2 === 0;
}

/** Build a fresh single-round Break Window object for state.units[id].breakWindow. */
export function createBreakWindow(def, unit, stage = 1, hasFixedFirst = false) {
  const profile = resolveEnemyBreakProfile(def, stage);
  if (!profile.hasBreak || profile.maxToughness <= 0) return null;
  return {
    active: true,
    mode: profile.mode,
    current: profile.maxToughness,
    max: profile.maxToughness,
    majorWeakness: profile.majorWeakness,
    minorWeaknesses: [...profile.minorWeaknesses],
    triggerActionIndex: hasFixedFirst ? 1 : 0,
    source: unit?.chargingMove ? 'charge' : 'window',
  };
}

/** Calculate how many break pips a direct-damage hit of damageType removes. */
export function breakImpactDelta(breakWindow, damageType) {
  if (!breakWindow?.active || !(breakWindow.current > 0) || !isDamageType(damageType)) return 0;
  if (breakWindow.mode === 'plain') return 1;
  if (breakWindow.majorWeakness && breakWindow.majorWeakness === damageType) return 2;
  if (
    Array.isArray(breakWindow.minorWeaknesses) &&
    breakWindow.minorWeaknesses.includes(damageType)
  ) {
    return 1;
  }
  return 0;
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
