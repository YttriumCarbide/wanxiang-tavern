import {
  EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
  EMBLEMS,
  canCombine,
  COMBINE_SKILL,
} from '../emblems.js';
import { createDialogue } from './dialogue.js';

export function createEmblems(context) {
  const { session, events } = context;
  const dialogue = createDialogue(events, 'emblem-dialogue', context.gal);
  const hint = document.createElement('aside');
  hint.id = 'emblem-lesson';
  hint.hidden = true;
  document.body.append(hint);
  let showing = false;
  const progress = () => session.ai.library.progression;
  function speak(text, done, narrator = false) {
    if (showing) return;
    showing = true;
    const edith =
      session.runtime.mode === 'battle' &&
      session.journey.expedition?.exploration?.map === 'ruins' &&
      session.journey.expedition.exploration.sequence === 1;
    dialogue.show(
      [
        {
          speaker: narrator ? '旁白' : edith ? '伊蒂丝' : '潘多拉',
          portrait: narrator ? null : `./assets/portraits/${edith ? 'edith' : 'pandora'}.png`,
          text,
        },
      ],
      () => {
        showing = false;
        done?.();
      },
    );
  }
  function returned() {
    const state = progress();
    if (state?.overloadLesson === 'summon') state.overloadLesson = 'none';
    if (state?.emblemLesson === 'summon') state.emblemLesson = 'none';
  }
  function equipped() {
    if (
      progress()?.overloadLesson === 'equip' &&
      session.ai.library.characters.some((member) => member.emblemId === OVERLOAD_EMBLEM_ID)
    ) {
      progress().overloadLesson = 'done';
      context.generation.save();
      context.shell.toast('过载纹章已装备，充满六格后即可结合并使用「超限负荷」。');
    }
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
    const arrival = session.journey.expedition?.emblemArrival;
    if (arrival && !arrival.shown) {
      arrival.shown = true;
      context.generation.save();
      context.audio.play('summon');
      const lines = {
        [OVERLOAD_EMBLEM_ID]:
          '断崖兽的咆哮震落了一枚亮着蓝光的戒指。它正回应着同伴。过载纹章士水无月兰将力量交给了我们；超限能让下一次战技以双倍消耗额外释放一次，跨回合也不会白白消失。',
        [DRAGON_EMBLEM_ID]:
          '黑色诅咒撕开的缝隙里，一枚龙纹戒指落到众人面前。伊蒂丝抬起手，星光照出神威的名字：龙咒能削弱孤立的敌人，龙脉则将庇护留在脚下的位置。换上伙伴，庇护仍在那里。',
        [SUPREME_EMBLEM_ID]:
          '林间的恶意骤然倒流，一枚银白纹章浮在枝叶之间。主人……这是玖柒。她能将敌人施下的恶意原路送回；当三种诅咒汇在同一名普通敌人身上，月之瞳便能将其抹去。',
        [MASK_EMBLEM_ID]:
          '树影间落下一副带笑的假面，随后收拢成一枚戒指。伊蒂丝的声音低了下来：风在舞愿意同行。她的攻击以伙伴的生命为代价，死亡也会带来回响。至于欺之牺……使用前，要想清楚献上的会是谁。',
      };
      speak(
        lines[arrival.id] +
          `\n\n已获得${EMBLEMS[arrival.id].emblem.name}。${arrival.recipient ? `戒指选择了${arrival.recipient.name}，已自动装备。` : '大家都已装备戒指，先收入纹章收藏，可在整备中更换。'}`,
        null,
        [DRAGON_EMBLEM_ID, MASK_EMBLEM_ID].includes(arrival.id),
      );
      return;
    }
    if (state.emblemLesson === 'corridor-intro') {
      const actor = session.journey.expedition?.corridorRing?.actor;
      if (!actor || !canCombine(session.battle.state, actor)) {
        state.emblemLesson = 'charge';
        context.generation.save();
        return;
      }
      state.emblemLesson = 'combine';
      context.generation.save();
      const name = session.battle.state.heroDefinitions[actor].name;
      speak(
        `门缝里怎么会有一枚戒指……它自己戴到${name}手上了。星光已经连成六格，这是均衡纹章士檀虹羽的力量。门上的雷锁正在蓄势，第一击会锁定hp最低的位置，造成24伤害并施加一层虚弱！\n\n现在连续点${name}两次，进入结合，再点左侧的「结合技 · 平衡」，把目标选为机关石门。结合标记占住的同一格，可以接着安排${name}的结合技，不用空过先手。\n\n平衡会把雷击分到三个前场位置，空位的那份落空；虚弱仍留在原目标上。先完成结合与平衡，再确认结算。`,
        () => {
          hint.textContent = `双击${name}结合 → 同一时间格使用「平衡」→ 选机关石门 → 确认结算。`;
          hint.hidden = false;
        },
      );
      return;
    }
    if (state.emblemLesson === 'charge') {
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
      session.journey.expedition?.corridorRing &&
      !result.events.some(
        (event) =>
          event.type === 'hero' &&
          event.skill === COMBINE_SKILL.id &&
          event.targets.includes('ruinsGate'),
      )
    ) {
      const actor = session.journey.expedition.corridorRing.actor;
      context.shell.toast(
        `先双击${session.battle.state.heroDefinitions[actor]?.name || '获赠戒指的角色'}结合，再在同一格使用「平衡」标记机关石门，最后确认结算。`,
      );
      return false;
    }
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
      event.source !== document.querySelector('#inn-frame iframe')?.contentWindow
    )
      return;
    if (event.data?.type === 'tavern-emblem-visibility') {
      document.body.classList.toggle(
        'ring-cabinet-open',
        event.data.open === true && session.runtime.mode === 'inn',
      );
      return;
    }
    if (
      !['tavern-emblem', 'tavern-emblem-equip'].includes(event.data?.type) ||
      session.runtime.mode !== 'inn' ||
      session.ai.busy
    )
      return;
    if (event.data.type === 'tavern-emblem') {
      const library = session.ai.library;
      const collection = Object.fromEntries(
        Object.keys(EMBLEMS).map((id) => [
          id,
          {
            owned: library.emblems?.includes(id) || false,
            wearer:
              library.characters.find((member) => member.emblemId === id)?.setting?.name || null,
          },
        ]),
      );
      event.source.postMessage({ type: 'tavern-emblem-collection', collection }, location.origin);
      return;
    }
    context.shell.renderParty();
    document.querySelector('#party-panel').showModal();
  });
  return {
    returned,
    equipped,
    check,
    accepted,
    beforeCommit,
    leave() {
      document.body.classList.remove('ring-cabinet-open');
      hint.hidden = true;
      dialogue.close();
      showing = false;
    },
    dispose() {
      document.body.classList.remove('ring-cabinet-open');
      dialogue.dispose();
      hint.remove();
    },
  };
}
