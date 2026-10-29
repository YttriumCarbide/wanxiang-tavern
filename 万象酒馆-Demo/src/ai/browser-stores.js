import { upgradePlaytestWorldbook } from './playtest-upgrade.js';
import { upgradeAdventureWorldbook } from './adventure-upgrade.js';
import { upgradeTutorialRevision } from './tutorial-revision.js';
import { upgradeEnemyAppearanceRules } from './enemy-appearance-rules.js';
import { upgradeProtagonistRules } from './protagonist-rules.js';
import { upgradeBattleDisplayRules } from './battle-display-rules.js';
import { upgradeRuinsWorldbook } from './ruins-worldbook.js';
import { upgradeAssetWorldbook } from './asset-worldbook.js';
import { upgradeGameRules } from './game-rules-upgrade.js';
import { normalizePromptPreset } from './presets.js';
import { normalizeRegexScripts } from './regex.js';
import { normalizeWorldbook, normalizeWorldSettings, characterWorldEntry } from './worldbook.js';
import { createConnectionStore } from './connection-store.js';
import { upgradeCharacterGeneration } from './character-generation-upgrade.js';
import { upgradeContinuityRules } from './continuity-upgrade.js';
import { upgradeGenerationExperience } from './generation-experience-upgrade.js';
import { upgradeStatusEmblems } from './status-emblem-upgrade.js';
import { upgradeUniversalEnemies } from './universal-enemy-upgrade.js';
import { upgradeCharacterConstraints } from './character-constraints-upgrade.js';
import { upgradeForestWorldbook } from './forest-worldbook.js';
import { upgradeCharacterIdentity } from './character-identity-upgrade.js';
import { upgradeCombatControl } from './combat-control-upgrade.js';
import { upgradeGenerationBoundary } from './generation-boundary-upgrade.js';
import { upgradeBattleBalance } from './battle-balance-upgrade.js';
import { upgradeFrostWorldbook } from './frost-worldbook.js';
import { upgradeEnemyBaseWorldbook } from './enemy-base-upgrade.js';

function checkedId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(id)) throw Error('资料ID无效');
  return id;
}

