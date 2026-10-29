import {
  adventureReady,
  confirmEventChoice,
  adventureTurnContext,
  acceptAdventureReply,
} from '../adventure/state.js';
import { bossLines } from '../adventure/patches.js';
import { rpBackground } from '../content/rp-backgrounds.js';
import { ITEMS } from '../content/items.js';
import { skippingAi, developerOption } from '../generation-options.js';
import { escapeText } from '../ui.js';
import { memoryHash } from '../memory.js';
import { archiveMilestone } from '../archives.js';
import { galIconMarkup } from './gal-icons.js';
import { normalizeSceneOverview } from '../adventure/definition.js';

/** One scene controller: rules, rewards and patches belong to the pure adventure modules. */
export function createAdventure(context) {
  const { session, events } = context;
  const root = document.createElement('section');
  root.id = 'rp-scene';
  root.hidden = true;
  root.setAttribute('aria-label', '副本事件');
  const tool = (id, icon, label) =>
    `<button data-rp="${id}" title="${label}" aria-label="${label}">${galIconMarkup(icon, label)}<span>${label}</span></button>`;
  root.innerHTML = `<div class="rp-vignette"></div><header class="rp-header"><span data-rp="chapter"></span><button class="rp-boss-shortcut" data-rp="boss-shortcut" hidden>进入 Boss 战 <span aria-hidden="true">→</span></button><nav class="rp-tools" aria-label="事件工具">${tool('compose', 'compose', '发言')}${tool('history', 'history', '故事记录')}${tool('replay', 'replay', '重读开场')}${tool('raw', 'journal', '原始返回')}${tool('retreat', 'back', '返回酒馆')}${tool('settings', 'settings', '设置')}</nav></header>
    <main class="rp-content"><div class="rp-kicker"></div><h1></h1><p class="rp-description"></p><div class="rp-options"></div><div class="rp-goals"></div><section class="rp-environment"><h2>周围</h2><dl></dl></section>
    <form class="rp-form"><label for="rp-input">说些什么，或描述你的行动</label><p class="rp-locked-choice" aria-label="已选行动，不可编辑" hidden></p><div><textarea id="rp-input" rows="2" maxlength="10000" placeholder="输入你想说的话，或想做的事……"></textarea><button type="submit" data-rp="send">确认选择</button></div></form>
    <p class="rp-status" role="status"></p><nav class="rp-footer"><button data-rp="retry" hidden>重试本次回应</button><button data-rp="skip" hidden>跳过RP（开发者）</button><button data-rp="next" hidden>继续冒险 →</button></nav></main>
    <aside class="rp-boss-ready" hidden><strong>主要目标已完成</strong><p>现在前往最后的战斗，还是再停留片刻？</p><div><button data-rp="stay">继续探索与交流</button><button data-rp="boss">进入 Boss 战 →</button></div></aside>`;
  document.body.append(root);
  const content = root.querySelector('.rp-content');
  const form = root.querySelector('.rp-form');
  let request = null;
  let selected = null;
  let introEpoch = 0;
  let draftTimer = null;
  let workspaceOpen = false;
  const find = (selector) =>
    root.querySelector(selector) ||
    content.querySelector(selector) ||
    (form.matches(selector) ? form : form.querySelector(selector));
  const book = () => session.ai.activeScript;
  const trip = () => session.journey.expedition;
  const state = () => trip()?.adventure;
  function save() {
    const index = session.ai.library.scripts.findIndex((entry) => entry.id === book()?.id);
    if (index >= 0 && book()?.adventure && !book().recollection)
      session.ai.library.scripts[index] = structuredClone(book());
    context.generation.save();
    context.checkpoint.saveNow();
  }
  function status(text) {
    find('.rp-status').textContent = text;
    context.gal.feedback('adventure', text);
  }
  function compose() {
    if (root.hidden || book().recollection) return;
    if (workspaceOpen) {
      context.gal.collapseComposer(false);
      return;
    }
    workspaceOpen = true;
    form.hidden = false;
    context.gal.workspace({
      owner: 'adventure',
      title: book().title,
      persistent: true,
      composer: [form],
      onLayout({ height, collapsed }) {
        root.dataset.composer = collapsed ? 'collapsed' : 'open';
        root.style.setProperty('--rp-panel-bottom', collapsed ? '64px' : `${height + 12}px`);
        find('[data-rp="compose"]').setAttribute('aria-expanded', String(!collapsed));
      },
      onClose() {
        workspaceOpen = false;
        request?.abort();
        form.hidden = true;
      },
    });
    render();
  }
  function record(speaker, text, stage, id) {
    const history = session.ai.library.history.find((entry) => entry.runId === book()?.runId);
    if (
      !history ||
      book()?.recollection ||
      !text?.trim() ||
      history.lines.some((line) => line.adventureId === id)
    )
      return;
    history.lines.push({ speaker, text, encounter: trip().index, stage, adventureId: id });
    save();
  }
  async function play(text, id) {
    await context.gal.play(text, {
      owner: 'adventure',
      title: book().title,
      onRead(line) {
        record(line.speaker || '旁白', line.text, 'rp', `${id}:${memoryHash(line.text)}`);
      },
    });
  }
  function render() {
    if (root.hidden || !state()) return;
    const event = trip().index === 1;
    const definition = book().adventure;
    const scene = event ? definition.event : definition.quest;
    find('[data-rp="chapter"]').textContent = `${book().title} · ${trip().index + 1} / 5`;
    find('.rp-kicker').textContent = event ? '旅途片刻 / ENCOUNTER' : '歧路之间 / EXPLORE';
    find('h1').textContent = scene.title;
    find('.rp-description').textContent = scene.description;
    find('.rp-description').hidden = false;
    find('.rp-description').classList.toggle('rp-event-introduction', !event);
    find('.rp-options').hidden = !event;
    find('.rp-goals').hidden = event;
    find('.rp-environment').hidden = event;
    if (!event)
      find('.rp-environment dl').innerHTML = normalizeSceneOverview(
        scene.overview,
        scene.description,
      )
        .map(
          (item) =>
            `<div><dt>${escapeText(item.location)}</dt><dd>${escapeText(item.detail)}</dd></div>`,
        )
        .join('');
    if (event) {
      find('.rp-options').innerHTML = scene.choices
        .filter((choice) => !state().event.resolved || choice.id === selected)
        .map((choice) => {
          const index = scene.choices.indexOf(choice);
          const reward =
            [
              choice.reward.gold ? `${choice.reward.gold} 金币` : '',
              ...Object.entries(choice.reward.items).map(
                ([id, count]) => `${ITEMS[id].name} ×${count}`,
              ),
            ]
              .filter(Boolean)
              .join(' · ') || '一段独特的经历';
          return `<button type="button" data-rp-choice="${choice.id}" aria-pressed="${selected === choice.id}" ${(state().event.choiceId && state().event.choiceId !== choice.id) || request || state().event.resolved ? 'disabled' : ''}><span class="rp-choice-number">0${index + 1}</span><span><strong>${escapeText(choice.label)}</strong><small>${escapeText(choice.detail)}</small><em>${escapeText(reward)}</em></span></button>`;
        })
        .join('');
    } else
      find('.rp-goals').innerHTML = scene.goals
        .map((goal) => {
          const progress = state().goals[goal.id];
          return `<article data-status="${progress.status}"><span>${progress.status === 'completed' ? '✓' : progress.status === 'failed' ? '—' : '◇'}</span><h2>${escapeText(goal.title)}${goal.required ? '' : '<small>可选</small>'}</h2></article>`;
        })
        .join('');
    const resolved = event && state().event.resolved;
    const choice = event && !resolved ? scene.choices.find((item) => item.id === selected) : null;
    find('.rp-locked-choice').hidden = !choice;
    find('.rp-locked-choice').textContent = choice ? `已选：${choice.label}` : '';
    find('[data-rp="send"]').setAttribute('aria-label', event && !resolved ? '确认选择' : '发送');
    find('[data-rp="send"]').disabled = !!request || (event && !resolved && !selected);
    find('#rp-input').disabled = !!request;
    find('[data-rp="next"]').hidden = event ? !resolved : !adventureReady(definition, state());
    find('[data-rp="next"]').disabled = !!request;
    find('[data-rp="next"]').textContent = event ? '继续冒险 →' : '进入Boss战 →';
    find('[data-rp="boss-shortcut"]').hidden = event || !adventureReady(definition, state());
    find('[data-rp="boss-shortcut"]').disabled = !!request;
    find('[data-rp="skip"]').hidden =
      book().recollection === true || !skippingAi(session.ai.generationOptions);
    find('[data-rp="skip"]').disabled = !!request;
    find('[data-rp="retreat"]').hidden = !developerOption(
      session.ai.generationOptions,
      'allowRetreat',
    );
  }
  function ready() {
    if (trip()?.index !== 3 || !adventureReady(book().adventure, state()) || state().readyPrompted)
      return;
    state().readyPrompted = true;
    find('.rp-boss-ready').hidden = false;
    save();
  }
  async function send(retry = false, local = false) {
    if (request || root.hidden) return;
    const expedition = trip();
    const source = book();
    const adventure = state();
    let turn;
    try {
      if (retry) turn = adventure.pendingTurn;
      else {
        const text = find('#rp-input').value.trim();
        if (expedition.index === 1 && !adventure.event.resolved)
          confirmEventChoice(source.adventure, adventure, selected, text);
        else if (!text && !local) throw Error('写下一句话或一个行动，再发送');
        turn = {
          ...adventureTurnContext(expedition, source, text),
          responseId: crypto.randomUUID(),
        };
        adventure.pendingTurn = turn;
      }
      if (!turn || turn.node !== expedition.index) throw Error('没有可重试的本次发言');
      selected = adventure.event.choiceId || selected;
      save();
    } catch (failure) {
      status(failure.message);
      return;
    }
    const controller = new AbortController();
    request = controller;
    find('[data-rp="retry"]').hidden = true;
    render();
    status('故事正在回应你的选择……');
    context.gal.waiting();
    try {
      let result;
      if (local)
        result = {
          content: '【旁白】同行者与你确认了接下来的方向。',
          ...(turn.mode === 'quest'
            ? {
                adventure: {
                  episodeId: expedition.id,
                  revision: adventure.boss.revision,
                  tasks: source.adventure.quest.goals.map((goal) => ({
                    id: goal.id,
                    status: 'completed',
                    evidence: '开发者跳过RP，目标已确认',
                  })),
                  patches: [],
                },
              }
            : {}),
        };
      else {
        const input = context.chat.input(
          'quick-chat',
          turn.playerText || turn.choice?.label || '继续当前事件',
        );
        result = await context.apiClient.request(
          'generate/quick-chat',
          {
            ...input,
            environment: `${source.title} · 第${expedition.index + 1}节点\n${expedition.index === 1 ? source.adventure.event.description : source.adventure.quest.description}`,
            adventure: turn,
            history: adventure.history.map(({ role, content }) => ({ role, content })),
          },
          { signal: controller.signal },
        );
      }
      controller.signal.throwIfAborted();
      if (trip() !== expedition || book() !== source || root.hidden) return;
      if (result.diagnostic)
        context.generation.recordReview(
          { ...result.diagnostic, readOnly: true },
          { adventure: turn },
          true,
        );
      const accepted = acceptAdventureReply(
        session.ai.library,
        expedition,
        source,
        turn,
        result,
        turn.responseId,
      );
      if (accepted.duplicate) return;
      const history = session.ai.library.history.find((entry) => entry.runId === source.runId);
      if (
        history &&
        !source.recollection &&
        (turn.mode === 'event' || adventureReady(source.adventure, adventure))
      )
        archiveMilestone(session.ai.library, source, history, expedition.index);
      if (turn.mode === 'event') {
        record(
          '事件选择',
          `正式选择：${turn.choice.label}` +
            (turn.playerText
              ? '\n玩家补充发言（不代表实际奖励或属性变化）：' + turn.playerText
              : ''),
          'event-choice',
          turn.responseId,
        );
        const reward = [
          turn.choice.reward.gold ? `${turn.choice.reward.gold}金币` : '',
          ...Object.entries(turn.choice.reward.items).map(
            ([id, count]) => `${ITEMS[id].name}×${count}`,
          ),
        ]
          .filter(Boolean)
          .join('、');
        record(
          '事件收获',
          reward || '没有额外的数值奖励。',
          'event-reward',
          `${turn.responseId}:reward`,
        );
      } else record('玩家', turn.playerText, 'rp-action', turn.responseId);
      if (turn.mode === 'quest')
        record(
          '任务进展',
          source.adventure.quest.goals
            .filter(
              (goal) =>
                adventure.goals[goal.id].status === 'completed' &&
                turn.goals.find((before) => before.id === goal.id)?.status !== 'completed',
            )
            .map((goal) => `${goal.title}：${adventure.goals[goal.id].evidence}`)
            .join('\n'),
          'quest-state',
          `${turn.responseId}:goals`,
        );
      delete adventure.pendingTurn;
      (adventure.drafts ||= {})[expedition.index] = '';
      find('#rp-input').value = '';
      save();
      status(accepted.warnings.join('；'));
      request = null;
      render();
      await play(result.display || result.content, turn.responseId);
      if (!root.hidden && trip() === expedition) ready();
    } catch (failure) {
      if (trip() === expedition && !root.hidden) {
        if (failure.diagnostic)
          context.generation.recordReview(
            { ...failure.diagnostic, readOnly: true },
            { adventure: turn },
          );
        status(failure.name === 'AbortError' ? '已停止，已确认进度保留。' : failure.message);
        find('[data-rp="retry"]').hidden = false;
      }
    } finally {
      if (request === controller) request = null;
      context.gal.settled('adventure');
      render();
    }
  }
  async function enter(resuming = false) {
    const epoch = ++introEpoch;
    context.gal.cancel();
    session.runtime.mode = 'event';
    clearTimeout(session.runtime.toastTimer);
    document.querySelector('#toast').classList.remove('visible');
    context.onboarding.refresh();
    session.runtime.token++;
    session.runtime.view?.dispose();
    session.runtime.view = null;
    document.body.classList.add('in-adventure');
    document.querySelector('#battle').hidden = true;
    document.querySelector('#inn').hidden = true;
    document.querySelector('#inn-frame').replaceChildren();
    document.querySelector('#speed').hidden = true;
    document.querySelector('#back-inn').hidden = true;
    document.querySelector('#mode-label').textContent =
      `${book().title} · 第${trip().index + 1}/5节点`;
    document.querySelector('#ai-open').hidden = false;
    root.style.backgroundImage = `url("${rpBackground(trip().exploration?.map || 'ruins', trip().index)}")`;
    selected = state().event.choiceId;
    root.hidden = false;
    root.dataset.intro = 'true';
    find('.rp-boss-ready').hidden = true;
    find('#rp-input').value =
      state().drafts?.[trip().index] ||
      (trip().index === 1 && !state().event.resolved ? state().event.supplement : '') ||
      '';
    if (state().pendingTurn && state().responses.includes(state().pendingTurn.responseId))
      delete state().pendingTurn;
    if (trip().index === 3 && !state().boss.patches.length && !state().boss.locked)
      state().boss.lines = bossLines(book().story[4]);
    render();
    status(state().pendingTurn ? '上次回应尚未完成，可以重试。' : '');
    find('[data-rp="retry"]').hidden = !state().pendingTurn;
    save();
    if (!resuming) {
      await context.generation.showScene(trip().index, 'before');
      await play(book().story[trip().index], `intro-${trip().index}`);
    }
    if (epoch === introEpoch && !root.hidden) {
      root.dataset.intro = 'false';
      if (!book().recollection) compose();
      ready();
    }
  }
  function leave() {
    clearTimeout(draftTimer);
    introEpoch++;
    request?.abort();
    request = null;
    context.gal.cancel('adventure');
    root.hidden = true;
    document.body.classList.remove('in-adventure');
  }
  function click(event) {
    const choice = event.target.closest('[data-rp-choice]');
    if (choice && !state().event.choiceId) {
      selected = choice.dataset.rpChoice;
      render();
    }
    const action = event.target.closest('[data-rp]')?.dataset.rp;
    if (action === 'settings') void context.generation.open();
    if (action === 'raw') context.generation.openReview();
    if (action === 'retreat') context.journey.returnInn();
    if (action === 'compose') {
      if (workspaceOpen) context.gal.collapseComposer(root.dataset.composer !== 'collapsed');
      else compose();
    }
    if (action === 'retry') void send(true);
    if (action === 'skip') {
      if (trip().index === 1 && !selected) selected = book().adventure.event.choices[0].id;
      void send(false, true);
    }
    if (action === 'next' || action === 'boss' || action === 'boss-shortcut')
      void context.journey.continueAdventure();
    if (action === 'stay') find('.rp-boss-ready').hidden = true;
    if (action === 'replay') void play(book().story[trip().index], `intro-${trip().index}`);
    if (action === 'history')
      void context.gal.play(
        state().history.map((line) => ({
          speaker: line.role === 'user' ? '玩家' : '旁白',
          text: line.content,
        })),
        { owner: 'adventure-history', title: '已发生的故事' },
      );
  }
  events.on(root, 'click', click);
  events.on(document.querySelector('#ai-dialog'), 'close', () => {
    if (!root.hidden) render();
  });
  events.on(content, 'click', (event) => {
    event.stopPropagation();
    click(event);
  });
  events.on(find('.rp-form'), 'submit', (event) => {
    event.preventDefault();
    void send();
  });
  events.on(find('#rp-input'), 'input', () => {
    if (root.hidden || !state()) return;
    (state().drafts ||= {})[trip().index] = find('#rp-input').value;
    clearTimeout(draftTimer);
    context.checkpoint.schedule();
    draftTimer = setTimeout(() => {
      if (root.hidden || session.runtime.disposed) return;
      try {
        save();
      } catch (failure) {
        status(failure.message);
      }
    }, 280);
  });
  events.on(find('#rp-input'), 'keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void send();
    }
  });
  return {
    enter,
    leave,
    render,
    dispose() {
      leave();
      root.remove();
    },
  };
}
