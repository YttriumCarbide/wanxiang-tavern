import { worldReference, normalizeWorld, normalizeEnemy } from '../../worlds.js';
import { TAVERN_WORLD } from '../../content/world.js';
import { DISCOVERY_DIRECTIONS } from '../../atlas-discoveries.js';
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
    ...(input.discovery
      ? {
          discovery: input.discovery,
          discoveryRules: {
            linkId: '从给定路线中选择一个连接点，优先使用抽中的点',
            direction: Object.keys(DISCOVERY_DIRECTIONS),
            world:
              '仍按地图API格式返回。顶层另加 linkId、direction。地点应吻合触发的地区地理、气候和文化，写一个有明确吸引力的奇观或事件。选择贴合环境的现有战斗背景。敌人数值填写1级基础值，地点等级由代码决定。',
          },
        }
      : {}),
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
  if (input.discovery) {
    if (
      !input.discovery.route.some(({ id }) => id === raw.linkId) ||
      !Object.hasOwn(DISCOVERY_DIRECTIONS, raw.direction)
    )
      throw Error('地图需要返回给定的连接点与八方位之一');
    world.discovery = { linkId: raw.linkId, direction: raw.direction };
  }
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
