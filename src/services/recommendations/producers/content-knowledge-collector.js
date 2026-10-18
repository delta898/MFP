const { normalizeKnowledgeSnapshot } = require('../../knowledge/contracts/snapshot');
const { buildContentNewsQueryPlan } = require('./content-query-plan');

const MAX_NEWS_QUERIES = 3;
const MAX_DIAGNOSTICS = 20;
const MIN_KOREAN_TITLE_CHARACTERS = 2;

function strictSnapshots(entries = [], kind, diagnostics, source) {
    const snapshots = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
        if (entry?.error || entry?.error_code) {
            if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ source, code: 'KNOWLEDGE_FETCH_FAILED' });
            continue;
        }
        try {
            snapshots.push(normalizeKnowledgeSnapshot(entry, { kind }));
        } catch (_error) {
            if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ source, code: 'KNOWLEDGE_SNAPSHOT_INVALID' });
        }
    }
    return snapshots;
}

function snapshotsHaveItems(snapshots = []) {
    return snapshots.some((snapshot) => Array.isArray(snapshot?.items) && snapshot.items.length > 0);
}

function hasKoreanTitle(value) {
    return (String(value || '').match(/[가-힣]/g) || []).length >= MIN_KOREAN_TITLE_CHARACTERS;
}

function filterKoreanNewsSnapshots(snapshots = []) {
    return (Array.isArray(snapshots) ? snapshots : []).map((snapshot) => ({
        ...snapshot,
        items: (Array.isArray(snapshot?.items) ? snapshot.items : []).filter((item) => hasKoreanTitle(item?.title))
    }));
}

function boundedObservationIds(value = []) {
    return Array.from(new Set((Array.isArray(value) ? value : [])
        .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
        .filter((item) => item && item.length <= 180)))
        .slice(0, 100);
}

function isPublishedOwnerQuery(query = {}) {
    return (Array.isArray(query.bases) ? query.bases : []).some((entry) =>
        entry?.lane === 'owner_activity' && entry?.basis?.stage === 'published');
}

