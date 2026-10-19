import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function publicImageAddress(address) {
  let value = address.toLowerCase();
  if (isIP(value) === 6) value = new URL(`http://[${value}]`).hostname.slice(1, -1);
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19].includes(b))
    );
  }
  return isIP(value) === 6 && !/^(::|fc|fd|fe[89ab]|ff)/.test(value);
}

export function portraitImageURL(value) {
  if (typeof value !== 'string' || value.length > 4096) throw Error('图片链接无效');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw Error('请输入完整图片链接');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    /(^|\.)localhost$|\.local$|\.internal$/i.test(host) ||
    (isIP(host) && !publicImageAddress(host))
  )
    throw Error('仅支持不含账号密码的公网http/https图片直链');
  return url;
}

function readImage(url, addresses) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(
      url,
      {
        agent: false,
        headers: {
          Accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif',
          'User-Agent': 'Wanxiang-Portrait-Importer/1.0',
        },
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, addresses)
            : callback(null, addresses[0].address, addresses[0].family),
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume();
          resolve({ status: response.statusCode, location: response.headers.location });
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(Error('图床无法读取图片，请检查直链或防盗链设置'));
          return;
        }
        if (Number(response.headers['content-length']) > MAX_IMAGE_BYTES) {
          response.destroy();
          reject(Error('图片不能超过6MB'));
          return;
        }
        const chunks = [];
        let length = 0;
        response.on('data', (chunk) => {
          length += chunk.length;
          if (length > MAX_IMAGE_BYTES) {
            response.destroy();
            reject(Error('图片不能超过6MB'));
          } else chunks.push(chunk);
        });
        response.on('end', () => resolve({ status: 200, bytes: Buffer.concat(chunks) }));
        response.on('error', reject);
      },
    );
    request.setTimeout(10000, () => request.destroy(Error('读取图床图片超时')));
    request.on('error', reject);
  });
}

export function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  if (/^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 32)))
    return 'image/avif';
  throw Error('链接没有返回支持的图片，请使用PNG、JPG、WebP、GIF或AVIF直链');
}

/** Revalidate every redirect and pin the public DNS result into the outgoing connection. */
export async function importRemotePortrait(value, { lookup = dnsLookup, read = readImage } = {}) {
  let url = portraitImageURL(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => !publicImageAddress(address)))
      throw Error('图床链接不能指向本机或内网地址');
    let response;
    try {
      response = await read(url, addresses);
    } catch (error) {
      throw Error(
        /6MB|超时|直链/.test(error.message) ? error.message : '图片下载失败，请检查图床链接',
        { cause: error },
      );
    }
    if (response.location) {
      url = portraitImageURL(new URL(response.location, url).href);
      continue;
    }
    if (
      response.status !== 200 ||
      !Buffer.isBuffer(response.bytes) ||
      response.bytes.length > MAX_IMAGE_BYTES
    )
      throw Error('图片读取失败或超过6MB');
    const type = imageType(response.bytes);
    return { dataUrl: `data:${type};base64,${response.bytes.toString('base64')}` };
  }
  throw Error('图片链接重定向过多，请填写最终图片直链');
}
