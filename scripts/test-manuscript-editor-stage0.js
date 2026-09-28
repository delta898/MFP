const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = require('node:path').resolve(__dirname, '..');
const CONFIG = require('node:path').join(ROOT, 'prototypes/manuscript-editor/vite.config.mjs');

function resolveBrowserLaunchOptions() {
    const configuredPath = String(process.env.BLOGGENIUS_TEST_BROWSER || '').trim();
    const bundledPath = chromium.executablePath();
    const candidates = [
        configuredPath,
        bundledPath,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ].filter(Boolean);
    const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!executablePath) throw new Error('테스트용 Chromium/Chrome을 찾지 못했습니다. BLOGGENIUS_TEST_BROWSER를 지정해 주세요.');
    return { executablePath, headless: true };
}

async function main() {
    const { createServer } = await import('vite');
    const server = await createServer({
        configFile: CONFIG,
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0, strictPort: false }
    });
    let browser;

    try {
        await server.listen();
        const address = server.httpServer.address();
        const baseUrl = `http://127.0.0.1:${address.port}`;
        browser = await chromium.launch(resolveBrowserLaunchOptions());
        const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') pageErrors.push(message.text());
        });

        await page.goto(`${baseUrl}/stage0.html`);
        await page.waitForSelector('.stage0-image-block');
        assert.equal(await page.locator('.stage0-image-block').count(), 2);
        assert.match(await page.locator('#check-import-note').textContent(), /sourceKey 0, 1/);
        assert.match(await page.locator('#check-files-note').textContent(), /0→00_coast\.png.*1→01_morning\.png/);

        const before = await page.locator('.stage0-image-block').evaluateAll((cards) => cards.map((card) => ({
            id: card.dataset.blockId,
            key: card.dataset.sourceKey,
            mapping: card.querySelector('.stage0-image-mapping').textContent
        })));
        await page.locator('[data-source-key="0"]').getByRole('button', { name: '아래로 이동' }).click();
        await page.locator('[data-source-key="0"]').getByRole('button', { name: '아래로 이동' }).click();
        await page.locator('[data-source-key="0"]').getByRole('button', { name: '아래로 이동' }).click();
        const moved = await page.locator('.stage0-image-block').evaluateAll((cards) => cards.map((card) => ({
            id: card.dataset.blockId,
            key: card.dataset.sourceKey,
            mapping: card.querySelector('.stage0-image-mapping').textContent
        })));
        assert.deepEqual(moved.map((image) => image.key), ['1', '0']);
        assert.equal(moved.find((image) => image.key === '0').id, before.find((image) => image.key === '0').id);
        assert.match(moved.find((image) => image.key === '0').mapping, /00_coast\.png/);

        const firstImagePrompt = page.locator('[data-source-key="0"] textarea');
        await firstImagePrompt.fill('편집한 prompt: 제주 바닷길의 아침 햇살');
        await page.getByRole('button', { name: 'Markdown 왕복 검사' }).click();
        await page.waitForFunction(() => document.querySelector('#check-roundtrip-note').textContent.includes('보존'));
        assert.equal(await page.locator('#check-roundtrip').getAttribute('class'), 'check-dot passed');
        assert.equal(await page.locator('[data-source-key="0"] textarea').inputValue(), '편집한 prompt: 제주 바닷길의 아침 햇살');

        const editor = page.locator('#stage0-editor .ProseMirror');
        await editor.focus();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' 한글 입력 확인');
        await page.waitForFunction(() => document.querySelector('#check-korean-note').textContent.includes('한글 입력을 확인'));
        assert.equal(pageErrors.length, 0, `브라우저 오류: ${pageErrors.join(' | ')}`);

        console.log('Stage 0 browser check passed: IMAGE_N import/file mapping, stable block ID through reorder, Markdown image/prompt round-trip, and Korean text input.');
        console.log('Note: keyboard typing verifies Korean text entry; native OS IME composition still requires a hands-on check.');
    } finally {
        await browser?.close();
        await server.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
