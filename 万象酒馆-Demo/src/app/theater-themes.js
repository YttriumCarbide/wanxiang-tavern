import { BIOMES } from '../content/biomes.js';
import { REGIONS } from '../content/regions.js';
export {
  buildAstrolabeBackdropSvg,
  buildCornerFiligreeSvg,
  buildDividerDiamondSvg,
  buildWaxSealSvg,
} from '../shared/fantasy-ornaments.js';

const ROMAN_ACTS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const VERIFIED_ARTWORK = {
  mill: {
    intro: './assets/events/forest-event.png',
    epilogue: './assets/events/forest-quest.png',
  },
  ruins: {
    intro: './assets/events/ruins-event.png',
    epilogue: './assets/events/ruins-quest.png',
  },
  forest: {
    intro: './assets/events/forest-event.png',
    epilogue: './assets/events/forest-quest.png',
  },
  frost: {
    intro: './assets/events/frost-event.png',
    epilogue: './assets/events/frost-quest.png',
  },
  forge: {
    intro: './assets/events/forge-event.png',
    epilogue: './assets/events/forge-quest.png',
  },
  tide: {
    intro: './assets/events/tide-event.png',
    epilogue: './assets/events/tide-quest.png',
  },
  dynasty: {
    intro: './assets/events/ruins-quest.png',
    epilogue: './assets/events/ruins-event.png',
  },
  xianxia: {
    intro: './assets/events/forest-quest.png',
    epilogue: './assets/events/forest-event.png',
  },
  castle: {
    intro: './assets/events/ruins-quest.png',
    epilogue: './assets/title-tavern.png',
  },
  arcane: {
    intro: './assets/events/tide-quest.png',
    epilogue: './assets/events/ruins-quest.png',
  },
  metropolis: {
    intro: './assets/title-tavern.png',
    epilogue: './assets/exploration/overland-road/road-bridge-wide-night.png',
  },
  nexus: {
    intro: './assets/events/tide-event.png',
    epilogue: './assets/events/ruins-quest.png',
  },
  wasteland: {
    intro: './assets/events/forge-event.png',
    epilogue: './assets/events/forge-quest.png',
  },
  relic: {
    intro: './assets/events/ruins-quest.png',
    epilogue: './assets/events/ruins-event.png',
  },
  tavern: {
    intro: './assets/title-tavern.png',
    epilogue: './assets/title-tavern.png',
  },
  overland: {
    intro: './assets/exploration/overland-road/road-ridge-wide.png',
    epilogue: './assets/exploration/overland-road/road-bridge-wide-night.png',
  },
};

