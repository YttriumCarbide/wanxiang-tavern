import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function waitForServer(baseURL) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${baseURL}/__demo/status`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        const status = await response.json();
        if (status.name === 'wanxiang-tavern-demo') return status;
      }
    } catch {
      /* The child may still be starting. */
    }
    await sleep(75);
  }
  throw Error(`Test server did not become ready: ${baseURL}`);
}

export async function stopServer(port) {
  try {
    const info = JSON.parse(
      await readFile(path.join(projectRoot, '.runtime', `control-${port}.json`), 'utf8'),
    );
    await fetch(`http://127.0.0.1:${port}/__demo/stop`, {
      method: 'POST',
      headers: { 'X-Demo-Control': info.token },
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    /* A test may already have stopped its server. */
  }
}

export async function withTestServer(operation) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.cjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      AI_CONFIG_FILE: path.join(projectRoot, `.runtime/tests/ai-config-${port}.json`),
      AI_PROMPTS_DIR: path.join(projectRoot, `.runtime/tests/prompts-${port}`),
      AI_WORLDINFO_DIR: path.join(projectRoot, `.runtime/tests/world-info-${port}`),
      OPENAI_API_KEY: '',
      OPENAI_MODEL: '',
    },
    windowsHide: true,
    stdio: 'ignore',
  });
  let spawnError;
  child.once('error', (error) => {
    spawnError = error;
  });
  try {
    const baseURL = `http://127.0.0.1:${port}`;
    await waitForServer(baseURL);
    if (spawnError) throw spawnError;
    return await operation(baseURL, port);
  } finally {
    await stopServer(port);
    child.kill();
  }
}

export async function command(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    let text = '';
    child.stdout.on('data', (chunk) => {
      text += chunk;
    });
    child.stderr.on('data', (chunk) => {
      text += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(Error(`Command timed out: ${executable}\n${text}`));
    }, options.timeout ?? 30000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(text);
      else reject(Error(`${executable} exited ${code}\n${text}`));
    });
  });
}
