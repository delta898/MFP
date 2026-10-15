'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const metadata = require('./package.json');
const { createPlugin, NaverPublisherError } = require('./index');
const { createPluginHost } = require('../../../../src/platform/plugin-host');

function fakePage({
    titleAcceptAfter = 1,
    withOglink = false,
    oglinkRenderAfterReads = 3,
    withOglinkCenterToolbar = false,
    formatApplyAfterClicks = 0,
    initialHelpPopup = false,
    initialPreviousPostPopup = false,
    availableCategory = '',
    selectedCategory = ''
} = {}) {
    const calls = [];
    let titleText = '';
    let titleFocus = false;
    let titleAttempts = 0;
    let popupOpen = false;
    let publishSettingsOpen = false;
    let oglinkSearched = false;
    let oglinkConfirmed = false;
    let anchorReads = 0;
    let anchorCount = 0;
    let formatClicks = 0;
    let toolbarFormat = '';
    let helpPopupVisible = initialHelpPopup;
    let previousPostPopupVisible = initialPreviousPostPopup;
    let categoryPanelVisible = false;
    let categoryText = selectedCategory;
    const makeLocator = (selector) => ({
        first() { return this; },
        last() { return this; },
        nth() { return this; },
        locator(childSelector) { return makeLocator(`${selector} ${childSelector}`); },
        async count() {
            if (selector.includes('se-popup-oglink') && selector.includes('input')) return popupOpen ? 1 : 0;
            if (selector === 'div.se-popup-oglink') return popupOpen ? 1 : 0;
            if (selector.includes('se-popup-oglink-button')) return popupOpen ? 1 : 0;
            if (selector.includes('se-popup-button-confirm')) return popupOpen && oglinkSearched ? 1 : 0;
            if (selector.includes('confirm_btn__WEaBq')) return 1;
            if (selector.includes('se-help-panel-close-button')) return helpPopupVisible ? 1 : 0;
            if (selector.includes('se-popup-button-cancel') || selector.includes('button:has-text("취소")')) return previousPostPopupVisible ? 1 : 0;
            if (selector.includes('selectbox_button__jb1Dt') || selector.includes('카테고리 목록 버튼')) return availableCategory || selectedCategory ? 1 : 0;
            if (selector.includes('selectbox_list__SD2nT') || selector.includes('selectbox-list') || selector.includes('se-category-list-container') || selector.includes('option_list_layer')) return categoryPanelVisible ? 1 : 0;
            if (selector.includes('radio_label')) return categoryPanelVisible && availableCategory ? 1 : 0;
            if (selector.includes('se-oglink') && withOglinkCenterToolbar && oglinkConfirmed) return 1;
            if (selector.includes('se-image-toolbar') && withOglinkCenterToolbar && oglinkConfirmed) return 1;
            if (selector.includes('data-value="center"') && withOglinkCenterToolbar && oglinkConfirmed) return 1;
            if (selector.includes('data-name="oglink"')) return withOglink ? 1 : 0;
            if (selector.includes('data-name="text-format"') && formatApplyAfterClicks > 0) return 1;
            if (selector.includes('text-format-subtitle') && formatApplyAfterClicks > 0) return 1;
            if (selector.includes('se-main-container a[href]')) {
                anchorReads += 1;
                if (oglinkConfirmed && anchorReads >= oglinkRenderAfterReads) anchorCount = 1;
                return anchorCount;
            }
            return selector.includes('se-documentTitle') || selector.includes('se-main-container')
                || selector.includes('publish_btn') || selector.includes('se-publish-button')
                || selector.includes('se-save-button') ? 1 : 0;
        },
        async isVisible() {
            if (selector.includes('se-popup-oglink') && selector.includes('input')) return popupOpen;
            if (selector === 'div.se-popup-oglink') return popupOpen;
            if (selector.includes('se-popup-oglink-button')) return popupOpen;
            if (selector.includes('se-popup-button-confirm')) return popupOpen && oglinkSearched;
            if (selector.includes('confirm_btn__WEaBq')) return publishSettingsOpen;
            if (selector.includes('se-help-panel-close-button')) return helpPopupVisible;
            if (selector.includes('se-popup-button-cancel') || selector.includes('button:has-text("취소")')) return previousPostPopupVisible;
            if (selector.includes('selectbox_button__jb1Dt') || selector.includes('카테고리 목록 버튼')) return Boolean(availableCategory || selectedCategory);
            if (selector.includes('selectbox_list__SD2nT') || selector.includes('selectbox-list') || selector.includes('se-category-list-container') || selector.includes('option_list_layer')) return categoryPanelVisible;
            if (selector.includes('radio_label')) return categoryPanelVisible && Boolean(availableCategory);
            if (selector.includes('se-oglink') && withOglinkCenterToolbar && oglinkConfirmed) return true;
            if (selector.includes('se-image-toolbar') && withOglinkCenterToolbar && oglinkConfirmed) return true;
            if (selector.includes('data-value="center"') && withOglinkCenterToolbar && oglinkConfirmed) return true;
            if (selector.includes('data-name="oglink"')) return withOglink;
            if ((selector.includes('data-name="text-format"') || selector.includes('text-format-subtitle')) && formatApplyAfterClicks > 0) return true;
            return selector.includes('se-documentTitle') || selector.includes('se-main-container')
                || selector.includes('publish_btn') || selector.includes('se-publish-button') || selector.includes('se-save-button');
        },
        async waitFor(options = {}) {
            if (options.state === 'hidden' && popupOpen) throw new Error('popup remains visible');
            if (options.state === 'hidden' && selector.includes('confirm_btn__WEaBq') && publishSettingsOpen) throw new Error('publish settings remain visible');
        },
        async click() {
            calls.push(['click', selector]);
            if (selector.includes('se-documentTitle')) titleFocus = true;
            if (selector.includes('text-format-subtitle')) {
                formatClicks += 1;
                if (formatClicks >= formatApplyAfterClicks) toolbarFormat = '소제목';
            }
            if (selector.includes('data-name="oglink"')) popupOpen = true;
            if (selector.includes('publish_btn')) publishSettingsOpen = true;
            if (selector.includes('se-help-panel-close-button')) helpPopupVisible = false;
            if (selector.includes('se-popup-button-cancel') || selector.includes('button:has-text("취소")')) previousPostPopupVisible = false;
            if (selector.includes('selectbox_button__jb1Dt') || selector.includes('카테고리 목록 버튼')) categoryPanelVisible = true;
            if (selector.includes('radio_label')) {
                categoryText = availableCategory;
                categoryPanelVisible = false;
            }
            if (selector.includes('se-popup-oglink-button')) oglinkSearched = true;
            if (selector.includes('se-popup-button-confirm')) {
                oglinkConfirmed = true;
                popupOpen = false;
            }
        },
        async innerText() {
            if (selector.includes('se-documentTitle')) return titleText;
            if (selector.includes('data-name="text-format"')) return toolbarFormat;
            if (selector.includes('selectbox_button__jb1Dt') || selector.includes('카테고리 목록 버튼')) return categoryText;
            if (selector.includes('radio_label')) return availableCategory;
            return selector.includes('publish_btn') || selector.includes('se-publish-button') ? '발행' : '';
        },
        async textContent() { return this.innerText(); },
        async scrollIntoViewIfNeeded() {},
        async hover() {},
        async getAttribute() { return null; },
        async fill(value) { calls.push(['fill', selector, value]); },
        filter() { return this; }
    });
    return {
        calls,
        locator: makeLocator,
        keyboard: {
            async press(key) {
                calls.push(['press', key]);
                if (titleFocus && ['Backspace', 'Delete'].includes(key)) titleText = '';
                if (key === 'Escape' && publishSettingsOpen) publishSettingsOpen = false;
                if (key === 'Enter') titleFocus = false;
            },
            async type(text) {
                calls.push(['type', text]);
                if (titleFocus) {
                    titleAttempts += 1;
                    if (titleAttempts >= titleAcceptAfter) titleText = text;
                }
            }
        },
        async goto(url) { calls.push(['goto', url]); },
        async evaluate() { calls.push(['evaluate', 'collapse-selection']); return true; },
        url() { return 'https://blog.naver.com/writer/123?logNo=123'; },
        async waitForURL() { throw new Error('simulated delayed URL navigation'); }
    };
}

