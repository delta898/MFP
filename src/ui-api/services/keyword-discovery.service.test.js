const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeywordDiscoveryService } = require('./keyword-discovery.service');

test('collects raw discovery seeds before querying the existing keyword research service', async () => {
    let received = null;
    const service = createKeywordDiscoveryService({
        eventStore: { getLocalOwnerIdentity: () => ({ owner_user_id: 'owner-1' }) },
        retrievalService: {
            async buildContextPacket(input) {
                assert.equal(input.ownerUserId, 'owner-1');
                return {
                    owner_memory: {
                        profile: {
                            interests: { keywords: [{ value: '관심 키워드' }] },
                            activity: { recent_subjects: [{ subject: '최근 발행 글', stage: 'published' }] }
                        }
                    }
                };
            }
        },
        knowledgeRegistry: {
            async fetchForRoute(route, query) {
                assert.equal(route, 'content_ideas');
                assert.equal(query.kind, 'trends');
                return [{ kind: 'trends', items: [{ title: '최신 트렌드' }] }];
            }
        },
        keywordResearchService: {
            async analyze(input) {
                received = input;
                return {
                    input_keywords: input.keywords.map((keyword) => ({ keyword, is_input_keyword: true })),
                    related_candidates: []
                };
            }
        }
    });

    const result = await service.explore({ requestId: 'request-1' });
    assert.deepEqual(received.keywords, ['최신 트렌드', '관심 키워드', '최근 발행 글']);
    assert.equal(result.input_keywords[0].discovery_source.source, 'trend');
    assert.equal(result.input_keywords[1].discovery_source.source, 'profile');
    assert.equal(result.input_keywords[2].discovery_source.source, 'activity');
});

test('uses direct input as a seed without loading trend or memory candidates', async () => {
    let analysisInput = null;
    const service = createKeywordDiscoveryService({
        knowledgeRegistry: { async fetchForRoute() { throw new Error('should not load trends'); } },
        retrievalService: { async buildContextPacket() { throw new Error('should not load memory'); } },
        keywordResearchService: {
            async analyze(input) {
                analysisInput = input;
                return { input_keywords: input.keywords.map((keyword) => ({ keyword })), related_candidates: [] };
            }
        }
    });

    const result = await service.explore({ keywords: '서현역 고기집, 단체 모임' });
    assert.deepEqual(analysisInput.keywords, ['서현역 고기집', '단체 모임']);
    assert.equal(result.discovery_mode, 'search');
    assert.equal(result.input_keywords[0].discovery_source.source_label, '직접 검색');
});
