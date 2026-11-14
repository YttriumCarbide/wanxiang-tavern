import { affectionRank } from './relationships.js';
import { EQUIPMENT_STATS } from './equipment.js';

export const QUEST_TYPES = Object.freeze({ social: '社交', character: '角色', battle: '战斗' });

function text(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function validInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function normalizeQuestLead(raw) {
  const title = text(raw?.title, 50);
  const description = text(raw?.description, 400);
  const hook = text(raw?.hook, 600);
  if (
    !title ||
    !description ||
    !hook ||
    !Object.hasOwn(QUEST_TYPES, raw.type) ||
    !validInteger(raw.level, 1, 99)
  )
    return null;
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
    .map((entry) => structuredClone(entry));
}
