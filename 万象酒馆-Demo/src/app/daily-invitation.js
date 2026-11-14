import { gameTime } from '../memory.js';
import { settingOnly } from '../ai/contracts.js';
import { applyFutureDialogue, dialogueTargets } from './future-dialogue.js';
import { officialCharacter } from '../ai/library.js';
import { TOWN_GUESTS } from '../content/town-guests.js';
import { townResidents } from '../town-residents.js';
import { parseGalText } from '../gal.js';
import { dailySceneTime } from '../daily.js';
import { withInvitationMemories } from '../memory.js';
import {
  INVITATION_SCENES,
  PERSONAL_EVENT_TRUST,
  applyInvitationPatches,
  invitationAdvance,
  invitationBrief,
  invitationExcerpt,
  invitationRecord,
  invitationSceneProse,
  invitationTranscript,
  invitationTrust,
} from '../invitation.js';
import { relationship } from '../relationships.js';
import { recruitmentPassed, recruitmentStatus } from '../recruitment.js';

function invitationDialogueScenes(run) {
  return [...run.plan.stages.slice(run.index + 1), run.plan.finale].map((scene) => ({
    id: scene.id || 'finale',
    text: invitationSceneProse(run, scene),
    write(text) {
      scene.intro = text;
      if (run.sceneEdits) delete run.sceneEdits[scene.id || 'finale'];
    },
  }));
}

export function invitationCandidates(library) {
  return [
    ...library.characters.filter((member) => member.id !== library.campaign?.protagonistId),
    ...townResidents(library, 'street'),
  ];
}

export function canRecruitInvitation(library, id) {
  return recruitmentStatus(library, id)?.ready === true;
}

