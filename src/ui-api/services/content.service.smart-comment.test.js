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
                if (typeof options.onModelCall === 'function') {
                    await options.onModelCall({ modelOptions, callIndex: calls.prompts.length - 1 });
                }
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
            CHAT_MODEL_CONFIG: { code: 'chat-model' },
            RUNTIME_ENVIRONMENT: options.environment || 'production'
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
            if (typeof options.checkSession === 'function') return options.checkSession(sessionOptions);
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

test('smart comment releases the busy state when the Naver session check throws', async () => {
    const { service } = createSmartCommentService({
        async checkSession() { throw new Error('session gateway unavailable'); }
    });

    await assert.rejects(() => service.runNaverCommentDraft({ fetchLimit: 1 }), /session gateway unavailable/);
    const { progress } = await service.getNaverCommentDraftProgress();
    assert.equal(progress.state, 'failed');
});

test('smart comment settings use a conservative default and expose the runtime environment', async () => {
    const { service } = createSmartCommentService({ environment: 'development' });

    const result = await service.getNaverCommentDraftSettings();

    assert.equal(result.settings.fetchLimit, 3);
    assert.equal(result.settings.headless, true);
    assert.equal(result.runtime.environment, 'development');
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
    const validResponse = JSON.stringify({
        items: [
            {
                id: '0',
                drafts: [
                    '하카타 간식 조합이 여행 분위기와 잘 어울리네요.',
                    '달걀 김밥을 기다린 과정도 좋은 추억이 된 것 같아요.',
                    '신선샌드를 포기한 대목이 현실적이라 공감돼요.'
                ]
            },
            { id: '1', drafts: ['No', '좋네요', '좋네요'] }
        ]
    });
    const { service, calls } = createSmartCommentService({
        candidates,
        modelResponses: [validResponse, new Error('모델 연결 실패')]
    });

    const result = await service.runNaverCommentDraft({ fetchLimit: 2, maxChars: 80 });

    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].drafts.length, 3);
    assert.equal(result.items[1].drafts.length, 0);
    assert.equal(calls.modelOptions[0].responseMimeType, 'application/json');
    assert.equal(calls.modelOptions[0].maxTokens, 2048);
    assert.equal(calls.modelOptions[0].reasoningEffort, 'low');
    assert.deepEqual(result.summary, {
        status: 'partial_success',
        candidateCount: 2,
        successCount: 1,
        failureCount: 1
    });
});

test('smart comment batches ten candidates into four model requests', async () => {
    const candidates = Array.from({ length: 10 }, (_unused, index) => ({
        authorName: `이웃${index}`,
        title: `후보 글 ${index}`,
        excerpt: `후보 글 ${index}의 공개된 본문 일부입니다. 충분한 맥락을 포함합니다.`,
        postUrl: `https://blog.naver.com/neighbor${index}/1234567890${index}`
    }));
    const drafts = [
        '본문의 구체적인 내용이 잘 정리되어 있어 흥미롭게 읽었어요.',
        '소개해 주신 이야기를 보니 해당 주제를 더 알아보고 싶네요.',
        '유익한 내용을 이해하기 쉽게 공유해 주셔서 감사합니다.'
    ];
    const responses = [
        ['0', '1', '2'],
        ['3', '4', '5'],
        ['6', '7', '8'],
        ['9']
    ].map((ids) => JSON.stringify({ items: ids.map((id) => ({ id, drafts })) }));
    const { service, calls } = createSmartCommentService({
        candidates,
        modelResponses: responses
    });

    const result = await service.runNaverCommentDraft({ fetchLimit: 10, maxChars: 120 });

    assert.equal(result.summary.status, 'success');
    assert.equal(result.summary.successCount, 10);
    assert.equal(calls.prompts.length, 4);
    assert.deepEqual(calls.modelOptions.map((options) => options.maxTokens), [3072, 3072, 3072, 1024]);
});

test('smart comment exposes live batch and rate-limit progress', async () => {
    let releaseModelCall;
    const modelGate = new Promise((resolve) => { releaseModelCall = resolve; });
    const candidates = [{
        authorName: '이웃1',
        title: '국립중앙박물관 김홍도전',
        excerpt: '조선의 삶과 시대를 그린 단원 김홍도의 작품을 소개한다.',
        postUrl: 'https://blog.naver.com/neighbor1/123456789012'
    }];
    const response = JSON.stringify({
        items: [{
            id: '0',
            drafts: [
                '김홍도의 작품으로 조선의 삶을 만나는 전시라 더 기대되네요.',
                '단원의 작품을 한자리에서 볼 수 있다니 직접 관람해보고 싶어요.',
                '조선 시대의 모습을 생생하게 담은 전시 소식 잘 읽었습니다.'
            ]
        }]
    });
    const { service, calls } = createSmartCommentService({
        candidates,
        modelResponses: [response],
        async onModelCall() { await modelGate; }
    });

    const runPromise = service.runNaverCommentDraft({ fetchLimit: 1, maxChars: 120 });
    while (calls.modelOptions.length === 0) {
        await new Promise((resolve) => setImmediate(resolve));
    }

    let { progress } = await service.getNaverCommentDraftProgress();
    assert.equal(progress.state, 'running');
    assert.equal(progress.phase, 'generating');
    assert.equal(progress.batchIndex, 1);
    assert.equal(progress.batchTotal, 1);
    assert.equal(progress.completedCount, 0);

    await assert.rejects(
        () => service.runNaverCommentDraft({ fetchLimit: 1 }),
        (error) => {
            assert.equal(error.status, 409);
            assert.equal(error.apiCode, 'NAVER_COMMENT_DRAFT_BUSY');
            return true;
        }
    );

    await calls.modelOptions[0].onRetry({ delayMs: 5000 });
    ({ progress } = await service.getNaverCommentDraftProgress());
    assert.equal(progress.phase, 'rate_limited');
    assert.ok(progress.retryRemainingSeconds >= 4 && progress.retryRemainingSeconds <= 5);
    assert.match(progress.message, /AI 요청 한도 대기 중/);

    releaseModelCall();
    const result = await runPromise;
    assert.equal(result.summary.status, 'success');
    ({ progress } = await service.getNaverCommentDraftProgress());
    assert.equal(progress.state, 'completed');
    assert.equal(progress.phase, 'completed');
    assert.equal(progress.completedCount, 1);
});

test('smart comment stops remaining batches after a final rate-limit failure', async () => {
    const candidates = Array.from({ length: 10 }, (_unused, index) => ({
        authorName: `이웃${index}`,
        title: `후보 글 ${index}`,
        excerpt: `후보 글 ${index}의 공개된 본문 일부입니다. 충분한 맥락을 포함합니다.`,
        postUrl: `https://blog.naver.com/neighbor${index}/1234567890${index}`
    }));
    const rateLimitError = new Error('AI 공급자의 요청 한도를 초과했습니다.');
    rateLimitError.code = 'AI_RATE_LIMITED';
    rateLimitError.status = 429;
    const { service, calls } = createSmartCommentService({
        candidates,
        modelResponses: [rateLimitError]
    });

    const result = await service.runNaverCommentDraft({ fetchLimit: 10, maxChars: 120 });

    assert.equal(calls.prompts.length, 1);
    assert.equal(result.summary.status, 'rate_limited');
    assert.equal(result.summary.successCount, 0);
    assert.equal(result.summary.failureCount, 10);
    assert.equal(result.items.length, 10);
    assert.match(result.items[3].error, /요청 한도/);
    const { progress } = await service.getNaverCommentDraftProgress();
    assert.equal(progress.state, 'completed');
    assert.match(progress.message, /실행 중단/);
});
