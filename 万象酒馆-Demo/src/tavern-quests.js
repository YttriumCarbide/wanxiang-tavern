import { affectionRank } from './relationships.js';
import { EQUIPMENT_STATS } from './equipment.js';

export const QUEST_TYPES = Object.freeze({
  social: '社交',
  character: '角色',
  battle: '战斗',
  bounty: '公会悬赏',
  misc: '杂项',
});

export function createBountyQuest(spec) {
  return {
    id: `guild-${spec.id}`,
    sourceId: `guild:${spec.id}`,
    bountyId: spec.id,
    rank: spec.rank || 'E',
    type: 'bounty',
    title: spec.title,
    description: spec.description,
    hook: spec.description,
    level: spec.level || 1,
    origin: 'outskirts',
    targetKind: spec.targetKind || 'dungeon',
    targetMaps: [...(spec.targetMaps || [])],
    objectives: [
      {
        id: 'bounty-main',
        label: spec.objectiveLabel || spec.title,
        current: 0,
        target: spec.targetCount || 1,
      },
    ],
    rewards: {
      gold: spec.gold || 50,
      ether: spec.ether || 15,
      merit: spec.merit || 50,
    },
    status: 'active',
    claimed: false,
  };
}

function text(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function validInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function normalizeQuestLead(raw) {
  const title = text(raw?.title, 50);
  const description = text(raw?.description, 400);
  if (
    !title ||
    !description ||
    !Object.hasOwn(QUEST_TYPES, raw.type) ||
    !validInteger(raw.level, 1, 99)
  )
    return null;
  // Preserve legacy context. New leads need no extra text: the script also receives the title and description.
  const hook = text(raw?.hook, 600);
  return { title, description, hook, type: raw.type, level: raw.level };
}

export function normalizeSocialQuest(raw, scenes, archives = []) {
  const used = new Set(archives.map((entry) => entry.name.normalize('NFKC').trim()));
  if (!Array.isArray(raw?.acts) || raw.acts.length !== 5) throw Error('社交任务需要五幕');
  const acts = raw.acts.map((act) => {
    if (!Object.hasOwn(scenes, act.scene) || !text(act.title, 80) || !text(act.story, 5000))
      throw Error('社交任务缺少有效场景或正文');
    return { scene: act.scene, title: text(act.title, 80), story: text(act.story, 5000) };
  });
  const name = text(raw.reward?.name, 24);
  const description = text(raw.reward?.description, 80);
  if (
    !name ||
    used.has(name.normalize('NFKC')) ||
    !description ||
    !validInteger(raw.reward.value, 4, 120)
  )
    throw Error('每篇社交任务需要一件不同名的新装备');
  const stat = raw.reward.stat;
  if (!Object.hasOwn(EQUIPMENT_STATS, stat)) throw Error('社交任务装备需要一个有效属性方向');
  return { acts, reward: { name, description, value: raw.reward.value, stat } };
}

export function normalizeQuestCharacter(raw, scenes) {
  const scene = raw?.scene;
  const story = text(raw?.story, 1100);
  const gates = raw?.requirements;
  if (
    !Object.hasOwn(scenes, scene) ||
    story.length < 300 ||
    !validInteger(raw.level, 1, 99) ||
    !validInteger(gates?.tavern, 0, 10) ||
    !validInteger(gates.affection, 0, 30) ||
    !validInteger(gates.partyLevel, 1, 99) ||
    !['none', 'low', 'medium', 'high'].includes(gates.difficulty)
  )
    throw Error('角色任务需返回可达地点、约500字小剧场、合理等级和招募条件');
  const requirements = {
    tavern: gates.tavern,
    affection: gates.affection,
    partyLevel: Math.max(gates.partyLevel, raw.level > 20 ? raw.level - 10 : 1),
    difficulty: gates.difficulty,
    reason: text(gates.reason, 160),
  };
  return { scene, story, level: raw.level, requirements };
}

export function questRecruitmentReady(library, quest) {
  const { requirements } = quest.plan;
  const partyLevel = Math.max(
    1,
    ...library.characters
      .filter(({ id }) => library.party.includes(id))
      .map((entry) => entry.growth?.level || 1),
  );
  return (
    library.daily.rank >= requirements.tavern &&
    affectionRank(quest.affection || 0).level >= requirements.affection &&
    partyLevel >= requirements.partyLevel &&
    (requirements.difficulty === 'none' || quest.negotiated === true)
  );
}

export function restoreTavernQuests(value) {
  return (Array.isArray(value) ? value : [])
    .filter(
      (entry) =>
        typeof entry?.id === 'string' &&
        entry.id.length < 100 &&
        normalizeQuestLead(entry) &&
        ['offered', 'active', 'completed'].includes(entry.status),
    )
    .slice(-100)
    .map((entry) => {
      const copy = structuredClone(entry);
      // Older saves keep their original hook; the script handoff expects a string for new leads too.
      if (typeof copy.hook !== 'string') copy.hook = '';
      if (typeof entry.faction === 'string' && entry.faction.length < 40) {
        copy.faction = entry.faction;
      }
      if (copy.type === 'misc' || entry.isMisc === true) {
        copy.isMisc = true;
        copy.objectives = Array.isArray(entry.objectives)
          ? entry.objectives
              .filter(
                (obj) => obj && (typeof obj.label === 'string' || typeof obj.text === 'string'),
              )
              .map((obj, idx) => ({
                id: typeof obj.id === 'string' && obj.id ? obj.id : `misc-obj-${idx + 1}`,
                label: text(obj.label ?? obj.text, 120),
                ...(typeof obj.location === 'string' && obj.location.trim()
                  ? { location: text(obj.location, 60) }
                  : {}),
                done: Boolean(obj.done ?? obj.completed),
                tracked: Boolean(obj.tracked) && !(obj.done ?? obj.completed),
              }))
              .filter((obj) => obj.label)
          : [];
      } else if (copy.type === 'bounty') {
        copy.objectives = Array.isArray(copy.objectives)
          ? copy.objectives.map((obj, idx) => ({
              id: typeof obj?.id === 'string' ? obj.id : `obj-${idx + 1}`,
              label: text(obj?.label || copy.title, 120),
              current: Math.max(0, Number(obj?.current) || 0),
              target: Math.max(1, Number(obj?.target) || 1),
            }))
          : [];
        copy.claimed = copy.claimed === true;
      }
      return copy;
    });
}
