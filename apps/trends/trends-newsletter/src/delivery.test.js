import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecipientBriefing } from './delivery.js';

const trendDate = '2026-11-02';
const edition = {
    status: 'ready',
    greeting: '좋은 아침입니다.',
    introduction: '오늘의 흐름을 확인해 보세요.',
    featured_post: {
        title: 'BlogGenius 업데이트 안내',
        url: 'https://blog.gongzza.com/updates/1',
        excerpt: '<script>alert(1)</script>새로운 기능을 소개합니다.',
        imageUrl: 'https://blog.gongzza.com/wp-content/cover.jpg'
    },
    download_url: 'https://www-dev.bloggenius.kr/download/',
    download_banner_url: 'https://www-dev.bloggenius.kr/assets/share-card.svg'
};

function trendsFor(category = 'IT·컴퓨터', count = 20) {
    return Array.from({ length: count }, (_, index) => ({
        category,
        keyword: `keyword & ${index + 1}`,
        change_type: index === 0 ? 'up' : index === 1 ? 'down' : index === 2 ? 'new' : 'steady',
        change_amount: index < 2 ? index + 1 : null,
        change_raw: index === 0 ? '▲ 1' : index === 1 ? '▼ 2' : index === 2 ? 'new' : 'steady',
        display_order: index + 1
    }));
}

function makeBriefing(overrides = {}) {
    return buildRecipientBriefing({
        trendDate,
        categories: ['IT·컴퓨터'],
        trends: trendsFor(),
        edition,
        trendsUrl: 'https://www-dev.bloggenius.kr/trends/',
        unsubscribeUrl: 'https://www-dev.bloggenius.kr/trends/unsubscribe/?token=v1_abc_signature',
        ...overrides
    });
}

