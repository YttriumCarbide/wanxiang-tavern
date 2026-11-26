import { escapeText } from '../ui.js';

const RARE_KEYS = new Set(['limit', 'skill1Sp', 'skill2Sp']);

function deltaMarkup(row) {
  if (!row.delta) return '';
  if (row.key === 'skill1Sp' || row.key === 'skill2Sp') {
    return `<span class="fe-stat-delta is-rare">✦ −${row.delta} SP</span>`;
  }
  if (row.key === 'limit') {
    return `<span class="fe-stat-delta is-rare">★ +${row.delta}</span>`;
  }
  return `<span class="fe-stat-delta">▲ +${row.delta}</span>`;
}

function tierTagText(levelUp) {
  const rows = levelUp.rows || [];
  const hasRare = rows.some((row) => row.delta && RARE_KEYS.has(row.key));
  const hitCount = levelUp.hitCount ?? rows.filter((row) => row.delta).length;
  if (levelUp.promoted) return `阶位突破 · ${escapeText(levelUp.rank || '')}`;
  if (hasRare || hitCount >= 5) return '✦ 神成长';
  if (hitCount >= 4) return '◆ 跃进成长';
  return '稳步成长';
}

/**
 * Render a Fire Emblem-style heraldic Level-Up Stat Showcase inside `.dialogue-bonuses` or `.gal-bonuses`.
 * Keeps `+` delta markers inside child elements for accessibility and browser assertions.
 */
export function renderLevelUpPanel(container, levelUp, fallbackBonuses = []) {
  if (!container) return;
  if (!levelUp) {
    container.classList.remove('fe-level-host');
    container.replaceChildren(
      ...(fallbackBonuses || []).map((bonus, index) => {
        const badge = container.ownerDocument.createElement('span');
        badge.textContent = bonus;
        badge.animate(
          [
            { opacity: 0, translate: '0 15px' },
            { opacity: 1, translate: '0 0' },
          ],
          { duration: 380, delay: index * 100, fill: 'backwards' },
        );
        return badge;
      }),
    );
    return;
  }

  container.classList.add('fe-level-host');
  const rows = levelUp.rows || [];
  const hasJackpot = rows.some((row) => row.delta && RARE_KEYS.has(row.key));
  const prev = levelUp.previousLevel ?? Math.max(1, (levelUp.level || 2) - 1);
  let dingOrder = 0;
  const rowsHtml = rows
    .map((row) => {
      const up = Boolean(row.delta);
      const rare = up && RARE_KEYS.has(row.key);
      const orderAttr = up ? ` style="--ding-order:${dingOrder++}"` : '';
      const valText = up
        ? `${escapeText(row.before)} → ${escapeText(row.after)}`
        : escapeText(row.after);
      return `<div class="fe-stat-row${up ? ' is-up' : ''}${rare ? ' is-rare' : ''}" data-stat-key="${escapeText(row.key)}"${orderAttr}>
        <span class="fe-stat-name">${escapeText(row.label)}</span>
        <span class="fe-stat-val">${valText}</span>
        ${deltaMarkup(row)}
      </div>`;
    })
    .join('');

  const ribbonLabel = levelUp.promoted
    ? `✦ 阶位晋升 · ${escapeText(levelUp.rank || '')} ✦`
    : '✦ LEVEL UP ✦';

  container.innerHTML = `<div class="fe-level-burst" aria-hidden="true">
      <span class="fe-burst-rays"></span>
      <span class="fe-burst-glow"></span>
    </div>
    <section class="fe-level-card" data-promoted="${Boolean(levelUp.promoted)}" data-jackpot="${hasJackpot}">
      <header class="fe-level-head">
        <div class="fe-level-top">
          <span class="fe-level-ribbon">${ribbonLabel}</span>
          ${levelUp.name ? `<span class="fe-level-name">${escapeText(levelUp.name)}</span>` : ''}
        </div>
        <div class="fe-level-meta">
          <strong class="fe-level-lv">Lv.${prev} → Lv.${levelUp.level}</strong>
          <em class="fe-level-tier">${tierTagText(levelUp)}</em>
        </div>
      </header>
      <div class="fe-stat-grid">${rowsHtml}</div>
    </section>`;
}
