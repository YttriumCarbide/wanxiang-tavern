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
import {
  IMPERIAL_CROSSROADS,
  IMPERIAL_DUNGEONS,
  IMPERIAL_FORTS,
} from '../content/imperial-network.js';

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
        returnDestination: 'tavern',
        returnLabel: '返回酒馆',
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

const capitalScenes = Object.fromEntries(
  Object.entries(SILVER_CROWN_PLACES).map(([id, place]) => {
    const points = Object.keys(place.exits).map((destination) =>
      exit(
        destination,
        destination === 'tavern'
          ? '推门进入万象酒馆'
          : `前往${SILVER_CROWN_PLACES[destination].name}`,
      ),
    );
    const returnDestination = 'tavern';
    return [
      id,
      {
        id,
        name: `银冠城 · ${place.name}`,
        title: place.name,
        returnDestination,
        returnLabel: '返回酒馆',
        cutouts: [],
        points,
        illustration: {
          image: './assets/exploration/city-backgrounds/silver-crown.png',
          aspect: 16 / 9,
          fixed: true,
          fitWidth: true,
          pureBackdrop: true,
          spots: Object.fromEntries(
            place.spots.map((foot, index) => [`crown-spot-${index}`, { foot, height: 0.38 }]),
          ),
          points: place.exits,
          foreground: [],
        },
      },
    ];
  }),
);

const roadScenes = Object.fromEntries(
  OVERLAND_ROAD.map(({ id, name }) => {
    if (id === 'road-capital') {
      return [
        id,
        {
          ...capitalScenes[SILVER_CROWN_GATE],
          id,
          name: `银冠城 · ${SILVER_CROWN_PLACES[SILVER_CROWN_GATE].name}`,
          title: SILVER_CROWN_PLACES[SILVER_CROWN_GATE].name,
          returnDestination: 'tavern',
          returnLabel: '返回酒馆',
        },
      ];
    }
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
        points: [],
        illustration: {
          image: `${art}.png`,
          ...(night ? { nightImage: `${art}-night.png` } : {}),
          aspect: 3,
          viewHeight: 0.86,
          viewWidth: 2.05,
          fullVerticalPan: true,
          arrivalPan: true,
          spots: {},
          points: {},
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
      returnDestination: 'tavern',
      returnLabel: '返回酒馆',
      cutouts: [],
      points: Object.keys(place.exits).map((destination) =>
        exit(destination, `前往${ETERNAL_CITY_PLACES[destination].name}`),
      ),
      illustration: {
        image: './assets/exploration/city-backgrounds/eternal-city.png',
        aspect: 16 / 9,
        fixed: true,
        fitWidth: true,
        pureBackdrop: true,
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

const crossroadArtScenes = Object.fromEntries(
  IMPERIAL_CROSSROADS.map(({ id, name, imageId }) => [
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
        image: `./assets/exploration/overland-road/${imageId}-wide.png`,
        aspect: 3,
        viewHeight: 0.86,
        viewWidth: 2.05,
        fullVerticalPan: true,
        arrivalPan: true,
        spots: {},
        points: {},
        foreground: [],
      },
    },
  ]),
);

const dungeonTrailImages = Object.freeze({
  mill: 'road-meadow-wide',
  ruins: 'road-orchard-wide',
  forest: 'road-pines-wide',
  frost: 'road-ridge-wide',
  forge: 'road-aqueduct-wide',
  tide: 'road-causeway-wide',
  'moss-hollow': 'road-meadow-wide',
  'graystone-quarry': 'road-ridge-wide',
  'border-watch': 'road-downs-wide',
  'whisper-grove': 'road-pines-wide',
  'silver-cistern': 'road-orchard-wide',
  'ash-foundry': 'road-aqueduct-wide',
  'astral-sanctum': 'road-causeway-wide',
  'starbell-undercroft': 'road-downs-wide',
});

const imperialLandmarkScenes = Object.fromEntries(
  [...IMPERIAL_DUNGEONS, ...IMPERIAL_FORTS].map(({ id, name }) => {
    const artName = dungeonTrailImages[id] || 'road-ridge-wide';
    return [
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
          image: `./assets/exploration/overland-road/${artName}.png`,
          aspect: 3,
          viewHeight: 0.86,
          viewWidth: 2.05,
          fullVerticalPan: true,
          arrivalPan: true,
          spots: {},
          points: {},
          foreground: [],
        },
      },
    ];
  }),
);

const cityCenterScene = withExtraExits(CITY_CENTER);

const SCENES = Object.freeze({
  street: cityCenterScene,
  'starlamp-street': cityCenterScene,
  ...Object.fromEntries(
    [CITY_CENTER, ...Object.values(STARBELL_SCENES)].map((scene) => [
      scene.id,
      scene.id === 'city-center' ? cityCenterScene : withExtraExits(scene),
    ]),
  ),
  ...sideScenes,
  ...roadScenes,
  ...capitalScenes,
  ...eternalCityScenes,
  ...eternalRoadScenes,
  ...crossroadArtScenes,
  ...imperialLandmarkScenes,
});

export function explorationScene(id) {
  if (id === 'street' || id === 'starlamp-street') return SCENES['city-center'];
  return Object.hasOwn(SCENES, id) ? SCENES[id] : SCENES['city-center'];
}

export function explorationHref(id, timeOfDay, from) {
  if (!Object.hasOwn(SCENES, id) && id !== 'tavern') throw Error('未知探索地点');
  const resolved = id === 'street' || id === 'starlamp-street' ? 'city-center' : id;
  const path =
    resolved === 'tavern'
      ? './tavern.html?return=city-center'
      : './street.html?scene=' + encodeURIComponent(resolved);
  const params = new URLSearchParams();
  if (timeOfDay === 'night') params.set('time', 'night');
  const art = SCENES[resolved]?.illustration;
  if (art?.arrivalPan && Object.hasOwn(art.points, from)) params.set('from', from);
  return params.size ? path + (path.includes('?') ? '&' : '?') + params : path;
}
