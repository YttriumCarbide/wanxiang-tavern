export const PLAYBACK_BEAT_MS = 800;

/** Every slot gets one beat, including the second slot of a 2 AP action. End effects share a beat. */
export function playbackBeats(result) {
  const end = result.events.some((event) => event.at >= result.slots.length);
  const beats = [];
  for (let at = 0; at < result.slots.length + Number(end); at++) {
    let beat = { at, events: [] };
    for (const event of result.events.filter((item) => item.at === at)) {
      if (event.type === 'hero' && event.repeatIndex > 1 && beat.events.length) {
        beats.push(beat);
        beat = { at, events: [] };
      }
      beat.events.push(event);
    }
    beats.push(beat);
  }
  return beats;
}
