import { normalizePromptPreset } from '../src/ai/presets.js';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';

export function memoryDatabase(initial = []) {
  const store = new Map();
  for (const [key, value] of initial) {
    store.set(key, structuredClone(value));
  }
  const writes = [];
  let pendingFailure = null;

  return {
    get(key) {
      if (!store.has(key)) {
        return undefined;
      }
      return structuredClone(store.get(key));
    },
    entries() {
      return Array.from(store.entries()).map(([key, value]) => [key, structuredClone(value)]);
    },
    async write(entries, deleted = []) {
      if (pendingFailure) {
        const error = pendingFailure;
        pendingFailure = null;
        throw error;
      }
      const clonedEntries = entries.map(([key, value]) => [key, structuredClone(value)]);
      const clonedDeleted = deleted.map((key) => structuredClone(key));
      for (const [key, value] of clonedEntries) {
        store.set(key, structuredClone(value));
      }
      for (const key of clonedDeleted) {
        store.delete(key);
      }
      writes.push({
        entries: clonedEntries.map(([key, value]) => [key, structuredClone(value)]),
        deleted: clonedDeleted.map((key) => structuredClone(key)),
      });
    },
    async update(key, transform) {
      const current = store.has(key) ? structuredClone(store.get(key)) : undefined;
      const next = transform(current);
      if (next === undefined) {
        return false;
      }
      await this.write([[key, next]]);
      return true;
    },
    failNextWrite(error) {
      pendingFailure = error;
    },
    writes,
  };
}

export function profileFixture(overrides = {}) {
  return {
    provider: 'openai',
    baseUrl: 'https://parity.invalid/v1',
    model: 'parity-model',
    apiKey: 'parity-key',
    tokenField: 'max_tokens',
    maxTokens: 1024,
    contextSize: 2000000,
    promptProcessing: 'merge_tools',
    stream: false,
    sessionId: 'parity-session',
    requestMode: 'local',
    promptPresetId: 'character-default',
    ...overrides,
  };
}

export function presetFixture(extra = {}) {
  return normalizePromptPreset(
    {
      id: 'parity-preset',
      name: 'parity',
      prompts: [
        { identifier: 'main', role: 'system', content: 'fixture {{brief}}' },
        { identifier: 'chatHistory', marker: true },
      ],
      ...extra,
    },
    'parity-preset',
  ).preset;
}

export function worldFixture(entries = {}, settings = {}, state = {}) {
  return {
    books: [
      {
        id: 'parity-world',
        name: 'parity',
        entries: structuredClone(entries),
      },
    ],
    settings: {
      globalSelect: ['parity-world'],
      ...settings,
    },
    state: structuredClone(state),
  };
}

export function makePipelinePorts({
  profile = profileFixture(),
  world = worldFixture(),
  readText,
  commitResult = true,
} = {}) {
  const commits = [];
  const resolves = [];

  const settings = {
    get: () => ({ ...profile }),
    routeSettings: () => ({ enabled: false }),
  };

  const helperStorage = {
    get: () => ({}),
  };

  const worlds = {
    async resolve(kind, input, override) {
      resolves.push({
        kind: structuredClone(kind),
        input: structuredClone(input),
        override: structuredClone(override),
      });
      return structuredClone(world);
    },
    async commit(kind, nextState, expectedStep, signal) {
      signal?.throwIfAborted();
      commits.push({
        kind: structuredClone(kind),
        nextState: structuredClone(nextState),
        expectedStep: structuredClone(expectedStep),
      });
      return commitResult;
    },
  };

  return {
    settings,
    worlds,
    helperStorage,
    countTokens: (text) => text.length,
    readText,
    commits,
    resolves,
  };
}

export async function nodeRouteRequest(route, routePath, input = {}, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(input))]);
  req.method = 'POST';
  req.headers = {
    'content-type': 'application/json',
    ...headers,
  };
  req.complete = true;

  class FixtureResponse extends EventEmitter {
    constructor() {
      super();
      this.destroyed = false;
      this.headersSent = false;
      this.writableEnded = false;
      this.statusCode = null;
      this.payload = undefined;
      this.chunks = [];
    }

    writeHead(status, responseHeaders) {
      this.statusCode = status;
      this.headersSent = true;
      this.responseHeaders = responseHeaders;
      return this;
    }

    write(chunk) {
      this.chunks.push(chunk);
      return true;
    }

    end(chunk) {
      if (chunk !== undefined) {
        this.chunks.push(chunk);
      }
      this.writableEnded = true;
      this.emit('finish');
      return this;
    }
  }

  const res = new FixtureResponse();
  let failure = null;
  let handled = false;

  try {
    handled = await route(req, res, '/api/ai/' + routePath);
  } catch (error) {
    failure = error;
  }

  return {
    handled,
    status: res.statusCode,
    payload: res.payload,
    chunks: res.chunks,
    failure,
    response: res,
  };
}

export function sendNodeResponse(res, status, payload) {
  res.payload = payload;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function fileFixtureFetch(upstream, overrides = new Map()) {
  return async (url, options = {}) => {
    const target = new URL(url);
    if (target.protocol === 'file:') {
      const relative = decodeURIComponent(target.pathname).split('/prompts/')[1];
      if (relative && overrides.has(relative)) {
        return new Response(overrides.get(relative), { status: 200 });
      }
      return new Response(await readFile(target), { status: 200 });
    }
    return upstream(target, options);
  };
}

export function completionFixture(content, usage = { prompt_tokens: 3, completion_tokens: 5 }) {
  return new Response(
    JSON.stringify({
      model: 'parity-model',
      choices: [
        {
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

export function configSnapshot(profile = profileFixture()) {
  return {
    version: 5,
    antiRoute: { enabled: false },
    profiles: Object.fromEntries(
      ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation', 'map'].map((kind) => [
        kind,
        { ...profile, promptPresetId: kind + '-default' },
      ]),
    ),
  };
}
