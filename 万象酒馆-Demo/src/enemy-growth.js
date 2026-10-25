import { BASE_WORLDS } from './worlds.js';
import { finalSkillText } from './skill-text.js';

function seedOf(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** Main chapters ease into growth; endless and custom worlds gain a level at every site. */
export function encounterLevel(entry) {
  if (!entry || entry.tutorial) return 1;
  const main = BASE_WORLDS.indexOf(entry.world?.id || entry.map);
  if (main < 0) return Math.min(99, 1 + entry.sequence);
  return Math.min(
    99,
    1 + main * 2 + (entry.sequence < 6 ? Math.floor(entry.sequence / 2) : entry.sequence - 3),
  );
}

/** A stable 1–3 point roll per level, weighted toward hp; no speed or status inflation. */
export function enemyGrowth(entry, index, id, boss = false) {
  let seed = seedOf(`${entry.seed}:${index}:${id}`);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const base = encounterLevel(entry);
  const level = entry.tutorial
    ? 1
    : Math.max(1, Math.min(99, base + Math.floor(random() * 3) - 1 + Number(boss)));
  const bonus = { hp: 0, attack: 0 };
  for (let current = 1; current < level; current++) {
    const points = 1 + Math.floor(random() * 3);
    for (let point = 0; point < points; point++) {
      if (random() < 0.75) bonus.hp += boss ? 5 : 3;
      else bonus.attack++;
    }
  }
  return { level, bonus };
}

/** Decorate an authored move once, including tactical and multi-part boss attacks. */
export function leveledIntent(move, bonus = 0) {
  if (!bonus || !move.effects.some((effect) => effect.type === 'damage' && !effect.flat))
    return move;
  const effects = move.effects.map((effect) =>
    effect.type === 'damage' && !effect.flat ? { ...effect, value: effect.value + bonus } : effect,
  );
  const description = [
    ...effects,
    ...(move.selfShield ? [{ type: 'selfShield', value: move.selfShield }] : []),
    ...(move.selfHeal ? [{ type: 'selfHeal', value: move.selfHeal }] : []),
    ...Object.entries(move.selfBuff || {}).map(([buff, value]) => ({
      type: 'buff',
      buff,
      value,
      target: 'self',
    })),
  ];
  return { ...move, effects, text: finalSkillText({ effects: description, target: 'enemy' }) };
}
