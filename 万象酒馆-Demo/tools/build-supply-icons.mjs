import { writeFile } from 'node:fs/promises';

const symbols = {
  artifact:
    '<path d="m32 18 12 7v14l-12 7-12-7V25z" fill="#8e6536" stroke="#f6d38a" stroke-width="2"/><path d="m32 23 8 9-8 9-8-9z" fill="#ffe5a0"/>',
  confusion:
    '<path d="M23 29h4l10 11h4m-5-4 5 4-5 4M23 41h4l10-12h4m-5-4 5 4-5 4" fill="none" stroke="#fff0ff" stroke-width="2"/>',
  blind:
    '<path d="M19 32q13-16 26 0-13 16-26 0z" fill="#eee4ff"/><circle cx="32" cy="32" r="5" fill="#58456e"/><path d="m21 21 22 22" stroke="#7d4164" stroke-width="4"/>',
  cleanse:
    '<path d="M32 19q-4 10-9 15a9 9 0 1 0 18 0q-5-5-9-15Z" fill="#8ee9cf" stroke="#416c61" stroke-width="2"/><path d="M24 28h16m-8-8v16" stroke="#f1fff6" stroke-width="2"/>',
  flying:
    '<path d="m18 25 12 6 2 10 2-10 12-6-7 13-7 7-7-7z" fill="#e8f6ff" stroke="#4e7190" stroke-width="2"/><path d="M22 28l6 8m14-8-6 8" stroke="#7ab9d7" stroke-width="2"/>',
};
const supplies = [
  ['artifact-potion', 'artifact', '#b98846'],
  ['fine-artifact-potion', 'artifact', '#df9e48'],
  ['confusion-potion', 'confusion', '#9365c4'],
  ['fine-confusion-potion', 'confusion', '#b776e4'],
  ['blind-scroll', 'blind', '#8d77af'],
  ['fine-blind-scroll', 'blind', '#bb84c6'],
  ['cleanse-scroll', 'cleanse', '#69b69d'],
  ['flying-scroll', 'flying', '#7face0'],
];

function icon(id, kind, color) {
  const fine = id.startsWith('fine-');
  const vessel = id.endsWith('scroll')
    ? '<path d="M17 10h32l-4 43H14l5-35z" fill="#e7c998" stroke="#785534" stroke-width="2"/><path d="M17 10c-9 0-9 10 0 10h5m23 33c9 0 10-9 2-9h-8" fill="#f9e0b3" stroke="#785534" stroke-width="2"/>'
    : `<path d="M26 13h12v8l10 9 3 14-8 10H21l-8-10 3-14 10-9z" fill="#29363b" stroke="#9eb0b3" stroke-width="2"/><path d="M17 36h30l2 8-7 8H22l-7-8z" fill="${color}"/><path d="M24 8h16v7H24z" fill="#d8a765" stroke="#694828" stroke-width="2"/><path d="m19 32 5-5v7l-5 7z" fill="#fff" opacity=".4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <ellipse cx="32" cy="56" rx="22" ry="4" fill="#100b10" opacity=".5"/>
  ${vessel}
  <circle cx="32" cy="33" r="13" fill="${color}" opacity=".62"/>
  ${symbols[kind]}
${fine ? '  <path d="m47 10 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffe3a2"/><path d="M20 49h24" stroke="#ffda88" stroke-width="2"/>' : ''}
</svg>\n`;
}

await Promise.all(
  supplies.map(([id, kind, color]) =>
    writeFile(new URL(`../assets/items/${id}.svg`, import.meta.url), icon(id, kind, color)),
  ),
);
