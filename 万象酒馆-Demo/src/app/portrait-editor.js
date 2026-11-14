import { readPortraitFromUrl, portraitUrl, readFileAsOptimizedImage } from '../portraits.js';
import { query as $ } from './dom.js';
import { CHARACTER_IMAGE_PROMPTS } from '../content/portrait-templates.js';

/** Remote images are imported once into the same optimized local portrait path as uploads. */
export function createPortraitEditor(context) {
  const dialog = $('#portrait-dialog');
  let heroId = null;
  let request = null;
  let ticket = 0;
  let kind = 'card';
  const selector = document.createElement('nav');
  selector.className = 'portrait-kind';
  selector.innerHTML =
    '<button data-portrait-kind="card" aria-pressed="true">卡面</button><button data-portrait-kind="standing" aria-pressed="false">透明立绘 · 场景与Gal共用</button>';
  dialog.querySelector('header').after(selector);
  const local = document.createElement('input');
  local.type = 'file';
  local.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
  local.hidden = true;
  const upload = document.createElement('button');
  upload.textContent = '选择本地原图';
  const reset = document.createElement('button');
  reset.textContent = '恢复此类默认图片';
  const promptButton = document.createElement('button');
  promptButton.type = 'button';
  promptButton.textContent = '获取立绘提示词';
  $('#portrait-url-apply').after(upload, reset, promptButton, local);
  const promptOutput = document.createElement('textarea');
  promptOutput.readOnly = true;
  promptOutput.hidden = true;
  promptOutput.rows = 6;
  promptOutput.className = 'portrait-prompt-output';
  promptOutput.setAttribute('aria-label', '立绘提示词');
  dialog.querySelector('header').after(promptOutput);
  function preview() {
    const combat = context.session.ai.library.characters.find(
      (entry) => entry.id === heroId,
    )?.combat;
    $('#portrait-url-preview').src =
      kind === 'standing' ? combat?.customStanding || '' : portraitUrl(combat);
    $('#portrait-url-preview').hidden = kind === 'standing' && !combat?.customStanding;
    selector
      .querySelectorAll('[data-portrait-kind]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.portraitKind === kind)),
      );
    $('#portrait-url-status').textContent =
      kind === 'standing'
        ? '上传正面透明全身图；Gal按同一张图裁半身，原图不压缩。'
        : '卡面用于战斗卡牌与头像，独立保存原图。';
  }
  context.events.on(selector, 'click', (event) => {
    const next = event.target.closest('[data-portrait-kind]');
    if (next && !request) {
      kind = next.dataset.portraitKind;
      promptOutput.hidden = true;
      preview();
    }
  });
  context.events.on(upload, 'click', () => {
    local.value = '';
    local.click();
  });
  context.events.on(reset, 'click', () => {
    if (!request) {
      context.shell.setCustomPortrait(heroId, null, kind);
      preview();
    }
  });
  context.events.on(promptButton, 'click', async () => {
    const member = context.session.ai.library.characters.find((entry) => entry.id === heroId);
    if (!member) return;
    const type = kind;
    promptButton.disabled = true;
    try {
      const { book } = await context.apiClient.request('worldbooks/tavern-world');
      if (!dialog.open || member.id !== heroId || type !== kind) return;
      const entry = Object.values(book.entries).find(
        (item) => item.extensions?.wanxiang?.characterId === member.id,
      );
      const lore = entry?.content || member.setting.worldbook || member.setting.name;
      const text = `${CHARACTER_IMAGE_PROMPTS[type]}\n\n角色设定\n${lore}`;
      promptOutput.value = text;
      promptOutput.hidden = false;
      promptOutput.focus();
      promptOutput.select();
      try {
        await navigator.clipboard.writeText(text);
        $('#portrait-url-status').textContent = '提示词已复制';
      } catch {
        $('#portrait-url-status').textContent = '提示词已选中，可复制';
      }
    } catch (failure) {
      $('#portrait-url-status').textContent = failure.message;
    } finally {
      promptButton.disabled = false;
    }
  });
  context.events.on(local, 'change', async () => {
    if (!local.files[0] || request) return;
    const turn = ++ticket,
      id = heroId,
      type = kind;
    request = new AbortController();
    upload.disabled = true;
    try {
      const data = await readFileAsOptimizedImage(local.files[0], context.apiClient.request);
      if (turn === ticket && dialog.open) {
        context.shell.setCustomPortrait(id, data, type);
        preview();
      }
    } catch (failure) {
      if (turn === ticket) $('#portrait-url-status').textContent = failure.message;
    } finally {
      if (turn === ticket) request = null;
      upload.disabled = false;
    }
  });
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
      context.shell.setCustomPortrait(id, data, kind);
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
      kind = 'card';
      promptOutput.hidden = true;
      $('#portrait-url').value = '';
      $('#portrait-url-preview').src = portraitUrl(
        context.session.ai.library.characters.find((entry) => entry.id === id)?.combat,
      );
      $('#portrait-url-status').textContent =
        '粘贴公网图片直链；导入后会保存在本机，刷新仍可使用。';
      $('#portrait-url-apply').disabled = false;
      if (!dialog.open) dialog.showModal();
      preview();
    },
  };
}
