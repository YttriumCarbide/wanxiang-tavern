import { CITY_CENTER } from './content/city-center.js';
import { STARBELL_SCENES } from './content/starbell-scenes.js';
import { TOWN_SIDE_PLACES } from './content/town-side-places.js';
import { SILVER_CROWN_GATE, SILVER_CROWN_PLACES } from './content/silver-crown-scenes.js';
import { ETERNAL_CITY_GATE, ETERNAL_CITY_PLACES } from './content/eternal-city-scenes.js';

const starbellPlace = (scene, point) => ({
  name: scene.title,
  environment: scene.points.find(({ id }) => id === point)?.text || scene.subtitle,
});

const starbellSidePlaces = Object.fromEntries(
  Object.entries(TOWN_SIDE_PLACES).filter(([id]) => id !== 'riverbank'),
);

export const CITIES = Object.freeze({
  starbell: {
    name: '星钟城',
    image: './assets/exploration/city-backgrounds/starbell.png',
    entry: 'city-center',
    places: {
      'city-center': starbellPlace(CITY_CENTER, 'fountain'),
      market: starbellPlace(STARBELL_SCENES.market, 'workbench'),
      rampart: starbellPlace(STARBELL_SCENES.rampart, 'bell'),
      ...starbellSidePlaces,
    },
    facilities: { blacksmith: 'lantern-workshop', market: 'market', guild: 'city-center' },
  },
  'silver-crown': {
    name: '银冠城',
    image: './assets/exploration/city-backgrounds/silver-crown.png',
    entry: SILVER_CROWN_GATE,
    places: SILVER_CROWN_PLACES,
    facilities: { blacksmith: 'crown-mint', market: 'crown-arcade', guild: 'crown-ledger' },
  },
  eternal: {
    name: '艾尔鲁斯',
    image: './assets/exploration/city-backgrounds/eternal-city.png',
    entry: ETERNAL_CITY_GATE,
    places: ETERNAL_CITY_PLACES,
    facilities: { blacksmith: 'eternal-garrison', market: 'eternal-quay', guild: 'eternal-plaza' },
  },
});

const FACILITIES = Object.freeze({
  blacksmith: { name: '铁匠铺', icon: '⚒', action: '装备重铸与售卖' },
  market: { name: '市场', icon: '◇', action: '采购物资' },
  guild: { name: '冒险者公会', icon: '⚑', action: '悬赏与委托' },
});

export function cityPlaceId(scene) {
  if (scene === 'street' || scene === 'starlamp-street') return 'city-center';
  if (scene === 'road-capital') return SILVER_CROWN_GATE;
  return scene;
}

export function cityForScene(scene) {
  const id = cityPlaceId(scene);
  return Object.keys(CITIES).find((city) => Object.hasOwn(CITIES[city].places, id)) || null;
}

export function cityFacility(cityId, facility) {
  if (!Object.hasOwn(CITIES, cityId) || !Object.hasOwn(FACILITIES, facility)) return null;
  const city = CITIES[cityId];
  const streetScene = city.facilities[facility];
  return {
    ...FACILITIES[facility],
    id: cityId + '-' + facility,
    facility,
    streetScene,
    environment: city.places[streetScene].environment,
  };
}

export function cityFacilities(cityId) {
  return Object.keys(FACILITIES)
    .map((facility) => cityFacility(cityId, facility))
    .filter(Boolean);
}

export function cityStreetPlace(scene) {
  const city = cityForScene(scene);
  return city ? CITIES[city].places[cityPlaceId(scene)] : null;
}

const STARBELL_DUNGEONS = Object.freeze([
  { id: 'starbell-undercroft', name: '星钟地下暗渠', level: 6, streetScene: 'city-center' },
  { id: 'black-market', name: '暗巷黑市', level: 7, streetScene: 'market-alley' },
]);

export function cityDungeons(cityId, discoveries) {
  if (!Object.hasOwn(CITIES, cityId)) return [];
  const dungeons = cityId === 'starbell' ? [...STARBELL_DUNGEONS] : [];
  for (const entry of Array.isArray(discoveries) ? discoveries : []) {
    if (
      cityForScene(entry?.linkId) !== cityId ||
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      dungeons.some(({ id }) => id === entry.id)
    )
      continue;
    dungeons.push({ id: entry.id, name: entry.name, streetScene: cityPlaceId(entry.linkId) });
  }
  return dungeons;
}
