import { worldReference, normalizeWorld, normalizeEnemy } from '../../worlds.js';
import { TAVERN_WORLD } from '../../content/world.js';
export function mapInput(input) {
  const known = Object.values(input.knownEnemies || {}).map(normalizeEnemy);
  const reference = worldReference();
  reference.enemies.push(...known);
  if (typeof input.brief !== 'string' || !input.brief.trim() || input.brief.length > 10000)
    throw Error('请填写希望前往的世界');
  return {
    request: input.brief,
    existing: input.existing || null,
    canon: TAVERN_WORLD,
    reference,
    ...(input.continuation ? { continuation: input.continuation } : {}),
  };
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
  const world = normalizeWorld(raw, input.existing || null, { knownEnemies });
  if (input.continuation) {
    if (
      !Array.isArray(raw.goals) ||
      raw.goals.length < 3 ||
      new Set(raw.goals.map((goal) => String(goal).trim())).size < 3 ||
      !raw.enemies?.some(
        (enemy) =>
          enemy.boss &&
          world.enemyDefinitions[enemy.id]?.boss &&
          !input.existing?.enemyIds?.includes(enemy.id) &&
          !knownEnemies[enemy.id],
      )
    )
      throw Error('继续探索构筑需要至少三个不同的新目标及一位全新Boss，尚未保存');
    world.continuationPrepared = true;
  }
  return world;
}
