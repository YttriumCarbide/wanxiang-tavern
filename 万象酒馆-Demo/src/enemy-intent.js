import { BUFFS } from './data.js';
import { html } from './shared/html.js';
import { icon } from './ui.js';

/** Only formats numbers and statuses from the shared engine's preview events. */
export function enemyIntentBadge(data) {
  if (data.cancelled) return html`<span class="intent-cancelled" aria-label="行动取消">×</span>`;
  const targets = data.targets || [];
  const hit = targets.filter((target) => target.id);
  const damage = [...new Set(hit.map((target) => target.damage))].join(' / ') || '0';
  const statuses = new Map();
  for (const status of [
    ...hit.flatMap((target) => target.buffs || []),
    ...(data.selfBuffs || []),
  ]) {
    if (!statuses.has(status.key)) statuses.set(status.key, new Set());
    statuses.get(status.key).add(status.value);
  }
  return html`<span class="enemy-intent-impact">
    <span class="intent-damage" aria-label="预计伤害 ${damage}">
      <svg class="intent-sword" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m15 3 6-1-1 6-9 9-4-4z" fill="#e8d8ad" stroke="#a99566" stroke-width="1.2" />
        <path
          d="m6 12 6 6M8 16l-5 5M2 19l3 3"
          stroke="#c6aa6c"
          stroke-width="2.5"
          stroke-linecap="round"
        /></svg
      ><b>${damage}</b>
    </span>
    ${[...statuses].map(([key, values]) => html`<span class="intent-buff" data-buff="${key}" aria-label="${BUFFS[key]?.name || '护盾'} +${[...values].join('/')}">${icon(key)}<b>${[...values].join('/')}</b></span>`).join('')}
  </span>`;
}
