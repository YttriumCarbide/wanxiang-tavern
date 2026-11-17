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
    '<path d="M19.5 3.5L15 4.2l-6.6 6.6-2-2-1.8 1.8 2.1 2.1L3.5 16l1.5 1.5 3.3-3.2 2.1 2.1 1.8-1.8-2-2 6.6-6.6.7-4.5z" fill="currentColor"/><path d="M6.2 17.8l-2 2.7 2.7-2z" fill="currentColor"/>',
  axe: '<path d="M13 3c4 0 7.2 2.6 8 6.4-2.8.8-5.3.2-7-1.4v12.5h-2.5V8.7c-1.5.7-3.4.9-5.5.2C6.8 5.2 9.5 3 13 3z" fill="currentColor"/>',
  spear:
    '<path d="M20.5 3.5l-6.2 1.8 1.7 1.7-12 12 1.4 1.4 12-12 1.7 1.7 1.4-6.6z" fill="currentColor"/>',
  brawl:
    '<path d="M6 10.5V7.8a1.5 1.5 0 0 1 3 0V9.5h1V6.8a1.5 1.5 0 0 1 3 0V9.5h1V7.3a1.5 1.5 0 0 1 3 0v4.4l1.5-1.1a1.5 1.5 0 0 1 2 2.2l-3.4 4.3a4 4 0 0 1-3.1 1.5H9.5A3.5 3.5 0 0 1 6 15.1v-4.6z" fill="currentColor"/>',
  'special-weapon':
    '<path d="M12 3a8 8 0 0 0-8 8c0 3.7 2.5 6.8 6 7.7V21h4v-2.3c3.5-.9 6-4 6-7.7a8 8 0 0 0-8-8zm0 3a5 5 0 0 1 5 5h-3a2 2 0 1 0-4 0H7a5 5 0 0 1 5-5z" fill="currentColor"/><circle cx="12" cy="11" r="1.8" fill="currentColor"/>',
  fire: '<path d="M13.2 2.5c.8 3.1-1.3 4.8-1.3 7.2 0 1.4 1 2.3 2.1 2.3 1.4 0 2.3-1.4 2.1-3.4 2.3 1.6 3.7 4.1 3.7 6.8A7.8 7.8 0 0 1 12 22a7.5 7.5 0 0 1-7.5-7.5c0-3.3 2.1-6.5 4.9-8.1-.4 1.8.2 3.3 1.5 3.9-.3-2.6.6-5.5 2.3-7.8z" fill="currentColor"/>',
  ice: '<path d="M11 2h2v4.1l2.7-1.6 1 1.7-3.7 2.2v2.4l2.1-1.2 1-1.7 1.7 1-.9 1.6 2.8 1.6-1 1.7-2.8-1.6-1 1.7-1.7-1 1-1.7L13 13v2.4l3.7 2.2-1 1.7L13 17.9V22h-2v-4.1l-2.7 1.4-1-1.7L11 15.4V13l-2.2 1.2 1 1.7-1.7 1-1-1.7-2.8 1.6-1-1.7 2.8-1.6-.9-1.6 1.7-1 1 1.7L11 10.8V8.4L7.3 6.2l1-1.7L11 6.1V2z" fill="currentColor"/>',
  wind: '<path d="M3 9h10.5a2.5 2.5 0 1 0-2.4-3.1l-1.9-.6A4.5 4.5 0 1 1 13.5 11H3V9zm0 4h14a3 3 0 1 1-2.8 4l1.9-.7A1 1 0 1 0 17 15H3v-2zm0 4h8a2.5 2.5 0 1 1-2.3 3.4l1.8-.8a.5.5 0 1 0 .5-.6H3v-2z" fill="currentColor"/>',
  lightning: '<path d="M13.8 2L5.5 13h5.3l-1.6 9 9.3-11.5h-5.3L13.8 2z" fill="currentColor"/>',
  light:
    '<path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2L12 2zm0 5.1L10.9 9.9 8.1 11l2.8 1.1L12 14.9l1.1-2.8 2.8-1.1-2.8-1.1L12 7.1z" fill="currentColor"/>',
  dark: '<path d="M14.8 3.2A8.8 8.8 0 1 0 20.8 16a7 7 0 0 1-6-12.8z" fill="currentColor"/><circle cx="16.5" cy="7.5" r="1.5" fill="currentColor"/>',
  'special-magic':
    '<path d="M12 2.5l2.7 5.2 5.8.9-4.1 4.1.9 5.8-5.3-2.7-5.3 2.7.9-5.8-4.1-4.1 5.8-.9L12 2.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  [SUPPORT_TYPE]:
    '<path d="M12 3l6.5 3.1v5.2c0 4.6-2.8 8.5-6.5 9.7-3.7-1.2-6.5-5.1-6.5-9.7V6.1L12 3zm-1 4.5v3H8v2h3v3h2v-3h3v-2h-3v-3h-2z" fill="currentColor"/>',
  [UNKNOWN_TYPE]:
    '<path d="M9.1 8.8A3 3 0 0 1 12 6a2.8 2.8 0 0 1 3 2.7c0 1.4-.9 2.1-1.9 2.8-.8.6-1.1 1-.1 2.2H11c-.4-1.5 0-2.5 1-3.3.8-.6 1.2-1 1.2-1.7a1 1 0 0 0-1.2-.9c-.7 0-1.1.4-1.3 1.1L9.1 8.8z" fill="currentColor"/><circle cx="12" cy="17.2" r="1.4" fill="currentColor"/>',
});

export function damageTypeIcon(typeOrNull, opts = {}) {
  const key =
    typeOrNull === UNKNOWN_TYPE
      ? UNKNOWN_TYPE
      : typeOrNull && isDamageType(typeOrNull)
        ? typeOrNull
        : SUPPORT_TYPE;
  const meta = damageTypeMeta(key);
  const size = Number.isFinite(opts.size) ? opts.size : 14;
  const cls = opts.className ? ` ${opts.className}` : '';
  const style = opts.tint === false ? '' : ` style="color:${meta.color}"`;
  const titleAttr = opts.title ? ` title="${String(opts.title).replace(/"/g, '&quot;')}"` : '';
  return `<svg class="dmg-type-svg is-${key}${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"${style}${titleAttr}>${ICON_SVG_PATHS[key]}</svg>`;
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
  const showLabel = opts.showLabel !== false;
  const matchedCls = opts.matched ? ' is-matched' : '';
  return `<span class="dmg-type-chip is-${key}${matchedCls}" style="--dmg-color:${meta.color};--dmg-glow:${meta.glow}" title="${meta.name}">${damageTypeIcon(key, { size: opts.size || 13, tint: false })}${showLabel ? `<span class="dmg-type-label">${label}</span>` : ''}</span>`;
}
