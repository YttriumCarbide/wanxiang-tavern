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
  panel.setAttribute('aria-label', '背包道具');
  panel.innerHTML = '<div id="backpack-items"></div>';
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
    panel.style.left = `${Math.max(12, Math.min(orb.left, innerWidth - panel.offsetWidth - 12))}px`;
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
            data-tooltip="${escapeText(item.name + '\n' + item.text + '\n1 AP · ' + (item.target === 'enemy' ? '敌方单体' : '我方单体'))}"
            aria-label="${item.name}，持有${counts[item.id]}"
            ${!counts[item.id] ? 'disabled' : ''}
          >
            <img width="64" height="64" src="${item.icon}" alt="" /
            ><span>${item.name}</span><b class="bag-count">${counts[item.id]}</b>
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
  const flights = new Set();
  async function playItem(event) {
    const item = ITEMS[event.skill];
    if (event.type !== 'item' || !item || session.runtime.disposed) return;
    const from = button.getBoundingClientRect();
    const images = event.targets.map((id) => {
      const target = document.querySelector(`[data-unit="${id}"], [data-rear="${id}"]`);
      if (!target) return null;
      const to = target.getBoundingClientRect();
      const image = document.createElement('img');
      image.className = 'item-projectile';
      image.src = item.icon;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.style.setProperty('--item-color', item.color);
      document.querySelector('#battle').append(image);
      const x0 = from.left + from.width / 2 - 32;
      const y0 = from.top + from.height / 2 - 32;
      const dx = to.left + to.width / 2 - 32 - x0;
      const dy = to.top + to.height / 2 - 32 - y0;
      const arc = Math.min(240, Math.max(85, Math.abs(dx) * 0.24 + Math.abs(dy) * 0.18));
      const frames = Array.from({ length: 25 }, (_, index) => {
        const t = index / 24;
        return {
          transform: `translate(${x0 + dx * t}px, ${y0 + dy * t - 4 * arc * t * (1 - t)}px) rotate(${-30 + 570 * t}deg) scale(${0.65 + 0.45 * Math.sin(t * Math.PI)})`,
          opacity: t > 0.92 ? (1 - t) / 0.08 : 1,
        };
      });
      if (matchMedia('(prefers-reduced-motion: reduce)').matches)
        frames.splice(
          0,
          frames.length,
          { transform: `translate(${x0 + dx}px, ${y0 + dy}px)`, opacity: 1 },
          { transform: `translate(${x0 + dx}px, ${y0 + dy}px)`, opacity: 0 },
        );
      const animation = image.animate(frames, {
        duration: 700 / session.battle.speed,
        easing: 'cubic-bezier(.25,.05,.65,1)',
        fill: 'forwards',
      });
      const flight = { image, animation };
      flights.add(flight);
      return animation.finished
        .catch(() => {})
        .finally(() => {
          flights.delete(flight);
          image.remove();
        });
    });
    await Promise.all(images);
  }
  events.on(button, 'click', () => {
    if (!context.viewport.canPlan() || !session.ai.library.inventory.bagUnlocked) return;
    if (panel.classList.contains('expanded')) return close();
    panel.classList.add('expanded');
    panel.inert = false;
    button.setAttribute('aria-expanded', 'true');
    render();
  });
  events.on(document, 'pointerdown', (event) => {
    if (!panel.contains(event.target) && !button.contains(event.target)) close();
  });
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
    playItem,
    dispose() {
      for (const { image, animation } of flights) {
        animation.cancel();
        image.remove();
      }
      flights.clear();
      close();
      panel.remove();
      button.remove();
    },
  };
}
