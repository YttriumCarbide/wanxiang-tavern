const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export function readServiceAccount(text) {
  let account;
  try {
    if (typeof text !== 'string' || text.length > 20000) throw Error();
    account = JSON.parse(text);
  } catch {
    throw Error('服务账号密钥必须是完整的 JSON 文件内容');
  }
  if (
    account?.type !== 'service_account' ||
    !/^[a-z][a-z0-9:.-]{3,100}$/.test(account.project_id || '') ||
    !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.gserviceaccount\.com$/.test(account.client_email || '') ||
    !/^-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+\s+-----END PRIVATE KEY-----\s*$/.test(
      account.private_key || '',
    )
  )
    throw Error('JSON 缺少有效的 project_id、client_email 或 PKCS8 private_key');
  return {
    project_id: account.project_id,
    client_email: account.client_email,
    private_key: account.private_key,
    ...(typeof account.private_key_id === 'string' &&
    /^[a-zA-Z0-9_-]{1,200}$/.test(account.private_key_id)
      ? { private_key_id: account.private_key_id }
      : {}),
    type: 'service_account',
  };
}

async function signingKey(account, subtle = crypto.subtle) {
  const pem = account.private_key.replace(/-----[^-]+-----|\s/g, '');
  try {
    return await subtle.importKey(
      'pkcs8',
      Uint8Array.from(atob(pem), (char) => char.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw Error('服务账号私钥无法读取，请重新导入 Google 下载的原始 JSON');
  }
}

export async function validateServiceAccount(text) {
  const account = readServiceAccount(text);
  await signingKey(account);
  return { project: account.project_id, email: account.client_email };
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/** The user's private key signs locally; only a short-lived assertion reaches Google's fixed token endpoint. */
export async function serviceAccountToken(
  text,
  { fetchImpl = fetch, signal, now = Date.now() } = {},
) {
  const account = readServiceAccount(text);
  const encode = (value) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const issued = Math.floor(now / 1000);
  const header = encode({
    alg: 'RS256',
    typ: 'JWT',
    ...(account.private_key_id ? { kid: account.private_key_id } : {}),
  });
  const claims = encode({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issued,
    exp: issued + 3600,
  });
  const unsigned = `${header}.${claims}`;
  signal?.throwIfAborted();
  const key = await signingKey(account);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  signal?.throwIfAborted();
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
    }).toString(),
    signal,
    redirect: 'error',
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw Error('Google 令牌服务没有返回有效 JSON');
  }
  if (
    !response.ok ||
    typeof value.access_token !== 'string' ||
    !/^[\x21-\x7e]{1,4000}$/.test(value.access_token)
  )
    throw Error(
      `服务账号认证失败（HTTP ${response.status}），请检查密钥是否有效、设备时间、Vertex AI 权限与项目结算状态`,
    );
  return value.access_token;
}

export function serviceAccountBase(project, location = 'global') {
  if (!/^[a-z][a-z0-9:.-]{3,100}$/.test(project) || !/^(?:global|[a-z]+-[a-z]+\d+)$/.test(location))
    throw Error('Vertex 项目或地区格式无效');
  return `https://${location === 'global' ? '' : location + '-'}aiplatform.googleapis.com/v1/projects/${project}/locations/${location}`;
}
