/** The east wing is translated in the source model; furniture keeps its original scale. */
export function expandedHallPosition([x, y, z]) {
  return [x >= 2.4 ? x + 2.8 : x, y, z];
}

/** Eye-height route over the actual treads, then onto the second-floor landing. */
export const TAVERN_STAIRS = Object.freeze({
  footprint: [7.04, -0.48, 1.76, 5.32],
  approach: [7.92, 1.52, -1.12],
  focus: [7.92, 2.5, 2.2],
  anchor: [7.92, 1.9, 0.4],
  landingDoor: [7.04, 4.2, 4.2],
  route: [
    [7.92, 1.52, -0.52],
    [7.92, 4.4, 3.92],
    [7.92, 4.44, 4.2],
  ],
});

/** Ground-floor X/Z dimensions from build_tavern.py, in meters after expansion. */
export const TAVERN_HALL = Object.freeze({
  floor: [-6, -5, 14.8, 10],
  entrance: [1.4, 4.58],
  bar: [-5.28, -3.92, 3.76, 0.96],
  backBar: [-5.24, -4.88, 3.72, 0.44],
  dungeon: [-0.04, -4.96, 2.32, 1],
  summon: [-5.96, 0.2, 1.84, 2.08],
  bookshelf: [8.2, -3.64, 0.52, 1.16],
  fate: [5.4, -0.88, 1.44, 0.92],
  fireplace: [6.56, -4.96, 1.56, 0.88],
  bench: [4.2, 4.12, 1.48, 0.48],
  supplies: [-4.88, 3.76, 2.28, 0.94],
  rugs: [
    [-1.96, -0.36, 2.72, 2.52],
    [3.4, 0.74, 1.64, 1.8],
    [5.24, -1.08, 1.72, 1.76],
  ],
  tables: [
    { id: 'hall', label: '大厅圆桌', at: [-0.6, 0.8], radius: 0.64, capacity: 3 },
    { id: 'window', label: '靠窗圆桌', at: [4.2, 1.5], radius: 0.56, capacity: 3 },
  ],
  stools: [-4.6, -3.4, -2.2].map((x, index) => ({
    id: 'bar-' + (index + 1),
    label: '吧台 ' + (index + 1) + ' 席',
    at: [x, -2.44],
    capacity: 1,
  })),
});
