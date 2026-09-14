const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');
const runtimeFiles = [
    'src/telegram-bot.service.js',
    'src/capabilities/jobs/trends.js',
    'src/capabilities/content/publish.js'
];

test('internal UI callers use the shared origin and never the obsolete UI_SERVER_PORT', () => {
    for (const relativePath of runtimeFiles) {
        const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
        assert.doesNotMatch(source, /UI_SERVER_PORT/);
        assert.match(source, /getInternalUiOrigin/);
    }
});

test('Telegram query failures keep low-level connection details out of chat replies', () => {
    const source = fs.readFileSync(path.join(projectRoot, 'src/telegram-bot.service.js'), 'utf8');
    assert.doesNotMatch(source, /sendMessage\([^\n]*\$\{err\.message\}/);
    assert.match(source, /데이터를 조회하지 못했습니다\. 앱 상태를 확인한 뒤 다시 시도해 주세요\./);
    assert.match(source, /query_type=\$\{queryType\}/);
});

test('legacy Telegram parser does not force ambiguous conversation into an action', () => {
    const source = fs.readFileSync(path.join(projectRoot, 'src/core.js'), 'utf8');
    assert.match(source, /지원 범위 밖의 요청을 가장 가까운 액션으로 추측하지 마세요/);
    assert.match(source, /actions는 빈 배열 \[\]로 반환하세요/);
});
