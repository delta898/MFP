#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = String(process.env.BLOGGENIUS_DEMO_URL || 'http://127.0.0.1:4577').replace(/\/+$/, '');
const outputPath = path.resolve(process.env.BLOGGENIUS_DEMO_VIDEO || 'demos/scenarios/product-showreel/product-showreel.webm');
const headless = !['false', '0', 'no'].includes(String(process.env.UI_BROWSER_HEADLESS || 'true').trim().toLowerCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveExecutable() {
  const candidates = [
    String(process.env.BLOGGENIUS_TEST_BROWSER || '').trim(),
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('Playwright Chromium을 찾지 못했습니다. BLOGGENIUS_TEST_BROWSER를 지정해 주세요.');
  return executablePath;
}

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const recordingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-live-showreel-'));
  const browser = await chromium.launch({ executablePath: resolveExecutable(), headless });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    recordVideo: { dir: recordingDirectory, size: { width: 1600, height: 1000 } }
  });
  await context.addInitScript(() => {
    localStorage.setItem('bloggenius.ui.style', 'warm-editorial');
    localStorage.removeItem('sidebar-collapsed');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(30000);
  const apiCalls = [];
  const pageErrors = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) apiCalls.push({ path: url.pathname, status: response.status() });
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const waitForView = async (view) => page.waitForFunction((name) => document.getElementById(`view-${name}`)?.classList.contains('active'), view);
  const go = async (view, tab) => {
    await page.evaluate(({ viewName, tabName }) => window.navigateTo(viewName, tabName), { viewName: view, tabName: tab });
    await waitForView(view);
    await sleep(450);
  };

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.navigateTo === 'function');
    await waitForView('dashboard');
    await sleep(900);

    // Dashboard: reveal the page depth, then collapse and reopen navigation.
    await page.locator('.main').evaluate((el) => el.scrollTo({ top: Math.max(0, el.scrollHeight - el.clientHeight), behavior: 'smooth' }));
    await sleep(700);
    await page.locator('.main').evaluate((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.locator('#sidebar-toggle-btn').click();
    await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('collapsed'));
    await sleep(350);
    await page.locator('#sidebar-toggle-btn').click();
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('collapsed'));
    await sleep(450);

    // Show the actual saved model/connection state without spending tokens on another test call.
    await go('settings-next');
    await page.locator('[data-settings-next-tab="ai"]').click();
    await page.waitForFunction(() => document.querySelector('[data-settings-next-ai-fields="text"] [data-ai-field="provider"]')?.options.length > 0);
    await page.waitForFunction(() => document.getElementById('settings-next-ai-text-status')?.textContent.trim() !== '확인 중...');
    await sleep(700);

    // Style transitions are scoped to this fresh Playwright context; they don't alter the user's browser profile.
    await page.locator('[data-settings-next-tab="app"]').click();
    await page.locator('#settings-next-app-tab-appearance').click();
    await page.waitForFunction(() => document.getElementById('settings-next-app-panel-appearance')?.hidden === false);
    const styleIds = ['quiet-sage-studio', 'autumn-night-library', 'hanji-dancheong'];
    const destinations = ['dashboard', 'blog-next', 'card-news'];
    for (let index = 0; index < styleIds.length; index += 1) {
      await page.locator(`[data-appearance-style="${styleIds[index]}"]`).click();
      await page.waitForFunction((id) => document.documentElement.dataset.style === id, styleIds[index]);
      await go(destinations[index], index === 1 ? 'quick' : undefined);
      await sleep(850);
      await go('settings-next');
      await page.locator('[data-settings-next-tab="app"]').click();
      await page.locator('#settings-next-app-tab-appearance').click();
    }

    // Real development trend metadata and query; this is read-only.
    await go('blog-next', 'trend-posting');
    await page.locator('[data-blog-next-tab="trend-posting"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-blog-next-trend-category]').length > 0, null, { timeout: 30000 });
    const categoryButtons = page.locator('[data-blog-next-trend-category]');
    const categoryCount = await categoryButtons.count();
    if (categoryCount > 1) await categoryButtons.nth(1).click();
    if (categoryCount > 2) await categoryButtons.nth(2).click();
    await page.locator('#blog-next-trend-period').selectOption('7days');
    await page.locator('#blog-next-trend-query').click();
    await page.waitForFunction(() => !document.querySelector('.trend-posting-table-wrap')?.getAttribute('aria-busy')?.includes('true')
      && document.querySelector('#blog-next-trend-results-workspace')?.hidden === false, null, { timeout: 45000 });
    await sleep(1300);

    // Perform the real forced-update check and show its notice. Deliberately stop before installation.
    await go('settings-next');
    await page.locator('[data-settings-next-tab="app"]').click();
    await page.locator('[data-settings-next-app-tab="general"]').click();
    await page.waitForFunction(() => document.getElementById('settings-next-app-panel-general')?.hidden === false);
    const forceUpdateButton = page.locator('#settings-force-update-btn');
    const updateAction = page.locator('[data-settings-next-update-action="force"]');
    await updateAction.scrollIntoViewIfNeeded();
    await updateAction.click();
    await page.waitForFunction(() => !document.getElementById('update-banner')?.classList.contains('hidden'), null, { timeout: 30000 });
    await page.locator('#update-banner').scrollIntoViewIfNeeded();
    await sleep(2200);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) fs.copyFileSync(await video.path(), outputPath);
    fs.rmSync(recordingDirectory, { recursive: true, force: true });
  }

  console.log(`Video: ${outputPath}`);
  console.log(`API calls: ${JSON.stringify(apiCalls)}`);
  if (pageErrors.length) console.warn(`Page errors: ${JSON.stringify(pageErrors)}`);
  if (pageErrors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
