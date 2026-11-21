import { createGenerationSettingsView } from './generation-settings-view.js';
import { explorationSpec } from '../exploration.js';
import { isQuestRecruit } from '../summoning.js';
import { needsContinuationWorld } from '../continuation-world.js';
import {
  validateServiceAccount,
  readServiceAccount,
  serviceAccountBase,
} from '../ai/vertex-service-account.js';
import { DEFINITIONS } from '../data.js';
import { routeKey } from '../worlds.js';
import { nextArcPhase } from '../story-arc.js';
import { adventureTestScript } from '../content/generation-mode.js';
import { cleanLibraryCharacters } from '../ai/character-cleanup.js';
import { relevantArchives } from '../archives.js';
import {
  GENERATION_OPTIONS_KEY,
  restoreGenerationOptions,
  generationEnabled,
} from '../generation-options.js';
import { defaultProtagonist } from '../content/qingyuan.js';

import { newBattle, preview } from '../engine.js';
import { compileRoster, purgeLegacyRuinsProgress, restoreLibrary } from '../ai/library.js';
import {
  normalizeCharacter,
  normalizeScript,
  settingOnly,
  characterWorldbook,
} from '../ai/contracts.js';

import { query as $ } from './dom.js';
import { createStoryFeed } from './story.js';
import { recollectionScript } from '../recollections.js';
import { currentEncounterSpec } from '../expedition.js';
import { ENCOUNTER_COUNT } from '../content/journey-rules.js';
import { createModelPicker } from './model-picker.js';
import { createAiPresetEditor } from './ai-presets.js';
import { createGenerationDiagnostics } from './generation-diagnostics.js';
import { createWorldbookEditor } from './worldbook-editor.js';
import { syncSummaryWorldbook, syncArchivedNpcEntries } from '../ai/journey-memory-worldbook.js';
import {
  characterWorldEntry,
  characterEntryCategory,
  classifyCharacterEntry,
} from '../ai/worldbook.js';
import { characterSheet } from './character-sheet.js';
import { scriptRepetitionWarnings } from '../ai/script-prose.js';
import { applyGeneratedReset, restoreGeneratedRecovery } from './generated-reset.js';
import { completeExploration } from '../exploration.js';
import { REGIONS } from '../content/regions.js';
import { assignParty, firstCompanion } from '../campaign.js';
import { archiveTavernPrelude, gameTime, memoryHistory, tavernPrelude } from '../memory.js';
import { developerOption } from '../generation-options.js';
import { prepareSwapLesson } from '../companion-events.js';
import { rearUnlocked } from '../formation-access.js';
import { npcSummonStatus } from '../summoning.js';
import { syncGenerationLoadingChrome } from '../shared/scene-loading.js';
import { GAME_LIBRARY_KEY as libraryKey } from '../storage/checkpoint.js';

