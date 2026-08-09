const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildNeighborFeedUrl,
    createNaverSmartCommentCollector,
    normalizeVisibleText
} = require('./smart-comment-candidate-collector');

function createCollectorFixture(rawItems = [], overrides = {}) {
    const calls = {
        launch: [],
        context: [],
        goto: [],
        evaluateLimit: []
    };
    const page = {
        async goto(url, options) { calls.goto.push({ url, options }); },
        url() { return overrides.currentUrl || 'https://section.blog.naver.com/BlogHome.naver'; },
        async waitForTimeout() {},
        async evaluate(_extractor, limit) {
            calls.evaluateLimit.push(limit);
            return rawItems;
        }
    };
    const context = {
        async newPage() { return page; },
        async close() {}
    };
    const browser = {
        async newContext(options) {
            calls.context.push(options);
            return context;
        },
        async close() {}
    };
    const collector = createNaverSmartCommentCollector({
        BrowserLauncher: {
            async launchBrowser(options) {
                calls.launch.push(options);
                return browser;
            }
        },
        CONFIG: {
            NAVER_ID: 'owner-id',
            AUTH_FILE_PATH: '/tmp/naver-auth.json'
        }
    });
    return { collector, calls };
}

test('neighbor feed starts at the stable Naver Blog entry URL', () => {
    assert.equal(
        buildNeighborFeedUrl(),
        'https://blog.naver.com'
    );
});

test('visible excerpt normalization prefers a completed sentence before the limit', () => {
    const raw = `${'가'.repeat(250)} 문장을 마칩니다. ${'나'.repeat(180)}`;
    const normalized = normalizeVisibleText(raw, 400);
    assert.ok(normalized.endsWith('.'));
    assert.ok(normalized.length <= 400);
});

test('collector uses the saved session and filters own, liked, and invalid candidates', async () => {
    const { collector, calls } = createCollectorFixture([
        {
            authorName: ' 이웃  작가 ',
            title: ' 실제   제목 ',
            excerpt: `${'본문 '.repeat(120)}마침.`,
            postUrl: 'https://blog.naver.com/neighbor/123456789',
            thumbnailUrl: 'https://example.com/a.jpg',
            liked: false,
            likedStateKnown: true
        },
        {
            authorName: '나',
            title: '내 글',
            excerpt: '내 글 본문',
            postUrl: 'https://blog.naver.com/owner-id/123456780'
        },
        {
            authorName: '이미 공감',
            title: '공감한 글',
            excerpt: '공감한 글 본문',
            postUrl: 'https://blog.naver.com/liked/123456781',
            liked: true,
            likedStateKnown: true
        }
    ]);

    const result = await collector.collect({ fetchLimit: 3, headless: false });

    assert.equal(result.length, 1);
    assert.equal(result[0].authorName, '이웃 작가');
    assert.equal(result[0].title, '실제 제목');
    assert.ok(result[0].excerpt.length <= 400);
    assert.equal(result[0].commentUrl, 'https://blog.naver.com/neighbor/123456789?copen=1');
    assert.deepEqual(calls.launch, [{ headless: false }]);
    assert.equal(calls.context[0].storageState, '/tmp/naver-auth.json');
    assert.equal(calls.goto[0].url, 'https://blog.naver.com');
    assert.deepEqual(calls.evaluateLimit, [3]);
});

test('collector reports an expired session redirect and still closes resources', async () => {
    const { collector } = createCollectorFixture([], {
        currentUrl: 'https://nid.naver.com/nidlogin.login?mode=form'
    });

    await assert.rejects(
        () => collector.collect({ fetchLimit: 1 }),
        (error) => {
            assert.equal(error.code, 'NAVER_SESSION_INVALID');
            assert.match(error.message, /세션이 만료/);
            return true;
        }
    );
});

test('collector falls back to the post blog id when the visible author is missing', async () => {
    const { collector } = createCollectorFixture([{
        authorName: '',
        title: '실제 글 제목',
        excerpt: '카드에 표시된 실제 본문 일부입니다.',
        postUrl: 'https://blog.naver.com/neighbor-id/123456789'
    }]);

    const result = await collector.collect({ fetchLimit: 1 });
    assert.equal(result[0].authorName, 'neighbor-id');
});