test('manifest declares a single posts.publish operation with no credential input', () => {
    const operation = metadata.bloggeniusPlugin.operations['posts.publish'];
    assert.ok(operation);
    assert.deepEqual(operation.inputSchema.required, ['title', 'blocks', 'assets', 'status']);
    assert.equal(JSON.stringify(operation.inputSchema).includes('password'), false);
    assert.deepEqual(Object.keys(metadata.bloggeniusPlugin.operations), ['posts.publish']);
});

test('Host validates and executes a Naver draft operation and forwards progress', async () => {
    const page = fakePage();
    const events = [];
    let persisted = 0;
    let closed = 0;
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() {
            return {
                page,
                async persistAuthState() { persisted += 1; },
                async close() { closed += 1; }
            };
        },
        sleep: async () => {}
    });
    const host = createPluginHost({ plugins: [{
        manifest: metadata.bloggeniusPlugin,
        version: metadata.version,
        operations: plugin.operations
    }] });

    const result = await host.execute('naver-publisher', 'posts.publish', {
        title: 'Jeju walk',
        blocks: [{ type: 'paragraph', text: 'A morning walk.' }],
        assets: [],
        status: 'draft'
    }, { reportProgress: (event) => events.push(event) });

    assert.deepEqual(result, { status: 'draft', warnings: [] });
    assert.ok(events.some((event) => event.pluginId === 'naver-publisher' && event.stage === 'editor'));
    assert.ok(events.some((event) => event.pluginId === 'naver-publisher' && event.stage === 'body'));
    assert.equal(persisted, 1);
    assert.equal(closed, 1);
    assert.ok(page.calls.some(([kind, value]) => kind === 'goto' && value.includes('/postwrite')));
    assert.equal(page.calls.some(([kind, selector]) => kind === 'click' && selector.includes('confirm_btn__WEaBq')), false);
    assert.ok(page.calls.some(([kind, selector]) => kind === 'click' && selector.includes('se-save-button')));
});

