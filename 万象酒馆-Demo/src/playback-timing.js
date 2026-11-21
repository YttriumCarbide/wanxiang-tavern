export const PLAYBACK_BEAT_MS = 800;

const SEQUENTIAL_SLOT_TYPES = new Set([
  'hero',
  'enemy',
  'entrySkill',
  'counter',
  'swap',
  'engage',
  'item',
]);
const PRE_ACTION_TYPES = new Set(['hiddenWeaponLock']);

/** Every slot gets one beat, including the second slot of a 2 AP action. End effects share a beat. */
export function playbackBeats(result) {
  const end = result.events.some((event) => event.at >= result.slots.length);
  const beats = [];
  for (let at = 0; at < result.slots.length + Number(end); at++) {
    let beat = { at, events: [] };
    for (const event of result.events.filter((item) => item.at === at)) {
      if (
        beat.events.length &&
        (PRE_ACTION_TYPES.has(event.type) ||
          beat.events.some((item) => PRE_ACTION_TYPES.has(item.type)) ||
          ['bossPhase', 'bombDetonate', 'bombDefuse'].includes(event.type) ||
          event.type === 'counter' ||
          beat.events.some((item) =>
            ['bossPhase', 'bombDetonate', 'bombDefuse'].includes(item.type),
          ) ||
          event.repeatIndex > 1 ||
          (at < result.slots.length &&
            SEQUENTIAL_SLOT_TYPES.has(event.type) &&
            beat.events.some((item) => SEQUENTIAL_SLOT_TYPES.has(item.type))))
      ) {
        beats.push(beat);
        beat = { at, events: [] };
      }
      beat.events.push(event);
    }
    beats.push(beat);
  }
  return beats;
}
