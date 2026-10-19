import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { CHAT_PLACES, roomChatPlace } from '../../src/chat-places.js';

export async function roomChatChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  await legacySession(page);
  const requests = [],
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/ai/generate/chat', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        content: '同伴在这里坐下。',
        display: '同伴在这里坐下。',
        actions: { affection: [], agreeToAdventure: [] },
        usage: { input: 10, output: 5 },
        request: { tokens: { inputEstimate: 10, tokenizer: 'o200k_base' }, warnings: [] },
      },
    });
  });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow.modelReady === true,
    );
    const frame = page.frameLocator('#inn-frame iframe');
    let locations = 0;
    for (const room of ['a', 'b', 'master']) {
      const target = room === 'master' ? '/master-bedroom.html' : '/guest-room.html';
      const navigation = page.waitForEvent(
        'framenavigated',
        (candidate) =>
          candidate.parentFrame() === page.mainFrame() &&
          new URL(candidate.url()).pathname.endsWith(target),
      );
      await page.locator('#inn-frame iframe').evaluate((element, room) => {
        element.src =
          room === 'master' ? './master-bedroom.html' : './guest-room.html?room=' + room;
      }, room);
      await navigation;
      await page.waitForFunction(
        (kind) => {
          const roomWindow = document.querySelector('#inn-frame iframe').contentWindow;
          return roomWindow.guestRoomReady === true && roomWindow.guestRoomPreview?.kind === kind;
        },
        room,
        { timeout: 60000 },
      );
      const chatButton = await frame.locator('#room-talk').boundingBox();
      assert(
        Math.abs(chatButton.x + chatButton.width / 2 - 720) < 1,
        `${room}: chat is centered at the bottom`,
      );
      const places =
        room === 'master'
          ? [
              'bed',
              'window',
              'desk',
              'wardrobe',
              'washstand',
              'stove',
              'door',
              'sitting',
              'bookshelf',
            ]
          : ['bed', 'window', 'desk', 'wardrobe', 'washstand', 'stove', 'door'];
      for (const spot of places) {
        await frame
          .locator('canvas')
          .evaluate((_canvas, spot) => window.guestRoomPreview.placeNow(spot), spot);
        await frame.locator('#room-talk').click();
        const id = roomChatPlace(room, spot);
        await page.locator('#chat-dialog').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#chat-place-select').inputValue(), id);
        assert.equal(await page.locator('#chat-place').textContent(), CHAT_PLACES[id].name);
        if (spot === 'bed') {
          await page.locator('#chat-input').fill('在这个房间歇一会儿。');
          await page.locator('#chat-input').press('Enter');
          await page.waitForFunction(() => !document.querySelector('#chat-send').disabled);
          assert.equal(requests.at(-1).place, id);
          const preview = await page.evaluate(
            async (input) =>
              (
                await fetch('/api/ai/prompts/preview', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ kind: 'chat', input }),
                })
              ).json(),
            requests.at(-1),
          );
          assert(
            preview.messages.some((message) =>
              message.content.includes(CHAT_PLACES[id].environment),
            ),
          );
        }
        locations++;
        if (room === 'master' && spot === 'sitting')
          await page.screenshot({ path: path.join(output, 'master-room-chat.png') });
        await page.locator('#chat-close').click();
      }
    }
    assert.equal(
      await page.evaluate(
        () =>
          demo
            .getLibrary()
            .tavernChat.filter(
              (message) => message.role === 'user' && message.content === '在这个房间歇一会儿。',
            ).length,
      ),
      3,
    );
    assert(
      requests[2].history.some(
        (message) => message.role === 'assistant' && message.content === '同伴在这里坐下。',
      ),
    );
    assert.deepEqual(errors, []);
    return { rooms: 3, locations, sharedHistory: true, sceneDescriptionsSent: true };
  } finally {
    await page.close();
  }
}
