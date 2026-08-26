const DEFAULT_PROVIDER_ID = 'serpapi-corpus';
const DEFAULT_LANES = Object.freeze([
    'headlines_kr', 'technology', 'business', 'science',
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
            locales: ['ko-KR'],
            countries: ['KR'],
            limit: 12
        }
    };
}

module.exports = {
    DEFAULT_LANES,
    DEFAULT_PROVIDER_ID,
    createDefaultSerpApiCorpusDefinition
};
