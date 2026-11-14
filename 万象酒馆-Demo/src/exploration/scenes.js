import { STARLAMP_STREET } from '../content/starlamp-street.js';
import { CITY_CENTER } from '../content/city-center.js';
import { STARBELL_SCENES } from '../content/starbell-scenes.js';
import { TOWN_SIDE_PLACES } from '../content/town-side-places.js';
import { OVERLAND_ROAD } from '../content/overland-road.js';
import { SILVER_CROWN_GATE, SILVER_CROWN_PLACES } from '../content/silver-crown-scenes.js';
import {
  ETERNAL_CITY_PLACES,
  ETERNAL_CITY_STOPS,
  ETERNAL_CITY_VISITOR_SPOTS,
} from '../content/eternal-city-scenes.js';

const exit = (id, name) => ({ id, name, kind: '前往', destination: id, immediate: true });

function withExtraExits(definition) {
  const children = Object.entries(TOWN_SIDE_PLACES).filter(
    ([, place]) => place.parent === definition.id,
  );
  if (!children.length) return definition;
  return {
    ...definition,
    points: [...definition.points, ...children.map(([id, place]) => exit(id, `前往${place.name}`))],
    illustration: {
      ...definition.illustration,
      points: {
        ...definition.illustration.points,
        ...Object.fromEntries(children.map(([id, place]) => [id, place.entrance])),
      },
    },
  };
}

const sideScenes = Object.fromEntries(
  Object.entries(TOWN_SIDE_PLACES).map(([id, place]) => {
    const art = `./assets/exploration/town-side-places/${id}`;
    return [
      id,
      {
        id,
        name: `星钟城 · ${place.name}`,
        title: place.name,
        returnDestination: place.parent,
        returnLabel: place.back,
        cutouts: [],
        points: [exit(place.parent, `返回${place.back}`)],
        illustration: {
          image: `${art}.png`,
          ...(place.openAir ? { nightImage: `${art}-night.png` } : {}),
          aspect: 16 / 9,
          fixed: true,
          spots: { center: { foot: [0.52, 0.87], height: 0.42 } },
          points: { [place.parent]: place.exit },
          foreground: [],
        },
      },
    ];
  }),
);

const roadScenes = Object.fromEntries(
  OVERLAND_ROAD.map(({ id, name }) => {
    const capital = id === 'road-capital';
    const night = ['road-bridge', 'road-reeds'].includes(id);
    const art = `./assets/exploration/overland-road/${id}-wide`;
    return [
      id,
      {
        id,
        name,
        title: name,
        returnDestination: null,
        visitors: false,
        cutouts: [],
        points: capital ? [exit(SILVER_CROWN_GATE, '进入银冠城')] : [],
        illustration: {
          image: `${art}.png`,
          ...(night ? { nightImage: `${art}-night.png` } : {}),
          aspect: 3,
          viewHeight: 0.86,
          viewWidth: 2.05,
          fullVerticalPan: true,
          arrivalPan: true,
          spots: {},
          points: capital ? { [SILVER_CROWN_GATE]: [0.634, 0.59] } : {},
          foreground: [],
        },
      },
    ];
  }),
);

const capitalScenes = Object.fromEntries(
  Object.entries(SILVER_CROWN_PLACES).map(([id, place]) => {
    const points = Object.keys(place.exits).map((destination) =>
      exit(
        destination,
        destination === 'tavern'
          ? '推门进入万象酒馆'
          : destination === 'road-capital'
            ? '返回银冠城外门'
            : `前往${SILVER_CROWN_PLACES[destination].name}`,
      ),
    );
    const returnDestination = Object.keys(place.exits)[0];
    return [
      id,
      {
        id,
        name: `银冠城 · ${place.name}`,
        title: place.name,
        returnDestination,
        returnLabel: SILVER_CROWN_PLACES[returnDestination]?.name || '城外门',
        cutouts: [],
        points,
        illustration: {
          image: `./assets/exploration/silver-crown/${id}.png`,
          ...(place.night
            ? { nightImage: `./assets/exploration/silver-crown/${id}-night.png` }
            : {}),
          ...(place.wide
            ? { viewHeight: 0.9, viewWidth: 2.2, arrivalPan: true }
            : { fixed: true, fitWidth: true }),
          spots: Object.fromEntries(
            place.spots.map((foot, index) => [
              `crown-spot-${index}`,
              { foot, height: place.wide ? 0.34 : 0.42 },
            ]),
          ),
          points: place.exits,
          foreground: [],
        },
      },
    ];
  }),
);

const eternalCityFeet = [
  [0.35, 0.85],
  [0.64, 0.85],
];
const eternalCityScenes = Object.fromEntries(
  Object.entries(ETERNAL_CITY_PLACES).map(([id, place]) => [
    id,
    {
      id,
      name: `艾尔鲁斯 · ${place.name}`,
      title: place.name,
      returnDestination: null,
      cutouts: [],
      points: Object.keys(place.exits).map((destination) =>
        exit(destination, `前往${ETERNAL_CITY_PLACES[destination].name}`),
      ),
      illustration: {
        image: `./assets/exploration/eternal-city/${place.art || id}.png`,
        aspect: 3,
        viewHeight: 0.9,
        viewWidth: 2.1,
        arrivalPan: true,
        points: place.exits,
        spots: Object.fromEntries(
          ETERNAL_CITY_VISITOR_SPOTS.map((spot, index) => [
            spot,
            { foot: (place.feet ?? eternalCityFeet)[index], height: 0.34 },
          ]),
        ),
        foreground: [],
      },
    },
  ]),
);

const eternalRoadScenes = Object.fromEntries(
  Object.entries(ETERNAL_CITY_STOPS).map(([id, name]) => [
    id,
    {
      id,
      name,
      title: name,
      returnDestination: null,
      visitors: false,
      cutouts: [],
      points: [],
      illustration: {
        image: `./assets/exploration/eternal-city/${id}.png`,
        aspect: 3,
        viewHeight: 0.86,
        viewWidth: 2.05,
        fullVerticalPan: true,
        points: {},
        spots: {},
        foreground: [],
      },
    },
  ]),
);

const SCENES = Object.freeze({
  street: STARLAMP_STREET,
  ...Object.fromEntries(
    [CITY_CENTER, ...Object.values(STARBELL_SCENES)].map((scene) => [
      scene.id,
      withExtraExits(scene),
    ]),
  ),
  ...sideScenes,
  ...roadScenes,
  ...capitalScenes,
  ...eternalCityScenes,
  ...eternalRoadScenes,
});

export function explorationScene(id) {
  return Object.hasOwn(SCENES, id) ? SCENES[id] : STARLAMP_STREET;
}

export function explorationHref(id, timeOfDay, from) {
  if (!Object.hasOwn(SCENES, id) && id !== 'tavern') throw Error('未知探索地点');
  const path =
    id === 'tavern'
      ? './tavern.html?return=street'
      : id === 'street'
        ? './street.html'
        : './street.html?scene=' + encodeURIComponent(id);
  const params = new URLSearchParams();
  if (timeOfDay === 'night') params.set('time', 'night');
  const art = SCENES[id]?.illustration;
  if (art?.arrivalPan && Object.hasOwn(art.points, from)) params.set('from', from);
  return params.size ? path + (path.includes('?') ? '&' : '?') + params : path;
}
