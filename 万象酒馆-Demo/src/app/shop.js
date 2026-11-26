import { ITEMS } from '../content/items.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { INGREDIENTS } from '../content/dining.js';
import { diningState, ingredientSalePrice } from '../dining.js';
import { foodArt } from './food-art.js';
import { cityServiceArt } from './city-service-art.js';
import { commitCityTrade } from './city-trade.js';

export function createShop(context) {
  const panel = document.createElement('dialog');
  panel.id = 'void-shop';
  panel.className = 'city-service-dialog';
  panel.setAttribute('aria-labelledby', 'market-title');
  panel.innerHTML = html`<header>
      <h2 id="market-title">市场</h2>
      <span id="shop-gold"></span><button id="shop-close" aria-label="关闭市场">×</button>
    </header>
    <section id="market-surface" class="market-surface" aria-label="食材市场">
      <nav id="market-items" class="market-stalls" aria-label="食材货架"></nav>
      <section id="market-counter" class="market-counter" aria-label="市场柜台"></section>
    </section>
    <section id="supply-surface" class="supply-surface">
      <nav id="shop-categories" aria-label="补给种类"></nav>
      <div class="shop-machine">
        <nav id="shop-items" aria-label="药剂货道"></nav>
        <section id="shop-detail" aria-label="药剂取货区"></section>
      </div>
    </section>
    <p id="shop-status" role="status"></p>`;
  document.body.append(panel);
  const categories = {
    slow: '迟缓',
    mana: '魔力',
    health: '生命',
    strength: '力量',
    recovery: '恢复',
    calamity: '灾星',
    artifact: '人工制品',
    confusion: '混乱',
    blind: '致盲',
    cleanse: '净化',
    flying: '飞行',
  };
  const isPotion = (id) => id?.endsWith('-potion') === true;
  const itemsForMode = () => Object.values(ITEMS);
  const group = (id) => id.replace(/^fine-/, '').replace(/-potion$|-scroll$/g, '');
  let category = 'slow';
  let selected = Object.keys(ITEMS)[0];
  let mode = 'vending';
  let returnToKitchen = false;
  let view = 0;
  let ingredient = null;
  const categoryRail = panel.querySelector('#shop-categories');
  const marketSurface = panel.querySelector('#market-surface');
  const marketItemsNode = panel.querySelector('#market-items');
  const marketCounter = panel.querySelector('#market-counter');
  const supplySurface = panel.querySelector('#supply-surface');
  const supplyItems = panel.querySelector('#shop-items');
  const supplyDetail = panel.querySelector('#shop-detail');

  function render() {
    const inventory = context.session.ai.library.inventory;
    panel.querySelector('#shop-gold').innerHTML = html`<img
        src="./assets/icons/gold.svg"
        alt="金币"
      /><b>${inventory.gold}</b>`;
    if (mode === 'market') {
      const state = diningState(context.session.ai.library);
      const marketItems = [
        ...state.stock
          .filter((stock) => Object.hasOwn(INGREDIENTS, stock.id))
          .map((stock) => ({ ...stock, carried: false })),
        ...Object.values(INGREDIENTS)
          .filter(
            (food) =>
              state.inventory[food.id] > 0 && !state.stock.some((stock) => stock.id === food.id),
          )
          .map((food) => ({ id: food.id, left: 0, carried: true })),
      ];
      if (!marketItems.some(({ id }) => id === ingredient)) ingredient = marketItems[0]?.id;
      marketItemsNode.innerHTML = marketItems.length
        ? marketItems
            .map(({ id, left, carried }) => {
              const food = INGREDIENTS[id];
              const price = carried ? ingredientSalePrice(id) : food.price;
              return html`<button
                type="button"
                class="market-stall"
                data-food-select="${id}"
                aria-pressed="${id === ingredient}"
              >
                <span class="market-stall-art">${foodArt(food)}</span>
                <span class="market-stall-info">
                  <strong>${food.name}</strong>
                  <small>${carried ? '行囊持有 ' + state.inventory[id] : '今日余量 ' + left}</small>
                </span>
                <span class="market-stall-price"
                  >${carried ? '回收 ' : ''}${price}<img src="./assets/icons/gold.svg" alt="金币"
                /></span>
              </button>`;
            })
            .join('')
        : '<p class="market-empty">当前暂无食材。</p>';
      const food = INGREDIENTS[ingredient];
      const left = state.stock.find(({ id }) => id === ingredient)?.left || 0;
      const salePrice = ingredientSalePrice(food?.id);
      const carried = food ? state.inventory[food.id] || 0 : 0;
      marketCounter.hidden = !food;
      marketCounter.innerHTML = food
        ? html`<div class="market-counter-item">
              <span class="market-counter-art">${foodArt(food)}</span>
              <div class="market-counter-info">
                <h3>${food.name}</h3>
                <p>${escapeText(food.note || '可带回后厨烹制本日膳食的严选食材。')}</p>
                <small class="shop-stock"
                  >行囊 ${state.inventory[food.id] || 0} · 今日余量 ${left}</small
                >
              </div>
            </div>
            <div class="market-counter-actions">
              <button
                class="primary"
                data-food-buy="${food.id}"
                ${left && inventory.gold >= food.price && !context.session.runtime.cityTrade ? '' : 'disabled'}
              >
                购买 <b>${food.price}</b><img src="./assets/icons/gold.svg" alt="金币" />
              </button>
              ${
                carried > 0
                  ? html`<button
                      data-food-sell="${food.id}"
                      ${context.session.runtime.cityTrade ? 'disabled' : ''}
                    >
                      出售 <b>${salePrice}</b><img src="./assets/icons/gold.svg" alt="金币" />
                    </button>`
                  : ''
              }
              ${
                returnToKitchen && ['buy', 'cook'].includes(state.tutorial)
                  ? '<button data-food-dine>准备饭菜</button>'
                  : ''
              }
            </div>`
        : '';
      panel.querySelector('#shop-status').textContent =
        state.tutorial === 'buy' ? '购买乡村面包与奶酪。' : '';
      return;
    }
    const itemsForSale = itemsForMode();
    if (!itemsForSale.some((item) => group(item.id) === category))
      category = group(itemsForSale[0].id);
    if (!itemsForSale.some((item) => item.id === selected && group(item.id) === category))
      selected = itemsForSale.find((item) => group(item.id) === category).id;
    const categoryScroll = categoryRail.scrollTop;
    const itemScroll = supplyItems.scrollTop;
    categoryRail.innerHTML = Object.entries(categories)
      .filter(([id]) => itemsForSale.some((item) => group(item.id) === id))
      .map(([id, name]) => {
        const item = itemsForSale.find((entry) => group(entry.id) === id);
        return html`<button
          type="button"
          data-shop-category="${id}"
          aria-pressed="${id === category}"
        >
          <img src="${item.icon}" alt="" /><span>${name}</span>
        </button>`;
      })
      .join('');
    categoryRail.scrollTop = categoryScroll;
    supplyItems.innerHTML = itemsForSale
      .filter((item) => group(item.id) === category)
      .map(
        (item) =>
          html`<button data-shop-item="${item.id}" aria-pressed="${selected === item.id}">
            <span class="shop-row-art"><img src="${item.icon}" alt="" /></span>
            <span class="shop-row-info">
              <strong>${item.name}</strong>
              <span class="shop-row-sub">持有 ${inventory.items[item.id] || 0}</span>
            </span>
            <small>${item.price}<img src="./assets/icons/gold.svg" alt="金币" /></small>
          </button>`,
      )
      .join('');
    supplyItems.scrollTop = itemScroll;
    const item = ITEMS[selected];
    supplyDetail.innerHTML = html`<div class="shop-art">
        <span class="shop-orbit"></span><img src="${item.icon}" alt="${item.name}" />
      </div>
      <h3>${item.name}</h3>
      <p>${escapeText(item.text)}</p>
      <small class="shop-stock">行囊持有 ${inventory.items[item.id] || 0}</small>
      <div class="shop-detail-actions">
        <button
          class="primary"
          data-buy="${item.id}"
          ${inventory.gold < item.price || context.session.runtime.cityTrade ? 'disabled' : ''}
        >
          购买 <b>${item.price}</b><img src="./assets/icons/gold.svg" alt="金币" />
        </button>
      </div>`;
  }
  function open({ preparation = false, ingredients = false, cityId, vendingMachine = false } = {}) {
    if (
      context.session.runtime.mode !== 'inn' &&
      !(preparation && document.querySelector('#party-panel').open)
    )
      return;
    const city = cityServiceArt(cityId, context.daily?.scene?.());
    mode = vendingMachine
      ? 'vending'
      : cityId || ingredients
        ? 'market'
        : preparation
          ? 'preparation'
          : 'vending';
    returnToKitchen = mode === 'market' && ingredients && !cityId;
    panel.dataset.shopMode = mode;
    const title =
      mode === 'market'
        ? `${city.name} · 市场`
        : mode === 'preparation'
          ? '战前补给'
          : '药剂售货机';
    panel.querySelector('#market-title').textContent = title;
    const isMarket = mode === 'market';
    marketSurface.hidden = !isMarket;
    supplySurface.hidden = isMarket;
    categoryRail.hidden = isMarket;
    if (isMarket) {
      categoryRail.replaceChildren();
      supplyItems.replaceChildren();
      supplyDetail.replaceChildren();
    } else {
      marketItemsNode.replaceChildren();
      marketCounter.replaceChildren();
      const isPreparation = mode === 'preparation';
      supplyItems.setAttribute('aria-label', isPreparation ? '战前补给' : '药剂货道');
      supplyDetail.setAttribute('aria-label', isPreparation ? '补给详情' : '药剂取货区');
    }
    panel.querySelector('#shop-close').setAttribute('aria-label', `关闭${title}`);
    panel.style.setProperty('--market-scene', `url("${new URL(city.market, document.baseURI)}")`);
    ++view;
    panel.querySelector('#shop-status').textContent = '';
    if (mode === 'vending') category = 'slow';
    render();
    categoryRail.scrollTop = 0;
    supplyItems.scrollTop = 0;
    if (!panel.open) panel.showModal();
  }
  context.events.on(panel.querySelector('#shop-close'), 'click', () => panel.close());
  context.events.on(panel, 'close', () => {
    context.onboarding.refresh();
    context.equipment.refresh();
    context.shell.renderParty();
    context.dining?.refresh();
  });
  context.events.on(panel, 'click', async (event) => {
    const at = view;
    const current = () => panel.open && at === view;
    if (returnToKitchen && event.target.closest('[data-food-dine]')) {
      panel.close();
      context.dining.open();
      return;
    }
    const selectedFood = event.target.closest('[data-food-select]');
    if (selectedFood && mode === 'market') {
      ingredient = selectedFood.dataset.foodSelect;
      render();
      panel
        .querySelector('[data-food-select][aria-pressed="true"]')
        ?.focus({ preventScroll: true });
      return;
    }
    const food = event.target.closest('[data-food-buy]');
    if (food) {
      if (mode !== 'market' || food.disabled || context.session.runtime.mode !== 'inn') return;
      food.disabled = true;
      try {
        await commitCityTrade(context, 'ingredient', food.dataset.foodBuy);
        if (!current()) return;
        context.audio.play('exchange');
        render();
        panel.querySelector('#shop-status').textContent =
          `${INGREDIENTS[food.dataset.foodBuy].name} +1 · 已放入背包`;
      } catch (failure) {
        if (!current()) return;
        render();
        panel.querySelector('#shop-status').textContent = failure.message;
      }
      if (current() && ingredient === food.dataset.foodBuy)
        panel.querySelector('[data-food-buy]')?.focus({ preventScroll: true });
      return;
    }
    const sale = event.target.closest('[data-food-sell]');
    if (sale && mode === 'market' && !sale.disabled && context.session.runtime.mode === 'inn') {
      const id = sale.dataset.foodSell;
      sale.disabled = true;
      try {
        const result = await commitCityTrade(context, 'ingredientSale', id);
        if (!current()) return;
        render();
        context.audio.play('exchange');
        panel.querySelector('#shop-status').textContent =
          `${result.item.name} −1 · 金币 +${result.gold}`;
      } catch (failure) {
        if (!current()) return;
        render();
        panel.querySelector('#shop-status').textContent = failure.message;
        context.audio.play('error');
      }
      if (ingredient === id) {
        const sellAgain = panel.querySelector('[data-food-sell]:enabled');
        const selectedRow = panel.querySelector('[data-food-select][aria-pressed="true"]');
        (sellAgain || selectedRow)?.focus({ preventScroll: true });
      } else if (!panel.contains(document.activeElement)) {
        panel
          .querySelector('[data-food-select][aria-pressed="true"]')
          ?.focus({ preventScroll: true });
      }
      return;
    }
    const tab = event.target.closest('[data-shop-category]');
    if (tab && mode !== 'market') {
      category = tab.dataset.shopCategory;
      selected = Object.keys(ITEMS).find((id) => group(id) === category) || selected;
      render();
      supplyItems.scrollTop = 0;
      categoryRail.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
      context.audio.play('select');
      return;
    }
    const pick = event.target.closest('[data-shop-item]');
    if (pick && mode !== 'market') {
      selected = pick.dataset.shopItem;
      render();
      panel.querySelector('[data-shop-item][aria-pressed="true"]')?.focus({ preventScroll: true });
      context.audio.play('select');
      return;
    }
    const button = event.target.closest('[data-buy]');
    if (
      !button ||
      button.disabled ||
      mode === 'market' ||
      (context.session.runtime.mode !== 'inn' &&
        !(mode === 'preparation' && document.querySelector('#party-panel').open))
    )
      return;
    button.disabled = true;
    let result;
    try {
      result = await commitCityTrade(context, 'item', button.dataset.buy);
    } catch (failure) {
      if (current()) {
        render();
        panel.querySelector('#shop-status').textContent = failure.message;
        context.audio.play('error');
      }
      return;
    }
    if (mode === 'vending' || isPotion(result.item.id)) context.onboarding.purchased();
    if (!current()) return;
    render();
    if (selected === result.item.id)
      panel.querySelector('[data-buy]')?.focus({ preventScroll: true });
    context.audio.play('exchange');
    const feedback = panel.querySelector('#shop-status');
    feedback.innerHTML = html`<img src="${result.item.icon}" alt="" /> ${result.item.name}
      <b>+1</b>`;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
        { color: '#b9aa90', scale: '1' },
      ],
      { duration: 650 },
    );
  });
  return {
    open,
    close() {
      panel.close();
    },
    dispose() {
      panel.remove();
    },
  };
}
