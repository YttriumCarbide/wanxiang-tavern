import assert from 'node:assert/strict';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { MUSIC } from '../../src/audio/config.js';
import { portraitUrl } from '../../src/portraits.js';
import { projectRoot as root, command, freePort, waitForServer, stopServer } from './runtime.mjs';
export async function serverChecks(baseURL, port) {
  const { HEROES } = await import('../../src/data.js');
  for (const url of [
    '/index.html',
    '/tavern.html',
    '/artbook.html',
    '/src/app.js',
    '/styles/app.css',
    portraitUrl(HEROES[0]).replace('./', '/'),
  ]) {
    assert.equal((await fetch(baseURL + url)).status, 200, url);
  }
  const audioTypes = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav' };
  for (const track of Object.values(MUSIC)) {
    const response = await fetch(new URL(track.file, baseURL));
    assert.equal(response.status, 200, track.file);
    assert.equal(response.headers.get('content-type'), audioTypes[path.extname(track.file)]);
    const file = await stat(path.resolve(root, track.file));
    assert.equal((await response.arrayBuffer()).byteLength, file.size);
  }
  for (const url of [`/.runtime/control-${port}.json`, `/.RUNTIME/control-${port}.json`])
    assert.equal((await fetch(baseURL + url)).status, 403);
  assert.equal((await fetch(baseURL + '/__demo/stop', { method: 'POST' })).status, 403);
  assert.equal((await fetch(baseURL + '/__demo/stop')).status, 405);
  return { assetsServed: true, privateControlBlocked: true, unauthorizedStopBlocked: true };
}

export async function launchers() {
  if (process.platform !== 'win32') return { skipped: 'Windows CMD launchers' };
  const port = await freePort();
  const cmd = process.env.ComSpec || path.join(process.env.SystemRoot, 'System32/cmd.exe');
  const invoke = (folder, file) =>
    command(cmd, ['/d', '/s', '/c', `""${path.join(folder, file)}" -NoBrowser -Port ${port}"`], {
      windowsVerbatimArguments: true,
      timeout: 25000,
    });
  try {
    await invoke(path.dirname(root), '一键启动.cmd');
    const first = await waitForServer(`http://127.0.0.1:${port}`);
    await invoke(root, '一键启动.cmd');
    const second = await waitForServer(`http://127.0.0.1:${port}`);
    assert.equal(first.pid, second.pid);
    await invoke(root, '一键关闭.cmd');
    await invoke(path.dirname(root), '一键关闭.cmd');
    return { cmdEntryPoints: 4, reusedProcess: true, repeatedStopSafe: true };
  } finally {
    await stopServer(port);
  }
}
