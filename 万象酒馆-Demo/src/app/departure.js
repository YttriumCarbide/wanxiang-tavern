import { compileRoster } from '../ai/library.js';
import { ensureLeftExpandControl, resetLeftExpand } from './prep-view.js';

/** One existing draggable preparation screen, then the same screen with a locked party. */
export function createDeparture(context) {
  const { session } = context;
  const panel = document.querySelector('#party-panel');
  const done = document.querySelector('#prepare-done');
  const close = document.querySelector('#prepare-close');
  const title = document.querySelector('#prepare-title');
  const defaultTitle = title.textContent;
  const defaultCloseMarkup = close.innerHTML;
  const defaultCloseLabel = close.getAttribute('aria-label');
  const cancel = document.querySelector('#prepare-cancel-generation');
  const pendingRow = document.querySelector('#prepare-pending-actions');
  if (document.documentElement.dataset.gameLayout === 'mobile') {
    panel.querySelector('footer').prepend(pendingRow, panel.querySelector('.prepare-xbtns'));
  }
  const guidance = document.createElement('label');
  guidance.className = 'departure-guidance';
  guidance.hidden = true;
  guidance.innerHTML =
    '<strong>这次想做什么，或想说什么？</strong><textarea rows="2" maxlength="2000" placeholder="选填，可以直接出发"></textarea>';
  panel.querySelector('.prepare-body').before(guidance);
  let active = null;
  let burstTimer = 0;

  function clearReadyEffects() {
    clearTimeout(burstTimer);
    burstTimer = 0;
    panel.classList.remove('script-ready');
    done.classList.remove('depart-ready-fx', 'depart-ready-burst');
  }

  function triggerReadyEffects() {
    clearTimeout(burstTimer);
    panel.classList.add('script-ready');
    done.classList.add('depart-ready-fx');
    done.classList.remove('depart-ready-burst');
    void done.offsetWidth;
    done.classList.add('depart-ready-burst');
    burstTimer = setTimeout(() => {
      done.classList.remove('depart-ready-burst');
      burstTimer = 0;
    }, 1100);
  }

  function open({ selection = false, pending = false, onCancel } = {}) {
    if (active) return active;
    clearReadyEffects();
    session.ai.formationLocked = !selection;
    guidance.hidden = !selection;
    guidance.querySelector('textarea').value = '';
    context.shell.renderParty();
    ensureLeftExpandControl();
    resetLeftExpand(panel);
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
    if (!selection && !pending) triggerReadyEffects();
    close.textContent = '取消出发';
    close.setAttribute('aria-label', close.textContent);
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
          const node = session.journey.selectedNode;
          const partySize = session.ai.library.party.filter(Boolean).length;
          if (
            node?.map === 'mill' &&
            node.nodeId === 'mill-4-attic' &&
            partySize < 6 &&
            !globalThis.confirm(
              '磨坊第四关「阁楼齿轮室」是霸主战，难度极高。当前队伍未满六人，推荐满编再来。仍要以当前队伍出发吗？',
            )
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
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
        clearReadyEffects();
        resetLeftExpand(panel);
        session.ai.formationLocked = false;
        guidance.hidden = true;
        title.textContent = defaultTitle;
        done.textContent = '返回';
        done.disabled = false;
        cancel.hidden = true;
        if (pendingRow) pendingRow.hidden = true;
        panel.dataset.pendingGeneration = 'false';
        close.innerHTML = defaultCloseMarkup;
        close.setAttribute('aria-label', defaultCloseLabel);
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
        const wasPending = pending;
        pending = false;
        title.textContent = '剧本已就绪 · 调整装备';
        done.disabled = false;
        cancel.hidden = true;
        if (pendingRow) pendingRow.hidden = true;
        panel.dataset.pendingGeneration = 'false';
        if (wasPending || !done.classList.contains('depart-ready-fx')) {
          triggerReadyEffects();
        }
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
      clearReadyEffects();
      session.ai.formationLocked = false;
      guidance.hidden = true;
      context.shell.renderParty();
      ensureLeftExpandControl();
      resetLeftExpand(panelEl);
      title.textContent = '外出整备';
      done.textContent = '确认同行';
      done.disabled = false;
      cancel.hidden = true;
      if (pendingRow) pendingRow.hidden = true;
      panel.dataset.pendingGeneration = 'false';
      panelEl.showModal();
      panelEl.addEventListener(
        'close',
        () => {
          clearReadyEffects();
          resetLeftExpand(panelEl);
          title.textContent = defaultTitle;
          done.textContent = '返回';
          onDone?.();
        },
        { once: true },
      );
      return true;
    },
    dispose() {
      clearReadyEffects();
      resetLeftExpand(panel);
      active?.cancel();
      guidance.remove();
    },
  };
}
