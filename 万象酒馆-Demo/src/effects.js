import { BUFFS } from './data.js';
import { createStatusEffects, triggeredStatusVisuals } from './status-effects.js';
import { createCombatDetails } from './combat-details.js';
import { attackStyle, ATTACK_TIMING } from './combat-art.js';
import { abilityFor, definition } from './catalog.js';
import { emblemVisualFor } from './emblems.js';
import { createPixelFxStage } from './pixelfx-stage.js';
import {
  DIRECTIONAL_PIXELFX,
  inferDamageType,
  resolveBasicAttackType,
  resolveDamagePixelFx,
  skillDealsDamage,
} from './damage-types.js';
import { roundBanner } from './motion.js';
import { createApepEffects } from './apep-effects.js';
import { createOverlordEffects } from './overlord-effects.js';
import { APEP_ID, APEP_PALETTE, APEP_RELEASE, apepAttack } from './apep-presentation.js';
export function createEffects(layer, center, getSpeed, options = {}) {
  const active = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pixelFx = createPixelFxStage(layer, getSpeed);
  function animate(el, frames, duration = 650, delay = 0) {
    active.add(el);
    layer.append(el);
    el.animate(
      reduced && !el.classList.contains('overlord-mechanic-fx')
        ? [{ opacity: 0 }, { opacity: 0.65, offset: 0.2 }, { opacity: 0 }]
        : frames,
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
  const statuses = createStatusEffects({ animate, ring, sparks });
  const details = createCombatDetails({ animate });
  const apep = createApepEffects({ pixelFx, animate, ring, sparks, reduced });
  const overlord = createOverlordEffects({ center, animate, pixelFx, reduced });
  const COMBINE_SKILLS = new Set([
    'emblem-balance',
    'emblem-overload',
    'emblem-dragon-vein',
    'emblem-deceit-sacrifice',
    'emblem-moon-eye',
  ]);
  const DRAGON_PALETTE = ['#0a3d33', '#1c806a', '#38e89e', '#9dffda', '#ffffff'];
  const ALCHEMICAL_PALETTE = [
    '#12081f',
    '#2d1846',
    '#6b3fa0',
    '#9f6ef5',
    '#58e6a9',
    '#f2cf78',
    '#fff3c4',
    '#ffffff',
  ];
  const BRASS_SHARD_PALETTE = ['#2b1e10', '#634822', '#9e7634', '#d8b058', '#fff2b0', '#ffffff'];

  function skillPixelFxConfig(e, d, skillDef, targetCount) {
    if (skillDef?.vfx) {
      return {
        id: skillDef.vfx,
        palette: skillDef.vfxPalette || null,
        directional: DIRECTIONAL_PIXELFX.has(skillDef.vfx),
      };
    }
    const targetKind = skillDef?.target || '';
    if (
      !e.damageType &&
      skillDef &&
      (targetKind === 'self' ||
        targetKind.includes('Ally') ||
        targetKind === 'allAllies' ||
        !skillDealsDamage(skillDef))
    ) {
      if (skillDef.effects?.some((ef) => ef.type === 'shield')) {
        return { id: 'divine-shield', palette: null, directional: false };
      }
      if (skillDef.effects?.some((ef) => ef.type === 'heal' || ef.type === 'selfHeal')) {
        return {
          id: targetCount > 1 || targetKind === 'allAllies' ? 'heal-aoe' : 'heal',
          palette: null,
          directional: false,
        };
      }
      return { id: 'blessing', palette: null, directional: false };
    }
    const isBasic = e.skill === 'attack' || !skillDef;
    const damageType =
      e.damageType ||
      (isBasic
        ? resolveBasicAttackType(d)
        : inferDamageType(skillDef, d) || resolveBasicAttackType(d));
    const aoe = targetCount > 1 || targetKind === 'allEnemies';
    return resolveDamagePixelFx(damageType, { aoe, basic: isBasic, skillDef });
  }

  function spawnPixelFx(e, before, d, source, impactDelay) {
    const state = e.after || before;
    const targetPoints = (e.targets || [])
      .map((id) => ({ id, p: center(id) }))
      .filter((item) => item.p);
    let spawned = false;

    const lambAttack = apepAttack(e);
    if (lambAttack) {
      apep.attack(
        lambAttack,
        source,
        targetPoints.map(({ p }) => p),
        options.plagueFloorPoints?.() || [],
        impactDelay,
      );
      spawned = true;
    } else if (e.actor === APEP_ID && e.type === 'sinkingPlague') {
      apep.tick(
        options.plagueFloorPoints?.() || [],
        targetPoints.map(({ p }) => p),
      );
      spawned = true;
    } else if (e.actor === APEP_ID && e.type === 'bossPhase') {
      apep.phase(source);
      spawned = true;
    } else if (e.type === 'bossPhase' && source) {
      if (e.overlord) {
        pixelFx.spawn('mana-burst', {
          x: source.x,
          y: source.y,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.85,
        });
        pixelFx.spawn('heavy-landing', {
          x: source.x,
          y: source.y,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.9,
          delay: 70,
        });
        pixelFx.spawn('crit-hit', {
          x: source.x,
          y: source.y,
          palette: BRASS_SHARD_PALETTE,
          scale: 1.65,
          delay: 130,
        });
        options.onImpact?.({ heavy: true, delay: 90, hitStopMs: 105 });
      } else {
        pixelFx.spawn('dark-explosion', {
          x: source.x,
          y: source.y,
          scale: 1.9,
        });
        options.onImpact?.({ heavy: true, delay: 80 });
      }
      spawned = true;
    } else if (e.type === 'bombDetonate') {
      const point = targetPoints[0]?.p || source;
      if (point) {
        pixelFx.spawn('crit-hit', {
          x: point.x,
          y: point.y,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.65,
        });
        pixelFx.spawn('dark-explosion', {
          x: point.x,
          y: point.y,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.85,
          delay: 30,
        });
        pixelFx.spawn('mana-burst', {
          x: point.x,
          y: point.y,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.6,
          delay: 70,
        });
        pixelFx.spawn('acid-splash', {
          x: point.x,
          y: point.y,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.7,
          delay: 120,
        });
        options.onImpact?.({ heavy: true, delay: 40, hitStopMs: 110 });
        spawned = true;
      }
    } else if (e.type === 'bombDefuse') {
      const point = targetPoints[0]?.p || source;
      if (point) {
        pixelFx.spawn('halo', { x: point.x, y: point.y, scale: 1.55 });
        pixelFx.spawn('parry', { x: point.x, y: point.y, scale: 1.45, delay: 70 });
        spawned = true;
      }
    } else if (e.bombArmed) {
      if (targetPoints[0]?.p) {
        const tp = targetPoints[0].p;
        pixelFx.spawn('magic-circle-cast', {
          x: tp.x,
          y: tp.y,
          anchorToOrigin: true,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.45,
          delay: Math.max(320, impactDelay * 0.65),
        });
        pixelFx.spawn('time-stop', {
          x: tp.x,
          y: tp.y,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.45,
          delay: Math.max(420, impactDelay * 0.78),
        });
        pixelFx.spawn('crit-hit', {
          x: tp.x,
          y: tp.y,
          palette: BRASS_SHARD_PALETTE,
          scale: 1.25,
          delay: Math.max(460, impactDelay * 0.85),
        });
        pixelFx.spawn('acid-splash', {
          x: tp.x,
          y: tp.y,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.25,
          delay: Math.max(480, impactDelay * 0.88),
        });
      }
      spawned = true;
    } else if (e.type === 'engage') {
      const point = source || targetPoints[0]?.p;
      const visual = emblemVisualFor(d?.emblemId);
      if (point) {
        ring(point, visual.primary, 'impact-ring');
        sparks(point, visual.glow, reduced ? 4 : 12);
        pixelFx.spawn(visual.engageFx, {
          x: point.x,
          y: point.y,
          palette: visual.pixelfxPalette,
          scale: 1.9,
          maxDuration: 1200,
        });
        options.onImpact?.({ heavy: true, delay: 90 });
        spawned = true;
      }
    } else if (e.skill && COMBINE_SKILLS.has(e.skill)) {
      const visual = emblemVisualFor(d?.emblemId);
      const pts = targetPoints.length ? targetPoints.slice(0, 3) : source ? [{ p: source }] : [];
      for (const item of pts) {
        pixelFx.spawn(visual.skillFx, {
          x: item.p.x,
          y: item.p.y,
          palette: visual.pixelfxPalette,
          delay: impactDelay * 0.55,
          scale: 1.85,
        });
      }
      if (source && e.skill === 'emblem-overload') {
        pixelFx.spawn('spark-arc', {
          x: source.x,
          y: source.y,
          palette: visual.pixelfxPalette,
          scale: 1.5,
        });
      } else if (source && e.skill === 'emblem-balance') {
        pixelFx.spawn('halo', {
          x: source.x,
          y: source.y,
          palette: visual.pixelfxPalette,
          scale: 1.55,
        });
      } else if (e.skill === 'emblem-dragon-vein') {
        const frontSlots = (state?.formation || []).slice(0, 3).filter(Boolean);
        for (const fid of frontSlots) {
          const fp = center(fid);
          if (fp) {
            pixelFx.spawn('ripples', {
              x: fp.x,
              y: fp.y,
              palette: DRAGON_PALETTE,
              delay: impactDelay * 0.65,
              scale: 1.5,
            });
          }
        }
      }
      options.onImpact?.({ heavy: true, delay: impactDelay });
      spawned = true;
    } else if (e.type === 'counter' || e.type === 'emblem') {
      const visual = emblemVisualFor(d?.emblemId);
      const point = targetPoints[0]?.p || source;
      if (point) {
        const directional = DIRECTIONAL_PIXELFX.has(visual.passiveFx);
        const side = before?.units?.[e.actor]?.side || 'hero';
        pixelFx.spawn(visual.passiveFx, {
          x: point.x,
          y: point.y,
          palette: visual.pixelfxPalette,
          delay: impactDelay * 0.6,
          scale: directional ? 1.44 : 1.5,
          ...(directional ? { rotateDeg: side === 'enemy' ? 90 : -90 } : {}),
        });
        spawned = true;
      }
    } else if (['hero', 'enemy', 'entrySkill'].includes(e.type)) {
      const skillDef =
        e.skill && e.skill !== 'attack'
          ? abilityFor(state, e.actor, e.skill) || abilityFor(before, e.actor, e.skill)
          : null;
      const pts = targetPoints.length ? targetPoints.slice(0, 3) : source ? [{ p: source }] : [];
      const fxConfig = skillPixelFxConfig(e, d, skillDef, pts.length);
      const attackerSide =
        before?.units?.[e.actor]?.side || (e.type === 'enemy' ? 'enemy' : 'hero');
      const rotateDeg = fxConfig.directional ? (attackerSide === 'enemy' ? 90 : -90) : 0;
      for (const item of pts) {
        pixelFx.spawn(fxConfig.id, {
          x: item.p.x,
          y: item.p.y,
          ...(fxConfig.palette ? { palette: fxConfig.palette } : {}),
          delay: impactDelay * (skillDef?.vfx ? 0.52 : 0.68),
          scale: fxConfig.directional ? (skillDef?.vfx ? 1.48 : 1.38) : skillDef?.vfx ? 1.62 : 1.44,
          ...(rotateDeg ? { rotateDeg } : {}),
        });
        if (e.type === 'enemy' && d?.overlord && e.damageType) {
          pixelFx.spawn(pts.length > 1 ? 'heavy-landing' : 'hammer-smash', {
            x: item.p.x,
            y: item.p.y,
            palette: ALCHEMICAL_PALETTE,
            delay: impactDelay * 0.85,
            scale: pts.length > 1 ? 1.85 : 1.65,
          });
          pixelFx.spawn('crit-hit', {
            x: item.p.x,
            y: item.p.y,
            palette: BRASS_SHARD_PALETTE,
            delay: impactDelay * 0.92,
            scale: 1.5,
          });
        }
        spawned = true;
      }
    }

    const heavyHit =
      (e.type === 'enemy' && d?.overlord && Boolean(e.damageType)) ||
      Object.values(e.after?.units || {}).some(
        (u) => (before?.units?.[u.id]?.hp ?? u.hp) - u.hp >= 10,
      );
    if (e.type !== 'bombDetonate' && !(e.type === 'bossPhase' && e.overlord) && heavyHit)
      options.onImpact?.({
        heavy: true,
        delay: impactDelay * 0.94,
        hitStopMs: d?.overlord ? 115 : 85,
      });
    if (spawned) options.onSpawn?.();
  }

  function play(e, before, records, playOpts = {}) {
    const lambAttack = apepAttack(e);
    const lambPhase = e.actor === APEP_ID && e.type === 'bossPhase';
    const d = definition(e.after, e.actor),
      source = playOpts.sourceOverride || center(e.actor),
      attack = records.find((r) => r.id === e.actor),
      style = attackStyle(e) || d?.weapon || 'sword',
      isAction = ['hero', 'enemy', 'entrySkill', 'counter'].includes(e.type),
      duration = playOpts.durationOverride || (isAction ? ATTACK_TIMING[style] || 640 : 0),
      impactDelay = isAction
        ? duration * (lambAttack ? APEP_RELEASE : d?.overlord && e.type === 'enemy' ? 0.21 : 0.7)
        : 0;
    const mechanicEnd = overlord.play(e, impactDelay, playOpts.retiredAnchors);
    spawnPixelFx(e, before, d, source, impactDelay);
    if (e.type === 'bossPhase' && source && !lambPhase) {
      if (e.overlord) {
        ring(source, '#ffd978', 'boss-phase-ring');
        sparks(source, '#6bf5a9', reduced ? 6 : 22);
      } else {
        roundBanner(`${d.name} · 第二阶段`);
        ring(source, d.color || '#d78ffe', 'boss-phase-ring');
        sparks(source, '#d9a1ff', reduced ? 4 : 16);
      }
      const flash = document.createElement('div');
      flash.className = 'boss-phase-flash';
      flash.setAttribute('aria-label', 'Boss阶段转换');
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
    } else if (e.type === 'bombDetonate') {
      for (const tid of e.targets || []) {
        const tp = center(tid);
        if (!tp) continue;
        ring(tp, '#ff687c', 'boss-phase-ring', 40);
        sparks(tp, '#f5c768', reduced ? 4 : 16, 40);
        floating({ x: tp.x, y: tp.y - 46 }, '💥 超时引爆', 'break-number', 60);
        const rec = records.find((item) => item.id === tid);
        if (rec)
          rec.hit = { start: performance.now() + 40, duration: 360 / getSpeed(), heavy: true };
      }
    } else if (e.type === 'bombDefuse') {
      for (const tid of e.targets || []) {
        const tp = center(tid);
        if (!tp) continue;
        ring(tp, '#73f0ac', 'shield-ring', 40);
        floating({ x: tp.x, y: tp.y - 42 }, '✦ 拆弹成功', 'shield-number', 60);
      }
    } else if (e.bombArmed) {
      const bombLandDelay = duration
        ? Math.round(duration * 0.22 + Math.min(460, duration * 0.25))
        : 620;
      const tp = center(e.bombArmed.target);
      if (tp) {
        ring(tp, '#6bf5a9', 'cast-rune', bombLandDelay);
        floating(
          { x: tp.x, y: tp.y - 48 },
          `⏱ 炼金炸弹 · ${e.bombArmed.durationSec}s`,
          'equipment-proc-number',
          bombLandDelay + 20,
        );
      }
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
    if (e.chargeStarted && source) {
      if (e.actor === APEP_ID) {
        pixelFx.spawn('eclipse', {
          x: source.x,
          y: source.y,
          anchorToOrigin: true,
          palette: APEP_PALETTE,
          light: 0.45,
          scale: 1.5,
          delay: 100,
        });
        pixelFx.spawn('shadow-flames', {
          x: source.x,
          y: source.y,
          anchorToOrigin: true,
          palette: APEP_PALETTE,
          light: 0.46,
          scale: 1.18,
          delay: 150,
        });
        sparks(source, '#c73c64', reduced ? 4 : 16, 120);
        floating({ x: source.x, y: source.y - 54 }, '◉ 晦暗凝蓄', 'apep-plague-number', 140);
      } else {
        pixelFx.spawn('magic-circle-cast', {
          x: source.x,
          y: source.y,
          anchorToOrigin: true,
          palette: ALCHEMICAL_PALETTE,
          scale: 1.55,
          delay: 100,
        });
        sparks(source, '#ffd96b', reduced ? 4 : 16, 120);
        floating({ x: source.x, y: source.y - 54 }, '⚡ 蓄力聚能', 'equipment-proc-number', 140);
      }
      options.onSpawn?.();
    }
    if (isAction && source) details.thread(layer, source, d?.color, duration);
    const signals = triggeredStatusVisuals(e, before);
    for (const signal of signals) {
      const sp = center(signal.id);
      if (!sp) continue;
      if (signal.type === 'breakSkip') {
        floating({ x: sp.x, y: sp.y - 34 }, '✦ 破防打断', 'break-number', 60);
        continue;
      }
      const lambStatus = lambAttack && ['poison', 'weak'].includes(signal.type);
      const statusDelay = lambStatus ? impactDelay : signal.type === 'bleed' ? duration * 0.8 : 0;
      statuses.trigger(signal, sp, statusDelay, lambStatus ? '#ee9297' : null);
      if (signal.type === 'artifactBlock') {
        floating({ x: sp.x, y: sp.y - 44 }, '⚙ 人工制品抵消', 'shield-number', impactDelay * 0.5);
      }
      if (signal.type === 'break') {
        options.onImpact?.({ heavy: true, delay: impactDelay * 0.78, hitStopMs: 125 });
        ring(sp, '#ffd86b', 'boss-phase-ring', impactDelay * 0.7);
        pixelFx.spawn('crit-hit', {
          x: sp.x,
          y: sp.y,
          palette: BRASS_SHARD_PALETTE,
          scale: 1.75,
          delay: impactDelay * 0.65,
        });
        pixelFx.spawn('mana-burst', {
          x: sp.x,
          y: sp.y - 18,
          palette: BRASS_SHARD_PALETTE,
          scale: 1.55,
          delay: impactDelay * 0.82,
        });
        floating({ x: sp.x, y: sp.y - 56 }, '✦ BREAK · 破防失衡', 'break-number', impactDelay);
        options.onSpawn?.();
      }
    }
    if (attack && isAction && !lambAttack) {
      const overlordLeap = Boolean(d?.overlord && e.type === 'enemy' && e.damageType);
      attack.attack = overlordLeap
        ? {
            start: performance.now(),
            duration: Math.min(340, duration * 0.22) / getSpeed(),
            distance: -0.12,
            lift: 0.04,
            tilt: -0.02,
          }
        : {
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
            duration: (d?.overlord ? 340 : 240) / getSpeed(),
            heavy: Boolean(d?.overlord),
          };
        if (!lambAttack) details.trace(p, style, impactDelay);
        if (old.block > u.block) statuses.shield(p, u.block === 0, impactDelay);
        if (e.type === 'hero' && ['delay', 'hourglass', 'stillness'].includes(e.skill))
          ring(p, '#88e8dd', 'clock-effect', impactDelay);
      }
    }
    for (const [id, u] of Object.entries(e.after.units)) {
      const old = before.units[id],
        p = center(id);
      if (!old || !p || u.withdrawn) continue;
      const hp = u.hp - old.hp,
        shield = u.block - old.block,
        mp = u.mp - old.mp;
      if (hp)
        floating(
          p,
          `${hp > 0 ? '+' : ''}${hp}`,
          hp > 0
            ? 'heal'
            : e.type === 'sinkingPlague'
              ? 'apep-plague-number'
              : e.type === 'poison'
                ? 'poison-number'
                : old.broken && hp < 0
                  ? 'break-amp-number'
                  : '',
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
    return Math.max(
      duration,
      mechanicEnd,
      signals.length || ['bossPhase', 'bombDetonate', 'bombDefuse'].includes(e.type) || e.bombArmed
        ? 850
        : 0,
    );
  }
  return {
    play,
    update: pixelFx.update,
    status: pixelFx.status,
    dispose() {
      pixelFx.dispose();
      for (const el of active) {
        el.getAnimations().forEach((a) => a.cancel());
        el.remove();
      }
      active.clear();
    },
  };
}
