const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeHelpPayload } = require('./schema');
const { createSurfaceContentService, emptyHelpPayload } = require('./service');

function compactBlock(overrides = {}) {
    return {
        id: 'guide-install',
        kind: 'resource',
        presentation: 'compact_card',
        title: '설치 방법',
        icon: 'book',
        target_url: 'https://example.com/install',
        cta_label: '가이드 보기',
        disclosure: '',
        sort_order: 100,
        ...overrides
    };
}

test('Help surface normalizes guide regions and allows supporting resources', () => {
    const normalized = normalizeHelpPayload({
        schema_version: 1,
        policy_revision: 3,
        surface: 'help',
        generated_at: '2026-09-03T00:00:00.000Z',
        regions: {
            getting_started: { blocks: [compactBlock()] },
            writing: { blocks: [compactBlock({ id: 'guide-writing', title: '빠른 글 작성', sort_order: 200 })] },
            automation: { blocks: [] },
            supporting: {
                blocks: [compactBlock({
                    id: 'developer-support', kind: 'support', title: '개발자 응원하기',
                    icon: 'heart', target_url: 'https://example.com/support', sort_order: 300
                })]
            }
        }
    });

    assert.equal(normalized.surface, 'help');
    assert.equal(normalized.regions.getting_started.blocks[0].id, 'guide-install');
    assert.equal(normalized.regions.writing.blocks[0].title, '빠른 글 작성');
    assert.equal(normalized.regions.supporting.blocks[0].kind, 'support');
    assert.equal(normalized.regions.automation.blocks.length, 0);
});

test('Help surface rejects unsafe guide cards and an unrelated surface', () => {
    assert.equal(normalizeHelpPayload({ schema_version: 1, surface: 'dashboard', regions: {} }), null);
    const normalized = normalizeHelpPayload({
        schema_version: 1,
        surface: 'help',
        regions: {
            getting_started: { blocks: [compactBlock({ target_url: 'http://example.com/install' })] }
        }
    });

    assert.deepEqual(normalized.regions.getting_started.blocks, []);
});

test('Help service preserves the last valid catalog when refresh fails', async () => {
    let callCount = 0;
    const validPayload = {
        schema_version: 1,
        surface: 'help',
        regions: { getting_started: { blocks: [compactBlock()] } }
    };
    const service = createSurfaceContentService({
        cacheTtlMs: 0,
        appVersion: '0.4.1',
        logger: { warn() {}, debug() {} },
        provider: {
            async fetch(surface) {
                callCount += 1;
                assert.equal(surface, 'help');
                if (callCount === 1) return validPayload;
                throw new Error('temporary unavailable');
            },
            getStorageOrigin: () => 'https://example.supabase.co'
        }
    });

    const first = await service.getHelp();
    const second = await service.getHelp();
    assert.equal(first.regions.getting_started.blocks.length, 1);
    assert.deepEqual(second, first);
    assert.deepEqual(emptyHelpPayload().regions.supporting.blocks, []);
});
