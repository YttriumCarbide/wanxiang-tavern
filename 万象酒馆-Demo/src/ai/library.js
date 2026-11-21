import { restoreLibraryRecords } from './library-records.js';
import { createLibrary, officialCharacter } from './library-roster.js';
export { compileRoster, newLibrary, officialCharacter } from './library-roster.js';
export { purgeLegacyRuinsProgress } from './library-ruins-migration.js';
import { lockUnopenedRear } from '../formation-access.js';
import { restoreDining } from '../dining.js';
import { restoreDaily } from '../daily.js';
import { restoreTetris } from '../tetris.js';
import { upgradeLegacyStatuses } from '../status-rules.js';
import { restoreWorlds, UNLOCKABLE_DUNGEONS } from '../worlds.js';
import { restoreDiscoveries } from '../atlas-discoveries.js';
import { restoreTavernQuests } from '../tavern-quests.js';
import { restoreGuildState } from '../guild.js';
import { EMBLEMS } from '../emblems.js';
import { restoreGrowth } from '../growth.js';
import {
  restoreEquipment,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_SLOT_ORDER,
  resolveEquipmentTemplate,
} from '../equipment.js';
import { ENCOUNTER_COUNT } from '../content/journey-rules.js';
import { REGIONS } from '../content/regions.js';
import { OFFICIAL_VISITORS } from '../content/official-visitors.js';
import { stripRetiredLore } from './retired-abilities.js';
import { HEROES } from '../data.js';
import { normalizeCharacter, normalizeScript } from './contracts.js';
import { loadCustomPortraits, savedPortrait } from '../portraits.js';
import { restoreExploration } from '../exploration.js';
import {
  refreshWorldSkirmishes,
  restoreOverlandExploration,
  restoreSkirmishes,
} from '../skirmishes.js';
import { restoreInventory } from '../rewards.js';

import { hydrateArchiveMaps } from '../archives.js';
import { defaultProtagonist } from '../content/qingyuan.js';
import { normalizeDcAttrs } from '../dc.js';
import { restoreEquippedSkills, restoreLearnedSkills } from '../learnable-skills.js';
import { mergeRevealedWeaknessMap } from '../octopath.js';
import { normalizeSeenMonsters } from '../archive-enemies.js';

