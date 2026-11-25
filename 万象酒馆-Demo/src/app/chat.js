import { applyFutureDialogue, dialogueTargets, dungeonDialogueScenes } from './future-dialogue.js';
import { skippingAi } from '../generation-options.js';
import { CHAT_PLACES, tavernActivities } from '../chat.js';
import { cityChatPlace } from '../chat-places.js';
import { normalizeSceneEnvironment } from '../scene-environment.js';
import { settingOnly } from '../ai/contracts.js';
import { createChatPresentation } from './chat-presentation.js';
import { query as $ } from './dom.js';
import { relevantArchives } from '../archives.js';
import { applyRelationshipActions } from '../relationships.js';
import { streamingChatText } from '../ai/output-tags.js';
import { gameTime, memoryChat, memoryText } from '../memory.js';
import { tavernTime } from '../daily.js';
import { resolveGalBackdrop } from './gal-backdrop.js';

const HALL_CHAT_PLACES = Object.freeze(['bar', 'bar2', 'table', 'table2']);

export function createChat(context) {
  const api = context.apiClient.request;
  const { session, events } = context;
  const placeSelect = $('#chat-place-select');
  const localCharacters = () => context.daily?.chatCharacters() || [];
  const conversationCharacters = () => [
    ...localCharacters(),
    ...library().characters.filter(
      (member) => !localCharacters().some((npc) => npc.id === member.id),
    ),
  ];
  const presentation = createChatPresentation(session, conversationCharacters);
  let place = 'table',
    activities = [],
    request = null,
    revision = 0;
  const state = () => session.ai.chat;
  const library = () => session.ai.library;
  const characters = () =>
    conversationCharacters().filter((member) => member.id !== library().campaign?.protagonistId);
  function interrupt() {
    revision++;
    request?.abort();
  }
  function selectPlace(next) {
    if (place === next) return;
    interrupt();
    context.gal.setEnvironment('chat', null);
    place = next;
  }
  function renderHistory(kind = 'chat') {
    presentation.history(kind);
  }
  function canChangePlace() {
    return HALL_CHAT_PLACES.includes(place) && context.daily?.chatPlaceLocked?.() !== true;
  }
  function renderConversation() {
    const editable = canChangePlace();
    const locations = editable ? HALL_CHAT_PLACES : [place];
    if (
      placeSelect.options.length !== locations.length ||
      locations.some((id, index) => placeSelect.options[index].value !== id)
    ) {
      placeSelect.replaceChildren(...locations.map((id) => new Option(CHAT_PLACES[id].name, id)));
    }
    presentation.conversation(place, { locationLocked: !editable });
  }
  function playReply(kind, reply, after, rawResult = null, actionText = '') {
    if (!reply) return context.shell.toast('还没有可重播的对话');
    const title = kind === 'chat' ? '酒馆 · 片刻交谈' : '旅途 · 片刻闲谈';
    if (rawResult?.dcOutcome?.triggered && context.dice) {
      const done = context.dice.playReply(
        rawResult,
        { owner: kind, title },
        { style: 'free', actionText, claimId: reply.id },
      );
      if (after) void done.then(after);
      return;
    }
    const content = /【(?:旁白|对白[:：])/u.test(reply.content)
      ? reply.content
      : [
          {
            speaker: reply.speakerIds?.length === 1 ? reply.speakerIds[0] : '旁白',
            text: reply.content,
          },
        ];
    const done = context.gal.play(content, {
      owner: kind,
      title,
    });
    if (after) void done.then(after);
  }
  function openGal(kind) {
    const quick = kind === 'quick-chat';
    if (quick && session.runtime.mode !== 'battle') return;
    if (quick && session.ai.activeScript?.recollection) return;
    if ($('#story-feed').open) $('#story-feed').close();
    presentation.history(kind);
    const cityConversation = !quick && cityChatPlace(place);
    const backdrop =
      quick || cityConversation
        ? null
        : resolveGalBackdrop({
            placeId: place,
            timeOfDay: tavernTime(library().daily),
            invitationMode: false,
          });
    context.gal.workspace({
      owner: kind,
      title: quick ? '旅途 · 同行闲谈' : CHAT_PLACES[place].name,
      backdrop,
      shutter: Boolean(backdrop),
      kicker: '漫 步',
      shutterTitle: backdrop?.placeName || CHAT_PLACES[place].name,
      actors: quick
        ? library().party.filter((id) => id && id !== library().campaign?.protagonistId)
        : state().selected,
      selection: quick ? [] : [$('.chat-company')],
      composer: quick ? [$('#quick-chat-form')] : [$('.chat-composer')],
      auxiliary: quick ? [$('#quick-chat-status')] : [$('#chat-status')],
      history: [$(quick ? '#quick-chat-log' : '#chat-messages')],
      replay: () =>
        playReply(
          kind,
          (quick ? state().quick : library().tavernChat).findLast(
            (message) => message.role === 'assistant',
          ),
        ),
      onClosing: interrupt,
      onClose: interrupt,
    });
  }
  function open(location, actorId = null, activity = false) {
    if (session.runtime.mode !== 'inn' || !Object.hasOwn(CHAT_PLACES, location)) return;
    if (context.daily?.allowTalk() === false || context.daily?.onInvitation()) return;
    const current = context.daily?.chatPlace();
    selectPlace(cityChatPlace(current) ? current : location);
    if (actorId && characters().some((member) => member.id === actorId)) {
      state().selected = [actorId];
      state().selectionInitialized = true;
    }
    const available = new Set(characters().map((member) => member.id));
    state().selected = state().selected.filter((id) => available.has(id));
    activities = tavernActivities(characters(), place);
    if (!state().selectionInitialized) {
      state().selected = characters()
        .filter((member) =>
          (context.daily?.outingCompanions() || library().party).includes(member.id),
        )
        .map((member) => member.id);
      state().selectionInitialized = true;
    }
    const marker = `${
      state()
        .selected.map(
          (id) => conversationCharacters().find((member) => member.id === id)?.setting.name,
        )
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
    renderConversation();
    renderHistory();
    $('#chat-status').textContent = '';
    openGal('chat');
    context.daily?.trackChat(activity);
    context.onboarding?.chatOpened(place);
  }
  function futureScenes(kind) {
    const travel = context.daily?.overlandDialogueScenes?.() || [];
    if (travel.length || kind !== 'quick-chat') return travel;
    return dungeonDialogueScenes(
      session.ai.activeScript,
      session.journey.expedition,
      session.battle.state.encounter,
    );
  }
  function input(kind, text) {
    const quick = kind === 'quick-chat';
    const members = quick
      ? (session.journey.expedition?.partyIds || library().party)
          .filter(Boolean)
          .map((id) => library().characters.find((member) => member.id === id))
          .filter(Boolean)
      : conversationCharacters();
    const book = session.ai.activeScript;
    const record = book && library().history.find((item) => item.runId === book.runId);
    return {
      text,
      dialogueScenes: dialogueTargets(futureScenes(kind)),
      dialogueContext: context.daily?.overlandDialogueContext?.(),
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
      ...(!quick && cityChatPlace(place) ? { timeOfDay: tavernTime(library().daily) } : {}),
      selected: quick ? members.map((member) => member.id) : state().selected,
      characters: members.map(settingOnly),
      activities: activities
        .filter((activity) => state().selected.includes(activity.id))
        .map((activity) => activity.text)
        .join('\n'),
      environment: quick
        ? `${$('#mode-label').textContent}；第${session.battle.state.round}回合，阶段${session.battle.state.phase}。\n${
            record?.lines
              .filter((line) => line.encounter === session.battle.state.encounter)
              .map((line) => memoryText(line.text, line.summary))
              .join('\n') || ''
          }`
        : context.daily?.chatEnvironment() || '',
      history: memoryChat(
        quick
          ? state().quick
          : (library().tavernChat || []).filter((message) => !message.journeyArchived),
      ),
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
    for (const id of ['chat-send', 'quick-chat-send']) $('#' + id).disabled = value;
    $('#chat-cancel').hidden = !value;
  }
  async function send(kind, retryId = null) {
    if (skippingAi(session.ai.generationOptions)) return;
    if (kind === 'quick-chat' && session.ai.activeScript?.recollection) return;
    if (request) return;
    if (kind === 'chat' && context.daily?.allowTalk() === false) return;
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
    const { mode, token } = session.runtime;
    const epoch = revision;
    const scene = context.daily?.scene();
    const payload = input(kind, text);
    const cityPlace = kind === 'chat' ? cityChatPlace(payload.place) : null;
    const sameTurn = () =>
      epoch === revision &&
      !session.runtime.disposed &&
      session.runtime.mode === mode &&
      session.runtime.token === token &&
      (kind !== 'chat' || (payload.place === place && scene === context.daily?.scene()));
    if (retryId) {
      payload.history = memoryChat(
        history.slice(0, retryIndex).filter((message) => !message.journeyArchived),
      );
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
    const outing = context.daily?.outOfTavern?.();
    const overlandRun = context.daily?.overlandRun?.();
    const currentBook = session.ai.activeScript;
    const userMessage = retryId
      ? history[retryIndex]
      : {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          gameTime: gameTime(library().daily),
          ...(outing ? { outing: true } : {}),
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
    context.gal.waiting();
    busy(true);
    const log = $(kind === 'chat' ? '#chat-messages' : '#quick-chat-log');
    if (!retryId) presentation.append(log, userMessage);
    const pending = presentation.append(log, {
      role: 'assistant',
      content: retryId ? '正在重试这条消息……' : '正在生成回复……',
      speakerName: '提示',
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
      const result = await api(`generate/${kind}`, payload, {
        signal,
        onDelta(delta) {
          if (signal.aborted || !sameTurn()) return;
          stream += delta;
          const body = streamingChatText(stream);
          if (body !== null) pending.querySelector('.mes_text').textContent = body;
          if (retryId) pending.scrollIntoView({ block: 'nearest' });
          else log.scrollTop = log.scrollHeight;
        },
      });
      if (!sameTurn()) return;
      signal.throwIfAborted();
      const reply = {
        id: originalReply?.id || crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        display: result.display,
        ...replySpeaker,
        gameTime: userMessage.gameTime || gameTime(library().daily),
        ...(userMessage.outing ? { outing: true } : {}),
      };
      if (retryId) history.splice(retryIndex + 1, originalReply ? 1 : 0, reply);
      else history.push(reply);
      context.quests?.collect(result.quest, userMessage.id, context.daily?.scene());
      const player = library().characters.find(
        (member) => member.id === library().campaign?.protagonistId,
      );
      if (overlandRun === context.daily?.overlandRun?.() && currentBook === session.ai.activeScript)
        applyFutureDialogue(
          futureScenes(kind),
          result.dialogue,
          reply.id,
          player && { id: player.id, name: player.setting.name },
        );
      if (overlandRun && overlandRun === context.daily?.overlandRun?.())
        context.daily.recordOverlandDialogue(text, result.content, userMessage.id);
      if (kind === 'quick-chat' && currentBook && !overlandRun) {
        const record = library().history.find((item) => item.runId === currentBook.runId);
        if (record) {
          record.lines = record.lines.filter((line) => line.chatId !== userMessage.id);
          record.lines.push(
            {
              speaker: '玩家',
              text,
              encounter: session.battle.state.encounter,
              stage: 'quick-chat',
              chatId: userMessage.id,
            },
            {
              speaker: reply.speakerName || '旁白',
              text: reply.content,
              encounter: session.battle.state.encounter,
              stage: 'quick-chat',
              chatId: userMessage.id,
            },
          );
        }
        context.generation.save();
        context.checkpoint?.saveNow();
      }
      const outOfActions = kind === 'chat' && !originalReply && context.daily?.talkFinished();
      if (state().responseErrors) delete state().responseErrors[userMessage.id];
      if (kind === 'chat') {
        applyRelationshipActions(
          library(),
          originalReply
            ? { affection: [], agreeToAdventure: result.actions?.agreeToAdventure || [] }
            : result.actions,
          localCharacters()
            .filter((member) => member.source === 'town' && selected.includes(member.id))
            .map((member) => member.id),
        );
        renderConversation();
        context.generation.save();
        context.onboarding?.chatFinished(place);
      }
      if (retryId) {
        presentation.history(kind);
        [...log.querySelectorAll('[data-message-id]')]
          .find((element) => element.dataset.messageId === reply.id)
          ?.scrollIntoView({ block: 'nearest' });
      } else presentation.append(log, reply);
      await new Promise((resolve) => {
        if (signal.aborted) return resolve();
        const timeout = setTimeout(done, Math.max(0, 2000 - (performance.now() - started)));
        function done() {
          clearTimeout(timeout);
          signal.removeEventListener('abort', done);
          resolve();
        }
        signal.addEventListener('abort', done, { once: true });
      });
      if (!sameTurn()) return;
      if (signal.aborted) {
        if (outOfActions) context.daily.returnOuting();
        return;
      }
      if (cityPlace?.placeId && result.environment?.placeId === cityPlace.placeId) {
        const lead = normalizeSceneEnvironment({ ...cityPlace, text: result.environment.text });
        if (lead) context.gal.setEnvironment('chat', lead);
      }
      playReply(
        kind,
        reply,
        outOfActions ? () => context.daily.returnOuting() : null,
        result,
        text,
      );
      state().lastRequest = result.request;
      status(
        kind,
        `输入约 ${result.request.tokens.inputEstimate} TK（${result.request.tokens.tokenizer || '估算'}） · 实际 ${result.usage.input} / ${result.usage.output} TK${result.request.warnings.length ? ' · ' + result.request.warnings.join('；') : ''}`,
        { technical: true },
      );
    } catch (failure) {
      if (sameTurn()) {
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
  function leave() {
    interrupt();
    context.daily?.trackChat(false);
    context.gal?.cancel('chat');
    context.gal?.cancel('quick-chat');
    for (const message of state().quick)
      if (state().responseErrors) delete state().responseErrors[message.id];
    state().quick = [];
    state().lastRequest = null;
    $('#quick-chat-log').replaceChildren();
    $('#quick-chat-input').value = '';
    $('#quick-chat-status').textContent = '';
  }
  events.on($('#chat-participants'), 'change', () => {
    const previous = new Set(state().selected);
    const checked = [...$('#chat-participants').querySelectorAll('input:checked')].map(
      (input) => input.value,
    );
    state().selected = [
      ...state().selected.filter((id) => checked.includes(id)),
      ...checked.filter((id) => !previous.has(id)),
    ];
    context.gal.selection(state().selected);
    const removed = [...previous]
      .filter((id) => !state().selected.includes(id))
      .map((id) => conversationCharacters().find((member) => member.id === id)?.setting.name)
      .filter(Boolean);
    const added = state()
      .selected.filter((id) => !previous.has(id))
      .map((id) => conversationCharacters().find((member) => member.id === id)?.setting.name)
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
              (id) => conversationCharacters().find((member) => member.id === id)?.setting.name,
            )
            .filter(Boolean)
            .join('、') || '无，玩家独处'
        }。`,
      ]
        .filter(Boolean)
        .join(''),
    });
    renderConversation();
    renderHistory();
    context.generation.save();
  });
  events.on(placeSelect, 'change', () => {
    const next = placeSelect.value;
    if (!canChangePlace() || !HALL_CHAT_PLACES.includes(next)) {
      placeSelect.value = place;
      return;
    }
    if (place === next) return;
    selectPlace(next);
    activities = tavernActivities(characters(), place);
    renderConversation();
    const nextBackdrop = resolveGalBackdrop({
      placeId: place,
      timeOfDay: tavernTime(library().daily),
      invitationMode: false,
    });
    context.gal.setBackdrop(nextBackdrop, {
      shutter: Boolean(nextBackdrop),
      kicker: '换 景',
      title: nextBackdrop?.placeName || CHAT_PLACES[place].name,
    });
    const marker = `${
      state()
        .selected.map(
          (id) => conversationCharacters().find((member) => member.id === id)?.setting.name,
        )
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
    if (!button || request) return;
    const index = state().quick.findIndex((item) => item.id === button.dataset.chatDelete);
    if (index < 0) return;
    state().quick.splice(index, 1);
    if (state().responseErrors) delete state().responseErrors[button.dataset.chatDelete];
    context.generation.save();
    context.checkpoint?.saveNow();
    renderHistory('quick-chat');
  });
  events.on(document, 'gal-compose', () => {
    if (session.runtime.mode === 'battle') openGal('quick-chat');
    else openGal('chat');
  });
  events.on(document, 'gal-open-quick', () => openGal('quick-chat'));
  events.on($('#chat-cancel'), 'click', () => {
    request?.abort();
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
    ) {
      if (event.data.characterId) {
        const member = characters().find((entry) => entry.id === event.data.characterId);
        if (!member) return;
        state().selected = [member.id];
        state().selectionInitialized = true;
      }
      open(event.data.place);
    }
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
    },
  };
}
