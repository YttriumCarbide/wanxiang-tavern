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
      <span id="shop-gold"></span><button id="shop-close" aria-label="关闭商店">×</button>
    </header>
    <nav id="shop-categories" aria-label="补给种类"></nav>
    <div class="shop-layout">
      <nav id="shop-items" aria-label="补给目录"></nav>
      <section id="shop-detail"></section>
    </div>
    <p id="shop-status" role="status"></p>`;
  document.body.append(panel);
  const categories = {
    slow: '迟缓',
    mana: '魔力',
    health: '生命',
    strength: '力量',
    recovery: '恢复',
    calamity: '灾星',
  };
  const group = (id) => id.replace(/^fine-/, '').replace(/-potion$|-scroll$/g, '');
  let category = 'slow';
  let selected = Object.keys(ITEMS)[0];
  let fromPreparation = false;
  function render() {
    const inventory = context.session.ai.library.inventory;
    panel.querySelector('#shop-gold').innerHTML = html`<img
        src="./assets/icons/gold.svg"
        alt="金币"
      /><b>${inventory.gold}</b>`;
    panel.querySelector('#shop-categories').innerHTML = Object.entries(categories)
      .map(
        ([id, name]) =>
          `<button data-shop-category="${id}" aria-pressed="${id === category}">${name}</button>`,
      )
      .join('');
    panel.querySelector('#shop-items').innerHTML = Object.values(ITEMS)
      .filter((item) => group(item.id) === category)
      .map(
        (item) =>
          html`<button data-shop-item="${item.id}" aria-pressed="${selected === item.id}">
            <img src="${item.icon}" alt="" /><strong>${item.name}</strong
            ><small>${item.price}<img src="./assets/icons/gold.svg" alt="金币" /></small>
          </button>`,
      )
      .join('');
    const item = ITEMS[selected];
    panel.querySelector('#shop-detail').innerHTML = html`<div class="shop-art">
        <span class="shop-orbit"></span><img src="${item.icon}" alt="${item.name}" />
      </div>
      <h3>${item.name}</h3>
      <p>${escapeText(item.text)}</p>
      <small class="shop-stock">背包中 ${inventory.items[item.id] || 0}</small
      ><button
        class="primary"
        data-buy="${item.id}"
        ${inventory.gold < item.price ? 'disabled' : ''}
      >
        购买 <b>${item.price}</b><img src="./assets/icons/gold.svg" alt="金币" />
      </button>`;
  }
  function open({ preparation = false } = {}) {
    if (
      context.session.runtime.mode !== 'inn' &&
      !(preparation && document.querySelector('#party-panel').open)
    )
      return;
    fromPreparation = preparation;
    render();
    panel.querySelector('#shop-status').textContent = '';
    if (!panel.open) panel.showModal();
  }
  context.events.on(panel.querySelector('#shop-close'), 'click', () => panel.close());
  context.events.on(panel, 'close', () => {
    context.onboarding.refresh();
    context.equipment.refresh();
    context.shell.renderParty();
  });
  context.events.on(panel, 'click', (event) => {
    const tab = event.target.closest('[data-shop-category]');
    if (tab) {
      category = tab.dataset.shopCategory;
      selected = Object.keys(ITEMS).find((id) => group(id) === category);
      render();
      context.audio.play('select');
      return;
    }
    const pick = event.target.closest('[data-shop-item]');
    if (pick) {
      selected = pick.dataset.shopItem;
      render();
      context.audio.play('select');
      return;
    }
    const button = event.target.closest('[data-buy]');
    if (
      !button ||
      (context.session.runtime.mode !== 'inn' &&
        !(fromPreparation && document.querySelector('#party-panel').open))
    )
      return;
    const result = buyItem(context.session.ai.library, button.dataset.buy);
    if (!result.ok) {
      panel.querySelector('#shop-status').textContent = result.message;
      context.audio.play('error');
      return;
    }
    context.generation.save();
    context.summoning.refresh();
    context.onboarding.purchased();
    render();
    context.audio.play('exchange');
    const feedback = panel.querySelector('#shop-status');
    feedback.innerHTML = html`<img src="${result.item.icon}" alt="" /> ${result.item.name}
      <b>+1</b>`;
    feedback.animate(
      [
        { opacity: 0, translate: '0 12px' },
        { opacity: 1, translate: '0 0' },
      ],
      { duration: 300, easing: 'ease-out' },
    );
    panel.querySelector('.shop-art img').animate(
      [
        { transform: 'scale(.8) rotate(-12deg)', filter: 'brightness(2)' },
        { transform: 'scale(1.08) rotate(6deg)', offset: 0.6 },
        { transform: 'scale(1) rotate(0)', filter: 'brightness(1)' },
      ],
      { duration: 500 },
    );
    panel.querySelector('.shop-stock').animate(
      [
        { color: '#f8df91', scale: '1.1' },
        { color: '#9fbaa9', scale: '1' },
      ],
      { duration: 650 },
    );
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
