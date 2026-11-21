import { assetPath } from './manifest.js';

/**
 * Queue storage port: read(area, file) => Blob|null, write(area, file, blob), remove(area, file).
 * A write replaces a single entry atomically. Entries are keyed by path and expected digest.
 * Areas are `partial` and `verified`; only the queue writes into the verified area.
 */
export function createCacheUpdateStore({ base, cacheStorage = globalThis.caches }) {
  let cache;
  function open() {
    cache ||= cacheStorage.open('wanxiang-update-files-v1').catch((error) => {
      cache = undefined;
      throw error;
    });
    return cache;
  }
  function key(area, file) {
    return new URL(
      '__update-cache/v1/' + area + '/' + file.sha256 + '/' + assetPath(file.path),
      base,
    );
  }
  return {
    async read(area, file) {
      const response = await (await open()).match(key(area, file));
      return response ? response.blob() : null;
    },
    async write(area, file, blob) {
      await (await open()).put(key(area, file), new Response(blob));
    },
    async remove(area, file) {
      await (await open()).delete(key(area, file));
    },
  };
}
