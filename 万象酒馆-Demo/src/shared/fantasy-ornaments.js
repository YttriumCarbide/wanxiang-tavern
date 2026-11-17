/** Pure SVG ornament builders shared by loading overlays and chapter theater. */

export function buildAstrolabeBackdropSvg(uid = 'ct') {
  const cardinal = Array.from({ length: 8 }, (_, idx) => {
    const deg = idx * 45;
    const isMajor = idx % 2 === 0;
    return `
      <g transform="rotate(${deg} 150 150)">
        <line x1="150" y1="${isMajor ? 6 : 16}" x2="150" y2="34" stroke="url(#${uid}-astro-gold-a)" stroke-width="${isMajor ? 1.6 : 1}" stroke-opacity="${isMajor ? 0.9 : 0.6}" />
        <polygon points="150,14 154,22 150,30 146,22" fill="${isMajor ? '#f6dd8e' : 'none'}" stroke="#d4af37" stroke-width="0.8" fill-opacity="${isMajor ? 0.8 : 0}" />
      </g>`;
  }).join('');

  const ticks = Array.from({ length: 24 }, (_, idx) => {
    return `<line x1="150" y1="26" x2="150" y2="31" stroke="#e5c774" stroke-opacity="0.45" stroke-width="0.8" transform="rotate(${idx * 15} 150 150)" />`;
  }).join('');

  const starburst = Array.from({ length: 8 }, (_, idx) => {
    return `<path d="M150 96 L154 138 L150 150 L146 138 Z" fill="#f4d685" fill-opacity="${idx % 2 === 0 ? 0.55 : 0.28}" transform="rotate(${idx * 45} 150 150)" />`;
  }).join('');

  return `
    <div class="chapter-theater-astrolabe-halo"></div>
    <svg viewBox="0 0 300 300" class="chapter-theater-astrolabe-outer" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="${uid}-astro-gold-a" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fff4ce" />
          <stop offset="45%" stop-color="#d4af37" />
          <stop offset="100%" stop-color="#7a581a" />
        </linearGradient>
      </defs>
      <circle cx="150" cy="150" r="140" stroke="url(#${uid}-astro-gold-a)" stroke-width="1.2" stroke-opacity="0.65" />
      <circle cx="150" cy="150" r="132" stroke="url(#${uid}-astro-gold-a)" stroke-width="0.7" stroke-dasharray="3 6" stroke-opacity="0.65" />
      <circle cx="150" cy="150" r="116" stroke="url(#${uid}-astro-gold-a)" stroke-width="1" stroke-opacity="0.45" />
      ${cardinal}
      ${ticks}
    </svg>
    <svg viewBox="0 0 300 300" class="chapter-theater-astrolabe-inner" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="${uid}-astro-gold-b" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#fff7d8" />
          <stop offset="50%" stop-color="#c99e3a" />
          <stop offset="100%" stop-color="#6c4d14" />
        </linearGradient>
      </defs>
      <rect x="84" y="84" width="132" height="132" stroke="url(#${uid}-astro-gold-b)" stroke-width="1.15" stroke-opacity="0.72" />
      <rect x="84" y="84" width="132" height="132" stroke="url(#${uid}-astro-gold-b)" stroke-width="1.15" stroke-opacity="0.72" transform="rotate(45 150 150)" />
      <circle cx="150" cy="150" r="76" stroke="url(#${uid}-astro-gold-b)" stroke-width="1" stroke-dasharray="10 4 2 4" stroke-opacity="0.7" />
      ${starburst}
    </svg>
    <svg viewBox="0 0 100 100" class="chapter-theater-astrolabe-core" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="24" stroke="#e4c268" stroke-width="1.1" stroke-opacity="0.75" />
      <polygon points="50,16 61,50 50,84 39,50" fill="#f8e39f" fill-opacity="0.22" stroke="#f3d47d" stroke-width="1.2" />
      <polygon points="16,50 50,39 84,50 50,61" fill="#f8e39f" fill-opacity="0.22" stroke="#f3d47d" stroke-width="1.2" />
      <circle cx="50" cy="50" r="5" fill="#fff6d4" />
    </svg>`;
}