test('Naver Publisher dismisses the startup help panel and previous-post prompt before typing', async () => {
    const page = fakePage({ initialHelpPopup: true, initialPreviousPostPopup: true });
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page, async close() {} }; },
        sleep: async () => {}
    });

    await plugin.operations['posts.publish'].execute({
        title: 'Popup handling', blocks: [], assets: [], status: 'draft'
    });

    assert.ok(page.calls.some(([kind, selector]) => kind === 'click' && selector.includes('se-help-panel-close-button')));
    assert.ok(page.calls.some(([kind, selector]) => kind === 'click' && selector.includes('se-popup-button-cancel')));
});

test('Naver Publisher selects and verifies the requested category before saving a draft', async () => {
    const page = fakePage({ availableCategory: 'Travel' });
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page, async close() {} }; },
        sleep: async () => {}
    });

    const result = await plugin.operations['posts.publish'].execute({
        title: 'Category', blocks: [], assets: [], category: 'Travel', status: 'draft'
    });

    assert.equal(result.status, 'draft');
    const categoryClick = page.calls.findIndex(([kind, selector]) => kind === 'click' && selector.includes('radio_label'));
    const saveClick = page.calls.findLastIndex(([kind, selector]) => kind === 'click' && selector.includes('se-save-button'));
    assert.ok(categoryClick >= 0 && saveClick > categoryClick);
    assert.equal(page.calls.some(([kind, selector]) => kind === 'click' && selector.includes('confirm_btn__WEaBq')), false);
});

