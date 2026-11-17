export function createPlayerIntentPrompt(events, id = 'player-intent') {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'player-intent';
  dialog.setAttribute('aria-labelledby', id + '-title');
  dialog.innerHTML = `<form method="dialog">
    <header class="player-intent-head">
      <span class="player-intent-kicker">WAYFARE PREPARATIONS · 行程整备</span>
      <h2 id="${id}-title"></h2>
      <div class="player-intent-route" hidden>
        <div class="player-intent-stop">
          <small>启程</small>
          <strong data-intent-origin></strong>
        </div>
        <div class="player-intent-track">
          <span data-intent-meta></span>
          <i class="player-intent-track-line" aria-hidden="true"></i>
        </div>
        <div class="player-intent-stop player-intent-stop-dest">
          <small>抵达</small>
          <strong data-intent-dest></strong>
        </div>
      </div>
      <p class="player-intent-detail"></p>
    </header>
    <div class="player-intent-body">
      <label class="player-intent-skip" hidden>
        <input type="checkbox" data-intent-skip />
        <span class="player-intent-skip-copy">
          <strong>跳过外游 API · 直接赶路</strong>
          <small>不触发路途剧本生成，直接按路线回合行进并抵达</small>
        </span>
        <i class="player-intent-switch-pill" aria-hidden="true"></i>
      </label>
      <label class="player-intent-note">
        <span>这次想做什么，或想说什么？<small>选填，留空可直接继续</small></span>
        <textarea rows="3" maxlength="2000" placeholder="写下你想在路途中做的事、观察的细节或对同行者说的话…"></textarea>
      </label>
    </div>
    <footer>
      <button value="back">返回</button>
      <button type="button" data-intent-fast hidden></button>
      <button value="continue" class="primary">继续</button>
    </footer>
  </form>`;
  document.body.append(dialog);
  const kicker = dialog.querySelector('.player-intent-kicker');
  const routeEl = dialog.querySelector('.player-intent-route');
  const originEl = dialog.querySelector('[data-intent-origin]');
  const metaEl = dialog.querySelector('[data-intent-meta]');
  const destEl = dialog.querySelector('[data-intent-dest]');
  const detailEl = dialog.querySelector('.player-intent-detail');
  const skipBox = dialog.querySelector('.player-intent-skip');
  const skipCheckbox = dialog.querySelector('[data-intent-skip]');
  const field = dialog.querySelector('textarea');
  const fastButton = dialog.querySelector('[data-intent-fast]');
  const continueButton = dialog.querySelector('button[value="continue"]');
  let pending;
  let onToggleSkip = null;
  let fastLabel = '';

  function syncSkipState() {
    const skipping = !skipBox.hidden && skipCheckbox.checked;
    dialog.dataset.skipApi = String(skipping);
    fastButton.hidden = skipping || !fastLabel;
    continueButton.textContent = skipping ? '直接赶路' : '继续';
  }

  events.on(skipCheckbox, 'change', () => {
    syncSkipState();
    onToggleSkip?.(skipCheckbox.checked);
  });
  events.on(fastButton, 'click', () => {
    dialog.close('fast');
  });
  events.on(dialog, 'close', () => {
    const settle = pending;
    const skipActive = !skipBox.hidden && skipCheckbox.checked;
    pending = null;
    onToggleSkip = null;
    if (dialog.returnValue === 'fast' || (dialog.returnValue === 'continue' && skipActive)) {
      settle?.({ fast: true });
    } else {
      settle?.(dialog.returnValue === 'continue' ? field.value.trim() : null);
    }
  });
  return {
    ask(
      title,
      detail = '',
      {
        kicker: kickerText = 'WAYFARE PREPARATIONS · 行程整备',
        fastTravelLabel = '',
        showSkipApi = false,
        skipApi = false,
        onToggleSkip: toggleHandler = null,
        routeMeta = null,
      } = {},
    ) {
      if (pending) return Promise.resolve(null);
      kicker.textContent = kickerText;
      dialog.querySelector('h2').textContent = title;
      if (routeMeta?.originName && routeMeta?.destinationName) {
        routeEl.hidden = false;
        originEl.textContent = routeMeta.originName;
        destEl.textContent = routeMeta.destinationName;
        metaEl.textContent = `约 ${routeMeta.turns} 回合 · Lv.${routeMeta.level}`;
        detailEl.hidden = true;
      } else {
        routeEl.hidden = true;
        detailEl.textContent = detail || '';
        detailEl.hidden = !detail;
      }
      fastLabel = fastTravelLabel || '';
      fastButton.textContent = fastLabel;
      skipBox.hidden = !showSkipApi;
      skipCheckbox.checked = showSkipApi && Boolean(skipApi);
      onToggleSkip = toggleHandler;
      syncSkipState();
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
      onToggleSkip = null;
      dialog.remove();
    },
  };
}
