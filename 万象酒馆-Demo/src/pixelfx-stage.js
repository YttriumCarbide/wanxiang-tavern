import { composite, clearFrame, createFrame, createFx } from '../vendor/pixelfx/core/index.js';
import * as holyPillar from '../vendor/pixelfx/fx/holy/holy-pillar.js';
import * as blessing from '../vendor/pixelfx/fx/holy/blessing.js';
import * as halo from '../vendor/pixelfx/fx/holy/halo.js';
import * as divineShield from '../vendor/pixelfx/fx/holy/divine-shield.js';
import * as heal from '../vendor/pixelfx/fx/holy/heal.js';
import * as healAoe from '../vendor/pixelfx/fx/holy/heal-aoe.js';
import * as smite from '../vendor/pixelfx/fx/holy/smite.js';
import * as sunburst from '../vendor/pixelfx/fx/holy/sunburst.js';
import * as featherBurst from '../vendor/pixelfx/fx/holy/feather-burst.js';
import * as starFall from '../vendor/pixelfx/fx/arcane/star-fall.js';
import * as arcaneBeam from '../vendor/pixelfx/fx/arcane/arcane-beam.js';
import * as arcaneMissiles from '../vendor/pixelfx/fx/arcane/arcane-missiles.js';
import * as arcaneOrb from '../vendor/pixelfx/fx/arcane/arcane-orb.js';
import * as runeCircle from '../vendor/pixelfx/fx/arcane/rune-circle.js';
import * as magicCircleCast from '../vendor/pixelfx/fx/arcane/magic-circle-cast.js';
import * as manaBurst from '../vendor/pixelfx/fx/arcane/mana-burst.js';
import * as timeStop from '../vendor/pixelfx/fx/arcane/time-stop.js';
import * as chainLightning from '../vendor/pixelfx/fx/lightning/chain-lightning.js';
import * as lightningStrike from '../vendor/pixelfx/fx/lightning/lightning-strike.js';
import * as thunderclap from '../vendor/pixelfx/fx/lightning/thunderclap.js';
import * as chargeUp from '../vendor/pixelfx/fx/lightning/charge-up.js';
import * as zapHit from '../vendor/pixelfx/fx/lightning/zap-hit.js';
import * as sparkArc from '../vendor/pixelfx/fx/lightning/spark-arc.js';
import * as geyser from '../vendor/pixelfx/fx/water/geyser.js';
import * as waveCrash from '../vendor/pixelfx/fx/water/wave-crash.js';
import * as ripples from '../vendor/pixelfx/fx/water/ripples.js';
import * as hexSigil from '../vendor/pixelfx/fx/shadow/hex-sigil.js';
import * as shadowFlames from '../vendor/pixelfx/fx/shadow/shadow-flames.js';
import * as shadowTendrils from '../vendor/pixelfx/fx/shadow/shadow-tendrils.js';
import * as soulDrain from '../vendor/pixelfx/fx/shadow/soul-drain.js';
import * as blackHole from '../vendor/pixelfx/fx/shadow/black-hole.js';
import * as voidOrb from '../vendor/pixelfx/fx/shadow/void-orb.js';
import * as curse from '../vendor/pixelfx/fx/shadow/curse.js';
import * as darkExplosion from '../vendor/pixelfx/fx/shadow/dark-explosion.js';
import * as eclipse from '../vendor/pixelfx/fx/shadow/eclipse.js';
import * as lifeSteal from '../vendor/pixelfx/fx/shadow/life-steal.js';
import * as swordSlash from '../vendor/pixelfx/fx/melee/sword-slash.js';
import * as doubleSlash from '../vendor/pixelfx/fx/melee/double-slash.js';
import * as heavyCleave from '../vendor/pixelfx/fx/melee/heavy-cleave.js';
import * as spinSlash from '../vendor/pixelfx/fx/melee/spin-slash.js';
import * as thrust from '../vendor/pixelfx/fx/melee/thrust.js';
import * as spearSweep from '../vendor/pixelfx/fx/melee/spear-sweep.js';
import * as daggerFlurry from '../vendor/pixelfx/fx/melee/dagger-flurry.js';
import * as clawSwipe from '../vendor/pixelfx/fx/melee/claw-swipe.js';
import * as whipCrack from '../vendor/pixelfx/fx/melee/whip-crack.js';
import * as hammerSmash from '../vendor/pixelfx/fx/melee/hammer-smash.js';
import * as uppercut from '../vendor/pixelfx/fx/melee/uppercut.js';
import * as scytheReap from '../vendor/pixelfx/fx/melee/scythe-reap.js';
import * as critHit from '../vendor/pixelfx/fx/impacts/crit-hit.js';
import * as parry from '../vendor/pixelfx/fx/impacts/parry.js';
import * as shieldBlock from '../vendor/pixelfx/fx/impacts/shield-block.js';
import * as groundSlam from '../vendor/pixelfx/fx/impacts/ground-slam.js';
import * as bluntHit from '../vendor/pixelfx/fx/impacts/blunt-hit.js';
import * as hitSpark from '../vendor/pixelfx/fx/impacts/hit-spark.js';
import * as bulletImpact from '../vendor/pixelfx/fx/impacts/bullet-impact.js';
import * as ricochet from '../vendor/pixelfx/fx/impacts/ricochet.js';
import * as impactFrame from '../vendor/pixelfx/fx/impacts/impact-frame.js';
import * as leafStorm from '../vendor/pixelfx/fx/nature/leaf-storm.js';
import * as thorns from '../vendor/pixelfx/fx/nature/thorns.js';
import * as tornado from '../vendor/pixelfx/fx/nature/tornado.js';
import * as acidSplash from '../vendor/pixelfx/fx/nature/acid-splash.js';
import * as quake from '../vendor/pixelfx/fx/nature/quake.js';
import * as boulder from '../vendor/pixelfx/fx/nature/boulder.js';
import * as earthSpike from '../vendor/pixelfx/fx/nature/earth-spike.js';
import * as vineWhip from '../vendor/pixelfx/fx/nature/vine-whip.js';
import * as dissolveBurn from '../vendor/pixelfx/fx/spawn/dissolve-burn.js';
import * as shatterDeath from '../vendor/pixelfx/fx/spawn/shatter-death.js';
import * as burning from '../vendor/pixelfx/fx/status/burning.js';
import * as frozen from '../vendor/pixelfx/fx/status/frozen.js';
import * as stunned from '../vendor/pixelfx/fx/status/stunned.js';
import * as empBlast from '../vendor/pixelfx/fx/scifi/emp-blast.js';
import * as energyCore from '../vendor/pixelfx/fx/scifi/energy-core.js';
import * as glitch from '../vendor/pixelfx/fx/scifi/glitch.js';
import * as heavyLanding from '../vendor/pixelfx/fx/impacts/heavy-landing.js';
import * as hitFlash from '../vendor/pixelfx/fx/impacts/hit-flash.js';
import * as disintegrate from '../vendor/pixelfx/fx/spawn/disintegrate.js';

