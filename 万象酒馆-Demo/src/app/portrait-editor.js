import { readPortraitFromUrl, portraitUrl } from '../portraits.js';
import { query as $ } from './dom.js';

/** Remote images are imported once into the same optimized local portrait path as uploads. */
export function createPortraitEditor(context) {
  const dialog = $('#portrait-dialog');
  let heroId = null;
  let request = null;
  let ticket = 0;
  context.events.on($('#portrait-url-apply'), 'click', async () => {
    if (request || !heroId) return;
    const id = heroId;
    const turn = ++ticket;
    request = new AbortController();
    $('#portrait-url-apply').disabled = true;
    $('#portrait-url-status').textContent = '正在读取并保存图片…';
    try {
      const data = await readPortraitFromUrl(
        $('#portrait-url').value,
        request.signal,
        context.apiClient.request,
      );
      if (turn !== ticket || !dialog.open || context.session.runtime.disposed) return;
      context.shell.setCustomPortrait(id, data);
      dialog.close();
    } catch (error) {
      if (turn === ticket && error.name !== 'AbortError')
        $('#portrait-url-status').textContent = error.message;
    } finally {
      if (turn === ticket) {
        request = null;
        $('#portrait-url-apply').disabled = false;
      }
    }
  });
  context.events.on($('#portrait-url-close'), 'click', () => dialog.close());
  context.events.on(dialog, 'close', () => {
    ticket++;
    request?.abort();
    request = null;
  });
  context.events.on($('#portrait-url'), 'keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('#portrait-url-apply').click();
    }
  });
  context.events.on(window, 'pagehide', () => request?.abort(), { once: true });
  return {
    open(id) {
      heroId = id;
      $('#portrait-url').value = '';
      $('#portrait-url-preview').src = portraitUrl(
        context.session.ai.library.characters.find((entry) => entry.id === id)?.combat,
      );
      $('#portrait-url-status').textContent =
        '粘贴公网图片直链；导入后会保存在本机，刷新仍可使用。';
      $('#portrait-url-apply').disabled = false;
      if (!dialog.open) dialog.showModal();
    },
  };
}
