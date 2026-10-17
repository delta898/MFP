'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSafeModeHtml, startSafeModeServer } = require('./safe-mode-server');

test('safe-mode shell explains reduced behavior without loading the application graph', () => {
    const html = createSafeModeHtml('C:\\Users\\Example\\AppData\\Local\\BlogGenius');
    assert.match(html, /BlogGenius 안전 모드/);
    assert.match(html, /자동 전송되지 않습니다/);
    assert.match(html, /작성·발행·자동화 기능이 실행되지 않습니다/);
    assert.match(html, /data-bloggenius-safe-mode-ready="true"/);
    assert.doesNotMatch(html, /<script/i);
});

test('safe-mode shell escapes the diagnostic path', () => {
    const html = createSafeModeHtml('<diagnostics>');
    assert.match(html, /&lt;diagnostics&gt;/);
    assert.doesNotMatch(html, /<diagnostics>/);
});

test('safe-mode server contract is loopback-only with an ephemeral port and restrictive CSP', () => {
    const source = startSafeModeServer.toString();
    assert.match(source, /const host = '127[.]0[.]0[.]1'/);
    assert.match(source, /server[.]listen\(0, host/);
    assert.match(source, /default-src 'none'/);
});
