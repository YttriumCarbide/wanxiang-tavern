import { pandoraEligible, joinPandora, performedFrontRearSwap } from '../companion-events.js';
import { createDialogue } from './dialogue.js';
import { portraitUrl } from '../portraits.js';

export function createCompanionEvents(context) {
  const { session, events } = context;
  const dialogue = createDialogue(events, 'companion-dialogue');
  const reminder = document.createElement('aside');
  reminder.id = 'formation-lesson';
  reminder.hidden = true;
  reminder.textContent =
    '前后场教学：点击或拖动后场伙伴，换入一个前场位置。消耗 1 AP，后场伙伴不能直接使用主动技能。完成一次真实交换后继续。';
  document.body.append(reminder);
  let showing = false;
  function returned() {
    if (showing || session.runtime.mode !== 'inn' || !pandoraEligible(session.ai.library)) return;
    showing = true;
    dialogue.show(
      [
        {
          speaker: '酒馆门前',
          text: '第三次远行归来，酒馆门口多了一抹蜷缩的紫色。少女靠着门框睡着了，怀中紧抱着戴小王冠的玩偶，蕾丝裙角散在地上。主人俯身扶稳她的肩，轻轻将她唤醒。她睁开眼，一边眼瞳亮起金色星芒，另一边的表盘缓缓转动。',
        },
      ],
      () => {
        dialogue.show(
          [
            {
              speaker: '潘多拉',
              portrait: './assets/portraits/pandora.png',
              text: '主、主人……对不起，潘多拉本来想等您回来的，结果又睡着了。请让我留下吧，我想和大家一起去。',
            },
            {
              speaker: '长景月汐',
              text: '当然欢迎！先站起来，地上可不适合睡觉。下次出发也一起吧，遇到新鲜事我可不会落下你。',
            },
            {
              speaker: '伊蒂丝',
              text: '欢迎回来，潘多拉。旅途可以慢慢熟悉，累了就到我们身后歇一歇。星星走得再慢，也总会找到同行的光。',
            },
            {
              speaker: '潘多拉',
              portrait: './assets/portraits/pandora.png',
              text: '嗯……潘多拉会认真看着大家，不拖后腿的。主人，下次请带上我。',
            },
          ],
          () => {
            showing = false;
            try {
              if (joinPandora(session.ai.library)) {
                context.generation.save();
                context.shell.renderParty();
                void context.generation.syncCharacters();
                context.shell.toast('潘多拉加入酒馆。下一趟副本将学习前后场交换。');
              }
            } catch (failure) {
              context.shell.toast(failure.message);
            }
          },
        );
      },
      true,
    );
  }
  function battleStarted() {
    const progress = session.ai.library.progression;
    if (!progress || !['pending', 'active'].includes(progress.swapLesson)) return;
    progress.swapLesson = 'active';
    context.generation.save();
    dialogue.show(
      [
        {
          speaker: '伊蒂丝',
          text: '人多起来了，旅途也能换个走法。前场的伙伴负责出手，后场的伙伴暂时休息。花费一点行动力，就能让后场的一位接替前场。',
        },
        {
          speaker: '潘多拉',
          portrait: './assets/portraits/pandora.png',
          text: '潘多拉在这里……主人，点一下后场的伙伴，再点想换入的前场位置就可以了。拖过去也一样。',
        },
        {
          speaker: '伊蒂丝',
          text: '现在试一次吧。先手的这一点行动力正好够用，确认结算以后，这次交换才真正完成。',
        },
      ],
      () => {
        reminder.hidden = false;
      },
    );
  }
  function beforeCommit() {
    if (session.ai.library.progression?.swapLesson !== 'active') return true;
    if (!performedFrontRearSwap(session.battle.state, session.battle.forecast)) {
      context.shell.toast('先安排一次后场换入前场，再确认结算。');
      return false;
    }
    return true;
  }
  function accepted(state, result) {
    if (
      session.ai.library.progression?.swapLesson !== 'active' ||
      !performedFrontRearSwap(state, result)
    )
      return;
    session.ai.library.progression.swapLesson = 'done';
    reminder.hidden = true;
    context.generation.save();
  }
  function arrival(entry, lines) {
    const player = session.ai.library.characters.find(
      (member) => member.id === session.ai.library.campaign?.protagonistId,
    );
    const content = lines || [
      { speaker: 'character', text: `我是${entry.setting.name}。这里就是万象酒馆吗？` },
      { speaker: 'player', text: '欢迎来到酒馆，先坐下来歇歇吧。' },
      { speaker: 'character', text: '好。关于这里的故事，我很想听听。' },
    ];
    dialogue.show(
      content.map((line) => ({
        speaker: line.speaker === 'player' ? player?.setting.name || '主人' : entry.setting.name,
        portrait: portraitUrl(
          line.speaker === 'player' ? player?.combat || entry.combat : entry.combat,
        ),
        text: line.text,
      })),
      null,
    );
  }
  return {
    returned,
    battleStarted,
    beforeCommit,
    accepted,
    arrival,
    leave() {
      reminder.hidden = true;
    },
    dispose() {
      dialogue.dispose();
      reminder.remove();
    },
  };
}
