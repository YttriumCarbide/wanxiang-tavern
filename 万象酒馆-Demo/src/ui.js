import { icon } from './buff-art.js';
export { icon };
import { html } from './shared/html.js';
import { createEventScope } from './shared/events.js';
import { BUFFS } from './data.js';
import { effectiveBuff } from './engine.js';

export const escapeText = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function statusIcons(s, id, end = s, events = []) {
  let markupString = '';
  const chip = (key, value, future, text) =>
    html`<span
      class="buff-icon ${future ? 'future-buff' : 'current-buff'}"
      data-buff="${key}"
      data-count="${value}"
      tabindex="0"
      data-tooltip="${escapeText(text)}"
      aria-label="${future ? '预计新增' : ''}${key === 'shield' ? '护盾' : BUFFS[key].name}${value}"
      >${icon(key)}<b>${future ? '+' : ''}${value}</b></span
    >`;
  for (const k of Object.keys(BUFFS)) {
    const now = effectiveBuff(s, id, k),
      after = effectiveBuff(end, id, k),
      b = BUFFS[k];
    if (now > 0)
      markupString += chip(
        k,
        now,
        false,
        `${b.name} ${now}${now !== after ? `\n预计结算后 ${after}` : ''}\n${b.text}`,
      );
    if (after > now)
      markupString += chip(
        k,
        after - now,
        true,
        `预计新增 ${b.name} ${after - now}\n结算后共 ${after}层\n${b.text}`,
      );
    // A round-local status can expire before final state, while its queued effect still matters.
    if (k === 'bind' && !now && !after && events.some((event) => event.after.units[id]?.buffs.bind))
      markupString += chip(k, 1, true, `预计禁锢：本回合生效，结束解除\n${b.text}`);
  }
  return markupString;
}
export function resourceBars(u, f = u) {
  const shield =
    u.block || f.block
      ? html`<span
          class="resource-shield ${u.block !== f.block ? 'forecast' : ''}"
          data-tooltip="${escapeText(`护盾 ${u.block}：优先抵挡伤害${u.block !== f.block ? `\n预计结算后 ${f.block}` : ''}`)}"
          tabindex="0"
          aria-label="护盾 ${u.block}${u.block !== f.block ? `，预计${f.block}` : ''}"
          >${icon('shield')}<b>${u.block}</b>${u.block !== f.block ? html`<em>${f.block}</em>` : ''}</span
        >`
      : '';
  return (
    shield +
    (u.maxMp > 0 ? ['hp', 'mp'] : ['hp'])
      .map((k) => {
        const max = k === 'hp' ? u.maxHp : u.maxMp,
          label = k === 'hp' ? '生命' : '蓝量',
          now = u[k],
          end = f[k],
          text = `${label} ${now}/${max}${now !== end ? `\n预计 ${end}/${max}` : ''}`;
        return html`<span
          class="bar ${k} ${now !== end ? 'forecast' : ''}"
          tabindex="0"
          role="meter"
          aria-label="${label}"
          aria-valuenow="${now}"
          aria-valuemin="0"
          aria-valuemax="${max || 1}"
          data-tooltip="${text}"
          ><i style="width:${max ? (now / max) * 100 : 0}%"></i
          ><em style="width:${max ? (end / max) * 100 : 0}%"></em
          ><b class="resource-number">${now}/${max}</b></span
        >`;
      })
      .join('')
  );
}

export function mountTooltips() {
  const events = createEventScope();
  const tip = document.createElement('div');
  tip.id = 'hover-tooltip';
  tip.role = 'tooltip';
  tip.hidden = true;
  document.body.append(tip);
  let anchor = null;
  const place = (x, y) => {
    tip.style.left = `${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, x + 15))}px`;
    tip.style.top = `${Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, y + 15))}px`;
  };
  const show = (el, x, y) => {
    anchor = el;
    tip.textContent = el.dataset.tooltip;
    tip.hidden = false;
    place(x, y);
  };
  events.on(document, 'pointerover', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (el) show(el, e.clientX, e.clientY);
  });
  events.on(document, 'pointermove', (e) => {
    if (anchor && !tip.hidden) place(e.clientX, e.clientY);
  });
  events.on(document, 'pointerout', (e) => {
    if (anchor && !anchor.contains(e.relatedTarget)) {
      anchor = null;
      tip.hidden = true;
    }
  });
  events.on(document, 'focusin', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (el) {
      const r = el.getBoundingClientRect();
      show(el, r.left, r.bottom);
    }
  });
  events.on(document, 'focusout', () => {
    anchor = null;
    tip.hidden = true;
  });
  events.on(document, 'pointerdown', () => {
    tip.hidden = true;
  });
  return () => {
    events.dispose();
    tip.remove();
  };
}
