/** Keep model HTML/CSS in an opaque frame. Only the fixed resize script can execute. */
export function appendChatMessage(container, message, { name: speaker, portraits = [] } = {}) {
  container.querySelector('.chat-empty')?.remove();
  if (message.error) {
    const article = document.createElement('article');
    article.className = 'chat-response-error';
    const title = document.createElement('strong');
    title.textContent = `${message.error} · 原始回复`;
    const raw = document.createElement('pre');
    raw.textContent = message.content;
    article.append(title, raw);
    container.append(article);
    container.scrollTop = container.scrollHeight;
    return article;
  }
  if (message.divider || message.role === 'system') {
    const divider = document.createElement('article');
    divider.className = 'chat-divider';
    const text = document.createElement('span');
    text.textContent = message.content;
    divider.append(text);
    if (message.id) {
      const button = document.createElement('button');
      button.dataset.chatDelete = message.id;
      button.textContent = '删除';
      divider.append(button);
    }
    container.append(divider);
    container.scrollTop = container.scrollHeight;
    return divider;
  }
  const article = document.createElement('article');
  article.className = message.pending ? 'mes is-pending' : 'mes';
  article.dataset.role = message.role;
  if (message.id) article.dataset.messageId = message.id;
  const avatar = document.createElement('div');
  avatar.className = 'mes_avatar';
  if (!portraits.length) avatar.textContent = '✧';
  for (const portrait of portraits) {
    const image = document.createElement('img');
    image.src = portrait.src;
    image.alt = portrait.name;
    avatar.append(image);
  }
  const content = document.createElement('div');
  content.className = 'mes_content';
  const heading = document.createElement('div');
  heading.className = 'mes_heading';
  const name = document.createElement('b');
  name.className = 'ch_name';
  name.textContent = speaker || (message.role === 'user' ? '你' : '酒馆来客');
  const badge = document.createElement('small');
  badge.className = 'ch_badge';
  badge.textContent = message.role === 'user' ? '你' : message.pending ? '正在回应' : '回应';
  heading.append(name, badge);
  if (message.role === 'user' && message.id) {
    const retry = document.createElement('button');
    retry.className = 'chat-retry';
    retry.dataset.chatRetry = message.id;
    retry.textContent = '重试';
    retry.title = '重新发送这条消息，更新对应回应';
    heading.append(retry);
  }
  if (message.id) {
    const remove = document.createElement('button');
    remove.className = 'chat-delete';
    remove.dataset.chatDelete = message.id;
    remove.textContent = '删除';
    heading.append(remove);
  }
  const body = document.createElement(
    message.role === 'user' || message.pending ? 'div' : 'iframe',
  );
  body.className = 'mes_text';
  if (message.role === 'user' || message.pending) body.textContent = message.content;
  else {
    body.title = '交流正文';
    body.setAttribute('sandbox', 'allow-scripts');
    const nonce = crypto.randomUUID();
    const source = new URL('../chat/resize.js', import.meta.url).href;
    const stylesheet = new URL('../../styles/chat-message.css', import.meta.url).href;
    const content = (message.display ?? message.content).replace(
      /^\s*```html\s*\n([\s\S]*?)\n```\s*$/i,
      '$1',
    );
    body.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${location.origin}; img-src https: data:; script-src 'nonce-${nonce}'; connect-src 'none'; form-action 'none'; base-uri 'none'"><link rel="stylesheet" href="${stylesheet}"><main>${content}</main><script nonce="${nonce}" src="${source}"></script>`;
  }
  content.append(heading, body);
  article.append(avatar, content);
  container.append(article);
  container.scrollTop = container.scrollHeight;
  return article;
}
