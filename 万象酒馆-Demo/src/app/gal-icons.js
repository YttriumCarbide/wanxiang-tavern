/** Fixed UI artwork; model text never enters SVG markup. */
export function decorateGalButtons(panel) {
  const paths = {
    back: '<path d="m14 5-7 7 7 7M6 5v14"/>',
    next: '<path d="m9 5 7 7-7 7"/>',
    skip: '<path d="m3 5 7 7-7 7zM12 5l7 7-7 7zM22 5v14"/>',
    auto: '<path d="m9 7 8 5-8 5z"/><circle cx="12" cy="12" r="10"/>',
    history: '<path d="M4 5h16v14H4zM8 9h8M8 13h8M8 16h5"/>',
    hide: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    journal: '<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15"/>',
    compose: '<path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5"/>',
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
    people:
      '<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6"/>',
    replay: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>',
  };
  for (const button of panel.querySelectorAll('.gal-actionbar button')) {
    const action = button.dataset.gal || button.dataset.workspace;
    const label = button.textContent.replace(/[‹›]/gu, '').trim();
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[action] || paths.compose}</svg><span class="gal-control-label">${label}</span>`;
  }
}
