import { attackStyle, ATTACK_TIMING } from '../combat-art.js';
import { definition } from '../catalog.js';

/** Only executed combat events create cues; forecasts remain silent. */
export function combatCues(event, before, speed = 1) {
  const deaths = Object.keys(before.units).filter(
    (id) =>
      before.units[id].hp > 0 && event.after?.units[id]?.hp === 0 && definition(before, id)?.boss,
  );
  const timing = ['hero', 'enemy'].includes(event.type)
    ? ((ATTACK_TIMING[attackStyle(event)] || 640) * 0.7) / (1000 * speed)
    : 0;
  const deathCues = deaths.flatMap(() => [
    { name: 'boss-death-charge', delay: timing },
    { name: 'boss-death-break', delay: timing + 0.756 / speed },
    { name: 'boss-death-tail', delay: timing + 1.05 / speed },
  ]);
  if (event.type === 'item') return [{ name: 'cast', delay: 0 }];
  if (event.type === 'swap') return [{ name: 'exchange', delay: 0 }];
  if (!['hero', 'enemy', 'entrySkill'].includes(event.type)) return deathCues;
  const friendly =
    event.targets.length > 0 &&
    event.targets.every((id) => before.units[id]?.side === before.units[event.actor]?.side);
  const def = definition(event.after, event.actor);
  const style = attackStyle(event) || def?.weapon || 'sword';
  const delay = ((ATTACK_TIMING[style] || 640) * 0.7) / (1000 * speed);
  if (friendly) {
    const healing = event.targets.some((id) => event.after.units[id]?.hp > before.units[id]?.hp);
    return [{ name: 'cast', delay: 0 }, { name: healing ? 'heal' : 'shield', delay }, ...deathCues];
  }
  return [{ name: style, delay: 0 }, { name: `${style}-hit`, delay }, ...deathCues];
}

