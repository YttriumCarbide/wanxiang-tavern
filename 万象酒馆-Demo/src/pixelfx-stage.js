import { composite, clearFrame, createFrame, createFx } from '../vendor/pixelfx/core/index.js';
import * as holyPillar from '../vendor/pixelfx/fx/holy/holy-pillar.js';
import * as blessing from '../vendor/pixelfx/fx/holy/blessing.js';
import * as halo from '../vendor/pixelfx/fx/holy/halo.js';
import * as divineShield from '../vendor/pixelfx/fx/holy/divine-shield.js';
import * as healAoe from '../vendor/pixelfx/fx/holy/heal-aoe.js';
import * as smite from '../vendor/pixelfx/fx/holy/smite.js';
import * as starFall from '../vendor/pixelfx/fx/arcane/star-fall.js';
import * as arcaneBeam from '../vendor/pixelfx/fx/arcane/arcane-beam.js';
import * as runeCircle from '../vendor/pixelfx/fx/arcane/rune-circle.js';
import * as magicCircleCast from '../vendor/pixelfx/fx/arcane/magic-circle-cast.js';
import * as manaBurst from '../vendor/pixelfx/fx/arcane/mana-burst.js';
import * as chainLightning from '../vendor/pixelfx/fx/lightning/chain-lightning.js';
import * as chargeUp from '../vendor/pixelfx/fx/lightning/charge-up.js';
import * as zapHit from '../vendor/pixelfx/fx/lightning/zap-hit.js';
import * as sparkArc from '../vendor/pixelfx/fx/lightning/spark-arc.js';
import * as geyser from '../vendor/pixelfx/fx/water/geyser.js';
import * as waveCrash from '../vendor/pixelfx/fx/water/wave-crash.js';
import * as ripples from '../vendor/pixelfx/fx/water/ripples.js';
import * as hexSigil from '../vendor/pixelfx/fx/shadow/hex-sigil.js';
import * as shadowFlames from '../vendor/pixelfx/fx/shadow/shadow-flames.js';
import * as curse from '../vendor/pixelfx/fx/shadow/curse.js';
import * as darkExplosion from '../vendor/pixelfx/fx/shadow/dark-explosion.js';
import * as eclipse from '../vendor/pixelfx/fx/shadow/eclipse.js';
import * as lifeSteal from '../vendor/pixelfx/fx/shadow/life-steal.js';
import * as swordSlash from '../vendor/pixelfx/fx/melee/sword-slash.js';
import * as doubleSlash from '../vendor/pixelfx/fx/melee/double-slash.js';
import * as heavyCleave from '../vendor/pixelfx/fx/melee/heavy-cleave.js';
import * as spinSlash from '../vendor/pixelfx/fx/melee/spin-slash.js';
import * as thrust from '../vendor/pixelfx/fx/melee/thrust.js';
import * as critHit from '../vendor/pixelfx/fx/impacts/crit-hit.js';
import * as parry from '../vendor/pixelfx/fx/impacts/parry.js';
import * as shieldBlock from '../vendor/pixelfx/fx/impacts/shield-block.js';
import * as groundSlam from '../vendor/pixelfx/fx/impacts/ground-slam.js';
import * as leafStorm from '../vendor/pixelfx/fx/nature/leaf-storm.js';
import * as thorns from '../vendor/pixelfx/fx/nature/thorns.js';
import * as tornado from '../vendor/pixelfx/fx/nature/tornado.js';

export const EFFECT_REGISTRY = Object.freeze({
  'holy-pillar': holyPillar,
  blessing,
  halo,
  'divine-shield': divineShield,
  'heal-aoe': healAoe,
  smite,
  'star-fall': starFall,
  'arcane-beam': arcaneBeam,
  'rune-circle': runeCircle,
  'magic-circle-cast': magicCircleCast,
  'mana-burst': manaBurst,
  'chain-lightning': chainLightning,
  'charge-up': chargeUp,
  'zap-hit': zapHit,
  'spark-arc': sparkArc,
  geyser,
  'wave-crash': waveCrash,
  ripples,
  'hex-sigil': hexSigil,
  'shadow-flames': shadowFlames,
  curse,
  'dark-explosion': darkExplosion,
  eclipse,
  'life-steal': lifeSteal,
  'sword-slash': swordSlash,
  'double-slash': doubleSlash,
  'heavy-cleave': heavyCleave,
  'spin-slash': spinSlash,
  thrust,
  'crit-hit': critHit,
  parry,
  'shield-block': shieldBlock,
  'ground-slam': groundSlam,
  'leaf-storm': leafStorm,
  thorns,
  tornado,
});