const BIOME_PROFILE = {
  mill: {
    seal: '磨',
    sealColor: '#3f6a45',
    moteTone: 'gold',
    petalVariant: 'emerald',
    cueGroup: 'forest',
    subtitle: '绿蕨磨坊 · 纪行',
    beams: 'bright',
    glow: 'radial-gradient(ellipse at 52% 46%, rgba(84, 146, 86, 0.22) 0%, rgba(212, 184, 108, 0.1) 42%, transparent 74%)',
  },
  ruins: {
    seal: '纪',
    sealColor: '#8b1e24',
    moteTone: 'gold',
    petalVariant: 'crimson',
    cueGroup: 'ruins',
    subtitle: '界隙古墟 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 50% 48%, rgba(163, 42, 48, 0.2) 0%, rgba(212, 175, 55, 0.09) 38%, transparent 72%)',
  },
  forest: {
    seal: '林',
    sealColor: '#365f3d',
    moteTone: 'gold',
    petalVariant: 'emerald',
    cueGroup: 'forest',
    subtitle: '暮林幽径 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 54% 46%, rgba(44, 108, 86, 0.24) 0%, rgba(196, 178, 108, 0.08) 42%, transparent 74%)',
  },
  frost: {
    seal: '霜',
    sealColor: '#31547b',
    moteTone: 'ivory',
    petalVariant: 'frost',
    cueGroup: 'frost',
    subtitle: '寒脊雪原 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 52% 48%, rgba(62, 128, 184, 0.24) 0%, rgba(212, 175, 55, 0.07) 40%, transparent 74%)',
  },
  forge: {
    seal: '烬',
    sealColor: '#9c321e',
    moteTone: 'ember',
    petalVariant: 'ember',
    cueGroup: 'forge',
    subtitle: '熔炉深渊 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 48% 52%, rgba(208, 78, 32, 0.24) 0%, rgba(212, 160, 64, 0.09) 42%, transparent 74%)',
  },
  tide: {
    seal: '汐',
    sealColor: '#255c72',
    moteTone: 'ivory',
    petalVariant: 'dawn',
    cueGroup: 'tide',
    subtitle: '潮声迷港 · 纪行',
    beams: 'bright',
    glow: 'radial-gradient(ellipse at 56% 42%, rgba(56, 146, 178, 0.22) 0%, rgba(242, 208, 128, 0.1) 42%, transparent 74%)',
  },
  dynasty: {
    seal: '卷',
    sealColor: '#8b1e24',
    moteTone: 'gold',
    petalVariant: 'crimson',
    cueGroup: 'ruins',
    subtitle: '山河旧阙 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 50% 48%, rgba(154, 42, 42, 0.22) 0%, rgba(212, 175, 55, 0.1) 40%, transparent 74%)',
  },
  xianxia: {
    seal: '剑',
    sealColor: '#295e66',
    moteTone: 'ivory',
    petalVariant: 'dawn',
    cueGroup: 'forest',
    subtitle: '青冥问剑 · 纪行',
    beams: 'bright',
    glow: 'radial-gradient(ellipse at 55% 40%, rgba(72, 164, 152, 0.2) 0%, rgba(235, 206, 134, 0.1) 42%, transparent 74%)',
  },
  castle: {
    seal: '勋',
    sealColor: '#7b222e',
    moteTone: 'gold',
    petalVariant: 'crimson',
    cueGroup: 'ruins',
    subtitle: '尖塔王庭 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 50% 48%, rgba(152, 34, 48, 0.24) 0%, rgba(212, 175, 55, 0.09) 40%, transparent 74%)',
  },
  arcane: {
    seal: '星',
    sealColor: '#434182',
    moteTone: 'ivory',
    petalVariant: 'frost',
    cueGroup: 'ruins',
    subtitle: '星轨秘仪 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 50% 48%, rgba(96, 98, 196, 0.22) 0%, rgba(212, 175, 55, 0.09) 42%, transparent 74%)',
  },
  metropolis: {
    seal: '契',
    sealColor: '#784622',
    moteTone: 'ember',
    petalVariant: 'crimson',
    cueGroup: 'forge',
    subtitle: '长夜钟街 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 50% 50%, rgba(188, 118, 46, 0.22) 0%, rgba(212, 175, 55, 0.08) 42%, transparent 74%)',
  },
  nexus: {
    seal: '隙',
    sealColor: '#365c78',
    moteTone: 'ivory',
    petalVariant: 'dawn',
    cueGroup: 'tide',
    subtitle: '交错界廊 · 纪行',
    beams: 'bright',
    glow: 'radial-gradient(ellipse at 52% 46%, rgba(82, 152, 198, 0.22) 0%, rgba(235, 204, 134, 0.1) 42%, transparent 74%)',
  },
  wasteland: {
    seal: '荒',
    sealColor: '#84422a',
    moteTone: 'ember',
    petalVariant: 'ember',
    cueGroup: 'forge',
    subtitle: '灰烬焦原 · 纪行',
    beams: 'soft',
    glow: 'radial-gradient(ellipse at 50% 50%, rgba(188, 86, 42, 0.22) 0%, rgba(212, 175, 55, 0.08) 42%, transparent 74%)',
  },
  relic: {
    seal: '遗',
    sealColor: '#7a4d22',
    moteTone: 'gold',
    petalVariant: 'dawn',
    cueGroup: 'ruins',
    subtitle: '太古圣骸 · 纪行',
    beams: 'bright',
    glow: 'radial-gradient(ellipse at 50% 48%, rgba(182, 128, 48, 0.22) 0%, rgba(244, 212, 130, 0.1) 42%, transparent 74%)',
  },
};

