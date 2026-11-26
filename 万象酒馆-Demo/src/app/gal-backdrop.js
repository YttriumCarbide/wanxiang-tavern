import { CHAT_PLACES } from '../chat-places.js';
import { TOWN_SIDE_PLACES } from '../content/town-side-places.js';
import { SILVER_CROWN_PLACES } from '../content/silver-crown-scenes.js';
import { ETERNAL_CITY_PLACES } from '../content/eternal-city-scenes.js';
import { OUTING_SCENES } from '../daily.js';
import { explorationScene } from '../exploration/scenes.js';
import { cityForScene } from '../city-directory.js';

const STARBELL_IMAGE = './assets/exploration/city-backgrounds/starbell.webp';
const SILVER_CROWN_IMAGE = './assets/exploration/city-backgrounds/silver-crown.webp';
const ETERNAL_CITY_IMAGE = './assets/exploration/city-backgrounds/eternal-city.webp';
const TAVERN_IMAGE = './assets/title-tavern.png';

const TAVERN_INDOOR_PLACES = new Set(['corridor', 'bar', 'bar2', 'table', 'table2']);

const STARBELL_FOCAL = Object.freeze({
  'city-center': {
    cityName: '星钟城',
    pos: '45% 44%',
    scale: 1.72,
    blur: 9.5,
    bri: 0.5,
    sat: 0.96,
    mood: 'candle',
  },
  market: {
    cityName: '星钟城',
    pos: '64% 66%',
    scale: 1.65,
    blur: 8.5,
    bri: 0.52,
    sat: 1.02,
    mood: 'warm',
  },
  rampart: {
    cityName: '星钟城',
    pos: '82% 20%',
    scale: 1.85,
    blur: 9.0,
    bri: 0.48,
    sat: 0.94,
    mood: 'star',
  },
  outskirts: {
    cityName: '星钟城',
    pos: '18% 72%',
    scale: 1.75,
    blur: 9.0,
    bri: 0.5,
    sat: 0.92,
    mood: 'dusk',
  },
  street: {
    cityName: '星灯街',
    pos: '50% 54%',
    scale: 1.48,
    blur: 8.5,
    bri: 0.54,
    sat: 1.04,
    mood: 'warm',
  },
  tavern: {
    cityName: '星灯街',
    image: TAVERN_IMAGE,
    pos: '52% 48%',
    scale: 1.45,
    blur: 9.0,
    bri: 0.52,
    sat: 1.04,
    mood: 'candle',
  },
});

const SILVER_CROWN_FOCALS = [
  { pos: '20% 66%', mood: 'warm' },
  { pos: '48% 48%', mood: 'candle' },
  { pos: '80% 44%', mood: 'warm' },
  { pos: '18% 46%', mood: 'dusk' },
  { pos: '60% 24%', mood: 'star' },
];

const ETERNAL_CITY_FOCALS = [
  { pos: '24% 68%', mood: 'dusk' },
  { pos: '52% 46%', mood: 'warm' },
  { pos: '76% 24%', mood: 'star' },
  { pos: '42% 62%', mood: 'candle' },
  { pos: '64% 58%', mood: 'dusk' },
];

function hashIndex(id, length) {
  let sum = 0;
  for (let index = 0; index < id.length; index++) sum += id.charCodeAt(index) * (index + 1);
  return sum % length;
}

