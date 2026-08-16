const { createKeywordResearchService } = require('../../keyword-research');
const { parseKeywords } = require('../../keyword-research/input');
const { collectKeywordDiscoverySeeds } = require('../../keyword-discovery/seed-collector');

function getOwnerUserId(eventStore) {
    const owner = eventStore && typeof eventStore.getLocalOwnerIdentity === 'function'
        ? eventStore.getLocalOwnerIdentity()
        : null;
    return String(owner?.owner_user_id || '').trim();
}

function decorateInputKeywords(analysis = {}, seeds = []) {
    const sourceByKey = new Map(seeds.map((seed) => [
        String(seed.keyword || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR'),
        seed
    ]));
    return {
        ...analysis,
        input_keywords: (Array.isArray(analysis.input_keywords) ? analysis.input_keywords : []).map((item) => {
            const key = String(item?.keyword || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
            const seed = sourceByKey.get(key);
            return seed ? { ...item, discovery_source: seed } : item;
        }),
        discovery_seeds: seeds
    };
}

function createKeywordDiscoveryService(options = {}) {
    const {
        knowledgeRegistry,
        retrievalService,
        eventStore,
        keywordResearchService = createKeywordResearchService(options)
    } = options;

    if (!knowledgeRegistry || typeof knowledgeRegistry.fetchForRoute !== 'function') {
        throw new Error('knowledgeRegistry is required');
    }
    if (!retrievalService || typeof retrievalService.buildContextPacket !== 'function') {
        throw new Error('retrievalService is required');
    }
    if (!keywordResearchService || typeof keywordResearchService.analyze !== 'function') {
        throw new Error('keywordResearchService is required');
    }

    return {
        async explore({ requestId, keywords, excludedKeywords } = {}) {
            const requestedKeywords = parseKeywords(keywords).slice(0, 3);
            const ownerUserId = getOwnerUserId(eventStore);
            const userId = ownerUserId || 'ui:local';
            let seeds;
            if (requestedKeywords.length > 0) {
                seeds = requestedKeywords.map((keyword) => ({
                    keyword,
                    source: 'search',
                    source_label: '직접 검색',
                    source_detail: '직접 입력한 키워드'
                }));
            } else {
                const memory = await retrievalService.buildContextPacket({
                    conversationId: 'ui:keyword-discovery',
                    userId,
                    ownerUserId,
                    limit: 12
                });
                const knowledge = await knowledgeRegistry.fetchForRoute('content_ideas', {
                    kind: 'trends',
                    limit: 8
                }, {
                    channel: 'ui',
                    requestId: String(requestId || ''),
                    user: { id: userId, channel: 'ui' },
                    memory
                });
                seeds = collectKeywordDiscoverySeeds({
                    knowledge,
                    ownerProfile: memory?.owner_memory?.profile,
                    excludedKeywords
                });
            }
            if (seeds.length === 0) {
                return {
                    input_keywords: [],
                    related_candidates: [],
                    candidate_pool_size: 0,
                    discovery_seeds: [],
                    discovery_mode: requestedKeywords.length > 0 ? 'search' : 'explore'
                };
            }
            const analysis = await keywordResearchService.analyze({
                subject: seeds[0].keyword,
                keywords: seeds.map((seed) => seed.keyword),
                related_assist: true
            });
            return {
                ...decorateInputKeywords(analysis, seeds),
                discovery_mode: requestedKeywords.length > 0 ? 'search' : 'explore'
            };
        }
    };
}

module.exports = {
    createKeywordDiscoveryService,
    decorateInputKeywords
};
