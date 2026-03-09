const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DEBUG]')) {
      console.log('PAGE LOG:', text);
    }
  });

  try {
    await page.goto('http://127.0.0.1:4577', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  } catch (err) {
    console.error('Error navigating:', err);
  } finally {
    await browser.close();
  }
})();
