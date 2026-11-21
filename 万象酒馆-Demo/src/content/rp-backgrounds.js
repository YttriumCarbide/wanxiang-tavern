const EVENT_REGIONS = new Set([
  'mill',
  'ruins',
  'forest',
  'frost',
  'forge',
  'tide',
  'dynasty',
  'xianxia',
  'castle',
  'arcane',
  'metropolis',
  'nexus',
  'wasteland',
  'relic',
  'graystone-quarry',
  'city-market',
  'black-market',
]);

export function rpBackground(map, node) {
  const region = EVENT_REGIONS.has(map) ? map : 'ruins';
  return `./assets/events/${region}-${node === 1 ? 'event' : 'quest'}.png`;
}
