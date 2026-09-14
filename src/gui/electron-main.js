const { app, BrowserWindow, Menu, dialog, crashReporter } = require('electron');
const path = require('path');
const fs = require('fs');
const { applyRuntimeNetworkPolicy } = require('../network/runtime-network-policy');
const { createStartupBootstrap } = require('./startup-bootstrap');
const { buildSafeModeArgs, isSafeMode, isStartupProbe } = require('./startup-policy');

const startup = createStartupBootstrap();
const runtimeNetworkPolicy = applyRuntimeNetworkPolicy();
const safeMode = isSafeMode(process.argv.slice(1));
const startupProbe = isStartupProbe(process.argv.slice(1));
const externallySupervised = Boolean(String(process.env.BLOGGENIUS_LAUNCHER_PATH || '').trim());
let startupReady = false;
let recoveryStarted = false;
let startupWatchdog = null;

const STARTUP_TIMEOUT_MS = 35000;
const RENDERER_READY_TIMEOUT_MS = 15000;
const RENDERER_READY_POLL_MS = 200;
const UNRESPONSIVE_RECOVERY_MS = 5000;
const POST_READY_SERVICE_TIMEOUT_MS = 15000;

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
startup.write('NETWORK_POLICY_READY', runtimeNetworkPolicy);

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
    try {
        app.relaunch({
            args,
            ...(launcherPath ? { executablePath: launcherPath } : {})
        });
        app.exit(1);
        return true;
    } catch (error) {
        startup.write('SAFE_MODE_RELAUNCH_FAILED', {
            reason,
            ...formatError(error)
        });
        recoveryStarted = false;
        return false;
    }
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

startupWatchdog = setTimeout(() => {
    if (!startupReady) handleFatalError('STARTUP_TIMEOUT', new Error(`startup exceeded ${STARTUP_TIMEOUT_MS}ms`));
}, STARTUP_TIMEOUT_MS);
startupWatchdog.unref?.();

// 🚀 [Environment Setup] GUI 전용 실행 환경 설정 (Require 이전에 수행)
process.env.BLOG_GENIUS_GUI_MODE = 'true';
try {
    process.env.BLOG_GENIUS_USER_DATA = app.getPath('userData');
    startup.write('USER_DATA_READY', { path: process.env.BLOG_GENIUS_USER_DATA });
} catch (error) {
    process.env.BLOG_GENIUS_USER_DATA = startup.rootDir;
    startup.write('USER_DATA_FALLBACK', { path: startup.rootDir, ...formatError(error) });
}

const primaryInstance = app.requestSingleInstanceLock();
startup.write(primaryInstance ? 'PRIMARY_INSTANCE_LOCKED' : 'SECOND_INSTANCE_EXIT');
if (!primaryInstance) {
    startupReady = true;
    if (startupWatchdog) clearTimeout(startupWatchdog);
    startupWatchdog = null;
    startup.markReady({ safeMode, secondaryInstance: true });
    setImmediate(() => app.quit());
}

let CONFIG;
let startUiServer;
let closeAgentMemory;
let startRemoteMcpService;
let stopRemoteMcpService;
let Logger;

function loadStartupModule(name, loader) {
    const startedAt = Date.now();
    startup.write('MODULE_LOADING', { name });
    try {
        const loaded = loader();
        startup.write('MODULE_LOADED', { name, durationMs: Date.now() - startedAt });
        return loaded;
    } catch (error) {
        startup.write('MODULE_LOAD_FAILED', { name, durationMs: Date.now() - startedAt, ...formatError(error) });
        throw error;
    }
}

