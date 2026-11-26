import { CITY_CENTER } from './content/city-center.js';
import { STARBELL_SCENES } from './content/starbell-scenes.js';
import { TOWN_SIDE_PLACES } from './content/town-side-places.js';
import { SILVER_CROWN_GATE, SILVER_CROWN_PLACES } from './content/silver-crown-scenes.js';
import { ETERNAL_CITY_GATE, ETERNAL_CITY_PLACES } from './content/eternal-city-scenes.js';
import { REGIONS } from './content/regions.js';

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
    image: './assets/exploration/city-backgrounds/starbell.webp',
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
    image: './assets/exploration/city-backgrounds/silver-crown.webp',
    entry: SILVER_CROWN_GATE,
    places: SILVER_CROWN_PLACES,
    facilities: { blacksmith: 'crown-mint', market: 'crown-arcade', guild: 'crown-ledger' },
  },
  eternal: {
    name: '艾尔鲁斯',
    image: './assets/exploration/city-backgrounds/eternal-city.webp',
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

const CITY_FIXED_DUNGEONS = Object.freeze({
  starbell: Object.freeze([
    { id: 'black-market', name: '暗巷黑市', level: 7, streetScene: 'market-alley' },
  ]),
  'silver-crown': Object.freeze([
    {
      id: 'silver-shield-exhibition',
      name: '银冠城-白鸦展览馆',
      level: 8,
      streetScene: 'crown-arcade',
      requiresCleared: 'black-market',
    },
  ]),
  eternal: Object.freeze([
    { id: 'duel-arena', name: '大骑士竞技场（海选）', level: 11, streetScene: 'eternal-arena' },
  ]),
});

export function clearedCityDungeonIds(library) {
  const clearedIds = [];
  for (const list of Object.values(CITY_FIXED_DUNGEONS)) {
    for (const { id } of list) {
      const route = library?.exploration?.[id];
      const cleared = route?.cleared;
      if (!Array.isArray(cleared) || !cleared.length) continue;
      const overlord = REGIONS[id]?.nodes?.find((node) => node.overlord);
      const isCleared = overlord
        ? cleared.some((entry) => entry?.nodeId === overlord.id)
        : (route?.completed || 0) > 0;
      if (isCleared) clearedIds.push(id);
    }
  }
  return clearedIds;
}

export function cityDungeons(cityId, discoveries, { clearedDungeons, includeLocked = false } = {}) {
  if (!Object.hasOwn(CITIES, cityId)) return [];
  const clearedSet =
    clearedDungeons instanceof Set
      ? clearedDungeons
      : new Set(Array.isArray(clearedDungeons) ? clearedDungeons : []);
  const dungeons = (CITY_FIXED_DUNGEONS[cityId] || [])
    .filter(
      (entry) => includeLocked || !entry.requiresCleared || clearedSet.has(entry.requiresCleared),
    )
    .map(({ requiresCleared: _req, ...entry }) => entry);
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
