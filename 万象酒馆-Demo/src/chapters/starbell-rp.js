import {
  createAdventureState,
  adventureTurnContext,
  acceptAdventureReply,
  adventureReady,
} from '../adventure/state.js';
import { investigationEvidence, investigationProgress } from './starbell-investigation.js';

const stage = (title, description, goals, observations, flags) => ({
  title,
  description,
  goals: goals.map((objective, index) => ({
    id: `goal-${index + 1}`,
    objective,
    title: objective,
    description: objective,
    required: true,
  })),
  overview: observations.map(([location, detail]) => ({ location, detail })),
  commonState: '当前调查阶段已有明确结果，后续行动仍由玩家确认。',
  flags,
});

/** Authored present-tense situations, not a pre-generated future chapter script. */
export const CHAPTER_TASKS = Object.freeze({
  tracks: stage(
    '林边的动静',
    '午后的大道空得出奇。艾琳提过的农车没有进城，路边倒伏的草一直延伸到林子里，一辆歪倒的货车堵住了半条小径。树丛中偶尔响起折枝声，停下来细听，又只剩风吹草叶。城里还在准备星灯祭，守卫以为附近只是闹野犬。若要让他们认真查问，得弄清这里究竟发生了什么，以及那些东西正往哪里去。',
    [
      '用现场证据解释车损、痕迹之间的因果，区分意外与袭击',
      '提出证据支持的追查方向，并说明推断的限度',
    ],
    [
      ['林边', '一片草倒向小径，深处几根枝条折断。'],
      ['路面', '新旧车辙叠在一起，部分压痕被脚印盖住。'],
      ['空车', '一辆货车歪在路边，铁箍留下不整齐的裂口。'],
      ['远处', '哨塔方向间歇传来沉闷的响动。'],
    ],
    ['tracks', 'cart'],
  ),
  warn: stage(
    '村长的接待室',
    '第二天上午，村长终于从城外赶回。他的外套还沾着泥，桌上的早餐已经凉了。卫队带来了你们昨日留下的消息，他愿意听一听，却无法只凭陌生旅人的判断停下整座城的生活。门外有人等着核对灯架与商队的安排，室内暂时安静。你们带回的见闻需要交代清楚，也可以询问他为何整夜不在。',
    ['与村长说明城外危险', '核实失联调查队的去向'],
    [
      ['桌面', '几张用过的通行凭条叠在早餐旁。'],
      ['墙边', '一幅城郊地图的一角卷了起来。'],
      ['门口', '卫兵不时查看走廊，巡防册夹在腋下。'],
      ['村长', '他的外套未干，袖口有一道新破口。'],
    ],
    ['warn'],
  ),
  tower: stage(
    '无钟讯的哨塔',
    '旧哨塔近在眼前，窗边却没有值守者探头。白日里按时响起的钟一直沉默，门内有木头抵住的痕迹，散落的东西也没来得及收拾。城里最后收到的消息与这里的景象对不上：究竟是谁先离开了岗位，还是根本没人能走出去？塔后偶尔传来碎石滑落的声音，越靠近越听得清。先查清失联的经过，才能知道该去哪里找人。',
    ['用已发现证据推断哨塔失联经过，区分事实与假设并提出核实办法'],
    [
      ['门槛', '泥点从门外一直延伸到门内，干湿不一。'],
      ['钟绳', '绳尾搭在木凳上，一段纤维磨得发白。'],
      ['桌下', '一个药包露出半边封口，旁边压着纸页。'],
      ['塔后', '墙根附近偶有碎石滑动的声音。'],
    ],
    ['tower'],
  ),
  defense: stage(
    '钟楼下的商议',
    '哨塔的旗终于升起，钟楼下的争论却还没停。村长请来了守备队和几位街区代表：有人主张立刻闭门，有人说城外还有家人，灯匠又担心拆走灯架会把路堵得更窄。艾琳摊开的巡防册上，许多地方都等着同一批人手。大家已经相信危险就在附近，却还没谈拢今晚谁去通知居民、明天哪里留路。桌边多摆了几只杯子，等你们加入商议。',
    ['与村长商定可执行的防御安排'],
    [
      ['长桌', '值勤册、采购单和几只空杯挤在一起。'],
      ['广场', '灯架之间留着搬运推车的通道。'],
      ['街口', '商贩正收拢篷布，偶尔朝钟楼张望。'],
      ['墙边', '几捆支撑木尚未分派去处。'],
    ],
    ['defense'],
  ),
  evacuation: stage(
    '广场的人群',
    '警钟响过，广场上的人却没有都往石厅走。几家人抱着包裹站在喷泉边，有人等孩子，有人放心不下留在屋里的老人，还有人想把摊子一并推走。负责引导的守卫不停核对名字，喊哑了嗓子也听不清所有回答。石厅就在不远处，最难的反倒是从这里走到门口的一小段路。旁边的搬运工停着两辆空车，正四处问谁最需要帮忙。',
    ['帮助居民做好撤离准备'],
    [
      ['喷泉边', '几家人带着包裹，仍在等未到的亲属。'],
      ['街道', '两辆空推车停在摊位外侧。'],
      ['钟楼下', '一名守卫反复查看手里的名单。'],
      ['檐下', '备用星灯挂成一排，灯扣还未扣紧。'],
    ],
    ['evacuation'],
  ),
  aid: stage(
    '商街的诊棚',
    '米蕾借来的桌子已经摆到棚下，床和凳子却还散在药铺里。来帮忙的居民不少，谁也不敢先动那几箱药，只好围着门口问同一句“还缺什么”。送水的人找不到空桶，抱着干净布的学徒又怕东西沾上灰。街外很快会送来伤者，米蕾腾不开手一件件解释。这里需要几个能听明白她的话、再把活分下去的人，也需要让抬担架的能顺利进门。',
    ['协助建立能使用的救护点'],
    [
      ['棚下', '几张桌面已擦净，凳子还散在旁边。'],
      ['药箱', '药包系着不同颜色的绳结。'],
      ['后门', '水桶放在门槛内，桶底留着一层清水。'],
      ['路边', '帮工正在等待米蕾分配工作。'],
    ],
    ['aid'],
  ),
  barricade: stage(
    '城门前的准备',
    '最后几辆农车还在过门，支撑木和绳索却已经堆到了门侧。艾琳一边让卫兵腾出通道，一边听外面接应的人报数，顾不上擦掉流进眼睛的汗。谁来盯大道，什么时候落门，换下来的守卫去哪里歇口气，还有几件事没交代妥当。远处扬起的尘土越来越近，眼下既不能把回城的人关在外面，也不能让一道没固定好的木栅撑着整座城的运气。',
    ['落实城门最后的守备准备'],
    [
      ['门侧', '几根支撑木旁放着绳索，长短不一。'],
      ['通道', '一辆农车正缓慢通过，守卫让出半边道路。'],
      ['警钟', '绳索垂在值守位置，册上记着换岗时间。'],
      ['城外', '大道尽头扬起薄尘，暂时看不清全貌。'],
    ],
    ['barricade'],
  ),
});

