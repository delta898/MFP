'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'logger.js'), 'utf8');

test('operational logging is bounded and reports file-write failure once', () => {
    assert.match(source, /MAX_DAILY_LOG_BYTES/);
    assert.match(source, /[.]previous[.]log/);
    assert.match(source, /_fileWriteFailureReported/);
    assert.match(source, /로그 파일 쓰기 실패/);
});
test('production error logging retains a bounded stack without DEBUG mode', () => {
    assert.match(source, /Stack trace:/);
    assert.match(source, /slice\(0, 12000\)/);
    assert.doesNotMatch(source, /process[.]env[.]DEBUG && error/);
});
