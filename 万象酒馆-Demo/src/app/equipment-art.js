import { html } from '../shared/html.js';

const qualityTints = {
  common: ['#d4ccb8', '#6e6a61', 0],
  uncommon: ['#91d5a6', '#427c60', 1],
  rare: ['#a2d6ff', '#416d9e', 2],
  epic: ['#dfb6ff', '#7852a5', 3],
  legendary: ['#ffe39b', '#ab7538', 4],
};

const gemTints = {
  'gem-valor-shard': ['#ff9a88', '#ab4140'],
  'gem-wind-agate': ['#9ff4cf', '#478f77'],
  'gem-oak-amber': ['#ffda82', '#a6702c'],
  'gem-ink-quartz': ['#f3f7ff', '#8f9fb6'],
  'gem-owl-moonstone': ['#b9daff', '#596f9f'],
  'gem-rose-garnet': ['#ffabc3', '#953657'],
  'gem-gladiator-onyx': ['#c1a1d8', '#4c315a'],
  'gem-trickster-opal': ['#b1f5ef', '#9555b4'],
  'gem-sage-sapphire': ['#7dd8ff', '#2e56a9'],
  'gem-titan-diamond': ['#fff0ce', '#90a8bc'],
  'gem-starweaver-prism': ['#d7acff', '#5462bd'],
  'gem-fate-crown': ['#fff09d', '#c27661'],
};

const WEAPON_KEYS = Object.freeze(['sword', 'axe', 'spear', 'staff', 'bow', 'dagger']);

function weaponKindFor(item) {
  const name = `${item?.name || ''} ${item?.description || ''}`;
  if (/弓|弩|矢|箭/.test(name)) return 'bow';
  if (/杖|法杖|魔杖|权杖|法球|典|书/.test(name)) return 'staff';
  if (/枪|戟|矛|刺枪/.test(name)) return 'spear';
  if (/斧|锤|战斧|巨斧/.test(name)) return 'axe';
  if (/匕|刃|刺|短剑|双刀/.test(name)) return 'dagger';
  if (/剑|刀|大剑|太刀|巨剑|长剑/.test(name)) return 'sword';
  const dt = item?.damageType || '';
  if (dt === 'axe' || dt === 'fight') return 'axe';
  if (dt === 'spear') return 'spear';
  if (['fire', 'ice', 'thunder', 'wind', 'light', 'dark', 'magic'].includes(dt)) return 'staff';
  const seed = String(item?.id || item?.templateId || item?.name || 'weapon');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return WEAPON_KEYS[hash % WEAPON_KEYS.length];
}

function weaponSilhouette(kind, light, dark) {
  switch (kind) {
    case 'axe':
      return html`<path
          d="m14 50 32-32"
          stroke="#9b7347"
          stroke-width="3.6"
          stroke-linecap="round"
        />
        <path d="m13 51 5-1-2 6-4-1z" fill="#c79e68" />
        <path
          d="M31 15c7-3 15-1 19 6-5 4-9 10-9 17-7-2-13-8-14-15 2-4 2-6 4-8Z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
        <path d="M36 17c5-1 10 1 13 5-3 3-5 6-6 11-3-4-6-9-7-16Z" fill="${light}" opacity="0.72" />
        <polygon points="44,19 47,21 44,23 41,21" fill="#fff4d2" />`;
    case 'spear':
      return html`<path d="m12 52 30-30" stroke="#9b7347" stroke-width="3" stroke-linecap="round" />
        <path d="m35 23 6 6" stroke="#d8b574" stroke-width="2.4" stroke-linecap="round" />
        <path
          d="m36 22 17-12-6 18-5 2-6-6Z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="1.7"
          stroke-linejoin="round"
        />
        <path d="m41 23 11-11-4 14z" fill="${light}" opacity="0.82" />
        <circle cx="38" cy="26" r="2.2" fill="#ffe6a8" />`;
    case 'staff':
      return html`<path
          d="m14 51 24-24"
          stroke="#8f673e"
          stroke-width="3.2"
          stroke-linecap="round"
        />
        <path
          d="M36 29c-2-7 1-14 7-17 6-2 11 2 10 8-1 6-6 9-12 8"
          fill="none"
          stroke="${light}"
          stroke-width="2"
          stroke-linecap="round"
        />
        <polygon
          points="45,14 50,19 45,25 40,19"
          fill="${dark}"
          stroke="${light}"
          stroke-width="1.4"
        />
        <polygon points="45,16 48,19 45,23 42,19" fill="${light}" />
        <circle cx="45" cy="19" r="1.6" fill="#fff7da" />`;
    case 'bow':
      return html`<path
          d="M21 14c16 3 26 13 29 29"
          fill="none"
          stroke="#9e7445"
          stroke-width="3.2"
          stroke-linecap="round"
        />
        <path
          d="M24 16c13 3 21 11 24 24"
          fill="none"
          stroke="${light}"
          stroke-width="1.3"
          opacity="0.7"
        />
        <line x1="21" y1="14" x2="50" y2="43" stroke="#e4dcc8" stroke-width="1.1" opacity="0.75" />
        <path d="m17 47 26-26" stroke="#d5c9b0" stroke-width="1.7" stroke-linecap="round" />
        <polygon points="46,18 40,19 45,24" fill="${light}" />`;
    case 'dagger':
      return html`<path
          d="m16 48 11-11-3-4 4-4 4 4L48 15l3-1-2 5-15 16 4 4-4 4-4-3-11 11Z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
        <path d="m32 34 15-16-2 6-11 12z" fill="${light}" opacity="0.82" />
        <circle cx="24" cy="40" r="2" fill="#ffd991" />`;
    case 'sword':
    default:
      return html`<path
          d="m14 50 12-12-4-4 4-4 5 4L46 13l11-3-3 11-21 16 4 5-4 4-5-5-12 13Z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path d="m32 36 18-19 5-5-4 9z" fill="${light}" opacity="0.88" />
        <line x1="30" y1="34" x2="49" y2="15" stroke="#fff6db" stroke-width="1" opacity="0.7" />
        <circle cx="27" cy="37" r="2.2" fill="#ffe29a" />
        <path d="m11 51 7-1-2 8-5-1z" fill="#b28654" />`;
  }
}

