/** Align old exported crystal tracks without changing positions baked into the voxel geometry. */
export function synchronizeSummonCrystals(clip) {
  const aligned = clip.clone();
  const tracks = aligned.tracks.filter((track) =>
    /Summoning_Crystal_.*\.position$/.test(track.name),
  );
  if (tracks.length > 1) {
    for (const track of tracks.slice(1)) {
      track.times = tracks[0].times.slice();
      track.values = tracks[0].values.slice();
      track.setInterpolation(tracks[0].getInterpolation());
    }
  }
  return aligned;
}
