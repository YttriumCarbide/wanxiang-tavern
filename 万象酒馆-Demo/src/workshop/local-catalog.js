const endpoint = '/__demo/workshop-catalog';

export function localWorkshopAvailable() {
  return location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname);
}

async function readResponse(response) {
  if (!response.headers.get('Content-Type')?.includes('application/json'))
    throw Error('本地游戏服务未提供工坊配置，请用一键启动工坊修改器打开。');
  const result = await response.json();
  if (!response.ok) throw Error(result.error || '工坊配置请求失败。');
  return result;
}

export async function readLocalWorkshopCatalog({ allowMissing = false } = {}) {
  const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
  if (allowMissing && response.status === 404) return null;
  return readResponse(response);
}

export async function writeLocalWorkshopCatalog(catalog, revision) {
  return readResponse(
    await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"${revision}"` },
      body: JSON.stringify(catalog),
    }),
  );
}
