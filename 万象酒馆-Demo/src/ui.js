import { icon } from './buff-art.js';
export { icon };
import { html } from './shared/html.js';
import { createEventScope } from './shared/events.js';
import { BUFFS } from './data.js';
import { effectiveBuff } from './engine.js';
import { definition } from './catalog.js';
import { damageTypeIcon, damageTypeMeta } from './damage-types.js';
import { resolveEnemyBreakProfile, revealedWeaknessesFor } from './octopath.js';

export const escapeText = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function statusIcons(s, id, end = s, events = []) {
  let markupString = '';
  const chip = (key, value, future, text, label = key === 'shield' ? '护盾' : BUFFS[key]?.name) =>
    html`<span
      class="buff-icon ${future ? 'future-buff' : 'current-buff'}"
      data-buff="${key}"
      data-count="${value}"
      tabindex="0"
      data-tooltip="${escapeText(text)}"
      aria-label="${future ? '预计新增' : ''}${escapeText(label || key)}${value}"
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
  const floor = s.formation.indexOf(id);
  const futureFloor = end.formation.indexOf(id);
  const plague = floor >= 0 && floor < 3 ? s.sinkingPlague?.ages[floor] : undefined;
  const futurePlague =
    futureFloor >= 0 && futureFloor < 3 ? end.sinkingPlague?.ages[futureFloor] : undefined;
  if (plague !== undefined || futurePlague !== undefined)
    markupString += chip(
      'sinkingPlague',
      (plague ?? futurePlague) + 1,
      plague === undefined,
      `沉疫 · 地板效果\n下次回合结束受到${((plague ?? futurePlague) + 1) * 2}伤害。换人不清除，后场不受伤害；空位与后撤期间仍累计回合。`,
      '沉疫',
    );
  const mark = definition(s, id)?.mechanicMark;
  const modifier = s.expeditionModifiers?.[id] || end.expeditionModifiers?.[id];
  if (modifier?.scale < 1)
    markupString += chip(
      'mark',
      Math.round((1 - modifier.scale) * 100),
      !s.expeditionModifiers?.[id],
      `灵核代价：hp/sp上限、普攻与技能伤害减少${Math.round((1 - modifier.scale) * 100)}%，仅本次探索有效。`,
      '灵核代价',
    );
  if (s.units[id]?.nextBasicDouble || end.units[id]?.nextBasicDouble)
    markupString += chip(
      'strength',
      2,
      !s.units[id]?.nextBasicDouble,
      '持节立阵：下次普通攻击伤害翻倍；毅明反击也会消耗。',
      '下次普攻翻倍',
    );
  if (mark) {
    const now = s.units[id]?.mark || 0;
    const after = end.units[id]?.mark || 0;
    const label = mark.name || '标记';
    const maximum = mark.max || 3;
    const markIcon = mark.icon || 'mark';
    const countText = (count) => (mark.uncapped ? `${count}层` : `${count}/${maximum}`);
    if (now > 0)
      markupString += chip(
        markIcon,
        now,
        false,
        `${label} ${countText(now)}${now !== after ? `\n预计结算后 ${countText(after)}` : ''}\n本场战斗内积累与消耗，下场清空。`,
        label,
      );
    if (after > now)
      markupString += chip(
        markIcon,
        after - now,
        true,
        `预计新增 ${label} ${after - now}\n结算后共 ${countText(after)}`,
        label,
      );
  }
  return markupString;
}
export function resourceBars(u, f = u) {
  const nowBlock = Math.max(0, Number(u.block) || 0);
  const endBlock = Math.max(0, Number(f.block) || 0);
  return (u.maxMp > 0 ? ['hp', 'mp'] : ['hp'])
    .map((k) => {
      const max = k === 'hp' ? u.maxHp : u.maxMp,
        label = k === 'hp' ? '生命' : '蓝量',
        now = u[k],
        end = f[k],
        shieldLabel =
          k === 'hp' && (nowBlock > 0 || endBlock > 0)
            ? `\n护盾 ${nowBlock}${nowBlock !== endBlock ? ` -> 预计 ${endBlock}` : ''}`
            : '',
        text = `${label} ${now}/${max}${now !== end ? `\n预计 ${end}/${max}` : ''}${shieldLabel}`;
      const shieldPct = max ? Math.min(1, nowBlock / max) * 100 : 0;
      const forecastShieldPct = max ? Math.min(1, endBlock / max) * 100 : 0;
      const shieldMarkup =
        k === 'hp'
          ? nowBlock > 0
            ? html`<span class="bar-shield-text">（${nowBlock}）</span>`
            : endBlock > 0
              ? html`<span class="bar-shield-text is-forecast">（+${endBlock}）</span>`
              : ''
          : '';
      return html`<span
        class="bar ${k} ${now !== end || (k === 'hp' && nowBlock !== endBlock) ? 'forecast' : ''}"
        tabindex="0"
        role="meter"
        aria-label="${label}"
        aria-valuenow="${now}"
        aria-valuemin="0"
        aria-valuemax="${max || 1}"
        data-tooltip="${text}"
        ><i style="width:${max ? (now / max) * 100 : 0}%"></i
        ><em style="width:${max ? (end / max) * 100 : 0}%"></em>${
          k === 'hp' && (nowBlock > 0 || endBlock > 0)
            ? html`<span class="bar-shield-fill" style="width:${shieldPct}%"></span
                ><span
                  class="bar-shield-forecast ${nowBlock !== endBlock ? 'active' : ''}"
                  style="width:${forecastShieldPct}%"
                ></span>`
            : ''
        }<b class="resource-number">${now}/${max}${shieldMarkup}</b></span
      >`;
    })
    .join('');
}

export function enemyToughnessBadge(u, f = u) {
  if (!u || u.side !== 'enemy') return '';
  const maxT = Math.max(1, Number(u.maxToughness) || 1);
  const nowT = Math.max(0, Number(u.toughness ?? maxT) || 0);
  const endT = Math.max(0, Number(f?.toughness ?? nowT) || 0);
  const broken = Boolean(u.broken);
  const willBreak = !broken && Boolean(f?.broken);
  const forecast = willBreak || endT !== nowT;
  const tip = broken
    ? `击破晕眩中 · 行动已跳过（恢复后韧性 ${maxT}）`
    : `韧性 ${nowT}/${maxT}：命中弱点削减1点，归零将击破并跳过剩余及下一回合行动${
        forecast ? `\n预计结算后 ${willBreak ? '击破' : endT}` : ''
      }`;
  return html`<span
    class="enemy-toughness-badge ${broken ? 'is-broken' : ''} ${forecast ? 'forecast' : ''} ${willBreak ? 'will-break' : ''}"
    data-tooltip="${escapeText(tip)}"
    tabindex="0"
    aria-label="${broken ? '击破晕眩' : `韧性 ${nowT}`}"
    ><svg class="toughness-crest" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="${
          broken
            ? 'M12 2L4 7v6c0 4.6 3.4 8.6 8 9.8 4.6-1.2 8-5.2 8-9.8V7l-8-5zm-1.4 4.2L9.2 11l3.6 1.5-2.1 5.3 1.4.4 2.5-6.6-3.4-1.4 1.1-3.6-1.7-.4z'
            : 'M12 2L4 7v6c0 4.6 3.4 8.6 8 9.8 4.6-1.2 8-5.2 8-9.8V7l-8-5z'
        }"
        fill="currentColor"
      /></svg
    ><b>${broken ? '破' : nowT}</b
    >${forecast ? html`<em>${willBreak ? '破' : endT}</em>` : ''}</span
  >`;
}

export function enemyWeaknessRow(d, u, revealedMap, activeDamageType = null) {
  if (!d || u?.side !== 'enemy') return '';
  const profile = resolveEnemyBreakProfile(d);
  const weaknesses =
    Array.isArray(u.weaknesses) && u.weaknesses.length ? u.weaknesses : profile.weaknesses;
  const revealed = revealedWeaknessesFor(revealedMap, d);
  return html`<span class="enemy-weakness-row" aria-label="敌方弱点"
    >${weaknesses
      .map((w) => {
        const known = revealed.includes(w);
        const matched = known && activeDamageType && activeDamageType === w;
        const meta = damageTypeMeta(known ? w : 'unknown');
        return html`<span
          class="enemy-weakness-pill ${known ? 'is-revealed' : 'is-unknown'} ${matched ? 'is-matched' : ''}"
          style="--dmg-color:${meta.color};--dmg-glow:${meta.glow}"
          data-weakness="${known ? w : 'unknown'}"
          title="${known ? `弱点：${meta.name}` : '未知弱点（用对应属性攻击后解锁）'}"
          >${damageTypeIcon(known ? w : 'unknown', { size: 11, tint: !matched })}</span
        >`;
      })
      .join('')}</span
  >`;
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
