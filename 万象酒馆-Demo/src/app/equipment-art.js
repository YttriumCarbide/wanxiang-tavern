import { html } from '../shared/html.js';

const qualityTints = {
  common: ['#c9c2ad', '#69675f', 0],
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

function silhouette(category, light, dark) {
  switch (category) {
    case 'weapon':
      return html`<path
          d="m14 50 12-12-4-4 4-4 5 4L46 13l11-3-3 11-21 16 4 5-4 4-5-5-12 13Z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="2"
        />
        <path d="m32 36 18-19 5-5-4 9z" fill="${light}" /><path
          d="m11 51 7-1-2 8-5-1z"
          fill="#b28654"
        />`;
    case 'armor':
      return html`<path
          d="m12 23 9-8 8 5h6l8-5 9 8-6 12-5-2v16l-9 6-9-6V33l-5 2z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="2"
        />
        <path
          d="M21 15l4 13 7 5 7-5 4-13M24 38l8 4 8-4m-16 7 8 4 8-4"
          fill="none"
          stroke="${light}"
          stroke-width="2"
        />`;
    case 'pendant':
      return html`<path
          d="M13 12c4 15 12 17 19 22 7-5 15-7 19-22"
          fill="none"
          stroke="#b99a63"
          stroke-width="3"
        />
        <path
          d="m32 27 13 10-4 12-9 8-9-8-4-12z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="2"
        />
        <path d="m32 32 7 7-7 13-7-13z" fill="${light}" />`;
    case 'gem':
      return html`<path
          d="m32 10 14 9 8 18-22 18L10 37l8-18z"
          fill="${dark}"
          stroke="${light}"
          stroke-width="2"
        />
        <path d="m32 10 9 17-9 28-9-28z" fill="${light}" opacity=".86" />
        <path
          d="m18 19 5 8-13 10m36-18-5 8 13 10M23 27h18"
          fill="none"
          stroke="${light}"
          stroke-width="1.7"
        />`;
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
    ${silhouette(category, ...colors)} ${facets.join('')}
  </svg>`;
}
