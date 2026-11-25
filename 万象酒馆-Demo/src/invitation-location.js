import {
  CITIES,
  cityDungeons,
  cityFacilities,
  cityForScene,
  cityPlaceId,
} from './city-directory.js';
import { FINAL_ENCOUNTER } from './content/journey-rules.js';
import { DEFINITIONS } from './data.js';
import { REGIONS } from './content/regions.js';
import { rpBackground } from './content/rp-backgrounds.js';
import { normalizeSceneEnvironment, splitSceneEnvironment } from './scene-environment.js';

function finalEncounter(entry) {
  const enemyIds = entry?.recollection?.encounters?.[FINAL_ENCOUNTER]?.enemyIds;
  return Array.isArray(enemyIds) && enemyIds.length > 0 ? enemyIds : null;
}

function enemyDefinition(world, id) {
  return world?.enemyDefinitions?.[id] || DEFINITIONS[id];
}

function worldHasOverlord(world) {
  // Use this generated world's snapshot, never a shared biome enemy pool.
  return (
    Array.isArray(world?.enemyIds) &&
    world.enemyIds.some((id) => enemyDefinition(world, id)?.overlord === true)
  );
}

function finalEncounterHasOverlord(entry) {
  const enemyIds = finalEncounter(entry);
  return Boolean(enemyIds?.some((id) => enemyDefinition(entry.world, id)?.overlord === true));
}

function clearedForInvitation(library, id) {
  const cleared = library.exploration?.[id]?.cleared;
  if (!Array.isArray(cleared)) return false;
  const world = library.worlds?.find((entry) => entry.id === id);
  const region = world ? null : REGIONS[id];
  const overlord = region?.nodes?.find((node) => node.overlord);
  if (overlord) return cleared.some((entry) => entry.nodeId === overlord.id);
  const firstNode = region?.nodes?.find((node) => !node.parentId);
  if (firstNode) return cleared.some((entry) => entry.nodeId === firstNode.id);
  if (region) return cleared.some((entry) => entry.sequence === 0);
  if (!world) return false;

  const firstStageCleared = cleared.some((entry) => entry?.sequence === 0);
  if (!firstStageCleared || !Array.isArray(world.enemyIds) || world.enemyIds.length === 0)
    return false;

  // A documented world without an overlord only needs its first stage cleared.
  // A world with one requires a recorded final fight against the actual overlord.
  if (!worldHasOverlord(world)) return true;
  return cleared.some((entry) => entry?.world?.id === world.id && finalEncounterHasOverlord(entry));
}

export function availableInvitationCities(library, scene) {
  const currentCity = cityForScene(scene);
  if (currentCity) return [currentCity];
  const unlocked = new Set(['starbell']);
  const tavernCity = cityForScene(library.daily.memory.tavernExit);
  if (tavernCity) unlocked.add(tavernCity);
  if (library.daily.unlocks.silverCrownTavern) unlocked.add('silver-crown');
  for (const route of library.overlandExploration?.routes || []) {
    const city = cityForScene(route.split('->')[1]);
    if (city) unlocked.add(city);
  }
  return Object.keys(CITIES).filter((city) => unlocked.has(city));
}

export function invitationCityVenues(library, cityId) {
  if (!Object.hasOwn(CITIES, cityId)) return [];
  const city = CITIES[cityId];
  return [
    ...Object.entries(city.places).map(([id, place]) => ({
      id,
      name: place.name,
      environment: place.environment,
      streetScene: id,
      category: 'places',
    })),
    ...cityFacilities(cityId).map((place) => ({ ...place, category: 'facilities' })),
    ...cityDungeons(cityId, library.atlasDiscoveries)
      .filter(({ id }) => clearedForInvitation(library, id))
      .map((place) => {
        const world = library.worlds?.find((entry) => entry.id === place.id);
        const region = REGIONS[place.id];
        return {
          ...place,
          category: 'dungeons',
          image: rpBackground(world?.map || region?.biome, 1),
          environment: world?.background || region?.atmosphere,
        };
      }),
  ];
}

export function invitationVenue(library, city, scene) {
  return invitationCityVenues(library, city).find(({ id }) => id === scene) || null;
}

export function sameCityStreet(actual, expected) {
  return cityPlaceId(actual) === cityPlaceId(expected);
}

export function normalizeInvitationEnvironment(scene, title) {
  if (typeof scene.intro !== 'string') throw Error('约见缺少演出正文');
  if (scene.environment != null) {
    const lead = normalizeSceneEnvironment({
      placeId: scene.scene,
      title,
      text: scene.environment,
    });
    if (!lead) throw Error('约见环境描写格式不正确');
    return { ...scene, environment: lead.text };
  }
  const { content, environment } = splitSceneEnvironment(scene.intro, {
    placeId: scene.scene,
    title,
  });
  if (!environment) throw Error('本幕缺少环境描写');
  return { ...scene, environment: environment.text, intro: content };
}

/** Gate the normalized response again in the client, before saving a playable plan. */
export function validateCityInvitationPlan(plan, { startScene, allowedScenes }) {
  if (!Array.isArray(plan?.stages) || plan.stages.length < 3 || plan.stages.length > 5)
    throw Error('约见缺少完整剧本');
  if (plan.stages[0]?.scene !== startScene) throw Error('约见开场地点与选择不符');
  function validate(scene) {
    if (typeof scene?.scene !== 'string' || !Object.hasOwn(allowedScenes, scene.scene))
      throw Error('约见地点不在本次可用的城区名单中');
    if (typeof scene.intro !== 'string' || !scene.intro.trim()) throw Error('约见缺少演出正文');
    return normalizeInvitationEnvironment(scene, allowedScenes[scene.scene]);
  }
  return { ...plan, stages: plan.stages.map(validate), finale: validate(plan.finale) };
}
