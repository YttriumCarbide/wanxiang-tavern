import { STARLAMP_STREET } from '../content/starlamp-street.js';
import { CITY_CENTER } from '../content/city-center.js';
import { STARBELL_SCENES } from '../content/starbell-scenes.js';
import { TOWN_SIDE_PLACES } from '../content/town-side-places.js';
import { OVERLAND_ROAD } from '../content/overland-road.js';

const exit = (id, name) => ({ id, name, kind: '前往', destination: id, immediate: true });

function withExtraExits(definition) {
  const children = Object.entries(TOWN_SIDE_PLACES).filter(
    ([, place]) => place.parent === definition.id,
  );
  if (definition.id === 'outskirts') {
    const first = OVERLAND_ROAD[0];
    children.push([first.id, { name: first.name, entrance: [0.935, 0.69] }]);
  }
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
  OVERLAND_ROAD.map(({ id, name, back, onward }, index) => {
    const previous = OVERLAND_ROAD[index - 1] || { id: 'outskirts', label: '城外旧哨塔' };
    const next = OVERLAND_ROAD[index + 1];
    const points = [exit(previous.id, `返回${previous.label}`)];
    const anchors = { [previous.id]: back };
    if (next) {
      points.push(exit(next.id, `前往${next.label}`));
      anchors[next.id] = onward;
    }
    return [
      id,
      {
        id,
        name,
        title: name,
        returnDestination: previous.id,
        returnLabel: previous.label,
        visitors: false,
        cutouts: [],
        points,
        illustration: {
          image: `./assets/exploration/overland-road/${id}-wide.png`,
          aspect: 3,
          viewHeight: 0.86,
          viewWidth: 2.05,
          fullVerticalPan: true,
          arrivalPan: true,
          spots: {},
          points: anchors,
          foreground: [],
        },
      },
    ];
  }),
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
