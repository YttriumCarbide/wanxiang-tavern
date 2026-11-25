const starbellImage = './assets/exploration/city-backgrounds/starbell.png';
const starbellView = {
  image: starbellImage,
  aspect: 16 / 9,
  fixed: true,
  fitWidth: true,
  pureBackdrop: true,
};

/** All coordinates refer to a complete city overview painting. */
export const FREE_EXPLORATION_ART = Object.freeze({
  'city-center': {
    ...starbellView,
    spots: {
      'square-center': { foot: [0.43, 0.85], height: 0.28 },
      'square-east': { foot: [0.64, 0.79], height: 0.23 },
    },
    points: {
      market: [0.72, 0.57],
      rampart: [0.265, 0.58],
      clock: [0.467, 0.22],
      fountain: [0.36, 0.61],
      guild: [0.91, 0.56],
      sign: [0.115, 0.72],
      street: [0.06, 0.64],
    },
    foreground: [],
  },
  market: {
    ...starbellView,
    spots: {},
    people: {
      novi: { foot: [0.32, 0.84], height: 0.31 },
      mirei: { foot: [0.68, 0.8], height: 0.26 },
    },
    points: {
      novi: [0.32, 0.47],
      mirei: [0.68, 0.49],
      workbench: [0.12, 0.59],
      'city-center': [0.34, 0.56],
      rampart: [0.85, 0.61],
    },
    foreground: [],
  },
  rampart: {
    ...starbellView,
    spots: { 'gate-paving': { foot: [0.4, 0.86], height: 0.33 } },
    people: { eirin: { foot: [0.62, 0.83], height: 0.29 } },
    points: {
      eirin: [0.62, 0.49],
      bell: [0.15, 0.31],
      barricade: [0.66, 0.7],
      outskirts: [0.48, 0.57],
      'city-center': [0.93, 0.61],
      market: [0.07, 0.61],
    },
    foreground: [],
  },
  outskirts: {
    ...starbellView,
    spots: {
      'road-left-near': { foot: [0.42, 0.86], height: 0.33 },
      'road-right-far': { foot: [0.64, 0.79], height: 0.26 },
    },
    points: {
      tower: [0.535, 0.49],
      tracks: [0.89, 0.69],
      cart: [0.76, 0.6],
      rampart: [0.21, 0.48],
    },
    foreground: [],
  },
});
