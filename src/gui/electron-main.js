const { app, BrowserWindow, Menu, dialog, crashReporter } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStartupBootstrap } = require('./startup-bootstrap');
const { buildSafeModeArgs, isSafeMode, isStartupProbe } = require('./startup-policy');

const startup = createStartupBootstrap();
const safeMode = isSafeMode(process.argv.slice(1));
const startupProbe = isStartupProbe(process.argv.slice(1));
const externallySupervised = Boolean(String(process.env.BLOGGENIUS_LAUNCHER_PATH || '').trim());
let startupReady = false;
let recoveryStarted = false;

process.env.BLOG_GENIUS_SAFE_MODE = safeMode ? 'true' : 'false';
process.env.BLOG_GENIUS_LOG_DIR = startup.logDir;

startup.write('JS_ENTRY', {
    safeMode,
    startupProbe,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
});

try {
    app.setAppLogsPath(startup.logDir);
    app.setPath('crashDumps', startup.crashDir);
} catch (error) {
    startup.write('DIAGNOSTIC_PATH_FAILED', { message: error.message });
}

if (safeMode) {
    app.disableHardwareAcceleration();
    startup.write('SAFE_MODE_ENABLED');
} else {
    try {
        crashReporter.start({
            uploadToServer: false,
            productName: 'BlogGenius',
            globalExtra: {
                startup_mode: 'normal'
            }
        });
        startup.write('CRASH_REPORTER_READY');
    } catch (error) {
        startup.write('CRASH_REPORTER_FAILED', { message: error.message });
    }
}

function formatError(error) {
    return {
        message: String(error?.message || error || 'unknown error'),
        stack: String(error?.stack || '')
    };
}

function relaunchInSafeMode(reason, details = {}) {
    if (safeMode || startupReady || recoveryStarted) return false;
    if (externallySupervised) return false;
    recoveryStarted = true;
    const args = buildSafeModeArgs(process.argv.slice(1));
    startup.write('SAFE_MODE_RELAUNCH_REQUESTED', { reason, ...details });
    const launcherPath = String(process.env.BLOGGENIUS_LAUNCHER_PATH || '').trim();
    app.relaunch({
        args,
        ...(launcherPath ? { executablePath: launcherPath } : {})
    });
    app.exit(1);
    return true;
}

function handleFatalError(phase, error) {
    const details = formatError(error);
    startup.write(phase, details);
    if (!startupReady && !externallySupervised && relaunchInSafeMode(phase, { message: details.message })) return;
    if (externallySupervised && !startupReady) {
        app.exit(1);
        return;
    }
    try {
        dialog.showErrorBox(
            'BlogGenius 시작 오류',
            `프로그램을 시작하지 못했습니다.\n\n진단 로그: ${startup.rootDir}\n\n${details.message}`
        );
    } catch (_ignore) { }
    app.exit(1);
}

process.on('uncaughtException', (error) => handleFatalError('UNCAUGHT_EXCEPTION', error));
process.on('unhandledRejection', (error) => handleFatalError('UNHANDLED_REJECTION', error));

// 🚀 [Environment Setup] GUI 전용 실행 환경 설정 (Require 이전에 수행)
process.env.BLOG_GENIUS_GUI_MODE = 'true';
process.env.BLOG_GENIUS_USER_DATA = app.getPath('userData');

let CONFIG;
let startUiServer;
let closeAgentMemory;
let startRemoteMcpService;
let stopRemoteMcpService;
let Logger;

if (safeMode) {
    CONFIG = { LISTEN_HOST: '127.0.0.1', LISTEN_PORT: 0, ROOT_DIR: startup.rootDir };
    const { startSafeModeServer } = require('./safe-mode-server');
    startUiServer = () => startSafeModeServer({ diagnosticRoot: startup.rootDir });
    closeAgentMemory = () => {};
    startRemoteMcpService = async () => ({ enabled: false, running: false });
    stopRemoteMcpService = async () => false;
    Logger = {
        debug: (message) => startup.write('SAFE_MODE_DEBUG', { message }),
        info: (message) => startup.write('SAFE_MODE_INFO', { message }),
        warn: (message) => startup.write('SAFE_MODE_WARN', { message }),
        error: (message, error) => startup.write('SAFE_MODE_ERROR', {
            ...formatError(error),
            message: String(message || error?.message || error || 'unknown error')
        })
    };
    startup.write('MINIMAL_SAFE_MODE_MODULES_LOADED');
} else {
    // Portable 설정 및 전체 애플리케이션 그래프는 정상 모드에서만 로드합니다.
    CONFIG = require('../config-loader');
    startup.write('CONFIG_LOADED', { rootDir: CONFIG.ROOT_DIR || '' });
    ({ closeAgentMemory, startUiServer } = require('../ui-server'));
    ({ startRemoteMcpService, stopRemoteMcpService } = require('../mcp/remote-service'));
    Logger = require('../logger');
    const { logRuntimeEnvironmentStatus } = require('../environment/runtime-profile');
    logRuntimeEnvironmentStatus(Logger, CONFIG.RUNTIME_ENVIRONMENT_PROFILE);
    startup.write('APPLICATION_MODULES_LOADED');
}

