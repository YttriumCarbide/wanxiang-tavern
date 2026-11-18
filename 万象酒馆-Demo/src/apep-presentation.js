export const APEP_ID = 'apepLamb';
export const APEP_PALETTE = Object.freeze([
  '#100c15',
  '#211421',
  '#432237',
  '#702c46',
  '#a73956',
  '#e0646e',
  '#ff9a87',
  '#ffe7cb',
]);

const ATTACKS = Object.freeze({
  Apep_Splash: { type: 'splash', windup: 'void-orb', hit: 'acid-splash', link: 'ink' },
  Apep_Plague: { type: 'plague', windup: 'hex-sigil', hit: 'shadow-tendrils', link: 'current' },
  Apep_Shell: { type: 'shell', windup: 'hex-sigil', hit: 'dark-explosion', link: 'shards' },
  Apep_Tide: { type: 'tide', windup: 'black-hole', hit: 'wave-crash', link: 'current' },
  Apep_Gaze: { type: 'gaze', windup: 'void-orb', hit: 'crit-hit', link: 'beam' },
  Apep_Eclipse: { type: 'eclipse', windup: 'black-hole', hit: 'dark-explosion', link: 'current' },
});

// The release pose in the model's attack clips is keyed at 43 percent.
export const APEP_RELEASE = 0.43;

export function apepAttack(event) {
  return event.type === 'enemy' && event.actor === APEP_ID ? ATTACKS[event.clip] || null : null;
}

export function apepPlague(state) {
  const field = state?.sinkingPlague;
  return field?.source === APEP_ID ? field : null;
}