export function chapterTaskBook(key, attempt) {
  const quest = CHAPTER_TASKS[key];
  if (!quest) throw Error('未知主线任务阶段');
  return {
    id: `starbell-${attempt}:${key}`,
    story: ['', '', '', '', ''],
    adventure: { event: { title: '', description: '', choices: [] }, quest },
  };
}
export function chapterTaskTurn(state, key, text = '') {
  const investigation = investigationProgress(state, key);
  if (text && investigation && (!investigation.started || !investigation.ready))
    throw Error('请先在场景中找到足够线索，再提交推理');
  const book = chapterTaskBook(key, state.attempt);
  state.tasks[key] ||= createAdventureState(book, book.id);
  const expedition = { id: book.id, index: 3, adventure: state.tasks[key] };
  const turn = adventureTurnContext(expedition, book, text);
  const evidence = investigationEvidence(state, key);
  return {
    ...turn,
    chapter: true,
    fullScript: [],
    npcs: [],
    investigation: evidence,
    scene: evidence
      ? {
          ...book.adventure.quest,
          description: evidence.objective,
          overview: evidence.found.map((clue) => ({ location: clue.name, detail: clue.detail })),
        }
      : book.adventure.quest,
  };
}
export function acceptChapterTask(library, state, key, turn, reply, responseId) {
  const investigation = investigationProgress(state, key);
  if (investigation && (!investigation.started || !investigation.ready))
    throw Error('线索不足，不能确认调查结果');
  const book = chapterTaskBook(key, state.attempt);
  if (reply.adventure?.patches?.length) throw Error('主线阶段不接受未来剧情补丁');
  if (turn.episodeId !== book.id) throw Error('主线任务阶段已变化');
  const expedition = { id: book.id, index: 3, adventure: state.tasks[key] };
  acceptAdventureReply(library, expedition, book, turn, reply, responseId);
  return adventureReady(book.adventure, expedition.adventure);
}

export function restoreChapterTasks(raw, attempt) {
  const tasks = {};
  for (const key of Object.keys(CHAPTER_TASKS)) {
    const saved = raw?.[key];
    if (!saved) continue;
    const book = chapterTaskBook(key, attempt);
    const task = createAdventureState(book, book.id);
    for (const goal of book.adventure.quest.goals) {
      const previous = saved.goals?.[goal.id];
      if (['pending', 'completed'].includes(previous?.status))
        task.goals[goal.id] = {
          status: previous.status,
          evidence: String(previous.evidence || '').slice(0, 500),
        };
    }
    task.responses = (Array.isArray(saved.responses) ? saved.responses : [])
      .filter((id) => typeof id === 'string')
      .slice(-200);
    task.history = (Array.isArray(saved.history) ? saved.history : [])
      .filter(
        (line) => ['user', 'assistant'].includes(line.role) && typeof line.content === 'string',
      )
      .slice(-100);
    tasks[key] = task;
  }
  return tasks;
}
