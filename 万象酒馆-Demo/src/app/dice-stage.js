import { dcOutcomeLabel, formatMod } from '../dc.js';
import {
  applyDcPenalty,
  buildDcDisplayCheck,
  formatDcEffectSummary,
  settleDcReward,
} from '../dc-rp.js';
import { escapeText } from '../ui.js';
import { activeModal, createPopoverSurface } from '../shared/top-layer.js';

const PIPS = Object.freeze({
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
});

const FACE_ROT = Object.freeze({
  1: [0, 0],
  2: [90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [-90, 0],
  6: [0, 180],
});

function pipGridMarkup(face, extraClass = '') {
  return (PIPS[face] || PIPS[1])
    .map(
      (idx) =>
        `<i class="pip ${extraClass}" style="grid-area:${Math.floor(idx / 3) + 1} / ${(idx % 3) + 1}"></i>`,
    )
    .join('');
}

export function dieMarkup(value, skin, delay, spin, extraClass = '', dur = 1500) {
  const [rx, ry] = FACE_ROT[value] || FACE_ROT[1];
  const faces = [1, 2, 3, 4, 5, 6]
    .map((face) => `<div class="die-face f${face}">${pipGridMarkup(face)}</div>`)
    .join('');
  const ease =
    skin === 'arcane' ? 'cubic-bezier(0.3, 0.4, 0.2, 1)' : 'cubic-bezier(0.14, 0.72, 0.24, 1)';
  return `<div class="die-wrap skin-${skin} ${extraClass}" role="img" aria-label="骰子 ${value} 点">
    <div class="die-tilt">
      <div class="die-cube tumble" style="--rx:${rx}deg;--ry:${ry}deg;--sx:${spin[0]}deg;--sy:${spin[1]}deg;--sz:${spin[2]}deg;--delay:${delay}ms;--dur:${dur}ms;--ease:${ease}">${faces}</div>
    </div>
  </div>`;
}

function sparksMarkup(count, className = 'ev-spark') {
  return Array.from({ length: count }, (_, idx) => {
    const ang = ((idx * 360) / count).toFixed(1);
    const dist = 46 + (idx % 3) * 26;
    return `<i class="${className}" style="--ang:${ang}deg;--dist:${dist}px;--dl:${(idx % 4) * 35}ms" aria-hidden="true"></i>`;
  }).join('');
}

function slotDieMarkup(value, delay) {
  const sequence = [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, value];
  const cells = sequence
    .map((face) => `<div class="gl-fd-cell f${face}">${pipGridMarkup(face)}</div>`)
    .join('');
  const endOffset = `calc(-${sequence.length - 1} * var(--fd-size, 64px))`;
  return `<div class="gl-fd" style="--dl:${delay}ms;--end:${endOffset}" role="img" aria-label="骰子 ${value} 点">
    <div class="gl-fd-win"><div class="gl-fd-strip">${cells}</div></div>
    ${sparksMarkup(8, 'gl-spark')}
  </div>`;
}

const DC_ATTR_NODES = Object.freeze([
  { key: 'str', name: '力量', g: '力' },
  { key: 'dex', name: '敏捷', g: '敏' },
  { key: 'con', name: '体质', g: '体' },
  { key: 'int', name: '智力', g: '智' },
  { key: 'wis', name: '感知', g: '感' },
  { key: 'cha', name: '魅力', g: '魅' },
]);

const FR_CENTER = 290;
const frPt = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [+(FR_CENTER + r * Math.cos(a)).toFixed(2), +(FR_CENTER + r * Math.sin(a)).toFixed(2)];
};
const frPoly = (r, start, n) =>
  Array.from({ length: n }, (_, i) => frPt(r, start + (i * 360) / n).join(',')).join(' ');

const FREE_GLYPH_DURATION = 1450;
const FREE_GLYPH_STAGGER = 42;
const FREE_CIRCLE_LEAD = 220;
const MAX_FLYING_GLYPHS = 64;

function freeGlyphChars(actionText) {
  return [...String(actionText || '命运检定')].slice(0, 22);
}

function buildGlyphMarkup(items, duration) {
  return items
    .map(
      ({ ch, sx, sy, mx, my, ex, ey, delay }) =>
        `<span class="fr-glyph" style="--sx:${sx}px;--sy:${sy};--mx:${mx}px;--my:${my}px;--ex:${ex}px;--ey:${ey}px;--dl:${delay}ms;--flight:${duration}ms"><i>${escapeText(ch)}</i></span>`,
    )
    .join('');
}

