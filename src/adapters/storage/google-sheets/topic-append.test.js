process.env.BLOG_GENIUS_SAFE_MODE = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const GoogleSheets = require('./operations');

const originalGet = axios.get;
const originalPost = axios.post;
const originalAccessToken = GoogleSheets.getGoogleAccessToken;
const originalCallWithRetry = GoogleSheets.callWithRetry;
const originalClearSheetCache = GoogleSheets.clearSheetCache;
const originalHeaderCache = GoogleSheets._headerCache;

test.afterEach(() => {
    axios.get = originalGet;
    axios.post = originalPost;
    GoogleSheets.getGoogleAccessToken = originalAccessToken;
    GoogleSheets.callWithRetry = originalCallWithRetry;
    GoogleSheets.clearSheetCache = originalClearSheetCache;
    GoogleSheets._headerCache = originalHeaderCache;
});

test('Google Sheets topic append writes the row and confirms persisted row details', async () => {
    GoogleSheets.configureRuntime({ config: { GOOGLE_TOPICS_SHEET: 'topics', GOOGLE_SHEET_ID: 'sheet-id' } });
    GoogleSheets.getGoogleAccessToken = async () => 'token';
    GoogleSheets.callWithRetry = fn => fn();
    let clearedCache;
    GoogleSheets.clearSheetCache = key => { clearedCache = key; };

    const headers = ['주제', '키워드', '참고지시사항', '상태', '이미지처리', '외부참고여부', '추가일시', '소스', 'Options'];
    let appended;
    axios.get = async () => ({ data: { values: [headers] } });
    axios.post = async (_url, body) => {
        appended = body;
        return { data: { updates: { updatedRows: 1, updatedRange: 'topics!A8:I8' } } };
    };

    const result = await GoogleSheets.appendGoogleSheetTopics([{
        subject: '가을 여행',
        keywords: ['오사카 여행'],
        content_guide: { additional_instructions: '교통 중심', reference_urls: ['https://example.com'] },
        status: '대기',
        image_options: { mode: 'generate', generate: true },
        use_external_ref: true,
        source: 'telegram',
        options: { platforms: ['naver'], post_status: 'draft' }
    }], { defaultStatus: '대기', memoryProvenance: { channel: 'telegram', actor_id: 'chat-1' } });

    assert.equal(result.success, true);
    assert.deepEqual(result.rowNumbers, [8]);
    assert.deepEqual(result.rowIndices, [6]);
    assert.equal(appended.values[0][0], '가을 여행');
    assert.equal(appended.values[0][1], '오사카 여행');
    assert.equal(appended.values[0][3], '대기');
    assert.equal(appended.values[0][7], 'telegram');
    assert.equal(JSON.parse(appended.values[0][8]).post_status, 'draft');
    assert.equal(clearedCache, 'topics');
});

test('Google Sheets topic append rejects a response that does not confirm all rows', async () => {
    GoogleSheets.configureRuntime({ config: { GOOGLE_TOPICS_SHEET: 'topics', GOOGLE_SHEET_ID: 'sheet-id' } });
    GoogleSheets.getGoogleAccessToken = async () => 'token';
    GoogleSheets.callWithRetry = fn => fn();
    axios.get = async () => ({ data: { values: [['주제', '키워드', '상태']] } });
    axios.post = async () => ({ data: { updates: { updatedRows: 0, updatedRange: 'topics!A2:C2' } } });

    await assert.rejects(
        GoogleSheets.appendGoogleSheetTopics([{ subject: '저장 실패 확인' }]),
        error => error.code === 'TOPIC_APPEND_UNCONFIRMED' && /저장을 확인하지 않았습니다/.test(error.message)
    );
});

test('Google Sheets topic reads propagate failures for Agent workflows that must distinguish errors from empty lists', async () => {
    GoogleSheets.configureRuntime({ config: { GOOGLE_TOPICS_SHEET: 'topics', GOOGLE_SHEET_ID: 'sheet-id' } });
    GoogleSheets.getGoogleAccessToken = async () => 'token';
    GoogleSheets.callWithRetry = fn => fn();
    axios.get = async () => { throw Object.assign(new Error('temporary sheet failure'), { code: 'SHEET_READ_FAILED' }); };

    await assert.rejects(
        GoogleSheets.readGoogleSheetTopicsAll({ status: '발행 준비 완료', throwOnError: true }),
        error => error.code === 'SHEET_READ_FAILED'
    );
});

test('Google Sheets topic status updates reject an unconfirmed write in strict mode', async () => {
    GoogleSheets.configureRuntime({ config: { GOOGLE_TOPICS_SHEET: 'topics', GOOGLE_SHEET_ID: 'sheet-id' } });
    GoogleSheets.getGoogleAccessToken = async () => 'token';
    GoogleSheets.callWithRetry = fn => fn();
    GoogleSheets._headerCache = {};
    axios.get = async () => ({ data: { values: [['주제', '상태']] } });
    axios.post = async () => ({ data: { totalUpdatedRows: 0, totalUpdatedCells: 0 } });

    await assert.rejects(
        GoogleSheets.updateGoogleSheetStatus(4, '대기', 'queue move', { throwOnError: true }),
        /글감 상태 변경을 확인하지 않았습니다/
    );
});
