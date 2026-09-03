const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystemService } = require('./system.service');

function createService(logs = []) {
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
        cheerio: {}
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