function freeCircleMarkup(actionText, attrIndex = 0) {
  const chars = freeGlyphChars(actionText);
  const glyphs = buildGlyphMarkup(
    chars.map((ch, idx) => {
      const sx = +((idx - (chars.length - 1) / 2) * 14).toFixed(1);
      const sy = (idx % 3) * 10;
      const angle = ((idx * 360) / Math.max(1, chars.length)) * (Math.PI / 180);
      return {
        ch,
        sx,
        sy: `calc(var(--dc-glyph-origin, 140px) + ${sy}px)`,
        mx: (Math.cos(angle + 0.9) * 62).toFixed(1),
        my: (Math.sin(angle + 0.9) * 38).toFixed(1),
        ex: (Math.cos(angle) * 12).toFixed(1),
        ey: (Math.sin(angle) * 12).toFixed(1),
        delay: FREE_CIRCLE_LEAD + idx * FREE_GLYPH_STAGGER,
      };
    }),
    FREE_GLYPH_DURATION,
  );
  const [bx, by] = frPt(160, attrIndex * 60);
  const nodesMarkup = DC_ATTR_NODES.map((node, i) => {
    const [x, y] = frPt(190, i * 60);
    return `<g class="fr-node" data-fr-node="${i}"><circle cx="${x}" cy="${y}" r="26" /><text x="${x}" y="${y}">${node.g}</text></g>`;
  }).join('');
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  return `<div class="fr-circle">
    <svg viewBox="0 0 580 580" aria-hidden="true">
      <defs>
        <path id="fr-rp" d="M290,290 m-238,0 a238,238 0 1,1 476,0 a238,238 0 1,1 -476,0" />
        <radialGradient id="fr-core">
          <stop offset="0" stop-color="#8fa0ff" stop-opacity="0.55" />
          <stop offset="1" stop-color="#8fa0ff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="290" cy="290" r="200" fill="url(#fr-core)" />
      <g class="fr-rot" fill="none" stroke="#e9cd86">
        <circle cx="290" cy="290" r="276" stroke-width="2.5" />
        <circle cx="290" cy="290" r="266" stroke-width="1" stroke-dasharray="2 10" />
        <circle cx="290" cy="290" r="222" stroke-width="1.5" />
        <text class="fr-runes" fill="#e9cd86" stroke="none">
          <textPath href="#fr-rp" textLength="1480" lengthAdjust="spacing">${runes + runes}</textPath>
        </text>
      </g>
      <g class="fr-rot rev" fill="none" stroke="#b9c2ff" stroke-width="1.5">
        <polygon points="${frPoly(190, 0, 3)}" />
        <polygon points="${frPoly(190, 180, 3)}" />
        <circle cx="290" cy="290" r="110" />
        <circle cx="290" cy="290" r="100" stroke-dasharray="14 8" />
        <polygon points="${frPoly(100, 45, 4)}" stroke-width="1" />
      </g>
      <polygon points="${frPoly(190, 0, 6)}" fill="none" stroke="#e9cd86" stroke-width="1" opacity="0.6" />
      <line class="fr-beam" pathLength="1" x1="${bx}" y1="${by}" x2="290" y2="290" hidden />
      ${nodesMarkup}
    </svg>
    <div class="fr-glyphs">${glyphs}</div>
  </div>`;
}

function eventDiceMarkup(displayCheck) {
  const [d0, d1] = displayCheck.dice || [3, 4];
  return `<div class="ev-die d0" style="--dl:0ms">
      <div class="ev-shadow"></div>
      <div class="ev-fall">${dieMarkup(d0, 'ivory', 0, [1260, -720, 360], '', 1500)}</div>
      <div class="ev-impact first"></div>
      <div class="ev-impact"></div>
      <div class="ev-pop">${d0}</div>
    </div>
    <div class="ev-die d1" style="--dl:140ms">
      <div class="ev-shadow"></div>
      <div class="ev-fall">${dieMarkup(d1, 'ivory', 140, [-1080, 900, -360], '', 1500)}</div>
      <div class="ev-impact first"></div>
      <div class="ev-impact"></div>
      <div class="ev-pop">${d1}</div>
    </div>`;
}

