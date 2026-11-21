import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 1;
const VERSION = '1.2.3';

const CHUNK_DEFINITIONS = [
  {
    id: 'startup',
    delivery: 'initial',
    priority: 0,
    files: [{ path: 'assets/start.txt', text: 'boot' }],
  },
  {
    id: 'ready-next',
    delivery: 'background',
    priority: 10,
    files: [
      { path: 'assets/next.txt', text: 'abcdefghij' },
      { path: 'assets/more.txt', text: 'next' },
    ],
  },
  {
    id: 'optional',
    delivery: 'on-demand',
    priority: 90,
    files: [{ path: 'assets/optional.txt', text: 'optional' }],
  },
];

const SOURCE_DEFINITIONS = [
  {
    id: 'github',
    kind: 'github-raw',
    priority: 10,
    baseUrl: 'https://raw.githubusercontent.com/example/game/v1/',
  },
  {
    id: 'gitee',
    kind: 'gitee',
    priority: 20,
    baseUrl: 'https://gitee.com/example/game/raw/v1/',
  },
];

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function utf8Bytes(text) {
  return Uint8Array.from(Buffer.from(text));
}

function buildFileRecord({ path, text }) {
  const bytes = utf8Bytes(text);
  return { path, bytes: bytes.length, sha256: sha256Hex(bytes) };
}

function buildChunkRecord({ id, delivery, priority, files }) {
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const hashInput = JSON.stringify(files.map(({ path, bytes, sha256 }) => [path, bytes, sha256]));
  return {
    id,
    delivery,
    priority,
    bytes: totalBytes,
    sha256: sha256Hex(utf8Bytes(hashInput)),
    files,
  };
}

export async function updateFixture() {
  const chunks = CHUNK_DEFINITIONS.map((definition) =>
    buildChunkRecord({
      ...definition,
      files: definition.files.map(buildFileRecord),
    }),
  );

  const index = {
    schemaVersion: SCHEMA_VERSION,
    version: VERSION,
    chunks,
    gates: {
      'after-tutorial-first-level': ['ready-next'],
    },
  };

  const indexBytes = utf8Bytes(JSON.stringify(index));

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    version: VERSION,
    chunks: {
      path: 'chunks.json',
      bytes: indexBytes.length,
      sha256: sha256Hex(indexBytes),
    },
    sources: SOURCE_DEFINITIONS.map((source) => ({ ...source })),
  };

  const payloads = new Map();
  for (const definition of CHUNK_DEFINITIONS) {
    for (const file of definition.files) {
      payloads.set(file.path, utf8Bytes(file.text));
    }
  }

  return { manifest, index, payloads };
}

export function memoryUpdateStore() {
  const storage = new Map();

  function storageKey(area, file) {
    return JSON.stringify([area, file.path, file.sha256]);
  }

  return {
    async read(area, file) {
      return storage.get(storageKey(area, file)) ?? null;
    },
    async write(area, file, blob) {
      storage.set(storageKey(area, file), blob);
    },
    async remove(area, file) {
      storage.delete(storageKey(area, file));
    },
  };
}