export function restoreLibrary(value) {
  const customPortraits = loadCustomPortraits();
  const library = createLibrary(customPortraits);
  if (!value || value.version !== 1) return library;
  library.migrations =
    value.migrations && typeof value.migrations === 'object' ? { ...value.migrations } : {};
  // The workshop controller restores this envelope against the active custom
  // catalog, so authored material IDs survive slots, backup imports and reloads.
  library.workshop = value.workshop?.version === 1 ? structuredClone(value.workshop) : null;
  library.dining = restoreDining(value.dining);
  library.daily = restoreDaily(value.daily);
  const campaign = [1, 2, 3].includes(value.campaign?.version);
  if (campaign) {
    library.characters = [];
    library.party = Array(6).fill(null);
  }
  library.worlds = restoreWorlds(value.worlds);
  library.atlasDiscoveries = restoreDiscoveries(value.atlasDiscoveries, library.worlds);
  library.tavernQuests = restoreTavernQuests(value.tavernQuests);
  library.guild = restoreGuildState(value.guild);
  if (value.statusRevision !== 36)
    for (const world of library.worlds)
      for (const enemy of Object.values(world.enemyDefinitions)) upgradeLegacyStatuses(enemy);
  library.emblems = Array.isArray(value.emblems) ? value.emblems.filter((id) => EMBLEMS[id]) : [];
  library.learnedSkills = restoreLearnedSkills(value.learnedSkills);
  library.discoveredWeaknesses = mergeRevealedWeaknessMap({}, value.discoveredWeaknesses);
  library.seenMonsters = normalizeSeenMonsters(value.seenMonsters, library.discoveredWeaknesses);
  if (value.exploration)
    library.exploration = restoreExploration(value.exploration, 17371, library.worlds);
  library.unlockedDungeons = Array.isArray(value.unlockedDungeons)
    ? [...new Set(value.unlockedDungeons.filter((id) => UNLOCKABLE_DUNGEONS.includes(id)))]
    : UNLOCKABLE_DUNGEONS.filter(
        (id) =>
          (library.exploration?.[id]?.completed || 0) > 0 ||
          (library.exploration?.[id]?.cleared?.length || 0) > 0,
      );
  restoreLibraryRecords(library, value);
  library.inventory = restoreInventory(value.inventory);
  library.equipment = restoreEquipment(value.equipment);
  library.skirmishes = value.skirmishes
    ? restoreSkirmishes(value.skirmishes)
    : refreshWorldSkirmishes(null, 'migrated');
  library.overlandExploration = restoreOverlandExploration(value.overlandExploration);
  library.refinedNpcs = [
    ...new Set(
      (value.refinedNpcs || []).filter((name) => typeof name === 'string' && name.length <= 30),
    ),
  ];
  library.progression = {
    settlements: [
      ...new Set(
        (
          value.progression?.settlements ||
          value.history?.filter((record) => record.complete).map((record) => record.runId) ||
          []
        ).filter((id) => typeof id === 'string'),
      ),
    ],
    pandoraJoined:
      value.progression?.pandoraJoined === true ||
      ((!campaign || value.campaign.version >= 3) &&
        value.characters?.some((member) => member.id === 'official-pandora') === true),
    entryLesson: ['pending', 'ready', 'done'].includes(value.progression?.entryLesson)
      ? value.progression.entryLesson
      : 'done',
    corridorRingAcquired: value.progression?.corridorRingAcquired === true,
    overloadLesson: ['summon', 'equip', 'done'].includes(value.progression?.overloadLesson)
      ? value.progression.overloadLesson
      : 'none',
    emblemLesson: [
      'summon',
      'equip',
      'charge',
      'combine',
      'skill',
      'done',
      'corridor-intro',
    ].includes(value.progression?.emblemLesson)
      ? value.progression.emblemLesson
      : 'none',
    swapLesson: ['pending', 'active', 'retreat', 'done'].includes(value.progression?.swapLesson)
      ? value.progression.swapLesson
      : 'none',
  };
  library.rewardClaims = Array.isArray(value.rewardClaims)
    ? [
        ...new Set(value.rewardClaims.filter((id) => typeof id === 'string' && id.length <= 100)),
      ].slice(-2000)
    : [];
  for (const entry of Array.isArray(value.characters) ? value.characters.slice(0, 100) : []) {
    if (entry.source === 'official') {
      const official = [
        'official-pandora',
        'official-edith',
        ...Object.keys(OFFICIAL_VISITORS).map((id) => 'official-' + id),
      ].includes(entry.id)
        ? officialCharacter(entry.id.slice('official-'.length))
        : createLibrary(customPortraits).characters.find((member) => member.id === entry.id);
      if (official && !library.characters.some((member) => member.id === official.id))
        library.characters.push(official);
    }
    if (
      entry.id === 'official-aegis' &&
      entry.setting?.name !== HEROES.find((hero) => hero.id === 'aegis').name
    )
      continue;
    if (
      entry.source === 'official' &&
      entry.setting?.edited === true &&
      typeof entry.setting.worldbook === 'string' &&
      entry.setting.worldbook.trim() &&
      entry.setting.worldbook.length <= 24000
    ) {
      const member = library.characters.find((item) => item.id === entry.id);
      if (member)
        Object.assign(member.setting, {
          worldbook: stripRetiredLore(entry.setting.worldbook),
          edited: true,
          ...(Array.isArray(entry.setting.tags)
            ? {
                tags: entry.setting.tags
                  .filter((tag) => typeof tag === 'string' && tag.length <= 60)
                  .slice(0, 30),
              }
            : {}),
        });
      continue;
    }
    if (
      entry.source !== 'generated' ||
      typeof entry.id !== 'string' ||
      !/^character-[a-z0-9-]+$/.test(entry.id)
    )
      continue;
    try {
      const restored = normalizeCharacter(
        {
          schemaVersion: entry.setting?.worldbook ? 2 : 1,
          setting: entry.setting,
          ...(entry.dcAttrs ? { dcAttrs: entry.dcAttrs } : {}),
          ...(entry.levelUpLines ? { levelUpLines: entry.levelUpLines } : {}),
          data: { ...entry.combat, archetype: entry.archetype },
        },
        entry.id,
      );
      if (value.statusRevision !== 36) upgradeLegacyStatuses(restored.combat);
      if (
        typeof entry.combat?.customPortrait === 'string' &&
        /^(?:data:image\/(?:png|jpeg|webp|gif|avif);base64,|\.\/__portraits\/[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)$|\/api\/ai\/portraits\/[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)$)/.test(
          entry.combat.customPortrait,
        )
      )
        restored.combat.customPortrait = entry.combat.customPortrait;
      if (Array.isArray(entry.setting?.tags))
        restored.setting.tags = entry.setting.tags
          .filter((tag) => typeof tag === 'string' && tag.length <= 60)
          .slice(0, 30);
      if (entry.display) restored.display = structuredClone(entry.display);
      if (entry.questRecruit === true) {
        restored.questRecruit = true;
        restored.combat.portrait = 'unknown-card.png';
      }
      if (
        (restored.setting?.name === '青缘' || restored.id === 'character-qingyuan') &&
        (!restored.combat.entrySkill || !restored.setting.entrySkill)
      ) {
        restored.combat.entrySkill ||= structuredClone(defaultProtagonist().combat.entrySkill);
        restored.setting.entrySkill ||= structuredClone(defaultProtagonist().setting.entrySkill);
      }
      library.characters.push(restored);
    } catch {
      /* Ignore damaged local entries. */
    }
  }
  for (const member of library.characters) {
    const previous = value.characters?.find((entry) => entry.id === member.id);
    const standing = customPortraits[member.id + ':standing'] || previous?.combat?.customStanding;
    if (
      typeof standing === 'string' &&
      /^(?:data:image\/(?:png|jpeg|webp|gif|avif);base64,|\.\/__portraits\/[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)$|\/api\/ai\/portraits\/[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)$)/.test(
        standing,
      )
    )
      member.combat.customStanding = standing;
    delete member.setting.profession;
    if (member.setting.worldbook)
      member.setting.worldbook = stripRetiredLore(member.setting.worldbook);
    const portrait = savedPortrait(customPortraits, member);
    if (portrait) member.combat.customPortrait = portrait;
  }
  if (
    Array.isArray(value.party) &&
    value.party.length === 6 &&
    new Set(value.party.filter(Boolean)).size === value.party.filter(Boolean).length &&
    value.party.every(
      (id) => (campaign && id === null) || library.characters.some((entry) => entry.id === id),
    )
  )
    library.party = value.party;
  if (campaign) {
    const protagonist = library.characters.find(
      (entry) => entry.id === value.campaign.protagonistId,
    );
    if (!protagonist) throw Error('主角存档损坏，请读取其他存档或新建冒险');
    if (!library.party.includes(protagonist.id)) library.party[0] = protagonist.id;
    library.campaign = {
      version: 3,
      protagonistId: protagonist.id,
      tutorial: typeof value.campaign.tutorial === 'string' ? value.campaign.tutorial : 'welcome',
      firstRecruit: value.campaign.version >= 2 && value.campaign.firstRecruit === true,
      completed: value.campaign.completed === true,
      tasks: structuredClone(value.campaign.tasks || {}),
      tableTalkCompleted: value.campaign.tableTalkCompleted === true,
      shopPurchased: value.campaign.shopPurchased === true,
      adventureTutorial: value.campaign.adventureTutorial === true,
    };
    if (!library.campaign.firstRecruit) {
      library.characters = library.characters.filter((entry) => entry.id !== 'official-aegis');
      library.party = library.party.map((id) => (id === 'official-aegis' ? null : id));
    }
    if (value.campaign.version < 2 && library.campaign.completed) {
      library.campaign.tutorial = 'summon-return';
      library.inventory.summonContracts = Math.max(1, library.inventory.summonContracts);
    }
    if (value.campaign.version < 3) {
      library.characters = library.characters.filter((entry) => entry.id !== 'official-pandora');
      library.party = library.party.map((id) =>
        id === 'official-pandora' ? 'official-edith' : id,
      );
      library.campaign.tutorial = library.campaign.tutorial
        .replace(/^weak/, 'vulnerable')
        .replace(/^bind/, 'slow');
      if (library.campaign.completed) library.inventory.bagUnlocked = true;
    }
    if (!library.characters.some((entry) => entry.id === 'official-edith'))
      library.characters.push(officialCharacter('edith'));
    if (!library.party.includes('official-edith')) {
      const empty = library.party.indexOf(null);
      if (empty >= 0) library.party[empty] = 'official-edith';
    }
  }
  for (const book of Array.isArray(value.scripts) ? value.scripts : []) {
    try {
      if (!Array.isArray(book.party)) continue;
      library.scripts.push({
        ...normalizeScript(
          { ...book, schemaVersion: book.schemaVersion || 1 },
          book.id,
          book.party.map((entry) => entry.id),
          { encounterCount: (book.story || book.scenes)?.length === 6 ? 6 : ENCOUNTER_COUNT },
        ),
        ...(book.display ? { display: structuredClone(book.display) } : {}),
        ...(book.generationInput ? { generationInput: structuredClone(book.generationInput) } : {}),
        party: book.party,
        ...(book.runId ? { runId: book.runId } : {}),
        boss: book.boss,
        chapter: book.chapter,
        ...(book.exploration ? { exploration: structuredClone(book.exploration) } : {}),
      });
    } catch {
      /* Ignore damaged scripts. */
    }
  }
  const learnedSet = new Set(library.learnedSkills);
  for (const member of library.characters) {
    const saved = value.characters?.find((entry) => entry.id === member.id);
    member.growth = restoreGrowth(saved?.growth, member.id);
    member.dcAttrs = normalizeDcAttrs(saved?.dcAttrs ?? member.dcAttrs, member);
    member.equippedSkills = restoreEquippedSkills(saved?.equippedSkills, learnedSet);
    if (Array.isArray(saved?.equipment))
      member.equipment = saved.equipment
        .slice(0, EQUIPMENT_SLOT_ORDER.length)
        .map((id) => (library.equipment.owned.some((item) => item.id === id) ? id : null));
  }
  for (const id of library.emblems) {
    const saved = value.characters?.find((entry) => entry.emblemId === id);
    const wearer = library.characters.find((entry) => entry.id === saved?.id);
    if (wearer) wearer.emblemId = id;
  }
  const equipped = new Set();
  for (const member of library.characters)
    if (member.equipment) {
      const names = new Set();
      const slots = [null, null, null, null];
      for (const id of member.equipment) {
        if (!id || equipped.has(id)) continue;
        const instance = library.equipment.owned.find((item) => item.id === id);
        const template = resolveEquipmentTemplate(library, instance?.templateId);
        const name = template?.name;
        if (!name || names.has(name)) continue;
        const targetSlot = EQUIPMENT_CATEGORIES[template.category]?.slot ?? 0;
        if (slots[targetSlot] !== null) continue;
        names.add(name);
        equipped.add(id);
        slots[targetSlot] = id;
      }
      member.equipment = slots;
    }
  library.prepared =
    library.scripts.some(
      (book) =>
        book.id === value.prepared &&
        (book.story || book.scenes).length === ENCOUNTER_COUNT &&
        (!book.exploration ||
          book.exploration.world ||
          book.exploration.sequence >= 6 ||
          book.exploration.sequence < REGIONS[book.exploration.map]?.sites.length),
    ) && !(campaign && value.campaign.version < 3)
      ? value.prepared
      : null;
  library.enabled = value.enabled === true;
  library.chapter = Number.isInteger(value.chapter) && value.chapter > 0 ? value.chapter : 1;
  library.seenOverlordTutorials = Array.isArray(value.seenOverlordTutorials)
    ? [...new Set(value.seenOverlordTutorials.filter((id) => typeof id === 'string' && id))]
    : [];
  // Only code-produced, confirmed history is stored; the request builder bounds context size.
  library.history = Array.isArray(value.history) ? structuredClone(value.history) : [];
  if (value.arcade) library.arcade = restoreTetris(value.arcade);
  hydrateArchiveMaps(library);
  lockUnopenedRear(library);
  return library;
}
