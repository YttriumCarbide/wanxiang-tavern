import { explorationSpec } from '../exploration.js';
import { needsContinuationWorld } from '../continuation-world.js';
import {
  validateServiceAccount,
  readServiceAccount,
  serviceAccountBase,
} from '../ai/vertex-service-account.js';
import { DEFINITIONS } from '../data.js';
import { routeKey } from '../worlds.js';
import { nextArcPhase } from '../story-arc.js';
import { combatTestScript } from '../content/generation-mode.js';
import { cleanLibraryCharacters } from '../ai/character-cleanup.js';
import { relevantArchives } from '../archives.js';
import {
  GENERATION_OPTIONS_KEY,
  restoreGenerationOptions,
  generationEnabled,
} from '../generation-options.js';
import { defaultProtagonist } from '../content/qingyuan.js';
import { HEROES } from '../data.js';
import { newBattle, preview } from '../engine.js';
import { compileRoster, restoreLibrary } from '../ai/library.js';
import {
  normalizeCharacter,
  normalizeScript,
  settingOnly,
  characterWorldbook,
} from '../ai/contracts.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import { query as $ } from './dom.js';
import { createStoryFeed } from './story.js';
import { recollectionScript } from '../recollections.js';
import { currentEncounterSpec } from '../expedition.js';
import { ENCOUNTER_COUNT } from '../content/journey-rules.js';
import { createModelPicker } from './model-picker.js';
import { createAiPresetEditor } from './ai-presets.js';
import { createGenerationDiagnostics } from './generation-diagnostics.js';
import { createWorldbookEditor } from './worldbook-editor.js';
import { characterWorldEntry } from '../ai/worldbook.js';
import { createRegexEditor } from './regex-editor.js';
import { characterSheet } from './character-sheet.js';
import { scriptRepetitionWarnings } from '../ai/script-prose.js';
import {
  applyGeneratedReset,
  hasGeneratedRecovery,
  restoreGeneratedRecovery,
} from './generated-reset.js';
import { completeExploration } from '../exploration.js';
import { REGIONS } from '../content/regions.js';
import { assignParty, firstCompanion } from '../campaign.js';
import { memoryHistory } from '../memory.js';
import { developerOption } from '../generation-options.js';
import { prepareSwapLesson } from '../companion-events.js';
import { rearUnlocked } from '../formation-access.js';
import { npcSummonStatus } from '../summoning.js';

