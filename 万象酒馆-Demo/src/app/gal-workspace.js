import { galIconMarkup } from './gal-icons.js';

/** Move existing controls into the full-screen stage; keep their listeners and storage owner. */
export function createGalWorkspace(panel, events, actions) {
  const root = document.createElement('div');
  root.className = 'gal-workspace';
  root.hidden = true;
  root.innerHTML = `<nav class="gal-workspace-menu" aria-label="交流工具"><button data-workspace="people">同行者</button><button data-workspace="compose">输入</button><button data-workspace="replay">重播上次</button><button data-workspace="tools" aria-expanded="false">生成信息与剧本工具</button></nav>
    <aside id="gal-people-drawer" class="gal-side" aria-label="选择交谈人物" hidden><header><strong>此刻相伴</strong><button data-workspace="compose">返回输入</button></header><div class="gal-side-content"></div></aside>
    <section class="gal-composer" hidden><header><strong>你的话</strong><button data-workspace="exit">收起</button></header><div class="gal-composer-content"></div><small class="gal-feedback" role="status" hidden></small></section>
    <section class="gal-tools" hidden aria-label="生成信息与剧本工具"><header><strong>生成信息与剧本</strong><button data-workspace="tools">关闭</button></header><div class="gal-tools-content"></div></section>
    <section class="gal-archive" hidden><header><strong>交流记录</strong><button data-workspace="archive">返回演出</button></header><div class="gal-archive-content"></div></section>`;
  panel.append(root);
  const menu = root.querySelector('.gal-workspace-menu');
  panel.querySelector('.gal-actionbar').prepend(menu);
  const people = menu.querySelector('[data-workspace="people"]');
  people.className = 'gal-people-launcher';
  people.innerHTML = `${galIconMarkup('people', '选择交谈人物')}<span aria-hidden="true" class="gal-people-label">人物</span>`;
  people.type = 'button';
  people.setAttribute('aria-label', '选择交谈人物与任务');
  people.setAttribute('aria-controls', 'gal-people-drawer');
  people.setAttribute('aria-expanded', 'false');
  people.title = '选择交谈人物与任务';
  root.querySelector('.gal-side header strong').textContent = '在场角色';
  root.append(people);
  menu.hidden = true;
  let config = null;
  let mounted = [];
  let decorated = [];
  let returnFocusTargets = new WeakMap();
  const exits = new Map();
  const observer = new ResizeObserver(() => notifyLayout());
  const part = (selector) => panel.querySelector(selector);
  const workspacePanels = ['.gal-side', '.gal-composer', '.gal-archive', '.gal-tools'].map(part);
  const toolsLauncher = menu.querySelector('[data-workspace="tools"]');
  function focusSafely(target) {
    if (!target?.isConnected || target.closest('[hidden], [inert]')) return false;
    target.focus({ preventScroll: true });
    return document.activeElement === target;
  }
  function focusPanel(target) {
    const candidates = target.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
    );
    for (const candidate of candidates) if (focusSafely(candidate)) return;
    focusSafely(panel);
  }
  function cancelExit(target) {
    const exit = exits.get(target);
    if (exit) {
      exits.delete(target);
      exit.cancel();
    }
    delete target.dataset.workspaceExiting;
  }
  function showPanel(target) {
    cancelExit(target);
    target.hidden = false;
    target.inert = false;
    if (target === part('.gal-side')) people.setAttribute('aria-expanded', 'true');
  }
  function hidePanel(target, focusFallback = null) {
    if (target.hidden || exits.has(target)) return;
    if (target.contains(document.activeElement)) {
      if (!focusSafely(focusFallback)) focusSafely(panel);
    }
    target.inert = true;
    if (target === part('.gal-side')) people.setAttribute('aria-expanded', 'false');
    if (target === part('.gal-tools')) toolsLauncher.setAttribute('aria-expanded', 'false');
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      (target === part('.gal-composer') && panel.dataset.composerCollapsed === 'true')
    ) {
      target.hidden = true;
      return;
    }
    target.dataset.workspaceExiting = 'true';
    const animation = [...target.getAnimations()].find(
      (candidate) => candidate.animationName === 'gal-workspace-exit',
    );
    if (!animation) {
      target.hidden = true;
      delete target.dataset.workspaceExiting;
      return;
    }
    exits.set(target, animation);
    const finish = () => {
      if (exits.get(target) !== animation) return;
      exits.delete(target);
      target.hidden = true;
      delete target.dataset.workspaceExiting;
    };
    void animation.finished.then(finish, finish);
  }
  function notifyLayout() {
    if (!config || part('.gal-composer').hidden) return;
    config?.onLayout?.({
      height: part('.gal-composer').offsetHeight,
      collapsed: panel.dataset.composerCollapsed === 'true',
    });
  }
  function collapse(value) {
    if (!config?.persistent) return;
    const composer = part('.gal-composer');
    if (value && composer.contains(document.activeElement)) {
      if (!focusSafely(returnFocusTargets.get(composer))) focusSafely(panel);
    }
    panel.dataset.composerCollapsed = String(value);
    composer.inert = value;
    notifyLayout();
  }
  function clear() {
    observer.disconnect();
    for (const target of workspacePanels) {
      cancelExit(target);
      target.hidden = true;
      target.inert = false;
    }
    toolsLauncher.setAttribute('aria-expanded', 'false');
    people.setAttribute('aria-expanded', 'false');
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
    part('.gal-composer').inert = false;
    delete panel.dataset.composerCollapsed;
    delete panel.dataset.persistent;
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
  function toggle(name, trigger = null) {
    const target = part('.gal-' + name);
    if (!target) return;
    if (name === 'composer' && config?.persistent) {
      if (target.hidden || target.hasAttribute('data-workspace-exiting')) {
        const focusedPanel = workspacePanels.find(
          (candidate) => candidate !== target && candidate.contains(document.activeElement),
        );
        showPanel(target);
        for (const candidate of workspacePanels)
          if (candidate !== target) hidePanel(candidate, returnFocusTargets.get(candidate));
        panel.dataset.drawer = 'composer';
        if (focusedPanel) focusPanel(target);
      }
      collapse(false);
      return;
    }
    const visible = target.hidden || target.hasAttribute('data-workspace-exiting');
    const next = visible ? name : 'composer';
    const nextPanel = part('.gal-' + next);
    const focusedPanel = workspacePanels.find(
      (candidate) => candidate !== nextPanel && candidate.contains(document.activeElement),
    );
    if (visible && trigger) returnFocusTargets.set(nextPanel, trigger);
    showPanel(nextPanel);
    for (const candidate of workspacePanels)
      if (candidate !== nextPanel)
        hidePanel(candidate, returnFocusTargets.get(candidate) || trigger);
    panel.dataset.drawer = next;
    if (visible) {
      actions.pause();
      if (name === 'side') focusPanel(target);
      else target.querySelector('textarea')?.focus({ preventScroll: true });
    } else if (focusedPanel) focusPanel(nextPanel);
  }
  events.on(panel, 'click', (event) => {
    const trigger = event.target.closest('[data-workspace]');
    const action = trigger?.dataset.workspace;
    if (action === 'people') toggle('side', trigger);
    if (action === 'compose') toggle('composer', trigger);
    if (action === 'archive') toggle('archive', trigger);
    if (action === 'replay') config?.replay?.();
    if (action === 'exit') {
      if (config?.persistent) collapse(true);
      else actions.exit();
    }
    if (action === 'tools') {
      const tools = part('.gal-tools');
      if (tools.hidden || tools.hasAttribute('data-workspace-exiting')) {
        returnFocusTargets.set(tools, trigger);
        showPanel(tools);
        toolsLauncher.setAttribute('aria-expanded', 'true');
      } else hidePanel(tools, returnFocusTargets.get(tools) || trigger);
    }
  });
  return {
    get active() {
      return config;
    },
    open(options) {
      clear();
      config = options;
      returnFocusTargets = new WeakMap();
      panel.dataset.workspace = options.owner;
      root.hidden = false;
      menu.hidden = false;
      mount(options.selection, '.gal-side-content');
      mount(options.composer, '.gal-composer-content');
      mount(options.auxiliary, '.gal-tools-content');
      mount(options.history, '.gal-archive-content');
      panel.dataset.persistent = String(options.persistent === true);
      for (const button of part('.gal-composer').querySelectorAll(
        '#chat-send,#quick-chat-send,#chat-cancel,#invite-send,#overland-send,[data-rp="send"]',
      )) {
        decorated.push({
          button,
          markup: button.innerHTML,
          label: button.getAttribute('aria-label'),
          title: button.getAttribute('title'),
        });
        const label =
          button.getAttribute('aria-label') || (button.id === 'chat-cancel' ? '取消请求' : '发送');
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = galIconMarkup(button.id === 'chat-cancel' ? 'close' : 'send', label);
      }
      people.hidden = !options.selection?.length;
      part('[data-workspace="compose"]').hidden = !options.composer?.length;
      part('[data-workspace="replay"]').hidden = !options.replay;
      part('.gal-side').hidden = true;
      part('.gal-composer').hidden = false;
      part('.gal-archive').hidden = true;
      part('.gal-tools').hidden = true;
      part('.gal-feedback').hidden = true;
      toolsLauncher.setAttribute('aria-expanded', 'false');
      panel.dataset.drawer = 'composer';
      actions.show(options.title);
      observer.observe(part('.gal-composer'));
      collapse(false);
    },
    playing(value) {
      panel.dataset.playing = String(value);
      if (value) {
        if (workspacePanels.some((target) => target.contains(document.activeElement)))
          focusSafely(panel);
        for (const target of workspacePanels) hidePanel(target);
        panel.dataset.drawer = '';
      } else if (config) {
        const composer = part('.gal-composer');
        const focusedPanel = workspacePanels.find(
          (target) => target !== composer && target.contains(document.activeElement),
        );
        showPanel(composer);
        for (const target of workspacePanels)
          if (target !== composer) hidePanel(target, returnFocusTargets.get(target));
        if (focusedPanel) focusPanel(composer);
        panel.dataset.drawer = 'composer';
      }
    },
    history() {
      toggle('archive');
    },
    collapse,
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
