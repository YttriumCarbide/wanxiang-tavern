/** Directions are relative to the acting enemy; shared by validation and simulation. */
export function isPositiveEnemyEffect(effect) {
  return (
    ['heal', 'shield', 'mana'].includes(effect.type) ||
    (effect.type === 'buff' &&
      ['strength', 'guard', 'iron', 'regen', 'haste'].includes(effect.buff))
  );
}
export function enemyEffectSide(effect) {
  if (isPositiveEnemyEffect(effect) && (!effect.target || effect.target === 'opponents'))
    return 'self';
  return effect.target || 'opponents';
}
export function targetsPlayer(effect) {
  return (
    enemyEffectSide(effect) === 'opponents' && !(effect.type === 'buff' && effect.buff === 'slow')
  );
}
