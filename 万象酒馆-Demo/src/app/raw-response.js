/** Session-only raw response viewer. Never saves model diagnostics or sends them to another API. */
export function createRawResponse(events, id, title) {
  const panel = document.createElement('dialog');
  panel.id = id;
  panel.className = 'raw-response';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const close = document.createElement('button');
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭原始回复');
  const header = document.createElement('header');
  header.append(heading, close);
  const message = document.createElement('p');
  const text = document.createElement('textarea');
  text.readOnly = true;
  text.setAttribute('aria-label', 'API原始回复');
  text.autocomplete = 'off';
  panel.append(header, message, text);
  document.body.append(panel);
  events.on(close, 'click', () => panel.close());
  return {
    show(failure) {
      const diagnostic = failure.diagnostic;
      if (!diagnostic?.rawText) return false;
      message.textContent = failure.message;
      text.value = diagnostic.rawText;
      if (!panel.open) panel.showModal();
      return true;
    },
    dispose() {
      panel.remove();
    },
  };
}