export function createGeneration(context) {
  const storage = context.storage || localStorage;
  const { session, events, departure } = context;
  let request = null,
    equipmentPreparation = null,
    profiles = null,
    pendingPortal = null,
    pendingSummon = null,
    summoned = null,
    editedLore = null;
  try {
    if (!storage.getItem(libraryKey)) storage.setItem('wanxiang.creation-pending.v1', 'true');
    session.runtime.needsStart = storage.getItem('wanxiang.creation-pending.v1') === 'true';
    if (!context.apiClient.staticMode) applyGeneratedReset(storage);
    session.ai.library = restoreLibrary(JSON.parse(storage.getItem(libraryKey)));
    if (purgeLegacyRuinsProgress(session.ai.library))
      storage.setItem(libraryKey, JSON.stringify(session.ai.library));
  } catch {
    /* Retain the seeded official pool. */
  }
  const library = () => session.ai.library;
  const {
    renderDeveloperOptions,
    render,
    setTab,
    renderTransport,
    renderCredentialRetention,
    renderProvider,
  } = createGenerationSettingsView({
    context,
    library,
    storage,
    getPendingPortal: () => pendingPortal,
  });

  renderDeveloperOptions();
  function setOption(key, value) {
    const next = restoreGenerationOptions({
      ...session.ai.generationOptions,
      [key]: Boolean(value),
    });
    try {
      storage.setItem(GENERATION_OPTIONS_KEY, JSON.stringify(next));
    } catch {
      renderDeveloperOptions();
      status('浏览器无法保存选项，请检查本地存储空间。');
      return false;
    }
    session.ai.generationOptions = next;
    renderDeveloperOptions();
    context.onboarding?.generationModeChanged();
    context.onboarding?.refresh();
    context.shell.syncInnVisitors();
    status('游戏选项已保存。');
    return true;
  }
  for (const checkbox of document.querySelectorAll('[data-generation-option]')) {
    const key = checkbox.dataset.generationOption;
    checkbox.checked = session.ai.generationOptions[key];
    events.on(checkbox, 'change', () => {
      if (!setOption(key, checkbox.checked)) {
        checkbox.checked = session.ai.generationOptions[key];
      }
    });
  }
  const party = () =>
    library()
      .party.filter(Boolean)
      .map((id) => library().characters.find((entry) => entry.id === id));
  function status(text) {
    $('#ai-status').textContent = text;
  }
  function save() {
    context.summoning?.refresh();
    context.shell.syncInnVisitors();
    try {
      syncSummaryWorldbook(library());
      if (context.checkpoint) context.checkpoint.saveLibrary();
      else storage.setItem(libraryKey, JSON.stringify(library()));
      context.saves?.autoSave?.('游戏进度保存');
      return true;
    } catch {
      status('浏览器存储空间不足，请导出世界书后整理');
      return false;
    }
  }
  const story = createStoryFeed(session, save, context.gal, context.chapterTheater);
  function installRoster() {
    session.battle.state = newBattle(undefined, compileRoster(library()));
    session.battle.forecast = preview(session.battle.state, []);
  }
  installRoster();
  const api = (path, data, signal) => context.apiClient.request(path, data, { signal });
  let worldbookQueue = Promise.resolve();
  function queueWorldbookTask(task, owner = library()) {
    const isCurrent = () => !session.runtime.disposed && library() === owner;
    const result = worldbookQueue.then(() => (isCurrent() ? task(isCurrent) : undefined));
    // Advance the queue even when the caller must report a failed request.
    worldbookQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  function syncWorldbookCharacters() {
    const owner = library();
    return queueWorldbookTask(async (isCurrent) => {
      const response = await api('worldbooks/tavern-world');
      if (!isCurrent() || !response?.book?.entries) return;
      const book = response.book;
      const retired = new Set(book.extensions?.wanxiang?.characterCleanup?.removedIds || []);
      if (cleanLibraryCharacters(owner, retired)) {
        save();
        if (session.runtime.mode === 'inn') {
          installRoster();
          context.shell?.renderParty();
          render();
        }
      }
      let nextUid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
      let dirty = false;
      for (const char of owner.characters) {
        if (retired.has(char.id) && char.id !== owner.campaign?.protagonistId) continue;
        const name = char.setting?.name;
        if (!name) continue;
        const entry = Object.values(book.entries).find(
          (item) =>
            item.comment === `人物详情：${name}` ||
            item.extensions?.wanxiang?.characterId === char.id,
        );
        if (entry) {
          const classified = classifyCharacterEntry(entry, char, owner.campaign?.protagonistId);
          if (JSON.stringify(classified) !== JSON.stringify(entry)) {
            Object.assign(entry, classified);
            dirty = true;
          }
        }
        if (!entry) {
          book.entries[nextUid] = characterWorldEntry(char, nextUid, owner.campaign?.protagonistId);
          nextUid++;
          dirty = true;
        } else if (
          entry.content &&
          entry.content.trim() &&
          entry.content !== char.setting?.worldbook
        ) {
          char.setting.worldbook = entry.content;
          char.setting.edited = true;
          save();
        }
      }
      if (syncArchivedNpcEntries(book, owner.archives?.npcs)) {
        dirty = true;
      }
      if (dirty) {
        await api('worldbooks/save', { id: 'tavern-world', book });
      }
    }, owner).catch((failure) => {
      if (!session.runtime.disposed && library() === owner) status(failure.message);
    });
  }
  void syncWorldbookCharacters();

  function showBook(value) {
    if (!value) return;
    $('#ai-lore-editor').hidden = !value.combat;
    $('#ai-preview').hidden = !!value.combat;
    if (value.combat) {
      editedLore = value.id;
      $('#ai-preview').textContent = characterWorldbook(value);
      $('#ai-lore-text').value = characterWorldbook(value);
      $('#ai-lore-tags').value = JSON.stringify(value.setting.tags || []);
    } else {
      const records = library().history.filter((item) => item.title === value.title);
      $('#ai-preview').textContent = [
        value.title,
        value.setting,
        ...records.flatMap((record) => record.lines.map((line) => `${line.speaker}：${line.text}`)),
      ].join('\n\n');
    }
  }

  events.on($('#ai-rememberKey'), 'change', renderCredentialRetention);
  events.on($('#ai-requestMode'), 'change', renderCredentialRetention);
  events.on($('#ai-requestMode'), 'change', renderTransport);

  events.on($('#ai-provider'), 'change', () => {
    if (
      $('#ai-provider').value === 'vertex' &&
      $('#ai-baseUrl').value === 'https://api.openai.com/v1'
    )
      $('#ai-baseUrl').value = 'https://aiplatform.googleapis.com/v1';
    if ($('#ai-provider').value === 'vertex') $('#ai-vertexAuth').value = 'service-account';
    renderProvider();
  });
  events.on($('#ai-baseUrl'), 'input', renderProvider);
  events.on($('#ai-vertexAuth'), 'change', renderProvider);
  events.on($('#ai-service-import'), 'click', () => $('#ai-service-file').click());
  events.on($('#ai-service-file'), 'change', async () => {
    const file = $('#ai-service-file').files[0];
    if (!file) return;
    if (file.size > 20000) {
      $('#ai-service-status').textContent = 'JSON 文件过大';
      return;
    }
    $('#ai-service-account').value = await file.text();
    $('#ai-service-file').value = '';
    $('#ai-service-validate').click();
  });
  events.on($('#ai-service-validate'), 'click', async () => {
    try {
      const account = await validateServiceAccount($('#ai-service-account').value);
      $('#ai-baseUrl').value = serviceAccountBase(
        account.project,
        $('#ai-vertexLocation').value.trim() || 'global',
      );
      $('#ai-service-status').textContent = `JSON 有效 · 项目 ${account.project} · 保存连接后生效`;
    } catch (failure) {
      $('#ai-service-status').textContent = failure.message;
    }
  });
  function fillProfile() {
    const profile = profiles?.[$('#ai-kind').value];
    if (!profile) return;
    for (const key of [
      'baseUrl',
      'provider',
      'vertexAuth',
      'model',
      'maxTokens',
      'tokenField',
      'promptProcessing',
      'requestMode',
    ])
      $(`#ai-${key}`).value = String(profile[key] ?? (key === 'requestMode' ? 'local' : ''));
    renderTransport();
    renderProvider();
    modelPicker.clear();
    for (const key of ['jsonMode', 'rememberKey']) $(`#ai-${key}`).checked = profile[key];
    renderCredentialRetention();
    $('#ai-jsonMode').disabled = false;
    $('#ai-key').value = '';
    $('#ai-service-account').value = '';
    $('#ai-service-account').placeholder = profile.hasApiKey
      ? '已配置服务账号；留空保持，不回显私钥'
      : '粘贴完整服务账号 JSON';
    $('#ai-vertexLocation').value = profile.vertexLocation || 'global';
    $('#ai-service-status').textContent = profile.vertexProject
      ? `项目 ${profile.vertexProject}`
      : '';
    $('#ai-key').placeholder =
      profile.requestMode === 'browser'
        ? context.apiClient.hasCredential($('#ai-kind').value, profile)
          ? context.apiClient.staticMode && profile.rememberKey
            ? '已在此设备记住；留空保持'
            : '本页已输入，留空保持；刷新后清除'
          : '请重新输入直连密钥；不会读取本机保存的Key'
        : profile.hasApiKey
          ? '已配置，留空保持；不回显密钥'
          : '本地免密模型可留空';
    $('#ai-clear-key').checked = false;
    $('#ai-strictJson').checked = profile.strictJson === true;
    $('#ai-strictJson').disabled = false;
    $('#ai-summary-context').hidden = !$('#ai-kind').value === 'summary';
    $('#ai-contextSize').value = String(profile.contextSize || 131072);
    presetEditor.syncProfile();
  }
  async function open(notice = '', kind) {
    if (!['inn', 'event'].includes(session.runtime.mode)) return;
    if ($('#destination-dialog')?.open) $('#destination-dialog').close();
    render();
    setTab('settings');
    context.gal?.suspendForModal($('#ai-dialog'));
    if (!$('#ai-dialog').open) $('#ai-dialog').showModal();
    const controls = [
      ...document.querySelectorAll(
        '[data-ai-page="settings"] input, [data-ai-page="settings"] select, [data-ai-page="settings"] button',
      ),
    ].map((element) => ({ element, disabled: element.disabled }));
    for (const { element } of controls) element.disabled = true;
    status('正在读取连接设置…');
    try {
      profiles = await api('config');
      if (kind) $('#ai-kind').value = kind === 'quick-chat' ? 'chat' : kind;
      await presetEditor.refresh();
      fillProfile();
      status(typeof notice === 'string' ? notice : '');
    } catch (failure) {
      status(failure.message);
    } finally {
      for (const { element, disabled } of controls) element.disabled = disabled;
      renderTransport();
    }
  }
  function captureProfile() {
    const data = {
      kind: $('#ai-kind').value,
      apiKey: $('#ai-key').value,
      clearKey: $('#ai-clear-key').checked,
    };
    for (const key of [
      'baseUrl',
      'model',
      'tokenField',
      'promptProcessing',
      'requestMode',
      'provider',
      'vertexAuth',
    ])
      data[key] = $(`#ai-${key}`).value;
    data.maxTokens = Number($('#ai-maxTokens').value);
    data.temperature = profiles?.[data.kind]?.temperature ?? null;
    if (data.kind === 'summary') data.contextSize = Number($('#ai-contextSize').value);
    for (const key of ['jsonMode', 'rememberKey', 'strictJson'])
      data[key] = $(`#ai-${key}`).checked;
    if (data.vertexAuth === 'service-account' && !$('#ai-service-account-fields').hidden) {
      data.apiKey = $('#ai-service-account').value.trim();
      data.vertexLocation = $('#ai-vertexLocation').value.trim() || 'global';
      data.vertexProject = data.apiKey
        ? readServiceAccount(data.apiKey).project_id
        : profiles?.[data.kind]?.vertexProject || '';
      if (data.vertexProject)
        data.baseUrl = serviceAccountBase(data.vertexProject, data.vertexLocation);
    }
    if (data.requestMode === 'browser' && !context.apiClient.staticMode) {
      if (data.clearKey || data.apiKey.trim())
        context.apiClient.setCredential(data.kind, data, data.clearKey ? '' : data.apiKey.trim());
      data.apiKey = '';
      data.rememberKey = false;
    }
    return data;
  }
  async function saveProfile() {
    const pendingName = $('#api-preset-name').value;
    profiles = await api('config', captureProfile());
    fillProfile();
    $('#api-preset-name').value = pendingName;
    status(
      profiles[$('#ai-kind').value].requestMode === 'browser' &&
        !profiles[$('#ai-kind').value].rememberKey
        ? '当前连接仅本次有效，密钥没有写入设备。点击“长期保存此连接”可在重启后继续使用。'
        : '当前连接已保存到此设备，更新或正常重启后可继续使用；普通备份不包含密钥。',
    );
  }
  function ready(profile, kind) {
    if (!profile?.model?.trim()) return false;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(profile.baseUrl).hostname);
    return (
      local ||
      (profile.requestMode === 'browser'
        ? context.apiClient.hasCredential(kind, profile)
        : profile.hasApiKey)
    );
  }
  function scriptInput() {
    const node = session.journey.selectedNode;
    const route = node ? library().exploration[routeKey(node)] : null;
    return {
      tavernPrelude: tavernPrelude(library()),
      journeyContinuationIds: (route?.history || [])
        .slice(-3)
        .map(({ runId }) => `dungeon:${runId}`),
      visitId: crypto.randomUUID(),
      storyArc: {
        phase: nextArcPhase(
          library()
            .history.filter((record) => record.complete && (!node || record.map === routeKey(node)))
            .at(-1)?.nextHook,
        ),
      },
      archiveContext: relevantArchives(
        library(),
        [
          $('#ai-script-brief').value,
          session.ai.scriptGuidance,
          node?.continuation,
          ...library()
            .tavernChat.slice(-6)
            .map((item) => item.content),
        ]
          .filter(Boolean)
          .join('\n'),
        node ? routeKey(node) : 'ruins',
      ),
      previousStories: library()
        .scripts.filter(
          (book) => !node || (book.exploration && routeKey(book.exploration) === routeKey(node)),
        )
        .slice(-3)
        .map((book) => ({ title: book.title })),
      brief:
        $('#ai-script-brief').value.trim() ||
        '让故事随旅程逐渐推进，并留下伏笔。文风、视角、节奏与描写方式沿用当前预设。',
      playerIntent: session.ai.scriptGuidance,
      boss: node
        ? explorationSpec(node, 4).enemyIds.find(
            (id) => (node.world?.enemyDefinitions[id] || DEFINITIONS[id])?.boss,
          ) || REGIONS[node.map].boss
        : session.journey.bossChoice,
      ...(node
        ? {
            enemyPool: (
              node.world?.enemyIds || [...REGIONS[node.map].enemies, REGIONS[node.map].boss]
            ).map((id) => node.world?.enemyDefinitions[id] || DEFINITIONS[id]),
          }
        : {}),
      chapter: route ? route.completed + 1 : library().chapter,
      adventureVersion: 1,
      ownedEmblems: [...(library().emblems || [])],
      party: party().map(settingOnly),
      protagonistId: library().campaign?.protagonistId || null,
      ...(node ? { exploration: structuredClone(node) } : {}),
      history: memoryHistory(
        library(),
        (route?.history || []).map((record) =>
          library().history.some((entry) => entry.runId === record.runId && entry.complete)
            ? { ...record, runId: null, confirmedEvents: [] }
            : record,
        ),
      ),
    };
  }
  function inputFor(kind) {
    if (['chat', 'quick-chat'].includes(kind)) return context.chat.input(kind, '你好。');
    if (kind === 'summary')
      return {
        items: [
          {
            id: 'preview:0',
            kind: 'chat',
            label: '示例记忆片段',
            place: '酒馆大厅',
            people: ['伊蒂丝', '潘多拉'],
            text: '玩家坐在吧台旁向潘多拉和伊蒂丝打听下一次外出探测的时间。伊蒂丝约定次日清晨在侧门汇合。',
          },
        ],
      };
    if (kind === 'map') return { brief: '预览一座漂浮在云海裂隙间的旧时钟塔世界。' };
    if (kind === 'creation')
      return {
        items: [
          {
            id: 'preview-relic',
            name: '碎钟齿轮',
            description: '一枚仍带余温的旧黄铜齿轮',
            value: 30,
            map: 'ruins',
            script: '旅人从破碎钟楼石台下拾起这枚微热的齿轮。',
          },
        ],
      };
    return kind === 'character'
      ? {
          brief:
            $('#ai-character-brief').value.trim() ||
            '召唤一位有鲜明身份与性格的异界冒险者，按设定集文体输出，普攻、技能动作和机械效果互相对应，不生成奥义。',
          rollId: (session.ai.characterRollId ||= crypto.randomUUID()),
          existing: library().characters.map((entry) => ({
            name: entry.setting.name,
            title: entry.setting.title,
          })),
        }
      : scriptInput();
  }
  const diagnostics = createGenerationDiagnostics({
    session,
    events,
    api,
    accept,
    toast: (message) => context.shell.toast(message),
    onRetry: retryGeneration,
  });
  const worldEditor = createWorldbookEditor({
    session,
    events,
    api(path, data) {
      return path.startsWith('worldbooks/')
        ? queueWorldbookTask(() => api(path, data))
        : api(path, data);
    },
    inputFor,
    savePrivate: save,
    onSaved(book) {
      let updated = false;
      for (const entry of Object.values(book?.entries || {})) {
        if (!characterEntryCategory(entry)) continue;
        const name = entry.comment.replace(/^[^：:]*[：:]/u, '').trim();
        const member = library().characters.find(
          (c) => c.setting?.name === name || entry.extensions?.wanxiang?.characterId === c.id,
        );
        if (member && entry.content && member.setting.worldbook !== entry.content) {
          member.setting.worldbook = entry.content;
          member.setting.edited = true;
          updated = true;
        }
      }
      if (updated) {
        library().prepared = null;
        save();
        render();
      }
    },
  });
  async function accept(kind, generated, input, arrivalDialogue) {
    const entry =
      kind === 'character'
        ? normalizeCharacter(
            {
              schemaVersion: 2,
              setting: generated.setting,
              ...(generated.dcAttrs ? { dcAttrs: generated.dcAttrs } : {}),
              ...(generated.levelUpLines ? { levelUpLines: generated.levelUpLines } : {}),
              data: { ...generated.combat, archetype: generated.archetype },
            },
            generated.id,
          )
        : {
            ...normalizeScript(
              generated,
              generated.id,
              input.party.map((item) => item.id),
              { map: input.exploration?.map ?? null },
            ),
            generationInput: structuredClone(input),
            party: input.party,
            boss: input.boss,
            chapter: input.chapter,
            ...(input.exploration ? { exploration: structuredClone(input.exploration) } : {}),
          };
    if (generated.growth) entry.growth = structuredClone(generated.growth);
    if (generated.display) entry.display = generated.display;
    if (kind === 'character' && input.purpose === 'protagonist') {
      entry.combat.limit = 2;
      context.onboarding.review(entry);
      return;
    }
    if (kind === 'character') {
      const npc =
        input.purpose === 'npc'
          ? library().archives.npcs.find((npc) => npc.id === input.npc?.id)
          : null;
      if (input.purpose === 'npc' && (!npc || npc.name !== entry.setting.name))
        throw Error('该NPC归档已变化，未消耗契约');
      await recruit(entry, arrivalDialogue, npc?.id);
      session.ai.characterRollId = null;
    } else {
      library().scripts.push(entry);
      library().prepared = entry.id;
      save();
      const equipment = equipmentPreparation || departure.equip();
      equipmentPreparation = null;
      equipment.ready();
      if (!(await equipment.completion)) return;
      if (session.runtime.disposed) return;
      await context.journey.startBattle();
    }
  }
  async function recruit(entry, arrivalDialogue, npcId) {
    const testingOfficial =
      entry.source === 'official' && session.ai.generationOptions.developerMode;
    if (!testingOfficial && isQuestRecruit(library(), entry.setting.name))
      throw Error('此角色通过任务招募');
    if (library().characters.length >= 100) throw Error('角色池已满（100名）');
    if (library().characters.some((member) => member.id === entry.id))
      throw Error('这个角色已经加入酒馆');
    if (!(library().inventory.summonContracts > 0)) throw Error('需要一份召唤契约');
    const prior = {
      contracts: library().inventory.summonContracts,
      npcs: library().archives.npcs,
      refined: [...library().refinedNpcs],
    };
    library().inventory.summonContracts--;
    library().characters.push(entry);
    if (npcId) library().archives.npcs = library().archives.npcs.filter((npc) => npc.id !== npcId);
    if (npcId) library().refinedNpcs.push(entry.setting.name);
    if (!save()) {
      library().inventory.summonContracts = prior.contracts;
      library().characters.pop();
      library().archives.npcs = prior.npcs;
      library().refinedNpcs = prior.refined;
      throw Error('角色未保存，已保留契约与NPC归档。请先整理浏览器存储空间。');
    }
    summoned = entry;
    $('#summoned-name').textContent = `${entry.setting.name} · 来客档案`;
    $('#summoned-lore').innerHTML = characterSheet(entry);
    $('#summoned-dialog').showModal();
    const greet = () => context.companionEvents?.arrival(entry, arrivalDialogue);
    $('#summoned-dialog').addEventListener('close', greet, { once: true });
    await syncWorldbookCharacters();
  }
  async function job(kind, override) {
    if (session.ai.busy) throw Error('已有生成任务在进行');
    session.ai.busy = true;
    context.ledger?.sync();
    request = new AbortController();
    $('#generation-title').textContent =
      kind === 'character' ? '正在召唤异界来客' : '正在编织本章故事';
    $('#generation-description').textContent =
      kind === 'character'
        ? '青色门扉泛起涟漪，一段新的来历正在浮现…'
        : '同行者跨越界门前，旅程的第一章正在展开…';
    $('#generation-progress').hidden = kind === 'script';
    if (kind !== 'script') {
      syncGenerationLoadingChrome($('#generation-progress'), $('#generation-title').textContent);
    }
    if (kind === 'script') {
      session.ai.departureParty = library().party.filter(Boolean);
      context.shell.renderParty();
      equipmentPreparation = departure.equip({ pending: true, onCancel: () => request?.abort() });
    }
    render();
    const input = override || inputFor(kind);
    try {
      const result = await api(`generate/${kind}`, input, request.signal);
      if (session.runtime.disposed) throw Error('页面已关闭');
      if (kind === 'script' && result.diagnostic) {
        result.diagnostic.warnings = [
          ...(result.diagnostic.warnings || []),
          ...scriptRepetitionWarnings(result.entry, library().scripts),
        ];
      }
      if (result.diagnostic) diagnostics.record(result.diagnostic, input, true);
      return { entry: result.entry, input, arrivalDialogue: result.arrivalDialogue };
    } catch (failure) {
      if (kind === 'script') {
        equipmentPreparation?.cancel();
        equipmentPreparation = null;
      }
      if (!session.runtime.disposed && failure.diagnostic)
        diagnostics.record(failure.diagnostic, input);
      throw failure;
    } finally {
      session.ai.busy = false;
      session.ai.departureParty = null;
      request = null;
      if (!session.runtime.disposed) {
        $('#generation-progress').hidden = true;
        render();
        context.ledger?.sync();
      }
    }
  }
  function updateParty(index, id) {
    try {
      if (session.ai.formationLocked) throw Error('本场编队已确认，整备只能调整装备');
      if (session.ai.departureParty && (!id || !session.ai.departureParty.includes(id)))
        throw Error('剧本生成期间只能交换出发角色的站位');
      assignParty(library(), index, id || null);
    } catch (failure) {
      context.shell.toast(failure.message);
      return;
    }
    save();
    installRoster();
    context.shell.renderParty();
    render();
  }
  async function portal(kind, summonInput = null) {
    if (session.runtime.mode !== 'inn' || session.ai.busy || session.runtime.disposed) return;
    if (session.runtime.needsStart) return context.onboarding.open();
    if (context.onboarding && !context.onboarding.allowPortal(kind, { entering: true })) return;
    if (
      kind === 'script' &&
      generationEnabled(session.ai.generationOptions) &&
      needsContinuationWorld(library(), session.journey.selectedNode)
    )
      return context.destinations.prepareContinuation();
    try {
      if (kind === 'character' && summonInput?.npc) {
        const npc = library().archives.npcs.find((entry) => entry.id === summonInput.npc.id);
        if (!npc) throw Error('此NPC已不在归档中，请重新选择。');
        const status = npcSummonStatus(library(), npc);
        if (!status.allowed) throw Error(status.reason + '，此次未消耗契约。');
      }
      if (kind === 'character' && context.onboarding?.summonCompanion()) return;
      if (kind === 'character' && !summonInput) return context.summoning.open();
      if (kind === 'character' && !generationEnabled(session.ai.generationOptions))
        throw Error('已跳过AI生成；官设召唤仍可使用，AI角色召唤暂不可用。');
      if (kind === 'character' && !library().inventory.summonContracts)
        throw Error('召唤需要一份契约，完成副本后可获得。');
      if (kind === 'character') pendingSummon = summonInput;
      if (
        kind === 'script' &&
        !developerOption(session.ai.generationOptions, 'quickTest') &&
        !developerOption(session.ai.generationOptions, 'quickTestApep')
      )
        prepareSwapLesson(library());
      if (kind === 'script' && !(await departure.choose())) return;
      if (kind === 'script' && !generationEnabled(session.ai.generationOptions, 'scriptApi')) {
        pendingPortal = null;
        $('#ai-dialog').close();
        const input = scriptInput();
        await accept(
          'script',
          { ...adventureTestScript(input.exploration?.map), id: 'script-' + crypto.randomUUID() },
          input,
        );
        return;
      }
      profiles = await api('config');
      if (session.runtime.mode !== 'inn' || session.ai.busy || session.runtime.disposed) return;
      if (!ready(profiles[kind], kind)) {
        pendingPortal = kind;
        await open(
          `请先配置${kind === 'character' ? '角色生成' : '剧本'}API，再保存并继续。`,
          kind,
        );
        return;
      }
      if (kind === 'character' && library().characters.length >= 100)
        throw Error('角色池已满（100名）');
      pendingPortal = null;
      $('#ai-dialog').close();
      session.runtime.mode = 'loading';
      diagnostics.refreshButtons();
      const generationInput =
        kind === 'character'
          ? { ...inputFor(kind), ...(summonInput?.brief ? { brief: summonInput.brief } : {}) }
          : undefined;
      pendingSummon = null;
      if (summonInput?.npc)
        Object.assign(generationInput, { purpose: 'npc', npc: summonInput.npc });
      const { entry, input, arrivalDialogue } = await job(kind, generationInput);
      session.runtime.mode = 'inn';
      diagnostics.refreshButtons();
      await accept(kind, entry, input, arrivalDialogue);
      if (kind === 'script') context.audio.play('shield');
      if (
        diagnostics.latest(kind)?.warnings?.some((warning) => warning.path === 'output.repetition')
      )
        context.shell.toast('本次剧本正文与旧篇相同，可点“查看原始回复”核对模型返回。未自动重试。');
    } catch (failure) {
      if (session.runtime.disposed) return;
      session.runtime.mode = 'inn';
      const message =
        failure.name === 'AbortError' ? '已取消，尚未进入剧本或保存新角色。' : failure.message;
      context.shell.toast(message);
      diagnostics.refreshButtons();
      if (failure.diagnostic) {
        if ($('#destination-dialog')?.open) $('#destination-dialog').close();
        diagnostics.show(kind);
      } else if (failure.name !== 'AbortError') {
        diagnostics.record(
          {
            kind,
            stage: 'transport',
            issues: [{ path: kind, message }],
            repairs: [],
            rawText: '',
            candidateText: '',
          },
          kind === 'script' ? scriptInput() : inputFor(kind),
          false,
        );
        if ($('#destination-dialog')?.open) $('#destination-dialog').close();
        diagnostics.show(kind);
      }
    }
  }
  async function retryGeneration(kind, savedInput) {
    if (session.runtime.mode !== 'inn' || session.ai.busy || session.runtime.disposed) return;
    if (!['script', 'character'].includes(kind)) return;
    try {
      session.runtime.mode = 'loading';
      diagnostics.refreshButtons();
      const { entry, input, arrivalDialogue } = await job(kind, savedInput);
      session.runtime.mode = 'inn';
      diagnostics.refreshButtons();
      await accept(kind, entry, input, arrivalDialogue);
      if (kind === 'script') context.audio.play('shield');
    } catch (failure) {
      if (session.runtime.disposed) return;
      session.runtime.mode = 'inn';
      const message =
        failure.name === 'AbortError' ? '已取消，尚未进入剧本或保存新角色。' : failure.message;
      context.shell.toast(message);
      diagnostics.refreshButtons();
      if (failure.diagnostic) {
        diagnostics.show(kind);
      } else if (failure.name !== 'AbortError') {
        diagnostics.record(
          {
            kind,
            stage: 'transport',
            issues: [{ path: kind, message }],
            repairs: [],
            rawText: '',
            candidateText: '',
          },
          savedInput || (kind === 'script' ? scriptInput() : inputFor(kind)),
          false,
        );
        diagnostics.show(kind);
      }
    }
  }
  const presetEditor = createAiPresetEditor({
    events,
    api,
    status,
    getProfiles: () => profiles,
    setProfiles: (value) => {
      profiles = value;
    },
    captureProfile,
    fillProfile,
    inputFor,
  });
  const guard = (action) => async () => {
    try {
      await action();
    } catch (failure) {
      status(failure.message);
    }
  };
  events.on($('#ai-open'), 'click', () => {
    pendingPortal = null;
    void open();
  });
  events.on($('#generation-reset-undo'), 'click', () => {
    if (session.runtime.mode === 'inn' && restoreGeneratedRecovery(storage)) location.reload();
  });
  events.on($('#ai-close'), 'click', () => {
    pendingPortal = null;
    $('#ai-dialog').close();
  });
  events.on($('#ai-dialog'), 'cancel', () => {
    pendingPortal = null;
  });
  events.on($('#ai-kind'), 'change', fillProfile);
  events.on(
    $('#ai-profile-save'),
    'click',
    guard(async () => {
      await saveProfile();
      if (pendingPortal && pendingPortal === $('#ai-kind').value)
        await portal(pendingPortal, pendingSummon);
    }),
  );
  events.on(
    $('#ai-remember-and-save'),
    'click',
    guard(async () => {
      $('#ai-rememberKey').checked = true;
      renderCredentialRetention();
      await saveProfile();
      if (pendingPortal && pendingPortal === $('#ai-kind').value)
        await portal(pendingPortal, pendingSummon);
    }),
  );
  const modelPicker = createModelPicker({ events, api, saveProfile, status });
  events.on($('#ai-cancel'), 'click', () => request?.abort());
  events.on($('#generation-progress-cancel'), 'click', () => request?.abort());
  events.on($('#prepare-cancel-generation'), 'click', () => request?.abort());
  events.on($('#prepare-open-workshop'), 'click', () => void context.workshop?.open?.());
  events.on($('#party-panel'), 'cancel', (event) => {
    if (session.ai.departureParty) event.preventDefault();
  });
  events.on($('#summoned-close'), 'click', () => $('#summoned-dialog').close());
  events.on($('#summoned-join'), 'click', () => {
    if (!summoned) return;
    if (!library().characters.some((entry) => entry.id === summoned.id))
      library().characters.push(summoned);
    if (library().campaign) {
      if (!library().party.includes(summoned.id)) {
        const index = library()
          .party.slice(0, rearUnlocked(library()) ? 6 : 3)
          .indexOf(null);
        if (index >= 0) library().party[index] = summoned.id;
      }
      installRoster();
    }
    save();
    render();
    $('#summoned-dialog').close();
    void syncWorldbookCharacters();
    context.shell.renderParty();
    context.onboarding?.refresh();
    context.shell.toast('来客已加入酒馆角色池，可在“准备”中安排出战。');
  });
  events.on($('#ai-dialog'), 'click', (event) => {
    const tab = event.target.closest('[data-ai-tab]');
    if (tab) setTab(tab.dataset.aiTab);
    const lore = event.target.closest('[data-lore]');
    if (lore) showBook(library().characters.find((entry) => entry.id === lore.dataset.lore));
    const book = event.target.closest('[data-book]');
    if (book) showBook(library().scripts.find((entry) => entry.id === book.dataset.book));
  });
  events.on($('#ai-party'), 'change', (event) =>
    updateParty(Number(event.target.dataset.partySlot), event.target.value),
  );
  events.on($('#ai-lore-save'), 'click', () => {
    const member = library().characters.find((entry) => entry.id === editedLore);
    const text = $('#ai-lore-text').value.trim();
    if (!member || !text || text.length > 24000) {
      status('人物正文需要1～24000字');
      return;
    }
    let tags;
    try {
      tags = JSON.parse($('#ai-lore-tags').value || '[]');
      if (
        !Array.isArray(tags) ||
        tags.length > 30 ||
        tags.some((tag) => typeof tag !== 'string' || tag.length > 60)
      )
        throw Error('标签需要最多30项的文字数组，每项最多60字');
    } catch (failure) {
      status(failure.message);
      return;
    }
    const owner = library();
    void queueWorldbookTask(async (isCurrent) => {
      const prior = {
        worldbook: member.setting.worldbook,
        tags: member.setting.tags,
        edited: member.setting.edited,
      };
      const prepared = owner.prepared;
      Object.assign(member.setting, { worldbook: text, tags, edited: true });
      owner.prepared = null;
      if (!save()) {
        Object.assign(member.setting, prior);
        owner.prepared = prepared;
        return;
      }
      if (editedLore === member.id) $('#ai-preview').textContent = text;
      const response = await api('worldbooks/tavern-world');
      if (!isCurrent()) return;
      if (response?.book?.entries) {
        const book = response.book;
        const entry = Object.values(book.entries).find(
          (item) =>
            item.comment === `人物详情：${member.setting.name}` ||
            item.extensions?.wanxiang?.characterId === member.id,
        );
        if (entry) {
          entry.content = text;
          await api('worldbooks/save', { id: 'tavern-world', book });
        }
      }
      if (isCurrent()) status('人物世界书已保存，之后生成剧本立即使用；战斗数据保持原样。');
    }, owner).catch((failure) => {
      if (!session.runtime.disposed && library() === owner) status(failure.message);
    });
  });
  async function applyQuickConnection(kinds, draft) {
    if (!profiles) profiles = await api('config');
    const requestMode = context.apiClient.staticMode ? 'browser' : 'local';
    for (const kind of kinds) {
      const existing = profiles?.[kind] || {};
      const payload = {
        kind,
        baseUrl: String(draft.baseUrl || '').trim(),
        model: String(draft.model || '').trim(),
        provider: draft.provider || existing.provider || 'auto',
        vertexAuth: existing.vertexAuth || 'service-account',
        tokenField: existing.tokenField || 'max_tokens',
        maxTokens: existing.maxTokens || 32768,
        promptProcessing: existing.promptProcessing || 'merge_tools',
        requestMode,
        jsonMode: existing.jsonMode ?? false,
        strictJson: existing.strictJson ?? false,
        rememberKey: true,
        clearKey: false,
        apiKey: String(draft.apiKey || '').trim(),
        temperature: existing.temperature ?? null,
        ...(kind === 'summary' ? { contextSize: existing.contextSize || 131072 } : {}),
      };
      profiles = await api('config', payload);
    }
    fillProfile();
    return profiles;
  }
  async function fetchModelsForDraft(kind, draft) {
    const baseUrl = String(draft?.baseUrl || '').trim();
    if (!baseUrl) throw Error('请先填写 Base URL');
    await applyQuickConnection([kind], {
      ...draft,
      baseUrl,
      model: String(draft?.model || '').trim() || profiles?.[kind]?.model || 'model-probe',
    });
    const result = await api(`models/${kind}`, {});
    return [...new Set(result.models || [])].sort((a, b) => a.localeCompare(b));
  }
  return {
    open,
    saveConnection: saveProfile,
    applyQuickConnection,
    fetchModelsForDraft,
    async setupStatus() {
      profiles = await api('config');
      return Object.fromEntries(
        Object.entries(profiles).map(([kind, profile]) => [
          kind,
          {
            connection: ready(profile, kind),
          },
        ]),
      );
    },
    save,
    syncCharacters: syncWorldbookCharacters,
    refreshStory: story.render,
    scriptInput,
    cancel: () => request?.abort(),
    async ensureReady(kind) {
      profiles = await api('config');
      if (session.runtime.disposed) return false;
      if (!ready(profiles[kind], kind)) {
        await open(`开始前请先配置${kind === 'character' ? '角色生成' : '剧本'}API。`, kind);
        return false;
      }
      return true;
    },
    async generateProtagonist(brief, dcAttrs) {
      if (!generationEnabled(session.ai.generationOptions, 'protagonistApi')) {
        const fallback = defaultProtagonist(library());
        if (dcAttrs) fallback.dcAttrs = { ...dcAttrs };
        return fallback;
      }
      const input = {
        purpose: 'protagonist',
        brief,
        ...(dcAttrs ? { dcAttrs: { ...dcAttrs } } : {}),
        existing: [],
        rollId: crypto.randomUUID(),
      };
      try {
        const result = await job('character', input);
        if (dcAttrs && result.entry) result.entry.dcAttrs = { ...dcAttrs };
        return result.entry;
      } catch (failure) {
        if (failure.diagnostic) diagnostics.show('character');
        throw failure;
      }
    },
    defaultProtagonist: () => defaultProtagonist(library()),
    recruitFirstCompanion() {
      const entry = firstCompanion(library());
      if (!entry) return null;
      installRoster();
      save();
      render();
      context.shell.renderParty();
      void syncWorldbookCharacters();
      return entry;
    },
    replaceLibrary(value) {
      context.memory?.reset();
      session.ai.library = value;
      context.chat?.leave();
      context.chat?.resetSelection();
      session.ai.activeScript = null;
      session.journey.expedition = null;
      session.battle.plan = [];
      session.battle.history = [];
      session.selection.selected = null;
      session.selection.pending = null;
      session.selection.selectedCell = -1;
      installRoster();
      story.reset();
      save();
      context.shell.renderParty();
      void syncWorldbookCharacters();
    },
    portal,
    recruitOfficial: recruit,
    setPartySlot: updateParty,
    explorationWon(node, { ether = 0 } = {}) {
      const book = session.ai.activeScript;
      const record = book ? library().history.find((item) => item.runId === book.runId) : null;
      const next = completeExploration(library().exploration, node, {
        runId: book?.runId,
        scriptId: book?.id,
        ether,
        encounters: Array.from({ length: ENCOUNTER_COUNT }, (_, index) =>
          currentEncounterSpec(session.journey.expedition, index),
        ),
        tags: book?.tags,
        title: book?.title,
        nextHook: book?.nextHook,
        lines: record?.lines || [],
      });
      save();
      return next;
    },
    refreshReview: diagnostics.refreshButtons,
    openReview: () => diagnostics.show(undefined, context.latestResponse?.show),
    recordReview: diagnostics.record,
    setOption,
    setSummonVisible(visible) {
      session.runtime.summonVisible = visible;
      diagnostics.refreshButtons();
      context.onboarding?.summonVisible(visible);
    },
    ...story,
    async prepare() {
      if (session.journey.selectedNode?.replay) {
        session.ai.activeScript = recollectionScript(library(), session.journey.selectedNode);
        story.reset();
        return compileRoster(library());
      }
      prepareSwapLesson(library());
      if (!generationEnabled(session.ai.generationOptions, 'scriptApi') && !library().prepared) {
        const input = scriptInput();
        const book = {
          ...normalizeScript(
            adventureTestScript(input.exploration?.map),
            'script-' + crypto.randomUUID(),
          ),
          generationInput: structuredClone(input),
          party: input.party,
          boss: input.boss,
          chapter: input.chapter,
          ...(input.exploration ? { exploration: input.exploration } : {}),
        };
        library().scripts.push(book);
        library().prepared = book.id;
      }
      const book = library().scripts.find(
        (entry) =>
          entry.id === library().prepared &&
          (session.journey.selectedNode
            ? entry.exploration?.id === session.journey.selectedNode.id
            : entry.boss === session.journey.bossChoice),
      );
      session.ai.activeScript = book
        ? { ...structuredClone(book), runId: crypto.randomUUID() }
        : null;
      if (book) {
        library().prepared = null;
        const prelude = archiveTavernPrelude(library(), book.generationInput?.tavernPrelude, false);
        library().history.push({
          runId: session.ai.activeScript.runId,
          scriptId: book.id,
          title: book.title,
          tags: [...(book.tags || [])],
          gameTime: gameTime(library().daily),
          setting: book.setting,
          lines: prelude,
          place: book.exploration ? explorationSpec(book.exploration).name : REGIONS.ruins.name,
          people: (book.party || [])
            .filter((member) => member.id !== library().campaign?.protagonistId)
            .map((member) => member.name),
          played: [],
          complete: false,
          nextHook: null,
          ...(book.exploration
            ? { map: routeKey(book.exploration), nodeId: book.exploration.id }
            : {}),
        });
        save();
      }
      story.reset();
      return compileRoster(library());
    },
    dispose() {
      worldEditor.dispose();
      request?.abort();
      story.dispose();
    },
  };
}
