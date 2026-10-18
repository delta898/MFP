'use strict';

const VIEWPORT = Object.freeze({ width: 1200, height: 675 });
const PAGE_SETTLE_TIMEOUT_MS = 2500;
const PAGE_LOAD_TIMEOUT_MS = 15000;

function withTimeout(promise, timeoutMs, message) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })
    ]).finally(() => clearTimeout(timer));
}

async function captureSiteScreenshot(url, options = {}) {
    const electron = options.electron || require('electron');
    const BrowserWindow = electron?.BrowserWindow;
    if (typeof BrowserWindow !== 'function') throw new Error('Electron 화면 캡처를 사용할 수 없습니다.');

    const window = new BrowserWindow({
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        show: false,
        paintWhenInitiallyHidden: true,
        webPreferences: {
            contextIsolation: true,
            javascript: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    try {
        window.webContents.setWindowOpenHandler?.(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (event, targetUrl) => {
            try {
                if (new URL(targetUrl).origin !== new URL(url).origin) event.preventDefault();
            } catch { event.preventDefault(); }
        });
        await withTimeout(window.loadURL(url), PAGE_LOAD_TIMEOUT_MS, '미리보기 화면 로딩 시간이 초과되었습니다.');
        await withTimeout(
            window.webContents.executeJavaScript(`Promise.race([
                Promise.allSettled([document.fonts?.ready, ...Array.from(document.images, image => image.decode?.())]),
                new Promise(resolve => setTimeout(resolve, ${PAGE_SETTLE_TIMEOUT_MS}))
            ])`),
            PAGE_SETTLE_TIMEOUT_MS + 250,
            '사이트 화면이 준비되지 않았습니다.'
        );
        const image = await window.webContents.capturePage({ x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height });
        const buffer = image.toJPEG(78);
        if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw new Error('사이트 화면을 이미지로 만들지 못했습니다.');
        return { buffer, viewport: VIEWPORT };
    } finally {
        if (!window.isDestroyed()) window.destroy();
    }
}

module.exports = { PAGE_LOAD_TIMEOUT_MS, PAGE_SETTLE_TIMEOUT_MS, VIEWPORT, captureSiteScreenshot };
