const S = 'var(--quest-wing-stroke)';
const SUB = 'var(--quest-wing-subtle)';
const SOFT = 'var(--quest-wing-soft)';
const FILL = 'var(--quest-wing-fill)';

const CRESTS = Object.freeze({
  main: `<path d="M12 24 C24 24, 31 15, 44 16 C56 17, 60 32, 74 32 C85 32, 92 22, 102 20" stroke="${S}" stroke-width="1.4" fill="none" />
  <path d="M2 24 L26 24" stroke="${SUB}" stroke-width="0.9" />
  <polygon points="2,24 9,21.5 13,24 9,26.5" fill="${FILL}" />
  <path d="M22 24 C34 25, 40 35, 53 33 C66 31, 70 15, 84 15 C93 15, 99 20, 106 23" stroke="${S}" stroke-width="1.15" fill="none" />
  <path d="M46 16 C40 7, 26 4, 12 10 C24 10, 34 13, 42 19 Z" fill="${SOFT}" stroke="${S}" stroke-width="1.05" />
  <path d="M62 15 C55 5, 41 2, 26 6 C38 7, 48 11, 56 17" stroke="${S}" stroke-width="1.15" fill="none" />
  <path d="M78 14 C72 6, 60 3, 48 5 C58 7, 67 11, 73 16" stroke="${SUB}" stroke-width="0.95" fill="none" />
  <path d="M95 19 C101 12, 111 10, 121 14 L132 19 L123 22.5 L129 26.8 L117 28.5 L112 25.5 L102 27 C96 27, 92 24, 95 19 Z" fill="${SOFT}" stroke="${S}" stroke-width="1.3" stroke-linejoin="round" />
  <path d="M108 13 C101 5, 89 3, 76 6 C88 8, 95 11, 101 16" stroke="${S}" stroke-width="1.2" fill="${SOFT}" />
  <path d="M117 28.5 L110 34 L106 27" stroke="${S}" stroke-width="1" fill="none" />
  <polygon points="124,20 126,23.2 122.5,21.5" fill="${FILL}" />
  <polygon points="114,17.2 117.5,18.2 114,19.4 111.5,18.2" fill="${FILL}" />
  <polygon points="50,24 53.5,21.5 57,24 53.5,26.5" fill="${FILL}" opacity="0.82" />
  <polygon points="84,23.5 87,21.4 90,23.5 87,25.6" fill="${FILL}" opacity="0.72" />`,

  companions: `<line x1="8" y1="24" x2="128" y2="24" stroke="${S}" stroke-width="1.3" />
  <path d="M99 24 C99 10, 113 4, 129 8 C120 14, 117 19, 117 24 C117 29, 120 34, 129 40 C113 44, 99 38, 99 24 Z" fill="${SOFT}" stroke="${S}" stroke-width="1.35" />
  <path d="M105 24 C105 15, 112 10, 121 11 M105 24 C105 33, 112 38, 121 37" stroke="${SUB}" stroke-width="0.9" fill="none" />
  <polygon points="120,24 127,20.5 135,24 127,27.5" fill="${FILL}" />
  <path d="M28 24 C39 12, 57 12, 68 24 C57 36, 39 36, 28 24 Z" stroke="${S}" stroke-width="1.15" fill="none" />
  <path d="M54 24 C66 10, 86 10, 99 24 C86 38, 66 38, 54 24 Z" stroke="${S}" stroke-width="1.2" fill="${SOFT}" />
  <polygon points="48,20.5 53,24 48,27.5 43,24" fill="${FILL}" />
  <polygon points="77,20 82.5,24 77,28 71.5,24" fill="${FILL}" />
  <polygon points="2,24 14,20.6 10,24 14,27.4" fill="${FILL}" />`,

  college: `<line x1="6" y1="24" x2="90" y2="24" stroke="${SUB}" stroke-width="1" />
  <path d="M18 24 C36 9, 68 9, 93 18" stroke="${S}" stroke-width="1.1" fill="none" />
  <path d="M18 24 C36 39, 68 39, 93 30" stroke="${S}" stroke-width="1.1" fill="none" />
  <circle cx="110" cy="24" r="16" stroke="${S}" stroke-width="1.3" fill="${SOFT}" />
  <circle cx="110" cy="24" r="11.2" stroke="${S}" stroke-width="0.9" stroke-dasharray="3.2 2" />
  <circle cx="110" cy="24" r="6.8" stroke="${SUB}" stroke-width="0.8" />
  <polygon points="110,14 114,24 110,34 106,24" fill="${FILL}" opacity="0.92" />
  <circle cx="110" cy="24" r="2.2" fill="#151410" />
  <polygon points="110,2 111.8,8.5 110,11 108.2,8.5" fill="${FILL}" />
  <polygon points="110,46 111.8,39.5 110,37 108.2,39.5" fill="${FILL}" />
  <polygon points="135,24 128,22.2 126,24 128,25.8" fill="${FILL}" />
  <circle cx="58" cy="24" r="6.5" stroke="${S}" stroke-width="1" fill="none" />
  <polygon points="58,20 62,24 58,28 54,24" fill="${FILL}" />
  <polygon points="2,24 10,21.5 14,24 10,26.5" fill="${FILL}" />`,

  thieves: `<path d="M10 17 L56 11 L82 19 L116 12 L134 24 L115 29 L80 26 L48 32 L24 26 Z" fill="${SOFT}" stroke="${S}" stroke-width="1.2" stroke-linejoin="round" />
  <path d="M24 23 L55 18 L79 23 L54 27 Z" stroke="${SUB}" stroke-width="0.9" fill="none" />
  <path d="M58 11 L86 5 L114 12" stroke="${S}" stroke-width="1.15" fill="none" />
  <path d="M64 30 C82 40, 104 38, 122 28" stroke="${S}" stroke-width="1.1" fill="none" />
  <path d="M102 16.5 L110 24 L102 31.5 L94 24 Z" stroke="${S}" stroke-width="1.25" fill="rgba(13, 12, 10, 0.72)" />
  <polygon points="102,20.5 105.5,24 102,27.5 98.5,24" fill="${FILL}" />
  <polygon points="2,17 13,15 10,19.2" fill="${FILL}" />`,

  brotherhood: `<path d="M4 24 L40 20.5 L49 14 L58 21 L88 19 L110 10.5 L120 20 L135 24 L120 28 L110 37.5 L88 29 L58 27 L49 34 L40 27.5 Z" fill="${SOFT}" stroke="${S}" stroke-width="1.2" stroke-linejoin="round" />
  <path d="M65 20 L76 7 L82 19" stroke="${S}" stroke-width="1.1" fill="none" />
  <path d="M65 28 L76 41 L82 29" stroke="${S}" stroke-width="1.1" fill="none" />
  <path d="M92 18 L101 6 L106 16" stroke="${S}" stroke-width="1" fill="none" />
  <path d="M92 30 L101 42 L106 32" stroke="${S}" stroke-width="1" fill="none" />
  <line x1="12" y1="24" x2="100" y2="24" stroke="${SUB}" stroke-width="0.85" />
  <polygon points="111,18.2 117.5,24 111,29.8 104.5,24" fill="${FILL}" />`,

  civilwar: `<line x1="6" y1="24" x2="128" y2="24" stroke="${S}" stroke-width="1.5" />
  <path d="M18 18.5 L98 18.5 L108 24 L98 29.5 L18 29.5" stroke="${S}" stroke-width="1.05" fill="${SOFT}" />
  <path d="M112 7 L107 24 L112 41" stroke="${S}" stroke-width="1.5" fill="none" />
  <path d="M112 7 L120 17 L116 24 L120 31 L112 41" stroke="${S}" stroke-width="1.05" fill="${SOFT}" />
  <polygon points="122,24 128.5,20 135,24 128.5,28" fill="${FILL}" />
  <path d="M36 18.5 L51 10 L68 18.5 M36 29.5 L51 38 L68 29.5" stroke="${S}" stroke-width="1.05" fill="none" />
  <polygon points="51,21 55,24 51,27 47,24" fill="${FILL}" opacity="0.8" />
  <polygon points="3,24 15,20 12,24 15,28" fill="${FILL}" />`,

  daedric: `<path d="M133 24 C116 8, 90 4, 64 13 C44 20, 29 12, 13 6 C22 17, 42 26, 65 22 C86 19, 104 17, 120 24" stroke="${S}" stroke-width="1.3" fill="${SOFT}" />
  <path d="M133 24 C116 40, 90 44, 64 35 C45 28, 30 36, 16 41 C27 30, 47 24, 68 27 C88 29, 104 31, 120 24" stroke="${S}" stroke-width="1.2" fill="none" />
  <path d="M106 13 C95 19, 95 29, 106 35 C101 29, 101 19, 106 13 Z" fill="${FILL}" />
  <polygon points="80,20 86,24 80,28 74,24" fill="${FILL}" />
  <line x1="4" y1="24" x2="68" y2="24" stroke="${SUB}" stroke-width="0.9" />`,

  dawnguard: `<line x1="6" y1="24" x2="132" y2="24" stroke="${S}" stroke-width="1.2" />
  <path d="M88 24 L112 7 L105 19 L131 15 L114 24 L131 33 L105 29 L112 41 Z" fill="${SOFT}" stroke="${S}" stroke-width="1.2" />
  <path d="M73 14 L88 24 L73 34 L58 24 Z" stroke="${S}" stroke-width="1.2" fill="${SOFT}" />
  <polygon points="73,19 79.5,24 73,29 66.5,24" fill="${FILL}" />
  <path d="M22 19.5 L56 19.5 M22 28.5 L56 28.5" stroke="${SUB}" stroke-width="0.9" />
  <polygon points="2,24 12,20.8 16,24 12,27.2" fill="${FILL}" />`,

  dragonborn: `<path d="M10 24 C29 10, 46 38, 66 24 C83 11, 102 11, 121 24" stroke="${S}" stroke-width="1.35" fill="none" />
  <path d="M22 24 C40 38, 56 10, 77 24 C95 36, 112 34, 132 24" stroke="${S}" stroke-width="1.2" fill="none" />
  <path d="M101 15 C110 6, 125 8, 125 17 C125 22, 119 23, 116 19.5" stroke="${S}" stroke-width="1.15" fill="none" />
  <path d="M101 33 C110 42, 125 40, 125 31 C125 26, 119 25, 116 28.5" stroke="${S}" stroke-width="1.15" fill="none" />
  <ellipse cx="101" cy="24" rx="7.2" ry="4.2" stroke="${S}" stroke-width="1.05" fill="${SOFT}" />
  <polygon points="101,20.8 102.8,24 101,27.2 99.2,24" fill="${FILL}" />
  <circle cx="53" cy="24" r="2.2" fill="${FILL}" opacity="0.82" />
  <polygon points="2,24 11,21.2 14,24 11,26.8" fill="${FILL}" />`,

  misc: `<path d="M12 24 L128 24" stroke="${S}" stroke-width="1.15" fill="none" />
  <path d="M48 18.5 L100 18.5 L111 24 L100 29.5 L48 29.5" stroke="${SUB}" stroke-width="0.9" fill="none" />
  <path d="M115 24 L124 18.8 L133 24 L124 29.2 Z" stroke="${S}" stroke-width="1.2" fill="${SOFT}" />
  <polygon points="121,24 124,21.5 127,24 124,26.5" fill="${FILL}" />
  <polygon points="6,24 15,21.6 13,24 15,26.4" fill="${FILL}" opacity="0.78" />`,

  side: `<path d="M10 24 C25 24, 35 14.5, 52 14.5 C69 14.5, 76 33.5, 93 33.5 C109 33.5, 118 19.5, 131 24" stroke="${S}" stroke-width="1.3" fill="none" />
  <path d="M10 24 C25 24, 35 33.5, 52 33.5 C69 33.5, 76 14.5, 93 14.5 C109 14.5, 118 28.5, 131 24" stroke="${S}" stroke-width="1.3" fill="none" />
  <path d="M74 13.5 C90 5.5, 109 6.5, 124 17" stroke="${SUB}" stroke-width="1" fill="none" />
  <path d="M74 34.5 C90 42.5, 109 41.5, 124 31" stroke="${SUB}" stroke-width="1" fill="none" />
  <polygon points="52,20 56.5,24 52,28 47.5,24" fill="${FILL}" opacity="0.86" />
  <polygon points="93,19.5 98,24 93,28.5 88,24" fill="${FILL}" />
  <polygon points="127,24 131.5,21.2 135.5,24 131.5,26.8" fill="${FILL}" />
  <polygon points="2,24 11,21.2 13,24 11,26.8" fill="${FILL}" opacity="0.82" />`,
});

const TYPE_TO_FACTION = Object.freeze({
  bounty: 'companions',
  battle: 'main',
  character: 'college',
  social: 'side',
  misc: 'misc',
});

export function questFactionFor(quest) {
  if (typeof quest?.faction === 'string' && Object.hasOwn(CRESTS, quest.faction)) {
    return quest.faction;
  }
  if (quest?.isMisc || quest?.isMiscAggregate) return 'misc';
  return TYPE_TO_FACTION[quest?.type] || 'side';
}

export function questWingMarkup(faction, mirrored = false) {
  const artwork = CRESTS[faction] || CRESTS.side;
  return `<svg class="ow-quest-wing${mirrored ? ' is-mirrored' : ''}" viewBox="0 0 138 48"
    fill="none" aria-hidden="true">${artwork}</svg>`;
}
