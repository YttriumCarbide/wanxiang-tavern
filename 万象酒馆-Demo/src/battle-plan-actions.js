import { abilityFor } from './catalog.js';
export function makeReposition(a, b, start) {
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36),
    kind: 'reposition',
    a,
    b,
    start,
    ap: 1,
  };
}
export function makeAction(s, actor, skill, target, start) {
  const a = abilityFor(s, actor, skill);
  if (!a) throw Error('Unknown ability');
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36),
    actor,
    skill,
    target,
    start,
    ap: a.ap,
    kind: 'skill',
  };
}
export function makeItem(item, target, start) {
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36),
    kind: 'item',
    item,
    target,
    start,
    ap: 1,
  };
}
export function makeSwap(incoming, slot, start) {
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36),
    kind: 'swap',
    incoming,
    slot,
    start,
    ap: 1,
  };
}
export function makeEngage(actor, start) {
  return { id: globalThis.crypto.randomUUID(), kind: 'engage', actor, start, ap: 1 };
}
