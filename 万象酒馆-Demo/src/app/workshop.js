import { html } from '../shared/html.js';
import { createEventScope } from '../shared/events.js';
import { loadWorkshopCatalog, validateWorkshopCatalog } from '../workshop/catalog.js';
import { localWorkshopAvailable, readLocalWorkshopCatalog } from '../workshop/local-catalog.js';
import { WORKSHOP_TILE } from '../workshop/layout.js';
import {
  restoreWorkshop,
  advanceWorkshop,
  workshopAction,
  workshopVisible,
} from '../workshop/engine.js';
import {
  workshopGraph,
  workshopHome,
  workshopInspector,
  workshopInventory,
  workshopNumber,
} from './workshop-view.js';

/** Owns presentation clocks only; production and every purchase use the pure workshop engine. */
export function createWorkshop(context) {
  const events = createEventScope();
  const dialog = document.createElement('dialog');
  dialog.id = 'workshop-dialog';
  dialog.className = 'workshop-layer';
  dialog.setAttribute('aria-label', '星隙工坊');
  dialog.innerHTML = html`<header class="ws-header">
      <div class="ws-brand"><h1>星隙工坊</h1></div>
      <div class="ws-header-actions">
        <button data-ws-close>返回游戏</button>
      </div>
    </header>
    <div class="ws-toolbar">
      <div class="ws-wallet">
        <span>金币 <b data-ws-gold>0</b></span
        ><span>以太 <b data-ws-ether>0</b></span
        ><button data-ws-core>炉心 0</button>
      </div>
      <button data-ws-help aria-label="工坊操作说明">？</button>
    </div>
    <main class="ws-main">
      <p class="ws-loading" role="status">正在读取工坊配置…</p>
      <div class="ws-map" tabindex="0" aria-label="工坊生产蓝图">
        <div class="ws-transform"></div>
      </div>
      <div class="ws-inventory-wrap" hidden></div>
      <p class="ws-empty" hidden>研修尚未开启。先制作工坊机芯。</p>
      <div class="ws-zoom">
        <button data-ws-center>归位</button>
        <button data-ws-zoom="1" aria-label="放大蓝图">＋</button>
        <button data-ws-zoom="-1" aria-label="缩小蓝图">−</button>
      </div>
      <p data-ws-message role="status"></p>
    </main>
    <footer class="ws-footer">
      <nav aria-label="工坊页面">
        <button data-ws-tab="production" aria-pressed="true">生产</button>
        <span data-ws-pages></span>
        <button data-ws-tab="research" aria-pressed="false">研修</button>
        <button data-ws-tab="inventory" aria-pressed="false">物资簿</button>
      </nav>
      <span data-ws-requests>进度自动保存</span>
    </footer>
    <dialog class="ws-inspector workshop-layer" aria-label="工坊详情">
      <div class="ws-detail-bar"><button data-ws-detail-close>关闭</button></div>
      <div class="ws-detail-content"></div>
      <p data-ws-detail-message role="status"></p>
    </dialog>`;
  const notice = document.createElement('dialog');
  notice.id = 'workshop-completion';
  notice.className = 'workshop-layer';
  notice.innerHTML =
    '<h2>接口已返回</h2><p></p><div><button data-ws-stay>继续经营</button><button class="ws-primary" data-ws-return>返回查看</button></div>';
  document.body.append(dialog, notice);
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.id = 'workshop-open';
  launcher.textContent = '星隙工坊';
  document.querySelector('#ai-open')?.before(launcher);
  const overlayLauncher = launcher.cloneNode(true);
  overlayLauncher.id = 'workshop-overlay-open';
  document.body.append(overlayLauncher);
  const lesson = document.createElement('dialog');
  lesson.className = 'workshop-layer ws-tutorial';
  lesson.setAttribute('aria-label', '工坊入门');
  lesson.innerHTML =
    '<form method="dialog"><h2>工坊入门</h2><ol><li>点生产图上的建筑，查看产物和建造条件。</li><li>用金币、以太建造。建筑会自动产出，物资可在物资簿查看。</li><li>用已有产物推进研修，解锁下一批建筑。</li></ol><button class="ws-primary">开始经营</button></form>';
  document.body.append(lesson);
  function unlockTutorial() {
    const library = context.session.ai.library;
    if (new Set(library.emblems || []).size < 2 || library.daily.unlocks.workshopTutorial) return;
    library.daily.unlocks.workshopTutorial = 'ready';
    context.generation.save();
    context.shell.toast('星隙工坊入门已解锁');
  }
  events.on(lesson, 'close', () => {
    if (!owner || owner !== context.session.ai.library) return;
    owner.daily.unlocks.workshopTutorial = 'done';
    context.generation.save();
  });
  let catalog = loadWorkshopCatalog(context.storage);
  let state = null,
    owner = null,
    timer = null,
    savedAt = 0,
    disposed = false;
  let tab = 'production',
    detail = null,
    signature = '',
    catalogRevision = null,
    opening = null;
  let pan = { x: 0, y: 0, scale: 1 },
    dragging = null,
    completions = [];
  const requests = new Map();
  const map = dialog.querySelector('.ws-map');
  const transform = dialog.querySelector('.ws-transform');
  const detailDialog = dialog.querySelector('.ws-inspector');
  const inspector = detailDialog.querySelector('.ws-detail-content');
  const wallet = () => owner.inventory;
  function sync() {
    const next = context.session.ai.library;
    if (next === owner && state) return;
    owner = next;
    if (Number.isSafeInteger(owner.workshop?.coins) && owner.workshop.coins > 0)
      owner.inventory.gold = Math.min(999999999, owner.inventory.gold + owner.workshop.coins);
    state = restoreWorkshop(owner.workshop, catalog, Date.now());
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
    map.style.backgroundSize = `${WORKSHOP_TILE.width * pan.scale}px ${WORKSHOP_TILE.height * pan.scale}px`;
    map.style.backgroundPosition = `${pan.x + WORKSHOP_TILE.x * pan.scale}px ${pan.y + WORKSHOP_TILE.y * pan.scale}px`;
  }
  function home() {
    const point = workshopHome(catalog, state, tab);
    const scale = Math.min(1, map.clientWidth / 390, map.clientHeight / 300);
    pan = {
      x: map.clientWidth / 2 - point.x * scale,
      y: map.clientHeight * 0.43 - point.y * scale,
      scale,
    };
    move();
  }
  function zoom(factor, x = map.clientWidth / 2, y = map.clientHeight / 2) {
    const scale = Math.max(0.35, Math.min(1.8, pan.scale * factor));
    pan = {
      x: x - ((x - pan.x) * scale) / pan.scale,
      y: y - ((y - pan.y) * scale) / pan.scale,
      scale,
    };
    move();
  }
  function message(text) {
    dialog.querySelector('[data-ws-message]').textContent = text;
    detailDialog.querySelector('[data-ws-detail-message]').textContent = text;
  }
  function render(force = false) {
    if (!state || disposed || opening) return;
    const settling = state.at < Date.now() - 1000;
    const ids = (tab === 'research' ? catalog.research : catalog.items)
      .filter((entry) =>
        workshopVisible(state, catalog, tab === 'research' ? 'research' : 'item', entry),
      )
      .map((entry) => entry.id);
    const facilities = catalog.stations
      .filter((entry) => workshopVisible(state, catalog, 'station', entry))
      .map((entry) => entry.id);
    const next = [tab, settling, ...ids, ...facilities].join('|');
    if (force || signature !== next) {
      signature = next;
      const pages = dialog.querySelector('[data-ws-pages]');
      pages.replaceChildren(
        ...(catalog.pages || []).map(({ id, name }) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.wsTab = id;
          button.textContent = name;
          return button;
        }),
      );
      transform.innerHTML = tab === 'inventory' ? '' : workshopGraph(state, catalog, tab);
      if (detail && detail.kind !== 'help' && (force || !inspector.querySelector('input:focus')))
        inspector.innerHTML = workshopInspector(state, catalog, detail.kind, detail.id, wallet());
      const inventory = dialog.querySelector('.ws-inventory-wrap');
      inventory.innerHTML = tab === 'inventory' ? workshopInventory(state, catalog) : '';
      move();
    }
    dialog.querySelector('.ws-map').hidden = tab === 'inventory';
    dialog.querySelector('.ws-inventory-wrap').hidden = tab !== 'inventory';
    dialog.querySelector('.ws-zoom').hidden = tab === 'inventory';
    dialog.querySelector('.ws-empty').hidden = tab !== 'research' || ids.length > 0;
    for (const button of dialog.querySelectorAll('[data-ws-tab]'))
      button.setAttribute('aria-pressed', String(button.dataset.wsTab === tab));
    dialog.querySelector('[data-ws-gold]').textContent = workshopNumber(wallet().gold);
    dialog.querySelector('[data-ws-ether]').textContent = workshopNumber(wallet().ether);
    dialog.querySelector('[data-ws-core]').textContent = `炉心 ${state.core}`;
    dialog.querySelector('[data-ws-requests]').textContent = requests.size
      ? `${requests.size} 个接口正在处理 · 工坊持续运转`
      : '进度自动保存 · 离线生产最多结算 8 小时';
    const stock = inspector.querySelector('[data-ws-stock]');
    if (stock && detail) stock.textContent = workshopNumber(state.items[detail.id]);
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
      element.textContent = workshopNumber(state.items[id]);
    }
    for (const element of dialog.querySelectorAll('[data-ws-progress]')) {
      const id = element.dataset.wsProgress;
      const item = catalog.items.find((i) => i.id === id);
      const manual = state.manual[id];
      const progress = item && manual?.active ? manual.work / item.seconds : 0;
      const stations = catalog.stations.filter((station) => station.outputs[id]);
      const batches = stations.map((station) => {
        const jobs = state.stations[station.id]?.jobs;
        return station.cycle
          ? (jobs?.batch || 0) / station.cycle
          : (jobs?.[id] || 0) / (station.period || item.seconds);
      });
      element.style.width = Math.min(100, Math.max(progress, ...batches) * 100) + '%';
    }
    for (const button of dialog.querySelectorAll('[data-ws-action="craft"]')) {
      const id = button.dataset.id;
      const busy = state.manual[id]?.active;
      button.disabled = !!busy;
      if (!button.classList.contains('ws-node-action'))
        button.textContent = busy ? '手作中…' : '手作一份';
    }
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
  async function open() {
    if (disposed || dialog.open) return;
    const attempt = Symbol();
    opening = attempt;
    dialog.dataset.loading = '';
    const loading = dialog.querySelector('.ws-loading');
    loading.textContent = '正在读取工坊配置…';
    dialog.showModal();
    if (localWorkshopAvailable()) {
      try {
        const local = await readLocalWorkshopCatalog({ allowMissing: true });
        if (opening !== attempt) return;
        if (local && local.revision !== catalogRevision) {
          const next = validateWorkshopCatalog(local.catalog);
          settle();
          catalog = next;
          if (state && owner === context.session.ai.library)
            state = restoreWorkshop(state, catalog, Date.now());
          catalogRevision = local.revision;
        }
      } catch (failure) {
        if (opening === attempt) loading.textContent = failure.message + ' 请关闭工坊后重试。';
        return;
      }
    }
    if (opening !== attempt) return;
    opening = null;
    delete dialog.dataset.loading;
    if (
      ![
        'production',
        'research',
        'inventory',
        ...(catalog.pages || []).map((page) => page.id),
      ].includes(tab)
    )
      tab = 'production';
    sync();
    settle();
    persist();
    render(true);
    home();
    tick();
    if (owner.daily.unlocks.workshopTutorial === 'ready') lesson.showModal();
  }
  function close() {
    if (!opening) {
      settle();
      persist();
    }
    opening = null;
    delete dialog.dataset.loading;
    closeDetail();
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
  events.on(overlayLauncher, 'click', open);
  events.on(dialog, 'cancel', (event) => {
    if (event.target !== dialog) return;
    event.preventDefault();
    close();
  });
  events.on(detailDialog, 'cancel', (event) => {
    event.preventDefault();
    closeDetail();
  });
  function openDetail(kind, id) {
    detail = { kind, id };
    inspector.innerHTML =
      kind === 'help'
        ? '<h2>工坊操作</h2><p>点图标开始手作、建造或研修。点名称查看配方、费用和生产设置。</p><p>拖动查看产线，用滚轮或左侧按钮缩放。可在物资簿交付库存，换取金币。</p>'
        : workshopInspector(state, catalog, kind, id, wallet());
    detailDialog.querySelector('[data-ws-detail-message]').textContent = '';
    detailDialog.showModal();
  }
  function closeDetail() {
    detail = null;
    detailDialog.close();
    inspector.replaceChildren();
  }
  events.on(dialog, 'click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-ws-close')) return close();
    if (opening) return;
    if (button.dataset.wsTab) {
      tab = button.dataset.wsTab;
      message('');
      render(true);
      if (tab !== 'inventory') home();
    }
    if (button.dataset.wsSelect) openDetail(button.dataset.kind, button.dataset.wsSelect);
    if (button.hasAttribute('data-ws-core')) openDetail('core');
    if (button.hasAttribute('data-ws-help')) openDetail('help');
    if (button.hasAttribute('data-ws-detail-close')) closeDetail();
    if (button.hasAttribute('data-ws-center')) home();
    if (button.dataset.wsZoom) zoom(1.15 ** Number(button.dataset.wsZoom));
    if (button.dataset.wsAction) {
      settle();
      const type = button.dataset.wsAction;
      const amount =
        type === 'sell-all'
          ? state.items[button.dataset.id]
          : Number(inspector.querySelector('[data-ws-sell-count]')?.value || 1);
      const result = workshopAction(
        state,
        catalog,
        {
          type: type === 'sell-all' ? 'sell' : type,
          id: button.dataset.id,
          amount,
        },
        wallet(),
      );
      state = result.state;
      if (!result.error) Object.assign(wallet(), result.wallet);
      message(
        result.error ||
          {
            craft: '手作已开始。',
            build: '新设施开始运转。',
            research: '研修完成，新工艺已生效。',
            core: '炉心升级，所有产线更加高效。',
            sell: '物资已交付，金币到账。',
            'sell-all': '物资已全部交付。',
          }[type] ||
          '已保存。',
      );
      if (!result.error) persist();
      render(true);
    }
  });
  events.on(dialog, 'input', (event) => {
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
      zoom(
        event.deltaY < 0 ? 1.15 : 1 / 1.15,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
    },
    { passive: false },
  );
  events.on(map, 'contextmenu', (event) => {
    const tile = event.target.closest('[data-ws-node]');
    if (!tile) return;
    event.preventDefault();
    openDetail(tile.dataset.kind, tile.dataset.wsNode);
  });
  events.on(map, 'keydown', (event) => {
    if (event.target !== map) return;
    const direction = {
      ArrowLeft: [1, 0],
      ArrowRight: [-1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    pan.x += direction[0] * 80;
    pan.y += direction[1] * 80;
    move();
  });
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
    unlockTutorial,
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
      opening = null;
      clearTimeout(timer);
      requests.clear();
      events.dispose();
      dialog.remove();
      notice.remove();
      lesson.remove();
      launcher.remove();
      overlayLauncher.remove();
    },
  };
}
