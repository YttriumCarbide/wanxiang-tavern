import { ITEMS } from './content/items.js';
import { ENCOUNTER_COUNT } from './content/journey-rules.js';
import { MAP_IDS } from './content/biomes.js';
import { abilityFor, definition } from './catalog.js';
import { HEROES, ENEMIES, BOSSES, BUFFS, ENCOUNTERS, DEFINITIONS, encounterSpec } from './data.js';
import { WEAPONS, ENEMY_ATTACKS } from './combat-art.js';

const targets = new Set(['enemy', 'ally', 'self', 'allAllies', 'allEnemies']);
const locations = new Set(['前场', '后场', '全战斗', '战斗外']);
const effectTypes = new Set([
  'damage',
  'heal',
  'shield',
  'buff',
  'cleanse',
  'selfHeal',
  'selfMana',
  'mana',
]);
const integer = (value, minimum = 0) => Number.isInteger(value) && value >= minimum;
const slot = (value) => integer(value) && value < 3;

/** Validate configuration before constructing an application; report all errors together. */
export function validateGameData(
  config = {
    heroes: HEROES,
    enemies: ENEMIES,
    bosses: BOSSES,
    buffs: BUFFS,
    encounters: ENCOUNTERS,
  },
) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  if (!config || typeof config !== 'object') return ['Configuration must be an object'];
  for (const key of ['heroes', 'enemies', 'bosses', 'encounters'])
    check(Array.isArray(config[key]), `${key} must be an array`);
  check(
    config.buffs && typeof config.buffs === 'object' && !Array.isArray(config.buffs),
    'Buff definitions must be an object',
  );
  if (errors.length) return errors;
  const actors = [...config.heroes, ...config.enemies, ...config.bosses];
  if (actors.some((actor) => !actor || typeof actor !== 'object'))
    return ['Actor definitions must be objects'];
  const ids = actors.map((actor) => actor.id);
  check(config.heroes.length === 6, 'The party requires six companions');
  check(new Set(ids).size === ids.length, 'Actor IDs must be unique');
  const buff = (key, location) =>
    check(Object.hasOwn(config.buffs, key), `${location}: unknown buff ${key}`);
  function effects(list, location) {
    check(Array.isArray(list) && list.length > 0, `${location}: effects are required`);
    if (!Array.isArray(list)) return;
    for (const effect of list) {
      if (!effect || typeof effect !== 'object') {
        check(false, `${location}: effect must be an object`);
        continue;
      }
      check(effectTypes.has(effect.type), `${location}: unknown effect ${effect.type}`);
      if (effect.type === 'cleanse') {
        check(Array.isArray(effect.buffs), `${location}: cleanse needs buff IDs`);
        for (const key of Array.isArray(effect.buffs) ? effect.buffs : []) buff(key, location);
      } else {
        check(integer(effect.value), `${location}: effect value must be a nonnegative integer`);
        if (effect.type === 'buff') buff(effect.buff, location);
      }
    }
  }
  for (const actor of actors) {
    check(typeof actor.id === 'string' && actor.id.length > 0, 'Actor ID is required');
    check(integer(actor.hp, 1) && integer(actor.mp ?? 0), `${actor.id}: invalid HP/MP`);
    check(
      typeof actor.portrait === 'string' &&
        /^[a-z][a-z0-9-]*(?:\.(?:svg|png|jpe?g|webp|avif))?$/i.test(actor.portrait),
      `${actor.id}: invalid portrait ID`,
    );
  }
  for (const hero of config.heroes) {
    check(WEAPONS.includes(hero.weapon), `${hero.id}: invalid weapon type`);
    check(
      integer(hero.limit, 1) && integer(hero.attack),
      `${hero.id}: invalid action limit/attack`,
    );
    check(
      Array.isArray(hero.skills) && hero.skills.length === 2,
      `${hero.id}: two skill slots are required`,
    );
    const skills = Array.isArray(hero.skills) ? hero.skills : [];
    check(
      new Set(skills.map((skill) => skill?.id)).size === skills.length,
      `${hero.id}: duplicate skill IDs`,
    );
    for (const skill of skills) {
      check(
        typeof skill.id === 'string' && skill.id.length > 0 && skill.id !== 'attack',
        `${hero.id}: invalid skill ID`,
      );
      if (skill.passive) {
        check(locations.has(skill.location), `${hero.id}/${skill.id}: invalid passive location`);
        if (skill.buff) buff(skill.buff, hero.id);
        if (skill.teamFrontBuff) buff(skill.teamFrontBuff, hero.id);
      } else {
        check(
          integer(skill.ap, 1) &&
            skill.ap <= 3 &&
            integer(skill.mp) &&
            (skill.hp === undefined || integer(skill.hp, 1)),
          `${hero.id}/${skill.id}: invalid cost`,
        );
        check(targets.has(skill.target), `${hero.id}/${skill.id}: invalid target mode`);
        effects(skill.effects, `${hero.id}/${skill.id}`);
      }
    }
  }
  for (const enemy of [...config.enemies, ...config.bosses]) {
    check(ENEMY_ATTACKS.includes(enemy.attackStyle), `${enemy.id}: invalid attack presentation`);
    check(integer(enemy.speed, 1), `${enemy.id}: invalid speed`);
    const moves = [
      ...(enemy.openingIntent ? [enemy.openingIntent] : []),
      ...(Array.isArray(enemy.intents) ? enemy.intents : []),
      ...(Array.isArray(enemy.enragedIntents) ? enemy.enragedIntents : []),
    ];
    check(moves.length > 0, `${enemy.id}: no intents`);
    if (enemy.boss)
      check(
        enemy.phaseThreshold > 0 && enemy.phaseThreshold < 1 && enemy.enragedIntents?.length,
        `${enemy.id}: invalid second phase`,
      );
    for (const move of moves) {
      if (!move || typeof move !== 'object') {
        check(false, `${enemy.id}: invalid intent`);
        continue;
      }
      check(
        (Array.isArray(move.slots) ? move.slots : [move.slot]).every(slot),
        `${enemy.id}/${move.name}: invalid position`,
      );
      effects(move.effects, `${enemy.id}/${move.name}`);
      for (const key of Object.keys(move.selfBuff || {})) buff(key, enemy.id);
    }
  }
  check(
    config.encounters.length === ENCOUNTER_COUNT,
    'The expedition requires four rooms and a boss',
  );
  const enemyIds = new Set([...config.enemies, ...config.bosses].map((enemy) => enemy.id));
  for (const encounter of config.encounters) {
    if (!encounter || typeof encounter !== 'object') {
      check(false, 'Invalid encounter definition');
      continue;
    }
    check(MAP_IDS.includes(encounter.map), `${encounter.name}: unsupported map`);
    if (!encounter.boss)
      check(
        Array.isArray(encounter.enemyIds) &&
          encounter.enemyIds.length >= 1 &&
          encounter.enemyIds.length <= 3 &&
          new Set(encounter.enemyIds).size === encounter.enemyIds.length,
        `${encounter.name}: requires one to three unique enemies`,
      );
    for (const id of Array.isArray(encounter.enemyIds) ? encounter.enemyIds : [])
      check(enemyIds.has(id), `${encounter.name}: unknown enemy ${id}`);
  }
  return errors;
}