let win = null;
let uiServer = null;

function getUiRootUrl() {
    if (!uiServer) return null;
    return `http://${uiServer.openHost}:${uiServer.port}`;
}

function reloadWindowToRoot(ignoreCache = false) {
    if (!win || win.isDestroyed()) return;
    const rootUrl = getUiRootUrl();
    if (!rootUrl) return;
    if (ignoreCache) {
        win.webContents.reloadIgnoringCache();
        void win.loadURL(rootUrl).catch((error) => {
            startup.write('RENDERER_RELOAD_FAILED', formatError(error));
        });
        return;
    }
    void win.loadURL(rootUrl).catch((error) => {
        startup.write('RENDERER_RELOAD_FAILED', formatError(error));
    });
}

async function recoverWindowFromBrokenRoute() {
    if (!win || win.isDestroyed()) return;
    const rootUrl = getUiRootUrl();
    if (!rootUrl) return;
    const currentUrl = win.webContents.getURL();
    if (!currentUrl) return;
    try {
        const current = new URL(currentUrl);
        const root = new URL(rootUrl);
        const sameOrigin = current.origin === root.origin;
        const isRootPath = current.pathname === '/' || current.pathname === '';
        const pageText = await win.webContents.executeJavaScript(`
            (() => ({
                text: (document.body?.innerText || '').trim(),
                title: document.title || ''
            }))();
        `, true);
        const looksLikePlainNotFound = pageText
            && String(pageText.text || '') === 'Not Found'
            && !String(pageText.title || '');
        if ((sameOrigin && !isRootPath) || looksLikePlainNotFound) {
            reloadWindowToRoot(false);
        }
    } catch (_) {
        // Ignore recovery probe failures and keep current page.
    }
}

function openBlogQuickCreate() {
    if (!win || win.isDestroyed()) return;
    void win.webContents.executeJavaScript(`
        if (typeof navigateToBlogQuickCreate === 'function') {
            void navigateToBlogQuickCreate();
        }
    `).catch((error) => {
        Logger.warn(`Electron 메뉴에서 새 글 작성 화면을 열지 못했습니다: ${error.message}`);
    });
}

