'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createNaverPublishingSystem } = require('./naver-publishing');

test('Naver publishing composition loads the bundled Plugin through the Host and adapter', async () => {
    const calls = [];
    let titleText = '';
    let titleFocused = false;
    let publishSettingsOpen = false;
    const system = createNaverPublishingSystem({
        CONFIG: {},
        Constants: {},
        BrowserLauncher: {},
        AuthSession: {},
        pluginDependencies: {
            'naver-publisher': {
                getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true }),
                async createAuthenticatedNaverSession() {
                    return {
                        page: {
                            locator(selector) {
                                return {
                                    first() { return this; }, nth() { return this; },
                                    async count() { return selector.includes('confirm_btn__WEaBq') || selector.includes('se-documentTitle') || selector.includes('se-main-container') || selector.includes('publish_btn') ? 1 : 0; },
                                    async isVisible() {
                                        if (selector.includes('confirm_btn__WEaBq')) return publishSettingsOpen;
                                        return selector.includes('se-documentTitle') || selector.includes('se-main-container') || selector.includes('publish_btn') || selector.includes('se-save-button');
                                    },
                                    async waitFor(options = {}) {
                                        if (options.state === 'hidden' && selector.includes('confirm_btn__WEaBq') && publishSettingsOpen) throw new Error('settings remain open');
                                    }, async click() {
                                        calls.push(['click', selector]);
                                        if (selector.includes('se-documentTitle')) titleFocused = true;
                                        if (selector.includes('publish_btn')) publishSettingsOpen = true;
                                    },
                                    async innerText() {
                                        if (selector.includes('se-documentTitle')) return titleText;
                                        return selector.includes('publish_btn') ? '발행' : '';
                                    },
                                    async textContent() { return this.innerText(); },
                                    async evaluate() { return selector.includes('se-documentTitle') && titleFocused; },
                                    async scrollIntoViewIfNeeded() {}
                                };
                            },
                            keyboard: {
                                async press(key) {
                                    if (titleFocused && ['Backspace', 'Delete'].includes(key)) titleText = '';
                                    if (key === 'Escape' && publishSettingsOpen) publishSettingsOpen = false;
                                    if (key === 'Enter') titleFocused = false;
                                },
                                async type(text) { if (titleFocused) titleText = text; }
                            },
                            async goto(url) { calls.push(['goto', url]); },
                            url() { return 'https://blog.naver.com/writer/123?logNo=123'; },
                            async waitForURL() { throw new Error('draft does not navigate'); }
                        },
                        async close() {}
                    };
                },
                sleep: async () => {}
            }
        }
    });

    assert.ok(system.corePluginRegistry.has('naver-publisher'));
    assert.deepEqual(system.pluginHost.listPlugins().map(({ id }) => id), ['naver-publisher']);
    assert.deepEqual(system.pluginHost.listOperations().map(({ pluginId, operationId }) => ({ pluginId, operationId })), [
        { pluginId: 'naver-publisher', operationId: 'posts.publish' }
    ]);
    assert.deepEqual(await system.publisher.publish({
        title: 'Title', blocks: [{ type: 'paragraph', text: 'Body' }], assets: [], status: 'draft'
    }), { status: 'draft', warnings: [] });
    assert.ok(calls.some(([kind]) => kind === 'goto'));
});
