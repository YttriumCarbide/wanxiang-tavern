import { DISHES, INGREDIENTS } from '../content/dining.js';
import { portraitUrl } from '../portraits.js';
import { SERVICE_ROLES, serviceAutoChance, serviceWaitBonus } from '../service-progression.js';
import {
  SERVICE_CATALOG_MAP,
  advanceLiveService,
  boostLiveStove,
  calcLiveDishPrice,
  chefCookModForShift,
  chooseLiveVipDish,
  clickLiveStove,
  clickLiveTable,
  closeLiveCookMiniGame,
  closeLiveShiftEarly,
  confirmLiveCookDc,
  confirmLiveEventCheck,
  inputLiveCookMiniGame,
  liveCraftableCount,
  pickLiveEventOption,
  pourLiveAle,
  rerollLiveCookDc,
  rerollLiveEventCheck,
  seatLiveGuest,
  serveLivePlate,
  triggerLiveFever,
} from '../service-live.js';
import {
  dcAttrLabel,
  dcOutcomeLabel,
  dcSuccessProbability,
  formatMod,
  isDcSuccess,
} from '../dc.js';
import { escapeText } from '../ui.js';
import { dieMarkup } from './dice-stage.js';
import { foodArt } from './food-art.js';
import { paintCookingTrail } from './service-cooking-view.js';
import { paintServiceActivity, serviceGameMarkup } from './service-game-view.js';

function dishArt(dish) {
  const dining = dish?.artId && DISHES[dish.artId];
  return dining
    ? foodArt(dining)
    : `<span class="ls-glyph">${escapeText(dish?.glyph || '菜')}</span>`;
}

function qualityBadge(quality) {
  if (quality === 'divine') return ['✦神品', '#ffb3ff'];
  if (quality === 'great') return ['★极品', '#ffe484'];
  if (quality === 'burnt') return ['微焦', '#a8b2d1'];
  return ['标准', '#d8d2c0'];
}

