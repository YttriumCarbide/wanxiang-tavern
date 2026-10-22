export function shade(hex, factor) {
  return (
    '#' +
    hex
      .slice(1)
      .match(/../g)
      .map((value) =>
        Math.min(255, Math.round(parseInt(value, 16) * factor))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Same projection, lighting, backdrop and card fit as the shipped creature portraits. */
export function renderVoxelEnemyPortrait(enemy, blocks) {
  const base = enemy.color;
  const project = (x, y, z) => [128 + (x - z) * 9, 280 + (x + z) * 3.8 - y * 12];
  const vertices = blocks.flatMap(({ x, y, z, w, d, h }) =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sz) =>
        [0, h].map((dy) => project(x + (sx * w) / 2, y + dy, z + (sz * d) / 2)),
      ),
    ),
  );
  const left = Math.min(...vertices.map(([x]) => x));
  const right = Math.max(...vertices.map(([x]) => x));
  const top = Math.min(...vertices.map(([, y]) => y));
  const bottom = Math.max(...vertices.map(([, y]) => y));
  // Fit the creature itself, so a wide beetle and a tall guardian both fill the card.
  const scale = Math.min(224 / (right - left), 252 / (bottom - top));
  const height = (bottom - top) * scale;
  const centerY = 202 + Math.max(0, 220 - height) * 0.12;
  const offsetX = 128 - ((left + right) * scale) / 2;
  const offsetY = centerY - ((top + bottom) * scale) / 2;
  const point = ([x, y]) => x.toFixed(1) + ',' + y.toFixed(1);
  const polygon = (points, color) =>
    `<polygon points="${points.map(point).join(' ')}" fill="${color}"/>`;
  const geometry = [...blocks]
    .sort((a, b) => a.x + a.z - b.x - b.z || a.y - b.y)
    .flatMap((b) => {
      const x = b.x - b.w / 2,
        z = b.z - b.d / 2;
      const corners = [
        [x, b.y, z],
        [x + b.w, b.y, z],
        [x + b.w, b.y, z + b.d],
        [x, b.y, z + b.d],
      ];
      const bottom = corners.map((p) => project(...p));
      const top = corners.map(([x, y, z]) => project(x, y + b.h, z));
      return [
        polygon([bottom[1], bottom[2], top[2], top[1]], shade(b.color, 0.64)),
        polygon([bottom[2], bottom[3], top[3], top[2]], shade(b.color, 0.88)),
        polygon(top, shade(b.color, 1.15)),
      ];
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 256 384" data-art-style="isometric-voxel-v3"><title>${enemy.name}</title>
<defs><radialGradient id="chamber" cx="50%" cy="54%" r="68%"><stop stop-color="${shade(base, 0.65)}"/><stop offset="1" stop-color="#142428"/></radialGradient></defs>
<path fill="url(#chamber)" d="M0 0h256v384H0z"/>
<ellipse cx="128" cy="${(centerY + height / 2 - 2).toFixed(1)}" rx="${Math.min(99, (right - left) * scale * 0.42).toFixed(1)}" ry="10" fill="#09171b" opacity=".5"/>
<g data-enemy-model="${enemy.id}" transform="translate(${offsetX.toFixed(3)} ${offsetY.toFixed(3)}) scale(${scale.toFixed(5)})">${geometry}</g>
</svg>\n`;
}
