/** Game controls never retain a browser text selection; prose and editors remain copyable. */
export function mountBattleTextSelection({ events, session }) {
  const elementFor = (node) => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement);
  const copyable = (element) =>
    element?.closest('input,textarea,[contenteditable="true"],#story-feed');
  function clear() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || session.runtime.mode !== 'battle') return;
    const anchor = elementFor(selection.anchorNode);
    const focus = elementFor(selection.focusNode);
    if (
      (anchor?.closest('#battle') && !copyable(anchor)) ||
      (focus?.closest('#battle') && !copyable(focus))
    )
      selection.removeAllRanges();
  }
  events.on(document, 'selectionchange', clear);
  events.on(document, 'selectstart', (event) => {
    const target = elementFor(event.target);
    if (session.runtime.mode === 'battle' && target?.closest('#battle') && !copyable(target))
      event.preventDefault();
  });
  events.on(document, 'pointerdown', (event) => {
    if (session.runtime.mode === 'battle' && !copyable(event.target))
      window.getSelection()?.removeAllRanges();
  });
  events.on(document, 'keydown', (event) => {
    if (event.key === 'Escape' && session.runtime.mode === 'battle')
      window.getSelection()?.removeAllRanges();
  });
}