function silhouette(item, light, dark) {
  switch (item?.category) {
    case 'weapon':
      return weaponSilhouette(weaponKindFor(item), light, dark);
    case 'armor':
      return html`<path
          d="m12 23 9-8 8 5h6l8-5 9 8-6 12-5-2v16l-9 6-9-6V33l-5 2z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path d="m21 15 4 13 7 5 7-5 4-13Z" fill="${light}" opacity="0.22" />
        <path
          d="M21 15l4 13 7 5 7-5 4-13M24 38l8 4 8-4m-16 7 8 4 8-4"
          fill="none"
          stroke="${light}"
          stroke-width="1.8"
        />
        <polygon points="32,24 35,28 32,32 29,28" fill="#fff2cb" opacity="0.85" />`;
    case 'pendant':
      return html`<path
          d="M13 12c4 15 12 17 19 22 7-5 15-7 19-22"
          fill="none"
          stroke="#b99a63"
          stroke-width="3"
          stroke-linecap="round"
        />
        <path
          d="m32 27 13 10-4 12-9 8-9-8-4-12z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path d="m32 32 7 7-7 13-7-13z" fill="${light}" opacity="0.9" />
        <polygon points="32,35 35,39 32,44 29,39" fill="#fff8e1" opacity="0.7" />`;
    case 'gem':
      return html`<path
          d="m32 10 14 9 8 18-22 18L10 37l8-18z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path d="m32 10 9 17-9 28-9-28z" fill="${light}" opacity=".86" />
        <path
          d="m18 19 5 8-13 10m36-18-5 8 13 10M23 27h18"
          fill="none"
          stroke="${light}"
          stroke-width="1.7"
        />
        <polygon points="32,16 35,23 32,29 29,23" fill="#ffffff" opacity="0.48" />`;
    default:
      return '';
  }
}

export function equipmentArt(item, quality) {
  const [light, dark, tier] = qualityTints[quality] || qualityTints.common;
  const category = item?.category;
  const colors = category === 'gem' ? gemTints[item.id] || [light, dark] : [light, dark];
  const facets = Array.from({ length: tier }, (_, index) => {
    const x = 32 + (index - (tier - 1) / 2) * 7;
    return html`<path d="M${x} 57l2 2-2 2-2-2z" fill="${light}" />`;
  });
  return html`<svg
    class="equipment-art"
    viewBox="0 0 64 64"
    width="34"
    height="34"
    aria-hidden="true"
  >
    <path
      d="M14 4h36l10 10v36L50 60H14L4 50V14z"
      fill="#211b22"
      stroke="${dark}"
      stroke-width="1.5"
    />
    ${tier >= 2 ? html`<path d="M17 8h30l9 9v30l-9 9H17l-9-9V17z" fill="none" stroke="${light}" opacity=".45" />` : ''}
    ${silhouette(item, ...colors)} ${facets.join('')}
  </svg>`;
}
