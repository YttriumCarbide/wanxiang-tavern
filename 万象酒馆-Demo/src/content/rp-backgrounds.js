export function rpBackground(map, node) {
  const region = ['ruins', 'forest', 'frost', 'forge', 'tide'].includes(map) ? map : 'ruins';
  return `./assets/events/${region}-${node === 1 ? 'event' : 'quest'}.png`;
}