export function createServiceBoard(context, closeShift) {
  const board = document.createElement('dialog');
  board.id = 'daily-service';
  board.setAttribute('aria-labelledby', 'service-title');
  document.body.append(board);

  let shift = null;
  let frame = 0;
  let lastTick = 0;
  let speed = 1;
  let savedAt = 0;
  let gesture = null;
  let cookingCloseTimer = 0;

  function save() {
    if (!shift) return;
    savedAt = shift.elapsed;
    context.generation.save();
  }

  function playCue(name) {
    context.audio?.play(name);
  }

  function floatNotice(text, tone = 'gold') {
    const layer = board.querySelector('.ls-float-layer');
    if (!layer) return;
    const node = document.createElement('span');
    node.className = `ls-float-msg tone-${tone}`;
    node.textContent = text;
    layer.append(node);
    window.setTimeout(() => node.remove(), 950);
  }

  function staffMember(role) {
    const id = shift?.staff?.[role];
    return context.session.ai.library.characters.find((c) => c.id === id) || null;
  }

  function queueHtml() {
    if (!shift.queue.length) {
      return '<div class="ls-empty-box">夜风轻拂门铃…<br>下一位宾客即将步入</div>';
    }
    return shift.queue
      .map((g) => {
        const pct = Math.max(0, Math.round((g.patience / Math.max(1, g.maxPatience)) * 100));
        return `<button type="button" class="ls-guest-card ${g.patron.vip ? 'vip' : ''}" data-live-seat="${g.uid}">
          <span class="ls-pbadge" style="--c:${g.patron.color}">${escapeText(g.patron.glyph)}</span>
          <div class="ls-guest-body">
            <div><b>${g.patron.vip ? '♛ ' : ''}${escapeText(g.patron.name)}</b><span>引座 ›</span></div>
            <small>偏爱：${g.patron.likes.slice(0, 2).map(escapeText).join(' / ')}</small>
            <div class="ls-pbar"><i style="width:${pct}%;background:${pct < 30 ? '#ff6458' : pct < 60 ? '#f4a261' : '#6fcf8a'}"></i></div>
          </div>
        </button>`;
      })
      .join('');
  }

  function tablesHtml() {
    return shift.tables
      .map((t) => {
        if (!t.unlocked) {
          return `<div class="ls-table locked"><strong>扩建餐桌 #${t.idx + 1}</strong><small>提升知名度解锁更多桌位</small></div>`;
        }
        const plate = t.state === 'waiting' ? shift.plates.find((p) => p.tableIdx === t.idx) : null;
        const dish = t.recipeId ? SERVICE_CATALOG_MAP[t.recipeId] : null;
        const pct =
          t.maxPatience > 0 ? Math.max(0, Math.round((t.patience / t.maxPatience) * 100)) : 100;
        const urgent = (t.state === 'ordering' || t.state === 'waiting') && pct < 28 && !plate;
        const actionCls = t.state === 'ordering' || plate ? 'action' : '';
        const payCls = t.state === 'pay' ? 'pay' : '';

        let body = '';
        if (t.state === 'empty') {
          body = `<div class="ls-table-empty"><strong>${shift.queue.length ? '✦ 点击引客入座' : '烛光空席'}</strong>
            <small>${shift.queue.length ? `门口有 ${shift.queue.length} 位客人` : '桌面整洁 · 静候来客'}</small></div>`;
        } else if (t.patron) {
          const [qLabel, qColor] = qualityBadge(t.quality);
          let pill = '';
          let dishCenter = '';
          if (t.state === 'ordering') {
            pill = `<span class="ls-bubble">${t.patron.vip ? '♛ 贵客求荐菜' : '✎ 点击点单'}</span>`;
          } else if (t.state === 'waiting') {
            pill = plate
              ? '<span class="ls-bubble serve">✦ 出锅 · 点击上桌</span>'
              : '<span class="ls-wait-hint">后厨烹制中…</span>';
          } else if (t.state === 'eating') {
            dishCenter = `<div class="ls-dish-center">${dishArt(dish)}<i class="ls-steam" aria-hidden="true"></i></div>`;
            pill = `<span class="ls-eat-hint"><i style="color:${qColor}">${qLabel}</i> · 享用中 ${t.eatTimer.toFixed(1)}s</span>`;
          } else if (t.state === 'pay') {
            pill = `<span class="ls-bubble pay">🪙 收银清桌 +${t.billGold}G</span>`;
          }
          body = `<div class="ls-table-patron">
            <span class="ls-pbadge" style="--c:${t.patron.color}">${escapeText(t.patron.glyph)}</span>
            <div><b>${t.patron.vip ? '♛ ' : ''}${escapeText(t.patron.name)}</b><small>${dish ? escapeText(dish.name) : escapeText(t.patron.quote)}</small></div>
          </div>
          ${dishCenter}
          ${pill}
          ${
            t.state === 'ordering' || t.state === 'waiting'
              ? `<div class="ls-pbar"><i style="width:${pct}%;background:${pct < 30 ? '#ff6458' : pct < 60 ? '#f4a261' : '#6fcf8a'}"></i></div>`
              : ''
          }`;
        }
        return `<button type="button" class="ls-table ${actionCls} ${payCls} ${urgent ? 'urgent' : ''}" data-live-table="${t.idx}">
          <span class="ls-tkey">${t.idx + 1}号桌</span><span class="ls-candle" aria-hidden="true"></span>${body}
        </button>`;
      })
      .join('');
  }

  function stovesHtml() {
    const mod = chefCookModForShift(shift);
    return shift.stoves
      .map((s) => {
        if (!s.unlocked) {
          return `<div class="ls-stove locked"><span>灶台 #${s.idx + 1}</span><small>升级秘银魔导灶解锁</small></div>`;
        }
        const dish = s.ticket ? SERVICE_CATALOG_MAP[s.ticket.recipeId] : null;
        if (!dish) {
          return `<div class="ls-stove idle"><span>灶台 #${s.idx + 1}</span><small>炉火待命</small></div>`;
        }
        if (s.status === 'dc_ready') {
          const dc = Math.max(5, Math.min(12, dish.dc + (shift.weather?.dcDelta || 0)));
          return `<button type="button" class="ls-stove dc-ready" data-live-stove="${s.idx}">
            <div class="ls-stove-top"><span>灶台 #${s.idx + 1}</span><b>${s.ticket.tableIdx + 1}号桌</b></div>
            <strong>✦ ${escapeText(dish.name)}</strong>
            <span class="ls-dc-cta">🎲 火候 2D6 DC${dc} (${dcSuccessProbability(mod, dc)}%)</span>
          </button>`;
        }
        const pct = Math.round(s.progress * 100);
        return `<div class="ls-stove cooking">
          <div class="ls-stove-top"><span>灶台 #${s.idx + 1}</span><b>${s.ticket.tableIdx + 1}号桌</b></div>
          <strong>${dish.kind === 'signature' ? '✦ ' : ''}${escapeText(dish.name)}</strong>
          <div class="ls-pbar"><i style="width:${pct}%;background:linear-gradient(90deg,#ff6b35,#ffe484)"></i></div>
          <div class="ls-stove-btns">
            <button type="button" data-live-minigame="${s.idx}">🔥 亲手烹调 (极品×1.35)</button>
            <button type="button" data-live-boost="${s.idx}">⚡ 煽火</button>
          </div>
          <div class="ls-flames" aria-hidden="true"></div>
        </div>`;
      })
      .join('');
  }

  function modalMarkup() {
    if (shift.finished) {
      const grade = shift.earnedGold >= 140 ? 'S' : shift.earnedGold >= 75 ? 'A' : 'B';
      const bonusEntries = Object.entries(shift.bonusIngredients || {});
      return `<div class="ls-modal-mask"><div class="ls-modal tv-panel" role="dialog" aria-modal="true" aria-label="打烊结算">
        <small class="ls-kicker">MIDNIGHT LEDGER</small>
        <div class="ls-settle-head"><h3>今夜打烊结算</h3><span>${grade} 级</span></div>
        <div class="ls-settle-grid">
          <div><small>金币收益</small><b style="color:#ffe484">+${shift.earnedGold} G</b><span>特色 ${shift.sigGold} · 基础 ${shift.regGold}</span></div>
          <div><small>小费与事件</small><b>+${shift.tipGold + Math.max(0, shift.eventGold)} G</b><span>贵客 ${shift.vipsServed} 位</span></div>
          <div><small>酒馆知名度</small><b style="color:#9fe0a8">+${Math.max(shift.repGain, shift.servedCount)}</b><span>极品/神品 ${shift.masterworkCount} 道</span></div>
          <div><small>接待与连击</small><b>${shift.servedCount} 桌</b><span>最高 ${shift.maxCombo} 连 · 离席 ${shift.leftAngry}</span></div>
        </div>
        ${bonusEntries.length ? `<p class="ls-settle-bonus">奇遇食材入库：${bonusEntries.map(([id, n]) => `${escapeText(INGREDIENTS[id]?.name || id)}×${n}`).join('、')}</p>` : ''}
        <p class="ls-settle-note">当班伙伴熟练度已累积 · 好感度 +2</p>
        <button type="button" class="ls-gold-btn" data-live="settle-done" data-service-end>收下金币 · 结束营业</button>
      </div></div>`;
    }
    if (shift.activeCookDc) {
      const { dish, dc, mod, check } = shift.activeCookDc;
      const win = isDcSuccess(check.outcome);
      return `<div class="ls-modal-mask"><div class="ls-modal tv-panel" role="dialog" aria-modal="true" aria-label="特色火候 2D6 检定">
        <small class="ls-kicker">SIGNATURE FLAME CHECK</small>
        <h3>${escapeText(dish.name)} · 火候检定</h3>
        <p class="ls-modal-sub">主厨火候 2D6 ${escapeText(formatMod(mod))} 对抗 难度 DC ${dc}（双6 ✦神品 ×1.75 / 成功 ★极品 ×1.35）</p>
        <div class="ls-dice-row">
          ${dieMarkup(check.dice[0], 'ivory', 0, [900, -720, 360])}
          ${dieMarkup(check.dice[1], 'ivory', 80, [-900, 720, -360])}
        </div>
        <div class="ls-check-result ${check.outcome}">
          <b>${check.dice[0]} + ${check.dice[1]} ${escapeText(formatMod(mod))} = ${check.total}</b>
          <span>${escapeText(dcOutcomeLabel(check.outcome))}</span>
        </div>
        <div class="ls-modal-actions">
          ${!win && shift.fateTokens > 0 ? `<button type="button" class="ls-sub-btn" data-live="cook-reroll">🎲 命运重掷（仅本班 · 余 ${shift.fateTokens}）</button>` : ''}
          <button type="button" class="ls-gold-btn" data-live="cook-confirm">盛盘出锅！</button>
        </div>
      </div></div>`;
    }
    if (shift.activeMiniGame) {
      const mg = shift.activeMiniGame;
      const fakeJob = {
        guest: { id: mg.stoveIdx, error: '' },
        phase: 'cook',
        course: 0,
        order: [mg.dish.name],
        dish: mg.dish.name,
        activity: mg.activity,
      };
      return `<div class="ls-modal-mask"><div class="ls-modal ls-modal-game tv-panel" role="dialog" aria-modal="true" aria-label="交互烹饪小游戏">
        <div class="ls-mg-head">
          <div><small>灶台 #${mg.stoveIdx + 1} · 交互精烹（完成必出 ★极品 ×1.35）</small><h4>${escapeText(mg.dish.name)}</h4></div>
          <button type="button" class="ls-sub-btn" data-live="mg-close">返回大厅</button>
        </div>
        <div class="ls-mg-stage">${serviceGameMarkup(fakeJob)}</div>
      </div></div>`;
    }
    if (shift.vipModalTableIdx !== null) {
      const table = shift.tables[shift.vipModalTableIdx];
      const likes = table?.patron?.likes || [];
      const ids = [...shift.sigMenu, ...shift.regMenu];
      return `<div class="ls-modal-mask"><div class="ls-modal tv-panel" role="dialog" aria-modal="true" aria-label="贵客荐菜">
        <small class="ls-kicker">VIP PATRON PAIRING</small>
        <h3>♛ ${escapeText(table?.patron?.name || '贵客')} 求推荐料理</h3>
        <p class="ls-modal-sub">偏爱风味：${likes.map((l) => `<span class="tv-tag hot">${escapeText(l)}</span>`).join(' ')}（命中1项 ×1.20 · 2项 ×1.45）</p>
        <div class="ls-vip-grid">
          ${ids
            .map((id) => {
              const dish = SERVICE_CATALOG_MAP[id];
              if (!dish) return '';
              const hits = dish.tags.filter((t) => likes.includes(t)).length;
              const stock =
                dish.kind === 'signature' ? liveCraftableCount(dish, shift.pantry) : 999;
              const { price } = calcLiveDishPrice(dish, {
                growth: {
                  reputation: shift.reputationSnapshot,
                  facilities: shift.facilities,
                  specialties: shift.specialtiesSnapshot,
                },
                day: shift.day,
              });
              return `<button type="button" class="ls-vip-card ${hits > 0 ? 'match' : ''}" data-live-vip-pick="${dish.id}" ${stock <= 0 ? 'disabled' : ''}>
                <span class="ls-vip-art">${dishArt(dish)}</span>
                <div><b>${escapeText(dish.name)}</b><small>${dish.tags.map(escapeText).join('/')} ${hits ? `· 命中+${hits === 1 ? '20' : '45'}%` : ''}</small></div>
                <strong>${price}G</strong>
              </button>`;
            })
            .join('')}
        </div>
        <div class="ls-modal-actions"><button type="button" class="ls-sub-btn" data-live="vip-cancel">稍后再选</button></div>
      </div></div>`;
    }
    if (shift.activeEvent) {
      const ev = shift.activeEvent;
      const roll = ev.roll;
      const pickedOpt = ev.def.opts[ev.pickedIndex];
      return `<div class="ls-modal-mask"><div class="ls-modal tv-panel" role="dialog" aria-modal="true" aria-label="突发事件 2D6 检定">
        <small class="ls-kicker">TAVERN ENCOUNTER</small>
        <h3>${ev.def.badge} ${escapeText(ev.def.title)}</h3>
        <p class="ls-modal-sub">${escapeText(ev.def.desc)}</p>
        ${
          !roll
            ? `<div class="ls-ev-opts">${ev.def.opts
                .map((opt, idx) => {
                  const mod = shift.staffMods?.[opt.post]?.[opt.attr] ?? 0;
                  const pct = dcSuccessProbability(mod, opt.dc);
                  const staffName = staffMember(opt.post)?.setting.name || SERVICE_ROLES[opt.post];
                  return `<button type="button" class="ls-ev-opt" data-live-ev-opt="${idx}">
                    <b>${escapeText(opt.label)}</b>
                    <small>${escapeText(SERVICE_ROLES[opt.post])}·${escapeText(staffName)} · ${escapeText(dcAttrLabel(opt.attr))} ${escapeText(formatMod(mod))} vs DC ${opt.dc} (${pct}%)</small>
                  </button>`;
                })
                .join('')}</div>`
            : `<div class="ls-dice-row">
                ${dieMarkup(roll.dice[0], 'arcane', 0, [900, -720, 360])}
                ${dieMarkup(roll.dice[1], 'arcane', 80, [-900, 720, -360])}
              </div>
              <div class="ls-check-result ${roll.outcome}">
                <b>${roll.dice[0]} + ${roll.dice[1]} ${escapeText(formatMod(ev.mod || 0))} = ${roll.total} / DC ${pickedOpt.dc}</b>
                <span>${escapeText(dcOutcomeLabel(roll.outcome))}</span>
              </div>
              <p class="ls-ev-outcome">${escapeText(isDcSuccess(roll.outcome) ? pickedOpt.winText : pickedOpt.loseText)}</p>
              <div class="ls-modal-actions">
                ${!isDcSuccess(roll.outcome) && shift.fateTokens > 0 ? `<button type="button" class="ls-sub-btn" data-live="event-reroll">🎲 命运重掷（余 ${shift.fateTokens}）</button>` : ''}
                <button type="button" class="ls-gold-btn" data-live="event-confirm">继续营业</button>
              </div>`
        }
      </div></div>`;
    }
    return '';
  }

  function modalKeyForShift() {
    if (shift.finished) return 'summary';
    if (shift.activeCookDc) return `cook:${shift.activeCookDc.check.dice.join(',')}`;
    if (shift.activeMiniGame)
      return `mg:${shift.activeMiniGame.stoveIdx}:${shift.activeMiniGame.kind}`;
    if (shift.vipModalTableIdx !== null) return `vip:${shift.vipModalTableIdx}`;
    if (shift.activeEvent)
      return `ev:${shift.activeEvent.def.id}:${shift.activeEvent.roll ? shift.activeEvent.roll.dice.join(',') : 'pick'}`;
    return '';
  }

  function syncTimersAndHud() {
    if (!shift) return;
    const left = Math.max(0, Math.ceil(shift.duration - shift.elapsed));
    const clockNum = board.querySelector('[data-live-stat="clock"]');
    if (clockNum) clockNum.textContent = `${left}s`;
    const clockFill = board.querySelector('[data-live-stat="clock-bar"]');
    if (clockFill)
      clockFill.style.width = `${Math.min(100, (shift.elapsed / shift.duration) * 100)}%`;
    const goldNode = board.querySelector('[data-live-stat="gold"]');
    if (goldNode) goldNode.textContent = `${shift.earnedGold} G`;
    const repNode = board.querySelector('[data-live-stat="rep"]');
    if (repNode) repNode.textContent = `+${shift.repGain}`;
    const servedNode = board.querySelector('[data-live-stat="served"]');
    if (servedNode) servedNode.textContent = `${shift.servedCount}`;
    const fateNode = board.querySelector('[data-live-stat="fate"]');
    if (fateNode) fateNode.textContent = `${shift.fateTokens}`;
    board.classList.toggle('fever', shift.feverLeft > 0);
  }

  function render() {
    if (!shift) return;
    if (shift.activeMiniGame && board.querySelector('[data-activity]')) {
      const area = board.querySelector('[data-activity]');
      paintServiceActivity(area, shift.activeMiniGame.activity, Boolean(gesture));
      syncTimersAndHud();
      return;
    }
    const front = staffMember('front');
    const cook = staffMember('cook');
    const frontLv = shift.staffLevels?.front || 0;
    const cookMod = chefCookModForShift(shift);
    const aleGold = 6 + (shift.facilities?.barrel || 0) * 3;
    const comboMult = (1 + Math.min(0.6, shift.combo * 0.06)).toFixed(2);
    const feverPct =
      shift.feverLeft > 0 ? Math.round((shift.feverLeft / 10) * 100) : Math.round(shift.fever);

    board.innerHTML = `<header class="ls-hud">
      <div class="ls-clock">
        <div class="ls-clock-top">
          <span id="service-title">${shift.tutorial ? '试营业' : `第 ${shift.day} 夜`} · ${shift.weather.badge} ${escapeText(shift.weather.name)}</span>
          <b data-live-stat="clock">${Math.max(0, Math.ceil(shift.duration - shift.elapsed))}s</b>
        </div>
        <div class="ls-clock-bar"><i data-live-stat="clock-bar" style="width:${Math.min(100, (shift.elapsed / shift.duration) * 100)}%"></i></div>
      </div>
      <div class="ls-kpi"><small>今夜金币</small><b data-live-stat="gold" style="color:#ffe484">${shift.earnedGold} G</b></div>
      <div class="ls-kpi"><small>知名度</small><b data-live-stat="rep" style="color:#9fe0a8">+${shift.repGain}</b></div>
      <div class="ls-kpi"><small>出餐</small><b data-live-stat="served">${shift.servedCount}</b></div>
      <div class="ls-kpi" title="仅可在酒馆营业内失败重掷"><small>命运骰</small><b data-live-stat="fate" style="color:#d8c4ff">${shift.fateTokens}</b></div>
      ${shift.combo >= 2 ? `<div class="ls-combo">${shift.combo} 连击 · ×${comboMult}</div>` : ''}
      <button type="button" class="ls-fever-btn ${shift.fever >= 100 ? 'ready' : ''} ${shift.feverLeft > 0 ? 'active' : ''}" data-live="fever">
        <i style="width:${feverPct}%"></i>
        <span>${shift.feverLeft > 0 ? `🔥 狂欢中 ${Math.ceil(shift.feverLeft)}s` : shift.fever >= 100 ? '✦ 敲响狂欢铃！' : `狂欢 ${feverPct}%`}</span>
      </button>
      <button type="button" class="ls-hud-btn" data-live="speed">${speed === 1 ? '1.0×' : '1.4×'}</button>
      <button type="button" class="ls-hud-btn" data-live="end">打烊</button>
    </header>
    <div class="ls-floor">
      <section class="ls-queue-col tv-panel" aria-label="门口迎宾与酒桶">
        <div class="ls-staff-strip">
          ${front ? `<img src="${escapeText(portraitUrl(front.combat))}" alt="">` : ''}
          <div><strong>前台 · ${escapeText(front?.setting.name || '未指派')}</strong><small>等候 +${serviceWaitBonus(frontLv)}s · 自动 ${serviceAutoChance(frontLv)}%</small></div>
        </div>
        <div class="ls-col-cap"><span>◆ 门口候客 (${shift.queue.length}/4)</span><small>点击入座</small></div>
        <div class="ls-queue-list">${queueHtml()}</div>
        <button type="button" class="ls-keg-btn" data-live="ale" ${shift.kegCd > 0 ? 'disabled' : ''}>
          <span>🍺</span>
          <div><strong>${shift.kegCd > 0 ? `酿桶加压 ${shift.kegCd.toFixed(1)}s` : '敬杯鲜麦酒'}</strong>
          <small>安抚最急客 +7s · +${aleGold} G</small></div>
        </button>
      </section>
      <section class="ls-hall" aria-label="酒馆大堂">
        ${
          shift.activeEvent
            ? `<button type="button" class="ls-alert" data-live="event-open"><strong>${shift.activeEvent.def.badge} 突发事件：${escapeText(shift.activeEvent.def.title)}</strong><span>🎲 2D6 检定</span></button>`
            : `<div class="ls-hall-top"><span>热销：${shift.weather.hotTags.map((t) => `<em class="tv-tag hot">${escapeText(t)} +${Math.round(shift.weather.tagBonus * 100)}%</em>`).join('')}</span><small>${shift.lastAutoProc ? escapeText(shift.lastAutoProc.note) : '点击餐桌迎宾 · 点单 · 上菜 · 收银'}</small></div>`
        }
        <div class="ls-tables">${tablesHtml()}</div>
        <div class="ls-crew-bar">
          ${Object.entries(SERVICE_ROLES)
            .map(([role, label]) => {
              const m = staffMember(role);
              const lv = shift.staffLevels?.[role] || 0;
              return `<div class="ls-crew-pill ${shift.lastAutoProc?.role === role ? 'proc' : ''}"><span>${escapeText(label)}</span><b>${escapeText(m?.setting.name || '—')}</b><small>${role === 'cook' ? `火候${formatMod(cookMod)}` : `自动${serviceAutoChance(lv)}%`}</small></div>`;
            })
            .join('')}
        </div>
      </section>
      <section class="ls-kitchen tv-panel" aria-label="后厨灶台与传菜口">
        <div class="ls-staff-strip">
          ${cook ? `<img src="${escapeText(portraitUrl(cook.combat))}" alt="">` : ''}
          <div><strong>主厨 · ${escapeText(cook?.setting.name || '未指派')}</strong><small>火候 2D6 ${escapeText(formatMod(cookMod))} · 可亲手小游戏精烹</small></div>
          ${shift.orders.length ? `<span class="ls-pending-badge">待烹 ${shift.orders.length}</span>` : ''}
        </div>
        <div class="ls-stoves">${stovesHtml()}</div>
        <div class="ls-col-cap"><span>◆ 出菜传菜口 (${shift.plates.length})</span><small>点击立即上桌</small></div>
        <div class="ls-pass">
          ${
            shift.plates.length
              ? shift.plates
                  .slice(0, 4)
                  .map((p) => {
                    const dish = SERVICE_CATALOG_MAP[p.recipeId];
                    const [qLabel, qColor] = qualityBadge(p.quality);
                    return `<button type="button" class="ls-plate" data-live-plate="${p.uid}">
                      <span class="ls-plate-art">${dishArt(dish)}</span>
                      <div><b style="color:${qColor}">${qLabel}</b> <strong>${escapeText(dish?.name || '')}</strong><small>送往 ${p.tableIdx + 1} 号桌</small></div>
                      <span>上菜</span>
                    </button>`;
                  })
                  .join('')
              : '<div class="ls-empty-box">出锅料理呈放于此 · 亲手小游戏或火候检定可产出极品加价！</div>'
          }
        </div>
        ${
          shift.sigMenu.length
            ? `<div class="ls-pantry-strip"><strong>特色菜可做：</strong>${shift.sigMenu
                .map((id) => {
                  const dish = SERVICE_CATALOG_MAP[id];
                  if (!dish) return '';
                  const left = liveCraftableCount(dish, shift.pantry);
                  return `<span class="${left > 0 ? 'ok' : 'out'}">${escapeText(dish.name)} ×${left}</span>`;
                })
                .join('')}</div>`
            : ''
        }
      </section>
    </div>
    <div class="ls-float-layer" aria-hidden="true"></div>
    <div class="ls-modal-host" data-modal-key="${escapeText(modalKeyForShift())}">${modalMarkup()}</div>`;
    syncTimersAndHud();
  }

  function normalized(area, event) {
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const svg = area.querySelector('[data-cook-art]');
    const matrix = svg?.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return { x: clamp(point.x / 600), y: clamp(point.y / 300) };
    }
    const rect = area.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.x) / rect.width),
      y: clamp((event.clientY - rect.y) / rect.height),
    };
  }

  function tick(now) {
    if (!shift || !board.open) return;
    const rawDt = Math.min(0.2, Math.max(0, (now - lastTick) / 1000)) * speed;
    lastTick = now;
    const prevKey = `${shift.queue.length}:${shift.tables.map((t) => t.state).join()}:${shift.stoves.map((s) => `${s.status}${Math.floor(s.progress * 10)}`).join()}:${shift.plates.length}:${shift.finished}:${Boolean(shift.activeEvent)}`;
    advanceLiveService(shift, rawDt);
    const nextKey = `${shift.queue.length}:${shift.tables.map((t) => t.state).join()}:${shift.stoves.map((s) => `${s.status}${Math.floor(s.progress * 10)}`).join()}:${shift.plates.length}:${shift.finished}:${Boolean(shift.activeEvent)}`;
    if (prevKey !== nextKey || shift.elapsed - savedAt >= 5) {
      render();
      if (shift.elapsed - savedAt >= 5) save();
    } else {
      syncTimersAndHud();
      if (!shift.finished) {
        const bars = [...board.querySelectorAll('.ls-queue-list .ls-pbar i')];
        shift.queue.forEach((g, idx) => {
          if (bars[idx]) {
            const pct = Math.max(0, Math.round((g.patience / Math.max(1, g.maxPatience)) * 100));
            bars[idx].style.width = `${pct}%`;
          }
        });
      }
    }
    if (!shift.finished) frame = requestAnimationFrame(tick);
  }

  function stepMiniGame(type, point, dt = 0) {
    if (!shift?.activeMiniGame) return;
    const res = inputLiveCookMiniGame(shift, {
      type,
      from: gesture?.point || point,
      to: point,
      start: gesture?.start || point,
      seconds: dt,
    });
    if (!res.valid) return;
    if (gesture) gesture.point = point;
    const area = board.querySelector('[data-activity]');
    if (res.done) {
      const finalActivity = {
        ...shift.activeMiniGame?.activity,
        state: res.activity?.state || { progress: 1 },
      };
      gesture = null;
      playCue('service-done');
      if (area) {
        paintServiceActivity(area, finalActivity, false);
        area.setAttribute('data-complete', '');
      }
      clearTimeout(cookingCloseTimer);
      cookingCloseTimer = window.setTimeout(() => {
        cookingCloseTimer = 0;
        render();
        save();
        floatNotice('✦ 精烹出锅！★极品 ×1.35', 'gold');
      }, 280);
    } else if (area) {
      paintServiceActivity(area, res.activity, Boolean(gesture));
    }
  }

  context.events.on(board, 'pointerdown', (event) => {
    const area = event.target.closest('[data-activity]');
    if (!area || !shift?.activeMiniGame || event.button !== 0) return;
    event.preventDefault();
    const point = normalized(area, event);
    gesture = {
      id: event.pointerId,
      area,
      kind: area.dataset.activity,
      start: point,
      point,
      trail: [point],
      time: event.timeStamp,
    };
    board.setPointerCapture(event.pointerId);
    stepMiniGame('start', point, 0);
  });

  context.events.on(board, 'pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dt = Math.max(0, (event.timeStamp - gesture.time) / 1000);
    gesture.time = event.timeStamp;
    const point = normalized(gesture.area, event);
    if (gesture.area.hasAttribute('data-kitchen')) {
      gesture.trail.push(point);
      if (gesture.trail.length > 9) gesture.trail.shift();
      paintCookingTrail(gesture.area, gesture.trail);
    }
    stepMiniGame('move', point, dt);
  });

  function endPointer(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const point = normalized(gesture.area, event);
    gesture = null;
    if (event.type === 'pointerup') stepMiniGame('release', point, 0);
  }
  context.events.on(board, 'pointerup', endPointer);
  context.events.on(board, 'pointercancel', endPointer);

  context.events.on(board, 'click', (event) => {
    if (!shift) return;
    const target = event.target.closest('button');
    if (!target) return;
    const action = target.dataset.live;
    if (action === 'speed') {
      speed = speed === 1 ? 1.4 : 1;
      return render();
    }
    if (action === 'end') {
      closeLiveShiftEarly(shift);
      return render();
    }
    if (action === 'settle-done') {
      const doneShift = shift;
      close();
      closeShift(doneShift);
      return;
    }
    if (action === 'fever') {
      if (triggerLiveFever(shift)) {
        playCue('service-bell');
        floatNotice('✦ 狂欢时间！售价 +35%', 'gold');
        render();
      }
      return;
    }
    if (action === 'ale') {
      const res = pourLiveAle(shift);
      if (res) {
        playCue('service-pour');
        floatNotice(`敬麦酒 +${res.gold}G`, 'gold');
        save();
        render();
      }
      return;
    }
    if (action === 'mg-close') {
      closeLiveCookMiniGame(shift);
      return render();
    }
    if (action === 'cook-reroll' && rerollLiveCookDc(shift)) return render();
    if (action === 'cook-confirm') {
      const res = confirmLiveCookDc(shift);
      if (res) {
        playCue('service-done');
        floatNotice(res.quality === 'divine' ? '✦ 双六神品！×1.75' : '已盛盘出锅！', 'gold');
        save();
        render();
      }
      return;
    }
    if (action === 'vip-cancel') {
      shift.vipModalTableIdx = null;
      return render();
    }
    if (action === 'event-open') return render();
    if (action === 'event-reroll' && rerollLiveEventCheck(shift)) return render();
    if (action === 'event-confirm') {
      const res = confirmLiveEventCheck(shift);
      if (res) {
        playCue(res.won ? 'service-done' : 'service-fail');
        floatNotice(
          res.ingName ? `获得 ${res.ingName}` : res.won ? '事件顺利化解！' : '惜败收场',
          res.won ? 'gold' : 'bad',
        );
        save();
        render();
      }
      return;
    }
    if (target.dataset.liveSeat) {
      if (seatLiveGuest(shift, Number(target.dataset.liveSeat))) {
        playCue('service-done');
        save();
        render();
      }
      return;
    }
    if (target.dataset.liveTable !== undefined) {
      const res = clickLiveTable(shift, Number(target.dataset.liveTable));
      if (res.action === 'pay') {
        playCue('service-coin');
        floatNotice(`+${res.gold} 金币`, 'gold');
      } else if (res.action !== 'none' && res.action !== 'eating') {
        playCue('service-done');
      }
      save();
      return render();
    }
    if (target.dataset.liveVipPick) {
      chooseLiveVipDish(shift, shift.vipModalTableIdx, target.dataset.liveVipPick);
      playCue('service-done');
      save();
      return render();
    }
    if (target.dataset.liveStove !== undefined) {
      clickLiveStove(shift, Number(target.dataset.liveStove));
      return render();
    }
    if (target.dataset.liveMinigame !== undefined) {
      clickLiveStove(shift, Number(target.dataset.liveMinigame));
      return render();
    }
    if (target.dataset.liveBoost !== undefined) {
      if (boostLiveStove(shift, Number(target.dataset.liveBoost))) {
        playCue('service-sizzle');
        render();
      }
      return;
    }
    if (target.dataset.livePlate) {
      if (serveLivePlate(shift, Number(target.dataset.livePlate))) {
        playCue('service-tray');
        save();
        render();
      }
      return;
    }
    if (target.dataset.liveEvOpt !== undefined) {
      pickLiveEventOption(shift, Number(target.dataset.liveEvOpt));
      return render();
    }
  });

  function close() {
    cancelAnimationFrame(frame);
    clearTimeout(cookingCloseTimer);
    cookingCloseTimer = 0;
    gesture = null;
    shift = null;
    if (board.open) board.close();
  }

  return {
    open(value) {
      if (shift === value && board.open) return;
      close();
      shift = value;
      speed = 1;
      savedAt = shift.elapsed || 0;
      board.showModal();
      playCue('service-bell');
      render();
      lastTick = performance.now();
      if (!shift.finished) frame = requestAnimationFrame(tick);
    },
    close,
    dispose() {
      close();
      board.remove();
    },
  };
}
