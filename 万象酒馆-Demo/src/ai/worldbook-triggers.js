import { isEndless } from '../worlds.js';
import { arcFor } from '../story-arc.js';
import { officialDungeonFor } from '../content/official-dungeons.js';
import { requireNpcInteraction } from '../npc-interaction.js';
import { storyRingReward } from '../emblem-progression.js';
import { overlandPlan } from '../overland-travel.js';
import { ENCOUNTER_COUNT } from '../content/journey-rules.js';
import { currentEncounterSpec } from '../expedition.js';
import { DEFINITIONS, encounterSpec } from '../data.js';
import { REGIONS } from '../content/regions.js';

function addId(ids, value) {
  const normalized = String(value || '').trim();
  if (normalized) ids.add(normalized);
}

function collectCharacterIds(ids, kind, input) {
  for (const item of input.party || []) addId(ids, typeof item === 'string' ? item : item?.id);
  const chatting = ['chat', 'quick-chat'].includes(kind);
  const selected = Array.isArray(input.selected) ? new Set(input.selected) : null;
  const mentions = chatting ? `${input.text || ''}\n${input.activities || ''}` : '';
  for (const item of input.characters || []) {
    if (typeof item === 'string') {
      addId(ids, item);
      continue;
    }
    if (
      chatting &&
      selected &&
      !selected.has(item?.id) &&
      !(item?.name && mentions.includes(item.name))
    )
      continue;
    addId(ids, item?.id);
  }
  for (const item of input.selected || []) addId(ids, typeof item === 'string' ? item : item?.id);
  addId(ids, input.protagonistId);
  addId(ids, input.npc?.id);
  addId(ids, input.knownNpc?.id);
  addId(ids, input.invitation?.protagonistId);
  addId(ids, input.invitationTopics?.person?.id);
}

function collectMemoryIds(ids, input) {
  for (const id of input.journeyContinuationIds || []) addId(ids, id);
  addId(ids, input.continuationId);
}

function collectDungeonEnemyIds(ids, input) {
  if (isEndless(input.exploration)) {
    const region = REGIONS[input.exploration?.map];
    const pool =
      input.enemyPool ||
      input.exploration?.world?.enemyIds ||
      (region ? [...region.enemies, region.boss] : []);
    for (const enemy of pool) addId(ids, typeof enemy === 'string' ? enemy : enemy?.id);
    return;
  }
  for (let index = 0; index < ENCOUNTER_COUNT; index++) {
    const spec = input.exploration
      ? currentEncounterSpec(
          {
            exploration: input.exploration,
            adventure: input.adventureVersion === 1 ? {} : null,
          },
          index,
        )
      : DEFINITIONS[input.boss]?.boss
        ? encounterSpec(index, input.boss)
        : null;
    for (const enemyId of spec?.enemyIds || []) addId(ids, enemyId);
  }
}

/** Build the deduplicated list of worldbook trigger IDs active for a single AI request. */
export function buildTriggerIds(kind, input = {}) {
  const ids = new Set();
  if (Array.isArray(input.triggerIds)) {
    for (const id of input.triggerIds) addId(ids, id);
  }

  if (kind !== 'summary') {
    collectCharacterIds(ids, kind, input);
    collectMemoryIds(ids, input);
  }

  if (kind === 'script') {
    if (input.socialQuest) {
      ids.add('script:gal');
      ids.add('script:social-quest');
      return [...ids];
    }
    if (input.invitationTopics) {
      ids.add('script:invitation-topics');
      return [...ids];
    }
    if (input.invitation) {
      ids.add('script:gal');
      ids.add('script:invitation');
      const count = Number(input.invitation.stageCount);
      ids.add(
        [3, 4, 5].includes(count)
          ? `script:invitation-acts-${count}`
          : 'script:invitation-acts-flex',
      );
      return [...ids];
    }
    if (input.overland) {
      ids.add('script:gal');
      ids.add('script:overland');
      const plan = input.overland.stages
        ? input.overland
        : overlandPlan(input.overland.from, input.overland.to, input.overland.discovery);
      for (const stage of plan?.stages || []) {
        if (stage.type === 'battle') ids.add('script:act-battle');
        if (stage.type === 'event') ids.add('script:act-choice');
        for (const enemyId of stage.enemyIds || []) addId(ids, enemyId);
      }
      if (Array.isArray(input.lootStages) && input.lootStages.length) {
        ids.add('script:overland-loot');
      }
      return [...ids];
    }

    ids.add('script:gal');
    ids.add('script:dungeon');
    ids.add('script:act-battle');
    ids.add('script:act-choice');
    ids.add('script:act-quest');
    if (input.npcInteraction?.required || requireNpcInteraction(input)) {
      ids.add('script:npc-required');
    }
    const ring =
      input.storyRingReward !== undefined
        ? input.storyRingReward
        : storyRingReward(
            input.exploration,
            Array.isArray(input.ownedEmblems) ? input.ownedEmblems : [],
          );
    if (ring) ids.add('script:story-ring');
    if (input.storyArc || arcFor(input)) ids.add('script:story-arc');
    if (isEndless(input.exploration)) ids.add('script:endless');
    const official = input.officialDungeon?.id
      ? input.officialDungeon
      : officialDungeonFor(input.exploration);
    if (official?.id) {
      ids.add('script:official-dungeon');
      ids.add(`official-dungeon:${official.id}`);
      for (const npc of official.npcs || []) addId(ids, typeof npc === 'string' ? npc : npc?.id);
    }
    if (typeof input.playerIntent === 'string' && input.playerIntent.trim()) {
      ids.add('script:player-intent');
    }
    collectDungeonEnemyIds(ids, input);
    return [...ids];
  }

  if (kind === 'chat' || kind === 'quick-chat') {
    if (kind === 'chat') {
      ids.add('chat:tavern');
    } else if (input.invitation) {
      ids.add('chat:invitation-turn');
    } else if (input.adventure?.mode === 'quest') {
      ids.add('chat:node4-quest');
    } else if (input.adventure?.mode === 'event' || input.adventure?.choice) {
      ids.add('chat:node2-event');
    } else {
      ids.add('chat:quick');
    }
    if (input.dining) ids.add('chat:dining');
    if (Array.isArray(input.dialogueScenes) && input.dialogueScenes.length) {
      ids.add('chat:dialogue-patch');
    }
    for (const enemyId of input.enemyIds || []) addId(ids, enemyId);
    return [...ids];
  }

  if (kind === 'character') {
    if (input.purpose === 'npc' || input.npc || input.knownNpc) ids.add('character:npc');
    else if (input.purpose === 'protagonist' || input.role === '玩家主角') {
      ids.add('character:protagonist');
    } else {
      ids.add('character:standard');
    }
    return [...ids];
  }

  if (kind === 'map') {
    if (input.discovery) {
      ids.add('map:overland-discovery');
      addId(ids, input.discovery.point?.id);
      for (const stop of input.discovery.route || []) addId(ids, stop.id);
    }
    if (input.continuation) ids.add('map:continuation');
    else if (input.existing) ids.add('map:expand');
    else ids.add('map:new');
    return [...ids];
  }

  if (kind === 'creation') {
    ids.add('creation:standard');
    return [...ids];
  }

  if (kind === 'summary') {
    if (input.items?.some((item) => item.gameTime)) {
      ids.add('summary:time');
      ids.add('时间');
    }
    for (const item of input.items || []) {
      if (item?.kind) ids.add(`summary:${item.kind}`);
    }
    return [...ids];
  }

  return [...ids];
}