function toRomanAct(act) {
  const index = Math.max(1, Number(act) || 1) - 1;
  return ROMAN_ACTS[index] || String(act || 1);
}

/** Resolve palette, artwork, crest, particles, and cues for a fullscreen Theater appearance. */
export function resolveTheaterTheme({ map = 'ruins', mode = 'intro', place = '', act = 1 } = {}) {
  const biomeKey = BIOMES[map] ? map : REGIONS[map]?.biome || 'ruins';
  const biome = BIOMES[biomeKey] || BIOMES.ruins;
  const profile = BIOME_PROFILE[biomeKey] || BIOME_PROFILE.ruins;
  const isEpilogue = mode === 'epilogue' || mode === 'overland-epilogue';
  const isInvitation = mode === 'invitation';
  const isOverland = mode === 'overland-intro' || mode === 'overland-epilogue';
  const isEventOpening = mode === 'event-opening';
  const isQuestOpening = mode === 'quest-opening';
  const isSingleOpening = isEventOpening || isQuestOpening;
  const roman = toRomanAct(act);

  let seal = profile.seal;
  let sealColor = profile.sealColor;
  let moteTone = profile.moteTone;
  let petalVariant = profile.petalVariant;
  let cueGroup = profile.cueGroup;
  let beamIntensity = profile.beams;
  let glow = profile.glow;
  const artworkEntry =
    VERIFIED_ARTWORK[biomeKey] || VERIFIED_ARTWORK[profile.cueGroup] || VERIFIED_ARTWORK.ruins;
  let artwork = artworkEntry[isEpilogue || isQuestOpening ? 'epilogue' : 'intro'];
  let subtitle = place
    ? `${biome.name} · ${place}`
    : `${biome.name} · ${profile.subtitle.split(' · ')[0]}`;
  let badge = `泛生界 1463 年 · 第 ${act || 1} 幕`;
  let barLeft = `MAIN CHRONICLE · ACT ${roman}`;
  let barRight = '主线剧情报幕';
  let actEn = `CHAPTER ${roman} · PROLOGUE`;
  let veilLabel = '踏 入 舞 台 · ENTERING STAGE';

  if (isInvitation) {
    seal = '邀';
    sealColor = '#8f292e';
    moteTone = 'gold';
    petalVariant = 'crimson';
    cueGroup = 'tavern';
    beamIntensity = 'bright';
    artwork = VERIFIED_ARTWORK.tavern.intro;
    subtitle = place ? `万界酒馆 · ${place}` : '万界酒馆 · 炉畔邀约';
    badge = '泛生界 1463 年 · 支援断章';
    barLeft = 'TAVERN CHRONICLE · INVITATION';
    barRight = '炉畔邀约报幕';
    actEn = 'SIDE CHRONICLE · INVITATION';
    veilLabel = '展 开 幕 间 · ENTERING SCENE';
    glow =
      'radial-gradient(ellipse at 52% 48%, rgba(212, 134, 48, 0.24) 0%, rgba(163, 42, 48, 0.1) 42%, transparent 74%)';
  } else if (isOverland) {
    seal = isEpilogue ? '归' : '行';
    sealColor = isEpilogue ? '#5c313b' : '#7b4924';
    moteTone = isEpilogue ? 'ivory' : 'gold';
    petalVariant = isEpilogue ? 'dawn' : profile.petalVariant;
    cueGroup = isEpilogue ? 'epilogue' : profile.cueGroup;
    beamIntensity = 'bright';
    artwork = VERIFIED_ARTWORK.overland[isEpilogue ? 'epilogue' : 'intro'];
    subtitle = place ? `界外行纪 · ${place}` : '界外行纪 · 途次记录';
    badge = `泛生界 1463 年 · ${isEpilogue ? '归途余韵' : '界外行旅'}`;
    barLeft = isEpilogue ? 'OVERLAND CHRONICLE · RETURN' : 'OVERLAND MARCH · DEPARTURE';
    barRight = isEpilogue ? '归途尾声报幕' : '界外行纪报幕';
    actEn = isEpilogue ? 'EPILOGUE · JOURNEY RETURN' : 'OVERLAND · WAYPOINT CHRONICLE';
    veilLabel = isEpilogue ? '返 归 酒 馆 · JOURNEY SAVED' : '踏 上 远 途 · DEPARTING';
  } else if (isEventOpening) {
    seal = '抉';
    sealColor = '#99262a';
    moteTone = 'ember';
    petalVariant = 'ember';
    beamIntensity = 'soft';
    subtitle = `${biome.name} · 旅途岔口`;
    badge = '命运岔路 · 抉择事件';
    barLeft = 'CHRONICLE ENCOUNTER · FATEFUL CHOICE';
    barRight = '旅途片刻 · 抉择';
    actEn = 'ENCOUNTER · CROSSROADS';
    veilLabel = '抉 择 将 至 · CHOICE AWAITS';
    glow =
      'radial-gradient(ellipse at 50% 28%, rgba(226, 132, 46, 0.28) 0%, rgba(154, 34, 42, 0.16) 44%, rgba(6, 5, 8, 0.9) 82%)';
  } else if (isQuestOpening) {
    seal = '探';
    sealColor = '#1e5b6e';
    moteTone = 'ivory';
    petalVariant = 'frost';
    beamIntensity = 'bright';
    subtitle = `${biome.name} · 自由行域`;
    badge = '歧路游历 · 自由探索';
    barLeft = 'OPEN EXPLORATION · STARLIT PATH';
    barRight = '歧路之间 · 探索';
    actEn = 'EXPLORATION · OPEN HORIZON';
    veilLabel = '探 索 展 开 · EXPLORING';
    glow =
      'radial-gradient(ellipse at 34% 38%, rgba(66, 166, 196, 0.24) 0%, rgba(44, 78, 152, 0.16) 44%, rgba(6, 7, 14, 0.9) 84%)';
  } else if (isEpilogue) {
    seal = '终';
    sealColor = '#7d1e28';
    moteTone = 'ivory';
    petalVariant = 'dawn';
    cueGroup = 'epilogue';
    beamIntensity = 'bright';
    subtitle = place ? `${place} · 尾声` : `${biome.name} · 战后余韵`;
    badge = `泛生界 1463 年 · 第 ${act || 1} 幕完`;
    barLeft = `CHAPTER ${roman} · MAIN CHRONICLE COMPLETED`;
    barRight = '终幕尾声报幕';
    actEn = `CHAPTER ${roman} · CHRONICLE FINALE`;
    veilLabel = '终 幕 落 成 · CHRONICLE FINISHED';
    glow =
      'radial-gradient(ellipse at 64% 34%, rgba(255, 228, 158, 0.22) 0%, rgba(16, 13, 18, 0.35) 55%, rgba(6, 5, 8, 0.92) 100%)';
  }

  return {
    key: isInvitation ? 'tavern' : isOverland ? 'overland' : biomeKey,
    mode,
    isEpilogue,
    isInvitation,
    isOverland,
    isEventOpening,
    isQuestOpening,
    isSingleOpening,
    roman,
    seal,
    sealColor,
    moteTone,
    petalVariant,
    cueGroup,
    beamIntensity,
    glow,
    artwork,
    subtitle,
    badge,
    barLeft,
    barRight,
    actEn,
    veilLabel,
    accent: isEventOpening
      ? '#e69b45'
      : isQuestOpening
        ? '#5cc4d8'
        : isInvitation
          ? '#e4b958'
          : biome.accent || '#d4af37',
  };
}

