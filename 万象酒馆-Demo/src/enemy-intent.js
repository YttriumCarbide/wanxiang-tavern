import { BUFFS } from './data.js';
import { html } from './shared/html.js';
import { icon, escapeText } from './ui.js';

/** Only formats numbers and statuses from the shared engine's preview events. */
export function enemyIntentBadge(data) {
  if (data.cancelled) return html`<span class="intent-cancelled" aria-label="行动取消">×</span>`;
  const targets = data.targets || [];
  const hit = targets.filter((target) => target.id);
  const statusMarkup = (statuses) =>
    statuses
      .map(
        ({ key, value }) =>
          html`<span
            class="intent-buff"
            data-buff="${key}"
            aria-label="${BUFFS[key]?.name || '护盾'} +${value}"
            >${icon(key)}<b>${value}</b></span
          >`,
      )
      .join('');
  const damage = [...hit]
    .sort((a, b) => a.slot - b.slot)
    .map(
      (target) =>
        html`<span
          class="intent-target"
          aria-label="${escapeText(target.name || '目标')}预计伤害 ${target.damage}"
          ><b>${target.damage}</b>${statusMarkup(target.buffs || [])}</span
        >`,
    )
    .join('<span class="intent-divider" aria-hidden="true">/</span>');
  return html`<span class="enemy-intent-impact">
    <span class="intent-damage" aria-label="逐目标预计伤害">
      <svg class="intent-sword" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m15 3 6-1-1 6-9 9-4-4z" fill="#e8d8ad" stroke="#a99566" stroke-width="1.2" />
        <path
          d="m6 12 6 6M8 16l-5 5M2 19l3 3"
          stroke="#c6aa6c"
          stroke-width="2.5"
          stroke-linecap="round"
        /></svg
      >${damage || '<b>0</b>'}
    </span>
    ${data.selfBuffs?.length || data.selfHeal || data.selfMana ? html`<span class="intent-self"><small>自身</small>${statusMarkup(data.selfBuffs || [])}${data.selfHeal ? `<span>生命＋${data.selfHeal}</span>` : ''}${data.selfMana ? `<span>法力＋${data.selfMana}</span>` : ''}</span>` : ''}
  </span>`;
}
