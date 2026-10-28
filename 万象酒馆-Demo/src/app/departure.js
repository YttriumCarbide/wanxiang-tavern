import { compileRoster } from '../ai/library.js';

/** One existing draggable preparation screen, then the same screen with a locked party. */
export function createDeparture(context) {
  const { session, events } = context;
  const panel = document.querySelector('#party-panel');
  const done = document.querySelector('#prepare-done');
  const close = document.querySelector('#prepare-close');
  const title = document.querySelector('#prepare-title');
  const cancel = document.querySelector('#prepare-cancel-generation');
  const supplies = document.createElement('div');
  supplies.className = 'preparation-supplies';
  supplies.innerHTML =
    '<button data-prepare-buy>购买道具</button><button data-prepare-exchange>兑换装备</button>';
  panel.querySelector('footer').prepend(supplies);
  let active = null;
  events.on(supplies, 'click', (event) => {
    if (event.target.closest('[data-prepare-buy]')) context.shop.open({ preparation: true });
    if (event.target.closest('[data-prepare-exchange]')) context.equipment.openExchange();
  });
  function open({ selection = false, pending = false, onCancel } = {}) {
    if (active) return active;
    session.ai.formationLocked = !selection;
    context.shell.renderParty();
    title.textContent = selection
      ? '选择本场同行者'
      : pending
        ? '正在生成剧本 · 可调整装备'
        : '剧本已就绪 · 调整装备';
    done.textContent = selection ? '确认编队 · 开始生成' : '整备完成 · 出发';
    done.disabled = pending;
    cancel.hidden = !pending;
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
        title.textContent = '战阵整备';
        done.textContent = '准备完成';
        done.disabled = false;
        cancel.hidden = true;
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
    dispose() {
      active?.cancel();
      supplies.remove();
    },
  };
}