/** Stroke-drawn crossroads scales & diamond fulcrum crest for Event openings. */
export function buildEventOpeningCrestSvg() {
  return `
    <svg viewBox="0 0 180 76" class="chapter-theater-opening-crest-svg is-event" fill="none" aria-hidden="true">
      <path d="M90 12 L90 60" stroke="#f0c772" stroke-width="1.6" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:60;--draw-dur:0.55s;--draw-delay:0.05s" />
      <path d="M36 28 C58 22, 122 22, 144 28" stroke="#f6d88c" stroke-width="1.5" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:120;--draw-dur:0.65s;--draw-delay:0.15s" />
      <path d="M40 28 L30 50 L50 50 Z" stroke="#e48f48" stroke-width="1.35" stroke-linejoin="round" fill="rgba(228,143,72,0.12)" class="ct-draw-stroke" style="--dash-len:90;--draw-dur:0.55s;--draw-delay:0.28s" />
      <path d="M140 28 L130 50 L150 50 Z" stroke="#e48f48" stroke-width="1.35" stroke-linejoin="round" fill="rgba(228,143,72,0.12)" class="ct-draw-stroke" style="--dash-len:90;--draw-dur:0.55s;--draw-delay:0.28s" />
      <polygon points="90,8 97,22 90,36 83,22" fill="rgba(246,204,116,0.28)" stroke="#fff1be" stroke-width="1.2" class="ct-draw-stroke" style="--dash-len:70;--draw-dur:0.5s;--draw-delay:0.2s" />
      <path d="M68 62 L112 62" stroke="#d97254" stroke-width="1.4" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:50;--draw-dur:0.45s;--draw-delay:0.35s" />
    </svg>`;
}

