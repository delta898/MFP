const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// 🚀 [Environment Setup] GUI 전용 실행 환경 설정 (Require 이전에 수행)
process.env.BLOG_GENIUS_GUI_MODE = 'true';
process.env.BLOG_GENIUS_USER_DATA = app.getPath('userData');

// 💡 [Portable First] 하위 모듈 설정 로드
const CONFIG = require('../config-loader');

// 로그 디렉토리를 미리 생성해 둡니다. (logger.js 가 로드될 때 오류 방지)
// config-loader 가 결정한 ROOT_DIR 을 따릅니다.
const logDir = path.join(CONFIG.ROOT_DIR, 'logs');
if (!fs.existsSync(logDir)) {
    try {
        fs.mkdirSync(logDir, { recursive: true });
    } catch (e) {
        console.error('GUI: Failed to create log dir', e.message);
    }
}

// ⚠️ 환경 설정 완료 후 하위 모듈 로드
const { startUiServer } = require('../ui-server');
const Logger = require('../logger');

let win = null;
let uiServer = null;

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
            label: '보기',
            submenu: [
                { label: '새로고침', role: 'reload' },
                { label: '강제 새로고침', role: 'forceReload' },
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
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

async function createWindow() {
    // 1. UI 서버 시작 (백그라운드)
    try {
        const host = CONFIG.LISTEN_HOST || '127.0.0.1';
        const port = CONFIG.LISTEN_PORT || 4577;
        uiServer = await startUiServer({ host, port });
        Logger.info(`GUI: UI Server started at http://${uiServer.openHost}:${uiServer.port}`);
    } catch (err) {
        Logger.error(`GUI: Failed to start UI Server: ${err.message}`);
        app.quit();
        return;
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
    win.loadURL(`http://${uiServer.openHost}:${uiServer.port}`);

    win.on('closed', () => {
        win = null;
    });

    // 페이지 제목이 바뀌어도 앱 제목 고정
    win.on('page-title-updated', (e) => {
        e.preventDefault();
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
});
