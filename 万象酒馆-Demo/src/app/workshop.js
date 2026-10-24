import { html } from '../shared/html.js';
import { createEventScope } from '../shared/events.js';
import {
  loadWorkshopCatalog,
  validateWorkshopCatalog,
  WORKSHOP_CATALOG_KEY,
} from '../workshop/catalog.js';
import {
  restoreWorkshop,
  advanceWorkshop,
  workshopAction,
  workshopVisible,
  modifyWorkshop,
} from '../workshop/engine.js';
import {
  workshopGraph,
  workshopInspector,
  workshopInventory,
  workshopNumber,
} from './workshop-view.js';
import { createWorkshopEditor } from './workshop-editor.js';

/** Owns presentation clocks only; production and every purchase use the pure workshop engine. */
export function createWorkshop(context) {
  const events = createEventScope();
  const dialog = document.createElement('dialog');
  dialog.id = 'workshop-dialog';
  dialog.setAttribute('aria-label', '星隙工坊');
  dialog.innerHTML = html`<header class="ws-header">
      <div class="ws-brand">
        <small>万象酒馆 · 旅人经营手记</small>
        <h1>星隙工坊<span>THE BETWEEN WORKSHOP</span></h1>
      </div>
      <div class="ws-header-actions">
        <button data-ws-editor hidden>工坊修改器</button><button data-ws-close>返回游戏</button>
      </div>
    </header>
    <div class="ws-toolbar">
      <nav aria-label="工坊页面">
        <button data-ws-tab="production" aria-pressed="true">生产蓝图</button
        ><button data-ws-tab="research" aria-pressed="false">工艺研修</button
        ><button data-ws-tab="inventory" aria-pressed="false">物资簿</button>
      </nav>
      <div class="ws-wallet">
        <small>工坊券</small><b data-ws-coins>0</b><button data-ws-core>炉心 0</button>
      </div>
    </div>
    <div class="ws-workspace">
      <main class="ws-main">
        <div class="ws-canvas-tools">
          <input
            data-ws-search
            aria-label="查找工艺"
            placeholder="查找工艺…"
            maxlength="100"
          /><span>拖动蓝图 · 滚轮缩放</span><button data-ws-center>归位</button>
        </div>
        <div class="ws-map" tabindex="0" aria-label="工坊生产蓝图">
          <div class="ws-transform"></div>
        </div>
        <div class="ws-inventory-wrap" hidden></div>
        <div class="ws-zoom">
          <button data-ws-zoom="-1" aria-label="缩小蓝图">−</button><output>100%</output
          ><button data-ws-zoom="1" aria-label="放大蓝图">＋</button>
        </div>
      </main>
      <aside class="ws-inspector" aria-live="polite"></aside>
    </div>
    <footer class="ws-footer">
      <p data-ws-message role="status">从一捧星尘开始，把等待变成一间运转的小工坊。</p>
      <span data-ws-requests>进度自动保存</span>
    </footer>`;
  const notice = document.createElement('dialog');
  notice.id = 'workshop-completion';
  notice.innerHTML =
    '<small>酒馆来信</small><h2>接口已返回</h2><p></p><div><button data-ws-stay>继续经营</button><button class="ws-primary" data-ws-return>返回查看</button></div>';
  document.body.append(dialog, notice);
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.id = 'workshop-open';
  launcher.textContent = '星隙工坊';
  // Also available from Settings, so an interrupted wait can always resume the same workshop.
  document.querySelector('.generation-options')?.append(launcher);
  let catalog = loadWorkshopCatalog(context.storage);
  let state = null,
    owner = null,
    timer = null,
    savedAt = 0,
    disposed = false;
  let tab = 'production',
    selected = 'stardust',
    search = '',
    signature = '';
  let pan = { x: 0, y: 0, scale: 1 },
    dragging = null,
    completions = [];
  const requests = new Map();
  const map = dialog.querySelector('.ws-map');
  const transform = dialog.querySelector('.ws-transform');
  const inspector = dialog.querySelector('.ws-inspector');
  const editor = createWorkshopEditor({
    context,
    getCatalog: () => catalog,
    applyCatalog(next) {
      const validated = validateWorkshopCatalog(next);
      context.storage.setItem(WORKSHOP_CATALOG_KEY, JSON.stringify(validated));
      settle();
      catalog = validated;
      state = restoreWorkshop(state, catalog, Date.now());
      signature = '';
      persist();
      render(true);
    },
    getState() {
      sync();
      settle();
      return structuredClone(state);
    },
    changeState(patch) {
      sync();
      settle();
      state = modifyWorkshop(state, catalog, patch, Date.now());
      persist();
      render(true);
    },
    advance(seconds) {
      sync();
      settle();
      const at = Date.now();
      state = advanceWorkshop({ ...state, at: at - seconds * 1000 }, catalog, at).state;
      persist();
      render(true);
    },
  });
  function sync() {
    const next = context.session.ai.library;
    if (next === owner && state) return;
    owner = next;
    state = restoreWorkshop(owner.workshop, catalog, Date.now());
    selected = catalog.items[0].id;
    signature = '';
  }
  function persist() {
    if (!state || owner !== context.session.ai.library) return;
    owner.workshop = structuredClone(state);
    if (context.generation.save() === false) message('工坊保存失败，请检查设备空间并导出备份。');
    savedAt = Date.now();
  }
  function settle() {
    if (!state || owner !== context.session.ai.library) return;
    const result = advanceWorkshop(state, catalog, Date.now());
    state = result.state;
    for (const event of result.events) {
      const card = dialog.querySelector(`[data-ws-node="${event.id}"]`);
      if (card && !globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches)
        card.animate([{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }], {
          duration: 450,
        });
    }
  }
  function move() {
    transform.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`;
    dialog.querySelector('.ws-zoom output').textContent = Math.round(pan.scale * 100) + '%';
  }
  function message(text) {
    dialog.querySelector('[data-ws-message]').textContent = text;
  }
  function render(force = false) {
    if (!state || disposed) return;
    const settling = state.at < Date.now() - 1000;
    const ids = (tab === 'research' ? catalog.research : catalog.items)
      .filter((entry) =>
        workshopVisible(state, catalog, tab === 'research' ? 'research' : 'item', entry),
      )
      .map((entry) => entry.id);
    const next = [tab, selected, search, settling, ...ids].join('|');
    if (force || signature !== next) {
      signature = next;
      transform.innerHTML = workshopGraph(state, catalog, tab, selected, search);
      inspector.innerHTML = workshopInspector(state, catalog, tab, selected);
      if (tab === 'inventory')
        dialog.querySelector('.ws-inventory-wrap').innerHTML = workshopInventory(state, catalog);
      move();
    }
    dialog.querySelector('.ws-map').hidden = tab === 'inventory';
    dialog.querySelector('.ws-inventory-wrap').hidden = tab !== 'inventory';
    dialog.querySelector('.ws-zoom').hidden = tab === 'inventory';
    for (const button of dialog.querySelectorAll('[data-ws-tab]'))
      button.setAttribute('aria-pressed', String(button.dataset.wsTab === tab));
    dialog.querySelector('[data-ws-editor]').hidden =
      !context.session.ai.generationOptions.developerMode;
    dialog.querySelector('[data-ws-coins]').textContent = workshopNumber(state.coins);
    dialog.querySelector('[data-ws-core]').textContent = `炉心 ${state.core}`;
    dialog.querySelector('[data-ws-requests]').textContent = requests.size
      ? `${requests.size} 个接口正在处理 · 工坊持续运转`
      : '进度自动保存 · 离线生产最多结算 8 小时';
    const stock = inspector.querySelector('[data-ws-stock]');
    if (stock) stock.textContent = workshopNumber(state.items[selected]);
    for (const cost of inspector.querySelectorAll('[data-ws-cost]')) {
      const required = Number(cost.dataset.required),
        amount = state.items[cost.dataset.wsCost] || 0;
      cost.classList.toggle('enough', amount >= required);
      cost.querySelector('b').textContent = workshopNumber(amount) + '/' + workshopNumber(required);
    }
    for (const amount of dialog.querySelectorAll('[data-ws-inventory-quantity]'))
      amount.textContent = workshopNumber(state.items[amount.dataset.wsInventoryQuantity]);
    for (const element of dialog.querySelectorAll('[data-ws-quantity]')) {
      const id = element.dataset.wsQuantity;
      element.textContent =
        tab === 'research'
          ? `Lv.${state.research[id] || 0} / ${catalog.research.find((t) => t.id === id).costs.length}`
          : workshopNumber(state.items[id]);
    }
    for (const element of dialog.querySelectorAll('[data-ws-progress]')) {
      const id = element.dataset.wsProgress;
      const item = catalog.items.find((i) => i.id === id);
      const works = [
        state.manual[id]?.active ? state.manual[id].work : 0,
        ...Object.values(state.stations).map((s) => s.jobs[id] || 0),
      ];
      element.style.width =
        (item ? Math.min(100, (Math.max(...works) / item.seconds) * 100) : 0) + '%';
    }
    for (const button of dialog.querySelectorAll('[data-ws-action="craft"]')) {
      const id = button.dataset.id;
      const busy = state.manual[id]?.active;
      button.disabled = !!busy;
      button.textContent = busy ? '手作中…' : '手作一份';
    }
    dialog.querySelector('[data-ws-editor]').disabled = settling;
    if (settling) {
      dialog.querySelector('[data-ws-requests]').textContent = '正在结算离线产线…';
      for (const button of dialog.querySelectorAll('[data-ws-action]')) button.disabled = true;
    }
  }
  function tick() {
    clearTimeout(timer);
    if (disposed || !dialog.open) return;
    if (owner !== context.session.ai.library) {
      close();
      return;
    }
    settle();
    render();
    if (Date.now() - savedAt >= 5000) persist();
    timer = setTimeout(tick, 250);
  }
  function open() {
    if (disposed) return;
    sync();
    settle();
    persist();
    render(true);
    if (!dialog.open) dialog.showModal();
    tick();
  }
  function close() {
    settle();
    persist();
    dialog.close();
    notice.close();
    completions = [];
    clearTimeout(timer);
    void context.storage.flush?.();
  }
  function announce() {
    if (!dialog.open || !completions.length || disposed) return;
    notice.querySelector('p').textContent = completions.join('；') + '。工坊进度已保存。';
    if (!notice.open) notice.showModal();
  }
  events.on(launcher, 'click', open);
  events.on(dialog, 'cancel', (event) => {
    event.preventDefault();
    close();
  });
  events.on(dialog, 'click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-ws-close')) close();
    if (button.hasAttribute('data-ws-editor') && context.session.ai.generationOptions.developerMode)
      editor.open();
    if (button.dataset.wsTab) {
      tab = button.dataset.wsTab;
      selected =
        tab === 'research'
          ? catalog.research.find((t) => workshopVisible(state, catalog, 'research', t))?.id
          : catalog.items[0].id;
      pan = { x: 0, y: 0, scale: 1 };
      render(true);
    }
    if (button.dataset.wsSelect) {
      selected = button.dataset.wsSelect;
      render(true);
    }
    if (button.hasAttribute('data-ws-core')) {
      selected = 'core';
      render(true);
    }
    if (button.hasAttribute('data-ws-center')) {
      pan = { x: 0, y: 0, scale: 1 };
      move();
    }
    if (button.dataset.wsZoom) {
      pan.scale = Math.max(0.35, Math.min(1.8, pan.scale + Number(button.dataset.wsZoom) * 0.1));
      move();
    }
    if (button.dataset.wsAction) {
      settle();
      const type = button.dataset.wsAction;
      const amount =
        type === 'sell-all'
          ? state.items[button.dataset.id]
          : Number(inspector.querySelector('[data-ws-sell-count]')?.value || 1);
      const result = workshopAction(state, catalog, {
        type: type === 'sell-all' ? 'sell' : type,
        id: button.dataset.id,
        amount,
      });
      state = result.state;
      message(
        result.error ||
          {
            craft: '手作已开始。',
            build: '新设施开始运转。',
            research: '研修完成，新工艺已生效。',
            core: '炉心升级，所有产线更加高效。',
            sell: '物资已交付，工坊券到账。',
            'sell-all': '物资已全部交付。',
          }[type] ||
          '已保存。',
      );
      if (!result.error) persist();
      render(true);
    }
  });
  events.on(dialog, 'input', (event) => {
    if (event.target.hasAttribute('data-ws-search')) {
      search = event.target.value;
      render(true);
    }
    if (event.target.dataset.wsActive) {
      settle();
      state = workshopAction(state, catalog, {
        type: 'active',
        id: event.target.dataset.wsActive,
        amount: Number(event.target.value),
      }).state;
      event.target.nextElementSibling.value = event.target.value;
      persist();
    }
  });
  events.on(dialog, 'change', (event) => {
    if (event.target.dataset.wsActive) render(true);
  });
  events.on(map, 'pointerdown', (event) => {
    if (event.target.closest('button,input') || event.button !== 0) return;
    dragging = { x: event.clientX, y: event.clientY, pan: { ...pan } };
    map.setPointerCapture(event.pointerId);
    map.classList.add('dragging');
  });
  events.on(map, 'pointermove', (event) => {
    if (!dragging) return;
    pan.x = dragging.pan.x + event.clientX - dragging.x;
    pan.y = dragging.pan.y + event.clientY - dragging.y;
    move();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    events.on(map, name, () => {
      dragging = null;
      map.classList.remove('dragging');
    });
  events.on(
    map,
    'wheel',
    (event) => {
      event.preventDefault();
      const bounds = map.getBoundingClientRect();
      const x = event.clientX - bounds.left,
        y = event.clientY - bounds.top;
      const scale = Math.max(0.35, Math.min(1.8, pan.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
      pan = {
        x: x - ((x - pan.x) * scale) / pan.scale,
        y: y - ((y - pan.y) * scale) / pan.scale,
        scale,
      };
      move();
    },
    { passive: false },
  );
  events.on(notice, 'click', (event) => {
    if (event.target.closest('[data-ws-return]')) close();
    if (event.target.closest('[data-ws-stay]')) {
      completions = [];
      notice.close();
    }
  });
  events.on(notice, 'cancel', () => {
    completions = [];
  });
  return {
    open,
    snapshot() {
      sync();
      settle();
      persist();
      return structuredClone(state);
    },
    begin(id, label) {
      requests.set(id, label);
      if (dialog.open) render();
    },
    finish(id, outcome) {
      const label = requests.get(id);
      requests.delete(id);
      if (disposed) return;
      if (dialog.open && label) {
        completions.push(
          label +
            (outcome === 'success'
              ? '已完成'
              : outcome === 'cancel'
                ? '已终止'
                : '返回错误，请查看详情'),
        );
        announce();
        render();
      }
    },
    dispose() {
      if (disposed) return;
      settle();
      persist();
      disposed = true;
      clearTimeout(timer);
      requests.clear();
      editor.dispose();
      events.dispose();
      dialog.remove();
      notice.remove();
      launcher.remove();
    },
  };
}
