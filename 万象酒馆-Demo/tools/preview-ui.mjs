import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { legacySession } from '../tests/browser/legacy-session.mjs';

const DESKTOP = Object.freeze({ width: 1440, height: 836 });
const PHONE_WIDE = Object.freeze({ width: 844, height: 390 });
const PHONE_TALL = Object.freeze({ width: 390, height: 844 });

async function isolatePreview(context, origin) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== origin ||
      url.pathname.startsWith('/__demo/') ||
      url.pathname.startsWith('/api/')
    ) {
      await route.abort();
      return;
    }
    if (route.request().isNavigationRequest() && ['/', '/index.html'].includes(url.pathname)) {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        '<head>',
        '<head><meta name="wanxiang-test-backend" content="local">',
      );
      await route.fulfill({ response, body });
      return;
    }
    await route.continue();
  });
}

async function positionWindow(client, bounds) {
  const { windowId } = await client.send('Browser.getWindowForTarget');
  await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  await client.send('Browser.setWindowBounds', { windowId, bounds });
  return windowId;
}

async function applyViewport(page, client, viewport, phone = false, scale = 1) {
  await page.setViewportSize(viewport);
  const portrait = viewport.height > viewport.width;
  await client.send('Emulation.setDeviceMetricsOverride', {
    ...viewport,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    deviceScaleFactor: 1,
    mobile: phone,
    scale,
    screenOrientation: {
      type: portrait ? 'portraitPrimary' : 'landscapePrimary',
      angle: portrait ? 0 : 90,
    },
  });
}

/** The game runs in two independent browser contexts from the same local checkout. */
export async function openUiPreview(browser, baseURL, { tileWindows = false } = {}) {
  const origin = new URL(baseURL).origin;
  if (new URL(origin).hostname !== '127.0.0.1') throw Error('UI 预览使用本机回环地址。');
  const desktopContext = await browser.newContext({
    viewport: tileWindows ? null : DESKTOP,
    serviceWorkers: 'block',
  });
  const phoneContext = await browser.newContext({
    viewport: PHONE_WIDE,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  try {
    await Promise.all([
      isolatePreview(desktopContext, origin),
      isolatePreview(phoneContext, origin),
    ]);
    const desktop = await desktopContext.newPage();
    const phone = await phoneContext.newPage();
    const desktopCDP = await desktopContext.newCDPSession(desktop);
    const phoneCDP = await phoneContext.newCDPSession(phone);
    const area = tileWindows
      ? await desktop.evaluate(() => ({
          left: globalThis.screen.availLeft,
          top: globalThis.screen.availTop,
          width: globalThis.screen.availWidth,
          height: globalThis.screen.availHeight,
        }))
      : null;
    const leftWidth = area ? Math.floor((area.width - 8) * 0.6) : 0;
    const rightWidth = area ? area.width - leftWidth - 8 : 0;
    const fit = (viewport, width) =>
      area ? Math.min(1, (width - 24) / viewport.width, (area.height - 112) / viewport.height) : 1;

    let desktopWindow;
    if (area) {
      desktopWindow = await positionWindow(desktopCDP, {
        left: area.left,
        top: area.top,
        width: leftWidth,
        height: area.height,
      });
      await applyViewport(desktop, desktopCDP, DESKTOP, false, fit(DESKTOP, leftWidth));
    }

    let tall = false;
    async function setPhoneOrientation(portrait) {
      const viewport = portrait ? PHONE_TALL : PHONE_WIDE;
      const scale = fit(viewport, rightWidth);
      if (area) {
        const phoneWindow = await positionWindow(phoneCDP, {
          left: area.left + leftWidth + 8,
          top: area.top,
          width: rightWidth,
          height: Math.min(area.height, Math.ceil(viewport.height * scale) + 112),
        });
        if (phoneWindow === desktopWindow) throw Error('Edge 未能打开独立的预览窗口。');
      }
      await applyViewport(phone, phoneCDP, viewport, true, scale);
      tall = portrait;
    }
    await setPhoneOrientation(false);

    let rotating = false;
    for (const [page, title] of [
      [desktop, '桌面预览'],
      [phone, '手机预览'],
    ]) {
      await legacySession(page, { dismissJournals: false });
      await page.exposeFunction('rotatePreviewPhone', async () => {
        if (rotating || phone.isClosed()) return;
        rotating = true;
        try {
          await setPhoneOrientation(!tall);
        } finally {
          rotating = false;
        }
      });
      await page.addInitScript((label) => {
        globalThis.addEventListener('keydown', (event) => {
          if (event.ctrlKey && event.altKey && event.code === 'KeyR') {
            event.preventDefault();
            if (!event.repeat) void globalThis.rotatePreviewPhone();
          }
        });
        if (globalThis === globalThis.top) {
          globalThis.document.addEventListener('DOMContentLoaded', () => {
            globalThis.document.title = `万象酒馆 · ${label}`;
          });
        }
      }, title);
    }
    await Promise.all([desktop.goto(origin), phone.goto(origin)]);
    return {
      desktop,
      phone,
      setPhoneOrientation,
      async close() {
        await Promise.all([desktopContext.close(), phoneContext.close()]);
      },
    };
  } catch (failure) {
    await Promise.all([desktopContext.close(), phoneContext.close()]);
    throw failure;
  }
}

async function run() {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  try {
    const preview = await openUiPreview(browser, process.argv[2], { tileWindows: true });
    const windowsClosed = [preview.desktop, preview.phone].map((page) =>
      page.isClosed() ? Promise.resolve() : new Promise((done) => page.once('close', done)),
    );
    console.log('左侧为桌面预览，右侧为手机预览。Ctrl+Alt+R 切换手机横屏和竖屏。');
    await Promise.all(windowsClosed);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
