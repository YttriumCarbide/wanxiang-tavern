import { routeKey } from '../worlds.js';
import { skippingAi } from '../generation-options.js';
import { FINAL_ENCOUNTER } from '../content/journey-rules.js';
import { CHAT_PLACES, tavernActivities, mergeFutureScript } from '../chat.js';
import { settingOnly } from '../ai/contracts.js';
import { createChatPresentation } from './chat-presentation.js';
import { query as $ } from './dom.js';
import { relevantArchives } from '../archives.js';
import { applyRelationshipActions } from '../relationships.js';
import { streamingChatText } from '../ai/output-tags.js';
import { html } from '../shared/html.js';
import {
  memoryChat,
  memoryHistory,
  memoryText,
  scriptMemory,
  previousDungeonMemory,
} from '../memory.js';

export function createChat(context) {
  const api = context.apiClient.request;
  const { session, events } = context;
  const dialog = $('#chat-dialog');
  const rewriteHelp = document.createElement('dialog');
  rewriteHelp.id = 'rewrite-help';
  rewriteHelp.setAttribute('aria-labelledby', 'rewrite-help-title');
  rewriteHelp.innerHTML = html`<h2 id="rewrite-help-title">修改后续剧本</h2>
    <p>
      如果你对当前的剧本发展不满意，可以先在闲聊中表达想法、引导故事的方向，再点击“修改剧本”。AI
      会结合当前剧本、已经发生的事件和本趟闲聊，调整接下来的发展。
    </p>
    <p>只会修改尚未经历的战斗与剧情；已经发生的内容和当前战斗保持不变。此操作会调用剧本 API。</p>
    <label><input id="rewrite-help-remember" type="checkbox" />不再提示</label>
    <footer>
      <button id="rewrite-help-cancel">暂不修改</button
      ><button id="rewrite-help-confirm" class="primary">确认修改</button>
    </footer>`;
  document.body.append(rewriteHelp);
  const preferences = context.storage || localStorage;
  $('#chat-place-select').replaceChildren(
    ...Object.entries(CHAT_PLACES).map(([id, location]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = location.name;
      return option;
    }),
  );
  const presentation = createChatPresentation(session);
  let place = 'table',
    activities = [],
    request = null,
    rewrite = null,
    revision = 0;
  const state = () => session.ai.chat;
  const library = () => session.ai.library;
  const characters = () =>
    library().characters.filter((member) => member.id !== library().campaign?.protagonistId);
  function renderHistory(kind = 'chat') {
    presentation.history(kind);
  }
  function playReply(kind, reply) {
    if (!reply) return context.shell.toast('还没有可重播的对话');
    const content = /【(?:旁白|对白[:：])/u.test(reply.content)
      ? reply.content
      : [
          {
            speaker: reply.speakerIds?.length === 1 ? reply.speakerIds[0] : '旁白',
            text: reply.content,
          },
        ];
    void context.gal.play(content, {
      owner: kind,
      title: kind === 'chat' ? '酒馆 · 片刻交谈' : '旅途 · 片刻闲谈',
    });
  }
  function openGal(kind) {
    const quick = kind === 'quick-chat';
    if (quick && session.runtime.mode !== 'battle') return;
    if (quick && session.ai.activeScript?.recollection) return;
    if (dialog.open) dialog.close();
    if ($('#story-feed').open) $('#story-feed').close();
    presentation.history(kind);
    context.gal.workspace({
      owner: kind,
      title: quick ? '旅途 · 同行闲谈' : `酒馆 · ${CHAT_PLACES[place].name}`,
      actors: quick
        ? library().party.filter((id) => id && id !== library().campaign?.protagonistId)
        : state().selected,
      selection: quick ? [] : [$('.chat-company')],
      composer: quick ? [$('#quick-chat-form')] : [$('.chat-composer')],
      auxiliary: quick ? [$('#quick-chat-status'), $('#script-rewrite')] : [$('#chat-status')],
      history: [$(quick ? '#quick-chat-log' : '#chat-messages')],
      replay: () =>
        playReply(
          kind,
          (quick ? state().quick : library().tavernChat).findLast(
            (message) => message.role === 'assistant',
          ),
        ),
      onClose() {
        request?.abort();
      },
    });
  }
  function open(location) {
    if (session.runtime.mode !== 'inn' || !CHAT_PLACES[location]) return;
    place = location;
    activities = tavernActivities(characters(), place);
    if (!state().selectionInitialized) {
      state().selected = characters()
        .filter((member) => library().party.includes(member.id))
        .map((member) => member.id);
      state().selectionInitialized = true;
    }
    const marker = `${
      state()
        .selected.map((id) => library().characters.find((member) => member.id === id)?.setting.name)
        .filter(Boolean)
        .join('、') || '独自一人'
    }来了，在${CHAT_PLACES[place].name}处交流。`;
    if (state().lastLocation !== marker) {
      library().tavernChat.push({
        id: crypto.randomUUID(),
        role: 'system',
        divider: true,
        content: marker,
      });
      state().lastLocation = marker;
      context.generation.save();
    }
    presentation.conversation(place, activities);
    renderHistory();
    $('#chat-status').textContent = '';
    if (context.gal?.enabled) openGal('chat');
    else if (!dialog.open) dialog.showModal();
    context.onboarding?.chatOpened(place);
  }
  function input(kind, text) {
    const quick = kind === 'quick-chat';
    const members = quick
      ? library()
          .party.filter(Boolean)
          .map((id) => library().characters.find((member) => member.id === id))
      : library().characters;
    const book = session.ai.activeScript;
    const record = book && library().history.find((item) => item.runId === book.runId);
    return {
      text,
      protagonistId: library().campaign?.protagonistId || null,
      relationships: structuredClone(library().relationships || {}),
      archiveContext: relevantArchives(
        library(),
        text +
          '\n' +
          (library().tavernChat || [])
            .slice(-6)
            .map((item) => item.content)
            .join('\n'),
        quick ? session.battle.state.map : null,
      ),
      place,
      selected: quick ? members.map((member) => member.id) : state().selected,
      characters: members.map(settingOnly),
      activities: activities
        .filter((activity) => state().selected.includes(activity.id))
        .map((activity) => activity.text)
        .join('\n'),
      previousScript: quick ? '' : previousDungeonMemory(library()),
      environment: quick
        ? `${$('#mode-label').textContent}；第${session.battle.state.round}回合，阶段${session.battle.state.phase}。\n${
            record?.lines
              .filter((line) => line.encounter === session.battle.state.encounter)
              .map((line) => memoryText(line.text, line.summary))
              .join('\n') || ''
          }`
        : '',
      history: memoryChat(quick ? state().quick : library().tavernChat || []),
    };
  }
  function status(kind, text, { technical = false } = {}) {
    $(kind === 'chat' ? '#chat-status' : '#quick-chat-status').textContent = text;
    context.gal?.feedback(kind, technical ? '' : text);
  }
  function busy(value) {
    state().sending = value;
    document.querySelectorAll('[data-chat-retry]').forEach((button) => {
      button.disabled = value;
    });
    for (const id of ['chat-send', 'quick-chat-send', 'script-rewrite', 'chat-begin'])
      $('#' + id).disabled = value;
    $('#chat-cancel').hidden = !value;
  }
  async function send(kind, retryId = null) {
    if (skippingAi(session.ai.generationOptions)) return;
    if (kind === 'quick-chat' && session.ai.activeScript?.recollection) return;
    if (request || rewrite) return;
    if (kind === 'chat' ? session.runtime.mode !== 'inn' : session.runtime.mode !== 'battle')
      return;
    const field = $(kind === 'chat' ? '#chat-input' : '#quick-chat-input');
    const history = kind === 'chat' ? (library().tavernChat ||= []) : state().quick;
    const retryIndex = retryId
      ? history.findIndex((message) => message.id === retryId && message.role === 'user')
      : -1;
    if (retryId && retryIndex < 0) return;
    const originalReply =
      retryId && history[retryIndex + 1]?.role === 'assistant' ? history[retryIndex + 1] : null;
    const text = retryId ? history[retryIndex].content : field.value.trim();
    if (!text) return;
    const epoch = revision,
      token = session.runtime.token;
    const payload = input(kind, text);
    if (retryId) {
      payload.history = memoryChat(history.slice(0, retryIndex));
      payload.archiveContext = relevantArchives(
        library(),
        text +
          '\n' +
          payload.history
            .slice(-6)
            .map((message) => message.content)
            .join('\n'),
        kind === 'quick-chat' ? session.battle.state.map : null,
      );
    }
    const selected =
      kind === 'chat'
        ? [...state().selected]
        : library().party.filter((id) => id && id !== library().campaign?.protagonistId);
    const userMessage = retryId
      ? history[retryIndex]
      : {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          ...presentation.speaker('user'),
        };
    const replySpeaker = presentation.speaker('assistant', selected);
    if (!retryId) {
      history.push(userMessage);
      if (kind === 'chat') context.generation.save();
      field.value = '';
    }
    request = new AbortController();
    const started = performance.now();
    const signal = request.signal;
    if (context.gal?.enabled) context.gal.waiting('正在倾听……');
    busy(true);
    const log = $(kind === 'chat' ? '#chat-messages' : '#quick-chat-log');
    if (!retryId) presentation.append(log, userMessage);
    const pending = presentation.append(log, {
      role: 'assistant',
      content: retryId ? '正在重试这条消息…' : '正在倾听你的话…',
      ...replySpeaker,
      pending: true,
    });
    if (retryId) {
      const anchor = [...log.querySelectorAll('[data-message-id]')].find(
        (element) => element.dataset.messageId === retryId,
      );
      anchor?.after(pending);
      pending.scrollIntoView({ block: 'nearest' });
    }
    let stream = '';
    try {
      await context.extensions.activate(kind);
      if (kind === 'chat') await context.extensions.flush?.();
      const result = await api(`generate/${kind}`, payload, {
        signal: request.signal,
        onDelta(delta) {
          stream += delta;
          const body = streamingChatText(stream);
          if (body !== null) pending.querySelector('.mes_text').textContent = body;
          if (retryId) pending.scrollIntoView({ block: 'nearest' });
          else log.scrollTop = log.scrollHeight;
        },
      });
      if (
        epoch !== revision ||
        session.runtime.disposed ||
        (kind === 'quick-chat' && token !== session.runtime.token)
      )
        return;
      const reply = {
        id: originalReply?.id || crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        display: result.display,
        ...replySpeaker,
      };
      if (retryId) history.splice(retryIndex + 1, originalReply ? 1 : 0, reply);
      else history.push(reply);
      if (state().responseErrors) delete state().responseErrors[userMessage.id];
      if (kind === 'chat') {
        applyRelationshipActions(
          library(),
          originalReply
            ? { affection: [], agreeToAdventure: result.actions?.agreeToAdventure || [] }
            : result.actions,
        );
        presentation.conversation(place, activities);
        context.generation.save();
        context.onboarding?.chatFinished(place);
      }
      if (retryId) {
        presentation.history(kind);
        [...log.querySelectorAll('[data-message-id]')]
          .find((element) => element.dataset.messageId === reply.id)
          ?.scrollIntoView({ block: 'nearest' });
      } else presentation.append(log, reply);
      if (context.gal?.enabled) {
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, Math.max(0, 2000 - (performance.now() - started)));
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
        });
        if (!signal.aborted && epoch === revision && !session.runtime.disposed)
          playReply(kind, reply);
      }
      state().lastRequest = result.request;
      status(
        kind,
        `输入约 ${result.request.tokens.inputEstimate} TK（${result.request.tokens.tokenizer || '估算'}） · 实际 ${result.usage.input} / ${result.usage.output} TK${result.request.warnings.length ? ' · ' + result.request.warnings.join('；') : ''}`,
        { technical: true },
      );
    } catch (failure) {
      if (epoch === revision && !session.runtime.disposed) {
        if (typeof failure.diagnostic?.rawText === 'string' && failure.diagnostic.rawText) {
          const failedReply = {
            role: 'assistant',
            error: failure.message,
            content: failure.diagnostic.rawText,
          };
          (state().responseErrors ||= {})[userMessage.id] = failedReply;
          if (retryId) presentation.history(kind);
          else presentation.append(log, failedReply);
        }
        status(
          kind,
          failure.name === 'AbortError'
            ? '已取消回应，你的发言已保留在记录中。'
            : `${failure.message}；你的发言已保留在记录中。`,
        );
      }
    } finally {
      pending.remove();
      request = null;
      busy(false);
      context.gal?.settled(kind);
    }
  }
  async function resetScript() {
    if (skippingAi(session.ai.generationOptions)) return;
    const book = session.ai.activeScript;
    if (book?.recollection) return;
    if (request || rewrite || !book || session.runtime.mode !== 'battle') return;
    if (session.battle.state.encounter >= FINAL_ENCOUNTER) {
      status('quick-chat', '已进入最终战，没有未经历的战斗可改写。');
      return;
    }
    const token = session.runtime.token,
      epoch = revision;
    const base = book.generationInput || context.generation.scriptInput();
    const payload = {
      ...structuredClone(base),
      history: memoryHistory(library(), base.history || []),
      protagonistId: library().campaign?.protagonistId || null,
      party: structuredClone(book.party),
      boss: book.boss,
      chapter: book.chapter,
      exploration: book.exploration,
      archiveContext: relevantArchives(
        library(),
        state()
          .quick.map((message) => message.content)
          .join('\n'),
        book.exploration ? routeKey(book.exploration) : session.battle.state.map,
      ),
      rewrite: {
        lockedThrough: session.battle.state.encounter,
        currentScript: scriptMemory(library(), book),
        conversations: memoryChat(state().quick),
      },
    };
    rewrite = new AbortController();
    busy(true);
    status('quick-chat', '正在结合闲聊改写后续剧本…');
    try {
      await context.extensions.activate('script');
      const result = await api('generate/script', payload, { signal: rewrite.signal });
      if (
        epoch !== revision ||
        token !== session.runtime.token ||
        session.ai.activeScript?.runId !== book.runId ||
        session.runtime.disposed
      )
        return;
      const merged = mergeFutureScript(
        session.ai.activeScript,
        result.entry,
        session.battle.state.encounter,
      );
      session.ai.activeScript = merged;
      if (merged.encounters && session.journey.expedition?.exploration)
        session.journey.expedition.exploration.encounters = structuredClone(merged.encounters);
      const index = library().scripts.findIndex((entry) => entry.id === book.id);
      if (index >= 0) {
        const { runId: _runId, ...saved } = merged;
        library().scripts[index] = saved;
      }
      context.generation.save();
      status(
        'quick-chat',
        `后续剧本已更新；前 ${session.battle.state.encounter + 1} 场保持原样。输入约 ${result.diagnostic.request.tokens.inputEstimate} TK。`,
        { technical: true },
      );
    } catch (failure) {
      if (epoch === revision)
        status('quick-chat', failure.name === 'AbortError' ? '改写已取消' : failure.message);
    } finally {
      rewrite = null;
      busy(false);
    }
  }
  function leave() {
    context.gal?.cancel('chat');
    context.gal?.cancel('quick-chat');
    revision++;
    request?.abort();
    rewrite?.abort();
    for (const message of state().quick)
      if (state().responseErrors) delete state().responseErrors[message.id];
    state().quick = [];
    state().lastRequest = null;
    $('#quick-chat-log').replaceChildren();
    $('#quick-chat-input').value = '';
    $('#quick-chat-status').textContent = '';
    if (dialog.open) dialog.close();
  }
  events.on($('#chat-begin'), 'click', () => {
    state().selected = [...$('#chat-characters').querySelectorAll('input:checked')].map(
      (checkbox) => checkbox.value,
    );
    presentation.conversation(place, activities);
    const names =
      state()
        .selected.map((id) => library().characters.find((member) => member.id === id)?.setting.name)
        .filter(Boolean)
        .join('、') || '独自一人';
    const marker = `${names}来了，在${CHAT_PLACES[place].name}处交流。`;
    if (state().lastLocation !== marker) {
      library().tavernChat.push({
        id: crypto.randomUUID(),
        role: 'system',
        divider: true,
        content: marker,
      });
      state().lastLocation = marker;
      context.generation.save();
    }
    renderHistory();
    $('#chat-input').focus();
  });
  events.on($('#chat-participants'), 'change', () => {
    const previous = new Set(state().selected);
    const checked = [...$('#chat-participants').querySelectorAll('input:checked')].map(
      (input) => input.value,
    );
    state().selected = [
      ...state().selected.filter((id) => checked.includes(id)),
      ...checked.filter((id) => !previous.has(id)),
    ];
    if (context.gal?.enabled) context.gal.selection(state().selected);
    const removed = [...previous]
      .filter((id) => !state().selected.includes(id))
      .map((id) => library().characters.find((member) => member.id === id)?.setting.name)
      .filter(Boolean);
    const added = state()
      .selected.filter((id) => !previous.has(id))
      .map((id) => library().characters.find((member) => member.id === id)?.setting.name)
      .filter(Boolean);
    library().tavernChat.push({
      id: crypto.randomUUID(),
      role: 'system',
      divider: true,
      content: [
        removed.length ? removed.join('、') + '离开了。' : '',
        added.length ? added.join('、') + '来了。' : '',
        `当前在${CHAT_PLACES[place].name}处的同行者：${
          state()
            .selected.map(
              (id) => library().characters.find((member) => member.id === id)?.setting.name,
            )
            .filter(Boolean)
            .join('、') || '无，玩家独处'
        }。`,
      ]
        .filter(Boolean)
        .join(''),
    });
    presentation.conversation(place, activities);
    renderHistory();
    context.generation.save();
  });
  events.on($('#chat-place-select'), 'change', () => {
    place = $('#chat-place-select').value;
    activities = tavernActivities(characters(), place);
    presentation.conversation(place, activities);
    const marker = `${
      state()
        .selected.map((id) => library().characters.find((member) => member.id === id)?.setting.name)
        .filter(Boolean)
        .join('、') || '独自一人'
    }在${CHAT_PLACES[place].name}处交流。`;
    library().tavernChat.push({
      id: crypto.randomUUID(),
      role: 'system',
      divider: true,
      content: marker,
    });
    state().lastLocation = marker;
    context.generation.save();
    renderHistory();
  });
  events.on($('#chat-messages'), 'click', (event) => {
    const retry = event.target.closest('[data-chat-retry]');
    if (retry) {
      void send('chat', retry.dataset.chatRetry);
      return;
    }
    const button = event.target.closest('[data-chat-delete]');
    if (!button || request) return;
    const index = library().tavernChat.findIndex((item) => item.id === button.dataset.chatDelete);
    if (index < 0) return;
    library().tavernChat.splice(index, 1);
    if (state().responseErrors) delete state().responseErrors[button.dataset.chatDelete];
    context.generation.save();
    renderHistory();
  });
  events.on($('#quick-chat-log'), 'click', (event) => {
    const retry = event.target.closest('[data-chat-retry]');
    if (retry) {
      void send('quick-chat', retry.dataset.chatRetry);
      return;
    }
    const button = event.target.closest('[data-chat-delete]');
    if (!button || request || rewrite) return;
    const index = state().quick.findIndex((item) => item.id === button.dataset.chatDelete);
    if (index < 0) return;
    state().quick.splice(index, 1);
    if (state().responseErrors) delete state().responseErrors[button.dataset.chatDelete];
    context.generation.save();
    context.checkpoint?.saveNow();
    renderHistory('quick-chat');
  });
  events.on($('#chat-characters'), 'change', presentation.selectionCount);
  events.on($('#chat-close'), 'click', () => dialog.close());
  events.on(document, 'gal-compose', () => {
    if (context.gal?.enabled) {
      if (session.runtime.mode === 'battle') openGal('quick-chat');
      else openGal('chat');
    }
  });
  events.on(document, 'gal-open-quick', () => openGal('quick-chat'));
  events.on(document, 'gal-rewrite-script', () => $('#script-rewrite').click());
  events.on(dialog, 'close', () => request?.abort());
  events.on($('#chat-cancel'), 'click', () => {
    request?.abort();
    rewrite?.abort();
  });
  events.on($('#chat-form'), 'submit', (event) => {
    event.preventDefault();
    void send('chat');
  });
  events.on($('#quick-chat-form'), 'submit', (event) => {
    event.preventDefault();
    void send('quick-chat');
  });
  for (const id of ['chat-input', 'quick-chat-input']) {
    events.on($('#' + id), 'keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
        return;
      event.preventDefault();
      event.currentTarget.form.requestSubmit();
    });
  }
  events.on($('#script-rewrite'), 'click', () => {
    if (preferences.getItem('wanxiang.rewrite-help.dismissed.v1') === 'true') void resetScript();
    else if (!rewriteHelp.open) rewriteHelp.showModal();
  });
  events.on($('#rewrite-help-cancel'), 'click', () => rewriteHelp.close());
  events.on($('#rewrite-help-confirm'), 'click', () => {
    if ($('#rewrite-help-remember').checked)
      preferences.setItem('wanxiang.rewrite-help.dismissed.v1', 'true');
    rewriteHelp.close();
    void resetScript();
  });
  events.on($('#quick-chat-toggle'), 'click', () => {
    const body = $('#quick-chat-body');
    body.hidden = !body.hidden;
    $('#quick-chat-toggle').setAttribute('aria-expanded', String(!body.hidden));
    $('#quick-chat-toggle').textContent = body.hidden ? '展开闲聊 ⌄' : '收起闲聊 ⌃';
  });
  events.on(window, 'message', (event) => {
    if (
      event.origin === location.origin &&
      event.source === $('#inn-frame iframe')?.contentWindow &&
      event.data?.type === 'tavern-talk'
    )
      open(event.data.place);
    if (event.data?.type === 'chat-frame-size') {
      const frame = [...document.querySelectorAll('iframe.mes_text')].find(
        (frame) => frame.contentWindow === event.source,
      );
      if (frame && Number.isFinite(event.data.height))
        frame.style.height = `${Math.max(40, Math.min(5000, event.data.height))}px`;
    }
  });
  function enteredDungeon() {
    library().tavernChat = (library().tavernChat || []).filter(
      (message) => !message.divider && message.role !== 'system',
    );
    state().lastLocation = null;
  }
  function resetSelection() {
    state().selected = [];
    state().selectionInitialized = false;
    state().lastLocation = null;
  }
  return {
    open,
    input,
    leave,
    enteredDungeon,
    resetSelection,
    dispose() {
      leave();
      rewriteHelp.remove();
    },
  };
}
