import { BUFFS } from './data.js';
import { createStatusEffects, triggeredStatusVisuals } from './status-effects.js';
import { createCombatDetails } from './combat-details.js';
import { createAttackEffects } from './attack-effects.js';
import { attackStyle, ATTACK_TIMING } from './combat-art.js';
import { definition } from './catalog.js';
import { roundBanner } from './motion.js';
export function createEffects(layer, center, getSpeed) {
  const active = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animate(el, frames, duration = 650, delay = 0) {
    active.add(el);
    layer.append(el);
    el.animate(
      reduced ? [{ opacity: 0 }, { opacity: 0.65, offset: 0.2 }, { opacity: 0 }] : frames,
      {
        duration: duration / getSpeed(),
        delay: delay / getSpeed(),
        easing: 'ease-out',
        fill: 'backwards',
      },
    )
      .finished.catch(() => {})
      .finally(() => {
        active.delete(el);
        el.remove();
      });
  }
  function ring(point, color, type = 'impact-ring', delay = 0) {
    const el = document.createElement('div');
    el.className = type;
    el.style.cssText = `left:${point.x}px;top:${point.y}px;--fx:${color}`;
    animate(
      el,
      [
        { opacity: 0, scale: '.25' },
        { opacity: 1, scale: '.9', offset: 0.2 },
        { opacity: 0, scale: '1.65' },
      ],
      480,
      delay,
    );
  }
  function sparks(point, color, count = 7, delay = 0) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2,
        el = document.createElement('i');
      el.className = 'effect-spark';
      el.style.cssText = `left:${point.x}px;top:${point.y}px;--fx:${color}`;
      animate(
        el,
        [
          { opacity: 1, translate: '0 0', scale: '1.2' },
          {
            opacity: 0,
            translate: `${Math.cos(angle) * 48}px ${Math.sin(angle) * 48 - 18}px`,
            scale: '.3',
          },
        ],
        400,
        delay,
      );
    }
  }
  function slash(p, color, claw = false, delay = 0) {
    const el = document.createElement('div');
    el.className = claw ? 'claw-effect' : 'slash-effect';
    el.style.cssText = `left:${p.x}px;top:${p.y}px;--fx:${color}`;
    el.innerHTML = claw ? '<i></i><i></i><i></i>' : '<i></i><i></i>';
    animate(
      el,
      [
        { opacity: 0, scale: '.3', rotate: '-25deg' },
        { opacity: 1, scale: '1', rotate: '0deg', offset: 0.35 },
        { opacity: 0, scale: '1.2', rotate: '12deg' },
      ],
      360,
      delay,
    );
  }
  function floating(p, text, kind, delay = 0) {
    const el = document.createElement('div');
    el.className = `floating-number ${kind || ''}`;
    el.textContent = text;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y - 38}px`;
    const equipment = kind === 'equipment-proc-number';
    animate(
      el,
      [
        { opacity: 0, translate: '0 5px' },
        { opacity: 1, translate: '0 -12px', offset: 0.2 },
        ...(equipment
          ? [
              { opacity: 1, translate: '0 -18px', offset: 0.75 },
              { opacity: 0, translate: '0 -36px' },
            ]
          : [{ opacity: 0, translate: '0 -75px' }]),
      ],
      equipment ? 2800 * getSpeed() : 850,
      delay,
    );
  }
  const attacks = createAttackEffects({ animate, ring, sparks, slash });
  const statuses = createStatusEffects({ animate, ring, sparks });
  const details = createCombatDetails({ animate });
  function play(e, before, records) {
    const d = definition(e.after, e.actor),
      source = center(e.actor),
      attack = records.find((r) => r.id === e.actor),
      style = attackStyle(e) || d?.weapon || 'sword',
      isAction = ['hero', 'enemy', 'entrySkill', 'counter'].includes(e.type),
      duration = isAction ? ATTACK_TIMING[style] || 640 : 0,
      impactDelay = isAction ? duration * 0.7 : 0;
    if (e.type === 'bossPhase' && source) {
      roundBanner(`${d.name} · 第二阶段`);
      ring(source, d.color || '#d78ffe', 'boss-phase-ring');
      sparks(source, '#d9a1ff', reduced ? 4 : 16);
      const flash = document.createElement('div');
      flash.className = 'boss-phase-flash';
      flash.setAttribute('aria-label', 'Boss进入第二阶段');
      animate(flash, [{ opacity: 0 }, { opacity: 0.85, offset: 0.18 }, { opacity: 0 }], 1400);
      const shock = document.createElement('div');
      shock.className = 'boss-phase-shockwave';
      shock.style.left = `${source.x}px`;
      shock.style.top = `${source.y}px`;
      animate(
        shock,
        [
          { opacity: 0.95, transform: 'translate(-50%,-50%) scale(0.01)' },
          { opacity: 0.65, offset: 0.4 },
          { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' },
        ],
        1800,
      );
    }
    for (const proc of e.procs || []) {
      if (!proc.equipment) continue;
      const point = center(proc.owner);
      if (point)
        floating(
          { x: point.x, y: point.y - 48 },
          `✧ ${proc.name} · 已触发`,
          'equipment-proc-number',
          impactDelay,
        );
    }
    if (isAction && source) details.thread(layer, source, d?.color, duration);
    const signals = triggeredStatusVisuals(e, before);
    for (const signal of signals) {
      const sp = center(signal.id);
      if (sp) statuses.trigger(signal, sp, signal.type === 'bleed' ? duration * 0.8 : 0);
    }
    if (attack && isAction) {
      attack.attack = {
        start: performance.now(),
        duration: duration / getSpeed(),
        distance:
          (e.type === 'enemy' ? 1 : -1) * (style === 'staff' || style === 'bow' ? 0.12 : 0.55),
        lift: style === 'slime-bounce' ? 0.5 : style === 'mushroom-bonk' ? 0.32 : 0.12,
        tilt: style === 'staff' ? 0.035 : 0.09,
      };
    }
    for (const id of e.targets) {
      const p = center(id),
        u = e.after.units[id],
        old = before.units[id];
      if (!p || !u || !old) continue;
      const friendly = before.units[e.actor]?.side === u.side;
      if (isAction && friendly) {
        ring(p, u.hp > old.hp ? '#b7e9a1' : '#c7d9ad', 'healing-ring', impactDelay);
        sparks(p, '#b2e0a1', 5, impactDelay);
      } else if (isAction) {
        const r = records.find((r) => r.id === id);
        if (r)
          r.hit = {
            start: performance.now() + impactDelay / getSpeed(),
            duration: 240 / getSpeed(),
          };
        attacks.strike(style, source || p, p, d?.color || '#ffd97a');
        details.trace(p, style, impactDelay);
        if (old.block > u.block) statuses.shield(p, u.block === 0, impactDelay);
        if (e.type === 'hero' && ['delay', 'hourglass', 'stillness'].includes(e.skill))
          ring(p, '#88e8dd', 'clock-effect', impactDelay);
      }
    }
    for (const [id, u] of Object.entries(e.after.units)) {
      const old = before.units[id],
        p = center(id);
      if (!old || !p) continue;
      const hp = u.hp - old.hp,
        shield = u.block - old.block,
        mp = u.mp - old.mp;
      if (hp)
        floating(
          p,
          `${hp > 0 ? '+' : ''}${hp}`,
          hp > 0 ? 'heal' : e.type === 'poison' ? 'poison-number' : '',
          impactDelay,
        );
      else if (shield > 0) {
        floating(p, `+${shield} 盾`, 'shield-number', impactDelay);
        statuses.shield(p, false, impactDelay);
      }
      if (mp) floating({ x: p.x + 28, y: p.y + 35 }, `${mp > 0 ? '+' : ''}${mp} 蓝`, 'mana-number');
      if (e.type === 'item') {
        const added = Object.keys(u.buffs).filter(
          (key) => (u.buffs[key] || 0) > (old.buffs[key] || 0),
        );
        if (added.length) {
          ring(p, u.side === 'hero' ? '#e9d692' : '#bc89dd', 'potion-status-ring', impactDelay);
          sparks(p, u.side === 'hero' ? '#f1dc8b' : '#c982df', 10, impactDelay);
          floating(
            { x: p.x, y: p.y - 28 },
            added.map((key) => BUFFS[key]?.name || key).join(' · '),
            'potion-status-number',
            impactDelay,
          );
        }
      }
      if (mp > 0 && e.type === 'item') ring(p, '#79c5e0', 'healing-ring');
      if (hp > 0 && e.type === 'regen') ring(p, '#b9e7a8', 'healing-ring');
      if (hp < 0 && e.type === 'poison') sparks(p, '#b08bd7', 4);
      if (old.hp > 0 && u.hp === 0 && u.side === 'hero') {
        ring(p, '#ba8194', 'death-ring', impactDelay);
        sparks(p, '#aca399', 9, impactDelay);
      }
    }
    return Math.max(duration, signals.length || e.type === 'bossPhase' ? 700 : 0);
  }
  return {
    play,
    dispose() {
      for (const el of active) {
        el.getAnimations().forEach((a) => a.cancel());
        el.remove();
      }
      active.clear();
    },
  };
}