function eventStageMarkup(displayCheck, modText) {
  return `<div class="ev-arena"><div class="ev-ground"></div></div>
  <div class="ev-check-tag">2D6 ${escapeText(modText)} · 目标 DC ${displayCheck.dc}</div>`;
}

function freeStageMarkup(displayCheck, actionText) {
  const [d0, d1] = displayCheck.dice || [3, 4];
  const attrIdx = Math.max(
    0,
    DC_ATTR_NODES.findIndex(
      (n) => n.key === displayCheck.attr || n.name === displayCheck.attrLabel,
    ),
  );
  return `<div class="fr-banner">
      <small data-fr-kicker>CIRCLE OF FATE</small>
      <b data-fr-verdict>……</b>
    </div>
    <div class="fr-stage">
      ${freeCircleMarkup(actionText, attrIdx)}
      <div class="fr-fx" aria-hidden="true"></div>
      <div class="fr-dice" hidden>
        <div class="fr-die-pos"><div>${dieMarkup(d0, 'arcane', 0, [720, -540, -360], 'wire', 1950)}</div></div>
        <div class="fr-die-pos"><div>${dieMarkup(d1, 'arcane', 80, [-720, 540, 360], 'wire', 1950)}</div></div>
      </div>
    </div>`;
}

function galStageMarkup(displayCheck, modText) {
  const [d0, d1] = displayCheck.dice || [3, 4];
  const segMax = Math.max(14, displayCheck.dc + 2, displayCheck.total);
  const targetPct = Math.min(96, Math.max(8, Math.round((displayCheck.dc / segMax) * 100)));
  const segs = Array.from({ length: segMax }, (_, idx) => {
    const fill = idx < displayCheck.total ? 'fill' : '';
    const over = idx < displayCheck.total && idx >= displayCheck.dc - 1 ? 'over' : '';
    return `<i class="dc-seg ${fill} ${over}"></i>`;
  }).join('');
  const outcome = displayCheck.outcome || 'success';
  const label = displayCheck.label || dcOutcomeLabel(outcome);

  return `<div class="gl-band">
    <div class="gl-speed" aria-hidden="true"></div>
    <div class="gl-band-inner">
      <svg class="gl-crest" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="2" />
        <polygon points="32,8 52,44 12,44" stroke="currentColor" stroke-width="1.8" />
        <circle cx="32" cy="32" r="6" fill="currentColor" />
      </svg>
      <div class="gl-fd-row">
        ${slotDieMarkup(d0, 0)}
        ${slotDieMarkup(d1, 130)}
      </div>
      <div class="gl-total-col">
        <div class="gl-total">${displayCheck.total}</div>
        <div class="gl-eq-line">${d0} + ${d1} ${escapeText(modText)} vs DC ${displayCheck.dc}</div>
      </div>
      <div class="gl-gauge-col">
        <div class="gl-gauge">
          <div class="dc-segs">${segs}</div>
          <i class="gl-mark" style="left:${targetPct}%"><u>DC ${displayCheck.dc}</u></i>
        </div>
        <div class="gl-verdict o-${outcome}">${escapeText(label)}</div>
      </div>
    </div>
  </div>`;
}

function equationMarkup(style, displayCheck) {
  const [d0, d1] = displayCheck.dice || [3, 4];
  const totalMod = (displayCheck.mod || 0) + (displayCheck.bonus || 0);
  const modSign = totalMod >= 0 ? '+' : '−';
  const attrShort = (displayCheck.attrLabel || '属').slice(0, 1);
  const absMod = Math.abs(totalMod);
  if (style === 'event') {
    return `<div class="ev-eq" aria-live="polite">
      <span class="ev-chip" style="--i:0">${d0}</span>
      <span class="ev-op" style="--i:1">+</span>
      <span class="ev-chip" style="--i:2">${d1}</span>
      <span class="ev-op" style="--i:3">${modSign}</span>
      <span class="ev-chip mod" style="--i:4">${escapeText(attrShort)}${absMod}</span>
      <span class="ev-op" style="--i:5">=</span>
      <strong class="ev-total" style="--i:6.5">${displayCheck.total}</strong>
      <span class="ev-vs" style="--i:7.5">难度 <b>${displayCheck.dc}</b></span>
    </div>`;
  }
  return `<div class="fr-eq" aria-live="polite">
    <span style="--i:0"><u>${d0}</u></span>
    <i style="--i:1">+</i>
    <span style="--i:2"><u>${d1}</u></span>
    <i style="--i:3">${modSign} ${escapeText(attrShort)}${absMod} =</i>
    <strong style="--i:5">${displayCheck.total}</strong>
    <em class="${displayCheck.success ? '' : 'lose'}" style="--i:6.5">${displayCheck.success ? '≥' : '<'} 难度 ${displayCheck.dc}</em>
  </div>`;
}