function createContentKnowledgeCollector(options = {}) {
    const knowledgeRegistry = options.knowledgeRegistry || null;
    const now = typeof options.now === 'function' ? options.now : () => new Date();

    return {
        async collect(input = {}, context = {}) {
            const diagnostics = [];
            const supplied = Array.isArray(input.knowledge)
                ? input.knowledge
                : (Array.isArray(context.knowledge) ? context.knowledge : []);
            let trends = strictSnapshots(supplied.filter((entry) => entry?.kind === 'trends'), 'trends', diagnostics, 'trends');

            if (trends.length === 0 && knowledgeRegistry?.fetchForRoute) {
                try {
                    const fetched = await knowledgeRegistry.fetchForRoute('content_ideas', {
                        kind: 'trends',
                        purpose: 'content_ideas',
                        limit: 10
                    }, context);
                    trends = strictSnapshots(fetched, 'trends', diagnostics, 'trends');
                } catch (_error) {
                    diagnostics.push({ source: 'trends', code: 'KNOWLEDGE_FETCH_FAILED' });
                }
            }

            const queryPlan = buildContentNewsQueryPlan({ ...input, knowledge: trends }, context, { now });
            const serendipityMode = input.serendipity === true;
            const discoveryQueries = serendipityMode
                ? queryPlan.queries.filter((query) => query?.lane === 'discovery')
                : [];
            const ownerExpansionQueries = serendipityMode
                ? queryPlan.queries.filter(isPublishedOwnerQuery).slice(0, 1)
                : [];
            const queries = serendipityMode ? [] : queryPlan.queries.slice(0, MAX_NEWS_QUERIES);

            async function collectNaverNews(selectedQueries = queries) {
                return Promise.all(selectedQueries.slice(0, MAX_NEWS_QUERIES).map(async (query) => {
                    const queryDiagnostics = [];
                    if (!knowledgeRegistry?.fetchForRoute) return { query, snapshots: [], diagnostics: queryDiagnostics };
                    try {
                        const fetched = await knowledgeRegistry.fetchForRoute('recommendation_content_news', {
                            kind: 'news',
                            topic: query.topic,
                            purpose: 'content_ideas',
                            limit: 5
                        }, context);
                        const snapshots = strictSnapshots(fetched, 'news', queryDiagnostics, `news:${query.lane}`);
                        return {
                            query,
                            snapshots: serendipityMode ? filterKoreanNewsSnapshots(snapshots) : snapshots,
                            diagnostics: queryDiagnostics
                        };
                    } catch (_error) {
                        queryDiagnostics.push({ source: `news:${query.lane}`, code: 'KNOWLEDGE_FETCH_FAILED' });
                        return { query, snapshots: [], diagnostics: queryDiagnostics };
                    }
                }));
            }

            async function collectCorpus() {
                const corpusDiagnostics = [];
                if (!knowledgeRegistry?.fetchForRoute) return { snapshots: [], diagnostics: corpusDiagnostics };
                try {
                    const fetched = await knowledgeRegistry.fetchForRoute('recommendation_serendipity_corpus', {
                        kind: 'news',
                        purpose: 'serendipity',
                        exclude_ids: boundedObservationIds(input.recently_shown_ids),
                        limit: 9
                    }, context);
                    return {
                        snapshots: filterKoreanNewsSnapshots(
                            strictSnapshots(fetched, 'news', corpusDiagnostics, 'corpus')
                        ),
                        diagnostics: corpusDiagnostics
                    };
                } catch (_error) {
                    corpusDiagnostics.push({ source: 'corpus', code: 'KNOWLEDGE_FETCH_FAILED' });
                    return { snapshots: [], diagnostics: corpusDiagnostics };
                }
            }

            let collected = [];
            let corpusSnapshots = [];
            let corpusDiagnostics = [];
            let preferredNewsSource = '';
            let selectedNewsSource = '';
            if (!serendipityMode) {
                collected = await collectNaverNews();
            } else {
                const previousNewsSource = String(input?.previous_news_source || '').trim();
                const requestedNewsSource = String(input?.preferred_news_source || '').trim();
                preferredNewsSource = ['stored_corpus', 'query_news'].includes(requestedNewsSource)
                    ? requestedNewsSource
                    : previousNewsSource === 'stored_corpus'
                        ? 'query_news'
                        : 'stored_corpus';
                if (preferredNewsSource === 'stored_corpus') {
                    collected = await collectNaverNews(ownerExpansionQueries);
                    const corpus = await collectCorpus();
                    corpusSnapshots = corpus.snapshots;
                    corpusDiagnostics = corpus.diagnostics;
                    if (snapshotsHaveItems(corpusSnapshots)) selectedNewsSource = 'stored_corpus';
                    else {
                        const remaining = Math.max(0, MAX_NEWS_QUERIES - collected.length);
                        const discovery = await collectNaverNews(discoveryQueries.slice(0, remaining));
                        collected.push(...discovery);
                        if (discovery.some((entry) => snapshotsHaveItems(entry.snapshots))) selectedNewsSource = 'query_news';
                    }
                } else {
                    collected = await collectNaverNews([...ownerExpansionQueries, ...discoveryQueries]);
                    const discovery = collected.filter((entry) => entry?.query?.lane === 'discovery');
                    if (discovery.some((entry) => snapshotsHaveItems(entry.snapshots))) selectedNewsSource = 'query_news';
                    else {
                        const corpus = await collectCorpus();
                        corpusSnapshots = corpus.snapshots;
                        corpusDiagnostics = corpus.diagnostics;
                        if (snapshotsHaveItems(corpusSnapshots)) selectedNewsSource = 'stored_corpus';
                    }
                }
            }
            const newsDiagnostics = collected.flatMap((entry) => entry.diagnostics || []);
            diagnostics.push(...newsDiagnostics.slice(0, Math.max(0, MAX_DIAGNOSTICS - diagnostics.length)));
            diagnostics.push(...corpusDiagnostics.slice(0, Math.max(0, MAX_DIAGNOSTICS - diagnostics.length)));

            return {
                schema_version: 1,
                observed_at: new Date(now()).toISOString(),
                trends,
                query_plan: queryPlan,
                news_queries: collected.map(({ query, snapshots }) => ({ query, snapshots })),
                corpus_snapshots: corpusSnapshots,
                serendipity_news_preference: preferredNewsSource,
                serendipity_news_source: selectedNewsSource,
                diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS)
            };
        }
    };
}

module.exports = {
    MAX_NEWS_QUERIES,
    boundedObservationIds,
    createContentKnowledgeCollector,
    filterKoreanNewsSnapshots,
    hasKoreanTitle,
    isPublishedOwnerQuery,
    snapshotsHaveItems,
    strictSnapshots
};
