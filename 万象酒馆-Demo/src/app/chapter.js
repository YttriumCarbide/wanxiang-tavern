import { townResidents } from '../town-residents.js';
import { TOWN_SCENES } from '../daily.js';
import { OVERLAND_ROAD } from '../content/overland-road.js';
import {
  CHAPTER_LINES,
  chapterBattleSpec,
  chapterCompanion,
  chapterSceneCharacters,
} from '../chapters/starbell-content.js';
import {
  starbellState,
  STARBELL_ENABLED,
  restoreStarbell,
  chapterDay,
  chapterObjective,
  chapterActions,
  applyChapterAction,
  chapterBattleResult,
  visitChapterScene,
  confirmChapterTask,
} from '../chapters/starbell-state.js';
import { compileRoster } from '../ai/library.js';
import { completeEncounter } from '../expedition.js';
import { restoreGrowth, claimCompletionExperience } from '../growth.js';
import { claimBattleRewards } from '../rewards.js';
import { diningBattleCompleted } from '../dining.js';
import { explorationHref } from '../exploration/scenes.js';
import { settingOnly } from '../ai/contracts.js';
import { createRawResponse } from './raw-response.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import { CHAPTER_TASKS, chapterTaskTurn, acceptChapterTask } from '../chapters/starbell-rp.js';
import { adventureReady } from '../adventure/state.js';
import { skippingAi } from '../generation-options.js';
import { starbellDefense } from '../chapters/starbell-defense.js';
import { CHAPTER_SIDE_LINES, CHAPTER_TASK_ENDINGS } from '../chapters/starbell-dialogue.js';
import {
  CHAPTER_INVESTIGATIONS,
  investigationProgress,
  startInvestigation,
  discoverChapterClue,
} from '../chapters/starbell-investigation.js';

