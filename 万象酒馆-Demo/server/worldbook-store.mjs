import { upgradeTutorialRevision } from '../src/ai/tutorial-revision.js';
import { upgradeProtagonistRules } from '../src/ai/protagonist-rules.js';
import { upgradeBattleDisplayRules } from '../src/ai/battle-display-rules.js';
import { upgradeRuinsWorldbook } from '../src/ai/ruins-worldbook.js';
import { upgradeAssetWorldbook } from '../src/ai/asset-worldbook.js';
import { upgradeEnemyAppearanceRules } from '../src/ai/enemy-appearance-rules.js';
import { upgradeCharacterGeneration } from '../src/ai/character-generation-upgrade.js';
import { upgradeCharacterConstraints } from '../src/ai/character-constraints-upgrade.js';
import { upgradeForestWorldbook } from '../src/ai/forest-worldbook.js';
import { upgradeContinuityRules } from '../src/ai/continuity-upgrade.js';
import { upgradeGenerationExperience } from '../src/ai/generation-experience-upgrade.js';
import { upgradeStatusEmblems } from '../src/ai/status-emblem-upgrade.js';
import { upgradeUniversalEnemies } from '../src/ai/universal-enemy-upgrade.js';
import { setTimeout as waitForFile } from 'node:timers/promises';
import { upgradeGameRules } from '../src/ai/game-rules-upgrade.js';
import { migrateTutorialWorldbook } from './worldbook-tutorial.mjs';
import { cleanCharacterEntries } from '../src/ai/character-cleanup.js';
import { migrateJourneyWorldbook } from './worldbook-journey.mjs';
import {
  splitGenerationWorldbook,
  tagGenerationWorldbook,
  retireGenerationExamples,
  deduplicateGenerationWorldbook,
  relaxScriptWorldbook,
  adaptExplorationWorldbook,
  characterGenerationSources,
} from './worldbook-generation.mjs';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  normalizeWorldbook,
  normalizeWorldSettings,
  newWorldEntry,
  characterWorldEntry,
} from '../src/ai/worldbook.js';
import { stripRetiredLore } from '../src/ai/retired-abilities.js';
import { officialCharacter } from '../src/ai/library.js';
import { tavernCanonText } from '../src/content/world.js';
import { TUTORIAL_DUNGEON } from '../src/content/official-dungeons.js';
import { MONSTER_LORE, monsterWorldbook } from '../src/content/monsters.js';
import { DEFINITIONS } from '../src/data.js';

