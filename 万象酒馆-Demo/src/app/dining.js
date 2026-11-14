import { INGREDIENTS, MEAL_FOODS, foodBonusText } from '../content/dining.js';
import { diningState, mealPreference, mealCost, prepareMeal, finishMeal } from '../dining.js';
import { settingOnly } from '../ai/contracts.js';
import { gameTime, memoryChat } from '../memory.js';
import { skippingAi } from '../generation-options.js';
import { createRawResponse } from './raw-response.js';
import { foodArt } from './food-art.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';
import { portraitUrl } from '../portraits.js';
import { diningReaction } from '../content/dining-reactions.js';

/** One dining transaction survives API failure; presentation never grants rewards. */
export function createDining(context) {
  const { session, events } = context;
  const panel = document.createElement('dialog');
  panel.id = 'dining-dialog';
  panel.setAttribute('aria-label', '围炉共餐');
  panel.innerHTML = html`<header>
      <div class="meal-heading">
        <h2>用餐</h2>
      </div>
      <button data-meal-close aria-label="返回酒馆">×</button>
    </header>
    <div class="dining-body">
      <section class="meal-company">
        <h3>同桌 <small>最多三人</small></h3>
        <div data-meal-members></div>
        <button data-meal-shop>购买食材</button>
      </section>
      <section class="meal-menu">
        <h3>菜谱 <small>最多三道</small></h3>
        <div data-meal-foods></div>
      </section>
      <aside class="meal-order">
        <div data-meal-order></div>
        <p data-meal-status role="status"></p>
        <button class="primary" data-meal-start>开始制作</button>
      </aside>
    </div>
    <section class="meal-kitchen" hidden>
      <small>酒馆厨房</small>
      <h2 data-cook-title>准备食材</h2>
      <div class="meal-pan">
        <span class="meal-steam">♨</span>
        <div data-cook-art></div>
        <i class="meal-sparks"></i>
      </div>
      <p data-cook-instruction></p>
      <div class="heat-track"><span class="heat-perfect"></span><i class="heat-needle"></i></div>
      <button class="primary" data-cook-tap>切配</button>
      <p data-cook-progress></p>
    </section>
    <section class="meal-result" hidden>
      <h2>饭菜已经上桌</h2>
      <p data-meal-request-status role="status"></p>
      <div class="meal-result-foods"></div>
      <div class="meal-request-actions">
        <button data-meal-raw hidden>查看原始返回</button
        ><button data-meal-retry hidden>重试对话</button
        ><button data-meal-skip hidden>跳过对话 · 直接用餐</button
        ><button data-meal-leave hidden>回到酒馆</button>
      </div>
    </section>`;
  document.body.append(panel);
  const raw = createRawResponse(events, 'meal-raw-response', '用餐对话 · 原始返回');
  const part = (selector) => panel.querySelector(selector);
  const library = () => session.ai.library;
  let members = [],
    foods = [],
    place = 'bar',
    cooking = null,
    frame = null,
    request = null,
    failure = null;
  let epoch = 0;
  function persist() {
    context.generation.save();
  }
  function render() {
    const memberList = part('[data-meal-members]');
    const memberScroll = [memberList.scrollLeft, memberList.scrollTop];
    const menuScroll = part('[data-meal-foods]').scrollTop;
    const state = diningState(library());
    part('[data-meal-members]').innerHTML = library()
      .characters.map((member) => {
        const selected = members.includes(member.id);
        let remarks = '';
        if (selected && foods.length) {
          const { preference: taste } = mealPreference(library(), member, foods);
          const line = diningReaction(member, taste, taste, state.cycle);
          remarks = html`<span class="meal-reaction" data-taste="${taste}"
            ><b>这一桌 · ${taste}</b><q>${line}</q></span
          >`;
        }
        return html`<button data-meal-member="${member.id}" aria-pressed="${selected}">
          <img
            class="meal-portrait"
            src="${escapeText(new URL(portraitUrl(member.combat), new URL('../../', import.meta.url)).href)}"
            alt=""
          />
          <span class="meal-member-copy"
            ><strong>${escapeText(member.setting.name)}</strong>
            <small>${selected ? '✓ 已入席' : '邀请入席'}</small>
            ${remarks || (selected ? '<span class="meal-reaction meal-reaction-empty">选一道菜，听听我的想法。</span>' : '')}</span
          >
        </button>`;
      })
      .join('');
    part('[data-meal-foods]').innerHTML = Object.values(MEAL_FOODS)
      .map((food) => {
        const missing = Object.entries(food.recipe).filter(
          ([id, count]) => state.inventory[id] < count,
        );
        const recipe = Object.entries(food.recipe)
          .map(([id, count]) => `${INGREDIENTS[id].name} ${state.inventory[id]}/${count}`)
          .join(' · ');
        return html`<button data-meal-food="${food.id}" aria-pressed="${foods.includes(food.id)}">
          ${foodArt(food)}<span class="meal-food-copy"
            ><strong>${food.name}</strong
            ><small>${food.tags.join(' · ')}${food.game ? '' : ' · 可直接食用'}</small
            ><small>${recipe}</small><small>${foodBonusText(food.bonus)}</small>
            <span class="meal-availability ${missing.length ? 'meal-shortage' : ''}"
              >${missing.length ? '食材不足 · 缺' + missing.map(([id]) => INGREDIENTS[id].name).join('、') : food.game ? '可以制作' : '可以直接食用'}</span
            ></span
          >
        </button>`;
      })
      .join('');
    const cost = mealCost(foods);
    part('[data-meal-order]').innerHTML =
      '<strong>' +
      (foods.length
        ? foods.map((id) => MEAL_FOODS[id].name).join(' / ')
        : '还没点菜，先挑些想吃的吧') +
      '</strong><span class="meal-cost">' +
      Object.entries(cost)
        .map(
          ([id, count]) =>
            html`<small class="${state.inventory[id] < count ? 'meal-shortage' : ''}"
              >${INGREDIENTS[id].name} ${state.inventory[id]}/${count}</small
            >`,
        )
        .join('') +
      '</span>';
    part('[data-meal-start]').disabled =
      !members.length ||
      !foods.length ||
      state.eatenCycle === state.cycle ||
      Object.entries(cost).some(([id, count]) => state.inventory[id] < count);
    part('[data-meal-status]').textContent =
      state.eatenCycle === state.cycle
        ? '已经用过餐，完成下一场战斗后可再次相聚。'
        : state.tutorial === 'cook'
          ? '先选主角、潘多拉和一位伙伴，再制作旅人奶酪拼盘。'
          : '食材按整桌消耗 · 增益在用餐者下一次参战时生效';
    memberList.scrollTo(...memberScroll);
    part('[data-meal-foods]').scrollTop = menuScroll;
  }
  function stopCooking() {
    cancelAnimationFrame(frame);
    frame = null;
    cooking = null;
  }
  function tick(time) {
    if (!cooking || !panel.open || document.hidden) {
      frame = null;
      return;
    }
    cooking.position = (Math.sin(time / 480) + 1) / 2;
    part('.heat-needle').style.left = `${cooking.position * 100}%`;
    frame = requestAnimationFrame(tick);
  }
  function kitchen() {
    part('.dining-body').hidden = true;
    part('.meal-result').hidden = true;
    part('.meal-kitchen').hidden = false;
    part('[data-cook-art]').innerHTML = foodArt(
      MEAL_FOODS[foods.find((id) => MEAL_FOODS[id].game) || foods[0]],
    );
    cooking = { stage: 'chop', taps: 0, hits: 0, attempts: 0, position: 0 };
    part('[data-cook-title]').textContent = '切配 · 让香气醒来';
    part('[data-cook-instruction]').textContent = '点击六次切好食材，再为这一桌掌握火候。';
    part('[data-cook-tap]').textContent = '切配食材';
    part('[data-cook-progress]').textContent = '0 / 6';
    part('.heat-track').hidden = true;
  }
  function commit() {
    const result = finishMeal(library());
    if (!result) return;
    context.daily?.mealFinished();
    persist();
    part('[data-meal-request-status]').textContent =
      `${foodBonusText(result.bonus)}。${result.gains.map(({ id, delta }) => `${library().characters.find((member) => member.id === id)?.setting.name} 好感＋${delta}`).join(' · ')}`;
    for (const name of ['raw', 'retry', 'skip']) part(`[data-meal-${name}]`).hidden = true;
    part('[data-meal-leave]').hidden = false;
    context.shell.renderParty();
  }
  async function converse() {
    if (request) return;
    const meal = diningState(library()).draft;
    if (!meal) return;
    part('.meal-result').hidden = false;
    part('.meal-kitchen').hidden = true;
    part('.dining-body').hidden = true;
    part('.meal-result-foods').innerHTML = meal.foods.map((id) => foodArt(MEAL_FOODS[id])).join('');
    for (const name of ['raw', 'retry', 'skip', 'leave']) part(`[data-meal-${name}]`).hidden = true;
    part('[data-meal-request-status]').textContent = '饭香渐起，正在准备餐桌对话……';
    if (skippingAi(session.ai.generationOptions)) {
      commit();
      return;
    }
    const owner = library(),
      turn = epoch;
    request = new AbortController();
    let original = '';
    try {
      const dining = {
        foods: meal.foods.map((id) => ({
          name: MEAL_FOODS[id].name,
          tags: MEAL_FOODS[id].tags,
          ingredients: Object.keys(MEAL_FOODS[id].recipe).map((key) => INGREDIENTS[key].name),
        })),
        quality: meal.quality,
        preferences: meal.members.map((id) => {
          const member = owner.characters.find((entry) => entry.id === id);
          return {
            id,
            name: member.setting.name,
            ...mealPreference(owner, member, meal.foods),
          };
        }),
      };
      const input = {
        text: '大家在酒馆坐下，共享这一桌饭菜。请从上菜开始写一段有来有往的用餐对话，重在人物性格与彼此关系，不报游戏奖励。每位角色的preference是整桌菜的整体评价，以此为准，不重新给每道菜分别判定喜好。',
        place: meal.place,
        selected: meal.members,
        characters: owner.characters
          .filter((member) => meal.members.includes(member.id))
          .map(settingOnly),
        protagonistId: owner.campaign?.protagonistId || null,
        history: memoryChat(owner.tavernChat || []),
        dining,
      };
      const result = await context.apiClient.request('generate/chat', input, {
        signal: request.signal,
        onDelta(delta) {
          original += delta;
        },
      });
      if (turn !== epoch || owner !== library() || session.runtime.disposed) return;
      const sentAt = gameTime(owner.daily);
      commit();
      owner.tavernChat ||= [];
      const messageId = crypto.randomUUID();
      owner.tavernChat.push(
        {
          id: messageId,
          role: 'user',
          gameTime: sentAt,
          content: '在酒馆共餐：' + dining.foods.map((food) => food.name).join('、'),
        },
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          gameTime: sentAt,
          content: result.content,
          display: result.display,
          speakerIds: meal.members,
        },
      );
      context.quests?.collect(result.quest, messageId, context.daily?.scene());
      persist();
      await context.gal.play(result.content, { owner: 'dining', title: '酒馆 · 围炉共餐' });
    } catch (error) {
      if (turn !== epoch || session.runtime.disposed) return;
      failure = error;
      if (!failure.diagnostic?.rawText && original) failure.diagnostic = { rawText: original };
      part('[data-meal-request-status]').textContent =
        `对话未完成：${error.message}。可查看原始返回、重试，或直接用餐。`;
      for (const name of ['raw', 'retry', 'skip']) part(`[data-meal-${name}]`).hidden = false;
    } finally {
      request = null;
    }
  }
  async function ready(quality = 'ordinary') {
    stopCooking();
    try {
      prepareMeal(library(), members, foods, quality, place);
      persist();
      await converse();
    } catch (error) {
      context.shell.toast(error.message);
    }
  }
  function open(location = 'bar') {
    if (session.runtime.mode !== 'inn') return;
    place = ['table', 'table2', 'bar', 'bar2'].includes(location) ? location : 'bar';
    const state = diningState(library());
    members = library().party.filter(Boolean).slice(0, 3);
    foods = state.tutorial === 'cook' ? ['cheese-board'] : [];
    part('.dining-body').hidden = false;
    part('.meal-kitchen').hidden = true;
    part('.meal-result').hidden = true;
    render();
    if (!panel.open) panel.showModal();
    if (state.draft) {
      part('.dining-body').hidden = true;
      part('.meal-result').hidden = false;
      part('.meal-result-foods').innerHTML = state.draft.foods
        .map((id) => foodArt(MEAL_FOODS[id]))
        .join('');
      part('[data-meal-request-status]').textContent =
        '这桌饭菜已经做好，还未用餐。可以重试对话，或跳过直接吃饭。';
      part('[data-meal-raw]').hidden = !failure;
      part('[data-meal-retry]').hidden = false;
      part('[data-meal-skip]').hidden = false;
      part('[data-meal-leave]').hidden = true;
    }
  }
  events.on(panel, 'click', (event) => {
    const member = event.target.closest('[data-meal-member]')?.dataset.mealMember;
    const food = event.target.closest('[data-meal-food]')?.dataset.mealFood;
    if (member) {
      if (members.includes(member)) members = members.filter((id) => id !== member);
      else if (members.length < 3) members.push(member);
      else context.shell.toast('一桌最多三人');
      render();
    }
    if (food) {
      if (foods.includes(food)) foods = foods.filter((id) => id !== food);
      else if (foods.length < 3) foods.push(food);
      else context.shell.toast('最多三种不同菜品');
      render();
    }
    if (event.target.closest('[data-meal-close],[data-meal-leave]')) panel.close();
    if (event.target.closest('[data-meal-shop]')) context.shop.open({ ingredients: true });
    if (event.target.closest('[data-meal-start]') && !part('[data-meal-start]').disabled) {
      if (foods.every((id) => !MEAL_FOODS[id].game)) void ready();
      else kitchen();
    }
    if (event.target.closest('[data-meal-raw]')) {
      if (!raw.show(failure)) context.shell.toast('接口没有返回正文；错误信息已显示在餐桌上。');
    }
    if (event.target.closest('[data-meal-retry]')) void converse();
    if (event.target.closest('[data-meal-skip]') && !request) commit();
    if (event.target.closest('[data-cook-tap]') && cooking) {
      part('.meal-pan').animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-7px) rotate(-2deg)' },
          { transform: 'translateY(0)' },
        ],
        { duration: 180 },
      );
      if (cooking.stage === 'chop') {
        cooking.taps++;
        part('[data-cook-progress]').textContent = `${cooking.taps} / 6`;
        if (cooking.taps >= 6) {
          cooking.stage = 'heat';
          part('[data-cook-title]').textContent = '控火 · 恰到好处';
          part('[data-cook-instruction]').textContent = '在金色范围内点击，掌握三次火候。';
          part('[data-cook-tap]').textContent = '收住火候';
          part('.heat-track').hidden = false;
          part('[data-cook-progress]').textContent = '0 / 3';
          frame = requestAnimationFrame(tick);
        }
      } else {
        cooking.attempts++;
        if (cooking.position >= 0.35 && cooking.position <= 0.65) cooking.hits++;
        part('[data-cook-progress]').textContent =
          `${cooking.attempts} / 3 · 恰好 ${cooking.hits} 次`;
        if (cooking.attempts === 3) void ready(cooking.hits >= 2 ? 'excellent' : 'ordinary');
      }
    }
  });
  events.on(panel, 'close', () => {
    epoch++;
    request?.abort();
    stopCooking();
  });
  events.on(document, 'visibilitychange', () => {
    if (!document.hidden && cooking && !frame) frame = requestAnimationFrame(tick);
  });
  events.on(window, 'message', (event) => {
    if (
      event.origin === location.origin &&
      event.source === document.querySelector('#inn-frame iframe')?.contentWindow &&
      event.data?.type === 'tavern-dining'
    )
      open(event.data.place);
  });
  return {
    open,
    close() {
      panel.close();
    },
    refresh() {
      if (panel.open && !cooking && !request && part('.meal-result').hidden) render();
    },
    tutorial() {
      const state = diningState(library());
      if (state.tutorial !== 'ready') return;
      state.tutorial = 'buy';
      state.stock = [
        ...['bread', 'cheese'].map((id) => ({
          id,
          left: Math.max(2, state.stock.find((item) => item.id === id)?.left || 0),
        })),
        ...state.stock.filter((item) => !['bread', 'cheese'].includes(item.id)),
      ].slice(0, 5);
      library().inventory.gold = Math.max(library().inventory.gold, 26);
      persist();
      void context.gal
        .play(
          [
            {
              speaker: '伊蒂丝',
              text: '刚醒过来，先吃点东西吧。售货机除了药水也有食材，每经过一场战斗就会换一批。我们先买乡村面包和奶酪，再到吧台做一份拼盘。',
            },
            {
              speaker: '潘多拉',
              text: '主人……潘多拉也可以一起准备吗？叫上大家，一桌可以坐三个人。',
            },
          ],
          { owner: 'dining-tutorial', title: '酒馆 · 第一顿共餐' },
        )
        .then(() => {
          if (session.runtime.mode === 'inn' && !session.runtime.disposed)
            context.shop.open({ ingredients: true });
        });
    },
    dispose() {
      epoch++;
      request?.abort();
      stopCooking();
      raw.dispose();
      panel.remove();
    },
  };
}
