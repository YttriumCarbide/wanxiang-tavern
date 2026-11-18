export const DAMAGE_TYPE_IDS = Object.freeze([
  'sword',
  'axe',
  'spear',
  'brawl',
  'special-weapon',
  'fire',
  'ice',
  'wind',
  'lightning',
  'light',
  'dark',
  'special-magic',
]);

export const PHYSICAL_DAMAGE_TYPE_IDS = Object.freeze([
  'sword',
  'axe',
  'spear',
  'brawl',
  'special-weapon',
]);

export const MAGIC_DAMAGE_TYPE_IDS = Object.freeze([
  'fire',
  'ice',
  'wind',
  'lightning',
  'light',
  'dark',
  'special-magic',
]);

export const SUPPORT_TYPE = 'support';
export const UNKNOWN_TYPE = 'unknown';

export const DIRECTIONAL_PIXELFX = new Set([
  'sword-slash',
  'double-slash',
  'heavy-cleave',
  'spear-sweep',
  'thrust',
  'dagger-flurry',
  'claw-swipe',
  'whip-crack',
  'arcane-beam',
  'arcane-missiles',
  'chain-lightning',
  'life-steal',
  'soul-drain',
  'vine-whip',
  'water-jet',
  'tractor-beam',
]);

export const DAMAGE_TYPES = Object.freeze({
  sword: {
    id: 'sword',
    name: '剑',
    short: '剑',
    category: 'weapon',
    color: '#e8c468',
    glow: 'rgba(232, 196, 104, 0.34)',
    fx: { basic: 'sword-slash', skill: 'double-slash', aoe: 'heavy-cleave' },
  },
  axe: {
    id: 'axe',
    name: '斧',
    short: '斧',
    category: 'weapon',
    color: '#d97a4a',
    glow: 'rgba(217, 122, 74, 0.34)',
    fx: { basic: 'heavy-cleave', skill: 'hammer-smash', aoe: 'heavy-cleave' },
  },
  spear: {
    id: 'spear',
    name: '枪',
    short: '枪',
    category: 'weapon',
    color: '#8fc8e8',
    glow: 'rgba(143, 200, 232, 0.34)',
    fx: { basic: 'thrust', skill: 'spear-sweep', aoe: 'spear-sweep' },
  },
  brawl: {
    id: 'brawl',
    name: '格斗',
    short: '拳',
    category: 'weapon',
    color: '#f09458',
    glow: 'rgba(240, 148, 88, 0.34)',
    fx: { basic: 'blunt-hit', skill: 'uppercut', aoe: 'ground-slam' },
  },
  'special-weapon': {
    id: 'special-weapon',
    name: '特殊武器',
    short: '奇兵',
    category: 'weapon',
    color: '#c7b38b',
    glow: 'rgba(199, 179, 139, 0.34)',
    fx: { basic: 'dagger-flurry', skill: 'whip-crack', aoe: 'scythe-reap' },
  },
  fire: {
    id: 'fire',
    name: '火',
    short: '火',
    category: 'magic',
    color: '#ff6f3c',
    glow: 'rgba(255, 111, 60, 0.36)',
    fx: {
      basic: 'burning',
      skill: 'shadow-flames',
      aoe: 'dissolve-burn',
      palette: [
        '#1f0b10',
        '#4a1118',
        '#8c1d1c',
        '#cc3a1a',
        '#f2701f',
        '#ffae35',
        '#ffe27a',
        '#fff8d6',
      ],
    },
  },
  ice: {
    id: 'ice',
    name: '冰',
    short: '冰',
    category: 'magic',
    color: '#73dcff',
    glow: 'rgba(115, 220, 255, 0.36)',
    fx: {
      basic: 'frozen',
      skill: 'geyser',
      aoe: 'shatter-death',
      palette: [
        '#0c1430',
        '#162c5c',
        '#1f4f94',
        '#2f7fcc',
        '#58b4ec',
        '#9bdcff',
        '#d8f4ff',
        '#ffffff',
      ],
    },
  },
  wind: {
    id: 'wind',
    name: '风',
    short: '风',
    category: 'magic',
    color: '#64d89b',
    glow: 'rgba(100, 216, 155, 0.34)',
    fx: { basic: 'leaf-storm', skill: 'tornado', aoe: 'tornado' },
  },
  lightning: {
    id: 'lightning',
    name: '电',
    short: '电',
    category: 'magic',
    color: '#ffe052',
    glow: 'rgba(255, 224, 82, 0.36)',
    fx: { basic: 'lightning-strike', skill: 'chain-lightning', aoe: 'thunderclap' },
  },
  light: {
    id: 'light',
    name: '光',
    short: '光',
    category: 'magic',
    color: '#fff1a8',
    glow: 'rgba(255, 241, 168, 0.36)',
    fx: { basic: 'smite', skill: 'holy-pillar', aoe: 'sunburst' },
  },
  dark: {
    id: 'dark',
    name: '暗',
    short: '暗',
    category: 'magic',
    color: '#b07cff',
    glow: 'rgba(176, 124, 255, 0.36)',
    fx: { basic: 'shadow-tendrils', skill: 'soul-drain', aoe: 'black-hole' },
  },
  'special-magic': {
    id: 'special-magic',
    name: '特殊魔法',
    short: '秘法',
    category: 'magic',
    color: '#9c92ff',
    glow: 'rgba(156, 146, 255, 0.36)',
    fx: { basic: 'arcane-missiles', skill: 'arcane-beam', aoe: 'star-fall' },
  },
});

