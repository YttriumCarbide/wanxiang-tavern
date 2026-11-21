import { html } from './shared/html.js';
import { escapeText } from './ui.js';
import { enemyIntentBadge } from './enemy-intent.js';

export function createBattleIntentLayer({ intentLayer, records, enemyRecords, project, viewport }) {
  let intentData = null;
  let renderedIntent = '';
  function clearHints() {
    intentData = null;
    renderedIntent = '';
    intentLayer?.replaceChildren();
    records.forEach((r) => r.el.classList.remove('drop-target', 'drop-incoming'));
  }

  function renderIntent() {
    if (!intentLayer) return;
    if (!intentData) {
      if (renderedIntent) intentLayer.replaceChildren();
      renderedIntent = '';
      return;
    }
    const markupString = intentData.map(intentMarkup).join('');
    if (renderedIntent !== markupString) {
      intentLayer.innerHTML = markupString;
      renderedIntent = markupString;
    }
  }

  function intentMarkup(data) {
    const { width, height } = viewport();
    const r = enemyRecords.find((r) => r.id === data.id);
    if (!r) return '';
    const xy = (x, y, z) => {
        const p = project(x, y, z);
        return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height };
      },
      origin = xy(r.root.position.x, r.root.position.y + 0.4, r.root.position.z + 1.14),
      head = xy(r.root.position.x, r.root.position.y + 0.38, r.root.position.z - 1.28);
    const badge = html`<section
      class="enemy-intent-summary"
      data-enemy-intent="${data.id}"
      style="left:${head.x}px;top:${head.y - 8}px;--intent-width:${Math.max(86, Math.min(178, r.el.offsetWidth + 16))}px"
      aria-label="${escapeText(data.name)}的行动预演"
    >
      ${enemyIntentBadge(data)}
    </section>`;
    let markupString;
    if (data.cancelled) {
      markupString = badge;
    } else {
      let paths = '';
      for (const t of data.targets) {
        const target = xy([-3.014, 0, 3.014][t.slot], 0.5, 2.345 - 1.2),
          bend = origin.x + (target.x - origin.x) * 0.5 + (target.x === origin.x ? 30 : 0),
          midY = (origin.y + target.y) / 2;
        paths += html`<path
          class="intent-path"
          data-intent-enemy="${data.id}"
          data-intent-slot="${t.slot}"
          data-target="${t.id}"
          d="M ${origin.x.toFixed(1)} ${origin.y.toFixed(1)} Q ${bend.toFixed(1)} ${midY.toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}"
          marker-end="url(#intent-arrow-tip-${data.id})"
        />`;
      }
      markupString = html`<svg
          class="intent-arrows"
          viewBox="0 0 ${width} ${height}"
          aria-label="${escapeText(data.move)}"
        >
          <defs>
            <marker
              id="intent-arrow-tip-${data.id}"
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0L6 3L0 6z" fill="#ffe2a1" />
            </marker>
          </defs>
          ${paths}</svg
        >${badge}`;
    }
    return markupString;
  }
  function showIntent(data) {
    intentData = data;
    renderIntent();
  }
  return { clearHints, renderIntent, showIntent };
}
