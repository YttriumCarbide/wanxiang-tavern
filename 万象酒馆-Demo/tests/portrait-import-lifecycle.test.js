import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileAsOptimizedImage } from '../src/portraits.js';

class MockFileReader {
  static instance;

  result = 'data:image/webp;base64,dGVzdA==';

  readAsDataURL() {
    MockFileReader.instance = this;
    queueMicrotask(() => {
      this.onload();
      this.onloadend();
    });
  }
}

test('portrait file uploads receive and honor the editor abort signal', async (t) => {
  const previous = globalThis.FileReader;
  globalThis.FileReader = MockFileReader;
  t.after(() => {
    if (previous === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = previous;
  });

  const controller = new AbortController();
  let uploadSignal;
  const request = (_path, _body, { signal }) => {
    uploadSignal = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  const pending = readFileAsOptimizedImage(
    { type: 'image/webp', size: 4 },
    request,
    controller.signal,
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(uploadSignal, controller.signal);
  const reason = new DOMException('editor closed', 'AbortError');
  controller.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
});
