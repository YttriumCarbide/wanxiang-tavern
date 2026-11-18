import { TUTORIAL_TARGETS } from '../content/mill-encounters.js';
import { developerOption, generationEnabled } from '../generation-options.js';
import { createDialogue } from './dialogue.js';
import { ARRIVAL_PROSE, EDITH_LESSONS, FIRST_RECRUIT_DIALOGUE } from '../content/edith-guide.js';
import { newCampaign, learning, guiding } from '../campaign.js';
import { html } from '../shared/html.js';
import { characterSheet } from './character-sheet.js';
import { query as $ } from './dom.js';
import { tutorialTasks, tutorialCommitIssue, recordTutorialResult } from '../tutorial-progress.js';
import {
  DC_ATTRIBUTES,
  DC_ATTR_BUDGET,
  DC_ATTR_MAX,
  DC_ATTR_MIN,
  DC_PROTAGONIST_PRESETS,
  attrMod,
  formatMod,
  normalizeDcAttrs,
} from '../dc.js';

/** Creation is transactional: the active save changes only after a reviewed AI result. */
export function createOnboarding(context) {
  const storage = context.storage || localStorage;
  const { session, events } = context;
  const fields = [
    ['name', '姓名', 'input', 30],
    ['gender', '性别', 'input', 30],
    ['age', '年龄', 'input'],
    ['identity', '种族与身份', 'input', 200],
    ['appearance', '外貌与衣着', 'textarea', 1200],
    ['personality', '性格与习惯', 'textarea', 1200],
    ['history', '经历与来历', 'textarea', 1500],
    ['attack', '普通攻击：名字与动作', 'textarea', 800],
    ['skill1', '一技能：名字、动作与效果', 'textarea', 1000],
    ['skill2', '二技能：名字、动作与效果', 'textarea', 1000],
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
          ${fields
            .map(
              ([key, label, tag, max]) =>
                html`<label class="creation-field ${tag === 'input' ? 'short' : ''}"
                  ><span>${label}</span>${
                    key === 'skill1' || key === 'skill2'
                      ? html`<select
                          name="skillType${key.at(-1)}"
                          aria-label="${key === 'skill1' ? '一技能' : '二技能'}类型"
                        >
                          <option value="主动">主动技能</option>
                          <option value="被动">被动技能</option>
                        </select>`
                      : ''
                  }${tag === 'input' ? html`<input name="${key}" ${key === 'age' ? '' : html`maxlength="${max}"`} ${key === 'name' ? 'required autocomplete="off"' : ''} />` : html`<textarea name="${key}" maxlength="${max}" rows="3"></textarea>`}</label
                >`,
            )
            .join('')}
        </div>
        <p class="creation-hint">
          姓名必填，其余可以留给 AI 补全。可以写动作和效果设想，无需填写 JSON。
        </p>
        <button id="creation-generate" class="primary" type="submit">润色设定并生成主角</button>
        <button id="creation-cancel" type="button" hidden>取消生成</button>
      </form>
      <section class="creation-preview">
        <div id="creation-dc-allocator" class="creation-dc-allocator" aria-label="六维属性分配">
          <div class="creation-dc-head">
            <span>六维属性加点（${DC_ATTR_MIN}~${DC_ATTR_MAX}）</span>
            <strong id="creation-dc-budget">剩余 0 点 / 共 ${DC_ATTR_BUDGET}</strong>
          </div>
          <div class="creation-dc-presets">
            ${DC_PROTAGONIST_PRESETS.map(
              (preset) =>
                html`<button type="button" data-dc-preset="${preset.id}">${preset.name}</button>`,
            ).join('')}
          </div>
          <div class="creation-dc-grid" id="creation-dc-grid"></div>
        </div>
        <div id="creation-review">
          <div class="creation-empty">
            <span>◇</span>
            <h2>尚未定稿的旅人</h2>
            <p>生成后在这里检查主角的设定与技能，确认后才会开启新存档。</p>
          </div>
        </div>
        <p id="creation-status" role="status">接口与提示词预设已就绪，可以填写主角设定。</p>
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
  let dcAttrs = { ...DC_PROTAGONIST_PRESETS[0].attrs };
  let creationMode = null;
  let pending = false;
  let focus = null;
  const remainingDcPoints = () =>
    DC_ATTR_BUDGET - DC_ATTRIBUTES.reduce((sum, attr) => sum + (dcAttrs[attr.key] || 0), 0);
  function renderDcAllocator() {
    const remaining = remainingDcPoints();
    $('#creation-dc-budget').textContent =
      remaining === 0
        ? `已配齐 ${DC_ATTR_BUDGET} 点`
        : remaining > 0
          ? `剩余 ${remaining} 点可分配（共 ${DC_ATTR_BUDGET}）`
          : `超出 ${Math.abs(remaining)} 点（需减至共 ${DC_ATTR_BUDGET}）`;
    $('#creation-dc-budget').classList.toggle('is-incomplete', remaining !== 0);
    $('#creation-dc-grid').innerHTML = DC_ATTRIBUTES.map((attr) => {
      const value = dcAttrs[attr.key];
      const mod = formatMod(attrMod(value));
      return html`<div class="creation-dc-cell" title="${attr.desc}">
        <span class="dc-cell-name">${attr.label} <small>${attr.short}</small></span>
        <div class="dc-cell-ctrl">
          <button
            type="button"
            data-dc-step="${attr.key}:-1"
            aria-label="减少${attr.label}"
            ${value <= DC_ATTR_MIN ? 'disabled' : ''}
          >
            -
          </button>
          <strong>${value}<em>(${mod})</em></strong>
          <button
            type="button"
            data-dc-step="${attr.key}:1"
            aria-label="增加${attr.label}"
            ${value >= DC_ATTR_MAX || remaining <= 0 ? 'disabled' : ''}
          >
            +
          </button>
        </div>
      </div>`;
    }).join('');
    if (reviewed) {
      reviewed.dcAttrs = { ...dcAttrs };
      if (remaining === 0) $('#creation-review').innerHTML = characterSheet(reviewed);
    }
    $('#creation-start').disabled = !reviewed || remaining !== 0 || pending;
  }
  renderDcAllocator();
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
  const dialogue = createDialogue(events, 'guide-dialogue', context.gal);
  let shown = null;
  function refresh() {
    if (session.runtime.mode === 'event') {
      guide.hidden = true;
      highlight(null);
      return;
    }
    const active = guiding(session.ai.library) && !session.runtime.needsStart && !dialog.open;
    guide.hidden = true;
    highlight(null);
    if (!active) {
      dialogue.close();
      shown = null;
      return;
    }
    const campaign = state();
    if (
      !generationEnabled(session.ai.generationOptions) &&
      ['table', 'invite'].includes(campaign.tutorial)
    ) {
      campaign.tutorial = 'shop';
      campaign.tableTalkCompleted = true;
      context.generation.save();
      shown = null;
    }
    if (session.runtime.mode === 'inn' && campaign.tutorial === 'reward') {
      campaign.tutorial = 'summon-return';
      context.generation.save();
    }
    if (['welcome', 'summon', 'journal', 'portal'].includes(campaign.tutorial))
      campaign.tutorial = 'outing-door';
    const step =
      session.runtime.mode === 'inn' &&
      ![
        'arrival',
        'outing-door',
        'map-mill',
        'map-ruins',
        'mill-arrived',
        'ruins-arrived',
        'ether',
        'summon-return',
        'summon-guide',
        'recruit-dialogue',
        'table',
        'invite',
        'shop',
        'condenser',
        'depart-again',
      ].includes(campaign.tutorial)
        ? 'outing-door'
        : campaign.tutorial;
    if (step === 'arrival') {
      if (shown === step) return;
      shown = step;
      dialogue.show(
        ARRIVAL_PROSE.map((text, index) => {
          if (context.gal?.enabled && index === 1)
            return { speaker: '旁白', text: '【登场:伊蒂丝】' + text };
          return index === 0 ? { speaker: '旁白', text } : text;
        }),
        () => advance('outing-door'),
        true,
      );
      return;
    }
    if (step === 'recruit-dialogue') {
      if (shown === step) return;
      shown = step;
      dialogue.show(FIRST_RECRUIT_DIALOGUE, () => {
        state().tutorial = 'table';
        context.generation.save();
        refresh();
        context.shell.toast(
          generationEnabled(session.ai.generationOptions)
            ? '长景月汐已加入队伍，到圆桌坐下，邀请她一起出发。'
            : '长景月汐已加入队伍，已跳过AI交流教学，去补给角买一件补给吧。',
        );
      });
      return;
    }
    const content = EDITH_LESSONS[step];
    if (!content) return;
    guide.dataset.step = step;
    $('#tutorial-count').textContent = '伊蒂丝的小提醒';
    $('#tutorial-title').textContent = campaign.adventureTutorial
      ? {
          vulnerable: '精英战 · 易伤',
          slow: '精英战 · 背包与迟缓',
          crossfire: '精英战 · 一起查看意图',
        }[step] || content.title
      : content.title;
    $('#tutorial-text').textContent = '';
    $('#tutorial-action').textContent = content.action || '再听一遍';
    $('#tutorial-action').hidden = false;
    function readyForAction() {
      if (campaign.adventureTutorial && step === 'vulnerable-done') return advance('slow');
      if (campaign.adventureTutorial && step === 'slow-done') return advance('crossfire');
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
      if (step === 'intent') {
        tutorialTasks(campaign).journal = true;
        return advance('swap');
      }
      guide.hidden = false;
      highlight(content.focus);
    }
    if (shown === step) {
      if (!dialogue.open) readyForAction();
      return;
    }
    shown = step;
    const lines =
      context.gal?.enabled && step === 'intent'
        ? [
            'AP 环和背包再往右一点，那个圆形的「切换」按钮可以随时收起时间轴，用来翻剧情、跟同伴闲聊，或者微调后面还没走到的剧本。',
            '平时随时都能点开看一眼——知道它在这儿就行，先不用点进去。趁对面还没扑过来，咱们先把这一击躲开吧。',
          ]
        : content.lines;
    dialogue.show(lines, readyForAction);
  }
  function open() {
    if (session.battle.playing || session.ai.busy) return;
    if (session.runtime.needsStart && !context.firstRun?.completed) return context.firstRun.open();
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
      : '使用青缘开局。关闭开发者模式中的“跳过AI生成”即可创建自己的主角。';
    if (!enabled) {
      const hero = context.generation.defaultProtagonist();
      dcAttrs = normalizeDcAttrs(hero.dcAttrs, hero);
      review(hero);
    } else {
      reviewed = null;
      $('#creation-review').textContent = '填写设定，生成你的主角。';
      $('#creation-start').disabled = true;
      $('#creation-status').textContent = '请配置角色 API 与提示词预设，再生成主角。';
    }
    renderDcAllocator();
  }
  function review(entry) {
    entry.dcAttrs =
      remainingDcPoints() === 0 ? { ...dcAttrs } : normalizeDcAttrs(entry.dcAttrs, entry);
    dcAttrs = { ...entry.dcAttrs };
    reviewed = entry;
    $('#creation-review').innerHTML = characterSheet(entry);
    renderDcAllocator();
    $('#creation-status').textContent = generationEnabled(
      session.ai.generationOptions,
      'protagonistApi',
    )
      ? '主角已生成。检查设定与技能后确认，也可以修改左侧设定或上方属性点。'
      : '使用青缘开局，不请求主角生成 API。可在上方自由微调六维属性点数后开局。';
  }
  async function ready() {
    if (!generationEnabled(session.ai.generationOptions, 'protagonistApi')) return true;
    return context.generation.ensureReady('character');
  }
  events.on($('#creation-dc-allocator'), 'click', (event) => {
    const presetBtn = event.target.closest('[data-dc-preset]');
    if (presetBtn) {
      const preset = DC_PROTAGONIST_PRESETS.find((item) => item.id === presetBtn.dataset.dcPreset);
      if (preset) {
        dcAttrs = { ...preset.attrs };
        renderDcAllocator();
      }
      return;
    }
    const stepBtn = event.target.closest('[data-dc-step]');
    if (!stepBtn) return;
    const [key, deltaRaw] = stepBtn.dataset.dcStep.split(':');
    const delta = Number(deltaRaw);
    if (!Object.hasOwn(dcAttrs, key) || !Number.isInteger(delta)) return;
    if (delta > 0 && remainingDcPoints() <= 0) return;
    const next = dcAttrs[key] + delta;
    if (next < DC_ATTR_MIN || next > DC_ATTR_MAX) return;
    dcAttrs[key] = next;
    renderDcAllocator();
  });
  events.on($('#creation-form'), 'submit', async (event) => {
    event.preventDefault();
    if (pending || !$('#creation-form').reportValidity()) return;
    if (!$('#creation-form').elements.namedItem('name').value.trim()) {
      $('#creation-status').textContent = '请填写主角姓名。';
      return;
    }
    if (remainingDcPoints() !== 0) {
      $('#creation-status').textContent = `请先将六维属性配齐 ${DC_ATTR_BUDGET} 点再生成。`;
      return;
    }
    pending = true;
    $('#creation-generate').disabled = true;
    $('#creation-start').disabled = true;
    try {
      if (!(await ready()) || session.runtime.disposed) return;
      const values = new FormData($('#creation-form'));
      const attrSummary = DC_ATTRIBUTES.map((a) => `${a.label}${dcAttrs[a.key]}`).join(' / ');
      const brief =
        `六维属性偏好：${attrSummary}。\n` +
        `技能槽一：${values.get('skillType1')}；技能槽二：${values.get('skillType2')}。共两个技能，普通攻击独立。\n` +
        fields
          .map(([key, label]) => `${label}：${String(values.get(key) || '').trim() || '由AI补全'}`)
          .join('\n');
      $('#creation-status').textContent =
        '正在生成你的完整设定与技能，请稍候；失败时可查看原始回复并本地修正。';
      $('#creation-cancel').hidden = false;
      const entry = await context.generation.generateProtagonist(brief, dcAttrs);
      if (!session.runtime.disposed) review(entry);
    } catch (failure) {
      if (!session.runtime.disposed)
        $('#creation-status').textContent = `生成未完成：${failure.message}。当前存档没有改变。`;
    } finally {
      pending = false;
      if (!session.runtime.disposed) {
        $('#creation-cancel').hidden = true;
        $('#creation-generate').disabled = false;
        $('#creation-start').disabled = !reviewed || remainingDcPoints() !== 0;
      }
    }
  });
  events.on($('#creation-start'), 'click', async () => {
    if (!reviewed || pending || remainingDcPoints() !== 0) return;
    pending = true;
    try {
      if (!(await ready()) || session.runtime.disposed) return;
      session.runtime.needsStart = false;
      storage.removeItem('wanxiang.creation-pending.v1');
      session.ai.preparationSlot = 0;
      session.ai.preparationCharacter = reviewed.id;
      const campaign = newCampaign(reviewed);
      // Preserve both waiting-game saves across the newly created campaign.
      // Carry that progress into the newly created campaign instead of resetting it.
      campaign.workshop = session.ai.library.workshop;
      campaign.arcade = session.ai.library.arcade;
      context.generation.replaceLibrary(campaign);
      dialog.close();
      context.journey.returnInn();
      context.saves.createNewSave();
      refresh();
      context.ledger?.sync();
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
      $('#inn-frame iframe')?.contentWindow?.assetPreview?.moveTo('supplies');
      return;
    }
    if (guide.dataset.step === 'condenser') {
      $('#inn-frame iframe')?.contentWindow?.assetPreview?.moveTo('supplies');
      context.shell.toast('点击售货机旁的以太凝聚器，认识凝聚与兑换页面。');
      return;
    }
    if (['table', 'invite'].includes(guide.dataset.step)) {
      $('#inn-frame iframe')?.contentWindow?.assetPreview?.moveTo('table');
      return;
    }
    if (['map-mill', 'map-ruins'].includes(guide.dataset.step)) {
      const target = $('#inn-frame iframe')?.contentWindow;
      if (target) target.postMessage({ type: 'daily-open-atlas', preview: false }, location.origin);
      else context.shell.toast('街道正在载入，请稍候');
      return;
    }
    if (['outing-door', 'summon-return', 'depart-again'].includes(guide.dataset.step)) {
      const preview = $('#inn-frame iframe')?.contentWindow?.assetPreview;
      const place =
        guide.dataset.step === 'outing-door'
          ? 'streetDoor'
          : guide.dataset.step === 'depart-again'
            ? 'gate'
            : 'summon';
      if (preview) preview.moveTo(place);
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
    if (
      step === 'intent' &&
      event.target.closest('#story-toggle,[data-dungeon-gal="story"]') &&
      ($('#story-feed').open || context.gal?.owner === 'script')
    ) {
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
  events.on(document, 'gal-finished', (event) => {
    if (
      event.detail.owner === 'script' &&
      event.detail.completed &&
      learning(session.ai.library) &&
      state().tutorial === 'swap'
    )
      refresh();
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
      context.firstRun?.resumed();
      session.runtime.needsStart = false;
      storage.removeItem('wanxiang.creation-pending.v1');
      dialog.close();
      refresh();
      context.ledger?.sync();
    },
    allowPortal(kind) {
      if (kind === 'script' && developerOption(session.ai.generationOptions, 'quickTest'))
        return true;
      const unlocked = session.ai.library.unlockedDungeons || [];
      const millOrLegacyUnlocked = unlocked.includes('mill') || unlocked.includes('ruins');
      if (
        kind === 'script' &&
        !state()?.completed &&
        learning(session.ai.library) &&
        !millOrLegacyUnlocked
      ) {
        context.shell.toast(
          '先从酒馆正门走出星钟城，亲脚前往近处的绿蕨磨坊记下坐标，再使用副本之门。',
        );
        return false;
      }
      if (
        kind === 'script' &&
        state()?.completed &&
        guiding(session.ai.library) &&
        state().tutorial !== 'depart-again'
      ) {
        context.shell.toast(
          ['table', 'invite'].includes(state().tutorial)
            ? '先到圆桌与长景月汐交流，完成至少一次交流，再一起出发。'
            : state().tutorial === 'condenser'
              ? '先点开售货机旁的以太凝聚器，了解以太和装备的用途。'
              : state().tutorial === 'shop'
                ? '先前往酒馆补给角的虚空售货机，购买一件补给。'
                : '先完成以太结算和首次召唤教学。',
        );
        return false;
      }
      return true;
    },
    streetEntered() {
      if (!learning(session.ai.library) || state()?.completed) return;
      if (state()?.tutorial === 'outing-door') {
        state().tutorial = 'map-mill';
        context.generation.save();
        refresh();
      }
    },
    tavernEntered() {
      if (!learning(session.ai.library) || state()?.completed) return;
      if (['map-mill', 'map-ruins'].includes(state()?.tutorial)) {
        state().tutorial = 'outing-door';
        context.generation.save();
        refresh();
      }
    },
    ruinsReached() {
      if (!learning(session.ai.library) || state()?.completed) return;
      if (['outing-door', 'map-mill', 'map-ruins'].includes(state()?.tutorial)) {
        state().tutorial = 'mill-arrived';
        context.generation.save();
        refresh();
      }
    },
    summonCompanion() {
      if (!state() || state().firstRecruit) return false;
      if (!state().completed) {
        context.shell.toast('先完成绿蕨磨坊探索，取得召唤契约后再来。');
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
              (action.target === TUTORIAL_TARGETS.vulnerable ||
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
      if (
        developerOption(session.ai.generationOptions, 'quickTest') ||
        session.journey.expedition?.exploration?.quickTestBoss
      )
        return true;
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
      if (
        session.battle.state.encounter === 3 ||
        (state().adventureTutorial &&
          session.battle.state.encounter === 2 &&
          tutorialTasks(state()).slow)
      ) {
        tutorialTasks(state()).crossfire = true;
        if (state().tutorial === 'crossfire') advance('crossfire-done');
      } else if (state().tutorial === 'timeline') advance('intent');
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
      else if (
        session.battle.state.phase === 'plan' &&
        session.battle.state.encounter === 4 &&
        !tutorialTasks(state()).breakLesson &&
        result.events.some((event) =>
          event.statusTriggers?.some((trigger) => trigger.type === 'break'),
        )
      ) {
        tutorialTasks(state()).breakLesson = true;
        advance('boss-break');
      }
      if (
        learning(session.ai.library) &&
        opening &&
        ['extra', 'opening-action', 'opening-confirm'].includes(state().tutorial)
      )
        advance('timeline');
    },
    battleStarted() {
      if (!learning(session.ai.library)) return refresh();
      const lesson = (
        state().adventureTutorial
          ? ['extra', null, 'vulnerable', null, 'boss']
          : ['extra', 'vulnerable', 'slow-opening', 'crossfire', 'boss']
      )[session.battle.state.encounter];
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
        state().tutorial = 'condenser';
        context.generation.save();
      }
    },
    condenserOpened() {
      return state()?.tutorial === 'condenser';
    },
    condenserLearned() {
      if (state()?.tutorial !== 'condenser') return;
      state().tutorial = 'depart-again';
      context.generation.save();
      refresh();
    },
    preparationOpened() {
      if (!state()?.completed || !state().firstRecruit || tutorialTasks(state()).equipmentIntro)
        return;
      tutorialTasks(state()).equipmentIntro = true;
      context.generation.save();
      dialogue.show([
        '趁还没动身，先顺手看一眼装备栏吧。平时整备或编排队伍时，只要点一下已经上阵的角色卡就能打开装备页。',
        '每人能带三件装备，选中包里的物件点上去即可，留空就是卸下。同一件装备只能交给一人带着，属性加成和特殊效果都会带进副本。',
        '刚才确认过的同伴和站位都已经写进开场剧本了，整备时只换装备、也能看看背包，进副本之后就不能再临时调换。现在包里还空着也没关系，知道入口在哪就行。',
      ]);
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
      if (
        developerOption(session.ai.generationOptions, 'quickTest') ||
        session.journey.expedition?.exploration?.quickTestBoss
      )
        return true;
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
