const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 🚀 [Environment Setup] GUI 전용 실행 환경 설정 (Require 이전에 수행)
process.env.BLOG_GENIUS_GUI_MODE = 'true';
process.env.BLOG_GENIUS_USER_DATA = app.getPath('userData');

// 💡 [Portable First] 하위 모듈 설정 로드
const CONFIG = require('../config-loader');

// 로그 디렉토리를 미리 생성해 둡니다. (logger.js 가 로드될 때 오류 방지)
// config-loader 가 결정한 ROOT_DIR 을 따릅니다.
const logDir = path.join(CONFIG.ROOT_DIR || process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    try {
        fs.mkdirSync(logDir, { recursive: true });
    } catch (e) {
        console.error('GUI: Failed to create log dir', e.message);
    }
}

// ⚠️ 환경 설정 완료 후 하위 모듈 로드
const { startUiServer } = require('../ui-server');
const { startRemoteMcpService, stopRemoteMcpService } = require('../mcp/remote-service');
const Logger = require('../logger');

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
        win.loadURL(rootUrl);
        return;
    }
    win.loadURL(rootUrl);
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

// Electron의 기본 메뉴를 제거하거나 커스터마이징합니다.
function createMenu() {
    const template = [
        {
            label: '파일',
            submenu: [
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
            uiServer = await startUiServer({ host, port });
            await startRemoteMcpService();
            Logger.info(`GUI: UI Server started at http://${uiServer.openHost}:${uiServer.port}`);
        } catch (err) {
            Logger.error(`GUI: Failed to start UI Server: ${err.message}`);

            let displayMsg = err.message;
            if (err.code === 'EADDRINUSE') {
                const port = CONFIG.LISTEN_PORT || 4577;
                displayMsg = `포트 ${port}번이 이미 사용 중입니다.\n\n다른 BlogGenius 프로그램이 실행 중이거나, 다른 앱이 이 포트를 사용하고 있습니다.`;
            }

            dialog.showErrorBox('BlogGenius 시작 오류', displayMsg);
            app.quit();
            return;
        }
    }

    const iconPath = path.join(__dirname, '../../assets/icons/icon.png');

    // 2. 브라우저 창 생성
    win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: '',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: true // 필요 시 true
        }
    });

    // 3. 내장 서버 주소 로드
    reloadWindowToRoot(false);

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

    win.webContents.on('did-finish-load', () => {
        void recoverWindowFromBrokenRoute();
    });
}

// 앱 준비 완료 시 실행
app.whenReady().then(() => {
    createMenu();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 모든 창이 닫히면 종료
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 종료 직전 서버 자원 정리
app.on('before-quit', () => {
    Logger.info('GUI: Shutting down...');
    if (uiServer && uiServer.server) {
        uiServer.server.close();
    }
    stopRemoteMcpService().catch((error) => {
        Logger.error(`GUI: Failed to stop MCP remote service: ${error.message}`);
    });
});
