import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { layout } from '../tests/browser/layout.mjs';
import { withTestServer } from './testing/runtime.mjs';

const directory = fileURLToPath(new URL('../tests/fixtures/', import.meta.url));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.TEST_BROWSER || 'msedge',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  await withTestServer(async (baseURL) => {
    console.log(
      await layout({ browser, baseURL, fixture: directory + 'layout.json', update: true }),
    );
  });
} finally {
  await browser.close();
}