export function createDailyInvitation(context, { getScene, navigate, complete, refresh }) {
  const library = () => context.session.ai.library;
  const active = () => library().daily.active;
  const current = () => (active()?.kind === 'invitation' ? active().run : null);
  const save = () => context.generation.save();
  const owner = 'daily-invitation';
  const stagePanel = document.querySelector('#gal-stage');
  const topicRequests = new Map();
  const form = document.createElement('form');
  form.id = 'daily-invitation';
  form.hidden = true;
  form.innerHTML = `<header class="invite-meta">
    <span class="invite-progress" aria-live="polite"></span>
    <div class="invite-actions"><button type="button" data-invite-end>结束约见</button></div></header>
    <div class="invite-choices" aria-label="本幕选项" hidden></div>
    <div class="invite-reply">
      <textarea id="invite-input" rows="3" maxlength="3000" required
        aria-label="约见回应" placeholder="你想说什么，或做什么？"></textarea>
      <button id="invite-send" type="submit" aria-label="回应">回应</button>
    </div>
    <p class="invite-error" role="status"></p>`;
  document.body.append(form);
  const field = form.querySelector('textarea');
  const choices = form.querySelector('.invite-choices');
  const notice = form.querySelector('.invite-error');
  let request = null;
  let workspace = false;
  let reading = false;

  function target(id) {
    return invitationCandidates(library()).find((member) => member.id === id) || null;
  }

  function party(run) {
    const protagonist = library().characters.find(
      (member) => member.id === library().campaign?.protagonistId,
    );
    const member = target(run.member);
    if (!member) throw Error('这位角色当前不在可约见名单');
    return [protagonist, member].filter(Boolean).map(settingOnly);
  }

  function update() {
    const run = current();
    if (!run?.plan || form.hidden) return;
    const stage = run.plan.stages[run.index];
    const turns = run.turns.filter((turn) => turn.stageId === stage.id);
    form.querySelector('.invite-progress').textContent =
      `第 ${run.index + 1}/${run.plan.stages.length} 幕 · ${INVITATION_SCENES[run.scene]} · 已交流 ${turns.length} 轮${stage.title ? ' · ' + stage.title : ''}`;
    field.disabled =
      !!request || reading || !!run.unread || !!run.destination || invitationAdvance(run);
    form.querySelector('[type="submit"]').disabled = field.disabled;
    form.querySelector('[data-invite-end]').disabled = !!request || reading;
    const available = !field.disabled && !turns.length ? stage.choices || [] : [];
    choices.hidden = !available.length;
    choices.replaceChildren(
      ...available.map((text) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.inviteChoice = '';
        button.textContent = text;
        return button;
      }),
    );
  }

  function sceneDialogue(run) {
    if (run.unread && run.unread.type !== 'reply') return [];
    const stage = run.plan.stages[run.index];
    const dialogue = parseGalText(invitationSceneProse(run, stage));
    for (const [index, message] of run.history.entries()) {
      if (run.turns[Math.floor(index / 2)]?.stageId !== stage.id) continue;
      if (message.role === 'user') dialogue.push({ speaker: 'user', text: message.content });
      else if (run.unread?.type !== 'reply' || index !== run.history.length - 1)
        dialogue.push(...parseGalText(message.content));
    }
    return dialogue;
  }

  function openWorkspace(run) {
    if (workspace || current() !== run) return;
    workspace = true;
    form.hidden = false;
    field.value = run.draft || '';
    context.gal.workspace({
      owner,
      title: run.plan.title,
      actors: [run.member],
      followSpeakers: true,
      composer: [form],
      onLayout({ height }) {
        stagePanel.style.setProperty('--daily-invite-composer', `${height}px`);
      },
      transcript: () => sceneDialogue(run),
      onClose() {
        stagePanel.style.removeProperty('--daily-invite-composer');
        workspace = false;
        form.hidden = true;
        request?.abort();
        refresh();
      },
    });
    update();
    refresh();
  }

  async function prepareTopics(run, member, transcript) {
    const book = library();
    topicRequests.get(run.member)?.abort();
    const control = new AbortController();
    topicRequests.set(run.member, control);
    try {
      const result = await context.apiClient.request(
        'generate/script',
        {
          invitationTopics: {
            person: member?.setting.name,
            title: run.plan.title,
            premise: run.plan.premise,
            transcript:
              transcript.length > 10000
                ? transcript.slice(0, 2000) + '\n…\n' + transcript.slice(-8000)
                : transcript,
          },
        },
        { signal: control.signal },
      );
      if (control.signal.aborted || book !== library()) return;
      if (!Array.isArray(result.topics) || result.topics.length !== 4)
        throw Error('约见主题缺少四个选项');
      const topics = (book.daily.memory.invitationTopics ||= {});
      topics[run.member] = result.topics;
      save();
      refresh();
    } catch (failure) {
      if (!control.signal.aborted && book === library())
        context.shell.toast(`下次约见主题生成失败：${failure.message}`);
    } finally {
      if (topicRequests.get(run.member) === control) topicRequests.delete(run.member);
    }
  }

  function finish(run, ended) {
    if (current() !== run) return;
    const member = target(run.member);
    const state = (library().relationships[run.member] ||= {
      ...relationship(library(), run.member),
    });
    const flags = (library().daily.unlocks[run.member] ||= {});
    const completed =
      ended &&
      run.plan.stages.every((stage) =>
        stage.goals.every((goal) =>
          run.turns.some((turn) => turn.stageId === stage.id && turn.completed.includes(goal.id)),
        ),
      );
    const bonus = completed && run.personal && !flags.personal ? 20 : 0;
    if (bonus) flags.personal = true;
    const gain = Math.min(Number.MAX_SAFE_INTEGER - state.affection, invitationTrust(run) + bonus);
    state.affection += gain;
    const record = invitationRecord(run, ended ? 'completed' : 'ended');
    const text = invitationTranscript(run).join('\n\n');
    if (text) {
      const id = (run.id ||= crypto.randomUUID());
      const history = library().invitationHistory;
      if (!history.some((entry) => entry.id === id))
        history.push({
          id,
          member: run.member,
          title: record.title,
          text,
          finishedAt: Date.now(),
          gameTime: run.gameTime || gameTime(library.daily),
          place: INVITATION_SCENES[run.plan.stages[0]?.scene] || INVITATION_SCENES[run.scene],
          person: member?.setting.name,
          recap: [record.premise, ...record.stages.map((stage) => stage.summary)]
            .filter(Boolean)
            .join('\n'),
        });
    }
    const joined = run.recruitment && ended && recruit(run.member, run);
    context.gal.cancel(owner);
    complete(
      'invitation',
      `${ended ? '事件结束' : '约见提前结束'} · ${member?.setting.name || '同伴'} · 好感 +${gain}${bonus ? ' · 个人事件完成' : ''}${run.recruitment ? (joined ? ' · 招募成功' : ' · 交涉未通过') : ''}`,
      record,
    );
    if (text) void context.memory.autoSummarize();
    if (ended && text) void prepareTopics(run, member, text);
  }

  function recruit(id, run = null) {
    const status = recruitmentStatus(library(), id);
    if (!status?.ready || !recruitmentPassed(run, status.difficulty)) return false;
    if (library().characters.length >= 100) {
      context.shell.toast('角色库已满');
      return false;
    }
    library().characters.push(officialCharacter(id.slice(9)));
    save();
    context.shell.renderParty();
    void context.generation.syncCharacters();
    refresh();
    context.shell.toast('已加入酒馆，可以在整备或排班时选择。');
    return true;
  }

  async function read(run) {
    if (reading || !run.unread || run.destination || current() !== run) return;
    const unread = run.unread;
    reading = true;
    update();
    refresh();
    let readToEnd = false;
    const stage = run.plan.stages[run.index];
    await context.gal.play(unread.text, {
      owner,
      title: unread.type === 'finale' ? run.plan.finale.title : run.plan.title,
      mandatory: true,
      onComplete: () => {
        readToEnd = true;
      },
    });
    reading = false;
    if (current() !== run || !readToEnd) return;
    const played = (run.played ||= invitationTranscript(run));
    const player = unread.type === 'reply' && run.history.at(-2)?.content;
    played.push(player ? `玩家：${player}\n\n${unread.text}` : unread.text);
    run.unread = null;
    const notes = ((run.notes ||= {})[stage.id] ||= { scene: run.scene });
    if (unread.type === 'intro') notes.opening = invitationExcerpt(unread.text);
    if (unread.type === 'finale') {
      notes.recap = invitationExcerpt(unread.text);
      return finish(run, true);
    }
    if (unread.type === 'transition') {
      notes.recap = unread.recap || invitationExcerpt(unread.text);
      return advance(run, unread.scene);
    }
    if (invitationAdvance(run)) return advance(run);
    save();
    update();
    refresh();
  }

  async function call(path, payload, apply, { waiting = false } = {}) {
    if (request) return false;
    const run = current();
    const control = new AbortController();
    request = control;
    notice.textContent = '';
    if (waiting) context.gal.waiting();
    update();
    try {
      const result = await context.apiClient.request(path, payload, { signal: control.signal });
      if (control.signal.aborted || current() !== run) return false;
      apply(result);
      save();
      return true;
    } catch (failure) {
      if (current() === run && !control.signal.aborted) {
        notice.textContent = failure.message;
        if (form.hidden) context.shell.toast(failure.message);
      }
      return false;
    } finally {
      if (request === control) request = null;
      context.gal.settled(owner);
      update();
      refresh();
    }
  }

  function advance(run, legacyScene) {
    const next = run.plan.stages[run.index + 1];
    const scene = next || run.plan.finale;
    if (!scene) return finish(run, true);
    if (next) run.index++;
    queueScene(run, scene, next ? 'intro' : 'finale', legacyScene);
    save();
    return presentScene(run);
  }

  function queueScene(run, scene, type, destination = scene.scene) {
    run.unread = { type, text: invitationSceneProse(run, scene) };
    if (destination !== run.scene) run.destination = destination;
  }

  function presentScene(run) {
    if (run.destination) {
      context.gal.cancel(owner);
      refresh();
      return;
    }
    openWorkspace(run);
    return read(run);
  }

  function arrive(scene) {
    const run = current();
    if (!run?.destination) return;
    run.scene = scene;
    if (scene !== run.destination) {
      save();
      return;
    }
    delete run.destination;
    save();
    void presentScene(run);
  }

  context.events.on(form, 'submit', async (event) => {
    event.preventDefault();
    const run = current();
    const text = field.value.trim();
    if (
      !run?.plan ||
      !text ||
      request ||
      reading ||
      run.unread ||
      run.destination ||
      invitationAdvance(run)
    )
      return;
    const stage = run.plan.stages[run.index];
    const people = party(run);
    const protagonistId = library().campaign?.protagonistId;
    run.draft = text;
    const ok = await call(
      'generate/quick-chat',
      {
        text,
        characters: people,
        selected: people.map(({ id }) => id),
        history: run.history,
        dialogueScenes: dialogueTargets(invitationDialogueScenes(run)),
        invitation: {
          stageId: stage.id,
          stageTitle: stage.title,
          title: run.plan.title,
          premise: run.plan.premise,
          description: stage.description,
          opening: invitationSceneProse(run, stage),
          protagonistId,
          scene: INVITATION_SCENES[run.scene],
          timeOfDay: dailySceneTime(active()),
          goals: stage.goals,
          previous: run.turns.filter((turn) => turn.stageId === stage.id),
          turnLimit: stage.maxTurns,
          nextScene: { scene: (run.plan.stages[run.index + 1] || run.plan.finale).scene },
        },
      },
      (result) => {
        if (!result.invitation || !result.content) throw Error('约见缺少正文或评分');
        const { stageId, score, completed, note } = result.invitation;
        applyInvitationPatches(run, result.invitation, people, protagonistId);
        applyFutureDialogue(
          invitationDialogueScenes(run),
          result.dialogue,
          `invitation-${run.turns.length}`,
          people.find((person) => person.id === protagonistId),
        );
        run.turns.push({ stageId, score, completed, ...(note ? { note } : {}) });
        context.quests?.collect(
          result.quest,
          `${(run.id ||= crypto.randomUUID())}:${run.turns.length}`,
          run.scene,
        );
        run.history.push(
          { role: 'user', content: text },
          { role: 'assistant', content: result.content },
        );
        run.unread = { type: 'reply', text: result.display || result.content };
        run.draft = '';
        field.value = '';
      },
      { waiting: true },
    );
    if (ok) await read(run);
  });
  context.events.on(form, 'click', (event) => {
    const run = current();
    if (!run || request || reading) return;
    if (event.target.closest('[data-invite-end]')) finish(run, false);
    const choice = event.target.closest('[data-invite-choice]');
    if (choice && !field.disabled) {
      field.value = choice.textContent;
      form.requestSubmit();
    }
  });

  return {
    member: () => target(current()?.member),
    topics: (id) => library().daily.memory.invitationTopics?.[id] || [],
    busy: () => !!request,
    presenting: () => workspace,
    traveling: () => !!current()?.destination,
    arrive,
    endTravel() {
      const run = current();
      if (run?.destination) finish(run, false);
    },
    brief() {
      const run = current();
      return run?.plan ? invitationBrief(run) : null;
    },
    async start({ member, activity, topic, playerIntent }, onReady) {
      if (request || !target(member)) return;
      const entry = active();
      if (entry?.kind !== 'invitation') return;
      if (entry.run?.plan) return this.resume();
      const personal =
        Object.hasOwn(TOWN_GUESTS, member.replace(/^official-/, '')) &&
        relationship(library(), member).affection >= PERSONAL_EVENT_TRUST &&
        !library().daily.unlocks[member]?.personal;
      const run = {
        gameTime: gameTime(library().daily),
        id: crypto.randomUUID(),
        member,
        recruitment: entry.recruitment === member,
        activity,
        personal,
        index: 0,
        scene: getScene(),
        history: [],
        turns: [],
        played: [],
      };
      entry.run = run;
      const ok = await call(
        'generate/script',
        withInvitationMemories(
          'script',
          {
            party: party(run),
            playerIntent,
            invitation: {
              activity,
              topic,
              member,
              stageCount: 3 + Math.floor(Math.random() * 3),
              timeOfDay: dailySceneTime(entry),
              protagonistId: library().campaign?.protagonistId,
              trust: relationship(library(), member).affection,
              personal,
            },
          },
          library(),
        ),
        ({ invitation }) => {
          if (!invitation?.stages?.length || !invitation.finale) throw Error('约见缺少完整剧本');
          run.plan = invitation;
          queueScene(run, invitation.stages[0], 'intro');
          entry.stage = 'running';
        },
      );
      if (ok) {
        onReady?.();
        await presentScene(run);
      }
    },
    resume() {
      const run = current();
      if (!run?.plan || reading) return;
      if (run.scene !== getScene()) navigate(run.scene);
      if (run.destination) return;
      openWorkspace(run);
      if (run.unread) void read(run);
      else if (invitationAdvance(run)) void advance(run);
    },
    recruit,
    close() {
      request?.abort();
      context.gal.cancel(owner);
    },
    dispose() {
      this.close();
      for (const request of topicRequests.values()) request.abort();
      topicRequests.clear();
      form.remove();
    },
  };
}
