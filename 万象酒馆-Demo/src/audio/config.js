export const MUSIC = {
  inn: { file: './assets/audio/tavern.mp3', name: '炉边多利安' },
  battle: { file: './assets/audio/encounter.mp3', name: '遭遇战' },
  frostBattle: { file: './assets/audio/xueyuan.mp3', name: '雪原' },
  forgeBattle: { file: './assets/audio/forge-encounter.mp3', name: '锻炉遭遇战' },
  ruinsBoss: { file: './assets/audio/battle.m4a', name: '界门之战' },
  boss: { file: './assets/audio/boss.m4a', name: '首领决战' },
};

/** Select music from the encounter's actual map, including repeated Boss definitions. */
export function encounterMusic({ map, boss }) {
  if (boss) return map === 'ruins' ? 'ruinsBoss' : 'boss';
  return map === 'forge' ? 'forgeBattle' : map === 'frost' ? 'frostBattle' : 'battle';
}
export const DEFAULT_AUDIO = { music: 0.32, effects: 0.6, musicMuted: false, effectsMuted: false };
export function audioPreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const volume = (key) =>
    typeof input[key] === 'number' && Number.isFinite(input[key])
      ? Math.max(0, Math.min(1, input[key]))
      : DEFAULT_AUDIO[key];
  return {
    music: volume('music'),
    effects: volume('effects'),
    musicMuted: input.musicMuted === true,
    effectsMuted: input.effectsMuted === true,
  };
}
