export function rpBackground(map, node) {
  const mapped = map === 'mill' ? 'forest' : map;
  const region = ['ruins', 'forest', 'frost', 'forge', 'tide'].includes(mapped) ? mapped : 'ruins';
  return `./assets/events/${region}-${node === 1 ? 'event' : 'quest'}.png`;
}
