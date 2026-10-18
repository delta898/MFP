const DEFAULT_PROVIDER_ID = 'naver-news';

function createDefaultNaverNewsDefinition() {
    return {
        id: DEFAULT_PROVIDER_ID,
        kind: 'news',
        transport: 'server_gateway',
        enabled: true,
        label: 'Naver News Search',
        config: {
            purpose: 'content_ideas',
            locale: 'ko-KR',
            country: 'KR',
            limit: 10
        }
    };
}

module.exports = {
    DEFAULT_PROVIDER_ID,
    createDefaultNaverNewsDefinition
};
