import { officialSummonPool, summonSource } from '../summoning.js';
import { query as $ } from './dom.js';

export function createSummoning(context) {
  const { session, events } = context;
  const dialog = $('#summon-choice');
  let mode = null;
  let stage = 'choose';
  function close() {
    dialog.hidden = true;
    document.body.classList.remove('summoning');
    $('#inn-frame iframe')?.contentWindow?.postMessage(
      { type: 'summon-mode', mode: null, choosing: false },
      location.origin,
    );
  }
  let busy = false;
  const controller = new AbortController();
  const library = () => session.ai.library;
  function refresh() {
    const contracts = library().inventory?.summonContracts || 0;
    $('#contract-count').textContent = String(contracts);
    $('#gold-count').textContent = String(library().inventory?.gold || 0);
    $('#ether-count').textContent = String(library().inventory?.ether || 0);
    $('#summon-contracts').textContent = `持有契约 ${contracts} 份`;
    $('#summon-confirm').disabled = busy || contracts < 1 || library().characters.length >= 100;
    dialog.dataset.stage = stage;
    dialog.dataset.mode = mode || '';
    $('#summon-wish-label').hidden = stage !== 'wish';
    $('#summon-confirm').hidden = !mode;
    $('#summon-cancel').hidden = stage !== 'wish';
    $('#summon-confirm').textContent = stage === 'wish' ? '确定' : '开始召唤';
    $('#summon-npc-label').hidden = mode !== 'npc' || stage === 'wish';
    const selected = $('#summon-npc').value;
    $('#summon-npc').replaceChildren(
      ...library()
        .archives.npcs.filter(
          (npc) =>
            npc.name !== '潘多拉' &&
            !library().characters.some((member) => member.setting.name === npc.name),
        )
        .map((npc) => new Option(npc.name, npc.id)),
    );
    if (selected) $('#summon-npc').value = selected;
    dialog.querySelectorAll('[data-summon-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.summonMode === mode));
      button.disabled = busy || (!!mode && button.dataset.summonMode !== mode);
      button.setAttribute('aria-hidden', String(!!mode && button.dataset.summonMode !== mode));
    });
  }
  function open() {
    if (session.runtime.mode !== 'inn' || session.ai.busy) return;
    $('#summon-choice-status').textContent = '';
    mode = null;
    stage = 'choose';
    refresh();
    const original = $('#inn-frame iframe')
      ?.contentDocument?.querySelector('#summon-open')
      ?.getBoundingClientRect();
    if (original?.width && original?.height) {
      dialog.style.setProperty('--summon-width', original.width + 'px');
      dialog.style.setProperty('--summon-height', original.height + 'px');
    }
    dialog
      .querySelectorAll('[data-summon-mode]')
      .forEach((button) => button.getAnimations().forEach((animation) => animation.cancel()));
    dialog.hidden = false;
    document.body.classList.add('summoning');
    $('#inn-frame iframe')?.contentWindow?.postMessage(
      { type: 'summon-mode', mode: null, choosing: true },
      location.origin,
    );
  }
  events.on($('#summon-choice-close'), 'click', close);
  events.on($('#summon-cancel'), 'click', () => {
    stage = 'selected';
    refresh();
  });
  events.on(document, 'keydown', (event) => {
    if (event.key === 'Escape' && !dialog.hidden && !busy) close();
  });
  events.on(dialog, 'click', (event) => {
    const button = event.target.closest('[data-summon-mode]');
    if (!button || busy) return;
    const before = button.getBoundingClientRect();
    mode = button.dataset.summonMode;
    stage = 'selected';
    $('#summon-choice-status').textContent = '';
    $('#inn-frame iframe')?.contentWindow?.postMessage({ type: 'summon-surge' }, location.origin);
    $('#inn-frame iframe')?.contentWindow?.postMessage(
      { type: 'summon-mode', mode, choosing: true },
      location.origin,
    );
    refresh();
    const after = button.getBoundingClientRect();
    button.getAnimations().forEach((animation) => animation.cancel());
    button.animate(
      [
        { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  });
  events.on($('#summon-confirm'), 'click', async () => {
    if (busy || session.ai.busy || dialog.hidden || session.runtime.mode !== 'inn') return;
    if (!(library().inventory?.summonContracts > 0)) return;
    if (!mode) return;
    if (stage !== 'wish' && ['infinite', 'chaos'].includes(mode)) {
      stage = 'wish';
      refresh();
      $('#summon-wish').focus();
      return;
    }
    busy = true;
    $('#inn-frame iframe')?.contentWindow?.postMessage({ type: 'summon-surge' }, location.origin);
    refresh();
    try {
      const source = summonSource(mode, Math.random());
      if (source === 'official') {
        const result = await context.apiClient.request('worldbooks/tavern-world', undefined, {
          signal: controller.signal,
        });
        if (session.runtime.disposed || dialog.hidden || session.runtime.mode !== 'inn') return;
        const pool = officialSummonPool(library(), result.book);
        if (!pool.length)
          throw Error(
            '世界书中的官设角色已全部加入，或缺少官设条目。可使用无限召唤术。此次未消耗契约。',
          );
        await context.generation.recruitOfficial(pool[Math.floor(Math.random() * pool.length)]);
        close();
      } else {
        const brief = $('#summon-wish').value.trim();
        const pool = library().archives.npcs.filter(
          (npc) =>
            npc.name !== '潘多拉' &&
            !library().characters.some((member) => member.setting.name === npc.name),
        );
        const npc =
          source === 'npc'
            ? mode === 'npc'
              ? pool.find((npc) => npc.id === $('#summon-npc').value)
              : pool[Math.floor(Math.random() * pool.length)]
            : null;
        if (source === 'npc' && !npc) throw Error('没有可召唤的已知NPC，此次未消耗契约。');
        const npcInput = npc
          ? {
              ...structuredClone(npc),
              scripts: (npc.sources || []).map((source) => ({
                title: source.title,
                story: library().scripts.find((book) => book.id === source.scriptId)?.story || [],
              })),
            }
          : null;
        close();
        await context.generation.portal('character', {
          brief: npc
            ? `细化已知NPC「${npc.name}」，保留其身份、经历和外貌，转化为可出战的同伴。${brief}`
            : brief,
          ...(npc ? { npc: npcInput } : {}),
        });
      }
    } catch (failure) {
      if (!session.runtime.disposed && failure.name !== 'AbortError')
        $('#summon-choice-status').textContent = failure.message;
    } finally {
      busy = false;
      if (!session.runtime.disposed) refresh();
    }
  });
  refresh();
  return {
    open,
    refresh,
    dispose() {
      controller.abort();
      close();
    },
  };
}
