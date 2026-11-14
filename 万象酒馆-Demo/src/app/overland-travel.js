import { escapeText } from '../ui.js';
import { overlandOrigin, overlandPlan, overlandRunPlan } from '../overland-travel.js';
import { archiveOverlandLoot, dungeonLoot, settleEther } from '../archives.js';
import { gameTime } from '../memory.js';

export function createOverlandTravel(
  context,
  { active, intent, scene, navigate, save, render, spendTurns },
) {
  const { session } = context;
  const owner = 'overland-travel';
  const outing = () =>
    active()?.kind === 'outing' && active().stage === 'roaming' ? active() : null;
  const run = () => outing()?.overland;
  const stage = (current) => overlandRunPlan(current).stages[current.index];
  let request = null;
  let reading = false;
  let fighting = false;

  function partyIds() {
    const library = session.ai.library;
    return [
      ...new Set([
        library.campaign?.protagonistId || library.party.find(Boolean),
        ...(outing().companions || []),
      ]),
    ]
      .filter((id) => library.characters.some((member) => member.id === id))
      .slice(0, 3);
  }

  async function start(to) {
    if (!outing() || request || run() || session.runtime.mode !== 'inn') return;
    const entry = outing();
    let control;
    try {
      const discovery = session.ai.library.atlasDiscoveries?.find(({ id }) => id === to);
      const plan = overlandPlan(overlandOrigin(scene()), to, discovery);
      control = new AbortController();
      request = control;
      render();
      const destination = plan.stages.at(-1).to.name;
      const playerIntent = await intent.ask(
        '确认外出路线',
        `前往 ${destination} · ${plan.turns} 回合`,
      );
      if (playerIntent === null || outing() !== entry || control.signal.aborted) return;
      const party = partyIds().map((id) => {
        const member = session.ai.library.characters.find((item) => item.id === id);
        return { id, name: member.setting.name, setting: member.setting };
      });
      const result = await context.apiClient.request(
        'generate/script',
        { overland: { from: plan.from, to: plan.to, discovery }, party, playerIntent },
        { signal: control.signal },
      );
      if (outing() !== entry || control.signal.aborted) return;
      entry.overland = {
        id: crypto.randomUUID(),
        from: plan.from,
        to: plan.to,
        ...(discovery ? { discovery } : {}),
        acts: result.acts,
        ...(Array.isArray(result.items) && result.items.length ? { items: result.items } : {}),
        index: 0,
        phase: 'depart',
        gameTime: gameTime(session.ai.library.daily),
      };
      save();
      resume();
    } catch (failure) {
      if (!control?.signal.aborted) context.shell.toast(failure.message);
    } finally {
      if (request === control) request = null;
      render();
    }
  }

  function resume() {
    const current = run();
    if (!current) return false;
    const entry = outing();
    const leg = stage(current);
    if (current.phase === 'depart') {
      spendTurns(leg.turns);
      entry.scene = leg.to.id === current.discovery?.id ? leg.from.id : leg.to.id;
      current.phase = 'intro';
      save();
    }
    const previous = scene();
    navigate(entry.scene);
    if (previous === entry.scene) queueMicrotask(() => arrive(scene()));
    return true;
  }

  function settle(current, won, continueNow = true) {
    if (run() !== current) return false;
    const entry = outing();
    const leg = stage(current);
    if (!won || current.index + 1 === current.acts.length) {
      const library = session.ai.library;
      if (current.lines?.length && !library.history.some((record) => record.runId === current.id)) {
        const location = stage(current).to.name;
        library.history.push({
          kind: 'overland',
          runId: current.id,
          title: `外出 · ${current.acts[0].title}`,
          place: location,
          people: partyIds()
            .map((id) => library.characters.find((member) => member.id === id)?.setting.name)
            .filter(Boolean),
          complete: true,
          finishedAt: Date.now(),
          gameTime: current.gameTime || gameTime(library.daily),
          lines: current.lines,
        });
      }
      const reachedDiscovery = won && leg.to.id === current.discovery?.id;
      entry.scene = (won && !reachedDiscovery ? leg.to : leg.from).id;
      entry.overlandReached = true;
      delete entry.overland;
      if (continueNow) navigate(entry.scene);
      if (reachedDiscovery) context.daily.arriveDiscovery(current.discovery.id);
      context.shell.toast(won ? `已抵达${leg.to.name}` : `行程结束，退回${leg.from.name}`);
    } else {
      current.index++;
      current.phase = 'depart';
      delete current.choice;
      if (continueNow) resume();
    }
    save();
    if (!entry.overland) void context.memory?.autoSummarize();
    render();
    return true;
  }

  async function arrive(at) {
    const current = run();
    if (
      !current ||
      reading ||
      at !== outing().scene ||
      !['intro', 'outcome'].includes(current.phase) ||
      session.runtime.mode !== 'inn'
    )
      return;
    const act = current.acts[current.index];
    const phase = current.phase;
    const text =
      phase === 'intro'
        ? act.story
        : act.choices.find((item) => item.id === current.choice).outcome;
    reading = true;
    let complete = false;
    try {
      const playback = context.gal.play(text, {
        owner,
        title: act.title,
        mandatory: true,
        onComplete: () => {
          complete = true;
        },
      });
      if (current.index === 0 && phase === 'intro') context.mapExpansion?.discover(current);
      await playback;
    } finally {
      reading = false;
    }
    if (!complete || run() !== current) return;
    (current.lines ||= []).push({ speaker: '旁白', text, encounter: current.index, stage: phase });
    if (phase === 'outcome') {
      settle(current, true);
    } else {
      current.phase = stage(current).type === 'event' ? 'choice' : 'battle';
      save();
      render();
    }
  }

  async function act(choice) {
    const current = run();
    if (!current || session.runtime.mode !== 'inn') return;
    const leg = stage(current);
    if (current.phase === 'choice' && leg.choices.some((item) => item.id === choice)) {
      current.choice = choice;
      current.phase = 'outcome';
      save();
      render();
      await arrive(scene());
    } else if (current.phase === 'battle' && choice === 'fight' && !fighting) {
      fighting = true;
      try {
        await context.journey.startOverlandBattle({
          overland: { run: current.id, leg: leg.id, partyIds: partyIds() },
          returnScene: leg.to.id,
          spec: {
            name: current.acts[current.index].title,
            map: 'forest',
            enemyIds: leg.enemyIds,
            level: leg.level,
            growthEntry: { level: leg.level, seed: 2601, sequence: 0, map: 'forest' },
          },
        });
      } finally {
        fighting = false;
      }
    }
  }

  async function finishBattle() {
    const expedition = session.journey.expedition;
    const current = run();
    const won = session.battle.state.phase === 'victory';
    if (!expedition.pendingResult) {
      const leg = current ? stage(current) : null;
      const runId = current && leg ? `overland:${current.id}:${leg.id}` : null;
      if (won && runId && current?.items?.length) {
        archiveOverlandLoot(session.ai.library, {
          runId,
          title: current.acts[current.index]?.title || leg.to?.name || '外出行程',
          leg,
          items: current.items,
        });
        if (!(await context.lootConflicts.resolve(runId))) return;
      }
      const loot = won && runId ? dungeonLoot(session.ai.library, runId) : [];
      const ether = won && runId ? settleEther(session.ai.library, runId) : 0;
      expedition.status = won ? 'complete' : 'failed';
      expedition.pendingResult = {
        won,
        complete: true,
        encounter: 0,
        awards: expedition.experienceAwards || [],
        ether,
        loot,
      };
      context.audio.play(won ? 'victory' : 'defeat');
      save();
      context.checkpoint.saveNow();
    }
    await context.settlement.show({
      ...expedition.pendingResult,
      backLabel: won ? '继续行程' : '退回上一站',
      back() {
        if (
          current?.id === expedition.overlandBattle.overland.run &&
          stage(current).id === expedition.overlandBattle.overland.leg
        ) {
          settle(current, won, false);
          expedition.overlandBattle.returnScene = outing()?.scene;
        }
        context.journey.returnInn();
        context.checkpoint.saveNow();
      },
    });
  }

  function status() {
    if (request && !run()) return '<span>正在生成外出剧本…</span>';
    const current = run();
    if (!current) return '';
    const act = current.acts[current.index];
    const header = `<span>第 ${current.index + 1}／${current.acts.length} 幕 · ${escapeText(act.title)}</span>`;
    if (current.phase === 'choice')
      return (
        header +
        act.choices
          .map(
            (item) =>
              `<button type="button" data-daily="travel:${item.id}">${escapeText(item.label)}</button>`,
          )
          .join('')
      );
    if (current.phase === 'battle')
      return header + '<button type="button" data-daily="travel:fight">迎战</button>';
    return header;
  }

  return {
    start,
    resume,
    arrive,
    act,
    finishBattle,
    status,
    run,
    dialogueContext() {
      const current = run();
      if (!current) return null;
      return {
        title: current.acts[current.index].title,
        place: stage(current).to.name,
        history: (current.lines || []).slice(-8),
      };
    },
    dialogueScenes() {
      const current = run();
      if (!current || reading) return [];
      return current.acts.flatMap((act, index) => {
        if (index < current.index) return [];
        const scenes = [];
        if (index > current.index || current.phase === 'depart') {
          scenes.push({
            id: `overland-${index}-intro`,
            text: act.story,
            limit: 5000,
            write(text) {
              act.story = text;
            },
          });
        }
        if (index > current.index || ['depart', 'intro', 'choice'].includes(current.phase)) {
          for (const choice of act.choices || []) {
            scenes.push({
              id: `overland-${index}-${choice.id}`,
              text: choice.outcome,
              limit: 2400,
              write(text) {
                choice.outcome = text;
              },
            });
          }
        }
        return scenes;
      });
    },
    recordDialogue(text, reply, chatId) {
      const current = run();
      if (!current) return;
      current.lines = (current.lines || []).filter((line) => !chatId || line.chatId !== chatId);
      current.lines.push(
        { speaker: '玩家', text, encounter: current.index, stage: 'quick-chat', chatId },
        { speaker: '旁白', text: reply, encounter: current.index, stage: 'quick-chat', chatId },
      );
      save();
    },
    busy: () => Boolean(request || run()),
    dispose() {
      request?.abort();
      context.gal.cancel(owner);
    },
  };
}
