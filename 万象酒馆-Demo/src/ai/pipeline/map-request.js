import { worldReference, normalizeWorld, normalizeEnemy } from '../../worlds.js';
import { TAVERN_WORLD } from '../../content/world.js';
export function mapInput(input) {
  const known = Object.values(input.knownEnemies || {}).map(normalizeEnemy);
  const reference = worldReference();
  reference.enemies.push(...known);
  if (typeof input.brief !== 'string' || !input.brief.trim() || input.brief.length > 10000)
    throw Error('请填写希望前往的世界');
  return { request: input.brief, existing: input.existing || null, canon: TAVERN_WORLD, reference };
}

export function mapResponse(content, input) {
  let raw;
  try {
    raw = JSON.parse(content.trim());
  } catch {
    throw Error('地图API需要返回完整JSON，未保存世界');
  }
  const knownEnemies = Object.fromEntries(
    Object.values(input.knownEnemies || {}).map((entry) => {
      const enemy = normalizeEnemy(entry);
      return [enemy.id, enemy];
    }),
  );
  return normalizeWorld(raw, input.existing || null, { knownEnemies });
}
