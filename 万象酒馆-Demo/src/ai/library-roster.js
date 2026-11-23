import { loadCustomPortraits, savedPortrait } from '../portraits.js';
import { restoreDining } from '../dining.js';
import { restoreDaily } from '../daily.js';
import { restoreArchives } from '../archives.js';
import { restoreInventory } from '../rewards.js';
import { restoreEquipment, applyEquipment, equippedDefinitions } from '../equipment.js';
import { newGuildState } from '../guild.js';
import { restoreLearnedSkills, restoreEquippedSkills } from '../learnable-skills.js';
import { newExploration } from '../exploration.js';
import { refreshWorldSkirmishes, restoreOverlandExploration } from '../skirmishes.js';
import { HEROES } from '../data.js';
import { normalizeDcAttrs, OFFICIAL_DC_ATTRS } from '../dc.js';
import { restoreGrowth, grownCombat } from '../growth.js';
import { formatCharacterSetting } from './character-setting.js';
import { OFFICIAL_SETTINGS } from '../content/official-characters.js';
import { OFFICIAL_VISITORS } from '../content/official-visitors.js';
import { EDITH, EDITH_SETTING } from '../content/edith.js';
import { PANDORA, PANDORA_SETTING } from '../content/pandora.js';
import { applyEmblemStats, EMBLEMS } from '../emblems.js';
import { defaultProtagonist } from '../content/qingyuan.js';
export function newLibrary() {
  return createLibrary(loadCustomPortraits());
}

export function createLibrary(customPortraits) {
  return {
    version: 1,
    migrations: { ruinsResetV2: true },
    workshop: null,
    dining: restoreDining(),
    daily: restoreDaily(),
    statusRevision: 36,
    enabled: false,
    chapter: 1,
    history: [],
    invitationHistory: [],
    tavernChat: [],
    journeyActivities: [],
    archives: restoreArchives(),
    summaryWorldbook: null,
    relationships: {},
    prepared: null,
    inventory: restoreInventory(),
    modifierResourceHistory: [],
    rewardClaims: [],
    experienceClaims: [],
    equipment: restoreEquipment(),
    worlds: [],
    unlockedDungeons: [],
    atlasDiscoveries: [],
    tavernQuests: [],
    guild: newGuildState(),
    emblems: [],
    learnedSkills: restoreLearnedSkills(),
    discoveredWeaknesses: {},
    seenMonsters: [],
    seenOverlordTutorials: [],
    refinedNpcs: [],
    progression: {
      settlements: [],
      pandoraJoined: false,
      swapLesson: 'none',
      entryLesson: 'done',
      corridorRingAcquired: false,
      overloadLesson: 'none',
      emblemLesson: 'none',
    },
    exploration: newExploration(Math.floor(Math.random() * 4294967296)),
    skirmishes: refreshWorldSkirmishes(null, 'init'),
    overlandExploration: restoreOverlandExploration(),
    characters: HEROES.map((hero) => {
      const combat = structuredClone(hero);
      const portrait = savedPortrait(customPortraits, { id: `official-${hero.id}`, combat });
      if (portrait) combat.customPortrait = portrait;
      return {
        id: `official-${hero.id}`,
        source: 'official',
        archetype: hero.id,
        dcAttrs: normalizeDcAttrs(OFFICIAL_DC_ATTRS[`official-${hero.id}`], {
          id: `official-${hero.id}`,
          archetype: hero.id,
          combat,
        }),
        growth: restoreGrowth(null, `official-${hero.id}`),
        combat,
        equippedSkills: restoreEquippedSkills(),
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
  if (OFFICIAL_VISITORS[id]) {
    const visitor = OFFICIAL_VISITORS[id];
    const combat = structuredClone(visitor.combat);
    const fullId = 'official-' + id;
    return {
      id: fullId,
      source: 'official',
      archetype: id === 'luo-gongxu' ? 'aegis' : 'morrow',
      dcAttrs: normalizeDcAttrs(OFFICIAL_DC_ATTRS[fullId], { id: fullId, combat }),
      growth: restoreGrowth(null, fullId),
      combat,
      setting: {
        name: visitor.setting.name,
        title: visitor.combat.title,
        worldbook: formatCharacterSetting(visitor.setting, {
          skillCount: visitor.combat.skills.length,
        }),
        formatVersion: 3,
      },
    };
  }
  if (id === 'edith') {
    const combat = structuredClone(EDITH);
    return {
      id: 'official-edith',
      growth: restoreGrowth(null, 'official-edith'),
      source: 'official',
      archetype: 'aegis',
      dcAttrs: normalizeDcAttrs(OFFICIAL_DC_ATTRS['official-edith'], {
        id: 'official-edith',
        combat,
      }),
      combat,
      setting: {
        name: EDITH.name,
        title: EDITH.title,
        worldbook: formatCharacterSetting(EDITH_SETTING),
        formatVersion: 3,
      },
    };
  }
  if (id === 'pandora') {
    const combat = structuredClone(PANDORA);
    return {
      id: 'official-pandora',
      growth: restoreGrowth(null, 'official-pandora'),
      source: 'official',
      archetype: 'morrow',
      dcAttrs: normalizeDcAttrs(OFFICIAL_DC_ATTRS['official-pandora'], {
        id: 'official-pandora',
        combat,
      }),
      combat,
      setting: {
        name: PANDORA.name,
        title: PANDORA.title,
        worldbook:
          formatCharacterSetting(PANDORA_SETTING) +
          '\n\n叙事提示：服装颜色只在首次出场或确有必要时简短交代，不反复强调裙子是黑白紫相间的。',
        formatVersion: 3,
      },
    };
  }
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
      const combat = applyEmblemStats(
        applyEquipment(grownCombat(entry), equippedDefinitions(library, entry)),
        entry.emblemId,
      );
      const portrait = savedPortrait(customPortraits, entry);
      if (portrait) combat.customPortrait = portrait;
      const emblemId = EMBLEMS[entry.emblemId] ? entry.emblemId : null;
      if (!combat.entrySkill) {
        if (entry.setting?.entrySkill) {
          combat.entrySkill = {
            id: `entry-${entry.id}`,
            name: entry.setting.entrySkill.name,
            text: entry.setting.entrySkill.description,
            target: 'opposite',
            effects: [{ type: 'damage', value: 8 }],
          };
        } else if (entry.setting?.name === '青缘' || entry.id === 'character-qingyuan') {
          combat.entrySkill = structuredClone(defaultProtagonist().combat.entrySkill);
        } else {
          const fallbackHero = HEROES.find((h) => h.id === entry.archetype) || HEROES[0];
          if (fallbackHero?.entrySkill) {
            combat.entrySkill = structuredClone(fallbackHero.entrySkill);
          }
        }
      }
      return [
        slot.id,
        {
          ...combat,
          id: slot.id,
          ...(emblemId ? { emblemId } : {}),
        },
      ];
    }),
  );
}
