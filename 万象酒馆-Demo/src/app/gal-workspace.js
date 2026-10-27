import { galIconMarkup } from './gal-icons.js';

/** Move existing controls into the full-screen stage; keep their listeners and storage owner. */
export function createGalWorkspace(panel, events, actions) {
  const root = document.createElement('div');
  root.className = 'gal-workspace';
  root.hidden = true;
  root.innerHTML = `<nav class="gal-workspace-menu" aria-label="交流工具"><button data-workspace="people">同行者</button><button data-workspace="compose">输入</button><button data-workspace="replay">重播上次</button><button data-workspace="tools" aria-expanded="false">生成信息与剧本工具</button></nav>
    <aside class="gal-side" hidden><header><strong>此刻相伴</strong><button data-workspace="compose">返回输入</button></header><div class="gal-side-content"></div></aside>
    <section class="gal-composer" hidden><header><strong>你的话</strong><button data-workspace="exit">收起</button></header><div class="gal-composer-content"></div><small class="gal-feedback" role="status" hidden></small></section>
    <section class="gal-tools" hidden aria-label="生成信息与剧本工具"><header><strong>生成信息与剧本</strong><button data-workspace="tools">关闭</button></header><div class="gal-tools-content"></div></section>
    <section class="gal-archive" hidden><header><strong>交流记录</strong><button data-workspace="archive">返回演出</button></header><div class="gal-archive-content"></div></section>`;
  panel.append(root);
  const menu = root.querySelector('.gal-workspace-menu');
  panel.querySelector('.gal-actionbar').prepend(menu);
  menu.hidden = true;
  let config = null;
  let mounted = [];
  let decorated = [];
  const part = (selector) => panel.querySelector(selector);
  function clear() {
    for (const { button, markup, label, title } of decorated) {
      button.innerHTML = markup;
      for (const [name, value] of [
        ['aria-label', label],
        ['title', title],
      ]) {
        if (value === null) button.removeAttribute(name);
        else button.setAttribute(name, value);
      }
    }
    decorated = [];
    for (const { node, placeholder } of mounted) {
      placeholder.replaceWith(node);
    }
    mounted = [];
    config = null;
    root.hidden = true;
    menu.hidden = true;
    delete panel.dataset.workspace;
    delete panel.dataset.drawer;
  }
  function mount(nodes, target) {
    for (const node of nodes || []) {
      if (!node) continue;
      const placeholder = document.createComment('Gal control home');
      node.before(placeholder);
      mounted.push({ node, placeholder });
      part(target).append(node);
    }
  }
  function toggle(name) {
    const target = part(`.gal-${name}`);
    if (!target) return;
    const visible = target.hidden;
    for (const selector of ['.gal-side', '.gal-composer', '.gal-archive', '.gal-tools'])
      part(selector).hidden = true;
    const next = visible ? name : 'composer';
    part(`.gal-${next}`).hidden = false;
    panel.dataset.drawer = next;
    if (visible) {
      actions.pause();
      target.querySelector('textarea')?.focus({ preventScroll: true });
    }
  }
  events.on(panel, 'click', (event) => {
    const action = event.target.closest('[data-workspace]')?.dataset.workspace;
    if (action === 'people') toggle('side');
    if (action === 'compose') toggle('composer');
    if (action === 'archive') toggle('archive');
    if (action === 'replay') config?.replay?.();
    if (action === 'exit') actions.exit();
    if (action === 'tools') {
      const tools = part('.gal-tools');
      tools.hidden = !tools.hidden;
      menu
        .querySelector('[data-workspace="tools"]')
        .setAttribute('aria-expanded', String(!tools.hidden));
    }
  });
  return {
    get active() {
      return config;
    },
    open(options) {
      clear();
      config = options;
      panel.dataset.workspace = options.owner;
      root.hidden = false;
      menu.hidden = false;
      mount(options.selection, '.gal-side-content');
      mount(options.composer, '.gal-composer-content');
      mount(options.auxiliary, '.gal-tools-content');
      mount(options.history, '.gal-archive-content');
      for (const button of part('.gal-composer').querySelectorAll(
        '#chat-send,#quick-chat-send,#chat-cancel',
      )) {
        decorated.push({
          button,
          markup: button.innerHTML,
          label: button.getAttribute('aria-label'),
          title: button.getAttribute('title'),
        });
        const label = button.id === 'chat-cancel' ? '取消请求' : '发送';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = galIconMarkup(button.id === 'chat-cancel' ? 'close' : 'send', label);
      }
      part('[data-workspace="people"]').hidden = !options.selection?.length;
      part('[data-workspace="compose"]').hidden = !options.composer?.length;
      part('[data-workspace="replay"]').hidden = !options.replay;
      part('.gal-side').hidden = true;
      part('.gal-composer').hidden = false;
      part('.gal-archive').hidden = true;
      part('.gal-tools').hidden = true;
      part('.gal-feedback').hidden = true;
      menu.querySelector('[data-workspace="tools"]').setAttribute('aria-expanded', 'false');
      panel.dataset.drawer = 'composer';
      actions.show(options.title);
    },
    playing(value) {
      panel.dataset.playing = String(value);
      if (value) {
        for (const selector of ['.gal-side', '.gal-composer', '.gal-archive', '.gal-tools'])
          part(selector).hidden = true;
        panel.dataset.drawer = '';
      } else if (config) {
        part('.gal-composer').hidden = false;
        panel.dataset.drawer = 'composer';
      }
    },
    history() {
      toggle('archive');
    },
    feedback(owner, text) {
      if (config?.owner !== owner) return;
      part('.gal-feedback').textContent = text;
      part('.gal-feedback').hidden = !text;
    },
    close() {
      const onClose = config?.onClose;
      clear();
      onClose?.();
    },
    clear,
  };
}
