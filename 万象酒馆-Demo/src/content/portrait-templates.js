/** Default illustrations for generated protagonists and companions only. */
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

export const CHARACTER_IMAGE_PROMPTS = Object.freeze({
  card: 'Create one finished 1024×1536 fantasy RPG character card illustration. Show the character from head through knees, in a slight three-quarter stance, with a large readable face and both shoulders inside the frame. Use polished painterly anime fantasy rendering, intricate costume craftsmanship, natural anatomy, cinematic lighting, and a softly blurred background suited to the setting. No text, watermark, card border, UI or collage.',
  standing:
    'Create one 1024×1536 full-body standing sprite for a fantasy RPG dialogue scene. Show the same character facing the viewer in a relaxed upright stance, entire head, costume, hands and soles inside the frame. Preserve the face, hairstyle, costume, accessories and proportions described below. Render the character in polished painterly anime fantasy style. All exterior background and all gaps around the silhouette must be genuine transparent alpha. No backdrop, ground, shadow, text, watermark or UI.',
});
