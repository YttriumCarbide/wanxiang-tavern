import { EMBLEM_ID, OVERLOAD_EMBLEM_ID, canCombine, COMBINE_SKILL } from '../emblems.js';
import { createDialogue } from './dialogue.js';

export function createEmblems(context) {
  const { session, events } = context;
  const dialogue = createDialogue(events, 'emblem-dialogue');
  const hint = document.createElement('aside');
  hint.id = 'emblem-lesson';
  hint.hidden = true;
  document.body.append(hint);
  let showing = false;
  const progress = () => session.ai.library.progression;
  function speak(text, done) {
    if (showing) return;
    showing = true;
    dialogue.show([{ speaker: '潘多拉', portrait: './assets/portraits/pandora.png', text }], () => {
      showing = false;
      done?.();
    });
  }
  function returned() {
    const state = progress();
    if (
      !state?.pandoraJoined ||
      state.settlements.length < 3 ||
      session.ai.library.emblems?.includes(EMBLEM_ID) ||
      showing
    )
      return;
    if (!['none', undefined].includes(state.emblemLesson)) return;
    state.emblemLesson = 'summon';
    context.generation.save();
    speak(
      '主人……命运桌上，有一枚正在发亮的纹章。它记着另一位旅人的力量。我们去命运桌看看吧，试着召唤与您同行的纹章士。',
      () => context.shell.toast('前往命运桌，召唤纹章士。'),
    );
  }
  function equipped() {
    if (
      progress()?.emblemLesson !== 'equip' ||
      !session.ai.library.characters.some((member) => member.emblemId === EMBLEM_ID)
    )
      return;
    progress().emblemLesson = 'charge';
    context.generation.save();
    context.shell.toast('纹章已装备。下一趟副本中，攻击充能 1 格，后场每回合充能 2 格。');
  }
  function check() {
    const state = progress();
    if (
      !state ||
      showing ||
      session.runtime.mode !== 'battle' ||
      session.battle.playing ||
      ['victory', 'defeat'].includes(session.battle.state.phase)
    )
      return;
    if (state.emblemLesson === 'charge' && state.settlements.length >= 3) {
      const actor = session.battle.state.formation
        .slice(0, 3)
        .find((id) => canCombine(session.battle.state, id));
      if (!actor) return;
      state.emblemLesson = 'combine';
      context.generation.save();
      speak(
        '纹章的六格光已经亮满了……主人，连续点选这名前场伙伴两次，就能结合。结合会先占住最近的空时间格；这一格还能安排同一位伙伴的行动，也可以留空。删去标记就能取消。',
        () => {
          hint.textContent = '连续点选满充能的前场角色两次，安排结合并确认结算。';
          hint.hidden = false;
        },
      );
    } else if (state.emblemLesson === 'combine' || state.emblemLesson === 'skill') {
      hint.textContent =
        state.emblemLesson === 'combine'
          ? '连续点选满充能的前场角色两次，安排结合并确认结算。'
          : '选择结合中的角色，使用「结合技 · 平衡」并确认结算。';
      hint.hidden = false;
    }
  }
  function beforeCommit() {
    if (!['combine', 'skill'].includes(progress()?.emblemLesson)) return true;
    const result = session.battle.forecast;
    if (
      progress().emblemLesson === 'combine' &&
      !result.events.some((event) => event.type === 'engage')
    ) {
      context.shell.toast('先点选满充能的前场伙伴两次，安排结合。');
      return false;
    }
    if (
      progress().emblemLesson === 'skill' &&
      !result.events.some((event) => event.type === 'hero' && event.skill === COMBINE_SKILL.id)
    ) {
      const active = Object.values(session.battle.state.units).some(
        (unit) => unit.hp > 0 && unit.combined,
      );
      if (!active) {
        progress().emblemLesson = 'charge';
        hint.hidden = true;
        context.generation.save();
        return true;
      }
      context.shell.toast('试着使用一次结合技「平衡」，再确认结算。');
      return false;
    }
    return true;
  }
  function accepted(result) {
    const state = progress();
    if (!state) return;
    if (
      ['combine', 'skill'].includes(state.emblemLesson) &&
      result.events.some((event) => event.skill === COMBINE_SKILL.id && event.type === 'hero')
    ) {
      state.emblemLesson = 'done';
      hint.hidden = true;
      context.generation.save();
      return;
    }
    if (
      state.emblemLesson === 'combine' &&
      result.events.some((event) => event.type === 'engage')
    ) {
      state.emblemLesson = 'skill';
      context.generation.save();
      speak(
        '结合以后，单体攻击也会伤到其他敌人，状态只留在原来的目标身上。左侧现在能使用「平衡」了。被标记敌人的攻击会分到三个前场位置，空位的那份会落空；原本的状态目标不变。每次结合只能使用一次，结合最多持续三个回合。',
        () => {
          hint.textContent = '选择结合中的角色，使用「结合技 · 平衡」并确认结算。';
          hint.hidden = false;
        },
      );
    }
  }
  events.on(window, 'message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== document.querySelector('#inn-frame iframe')?.contentWindow ||
      event.data?.type !== 'tavern-emblem' ||
      session.runtime.mode !== 'inn' ||
      session.ai.busy
    )
      return;
    if (!session.ai.library.emblems?.includes(EMBLEM_ID)) {
      if (!progress()?.pandoraJoined || progress().settlements.length < 3) {
        context.shell.toast('命运桌上的纹章还在沉睡。');
        return;
      }
      session.ai.library.emblems ||= [];
      session.ai.library.emblems.push(EMBLEM_ID);
      progress().emblemLesson = 'equip';
      context.generation.save();
      context.audio.play('summon');
      speak(
        '均衡纹章士，檀虹羽……她回应您了。打开整备，点选一位伙伴，在角色装备上方选择这枚纹章。一个人只能装备一位纹章士。',
        () => (context.shell.renderParty(), document.querySelector('#party-panel').showModal()),
      );
      return;
    }
    if (!session.ai.library.emblems.includes(OVERLOAD_EMBLEM_ID)) {
      const ether = session.ai.library.inventory?.ether || 0;
      if (ether < 100) {
        context.shell.toast('以太不足，需要 100 以太结识过载纹章士水无月兰。');
        (context.shell.renderParty(), document.querySelector('#party-panel').showModal());
        return;
      }
      session.ai.library.inventory.ether -= 100;
      session.ai.library.emblems.push(OVERLOAD_EMBLEM_ID);
      context.generation.save();
      context.audio.play('summon');
      speak(
        '过载纹章士，水无月兰……她回应了您的呼唤。灵能血装将大幅扩展法力与体能，超限负荷能令下一次战技产生双倍轰鸣。',
        () => (context.shell.renderParty(), document.querySelector('#party-panel').showModal()),
      );
      return;
    }
    (context.shell.renderParty(), document.querySelector('#party-panel').showModal());
  });
  return {
    returned,
    equipped,
    check,
    accepted,
    beforeCommit,
    leave() {
      hint.hidden = true;
      dialogue.close();
      showing = false;
    },
    dispose() {
      dialogue.dispose();
      hint.remove();
    },
  };
}