export const SUPPORT_META = Object.freeze({
  id: SUPPORT_TYPE,
  name: '增幅',
  short: '辅',
  category: 'support',
  color: '#6ecfa3',
  glow: 'rgba(110, 207, 163, 0.28)',
  fx: { basic: 'heal', skill: 'blessing', aoe: 'sunburst' },
});

export const UNKNOWN_META = Object.freeze({
  id: UNKNOWN_TYPE,
  name: '未知弱点',
  short: '？',
  category: 'unknown',
  color: '#9a8f7c',
  glow: 'rgba(154, 143, 124, 0.2)',
  fx: { basic: 'hit-spark', skill: 'hit-spark', aoe: 'hit-spark' },
});

export const OFFICIAL_ACTOR_ATTACK_TYPES = Object.freeze({
  lyria: 'sword',
  morrow: 'special-magic',
  serin: 'light',
  vesper: 'dark',
  aegis: 'sword',
  rook: 'special-weapon',
  changjingYuexi: 'sword',
  qingyuan: 'wind',
  'character-qingyuan': 'wind',
  edith: 'special-magic',
  pandora: 'dark',
  libet: 'light',
  lumi: 'wind',
  'yuto-nakashi': 'special-magic',
  'luo-gongxu': 'spear',
  'silica-laps': 'sword',
  mossSlime: 'wind',
  sprout: 'wind',
  pebble: 'brawl',
  hound: 'brawl',
  warden: 'brawl',
  hexer: 'fire',
  crystalBeetle: 'brawl',
  cinderImp: 'fire',
  tideJelly: 'ice',
  greyProwler: 'brawl',
  facetSkitter: 'special-weapon',
  hollowSentry: 'brawl',
  veilMender: 'special-magic',
  dustHexer: 'dark',
  greyStinger: 'wind',
  trailArbalist: 'special-weapon',
  shellGatherer: 'brawl',
  riftMote: 'special-magic',
  oathlessDuelist: 'sword',
  livingVine: 'wind',
  moonMoth: 'dark',
  bogLeech: 'dark',
  fogSpore: 'dark',
  bogDrifter: 'dark',
  moonWorker: 'wind',
  hiveGuard: 'spear',
  honeyLarva: 'brawl',
  scaleShield: 'axe',
  scaleWarrior: 'sword',
  scaleArcher: 'special-weapon',
  twistedSapling: 'dark',
  rootHauler: 'brawl',
  barkAcolyte: 'wind',
  rootSentry: 'spear',
  moonTendril: 'dark',
  rustMiner: 'axe',
  drillWorm: 'spear',
  railSpider: 'special-weapon',
  frostBorer: 'ice',
  crystalMiner: 'ice',
  clingLarva: 'ice',
  oreMite: 'brawl',
  shardSprite: 'ice',
  rogueArm: 'brawl',
  partsCarrier: 'brawl',
  lostWelder: 'fire',
  cargoCrawler: 'brawl',
  insaneWorker: 'axe',
  scrapHound: 'brawl',
  sentryDrone: 'lightning',
  conduitWisp: 'lightning',
  aresCannonLeft: 'special-weapon',
  aresCannonRight: 'special-weapon',
  bossGate: 'brawl',
  bossBloom: 'dark',
  bossTide: 'special-magic',
  manyShellBeast: 'brawl',
  unmooredJudge: 'light',
  returningCore: 'special-magic',
  mossGulon: 'wind',
  bogElemental: 'dark',
  moonQueen: 'wind',
  scaleCaptain: 'sword',
  maskedForester: 'dark',
  moonCrown: 'dark',
  moonEye: 'dark',
  moonRoot: 'dark',
  frostCrusher: 'ice',
  drillMatriarch: 'spear',
  crystalDevourer: 'ice',
  repairOverseer: 'axe',
  settlementLeader: 'brawl',
  ares: 'special-weapon',
  alchemicalPuppet: 'brawl',
});

