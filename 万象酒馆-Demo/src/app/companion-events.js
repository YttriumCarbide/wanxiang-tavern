import {
  pandoraEligible,
  joinPandora,
  performedFrontRearSwap,
  performedRetreat,
} from '../companion-events.js';
import { createDialogue } from './dialogue.js';
import { portraitUrl } from '../portraits.js';

export function createCompanionEvents(context) {
  const { session, events } = context;
  const dialogue = createDialogue(events, 'companion-dialogue', context.gal);
  const reminder = document.createElement('aside');
  reminder.id = 'formation-lesson';
  reminder.hidden = true;
  reminder.textContent =
    '前后场与入场技：后场待满一个正式回合后，换入前场会自动触发入场技。先完成交换，再练习后撤。';
  document.body.append(reminder);
  let showing = false;
  function returned() {
    context.emblems?.returned();
    if (showing || session.runtime.mode !== 'inn' || !pandoraEligible(session.ai.library)) return;
    showing = true;
    dialogue.show(
      [
        {
          speaker: '旁白',
          text: '第二次远行归来，副本之门在身后收拢。酒馆暖灯还亮着，门口却多了一个人。紫发少女侧卧在门边，黑白紫相间的裙角压在身下，双手紧紧环着一只戴小王冠的玩偶。她睡得很沉，额发遮住了半张脸，呼吸轻得让人忍不住停下脚步。',
        },
        {
          speaker: '长景月汐',
          text: '“这里怎么躺着一个人？”月汐先蹲下去，将落在少女脸旁的裙带拨开。“喂，醒醒。地板可比床硬多了。”她稍微提高了声音，少女却没有反应，只有怀里的玩偶被抱得更紧。',
        },
        {
          speaker: '伊蒂丝',
          text: '伊蒂丝将围巾的一端垫到少女头下，指尖浮起一小点温和的星光。“呼吸很稳，也没有受伤。可她似乎没有听见我们。”她轻轻碰了碰少女的肩，等了片刻，金色的眼睛里多了些思索。“主人，你过来看看吧。”',
        },
        {
          speaker: '旁白',
          text: '主角在两人让出的空处蹲下，扶住少女的肩，轻轻摸了摸她的额头。就在接触的一刻，少女睫毛颤了一下。她蜷起的手慢慢松开，先看见眼前的人，随即惊得坐起身。玩偶从膝上滑下，她连忙抱回来，一只眼睛里亮起金色星芒，另一只眼中的细小表盘终于开始转动。',
        },
      ],
      () => {
        dialogue.show(
          [
            {
              speaker: '潘多拉',
              portrait: './assets/portraits/pandora.png',
              text: '“主、主人……”她迟疑地叫出这个称呼，双手抱着玩偶，不敢抬头。“对不起，潘多拉没有想挡住门。我本来想等您回来的，可是……靠近这里以后，就睡着了。”',
            },
            {
              speaker: '长景月汐',
              text: '“叫了半天都没反应，你可把我们吓了一跳。”月汐坐在她身旁，把掉在地上的小王冠扶正。“你认识这里的主人？还有，你是从哪一扇门过来的？”',
            },
            {
              speaker: '潘多拉',
              portrait: './assets/portraits/pandora.png',
              text: '“不是从门里……”潘多拉低头看着玩偶。“有人给了我名字、眼睛，还有要做的事。我应该找到万象酒馆的主人，帮助主人。可是我总做不好，想得太多，走得又慢。后来，就只剩下我和小熊了。”她的手指捏住裙边。“在那些没有地方停下来的空隙里，我一直在找这里。”',
            },
            {
              speaker: '伊蒂丝',
              text: '伊蒂丝把一杯温水放到她手边，没有催她继续。“所以你终于找到酒馆，却把最后一点力气也用光了。这里的门认得你，至少已经让你进来了。”她在少女面前蹲下，视线与她齐平。“潘多拉，不必把所有来历一口气说完。先暖一暖手。”',
            },
            {
              speaker: '潘多拉',
              portrait: './assets/portraits/pandora.png',
              text: '“靠近主人的时候，眼睛就醒了。”她抬起脸，表盘映着灯光。“我好像一直知道，会有这样一个人。可是又怕认错……怕自己只是被放出来试一试，结果没用的东西。”她轻轻碰了碰主角刚才扶过她的手，终于没有再躲开。“现在我知道了，是您。”',
            },
            {
              speaker: '长景月汐',
              text: '月汐把自己的椅子往桌边一拉，拍了拍旁边的位置。“找到人就好办了。来，别在门口坐着。会不会冒险可以慢慢学，我到这里的时候连这间酒馆是什么都不知道。”她晃了晃手中的白玉月饰。“而且这里有人一起吃饭，可比一个人赶路有意思多了。”',
            },
            {
              speaker: '潘多拉',
              portrait: './assets/portraits/pandora.png',
              text: '“我能看到一些……别人没注意的东西。战斗的时候，小熊也可以保护大家。”潘多拉把玩偶举起一点，又很快放下。“主人，如果您不嫌弃，下一次请让我一起去。潘多拉会努力的。不是因为必须完成谁的任务……我也想留在这里。”',
            },
            {
              speaker: '伊蒂丝',
              text: '“那就在这里留一个位置。”伊蒂丝笑着把温水再往她手边推近些。“有空看看窗外，有事我们一起走。谁也不是一开始就知道所有方向的。”她看向月汐，又望向主角，指尖的星光慢慢收拢。“今晚先把这里当作归途吧。”',
            },
            {
              speaker: '潘多拉',
              portrait: './assets/portraits/pandora.png',
              text: '潘多拉终于双手捧起杯子。她看看桌边的另外两人，再看看主角，眼中的表盘安稳地走过一格。“嗯……谢谢。”玩偶的小王冠贴着她的脸，她小声对它说：“小熊，我们有可以等人回来的地方了。”',
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
                context.emblems?.returned();
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
    if (
      progress?.entryLesson === 'ready' &&
      !Object.values(session.battle.state.units).some(
        (unit) => unit.side === 'hero' && unit.entryReady,
      )
    )
      progress.entryLesson = 'pending';
    if (!progress || !['pending', 'active', 'retreat'].includes(progress.swapLesson)) return;
    if (progress.swapLesson === 'retreat') {
      reminder.textContent = '将一名前场角色拖到后场空位，确认结算，练习避开攻击。';
      reminder.hidden = false;
      return;
    }
    progress.swapLesson = 'active';
    context.generation.save();
    dialogue.show(
      [
        {
          speaker: '伊蒂丝',
          text: '现在后场开放了。前场负责出手，后场暂时休息。伙伴在后场待满一个完整的正式回合，入场技就会就绪；之后花1 AP换入前场，会自动触发，不额外消耗行动次数。',
        },
        {
          speaker: '潘多拉',
          portrait: './assets/portraits/pandora.png',
          text: '潘多拉在这里……主人，点一下后场的伙伴，再点想换入的前场位置就可以了。拖过去也一样。',
        },
        {
          speaker: '伊蒂丝',
          text: '先试一次交换，确认结算后才真正完成。之后记得让伙伴在后场待满一个正式回合，再看卡牌上的“入场”提示；潘多拉换入时，玩偶会扑击正对面的敌人，并让它停住尚未执行的行动。',
        },
      ],
      () => {
        reminder.hidden = false;
      },
    );
  }
  function beforeCommit() {
    if (
      session.ai.library.progression?.entryLesson === 'ready' &&
      session.ai.library.progression.swapLesson === 'done'
    ) {
      if (!session.battle.forecast.events.some((event) => event.type === 'entrySkill')) {
        context.shell.toast('将入场技就绪的后场伙伴换入前场，再确认结算。');
        return false;
      }
    }
    if (!['active', 'retreat'].includes(session.ai.library.progression?.swapLesson)) return true;
    if (session.ai.library.progression.swapLesson === 'retreat') {
      if (performedRetreat(session.battle.state, session.battle.forecast)) return true;
      context.shell.toast('把一名前场角色拖到后场空位，留空前场以躲避攻击，再确认结算。');
      return false;
    }
    if (!performedFrontRearSwap(session.battle.state, session.battle.forecast)) {
      context.shell.toast('先安排一次后场换入前场，再确认结算。');
      return false;
    }
    return true;
  }
  function checkEntryLesson(result) {
    const progress = session.ai.library.progression;
    if (
      !progress ||
      progress.swapLesson !== 'done' ||
      !['pending', 'ready'].includes(progress.entryLesson)
    )
      return;
    if (result.events.some((event) => event.type === 'entrySkill')) {
      progress.entryLesson = 'done';
      reminder.hidden = true;
      context.generation.save();
      dialogue.show([
        {
          speaker: '伊蒂丝',
          text: '这就是入场技：后场蓄势，换入时自动发动。它不额外消耗 AP 或行动次数；用过以后，再到后场待满一个正式回合就能重新准备。',
        },
      ]);
      return;
    }
    if (result.outcome || dialogue.open) return;
    const ready = result.final.formation
      .slice(3)
      .some((id) => id && result.final.units[id].entryReady);
    if (ready && progress.entryLesson === 'pending') {
      progress.entryLesson = 'ready';
      reminder.textContent = '入场技就绪：将带“入场”提示的后场角色换入前场，再确认结算。';
      reminder.hidden = false;
      context.generation.save();
      dialogue.show([
        {
          speaker: '潘多拉',
          portrait: './assets/portraits/pandora.png',
          text: '主人……后场伙伴的入场技准备好了。把带“入场”提示的伙伴换入前场，看看它怎样自动发动吧。',
        },
      ]);
    }
  }
  function accepted(state, result) {
    checkEntryLesson(result);
    const progress = session.ai.library.progression;
    if (progress?.swapLesson === 'active' && performedFrontRearSwap(state, result)) {
      progress.swapLesson = 'retreat';
      reminder.textContent = '将一名前场角色拖到后场空位，确认结算，练习避开攻击。';
      dialogue.show(
        [
          {
            speaker: '伊蒂丝',
            text: '换入做得很好。现在再试试主动后撤：把一名前场伙伴拖到后场空位，花费一点行动力就能退下，不必叫另一位顶上。前场可以全部留空，敌人瞄准空位时就会扑空；要进攻时再换回来。',
          },
        ],
        () => {
          reminder.hidden = false;
        },
      );
      context.generation.save();
    } else if (progress?.swapLesson === 'retreat' && performedRetreat(state, result)) {
      progress.swapLesson = 'done';
      reminder.hidden = true;
      context.generation.save();
    }
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