if (!primaryInstance) {
    CONFIG = { LISTEN_HOST: '127.0.0.1', LISTEN_PORT: 0, ROOT_DIR: startup.rootDir };
    closeAgentMemory = () => {};
    startRemoteMcpService = async () => ({ enabled: false, running: false });
    stopRemoteMcpService = async () => false;
    Logger = { debug() {}, info() {}, warn() {}, error() {} };
} else if (safeMode) {
    CONFIG = { LISTEN_HOST: '127.0.0.1', LISTEN_PORT: 0, ROOT_DIR: startup.rootDir };
    const { startSafeModeServer } = loadStartupModule('safe-mode-server', () => require('./safe-mode-server'));
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
    const moduleLoadStartedAt = Date.now();
    startup.write('APPLICATION_MODULES_LOADING');
    CONFIG = loadStartupModule('config-loader', () => require('../config-loader'));
    startup.write('CONFIG_LOADED', { rootDir: CONFIG.ROOT_DIR || '' });
    ({ closeAgentMemory, startUiServer } = loadStartupModule('ui-server', () => require('../ui-server')));
    ({ startRemoteMcpService, stopRemoteMcpService } = loadStartupModule('remote-mcp-service', () => require('../mcp/remote-service')));
    Logger = loadStartupModule('logger', () => require('../logger'));
    const { logRuntimeEnvironmentStatus } = loadStartupModule('runtime-profile', () => require('../environment/runtime-profile'));
    logRuntimeEnvironmentStatus(Logger, CONFIG.RUNTIME_ENVIRONMENT_PROFILE);
    startup.write('APPLICATION_MODULES_LOADED', { durationMs: Date.now() - moduleLoadStartedAt });
}

let win = null;
let uiServer = null;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readRendererStartupState(targetWindow) {
    if (!targetWindow || targetWindow.isDestroyed()) return { ready: false, destroyed: true };
    return targetWindow.webContents.executeJavaScript(safeMode
        ? `(() => ({ ready: Boolean(document.querySelector('[data-bloggenius-safe-mode-ready="true"]')) }))()`
        : `(() => {
            const state = window.__BLOGGENIUS_STARTUP__;
            return {
                ready: state?.ready === true,
                readyAt: String(state?.readyAt || ''),
                details: state?.details || {},
                errorCount: Array.isArray(state?.errors) ? state.errors.length : 0
            };
        })()`, true);
}

async function waitForRendererReady(targetWindow) {
    const startedAt = Date.now();
    let lastProbeError = null;
    while (Date.now() - startedAt < RENDERER_READY_TIMEOUT_MS) {
        try {
            const state = await readRendererStartupState(targetWindow);
            if (state.ready) return { ...state, durationMs: Date.now() - startedAt };
            if (state.destroyed) throw new Error('renderer window was destroyed before readiness');
        } catch (error) {
            lastProbeError = error;
        }
        await delay(RENDERER_READY_POLL_MS);
    }
    const error = new Error(`renderer bootstrap did not complete within ${RENDERER_READY_TIMEOUT_MS}ms`);
    if (lastProbeError) error.cause = lastProbeError;
    throw error;
}

function markStartupReady(targetWindow, details = {}) {
    if (startupReady) return;
    startupReady = true;
    if (startupWatchdog) clearTimeout(startupWatchdog);
    startupWatchdog = null;
    startup.markReady({ safeMode, url: targetWindow.webContents.getURL(), ...details });
    startup.write('RENDERER_READY', { safeMode, ...details });
    const postReadyServices = safeMode
        ? Promise.resolve()
        : startPostReadyServices().catch((error) => {
            startup.write('POST_READY_SERVICES_FAILED', formatError(error));
        });
    if (startupProbe) {
        void postReadyServices.finally(() => {
            startup.write('STARTUP_PROBE_COMPLETE', { safeMode });
            setImmediate(() => app.quit());
        });
    } else {
        void postReadyServices;
    }
}

