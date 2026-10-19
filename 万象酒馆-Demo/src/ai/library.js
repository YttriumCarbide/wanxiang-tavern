import { grownCombat, restoreGrowth } from '../growth.js';
import { restoreEquipment, applyEquipment, equippedDefinitions } from '../equipment.js';
import { ENCOUNTER_COUNT } from '../content/journey-rules.js';
import { REGIONS } from '../content/regions.js';
import { PANDORA, PANDORA_SETTING } from '../content/pandora.js';
import { EDITH, EDITH_SETTING } from '../content/edith.js';
import { stripRetiredLore } from './retired-abilities.js';
import { HEROES } from '../data.js';
import { normalizeCharacter, normalizeScript } from './contracts.js';
import { OFFICIAL_SETTINGS } from '../content/official-characters.js';
import { formatCharacterSetting } from './character-setting.js';
import { loadCustomPortraits, savedPortrait } from '../portraits.js';
import { newExploration, restoreExploration } from '../exploration.js';
import { restoreInventory } from '../rewards.js';
import { restoredSummary, conversationText } from '../memory.js';
import { restoreArchives, hydrateArchiveMaps } from '../archives.js';

export function newLibrary() {
  return createLibrary(loadCustomPortraits());
}

function createLibrary(customPortraits) {
  return {
    version: 1,
    enabled: false,
    chapter: 1,
    history: [],
    tavernChat: [],
    archives: restoreArchives(),
    relationships: {},
    prepared: null,
    inventory: restoreInventory(),
    rewardClaims: [],
    experienceClaims: [],
    equipment: restoreEquipment(),
    refinedNpcs: [],
    progression: { settlements: [], pandoraJoined: false, swapLesson: 'none' },
    exploration: newExploration(Math.floor(Math.random() * 4294967296)),
    characters: HEROES.map((hero) => {
      const combat = structuredClone(hero);
      const portrait = savedPortrait(customPortraits, { id: `official-${hero.id}`, combat });
      if (portrait) combat.customPortrait = portrait;
      return {
        id: `official-${hero.id}`,
        source: 'official',
        archetype: hero.id,
        growth: restoreGrowth(null, `official-${hero.id}`),
        combat,
        setting: {
          name: hero.name,
          title: hero.title,
          worldbook: formatCharacterSetting(OFFICIAL_SETTINGS[hero.id]),
          formatVersion: 3,
        },
      };
    }),
    party: HEROES.map((hero) => `official-${hero.id}`),
    scripts: [],
  };
}
export function officialCharacter(id) {
  if (id === 'edith')
    return {
      id: 'official-edith',
      growth: restoreGrowth(null, 'official-edith'),
      source: 'official',
      archetype: 'aegis',
      combat: structuredClone(EDITH),
      setting: {
        name: EDITH.name,
        title: EDITH.title,
        worldbook: formatCharacterSetting(EDITH_SETTING),
        formatVersion: 3,
      },
    };
  if (id === 'pandora')
    return {
      id: 'official-pandora',
      growth: restoreGrowth(null, 'official-pandora'),
      source: 'official',
      archetype: 'morrow',
      combat: structuredClone(PANDORA),
      setting: {
        name: PANDORA.name,
        title: PANDORA.title,
        worldbook: formatCharacterSetting(PANDORA_SETTING),
        formatVersion: 3,
      },
    };
  const entry = newLibrary().characters.find((member) => member.archetype === id);
  if (!entry) throw Error('官方角色不存在');
  return entry;
}
export function compileRoster(library) {
  const members = library.party.filter(Boolean);
  if (
    library.party.length !== 6 ||
    new Set(members).size !== members.length ||
    (!library.campaign && members.length !== 6)
  )
    throw Error('队伍需要六名不同角色');
  if (library.campaign && !members.includes(library.campaign.protagonistId))
    throw Error('主角必须在队伍中');
  const customPortraits = loadCustomPortraits();
  return Object.fromEntries(
    HEROES.map((slot, index) => {
      const entry = library.characters.find((character) => character.id === library.party[index]);
      if (!entry && library.campaign && !library.party[index])
        return [slot.id, { ...structuredClone(slot), inactive: true }];
      if (!entry) throw Error('队伍角色不在角色池中');
      const combat = applyEquipment(grownCombat(entry), equippedDefinitions(library, entry));
      const portrait = savedPortrait(customPortraits, entry);
      if (portrait) combat.customPortrait = portrait;
      return [slot.id, { ...combat, id: slot.id }];
    }),
  );
}
export function restoreLibrary(value) {
  const customPortraits = loadCustomPortraits();
  const library = createLibrary(customPortraits);
  if (!value || value.version !== 1) return library;
  const campaign = [1, 2, 3].includes(value.campaign?.version);
  if (campaign) {
    library.characters = [];
    library.party = Array(6).fill(null);
  }
  if (value.exploration) library.exploration = restoreExploration(value.exploration);
  library.archives = restoreArchives(value.archives);
  library.relationships = structuredClone(value.relationships || {});
  library.tavernChat = (Array.isArray(value.tavernChat) ? value.tavernChat : [])
    .filter(
      (message) =>
        ['user', 'assistant', 'system'].includes(message.role) &&
        typeof message.content === 'string' &&
        message.content.length <= 200000,
    )
    .map((message, index, messages) => {
      const { role, content, display, speakerIds, speakerName, summary, turnSummary, id, divider } =
        message;
      const validSummary = restoredSummary(summary, content);
      const player = messages[index - 1];
      const validTurn =
        role === 'assistant' && player?.role === 'user' && !player.divider && !divider
          ? restoredSummary(turnSummary, conversationText(player, message))
          : null;
      return {
        role,
        content,
        ...(typeof id === 'string' ? { id } : {}),
        ...(divider ? { divider: true } : {}),
        ...(validSummary ? { summary: validSummary } : {}),
        ...(validTurn ? { turnSummary: validTurn } : {}),
        ...(typeof display === 'string' && display.length <= 200000 ? { display } : {}),
        ...(Array.isArray(speakerIds)
          ? {
              speakerIds: speakerIds
                .filter((id) => typeof id === 'string' && id.length <= 100)
                .slice(0, 100),
            }
          : {}),
        ...(typeof speakerName === 'string' && speakerName.length <= 1000 ? { speakerName } : {}),
      };
    });
  library.experienceClaims = Array.isArray(value.experienceClaims)
    ? value.experienceClaims.filter((id) => typeof id === 'string').slice(-4000)
    : [];
  library.inventory = restoreInventory(value.inventory);
  library.equipment = restoreEquipment(value.equipment);
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
    swapLesson: ['pending', 'active', 'done'].includes(value.progression?.swapLesson)
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
      const official = ['official-pandora', 'official-edith'].includes(entry.id)
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
          data: { ...entry.combat, archetype: entry.archetype },
        },
        entry.id,
      );
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
      library.characters.push(restored);
    } catch {
      /* Ignore damaged local entries. */
    }
  }
  for (const member of library.characters) {
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
        boss: book.boss,
        chapter: book.chapter,
        ...(book.exploration ? { exploration: structuredClone(book.exploration) } : {}),
      });
    } catch {
      /* Ignore damaged scripts. */
    }
  }
  for (const member of library.characters) {
    const saved = value.characters?.find((entry) => entry.id === member.id);
    member.growth = restoreGrowth(saved?.growth, member.id);
    if (Array.isArray(saved?.equipment))
      member.equipment = saved.equipment
        .slice(0, 3)
        .map((id) => (library.equipment.owned.some((item) => item.id === id) ? id : null));
  }
  const equipped = new Set();
  for (const member of library.characters)
    if (member.equipment)
      member.equipment = member.equipment.map((id) => {
        if (!id || equipped.has(id)) return null;
        equipped.add(id);
        return id;
      });
  library.prepared =
    library.scripts.some(
      (book) =>
        book.id === value.prepared &&
        (book.story || book.scenes).length === ENCOUNTER_COUNT &&
        (!book.exploration ||
          book.exploration.sequence < REGIONS[book.exploration.map]?.sites.length),
    ) && !(campaign && value.campaign.version < 3)
      ? value.prepared
      : null;
  library.enabled = value.enabled === true;
  library.chapter = Number.isInteger(value.chapter) && value.chapter > 0 ? value.chapter : 1;
  // Only code-produced, confirmed history is stored; the request builder bounds context size.
  library.history = Array.isArray(value.history) ? structuredClone(value.history) : [];
  hydrateArchiveMaps(library);
  return library;
}