// Electron의 기본 메뉴를 제거하거나 커스터마이징합니다.
function createMenu() {
    const template = [
        {
            label: '파일',
            submenu: [
                { label: '새 글 작성', click: openBlogQuickCreate },
                { type: 'separator' },
                { label: '종료', role: 'quit' }
            ]
        },
        {
            label: '편집',
            submenu: [
                { label: '실행 취소', role: 'undo' },
                { label: '다시 실행', role: 'redo' },
                { type: 'separator' },
                { label: '잘라내기', role: 'cut' },
                { label: '복사', role: 'copy' },
                { label: '붙여넣기', role: 'paste' },
                { label: '삭제', role: 'delete' },
                { type: 'separator' },
                { label: '모두 선택', role: 'selectAll' }
            ]
        },
        {
            label: '보기',
            submenu: [
                {
                    label: '새로고침',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => reloadWindowToRoot(false)
                },
                {
                    label: '강제 새로고침',
                    accelerator: 'Shift+CmdOrCtrl+R',
                    click: () => reloadWindowToRoot(true)
                },
                { label: '개발자 도구', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: '최대화', role: 'resetZoom' },
                { label: '확대', role: 'zoomIn' },
                { label: '축소', role: 'zoomOut' },
                { type: 'separator' },
                { label: '전체화면', role: 'togglefullscreen' }
            ]
        }
    ];

    // macOS 전용 '앱 메뉴' 및 설정(Cmd + ,) 단축키 추가
    if (process.platform === 'darwin') {
        template.unshift({
            label: 'BlogGenius',
            submenu: [
                { role: 'about', label: 'BlogGenius 정보' },
                { type: 'separator' },
                {
                    label: '설정...',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        if (win) {
                            win.webContents.executeJavaScript("const btn = document.querySelector('.nav-btn[data-view=\"settings\"]'); if(btn) btn.click();");
                        }
                    }
                },
                {
                    label: '업데이트 확인...',
                    click: () => {
                        if (win) {
                            win.webContents.executeJavaScript(`
                                const navBtn = document.querySelector('.nav-btn[data-view="settings"]');
                                if(navBtn) navBtn.click();
                                setTimeout(() => {
                                    const updateBtn = document.getElementById('settings-check-update-btn');
                                    if(updateBtn) updateBtn.click();
                                }, 100);
                            `);
                        }
                    }
                },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide', label: 'BlogGenius 숨기기' },
                { role: 'hideOthers', label: '기타 숨기기' },
                { role: 'unhide', label: '모두 보기' },
                { type: 'separator' },
                { role: 'quit', label: 'BlogGenius 종료' }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

async function createWindow() {
    // 1. UI 서버 시작 (백그라운드 - 최초 1회만)
    if (!uiServer) {
        try {
            const host = CONFIG.LISTEN_HOST || '127.0.0.1';
            const port = CONFIG.LISTEN_PORT || 4577;
            uiServer = await startUiServer({ host, port, safeMode });
            startup.write('UI_SERVER_READY', { host: uiServer.openHost, port: uiServer.port, safeMode });
            if (!safeMode) {
                try {
                    await startRemoteMcpService();
                } catch (mcpError) {
                    Logger.error(`GUI: Optional MCP service failed to start: ${mcpError.message}`, mcpError);
                    startup.write('OPTIONAL_MCP_FAILED', formatError(mcpError));
                }
            } else {
                Logger.warn('GUI: 안전 모드에서 원격 MCP 서비스를 시작하지 않습니다.');
            }
            Logger.info(`GUI: UI Server started at http://${uiServer.openHost}:${uiServer.port}`);
        } catch (err) {
            Logger.error(`GUI: Failed to start UI Server: ${err.message}`);

            let displayMsg = err.message;
            if (err.code === 'EADDRINUSE') {
                const port = CONFIG.LISTEN_PORT || 4577;
                displayMsg = `포트 ${port}번이 이미 사용 중입니다.\n\n다른 BlogGenius 프로그램이 실행 중이거나, 다른 앱이 이 포트를 사용하고 있습니다.`;
            }

            err.message = displayMsg;
            throw err;
        }
    }

    const iconPath = path.join(__dirname, '../../assets/icons/icon.png');

    // 2. 브라우저 창 생성
    win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        backgroundColor: '#f6f4ef',
        title: '',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: true // 필요 시 true
        }
    });
    startup.write('WINDOW_CREATED', { safeMode });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        startup.write('RENDERER_LOAD_FAILED', {
            errorCode,
            errorDescription,
            validatedURL,
            isMainFrame
        });
        if (isMainFrame && !relaunchInSafeMode('renderer-load-failed', { errorCode, errorDescription })) {
            handleFatalError('RENDERER_LOAD_FATAL', new Error(`${errorDescription} (${errorCode})`));
        }
    });

    win.webContents.on('render-process-gone', (_event, details) => {
        startup.write('RENDER_PROCESS_GONE', details);
        if (details.reason !== 'clean-exit') {
            const recovered = relaunchInSafeMode('renderer-process-gone', {
                reason: details.reason,
                exitCode: details.exitCode
            });
            if (!recovered) {
                handleFatalError(
                    'RENDER_PROCESS_FATAL',
                    new Error(`renderer ${details.reason} (${details.exitCode})`)
                );
            }
        }
    });

    win.on('unresponsive', () => {
        startup.write('WINDOW_UNRESPONSIVE');
    });

    win.webContents.on('did-finish-load', () => {
        if (!startupReady) {
            startupReady = true;
            startup.markReady({ safeMode, url: win.webContents.getURL() });
            startup.write('RENDERER_READY', { safeMode });
            if (startupProbe) {
                startup.write('STARTUP_PROBE_COMPLETE', { safeMode });
                setImmediate(() => app.quit());
            }
        }
        void recoverWindowFromBrokenRoute();
    });

    // 3. 내장 서버 주소 로드
    await win.loadURL(getUiRootUrl());

    win.on('closed', () => {
        win = null;
    });

    // 페이지 제목이 바뀌어도 앱 제목 고정
    win.on('page-title-updated', (e) => {
        e.preventDefault();
    });

    win.webContents.on('before-input-event', (event, input) => {
        const isReloadKey = input.type === 'keyDown'
            && input.key.toLowerCase() === 'r'
            && (input.meta || input.control);
        if (!isReloadKey) return;
        event.preventDefault();
        reloadWindowToRoot(Boolean(input.shift));
    });

}

// 앱 준비 완료 시 실행
app.whenReady().then(async () => {
    startup.write('APP_READY', { safeMode });
    createMenu();
    await createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createWindow().catch((error) => handleFatalError('ACTIVATE_WINDOW_FAILED', error));
        }
    });
}).catch((error) => handleFatalError('APP_START_FAILED', error));

app.on('child-process-gone', (_event, details) => {
    startup.write('CHILD_PROCESS_GONE', details);
    if (!startupReady && details.type === 'GPU' && details.reason !== 'clean-exit') {
        const recovered = relaunchInSafeMode('gpu-process-gone', {
            reason: details.reason,
            exitCode: details.exitCode
        });
        if (!recovered) {
            handleFatalError(
                'GPU_PROCESS_FATAL',
                new Error(`GPU ${details.reason} (${details.exitCode})`)
            );
        }
    }
});

// 모든 창이 닫히면 종료
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 종료 직전 서버 자원 정리
app.on('before-quit', () => {
    startup.write('APP_BEFORE_QUIT', { safeMode, startupReady });
    Logger?.info?.('GUI: Shutting down...');
    if (uiServer && uiServer.server) {
        uiServer.server.close();
    }
    closeAgentMemory?.();
    if (typeof stopRemoteMcpService === 'function') {
        stopRemoteMcpService().catch((error) => {
            Logger?.error?.(`GUI: Failed to stop MCP remote service: ${error.message}`);
        });
    }
});