async function runPostReadyService(name, operation) {
    const startedAt = Date.now();
    let timeout;
    try {
        const operationPromise = Promise.resolve().then(operation);
        const timeoutPromise = new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error(`${name} exceeded ${POST_READY_SERVICE_TIMEOUT_MS}ms`)), POST_READY_SERVICE_TIMEOUT_MS);
            timeout.unref?.();
        });
        await Promise.race([operationPromise, timeoutPromise]);
        startup.write('POST_READY_SERVICE_COMPLETE', { name, durationMs: Date.now() - startedAt });
    } catch (error) {
        startup.write('POST_READY_SERVICE_FAILED', { name, durationMs: Date.now() - startedAt, ...formatError(error) });
        Logger?.error?.(`GUI: Post-ready service failed (${name}): ${error.message}`, error);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function startPostReadyServices() {
    startup.write('POST_READY_SERVICES_STARTING');
    await Promise.all([
        typeof uiServer?.startDeferredServices === 'function'
            ? runPostReadyService('application-background', () => uiServer.startDeferredServices())
            : Promise.resolve(),
        typeof startRemoteMcpService === 'function'
            ? runPostReadyService('remote-mcp', () => startRemoteMcpService())
            : Promise.resolve()
    ]);
    startup.write('POST_READY_SERVICES_SETTLED');
}

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
    const windowStartAt = Date.now();
    // 1. UI 서버 시작 (백그라운드 - 최초 1회만)
    if (!uiServer) {
        try {
            const host = CONFIG.LISTEN_HOST || '127.0.0.1';
            const port = CONFIG.LISTEN_PORT || 4577;
            const serverOptions = { host, port, safeMode, deferOptionalStartup: !safeMode };
            try {
                uiServer = await startUiServer(serverOptions);
            } catch (error) {
                if (error.code !== 'EADDRINUSE' || safeMode) throw error;
                startup.write('UI_PORT_CONFLICT_FALLBACK', { host, port });
                Logger.warn(`GUI: 포트 ${port}가 사용 중이어서 임시 로컬 포트로 시작합니다.`);
                uiServer = await startUiServer({
                    ...serverOptions,
                    port: 0,
                    allowEphemeralPort: true
                });
            }
            startup.write('UI_SERVER_READY', { host: uiServer.openHost, port: uiServer.port, safeMode });
            if (safeMode) {
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
    startup.write('WINDOW_CREATING', { safeMode });
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
    startup.write('WINDOW_CREATED', { safeMode, durationMs: Date.now() - windowStartAt });

    let rendererReadinessStarted = false;
    let unresponsiveTimer = null;
    let rendererConsoleEvidenceCount = 0;

    win.webContents.on('console-message', (details) => {
        const level = String(details?.level || '');
        const message = String(details?.message || '');
        const isStartupSignal = message.startsWith('[BLOGGENIUS_RENDERER_');
        if (level !== 'error' && !isStartupSignal) return;
        if (startupReady && !isStartupSignal) return;
        if (rendererConsoleEvidenceCount >= 25) return;
        rendererConsoleEvidenceCount += 1;
        startup.write('RENDERER_CONSOLE', {
            level,
            message: message.slice(0, 4000),
            lineNumber: Number(details?.lineNumber || 0),
            sourceId: String(details?.sourceId || '').slice(0, 1000)
        });
    });

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
        if (startupReady || unresponsiveTimer) return;
        unresponsiveTimer = setTimeout(() => {
            unresponsiveTimer = null;
            if (!startupReady) handleFatalError('WINDOW_UNRESPONSIVE_TIMEOUT', new Error('window remained unresponsive during startup'));
        }, UNRESPONSIVE_RECOVERY_MS);
        unresponsiveTimer.unref?.();
    });

    win.on('responsive', () => {
        startup.write('WINDOW_RESPONSIVE');
        if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
        unresponsiveTimer = null;
    });

    win.webContents.on('did-finish-load', () => {
        startup.write('RENDERER_NAVIGATION_COMPLETE', { safeMode });
        if (!startupReady && !rendererReadinessStarted) {
            rendererReadinessStarted = true;
            void waitForRendererReady(win)
                .then((details) => markStartupReady(win, details))
                .catch((error) => handleFatalError('RENDERER_BOOTSTRAP_FAILED', error));
        }
        void recoverWindowFromBrokenRoute();
    });

    // 3. 내장 서버 주소 로드
    await win.loadURL(getUiRootUrl());

    win.on('closed', () => {
        if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
        unresponsiveTimer = null;
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
if (primaryInstance) app.whenReady().then(async () => {
    startup.write('APP_READY', { safeMode });
    try {
        createMenu();
        startup.write('MENU_READY');
    } catch (error) {
        startup.write('MENU_FAILED', formatError(error));
    }
    await createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createWindow().catch((error) => handleFatalError('ACTIVATE_WINDOW_FAILED', error));
        }
    });
}).catch((error) => handleFatalError('APP_START_FAILED', error));

if (primaryInstance) app.on('second-instance', () => {
    startup.write('SECOND_INSTANCE_FOCUSED');
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
});

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
    if (startupWatchdog) clearTimeout(startupWatchdog);
    startupWatchdog = null;
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
