import { ENCOUNTERS, encounterSpec } from './data.js';
import { newEncounter, campRest } from './engine.js';
import { explorationSpec } from './exploration.js';
import { STORY_RING_CHARGE } from './content/journey-rules.js';
import { ADVENTURE_NODE_TYPES } from './adventure/definition.js';
import { adventureReady } from './adventure/state.js';

export function expeditionNodeType(expedition) {
  return expedition.adventure ? ADVENTURE_NODE_TYPES[expedition.index] : 'battle';
}
export function newExpedition(boss = 'bossGate', heroDefinitions = {}, exploration = null) {
  return {
    id: crypto.randomUUID(),
    boss,
    heroDefinitions: structuredClone(heroDefinitions),
    index: 0,
    records: [],
    carried: null,
    status: 'active',
    exploration: exploration ? structuredClone(exploration) : null,
  };
}
export function currentEncounterSpec(expedition, index = expedition.index) {
  const spec = expedition.exploration
    ? explorationSpec(expedition.exploration, index)
    : encounterSpec(index, expedition.boss);
  if (expedition.adventure && expedition.exploration?.tutorial && index === 2)
    return {
      ...spec,
      enemyIds: ['pebble', 'warden'],
      initialEnemyBuffs: { pebble: { vulnerable: 1 } },
    };
  return spec;
}
export function beginEncounter(expedition) {
  if (expedition.status !== 'active') throw Error('Expedition already finished');
  if (expedition.restPending) throw Error('请先选择睡眠或用餐');
  if (['event', 'quest'].includes(expeditionNodeType(expedition)))
    throw Error('当前是RP节点，不创建战斗');
  return newEncounter(
    {
      ...currentEncounterSpec(expedition),
      ...(expedition.corridorRing?.actor && expedition.corridorRing.encounter === expedition.index
        ? { initialEmblemCharge: { [expedition.corridorRing.actor]: STORY_RING_CHARGE } }
        : {}),
      ...(expedition.emblemArrival?.recipient?.actor && expedition.index === 4
        ? { initialEmblemCharge: { [expedition.emblemArrival.recipient.actor]: STORY_RING_CHARGE } }
        : {}),
    },
    expedition.carried,
    expedition.index,
    expedition.heroDefinitions,
  );
}

export function completeAdventureNode(expedition, book) {
  const index = expedition.index;
  if (!expedition.adventure || ![1, 3].includes(index)) throw Error('当前不是RP节点');
  if (index === 1 && !expedition.adventure.event.resolved) throw Error('请先完成事件选择');
  if (index === 3 && !adventureReady(book.adventure, expedition.adventure))
    throw Error('主要目标尚未完成');
  if (expedition.records.some((record) => record.index === index)) throw Error('此节点已完成');
  expedition.records.push({
    index,
    name: index === 1 ? book.adventure.event.title : book.adventure.quest.title,
    map: expedition.exploration?.map || 'ruins',
    type: index === 1 ? 'event' : 'quest',
    rounds: 0,
    rewards: {},
    rewardId: `${expedition.id}:node-${index}`,
    party: {},
  });
  expedition.index++;
}
export function completeEncounter(expedition, state) {
  if (state.phase !== 'victory') throw Error('Encounter has not been won');
  if (expedition.records.some((r) => r.index === state.encounter))
    throw Error('Encounter already recorded');
  const spec = currentEncounterSpec(expedition, state.encounter);
  expedition.id ||= crypto.randomUUID();
  const rewardId = `${expedition.id}:${state.encounter}`;
  const rewards = {
    summonContracts: state.encounter === ENCOUNTERS.length - 1 ? 1 : 0,
    gold: spec.boss ? 100 : 20,
    ...(expedition.exploration?.replay && state.encounter === ENCOUNTERS.length - 1
      ? { ether: expedition.recollectionEther || 0 }
      : {}),
    ...(spec.itemRewards ? { items: structuredClone(spec.itemRewards) } : {}),
  };
  expedition.records.push({
    index: state.encounter,
    name: spec.name,
    map: spec.map,
    rounds: Math.max(1, state.round),
    rewards,
    rewardId,
    party: Object.fromEntries(
      state.formation
        .filter(Boolean)
        .map((id) => [id, { hp: state.units[id].hp, mp: state.units[id].mp }]),
    ),
  });
  if (state.encounter === ENCOUNTERS.length - 1) {
    expedition.status = 'complete';
    return { complete: true, changes: [], rewards, rewardId };
  }
  const rest = campRest(state);
  expedition.carried = rest.state;
  expedition.index++;
  if (state.encounter === 2) expedition.restPending = true;
  return {
    complete: false,
    rewards,
    rewardId,
    changes: rest.changes,
    next: currentEncounterSpec(expedition),
  };
}

/** A single choice after battle three; the returned engine changes drive every recovery animation. */
export function chooseRest(expedition, choice) {
  if (!expedition.restPending || !expedition.carried || expedition.index !== 3)
    throw Error('当前不能休整');
  const result = campRest(expedition.carried, choice);
  expedition.carried = result.state;
  expedition.restPending = false;
  expedition.restChoice = choice;
  return result.changes;
}
