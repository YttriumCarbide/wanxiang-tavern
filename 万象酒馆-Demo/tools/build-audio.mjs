import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { musicScore } from './audio/score.mjs';
import { renderScore } from './audio/render.mjs';
import { MUSIC } from '../src/audio/config.js';

const root = new URL('../', import.meta.url);
await mkdir(new URL('assets/audio/', root), { recursive: true });
for (const scene of Object.keys(MUSIC)) {
  const score = musicScore(scene),
    wav = renderScore(score),
    path = new URL(MUSIC[scene].file, root);
  await writeFile(path, wav);
  console.log(
    `${score.name}: ${score.duration}s, ${(wav.length / 1048576).toFixed(2)} MiB → ${fileURLToPath(path)}`,
  );
}
