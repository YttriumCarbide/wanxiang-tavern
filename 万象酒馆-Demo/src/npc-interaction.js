/** One fixed decision per script request, shared by preview and send; no extra model calls. */
export function requireNpcInteraction(input) {
  let hash = 2166136261;
  const key = input.visitId || input.rollId || `${input.brief}:${input.chapter || 1}`;
  for (const char of String(key)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100 < 20;
}