/** Local JSON books and selection settings. Never reads the user's SillyTavern private data. */
export async function createWorldbookStore(directory) {
  const booksDirectory = path.join(directory, 'books');
  await mkdir(booksDirectory, { recursive: true });
  let writes = Promise.resolve();
  const write = (file, value) => {
    writes = writes
      .catch(() => {})
      .then(async () => {
        await writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
        for (let attempt = 0; ; attempt++) {
          try {
            await rename(file + '.tmp', file);
            break;
          } catch (failure) {
            if (
              process.platform !== 'win32' ||
              !['EPERM', 'EBUSY'].includes(failure.code) ||
              attempt >= 5
            )
              throw failure;
            await waitForFile(25 * 2 ** attempt);
          }
        }
      });
    return writes;
  };
  const fileFor = (id) => {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(id)) throw Error('世界书ID无效');
    return path.join(booksDirectory, id + '.json');
  };
  const initialized = await readFile(path.join(directory, 'settings.json')).then(
    () => true,
    (failure) => {
      if (failure.code !== 'ENOENT') throw failure;
      return false;
    },
  );
  try {
    await readFile(fileFor('tavern-canon'));
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    if (!initialized) {
      const content = tavernCanonText();
      await write(fileFor('tavern-canon'), {
        name: '万象酒馆 · 公共设定',
        entries: {
          0: {
            ...newWorldEntry(),
            comment: '酒馆与召唤的公共设定（可编辑）',
            content,
            constant: true,
            ignoreBudget: true,
            order: 1000,
          },
        },
      });
    }
  }
  let settings;
  try {
    settings = normalizeWorldSettings(
      JSON.parse(await readFile(path.join(directory, 'settings.json'), 'utf8')),
    );
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    settings = normalizeWorldSettings();
  }
  const contentVersionFile = path.join(directory, 'builtin-content.json');
  let contentVersion = 0;
  try {
    contentVersion = JSON.parse(await readFile(contentVersionFile, 'utf8')).version || 0;
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  if (contentVersion < 1) {
    const id = 'tavern-bestiary';
    try {
      await readFile(fileFor(id));
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
      const entries = Object.fromEntries(
        Object.keys(MONSTER_LORE).map((key, uid) => [
          uid,
          {
            ...newWorldEntry(uid),
            comment: DEFINITIONS[key].name,
            key: [key, DEFINITIONS[key].name],
            content: monsterWorldbook(key, DEFINITIONS[key].name),
            matchScenario: true,
            order: 200,
            preventRecursion: true,
          },
        ]),
      );
      await write(fileFor(id), { name: '副本怪物图鉴', entries });
    }
    if (!settings.script.includes(id)) settings.script.push(id);
    await write(path.join(directory, 'settings.json'), settings);
    await write(contentVersionFile, { version: 1 });
  } else if (!initialized) await write(path.join(directory, 'settings.json'), settings);
  let states;
  try {
    states = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    states = {};
  }
  async function get(id) {
    const raw = JSON.parse(await readFile(fileFor(id), 'utf8'));
    return { id, ...normalizeWorldbook(raw) };
  }
  async function list() {
    const result = [];
    for (const file of await readdir(booksDirectory)) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -5);
      try {
        const { book, warnings } = await get(id);
        result.push({ id, name: book.name, entries: Object.keys(book.entries).length, warnings });
      } catch (failure) {
        result.push({ id, name: id, invalid: true, warnings: [failure.message] });
      }
    }
    return result;
  }
  if (contentVersion < 2) {
    const entries = {};
    let uid = 0;
    for (const info of await list()) {
      if (info.invalid || info.id === 'tavern-world') continue;
      const { book } = await get(info.id);
      const targets = ['character', 'script'].filter(
        (kind) => settings.globalSelect.includes(info.id) || settings[kind].includes(info.id),
      );
      const bound = Object.entries(settings.bindings)
        .filter(([, books]) => books.includes(info.id))
        .map(([id]) => id);
      for (const entry of Object.values(book.entries)) {
        entries[uid] = {
          ...entry,
          uid,
          displayIndex: uid,
          apiTargets: entry.apiTargets.filter((kind) => targets.includes(kind) || bound.length > 0),
          ...(bound.length && !targets.length
            ? { characterFilter: { names: bound, tags: [], isExclude: false } }
            : {}),
          extensions: { ...entry.extensions, wanxiangSource: { book: info.id, uid: entry.uid } },
        };
        uid++;
      }
    }
    for (const kind of ['character', 'script']) {
      const content = await readFile(
        new URL(`../prompts/worldbook/${kind}.md`, import.meta.url),
        'utf8',
      );
      entries[uid] = {
        ...newWorldEntry(uid),
        comment: kind === 'character' ? '角色生成 · 设定与数据要求' : '副本剧本 · 事件推进与篇幅',
        content,
        constant: true,
        preventRecursion: true,
        ignoreBudget: true,
        position: 4,
        depth: 0,
        apiTargets: [kind],
        order: 900,
      };
      uid++;
      const example = await readFile(
        new URL(`../prompts/worldbook/${kind}-example.json`, import.meta.url),
        'utf8',
      );
      entries[uid] = {
        ...newWorldEntry(uid),
        comment: kind === 'character' ? '角色生成 · 完整格式示例' : '副本剧本 · 六站格式示例',
        content: example,
        constant: true,
        preventRecursion: true,
        ignoreBudget: true,
        position: 4,
        role: 2,
        depth: 1,
        apiTargets: [kind],
        order: 800,
      };
      uid++;
    }
    await write(fileFor('tavern-world'), { name: '万象酒馆世界书', entries });
    settings = {
      ...settings,
      globalSelect: ['tavern-world'],
      character: [],
      script: [],
      bindings: {},
    };
    await write(path.join(directory, 'settings.json'), settings);
    await write(contentVersionFile, { version: 2 });
  }
  if (contentVersion < 3) {
    try {
      const { book } = await get('tavern-world');
      await write(fileFor('tavern-world'), await splitGenerationWorldbook(book));
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 3 });
  }
  if (contentVersion < 4) {
    try {
      const { book } = await get('tavern-world');
      await write(fileFor('tavern-world'), await tagGenerationWorldbook(book));
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 4 });
  }
  if (contentVersion < 5) {
    try {
      const { book } = await get('tavern-world');
      await write(fileFor('tavern-world'), await retireGenerationExamples(book));
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 5 });
  }
  if (contentVersion < 6) {
    try {
      const { book } = await get('tavern-world');
      await write(fileFor('tavern-world'), await deduplicateGenerationWorldbook(book));
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 6 });
  }
  if (contentVersion < 7) {
    try {
      const { book } = await get('tavern-world');
      let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
      for (const key of ['crystalBeetle', 'cinderImp', 'tideJelly', 'bossTide']) {
        if (
          Object.values(book.entries).some(
            (entry) => entry.key.includes(key) || entry.comment === DEFINITIONS[key].name,
          )
        )
          continue;
        book.entries[uid] = {
          ...newWorldEntry(uid),
          comment: DEFINITIONS[key].name,
          key: [key, DEFINITIONS[key].name],
          content: monsterWorldbook(key, DEFINITIONS[key].name),
          matchScenario: true,
          order: 200,
          preventRecursion: true,
          apiTargets: ['script'],
          extensions: { wanxiang: { monsterId: key, apiTargets: ['script'] } },
        };
        uid++;
      }
      for (const entry of Object.values(book.entries))
        if (entry.extensions?.wanxiang?.generationRule === 'script-facts')
          entry.content = entry.content.replace(
            '地图建议仅ruins/forest',
            '地图建议仅ruins/forest/frost/forge/tide',
          );
      await write(fileFor('tavern-world'), book);
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 7 });
  }
  if (contentVersion < 8) {
    try {
      const { book } = await get('tavern-world');
      await write(fileFor('tavern-world'), await relaxScriptWorldbook(book));
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 8 });
  }
  if (contentVersion < 9) {
    try {
      const { book } = await get('tavern-world');
      const adapted = await adaptExplorationWorldbook(book);
      let uid = Math.max(-1, ...Object.keys(adapted.entries).map(Number)) + 1;
      const { HEROES } = await import('../src/data.js');
      const { OFFICIAL_SETTINGS } = await import('../src/content/official-characters.js');
      const { formatCharacterSetting } = await import('../src/ai/character-setting.js');
      for (const hero of HEROES) {
        const comment = `人物详情：${hero.name}`;
        if (
          Object.values(adapted.entries).some(
            (entry) =>
              entry.comment === comment ||
              entry.extensions?.wanxiang?.characterId === `official-${hero.id}`,
          )
        )
          continue;
        adapted.entries[uid] = characterWorldEntry(
          {
            id: `official-${hero.id}`,
            setting: {
              name: hero.name,
              worldbook: formatCharacterSetting(OFFICIAL_SETTINGS[hero.id]),
            },
          },
          uid,
        );
        uid++;
      }
      await write(fileFor('tavern-world'), adapted);
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 9 });
  }
  if (contentVersion < 10) {
    try {
      const { book } = await get('tavern-world');
      const { CHANGJING_YUEXI_SETTING } = await import('../src/content/changjing-yuexi.js');
      const { formatCharacterSetting } = await import('../src/ai/character-setting.js');
      const entry = Object.values(book.entries).find(
        (item) =>
          item.extensions?.wanxiang?.characterId === 'official-aegis' ||
          item.comment === '人物详情：格雷',
      );
      if (entry && (entry.comment === '人物详情：格雷' || /^姓名：格雷\s/m.test(entry.content))) {
        entry.comment = '人物详情：长景月汐';
        entry.content = formatCharacterSetting(CHANGJING_YUEXI_SETTING);
        await write(fileFor('tavern-world'), book);
      }
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 10 });
  }
  if (contentVersion < 11) {
    try {
      const { book } = await get('tavern-world');
      const reminder =
        '重点是旅程中事情的发展，不要把每段都写成战前准备或看见敌人的反应；敌人名单只是世界中存在的素材，无需逐一描写，按预设文风自然推进剧情即可。';
      const entry = Object.values(book.entries).find(
        (item) => item.extensions?.wanxiang?.generationRule === 'script-plot',
      );
      if (entry && !entry.content.includes(reminder)) {
        entry.content += '\n' + reminder;
        await write(fileFor('tavern-world'), book);
      }
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 11 });
  }
  if (contentVersion < 12) {
    try {
      const { book } = await get('tavern-world');
      const entry = Object.values(book.entries).find(
        (item) => item.extensions?.wanxiang?.generationRule === 'character-output',
      );
      if (entry) {
        entry.content = entry.content.replace(
          'setting必须且只能包含name/gender/age/appearance/profession/personality/history/attack/skills/ultimate。',
          'setting只允许name/gender/age/appearance/profession/personality/history/attack/skills/ultimate，其中age可选，其余字段必填。',
        );
        const reminder =
          '年龄age仅用于人物设定，可自由填写文字或数字，也可留空或省略；不要求纯数字，不限制年龄内容，不参与战斗计算。';
        if (!entry.content.includes(reminder)) entry.content += '\n' + reminder;
        await write(fileFor('tavern-world'), book);
      }
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 12 });
  }
  if (contentVersion < 13) {
    try {
      const { book } = await get('tavern-world');
      const manifest = JSON.parse(
        await readFile(new URL('../prompts/worldbook/entries.json', import.meta.url), 'utf8'),
      );
      for (const entry of Object.values(book.entries)) {
        const rule = entry.extensions?.wanxiang?.generationRule;
        if (rule?.startsWith('character-')) {
          const owned = manifest.find((definition) => definition.id === rule);
          if (owned) {
            const template = await readFile(
              new URL('../prompts/worldbook/' + rule + '.md', import.meta.url),
              'utf8',
            );
            const updated = template.split('\n');
            entry.content = entry.content
              .split('\n')
              .map((line) => {
                if (!/ultimate|quest|awakening|奥义|觉醒/.test(line)) return line;
                const replacement =
                  updated.find((candidate) => candidate.startsWith(line.slice(0, 5))) ||
                  (line.startsWith('setting必须')
                    ? updated.find((candidate) => candidate.startsWith('setting只允许'))
                    : null);
                return replacement || '';
              })
              .join('\n');
            const reminder =
              '不生成ultimate、quest、awakening字段；当前版本没有奥义或觉醒系统，只设计普攻和两个技能。';
            if (!entry.content.includes(reminder)) entry.content += '\n' + reminder;
          }
        } else if (
          entry.extensions?.wanxiang?.characterId ||
          entry.comment?.startsWith('人物详情：')
        )
          entry.content = stripRetiredLore(entry.content);
        if (entry.extensions?.wanxiang?.generationExample === 'character') {
          try {
            const raw = JSON.parse(
              entry.content.replace('<wanxiang_json>', '').replace('</wanxiang_json>', ''),
            );
            if (
              !Object.hasOwn(raw.setting || {}, 'ultimate') &&
              !Object.hasOwn(raw.data || {}, 'ultimate') &&
              !Object.hasOwn(raw.data || {}, 'quest')
            )
              continue;
            delete raw.setting?.ultimate;
            delete raw.data?.ultimate;
            delete raw.data?.quest;
            entry.content =
              '<wanxiang_json>\n' + JSON.stringify(raw, null, 2) + '\n</wanxiang_json>';
          } catch {
            /* Preserve non-JSON user examples as inactive references. */
          }
        }
      }
      if (
        !Object.values(book.entries).some(
          (entry) => entry.extensions?.wanxiang?.characterId === 'official-pandora',
        )
      ) {
        const uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
        book.entries[uid] = characterWorldEntry(officialCharacter('pandora'), uid);
      }
      await write(fileFor('tavern-world'), book);
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    await write(contentVersionFile, { version: 13 });
  }
  if (contentVersion < 14) {
    const { book } = await get('tavern-world');
    const uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
    book.entries[uid] = {
      ...characterWorldEntry({ id: '', setting: { name: '交流合理性审查', worldbook: '' } }, uid),
      comment: '交流合理性审查',
      constant: true,
      key: [],
      position: 4,
      role: 0,
      depth: 0,
      order: 9999,
      ignoreBudget: true,
      apiTargets: ['chat', 'quick-chat'],
      content: await readFile(
        new URL('../prompts/worldbook/chat-boundary.md', import.meta.url),
        'utf8',
      ),
      extensions: { wanxiang: { generationRule: 'chat-boundary' } },
    };
    await write(fileFor('tavern-world'), book);
    await write(contentVersionFile, { version: 14 });
  }
  if (contentVersion < 15) {
    const { book } = await get('tavern-world');
    let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
    const canon = Object.values(book.entries).filter(
      (entry) =>
        entry.extensions?.wanxiangSource?.book === 'tavern-canon' ||
        entry.comment === '酒馆与召唤的公共设定（可编辑）' ||
        entry.extensions?.wanxiang?.canon === 'tavern',
    );
    if (!canon.length) {
      book.entries[uid] = {
        ...newWorldEntry(uid),
        comment: '万象酒馆 · 基础设定',
        constant: true,
        ignoreBudget: true,
        order: 1000,
        extensions: { wanxiang: { canon: 'tavern' } },
      };
      canon.push(book.entries[uid++]);
    }
    for (const entry of canon) {
      entry.content = tavernCanonText();
      entry.apiTargets = ['character', 'script', 'chat', 'quick-chat', 'map', 'creation'];
      entry.extensions = {
        ...entry.extensions,
        wanxiang: { ...entry.extensions?.wanxiang, canon: 'tavern' },
      };
    }
    if (
      !Object.values(book.entries).some(
        (entry) => entry.extensions?.wanxiang?.characterId === 'official-edith',
      )
    ) {
      book.entries[uid] = {
        ...characterWorldEntry(officialCharacter('edith'), uid),
        key: ['伊蒂丝', 'Edith', '上一任酒馆主人', '坍缩过载'],
        apiTargets: ['character', 'script', 'chat', 'quick-chat', 'map', 'creation'],
      };
      uid++;
    }
    if (
      !Object.values(book.entries).some(
        (entry) => entry.extensions?.wanxiang?.officialDungeonId === TUTORIAL_DUNGEON.id,
      )
    ) {
      book.entries[uid] = {
        ...newWorldEntry(uid),
        comment: `官设副本：${TUTORIAL_DUNGEON.name}`,
        key: [TUTORIAL_DUNGEON.key],
        matchScenario: true,
        ignoreBudget: true,
        preventRecursion: true,
        excludeRecursion: true,
        order: 850,
        apiTargets: ['script'],
        content: TUTORIAL_DUNGEON.outline,
        extensions: { wanxiang: { officialDungeonId: TUTORIAL_DUNGEON.id } },
      };
    }
    for (const entry of Object.values(book.entries)) {
      if (entry.extensions?.wanxiang?.generationRule !== 'character-output') continue;
      entry.content = entry.content
        .replace(
          '主动技能仅含text/ap/mp/target/effects',
          '主动技能含text/ap/mp/target/effects；需要消耗生命时可额外填写hp（1～20整数，生命必须大于消耗）',
        )
        .replace(
          'damage/heal/shield/selfHeal只含type/value',
          'damage/heal/shield/selfHeal/selfMana只含type/value；selfMana回复施法者法力，不超过法力上限',
        );
    }
    await write(fileFor('tavern-world'), book);
    const original = await get('tavern-canon').catch(() => null);
    if (original) {
      for (const entry of Object.values(original.book.entries)) entry.content = tavernCanonText();
      await write(fileFor('tavern-canon'), original.book);
    }
    await write(contentVersionFile, { version: 15 });
  }
  if (contentVersion < 16) {
    const source = await readFile(
      new URL('../prompts/worldbook/script-output.md', import.meta.url),
      'utf8',
    );
    const heading = '【中文输出与首尾篇幅】';
    const start = source.indexOf(heading);
    const end = source.indexOf('【本次任务与示例边界】', start);
    if (start < 0 || end < 0) throw Error('剧本中文与首尾篇幅提示词段落缺失');
    const guidance = source.slice(start, end).trim();
    const { book } = await get('tavern-world');
    for (const entry of Object.values(book.entries)) {
      if (
        entry.extensions?.wanxiang?.generationRule !== 'script-output' ||
        entry.content.includes(heading)
      )
        continue;
      const anchor = entry.content.indexOf('本次动态JSON Schema：');
      entry.content =
        anchor < 0
          ? `${entry.content}\n\n${guidance}\n`
          : `${entry.content.slice(0, anchor)}${guidance}\n\n${entry.content.slice(anchor)}`;
    }
    await write(fileFor('tavern-world'), book);
    await write(contentVersionFile, { version: 16 });
  }
  if (contentVersion < 17) {
    const source = await readFile(
      new URL('../prompts/worldbook/script-output.md', import.meta.url),
      'utf8',
    );
    const heading = '【大纲推进与场次安排】';
    const start = source.indexOf(heading);
    const end = source.indexOf('【本次任务与示例边界】', start);
    if (start < 0 || end < 0) throw Error('剧本大纲推进提示词段落缺失');
    const pacing = source.slice(start, end).trim();
    const oldTail =
      '第一段增加进入副本、环境铺陈、人物交流和事件起因的细节；第六段仍在最终Boss获胜后展示，增加战后反应、任务收束、人物互动与返程或后续伏笔。扩写应增加有效内容，不重复段落凑字数，也不改变六场战斗和正文展示时点。';
    const oldIntro =
      '叙述使用第三人称，主角统一写作<user>。这是需要沿着扩写的剧情大纲，保留人物、线索与事件的先后关系；文风与细节由当前预设决定。扩写为六段正文，战斗名单、场次、胜负和已发生事实以本次请求的数据为准。';
    const { book } = await get('tavern-world');
    for (const entry of Object.values(book.entries)) {
      if (entry.extensions?.wanxiang?.generationRule === 'script-output') {
        entry.content = entry.content.replace(
          oldTail,
          '首尾加长只影响文本量，不限定各段必须描写哪些大纲事件；扩写增加有效内容，不重复凑字数，不改变六场战斗和正文展示时点。',
        );
        if (!entry.content.includes(heading)) {
          const anchor = entry.content.indexOf('本次动态JSON Schema：');
          entry.content =
            anchor < 0
              ? `${entry.content}\n\n${pacing}\n`
              : `${entry.content.slice(0, anchor)}${pacing}\n\n${entry.content.slice(anchor)}`;
        }
      }
      if (entry.extensions?.wanxiang?.officialDungeonId === TUTORIAL_DUNGEON.id) {
        entry.content = entry.content
          .replace(oldIntro, TUTORIAL_DUNGEON.outline.split('\n')[1])
          .replace(/\r?\n\r?\n(?=遗迹门口|<user>与潘多拉清理|两人看壁画|为了继续深入)/gu, '');
      }
    }
    await write(fileFor('tavern-world'), book);
    await write(contentVersionFile, { version: 17 });
  }
  if (contentVersion < 18) {
    const { book } = await get('tavern-world');
    for (const kind of ['character', 'script']) {
      const template = await readFile(
        new URL(`../prompts/worldbook/${kind}-output.md`, import.meta.url),
        'utf8',
      );
      const heading = '【输出标签唯一性】';
      const reminder = template.match(/【输出标签唯一性】[\s\S]*?(?=\n\n|$)/u)?.[0];
      if (!reminder) throw Error('输出标签唯一性提示词缺失');
      for (const entry of Object.values(book.entries)) {
        if (entry.extensions?.wanxiang?.generationRule !== `${kind}-output`) continue;
        entry.content = entry.content.replace(
          'JSON字段名、标签名、<user>占位符、程序规定的ID与map等枚举值保持原样，不翻译、不改写。',
          'JSON字段名、标签名、程序规定的ID与map等枚举值保持原样，不翻译、不改写。大纲中的<user>是设定代称，生成正文时按玩家主角实际姓名与设定自然称呼。',
        );
        if (!entry.content.includes(heading)) entry.content += `\n\n${reminder}\n`;
      }
    }
    for (const entry of Object.values(book.entries)) {
      if (entry.extensions?.wanxiang?.officialDungeonId !== TUTORIAL_DUNGEON.id) continue;
      entry.content = entry.content.replace(
        '叙述使用第三人称，主角统一写作<user>。',
        '大纲以第三人称改写，<user>仅在本大纲中代指玩家创建的主角；生成正文时按该主角的实际姓名、设定与自然称呼叙述，不照抄代称。',
      );
    }
    if (
      !Object.values(book.entries).some(
        (entry) => entry.extensions?.wanxiang?.generationRule === 'script-player',
      )
    ) {
      const uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
      book.entries[uid] = {
        ...newWorldEntry(uid),
        comment: '副本剧本 · 玩家主角与大纲代称',
        constant: true,
        preventRecursion: true,
        ignoreBudget: true,
        order: 1150,
        apiTargets: ['script'],
        content: await readFile(
          new URL('../prompts/worldbook/script-player.md', import.meta.url),
          'utf8',
        ),
        extensions: { wanxiang: { generationRule: 'script-player' } },
      };
    }
    await write(fileFor('tavern-world'), book);
    await write(contentVersionFile, { version: 18 });
  }
  if (contentVersion < 19) {
    const { book } = await get('tavern-world');
    const example = JSON.parse(
      await readFile(new URL('../prompts/worldbook/script-example.json', import.meta.url), 'utf8'),
    );
    const template = await readFile(
      new URL('../prompts/worldbook/script-output.md', import.meta.url),
      'utf8',
    );
    const protocol = template.slice(0, template.indexOf('【中文输出与首尾篇幅】')).trim();
    for (const entry of Object.values(book.entries)) {
      if (entry.extensions?.wanxiang?.generationExample === 'script') {
        try {
          const raw = JSON.parse(
            entry.content.replace(/^\s*<wanxiang_json>\s*|\s*<\/wanxiang_json>\s*$/g, ''),
          );
          if (
            raw.schemaVersion === 3 &&
            raw.data?.title === example.data.title &&
            JSON.stringify(raw.story) === JSON.stringify(example.story)
          )
            entry.content = `<wanxiang_json>\n${JSON.stringify(example, null, 2)}\n</wanxiang_json>`;
        } catch {
          /* Preserve user-written example prose. */
        }
      }
      if (entry.extensions?.wanxiang?.generationRule === 'script-output') {
        const end = entry.content.indexOf('【中文输出与首尾篇幅】');
        const start = entry.content.indexOf('【副本剧本输出格式');
        entry.content =
          start >= 0 && end > start
            ? `${entry.content.slice(0, start)}${protocol}\n\n${entry.content.slice(end)}`
            : `${protocol}\n\n${entry.content}`;
        entry.content = entry.content.replace(
          '标题、概要、环境、标签文案、NPC设定和后续伏笔',
          '标题、关键词、NPC外貌与经历、道具描述和后续伏笔',
        );
      }
    }
    const uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
    book.entries[uid] = {
      ...newWorldEntry(uid),
      comment: '酒馆规则：以太与物资折算',
      constant: true,
      content:
        '从副本中获得的所有物资都会在完整通关后折算成相同价值的以太。以太是酒馆内用于兑换的货币，装备兑换功能将另行开放。剧情道具与NPC归档不直接改变战斗属性、装备或技能；酒馆交流不能凭空产生以太。',
      apiTargets: ['script', 'chat', 'quick-chat'],
      extensions: { wanxiang: { currencyRule: 'ether' } },
    };
    await write(fileFor('tavern-world'), book);
    await write(contentVersionFile, { version: 19 });
  }
  if (contentVersion < 20) {
    const { book } = await get('tavern-world');
    await write(fileFor('tavern-world'), migrateJourneyWorldbook(book));
    await write(contentVersionFile, { version: 20 });
  }
  if (contentVersion < 21) {
    for (const { id } of await list()) {
      const { book } = await get(id);
      await write(
        fileFor(id),
        migrateTutorialWorldbook(book, { includeOutlines: id === 'tavern-world' }),
      );
    }
    await write(contentVersionFile, { version: 21 });
  }
  if (contentVersion < 22) {
    const { book } = await get('tavern-world');
    const uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
    book.entries[uid] = {
      ...newWorldEntry(uid),
      comment: '角色生成 · 稀有度数值与等级成长',
      constant: true,
      ignoreBudget: true,
      order: 650,
      apiTargets: ['character'],
      content: await readFile(
        path.join(process.cwd(), 'prompts/worldbook/growth-numbers.md'),
        'utf8',
      ),
      extensions: { wanxiang: { generationRule: 'character-numbers' } },
    };
    const archiveRules =
      '【地图归档物品复用】' +
      (
        await readFile(path.join(process.cwd(), 'prompts/worldbook/script-output.md'), 'utf8')
      ).split('【地图归档物品复用】')[1];
    for (const entry of Object.values(book.entries)) {
      if (
        entry.extensions?.wanxiang?.generationRule === 'script-output' &&
        !entry.content.includes('【地图归档物品复用】')
      )
        entry.content += '\n\n' + archiveRules;
      if (entry.extensions?.wanxiang?.generationRule)
        entry.content = entry.content.replaceAll('行动后流血', '行动前流血');
    }
    await write(fileFor('tavern-world'), book);
    await write(contentVersionFile, { version: 22 });
  }
  if (contentVersion < 23) {
    const marker = '【装备与被动统一事件规则】';
    const protocol = await readFile(
      path.join(process.cwd(), 'prompts/worldbook/character-output.md'),
      'utf8',
    );
    for (const { id } of await list()) {
      const { book } = await get(id);
      for (const entry of Object.values(book.entries)) {
        if (entry.extensions?.wanxiang?.generationRule !== 'character-output') continue;
        entry.content = entry.content.replace(
          '被动技能仅采用Schema允许的四种形状',
          '被动技能使用Schema允许的统一rules结构或旧四种兼容形状',
        );
        if (!entry.content.includes(marker))
          entry.content += '\n\n' + marker + protocol.split(marker)[1];
      }
      await write(fileFor(id), book);
    }
    await write(contentVersionFile, { version: 23 });
  }
  if (contentVersion < 24) {
    const { book } = await get('tavern-world');
    const removed = cleanCharacterEntries(book);
    // A cleanup record is outside the active books directory and is never injected into AI requests.
    await write(path.join(directory, 'character-cleanup-2026-10-19.json'), {
      date: new Date().toISOString(),
      reason: '用户要求仅保留主角、伊蒂丝、长景月汐、潘多拉的人设',
      entries: removed,
    });
    await write(fileFor('tavern-world'), book);
    await write(contentVersionFile, { version: 24 });
  }
  if (contentVersion < 26) {
    const { book } = await get('tavern-world');
    await write(path.join(directory, 'world-before-game-rules-v26.json'), book);
    await write(fileFor('tavern-world'), upgradeGameRules(book));
    await write(contentVersionFile, { version: 26 });
  }
  if (contentVersion < 27) {
    const { book } = await get('tavern-world');
    const content = {};
    for (const kind of ['map', 'creation'])
      content[kind] = await readFile(
        new URL(`../prompts/worldbook/${kind}-output.md`, import.meta.url),
        'utf8',
      );
    await write(fileFor('tavern-world'), upgradeAssetWorldbook(book, content));
    await write(contentVersionFile, { version: 27 });
  }
  if (contentVersion < 28) {
    const guidance = await readFile(
      new URL('../prompts/worldbook/protagonist-strength.md', import.meta.url),
      'utf8',
    );
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeProtagonistRules(record.book, guidance));
    await write(contentVersionFile, { version: 28 });
  }

  if (contentVersion < 29) {
    const guidance = await readFile(
      new URL('../prompts/worldbook/battle-display.md', import.meta.url),
      'utf8',
    );
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeBattleDisplayRules(record.book, guidance));
    await write(contentVersionFile, { version: 29 });
  }
  if (contentVersion < 30) {
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeRuinsWorldbook(record.book));
    await write(contentVersionFile, { version: 30 });
  }
  if (contentVersion < 31) {
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeTutorialRevision(record.book));
    await write(contentVersionFile, { version: 31 });
  }
  if (contentVersion < 32) {
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeEnemyAppearanceRules(record.book));
    await write(contentVersionFile, { version: 32 });
  }
  if (contentVersion < 33) {
    const record = await get('tavern-world');
    await write(
      fileFor('tavern-world'),
      upgradeCharacterGeneration(record.book, await characterGenerationSources()),
    );
    await write(contentVersionFile, { version: 33 });
  }
  if (contentVersion < 34) {
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeContinuityRules(record.book));
    await write(contentVersionFile, { version: 34 });
  }
  if (contentVersion < 35) {
    const record = await get('tavern-world');
    const creation = await readFile(
      new URL('../prompts/worldbook/creation-output.md', import.meta.url),
      'utf8',
    );
    await write(fileFor('tavern-world'), upgradeGenerationExperience(record.book, creation));
    await write(contentVersionFile, { version: 35 });
  }
  if (contentVersion < 36) {
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeStatusEmblems(record.book));
    await write(contentVersionFile, { version: 36 });
  }
  if (contentVersion < 37) {
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeUniversalEnemies(record.book));
    await write(contentVersionFile, { version: 37 });
  }
  if (contentVersion < 38) {
    const record = await get('tavern-world');
    const content = await readFile(
      new URL('../prompts/worldbook/character-complexity.md', import.meta.url),
      'utf8',
    );
    await write(fileFor('tavern-world'), upgradeCharacterConstraints(record.book, content));
    await write(contentVersionFile, { version: 38 });
  }
  if (contentVersion < 39) {
    const record = await get('tavern-world');
    await write(fileFor('tavern-world'), upgradeForestWorldbook(record.book));
    await write(contentVersionFile, { version: 39 });
  }
  return {
    get,
    list,
    async visible() {
      return {
        books: (await list()).filter((book) => book.id === 'tavern-world'),
        settings: structuredClone(settings),
      };
    },
    async save({ id = `world-${randomUUID()}`, book }) {
      const result = normalizeWorldbook(book);
      let changed = true;
      try {
        changed = JSON.stringify((await get(id)).book) !== JSON.stringify(result.book);
      } catch (failure) {
        if (failure.code !== 'ENOENT') throw failure;
      }
      await write(fileFor(id), result.book);
      // Edited entries get a fresh timer state, matching a changed ST entry hash.
      if (changed) {
        states = {};
        await write(path.join(directory, 'state.json'), states);
      }
      return { id, ...result };
    },
    async configure(value) {
      const next = normalizeWorldSettings(value);
      const ids = [
        ...next.globalSelect,
        ...next.character,
        ...next.script,
        ...next.chat,
        ...next['quick-chat'],
        ...Object.values(next.bindings).flat(),
      ];
      for (const id of new Set(ids)) await get(id);
      await write(path.join(directory, 'settings.json'), next);
      settings = next;
      return structuredClone(settings);
    },
    async delete(id) {
      await unlink(fileFor(id));
      for (const field of [
        'globalSelect',
        'character',
        'script',
        'chat',
        'quick-chat',
        'map',
        'creation',
      ])
        settings[field] = settings[field].filter((value) => value !== id);
      for (const key of Object.keys(settings.bindings))
        settings.bindings[key] = settings.bindings[key].filter((value) => value !== id);
      await write(path.join(directory, 'settings.json'), settings);
    },
    async resolve(kind, input, override) {
      const current = override?.settings
        ? normalizeWorldSettings(override.settings)
        : structuredClone(settings);
      const bindingIds = (input.party || []).flatMap((entry) => current.bindings[entry.id] || []);
      const ids = [...new Set([...current.globalSelect, ...(current[kind] || []), ...bindingIds])];
      const books = [];
      for (const id of ids) {
        const value = override?.id === id ? normalizeWorldbook(override.book) : await get(id);
        const bookCopy = structuredClone(value.book);
        if (id === 'tavern-world' && Array.isArray(input.party)) {
          let nextUid = Math.max(-1, ...Object.keys(bookCopy.entries).map(Number)) + 1;
          for (const member of input.party) {
            const name = member.name || member.setting?.name;
            if (!name) continue;
            const existing = Object.values(bookCopy.entries).find(
              (entry) =>
                entry.comment === `人物详情：${name}` ||
                (member.id && entry.extensions?.wanxiang?.characterId === member.id),
            );
            if (!existing) {
              bookCopy.entries[nextUid] = characterWorldEntry(
                {
                  id: member.id,
                  setting: { name, worldbook: member.worldbook || member.setting?.worldbook || '' },
                },
                nextUid,
              );
              nextUid++;
            }
          }
        }
        books.push({ ...bookCopy, id });
      }
      return { books, settings: current, state: structuredClone(states[kind] || {}) };
    },
    async commit(kind, nextState, expectedStep) {
      if (Number(states[kind]?.step || 0) !== expectedStep) return false;
      states[kind] = nextState;
      await write(path.join(directory, 'state.json'), states);
      return true;
    },
  };
}