export const OFFICIAL_SKILL_DAMAGE_TYPES = Object.freeze({
  'falling-starlight': 'spear',
  bastion: 'sword',
  'meteor-stance': null,
  'entry-lyria': 'sword',
  'blade-dance': 'sword',
  edge: null,
  'entry-morrow': null,
  delay: null,
  hourglass: 'special-magic',
  'entry-serin': null,
  prayer: null,
  comfort: null,
  'entry-vesper': 'dark',
  corrosion: null,
  'raven-ward': null,
  'entry-rook': 'special-weapon',
  snipe: 'special-weapon',
  provisions: null,
  'entry-qingyuan': 'wind',
  'generated-1': null,
  'generated-2': 'wind',
  'gravity-singularity': 'special-magic',
  'tidal-moonlight': 'special-magic',
  'cinnabar-eclipse': 'special-magic',
  'entry-pandora': null,
  'crowned-doll': 'special-magic',
  'clock-bind': null,
  'angel-arrival': null,
  'angel-song': null,
  'guardian-wings': null,
  'owl-pounce': 'brawl',
  'wind-assault': 'wind',
  'keen-sight': null,
  'feather-downbeat': 'special-magic',
  'star-trace-variation': 'special-magic',
  'amber-song': null,
  'luo-entry': 'spear',
  junlue: 'spear',
  yiming: null,
  'silica-entry': 'special-magic',
  'soul-banquet': null,
  'soul-revive': null,
  'uni-feint-retreat': 'sword',
  'uni-serrated-cut': 'sword',
  'uni-smoke-veil': 'wind',
  'uni-quickstep-order': null,
  'uni-aerial-vault': 'spear',
  'uni-venom-thorn': 'dark',
  'uni-shackle-sigil': 'dark',
  'uni-bastion-oath': null,
  'uni-purify-grace': null,
  'uni-mana-conduit': null,
  'uni-thunder-cleave': 'lightning',
  'uni-crimson-reap': 'special-weapon',
  'uni-axe-cleave': 'axe',
  'uni-iron-knuckle': 'brawl',
  'uni-ember-flare': 'fire',
  'uni-glacier-spike': 'ice',
  'uni-radiant-lance': 'light',
  'uni-astral-beam': 'special-magic',
  'emblem-balance': null,
  'emblem-overload': null,
  'emblem-dragon-vein': null,
  'emblem-deceit-sacrifice': null,
  'emblem-moon-eye': null,
});

