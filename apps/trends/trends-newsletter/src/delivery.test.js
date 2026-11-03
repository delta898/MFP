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
        excerpt: '<script>alert(1)</script>새로운 기능을 소개합니다.'
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

test('builds personalized HTML and text with top ten movement details and curated links', () => {
    const briefing = makeBriefing();
    assert.match(briefing.subject, /2026년 11월 2일/);
    assert.equal(briefing.selectedCategories[0], 'IT·컴퓨터');
    assert.equal((briefing.html.match(/<li /g) || []).length, 10);
    assert.match(briefing.html, /keyword &amp; 1/);
    assert.match(briefing.html, /▲ 1/);
    assert.match(briefing.html, /▼ 2/);
    assert.match(briefing.html, /NEW/);
    assert.doesNotMatch(briefing.html, /<script>/);
    assert.match(briefing.html, /https:\/\/blog\.gongzza\.com\/updates\/1/);
    assert.match(briefing.html, /share-card\.svg/);
    assert.match(briefing.html, /unsubscribe\//);
    assert.match(briefing.text, /전체 트렌드 보기/);
    assert.match(briefing.text, /구독 취소/);
});

test('rejects malformed dates, categories, incomplete trend rows, and cross-environment links', () => {
    assert.throws(() => makeBriefing({ trendDate: '2026-02-30' }), /date/i);
    assert.throws(() => makeBriefing({ categories: ['not-a-category'] }), /categories/i);
    assert.throws(() => makeBriefing({ trends: trendsFor('IT·컴퓨터', 9) }), /incomplete/i);
    assert.throws(() => makeBriefing({ trendsUrl: 'https://www.bloggenius.kr/trends/' }), /links/i);
    assert.throws(() => makeBriefing({ unsubscribeUrl: 'https://evil.example/trends/unsubscribe/' }), /links/i);
});

test('rejects unsafe shared-edition links and content that is not ready', () => {
    assert.throws(() => makeBriefing({ edition: { ...edition, status: 'held' } }), /not ready/i);
    assert.throws(() => makeBriefing({ edition: { ...edition, download_url: 'javascript:alert(1)' } }), /links/i);
    assert.throws(() => makeBriefing({ edition: { ...edition, featured_post: { ...edition.featured_post, url: 'http://blog.gongzza.com/post' } } }), /links/i);
});
