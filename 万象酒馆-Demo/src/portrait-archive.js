const reference =
  /^(?:\/api\/ai\/portraits\/|\.\/__portraits\/)[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)$/;

function references(value, found = new Set()) {
  if (typeof value === 'string' && reference.test(value)) found.add(value);
  else if (value && typeof value === 'object')
    for (const child of Object.values(value)) references(child, found);
  return found;
}

/** Portable exports include each original once, while ordinary autosaves keep tiny references. */
export async function packagePortraitAssets(snapshot, request = fetch) {
  const copy = structuredClone(snapshot);
  const assets = {};
  for (const url of references(copy.data)) {
    const response = await request(url);
    if (!response.ok) throw Error('导出立绘失败，请确认原图仍在本机');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    assets[url] = `data:${response.headers.get('content-type')};base64,${btoa(binary)}`;
  }
  if (Object.keys(assets).length) copy.data.portraitAssets = assets;
  return copy;
}

export async function restorePortraitAssets(snapshot, request = fetch, savePortrait) {
  const copy = structuredClone(snapshot);
  for (const url of references(copy.data.library)) {
    const dataUrl = copy.data.portraitAssets?.[url];
    if (!dataUrl) continue;
    let nextUrl;
    if (savePortrait) nextUrl = (await savePortrait(dataUrl)).url;
    else {
      const response = await request('/api/ai/portrait/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const result = await response.json();
      if (!response.ok || result.url !== url) throw Error('存档立绘恢复失败，请检查图片附件');
      nextUrl = result.url;
    }
    if (nextUrl !== url) {
      const replace = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const key of Object.keys(value)) {
          if (value[key] === url) value[key] = nextUrl;
          else replace(value[key]);
        }
      };
      replace(copy.data);
    }
  }
  delete copy.data.portraitAssets;
  return copy;
}
