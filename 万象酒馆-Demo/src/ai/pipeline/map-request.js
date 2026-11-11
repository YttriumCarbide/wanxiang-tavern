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
    enemyIdRules: [
      '敌人禁止使用致盲blind；此状态只由玩家角色施加给敌人。',
      '【敌人ID硬性格式】新增enemies[].id必须完整匹配^enemy-[a-z0-9-]{1,70}$：以enemy-开头，后面1～70个字符只能使用小写英文字母、数字和短横线。禁止大写字母、下划线、中文、空格；世界前缀应放在enemy-之后。',
      '正确示例：enemy-ruins-salt-scavenger；错误示例：ruins_saltScavenger、enemy-ruins_saltScavenger。敌人的中文名只写在name中，不要用name作为ID。',
      '引用reference.enemies或existing中的已有敌人时，enemyIds必须逐字保留原ID，包括原有大小写；例如corridorGuard是合法的已有ID，不要改成enemy-corridor-guard。新建敌人和已有敌人的ID规则不能混用。',
      '输出前逐项自检：所有全新敌人ID均符合上述正则且互不重复；所有引用与定义的ID完全一致。重复已有ID时保留游戏原定义，不能依靠同ID覆盖。以上规则同时适用于新世界、地图扩充及继续探索。',
    ],
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
