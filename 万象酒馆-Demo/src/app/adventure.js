import {
  adventureReady,
  confirmEventChoice,
  adventureTurnContext,
  acceptAdventureReply,
} from '../adventure/state.js';
import { bossLines } from '../adventure/patches.js';
import { applyFutureDialogue, dungeonDialogueScenes } from './future-dialogue.js';
import { rpBackground } from '../content/rp-backgrounds.js';
import { claimedEventRewardText, eventReward, eventRewardText } from '../adventure/rewards.js';
import { skippingAi } from '../generation-options.js';
import { escapeText } from '../ui.js';
import { memoryHash } from '../memory.js';
import { archiveMilestone } from '../archives.js';
import { galIconMarkup } from './gal-icons.js';
import { normalizeSceneOverview } from '../adventure/definition.js';
import { portraitUrl } from '../portraits.js';
import {
  DC_DEFAULT_DIFFICULTY,
  computeMapDc,
  computeProtagonistMapDc,
  dcAttrLabel,
  dcSuccessProbability,
  effectiveDcAttrs,
  formatMod,
} from '../dc.js';
import { formatDcEffectSummary, prepareFreeDcContext, resolveFixedChoiceCheck } from '../dc-rp.js';

/** One scene controller: rules, rewards and patches belong to the pure adventure modules. */
export function createAdventure(context) {
  const { session, events } = context;
  const root = document.createElement('section');
  root.id = 'rp-scene';
  root.hidden = true;
  root.setAttribute('aria-label', '副本事件');
  const tool = (id, icon, label) =>
    `<button data-rp="${id}" title="${label}" aria-label="${label}">${galIconMarkup(icon, label)}<span>${label}</span></button>`;
  root.innerHTML = `<div class="rp-vignette"></div><div class="rp-rays" aria-hidden="true"></div><div class="rp-tilt top" aria-hidden="true"></div><div class="rp-tilt bottom" aria-hidden="true"></div><header class="rp-header"><span data-rp="chapter"></span></header>
    <main class="rp-content"><div class="rp-kicker"></div><h1></h1><p class="rp-description"></p><div class="rp-options"></div><div class="rp-goals"></div><section class="rp-environment"><h2>周围</h2><dl></dl></section>
    <form class="rp-form" hidden><label for="rp-input">说些什么，或描述你的行动</label><p class="rp-locked-choice" aria-label="已选行动，不可编辑" hidden></p><div><textarea id="rp-input" rows="2" maxlength="10000" placeholder="输入你想说的话，或想做的事……"></textarea><button type="submit" data-rp="send">确认选择</button></div></form>
    <p class="rp-status" role="status"></p></main>
    <div class="rp-left-dock">
      <p class="rp-reward-receipt" role="status" hidden></p>
      <aside class="rp-boss-ready" hidden><strong>主要目标已完成</strong><p>前往最终首领战入口已在下方就绪，也可以继续停留探索。</p><div><button data-rp="stay">继续探索与交流</button></div></aside>
      <nav class="rp-footer"><button data-rp="retry" hidden>重试本次回应</button><button data-rp="skip" hidden>跳过RP（开发者）</button><button data-rp="next" hidden>继续冒险 →</button></nav>
    </div>
    <nav class="rp-bottom-pill-bar" aria-label="事件操作">${tool('compose', 'compose', '发言')}${tool('replay', 'replay', '重读开场')}</nav>`;
  document.body.append(root);
  const content = root.querySelector('.rp-content');
  const form = root.querySelector('.rp-form');
  const choiceActorMap = new Map();
  let request = null;
  let replyPlayback = null;
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
  function partyMembers() {
    const libChars = session.ai.library?.characters || [];
    const ids =
      trip()?.partyIds || book()?.party?.map((m) => m.id) || session.ai.library?.party || [];
    const mapped = ids
      .map((id) => libChars.find((c) => c.id === id) || book()?.party?.find((c) => c.id === id))
      .filter(Boolean);
    if (mapped.length) return mapped;
    const protagId = session.ai.library?.campaign?.protagonistId;
    const fallback = libChars.find((c) => c.id === protagId) || libChars[0];
    return fallback ? [fallback] : [];
  }
  function matchMember(members, ref) {
    if (!ref) return null;
    const key = String(ref).trim();
    return (
      members.find(
        (m) => m.id === key || m.setting?.name === key || m.combat?.name === key || m.name === key,
      ) || null
    );
  }
  function allowedActorsForChoice(choice, members, spec) {
    if (!members.length) return [];
    const requested = [];
    for (const ref of choice?.actors || (spec?.actor ? [spec.actor] : [])) {
      const m = matchMember(members, ref);
      if (m && !requested.some((existing) => existing.id === m.id)) requested.push(m);
    }
    if (requested.length) return requested.slice(0, 2);
    const attr = spec?.attr || 'str';
    const sorted = [...members].sort(
      (a, b) =>
        (effectiveDcAttrs(session.ai.library, b).mods[attr]?.mod ?? 0) -
        (effectiveDcAttrs(session.ai.library, a).mods[attr]?.mod ?? 0),
    );
    if (sorted.length < 2) return sorted;
    const topMod = effectiveDcAttrs(session.ai.library, sorted[0]).mods[attr]?.mod ?? 0;
    const secondMod = effectiveDcAttrs(session.ai.library, sorted[1]).mods[attr]?.mod ?? 0;
    return topMod > secondMod ? [sorted[0]] : [sorted[0], sorted[1]];
  }
  function resolveChoiceActor(choice, members, spec) {
    const allowed = allowedActorsForChoice(choice, members, spec);
    if (!allowed.length) return null;
    const storedId = choice?.id ? choiceActorMap.get(choice.id) : null;
    return allowed.find((m) => m.id === storedId) || allowed[0];
  }
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
        root.style.setProperty('--rp-panel-bottom', collapsed ? '74px' : `${height + 16}px`);
        root.style.setProperty('--rp-pill-bottom', 'max(14px, env(safe-area-inset-bottom))');
        find('[data-rp="compose"]').setAttribute('aria-expanded', String(!collapsed));
      },
      onClose() {
        workspaceOpen = false;
        root.dataset.composer = 'closed';
        root.style.removeProperty('--rp-panel-bottom');
        root.style.removeProperty('--rp-pill-bottom');
        request?.abort();
        form.hidden = true;
        find('[data-rp="compose"]')?.setAttribute('aria-expanded', 'false');
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
    const epoch = introEpoch;
    const expedition = trip();
    await context.gal.play(text, {
      owner: 'adventure',
      title: book().title,
      onRead(line) {
        if (epoch !== introEpoch || expedition !== trip()) return;
        record(line.speaker || '旁白', line.text, 'rp', `${id}:${memoryHash(line.text)}`);
      },
    });
  }
  function render() {
    if (root.hidden || !state()) return;
    const event = trip().index === 1;
    const definition = book().adventure;
    const scene = event ? definition.event : definition.quest;
    const kicker = event ? '旅途片刻 / ENCOUNTER' : '歧路之间 / EXPLORE';
    find('[data-rp="chapter"]').textContent = `${book().title} · ${trip().index + 1} / 5`;
    find('.rp-kicker').textContent = kicker;
    find('h1').textContent = scene.title;
    find('.rp-description').textContent = scene.description;
    find('.rp-description').hidden = false;
    find('.rp-description').classList.toggle('rp-event-introduction', !event);
    find('.rp-options').hidden = !event;
    const receipt = find('.rp-reward-receipt');
    const dcReceipt = event ? state().event.dcReceipt : state().questLastDc;
    const baseRewardText = event ? claimedEventRewardText(trip()) : '';
    const dcSummary = dcReceipt ? formatDcEffectSummary(dcReceipt.reward, dcReceipt.penalty) : null;
    const receiptParts = [];
    if (baseRewardText || dcSummary?.gainsText) {
      const gained = [baseRewardText, ...(dcSummary?.gains || [])].filter(Boolean).join(' · ');
      if (gained)
        receiptParts.push(`<span class="rp-receipt-gain">本次收获 · ${escapeText(gained)}</span>`);
    }
    if (dcSummary?.lossesText) {
      receiptParts.push(`<span class="rp-receipt-loss">${escapeText(dcSummary.lossesText)}</span>`);
    } else if (event && state().event.rewardClaimed && !receiptParts.length) {
      receiptParts.push('<span class="rp-receipt-gain">本次事件已结算</span>');
    }
    receipt.hidden = receiptParts.length === 0;
    receipt.innerHTML = receiptParts.join('');
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
    const resolved = event && state().event.resolved;
    const members = partyMembers();
    const pickedChoice = event ? scene.choices.find((item) => item.id === selected) : null;
    const mapOrLevel = trip()?.exploration?.map || trip()?.exploration?.level || null;
    if (event) {
      find('.rp-options').innerHTML = scene.choices
        .filter((choice) => !state().event.resolved || choice.id === selected)
        .map((choice) => {
          const index = scene.choices.indexOf(choice);
          const rawSpec =
            choice.dcCheck ||
            (choice.attr ? { attr: choice.attr, dc: choice.dc ?? DC_DEFAULT_DIFFICULTY } : null);
          const attr = rawSpec?.attr || ['str', 'wis', 'dex', 'cha'][index % 4];
          const dc = computeProtagonistMapDc(
            session.ai.library,
            mapOrLevel,
            index,
            rawSpec?.dc ?? DC_DEFAULT_DIFFICULTY,
          );
          const spec = { ...rawSpec, attr, dc };
          const allowed = allowedActorsForChoice(choice, members, spec);
          const activeActor =
            (resolved && state().event.choiceCheck?.actorId
              ? members.find((m) => m.id === state().event.choiceCheck.actorId)
              : null) || resolveChoiceActor(choice, members, spec);
          if (activeActor) choiceActorMap.set(choice.id, activeActor.id);
          const mod = activeActor
            ? (effectiveDcAttrs(session.ai.library, activeActor).mods[attr]?.mod ?? 0)
            : 0;
          const pct = dcSuccessProbability(mod, dc);
          const dcTag = `<b class="rp-dc-tag">DC ${dc} · ${escapeText(dcAttrLabel(attr))} (${escapeText(formatMod(mod))} / ${pct}%)</b>`;
          const actorsMarkup = allowed.length
            ? `<div class="rp-choice-actors" aria-label="适配角色">${allowed
                .map((member) => {
                  const mMod = effectiveDcAttrs(session.ai.library, member).mods[attr]?.mod ?? 0;
                  const actorName = member.setting?.name || member.name || member.id;
                  const thumb = portraitUrl(member.combat || member) || '';
                  const isCurrent = member.id === activeActor?.id;
                  const inner = `${thumb ? `<img src="${thumb}" alt="" onerror="this.remove()">` : ''}<span>${escapeText(actorName)}</span><small>${escapeText(formatMod(mMod))}</small>`;
                  return allowed.length > 1 && !resolved && !request
                    ? `<button type="button" class="rp-choice-actor-pill" data-rp-actor="${escapeText(member.id)}" data-rp-actor-choice="${escapeText(choice.id)}" aria-pressed="${isCurrent}">${inner}</button>`
                    : `<span class="rp-choice-actor-pill is-locked" data-active="${isCurrent}">${inner}</span>`;
                })
                .join('')}</div>`
            : '';
          return `<div class="rp-choice-row" data-selected="${selected === choice.id}">${actorsMarkup}<button type="button" data-rp-choice="${choice.id}" aria-pressed="${selected === choice.id}" ${(state().event.choiceId && state().event.choiceId !== choice.id) || request || state().event.resolved ? 'disabled' : ''}><span class="ev-ch-mark" aria-hidden="true">◆</span><span class="rp-choice-number">0${index + 1}</span><span class="ev-ch-body"><strong>${escapeText(choice.label)}</strong><small>${escapeText(choice.detail)}</small></span>${dcTag}</button></div>`;
        })
        .join('');
    } else
      find('.rp-goals').innerHTML = scene.goals
        .map((goal) => {
          const progress = state().goals[goal.id];
          return `<article data-status="${progress.status}"><span>${progress.status === 'completed' ? '✓' : progress.status === 'failed' ? '—' : '◇'}</span><h2>${escapeText(goal.title)}${goal.required ? '' : '<small>可选</small>'}</h2></article>`;
        })
        .join('');
    const choice = event && !resolved ? pickedChoice : null;
    find('.rp-locked-choice').hidden = !choice;
    find('.rp-locked-choice').textContent = choice ? `已选：${choice.label}` : '';
    find('[data-rp="send"]').setAttribute('aria-label', event && !resolved ? '确认选择' : '发送');
    const replyBusy = !!(request || replyPlayback);
    find('[data-rp="send"]').disabled = replyBusy || (event && !resolved && !selected);
    find('#rp-input').disabled = replyBusy;
    find('[data-rp="next"]').hidden = event ? !resolved : !adventureReady(definition, state());
    find('[data-rp="next"]').disabled = replyBusy;
    find('[data-rp="next"]').textContent = event ? '继续冒险 →' : '进入Boss战 →';
    find('[data-rp="skip"]').hidden =
      book().recollection === true || !skippingAi(session.ai.generationOptions);
    find('[data-rp="skip"]').disabled = replyBusy;
  }
  function ready() {
    if (trip()?.index !== 3 || !adventureReady(book().adventure, state()) || state().readyPrompted)
      return;
    state().readyPrompted = true;
    find('.rp-boss-ready').hidden = false;
    save();
  }
  async function send(retry = false, local = false) {
    if (request || replyPlayback || root.hidden) return;
    const expedition = trip();
    const source = book();
    const adventure = state();
    let turn;
    try {
      if (retry) turn = adventure.pendingTurn;
      else {
        const text = find('#rp-input').value.trim();
        let choiceCheck = null;
        if (expedition.index === 1 && !adventure.event.resolved) {
          const pickedIndex = source.adventure.event.choices.findIndex((c) => c.id === selected);
          const pickedChoice = source.adventure.event.choices[pickedIndex];
          const mapOrLevel = expedition.exploration?.map || expedition.exploration?.level || null;
          const rawSpec =
            pickedChoice?.dcCheck ||
            (pickedChoice?.attr
              ? { attr: pickedChoice.attr, dc: pickedChoice.dc ?? DC_DEFAULT_DIFFICULTY }
              : {
                  attr: ['str', 'wis', 'dex', 'cha'][Math.max(0, pickedIndex) % 4],
                  dc: DC_DEFAULT_DIFFICULTY,
                });
          const spec = {
            ...rawSpec,
            dc: computeMapDc(mapOrLevel, Math.max(0, pickedIndex), rawSpec.dc),
          };
          const members = partyMembers();
          const actor = resolveChoiceActor(pickedChoice, members, spec) || members[0] || null;
          choiceCheck = resolveFixedChoiceCheck({
            library: session.ai.library,
            member: actor,
            choice: { ...pickedChoice, dcCheck: spec },
            seed: `${expedition.id}:event:${pickedChoice.id}:${actor?.id || ''}`,
          });
          confirmEventChoice(source.adventure, adventure, selected, text, choiceCheck);
        } else if (!text && !local) throw Error('写下一句话或一个行动，再发送');
        turn = {
          ...adventureTurnContext(expedition, source, text, choiceCheck),
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
    const isReplyScene = () =>
      trip() === expedition && book() === source && expedition.index === turn.node && !root.hidden;
    const isCurrentReply = () => !controller.signal.aborted && isReplyScene();
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
        const members = partyMembers();
        const mapOrLevel = expedition.exploration?.map || expedition.exploration?.level || null;
        result = await context.apiClient.request(
          'generate/quick-chat',
          {
            ...input,
            mapOrLevel,
            ...(turn.mode === 'quest'
              ? {
                  dcContext: {
                    mode: 'free',
                    forced: true,
                    ...prepareFreeDcContext(session.ai.library, members, Math.random, mapOrLevel),
                  },
                }
              : {}),
            environment: `${source.title} · 第${expedition.index + 1}节点\n${expedition.index === 1 ? source.adventure.event.description : source.adventure.quest.description}`,
            adventure: turn,
            history: adventure.history.map(({ role, content }) => ({ role, content })),
          },
          { signal: controller.signal },
        );
      }
      controller.signal.throwIfAborted();
      if (!isCurrentReply()) return;
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
      context.quests?.collect(result.quest, turn.responseId, context.daily?.scene());
      const playerId = session.ai.library.campaign?.protagonistId;
      const player = source.party?.find((member) => member.id === playerId);
      applyFutureDialogue(
        dungeonDialogueScenes(source, expedition, expedition.index),
        result.dialogue,
        turn.responseId,
        player,
      );
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
        const reward = eventRewardText(eventReward(expedition));
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
      replyPlayback = controller;
      render();
      const playOptions = {
        owner: 'adventure',
        title: book().title,
        onRead(line) {
          if (!isCurrentReply()) return;
          record(
            line.speaker || '旁白',
            line.text,
            'rp',
            `${turn.responseId}:${memoryHash(line.text)}`,
          );
        },
      };
      const members = partyMembers();
      const actorRefId =
        turn.mode === 'event' ? turn.choiceCheck?.actorId : result.dcOutcome?.actorId;
      const chosenMember = members.find((m) => m.id === actorRefId) || members[0] || null;
      if ((turn.mode === 'event' || turn.mode === 'quest') && context.dice?.playReply) {
        await context.dice.playReply(result, playOptions, {
          style: turn.mode === 'event' ? 'event' : 'free',
          actionText: turn.choice?.label || turn.playerText || '',
          fixedCheck: turn.mode === 'event' ? turn.choiceCheck || null : null,
          member: chosenMember,
          claimId: turn.responseId,
          expedition,
          signal: controller.signal,
          onSettled(dcReceipt) {
            if (!isCurrentReply()) return;
            if (turn.mode === 'event') adventure.event.dcReceipt = dcReceipt;
            else adventure.questLastDc = dcReceipt;
            const { lossesText, gainsText } = formatDcEffectSummary(
              dcReceipt.reward,
              dcReceipt.penalty,
            );
            record('检定代价', lossesText, 'dc-penalty', `${turn.responseId}:penalty`);
            record('检定收获', gainsText, 'dc-reward', `${turn.responseId}:dc-reward`);
            save();
            render();
          },
        });
      } else {
        await play(result.display || result.content, turn.responseId);
      }
      if (isCurrentReply()) ready();
    } catch (failure) {
      if (isReplyScene()) {
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
      if (replyPlayback === controller) replyPlayback = null;
      if (isReplyScene()) {
        context.gal.settled('adventure');
        render();
      }
    }
  }
  async function enter(resuming = false) {
    const epoch = ++introEpoch;
    context.gal.cancel();
    const destDlg = document.querySelector('#destination-dialog');
    if (destDlg?.open) destDlg.close();
    session.runtime.mode = 'event';
    clearTimeout(session.runtime.toastTimer);
    document.querySelector('#toast').classList.remove('visible');
    context.onboarding.refresh();
    session.runtime.token++;
    session.runtime.view?.dispose();
    session.runtime.view = null;
    document.body.classList.add('in-adventure');
    context.ledger?.sync();
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
    if (state().event.choiceId && state().event.choiceCheck?.actorId) {
      choiceActorMap.set(state().event.choiceId, state().event.choiceCheck.actorId);
    }
    workspaceOpen = false;
    form.hidden = true;
    root.dataset.composer = 'closed';
    root.style.removeProperty('--rp-panel-bottom');
    root.style.removeProperty('--rp-pill-bottom');
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
      if (epoch !== introEpoch || root.hidden) return;
      if (context.chapterTheater?.playOpening) {
        const isEventNode = trip().index === 1;
        const nodeData = isEventNode ? book().adventure?.event : book().adventure?.quest;
        await context.chapterTheater.playOpening({
          mode: isEventNode ? 'event-opening' : 'quest-opening',
          heading: nodeData?.title || book().title,
          prose: nodeData?.description || '',
          map: trip().exploration?.map || 'ruins',
          testScript: book().title === '旅途测试',
        });
      }
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
    replyPlayback?.abort();
    replyPlayback = null;
    context.gal.cancel('adventure');
    root.hidden = true;
    document.body.classList.remove('in-adventure');
    context.ledger?.sync();
  }
  function click(event) {
    const actor = event.target.closest('[data-rp-actor]');
    if (actor && !state().event.choiceId && !state().event.resolved && !request) {
      event.stopPropagation();
      const targetChoice = actor.dataset.rpActorChoice || selected;
      if (targetChoice) {
        selected = targetChoice;
        choiceActorMap.set(targetChoice, actor.dataset.rpActor);
        render();
        if (!workspaceOpen && !book().recollection) compose();
      }
      return;
    }
    const choice = event.target.closest('[data-rp-choice]');
    if (choice && !state().event.choiceId) {
      selected = choice.dataset.rpChoice;
      render();
      if (!workspaceOpen && !book().recollection) compose();
      return;
    }
    const action = event.target.closest('[data-rp]')?.dataset.rp;
    if (action === 'compose') {
      if (workspaceOpen) context.gal.collapseComposer(root.dataset.composer !== 'collapsed');
      else compose();
    }
    if (action === 'retry') void send(true);
    if (action === 'skip') {
      if (trip().index === 1 && !selected) selected = book().adventure.event.choices[0].id;
      void send(false, true);
    }
    if (action === 'next' || action === 'boss') void context.journey.continueAdventure();
    if (action === 'stay') find('.rp-boss-ready').hidden = true;
    if (action === 'replay') void play(book().story[trip().index], `intro-${trip().index}`);
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
