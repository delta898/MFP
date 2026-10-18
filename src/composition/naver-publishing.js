'use strict';

const fsDefault = require('node:fs');
const { createNaverPublisherAdapter } = require('../adapters/plugins/naver-publisher');
const { createCorePluginRegistry } = require('./core-plugin-registry');
const { createCorePluginRuntime } = require('./core-plugin-runtime');

function createNaverPublishingSystem(options = {}) {
    const { CONFIG, Constants, Logger } = options;
    if (!CONFIG || !Constants) throw new TypeError('Naver publishing composition requires CONFIG and Constants.');
    const registry = options.corePluginRuntime?.registry || options.corePluginRegistry || createCorePluginRegistry();
    const runtime = options.corePluginRuntime || createCorePluginRuntime({ registry });
    if (!registry.has('naver-publisher')) {
        throw new TypeError('Naver publishing requires the naver-publisher Core Plugin.');
    }
    const BrowserLauncher = options.BrowserLauncher || require('../utilities/browser/browser-launcher');
    const AuthSession = options.AuthSession || require('../adapters/naver/auth-session');
    const fs = options.fs || fsDefault;
    const dependencies = options.pluginDependencies || {};
    const suppliedNaverDependencies = dependencies['naver-publisher'] || {};
    const pluginDependencies = {
        ...dependencies,
        'naver-publisher': {
            getSettings: suppliedNaverDependencies.getSettings || (() => {
                const speed = String(CONFIG.TYPING_SPEED || 'NORMAL').trim().toUpperCase();
                const preset = Constants.TYPING_PRESETS?.[speed] || Constants.TYPING_PRESETS?.NORMAL || { MIN: 1, MAX: 1 };
                return {
                    writeUrl: CONFIG.WRITE_URL || `https://blog.naver.com/${CONFIG.NAVER_ID}/postwrite`,
                    headless: CONFIG.HEADLESS,
                    editorReadyTimeoutMs: 45000,
                    waitUploadMs: CONFIG.WAIT_UPLOAD || Constants.WAIT?.UPLOAD || 1500,
                    typingDelayMs: Math.max(1, Math.round((Number(preset.MIN || 1) + Number(preset.MAX || 1)) / 2)),
                    commandKey: process.platform === 'darwin' ? 'Meta' : 'Control',
                    safeSaveWaitMs: 2000,
                    closeDelaySeconds: Number.parseInt(CONFIG.CLOSE_DELAY_SECONDS, 10) || 10
                };
            }),
            createAuthenticatedNaverSession: suppliedNaverDependencies.createAuthenticatedNaverSession || (async ({ headless, signal }) => {
                const authPath = String(CONFIG.AUTH_FILE_PATH || Constants.AUTH_FILE_PATH || '').trim();
                if (!authPath || !fs.existsSync(authPath)) {
                    const error = new Error('네이버 로그인 세션 파일을 찾을 수 없습니다. 설정에서 다시 로그인해 주세요.');
                    error.code = 'NAVER_SESSION_MISSING';
                    throw error;
                }
                const browser = await BrowserLauncher.launchBrowser({
                    headless: typeof headless === 'boolean' ? headless : CONFIG.HEADLESS,
                    channel: CONFIG.BROWSER_CHANNEL,
                    ...(headless ? { windowSize: { width: 1280, height: 800 } } : {})
                });
                let context;
                let page;
                try {
                    context = await browser.newContext({
                        storageState: authPath,
                        ...(headless ? { viewport: { width: 1280, height: 800 } } : {}),
                        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    });
                    page = await context.newPage();
                } catch (error) {
                    try { await browser.close(); } catch (_) { /* Preserve session setup failure. */ }
                    throw error;
                }
                const dialogHandler = async (dialog) => {
                    if (dialog.type() === 'beforeunload') await dialog.accept();
                    else await dialog.dismiss();
                };
                page.on('dialog', dialogHandler);
                try {
                    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://blog.naver.com' });
                    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://m.blog.naver.com' });
                } catch (error) {
                    Logger?.warn?.(`[Naver Publisher] Clipboard permission setup failed (${String(error?.message || error)})`);
                }
                let closed = false;
                let keepOpen = false;
                const closeBrowser = async () => {
                    if (closed) return;
                    closed = true;
                    if (signal) signal.removeEventListener('abort', onAbort);
                    try { await browser.close(); } catch (_) { /* Browser may already be closed. */ }
                };
                const onAbort = () => { void closeBrowser(); };
                if (signal) {
                    if (signal.aborted) await closeBrowser();
                    else signal.addEventListener('abort', onAbort, { once: true });
                }
                page.once('close', () => { if (keepOpen) void closeBrowser(); });
                return {
                    page,
                    async persistAuthState() {
                        return AuthSession.persistAuthSessionState(context, { authPath });
                    },
                    async close(options = {}) {
                        if (options.keepOpen && !signal?.aborted) {
                            keepOpen = true;
                            page.off('dialog', dialogHandler);
                            return;
                        }
                        await closeBrowser();
                    }
                };
            }),
            logger: suppliedNaverDependencies.logger || Logger
        }
    };
    const { executeOperation } = runtime.ensurePlugins(['naver-publisher'], {
        'naver-publisher': pluginDependencies['naver-publisher']
    });
    const publisher = createNaverPublisherAdapter({ executeOperation });
    return Object.freeze({
        corePluginRegistry: registry,
        corePluginRuntime: runtime,
        pluginHost: runtime.host,
        publisher
    });
}

module.exports = { createNaverPublishingSystem };
