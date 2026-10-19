/** Pure weather deck: no DOM, renderer or battle state. */
export const WEATHERS = Object.freeze([
  Object.freeze({ id: 'clear', label: '晴', weight: 24, particles: 0 }),
  Object.freeze({ id: 'rain', label: '细雨', weight: 25, particles: 720 }),
  Object.freeze({ id: 'snow', label: '落雪', weight: 20, particles: 560 }),
  Object.freeze({ id: 'thunder', label: '雷雨', weight: 17, particles: 820 }),
  Object.freeze({ id: 'mist', label: '薄雾', weight: 14, particles: 18 }),
]);

export function chooseWeather(random = Math.random) {
  const total = WEATHERS.reduce((sum, weather) => sum + weather.weight, 0);
  let roll = Math.max(0, Math.min(0.999999, Number(random()) || 0)) * total;
  for (const weather of WEATHERS) {
    roll -= weather.weight;
    if (roll < 0) return weather;
  }
  return WEATHERS[WEATHERS.length - 1];
}
