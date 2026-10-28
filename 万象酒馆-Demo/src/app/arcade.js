import { newTetris, restoreTetris, tetrisStep, tetrisDisplay, rewindTetris } from '../tetris.js';
import { html } from '../shared/html.js';

export function createArcade(context) {
  const dialog = document.createElement('dialog');
  dialog.id = 'arcade-dialog';
  dialog.innerHTML = html`
    <header>
      <div class="arcade-brand">
        <span class="arcade-sigil" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <div>
          <small>万象酒馆 · 以太游艺</small>
          <h2>虚空方块</h2>
        </div>
      </div>
      <div class="arcade-actions">
        <button data-arcade-pause>暂停</button>
        <button data-arcade-close>退出</button>
      </div>
    </header>
    <div id="arcade-score">
      <span>得分<b data-arcade-score>0</b></span>
      <span>消除<b data-arcade-lines>0</b></span>
      <span>以太<b data-arcade-ether>+0</b></span>
    </div>
    <div class="arcade-stage">
      <div id="arcade-board" tabindex="0" aria-label="俄罗斯方块棋盘，拖动左右移动"></div>
    </div>
    <div class="arcade-controls">
      <button data-tetris="rotate"><span aria-hidden="true">⟳</span><b>旋转</b></button>
      <button data-tetris="down"><span aria-hidden="true">⇓</span><b>加速下落</b></button>
    </div>
    <p id="arcade-status" role="status"></p>
  `;
  const notice = document.createElement('dialog');
  notice.id = 'arcade-completion';
  notice.innerHTML =
    '<h2>生成完成</h2><p></p><button data-arcade-return>返回查看</button><button data-arcade-continue>继续游戏</button>';
  document.body.append(dialog, notice);
  let timer = null,
    saveTimer = null,
    announcement = null,
    disposed = false;
  let owner = null,
    state = null,
    fastFall = false,
    drag = null,
    closed = true;
  const board = dialog.querySelector('#arcade-board');
  const accelerate = dialog.querySelector('[data-tetris="down"]');
  function save(flush = false) {
    if (!state || context.session.ai.library !== owner) return;
    owner.arcade = structuredClone(state);
    clearTimeout(saveTimer);
    if (flush) context.generation?.save();
    else saveTimer = setTimeout(() => context.generation?.save(), 400);
  }
  function render() {
    if (!board.childElementCount)
      for (let index = 0; index < 200; index++) board.append(document.createElement('i'));
    tetrisDisplay(state)
      .flat()
      .forEach((value, index) => {
        board.children[index].dataset.cell = value;
      });
    dialog.querySelector('[data-arcade-score]').textContent = state.score;
    dialog.querySelector('[data-arcade-lines]').textContent = state.lines;
    dialog.querySelector('[data-arcade-ether]').textContent = '+' + state.earned;
    board.dataset.state = state.status;
    dialog.querySelector('#arcade-status').textContent =
      state.status === 'over' ? '方块到顶' : state.status === 'paused' ? '已暂停' : '拖动左右移动';
    const pause = dialog.querySelector('[data-arcade-pause]');
    pause.textContent =
      state.status === 'over' ? '再来一局' : state.status === 'paused' ? '继续' : '暂停';
    pause.setAttribute('aria-pressed', String(state.status === 'paused'));
    for (const button of dialog.querySelectorAll('[data-tetris]'))
      button.disabled = state.status !== 'playing';
  }
  function schedule() {
    clearTimeout(timer);
    if (!disposed && dialog.open && !notice.open && state.status === 'playing')
      timer = setTimeout(() => act('tick'), fastFall ? 45 : Math.max(140, 650 - state.lines * 8));
  }
  function act(action) {
    if (disposed || !dialog.open || notice.open || closed || !state) return;
    if (context.session.ai.library !== owner) {
      dialog.close();
      return;
    }
    const result = tetrisStep(state, action);
    state = result.state;
    const reward = result.events.reduce((sum, event) => sum + (event.ether || 0), 0);
    if (reward) owner.inventory.ether += reward;
    // Store board and earned currency in the same library snapshot, avoiding duplicate rewards on reload.
    save(reward > 0 || ['pause', 'new'].includes(action));
    render();
    if (reward) {
      dialog.querySelector('#arcade-status').textContent =
        `消除 ${result.events.find((event) => event.type === 'clear').count} 行 · 以太 +${reward}`;
      context.shell?.renderParty();
      context.audio?.play('purchase');
    }
    if (['tick', 'pause', 'play', 'new'].includes(action) || state.status !== 'playing') schedule();
  }
  function haltAndRewind() {
    clearTimeout(timer);
    clearTimeout(announcement);
    clearTimeout(saveTimer);
    fastFall = false;
    drag = null;
    if (closed || !state) return;
    closed = true;
    const result = rewindTetris(state);
    state = result.state;
    if (context.session.ai.library === owner) {
      owner.inventory.ether = Math.max(0, owner.inventory.ether - result.returnedEther);
      save(true);
      context.shell?.renderParty();
    }
    if (notice.open) notice.close();
  }
  function close() {
    haltAndRewind();
    if (dialog.open) dialog.close();
  }
  context.events.on(dialog, 'click', (event) => {
    const action = event.target.closest('[data-tetris]')?.dataset.tetris;
    if (action && (action !== 'down' || event.detail === 0)) act(action);
    if (event.target.closest('[data-arcade-pause]')) {
      fastFall = false;
      drag = null;
      act(state.status === 'over' ? 'new' : state.status === 'paused' ? 'play' : 'pause');
    }
    if (event.target.closest('[data-arcade-close]')) close();
  });
  context.events.on(board, 'pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || state.status !== 'playing') return;
    event.preventDefault();
    board.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX };
    board.setPointerCapture(event.pointerId);
  });
  context.events.on(board, 'pointermove', (event) => {
    if (drag?.id !== event.pointerId || state.status !== 'playing') return;
    const cell = board.clientWidth / 10;
    const steps = Math.trunc((event.clientX - drag.x) / cell);
    for (let index = 0; index < Math.min(10, Math.abs(steps)); index++)
      act(steps < 0 ? 'left' : 'right');
    drag.x += steps * cell;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    context.events.on(board, type, () => {
      drag = null;
    });
  context.events.on(accelerate, 'pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || state.status !== 'playing') return;
    fastFall = true;
    accelerate.setPointerCapture(event.pointerId);
    act('down');
    schedule();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    context.events.on(accelerate, type, () => {
      if (!fastFall) return;
      fastFall = false;
      schedule();
    });
  context.events.on(document, 'keydown', (event) => {
    if (!dialog.open || notice.open) return;
    const action = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'rotate',
      ArrowDown: 'down',
    }[event.key];
    if (!action) return;
    event.preventDefault();
    act(action);
  });
  context.events.on(dialog, 'cancel', (event) => {
    event.preventDefault();
    close();
  });
  context.events.on(dialog, 'close', haltAndRewind);
  context.events.on(document, 'visibilitychange', () => {
    if (document.hidden && dialog.open) {
      fastFall = false;
      drag = null;
      act('pause');
    }
  });
  context.events.on(notice, 'click', (event) => {
    if (event.target.closest('[data-arcade-return]')) {
      notice.close();
      close();
    }
    if (event.target.closest('[data-arcade-continue]')) {
      notice.close();
      schedule();
    }
  });
  return {
    open() {
      if (dialog.open || disposed) return;
      owner = context.session.ai.library;
      state = restoreTetris(owner.arcade || newTetris(Math.floor(Math.random() * 4294967296)));
      fastFall = false;
      drag = null;
      closed = false;
      dialog.showModal();
      act('play');
    },
    completed(label, success = true) {
      if (!dialog.open || disposed) return;
      clearTimeout(announcement);
      save(true);
      announcement = setTimeout(() => {
        if (disposed || !dialog.open) return;
        clearTimeout(timer);
        fastFall = false;
        drag = null;
        notice.querySelector('h2').textContent = success ? '生成完成' : '请求已结束';
        notice.querySelector('p').textContent = success
          ? `${label}已完成，可以返回查看结果。`
          : `${label}未成功完成，请返回查看错误或取消信息。`;
        if (!notice.open) notice.showModal();
      }, 80);
    },
    dispose() {
      close();
      disposed = true;
      clearTimeout(timer);
      clearTimeout(announcement);
      clearTimeout(saveTimer);
      notice.remove();
      dialog.remove();
    },
  };
}
