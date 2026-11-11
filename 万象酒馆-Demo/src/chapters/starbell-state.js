import { CHAPTER_TASKS, restoreChapterTasks } from './starbell-rp.js';
import { adventureReady } from '../adventure/state.js';
import { CHAPTER_NPCS } from './starbell-content.js';
import { restoreInvestigations, investigationProgress } from './starbell-investigation.js';

// Keep authored progress for a later return; exploration remains available independently.
export const STARBELL_ENABLED = false;

const phases = [
  'idle',
  'morning',
  'afternoon',
  'day1done',
  'day2',
  'day2done',
  'day3',
  'won',
  'failed',
];
const mainFlags = [
  'festival',
  'fountain',
  'permit',
  'tracks',
  'cart',
  'scout',
  'warn',
  'tower',
  'elite',
  'defense',
  'evacuation',
  'aid',
  'barricade',
  'boss',
  'mayor-absent',
];
const validFlags = new Set([
  ...mainFlags,
  ...Object.keys(CHAPTER_NPCS).flatMap((key) => [`meet-${key}`, `help-${key}`, `finish-${key}`]),
]);

export function restoreStarbell(raw) {
  return {
    version: 2,
    investigations: restoreInvestigations(raw?.investigations),
    visited: [
      ...new Set(
        (Array.isArray(raw?.visited) ? raw.visited : []).filter((id) =>
          ['street', 'city-center', 'market', 'rampart'].includes(id),
        ),
      ),
    ],
    tasks: restoreChapterTasks(raw?.tasks, Math.max(1, Math.floor(Number(raw?.attempt) || 1))),
    phase: phases.includes(raw?.phase) ? raw.phase : 'idle',
    attempt: Math.max(1, Math.floor(Number(raw?.attempt) || 1)),
    flags: [
      ...new Set(
        (Array.isArray(raw?.flags) ? raw.flags : []).filter((flag) => validFlags.has(flag)),
      ),
    ],
    recruited: [
      ...new Set(
        (Array.isArray(raw?.recruited) ? raw.recruited : []).filter((key) =>
          Object.hasOwn(CHAPTER_NPCS, key),
        ),
      ),
    ],
    failureDay: [1, 2, 3].includes(raw?.failureDay) ? raw.failureDay : 1,
    log: (Array.isArray(raw?.log) ? raw.log : [])
      .filter((entry) => typeof entry?.text === 'string')
      .slice(-500),
    chats: (Array.isArray(raw?.chats) ? raw.chats : [])
      .filter((entry) => typeof entry?.content === 'string')
      .slice(-100),
    pendingBattle: ['scout', 'elite', 'boss'].includes(raw?.pendingBattle)
      ? raw.pendingBattle
      : null,
    read: [
      ...new Set(
        (Array.isArray(raw?.read) ? raw.read : []).filter((key) => typeof key === 'string'),
      ),
    ],
  };
}
export function starbellState(library) {
  library.starbell ||= restoreStarbell();
  return library.starbell;
}
export function visitChapterScene(state, scene) {
  const id = scene === 'starlamp-street' ? 'street' : scene;
  if (state.phase !== 'morning' || !['street', 'city-center', 'market', 'rampart'].includes(id))
    return false;
  if (!state.visited.includes(id)) state.visited.push(id);
  return state.visited.length === 4;
}
export function confirmChapterTask(state, key, scene) {
  const investigation = investigationProgress(state, key);
  if (investigation && !investigation.ready) throw Error('还没有足够线索支持推理');
  const quest = CHAPTER_TASKS[key];
  if (!quest || !state.tasks[key] || !adventureReady({ quest }, state.tasks[key]))
    throw Error('当前任务尚未达成');
  if (!chapterActions(state, scene).some((action) => action.id === key))
    throw Error('任务所在阶段或地点已变化');
  for (const flag of quest.flags) if (!state.flags.includes(flag)) state.flags.push(flag);
  if (key === 'defense') state.phase = 'day2done';
}
export function chapterDay(state) {
  if (state.phase === 'failed') return state.failureDay;
  if (['idle', 'morning', 'afternoon', 'day1done'].includes(state.phase)) return 1;
  return ['day2', 'day2done'].includes(state.phase) ? 2 : 3;
}
export function chapterObjective(state) {
  const has = (flag) => state.flags.includes(flag);
  if (state.phase === 'idle') return '门外传来街市的声音。准备好后，可以和大家一起出去看看。';
  if (state.phase === 'failed') return '先在酒馆养好伤，再决定是否重新回到星钟城。';
  if (state.phase === 'won') return '星钟城迎来了新的一天。回去看看朋友，或继续尚未赴完的约定。';
  if (state.phase === 'morning')
    return state.visited.length === 4
      ? '月汐提议回酒馆歇脚，伊蒂丝似乎想起了与钟楼有关的一本书。'
      : '星灯祭还有两天。和大家逛逛门前街道、广场、商业街与城墙，认识这里的人。';
  if (state.phase === 'afternoon')
    return !has('permit')
      ? '地志记着星钟城将在祭典夜毁灭。先找城墙边的守卫，问问最近有没有异状。'
      : !has('tracks') || !has('cart')
        ? '艾琳提到城外的牲畜失踪了。沿大道查查林边和坏车，弄清是什么留下了这些痕迹。'
        : '林边有东西在向道路靠近。先整备队伍，别让它们冲向城门。';
  if (state.phase === 'day1done')
    return has('mayor-absent')
      ? '村长尚未归来，艾琳已经收下证物。先回酒馆休息，明早再来问消息。'
      : '蚀鳞已被击退。带着鳞片和断车辕回城，到守备区寻找村长。';
  if (state.phase === 'day2')
    return !has('warn')
      ? '村长已回到接待室。把昨日的发现告诉他，也问清失联人员最后去了哪里。'
      : !has('elite')
        ? '哨塔迟迟没有钟讯。到城外查明经过，若那里仍有危险，就先整备再迎战。'
        : '哨塔的消息终于送回来了。回守备区，与艾琳和村长商量明天怎样守住城。';
  if (state.phase === 'day2done')
    return '防守安排已经谈妥。还可以去见见朋友，准备好后回酒馆休息，迎接祭典日。';
  return !has('evacuation') || !has('aid')
    ? '警钟响了。广场还有居民没走，商业街的诊棚也缺人手，先去帮他们安顿下来。'
    : !has('barricade')
      ? '居民和诊棚已有照应。去城墙找艾琳，把关门前最后几件事安排好。'
      : '城门已经准备迎敌。检查好队伍和装备，与守军一起守住这一夜。';
}