function verdictMarkup({ style, outcome, label, effectLine, passiveTag }) {
  if (style === 'gal') {
    return `${effectLine ? `<div class="dc-effect-note">${escapeText(effectLine)}</div>` : ''}
      ${passiveTag ? `<div class="dc-effect-note">${passiveTag}</div>` : ''}
      <button type="button" class="dc-continue" data-dc-continue>继续剧情 ›</button>`;
  }

  const stampHtml =
    style === 'event'
      ? `<div class="ev-result o-${outcome}">
          <div class="ev-streak" aria-hidden="true"></div>
          <strong class="ev-result-word">${escapeText(label)}</strong>
          ${displayWinOutcome(outcome) ? sparksMarkup(16) : ''}
          ${outcome === 'crit' ? '<small>双六 · 命运眷顾</small>' : outcome === 'fumble' ? '<small>双一 · 命运弄人</small>' : ''}
        </div>${effectLine ? `<div class="dc-effect-note">${escapeText(effectLine)}</div>` : ''}`
      : `<div class="fr-stamp o-${outcome}">
          ${escapeText(label)}
          ${outcome === 'crit' ? '<small>双六 · 命运眷顾</small>' : outcome === 'fumble' ? '<small>双一 · 命运弄人</small>' : passiveTag}
        </div>${effectLine ? `<div class="dc-effect-note">${escapeText(effectLine)}</div>` : ''}`;

  return `${stampHtml}<button type="button" class="dc-continue" data-dc-continue>继续剧情 ›</button>`;
}

function displayWinOutcome(outcome) {
  return outcome === 'crit' || outcome === 'success';
}

