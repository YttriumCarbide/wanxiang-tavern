/** Shared default art for generated heroes and human-shaped world enemies. */
export const PORTRAIT_TEMPLATES = Object.freeze(
  ['sword', 'staff', 'bow'].flatMap((weapon) =>
    ['female', 'male'].map((gender) => ({
      id: `${weapon}-${gender}`,
      weapon,
      gender,
      portrait: `template-${weapon}-${gender}.webp`,
      name: `${{ sword: '剑士', staff: '法师', bow: '游侠' }[weapon]}·${gender === 'female' ? '女' : '男'}`,
    })),
  ),
);

export function defaultCharacterPortrait(weapon, gender = '') {
  const female = /女|female|woman|feminine/i.test(gender);
  const type = ['sword', 'staff', 'bow'].includes(weapon) ? weapon : 'sword';
  return PORTRAIT_TEMPLATES.find(
    (entry) => entry.weapon === type && entry.gender === (female ? 'female' : 'male'),
  ).portrait;
}