// [wave, start Hz, end Hz, seconds, level, delay seconds, noise filter Hz]
export const SOUND_CUES = {
  'boss-death-charge': [
    ['sine', 70, 170, 0.68, 0.13],
    ['noise', 0, 0, 0.64, 0.07, 0, 650],
    ['triangle', 260, 650, 0.55, 0.035, 0.1],
  ],
  'boss-death-break': [
    ['sine', 100, 30, 0.9, 0.21],
    ['noise', 0, 0, 0.48, 0.13, 0, 1600],
    ['triangle', 940, 220, 0.35, 0.06, 0.05],
  ],
  'boss-death-tail': [
    ['sine', 1175, 880, 1.35, 0.055],
    ['sine', 1568, 1175, 1.15, 0.035, 0.12],
    ['noise', 0, 0, 1.1, 0.035, 0, 800],
  ],
  'crystal-ram': [['triangle', 620, 1120, 0.24, 0.06]],
  'crystal-ram-hit': [
    ['triangle', 1640, 480, 0.18, 0.08],
    ['noise', 0, 0, 0.12, 0.07, 0, 3400],
  ],
  'cinder-spark': [['noise', 0, 0, 0.25, 0.06, 0, 2200]],
  'cinder-spark-hit': [
    ['triangle', 520, 160, 0.13, 0.09],
    ['noise', 0, 0, 0.15, 0.07, 0, 1800],
  ],
  'tide-ribbon': [['sine', 390, 710, 0.3, 0.06]],
  'tide-ribbon-hit': [
    ['noise', 0, 0, 0.24, 0.08, 0, 720],
    ['sine', 820, 310, 0.24, 0.06],
  ],
  'astral-cascade': [
    ['sine', 220, 660, 0.35, 0.07],
    ['triangle', 440, 880, 0.25, 0.04],
  ],
  'astral-cascade-hit': [
    ['sine', 180, 65, 0.35, 0.13],
    ['noise', 0, 0, 0.25, 0.08, 0, 1000],
  ],
  click: [['triangle', 880, 520, 0.055, 0.09]],
  select: [
    ['sine', 659, 659, 0.09, 0.1],
    ['sine', 988, 988, 0.07, 0.04, 0.035],
  ],
  skill: [
    ['triangle', 740, 988, 0.12, 0.08],
    ['sine', 1480, 1480, 0.14, 0.04, 0.04],
  ],
  drag: [['noise', 0, 0, 0.12, 0.06, 0, 1600]],
  queue: [
    ['triangle', 440, 660, 0.08, 0.1],
    ['sine', 880, 880, 0.09, 0.05, 0.04],
  ],
  cancel: [['sine', 660, 330, 0.09, 0.07]],
  error: [
    ['triangle', 150, 120, 0.16, 0.1],
    ['triangle', 160, 130, 0.14, 0.05, 0.08],
  ],
  gate: [
    ['noise', 0, 0, 0.65, 0.1, 0, 700],
    ['sine', 165, 330, 0.65, 0.1],
    ['sine', 247, 494, 0.6, 0.05, 0.08],
  ],
  round: [
    ['sine', 392, 392, 0.13, 0.08],
    ['sine', 587, 587, 0.18, 0.06, 0.08],
  ],
  exchange: [
    ['noise', 0, 0, 0.28, 0.08, 0, 1400],
    ['triangle', 260, 520, 0.19, 0.07],
  ],
  cast: [['sine', 440, 880, 0.24, 0.065]],
  combine: [
    ['sine', 180, 660, 0.76, 0.1],
    ['triangle', 523, 1047, 0.82, 0.055, 0.05],
    ['noise', 0, 0, 0.7, 0.04, 0, 2400],
  ],
  heal: [
    ['sine', 659, 659, 0.22, 0.07],
    ['sine', 988, 988, 0.3, 0.05, 0.07],
    ['sine', 1318, 1318, 0.27, 0.035, 0.14],
  ],
  shield: [
    ['triangle', 330, 330, 0.2, 0.08],
    ['sine', 660, 660, 0.25, 0.07],
  ],
  victory: [
    ['triangle', 523, 523, 0.22, 0.09],
    ['triangle', 659, 659, 0.23, 0.09, 0.12],
    ['triangle', 784, 784, 0.3, 0.09, 0.24],
    ['sine', 1047, 1047, 0.55, 0.08, 0.4],
  ],
  defeat: [
    ['sine', 294, 294, 0.25, 0.09],
    ['sine', 247, 247, 0.3, 0.08, 0.18],
    ['sine', 196, 165, 0.65, 0.08, 0.38],
  ],
  sword: [['noise', 0, 0, 0.24, 0.12, 0.05, 3300]],
  'sword-hit': [
    ['triangle', 1200, 520, 0.11, 0.11],
    ['sine', 1980, 1800, 0.18, 0.035],
    ['noise', 0, 0, 0.07, 0.1, 0, 2500],
  ],
  staff: [
    ['sine', 330, 880, 0.28, 0.07],
    ['triangle', 660, 1320, 0.25, 0.04, 0.06],
  ],
  'staff-hit': [
    ['sine', 780, 280, 0.2, 0.11],
    ['noise', 0, 0, 0.16, 0.07, 0, 1800],
  ],
  bow: [
    ['triangle', 370, 120, 0.12, 0.14],
    ['noise', 0, 0, 0.22, 0.065, 0.08, 4500],
  ],
  'bow-hit': [
    ['triangle', 220, 80, 0.09, 0.13],
    ['noise', 0, 0, 0.06, 0.08, 0, 1800],
  ],
  'slime-bounce': [['sine', 180, 320, 0.2, 0.1]],
  'slime-bounce-hit': [
    ['sine', 190, 55, 0.2, 0.14],
    ['noise', 0, 0, 0.18, 0.09, 0, 400],
  ],
  'mushroom-bonk': [['triangle', 320, 420, 0.12, 0.08]],
  'mushroom-bonk-hit': [
    ['triangle', 300, 90, 0.12, 0.13],
    ['noise', 0, 0, 0.07, 0.05, 0, 900],
  ],
  'pebble-shards': [['noise', 0, 0, 0.2, 0.09, 0, 2500]],
  'pebble-shards-hit': [
    ['noise', 0, 0, 0.08, 0.13, 0, 1600],
    ['triangle', 700, 220, 0.1, 0.08],
    ['noise', 0, 0, 0.06, 0.08, 0.055, 2200],
  ],
  'claw-pounce': [
    ['sawtooth', 80, 130, 0.19, 0.035],
    ['noise', 0, 0, 0.22, 0.09, 0, 1100],
  ],
  'claw-pounce-hit': [
    ['noise', 0, 0, 0.09, 0.12, 0, 2400],
    ['noise', 0, 0, 0.07, 0.09, 0.045, 1900],
  ],
  'stone-slam': [['noise', 0, 0, 0.24, 0.08, 0, 700]],
  'stone-slam-hit': [
    ['sine', 100, 38, 0.32, 0.2],
    ['noise', 0, 0, 0.19, 0.12, 0, 1000],
  ],
  'ember-bolt': [
    ['triangle', 210, 610, 0.26, 0.055],
    ['noise', 0, 0, 0.23, 0.07, 0, 1900],
  ],
  'ember-bolt-hit': [
    ['noise', 0, 0, 0.23, 0.13, 0, 2300],
    ['sine', 380, 100, 0.19, 0.08],
  ],
  'gate-crush': [
    ['sine', 60, 110, 0.3, 0.08],
    ['noise', 0, 0, 0.25, 0.09, 0, 600],
  ],
  'gate-crush-hit': [
    ['sine', 95, 30, 0.42, 0.22],
    ['noise', 0, 0, 0.3, 0.14, 0, 850],
    ['triangle', 380, 120, 0.22, 0.06],
  ],
  'spore-volley': [
    ['sine', 430, 650, 0.25, 0.065],
    ['noise', 0, 0, 0.3, 0.07, 0, 1100],
  ],
  'spore-volley-hit': [
    ['noise', 0, 0, 0.32, 0.12, 0, 850],
    ['sine', 510, 220, 0.24, 0.07],
  ],
};
