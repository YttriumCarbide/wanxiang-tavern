import { HEROES } from './data.js';

/** Called only for direct attack damage; poison, bleed and generated procs never enter here. */
export function recordCooperationHit(state, actor, enemy, damage) {
  if (damage <= 0 || state.units[actor]?.side !== 'hero' || state.units[enemy]?.side !== 'enemy')
    return;
  const history = ((state.cooperationHits ||= {})[enemy] ||= []);
  history.push(actor);
  if (history.length > 2) history.shift();
  if (state.units[enemy].hp > 0 || history.length !== 2 || history[0] === actor) return;
  const positions = history.map((id) => state.formation.indexOf(id));
  if (
    positions.some((position) => position < 0) ||
    Math.floor(positions[0] / 3) !== Math.floor(positions[1] / 3) ||
    Math.abs(positions[0] - positions[1]) !== 1
  )
    return;
  (state.cooperations ||= []).push({ enemy, actors: [...history] });
}

/** Award only accepted combat results, once per encounter, independently of tavern chat limits. */
export function claimCooperationAffection(library, expedition, result) {
  const protagonist = library.campaign?.protagonistId;
  if (!protagonist) return null;
  const claim = `${expedition.id}:cooperation:${result.final.encounter || 0}`;
  if (library.rewardClaims?.includes(claim)) return null;
  const ids = expedition.partyIds || library.party;
  const protagonistSlot = HEROES[ids.indexOf(protagonist)]?.id;
  const cooperation = result.final.cooperations?.find((item) =>
    item.actors.includes(protagonistSlot),
  );
  if (!cooperation) return null;
  const partnerSlot = cooperation.actors.find((id) => id !== protagonistSlot);
  const partner = library.characters.find(
    (member) => member.id === ids[HEROES.findIndex((hero) => hero.id === partnerSlot)],
  );
  if (!partner) return null;
  library.rewardClaims ||= [];
  library.rewardClaims.push(claim);
  library.relationships ||= {};
  const relation = (library.relationships[partner.id] ||= {
    affection: 0,
    gains: 0,
    agreed: false,
  });
  const delta = Math.min(1, 100 - relation.affection);
  relation.affection += delta;
  return { id: partner.id, name: partner.setting.name, delta };
}
