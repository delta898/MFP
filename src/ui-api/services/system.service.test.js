const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSystemService } = require('./system.service');

function createService(logs = [], overrides = {}) {
    return createSystemService({
        APP_VERSION: '0.0.0-test',
        Utils: {},
        fs: {},
        path: {},
        CONFIG: {},
        parseBoolQuery: () => false,
        ensureSheetsReadyForUi: async () => ({ ok: true }),
        Logger: {
            debug() {},
            getRecentLogs() { return []; },
            info(message) { logs.push(message); }
        },
        axios: {},
        cheerio: {},
        ...overrides
    });
}

test('system service records only allowlisted posting completion effect events', () => {
    const logs = [];
    const service = createService(logs);

    assert.deepEqual(service.logUiEvent({
        event: 'posting_completion_effect',
        stage: 'displayed',
        postStatus: 'draft'
    }), { logged: true });
    assert.match(logs[0], /\[CompletionEffect\] 포스팅 완료 효과 화면 표시 실행 \(status=draft\)/);

    assert.throws(
        () => service.logUiEvent({ event: 'arbitrary', stage: 'displayed', postStatus: 'draft' }),
        /허용되지 않은 UI 이벤트/
    );
    assert.throws(
        () => service.logUiEvent({ event: 'posting_completion_effect', stage: 'displayed', postStatus: 'schedule' }),
        /허용되지 않은 UI 이벤트/
    );
});

test('config status exposes setup guidance without requiring a license lookup', async () => {
    const service = createService([], {
        CONFIG: {
            CONFIG_READY: true,
            CONFIG_IS_ESSENTIAL_SET: false,
            CONFIG_IS_NAVER_SET: false,
            CONFIG_IS_WP_SET: false,
            TEXT_MODEL: 'configured-model',
            TEXT_MODEL_API_KEY: 'configured-key'
        },
        peekGoogleOauthStatus: () => ({ state: 'disconnected', connected: false })
    });

    const status = await service.getConfigStatus();

    assert.equal(status.ready, true);
    assert.equal(status.isEssentialSet, false);
    assert.deepEqual(status.setup, {
        ready: false,
        ai: { configured: true, text_configured: true, image_configured: false },
        google: {
            configured: false,
            account_connected: false,
            spreadsheet_configured: false
        },
        publishing_channel: {
            configured: false,
            naver_configured: false,
            wordpress_configured: false
        }
    });
});

test('config status reports completed setup from local configuration and OAuth state', async () => {
    const service = createService([], {
        CONFIG: {
            CONFIG_READY: true,
            CONFIG_IS_ESSENTIAL_SET: true,
            CONFIG_IS_NAVER_SET: true,
            CONFIG_IS_WP_SET: false,
            GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/example',
            TEXT_MODEL: 'configured-model',
            TEXT_MODEL_API_KEY: 'configured-key'
        },
        peekGoogleOauthStatus: () => ({ state: 'connected_cached', connected: true })
    });

    const status = await service.getConfigStatus();

    assert.equal(status.setup.ready, true);
    assert.equal(status.setup.google.configured, true);
    assert.equal(status.setup.publishing_channel.naver_configured, true);
});

test('log file APIs read the same runtime directory used by the Electron logger', async () => {
    const previous = process.env.BLOG_GENIUS_LOG_DIR;
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-runtime-logs-'));
    const logName = '2026-09-22.log';
    fs.writeFileSync(path.join(logDir, logName), '[2026-09-22 09:00:00] [ERROR] fixture error\n');
    process.env.BLOG_GENIUS_LOG_DIR = logDir;
    try {
        const service = createService([], {
            fs,
            path,
            CONFIG: { ROOT_DIR: '/different/application/root' }
        });
        assert.deepEqual(await service.getLogFiles(), { files: [logName] });
        assert.match((await service.readLogFile({ filename: logName })).content, /fixture error/);
    } finally {
        if (previous === undefined) delete process.env.BLOG_GENIUS_LOG_DIR;
        else process.env.BLOG_GENIUS_LOG_DIR = previous;
    }
});
