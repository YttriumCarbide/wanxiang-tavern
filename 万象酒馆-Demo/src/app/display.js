import { createEventScope } from '../shared/events.js';
import { mountRotatedScrolling } from './touch-scroll.js';

/** Stop page-owned mouse navigation while preserving left-button card dragging and scrolling. */
export function guardMouseGestures(events, target = document) {
  const editor = (event) =>
    event.target instanceof Element &&
    event.target.closest('input,textarea,[contenteditable="true"]');
  events.on(
    target,
    'contextmenu',
    (event) => {
      if (editor(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick'])
    events.on(
      target,
      type,
      (event) => {
        if (!editor(event) && event.pointerType !== 'touch' && event.button > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { capture: true },
    );
  events.on(
    target,
    'pointermove',
    (event) => {
      if (!editor(event) && event.buttons & 6) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    events.on(target, type, (event) => event.preventDefault(), { passive: false });
}

function isHandheld() {
  return matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) <= 768;
}

/** The requested layout and the device's landscape host are independent. */
export function configureGameLayout() {
  const preference = new URLSearchParams(location.search).get('layout');
  if (globalThis.wanxiangNativeUpdate) document.documentElement.dataset.androidWebView = '';
  document.documentElement.dataset.gameLayout =
    preference === 'mobile' || preference === 'desktop'
      ? preference
      : isHandheld()
        ? 'mobile'
        : 'desktop';
}

/** The same game entry runs once inside a landscape viewport; no duplicate game or save owner. */
export function mountLandscapeHost() {
  if (
    globalThis.wanxiangNativeUpdate ||
    new URLSearchParams(location.search).get('display') === 'landscape' ||
    !isHandheld()
  )
    return false;
  const frame = document.createElement('iframe');
  frame.id = 'landscape-frame';
  frame.title = '横屏万象酒馆';
  frame.allow = 'fullscreen; autoplay';
  frame.allowFullscreen = true;
  const url = new URL(location.href);
  url.searchParams.set('display', 'landscape');
  frame.src = url.href;
  document.body.classList.add('landscape-host');
  document.body.append(frame);
  return true;
}
export function mountDisplay(context) {
  guardMouseGestures(context.events);
  mountRotatedScrolling(context.events);
  if (globalThis.wanxiangNativeUpdate) {
    context.events.on(window, 'resize', configureGameLayout);
  }
  const button = document.querySelector('#fullscreen-toggle');
  const host = window.top.document;
  const label = document.createElement('span');
  label.className = 'fullscreen-label';
  button.append(label);
  const paint = () => {
    const active = !!host.fullscreenElement;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
    label.textContent = active ? '退出全屏' : '全屏显示';
  };
  context.events.on(button, 'click', async () => {
    try {
      if (host.fullscreenElement) await host.exitFullscreen();
      else {
        await host.documentElement.requestFullscreen();
        if (matchMedia('(pointer: coarse)').matches)
          await screen.orientation?.lock?.('landscape').catch(() => {});
      }
    } catch {
      context.shell.toast('当前浏览器不支持全屏，可使用浏览器的全屏功能。');
    }
    paint();
  });
  context.events.on(host, 'fullscreenchange', paint);
  paint();
  return { dispose() {} };
}
export function mountOuterGestures() {
  const events = createEventScope();
  guardMouseGestures(events);
  events.on(window, 'pagehide', (event) => {
    if (!event.persisted) events.dispose();
  });
}