const VFX_TO_DAMAGE_TYPE = Object.freeze({
  'sword-slash': 'sword',
  'double-slash': 'sword',
  'heavy-cleave': 'axe',
  'hammer-smash': 'axe',
  'spear-sweep': 'spear',
  thrust: 'spear',
  'blunt-hit': 'brawl',
  uppercut: 'brawl',
  'ground-slam': 'brawl',
  'claw-swipe': 'brawl',
  'dagger-flurry': 'special-weapon',
  'whip-crack': 'special-weapon',
  'scythe-reap': 'special-weapon',
  'bullet-impact': 'special-weapon',
  ricochet: 'special-weapon',
  burning: 'fire',
  'shadow-flames': 'fire',
  'dissolve-burn': 'fire',
  frozen: 'ice',
  geyser: 'ice',
  'wave-crash': 'ice',
  'shatter-death': 'ice',
  'leaf-storm': 'wind',
  tornado: 'wind',
  'vine-whip': 'wind',
  'lightning-strike': 'lightning',
  'chain-lightning': 'lightning',
  thunderclap: 'lightning',
  smite: 'light',
  'holy-pillar': 'light',
  sunburst: 'light',
  'feather-burst': 'light',
  'shadow-tendrils': 'dark',
  'soul-drain': 'dark',
  'black-hole': 'dark',
  'void-orb': 'dark',
  'life-steal': 'special-weapon',
  'hex-sigil': 'dark',
  thorns: 'dark',
  'arcane-missiles': 'special-magic',
  'arcane-beam': 'special-magic',
  'arcane-orb': 'special-magic',
  'mana-burst': 'special-magic',
  'star-fall': 'special-magic',
  'time-stop': 'special-magic',
});

const ATTACK_STYLE_TO_DAMAGE_TYPE = Object.freeze({
  slash: 'sword',
  'corridor-cleave': 'sword',
  'shadow-strike': 'sword',
  cleave: 'axe',
  axe: 'axe',
  pierce: 'spear',
  thrust: 'spear',
  spear: 'spear',
  strike: 'brawl',
  brawl: 'brawl',
  crush: 'brawl',
  smash: 'brawl',
  'slime-bounce': 'wind',
  'mushroom-bonk': 'wind',
  'pebble-shards': 'brawl',
  'claw-pounce': 'brawl',
  'patrol-pounce': 'brawl',
  'stone-slam': 'brawl',
  'gate-crush': 'brawl',
  'warden-fist': 'brawl',
  'crystal-ram': 'brawl',
  'beast-roar': 'brawl',
  'mud-slam': 'dark',
  'beetle-burrow': 'special-weapon',
  'ballista-bolt': 'special-weapon',
  whip: 'special-weapon',
  shot: 'special-weapon',
  'ember-bolt': 'fire',
  'cinder-spark': 'fire',
  fire: 'fire',
  burn: 'fire',
  ice: 'ice',
  frost: 'ice',
  'tide-ribbon': 'ice',
  wind: 'wind',
  gale: 'wind',
  'storm-dive': 'wind',
  'spore-volley': 'dark',
  lightning: 'lightning',
  thunder: 'lightning',
  light: 'light',
  holy: 'light',
  dark: 'dark',
  shadow: 'dark',
  curse: 'dark',
  'specter-wail': 'dark',
  'seeker-pulse': 'special-magic',
  'astral-cascade': 'special-magic',
  'colossus-beam': 'special-magic',
  arcane: 'special-magic',
  time: 'special-magic',
  magic: 'special-magic',
});

const KEYWORD_RULES = [
  ['fire', /炎|焰|火|焚|灼|炽|熔|烬|烈阳|焦|余烬/],
  ['ice', /冰|霜|雪|寒|冻|凝晶|极寒|凛|潮/],
  ['lightning', /雷|电|霆|弧|闪爆|霹雳|电磁|奔雷/],
  ['wind', /风|岚|飓|旋涡|落叶|疾羽|啸风|风刃|烟幕/],
  ['light', /光|圣|辉|耀|日轮|祈|圣光|光矢|炽翼|裁决/],
  ['dark', /暗|影|夜|幽|冥|厄|鸦|毒|蚀|诅|噬魂|黑洞|深渊|瘴/],
  ['special-magic', /时|砂|星|幻|梦|虚空|秘法|奥术|符文|星陨|镜像|时空|炼金|魂印|灵能|奇点|砂针/],
  ['axe', /斧|劈|断钢|战斧|裂地斩|重劈|巨斧|重斩/],
  ['spear', /枪|矛|穿刺|突刺|长枪|贯|投矛|龙枪|跃击/],
  ['brawl', /拳|掌|踢|摔|格斗|轰击|铁拳|重砸|震击|冲击|撞|铁腕|扑击|傀偶|横扫木杆|碎石/],
  ['special-weapon', /鞭|镰|弓|箭|弩|炮|铳|镖|弦|铃|机关|火炮|连弩|飞刃|齿轮|狙击|射击|针/],
  ['sword', /剑|斩|刃|绯|拔刀|剑气|飞剑|斩击|太刀|剑舞|剑华|撤步/],
];

