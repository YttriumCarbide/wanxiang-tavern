const http = require('http'),
  fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const root = __dirname,
  port = Number(process.env.PORT || 4180),
  types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.glb': 'model/gltf-binary',
    '.json': 'application/json',
  };
const controlToken = crypto.randomBytes(32).toString('hex');
const serviceMode = Boolean(process.env.AI_CONFIG_FILE);
const diskEnabled = process.env.TAVERN_DISK_STORAGE !== '0';
const defaultSaveDirectory = path.join(root, '存档');
const saveDirectory = path.resolve(process.env.TAVERN_SAVES_DIR || defaultSaveDirectory);
const privateDirectories = [path.join(root, '.runtime'), defaultSaveDirectory, saveDirectory].map(
  (directory) => directory.toLowerCase(),
);
const diskStorageApi = diskEnabled
  ? import('./server/disk-storage-api.mjs').then(({ createDiskStorageApi }) =>
      createDiskStorageApi({ directory: saveDirectory, port }),
    )
  : null;
const aiApi = serviceMode
  ? import('./server/ai-api.mjs').then(({ createAiApi }) => createAiApi({ root, port }))
  : null;
const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return res.writeHead(400).end();
  }
  if (url === '/__demo/status') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(
      JSON.stringify({
        name: 'wanxiang-tavern-demo',
        pid: process.pid,
        port,
        opencodeRelay: true,
        diskStorage: diskEnabled,
      }),
    );
  }
  if (url === '/__demo/opencode') {
    const { relayOpencode } = await import('./server/opencode-relay.mjs');
    return relayOpencode(req, res, { port });
  }
  if (url === '/__demo/storage') {
    if (!diskStorageApi) return res.writeHead(404).end();
    return (await diskStorageApi)(req, res);
  }
  if (url === '/__demo/stop') {
    if (req.method !== 'POST') return res.writeHead(405).end();
    if (req.headers['x-demo-control'] !== controlToken) return res.writeHead(403).end();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ stopping: true }));
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
    return;
  }
  if (url.startsWith('/api/ai/')) {
    if (!serviceMode) return res.writeHead(404).end('Static browser mode');
    try {
      await (
        await aiApi
      )(req, res, url);
    } catch {
      res.writeHead(500).end('API service unavailable');
    }
    return;
  }
  if (url.split('/').some((part) => part.startsWith('.')) || url.startsWith('/server/'))
    return res.writeHead(403).end();
  const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
  if (file !== root && !file.startsWith(root + path.sep)) return res.writeHead(403).end();
  const normalizedFile = file.toLowerCase();
  if (
    privateDirectories.some(
      (directory) =>
        normalizedFile === directory || normalizedFile.startsWith(directory + path.sep),
    )
  )
    return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end('Not found');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    if (serviceMode && path.basename(file) === 'index.html')
      data = Buffer.from(
        data
          .toString('utf8')
          .replace('<head>', '<head><meta name="wanxiang-test-backend" content="local">'),
      );
    if (diskEnabled && !serviceMode && file === path.join(root, 'index.html'))
      data = Buffer.from(
        data
          .toString('utf8')
          .replace('<head>', '<head><meta name="wanxiang-disk-storage" content="/__demo/storage">'),
      );
    res.end(data);
  });
});
server.listen(port, '127.0.0.1', () => {
  const runtimeDirectory = path.join(root, '.runtime');
  fs.mkdirSync(runtimeDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeDirectory, `control-${port}.json`),
    JSON.stringify({ name: 'wanxiang-tavern-demo', pid: process.pid, port, token: controlToken }),
  );
  console.log(`万象酒馆 Demo: http://127.0.0.1:${port}`);
});
