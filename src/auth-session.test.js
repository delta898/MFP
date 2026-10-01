const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CONFIG = require('./config-loader');
const BrowserLauncher = require('./browser-launcher');
const Utils = require('./utils');
const { checkAuthSessionValid } = require('./auth-session');

test('forced concurrent Naver session checks share one browser verification', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-auth-session-'));
    const authPath = path.join(tempDir, 'auth.json');
    fs.writeFileSync(authPath, '{}');

    const original = {
        authPath: CONFIG.AUTH_FILE_PATH,
        naverId: CONFIG.NAVER_ID,
        writeUrl: CONFIG.WRITE_URL,
        launchBrowser: BrowserLauncher.launchBrowser,
        sleep: Utils.sleep
    };
    let launchCount = 0;
    let releaseNavigation;
    const navigationGate = new Promise((resolve) => { releaseNavigation = resolve; });

    CONFIG.AUTH_FILE_PATH = authPath;
    CONFIG.NAVER_ID = 'single-flight-test';
    CONFIG.WRITE_URL = 'https://blog.naver.com/single-flight-test/postwrite';
    BrowserLauncher.launchBrowser = async () => {
        launchCount += 1;
        return {
            newContext: async () => ({
                newPage: async () => ({
                    goto: async () => navigationGate,
                    url: () => CONFIG.WRITE_URL
                }),
                storageState: async ({ path: outputPath }) => fs.writeFileSync(outputPath, '{}'),
                close: async () => {}
            }),
            close: async () => {}
        };
    };
    Utils.sleep = async () => {};

    try {
        const first = checkAuthSessionValid({ forceRefresh: true });
        const second = checkAuthSessionValid({ forceRefresh: true });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(launchCount, 1);
        releaseNavigation();
        assert.deepEqual(await first, { ok: true });
        assert.deepEqual(await second, { ok: true });
    } finally {
        CONFIG.AUTH_FILE_PATH = original.authPath;
        CONFIG.NAVER_ID = original.naverId;
        CONFIG.WRITE_URL = original.writeUrl;
        BrowserLauncher.launchBrowser = original.launchBrowser;
        Utils.sleep = original.sleep;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