const DAMAGE_TYPE_SET = new Set(DAMAGE_TYPE_IDS);

export function isDamageType(value) {
  return typeof value === 'string' && DAMAGE_TYPE_SET.has(value);
}

export function skillDealsDamage(skillDef) {
  if (!skillDef || typeof skillDef !== 'object') return false;
  if (Array.isArray(skillDef.effects)) {
    if (skillDef.effects.some((eff) => eff && eff.type === 'damage')) return true;
    return Boolean(skillDef.damage || skillDef.power || skillDef.basicAttack);
  }
  return Boolean(skillDef.damage || skillDef.power || skillDef.basicAttack);
}

export function damageTypeMeta(typeOrNull) {
  if (!typeOrNull) return SUPPORT_META;
  if (typeOrNull === SUPPORT_TYPE) return SUPPORT_META;
  if (typeOrNull === UNKNOWN_TYPE) return UNKNOWN_META;
  return DAMAGE_TYPES[typeOrNull] || DAMAGE_TYPES['special-magic'];
}

function matchKeywordType(text, fallback) {
  if (typeof text === 'string' && text.trim()) {
    for (const [typeId, re] of KEYWORD_RULES) {
      if (re.test(text)) return typeId;
    }
  }
  return fallback;
}

export function resolveBasicAttackType(actorDef) {
  if (!actorDef) return 'sword';
  if (isDamageType(actorDef.attackType)) return actorDef.attackType;
  const actorId = typeof actorDef === 'string' ? actorDef : actorDef.baseId || actorDef.id;
  if (actorId && OFFICIAL_ACTOR_ATTACK_TYPES[actorId]) {
    return OFFICIAL_ACTOR_ATTACK_TYPES[actorId];
  }
  const styleKey = String(actorDef.attackStyle || actorDef.style || '').toLowerCase();
  if (ATTACK_STYLE_TO_DAMAGE_TYPE[styleKey]) {
    return ATTACK_STYLE_TO_DAMAGE_TYPE[styleKey];
  }
  const vfxKey = String(actorDef.vfx || '');
  if (VFX_TO_DAMAGE_TYPE[vfxKey]) return VFX_TO_DAMAGE_TYPE[vfxKey];
  const blob = [actorDef.name, actorDef.title, actorDef.role, actorDef.weapon, actorDef.bio]
    .filter(Boolean)
    .join(' ');
  const fallback = actorDef.kind === 'enemy' || actorDef.speed ? 'brawl' : 'sword';
  return matchKeywordType(blob, fallback);
}

export function inferDamageType(skillDef, actorDef = null) {
  if (!skillDef) return resolveBasicAttackType(actorDef);
  if (skillDef.passive) return null;
  if (Array.isArray(skillDef.effects) && !skillDealsDamage(skillDef)) {
    return null;
  }
  if (skillDef.damageType === null || skillDef.damageType === SUPPORT_TYPE) {
    return null;
  }
  if (isDamageType(skillDef.damageType)) {
    return skillDef.damageType;
  }
  if (skillDef.id && Object.hasOwn(OFFICIAL_SKILL_DAMAGE_TYPES, skillDef.id)) {
    return OFFICIAL_SKILL_DAMAGE_TYPES[skillDef.id];
  }
  if (skillDef.vfx && VFX_TO_DAMAGE_TYPE[skillDef.vfx]) {
    return VFX_TO_DAMAGE_TYPE[skillDef.vfx];
  }
  const blob = [skillDef.name, skillDef.text, skillDef.summary, skillDef.tag]
    .filter(Boolean)
    .join(' ');
  const fallback = resolveBasicAttackType(actorDef);
  return matchKeywordType(blob, fallback);
}

