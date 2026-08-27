#!/usr/bin/env node

process.env.TZ = 'Asia/Seoul';
process.env.NODE_NO_WARNINGS = '1';

if (typeof process.versions.electron !== 'undefined' && process.argv.length <= 2) {
    eval('require')('./gui/electron-main');
    return;
}

const crypto = require('crypto');
if (!globalThis.crypto) {
    if (crypto.webcrypto) {
        globalThis.crypto = crypto.webcrypto;
    } else {
        globalThis.crypto = {
            getRandomValues: (buffer) => crypto.randomFillSync(buffer),
            subtle: {}
        };
    }
}

const originalWarn = console.warn;
console.warn = (...args) => {
    if (args[0] && args[0].includes && args[0].includes('deprecated')) return;
    originalWarn.apply(console, args);
};

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
    const warningCode =
        (warning && typeof warning === 'object' && warning.code)
            ? String(warning.code)
            : String(args.find((value) => typeof value === 'string' && /^DEP\d+$/i.test(value)) || '');
    if (warningCode === 'DEP0040') return;
    return originalEmitWarning(warning, ...args);
};

const { spawn } = require('child_process');
const Logger = require('./logger');
const CONFIG = require('./config-loader');
const { logRuntimeEnvironmentStatus } = require('./environment/runtime-profile');
const { startUiServer } = require('./ui-server');
const { startRemoteMcpService, stopRemoteMcpService } = require('./mcp/remote-service');

logRuntimeEnvironmentStatus(Logger, CONFIG.RUNTIME_ENVIRONMENT_PROFILE);

function openUrlInDefaultBrowser(url) {
    const target = String(url || '').trim();
    if (!target) return false;

    let command = '';
    let args = [];

    if (process.platform === 'darwin') {
        command = 'open';
        args = [target];
    } else if (process.platform === 'win32') {
        command = 'cmd';
        args = ['/c', 'start', '', target];
    } else {
        command = 'xdg-open';
        args = [target];
    }

    try {
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
        return true;
    } catch (_) {
        return false;
    }
}

function parseLauncherOptions(argv = []) {
    const options = {
        host: String(CONFIG.LISTEN_HOST || '127.0.0.1').trim() || '127.0.0.1',
        port: Number.isFinite(Number(CONFIG.LISTEN_PORT)) ? parseInt(CONFIG.LISTEN_PORT, 10) : 4577,
        openBrowser: true,
        removedCommands: []
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index] || '').trim();
        if (!arg) continue;

        if (arg === '--no-open') {
            options.openBrowser = false;
            continue;
        }
        if (arg.startsWith('--host=')) {
            options.host = String(arg.slice('--host='.length) || '').trim() || options.host;
            continue;
        }
        if (arg === '--host') {
            const nextValue = String(argv[index + 1] || '').trim();
            if (nextValue) {
                options.host = nextValue;
                index += 1;
            }
            continue;
        }
        if (arg.startsWith('--port=')) {
            const parsed = parseInt(arg.slice('--port='.length), 10);
            if (Number.isFinite(parsed)) options.port = parsed;
            continue;
        }
        if (arg === '--port') {
            const parsed = parseInt(String(argv[index + 1] || '').trim(), 10);
            if (Number.isFinite(parsed)) {
                options.port = parsed;
                index += 1;
            }
            continue;
        }

        if (!arg.startsWith('-')) {
            options.removedCommands.push(arg);
        }
    }

    return options;
}

function printRemovedCommandNotice(removedCommands = []) {
    if (!Array.isArray(removedCommands) || removedCommands.length === 0) return;

    const commands = removedCommands.join(', ');
    console.log(`ℹ️ CLI 명령 모드는 제거되었습니다. (${commands})`);
    console.log('ℹ️ 이제 앱의 GUI 또는 웹 UI에서 로그인, 라이선스, 발행 작업을 진행해 주세요.');
    console.log('');
}

async function bootstrapUiLauncher() {
    const options = parseLauncherOptions(process.argv.slice(2));
    printRemovedCommandNotice(options.removedCommands);

    try {
        const started = await startUiServer({
            host: options.host,
            port: options.port
        });
        const remoteMcp = await startRemoteMcpService();
        const uiUrl = `http://${started.openHost || '127.0.0.1'}:${started.port}`;

        console.log(`\n✅ UI 서버 실행 중: ${uiUrl}`);
        console.log(`ℹ️ 바인딩 주소: ${started.host}:${started.port}`);
        if (remoteMcp?.running) {
            console.log(`✅ MCP 서버 실행 중: ${remoteMcp.endpoint}`);
        } else {
            console.log('ℹ️ MCP 서버는 현재 비활성화 상태입니다.');
        }

        if (!CONFIG.CONFIG_IS_ESSENTIAL_SET) {
            console.log('\n👋 BlogGenius에 오신 것을 환영합니다!');
            console.log('ℹ️ 프로그램 시작을 위해 먼저 [설정] 화면에서 필수 정보를 입력해 주세요.\n');
        }

        if (options.openBrowser) {
            if (openUrlInDefaultBrowser(uiUrl)) {
                console.log('🌐 기본 브라우저를 자동으로 열었습니다.');
            } else {
                console.log('ℹ️ 브라우저 자동 실행에 실패했습니다. 위 URL을 직접 열어주세요.');
            }
        } else {
            console.log('ℹ️ --no-open 옵션으로 브라우저 자동 실행을 건너뛰었습니다.');
        }
        console.log('ℹ️ 종료하려면 Ctrl + C를 누르세요.');
    } catch (error) {
        Logger.error(`Launcher failed: ${error.message}`);
        if (error.code === 'EADDRINUSE') {
            const port = Number.isFinite(Number(options.port)) ? options.port : 4577;
            console.error(`\n❌ 포트 ${port}번이 이미 사용 중입니다.`);
            console.error('   다른 BlogGenius 프로그램이 실행 중이거나, 다른 앱이 이 포트를 사용하고 있습니다.');
        } else {
            console.error(`\n❌ UI 실행 실패: ${error.message}`);
        }
        process.exit(1);
    }
}

let shuttingDown = false;

async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
        await stopRemoteMcpService();
    } catch (error) {
        Logger.warn(`Launcher shutdown warning: ${error.message}`);
    }
}

process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
});

bootstrapUiLauncher();
