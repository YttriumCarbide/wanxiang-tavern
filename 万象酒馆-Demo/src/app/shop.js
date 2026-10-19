import { ITEMS, buyItem } from '../content/items.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';

export function createShop(context) {
  const panel = document.createElement('dialog');
  panel.id = 'void-shop';
  panel.innerHTML = html`<header>
      <div>
        <small>THE VOID / PROVISIONS</small>
        <h2>虚空售货机</h2>
      </div>
      <button id="shop-close" aria-label="关闭商店">×</button>
    </header>
    <p>金币兑换旅途补给 · 每次使用消耗1 AP</p>
    <strong id="shop-gold"></strong>
    <div id="shop-items"></div>
    <p id="shop-status" role="status"></p>`;
  document.body.append(panel);
  function render() {
    const inventory = context.session.ai.library.inventory;
    panel.querySelector('#shop-gold').textContent = '持有金币 ' + inventory.gold;
    panel.querySelector('#shop-items').innerHTML = Object.values(ITEMS)
      .map(
        (item) =>
          html`<button data-buy="${item.id}" ${inventory.gold < item.price ? 'disabled' : ''}>
            <img width="64" height="64" src="${item.icon}" alt="" /><span
              ><strong>${item.name}</strong><small>${escapeText(item.text)}</small
              ><small>持有 ${inventory.items[item.id] || 0}</small></span
            ><b>${item.price} 金币</b>
          </button>`,
      )
      .join('');
  }
  function open() {
    if (context.session.runtime.mode !== 'inn') return;
    render();
    panel.querySelector('#shop-status').textContent = '';
    if (!panel.open) panel.showModal();
  }
  context.events.on(panel.querySelector('#shop-close'), 'click', () => panel.close());
  context.events.on(panel, 'close', () => context.onboarding.refresh());
  context.events.on(panel, 'click', (event) => {
    const button = event.target.closest('[data-buy]');
    if (!button || context.session.runtime.mode !== 'inn') return;
    const result = buyItem(context.session.ai.library, button.dataset.buy);
    panel.querySelector('#shop-status').textContent = result.ok
      ? '已购买 ' + result.item.name
      : result.message;
    if (result.ok) {
      context.generation.save();
      context.summoning.refresh();
      context.onboarding.purchased();
    }
    render();
  });
  context.events.on(window, 'message', (event) => {
    if (
      event.origin === location.origin &&
      event.source === document.querySelector('#inn-frame iframe')?.contentWindow &&
      event.data?.type === 'tavern-shop'
    )
      open();
  });
  return {
    open,
    dispose() {
      panel.remove();
    },
  };
}
