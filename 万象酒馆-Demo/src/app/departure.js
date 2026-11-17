import { compileRoster } from '../ai/library.js';

/** One existing draggable preparation screen, then the same screen with a locked party. */
export function createDeparture(context) {
  const { session } = context;
  const panel = document.querySelector('#party-panel');
  const done = document.querySelector('#prepare-done');
  const close = document.querySelector('#prepare-close');
  const title = document.querySelector('#prepare-title');
  const cancel = document.querySelector('#prepare-cancel-generation');
  const pendingRow = document.querySelector('#prepare-pending-actions');
  const guidance = document.createElement('label');
  guidance.className = 'departure-guidance';
  guidance.hidden = true;
  guidance.innerHTML =
    '<strong>这次想做什么，或想说什么？</strong><textarea rows="2" maxlength="2000" placeholder="选填，可以直接出发"></textarea>';
  panel.querySelector('.prepare-body').before(guidance);
  let active = null;
  function open({ selection = false, pending = false, onCancel } = {}) {
    if (active) return active;
    session.ai.formationLocked = !selection;
    guidance.hidden = !selection;
    guidance.querySelector('textarea').value = '';
    context.shell.renderParty();
    title.textContent = selection
      ? '选择本场同行者'
      : pending
        ? '正在生成剧本 · 可调整装备'
        : '剧本已就绪 · 调整装备';
    done.textContent = selection ? '确认编队 · 开始生成' : '整备完成 · 出发';
    done.disabled = pending;
    cancel.hidden = !pending;
    if (pendingRow) pendingRow.hidden = !pending;
    panel.dataset.pendingGeneration = pending ? 'true' : 'false';
    const oldClose = close.innerHTML;
    close.textContent = '取消出发';
    panel.showModal();
    if (!selection) context.onboarding?.preparationOpened();
    let resolve;
    const completion = new Promise((finish) => {
      resolve = finish;
    });
    let confirmed = false;
    const confirm = (event) => {
      if (selection) {
        try {
          compileRoster(session.ai.library);
          session.ai.scriptGuidance = guidance.hidden
            ? ''
            : guidance.querySelector('textarea').value.trim();
        } catch (failure) {
          event.stopImmediatePropagation();
          context.shell.toast(failure.message);
          return;
        }
      }
      confirmed = true;
    };
    done.addEventListener('click', confirm, { capture: true });
    panel.addEventListener(
      'close',
      () => {
        session.ai.formationLocked = false;
        guidance.hidden = true;
        title.textContent = '战阵整备';
        done.textContent = '返回';
        done.disabled = false;
        cancel.hidden = true;
        if (pendingRow) pendingRow.hidden = true;
        panel.dataset.pendingGeneration = 'false';
        close.innerHTML = oldClose;
        done.removeEventListener('click', confirm, { capture: true });
        active = null;
        if (pending) onCancel?.();
        resolve(confirmed);
      },
      { once: true },
    );
    active = {
      completion,
      ready() {
        pending = false;
        title.textContent = '剧本已就绪 · 调整装备';
        done.disabled = false;
        cancel.hidden = true;
        if (pendingRow) pendingRow.hidden = true;
        panel.dataset.pendingGeneration = 'false';
      },
      cancel() {
        if (panel.open) panel.close();
      },
    };
    return active;
  }
  return {
    choose() {
      return open({ selection: true }).completion;
    },
    equip: open,
    openOuting(onDone) {
      const panelEl = document.querySelector('#party-panel');
      if (panelEl.open) return false;
      session.ai.formationLocked = false;
      guidance.hidden = true;
      context.shell.renderParty();
      title.textContent = '外出战阵整备';
      done.textContent = '确认同行';
      done.disabled = false;
      cancel.hidden = true;
      if (pendingRow) pendingRow.hidden = true;
      panel.dataset.pendingGeneration = 'false';
      panelEl.showModal();
      panelEl.addEventListener(
        'close',
        () => {
          title.textContent = '战阵整备';
          done.textContent = '返回';
          onDone?.();
        },
        { once: true },
      );
      return true;
    },
    dispose() {
      active?.cancel();
      guidance.remove();
    },
  };
}
