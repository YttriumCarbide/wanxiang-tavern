import {
  EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
  BREAKER_EMBLEM_ID,
  EMBLEMS,
  canCombine,
  COMBINE_SKILL,
  BREAKER_SKILL,
} from '../emblems.js';
import { definition } from '../catalog.js';
import { createDialogue } from './dialogue.js';
import { createRingFeedback } from './ring-feedback.js';

export function createEmblems(context) {
  const { session, events } = context;
  const dialogue = createDialogue(events, 'emblem-dialogue', context.gal);
  const ringFeedback = createRingFeedback(context);
  const hint = document.createElement('aside');
  hint.id = 'emblem-lesson';
  hint.hidden = true;
  document.body.append(hint);
  let showing = false;
  let presentation = 0;
  const pendingAwards = new Map();
  const progress = () => session.ai.library.progression;
  function speak(text, done, narrator = false) {
    if (showing) return;
    showing = true;
    const edith =
      session.runtime.mode === 'battle' &&
      session.journey.expedition?.exploration?.map === 'mill' &&
      session.journey.expedition.exploration.sequence === 0;
    const entries = Array.isArray(text)
      ? text
      : [
          {
            speaker: narrator ? '旁白' : edith ? '伊蒂丝' : '潘多拉',
            portrait: narrator ? null : `./assets/portraits/${edith ? 'edith' : 'pandora'}.png`,
            text,
          },
        ];
    dialogue.show(entries, () => {
      showing = false;
      done?.();
    });
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
  function showArrival(arrival) {
    if (arrival.id === BREAKER_EMBLEM_ID) {
      const recipientName = arrival.recipient?.name;
      const narration = recipientName
        ? `发条炉心在高压下裂出一道焦痕，一枚暗铜镶金的戒指从齿缝间震落，咕噜滚到阵前。主角快步俯身拾起戒指，炽铜光纹随即顺着掌心亮起，自动扣上了${recipientName}的指节，六格星环瞬间充盈。`
        : '发条炉心在高压下裂出一道焦痕，一枚暗铜镶金的戒指从齿缝间震落，咕噜滚到阵前。主角快步俯身将其拾起，炽铜光纹在掌心微微震颤了一瞬，随即收拢进纹章收藏。';
      const pandoraGuide = recipientName
        ? `主人，那是破壁纹章士「苍铭」的戒指！趁炼金傀偶此刻露出破绽，现在就双击${recipientName}进入「结合」，再对它施放「结合技 · 裂壳共鸣」——既能一口气剥光它身上的厚盾替全队六人回血，还能把它的韧性直接压到只剩最后一层！`
        : '主人，那是破壁纹章士「苍铭」的戒指！结合期间攻击不仅能双倍破盾、无视弱点额外削韧，结合技「裂壳共鸣」还能直接剥光敌人护盾替全队六人回血，并将可击破目标的剩余韧性压到1层。战后在整备里就能换上！';
      speak(
        [
          { speaker: '旁白', portrait: null, text: narration },
          { speaker: '潘多拉', portrait: './assets/portraits/pandora.png', text: pandoraGuide },
        ],
        () => {
          if (
            arrival.recipient?.actor &&
            canCombine(session.battle.state, arrival.recipient.actor)
          ) {
            hint.dataset.lesson = 'breaker';
            hint.textContent = `双击${arrival.recipient.name}结合 → 使用「裂壳共鸣」剥盾回血并压韧至1层 → 补任意攻击即可破防打断蓄能！`;
            hint.hidden = false;
          }
        },
      );
      return;
    }
    if (arrival.id === EMBLEM_ID) {
      const recipientName = arrival.recipient?.name;
      const narration = recipientName
        ? `尘埃落定间，一枚篆刻着鎏金天平的古戒在微光中浮现。主角探身接住古戒，温润的黄金辉光随即流转开来，自行扣上了${recipientName}的指节，六格星环应声盈满。`
        : '尘埃落定间，一枚篆刻着鎏金天平的古戒在微光中浮现，落入主角掌心，沉静的黄金光纹微颤一瞬后收拢进纹章收藏。';
      const guideText = recipientName
        ? `那是均衡纹章士「檀虹羽」的戒指！趁现在双击${recipientName}开启结合，可以对强敌施放「结合技 · 平衡」——不仅能把它的猛攻均分至三格前排、借空位卸力，还能直接降低它 15% 的伤害（且可与其他减伤叠乘）！`
        : '那是均衡纹章士「檀虹羽」的戒指！结合期间单体攻击可溅射其余敌人，结合技「平衡」还能直接降低目标 15% 伤害并均分至三格前排。战后在整备界面就能佩戴上阵！';
      speak(
        [
          { speaker: '旁白', portrait: null, text: narration },
          { speaker: '潘多拉', portrait: './assets/portraits/pandora.png', text: guideText },
        ],
        () => {
          if (
            arrival.recipient?.actor &&
            canCombine(session.battle.state, arrival.recipient.actor)
          ) {
            hint.textContent = `双击${arrival.recipient.name}结合 → 可使用「平衡」降低敌伤15%并均分伤害！`;
            hint.hidden = false;
          }
        },
      );
      return;
    }
    if (arrival.id === SUPREME_EMBLEM_ID) {
      const recipientName = arrival.recipient?.name;
      const narration = recipientName
        ? `地下拍卖厅穹顶的炼金吊灯被劲风斩落，剑气顺势劈翻拍卖台上的漆木秘匣！一枚银辉流转、嵌着冷月瞳纹的古戒腾空弹起。主角疾步抬手稳稳夺住，清冽的冷月星芒旋即扣上${recipientName}的指节，六格星环瞬间充盈。`
        : '地下拍卖厅穹顶的炼金吊灯被劲风斩落，拍卖台秘匣应声震翻，一枚嵌着冷月瞳纹的银辉古戒腾空弹起，被主角稳稳夺入掌心并铭刻进纹章收藏。';
      const guideText = recipientName
        ? `主人，抢回来了——那是至高纹章士「玖柒」的戒指！黑鸦每回合切换暗器又打得极快，正好撞在枪口上！立刻双击${recipientName}进入「结合」开启「万法归寂」：全队免疫并反弹他的高频暗器负面，他出手越快越快把自己反满 3 种负面，随后直接用「结合技 · 月之瞳」削去他当前一半生命！`
        : '主人，抢回来了——那是至高纹章士「玖柒」的戒指！结合期间「万法归寂」可令全队免疫并反弹敌人施加的负面状态，凑齐至少 3 种负面时施放「结合技 · 月之瞳」还能对首领与霸主直接削去当前一半生命。战后在整备里就能装备！';
      speak(
        [
          { speaker: '旁白', portrait: null, text: narration },
          { speaker: '潘多拉', portrait: './assets/portraits/pandora.png', text: guideText },
        ],
        () => {
          if (
            arrival.recipient?.actor &&
            canCombine(session.battle.state, arrival.recipient.actor)
          ) {
            hint.textContent = `双击${arrival.recipient.name}结合 → 反弹黑鸦暗器凑齐3种负面 → 用「月之瞳」削去其当前一半生命！`;
            hint.hidden = false;
          }
        },
      );
      return;
    }
    if (arrival.id === DRAGON_EMBLEM_ID) {
      const recipientName = arrival.recipient?.name;
      const narration = recipientName
        ? `暗鳞督军破晶而出的狂暴震吼撼动整道岩缝，右侧那块一直泛着温润微光的苍青晶石骤然共振碎裂！漫天青辉里，一枚缠绕龙纹的古戒疾飞而至，顺着主角掌心流转出清冽龙气，自行扣上了${recipientName}的指节，六格星环应声盈满。`
        : '暗鳞督军的震吼撼动整道岩缝，右侧那块苍青晶石骤然共振碎裂，一枚缠绕龙纹的古戒在漫天青辉里落入主角掌心，随即收拢进纹章收藏。';
      const guideText = recipientName
        ? `主人，那是选择纹章士「神威」的龙纹戒指！现在立刻双击${recipientName}进入「结合」——每回合首次伤害触发「龙咒」，能一口气给督军和游离暗尘挂上易伤、虚弱与迟缓，直接压碎督军的硬化暗鳞！再用「结合技 · 龙脉」刻下三格地脉：中位+3铁皮力量敏捷硬扛重砸，左回血右回蓝，稳稳接下督军连击！`
        : '主人，那是选择纹章士「神威」的龙纹戒指！结合期间每回合首次伤害触发「龙咒」施加易伤、虚弱与迟缓，「结合技 · 龙脉」可令左位回血、右位回蓝、中位获3层铁皮力量敏捷并延至结合结束后下下回合初。战后在整备界面就能佩戴上阵！';
      speak(
        [
          { speaker: '旁白', portrait: null, text: narration },
          { speaker: '潘多拉', portrait: './assets/portraits/pandora.png', text: guideText },
        ],
        () => {
          if (
            arrival.recipient?.actor &&
            canCombine(session.battle.state, arrival.recipient.actor)
          ) {
            hint.textContent = `双击${arrival.recipient.name}结合 → 用「龙咒」挂三负面破暗鳞 → 施放「龙脉」中位抗砸、左右续航！`;
            hint.hidden = false;
          }
        },
      );
      return;
    }
    const lines = {
      [OVERLOAD_EMBLEM_ID]:
        '断崖兽的咆哮震落了一枚亮着蓝光的戒指。过载纹章士「水无月兰」将力量交给了我们：结合期间最大 SP 翻倍并回满，每次造成伤害还能同步扩张最大 HP 并回血（结合结束恢复上限但不扣血）；「超限负荷」可令下一次行动重复两次，若是攻击技能，每次攻击都会额外附带结合期间已累计增加的最大 SP 与 HP 之和的伤害。',
      [DRAGON_EMBLEM_ID]:
        '裂隙旁那块苍青晶石骤然共振碎裂，一枚龙纹戒指落到众人面前。星光照出选择纹章士「神威」的名字：结合期间每回合第一次造成伤害时，会对命中的所有敌人施加易伤、虚弱与迟缓；「龙脉」则将一直延续至结合结束后的下下回合开始时（多享一回合），左位每回合回 25% 血、右位回 25% 蓝，中位获得 3 层铁皮、力量与敏捷。',
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
  function queueRingAward(id, actor, battle = session.battle.state) {
    if (!id || !actor || !battle || session.runtime.disposed) return false;
    pendingAwards.set(id, { actor, battle });
    return true;
  }
  async function presentRingAward(id) {
    const award = pendingAwards.get(id);
    if (!award) return false;
    pendingAwards.delete(id);
    if (award.battle !== session.battle.state || session.runtime.mode !== 'battle') return false;
    return await ringFeedback.acquired(id, award.actor);
  }
  function acquireThen(id, done) {
    const battle = session.battle.state;
    const expedition = session.journey.expedition;
    const token = ++presentation;
    showing = true;
    void presentRingAward(id).then(() => {
      if (token !== presentation) return;
      showing = false;
      if (
        !session.runtime.disposed &&
        session.runtime.mode === 'battle' &&
        session.battle.state === battle &&
        session.journey.expedition === expedition
      )
        done();
    });
  }
  function check() {
    const state = progress();
    if (
      !state ||
      showing ||
      session.runtime.mode !== 'battle' ||
      session.battle.playing ||
      context.overlordBattle?.isTutorialOpen?.() ||
      context.onboarding?.isDialogueOpen?.() ||
      ['victory', 'defeat'].includes(session.battle.state.phase)
    )
      return;
    const arrival = [
      session.journey.expedition?.emblemArrival,
      session.battle.state?.midBattleEmblemArrival,
    ].find((item) => item && !item.shown);
    if (arrival && !arrival.shown) {
      arrival.shown = true;
      context.generation.save();
      acquireThen(arrival.id, () => showArrival(arrival));
      return;
    }
    if (state.emblemLesson === 'corridor-intro') {
      const corridor = session.journey.expedition?.corridorRing;
      if (corridor && !corridor.shown) {
        corridor.shown = true;
        context.generation.save();
        acquireThen(EMBLEM_ID, check);
        return;
      }
      const actor = session.journey.expedition?.corridorRing?.actor;
      const corridorTarget = session.journey.expedition?.corridorRing?.bossId || 'millVoleAlpha';
      if (!actor || !canCombine(session.battle.state, actor)) {
        state.emblemLesson = 'charge';
        context.generation.save();
        return;
      }
      state.emblemLesson = 'combine';
      context.generation.save();
      const name = session.battle.state.heroDefinitions[actor].name;
      const targetName = definition(session.battle.state, corridorTarget)?.name || '田鼠头鼠';
      speak(
        `那枚一直戴在${name}手上的传家旧戒……居然在这个时候亮起来了！星光已经连成六格，原来它是均衡纹章士「檀虹羽」的戒指！前头还有田鼠头鼠带着小耗子和毒蛙，刚好拿它们试一试共鸣。\n\n现在连续点${name}两次进入结合，再点左侧的「结合技 · 平衡」，把目标选为${targetName}。结合以后，单体攻击也能波及旁边的敌人，而且结合标记占住的同一格可以接着安排${name}的行动，不用空过先手。\n\n「平衡」会把${targetName}打过来的伤害先削减 15%，再均分到三个前场位置（空位那份会落空）。先完成结合并给${targetName}挂上「平衡」，再确认结算。`,
        () => {
          hint.textContent = `双击${name}结合 → 同一时间格使用「平衡」→ 选${targetName} → 确认结算。`;
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
    if (showing) return false;
    if (!['combine', 'skill'].includes(progress()?.emblemLesson)) return true;
    const result = session.battle.forecast;
    const corridorTarget = session.journey.expedition?.corridorRing?.bossId || 'millVoleAlpha';
    if (
      progress().emblemLesson === 'combine' &&
      session.journey.expedition?.corridorRing &&
      session.battle.state.units[corridorTarget]?.hp > 0 &&
      !result.events.some(
        (event) =>
          event.type === 'hero' &&
          event.skill === COMBINE_SKILL.id &&
          event.targets.includes(corridorTarget),
      )
    ) {
      const actor = session.journey.expedition.corridorRing.actor;
      const targetName = definition(session.battle.state, corridorTarget)?.name || '田鼠头鼠';
      context.shell.toast(
        `先双击${session.battle.state.heroDefinitions[actor]?.name || '获赠戒指的角色'}结合，再在同一格使用「平衡」标记${targetName}，最后确认结算。`,
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
    if (
      hint.dataset.lesson === 'breaker' &&
      result.events.some((event) => event.type === 'hero' && event.skill === BREAKER_SKILL.id)
    ) {
      delete hint.dataset.lesson;
      hint.hidden = true;
    }
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
  function syncRingCollection(targetWindow) {
    if (!targetWindow) return;
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
    targetWindow.postMessage({ type: 'tavern-emblem-collection', collection }, location.origin);
  }
  function openGallery() {
    const frameWindow = document.querySelector('#inn-frame iframe')?.contentWindow;
    if (session.runtime.mode !== 'inn' || session.ai.busy || !frameWindow?.assetPreview)
      return false;
    syncRingCollection(frameWindow);
    frameWindow.postMessage({ type: 'tavern-open-ring-gallery' }, location.origin);
    return true;
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
      context.ledger?.sync();
      return;
    }

    if (
      !['tavern-emblem', 'tavern-emblem-equip'].includes(event.data?.type) ||
      session.runtime.mode !== 'inn' ||
      session.ai.busy
    )
      return;
    if (event.data.type === 'tavern-emblem') {
      syncRingCollection(event.source);
      return;
    }
    context.shell.renderParty();
    document.querySelector('#party-panel').showModal();
  });
  return {
    openGallery,
    returned,
    equipped,
    check,
    accepted,
    beforeCommit,
    queueRingAward,
    presentRingAward,
    cancelRingFeedback() {
      ++presentation;
      ringFeedback.cancel();
      showing = false;
      for (const [id, award] of pendingAwards) {
        if (award.battle !== session.battle.state) pendingAwards.delete(id);
      }
    },
    onBattleEvent(event, before) {
      return ringFeedback.event(event, before);
    },
    leave() {
      ++presentation;
      pendingAwards.clear();
      ringFeedback.cancel();
      document.body.classList.remove('ring-cabinet-open');
      hint.hidden = true;
      dialogue.close();
      showing = false;
    },
    dispose() {
      ++presentation;
      pendingAwards.clear();
      ringFeedback.dispose();
      showing = false;
      document.body.classList.remove('ring-cabinet-open');
      dialogue.dispose();
      hint.remove();
    },
  };
}
