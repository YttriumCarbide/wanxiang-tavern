const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const { explorationJourneyChecks } = await import(
    pathToFileURL(path.join(__dirname, 'exploration.mjs')).href
  );
  const browser = await chromium.launch({
    channel: process.env.TEST_BROWSER || 'msedge',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  try {
    console.log(
      JSON.stringify(
        await explorationJourneyChecks({
          browser,
          baseURL: process.env.DEMO_TEST_URL,
          output: process.env.TEST_OUTPUT_DIR,
        }),
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
