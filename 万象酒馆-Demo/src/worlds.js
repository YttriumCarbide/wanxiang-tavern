import { defaultProtagonist } from './content/qingyuan.js';
import { isPositiveEnemyEffect } from './enemy-targets.js';
import { REGIONS } from './content/regions.js';
import { MAP_IDS } from './content/biomes.js';
import { DEFINITIONS, HEROES, BUFFS } from './data.js';
import { EDITH } from './content/edith.js';
import { PANDORA } from './content/pandora.js';
import { ENEMY_ATTACKS } from './combat-art.js';

export const BASE_WORLDS = Object.freeze(['ruins', 'forest', 'frost', 'forge', 'tide']);
export const routeKey = (entry) => entry.world?.id || entry.map;
export const isEndless = (entry) => !!entry?.world || entry?.sequence >= 6;
export function worldRegion(library, id) {
  const world = library.worlds?.find((entry) => entry.id === id);
  return world
    ? {
        ...REGIONS[world.map],
        ...world,
        description: world.background,
        atmosphere: world.background,
        boss: world.enemyIds.find(
          (id) => world.enemyDefinitions[id]?.boss || DEFINITIONS[id]?.boss,
        ),
        enemies: world.enemyIds,
      }
    : REGIONS[id];
}
export function worldReference() {
  return {
    styles: MAP_IDS.map((id) => ({
      id,
      name: REGIONS[id].name,
      architecture: REGIONS[id].description,
      atmosphere: REGIONS[id].atmosphere,
    })),
    enemies: Object.values(DEFINITIONS)
      .filter((entry) => entry.speed)
      .map((entry) => structuredClone(entry)),
    appearances: [
      ...Object.values(DEFINITIONS),
      ...HEROES,
      EDITH,
      PANDORA,
      defaultProtagonist().combat,
    ].map(({ portrait, name }) => ({ portrait, name })),
  };
}
const number = (value, min, max, label) => {
  if (!Number.isInteger(value) || value < min || value > max) throw Error(label + '数值无效');
  return value;
};
const text = (value, min, max, label) => {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max)
    throw Error(label + '长度无效');
  return value.trim();
};
function effects(list, restoring = false) {
  if (!Array.isArray(list) || (!list.length && !restoring) || list.length > 5)
    throw Error('敌人效果数量无效');
  return list.flatMap((effect) => {
    if (!['damage', 'buff', 'heal', 'shield', 'mana'].includes(effect.type))
      throw Error('敌人效果类型无效');
    const positive = isPositiveEnemyEffect(effect);
    const target = effect.target || (positive ? 'self' : 'opponents');
    if (!['opponents', 'self', 'allAllies', 'lowestAlly'].includes(target))
      throw Error('敌人效果目标无效');
    if (positive && target === 'opponents')
      throw Error('敌人治疗及正面状态必须指向敌方自身或敌方伙伴');
    if (effect.type === 'buff' && effect.buff === 'slow' && target === 'opponents') {
      if (restoring) return [];
      throw Error('禁止给玩家队友施加迟缓；迟缓只影响敌人的行动速度');
    }
    const value = number(effect.value, 1, effect.type === 'buff' ? 3 : 40, '效果');
    if (effect.type === 'buff' && (!BUFFS[effect.buff] || effect.buff === 'balance'))
      throw Error('敌人状态无效');
    return [
      {
        type: effect.type,
        target,
        value,
        ...(effect.type === 'buff' ? { buff: effect.buff } : {}),
      },
    ];
  });
}
function moves(list, restoring = false) {
  if (!Array.isArray(list) || !list.length || list.length > 6) throw Error('敌人行动意图无效');
  return list.map((move) => {
    const slots = move.slots || [move.slot];
    if (
      !Array.isArray(slots) ||
      !slots.length ||
      slots.length > 3 ||
      new Set(slots).size !== slots.length ||
      slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot > 2)
    )
      throw Error('敌人攻击位置无效');
    return {
      name: text(move.name, 1, 40, '意图名称'),
      text: text(move.text, 1, 300, '意图说明'),
      slots,
      effects: effects(move.effects, restoring),
      ...(move.selfShield ? { selfShield: number(move.selfShield, 1, 30, '护盾') } : {}),
    };
  });
}
export function normalizeEnemy(enemy, { restoring = false } = {}) {
  if (!enemy || !/^enemy-[a-z0-9-]{1,70}$/.test(enemy.id) || DEFINITIONS[enemy.id])
    throw Error('新敌人ID无效');
  const appearances = new Set(worldReference().appearances.map((entry) => entry.portrait));
  if (!appearances.has(enemy.portrait) || !ENEMY_ATTACKS.includes(enemy.attackStyle))
    throw Error('敌人外貌或攻击表现无效');
  if (enemy.boss !== undefined && typeof enemy.boss !== 'boolean')
    throw Error('Boss标记必须是布尔值');
  return {
    id: enemy.id,
    name: text(enemy.name, 1, 40, '敌人名称'),
    portrait: enemy.portrait,
    color: /^#[0-9a-f]{6}$/i.test(enemy.color) ? enemy.color : '#b3a996',
    hp: number(enemy.hp, 10, enemy.boss ? 900 : 300, '生命'),
    mp: 0,
    speed: number(enemy.speed, 1, 6, '速度'),
    attackStyle: enemy.attackStyle,
    buffs: {},
    intents: moves(enemy.intents, restoring),
    ...(enemy.boss
      ? {
          boss: true,
          phaseThreshold: 0.5,
          enragedIntents: moves(enemy.enragedIntents || enemy.intents, restoring),
        }
      : {}),
  };
}
export function normalizeWorld(
  raw,
  existing = null,
  { restoring = false, knownEnemies = {} } = {},
) {
  if (!raw || typeof raw !== 'object') throw Error('地图数据无效');
  const id = existing?.id || text(raw.id, 1, 80, '地图ID');
  if (!/^(?:world-[a-z0-9-]+|ruins|forest|frost|forge|tide)$/.test(id)) throw Error('地图ID无效');
  if (!MAP_IDS.includes(raw.map)) throw Error('地图背景无效');
  if (existing && raw.map !== existing.map) throw Error('扩充不能更换已有地图背景');
  const appearances = new Set(worldReference().appearances.map((entry) => entry.portrait));
  const definitions = { ...existing?.enemyDefinitions };
  if (!Array.isArray(raw.enemies) || raw.enemies.length > (restoring ? 500 : 30))
    throw Error('新敌人列表无效');
  const added = [];
  for (const enemy of raw.enemies) {
    if (
      !/^enemy-[a-z0-9-]{1,70}$/.test(enemy.id) ||
      DEFINITIONS[enemy.id] ||
      knownEnemies[enemy.id] ||
      definitions[enemy.id]
    )
      throw Error('新敌人ID重复或无效');
    if (!appearances.has(enemy.portrait) || !ENEMY_ATTACKS.includes(enemy.attackStyle))
      throw Error('敌人外貌或攻击表现无效');
    const definition = normalizeEnemy(enemy, { restoring });
    definitions[enemy.id] = definition;
    added.push(enemy.id);
  }
  if (!existing && !restoring && !added.some((id) => definitions[id].boss))
    throw Error('新世界至少需要一位全新的Boss');
  for (const id of raw.enemyIds || [])
    if (knownEnemies[id] && !definitions[id]) definitions[id] = normalizeEnemy(knownEnemies[id]);
  const ids = [...new Set([...(existing?.enemyIds || []), ...(raw.enemyIds || []), ...added])];
  if (
    !ids.length ||
    ids.length > 500 ||
    ids.some((id) => !(definitions[id] || DEFINITIONS[id])?.speed)
  )
    throw Error('地图敌人池无效');
  const background = text(
    raw.background,
    restoring ? 1 : 100,
    restoring ? 2000000 : 20000,
    '世界背景',
  );
  if ((existing?.background.length || 0) + background.length + 2 > 2000000)
    throw Error('世界资料过长，请先精简后再扩充');
  if (!restoring && (!Array.isArray(raw.landmarks) || raw.landmarks.length < 3))
    throw Error('世界背景至少需要三个重要事件或地点');
  const landmarks = (raw.landmarks || []).map((entry) => text(entry, 1, 1000, '事件或地点'));
  return {
    id,
    map: raw.map,
    name: existing?.name || text(raw.name, 1, 40, '世界名称'),
    background: existing ? existing.background + '\n\n' + background : background,
    landmarks: [...(existing?.landmarks || []), ...landmarks],
    enemyIds: ids,
    enemyDefinitions: definitions,
  };
}
export function restoreWorlds(value) {
  const worlds = [];
  for (const saved of Array.isArray(value) ? value : []) {
    try {
      if (worlds.some((world) => world.id === saved.id)) continue;
      worlds.push(
        normalizeWorld({ ...saved, enemies: Object.values(saved.enemyDefinitions || {}) }, null, {
          restoring: true,
        }),
      );
    } catch {
      /* A damaged world cannot inject unsupported combat rules. */
    }
  }
  return worlds;
}
export function validateEncounters(list, entry) {
  if (!Array.isArray(list) || list.length !== 5) throw Error('无限探索需要五场敌人配置');
  const pool = entry.world?.enemyIds || [...REGIONS[entry.map].enemies, REGIONS[entry.map].boss];
  const definitions = { ...DEFINITIONS, ...entry.world?.enemyDefinitions };
  return list.map((room, index) => {
    const ids = room.enemyIds;
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 3 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !pool.includes(id))
    )
      throw Error('战斗敌人不属于当前世界的敌人池');
    if (index === 4 && !ids.some((id) => definitions[id].boss))
      throw Error('最终战必须包含当前世界的Boss');
    return { enemyIds: [...ids] };
  });
}