const libraryKey = 'wanxiang.worldbooks.v1';
export function createGeneration(context) {
  const storage = context.storage || localStorage;
  const { session, events } = context;
  let request = null,
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
  } catch {
    /* Retain the seeded official pool. */
  }
  const library = () => session.ai.library;
  function renderDeveloperOptions() {
    $('#developer-options').hidden = !session.ai.generationOptions.developerMode;
    for (const checkbox of document.querySelectorAll('[data-generation-option]'))
      checkbox.checked = session.ai.generationOptions[checkbox.dataset.generationOption];
    if (session.runtime.mode === 'battle')
      $('#back-inn').hidden = !developerOption(session.ai.generationOptions, 'allowRetreat');
    context.generationAccess?.refresh();
  }
  renderDeveloperOptions();
  for (const checkbox of document.querySelectorAll('[data-generation-option]')) {
    const key = checkbox.dataset.generationOption;
    checkbox.checked = session.ai.generationOptions[key];
    events.on(checkbox, 'change', () => {
      const next = restoreGenerationOptions({
        ...session.ai.generationOptions,
        [key]: checkbox.checked,
      });
      try {
        storage.setItem(GENERATION_OPTIONS_KEY, JSON.stringify(next));
      } catch {
        checkbox.checked = session.ai.generationOptions[key];
        status('浏览器无法保存选项，请检查本地存储空间。');
        return;
      }
      session.ai.generationOptions = next;
      renderDeveloperOptions();
      context.onboarding?.generationModeChanged();
      context.onboarding?.refresh();
      status('游戏选项已保存。');
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
    try {
      storage.setItem(libraryKey, JSON.stringify(library()));
      context.saves?.autoSave?.('游戏进度保存');
      return true;
    } catch {
      status('浏览器存储空间不足，请导出世界书后整理');
      return false;
    }
  }
  const story = createStoryFeed(session, save);
  function installRoster() {
    session.battle.state = newBattle(undefined, compileRoster(library()));
    session.battle.forecast = preview(session.battle.state, []);
  }
  installRoster();
  const api = (path, data, signal) => context.apiClient.request(path, data, { signal });
  async function syncWorldbookCharacters() {
    try {
      const response = await api('worldbooks/tavern-world');
      if (!response?.book?.entries) return;
      const book = response.book;
      const retired = new Set(book.extensions?.wanxiang?.characterCleanup?.removedIds || []);
      if (cleanLibraryCharacters(library(), retired)) {
        save();
        if (session.runtime.mode === 'inn') {
          installRoster();
          context.shell?.renderParty();
          render();
        }
      }
      let nextUid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
      let dirty = false;
      for (const char of library().characters) {
        if (retired.has(char.id) && char.id !== library().campaign?.protagonistId) continue;
        const name = char.setting?.name;
        if (!name) continue;
        const entry = Object.values(book.entries).find(
          (item) =>
            item.comment === `人物详情：${name}` ||
            item.extensions?.wanxiang?.characterId === char.id,
        );
        if (!entry) {
          book.entries[nextUid] = characterWorldEntry(char, nextUid);
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
      if (dirty) {
        await api('worldbooks/save', { id: 'tavern-world', book });
      }
    } catch {
      /* Background sync ignore */
    }
  }
  void syncWorldbookCharacters();
  function render() {
    $('#ai-party').innerHTML = HEROES.slice(0, rearUnlocked(library()) ? 6 : 3)
      .map(
        (slot, index) =>
          html`<label
            >${index + 1} · ${index < 3 ? '前场' : '后场'}<select data-party-slot="${index}">
              ${library().campaign ? '<option value="">空位</option>' : ''}
              ${library()
                .characters.map(
                  (entry) =>
                    html`<option
                      value="${entry.id}"
                      ${library().party[index] === entry.id ? 'selected' : ''}
                    >
                      ${escapeText(entry.setting.name)}
                    </option>`,
                )
                .join('')}
            </select></label
          >`,
      )
      .join('');
    $('#ai-pool').innerHTML = library()
      .characters.map(
        (entry) =>
          html`<article class="ai-entry">
            <span
              class="worldbook-light ${library().party.includes(entry.id) ? 'active' : ''}"
              title="${library().party.includes(entry.id) ? '绿灯：在队' : '暂留酒馆'}"
            ></span>
            <div>
              <b>${escapeText(entry.setting.name)}</b
              ><small
                >${escapeText(entry.setting.title)} ·
                ${entry.source === 'official' ? '官方' : '来客'}</small
              >
            </div>
            <button data-lore="${entry.id}">阅读设定</button>
          </article>`,
      )
      .join('');
    $('#ai-books').innerHTML =
      library()
        .scripts.map(
          (book) =>
            html`<article class="ai-entry">
              <div>
                <b>${escapeText(book.title)}</b
                ><small>第${book.chapter}章 · ${escapeText((book.tags || []).join('、'))}</small>
              </div>
              <button data-book="${escapeText(book.id)}">阅读记录</button>
            </article>`,
        )
        .join('') || '<p>尚未启程。在副本门点击“进入剧本”开始本章。</p>';
    $('#ai-cancel').hidden = !session.ai.busy;
    $('#generation-reset-undo').hidden = !hasGeneratedRecovery(storage);
    renderCredentialRetention();
  }
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
  function setTab(tab) {
    $('#ai-dialog').dataset.tab = tab;
    $('#ai-dialog').dataset.preview = 'false';
    $('#ai-lore-editor').hidden = true;
    $('#ai-preview').hidden = false;
    $('#ai-token-summary').textContent = '';
    $('#ai-result-title').textContent = tab === 'prompts' ? '最终发送消息预览' : '世界书正文';
    document.querySelectorAll('[data-ai-page]').forEach((page) => {
      page.hidden = page.dataset.aiPage !== tab;
    });
    document
      .querySelectorAll('[data-ai-tab]')
      .forEach((button) =>
        button.setAttribute('aria-selected', String(button.dataset.aiTab === tab)),
      );
  }
  function renderTransport() {
    if (context.apiClient.staticMode) {
      $('#ai-requestMode').value = 'browser';
      $('#ai-requestMode').disabled = true;
      $('#ai-rememberKey').disabled = false;
      $('#ai-transport-hint').textContent =
        '所有数据保存在此浏览器，AI由本页直接请求。勾选记住密钥后，刷新和重启仍可使用；普通备份不包含密钥。';
      return;
    }
    const direct = $('#ai-requestMode').value === 'browser';
    $('#ai-rememberKey').disabled = direct;
    $('#ai-transport-hint').textContent = direct
      ? '由本页请求AI，接口需允许跨域。密钥仅在当前页面保留；本阶段预设准备与结果校验仍使用本机服务。'
      : '由本机服务请求AI，可使用保存在本机的连接密钥。';
  }
  function renderCredentialRetention() {
    const browser = $('#ai-requestMode').value === 'browser';
    const temporary = browser && (!context.apiClient.staticMode || !$('#ai-rememberKey').checked);
    $('#ai-key-retention').textContent = browser
      ? temporary
        ? '当前仅本次使用：密钥不会写入设备，更新页面或关机后需要重新输入。'
        : '密钥会保存在此设备，刷新、代码更新及正常关机重启后保留；不会进入普通备份。'
      : '';
    $('#ai-remember-and-save').hidden = !context.apiClient.staticMode || !temporary;
    $('#ai-profile-save').textContent = temporary
      ? '仅本次使用（关闭后需重填）'
      : pendingPortal
        ? `保存并${pendingPortal === 'character' ? '召唤' : '进入剧本'}`
        : '保存当前连接';
  }
  events.on($('#ai-rememberKey'), 'change', renderCredentialRetention);
  events.on($('#ai-requestMode'), 'change', renderCredentialRetention);
  events.on($('#ai-requestMode'), 'change', renderTransport);
  function renderProvider() {
    const base = $('#ai-baseUrl').value;
    const native =
      $('#ai-provider').value === 'vertex' ||
      ($('#ai-provider').value === 'auto' &&
        /aiplatform\.googleapis\.com/.test(base) &&
        !base.includes('/endpoints/'));
    $('#ai-vertex-auth').hidden = !native;
    $('#ai-provider-hint').hidden = !native;
    const serviceAccount = native && $('#ai-vertexAuth').value === 'service-account';
    $('#ai-service-account-fields').hidden = !serviceAccount;
    $('#ai-key').closest('label').hidden = serviceAccount;
    $('#ai-provider-hint').textContent = serviceAccount
      ? '导入或粘贴服务账号 JSON，验证后保存。项目自动识别，地区默认为 global；模型名自行填写。私钥只用于本地签名，访问令牌自动获取，不会进入普通备份。'
      : $('#ai-vertexAuth').value === 'oauth'
        ? '标准模式：Base URL 填 https://区域-aiplatform.googleapis.com/v1/projects/项目ID/locations/区域，全球区域用 aiplatform.googleapis.com；密钥栏填有效OAuth访问令牌。令牌过期后需更新，本页不保存服务账号私钥。模型ID手动填写。'
        : '快捷模式：Base URL 填 https://aiplatform.googleapis.com/v1，密钥栏填Vertex API Key，模型栏填Google控制台中的Gemini模型ID。原生接口无需 /chat/completions，模型ID手动填写。';
  }
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
    if (session.runtime.mode !== 'inn') return;
    render();
    setTab('settings');
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
      if (kind) $('#ai-kind').value = kind;
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
        .map((book) => ({ title: book.title, tags: book.tags })),
      brief:
        $('#ai-script-brief').value.trim() ||
        '让故事随旅程逐渐推进，并留下伏笔。文风、视角、节奏与描写方式沿用当前预设。',
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
      party: party().map(settingOnly),
      protagonistId: library().campaign?.protagonistId || null,
      ...(node ? { exploration: structuredClone(node) } : {}),
      history: memoryHistory(library(), route ? route.history : library().history.slice(-3)),
    };
  }
  function inputFor(kind) {
    if (['chat', 'quick-chat'].includes(kind)) return context.chat.input(kind, '你好。');
    return kind === 'character'
      ? {
          brief:
            $('#ai-character-brief').value.trim() ||
            '召唤一位有清晰职业与性格的异界冒险者，按设定集文体输出，普攻、技能动作和机械效果互相对应，不生成奥义。',
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
  });
  const worldEditor = createWorldbookEditor({
    session,
    events,
    api,
    inputFor,
    onSaved(book) {
      let updated = false;
      for (const entry of Object.values(book?.entries || {})) {
        if (!entry.comment?.startsWith('人物详情：')) continue;
        const name = entry.comment.slice('人物详情：'.length).trim();
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
  createRegexEditor({ events, api });
  async function accept(kind, generated, input, arrivalDialogue) {
    const entry =
      kind === 'character'
        ? normalizeCharacter(
            {
              schemaVersion: 2,
              setting: generated.setting,
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
      await context.journey.startBattle();
    }
  }
  async function recruit(entry, arrivalDialogue, npcId) {
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
    request = new AbortController();
    $('#generation-title').textContent =
      kind === 'character' ? '正在召唤异界来客' : '正在编织本章故事';
    $('#generation-description').textContent =
      kind === 'character'
        ? '青色门扉泛起涟漪，一段新的来历正在浮现…'
        : '同行者跨越界门前，旅程的第一章正在展开…';
    $('#generation-progress').hidden = kind === 'script';
    if (kind === 'script') {
      session.ai.departureParty = library().party.filter(Boolean);
      context.shell.renderParty();
      $('#prepare-title').textContent = '整备 · 正在生成剧本';
      $('#prepare-done').disabled = true;
      $('#prepare-close').disabled = true;
      $('#prepare-cancel-generation').hidden = false;
      if (!$('#party-panel').open) $('#party-panel').showModal();
      context.onboarding?.preparationOpened();
    }
    render();
    const input = override || inputFor(kind);
    try {
      await context.extensions?.activate(kind);
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
      if (!session.runtime.disposed && failure.diagnostic)
        diagnostics.record(failure.diagnostic, input);
      throw failure;
    } finally {
      session.ai.busy = false;
      session.ai.departureParty = null;
      request = null;
      if (!session.runtime.disposed) {
        $('#generation-progress').hidden = true;
        if (kind === 'script') {
          $('#party-panel').close();
          $('#prepare-title').textContent = '战阵整备';
          $('#prepare-done').disabled = false;
          $('#prepare-close').disabled = false;
          $('#prepare-cancel-generation').hidden = true;
        }
        render();
      }
    }
  }
  function updateParty(index, id) {
    try {
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
    if (context.onboarding && !context.onboarding.allowPortal(kind)) return;
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
      if (kind === 'script') prepareSwapLesson(library());
      if (kind === 'script' && !generationEnabled(session.ai.generationOptions, 'scriptApi')) {
        pendingPortal = null;
        $('#ai-dialog').close();
        const input = scriptInput();
        await accept(
          'script',
          { ...combatTestScript(input.exploration?.map), id: 'script-' + crypto.randomUUID() },
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
      if (!profiles[kind].promptPresetId || profiles[kind].promptPresetId.endsWith('-default')) {
        await open('请先导入并选择提示词预设。', kind);
        setTab('prompts');
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
      else if (diagnostics.latest(kind)?.repairs.length)
        context.shell.toast('已自动修复格式，可在“生成诊断”查看原文与修复记录。');
    } catch (failure) {
      if (session.runtime.disposed) return;
      session.runtime.mode = 'inn';
      const message =
        failure.name === 'AbortError' ? '已取消，尚未进入剧本或保存新角色。' : failure.message;
      context.shell.toast(message);
      diagnostics.refreshButtons();
      if (failure.diagnostic) diagnostics.show(kind);
      else if (failure.name !== 'AbortError') await open(message, kind);
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
    setTab,
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
    member.setting.worldbook = text;
    member.setting.tags = tags;
    member.setting.edited = true;
    library().prepared = null;
    save();
    $('#ai-preview').textContent = text;
    void (async () => {
      try {
        const response = await api('worldbooks/tavern-world');
        if (!response?.book?.entries) return;
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
      } catch {
        /* Background sync ignore */
      }
    })();
    status('人物世界书已保存，之后生成剧本立即使用；战斗数据保持原样。');
  });
  return {
    open,
    openPrompts: () => presetEditor.open(),
    saveConnection: saveProfile,
    async setupStatus() {
      profiles = await api('config');
      return Object.fromEntries(
        Object.entries(profiles).map(([kind, profile]) => [
          kind,
          {
            connection: ready(profile, kind),
            prompt: !!profile.promptPresetId && !profile.promptPresetId.endsWith('-default'),
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
      if (!profiles[kind].promptPresetId || profiles[kind].promptPresetId.endsWith('-default')) {
        await open('请先导入并选择提示词预设，再回到主角创建。', kind);
        setTab('prompts');
        return false;
      }
      return true;
    },
    async generateProtagonist(brief) {
      if (!generationEnabled(session.ai.generationOptions, 'protagonistApi'))
        return defaultProtagonist(library());
      const input = { purpose: 'protagonist', brief, existing: [], rollId: crypto.randomUUID() };
      try {
        const result = await job('character', input);
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
            combatTestScript(input.exploration?.map),
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
        library().history.push({
          runId: session.ai.activeScript.runId,
          scriptId: book.id,
          title: book.title,
          tags: [...(book.tags || [])],
          setting: book.setting,
          lines: [],
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