/** Same store ports as the development service; every record is private to this browser. */
export async function createBrowserStores(database, readText, builtinBook) {
  const settings = createConnectionStore({
    snapshot: database.get('api.config') || {},
    initial: { requestMode: 'browser' },
    save: (value) => database.write([['api.config', value]]),
  });
  const defaults = [
    'character-default',
    'script-default',
    'chat-default',
    'quick-chat-default',
    'map-default',
    'creation-default',
  ];
  const prompts = {
    async get(id = 'character-default') {
      checkedId(id);
      const raw = defaults.includes(id)
        ? JSON.parse(await readText(`framework/${id}.json`))
        : database.get('prompt.' + id);
      if (!raw) throw Error('提示词预设不存在，请重新选择');
      return normalizePromptPreset(raw, id);
    },
    async list() {
      return database
        .entries()
        .filter(([key]) => key.startsWith('prompt.'))
        .map(([key, raw]) => {
          const id = key.slice(7);
          const { preset, warnings } = normalizePromptPreset(raw, id);
          return { id, name: preset.name, warnings, builtin: false };
        });
    },
    async save(input) {
      const id = checkedId(input.id || `prompt-${crypto.randomUUID()}`);
      const result = normalizePromptPreset(input.preset, id);
      await database.write([['prompt.' + id, result.preset]]);
      return result;
    },
    async delete(id) {
      checkedId(id);
      if (defaults.includes(id)) throw Error('默认预设不能删除');
      await database.write([], ['prompt.' + id, 'helper.' + id]);
    },
  };
  if (!database.get('world.book.tavern-world'))
    await database.write([['world.book.tavern-world', normalizeWorldbook(builtinBook).book]]);
  if (!database.get('world.game-rules.v26')) {
    const previous = database.get('world.book.tavern-world');
    if (previous)
      await database.write([
        ['world.backup.before-game-rules-v26', previous],
        ['world.book.tavern-world', upgradeGameRules(previous)],
        ['world.game-rules.v26', true],
      ]);
  }
  if (!database.get('world.asset-rules.v27')) {
    const previous = database.get('world.book.tavern-world');
    const updated = upgradeAssetWorldbook(previous, {
      map: await readText('worldbook/map-output.md'),
      creation: await readText('worldbook/creation-output.md'),
    });
    await database.write([
      ['world.book.tavern-world', updated],
      ['world.asset-rules.v27', true],
    ]);
  }
  if (!database.get('world.protagonist-rules.v28')) {
    const updated = upgradeProtagonistRules(
      database.get('world.book.tavern-world'),
      await readText('worldbook/protagonist-strength.md'),
    );
    await database.write([
      ['world.book.tavern-world', updated],
      ['world.protagonist-rules.v28', true],
    ]);
  }
  if (!database.get('world.battle-display.v29')) {
    const updated = upgradeBattleDisplayRules(
      database.get('world.book.tavern-world'),
      await readText('worldbook/battle-display.md'),
    );
    await database.write([
      ['world.book.tavern-world', updated],
      ['world.battle-display.v29', true],
    ]);
  }
  if (!database.get('world.ruins-roster.v30')) {
    await database.write([
      ['world.book.tavern-world', upgradeRuinsWorldbook(database.get('world.book.tavern-world'))],
      ['world.ruins-roster.v30', true],
    ]);
  }
  if (!database.get('world.tutorial-equipment.v31')) {
    await database.write([
      ['world.book.tavern-world', upgradeTutorialRevision(database.get('world.book.tavern-world'))],
      ['world.tutorial-equipment.v31', true],
    ]);
  }
  if (!database.get('world.enemy-appearances.v32')) {
    await database.write([
      [
        'world.book.tavern-world',
        upgradeEnemyAppearanceRules(database.get('world.book.tavern-world')),
      ],
      ['world.enemy-appearances.v32', true],
    ]);
  }
  if (!database.get('world.character-generation.v33')) {
    const names = [
      'character-definition',
      'character-mechanics',
      'character-output',
      'growth-numbers',
    ];
    const rules = Object.fromEntries(
      await Promise.all(names.map(async (name) => [name, await readText(`worldbook/${name}.md`)])),
    );
    await database.write([
      [
        'world.book.tavern-world',
        upgradeCharacterGeneration(database.get('world.book.tavern-world'), {
          rules,
          reference: await readText('worldbook/character-example.json'),
        }),
      ],
      ['world.character-generation.v33', true],
    ]);
  }
  if (!database.get('world.continuity.v34'))
    await database.write([
      ['world.book.tavern-world', upgradeContinuityRules(database.get('world.book.tavern-world'))],
      ['world.continuity.v34', true],
    ]);
  if (!database.get('world.generation-experience.v35'))
    await database.write([
      [
        'world.book.tavern-world',
        upgradeGenerationExperience(
          database.get('world.book.tavern-world'),
          await readText('worldbook/creation-output.md'),
        ),
      ],
      ['world.generation-experience.v35', true],
    ]);
  if (!database.get('world.status-emblems.v36'))
    await database.write([
      ['world.book.tavern-world', upgradeStatusEmblems(database.get('world.book.tavern-world'))],
      ['world.status-emblems.v36', true],
    ]);
  if (!database.get('world.universal-enemies.v37'))
    await database.write([
      ['world.book.tavern-world', upgradeUniversalEnemies(database.get('world.book.tavern-world'))],
      ['world.universal-enemies.v37', true],
    ]);
  if (!database.get('world.character-constraints.v38'))
    await database.write([
      [
        'world.book.tavern-world',
        upgradeCharacterConstraints(
          database.get('world.book.tavern-world'),
          await readText('worldbook/character-complexity.md'),
        ),
      ],
      ['world.character-constraints.v38', true],
    ]);
  if (!database.get('world.forest-chapters.v39'))
    await database.write([
      ['world.book.tavern-world', upgradeForestWorldbook(database.get('world.book.tavern-world'))],
      ['world.forest-chapters.v39', true],
    ]);
  if (!database.get('world.character-identity.v40'))
    await database.write([
      [
        'world.book.tavern-world',
        upgradeCharacterIdentity(
          database.get('world.book.tavern-world'),
          await readText('worldbook/character-identity.md'),
        ),
      ],
      ['world.character-identity.v40', true],
    ]);
  if (!database.get('world.combat-control.v41'))
    await database.write([
      ['world.book.tavern-world', upgradeCombatControl(database.get('world.book.tavern-world'))],
      ['world.combat-control.v41', true],
    ]);
  if (!database.get('world.generation-boundary.v42'))
    await database.write([
      [
        'world.book.tavern-world',
        upgradeGenerationBoundary(
          database.get('world.book.tavern-world'),
          await readText('worldbook/generation-boundary.md'),
        ),
      ],
      ['world.generation-boundary.v42', true],
    ]);
  if (!database.get('world.battle-balance.v43'))
    await database.write([
      ['world.book.tavern-world', upgradeBattleBalance(database.get('world.book.tavern-world'))],
      ['world.battle-balance.v43', true],
    ]);
  if (!database.get('world.frost-chapters.v44'))
    await database.write([
      ['world.book.tavern-world', upgradeFrostWorldbook(database.get('world.book.tavern-world'))],
      ['world.frost-chapters.v44', true],
    ]);
  if (!database.get('world.enemy-base.v45'))
    await database.write([
      [
        'world.book.tavern-world',
        upgradeEnemyBaseWorldbook(database.get('world.book.tavern-world')),
      ],
      ['world.enemy-base.v45', true],
    ]);
  if (!database.get('world.playtest.v46')) {
    const names = [
      'character-definition',
      'character-mechanics',
      'character-output',
      'growth-numbers',
    ];
    const rules = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [name, await readText('worldbook/' + name + '.md')]),
      ),
    );
    await database.write([
      [
        'world.book.tavern-world',
        upgradePlaytestWorldbook(database.get('world.book.tavern-world'), rules),
      ],
      ['world.playtest.v46', true],
    ]);
  }
  if (!database.get('world.adventure.v50'))
    await database.write([
      [
        'world.book.tavern-world',
        upgradeAdventureWorldbook(
          database.get('world.book.tavern-world'),
          await readText('worldbook/script-output.md'),
        ),
      ],
      ['world.adventure.v50', true],
    ]);
  let worldSettings = normalizeWorldSettings(
    database.get('world.settings') || { globalSelect: ['tavern-world'] },
  );
  const getWorld = async (id) => {
    const book = database.get('world.book.' + checkedId(id));
    if (!book) throw Error('世界书不存在');
    return { id, ...normalizeWorldbook(book) };
  };
  const worlds = {
    get: getWorld,
    async visible() {
      const books = database
        .entries()
        .filter(([key]) => key.startsWith('world.book.'))
        .map(([key, book]) => ({
          id: key.slice(11),
          name: book.name,
          entries: Object.keys(book.entries).length,
          warnings: [],
        }));
      return { books, settings: structuredClone(worldSettings) };
    },
    async save({ id = `world-${crypto.randomUUID()}`, book }) {
      checkedId(id);
      const result = normalizeWorldbook(book);
      const changed =
        JSON.stringify(database.get('world.book.' + id)) !== JSON.stringify(result.book);
      await database.write([
        ['world.book.' + id, result.book],
        ...(changed ? [['world.states', {}]] : []),
      ]);
      return { id, ...result };
    },
    async configure(value) {
      const next = normalizeWorldSettings(value);
      for (const id of new Set([
        ...next.globalSelect,
        ...next.character,
        ...next.script,
        ...next.chat,
        ...next['quick-chat'],
        ...Object.values(next.bindings).flat(),
      ]))
        await getWorld(id);
      await database.write([['world.settings', next]]);
      worldSettings = next;
      return structuredClone(next);
    },
    async delete(id) {
      checkedId(id);
      const next = structuredClone(worldSettings);
      for (const field of [
        'globalSelect',
        'character',
        'script',
        'chat',
        'quick-chat',
        'map',
        'creation',
      ])
        next[field] = next[field].filter((item) => item !== id);
      for (const key of Object.keys(next.bindings))
        next.bindings[key] = next.bindings[key].filter((item) => item !== id);
      await database.write(
        [
          ['world.settings', next],
          ['world.states', {}],
        ],
        ['world.book.' + id],
      );
      worldSettings = next;
    },
    async resolve(kind, input, override) {
      const current = override?.settings
        ? normalizeWorldSettings(override.settings)
        : structuredClone(worldSettings);
      const bindings = (input.party || []).flatMap((entry) => current.bindings[entry.id] || []);
      const ids = [...new Set([...current.globalSelect, ...(current[kind] || []), ...bindings])];
      const books = [];
      for (const id of ids) {
        const value = override?.id === id ? normalizeWorldbook(override.book) : await getWorld(id);
        const book = structuredClone(value.book);
        if (id === 'tavern-world') {
          let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
          for (const member of input.party || []) {
            const name = member.name || member.setting?.name;
            if (
              !name ||
              Object.values(book.entries).some(
                (entry) =>
                  entry.extensions?.wanxiang?.characterId === member.id ||
                  entry.comment === `人物详情：${name}`,
              )
            )
              continue;
            book.entries[uid] = characterWorldEntry(
              {
                id: member.id,
                setting: { name, worldbook: member.worldbook || member.setting?.worldbook || '' },
              },
              uid,
            );
            uid++;
          }
        }
        books.push({ ...book, id });
      }
      return {
        books,
        settings: current,
        state: structuredClone(database.get('world.states')?.[kind] || {}),
      };
    },
    async commit(kind, nextState, expectedStep) {
      return database.update('world.states', (previous = {}) =>
        Number(previous[kind]?.step || 0) === expectedStep
          ? { ...previous, [kind]: nextState }
          : undefined,
      );
    },
  };
  const regexStore = {
    get: () => normalizeRegexScripts(database.get('regex') || []),
    async save(raw) {
      const scripts = normalizeRegexScripts(raw);
      await database.write([['regex', scripts]]);
      return { scripts };
    },
  };
  const helperStorage = {
    get: (id) => database.get('helper.' + checkedId(id)) || {},
    async save(id, storage) {
      checkedId(id);
      if (
        !storage ||
        typeof storage !== 'object' ||
        Array.isArray(storage) ||
        Object.values(storage).some((value) => typeof value !== 'string') ||
        new TextEncoder().encode(JSON.stringify(storage)).length > 4000000
      )
        throw Error('扩展存储需要不超过4MB的字符串字典');
      await database.write([['helper.' + id, storage]]);
      return { saved: true };
    },
  };
  return { settings, prompts, worlds, regexStore, helperStorage };
}
