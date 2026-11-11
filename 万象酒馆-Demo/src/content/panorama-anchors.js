/** Author hotspots against the continuous picture, then project them from the same eye. */
export function panoramaAnchor(horizontal, vertical, distance = 12) {
  const longitude = (horizontal - 0.5) * Math.PI * 2;
  const latitude = ((0.5 - vertical) * Math.PI * 2) / 3;
  const ground = Math.cos(latitude) * distance;
  return [
    Math.sin(longitude) * ground,
    1.65 + Math.sin(latitude) * distance,
    -Math.cos(longitude) * ground,
  ];
}
