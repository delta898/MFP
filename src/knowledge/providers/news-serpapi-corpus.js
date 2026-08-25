const DEFAULT_PROVIDER_ID = 'serpapi-corpus';
const DEFAULT_LANES = Object.freeze([
    'headlines_kr', 'headlines_global', 'technology', 'business', 'science',
    'culture_lifestyle', 'travel_local'
]);

function createDefaultSerpApiCorpusDefinition() {
    return {
        id: DEFAULT_PROVIDER_ID,
        kind: 'news',
        transport: 'server_gateway',
        enabled: true,
        label: 'SerpApi News Corpus',
        config: {
            purpose: 'serendipity',
            lanes: [...DEFAULT_LANES],
            locales: ['ko-KR', 'en-US'],
            countries: ['KR', 'US'],
            limit: 12
        }
    };
}

module.exports = {
    DEFAULT_LANES,
    DEFAULT_PROVIDER_ID,
    createDefaultSerpApiCorpusDefinition
};
