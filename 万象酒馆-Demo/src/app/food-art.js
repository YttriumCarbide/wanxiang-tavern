import { escapeText } from '../ui.js';

export function foodArt(item) {
  const x = ((item.index % 4) * 100) / 3;
  const y = (Math.floor(item.index / 4) * 100) / 3;
  return `<span class="food-art food-sheet-${item.sheet}" style="background-position:${x}% ${y}%" role="img" aria-label="${escapeText(item.name)}"></span>`;
}
