export const PLAYBACK_BEAT_MS = 800;

/** Every slot gets one beat, including the second slot of a 2 AP action. End effects share a beat. */
export function playbackBeats(result) {
  const end = result.events.some((event) => event.at >= result.slots.length);
  return Array.from({ length: result.slots.length + Number(end) }, (_, at) => ({
    at,
    events: result.events.filter((event) => event.at === at),
  }));
}