/** Stroke-drawn astral compass & horizon lantern crest for Free Exploration openings. */
export function buildQuestOpeningCrestSvg() {
  return `
    <svg viewBox="0 0 180 76" class="chapter-theater-opening-crest-svg is-quest" fill="none" aria-hidden="true">
      <path d="M24 52 Q90 22 156 52" stroke="#7dd4e8" stroke-width="1.4" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:150;--draw-dur:0.65s;--draw-delay:0.08s" />
      <circle cx="90" cy="36" r="18" stroke="#62b6cb" stroke-width="1.15" stroke-dasharray="3 4" opacity="0.72" />
      <polygon points="90,10 95,31 116,36 95,41 90,62 85,41 64,36 85,31" fill="rgba(125,212,232,0.22)" stroke="#e9f8fc" stroke-width="1.2" class="ct-draw-stroke" style="--dash-len:180;--draw-dur:0.75s;--draw-delay:0.18s" />
      <circle cx="44" cy="40" r="2.2" fill="#9de2f2" opacity="0.85" />
      <circle cx="136" cy="40" r="2.2" fill="#9de2f2" opacity="0.85" />
    </svg>`;
}

/** Stroke-drawn golden laurel and crossed swords heraldic crest for Epilogue scenes. */
export function buildEpilogueLaurelSvg() {
  return `
    <svg viewBox="0 0 180 86" class="chapter-theater-laurel-svg" fill="none" aria-hidden="true">
      <path d="M84 74 C52 72, 26 52, 28 20" stroke="#ebd07e" stroke-width="1.6" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:140;--draw-dur:1.3s;--draw-delay:0.15s" />
      <path d="M96 74 C128 72, 154 52, 152 20" stroke="#ebd07e" stroke-width="1.6" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:140;--draw-dur:1.3s;--draw-delay:0.15s" />
      <path d="M54 66 L124 14" stroke="#fff3cb" stroke-width="1.8" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:110;--draw-dur:1.0s;--draw-delay:0.45s" />
      <path d="M126 66 L56 14" stroke="#fff3cb" stroke-width="1.8" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:110;--draw-dur:1.0s;--draw-delay:0.45s" />
      <path d="M60 51 L72 62 M120 51 L108 62" stroke="#d4af37" stroke-width="2.2" stroke-linecap="round" class="ct-draw-stroke" style="--dash-len:50;--draw-dur:0.65s;--draw-delay:0.95s" />
      <polygon points="90,14 95,33 114,38 95,43 90,62 85,43 66,38 85,33" fill="#f7df94" fill-opacity="0.22" stroke="#f4d884" stroke-width="1.1" class="ct-draw-stroke" style="--dash-len:200;--draw-dur:1.2s;--draw-delay:0.75s" />
      <g class="chapter-theater-laurel-leaves" fill="#e8c76c" fill-opacity="0.82">
        <ellipse cx="40" cy="48" rx="6" ry="2.2" transform="rotate(-35 40 48)" />
        <ellipse cx="33" cy="34" rx="5.5" ry="2" transform="rotate(-15 33 34)" />
        <ellipse cx="52" cy="61" rx="6" ry="2.2" transform="rotate(-55 52 61)" />
        <ellipse cx="140" cy="48" rx="6" ry="2.2" transform="rotate(35 140 48)" />
        <ellipse cx="147" cy="34" rx="5.5" ry="2" transform="rotate(15 147 34)" />
        <ellipse cx="128" cy="61" rx="6" ry="2.2" transform="rotate(55 128 61)" />
      </g>
    </svg>`;
}