/** An authored chapter coordinates existing exploration, Gal, saves and battle controllers. */
export function createChapter(context) {
  const { session, events } = context;
  const button = document.createElement('button');
  button.id = 'chapter-open';
  button.textContent = '任务简介';
  document.querySelector('.app-header nav').prepend(button);
  const nextButton = document.createElement('button');
  nextButton.id = 'chapter-next';
  nextButton.className = 'talk-open';
  nextButton.hidden = true;
  const controls = document.createElement('nav');
  controls.id = 'chapter-controls';
  controls.setAttribute('aria-label', '当前场景行动');
  const talkButton = document.createElement('button');
  talkButton.id = 'chapter-talk';
  talkButton.className = 'talk-open';
  talkButton.textContent = '交流';
  talkButton.setAttribute('aria-expanded', 'false');
  const actions = document.createElement('div');
  actions.id = 'chapter-actions';
  actions.hidden = true;
  controls.append(nextButton, talkButton);
  document.querySelector('.chat-company').prepend(actions);
  document.body.append(controls);
  const investigationNotice = document.createElement('div');
  investigationNotice.className = 'chapter-investigation-notice';
  investigationNotice.textContent = '调查开始';
  investigationNotice.setAttribute('role', 'status');
  investigationNotice.hidden = true;
  document.body.append(investigationNotice);
  let noticeAnimation = null;
  const tracker = document.createElement('section');
  tracker.id = 'chapter-tracker';
  tracker.innerHTML = '<span aria-hidden="true">✧</span><div><small>主线任务</small><p></p></div>';
  document.body.append(tracker);
  const panel = document.createElement('aside');
  panel.id = 'chapter-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<header><strong>任务简介</strong><button data-chapter-collapse aria-label="收起任务简介">×</button></header><p data-chapter-objective></p>';
  document.body.append(panel);
  const chatHost = document.createElement('section');
  chatHost.hidden = true;
  chatHost.innerHTML =
    '<form class="chapter-chat-form"><label>你的话<textarea rows="3" maxlength="3000" placeholder="说点什么，或描述你想做的事……"></textarea></label><button class="primary" type="submit" aria-label="发送">➤</button></form><p class="chapter-chat-status" role="status"></p>';
  document.body.append(chatHost);
  const form = chatHost.querySelector('form');
  const input = form.querySelector('textarea');
  const status = chatHost.querySelector('p');
  const outcome = document.createElement('section');
  outcome.className = 'chapter-chat-progress';
  outcome.setAttribute('aria-label', '当前调查进展');
  chatHost.append(outcome);
  const raw = createRawResponse(events, 'chapter-raw', '城市交谈 · 原始返回');
  let scene = 'tavern',
    busy = false,
    collapsed = true,
    request = null;
  let targetTask = null;
  let doorLessonPending = false;
  let afterBattle = null,
    disposed = false;
  const clueArt = document.createElement('img');
  clueArt.className = 'chapter-clue-art';
  clueArt.hidden = true;
  document.querySelector('#gal-stage').append(clueArt);
  const library = () => session.ai.library;
  const state = () => starbellState(library());
  const currentFrame = () => document.querySelector('#inn-frame iframe');
  const runId = () => `starbell-${state().attempt}`;
  const eligible = () =>
    (library().progression?.settlements.length || 0) >= 2 || state().phase !== 'idle';
  const save = () => context.generation.save();

  function refresh() {
    if (!STARBELL_ENABLED) {
      for (const element of [button, nextButton, tracker, panel, actions, investigationNotice])
        element.hidden = true;
      talkButton.hidden =
        session.runtime.mode !== 'inn' ||
        session.runtime.needsStart ||
        scene === 'tavern' ||
        OVERLAND_ROAD.some(({ id }) => id === scene);
      controls.hidden = talkButton.hidden;
      currentFrame()?.contentWindow?.postMessage(
        { type: 'starbell-context', enabled: false, npcs: [], investigation: null },
        location.origin,
      );
      return;
    }
    const data = state();
    button.hidden = session.runtime.mode !== 'inn' || session.runtime.needsStart || !eligible();
    button.innerHTML = html`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H5V4Zm9 3c0-2 2-3 5-3v14c-2 0-4 1-5 3"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        /></svg
      ><span>任务简介</span>`;
    button.setAttribute('aria-expanded', String(!collapsed));
    const available =
      data.phase === 'failed'
        ? [{ id: 'restart', label: '休整后再出发' }]
        : chapterActions(data, scene);
    const next = available.find((action) => !/^(meet|help|finish|invite|chat)-/.test(action.id));
    const investigation = investigationProgress(data, next?.id);
    const dialogueTask =
      next &&
      !investigation &&
      !next.id.startsWith('battle-') &&
      next.id !== 'next-day' &&
      next.id !== 'restart';
    nextButton.hidden = button.hidden || !next || dialogueTask;
    nextButton.textContent = investigation
      ? investigation.started
        ? '推理'
        : '调查'
      : next?.id.startsWith('battle-')
        ? '整备出战'
        : Object.hasOwn(CHAPTER_TASKS, next?.id || '')
          ? '调查与交谈'
          : next?.label || '';
    nextButton.title = next?.label || '';
    nextButton.disabled =
      busy || Boolean(request) || Boolean(investigation?.started && !investigation.ready);
    nextButton.dataset.progress = investigation?.started
      ? `${investigation.found.length}/${investigation.required}`
      : '';
    nextButton.setAttribute(
      'aria-label',
      investigation?.started
        ? `推理，已发现${investigation.found.length}条线索，需要${investigation.required}条`
        : nextButton.textContent,
    );
    nextButton.dataset.chapterAction = next?.id || '';
    const otherActions = available.filter((action) => action !== next || dialogueTask);
    talkButton.hidden =
      session.runtime.mode !== 'inn' || session.runtime.needsStart || scene === 'tavern';
    talkButton.disabled = busy || Boolean(request);
    controls.hidden = nextButton.hidden && talkButton.hidden;
    const attention = Boolean(dialogueTask);
    talkButton.classList.toggle('quest-attention', attention);
    document.querySelector('.gal-people-launcher')?.classList.toggle('quest-attention', attention);
    actions.hidden = !otherActions.length;
    actions.innerHTML = otherActions
      .map(
        (action) =>
          html`<button data-chapter-action="${action.id}" ${busy ? 'disabled' : ''}>
            ${escapeText(action.label)}
          </button>`,
      )
      .join('');
    tracker.hidden = button.hidden || data.phase === 'idle';
    tracker.querySelector('p').textContent = chapterObjective(data);
    panel.hidden = session.runtime.mode !== 'inn' || collapsed;
    const day =
      data.phase === 'morning'
        ? '第一天 · 上午'
        : data.phase === 'afternoon'
          ? '第一天 · 下午'
          : `第${chapterDay(data)}天 · ${data.phase === 'won' ? '星灯未熄' : data.phase === 'failed' ? '本次失败' : '自由活动'}`;
    currentFrame()?.contentWindow?.postMessage(
      {
        type: 'starbell-context',
        enabled: data.phase !== 'idle',
        day,
        phase: data.phase,
        npcs: chapterSceneCharacters(data, scene)
          .filter((member) => !library().party.includes(member.id))
          .map((member) => ({ id: member.id, name: member.setting.name })),
        investigation: investigation
          ? {
              key: next.id,
              started: investigation.started,
              found: investigation.found,
              available: !busy && !request,
            }
          : null,
      },
      location.origin,
    );
    panel.querySelector('[data-chapter-objective]').textContent = chapterObjective(data);
    renderTask();
  }
  function navigate(id) {
    if (session.runtime.mode !== 'inn' || busy || request || !currentFrame()) return;
    if (targetTask) {
      targetTask = null;
      context.gal.cancel();
    }
    scene = id;
    collapsed = true;
    currentFrame().src = explorationHref(id);
    refresh();
  }
  function renderTask() {
    const quest = CHAPTER_TASKS[targetTask];
    outcome.hidden = !quest;
    if (!quest) return;
    const current = state().tasks[targetTask];
    const investigation = CHAPTER_INVESTIGATIONS[targetTask];
    const clues = investigation
      ? investigation.clues
          .filter((clue) => investigationProgress(state(), targetTask).found.includes(clue.id))
          .map((clue) => ({ location: clue.name, detail: clue.detail }))
      : quest.overview;
    const ready = current && adventureReady({ quest }, current);
    outcome.innerHTML = html`<details>
        <summary>${escapeText(quest.title)} · ${ready ? '已有结果' : '调查进展'}</summary>
        <ul>
          ${quest.goals.map((goal) => html`<li>${current?.goals[goal.id]?.status === 'completed' ? '✓ ' : '○ '}${escapeText(goal.objective)}</li>`).join('')}
        </ul>
        <p>${escapeText(investigation?.objective || quest.description)}</p>
        <dl>
          ${clues
            .map(
              (item) =>
                html`<dt>${escapeText(item.location)}</dt>
                  <dd>${escapeText(item.detail)}</dd>`,
            )
            .join('')}
        </dl>
      </details>
      ${ready ? '<button type="button" data-chapter-confirm class="primary">确认结果，继续 →</button>' : '<small>可以继续发言、观察或采取行动；调查进展会保留。</small>'}
      ${skippingAi(session.ai.generationOptions) && !ready ? '<button type="button" data-chapter-skip>跳过此任务（开发者）</button>' : ''}`;
  }

  function openTask(key) {
    if (request) return;
    const investigation = investigationProgress(state(), key);
    if (investigation && !investigation.ready) return;
    if (targetTask !== key) input.value = '';
    collapsed = true;
    targetTask = key;
    chapterTaskTurn(state(), key);
    save();
    refresh();
    context.gal.workspace({
      owner: 'starbell-chat',
      title: CHAPTER_TASKS[key].title,
      actors: library().party.filter(Boolean),
      followSpeakers: true,
      persistent: false,
      composer: [form, outcome],
      auxiliary: [status],
      onClose() {
        request?.abort();
      },
    });
    if (!CHAPTER_INVESTIGATIONS[key] && !state().read.includes(key) && CHAPTER_LINES[key]) {
      void context.gal
        .play(CHAPTER_LINES[key], {
          owner: 'starbell-chat',
          title: CHAPTER_TASKS[key].title,
          onRead: (entry) => logLine(entry, key),
        })
        .then(() => {
          if (disposed) return;
          if (!state().read.includes(key)) state().read.push(key);
          save();
        });
    }
  }
  async function confirmTask() {
    const key = targetTask;
    const quest = CHAPTER_TASKS[key];
    if (!quest || busy || request || !adventureReady({ quest }, state().tasks[key])) return;
    if (!chapterActions(state(), scene).some((action) => action.id === key)) return;
    busy = true;
    try {
      confirmChapterTask(state(), key, scene);
      targetTask = null;
      context.gal.cancel();
      save();
      refresh();
      await say(`task-confirmed-${key}`, CHAPTER_TASK_ENDINGS[key]);
      const battle = chapterActions(state(), scene).find((action) =>
        action.id.startsWith('battle-'),
      );
      if (battle && ['tracks', 'tower'].includes(key)) await prepareBattle(battle.id);
    } catch (error) {
      context.shell.toast(error.message);
    } finally {
      busy = false;
      save();
      refresh();
    }
  }
  function logLine(line, key) {
    const id = `${key}:${line.speaker}:${line.text}`;
    if (!line.text || state().log.some((entry) => entry.id === id)) return;
    state().log.push({ id, speaker: line.speaker || '旁白', text: line.text });
    save();
  }
  async function say(key, custom) {
    const lines = custom || CHAPTER_LINES[key];
    if (!lines?.length) return;
    await context.gal.play(lines, {
      owner: 'starbell',
      title: `星灯未熄 · 第${chapterDay(state())}天`,
      onRead: (line) => logLine(line, key),
    });
    if (!state().read.includes(key)) state().read.push(key);
    save();
  }
  async function start() {
    if (!STARBELL_ENABLED) return;
    if (session.runtime.mode !== 'inn' || session.runtime.needsStart) return;
    if (!eligible()) return;
    if (library().campaign && !library().campaign.completed) {
      context.shell.toast('先完成现有的入门战斗教学，再从这里开启城市主线。');
      return;
    }
    collapsed = !collapsed;
    refresh();
  }
  function archive(won) {
    const record = {
      runId: runId(),
      scriptId: runId(),
      title: `星灯未熄 · ${won ? '城市获救' : '行动失败'}`,
      map: 'ruins',
      complete: true,
      outcome: won ? 'victory' : 'defeat',
      lines: structuredClone(state().log),
      tags: ['星钟城', '星灯祭', won ? '改写历史' : '战败归档'],
    };
    const index = library().history.findIndex((item) => item.runId === record.runId);
    if (index < 0) library().history.push(record);
    else library().history[index] = record;
  }
  function sideDialogue(id) {
    return CHAPTER_SIDE_LINES[id] || null;
  }
  async function prepareBattle(id) {
    const key = id.slice(7);
    compileRoster(library());
    const preparation = document.querySelector('#party-panel');
    context.shell.renderParty();
    const done = document.querySelector('#prepare-done');
    const old = done.textContent;
    done.textContent = '整备完成 · 开始交锋';
    let confirmed = false;
    const confirm = () => {
      confirmed = true;
    };
    done.addEventListener('click', confirm, { capture: true, once: true });
    preparation.showModal();
    await new Promise((resolve) => preparation.addEventListener('close', resolve, { once: true }));
    done.removeEventListener('click', confirm, { capture: true });
    done.textContent = old;
    if (!confirmed) return;
    applyChapterAction(state(), id, scene);
    save();
    await say(key === 'boss' ? 'defenseBefore' : `${key}Before`);
    const spec = chapterBattleSpec(key);
    await context.journey.startChapterBattle(
      key === 'boss'
        ? starbellDefense(state().attempt, library().chapter)
        : {
            key,
            day: chapterDay(state()),
            returnScene: key === 'boss' ? 'city-center' : 'outskirts',
            spec,
          },
    );
    refresh();
  }
  async function act(id) {
    if (!STARBELL_ENABLED) return;
    if (busy || request || session.runtime.mode !== 'inn') return;
    if (id === 'restart' && state().phase === 'failed') {
      library().starbell = restoreStarbell({
        attempt: state().attempt + 1,
        recruited: state().recruited,
      });
      state().phase = 'morning';
      save();
      return navigate('street');
    }
    if (!chapterActions(state(), scene).some((action) => action.id === id)) return;
    collapsed = true;
    actions.hidden = true;
    talkButton.setAttribute('aria-expanded', 'false');
    if (Object.hasOwn(CHAPTER_INVESTIGATIONS, id)) {
      const progress = investigationProgress(state(), id);
      if (!progress.started) {
        startInvestigation(state(), id);
        save();
        refresh();
        noticeAnimation?.cancel();
        investigationNotice.hidden = false;
        const animation = investigationNotice.animate(
          [
            { opacity: 0, transform: 'translate(-50%, 10px) scaleX(.85)' },
            { opacity: 1, transform: 'translate(-50%, 0) scaleX(1)', offset: 0.18 },
            { opacity: 1, transform: 'translate(-50%, 0) scaleX(1)', offset: 0.7 },
            { opacity: 0, transform: 'translate(-50%, -10px) scaleX(1.04)' },
          ],
          {
            duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 500 : 1600,
            easing: 'ease-out',
            fill: 'forwards',
          },
        );
        noticeAnimation = animation;
        void animation.finished
          .catch(() => {})
          .then(() => {
            if (noticeAnimation === animation) {
              investigationNotice.hidden = true;
              noticeAnimation = null;
            }
          });
        return;
      }
      if (!progress.ready) return;
    }
    if (Object.hasOwn(CHAPTER_TASKS, id)) return openTask(id);
    if (id.startsWith('chat-'))
      return context.chat.open(
        scene === 'city-center' ? 'city-square' : scene,
        `starbell-${id.slice(5)}`,
      );
    busy = true;
    refresh();
    try {
      if (id.startsWith('battle-')) return await prepareBattle(id);
      const previous = state().phase;
      if (
        id.startsWith('invite-') &&
        library().characters.length >= 100 &&
        !library().characters.some((member) => member.id === `starbell-${id.slice(7)}`)
      )
        throw Error('角色池已满，请先整理角色');
      applyChapterAction(state(), id, scene);
      if (id.startsWith('invite-')) {
        const key = id.slice(7),
          member = chapterCompanion(key);
        if (!library().characters.some((entry) => entry.id === member.id)) {
          if (library().characters.length >= 100) throw Error('角色池已满，请先整理角色');
          library().characters.push({ ...member, growth: restoreGrowth(null, member.id) });
        }
        context.shell.renderParty();
      }
      save();
      await say(
        id,
        sideDialogue(id) ||
          (id === 'next-day' ? CHAPTER_LINES[previous === 'day1done' ? 'day2' : 'day3'] : null),
      );
    } catch (error) {
      if (id.startsWith('battle-') && session.runtime.mode === 'inn') state().pendingBattle = null;
      context.shell.toast(error.message);
    } finally {
      busy = false;
      save();
      refresh();
    }
  }
  events.on(form, 'submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (text && !request && targetTask) void submitTask(text);
  });
  async function submitTask(text) {
    const key = targetTask;
    const owner = library();
    const turn = chapterTaskTurn(state(), key, text);
    const abort = new AbortController();
    request = abort;
    status.textContent = '';
    context.gal.waiting();
    try {
      const companions = owner.characters.filter((member) => owner.party.includes(member.id));
      const people = chapterSceneCharacters(state(), scene).filter(
        (member) => !companions.some((companion) => companion.id === member.id),
      );
      const result = await context.apiClient.request(
        'generate/quick-chat',
        {
          text,
          characters: [...companions.map(settingOnly), ...people.map(settingOnly)],
          selected: [
            ...companions.map((member) => member.id),
            ...people.map((member) => member.id),
          ],
          history: turn.history.map(({ role, content }) => ({ role, content })),
          environment: `星钟城，泛生界1340年，第${chapterDay(state())}天。${chapterObjective(state())}。仅回应当前阶段，不知道尚未发现的历史与幕后秘密。`,
          adventure: turn,
        },
        { signal: abort.signal },
      );
      if (owner !== library() || disposed || abort.signal.aborted || targetTask !== key) return;
      acceptChapterTask(owner, state(), key, turn, result, crypto.randomUUID());
      input.value = '';
      save();
      request = null;
      refresh();
      await context.gal.play(result.content, {
        owner: 'starbell-chat',
        title: CHAPTER_TASKS[key].title,
        onRead: (line) => logLine(line, `task-${key}`),
      });
      if (!request && targetTask === key)
        context.gal.feedback(
          'starbell-chat',
          adventureReady({ quest: CHAPTER_TASKS[key] }, state().tasks[key])
            ? '调查已有结果。点击输入框下方的“确认结果，继续”，也可以接着交谈。'
            : '已记录本次进展，可以继续观察、交谈或行动。',
        );
    } catch (error) {
      if (error.name !== 'AbortError') {
        status.textContent = error.message;
        context.gal.feedback(
          'starbell-chat',
          `回应未能确认：${error.message}。输入和已有进展保留，可以重试。`,
        );
        if (error.diagnostic) raw.show(error.diagnostic);
      }
    } finally {
      if (request === abort) request = null;
      if (!disposed && owner === library()) {
        if (!request) context.gal.settled('starbell-chat');
        refresh();
      }
    }
  }
  events.on(input, 'keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  events.on(button, 'click', () => {
    void start();
  });
  events.on(nextButton, 'click', () => {
    void act(nextButton.dataset.chapterAction);
  });
  events.on(talkButton, 'click', () => {
    context.chat.open(scene === 'city-center' ? 'city-square' : scene);
  });
  events.on(actions, 'click', (event) => {
    const id = event.target.closest('[data-chapter-action]')?.dataset.chapterAction;
    if (id) void act(id);
  });
  events.on(outcome, 'click', (event) => {
    if (event.target.closest('[data-chapter-confirm]')) void confirmTask();
    if (
      event.target.closest('[data-chapter-skip]') &&
      targetTask &&
      skippingAi(session.ai.generationOptions)
    ) {
      for (const goal of Object.values(state().tasks[targetTask].goals))
        Object.assign(goal, { status: 'completed', evidence: '开发者明确跳过任务' });
      void confirmTask();
    }
  });
  events.on(panel, 'click', (event) => {
    if (event.target.closest('[data-chapter-collapse]')) {
      collapsed = true;
      refresh();
    }
  });
  events.on(window, 'message', async (event) => {
    if (event.origin !== location.origin || event.source !== currentFrame()?.contentWindow) return;
    if (event.data?.type === 'street-map-state') {
      if (event.data.open === true) {
        controls.hidden = true;
        actions.hidden = true;
      } else refresh();
      return;
    }
    if (event.data?.type === 'scene-ready') {
      collapsed = true;
      actions.hidden = true;
      talkButton.setAttribute('aria-expanded', 'false');
      scene = event.data.scene === 'starlamp-street' ? 'street' : event.data.scene;
      context.shell.syncInnVisitors();
      if (!STARBELL_ENABLED) {
        refresh();
        return;
      }
      if (state().phase === 'idle' && scene !== 'tavern' && eligible()) {
        state().phase = 'morning';
        save();
      }
      const toured = visitChapterScene(state(), scene);
      save();
      if (session.runtime.mode === 'inn' && state().pendingBattle) {
        state().log.push({
          speaker: '旁白',
          text: '上次交锋中断，未判定胜利；返回安全处后可以重新整备挑战。',
        });
        state().pendingBattle = null;
        save();
      }
      refresh();
      if (state().phase === 'idle') {
        void teachDoor();
        return;
      }
      if (state().phase === 'failed' || busy) return;
      busy = true;
      try {
        if (afterBattle) {
          const key = afterBattle;
          afterBattle = null;
          await say(key);
          if (key === 'ending') {
            archive(true);
            save();
          }
        }
        if (state().phase === 'morning' && scene !== 'tavern' && !state().read.includes('morning'))
          await say('morning');
        if (toured && scene !== 'tavern' && !state().read.includes('tourDone'))
          await say('tourDone');
        if (
          scene === 'tavern' &&
          chapterActions(state(), scene).some((action) => action.id === 'revelation')
        ) {
          applyChapterAction(state(), 'revelation', scene);
          save();
          await say('revelation');
        }
      } finally {
        busy = false;
        refresh();
      }
    }
    if (
      STARBELL_ENABLED &&
      event.data?.type === 'starbell-clue' &&
      !busy &&
      !request &&
      session.runtime.mode === 'inn' &&
      event.data.scene === scene
    ) {
      const { key, clue: id } = event.data;
      if (
        CHAPTER_INVESTIGATIONS[key]?.scene !== scene ||
        !chapterActions(state(), scene).some((action) => action.id === key)
      )
        return;
      if (
        !CHAPTER_INVESTIGATIONS[key].clues.some((clue) => clue.id === id) ||
        !investigationProgress(state(), key)?.started
      )
        return;
      const clue = discoverChapterClue(state(), key, id);
      if (!clue) return;
      save();
      busy = true;
      refresh();
      try {
        clueArt.hidden = !clue.image;
        if (clue.image) clueArt.src = clue.image;
        await context.gal.play(clue.lines, {
          owner: 'starbell-clue',
          title: clue.name,
          onRead: (entry) => logLine(entry, `clue-${key}-${id}`),
        });
      } finally {
        clueArt.hidden = true;
        clueArt.removeAttribute('src');
        busy = false;
        refresh();
      }
    }
    if (
      STARBELL_ENABLED &&
      event.data?.type === 'starbell-observe' &&
      !busy &&
      event.data.scene === scene
    ) {
      const aliases = {
        'city-center': { clock: ['festival'], fountain: ['fountain', 'evacuation'] },
        market: {
          novi: ['meet-novi', 'help-novi', 'finish-novi'],
          mirei: ['meet-mirei', 'help-mirei', 'finish-mirei', 'aid'],
          workbench: ['help-novi'],
        },
        rampart: {
          eirin: ['permit', 'warn', 'meet-eirin', 'help-eirin', 'finish-eirin'],
          bell: ['defense'],
          barricade: ['barricade'],
        },
        outskirts: { tracks: ['tracks'], cart: ['cart'], tower: ['tower'] },
      };
      const allowed = chapterActions(state(), scene);
      const action = aliases[scene]?.[event.data.point]?.find((id) =>
        allowed.some((entry) => entry.id === id),
      );
      if (action) void act(action);
    }
  });
  async function teachDoor() {
    if (
      !STARBELL_ENABLED ||
      disposed ||
      busy ||
      !doorLessonPending ||
      (library().progression?.settlements.length || 0) < 2 ||
      scene !== 'tavern' ||
      session.runtime.mode !== 'inn' ||
      state().read.includes('doorLesson') ||
      !document.querySelector('#gal-stage').hidden ||
      document.querySelector('dialog[open]')
    )
      return;
    busy = true;
    doorLessonPending = false;
    state().read.push('doorLesson');
    save();
    try {
      await say('doorLesson');
    } finally {
      busy = false;
      refresh();
    }
  }
  events.on(document, 'gal-finished', () => {
    queueMicrotask(() => void teachDoor());
  });
  return {
    refresh,
    chatCharacters() {
      if (scene === 'tavern') return [];
      return [
        ...(STARBELL_ENABLED ? chapterSceneCharacters(state(), scene) : []),
        ...townResidents(library(), scene),
      ];
    },
    chatEnvironment: () =>
      Object.hasOwn(TOWN_SCENES, scene)
        ? STARBELL_ENABLED
          ? `星钟城，泛生界1340年，第${chapterDay(state())}天。${chapterObjective(state())}。此处为自由交流，不能靠正文改变日期、调查线索、战斗胜负、招募或主线状态，不预告未发生的剧情。`
          : '星钟城的地图自由探索。只回应眼前的交谈，不开启星灯主线、调查或推理任务，不改变任务、战斗、装备或奖励。'
        : '',
    goHome() {
      navigate('tavern');
    },
    finalTripResult(won) {
      if (state().pendingBattle !== 'boss') return;
      chapterBattleResult(state(), 'boss', won);
      afterBattle = won ? 'ending' : 'defeat';
      archive(won);
      save();
    },
    returned() {
      if (
        STARBELL_ENABLED &&
        !state().read.includes('doorLesson') &&
        (library().progression?.settlements.length || 0) >= 2
      )
        doorLessonPending = true;
      refresh();
    },
    async finishBattle() {
      const expedition = session.journey.expedition;
      if (!expedition?.chapter || !['victory', 'defeat'].includes(session.battle.state.phase))
        return;
      let result = expedition.pendingResult;
      if (!result) {
        const won = session.battle.state.phase === 'victory';
        const next = won ? completeEncounter(expedition, session.battle.state) : null;
        if (!won) expedition.status = 'failed';
        chapterBattleResult(state(), expedition.chapter.key, won);
        if (next) claimBattleRewards(library(), next.rewardId, next.rewards);
        diningBattleCompleted(library(), `${expedition.id}:0`);
        const awards = [
          ...(expedition.experienceAwards || []),
          ...(won ? claimCompletionExperience(library(), expedition) : []),
        ];
        result = {
          won,
          complete: true,
          encounter: 0,
          rewards: next?.rewards,
          awards,
          ether: 0,
          loot: [],
        };
        expedition.pendingResult = result;
        afterBattle = won
          ? { scout: 'scoutAfter', elite: 'eliteAfter', boss: 'ending' }[expedition.chapter.key]
          : 'defeat';
        if (!won) {
          state().log.push({
            speaker: '旁白',
            text: `第${chapterDay(state())}天，${expedition.chapter.spec.name}战败，本次行动归档。`,
          });
          archive(false);
        }
        if (won && expedition.chapter.key === 'boss') {
          state().log.push({
            speaker: '旁白',
            text: '暗鳞督军已在城门战中被击败，星钟城守卫胜利，历史中的灭城结局被改写。',
          });
          archive(true);
        }
        save();
      }
      await context.settlement.show({
        ...result,
        back: () => context.journey.returnInn(),
        backLabel: '结束战斗',
        onward: () => {},
        journal: null,
        retreat: false,
      });
      refresh();
    },
    dispose() {
      disposed = true;
      request?.abort();
      raw.dispose();
      panel.remove();
      button.remove();
      nextButton.remove();
      controls.remove();
      tracker.remove();
      chatHost.remove();
      actions.remove();
      clueArt.remove();
      noticeAnimation?.cancel();
      investigationNotice.remove();
    },
  };
}