test('Naver Publisher retries title input until the editor reflects the requested title', async () => {
    const page = fakePage({ titleAcceptAfter: 2 });
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page, async close() {} }; },
        sleep: async () => {}
    });

    await plugin.operations['posts.publish'].execute({
        title: 'Retry title', blocks: [], assets: [], status: 'draft'
    });

    assert.equal(page.calls.filter(([kind, value]) => kind === 'type' && value === 'Retry title').length, 2);
});

test('Naver Publisher stops before body and publication if title verification keeps failing', async () => {
    const page = fakePage({ titleAcceptAfter: 99 });
    let closed = 0;
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page, async close() { closed += 1; } }; },
        sleep: async () => {}
    });

    await assert.rejects(plugin.operations['posts.publish'].execute({
        title: 'Unverified title', blocks: [{ type: 'paragraph', text: 'Body must not be typed' }], assets: [], status: 'draft'
    }), (error) => error.code === 'NAVER_TITLE_INPUT_FAILED');

    assert.equal(page.calls.some(([kind, value]) => kind === 'type' && value === 'Body must not be typed'), false);
    assert.equal(closed, 1);
});

test('Naver Publisher verifies delayed Oglink insertion and avoids adding a duplicate plain URL', async () => {
    const page = fakePage({ withOglink: true, oglinkRenderAfterReads: 5 });
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page, async close() {} }; },
        sleep: async () => {}
    });

    await plugin.operations['posts.publish'].execute({
        title: 'Related links',
        blocks: [{ type: 'paragraph', text: 'https://m.blog.naver.com/writer/123' }],
        assets: [], status: 'draft'
    });

    assert.equal(page.calls.some(([kind, value]) => kind === 'type' && value === 'https://m.blog.naver.com/writer/123'), false);
    assert.equal(page.calls.some(([kind, selector]) => kind === 'click' && selector.includes('se-popup-button-confirm')), true);
});

test('Naver Publisher centers the inserted Oglink card when the component toolbar is available', async () => {
    const page = fakePage({ withOglink: true, oglinkRenderAfterReads: 2, withOglinkCenterToolbar: true });
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page, async close() {} }; },
        sleep: async () => {}
    });

    const result = await plugin.operations['posts.publish'].execute({
        title: 'Related links',
        blocks: [{ type: 'paragraph', text: 'https://m.blog.naver.com/writer/123' }],
        assets: [], status: 'draft'
    });

    assert.equal(result.warnings.some((warning) => warning.includes('가운데 정렬')), false);
    assert.ok(page.calls.some(([kind, selector]) => kind === 'click' && selector.includes('data-value="center"')));
});

test('Naver Publisher returns a warning when heading formatting cannot be verified or recovered', async () => {
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page: fakePage(), async close() {} }; },
        sleep: async () => {}
    });

    const result = await plugin.operations['posts.publish'].execute({
        title: 'Heading', blocks: [{ type: 'heading', level: 2, text: 'A subtitle' }], assets: [], status: 'draft'
    });

    assert.ok(result.warnings.some((warning) => warning.includes('소제목 서식을 적용하지 못했습니다')));
});

test('Naver Publisher retries a heading format until the toolbar confirms the subtitle style', async () => {
    const page = fakePage({ formatApplyAfterClicks: 2 });
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page, async close() {} }; },
        sleep: async () => {}
    });

    const result = await plugin.operations['posts.publish'].execute({
        title: 'Heading', blocks: [{ type: 'heading', level: 2, text: 'A subtitle' }], assets: [], status: 'draft'
    });

    assert.deepEqual(result.warnings, []);
    assert.equal(page.calls.filter(([kind, selector]) => kind === 'click' && selector.includes('text-format-subtitle')).length, 2);
    const appliedAt = page.calls.findIndex(([kind, selector]) => kind === 'click' && selector.includes('text-format-subtitle'));
    const collapsedAt = page.calls.findIndex(([kind, key], index) => index > appliedAt && kind === 'press' && key === 'ArrowRight');
    const selectionNormalizedAt = page.calls.findIndex(([kind, key], index) => index > collapsedAt && kind === 'evaluate' && key === 'collapse-selection');
    const nextEnterAt = page.calls.findIndex(([kind, key], index) => index > selectionNormalizedAt && kind === 'press' && key === 'Enter');
    assert.ok(appliedAt >= 0 && collapsedAt > appliedAt && selectionNormalizedAt > collapsedAt && nextEnterAt > selectionNormalizedAt);
});

