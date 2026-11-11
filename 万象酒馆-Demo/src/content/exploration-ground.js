/** Radii describe clear ground before the painted kerb, not the full size of a location. */
export const EXPLORATION_GROUND = Object.freeze({
  street: {
    image: './assets/exploration/ground-cobble-v1.png',
    radii: [4.5, 4.3, 4.1, 4.1, 4.3, 4.1, 4.1, 4.4],
    tint: '#e8d4b5',
  },
  square: {
    image: './assets/exploration/ground-cobble-v1.png',
    radii: [6, 5.6, 4.2, 4.8, 5, 4.6, 4.6, 5.2],
    tint: '#eadcc8',
  },
  market: {
    image: './assets/exploration/ground-cobble-v1.png',
    radii: [5, 5, 5.5, 6, 6.5, 6, 5.5, 5],
    tint: '#f0dcc0',
  },
  rampart: {
    image: './assets/exploration/ground-cobble-v1.png',
    radii: [4.9, 4.8, 4.5, 4.6, 4.8, 4.6, 4.5, 4.8],
    tint: '#ead9bc',
  },
  outskirts: {
    image: './assets/exploration/ground-earth-v1.png',
    radii: [5.5, 5.5, 4.3, 4.2, 3.8, 4, 4.3, 5.2],
    tileSize: 3.4,
    tint: '#efddc4',
  },
});