/** Calligraphic "— Fin —" emblem SVG modeled on MainQuestEndingScene. */
export function buildFinCalligraphySvg() {
  return `
    <svg viewBox="0 0 180 62" class="chapter-theater-fin-svg" fill="none" aria-label="Fin">
      <path d="M36 16 C48 10, 72 10, 82 14 M58 13 C52 28, 45 46, 36 53 M44 33 C54 31, 64 31, 72 32" stroke="#fff0be" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="ct-draw-stroke" style="--dash-len:220;--draw-dur:1.15s;--draw-delay:0.45s" />
      <path d="M90 29 C88 37, 86 45, 92 48 C95 49, 98 46, 100 43 M93 19 L94 21" stroke="#fff0be" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="ct-draw-stroke" style="--dash-len:90;--draw-dur:0.65s;--draw-delay:0.85s" />
      <path d="M107 47 C109 38, 112 31, 117 29 C121 28, 122 36, 121 46 C124 37, 130 29, 136 29 C140 29, 139 40, 141 46 C144 50, 152 46, 160 39" stroke="#fff0be" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="ct-draw-stroke" style="--dash-len:170;--draw-dur:0.95s;--draw-delay:1.1s" />
    </svg>`;
}

/** Deterministic rising dust motes matching GoldenDustMotes parameters. */
export function buildTheaterParticles(tone = 'gold', count = 24) {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 73 + 19) % 100;
    const size = 2 + (seed % 4);
    const duration = 9 + (seed % 11);
    return {
      tone,
      left: ((i * 37 + 11) % 96) + 2,
      size,
      duration,
      delay: -((i * 1.7) % duration),
      sway: (i % 2 === 0 ? 1 : -1) * (16 + (seed % 34)),
      opacity: (0.35 + (seed % 5) * 0.11).toFixed(2),
      blur: size > 4 ? 1.5 : 0.4,
    };
  });
}

/** Deterministic 3D tumbling petals / snow shards matching FallingPetals parameters. */
export function buildTheaterPetals(variant = 'crimson', count = 18) {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 59 + 29) % 100;
    const width = 6 + (seed % 7);
    const duration = 9 + (seed % 9);
    return {
      variant,
      left: (i * 29 + 5) % 98,
      width,
      height: Math.round(width * 0.62),
      duration,
      delay: -((i * 1.45) % duration),
      drift: 40 + (seed % 85),
      opacity: (0.45 + (seed % 5) * 0.1).toFixed(2),
    };
  });
}

/** Resolve the procedural audio cue name for a Theater entrance. */
export function theaterCurtainCue(theme, mode) {
  if (mode === 'epilogue' || mode === 'overland-epilogue') return 'theater-curtain-epilogue';
  return `theater-curtain-${theme.cueGroup || 'ruins'}`;
}
