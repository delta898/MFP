const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveWordPressFeedUrl,
    resolveSnsFeedDefinitions,
    sortOldestFirst,
    createSnsRssDiscovery
} = require('./sns-rss-discovery');

function createBaseConfig(overrides = {}) {
    return {
        SNS_PUBLISH_ENABLED: true,
        SNS_SOURCE_BLOGS: ['naver'],
        BUFFER_API_KEY: 'buffer-key',
        BUFFER_ORGANIZATION_ID: 'organization-1',
        BUFFER_CHANNELS: [
            { id: 'channel-1', service: 'threads', displayName: 'Threads' }
        ],
        NAVER_ID: 'naver-user',
        WORDPRESS_URL: 'https://blog.example',
        ...overrides
    };
}

test('SNS feed definitions derive Naver and WordPress RSS URLs', () => {
    assert.equal(resolveWordPressFeedUrl('https://blog.example/subdir'), 'https://blog.example/subdir/feed/');
    assert.equal(resolveWordPressFeedUrl('https://blog.example/feed/'), 'https://blog.example/feed/');
    assert.deepEqual(resolveSnsFeedDefinitions(createBaseConfig()), [
        {
            sourcePlatform: 'naver',
            url: 'https://rss.blog.naver.com/naver-user.xml'
        },
        {
            sourcePlatform: 'wordpress',
            url: 'https://blog.example/feed/'
        }
    ]);
});

test('SNS feed entries are ordered oldest first', () => {
    const sorted = sortOldestFirst([
        { title: 'new', pubDate: '2026-07-29T03:00:00Z' },
        { title: 'old', pubDate: '2026-07-29T01:00:00Z' },
        { title: 'middle', pubDate: '2026-07-29T02:00:00Z' }
    ]);
    assert.deepEqual(sorted.map((item) => item.title), ['old', 'middle', 'new']);
});

test('SNS discovery requires both capability and app activation before fetching RSS', async () => {
    let fetchCount = 0;
    const createDiscovery = (config, capability) => createSnsRssDiscovery({
        CONFIG: config,
        License: {
            async checkLicenseStatus() {
                return { success: true, features: { enable_sns_distribution: capability } };
            }
        },
        Utils: {
            async fetchAndParseRss() {
                fetchCount += 1;
                return [];
            }
        },
        store: {
            async listRows() { return []; },
            async appendEntriesDeliveries() { return { addedEntryCount: 0, addedCount: 0 }; }
        },
        getEnableSnsDistribution: (features) => features?.enable_sns_distribution === true
    });

    const disabled = await createDiscovery(createBaseConfig({ SNS_PUBLISH_ENABLED: false }), true).run();
    const noCapability = await createDiscovery(createBaseConfig(), false).run();

    assert.equal(disabled.code, 'SNS_DISTRIBUTION_DISABLED');
    assert.equal(noCapability.code, 'SNS_CAPABILITY_DISABLED');
    assert.equal(fetchCount, 0);
});

test('SNS discovery registers selected sources as pending and unselected sources as skipped', async () => {
    const appended = [];
    const feedItems = {
        naver: [
            {
                guid: 'naver-new',
                title: '네이버 새 글',
                summary: '네이버 새 글 요약',
                link: 'https://blog.naver.com/naver-user/2',
                pubDate: '2026-07-29T02:00:00Z',
                imageUrl: 'https://cdn.example/naver.jpg'
            },
            {
                guid: 'naver-old',
                title: '네이버 예전 글',
                summary: '네이버 예전 글 요약',
                link: 'https://blog.naver.com/naver-user/1',
                pubDate: '2026-07-29T01:00:00Z',
                imageUrl: 'https://cdn.example/naver-old.jpg'
            }
        ],
        wordpress: [
            {
                guid: 'wp-1',
                title: '워드프레스 글',
                link: 'https://blog.example/post/1',
                pubDate: '2026-07-29T03:00:00Z',
                imageUrl: ''
            }
        ]
    };
    const discovery = createSnsRssDiscovery({
        CONFIG: createBaseConfig({ SNS_SOURCE_BLOGS: ['naver'] }),
        License: {
            async checkLicenseStatus() {
                return { success: true, features: { enable_sns_distribution: true } };
            }
        },
        Utils: {
            async fetchAndParseRss(url) {
                return url.includes('naver') ? feedItems.naver : feedItems.wordpress;
            }
        },
        store: {
            async listRows() { return []; },
            async appendEntriesDeliveries(input) {
                appended.push(...input.entries);
                return {
                    addedEntryCount: input.entries.length,
                    addedCount: input.entries.length * input.channels.length
                };
            }
        },
        getEnableSnsDistribution: (features) => features?.enable_sns_distribution === true,
        httpClient: {
            async get() {
                return {
                    status: 200,
                    data: '<meta property="og:image" content="/wp-cover.jpg"><meta property="og:description" content="워드프레스 OG 요약">'
                };
            }
        }
    });

    const result = await discovery.run('test');

    assert.equal(result.success, true);
    assert.equal(result.data.newEntryCount, 3);
    assert.deepEqual(appended.map((item) => item.entry.title), [
        '네이버 예전 글',
        '네이버 새 글',
        '워드프레스 글'
    ]);
    assert.deepEqual(appended.map((item) => item.status), ['대기', '대기', '건너뜀']);
    assert.equal(appended[2].entry.imageUrl, 'https://blog.example/wp-cover.jpg');
    assert.equal(appended[2].entry.summary, '워드프레스 OG 요약');
    assert.match(appended[2].log, /발행 대상 블로그에서 제외됨/);
});

test('SNS discovery rejects incomplete selected blog configuration', async () => {
    const discovery = createSnsRssDiscovery({
        CONFIG: createBaseConfig({
            SNS_SOURCE_BLOGS: ['wordpress'],
            WORDPRESS_URL: ''
        }),
        License: {
            async checkLicenseStatus() {
                return { success: true, features: { enable_sns_distribution: true } };
            }
        },
        Utils: { async fetchAndParseRss() { return []; } },
        store: {
            async listRows() { return []; },
            async appendEntriesDeliveries() { return {}; }
        },
        getEnableSnsDistribution: (features) => features?.enable_sns_distribution === true
    });

    const result = await discovery.run();

    assert.equal(result.code, 'SNS_CONFIG_INCOMPLETE');
    assert.match(result.message, /WordPress URL/);
});

test('SNS discovery continues with the configured selected blog when the other blog is unset', async () => {
    const fetchedUrls = [];
    const discovery = createSnsRssDiscovery({
        CONFIG: createBaseConfig({
            SNS_SOURCE_BLOGS: ['naver', 'wordpress'],
            WORDPRESS_URL: ''
        }),
        License: {
            async checkLicenseStatus() {
                return { success: true, features: { enable_sns_distribution: true } };
            }
        },
        Utils: {
            async fetchAndParseRss(url) {
                fetchedUrls.push(url);
                return [];
            }
        },
        store: {
            async listRows() { return []; },
            async appendEntriesDeliveries() {
                return { addedEntryCount: 0, addedCount: 0 };
            }
        },
        getEnableSnsDistribution: (features) => features?.enable_sns_distribution === true
    });

    const result = await discovery.run();

    assert.equal(result.success, true);
    assert.deepEqual(fetchedUrls, ['https://rss.blog.naver.com/naver-user.xml']);
    assert.deepEqual(result.data.unavailableSourceBlogs, ['wordpress']);
});
