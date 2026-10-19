/** Event types are emitted by engine.js; animation timing does not define ownership. */
export function actionSide(event) {
  if (event?.type === 'enemy') return 'enemy';
  if (event?.type === 'hero' || event?.type === 'swap' || event?.type === 'item') return 'player';
  return null;
}

export function firstActionSide(events) {
  for (const event of events) {
    const side = actionSide(event);
    if (side) return side;
  }
  return 'player';
}
