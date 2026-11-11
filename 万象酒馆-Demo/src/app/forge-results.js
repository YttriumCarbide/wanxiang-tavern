import { buyEquipment, favoriteEquipment, deleteEquipmentPlan } from '../equipment.js';
import { escapeText } from '../ui.js';
import { html } from '../shared/html.js';

/** Keep the just-created batch separate until its result sheet has been dismissed. */
export function createForgeResults(context, describe, onClose) {
  const dialog = document.createElement('dialog');
  dialog.id = 'forge-results';
  dialog.setAttribute('aria-label', '本次凝聚结果');
  document.body.append(dialog);
  let ids = [];
  const library = () => context.session.ai.library;
  function render() {
    dialog.innerHTML = html`<header>
        <div>
          <small>ETHER / NEW CREATIONS</small>
          <h2>本次凝聚</h2>
        </div>
        <button data-batch-close aria-label="收起凝聚结果">×</button>
      </header>
      <p>以太 ${library().inventory.ether} · ${ids.length}件新方案</p>
      <div class="forge-result-grid">
        ${ids
          .map((id) => {
            const item = library().equipment.catalog.find((entry) => entry.id === id);
            if (!item || library().equipment.hidden?.includes(id)) return '';
            const favorite = library().equipment.favorites?.includes(id);
            return html`<article>
              <span class="equipment-emblem">✧</span>
              <h3>${escapeText(item.name)}</h3>
              <p>${escapeText(describe(item))}</p>
              <nav>
                <button
                  data-batch-buy="${id}"
                  ${library().inventory.ether < item.price ? 'disabled' : ''}
                >
                  兑换 · ${item.price} 以太
                </button>
                <button data-batch-favorite="${id}" aria-pressed="${!!favorite}">
                  ${favorite ? '★ 已收藏' : '☆ 收藏'}
                </button>
                <button data-batch-delete="${id}">删除</button>
              </nav>
            </article>`;
          })
          .join('')}
      </div>
      <p class="forge-result-status" role="status"></p>
      <footer><button data-batch-close>完成查看</button></footer>`;
  }
  context.events.on(dialog, 'click', (event) => {
    if (event.target.closest('[data-batch-close]')) return dialog.close();
    const buy = event.target.closest('[data-batch-buy]');
    const favorite = event.target.closest('[data-batch-favorite]');
    const remove = event.target.closest('[data-batch-delete]');
    if (!buy && !favorite && !remove) return;
    try {
      if (buy) buyEquipment(library(), buy.dataset.batchBuy, crypto.randomUUID());
      if (favorite) favoriteEquipment(library(), favorite.dataset.batchFavorite);
      if (remove) deleteEquipmentPlan(library(), remove.dataset.batchDelete);
      context.generation.save();
      context.shell.renderParty();
      render();
      dialog.querySelector('[role="status"]').textContent = buy
        ? '已兑换，装备已放入背包。'
        : remove
          ? '已删除该方案，已拥有的装备保留。'
          : '收藏已保存。';
    } catch (error) {
      dialog.querySelector('[role="status"]').textContent = error.message;
    }
  });
  context.events.on(dialog, 'close', () => {
    ids = [];
    onClose();
  });
  return {
    contains: (id) => ids.includes(id),
    open(items) {
      ids = items.map((item) => item.id);
      render();
      dialog.showModal();
    },
    dispose() {
      dialog.remove();
    },
  };
}
