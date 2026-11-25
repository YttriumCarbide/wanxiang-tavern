import { DEFINITIONS } from './data.js';
import { explorationPreview, explorationSpec, newExploration } from './exploration.js';
import { REGIONS } from './content/regions.js';
import { ENCOUNTER_COUNT } from './content/journey-rules.js';
import { ITEMS } from './content/items.js';
import { NEGATIVE_STATUSES } from './status-rules.js';
import { UNLOCKABLE_DUNGEONS } from './worlds.js';
import { restoreGrowth } from './growth.js';
import { claimBattleRewards } from './rewards.js';
import { nextBossStage } from './ares.js';

export const DEVELOPER_CHANNEL = 'wanxiang.developer-tools.v1';
export const DEVELOPER_COPY_KEY = 'wanxiang.developer-copy.v1';

export function localDeveloperHost(hostname) {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
}

export function developerMaps(library) {
  const stock = newExploration();
  return Object.keys({ ...stock, ...library.exploration }).flatMap((key) => {
    const route = library.exploration[key] || stock[key];
    const nodes = explorationPreview(route, route.frontier[0]?.map || route.cleared[0]?.map || key);
    const name = nodes[0]?.world?.name || REGIONS[key]?.name;
    return name && nodes.length ? [{ id: key, name, nodes }] : [];
  });
}

export function developerEncounter(library, input) {
  const { map, node, encounter, enemies } = input;
  if (enemies?.length) {
    const enemyIds = [...new Set(enemies)];
    if (
      !REGIONS[map] ||
      enemyIds.length !== enemies.length ||
      enemyIds.length > 3 ||
      enemyIds.some((id) => !Object.hasOwn(DEFINITIONS, id) || !DEFINITIONS[id].speed)
    )
      throw Error('请选择有效战场和一到三个不同的敌人。');
    return {
      name: '自定义测试战',
      map,
      enemyIds,
      boss: enemyIds.some((id) => DEFINITIONS[id].boss),
    };
  }
  const route = developerMaps(library).find((item) => item.id === map);
  const entry = route?.nodes.find((item) => item.id === node);
  if (!entry || !Number.isInteger(encounter) || encounter < 0 || encounter >= ENCOUNTER_COUNT)
    throw Error('请选择有效地图、节点和遭遇。');
  return explorationSpec(entry, encounter);
}

export function changeDeveloperBattle(state, operation, id) {
  const next = structuredClone(state);
  if (operation === 'lock-hp') {
    next.developerLockHp = !next.developerLockHp;
    return next;
  }
  if (operation === 'refill' || operation === 'cleanse') {
    for (const unit of Object.values(next.units).filter((item) => item.side === 'hero')) {
      if (operation === 'cleanse')
        for (const status of NEGATIVE_STATUSES) delete unit.buffs[status];
      else {
        unit.hp = unit.maxHp;
        unit.mp = unit.maxMp;
      }
    }
    return next;
  }
  const unit = next.units[id];
  if (!next.enemyIds.includes(id) || !unit?.hp) throw Error('请选择一名存活的敌人。');
  if (operation === 'one-hp') unit.hp = 1;
  else {
    const def = next.enemyDefinitions?.[id] || DEFINITIONS[id];
    const stage = unit.bossStage || (unit.enraged ? 2 : 1);
    const ratio = def.overlordPhases?.[stage - 1] ?? def.phaseThreshold ?? 0.5;
    const limit = Math.floor(unit.maxHp * ratio);
    unit.hp = Math.min(unit.hp, Math.max(1, limit));
    if (!nextBossStage(next, id, def)) unit.hp = Math.min(unit.hp, Math.max(1, limit - 1));
    if (!nextBossStage(next, id, def)) throw Error('该敌人没有可触发的下一阶段。');
  }
  return next;
}

export function tuneDeveloperLibrary(library, action, data = {}) {
  const next = structuredClone(library);
  switch (action) {
    case 'level':
      if (![1, 10, 15, 20].includes(data.level)) throw Error('请选择预设等级。');
      for (const member of next.characters.filter((item) => next.party.includes(item.id))) {
        const growth = restoreGrowth(member.growth, member.id);
        member.growth = restoreGrowth({ ...growth, level: data.level, xp: 0 }, member.id);
      }
      next.prepared = null;
      break;
    case 'supply':
      claimBattleRewards(next, crypto.randomUUID(), {
        gold: 10000,
        ether: 10000,
        equipmentVouchers: 50,
        summonContracts: 30,
        items: Object.fromEntries(Object.keys(ITEMS).map((id) => [id, 30])),
      });
      break;
    case 'unlock':
      next.unlockedDungeons = [...new Set([...next.unlockedDungeons, ...UNLOCKABLE_DUNGEONS])];
      next.progression = { ...next.progression, pandoraJoined: true };
      break;
    case 'tutorial':
      if (next.campaign)
        Object.assign(next.campaign, {
          completed: true,
          firstRecruit: true,
          tutorial: 'complete',
          adventureTutorial: true,
        });
      break;
    case 'reset-route': {
      const route = newExploration()[data.map];
      if (!route || !Object.hasOwn(next.exploration, data.map))
        throw Error('请选择可重置的官方地图。');
      next.exploration[data.map] = route;
      next.prepared = null;
      break;
    }
    default:
      throw Error('未知的存档操作。');
  }
  return next;
}

export function sanitizeDeveloperData(value) {
  return JSON.parse(
    JSON.stringify(value, (key, entry) => {
      if (
        /^(?:api[_-]?key|authorization|token|access[_-]?token|refresh[_-]?token|password|private[_-]?key|secret|credentials)$/i.test(
          key,
        )
      )
        return undefined;
      if (typeof entry === 'string')
        return entry.replace(/\b(?:Bearer\s+[\w.-]+|sk-[\w-]{8,})/gi, '[已隐藏]');
      return entry;
    }),
  );
}
