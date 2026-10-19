/* global self */
// This worker stores no API credentials and never caches AI traffic or game releases.
const DATABASE = 'wanxiang-tavern-static-v1';

async function portrait(name) {
  if (!/^[a-f0-9]{64}\.(png|jpg|webp|gif|avif)$/.test(name))
    return new Response('', { status: 404 });
  const blob = await new Promise((resolve, reject) => {
    const request = self.indexedDB.open(DATABASE, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('records')) {
        database.close();
        resolve(null);
        return;
      }
      const transaction = database.transaction('records', 'readonly');
      const result = transaction.objectStore('records').get('portrait.' + name);
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
      transaction.oncomplete = () => database.close();
    };
  });
  return blob instanceof Blob
    ? new Response(blob, {
        headers: {
          'Content-Type': blob.type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    : new Response('本地立绘不存在，请重新导入', { status: 404 });
}

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const prefix = new URL('__portraits/', self.registration.scope).href;
  if (event.request.url.startsWith(prefix) && event.request.method === 'GET')
    event.respondWith(portrait(new URL(event.request.url).pathname.split('/').at(-1)));
});