export function assertGameData() {
  const errors = validateGameData();
  if (errors.length) throw Error(`Invalid game configuration:\n${errors.join('\n')}`);
  for (const boss of BOSSES) {
    for (let index = 0; index < ENCOUNTERS.length; index++) {
      const spec = encounterSpec(index, boss.id);
      if (
        spec.enemyIds.length < 1 ||
        spec.enemyIds.length > 3 ||
        new Set(spec.enemyIds).size !== spec.enemyIds.length ||
        spec.enemyIds.some((id) => !DEFINITIONS[id])
      )
        throw Error(`Invalid encounter ${index + 1}`);
    }
  }
}

/** Structural checks run once; temporal checks (mana, formation, dying) remain in simulation. */
export function validateAction(state, action, seen = new Set()) {
  if (!action || !['skill', 'swap', 'reposition', 'item', 'engage'].includes(action.kind))
    return '行动类型无效';
  if (typeof action.id !== 'string' || !action.id || seen.has(action.id)) return '行动ID缺失或重复';
  if (!integer(action.start)) return '时间位置无效';
  if (action.kind === 'engage') {
    if (state.units[action.actor]?.side !== 'hero' || !definition(state, action.actor)?.emblemId)
      return '结合角色没有装备纹章士';
    if (!action.followUp) return action.ap === 1 ? null : '结合标记占据一个时间格';
    return validateAction(
      state,
      { ...action, ...action.followUp, kind: 'skill', actor: action.actor },
      seen,
    );
  }
  if (action.kind === 'item') {
    const item = ITEMS[action.item];
    if (!item || action.ap !== 1) return '道具与AP无效';
    const side = item.target === 'enemy' ? 'enemy' : 'hero';
    return state.units[action.target]?.side === side ? null : '道具目标方向无效';
  }
  if (action.kind === 'swap') {
    if (!slot(action.slot)) return '换入位置无效';
    if (state.units[action.incoming]?.side !== 'hero') return '换入角色无效';
  }
  if (
    action.kind === 'reposition' &&
    (![action.a, action.b].every((value) => Number.isInteger(value) && value >= 0 && value < 6) ||
      action.a === action.b)
  )
    return '交换位置无效';
  if (action.kind !== 'skill') return action.ap === 1 ? null : '交换必须消耗1 AP';
  if (!definition(state, action.actor) || state.units[action.actor]?.side !== 'hero')
    return '行动角色无效';
  const skill = abilityFor(state, action.actor, action.skill);
  if (!skill || skill.passive) return '主动技能无效';
  if (action.ap !== skill.ap) return '行动AP与技能定义不一致';
  if (skill.target === 'self' && action.target !== action.actor) return '技能必须指向自身';
  if (skill.target === 'enemy' && state.units[action.target]?.side !== 'enemy')
    return '技能必须指向敌方';
  if (skill.target === 'ally' && state.units[action.target]?.side !== 'hero')
    return '技能必须指向队友';
  return null;
}
