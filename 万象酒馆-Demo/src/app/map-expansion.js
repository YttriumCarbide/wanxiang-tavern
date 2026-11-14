import { addWorldRoute } from '../exploration.js';
import { routeKey } from '../worlds.js';
import { chooseDiscoveryPoint, placeDiscovery, routePoints } from '../atlas-discoveries.js';
import { overlandRunPlan } from '../overland-travel.js';
import { skippingAi } from '../generation-options.js';

export function createMapExpansion(context) {
  const { session } = context;
  let queue = Promise.resolve();
  const requests = new Set();
  function enqueue(work) {
    const library = session.ai.library;
    const controller = new AbortController();
    requests.add(controller);
    const next = queue.then(() => {
      if (session.ai.library !== library || session.runtime.disposed || controller.signal.aborted)
        return;
      return work(library, controller.signal);
    });
    queue = next
      .catch((failure) => {
        if (!controller.signal.aborted) context.shell.toast('地图构筑未完成 · ' + failure.message);
      })
      .finally(() => requests.delete(controller));
    return next;
  }

  function saveWorld(library, world, prior = null) {
    if (
      !world ||
      (prior && prior.id !== world.id) ||
      (!prior && library.worlds.some(({ id }) => id === world.id))
    )
      throw Error('生成的地点与现有地图冲突');
    const worlds = library.worlds;
    const route = library.exploration[world.id];
    const frontier = route?.frontier.map((entry) => entry.world);
    library.worlds = [...library.worlds.filter(({ id }) => id !== prior?.id), world];
    addWorldRoute(library.exploration, world);
    return () => {
      library.worlds = worlds;
      if (route)
        route.frontier.forEach((entry, index) => {
          entry.world = frontier[index];
        });
      else delete library.exploration[world.id];
    };
  }

  async function createDiscovery(library, signal, route, point, story, generatedFrom = point) {
    const brief = [
      '构筑泛生界实地可探索的地点。根据区域地理、气候、城市文化及当前剧情，写明足以吸引玩家前往的奇观或事件。',
      `行走路线：${route.map(({ name, id }) => name + '（' + id + '）').join(' → ')}。`,
      `从给定地点选一个连接点并返回 linkId 与 direction（北、东北、东、东南、南、西南、西、西北）。优先连接${point.name}。`,
      '敌人只填写一级基础数值，选择符合该地点气候的现有战斗背景。',
      story,
    ].join('\n');
    const { world } = await context.apiClient.request(
      'generate/map',
      {
        brief: brief.slice(0, 10000),
        discovery: { point, route },
        knownEnemies: Object.assign({}, ...library.worlds.map((entry) => entry.enemyDefinitions)),
      },
      { signal, background: true },
    );
    if (session.ai.library !== library || signal.aborted) return null;
    const discovery = placeDiscovery(
      world,
      world.discovery,
      generatedFrom,
      route,
      library.atlasDiscoveries,
    );
    const { discovery: _location, ...record } = world;
    const rollback = saveWorld(library, { ...record, baseLevel: discovery.level });
    library.atlasDiscoveries.push(discovery);
    if (!context.generation.save()) {
      library.atlasDiscoveries.pop();
      rollback();
      throw Error('地点未能保存，仍可在下次行路重新抽取');
    }
    context.daily.refresh();
    return discovery;
  }

  function discover(run) {
    if (run.discovery || run.discoveryAttempted || skippingAi(session.ai.generationOptions)) return;
    run.discoveryAttempted = true;
    context.generation.save();
    const plan = overlandRunPlan(run);
    const route = routePoints(plan);
    void enqueue(async (library, signal) => {
      const point = chooseDiscoveryPoint(plan, library.atlasDiscoveries);
      if (!point) return;
      await createDiscovery(
        library,
        signal,
        route,
        point,
        run.acts.map(({ title, story }) => `${title}：${story.slice(0, 450)}`).join('\n'),
      );
    }).catch(() => {});
  }

  function extend(exploration) {
    if (!exploration || exploration.replay || skippingAi(session.ai.generationOptions))
      return queue;
    const key = routeKey(exploration);
    const route = session.ai.library.exploration[key];
    if (route?.cleared.at(-1)?.id !== exploration.id) return queue;
    const completed = route.completed;
    if (completed < 2 || completed % 2 !== 0) return queue;
    return enqueue(async (library, signal) => {
      const existing = library.worlds.find(({ id }) => id === key);
      if (!existing || (existing.expandedAt || 0) >= completed) return;
      const record = library.history.at(-1);
      const { world } = await context.apiClient.request(
        'generate/map',
        {
          brief: `承接「${existing.name}」已发生的探索，为此地点补充新的关卡线索、目标和敌人。\n${
            record?.lines
              ?.slice(-8)
              .map(({ text }) => text)
              .join('\n')
              .slice(0, 3000) || ''
          }`,
          existing,
          triggerIds: ['map:periodic-expansion', key],
          knownEnemies: Object.assign({}, ...library.worlds.map((entry) => entry.enemyDefinitions)),
        },
        { signal, background: true },
      );
      if (session.ai.library !== library || signal.aborted) return;
      const rollback = saveWorld(library, { ...world, expandedAt: completed }, existing);
      if (!context.generation.save()) {
        rollback();
        throw Error('地点补充未能保存');
      }
    }).catch(() => {});
  }
  return {
    discover,
    extend,
    afterMaps(work) {
      const next = queue.then(work);
      queue = next.catch(() => {});
      return next;
    },
    quest(route, story) {
      return enqueue((library, signal) =>
        createDiscovery(library, signal, route, route[0], '任务 · ' + story, null),
      );
    },
    dispose() {
      for (const request of requests) request.abort();
    },
  };
}
