/** Web Crypto is shared by HTTPS browsers and supported Node versions. */
export function randomBase64(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes));
}
