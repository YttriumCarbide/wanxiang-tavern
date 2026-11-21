import { defaultProtagonist } from '../content/qingyuan.js';
import { HEROES } from '../data.js';
import { EDITH } from '../content/edith.js';
import { PANDORA } from '../content/pandora.js';
import { OFFICIAL_VISITORS } from '../content/official-visitors.js';

export const GENERATED_RESET_REVISION = '2026-11-22-remove-generated-characters';
const game = 'game.';
const marker = 'wanxiang.generated-reset.v1';
const library = 'wanxiang.worldbooks.v1';
const saves = 'wanxiang.saves.v1';
const checkpoint = 'wanxiang.battle-checkpoint.v1';
const portraits = 'wanxiang.portraits.v1';
const recovery = 'wanxiang.generated-recovery.v1';
const context = 'wanxiang.generated-context.v1';
const localKeys = [library, saves, checkpoint, portraits, recovery, context];
const protagonist = 'character-qingyuan';
const narrativeLists = [
  'history',
  'invitationHistory',
  'tavernChat',
  'journeyActivities',
  'scripts',
];

function readJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function walk(value, visit) {
  visit(value);
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) walk(child, visit);
  }
}

function isLibrary(value) {
  return Array.isArray(value?.characters) && Array.isArray(value.party);
}

function isOfficialId(id) {
  return id === protagonist || id.startsWith('official-');
}

function isPersonalId(id) {
  return typeof id === 'string' && !!id && !isOfficialId(id);
}

function collectCharacters(records) {
  const ids = new Set();
  const generatedNames = new Set();
  const officialNames = new Set([
    defaultProtagonist().setting.name,
    EDITH.name,
    PANDORA.name,
    ...HEROES.map((hero) => hero.name),
    ...Object.values(OFFICIAL_VISITORS).map((visitor) => visitor.setting.name),
  ]);
  for (const [, value] of records) {
    walk(value, (entry) => {
      if (!entry || typeof entry !== 'object') return;
      const name = entry.setting?.name || entry.combat?.name;
      if (isPersonalId(entry.id) && entry.source === 'generated' && name) {
        ids.add(entry.id);
        generatedNames.add(name);
      } else if (typeof entry.id === 'string' && isOfficialId(entry.id) && name) {
        officialNames.add(name);
      }
      const link = entry.extensions?.wanxiang;
      if (
        ['ai-character', 'protagonist'].includes(link?.characterCategory) &&
        isPersonalId(link.characterId)
      ) {
        ids.add(link.characterId);
        if (typeof entry.comment === 'string') {
          generatedNames.add(entry.comment.replace(/^[^：:]+[：:]/u, '').trim());
        }
      }
      if (Array.isArray(link?.characterCleanup?.removedIds)) {
        for (const id of link.characterCleanup.removedIds) {
          if (typeof id === 'string' && id.startsWith('character-') && isPersonalId(id)) {
            ids.add(id);
          }
        }
      }
    });
  }
  return {
    ids,
    names: new Set([...generatedNames].filter((name) => name && !officialNames.has(name))),
  };
}

function portraitKey(value) {
  if (typeof value !== 'string') return null;
  const match =
    /(?:^|\/)(?:__portraits|api\/ai\/portraits)\/([a-z0-9_-]+\.(?:png|jpe?g|webp|gif|avif))$/i.exec(
      value,
    );
  return match ? 'portrait.' + match[1] : null;
}

