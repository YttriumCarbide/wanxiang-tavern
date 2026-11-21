import { tavernPromotion } from '../daily.js';
import { recordJourneyActivity } from '../memory.js';

export function mountTavernPromotion({ promotion, events, library, state, save }) {
  function renderPromotion() {
    const progress = tavernPromotion(state(), library().workshop);
    const shiftPct = Math.min(100, Math.round((Math.min(progress.shifts, 2) / 2) * 100));
    const corePct = Math.min(100, Math.round((Math.min(progress.cores, 10) / 10) * 100));
    promotion.innerHTML = `<header class="promo-header">
        <div class="promo-seal" aria-hidden="true"><span>${progress.rank}</span><small>阶</small></div>
        <div class="promo-title">
          <small>GUILD CHARTER · 酒馆勋阶</small>
          <h2>酒馆 · ${progress.rank} 阶</h2>
        </div>
        <button type="button" data-promotion-close aria-label="关闭">×</button>
      </header>
      ${
        progress.rank === 0
          ? `<div class="promo-milestones">
              <div class="promo-row" data-done="${progress.shifts >= 2}">
                <div class="promo-row-meta">
                  <span class="promo-mark">${progress.shifts >= 2 ? '◆' : '◇'}</span>
                  <span>完成营业</span>
                  <b>${Math.min(progress.shifts, 2)} / 2</b>
                </div>
                <div class="promo-meter"><i style="width:${shiftPct}%"></i></div>
              </div>
              <div class="promo-row" data-done="${progress.cores >= 10}">
                <div class="promo-row-meta">
                  <span class="promo-mark">${progress.cores >= 10 ? '◆' : '◇'}</span>
                  <span>持有工坊机芯</span>
                  <b>${Math.min(progress.cores, 10)} / 10</b>
                </div>
                <div class="promo-meter"><i style="width:${corePct}%"></i></div>
              </div>
            </div>
            <footer class="promo-foot">
              <button type="button" class="daily-confirm promo-confirm" data-promotion-confirm ${progress.ready ? '' : 'disabled'}>${progress.ready ? '授予 1 阶勋印' : '升至 1 阶'}</button>
            </footer>`
          : '<p class="promo-max-note">已达当前版本最高勋阶，下一阶目标待开放。</p>'
      }`;
  }
  events.on(promotion, 'click', (event) => {
    if (event.target.closest('[data-promotion-close]')) promotion.close();
    if (
      event.target.closest('[data-promotion-confirm]') &&
      tavernPromotion(state(), library().workshop).ready
    ) {
      state().rank++;
      recordJourneyActivity(library(), 'promotion', '酒馆升至 ' + state().rank + ' 阶');
      save();
      renderPromotion();
    }
  });
  return renderPromotion;
}