test('Naver Publisher normalizes a subtitle selection before entering the following body paragraph', async () => {
    const page = fakePage({ formatApplyAfterClicks: 1 });
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true, safeSaveWaitMs: 0 }),
        async createAuthenticatedNaverSession() { return { page, async close() {} }; },
        sleep: async () => {}
    });

    await plugin.operations['posts.publish'].execute({
        title: 'Heading',
        blocks: [
            { type: 'heading', level: 2, text: '소제목' },
            { type: 'paragraph', text: '다음 문단' }
        ],
        assets: [], status: 'draft'
    });

    const headingFormat = page.calls.findIndex(([kind, selector]) => kind === 'click' && selector.includes('text-format-subtitle'));
    const arrowRight = page.calls.findIndex(([kind, key], index) => index > headingFormat && kind === 'press' && key === 'ArrowRight');
    const collapseSelection = page.calls.findIndex(([kind, key], index) => index > arrowRight && kind === 'evaluate' && key === 'collapse-selection');
    const paragraphBoundary = page.calls.findIndex(([kind, key], index) => index > collapseSelection && kind === 'press' && key === 'Enter');
    const paragraphText = page.calls.findIndex(([kind, value], index) => index > paragraphBoundary && kind === 'type' && value === '다음 문단');
    assert.ok(headingFormat >= 0 && arrowRight > headingFormat && collapseSelection > arrowRight);
    assert.ok(paragraphBoundary > collapseSelection && paragraphText > paragraphBoundary);
});

test('Naver Publisher closes the authenticated session when the caller cancels', async () => {
    const controller = new AbortController();
    controller.abort();
    let opened = 0;
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite' }),
        async createAuthenticatedNaverSession() { opened += 1; throw new Error('must not open'); }
    });
    await assert.rejects(plugin.operations['posts.publish'].execute({ title: 'Title' }, { signal: controller.signal }), (error) => (
        error instanceof NaverPublisherError && error.code === 'ABORTED'
    ));
    assert.equal(opened, 0);
});

test('Naver Publisher rejects missing referenced assets before completing publication', async () => {
    const page = fakePage();
    let closed = 0;
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true }),
        async createAuthenticatedNaverSession() { return { page, async close() { closed += 1; } }; },
        sleep: async () => {}
    });
    await assert.rejects(plugin.operations['posts.publish'].execute({
        title: 'Title', blocks: [{ type: 'image', assetKey: 'missing' }], assets: [], status: 'draft'
    }), (error) => error.code === 'NAVER_IMAGE_ASSET_NOT_FOUND');
    assert.equal(closed, 1);
});

test('Naver session persistence failure does not erase a completed draft result', async () => {
    const plugin = createPlugin({
        getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true }),
        async createAuthenticatedNaverSession() {
            return {
                page: fakePage(),
                async persistAuthState() { throw new Error('disk unavailable'); },
                async close() {}
            };
        },
        sleep: async () => {},
        logger: { warn() {} }
    });

    const result = await plugin.operations['posts.publish'].execute({
        title: 'Title', blocks: [{ type: 'paragraph', text: 'Body' }], assets: [], status: 'draft'
    });

    assert.equal(result.status, 'draft');
    assert.match(result.warnings[0], /세션 갱신/);
});