export function resolveDamagePixelFx(
  damageType,
  { aoe = false, basic = false, skillDef = null } = {},
) {
  if (skillDef?.vfx) {
    return {
      id: skillDef.vfx,
      palette: skillDef.vfxPalette || null,
      directional: DIRECTIONAL_PIXELFX.has(skillDef.vfx),
    };
  }
  const meta = damageTypeMeta(damageType);
  const fxConfig = meta.fx || DAMAGE_TYPES['special-magic'].fx;
  const fxId = aoe ? fxConfig.aoe : basic ? fxConfig.basic : fxConfig.skill;
  return {
    id: fxId,
    palette: fxConfig.palette || null,
    directional: DIRECTIONAL_PIXELFX.has(fxId),
  };
}

const ICON_SVG_PATHS = Object.freeze({
  sword:
    '<path d="M20.6 3.4l-5.2.9-7.1 7.1-1.9-1.9-1.7 1.7 2.2 2.2-3.5 3.5 1.8 1.8 3.5-3.5 2.2 2.2 1.7-1.7-1.9-1.9 7.1-7.1.9-5.2z" fill="currentColor"/><path d="M5.6 18.4l-2.4 2.4 1.6 1.6 2.4-2.4-1.6-1.6z" fill="currentColor"/>',
  axe: '<path d="M13.5 2.8c4.3 0 7.7 2.8 8.2 7.2-2.9.9-5.4.4-7.2-1.2V21.5h-3V9.1c-1.8.8-3.8 1-6.1.1C6.2 5.1 9.2 2.8 13.5 2.8z" fill="currentColor"/>',
  spear:
    '<path d="M21.2 2.8l-7 2 1.9 1.9L4.2 18.6l1.7 1.7L17.8 8.4l1.9 1.9 1.5-7.5z" fill="currentColor"/><path d="M13.2 5.4l5.4 5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  brawl:
    '<path d="M5.2 10.2V7.4a1.6 1.6 0 0 1 3.2 0v1.8h.8V6.2a1.6 1.6 0 0 1 3.2 0v3h.8V6.7a1.6 1.6 0 0 1 3.2 0v4.3l1.7-1.2a1.6 1.6 0 0 1 2.1 2.4l-3.7 4.8a4.2 4.2 0 0 1-3.3 1.7H9.6a3.8 3.8 0 0 1-4.4-3.7v-4.8z" fill="currentColor"/>',
  'special-weapon':
    '<path fill-rule="evenodd" d="M12 2.2l2.1 4.1 4.5-1.1-1.1 4.5 4.1 2.3-4.1 2.1 1.1 4.5-4.5-1.1L12 21.8l-2.1-4.1-4.5 1.1 1.1-4.5L2.4 12l4.1-2.3-1.1-4.5 4.5 1.1L12 2.2zm0 6.8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill="currentColor"/>',
  fire: '<path fill-rule="evenodd" d="M13.4 2.2c.9 3.3-1.1 5.1-1.1 7.4 0 1.4 1 2.3 2.2 2.3 1.5 0 2.5-1.5 2.2-3.6 2.7 1.8 4.1 4.4 4.1 7.2a8.2 8.2 0 0 1-8.8 7.3A8 8 0 0 1 3.8 15c0-3.5 2.1-6.8 5.2-8.7-.4 1.9.3 3.4 1.6 4.1-.3-2.8.8-5.9 2.8-8.2zM12 14.2c-1.4 1.2-2.2 2.5-2.2 3.8a2.3 2.3 0 0 0 4.6 0c0-1.3-.9-2.5-2.4-3.8z" fill="currentColor"/>',
  ice: '<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><path d="M9.6 4.6L12 7l2.4-2.4M9.6 19.4L12 17l2.4 2.4M4.8 10.2L7.7 9.5 6.8 6.6M19.2 13.8l-2.9.7.9 2.9M19.2 10.2l-2.9-.7.9-2.9M4.8 13.8l2.9.7-.9 2.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><polygon points="12,9.2 14.5,12 12,14.8 9.5,12" fill="currentColor"/>',
  wind: '<path d="M2.5 8.5h11a2.6 2.6 0 1 0-2.5-3.3M2.5 13h15.2a2.9 2.9 0 1 1-2.7 3.9M2.5 17.5h8.8a2.3 2.3 0 1 1-2.2 3.1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  lightning: '<path d="M14.4 1.8L4.8 13.2h5.8l-1.8 9 10.4-12.1h-5.8l1-8.3z" fill="currentColor"/>',
  light:
    '<path d="M12 1.8l2.5 6.2 6.2 2.5-6.2 2.5L12 19.2l-2.5-6.2L3.3 10.5l6.2-2.5L12 1.8z" fill="currentColor"/><path d="M5.2 4.8l2.4 2.4M18.8 4.8l-2.4 2.4M5.2 16.2l2.4-2.4M18.8 16.2l-2.4-2.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  dark: '<path d="M14.6 2.8a9.2 9.2 0 1 0 6.8 13.7A7.2 7.2 0 0 1 14.6 2.8z" fill="currentColor"/><polygon points="17.2,5.6 18,7.4 19.8,8.2 18,9 17.2,10.8 16.4,9 14.6,8.2 16.4,7.4" fill="currentColor"/>',
  'special-magic':
    '<circle cx="12" cy="12" r="8.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.6l2.4 5.5 5.8.7-4.3 4 1.1 5.8-5-2.8-5 2.8 1.1-5.8-4.3-4 5.8-.7L12 2.6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/>',
  [SUPPORT_TYPE]:
    '<path fill-rule="evenodd" d="M12 2.5l7.2 3.3v5.6c0 5-3.1 9.1-7.2 10.3-4.1-1.2-7.2-5.3-7.2-10.3V5.8L12 2.5zm-1.4 4.8v3.1H7.5v2.8h3.1v3.1h2.8v-3.1h3.1v-2.8h-3.1V7.3h-2.8z" fill="currentColor"/>',
  [UNKNOWN_TYPE]:
    '<path d="M8.8 8.6a3.4 3.4 0 0 1 6.7-.1c0 1.6-1 2.4-2 3.1-.9.6-1.2 1.1-.8 2.4h-2.2c-.4-1.6.1-2.7 1.2-3.5.9-.7 1.4-1.1 1.4-1.9a1.2 1.2 0 0 0-2.4-.2l-1.9.2z" fill="currentColor"/><circle cx="11.8" cy="17.6" r="1.6" fill="currentColor"/>',
});

