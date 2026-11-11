const image = './assets/exploration/street-hd-v4/connected.png';
const spots = Object.freeze({
  'cobble-west': { foot: [0.4, 0.85], height: 0.35 },
  'cobble-center': { foot: [0.625, 0.8], height: 0.29 },
});
const points = Object.freeze({
  tavern: [0.09, 0.46],
  arch: [0.35, 0.5],
  apothecary: [0.565, 0.5],
  notice: [0.715, 0.62],
  courtyard: [0.805, 0.62],
});
const foreground = Object.freeze([]);

/** One freely framed painting shares all standing and investigation coordinates. */
export const STREET_ILLUSTRATED = Object.freeze({
  image,
  nightImage: './assets/exploration/town-night/street.png',
  aspect: 3,
  spots,
  points,
  foreground,
  viewHeight: 0.9,
});
