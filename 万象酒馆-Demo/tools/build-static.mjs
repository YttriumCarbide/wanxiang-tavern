import { build } from 'esbuild';
import { cp, readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBuiltinWorld } from './build-builtin-world.mjs';
import { buildAssetCatalog } from './build-asset-catalog.mjs';
import { buildUpdateManifests } from './build-update-manifests.mjs';
import { TUTORIAL_GATE } from '../src/updates/manifest.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist');
const goatCounterScript = `    <script
      data-goatcounter="https://yttriumcarbide.goatcounter.com/count"
      async
      src="https://gc.zgo.at/count.js"
    ></script>`;

function releasePath(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

export async function buildStatic() {
  const plan = JSON.parse(await readFile(path.join(root, '发布资产划分.json'), 'utf8'));
  const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  const exclusions = plan.staticExcludes.map((pattern) => new RegExp(pattern));
  const isPublic = (relative) => !exclusions.some((pattern) => pattern.test(relative));
  await buildBuiltinWorld();
  const catalog = await buildAssetCatalog();
  await mkdir(path.join(root, 'vendor/runtime'), { recursive: true });
  const dependencies = {
    tiktoken: 'js-tiktoken/lite',
    o200k_base: 'js-tiktoken/ranks/o200k_base',
    sha2: '@noble/hashes/sha2.js',
  };
  for (const [name, dependency] of Object.entries(dependencies))
    await build({
      stdin: {
        contents: `export * from '${dependency}';${name === 'o200k_base' ? `export { default } from '${dependency}';` : ''}`,
        resolveDir: root,
      },
      outfile: path.join(root, 'vendor/runtime', name + '.js'),
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2022',
      minify: true,
      legalComments: 'eof',
    });
  await cp(
    path.join(root, 'vendor/licenses/tiktoken.LICENSE'),
    path.join(root, 'vendor/runtime/tiktoken.LICENSE'),
  );
  await cp(
    path.join(root, 'node_modules/@noble/hashes/LICENSE'),
    path.join(root, 'vendor/runtime/sha2.LICENSE'),
  );
  if (path.resolve(destination) !== path.join(root, 'dist')) throw Error('发布目录无效');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination);
  // Explicit public allowlist. Private stores, imported presets, server and tests never enter dist.
  for (const directory of ['src', 'styles', 'assets', 'vendor'])
    await cp(path.join(root, directory), path.join(destination, directory), {
      recursive: true,
      filter: (source) => isPublic(releasePath(source)),
    });
  const publicCatalog = {
    ...catalog,
    files: Object.fromEntries(Object.entries(catalog.files).filter(([file]) => isPublic(file))),
    characterArt: catalog.characterArt.filter((file) => isPublic(file.replace(/^\.\//, ''))),
  };
  await writeFile(
    path.join(destination, 'assets/asset-catalog.json'),
    JSON.stringify(publicCatalog, null, 2) + '\n',
  );
  await mkdir(path.join(destination, 'prompts'));
  for (const directory of ['framework', 'worldbook'])
    await cp(path.join(root, 'prompts', directory), path.join(destination, 'prompts', directory), {
      recursive: true,
    });
  for (const entry of await readdir(path.join(root, 'prompts')))
    if (entry.endsWith('.md'))
      await cp(path.join(root, 'prompts', entry), path.join(destination, 'prompts', entry));
  for (const entry of await readdir(root))
    if (entry.endsWith('.html') || entry === 'service-worker.js')
      await cp(path.join(root, entry), path.join(destination, entry));
  const indexFile = path.join(destination, 'index.html');
  const indexPage = await readFile(indexFile, 'utf8');
  const gate = plan.updates.gates[TUTORIAL_GATE]?.length ? 'required' : 'empty';
  const releasePage = indexPage.replace(
    /(<meta charset="utf-8" \/>)/,
    '$1\n    <meta name="wanxiang-update-manifest" content="./manifest.json"' +
      ` data-version="${version}" data-tutorial-gate="${gate}" />`,
  );
  const publicBuild = process.env.WANXIANG_ENABLE_GOATCOUNTER === 'true';
  await writeFile(
    indexFile,
    publicBuild
      ? releasePage.replace('  </head>', `${goatCounterScript}\n  </head>`)
      : releasePage,
  );
  await writeFile(path.join(destination, '.nojekyll'), '');
  const files = [];
  async function inventory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await inventory(file);
      else
        files.push({
          path: path.relative(destination, file).replaceAll('\\', '/'),
          bytes: (await stat(file)).size,
        });
    }
  }
  await inventory(destination);
  files.push(...(await buildUpdateManifests(destination, version, files, plan)));
  const manifest = {
    app: 'wanxiang-tavern-static',
    version,
    backend: 'browser',
    privateData: false,
    files,
  };
  await writeFile(path.join(destination, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `Static release: ${files.length} files, ${Math.round(files.reduce((sum, file) => sum + file.bytes, 0) / 1024 / 1024)} MiB`,
  );
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildStatic();
