export function createPlayerIntentPrompt(events, id = 'player-intent') {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'player-intent';
  dialog.setAttribute('aria-labelledby', id + '-title');
  dialog.innerHTML = `<form method="dialog">
    <h2 id="${id}-title"></h2><p></p>
    <label>这次想做什么，或想说什么？<textarea rows="3" maxlength="2000" placeholder="选填，可以直接继续"></textarea></label>
    <footer><button value="back">返回</button><button value="continue">继续</button></footer>
  </form>`;
  document.body.append(dialog);
  const field = dialog.querySelector('textarea');
  let pending;
  events.on(dialog, 'close', () => {
    const settle = pending;
    pending = null;
    settle?.(dialog.returnValue === 'continue' ? field.value.trim() : null);
  });
  return {
    ask(title, detail) {
      if (pending) return Promise.resolve(null);
      dialog.querySelector('h2').textContent = title;
      dialog.querySelector('p').textContent = detail;
      dialog.returnValue = '';
      field.value = '';
      dialog.showModal();
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
    dispose() {
      pending?.(null);
      pending = null;
      dialog.remove();
    },
  };
}
