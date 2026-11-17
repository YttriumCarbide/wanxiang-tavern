/** Visual colors and SVG emblems for Emblem Rings across preparation and picker UI. */

const DEFAULT_VISUAL = Object.freeze({
  color: '#c8ad7a',
  svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2.5"/><path d="M12 7.5l1.8 4.5-1.8 4.5-1.8-4.5z" fill="currentColor" opacity="0.55"/></svg>',
});

export const EMBLEM_VISUALS = Object.freeze({
  'tan-hongyu': Object.freeze({
    color: '#e87856',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.5 4.5c-4.5.8-8.2 3.8-10.6 8.3l-2.4 4.7 4.7-2.4c4.5-2.4 7.5-6.1 8.3-10.6z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 17.5L15 8M11 12h4.5M12 7.5V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  }),
  'mizunatsuki-ran': Object.freeze({
    color: '#5ec0ff',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.8A6 6 0 0 1 15.5 4.5z" fill="currentColor" opacity="0.88"/><path d="M13 6l2.5 4.5H12l2 5" fill="none" stroke="#fff7d6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  }),
  kamui: Object.freeze({
    color: '#f2b249',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l6.5 5.2-2.2 10.8L12 21l-4.3-2L5.5 8.2z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7l3.2 4.8L12 17l-3.2-5.2z" fill="currentColor" opacity="0.9"/></svg>',
  }),
  'wind-dance': Object.freeze({
    color: '#63dba8',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5c2.2-3 5.2-4.5 7.5-4.5s5.3 1.5 7.5 4.5c-1 5.5-3.8 9.2-7.5 10.2C8.3 18.7 5.5 15 4.5 9.5z" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M8 10.5c1.2-.8 2.2-.8 3.2 0M12.8 10.5c1-.8 2-.8 3.2 0M9.5 14.5c1.5 1.2 3.5 1.2 5 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  }),
  'jiu-qi': Object.freeze({
    color: '#c298ff',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3.5-5.5 8.5-5.5S20.5 12 20.5 12s-3.5 5.5-8.5 5.5S3.5 12 3.5 12z" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="12" r="2.8" fill="currentColor"/><path d="M12 3.5v2M12 18.5v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  }),
});

export function emblemVisual(emblemId) {
  return (emblemId && EMBLEM_VISUALS[emblemId]) || DEFAULT_VISUAL;
}

export function emblemIconSvg(emblemId) {
  return emblemVisual(emblemId).svg;
}
