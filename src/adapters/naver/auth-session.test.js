const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BrowserLauncher = require('../../utilities/browser/browser-launcher');
const Utils = require('../../utils');
const { checkAuthSessionValid } = require('./auth-session');

test('forced concurrent Naver session checks share one browser verification', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-auth-session-'));
    const authPath = path.join(tempDir, 'auth.json');
    fs.writeFileSync(authPath, '{}');

    const authConfig = {
        authPath,
        naverId: 'single-flight-test',
        writeUrl: 'https://blog.naver.com/single-flight-test/postwrite',
        browserChannel: 'chrome'
    };
    const original = {
        launchBrowser: BrowserLauncher.launchBrowser,
        sleep: Utils.sleep
    };
    let launchCount = 0;
    let releaseNavigation;
    const navigationGate = new Promise((resolve) => { releaseNavigation = resolve; });

    BrowserLauncher.launchBrowser = async () => {
        launchCount += 1;
        return {
            newContext: async () => ({
                newPage: async () => ({
                    goto: async () => navigationGate,
                    url: () => authConfig.writeUrl
                }),
                storageState: async ({ path: outputPath }) => fs.writeFileSync(outputPath, '{}'),
                close: async () => {}
            }),
            close: async () => {}
        };
    };
    Utils.sleep = async () => {};

    try {
        const first = checkAuthSessionValid({ ...authConfig, forceRefresh: true });
        const second = checkAuthSessionValid({ ...authConfig, forceRefresh: true });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(launchCount, 1);
        releaseNavigation();
        assert.deepEqual(await first, { ok: true });
        assert.deepEqual(await second, { ok: true });
    } finally {
        BrowserLauncher.launchBrowser = original.launchBrowser;
        Utils.sleep = original.sleep;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
