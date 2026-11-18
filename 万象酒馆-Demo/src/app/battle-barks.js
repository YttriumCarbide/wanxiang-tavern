import { DEFINITIONS } from '../data.js';
import { currentEncounterSpec } from '../expedition.js';
import { portraitUrl } from '../portraits.js';
import { query as $, sleep } from './dom.js';

/** Non-blocking battle barks shown in #battle-bark-banner at key combat beats. */
export function createBattleBarks(context) {
  const { session } = context;
  let token = 0;
  let shownBattleKey = '';
  let enragedShownKey = '';

  function banner() {
    return $('#battle-bark-banner');
  }

  function battleKey() {
    const expedition = session.journey.expedition;
    const state = session.battle.state;
    if (!expedition || !state) return '';
    return `${expedition.id || 'run'}:${state.encounter ?? 0}:${expedition.overlandBattle?.overland?.leg || ''}`;
  }

  function clear() {
    token++;
    const element = banner();
    if (!element) return;
    element.classList.remove('is-entering', 'is-leaving');
    delete element.dataset.versus;
    element.hidden = true;
    element.replaceChildren();
  }

  function createPortraitSide(className, portrait, name) {
    const side = document.createElement('span');
    side.className = `bark-vs-side ${className}`;
    if (portrait) {
      const img = document.createElement('img');
      img.src = portrait;
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      side.append(img);
    }
    const label = document.createElement('span');
    label.textContent = name || '';
    side.append(label);
    return side;
  }

  async function runSequence(items, holdMs = 2600) {
    const valid = (items || []).filter(
      (item) => item && typeof item.text === 'string' && item.text.trim(),
    );
    const element = banner();
    if (!valid.length || !element || session.runtime.disposed) return;
    const myToken = ++token;
    const speed = Math.max(0.5, session.battle.speed || 1);

    for (const item of valid) {
      if (myToken !== token || session.runtime.disposed) return;
      element.replaceChildren();
      if (item.versus) {
        element.dataset.versus = 'true';
        const strip = document.createElement('div');
        strip.className = 'battle-bark-versus';
        const mark = document.createElement('em');
        mark.className = 'bark-vs-mark';
        mark.textContent = 'VS';
        strip.append(
          createPortraitSide('is-boss', item.versus.bossPortrait, item.versus.bossName),
          mark,
          createPortraitSide('is-party', item.versus.partyPortrait, item.versus.partyName),
        );
        element.append(strip);
      } else {
        delete element.dataset.versus;
      }

      const body = document.createElement('div');
      body.className = 'battle-bark-body';
      if (item.speaker) {
        const speaker = document.createElement('span');
        speaker.className = 'battle-bark-speaker';
        speaker.textContent = item.speaker;
        body.append(speaker);
      }
      const line = document.createElement('p');
      line.className = 'battle-bark-text';
      line.textContent = item.text.trim();
      body.append(line);
      if (item.stepLabel) {
        const step = document.createElement('small');
        step.className = 'battle-bark-step';
        step.textContent = item.stepLabel;
        body.append(step);
      }
      element.append(body);
      element.dataset.tone = item.tone || 'boss';
      element.classList.remove('is-leaving');
      element.classList.add('is-entering');
      element.hidden = false;

      await sleep(Math.round(holdMs / speed));
      if (myToken !== token || session.runtime.disposed) return;
      element.classList.remove('is-entering');
      element.classList.add('is-leaving');
      await sleep(260);
    }

    if (myToken === token) clear();
  }

  function bossDef(actorId) {
    const defs = session.battle.state?.enemyDefinitions || DEFINITIONS;
    if (actorId && defs[actorId]) return defs[actorId];
    const bossId = (session.battle.state?.enemyIds || []).find((id) => defs[id]?.boss);
    return (bossId && defs[bossId]) || null;
  }

  function bossName(actorId) {
    return bossDef(actorId)?.name || '首领';
  }

  function bossPortrait(actorId) {
    const def = bossDef(actorId);
    return def ? portraitUrl(def) : '';
  }

  function leaderDef() {
    const id =
      session.ai.library.campaign?.protagonistId ||
      session.journey.expedition?.partyIds?.find(Boolean);
    const defs = session.battle.state?.heroDefinitions || {};
    return (id && defs[id]) || Object.values(defs)[0] || null;
  }

  function leaderName() {
    return leaderDef()?.name || '同行者';
  }

  function leaderPortrait() {
    const def = leaderDef();
    return def ? portraitUrl(def) : '';
  }

  function roundOneStart() {
    if (context.overlordBattle?.isOverlordBattle?.()) return;
    const key = battleKey();
    if (!key || shownBattleKey === key) return;
    const expedition = session.journey.expedition;
    const spec = currentEncounterSpec(expedition, session.battle.state?.encounter ?? 0);
    if (expedition?.overlandBattle?.battleLines?.intro) {
      shownBattleKey = key;
      void runSequence([
        {
          speaker: spec.name || '遭遇敌军',
          text: expedition.overlandBattle.battleLines.intro,
          tone: 'boss',
        },
      ]);
      return;
    }
    const lines = session.ai.activeScript?.battleLines;
    if (!spec?.boss || !lines) return;
    shownBattleKey = key;
    const versus = {
      bossPortrait: bossPortrait(),
      partyPortrait: leaderPortrait(),
      bossName: bossName(),
      partyName: leaderName(),
    };
    void runSequence(
      [
        ...(lines.bossIntro
          ? [
              {
                speaker: bossName(),
                text: lines.bossIntro,
                tone: 'boss',
                stepLabel: 'I · 威压降临',
                versus,
              },
            ]
          : []),
        ...(lines.partyReply
          ? [
              {
                speaker: leaderName(),
                text: lines.partyReply,
                tone: 'party',
                stepLabel: 'II · 锋芒相迎',
                versus,
              },
            ]
          : []),
        {
          speaker: bossName(),
          text: lines.bossDeclaration || '既然踏入此地，便用你们的性命来见证终局！',
          tone: 'enraged',
          stepLabel: 'III · 宿命交锋',
          versus,
        },
      ],
      2700,
    );
  }

  function bossEnraged(actorId) {
    if (context.overlordBattle?.isOverlordBattle?.()) return;
    const key = battleKey();
    const lines = session.ai.activeScript?.battleLines;
    if (!key || enragedShownKey === key || !lines?.bossEnraged) return;
    enragedShownKey = key;
    void runSequence(
      [{ speaker: bossName(actorId), text: lines.bossEnraged, tone: 'enraged' }],
      2800,
    );
  }

  async function battleWon() {
    if (context.overlordBattle?.isOverlordBattle?.()) {
      await context.overlordBattle.onVictory();
      return;
    }
    const expedition = session.journey.expedition;
    if (expedition?.overlandBattle?.battleLines?.defeat) {
      await runSequence(
        [
          {
            speaker: '战局落定',
            text: expedition.overlandBattle.battleLines.defeat,
            tone: 'party',
          },
        ],
        1400,
      );
      return;
    }
    const spec = currentEncounterSpec(expedition, session.battle.state?.encounter ?? 0);
    const lines = session.ai.activeScript?.battleLines;
    if (spec?.boss && lines?.bossDefeat) {
      await runSequence([{ speaker: bossName(), text: lines.bossDefeat, tone: 'boss' }], 1500);
    }
  }

  return {
    show: runSequence,
    roundOneStart,
    bossEnraged,
    battleWon,
    clear,
    dispose: clear,
  };
}
