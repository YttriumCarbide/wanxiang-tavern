/** Transparent padding is not body height; opaque feet define contact with the floor. */
export function standingFrame(alpha, width, height, imageHeight) {
  let first = height;
  let last = -1;
  const left = Math.floor(width * 0.18);
  const right = Math.ceil(width * 0.82);
  for (let row = 0; row < height; row++) {
    let count = 0;
    for (let column = left; column < right; column++)
      if (alpha[(row * width + column) * 4 + 3] >= 144) count++;
    if (count < 2) continue;
    first = Math.min(first, row);
    last = row;
  }
  if (last <= first) return { top: 0, foot: imageHeight };
  return { top: (first * imageHeight) / height, foot: ((last + 1) * imageHeight) / height };
}
