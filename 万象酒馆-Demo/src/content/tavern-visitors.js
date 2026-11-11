import { expandedHallPosition } from './tavern-layout.js';
import { TOWN_SIDE_PLACES } from './town-side-places.js';

/** Scene positions are independent of camera seats and never change character ownership. */
export const TAVERN_VISITOR_SPOTS = Object.freeze(
  [
    { id: 'gate-side', name: '界门旁', position: [2.75, 0, -3.25] },
    { id: 'bar-front', name: '吧台前', position: [-3, 0, -1.55] },
    { id: 'summon-side', name: '召唤门旁', position: [-4.45, 0, -0.2] },
  ].map((spot) => ({ ...spot, position: expandedHallPosition(spot.position) })),
);

export const TAVERN_VISITORS = Object.freeze([
  { id: 'yuexi', combatId: 'aegis', name: '长景月汐', height: 1.76, top: 10, foot: 1508 },
  { id: 'edith', combatId: 'edith', name: '伊蒂丝', height: 1.7, top: 9, foot: 1527 },
  { id: 'pandora', combatId: 'pandora', name: '潘多拉', height: 1.64, top: 9, foot: 1490 },
  {
    id: 'libet',
    combatId: 'libet',
    name: '莉贝特',
    height: 1.66,
    top: 5,
    foot: 1507,
    image: './assets/tavern-visitors/sunflower-angel-full-v1.png',
  },
  {
    id: 'lumi',
    combatId: 'lumi',
    name: '露弥',
    height: 1.73,
    top: 8,
    foot: 1520,
    image: './assets/tavern-visitors/lumi-full-v1.png',
  },
  {
    id: 'yuto-nakashi',
    combatId: 'yuto-nakashi',
    name: '悠托-纳卡希',
    height: 1.75,
    top: 8,
    foot: 1527,
    image: './assets/tavern-visitors/green-traveler-full-v2.png',
  },
  {
    id: 'luo-gongxu',
    combatId: 'luo-gongxu',
    name: '骆公绪',
    height: 1.83,
    top: 3,
    foot: 1527,
    image: './assets/tavern-visitors/luo-gongxu-full-v2.png',
  },
  {
    id: 'silica-laps',
    combatId: 'silica-laps',
    name: '西莉卡·梵·拉普斯',
    height: 1.7,
    top: 4,
    foot: 1528,
    image: './assets/tavern-visitors/silica-laps-full-v2.png',
  },
]);

export function standingSprite(definition) {
  return definition.image || `./assets/tavern-visitors/${definition.id}-full-v1.png`;
}

const spots = (rows) => rows.map(([id, x, z]) => ({ id, name: id, position: [x, 0, z] }));
export const SCENE_VISITOR_SPOTS = Object.freeze({
  ...Object.fromEntries(Object.keys(TOWN_SIDE_PLACES).map((id) => [id, spots([['center', 0, 0]])])),
  market: [],
  rampart: spots([['gate-paving', -1.3, -3.2]]),
  outskirts: spots([
    ['road-left-near', -1.15, -3.5],
    ['road-right-far', 1.4, -4.65],
  ]),
  tavern: TAVERN_VISITOR_SPOTS,
  corridor: spots([
    ['near-stairs', 0.45, 1.9],
    ['hall-middle', -0.35, -0.7],
    ['hall-end', 0.4, -2.9],
  ]),
  'room-a': spots([['center', -1.5, 1.9]]),
  'room-b': spots([['center', -1.5, 1.9]]),
  'room-master': spots([['near-bed', 0.6, -2.1]]),
  'starlamp-street': spots([
    ['cobble-west', -1.4, -4.4],
    ['cobble-center', 1.8, -3.2],
  ]),
  'city-center': spots([
    ['square-center', 0.2, -3.5],
    ['square-east', 1.8, -4.8],
  ]),
});
