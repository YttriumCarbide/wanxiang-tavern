import { ENCOUNTERS, encounterSpec } from './data.js';
import { newEncounter, campRest } from './engine.js';
import { explorationSpec } from './exploration.js';
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
  return expedition.exploration
    ? explorationSpec(expedition.exploration, index)
    : encounterSpec(index, expedition.boss);
}
export function beginEncounter(expedition) {
  if (expedition.status !== 'active') throw Error('Expedition already finished');
  if (expedition.restPending) throw Error('请先选择睡眠或用餐');
  return newEncounter(
    {
      ...currentEncounterSpec(expedition),
      ...(expedition.corridorRing?.encounter === expedition.index
        ? { initialEmblemCharge: { [expedition.corridorRing.actor]: 6 } }
        : {}),
    },
    expedition.carried,
    expedition.index,
    expedition.heroDefinitions,
  );
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