function pruneRecords(records) {
  const { ids, names } = collectCharacters(records);
  const removedPortraits = new Set();

  function removedKey(key) {
    return ids.has(key) || (key.endsWith(':standing') && ids.has(key.slice(0, -9)));
  }

  function discard(value) {
    walk(value, (child) => {
      const key = portraitKey(child);
      if (key) removedPortraits.add(key);
    });
    return undefined;
  }

  function privateText(text) {
    if (typeof text !== 'string') return false;
    for (const id of ids) {
      if (text.includes(id)) return true;
    }
    for (const name of names) {
      if (text === name || (name.length > 1 && text.includes(name))) return true;
    }
    return false;
  }

  function mentionsPrivate(value) {
    if (!value || typeof value !== 'object') return privateText(value);
    return Object.entries(value).some(([key, child]) => removedKey(key) || mentionsPrivate(child));
  }

  function cleanEntries(value) {
    const entries = Object.entries(value);
    const retained = entries.filter(([, entry]) => {
      if (!mentionsPrivate(entry)) return true;
      discard(entry);
      return false;
    });
    return retained.length === entries.length ? value : Object.fromEntries(retained);
  }

  function cleanArray(value, key) {
    if (narrativeLists.includes(key)) {
      const retained = value.filter((entry) => {
        if (!mentionsPrivate(entry)) return true;
        discard(entry);
        return false;
      });
      return retained.length === value.length ? value : retained;
    }
    const next = value.map((entry) => cleanValue(entry, key));
    if (next.every((entry, index) => entry === value[index])) return value;
    return key === 'party'
      ? next.map((entry) => entry ?? null)
      : next.filter((entry) => entry !== undefined);
  }

  function cleanObject(value) {
    if (ids.has(value.id) || ids.has(value.extensions?.wanxiang?.characterId)) {
      return discard(value);
    }
    const entries = Object.entries(value);
    let changed = false;
    const next = [];
    for (const [key, child] of entries) {
      let result;
      if (removedKey(key)) result = discard(child);
      else if (key === 'entries' && child && typeof child === 'object' && !Array.isArray(child)) {
        result = cleanEntries(child);
      } else if ((key === 'prepared' || key === 'adventure') && mentionsPrivate(child)) {
        discard(child);
        result = null;
      } else result = cleanValue(child, key);
      if (result !== child) changed = true;
      if (result !== undefined) next.push([key, result]);
    }
    return changed ? Object.fromEntries(next) : value;
  }

  function cleanLibrary(value) {
    const next = cleanObject(value);
    const previousPlayer = value.campaign?.protagonistId;
    if (!ids.has(previousPlayer)) return next;
    const characters = next.characters.some(({ id }) => id === protagonist)
      ? next.characters
      : [...next.characters, defaultProtagonist()];
    const position = value.party.indexOf(previousPlayer);
    const party = [...next.party];
    if (!party.includes(protagonist)) {
      const empty = party.indexOf(null);
      party[position >= 0 ? position : Math.max(0, empty)] = protagonist;
    }
    return {
      ...next,
      characters,
      party,
      campaign: { ...next.campaign, protagonistId: protagonist },
    };
  }

  function cleanValue(value, key) {
    if (typeof value === 'string') return privateText(value) ? undefined : value;
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return cleanArray(value, key);
    if (isLibrary(value)) return cleanLibrary(value);
    return cleanObject(value);
  }

  function cleanSaves(value) {
    if (!value?.slots || typeof value.slots !== 'object') return value;
    let changed = false;
    const slots = Object.entries(value.slots).map(([id, slot]) => {
      if (!isLibrary(slot?.data?.library)) return [id, slot];
      const data = cleanObject(slot.data);
      if (data === slot.data && !privateText(slot.note)) return [id, slot];
      changed = true;
      const owner = data.library;
      const byId = new Map(owner.characters.map((character) => [character.id, character]));
      const partyNames = owner.party.filter(Boolean).map((memberId) => {
        const character = byId.get(memberId);
        return character?.setting?.name || character?.combat?.name || memberId;
      });
      return [
        id,
        {
          ...slot,
          ...(privateText(slot.note) ? { note: '' } : {}),
          data,
          summary: {
            ...slot.summary,
            partyNames,
            characterCount: owner.characters.length,
            scriptCount: owner.scripts?.length || 0,
            ...(data.adventure === null && slot.data.adventure ? { mode: 'inn' } : {}),
          },
        },
      ];
    });
    return changed ? { ...value, slots: Object.fromEntries(slots) } : value;
  }

  const kept = records.map(([key, value]) => {
    if (key === game + recovery || key === game + context) return [key, discard(value)];
    if (key === game + saves) return [key, cleanSaves(value)];
    if (key === game + checkpoint && isLibrary(value?.library)) {
      const { library: owner, ...battle } = value;
      if (mentionsPrivate(battle)) return [key, discard(value)];
      const next = cleanLibrary(owner);
      return [key, next === owner ? value : { ...value, library: next }];
    }
    return [key, cleanValue(value)];
  });

  for (const [, value] of kept) {
    walk(value, (child) => {
      const key = portraitKey(child);
      if (key) removedPortraits.delete(key);
    });
  }
  return { kept, removedPortraits, removedCharacters: ids.size };
}

function resettable(key) {
  return (
    localKeys.some((name) => key === game + name) ||
    key === 'world.states' ||
    key.startsWith('world.book.') ||
    key.startsWith('world.backup.')
  );
}

export function cleanGeneratedRecords(rawEntries) {
  const parsed = rawEntries
    .filter(([key]) => resettable(key))
    .map(([key, raw]) => {
      const value = key.startsWith(game) ? readJson(raw) : raw;
      return [key, value];
    });
  const previous = new Map(parsed);
  const { kept, removedPortraits, removedCharacters } = pruneRecords(parsed);
  const values = new Map(kept);
  const writes = [];
  const deleted = [];
  const entries = [];
  for (const [key, raw] of rawEntries) {
    const value = values.get(key);
    if ((values.has(key) && value === undefined) || removedPortraits.has(key)) {
      deleted.push(key);
      continue;
    }
    if (values.has(key) && value !== previous.get(key)) {
      const serialized = key.startsWith(game) ? JSON.stringify(value) : value;
      writes.push([key, serialized]);
      entries.push([key, serialized]);
    } else entries.push([key, raw]);
  }
  return { entries, writes, deleted, removedCharacters };
}

export function applyGeneratedReset(storage) {
  if (storage.getItem(marker) === GENERATED_RESET_REVISION) return false;
  const raw = [];
  for (const key of localKeys) {
    const value = storage.getItem(key);
    if (value != null) raw.push([game + key, value]);
  }
  const { writes, deleted } = cleanGeneratedRecords(raw);
  for (const key of deleted) storage.removeItem?.(key.slice(game.length));
  for (const [key, value] of writes) storage.setItem(key.slice(game.length), value);
  storage.setItem(marker, GENERATED_RESET_REVISION);
  return true;
}

export function hasGeneratedRecovery() {
  return false;
}

export function restoreGeneratedRecovery(storage) {
  storage.removeItem?.(recovery);
  return false;
}

export async function applyGeneratedDatabaseReset(database, preferences) {
  const entries = database.entries();
  if (new Map(entries).get(game + marker) === GENERATED_RESET_REVISION) return false;
  const { writes, deleted } = cleanGeneratedRecords(entries);
  await database.write([...writes, [game + marker, GENERATED_RESET_REVISION]], deleted);
  if (preferences) applyGeneratedReset(preferences);
  return true;
}
