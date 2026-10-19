import { generationEnabled } from '../generation-options.js';
import { createDialogue } from './dialogue.js';
import { ARRIVAL_PROSE, EDITH_LESSONS, FIRST_RECRUIT_DIALOGUE } from '../content/edith-guide.js';
import { newCampaign, learning, guiding } from '../campaign.js';
import { html } from '../shared/html.js';
import { characterSheet } from './character-sheet.js';
import { query as $ } from './dom.js';
import { tutorialTasks, tutorialCommitIssue, recordTutorialResult } from '../tutorial-progress.js';

/** Creation is transactional: the active save changes only after a reviewed AI result. */
export function createOnboarding(context) {
  const storage = context.storage || localStorage;
  const { session, events } = context;
  const fields = [
    ['name', '姓名', 'input', 30],
    ['gender', '性别', 'input', 30],
    ['age', '年龄', 'input'],
    ['identity', '种族、身份与职业', 'input', 200],
    ['appearance', '外貌与衣着', 'textarea', 1200],
    ['personality', '性格与习惯', 'textarea', 1200],
    ['history', '经历与来历', 'textarea', 1500],
    ['attack', '普通攻击：名字与动作', 'textarea', 800],
    ['skills', '技能：名字、动作与效果设想', 'textarea', 1500],
    ['notes', '其他设定与补充', 'textarea', 1000],
  ];
  const dialog = document.createElement('dialog');
  dialog.id = 'new-game';
  dialog.setAttribute('aria-labelledby', 'new-game-title');
  dialog.innerHTML = html`<header class="creation-heading">
      <div>
        <small>WANXIANG / A NEW JOURNEY</small>
        <h1 id="new-game-title">你的故事，从这里开始</h1>
        <p>写下你是谁。角色 API 会保留你的设想，补全设定与战斗技能。</p>
      </div>
      <button id="creation-close" aria-label="返回当前冒险">×</button>
    </header>
    <div class="creation-toolbar">
      <button id="creation-api">配置 API 与预设</button><button id="creation-load">读取存档</button
      ><span>主角固定出战 · 最多五名同伴</span>
    </div>
    <div class="creation-workspace">
      <form id="creation-form">
        <div class="creation-fields">
          ${fields.map(([key, label, tag, max]) => html`<label class="creation-field ${tag === 'input' ? 'short' : ''}">${label}${tag === 'input' ? html`<input name="${key}" ${key === 'age' ? '' : html`maxlength="${max}"`} ${key === 'name' ? 'required autocomplete="off"' : ''} />` : html`<textarea name="${key}" maxlength="${max}" rows="3"></textarea>`}</label>`).join('')}
        </div>
        <p class="creation-hint">
          姓名必填，其余可以留给 AI 补全。可以写动作和效果设想，无需填写 JSON。
        </p>
        <button id="creation-generate" class="primary" type="submit">润色设定并生成主角</button>
        <button id="creation-cancel" type="button" hidden>取消生成</button>
      </form>
      <section class="creation-preview">
        <div id="creation-review">
          <div class="creation-empty">
            <span>◇</span>
            <h2>尚未定稿的旅人</h2>
            <p>生成后在这里检查主角的设定与技能，确认后才会开启新存档。</p>
          </div>
        </div>
        <p id="creation-status" role="status">
          开始前需要配置角色 API 并选择提示词预设；剧本暂使用本地战斗测试文本。
        </p>
        <button id="creation-start" class="primary" disabled>以此身份开始</button>
      </section>
    </div>`;
  document.body.append(dialog);
  const guide = document.createElement('aside');
  guide.id = 'tutorial-guide';
  guide.hidden = true;
  guide.setAttribute('aria-live', 'polite');
  guide.innerHTML =
    '<small id="tutorial-count"></small><h3 id="tutorial-title"></h3><p id="tutorial-text"></p><button id="tutorial-action"></button>';
  document.body.append(guide);
  let reviewed = null;
  let creationMode = null;
  let pending = false;
  let focus = null;
  const state = () => session.ai.library.campaign;
  function highlight(selector) {
    focus?.classList.remove('tutorial-focus');
    focus = selector ? document.querySelector(selector) : null;
    focus?.classList.add('tutorial-focus');
  }
  function advance(step) {
    if (!guiding(session.ai.library)) return;
    state().tutorial = step;
    context.generation.save();
    refresh();
  }
  const dialogue = createDialogue(events);
  let shown = null;
  function refresh() {
    const active = guiding(session.ai.library) && !session.runtime.needsStart && !dialog.open;
    guide.hidden = true;
    highlight(null);
    if (!active) {
      dialogue.close();
      shown = null;
      return;
    }
    const campaign = state();
    if (session.runtime.mode === 'inn' && campaign.tutorial === 'reward') {
      campaign.tutorial = 'summon-return';
      context.generation.save();
    }
    if (['welcome', 'summon', 'journal'].includes(campaign.tutorial)) campaign.tutorial = 'portal';
    const step =
      session.runtime.mode === 'inn' &&
      ![
        'arrival',
        'ether',
        'summon-return',
        'summon-guide',
        'recruit-dialogue',
        'table',
        'invite',
        'shop',
        'depart-again',
      ].includes(campaign.tutorial)
        ? 'portal'
        : campaign.tutorial;
    if (step === 'arrival') {
      if (shown === step) return;
      shown = step;
      dialogue.show(ARRIVAL_PROSE, () => advance('portal'), true);
      return;
    }
    if (step === 'recruit-dialogue') {
      if (shown === step) return;
      shown = step;
      dialogue.show(FIRST_RECRUIT_DIALOGUE, () => {
        state().tutorial = 'table';
        context.generation.save();
        refresh();
        context.shell.toast('长景月汐已加入队伍，到圆桌坐下，邀请她一起出发。');
      });
      return;
    }
    const content = EDITH_LESSONS[step];
    if (!content) return;
    guide.dataset.step = step;
    $('#tutorial-count').textContent = '伊蒂丝的小提醒';
    $('#tutorial-title').textContent = content.title;
    $('#tutorial-text').textContent = '';
    $('#tutorial-action').textContent = content.action || '再听一遍';
    $('#tutorial-action').hidden = false;
    function readyForAction() {
      if (step === 'ether') return advance('reward');
      const item = step === 'slow' ? 'slow-potion' : step === 'boss' ? 'mana-potion' : null;
      if (item) {
        const tasks = tutorialTasks(campaign);
        const key = item + '-granted';
        const inventory = session.ai.library.inventory;
        if (!tasks[key]) {
          inventory.items[item]++;
          tasks[key] = true;
          inventory.bagUnlocked = true;
          session.battle.state.items = structuredClone(inventory.items);
          context.planning.recompute();
          context.generation.save();
        }
        context.backpack.render();
      }
      guide.hidden = false;
      highlight(content.focus);
    }
    if (shown === step) {
      if (!dialogue.open) readyForAction();
      return;
    }
    shown = step;
    dialogue.show(content.lines, readyForAction);
  }
  function open() {
    if (session.battle.playing || session.ai.busy) return;
    if (session.runtime.mode === 'battle') context.journey.returnInn();
    $('#creation-close').hidden = !!session.runtime.needsStart;
    generationModeChanged();
    if (!dialog.open) dialog.showModal();
    refresh();
  }
  function generationModeChanged() {
    const enabled = generationEnabled(session.ai.generationOptions, 'protagonistApi');
    if (creationMode === enabled) return;
    creationMode = enabled;
    $('#creation-form').hidden = !enabled;
    $('.creation-workspace').classList.toggle('local-protagonist', !enabled);
    $('#new-game-title').textContent = enabled ? '你的故事，从这里开始' : '青缘的旅程';
    $('.creation-heading p').textContent = enabled
      ? '写下你是谁。角色 API 会保留你的设想，补全设定与战斗技能。'
      : '使用青缘开局。可在设置的开发者模式中开启主角 AI 生成。';
    if (!enabled) review(context.generation.defaultProtagonist());
    else {
      reviewed = null;
      $('#creation-review').textContent = '填写设定，生成你的主角。';
      $('#creation-start').disabled = true;
      $('#creation-status').textContent = '请配置角色 API 与提示词预设，再生成主角。';
    }
  }
  function review(entry) {
    reviewed = entry;
    $('#creation-review').innerHTML = characterSheet(entry);
    $('#creation-start').disabled = false;
    $('#creation-status').textContent = generationEnabled(
      session.ai.generationOptions,
      'protagonistApi',
    )
      ? '主角已生成。检查设定与技能后确认，也可以修改左侧设定重新生成。'
      : '使用青缘开局，不请求主角生成 API。已有青缘优先沿用其设定、技能和角色立绘。';
  }
  async function ready() {
    if (!generationEnabled(session.ai.generationOptions, 'protagonistApi')) return true;
    return context.generation.ensureReady('character');
  }
  events.on($('#creation-form'), 'submit', async (event) => {
    event.preventDefault();
    if (pending || !$('#creation-form').reportValidity()) return;
    if (!$('#creation-form').elements.namedItem('name').value.trim()) {
      $('#creation-status').textContent = '请填写主角姓名。';
      return;
    }
    pending = true;
    $('#creation-generate').disabled = true;
    $('#creation-start').disabled = true;
    try {
      if (!(await ready()) || session.runtime.disposed) return;
      const values = new FormData($('#creation-form'));
      const brief = fields
        .map(([key, label]) => `${label}：${String(values.get(key) || '').trim() || '由AI补全'}`)
        .join('\n');
      $('#creation-status').textContent =
        '正在生成你的完整设定与技能，请稍候；失败时可查看原始回复并本地修正。';
      $('#creation-cancel').hidden = false;
      const entry = await context.generation.generateProtagonist(brief);
      if (!session.runtime.disposed) review(entry);
    } catch (failure) {
      if (!session.runtime.disposed)
        $('#creation-status').textContent = `生成未完成：${failure.message}。当前存档没有改变。`;
    } finally {
      pending = false;
      if (!session.runtime.disposed) {
        $('#creation-cancel').hidden = true;
        $('#creation-generate').disabled = false;
        $('#creation-start').disabled = !reviewed;
      }
    }
  });
  events.on($('#creation-start'), 'click', async () => {
    if (!reviewed || pending) return;
    pending = true;
    try {
      if (!(await ready()) || session.runtime.disposed) return;
      session.runtime.needsStart = false;
      storage.removeItem('wanxiang.creation-pending.v1');
      session.ai.preparationSlot = 0;
      session.ai.preparationCharacter = reviewed.id;
      context.generation.replaceLibrary(newCampaign(reviewed));
      dialog.close();
      context.journey.returnInn();
      context.saves.createNewSave();
      refresh();
    } catch (failure) {
      if (!session.runtime.disposed) $('#creation-status').textContent = failure.message;
    } finally {
      pending = false;
    }
  });
  events.on($('#creation-api'), 'click', () => context.generation.open('', 'character'));
  events.on($('#creation-cancel'), 'click', () => context.generation.cancel());
  events.on($('#creation-load'), 'click', () => context.saves.open());
  events.on($('#creation-close'), 'click', () => {
    if (!pending) dialog.close();
  });
  events.on(dialog, 'cancel', (event) => {
    if (session.runtime.needsStart || pending) event.preventDefault();
  });
  events.on(dialog, 'close', refresh);
  events.on($('#tutorial-action'), 'click', () => {
    if (guide.dataset.step === 'ether') return advance('reward');
    if (guide.dataset.step === 'shop') {
      const frame = $('#inn-frame iframe');
      if (frame) frame.src = './corridor.html?shop=1';
      return;
    }
    if (['table', 'invite'].includes(guide.dataset.step)) {
      $('#inn-frame iframe')?.contentWindow?.assetPreview?.moveTo('table');
      return;
    }
    if (['portal', 'summon-return'].includes(guide.dataset.step)) {
      const preview = $('#inn-frame iframe')?.contentWindow?.assetPreview;
      if (preview) preview.moveTo(guide.dataset.step === 'portal' ? 'gate' : 'summon');
      else context.shell.toast('酒馆正在载入，请稍候');
    } else {
      shown = null;
      refresh();
    }
  });
  events.on(document, 'click', (event) => {
    if (
      !learning(session.ai.library) ||
      session.runtime.mode !== 'battle' ||
      event.target.closest('#guide-dialogue')
    )
      return;
    const step = state().tutorial;
    if (step === 'intent' && event.target.closest('#story-toggle') && $('#story-feed').open) {
      state().tutorial = 'swap';
      tutorialTasks(state()).journal = true;
      context.generation.save();
    }
    if (step === 'extra' && session.selection.selectedCell === 0) advance('opening-action');
    if (step === 'timeline' && session.selection.inspectedEnemy) advance('intent');
  });
  events.on($('#story-feed'), 'close', () => {
    if (learning(session.ai.library) && state().tutorial === 'swap') refresh();
  });
  return {
    generationModeChanged,
    open,
    review,
    refresh,
    init() {
      if (session.runtime.needsStart) open();
      else refresh();
    },
    resumed() {
      session.runtime.needsStart = false;
      storage.removeItem('wanxiang.creation-pending.v1');
      dialog.close();
      refresh();
    },
    allowPortal(kind) {
      if (
        kind === 'script' &&
        state()?.completed &&
        guiding(session.ai.library) &&
        state().tutorial !== 'depart-again'
      ) {
        context.shell.toast(
          ['table', 'invite'].includes(state().tutorial)
            ? '先到圆桌与长景月汐交流，完成至少一次交流，再一起出发。'
            : state().tutorial === 'shop'
              ? '先前往走廊的虚空售货机，购买一件补给。'
              : '先完成以太结算和首次召唤教学。',
        );
        return false;
      }
      return true;
    },
    summonCompanion() {
      if (!state() || state().firstRecruit) return false;
      if (!state().completed) {
        context.shell.toast('先完成遗迹探索，取得召唤契约后再来。');
        return true;
      }
      if (dialogue.open) return true;
      const entry = context.generation.recruitFirstCompanion();
      if (entry) {
        context.audio.play('gate');
        shown = null;
        refresh();
      }
      return true;
    },
    summonVisible(visible) {
      if (visible && state()?.tutorial === 'summon-return') advance('summon-guide');
    },
    actionQueued() {
      if (
        learning(session.ai.library) &&
        state().tutorial === 'swap' &&
        session.battle.forecast.valid &&
        session.battle.forecast.events.some((event, index, events) => {
          if (event.type !== 'swap' || event.targets.some(Boolean)) return false;
          const before = index ? events[index - 1].after : session.battle.state;
          const vacated = before.formation.indexOf(event.actor);
          return (
            vacated >= 0 &&
            vacated < 3 &&
            events
              .slice(index + 1)
              .some(
                (later) =>
                  later.type === 'enemy' &&
                  later.targets.length === 0 &&
                  !later.after.formation[vacated],
              )
          );
        })
      )
        advance('swap-confirm');
      else if (
        learning(session.ai.library) &&
        ['vulnerable', 'slow', 'boss'].includes(state().tutorial) &&
        session.battle.plan.some((action) =>
          state().tutorial === 'vulnerable'
            ? action.kind === 'skill' &&
              (action.target === 'cinderImp' ||
                context.roster.ability(action.actor, action.skill)?.target === 'allEnemies')
            : action.kind === 'item' &&
              action.item === (state().tutorial === 'slow' ? 'slow-potion' : 'mana-potion'),
        )
      )
        advance(`${state().tutorial === 'boss' ? 'mana' : state().tutorial}-confirm`);
      if (
        learning(session.ai.library) &&
        ['extra', 'opening-action'].includes(state().tutorial) &&
        session.battle.state.phase === 'opening'
      )
        advance('opening-confirm');
    },
    beforeCommit() {
      const issue = tutorialCommitIssue(
        session.ai.library,
        session.battle.state,
        session.battle.forecast,
      );
      if (issue) {
        context.shell.toast(issue);
        return false;
      }
      if (
        learning(session.ai.library) &&
        ['extra', 'opening-action', 'opening-confirm'].includes(state().tutorial) &&
        session.battle.state.phase === 'opening' &&
        !session.battle.plan.length
      ) {
        context.shell.toast('先在◇格编排一次1 AP行动，再确认结算');
        return false;
      }
      return true;
    },
    intentViewed() {
      if (!learning(session.ai.library) || session.runtime.mode !== 'battle') return;
      tutorialTasks(state()).intent = true;
      if (session.battle.state.encounter === 3) tutorialTasks(state()).crossfire = true;
      context.generation.save();
    },
    roundFinished(opening, result) {
      if (!learning(session.ai.library)) return;
      recordTutorialResult(state(), opening, result);
      if (opening && session.battle.state.encounter === 2 && state().tutorial === 'slow-opening')
        advance('slow');
      if (!opening && state().tutorial === 'swap-confirm') advance('dodge-done');
      const lesson = ['vulnerable', 'slow', 'mana'].find(
        (name) => state().tutorial === name + '-confirm' && tutorialTasks(state())[name],
      );
      if (lesson) advance(lesson + '-done');
      if (
        ['boss', 'mana-done'].includes(state().tutorial) &&
        session.battle.state.phase !== 'victory' &&
        session.battle.state.phase !== 'defeat' &&
        result.events.some((event, index, events) => {
          if (event.type !== 'enemy' || !context.roster.get(event.actor).boss) return false;
          const before = index ? events[index - 1].after : session.battle.state;
          return event.after.units[event.actor].block > before.units[event.actor].block;
        })
      )
        advance('boss-armour');
      if (
        learning(session.ai.library) &&
        opening &&
        ['extra', 'opening-action', 'opening-confirm'].includes(state().tutorial)
      )
        advance('timeline');
    },
    battleStarted() {
      if (!learning(session.ai.library)) return refresh();
      const lesson = ['extra', 'vulnerable', 'slow-opening', 'crossfire', 'boss'][
        session.battle.state.encounter
      ];
      advance(lesson);
    },
    battleWon(complete) {
      if (!learning(session.ai.library) || !complete) return;
      state().completed = true;
      state().tutorial = 'ether';
      context.generation.save();
      refresh();
    },
    chatOpened(place) {
      if (state()?.tutorial === 'table' && ['table', 'table2'].includes(place)) advance('invite');
    },
    chatFinished(place) {
      if (state()?.tutorial === 'invite' && ['table', 'table2'].includes(place)) advance('shop');
    },
    purchased() {
      if (state()?.tutorial === 'shop') {
        state().tutorial = 'depart-again';
        context.generation.save();
      }
    },
    tripStarted() {
      if (state()?.tutorial === 'depart-again') {
        state().tutorial = 'complete';
        state().tableTalkCompleted = true;
        context.generation.save();
        refresh();
      }
    },
    allowReturn() {
      if (state()?.tutorial === 'ether') {
        context.shell.toast('先查看以太说明，再带着收获返回酒馆。');
        return false;
      }
      return true;
    },
    dispose() {
      highlight(null);
      dialog.remove();
      guide.remove();
      dialogue.dispose();
    },
  };
}
