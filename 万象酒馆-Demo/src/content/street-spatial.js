const directory = './assets/exploration/street-spatial/';

/** Endpoints share the road outline, including chamfers and recessed courtyards. */
function wall(id, art, from, to, height, options = {}) {
  return {
    id,
    art,
    center: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
    width: Math.hypot(to[0] - from[0], to[1] - from[1]),
    height,
    yaw: Math.atan2(from[1] - to[1], to[0] - from[0]),
    ...options,
  };
}

/** A crooked street corner, side courtyard and dogleg alley use flat paintings. */
export const STREET_SPATIAL = Object.freeze({
  art: {
    tavern: directory + 'tavern.png',
    pharmacy: directory + 'pharmacy.png',
    houses: directory + 'houses.png',
    arch: directory + 'arch.png',
    distance: directory + 'distance.png',
    street: directory + 'far-street.png',
  },
  road: {
    image: directory + 'floor.png',
    tileSize: 2.8,
    boundary: [
      [-6.5, -7.5],
      [-3.35, -7.5],
      [-3.35, -14.5],
      [-0.65, -14.5],
      [-0.65, -7.5],
      [2.5, -7.5],
      [5.5, -4.5],
      [5.5, -2],
      [10, -2],
      [10, -6],
      [13, -6],
      [13, 1],
      [5.5, 1],
      [5.5, 4.5],
      [4, 7],
      [-4.5, 7],
      [-6.5, 5],
      [-6.5, 2],
      [-10, 2],
      [-10, -2.5],
      [-6.5, -2.5],
    ],
  },
  facades: [
    wall('gateway', 'arch', [-6.5, -7.5], [2.5, -7.5], 4.6, { crop: [0.12, 0, 0.88, 1] }),
    wall('tavern', 'tavern', [4, 7], [-4.5, 7], 5.8, { point: 'tavern' }),
    wall('west-houses', 'houses', [-6.5, -2.5], [-6.5, -7.5], 5.8, { crop: [0.48, 0, 1, 1] }),
    wall('pharmacy', 'pharmacy', [2.5, -7.5], [5.5, -4.5], 5.1, { point: 'apothecary' }),
    wall('east-pier', 'arch', [5.5, -4.5], [5.5, -2], 3.7, { crop: [0, 0, 0.23, 1] }),
    wall('north-lane-west', 'houses', [-3.35, -14.9], [-3.35, -7.9], 4.8),
    wall('north-lane-east', 'houses', [-0.65, -7.9], [-0.65, -14.9], 5.2),
    wall('east-lane-inner', 'houses', [5.5, -2], [10, -2], 4.8, { crop: [0, 0, 0.52, 1] }),
    wall('east-lane-turn', 'houses', [10, -2], [10, -6.4], 5.6, { crop: [0.48, 0, 1, 1] }),
    wall('east-lane-outer', 'houses', [13, -6.4], [13, 1], 5.5),
    wall('east-lane-south', 'houses', [13, 1], [5.5, 1], 5.2),
    wall('east-house', 'houses', [5.5, 1], [5.5, 4.5], 5.3, { crop: [0, 0, 0.52, 1] }),
    wall('southeast-garden', 'arch', [5.5, 4.5], [4, 7], 3.1, { crop: [0.02, 0, 0.24, 1] }),
    wall('southwest-garden', 'arch', [-4.5, 7], [-6.5, 5], 3.4, { crop: [0.02, 0, 0.24, 1] }),
    wall('west-annex', 'houses', [-6.5, 5], [-6.5, 2], 5.2, { crop: [0, 0, 0.5, 1] }),
    wall('courtyard-south', 'arch', [-6.5, 2], [-10, 2], 2.6, { crop: [0.02, 0, 0.24, 1] }),
    wall('courtyard-back', 'houses', [-10, 2], [-10, -2.5], 4.8, { crop: [0, 0, 0.52, 1] }),
    wall('courtyard-north', 'arch', [-10, -2.5], [-6.5, -2.5], 3.2, { crop: [0.02, 0, 0.24, 1] }),
  ],
  distantViews: [
    { id: 'city-lane', center: [-2, -14.52], width: 2.7, height: 4.9, yaw: 0 },
    { id: 'east-street', center: [11.5, -6.02], width: 3, height: 4.9, yaw: 0 },
  ],
});