export function buildWaxSealSvg(glyph, uid = 'main', tone = 'crimson') {
  const palette =
    tone === 'teal'
      ? {
          stops: ['#3795af', '#1e5b6e', '#0d2c3a'],
          edge: '#081d28',
          outerRing: '#79d0e6',
          innerRing: '#0a222d',
          starFill: '#a8e6f5',
          text: '#def6fc',
        }
      : {
          stops: ['#c6353d', '#891920', '#4c090e'],
          edge: '#41060a',
          outerRing: '#e27a7e',
          innerRing: '#3b070a',
          starFill: '#f0a899',
          text: '#f9d8c4',
        };
  return `
    <svg width="74" height="74" viewBox="0 0 80 80" class="chapter-theater-seal-svg" aria-hidden="true">
      <defs>
        <radialGradient id="ct-wax-${uid}" cx="38%" cy="32%" r="68%">
          <stop offset="0%" stop-color="${palette.stops[0]}" />
          <stop offset="52%" stop-color="${palette.stops[1]}" />
          <stop offset="100%" stop-color="${palette.stops[2]}" />
        </radialGradient>
      </defs>
      <path d="M40 5 C49 4, 57 9, 64 14 C71 20, 76 29, 75 39 C75 49, 71 58, 63 65 C56 72, 46 76, 36 74 C26 73, 17 68, 11 60 C5 52, 4 41, 7 31 C10 21, 17 13, 26 9 C31 6, 35 5, 40 5 Z" fill="url(#ct-wax-${uid})" stroke="${palette.edge}" stroke-width="1.5" />
      <circle cx="40" cy="40" r="24" fill="none" stroke="${palette.outerRing}" stroke-opacity="0.48" stroke-width="1.5" />
      <circle cx="40" cy="40" r="20" fill="none" stroke="${palette.innerRing}" stroke-opacity="0.7" stroke-width="1.5" />
      <polygon points="40,23 44,36 57,40 44,44 40,57 36,44 23,40 36,36" fill="${palette.starFill}" fill-opacity="0.24" stroke="${palette.starFill}" stroke-opacity="0.58" stroke-width="0.9" />
      <text x="40" y="45.5" text-anchor="middle" fill="${palette.text}" fill-opacity="0.94" font-size="16" font-weight="700" font-family="'Noto Serif SC', Cinzel, Georgia, serif">${glyph}</text>
    </svg>`;
}

export function buildDividerDiamondSvg() {
  return `
    <svg viewBox="0 0 64 20" class="chapter-theater-divider-gem-svg" fill="none" aria-hidden="true">
      <path d="M2 10 H20" stroke="currentColor" stroke-width="1" stroke-opacity="0.7" />
      <path d="M44 10 H62" stroke="currentColor" stroke-width="1" stroke-opacity="0.7" />
      <polygon points="32,2 40,10 32,18 24,10" stroke="currentColor" stroke-width="1.2" fill="#d4af37" fill-opacity="0.22" />
      <polygon points="32,6 36,10 32,14 28,10" fill="#fff3c9" />
      <circle cx="16" cy="10" r="1.6" fill="currentColor" />
      <circle cx="48" cy="10" r="1.6" fill="currentColor" />
    </svg>`;
}

export function buildCornerFiligreeSvg() {
  return `
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path d="M2 34 V6 C2 3.8 3.8 2 6 2 H34" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.88" />
      <path d="M7 28 V9 C7 7.9 7.9 7 9 7 H28" stroke="currentColor" stroke-width="0.8" stroke-opacity="0.55" />
      <polygon points="9,9 14,11 11,14" fill="currentColor" fill-opacity="0.85" />
      <circle cx="4.5" cy="4.5" r="1.8" fill="currentColor" />
    </svg>`;
}

export function buildCornerBracketsHtml(prefix = 'sl-corner') {
  return ['tl', 'tr', 'bl', 'br']
    .map(
      (pos) =>
        `<span class="${prefix} is-${pos}" aria-hidden="true">${buildCornerFiligreeSvg()}</span>`,
    )
    .join('');
}
