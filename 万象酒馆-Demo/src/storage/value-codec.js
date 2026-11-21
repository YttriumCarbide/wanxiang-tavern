function validateJsonValue(value) {
  try {
    const serialized = JSON.stringify(value, (_, item) => {
      if (typeof item === 'number' && !Number.isFinite(item)) {
        throw Error('存档包含非有限数值');
      }
      return item;
    });
    if (serialized === undefined) throw Error('缺少存档值');
  } catch (cause) {
    throw Error('存档数据无法完整保存为 JSON', { cause });
  }
}

export async function encodeStorageValue(value) {
  if (!(value instanceof Blob)) {
    validateJsonValue(value);
    return value;
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return { blob: true, mime: value.type, base64: btoa(text) };
}

export function decodeStorageImage(value) {
  if (
    !value?.blob ||
    !/^image\/(png|jpeg|webp|gif|avif)$/.test(value.mime) ||
    typeof value.base64 !== 'string' ||
    value.base64.length > 8500000
  )
    throw Error('存档图片无效');
  return new Blob([Uint8Array.from(atob(value.base64), (character) => character.charCodeAt(0))], {
    type: value.mime,
  });
}