export function damageTypeIcon(typeOrNull, opts = {}) {
  const key =
    typeOrNull === UNKNOWN_TYPE
      ? UNKNOWN_TYPE
      : typeOrNull && isDamageType(typeOrNull)
        ? typeOrNull
        : SUPPORT_TYPE;
  const meta = damageTypeMeta(key);
  const size = Number.isFinite(opts.size) ? opts.size : 16;
  const cls = opts.className ? ` ${opts.className}` : '';
  const style = opts.tint === false ? '' : ` style="color:${meta.color}"`;
  const titleAttr = opts.title ? ` title="${String(opts.title).replace(/"/g, '&quot;')}"` : '';
  return `<svg class="dmg-type-svg is-${key}${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" shape-rendering="geometricPrecision" aria-hidden="true"${style}${titleAttr}>${ICON_SVG_PATHS[key]}</svg>`;
}

export function damageTypeChip(typeOrNull, opts = {}) {
  const key =
    typeOrNull === UNKNOWN_TYPE
      ? UNKNOWN_TYPE
      : typeOrNull && isDamageType(typeOrNull)
        ? typeOrNull
        : SUPPORT_TYPE;
  const meta = damageTypeMeta(key);
  const label = opts.short ? meta.short : meta.name;
  const showLabel = opts.showLabel === true;
  const matchedCls = opts.matched ? ' is-matched' : '';
  const extraCls = opts.className ? ` ${opts.className}` : '';
  return `<span class="dmg-type-chip is-${key}${matchedCls}${extraCls}" style="--dmg-color:${meta.color};--dmg-glow:${meta.glow}" title="${meta.name}" aria-label="${meta.name}">${damageTypeIcon(key, { size: opts.size || 15, tint: false })}${showLabel ? `<span class="dmg-type-label">${label}</span>` : ''}</span>`;
}
