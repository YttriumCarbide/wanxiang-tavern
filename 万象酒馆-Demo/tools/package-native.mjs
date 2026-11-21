import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, link, mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadUpdateRelease } from '../src/updates/manifest.js';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
const dist = path.join(root, 'dist');
const androidProject = path.join(root, 'native', 'android');
const pcProject = path.join(root, 'native', 'pc');
const output = path.join(root, '.runtime', 'native');
const firstPack = path.join(output, 'first-pack');
const releaseFiles = ['manifest.json', 'chunks.json'];

async function localFetch(url) {
  const resolved = new URL(url);
  if (resolved.protocol !== 'file:') return new Response(null, { status: 404 });
  const file = fileURLToPath(resolved);
  if (path.dirname(file) !== dist || !releaseFiles.includes(path.basename(file)))
    return new Response(null, { status: 404 });
  return new Response(await readFile(file));
}

async function loadDist() {
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const release = await loadUpdateRelease(pathToFileURL(path.join(dist, 'manifest.json')), {
    fetchImpl: localFetch,
    expectedVersion: version,
  });
  const initial = release.index.chunks.find((chunk) => chunk.delivery === 'initial');
  if (!initial.files.some((file) => file.path === 'index.html'))
    throw Error('Missing first-pack entry');
  const deferred = release.index.chunks
    .filter((chunk) => chunk.delivery !== 'initial')
    .flatMap((chunk) => chunk.files);
  return { ...release, initial, deferred };
}

async function resetDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const actual = await realpath(directory);
  const actualRoot = await realpath(root);
  if (actual !== path.join(actualRoot, path.relative(root, directory)))
    throw Error('Unexpected output path: ' + actual);
  await rm(directory, { recursive: true });
  await mkdir(directory);
}

async function checkFiles(files) {
  for (const file of files) {
    const source = path.join(dist, file.path);
    if ((await stat(source)).size !== file.bytes) throw Error('Build size mismatch: ' + file.path);
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(source)) hash.update(bytes);
    if (hash.digest('hex') !== file.sha256) throw Error('Build digest mismatch: ' + file.path);
  }
}

async function copyTo(directory, relative) {
  const target = path.join(directory, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(dist, relative), target);
  return target;
}

async function stageFirstPack(directory, { initial }) {
  await checkFiles(initial.files);
  await resetDirectory(directory);
  for (const relative of [...releaseFiles, ...initial.files.map((file) => file.path)])
    await copyTo(directory, relative);
}

async function stageUpdates({ manifest, deferred }) {
  await checkFiles(deferred);
  const directory = path.join(output, 'updates');
  const raw = path.join(directory, 'raw');
  const release = path.join(directory, 'github-release');
  await resetDirectory(directory);
  await mkdir(release);
  for (const file of releaseFiles) {
    await copyTo(raw, file);
    await copyTo(release, file);
  }
  const digests = new Set();
  for (const file of deferred) {
    const source = await copyTo(raw, file.path);
    if (digests.has(file.sha256)) continue;
    digests.add(file.sha256);
    const target = path.join(release, 'asset-' + file.sha256);
    await link(source, target).catch(() => copyFile(source, target));
  }
  if (manifest.sources.every((source) => source.kind === 'local'))
    console.log('No remote mirror is configured in this build.');
  console.log('Update files: ' + directory);
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(command + ' exited with ' + (result.status ?? result.signal));
}

async function buildAndroid(release) {
  const revision = process.env.WANXIANG_ANDROID_VERSION_CODE ?? '1';
  if (!/^[1-9]\d*$/.test(revision) || Number(revision) > 2_100_000_000)
    throw Error('WANXIANG_ANDROID_VERSION_CODE must be a positive Android version code');
  await stageFirstPack(firstPack, release);
  const args = [
    'assembleDebug',
    '-PwanxiangVersion=' + release.manifest.version,
    '-PwanxiangVersionCode=' + revision,
  ];
  if (process.platform === 'win32')
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'gradle', ...args], { cwd: androidProject });
  else run('gradle', args, { cwd: androidProject });
}

async function buildPc(release) {
  const directory = path.join(output, 'pc-win-x64');
  await stageFirstPack(path.join(directory, 'www'), release);
  run(
    'go',
    ['build', '-trimpath', '-ldflags=-s -w', '-o', path.join(directory, 'WanxiangTavern.exe'), '.'],
    {
      cwd: pcProject,
      env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
    },
  );
  console.log('Windows app: ' + directory);
}

async function check(release) {
  await checkFiles([...release.initial.files, ...release.deferred]);
  const mib = (bytes) => (bytes / 1024 ** 2).toFixed(1) + ' MiB';
  console.log(
    'First pack: ' + release.initial.files.length + ' files, ' + mib(release.initial.bytes),
  );
  console.log(
    'Deferred: ' +
      release.deferred.length +
      ' files, ' +
      mib(release.deferred.reduce((sum, file) => sum + file.bytes, 0)),
  );
}

const actions = new Map([
  ['android', buildAndroid],
  ['pc', buildPc],
  ['updates', stageUpdates],
  ['check', check],
]);
const action = actions.get(process.argv[2]);
if (!action) throw Error('Usage: node tools/package-native.mjs android|pc|updates|check');
await action(await loadDist());
