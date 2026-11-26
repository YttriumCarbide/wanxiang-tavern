import { icon } from './buff-art.js';
export { icon };
import { html } from './shared/html.js';
import { createEventScope } from './shared/events.js';
import { BUFFS } from './data.js';
import { effectiveBuff } from './engine.js';
import { definition } from './catalog.js';
import { damageTypeIcon, damageTypeMeta } from './damage-types.js';
import { isPlagueSealed, sinkingPlagueFrontDamage } from './overlord-mechanics.js';

export const escapeText = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Return a compact display name (e.g. '西莉卡·梵·拉普斯' -> '西莉卡') for tight UI slots. */
export function shortCharacterName(name) {
  const text = String(name || '').trim();
  if (!text) return '';
  if (text.includes('·')) {
    const first = text.split('·')[0].trim();
    if (first) return first;
  }
  return text;
}

function statusSources(events, target, buff) {
  const sources = [];
  for (const event of events) {
    for (const application of event.statusApplications || []) {
      if (application.target !== target || application.buff !== buff) continue;
      const actor = definition(event.after, application.actor)?.name;
      sources.push(`${actor ? `${actor} · ` : ''}${application.source}（+${application.value}层）`);
    }
  }
  return sources.length ? `\n来源：${sources.join('、')}` : '';
}

