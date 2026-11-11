import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { HEROES } from '../src/data.js';
import { portraitUrl } from '../src/portraits.js';
import { TAVERN_VISITORS } from '../src/content/tavern-visitors.js';
import { OFFICIAL_VISITORS } from '../src/content/official-visitors.js';

/** Content identity changes only with the source bytes, including in local development. */
export async function buildAssetCatalog() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = {};
  async function inventory(directory) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const file = directory + '/' + entry.name;
      if (entry.isDirectory()) await inventory(file);
      else if (/\.(png|jpe?g|webp|svg|glb)$/i.test(file) && !file.endsWith('/fan-yuexi.webp')) {
        const bytes = await readFile(path.join(root, file));
        files[file] = {
          bytes: bytes.length,
          hash: createHash('sha256').update(bytes).digest('hex'),
        };
      }
    }
  }
  await inventory('assets');
  const characterArt = [
    ...new Set([
      ...HEROES.map(portraitUrl),
      ...Object.values(OFFICIAL_VISITORS).map((entry) => portraitUrl(entry.combat)),
      ...TAVERN_VISITORS.map(
        (entry) => entry.image || `./assets/tavern-visitors/${entry.id}-full-v1.png`,
      ),
      './assets/portraits/edith.png',
      './assets/portraits/pandora.png',
      ...Object.keys(files)
        .filter((file) => file.startsWith('assets/portraits/template-'))
        .map((file) => './' + file),
    ]),
  ].filter((file) => files[file.replace(/^\.\//, '')]);
  const catalog = { version: 1, files, characterArt };
  await writeFile(
    path.join(root, 'assets/asset-catalog.json'),
    JSON.stringify(catalog, null, 2) + '\n',
  );
  return catalog;
}
