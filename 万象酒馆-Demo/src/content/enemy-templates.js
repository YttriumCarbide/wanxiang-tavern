/** Voxel-only appearances for AI-created humanoid enemies, independent of companion art. */
export const HUMANOID_ENEMY_TEMPLATES = Object.freeze(
  ['sword', 'staff', 'bow'].flatMap((weapon) =>
    ['female', 'male'].map((gender) => ({
      id: `humanoid-${weapon}-${gender}`,
      weapon,
      gender,
      name: `${{ sword: '持剑卫士', staff: '持杖术师', bow: '弓箭游侠' }[weapon]}·${gender === 'female' ? '女' : '男'}`,
      portrait: `enemy-humanoid-${weapon}-${gender}`,
      model: `enemy-humanoid-${weapon}-${gender}.glb`,
      color: { sword: '#889dba', staff: '#9280b4', bow: '#81a18a' }[weapon],
    })),
  ),
);

/** Migrate obsolete teammate appearances without dropping a saved world or changing stats. */
export function restoredEnemyPortrait(portrait) {
  const generated = /^template-(sword|staff|bow)-(female|male)\.webp$/.exec(portrait || '');
  if (generated) return `enemy-humanoid-${generated[1]}-${generated[2]}`;
  const legacy = {
    guardian: ['sword', 'male'],
    swordswoman: ['sword', 'female'],
    chronomancer: ['staff', 'male'],
    healer: ['staff', 'female'],
    warlock: ['staff', 'male'],
    ranger: ['bow', 'female'],
    'edith.png': ['sword', 'female'],
    'pandora.png': ['staff', 'female'],
    'changjing-yuexi.png': ['sword', 'female'],
  }[portrait];
  return legacy ? `enemy-humanoid-${legacy[0]}-${legacy[1]}` : portrait;
}