/** These are objective interactions. AI text cannot add actions or satisfy battle flags. */
export function chapterActions(state, scene) {
  const actions = [];
  const has = (flag) => state.flags.includes(flag);
  const add = (id, label, ready = true) => {
    if (ready && !has(id)) actions.push({ id, label });
  };
  const active = !['idle', 'failed'].includes(state.phase);
  if (!active) return actions;
  if (scene === 'city-center') {
    add('festival', '了解星灯祭的准备', state.phase === 'morning');
    add('fountain', '在喷泉边观察居民', state.phase === 'morning');
    add('evacuation', '帮助居民安排撤离', state.phase === 'day3');
  }
  if (scene === 'tavern') {
    add(
      'revelation',
      '翻阅地志，确认城市的名字',
      state.phase === 'morning' && state.visited.length === 4,
    );
  }
  if (scene === 'rampart') {
    add('permit', '询问城外的情况', state.phase === 'afternoon');
    add('mayor-absent', '带着线索寻找村长', state.phase === 'day1done');
    add('warn', '与村长交谈', state.phase === 'day2');
    add('defense', '与守备队商定安排', state.phase === 'day2' && has('elite'));
    add('barricade', '准备城门防守', state.phase === 'day3' && has('evacuation') && has('aid'));
    if (state.phase === 'day3' && has('barricade'))
      actions.push({ id: 'battle-boss', label: '整备队伍 · 迎击暗鳞督军' });
  }
  if (scene === 'outskirts') {
    add('tracks', '调查城外异常', state.phase === 'afternoon' && has('permit'));

    if (state.phase === 'afternoon' && has('tracks') && has('cart'))
      actions.push({ id: 'battle-scout', label: '整备队伍 · 追查林边动静' });
    add('tower', '调查失联哨塔', state.phase === 'day2' && has('warn'));
    if (state.phase === 'day2' && has('tower') && !has('elite'))
      actions.push({ id: 'battle-elite', label: '整备队伍 · 夺回哨塔' });
  }
  if (scene === 'market') add('aid', '协助医师布置救护点', state.phase === 'day3');
  if (state.phase === 'day1done' && scene === 'tavern' && has('mayor-absent'))
    actions.push({ id: 'next-day', label: '结束第一天活动 →' });
  if (state.phase === 'day2done' && scene === 'tavern')
    actions.push({ id: 'next-day', label: '进入第三天 · 星灯祭 →' });
  for (const [key, npc] of Object.entries(CHAPTER_NPCS)) {
    if (npc.scene !== scene) continue;
    add(`meet-${key}`, `认识${npc.name}`);
    add(
      `help-${key}`,
      `帮助${npc.name}：${{ eirin: '核对值勤名单', novi: '整理灯架', mirei: '整理药箱' }[key]}`,
      has(`meet-${key}`),
    );
    add(
      `finish-${key}`,
      `完成${npc.name}的约定`,
      has(`help-${key}`) && chapterDay(state) >= 2 && (key === 'novi' ? has('warn') : has('elite')),
    );
    if (has(`finish-${key}`) && !state.recruited.includes(key))
      actions.push({ id: `invite-${key}`, label: `邀请${npc.name}成为同伴` });
    if (has(`meet-${key}`))
      actions.push({ id: `chat-${key}`, label: `与${npc.name}自由交谈（API）` });
  }
  return actions;
}

export function applyChapterAction(state, id, scene, { taskResult = false } = {}) {
  if (state.pendingBattle) throw Error('请先结束当前战斗');
  if (!chapterActions(state, scene).some((action) => action.id === id))
    throw Error('当前地点或进度还不能进行这项行动');
  if (Object.hasOwn(CHAPTER_TASKS, id) && !taskResult)
    throw Error('请通过当前任务的实际互动取得结果');
  if (id.startsWith('battle-')) {
    state.pendingBattle = id.slice(7);
    return;
  }
  if (id.startsWith('chat-')) return;
  if (id.startsWith('invite-')) {
    state.recruited.push(id.slice(7));
    return;
  }
  if (id === 'next-day') {
    state.phase = state.phase === 'day1done' ? 'day2' : 'day3';
    return;
  }
  if (id === 'revelation') state.phase = 'afternoon';
  else state.flags.push(id);
  if (id === 'defense') state.phase = 'day2done';
}

export function chapterBattleResult(state, battle, won) {
  if (state.pendingBattle !== battle) throw Error('章节战斗与进度不一致');
  state.pendingBattle = null;
  if (!won) {
    state.failureDay = chapterDay(state);
    state.phase = 'failed';
    return;
  }
  if (!state.flags.includes(battle)) state.flags.push(battle);
  if (battle === 'scout') state.phase = 'day1done';
  if (battle === 'boss') state.phase = 'won';
}
