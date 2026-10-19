import { officialSummonPool, summonSource } from '../summoning.js';
import { query as $ } from './dom.js';

export function createSummoning(context) {
  const { session, events } = context;
  const dialog = $('#summon-choice');
  let mode = 'official';
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
    $('#summon-wish-label').hidden = mode === 'official';
    $('#summon-npc-label').hidden = mode !== 'npc';
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
      button.disabled = busy;
    });
  }
  function open() {
    if (session.runtime.mode !== 'inn' || session.ai.busy) return;
    $('#summon-choice-status').textContent = '';
    refresh();
    if (!dialog.open) dialog.showModal();
  }
  events.on($('#summon-choice-close'), 'click', () => dialog.close());
  events.on(dialog, 'click', (event) => {
    const button = event.target.closest('[data-summon-mode]');
    if (!button || busy) return;
    mode = button.dataset.summonMode;
    $('#summon-choice-status').textContent = '';
    $('#inn-frame iframe')?.contentWindow?.postMessage({ type: 'summon-surge' }, location.origin);
    refresh();
  });
  events.on($('#summon-confirm'), 'click', async () => {
    if (busy || session.ai.busy || !dialog.open || session.runtime.mode !== 'inn') return;
    if (!(library().inventory?.summonContracts > 0)) return;
    busy = true;
    $('#inn-frame iframe')?.contentWindow?.postMessage({ type: 'summon-surge' }, location.origin);
    refresh();
    try {
      const source = summonSource(mode, Math.random());
      if (source === 'official') {
        const result = await context.apiClient.request('worldbooks/tavern-world', undefined, {
          signal: controller.signal,
        });
        if (session.runtime.disposed || !dialog.open || session.runtime.mode !== 'inn') return;
        const pool = officialSummonPool(library(), result.book);
        if (!pool.length)
          throw Error(
            '世界书中的官设角色已全部加入，或缺少官设条目。可使用无限召唤术。此次未消耗契约。',
          );
        await context.generation.recruitOfficial(pool[Math.floor(Math.random() * pool.length)]);
        dialog.close();
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
        dialog.close();
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
  return { open, refresh, dispose: () => controller.abort() };
}
