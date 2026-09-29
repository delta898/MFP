const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const editorBundle = path.join(projectRoot, 'ui/scripts/vendor/manuscript-editor.js');

async function run() {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.setContent('<main><div id="editor"></div></main>');
        await page.addScriptTag({ path: editorBundle });
        await page.evaluate(() => {
            window.manuscriptEditorTestApi = window.BlogGeniusManuscriptEditor.mount(
                document.getElementById('editor')
            );
            window.manuscriptEditorTestApi.setMarkdown([
                '# Slash command 검사',
                '',
                '첫 문단',
                '',
                '[[IMAGE_0',
                'id: mb-existing',
                'title: 기존 이미지',
                'prompt: 기존 프롬프트',
                ']]',
                '',
                '마지막 문단'
            ].join('\n'));
        });

        const editor = page.locator('#editor .ProseMirror');
        await editor.locator(':scope > p').last().click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('/');
        const menu = page.locator('.manuscript-slash-menu');
        await menu.waitFor();
        assert.equal(await menu.getAttribute('role'), 'listbox');
        assert.equal(await menu.locator('[role="option"]').getAttribute('aria-selected'), 'true');
        assert.match(await menu.textContent(), /이미지 블록/);

        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('.manuscript-slash-menu'));
        await page.keyboard.press('Backspace');
        await page.keyboard.type('/image');
        await page.waitForFunction(() => document.querySelector('#editor .suggestion')?.textContent === '/image');
        await menu.locator('[role="option"]').waitFor();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#editor .manuscript-image-block').count(), 2,
            `slash selection did not insert an image block: ${await page.evaluate(() => window.manuscriptEditorTestApi.getMarkdown())}`);
        let markdown = await page.evaluate(() => window.manuscriptEditorTestApi.getMarkdown());
        assert.match(markdown, /\[\[IMAGE_0/);
        assert.match(markdown, /\[\[IMAGE_1/);
        assert.doesNotMatch(markdown, /^\/image$/m);

        await page.evaluate(() => window.manuscriptEditorTestApi.command('undo'));
        await page.waitForFunction(() => document.querySelectorAll('#editor .manuscript-image-block').length === 1);
        await page.evaluate(() => window.manuscriptEditorTestApi.command('redo'));
        await page.waitForFunction(() => document.querySelectorAll('#editor .manuscript-image-block').length === 2);

        await page.locator('#editor .manuscript-image-block[data-source-key="1"] .manuscript-image-block-delete').click();
        await page.waitForFunction(() => document.querySelectorAll('#editor .manuscript-image-block').length === 1);
        const trailingParagraph = editor.locator(':scope > p').last();
        await trailingParagraph.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('/이미');
        await menu.waitFor();
        await menu.locator('[role="option"]').dispatchEvent('pointerdown');
        await page.waitForFunction(() => document.querySelectorAll('#editor .manuscript-image-block').length === 2);
        markdown = await page.evaluate(() => window.manuscriptEditorTestApi.getMarkdown());
        assert.match(markdown, /\[\[IMAGE_1/);
        assert.doesNotMatch(markdown, /^\/이미$/m);
        assert.deepEqual(pageErrors, []);
    } finally {
        await browser.close();
    }
}

run()
    .then(() => console.log('Manuscript /image slash browser check passed.'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
