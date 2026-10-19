import { ITEMS } from '../content/items.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';

/** Inventory is only projected here; the battle engine owns effects and consumption. */
export function createBackpack(context) {
  const { session, events } = context;
  const button = document.createElement('button');
  button.id = 'backpack-open';
  button.type = 'button';
  button.hidden = true;
  button.setAttribute('aria-label', '打开背包');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'backpack-dialog');
  button.innerHTML =
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 13V9a7 7 0 0 1 14 0v4M11 15h26l3 26H8zM16 26h16v10H16z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M17 15v6h14v-6" fill="none" stroke="currentColor" stroke-width="2"/></svg><small>背包</small>';
  document.querySelector('#battle').append(button);
  const panel = document.createElement('section');
  panel.id = 'backpack-dialog';
  panel.setAttribute('aria-labelledby', 'backpack-title');
  panel.innerHTML = html`<header>
      <div>
        <small>TRAVELLER / SUPPLIES</small>
        <h2 id="backpack-title">随身背包</h2>
      </div>
      <button id="backpack-close" aria-label="关闭背包">×</button>
    </header>
    <p>使用道具占用 1 AP，选好道具后点选场上目标。</p>
    <div id="backpack-items"></div>
    <small>预演不消耗道具；确认结算后才扣除。</small>`;
  panel.className = 'backpack-panel';
  panel.inert = true;
  document.querySelector('#battle').append(panel);
  function close() {
    panel.classList.remove('expanded');
    panel.inert = true;
    button.setAttribute('aria-expanded', 'false');
  }
  function render() {
    button.hidden = session.runtime.mode !== 'battle' || !session.ai.library.inventory.bagUnlocked;
    button.disabled = !context.viewport.canPlan();
    if (button.hidden || button.disabled) close();
    const orb = document.querySelector('#ap-orb').getBoundingClientRect();
    button.style.left = `${orb.right + (orb.width < 70 ? 8 : 12)}px`;
    button.style.bottom = `${innerHeight - orb.bottom}px`;
    button.style.setProperty('--bag-size', `${orb.width}px`);
    panel.style.left = `${orb.left}px`;
    panel.style.bottom = `${innerHeight - orb.top + 12}px`;
    if (!panel.classList.contains('expanded')) return;
    const counts = session.battle.forecast.final.items || {};
    panel.querySelector('#backpack-items').innerHTML =
      Object.values(ITEMS)
        .filter((item) => counts[item.id] > 0)
        .map(
          (item) =>
            html`<button
            class="bag-item"
            data-item="${item.id}"
            ${!counts[item.id] ? 'disabled' : ''}
          >
            <img width="64" height="64" src="${item.icon}" alt="" /
            ><span
              ><strong>${item.name} × ${counts[item.id] || 0}</strong
              ><small>${escapeText(item.text)}</small></span
            ><b>1 AP</b>
          </button>`,
        )
        .join('') || '<p class="bag-empty">背包里暂时没有道具</p>';
  }
  function choose(id) {
    const item = ITEMS[id];
    if (!item || !context.viewport.canPlan() || !(session.battle.forecast.final.items?.[id] > 0))
      return;
    const start = context.planning.preferredStart(1);
    if (!context.planning.fitsAt(start, 1))
      return context.shell.toast('先留出一个空的我方时间格。');
    context.selection.clearSelection();
    session.selection.selectedCell = start;
    session.selection.pending = { kind: 'item', item: id, target: null };
    session.selection.interactionStep = 'target';
    close();
    context.renderer.render();
    context.shell.toast(`选择${item.target === 'enemy' ? '一名敌人' : '一名队友'}使用${item.name}`);
  }
  events.on(button, 'click', () => {
    if (!context.viewport.canPlan() || !session.ai.library.inventory.bagUnlocked) return;
    if (panel.classList.contains('expanded')) return close();
    panel.classList.add('expanded');
    panel.inert = false;
    button.setAttribute('aria-expanded', 'true');
    render();
  });
  events.on(panel.querySelector('#backpack-close'), 'click', close);
  events.on(window, 'keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  events.on(panel, 'click', (event) => {
    const item = event.target.closest('[data-item]');
    if (item) choose(item.dataset.item);
  });
  return {
    render,
    close,
    dispose() {
      close();
      panel.remove();
      button.remove();
    },
  };
}