/** Shared theatrical 2D6 dice stage & [[DC_CHECK]] split playback coordinator. */
export function createDiceStage(context) {
  const { session, events } = context;
  const overlay = document.createElement('div');
  overlay.id = 'dc-stage';
  const surface = createPopoverSurface(overlay);
  overlay.hidden = true;
  document.body.append(overlay);

  let activeResolver = null;
  let timers = [];
  let stageExitAnimation = null;

  function schedule(delay, fn) {
    const id = setTimeout(fn, delay);
    timers.push(id);
    return id;
  }

  function cancelStageExit() {
    const animation = stageExitAnimation;
    stageExitAnimation = null;
    animation?.cancel();
    delete overlay.dataset.exiting;
    overlay.inert = false;
    overlay.removeAttribute('aria-hidden');
  }

  function clearDialogueInscribe() {
    const galStage = document.querySelector('#gal-stage');
    if (galStage) delete galStage.dataset.dcInscribing;
  }

  function finishStageExit(animation) {
    if (animation && stageExitAnimation !== animation) return;
    stageExitAnimation = null;
    surface.hide();
    clearDialogueInscribe();
    overlay.hidden = true;
    animation?.cancel();
    overlay.inert = false;
    overlay.removeAttribute('aria-hidden');
    overlay.removeAttribute('data-exiting');
    overlay.removeAttribute('data-style');
    overlay.removeAttribute('data-phase');
    overlay.style.removeProperty('--dc-glyph-origin');
    overlay.dataset.ready = 'false';
    overlay.replaceChildren();
    document.body.append(overlay);
  }

  function closeStage(animate = true) {
    cancelStageExit();
    for (const id of timers) clearTimeout(id);
    timers = [];
    overlay.dataset.ready = 'false';
    const resolve = activeResolver;
    activeResolver = null;

    const focused = document.activeElement;
    if (overlay.contains(focused)) focused.blur?.();
    overlay.inert = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.exiting = 'true';

    if (
      !animate ||
      overlay.hidden ||
      !overlay.isConnected ||
      !overlay.getClientRects().length ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof overlay.animate !== 'function'
    ) {
      finishStageExit(null);
    } else {
      const animation = overlay.animate(
        [
          { opacity: getComputedStyle(overlay).opacity, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.985)' },
        ],
        { duration: 180, easing: 'ease-in', fill: 'forwards' },
      );
      animation.id = 'dc-stage-exit';
      stageExitAnimation = animation;
      const finish = () => finishStageExit(animation);
      void animation.finished.then(finish, finish);
    }

    resolve?.();
  }

  events.on(overlay, 'click', (event) => {
    if (overlay.dataset.ready !== 'true') return;
    if (event.target.closest('[data-dc-continue]')) {
      closeStage();
    }
  });
  events.on(window, 'keydown', (event) => {
    if (overlay.hidden || overlay.dataset.exiting) return;
    if (overlay.dataset.ready !== 'true') {
      if (['Escape', ' ', 'Enter'].includes(event.key)) event.preventDefault();
      return;
    }
    if (event.target?.closest?.('[data-dc-continue]') && [' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      closeStage();
    }
  });

  /** Show the 2D6 roll overlay aligned with prose outcome, resolving when player continues. */
  function playCheck({
    style = 'event',
    displayCheck,
    actionText = '',
    reward = null,
    penalty = null,
    signal,
    onInscribed,
    waitForDialogueExit,
  }) {
    if (!displayCheck || signal?.aborted) return Promise.resolve();
    if (session.ai.generationOptions?.galMode === false) {
      return Promise.resolve();
    }
    if (activeResolver || stageExitAnimation) closeStage(false);
    return new Promise((resolve) => {
      const abort = () => closeStage(false);
      activeResolver = () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      signal?.addEventListener('abort', abort, { once: true });
      overlay.dataset.ready = 'false';
      overlay.dataset.style = style;
      overlay.dataset.phase = style === 'free' ? 'inscribe' : 'focus';
      const modText = formatMod(displayCheck.mod + (displayCheck.bonus || 0));
      const outcome = displayCheck.outcome || 'success';
      const label = displayCheck.label || dcOutcomeLabel(outcome);
      const effectLine = formatDcEffectSummary(reward, penalty).text;
      const passiveTag = displayCheck.passiveBypass ? '<small>高修正 · 从容直通</small>' : '';
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const frameEl = () => overlay.querySelector('.dc-frame');
      const triggerShake = (strong = false) => {
        const el = frameEl();
        if (!el || reduced) return;
        el.classList.remove('dc-shake', 'dc-shake-strong');
        void el.offsetWidth;
        el.classList.add(strong ? 'dc-shake-strong' : 'dc-shake');
      };

      const centerHtml =
        style === 'free'
          ? freeStageMarkup(displayCheck, actionText)
          : style === 'gal'
            ? galStageMarkup(displayCheck, modText)
            : eventStageMarkup(displayCheck, modText);

      const freePending = style === 'free';
      const headerAttrText = freePending
        ? '属性检定'
        : `${escapeText(displayCheck.attrLabel || '属性')}检定`;
      const headerMetaText = freePending
        ? `${actionText ? `「${escapeText(actionText)}」 ` : ''}命运裁定中`
        : `${actionText ? `「${escapeText(actionText)}」 ` : ''}2D6 ${escapeText(modText)} 对抗 难度 ${displayCheck.dc}`;

      overlay.innerHTML = `<div class="dc-backdrop"></div>
        <div class="dc-bar top"></div>
        <div class="dc-frame">
          <div class="dc-check-header">
            <b>◆ ${escapeText(displayCheck.actorName || '执行者')} · <em class="dc-hdr-attr" data-dc-hdr-attr>${headerAttrText}</em> ◆</b>
            <span data-dc-hdr-meta>${headerMetaText}</span>
          </div>
          ${centerHtml}
          <div class="dc-reveal" hidden>
            <div class="dc-eq-slot" hidden></div>
            <div class="dc-verdict-slot" hidden></div>
          </div>
        </div>
        <div class="dc-bar bottom"></div>`;
      (activeModal(document) || document.body).append(overlay);
      overlay.hidden = false;
      surface.show();
      let freeFlightTime =
        FREE_CIRCLE_LEAD +
        (freeGlyphChars(actionText).length - 1) * FREE_GLYPH_STAGGER +
        FREE_GLYPH_DURATION;
      if (style === 'free') {
        const stageEl = overlay.querySelector('.fr-stage');
        const circleRect = stageEl?.getBoundingClientRect();
        const galStage = document.querySelector('#gal-stage:not([hidden])');
        const galText = galStage?.querySelector('.gal-text');
        const rawText = galText?.textContent || '';
        const glyphsBox = overlay.querySelector('.fr-glyphs');

        if (circleRect && galStage && galText && rawText.trim() && !reduced && glyphsBox) {
          const targetX = circleRect.left + circleRect.width / 2;
          const targetY = circleRect.top + circleRect.height / 2;
          const fragment = document.createDocumentFragment();
          const charSpans = [];
          for (const ch of [...rawText]) {
            if (/\s/u.test(ch)) {
              fragment.append(document.createTextNode(ch));
            } else {
              const span = document.createElement('span');
              span.className = 'gal-fly-char';
              span.textContent = ch;
              charSpans.push(span);
              fragment.append(span);
            }
          }
          if (charSpans.length > 0) {
            galText.replaceChildren(fragment);
            galStage.dataset.dcInscribing = 'true';
            const stagger = Math.min(
              FREE_GLYPH_STAGGER,
              Math.max(14, Math.round(780 / Math.max(1, charSpans.length))),
            );
            const rects = charSpans.map((span) => span.getBoundingClientRect());
            charSpans.forEach((span, idx) => {
              span.style.setProperty('--dl', `${FREE_CIRCLE_LEAD + idx * stagger}ms`);
              span.classList.add('is-flying-out');
            });

            const sampleCount = Math.min(MAX_FLYING_GLYPHS, charSpans.length);
            const items = [];
            for (let s = 0; s < sampleCount; s += 1) {
              const idx =
                sampleCount === charSpans.length
                  ? s
                  : Math.round((s * (charSpans.length - 1)) / Math.max(1, sampleCount - 1));
              const rect = rects[idx];
              const sx = +(rect.left + rect.width / 2 - targetX).toFixed(1);
              const sy = +(rect.top + rect.height / 2 - targetY).toFixed(1);
              const angle = ((s * 360) / Math.max(1, sampleCount)) * (Math.PI / 180);
              const mx = +(sx * 0.28 + Math.cos(angle + 0.85) * 46).toFixed(1);
              const my = +(sy * 0.22 + Math.sin(angle + 0.85) * 32 - 18).toFixed(1);
              const ex = +(Math.cos(angle) * 10).toFixed(1);
              const ey = +(Math.sin(angle) * 10).toFixed(1);
              items.push({
                ch: charSpans[idx].textContent,
                sx,
                sy: `${sy}px`,
                mx,
                my,
                ex,
                ey,
                delay: FREE_CIRCLE_LEAD + idx * stagger,
              });
            }
            glyphsBox.innerHTML = buildGlyphMarkup(items, FREE_GLYPH_DURATION);
            freeFlightTime =
              FREE_CIRCLE_LEAD + (charSpans.length - 1) * stagger + FREE_GLYPH_DURATION;
          }
        } else if (circleRect) {
          const dialogue = galText?.getBoundingClientRect();
          const center = circleRect.top + circleRect.height / 2;
          const limit = Math.max(36, innerHeight - center - 42);
          const origin = dialogue ? dialogue.top + dialogue.height / 2 - center : limit;
          overlay.style.setProperty(
            '--dc-glyph-origin',
            `${Math.min(limit, Math.max(36, origin))}px`,
          );
        }
      }

      const revealEquation = () => {
        const reveal = overlay.querySelector('.dc-reveal');
        const eqSlot = overlay.querySelector('.dc-eq-slot');
        if (!reveal || !eqSlot) return;
        reveal.hidden = false;
        if (style === 'gal') return;
        eqSlot.hidden = false;
        eqSlot.innerHTML = equationMarkup(style, displayCheck);
      };

      const revealVerdict = () => {
        const reveal = overlay.querySelector('.dc-reveal');
        const verdictSlot = overlay.querySelector('.dc-verdict-slot');
        if (!reveal || !verdictSlot) return;
        reveal.hidden = false;
        verdictSlot.hidden = false;
        verdictSlot.innerHTML = verdictMarkup({
          style,
          outcome,
          label,
          effectLine,
          passiveTag,
        });
        const continueButton = verdictSlot.querySelector('[data-dc-continue]');
        if (
          continueButton &&
          (document.documentElement.dataset.gameLayout === 'mobile' ||
            matchMedia('(max-height: 500px)').matches)
        ) {
          overlay.append(continueButton);
        }
        overlay.dataset.phase = 'result';
        overlay.dataset.ready = 'true';
        continueButton?.focus({ preventScroll: true });
      };

      if (style === 'free') {
        const stageEl = overlay.querySelector('.fr-stage');
        const fxEl = overlay.querySelector('.fr-fx');
        const diceBox = overlay.querySelector('.fr-dice');
        const kickerEl = overlay.querySelector('[data-fr-kicker]');
        const verdictEl = overlay.querySelector('[data-fr-verdict]');
        const beamEl = overlay.querySelector('.fr-beam');
        const attrIdx = Math.max(
          0,
          DC_ATTR_NODES.findIndex(
            (n) => n.key === displayCheck.attr || n.name === displayCheck.attrLabel,
          ),
        );
        const setHot = (idx) => {
          overlay.querySelectorAll('.fr-node').forEach((node, i) => {
            node.classList.toggle('on', i === idx);
          });
        };
        const spawnFx = (className) => {
          if (!fxEl) return;
          const node = document.createElement('i');
          node.className = className;
          fxEl.append(node);
        };

        const resolver = activeResolver;
        schedule(reduced ? 20 : freeFlightTime, async () => {
          const glyphs = overlay.querySelector('.fr-glyphs');
          const flights = reduced
            ? []
            : (glyphs?.getAnimations?.({ subtree: true }) || []).filter(
                (animation) =>
                  animation.playState === 'running' &&
                  Number.isFinite(animation.effect?.getComputedTiming().endTime),
              );
          if (flights.length)
            await Promise.race([
              Promise.allSettled(flights.map((animation) => animation.finished)),
              new Promise((finish) => schedule(360, finish)),
            ]);
          if (activeResolver !== resolver || signal?.aborted) return;
          clearDialogueInscribe();
          overlay.dataset.phase = 'withdraw';
          onInscribed?.();
          await waitForDialogueExit?.();
          if (activeResolver !== resolver || signal?.aborted) return;
          startDraw();
        });

        function startDraw() {
          let t = 0;
          overlay.dataset.phase = 'judge';
          stageEl?.classList.add('active');
          if (kickerEl) kickerEl.textContent = '命运裁定中';
          const steps = reduced ? 1 : 10 + attrIdx;
          for (let k = 0; k <= steps; k++) {
            t += reduced ? 10 : 65 + k * 9;
            const idx = k % 6;
            schedule(t, () => {
              setHot(idx);
              if (verdictEl) verdictEl.textContent = `${DC_ATTR_NODES[idx].name}？`;
            });
          }
          t += reduced ? 10 : 260;
          schedule(t, () => {
            setHot(attrIdx);
            if (kickerEl) kickerEl.textContent = '既定裁决';
            if (verdictEl) {
              verdictEl.textContent = `${DC_ATTR_NODES[attrIdx].name}检定 · 难度 ${displayCheck.dc}`;
              verdictEl.classList.add('lock');
            }
            const hdrAttr = overlay.querySelector('[data-dc-hdr-attr]');
            const hdrMeta = overlay.querySelector('[data-dc-hdr-meta]');
            if (hdrAttr) {
              hdrAttr.textContent = `${DC_ATTR_NODES[attrIdx].name}检定`;
              hdrAttr.classList.remove('is-popped');
              void hdrAttr.offsetWidth;
              hdrAttr.classList.add('is-popped');
            }
            if (hdrMeta) {
              hdrMeta.textContent = `${actionText ? `「${actionText}」 ` : ''}2D6 ${modText} 对抗 难度 ${displayCheck.dc}`;
              hdrMeta.classList.remove('is-popped');
              void hdrMeta.offsetWidth;
              hdrMeta.classList.add('is-popped');
            }
            if (beamEl) beamEl.hidden = false;
          });
          t += reduced ? 10 : 600;
          schedule(t, () => {
            overlay.dataset.phase = 'summon';
            if (diceBox) diceBox.hidden = false;
          });
          schedule(t + (reduced ? 10 : 1280), () => {
            overlay.dataset.phase = 'solid';
            spawnFx('fr-pillar');
            spawnFx('fr-flash');
            for (const cube of overlay.querySelectorAll('.skin-arcane.wire')) {
              cube.classList.remove('wire');
            }
          });
          schedule(t + (reduced ? 20 : 2150), () => {
            overlay.dataset.phase = 'sum';
            revealEquation();
          });
          schedule(t + (reduced ? 30 : 3250), () => {
            revealVerdict();
            triggerShake(true);
          });
        }
        return;
      }

      if (style === 'event') {
        const throwDelay = reduced ? 10 : 700;
        schedule(throwDelay, () => {
          overlay.dataset.phase = 'throw';
          const arena = overlay.querySelector('.ev-arena');
          if (arena) arena.insertAdjacentHTML('beforeend', eventDiceMarkup(displayCheck));
        });
        schedule(throwDelay + (reduced ? 10 : 780), () => triggerShake(false));
        schedule(throwDelay + (reduced ? 15 : 1220), () => triggerShake(false));
        schedule(reduced ? 30 : 2350, () => {
          overlay.dataset.phase = 'landed';
        });
        schedule(reduced ? 40 : 2900, () => {
          overlay.dataset.phase = 'sum';
          revealEquation();
        });
        schedule(reduced ? 50 : 4100, () => {
          revealVerdict();
          triggerShake(outcome === 'crit' || outcome === 'fumble');
        });
        return;
      }

      schedule(reduced ? 20 : 1650, () => {
        revealEquation();
        revealVerdict();
      });
    });
  }

  /** Settle rewards/penalties once and play [[DC_CHECK]] split narrative around the dice animation. */
  async function playReply(
    result,
    playOptions = {},
    {
      style = 'free',
      actionText = '',
      fixedCheck = null,
      member = null,
      claimId = crypto.randomUUID(),
      expedition = null,
      signal,
      onSettled,
    } = {},
  ) {
    if (signal?.aborted) return null;
    const library = session.ai.library;
    const outcome = result?.dcOutcome || null;
    let settledReward = null;
    let settledPenalty = null;
    if (outcome?.triggered) {
      if (outcome.reward && outcome.reward.tier !== 'none' && outcome.reward.kind !== 'none') {
        settledReward = settleDcReward(library, `dc:${claimId}`, outcome.reward, claimId);
      }
      if (!outcome.success && outcome.penalty) {
        settledPenalty = applyDcPenalty(
          library,
          outcome.penalty,
          outcome.actorId || member?.id,
          expedition,
        );
      }
    }
    const receipt = {
      reward: settledReward,
      penalty: settledPenalty,
      ambush: Boolean(outcome?.penalty?.ambush),
    };
    if (onSettled) onSettled(receipt);
    else if (settledReward || settledPenalty) context.generation?.save?.();

    const split = result?.dcSplit;
    const actorMember =
      member ||
      library.characters.find((c) => c.id === (outcome?.actorId || fixedCheck?.actorId)) ||
      library.characters[0];

    if (split?.beforeText && outcome?.triggered) {
      const displayCheck = buildDcDisplayCheck({
        library,
        member: actorMember,
        dcOutcome: outcome,
        preRoll: result.dcPreRoll,
        fixedCheck,
        seed: claimId,
      });
      const checkOptions = {
        style,
        displayCheck,
        actionText,
        reward: settledReward,
        penalty: settledPenalty,
        signal,
      };
      let dicePlayback;
      const dialogue = context.gal.play(split.displayBeforeText || split.beforeText, {
        ...playOptions,
        onComplete: undefined,
        beforeExit:
          style === 'free'
            ? () =>
                new Promise((resolve) => {
                  dicePlayback = playCheck({
                    ...checkOptions,
                    onInscribed: resolve,
                    waitForDialogueExit: () => dialogue,
                  });
                  dicePlayback.then(resolve);
                })
            : undefined,
      });
      await dialogue;
      if (signal?.aborted) return null;
      await (dicePlayback || playCheck(checkOptions));
      if (signal?.aborted) return null;
      if (split.afterText) {
        await context.gal.play(split.displayAfterText || split.afterText, playOptions);
      } else {
        playOptions.onComplete?.();
      }
    } else {
      await context.gal.play(result.display || result.content, playOptions);
    }

    return signal?.aborted ? null : receipt;
  }

  return {
    playCheck,
    playReply,
    dispose() {
      closeStage(false);
      overlay.remove();
    },
  };
}