export const EFFECT_REGISTRY = Object.freeze({
  'holy-pillar': holyPillar,
  blessing,
  halo,
  'divine-shield': divineShield,
  heal,
  'heal-aoe': healAoe,
  smite,
  sunburst,
  'feather-burst': featherBurst,
  'star-fall': starFall,
  'arcane-beam': arcaneBeam,
  'arcane-missiles': arcaneMissiles,
  'arcane-orb': arcaneOrb,
  'rune-circle': runeCircle,
  'magic-circle-cast': magicCircleCast,
  'mana-burst': manaBurst,
  'time-stop': timeStop,
  'chain-lightning': chainLightning,
  'lightning-strike': lightningStrike,
  thunderclap,
  'charge-up': chargeUp,
  'zap-hit': zapHit,
  'spark-arc': sparkArc,
  geyser,
  'wave-crash': waveCrash,
  ripples,
  'hex-sigil': hexSigil,
  'shadow-flames': shadowFlames,
  'shadow-tendrils': shadowTendrils,
  'soul-drain': soulDrain,
  'black-hole': blackHole,
  'void-orb': voidOrb,
  curse,
  'dark-explosion': darkExplosion,
  eclipse,
  'life-steal': lifeSteal,
  'sword-slash': swordSlash,
  'double-slash': doubleSlash,
  'heavy-cleave': heavyCleave,
  'spin-slash': spinSlash,
  thrust,
  'spear-sweep': spearSweep,
  'dagger-flurry': daggerFlurry,
  'claw-swipe': clawSwipe,
  'whip-crack': whipCrack,
  'hammer-smash': hammerSmash,
  uppercut,
  'scythe-reap': scytheReap,
  'crit-hit': critHit,
  parry,
  'shield-block': shieldBlock,
  'ground-slam': groundSlam,
  'blunt-hit': bluntHit,
  'hit-spark': hitSpark,
  'bullet-impact': bulletImpact,
  ricochet,
  'impact-frame': impactFrame,
  'leaf-storm': leafStorm,
  thorns,
  tornado,
  'acid-splash': acidSplash,
  quake,
  boulder,
  'earth-spike': earthSpike,
  'vine-whip': vineWhip,
  'dissolve-burn': dissolveBurn,
  'shatter-death': shatterDeath,
  burning,
  frozen,
  stunned,
  'emp-blast': empBlast,
  'energy-core': energyCore,
  glitch,
  'heavy-landing': heavyLanding,
  'hit-flash': hitFlash,
  disintegrate,
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
    const scale = Number.isFinite(opts.scale) ? opts.scale : 1.48;
    const speedRate = Number.isFinite(opts.speedRate) ? opts.speedRate : 1.35;
    const speed = Math.max(0.4, Number(getSpeed?.()) || 1);
    const delayMs = Math.max(0, Number(opts.delay) || 0) / speed;

    const canvas = document.createElement('canvas');
    canvas.className = 'pixelfx-canvas';
    canvas.dataset.effectId = id;
    canvas.dataset.effect = id;
    if (Number.isFinite(opts.rotateDeg) && opts.rotateDeg !== 0) {
      canvas.dataset.rotateDeg = String(opts.rotateDeg);
    }
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${Math.round(w * scale)}px`;
    canvas.style.height = `${Math.round(h * scale)}px`;
    canvas.style.left = `${Math.round(opts.x ?? 0)}px`;
    canvas.style.top = `${Math.round(opts.y ?? 0)}px`;
    const transforms = ['translate(-50%, -50%)'];
    if (Number.isFinite(opts.rotateDeg) && opts.rotateDeg !== 0) {
      transforms.push(`rotate(${opts.rotateDeg}deg)`);
    }
    if (opts.flipX) {
      transforms.push('scaleX(-1)');
    }
    canvas.style.transform = transforms.join(' ');
    canvas.style.opacity = delayMs > 0 ? '0' : '1';
    if (opts.zIndex !== undefined) canvas.style.zIndex = String(opts.zIndex);

    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.imageSmoothingEnabled = false;
    const img = ctx.createImageData(w, h);
    const frame = createFrame(w, h, -ox, -oy);
    const fx = createFx(mod, {
      seed: opts.seed ?? (history.length % 9) + 1,
      ...(Array.isArray(opts.palette) ? { palette: opts.palette } : {}),
      ...(opts.angle !== undefined ? { angle: opts.angle } : {}),
      ...(opts.light !== undefined ? { light: opts.light } : {}),
    });

    layer.append(canvas);
    const startAt = performance.now() + delayMs;
    const naturalDuration = Number(mod.meta?.duration) || 1;
    const capMs = mod.meta?.loop === true ? 2200 : 4500;
    const maxDurationMs =
      opts.maxDuration !== undefined
        ? Number(opts.maxDuration)
        : Math.min(capMs, (naturalDuration * 1000) / (speed * speedRate) + 220);

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
      const elapsedMs = now - entry.startAt;
      const remainMs = entry.maxDurationMs - elapsedMs;
      if (remainMs > 0 && remainMs < 180) {
        entry.canvas.style.opacity = Math.max(0, remainMs / 180).toFixed(3);
      }
      const rawDt = Math.max(1 / 60, (now - entry.lastAt) / 1000);
      const dt = Math.min(0.05, rawDt) * speed * entry.speedRate;
      entry.lastAt = now;
      entry.fx.update(dt);
      clearFrame(entry.frame);
      entry.fx.draw(entry.frame);
      composite(entry.frame, entry.img.data, null, entry.light);
      entry.ctx.putImageData(entry.img, 0, 0);
      if (entry.fx.done() || elapsedMs >= entry.maxDurationMs) {
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
