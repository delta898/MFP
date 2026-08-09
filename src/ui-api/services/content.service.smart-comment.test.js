const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentService } = require('./content.service');

function createSmartCommentService(options = {}) {
    const calls = {
        sessionOptions: [],
        launchOptions: [],
        contextOptions: [],
        prompts: [],
        modelOptions: []
    };
    const page = {
        async goto() {},
        async waitForTimeout() {},
        async evaluate() { return []; }
    };
    const context = {
        async newPage() { return page; },
        async close() {}
    };
    const browser = {
        async newContext(contextOptions) {
            calls.contextOptions.push(contextOptions);
            return context;
        },
        async close() {}
    };
    const service = createContentService({
        Utils: {
            _normalizeNaverBlogPostUrl() { return ''; },
            async callTextModelByMode(_mode, prompt, _retries, modelOptions) {
                calls.prompts.push(prompt);
                calls.modelOptions.push(modelOptions);
                if (options.modelResponses?.length) {
                    const response = options.modelResponses.shift();
                    if (response instanceof Error) throw response;
                    return response;
                }
                throw new Error('예상하지 않은 모델 호출입니다.');
            }
        },
        CONFIG: {
            NAVER_ID: 'owner-id',
            AUTH_FILE_PATH: '/tmp/naver-smart-comment-auth.json',
            TEXT_MODEL_CONFIG: { code: 'writing-model' },
            CHAT_MODEL_CONFIG: { code: 'chat-model' }
        },
        BrowserLauncher: {
            async launchBrowser(launchOptions) {
                calls.launchOptions.push(launchOptions);
                return browser;
            }
        },
        Logger: {
            info() {},
            debug() {},
            warn() {},
            error() {}
        },
        checkNaverSessionForUi: async (sessionOptions) => {
            calls.sessionOptions.push(sessionOptions);
            return options.sessionResult || { ok: true };
        },
        ...(options.candidates ? {
            smartCommentCollector: {
                async collect() { return options.candidates; }
            }
        } : {})
    });
    return { service, calls };
}

test('smart comment stops before browser launch when the Naver session is missing', async () => {
    const { service, calls } = createSmartCommentService({
        sessionResult: { ok: false, reason: 'missing_auth' }
    });

    await assert.rejects(
        () => service.runNaverCommentDraft({ fetchLimit: 1 }),
        (error) => {
            assert.equal(error.status, 401);
            assert.equal(error.apiCode, 'NAVER_SESSION_INVALID');
            assert.equal(error.reason, 'missing_auth');
            assert.match(error.message, /네이버 로그인/);
            return true;
        }
    );
    assert.deepEqual(calls.sessionOptions, [{ forceRefresh: true }]);
    assert.equal(calls.launchOptions.length, 0);
});

test('smart comment collects candidates with the saved Naver storage state', async () => {
    const { service, calls } = createSmartCommentService();

    const result = await service.runNaverCommentDraft({
        fetchLimit: 1,
        headless: false
    });

    assert.deepEqual(result.items, []);
    assert.deepEqual(result.summary, {
        status: 'no_candidates',
        candidateCount: 0,
        successCount: 0,
        failureCount: 0
    });
    assert.deepEqual(calls.sessionOptions, [{ forceRefresh: true }]);
    assert.deepEqual(calls.launchOptions, [{ headless: false }]);
    assert.equal(calls.contextOptions.length, 1);
    assert.equal(calls.contextOptions[0].storageState, '/tmp/naver-smart-comment-auth.json');
    assert.match(calls.contextOptions[0].userAgent, /Chrome\/120/);
});

test('smart comment reports partial success separately from generation failure', async () => {
    const candidates = [
        {
            authorName: '이웃1',
            title: '규슈 여행 3일차',
            excerpt: '하카타에서 달걀 김밥과 신선샌드를 사기로 했다.',
            postUrl: 'https://blog.naver.com/neighbor1/123456789012'
        },
        {
            authorName: '이웃2',
            title: '선크림 사용 후기',
            excerpt: '출근 전 간단하게 바르기 좋은 선크림을 소개한다.',
            postUrl: 'https://blog.naver.com/neighbor2/123456789013'
        }
    ];
    const validResponse = '{"drafts":["하카타 간식 조합이 여행 분위기와 잘 어울리네요.","달걀 김밥을 기다린 과정도 좋은 추억이 된 것 같아요.","신선샌드를 포기한 대목이 현실적이라 공감돼요."]}';
    const { service, calls } = createSmartCommentService({
        candidates,
        modelResponses: [validResponse, new Error('모델 연결 실패')]
    });

    const result = await service.runNaverCommentDraft({ fetchLimit: 2, maxChars: 80 });

    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].drafts.length, 3);
    assert.equal(result.items[1].drafts.length, 0);
    assert.equal(calls.modelOptions[0].responseMimeType, 'application/json');
    assert.equal(calls.modelOptions[0].maxTokens, 768);
    assert.equal(calls.modelOptions[0].reasoningEffort, 'low');
    assert.deepEqual(result.summary, {
        status: 'partial_success',
        candidateCount: 2,
        successCount: 1,
        failureCount: 1
    });
});
