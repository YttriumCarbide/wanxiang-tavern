import { CITIES, cityForScene } from '../city-directory.js';

const MARKET_SCENES = Object.freeze({
  starbell: './assets/exploration/town-side-places/market-alley.png',
  'silver-crown': './assets/exploration/silver-crown/crown-arcade.png',
  eternal: './assets/exploration/eternal-city/eternal-quay.png',
});

export function cityServiceArt(cityId, scene) {
  const id = Object.hasOwn(CITIES, cityId) ? cityId : cityForScene(scene) || 'starbell';
  const { name, image } = CITIES[id];
  return { name, market: MARKET_SCENES[id], guild: image };
}