/** Headless PixelFX sample renderer for tests and telemetry. Returns RGBA bytes and active pixel count. */
export function renderEffectSample(id, opts = {}, at = null) {
  const mod = EFFECT_REGISTRY[id];
  if (!mod) throw new Error(`Unknown pixelfx effect: ${id}`);
  const [w, h] = mod.meta?.size || [128, 128];
  const [ox, oy] = mod.meta?.origin || [w >> 1, h >> 1];
  const frame = createFrame(w, h, -ox, -oy);
  const fx = createFx(mod, { seed: 1, ...opts });
  const duration = mod.meta?.duration || 1;
  const targetTime = at ?? Math.min(0.45, Math.max(0.08, duration * 0.36));
  const step = 1 / 30;
  for (let elapsed = 0; elapsed < targetTime; elapsed += step) {
    fx.update(Math.min(step, targetTime - elapsed));
  }
  clearFrame(frame);
  fx.draw(frame);
  const rgba = new Uint8ClampedArray(w * h * 4);
  composite(frame, rgba, null, opts.light ?? 1);
  let visiblePixels = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] > 0) visiblePixels += 1;
  }
  return { id, width: w, height: h, visiblePixels, rgba, duration };
}

export function createPixelFxStage(layer, getSpeed = () => 1) {
  const active = [];
  const history = [];

  function recordHistory(id) {
    history.push(id);
    if (history.length > 24) history.shift();
  }

  function spawn(id, opts = {}) {
    const mod = EFFECT_REGISTRY[id];
    if (!mod || !layer) return 0;

    const [w, h] = mod.meta?.size || [128, 128];
    const [ox, oy] = mod.meta?.origin || [w >> 1, h >> 1];
    const scale = Number.isFinite(opts.scale) ? opts.scale : 1.75;
    const speedRate = Number.isFinite(opts.speedRate) ? opts.speedRate : 1.35;
    const speed = Math.max(0.4, Number(getSpeed?.()) || 1);
    const delayMs = Math.max(0, Number(opts.delay) || 0) / speed;

    const canvas = document.createElement('canvas');
    canvas.className = 'pixelfx-canvas';
    canvas.dataset.effectId = id;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${Math.round(w * scale)}px`;
    canvas.style.height = `${Math.round(h * scale)}px`;
    canvas.style.left = `${Math.round((opts.x ?? 0) - ox * scale)}px`;
    canvas.style.top = `${Math.round((opts.y ?? 0) - oy * scale)}px`;
    canvas.style.opacity = delayMs > 0 ? '0' : '1';
    if (opts.zIndex !== undefined) canvas.style.zIndex = String(opts.zIndex);

    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.imageSmoothingEnabled = false;
    const img = ctx.createImageData(w, h);
    const frame = createFrame(w, h, -ox, -oy);
    const fx = createFx(mod, {
      seed: opts.seed ?? (history.length % 9) + 1,
      ...(opts.palette ? { palette: opts.palette } : {}),
      ...(opts.flip ? { flip: true } : {}),
      ...(opts.angle !== undefined ? { angle: opts.angle } : {}),
      ...(opts.light !== undefined ? { light: opts.light } : {}),
    });

    layer.append(canvas);
    const startAt = performance.now() + delayMs;
    const naturalDuration = Number(mod.meta?.duration) || 1;
    const maxDurationMs =
      opts.maxDuration !== undefined
        ? Number(opts.maxDuration)
        : Math.min(1800, (naturalDuration * 1000) / (speed * speedRate) + 120);

    active.push({
      id,
      canvas,
      ctx,
      img,
      frame,
      fx,
      startAt,
      lastAt: startAt,
      maxDurationMs,
      speedRate,
      light: opts.light ?? 1,
      started: false,
    });
    recordHistory(id);
    return delayMs + maxDurationMs;
  }

  function removeEntry(index) {
    const entry = active[index];
    if (!entry) return;
    entry.canvas.remove();
    active.splice(index, 1);
  }

  function update(now = performance.now()) {
    const speed = Math.max(0.4, Number(getSpeed?.()) || 1);
    for (let i = active.length - 1; i >= 0; i--) {
      const entry = active[i];
      if (now < entry.startAt) continue;
      if (!entry.started) {
        entry.started = true;
        entry.canvas.style.opacity = '1';
        entry.lastAt = entry.startAt;
      }
      const rawDt = Math.max(1 / 60, (now - entry.lastAt) / 1000);
      const dt = Math.min(0.05, rawDt) * speed * entry.speedRate;
      entry.lastAt = now;
      entry.fx.update(dt);
      clearFrame(entry.frame);
      entry.fx.draw(entry.frame);
      composite(entry.frame, entry.img.data, null, entry.light);
      entry.ctx.putImageData(entry.img, 0, 0);
      if (entry.fx.done() || now - entry.startAt >= entry.maxDurationMs) {
        removeEntry(i);
      }
    }
    return active.length > 0;
  }

  function clear() {
    while (active.length) removeEntry(active.length - 1);
  }

  function status() {
    return {
      activeCount: active.length,
      activeEffects: active.map((entry) => entry.id),
      recentEffects: [...history],
    };
  }

  return {
    spawn,
    update,
    clear,
    status,
    dispose: clear,
  };
}