test('builds personalized HTML and text with all twenty movement details and curated links', () => {
    const briefing = makeBriefing();
    assert.match(briefing.subject, /2026년 11월 2일/);
    assert.equal(briefing.selectedCategories[0], 'IT·컴퓨터');
    assert.equal((briefing.html.match(/<li /g) || []).length, 20);
    assert.match(briefing.html, /keyword &amp; 1/);
    assert.match(briefing.html, /▲ 1/);
    assert.match(briefing.html, /▼ 2/);
    assert.match(briefing.html, /NEW/);
    assert.doesNotMatch(briefing.html, /<script>/);
    assert.match(briefing.html, /https:\/\/blog\.gongzza\.com\/updates\/1/);
    assert.match(briefing.html, /<img class="today-read-image" src="https:\/\/blog\.gongzza\.com\/wp-content\/cover\.jpg" alt="BlogGenius 업데이트 안내" width="144"/);
    assert.match(briefing.html, /@media only screen and \(max-width:600px\)/);
    assert.match(briefing.html, /class="today-read-image-cell"/);
    assert.match(briefing.html, /class="today-read-content-cell"/);
    assert.match(briefing.html, /share-card\.svg/);
    assert.match(briefing.html, /unsubscribe\//);
    assert.match(briefing.text, /전체 트렌드 보기/);
    assert.match(briefing.text, /도전인생 · BlogGenius/);
    assert.match(briefing.html, /도전인생 · BlogGenius/);
    assert.match(briefing.text, /구독 취소/);
});

test('keeps the featured article excerpt concise for narrow email layouts', () => {
    const briefing = makeBriefing({
        edition: {
            ...edition,
            featured_post: { ...edition.featured_post, excerpt: '가'.repeat(400) }
        }
    });
    const excerpt = briefing.html.match(/class="today-read-excerpt"[^>]*>(.*?)<\/p>/)?.[1];
    assert.ok(excerpt);
    assert.equal(excerpt.length, 241);
    assert.ok(excerpt.endsWith('…'));
});

test('omits an unsafe article thumbnail URL while keeping the article card', () => {
    const briefing = makeBriefing({
        edition: {
            ...edition,
            featured_post: { ...edition.featured_post, imageUrl: 'http://blog.gongzza.com/cover.jpg' }
        }
    });
    assert.doesNotMatch(briefing.html, /src="http:\/\/blog\.gongzza\.com\/cover\.jpg"/);
    assert.match(briefing.html, /BlogGenius 업데이트 안내/);
    assert.match(briefing.html, /글 읽기/);
});

test('builds an unsubscribe-free Production canary with Production first-party links', () => {
    const briefing = makeBriefing({
        environment: 'production',
        edition: {
            ...edition,
            download_url: 'https://www.bloggenius.kr/download/',
            download_banner_url: 'https://www.bloggenius.kr/assets/share-card.svg'
        },
        trendsUrl: 'https://www.bloggenius.kr/trends/?date=2026-11-02',
        unsubscribeUrl: undefined,
        includeUnsubscribe: false
    });
    assert.match(briefing.html, /https:\/\/www\.bloggenius\.kr\/trends\//);
    assert.match(briefing.html, /https:\/\/www\.bloggenius\.kr\/download\//);
    assert.doesNotMatch(briefing.html, /unsubscribe/i);
    assert.doesNotMatch(briefing.text, /구독 취소/);
});

test('clearly labels canary email as an administrator test in the subject and body', () => {
    const briefing = makeBriefing({ isCanary: true, includeUnsubscribe: false, unsubscribeUrl: undefined });
    assert.match(briefing.subject, /^\[CANARY 테스트\]/);
    assert.match(briefing.text, /관리자 확인용 CANARY 테스트 메일 · 구독자 발송 아님/);
    assert.match(briefing.html, /관리자 확인용 CANARY 테스트 메일 · 구독자에게 발송되지 않았습니다\./);
});

test('orders increases by largest amount, then NEW, decreases closest to zero, then steady', () => {
    const rows = [
        { category: 'IT·컴퓨터', keyword: 'up-5', change_type: 'up', change_amount: 5, display_order: 1 },
        { category: 'IT·컴퓨터', keyword: 'down-5', change_type: 'down', change_amount: 5, display_order: 2 },
        { category: 'IT·컴퓨터', keyword: 'new', change_type: 'new', display_order: 3 },
        { category: 'IT·컴퓨터', keyword: 'up-44', change_type: 'up', change_amount: 44, display_order: 4 },
        { category: 'IT·컴퓨터', keyword: 'down-2', change_type: 'down', change_amount: 2, display_order: 5 },
        { category: 'IT·컴퓨터', keyword: 'down-100', change_type: 'down', change_amount: 100, display_order: 6 },
        { category: 'IT·컴퓨터', keyword: 'steady', change_type: 'steady', display_order: 7 },
        ...Array.from({ length: 13 }, (_, index) => ({
            category: 'IT·컴퓨터', keyword: `steady-${index}`, change_type: 'steady', display_order: index + 8
        }))
    ];
    const briefing = makeBriefing({ trends: rows });
    const positions = ['up-44', 'up-5', 'new', 'down-2', 'down-5', 'down-100', 'steady']
        .map((keyword) => briefing.text.indexOf(keyword));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    assert.equal((briefing.html.match(/<li /g) || []).length, 20);
});

test('rejects malformed dates, over-limit categories, incomplete trend rows, and cross-environment links', () => {
    assert.throws(() => makeBriefing({ trendDate: '2026-02-30' }), /date/i);
    assert.throws(() => makeBriefing({ categories: ['not-a-category'] }), /categories/i);
    assert.throws(() => makeBriefing({ categories: [
        'IT·컴퓨터', '건강·의학', '게임', '공연·전시', '교육·학문', '국내여행',
        '드라마', '만화·애니', '맛집', '문학·책', '미술·디자인'
    ] }), /categories/i);
    assert.throws(() => makeBriefing({ trends: trendsFor('IT·컴퓨터', 9) }), /incomplete/i);
    assert.throws(() => makeBriefing({ trendsUrl: 'https://www.bloggenius.kr/trends/' }), /links/i);
    assert.throws(() => makeBriefing({ unsubscribeUrl: 'https://evil.example/trends/unsubscribe/' }), /links/i);
});

test('rejects unsafe shared-edition links and content that is not ready', () => {
    assert.throws(() => makeBriefing({ edition: { ...edition, status: 'held' } }), /not ready/i);
    assert.throws(() => makeBriefing({ edition: { ...edition, download_url: 'javascript:alert(1)' } }), /links/i);
    assert.throws(() => makeBriefing({ edition: { ...edition, featured_post: { ...edition.featured_post, url: 'http://blog.gongzza.com/post' } } }), /links/i);
});