export function statusIcons(s, id, end = s, events = []) {
  let markupString = '';
  const chip = (
    key,
    value,
    future,
    text,
    label = key === 'shield' ? '护盾' : BUFFS[key]?.name,
    consuming = false,
  ) =>
    html`<span
      class="buff-icon ${future ? 'future-buff' : 'current-buff'} ${consuming ? 'consuming-buff' : ''}"
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
        b.name,
        after < now,
      );
    if (after > now)
      markupString += chip(
        k,
        after - now,
        true,
        `预计新增 ${b.name} ${after - now}\n结算后共 ${after}层${statusSources(events, id, k)}\n${b.text}`,
      );
    // A round-local status can expire before final state, while its queued effect still matters.
    if (k === 'bind' && !now && !after && events.some((event) => event.after.units[id]?.buffs.bind))
      markupString += chip(k, 1, true, `预计禁锢：本回合生效，结束解除\n${b.text}`);
  }
  const plagueField = s.sinkingPlague || end.sinkingPlague;
  const side = s.units[id]?.side;
  if (side === 'hero' && plagueField) {
    const floor = s.formation.indexOf(id);
    const futureFloor = end.formation.indexOf(id);
    const dmg = sinkingPlagueFrontDamage(end.sinkingPlague ? end : s, 0);
    const sealedNow = isPlagueSealed(s, id);
    const sealedEnd = isPlagueSealed(end, id);
    const streakNow = s.sinkingPlague?.frontStreak?.[id] || 0;
    const streakEnd = end.sinkingPlague?.frontStreak?.[id] ?? streakNow;
    const isFuture = !s.sinkingPlague && Boolean(end.sinkingPlague);
    if (sealedNow || sealedEnd) {
      const releasedAfter = sealedNow && !sealedEnd;
      markupString += html`<span
        class="buff-icon ${sealedNow ? 'current-buff' : 'future-buff'} ${releasedAfter ? 'consuming-buff' : ''} plague-sealed"
        data-buff="sinkingPlague"
        data-plague-sealed="1"
        data-count="封"
        tabindex="0"
        data-tooltip="${escapeText(
          `沉疫封锁（禁盾 · 禁疗 · 禁回蓝）\n已在前场连续承受 2 回合沉疫；回合末全队同等承受 ${dmg} 伤害。\n${releasedAfter ? '预计换入后场后立刻解除封锁！' : '调回后场可立刻解除封锁！'}`,
        )}"
        aria-label="沉疫封锁"
        >${icon('sinkingPlague')}<b>封</b></span
      >`;
    } else if ((floor >= 0 && floor < 3) || (futureFloor >= 0 && futureFloor < 3)) {
      const displayStreak = Math.max(streakNow, streakEnd);
      const countText = `${displayStreak}/2`;
      markupString += chip(
        'sinkingPlague',
        countText,
        isFuture,
        `沉疫 · 前场侵染（连续 ${displayStreak}/2 回合）\n回合末全队前后排同等承受 ${dmg} 伤害；在前场连续承受 2 回合将触发【沉疫封锁】（禁盾/禁疗/禁回蓝，退回后场立刻解除）。`,
        '沉疫',
      );
    } else if (futureFloor >= 3 || floor >= 3) {
      markupString += chip(
        'sinkingPlague',
        dmg,
        isFuture,
        `沉疫 · 后场承伤\n回合末前后排同等承受 ${dmg} 伤害；留在后场可清除并免疫【沉疫封锁】。`,
        '沉疫·后场',
      );
    }
  }
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
      const shieldPct = max ? Math.min(100, (nowBlock / max) * 100) : 0;
      const forecastShieldPct = max ? Math.min(100, (endBlock / max) * 100) : 0;
      const nowPct = max ? Math.min(100, Math.max(0, (now / max) * 100)) : 0;
      const endPct = max ? Math.min(100, Math.max(0, (end / max) * 100)) : 0;
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
        ><i style="width:${nowPct}%"></i><em style="width:${endPct}%"></em>${
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

export function enemyBreakBar(d, u, f = u, activeDamageType = null) {
  if (!u || u.side !== 'enemy') return '';
  if (u.broken) {
    return html`<span
      class="enemy-break-rail is-broken"
      data-tooltip="${escapeText(
        '破防失衡（BREAK）· 本回合行动已取消，受到直接伤害提高 50%（下回合恢复行动）',
      )}"
      tabindex="0"
      aria-label="破防失衡"
      ><svg class="break-shatter-crest" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2L4 7v5.5c0 4.8 3.4 8.7 8 10 4.6-1.3 8-5.2 8-10V7l-8-5zm-1.2 4.3L9.3 11l3.6 1.5-2.1 5.4 1.4.5 2.6-6.7-3.4-1.4 1.1-3.6-1.7-.4z"
          fill="currentColor"
        /></svg
      ><span class="break-broken-label">BREAK · 受伤+50%</span></span
    >`;
  }
  const bw = u.breakWindow;
  const archivedTypes = Array.isArray(u.collectorArchivedTypes) ? u.collectorArchivedTypes : [];
  if (!bw?.active || !(bw.max > 0)) {
    if (d?.collectorMechanic && archivedTypes.length > 0) {
      const excluded = archivedTypes.slice(0, 4);
      const pillsHtml = excluded
        .map((w) => {
          const meta = damageTypeMeta(w);
          const hitRejected = Boolean(activeDamageType && activeDamageType === w);
          return html`<span
            class="enemy-weakness-pill is-crossed is-rejected ${hitRejected ? 'is-matched' : ''}"
            style="--dmg-color:${meta.color};--dmg-glow:${meta.glow}"
            data-weakness="${w}"
            data-weakness-tier="collected"
            data-tooltip="已收录拒收：${escapeText(meta.name)}（伤害-40%、0削韧且触发以太铳反击）"
            >${damageTypeIcon(w, { size: 14, tint: false })}<i
              class="weakness-cross"
              aria-hidden="true"
              >×</i
            ></span
          >`;
        })
        .join('');
      const names = excluded.map((w) => damageTypeMeta(w).name).join(' / ');
      const tip = `馆藏拒收（常规回合）：以下打叉属性（${names}）命中伤害-40%并触发以太铳反击；其余属性正常造成伤害。`;
      return html`<span
        class="enemy-break-rail is-collector-archive"
        data-break-mode="collector-archive"
        data-tooltip="${escapeText(tip)}"
        tabindex="0"
        aria-label="馆藏拒收属性"
        ><span class="break-mode-tag">拒收</span><i class="break-sep" aria-hidden="true"></i
        ><span class="enemy-weakness-row" aria-label="已收录拒收属性">${pillsHtml}</span></span
      >`;
    }
    return '';
  }
  const maxT = Math.max(1, Number(bw.max) || 1);
  const nowT = Math.max(0, Math.min(maxT, Number(bw.current) || 0));
  const fBw = f?.breakWindow;
  const willBreak = Boolean(f?.broken);
  const endT = willBreak
    ? 0
    : fBw?.active
      ? Math.max(0, Math.min(maxT, Number(fBw.current) || 0))
      : nowT;
  const forecastLoss = Math.max(0, nowT - endT);
  const gap = maxT === 1 ? 0 : Math.min(7, 16 / maxT);
  const arc = Math.max(4, 100 / maxT - gap);
  const degStep = 360 / maxT;
  const halfGapDeg = (gap / 100) * 180;
  const segmentsHtml = Array.from({ length: maxT }, (_, idx) => {
    const filled = idx < nowT;
    const losing = filled && idx >= endT;
    const rot = (idx * degStep - 90 + halfGapDeg).toFixed(2);
    return html`<circle
      class="break-seg ${filled ? 'is-filled' : 'is-spent'} ${losing ? 'is-forecast-loss' : ''}"
      cx="20"
      cy="20"
      r="15.5"
      pathLength="100"
      stroke-dasharray="${arc.toFixed(2)} ${(100 - arc).toFixed(2)}"
      transform="rotate(${rot} 20 20)"
    />`;
  }).join('');
  const ringHtml = html`<span class="break-ring ${willBreak ? 'will-break' : ''}"
    ><svg viewBox="0 0 40 40" aria-hidden="true">${segmentsHtml}</svg
    ><b>${willBreak ? '✦' : nowT}</b></span
  >`;

  if (bw.mode === 'plain') {
    const anyMatched = Boolean(
      activeDamageType && activeDamageType !== 'support' && activeDamageType !== 'unknown',
    );
    const tip = `普通破绽（${nowT}/${maxT}）：本回合限时出现，任意直接伤害命中削减 1 格\n敌方行动后立即关闭；归零触发 BREAK：取消本回合剩余行动且受伤 +50%${
      forecastLoss > 0 ? `\n预计本轮削减 ${forecastLoss} 格${willBreak ? ' → 破防失衡！' : ''}` : ''
    }`;
    return html`<span
      class="enemy-break-rail is-plain ${willBreak ? 'will-break' : ''} ${forecastLoss > 0 ? 'has-forecast' : ''} ${anyMatched ? 'is-matched' : ''}"
      data-break-mode="plain"
      data-tooltip="${escapeText(tip)}"
      tabindex="0"
      aria-label="普通破绽 ${nowT}/${maxT}"
      >${ringHtml}<span class="break-mode-tag">${willBreak ? 'BREAK' : '破绽'}</span></span
    >`;
  }

  if (bw.mode === 'collector') {
    const collected = Array.isArray(bw.collectedTypes) ? bw.collectedTypes : [];
    const used = Array.isArray(bw.usedTypes) ? bw.usedTypes : [];
    const excluded = [...new Set([...collected, ...used])].slice(0, 4);
    const activeValid = Boolean(
      activeDamageType && activeDamageType !== 'support' && activeDamageType !== 'unknown',
    );
    const isRejected = activeValid && collected.includes(activeDamageType);
    const isUsedRound = activeValid && !isRejected && used.includes(activeDamageType);
    const anyMatched = activeValid && !isRejected && !isUsedRound;
    const excludedPills = excluded
      .map((w) => {
        const meta = damageTypeMeta(w);
        const rejectedFlag = collected.includes(w);
        const rejectedHit = Boolean(activeDamageType && activeDamageType === w);
        return html`<span
          class="enemy-weakness-pill is-crossed ${rejectedFlag ? 'is-rejected' : 'is-used-round'} ${rejectedHit ? 'is-matched' : ''}"
          style="--dmg-color:${meta.color};--dmg-glow:${meta.glow}"
          data-weakness="${w}"
          data-weakness-tier="${rejectedFlag ? 'collected' : 'used'}"
          data-tooltip="${
            rejectedFlag
              ? `已收录拒收：${escapeText(meta.name)}（伤害-40%、0削韧且触发以太铳反击）`
              : `本回合已削韧：${escapeText(meta.name)}（同一属性每回合仅限削韧 1 次）`
          }"
          >${damageTypeIcon(w, { size: 14, tint: false })}<i
            class="weakness-cross"
            aria-hidden="true"
            >×</i
          ></span
        >`;
      })
      .join('');
    const collectedNames = collected.length
      ? collected.map((w) => damageTypeMeta(w).name).join(' / ')
      : '暂无';
    const usedNames = used.length ? used.map((w) => damageTypeMeta(w).name).join(' / ') : '暂无';
    const tip = `馆藏破绽（${nowT}/${maxT}）· 除去打叉属性外，其余任意属性均视为有效破绽！\n有效新属性：伤害 +35% 且双倍削韧（-2 格，同属性每回合限 1 次）\n已收录拒收（-40%伤+反击）：${collectedNames}\n本回合已触发过削韧：${usedNames}${
      forecastLoss > 0 ? `\n预计本轮削减 ${forecastLoss} 格${willBreak ? ' → 破防失衡！' : ''}` : ''
    }`;
    return html`<span
      class="enemy-break-rail is-collector ${willBreak ? 'will-break' : ''} ${forecastLoss > 0 ? 'has-forecast' : ''} ${anyMatched ? 'is-matched' : ''} ${isRejected ? 'is-rejected-hover' : ''}"
      data-break-mode="collector"
      data-tooltip="${escapeText(tip)}"
      tabindex="0"
      aria-label="馆藏破绽 ${nowT}/${maxT}"
      >${ringHtml}<span class="break-mode-tag">${willBreak ? 'BREAK' : '非×-2'}</span
      >${excludedPills ? '<i class="break-sep" aria-hidden="true"></i>' : ''}<span
        class="enemy-weakness-row"
        aria-label="除外属性"
        >${excludedPills}</span
      ></span
    >`;
  }

  const major = bw.majorWeakness;
  const minors = Array.isArray(bw.minorWeaknesses) ? bw.minorWeaknesses : [];
  const majorMeta = major ? damageTypeMeta(major) : null;
  const majorMatched = Boolean(major && activeDamageType && activeDamageType === major);
  const majorHtml = major
    ? html`<span
        class="enemy-weakness-pill is-major ${majorMatched ? 'is-matched' : ''}"
        style="--dmg-color:${majorMeta.color};--dmg-glow:${majorMeta.glow}"
        data-weakness="${major}"
        data-weakness-tier="major"
        data-tooltip="大弱点：${escapeText(majorMeta.name)}（命中直接削减 2 格破绽）"
        >${damageTypeIcon(major, { size: 12, tint: false })}<i class="weakness-mult">-2</i></span
      >`
    : '';
  const minorsHtml = minors
    .map((w) => {
      const meta = damageTypeMeta(w);
      const matched = Boolean(activeDamageType && activeDamageType === w);
      return html`<span
        class="enemy-weakness-pill is-minor ${matched ? 'is-matched' : ''}"
        style="--dmg-color:${meta.color};--dmg-glow:${meta.glow}"
        data-weakness="${w}"
        data-weakness-tier="minor"
        data-tooltip="小弱点：${escapeText(meta.name)}（命中削减 1 格破绽）"
        >${damageTypeIcon(w, { size: 11, tint: !matched })}</span
      >`;
    })
    .join('');

  const minorNames = minors.map((w) => damageTypeMeta(w).name).join(' / ');
  const tip = `特殊破绽（${nowT}/${maxT}）· ${d?.name || ''}本回合暴露破绽！\n金色大弱点：${majorMeta?.name || '无'}（命中 -2 格）${
    minorNames ? `\n小弱点：${minorNames}（命中 -1 格）` : ''
  }\n对应招式放出后破绽立即消失；打空触发 BREAK 取消本回合后续行动且本回合受伤 +50%${
    forecastLoss > 0 ? `\n预计本轮削减 ${forecastLoss} 格${willBreak ? ' → 破防失衡！' : ''}` : ''
  }`;
  return html`<span
    class="enemy-break-rail is-special ${willBreak ? 'will-break' : ''} ${forecastLoss > 0 ? 'has-forecast' : ''}"
    data-break-mode="special"
    data-tooltip="${escapeText(tip)}"
    tabindex="0"
    aria-label="特殊破绽 ${nowT}/${maxT}"
    >${ringHtml}<i class="break-sep" aria-hidden="true"></i
    ><span class="enemy-weakness-row" aria-label="破绽弱点">${majorHtml}${minorsHtml}</span></span
  >`;
}

export function alchemicalBombBadge(unitId, state, forecastState = null, playing = false) {
  const activeBomb =
    state?.activeAlchemicalBomb?.target === unitId ? state.activeAlchemicalBomb : null;
  const pendingBomb =
    !activeBomb && !playing && forecastState?.pendingAlchemicalBomb?.target === unitId
      ? forecastState.pendingAlchemicalBomb
      : null;
  const bomb = activeBomb || pendingBomb;
  if (!bomb) return '';
  const sec = Number(bomb.durationSec) || 40;
  const tip = activeBomb
    ? `定时炼金炸弹 · 需在 ${sec} 秒内确认结算\n超时将在本尊身上引爆高额伤害并强制结束回合`
    : '先制预警 · 本回合将被投掷炼金怀表炸弹（下回合开始倒计时）';
  return html`<span
    class="alchemical-bomb-badge ${activeBomb ? 'is-active' : 'is-pending'}"
    data-bomb-target="${escapeText(unitId)}"
    data-tooltip="${escapeText(tip)}"
    aria-label="${escapeText(tip)}"
    ><svg viewBox="0 0 24 24" class="bomb-watch-ico" aria-hidden="true">
      <circle cx="12" cy="13.5" r="7" fill="#23182a" stroke="#f0c368" stroke-width="1.8" />
      <path
        d="M9.5 3.5h5M12 3.5v3M12 13.5l2.8-2.2"
        stroke="#f5dd9d"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <circle cx="17.5" cy="6.2" r="2.1" fill="#6bf5a9" /></svg
    >${
      activeBomb ? html`<b data-bomb-readout="${escapeText(unitId)}">${sec.toFixed(1)}s</b>` : ''
    }</span
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
    if (!el) return;
    if (el === anchor && !tip.hidden) {
      place(e.clientX, e.clientY);
      return;
    }
    show(el, e.clientX, e.clientY);
  });
  events.on(document, 'pointermove', (e) => {
    if (anchor && !tip.hidden) place(e.clientX, e.clientY);
  });
  events.on(document, 'pointerout', (e) => {
    if (!anchor) return;
    const next = e.relatedTarget?.closest?.('[data-tooltip]');
    if (next && next !== anchor) return;
    if (!anchor.contains(e.relatedTarget)) {
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