function stripCityPrefix(name, cityName) {
  if (!name) return '';
  const prefix = `${cityName} · `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

function normalizeSceneId(rawId) {
  if (rawId === 'city-square') return 'city-center';
  if (rawId === 'starlamp-street') return 'street';
  return rawId || '';
}

function sceneIllustration(def, timeOfDay) {
  const source = def?.illustration;
  if (!source?.image) return '';
  return (timeOfDay === 'night' && source.nightImage) || source.image;
}

function resolveFocal(sceneId, placeId, timeOfDay) {
  if (Object.hasOwn(STARBELL_FOCAL, sceneId)) return STARBELL_FOCAL[sceneId];
  if (Object.hasOwn(SILVER_CROWN_PLACES, sceneId)) {
    const pick = SILVER_CROWN_FOCALS[hashIndex(sceneId, SILVER_CROWN_FOCALS.length)];
    return {
      cityName: '银冠城',
      image: SILVER_CROWN_IMAGE,
      pos: pick.pos,
      scale: 1.72,
      blur: 9.0,
      bri: 0.5,
      sat: 0.96,
      mood: pick.mood,
    };
  }
  if (Object.hasOwn(ETERNAL_CITY_PLACES, sceneId)) {
    const pick = ETERNAL_CITY_FOCALS[hashIndex(sceneId, ETERNAL_CITY_FOCALS.length)];
    return {
      cityName: '艾尔鲁斯',
      image: ETERNAL_CITY_IMAGE,
      pos: pick.pos,
      scale: 1.72,
      blur: 9.0,
      bri: 0.5,
      sat: 0.96,
      mood: pick.mood,
    };
  }
  if (Object.hasOwn(TOWN_SIDE_PLACES, sceneId)) {
    const side = TOWN_SIDE_PLACES[sceneId];
    const mood = sceneId.includes('alley')
      ? 'alley'
      : side.openAir
        ? timeOfDay === 'night'
          ? 'star'
          : 'dusk'
        : 'candle';
    return {
      cityName: '星钟城',
      pos: '50% 48%',
      scale: 1.46,
      blur: 8.5,
      bri: mood === 'alley' ? 0.45 : 0.52,
      sat: 1.0,
      mood,
    };
  }
  if (placeId === 'tavern' || TAVERN_INDOOR_PLACES.has(placeId) || placeId?.startsWith('room-')) {
    return { ...STARBELL_FOCAL.tavern };
  }
  return {
    cityName: '泛生界',
    pos: '50% 46%',
    scale: 1.65,
    blur: 9.0,
    bri: 0.5,
    sat: 0.96,
    mood: timeOfDay === 'night' ? 'star' : 'warm',
  };
}

/** Resolve blurred backdrop crop, ambient mood and location card data for a Gal scene. */
export function resolveGalBackdrop({
  placeId = '',
  sceneId = '',
  timeOfDay = 'day',
  stageTitle = '',
  envText = '',
  invitationMode = false,
} = {}) {
  const normalized = normalizeSceneId(sceneId || placeId);
  if (!normalized) return null;
  if (!invitationMode && cityForScene(normalized)) return null;
  if (
    !invitationMode &&
    (normalized === 'tavern' ||
      TAVERN_INDOOR_PLACES.has(normalized) ||
      normalized.startsWith('room-'))
  )
    return null;

  const def = explorationScene(normalized);
  const focal = resolveFocal(normalized, placeId, timeOfDay);
  const image =
    focal.image || sceneIllustration(def, timeOfDay) || (invitationMode ? '' : STARBELL_IMAGE);
  if (!image) return null;
  const chatMeta = CHAT_PLACES[placeId] || CHAT_PLACES[normalized];
  const rawPlace =
    stageTitle ||
    stripCityPrefix(chatMeta?.name, focal.cityName) ||
    def?.title ||
    OUTING_SCENES[normalized] ||
    '万象酒馆';
  const mood = timeOfDay === 'night' && focal.mood === 'warm' ? 'star' : focal.mood;

  return {
    key: `${normalized}:${rawPlace}:${timeOfDay}`,
    image,
    cityName: focal.cityName,
    placeName: rawPlace,
    ...(invitationMode
      ? { environment: envText ? { placeId: normalized, title: rawPlace, text: envText } : null }
      : {}),
    pos: focal.pos,
    scale: focal.scale,
    blur: focal.blur,
    bri: timeOfDay === 'night' ? Math.min(focal.bri, 0.44) : focal.bri,
    sat: focal.sat,
    mood,
    cinemaBars: Boolean(invitationMode),
  };
}
