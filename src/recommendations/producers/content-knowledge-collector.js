const { normalizeKnowledgeSnapshot } = require('../../knowledge/contracts/snapshot');
const { buildContentNewsQueryPlan } = require('./content-query-plan');

const MAX_NEWS_QUERIES = 3;
const MAX_DIAGNOSTICS = 20;

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

function boundedObservationIds(value = []) {
    return Array.from(new Set((Array.isArray(value) ? value : [])
        .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
        .filter((item) => item && item.length <= 180)))
        .slice(0, 100);
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
            const newsEligibleQueries = serendipityMode
                ? queryPlan.queries.filter((query) => query?.lane === 'discovery')
                : queryPlan.queries;
            const queries = newsEligibleQueries.slice(0, MAX_NEWS_QUERIES);

            async function collectNaverNews() {
                return Promise.all(queries.map(async (query) => {
                    const queryDiagnostics = [];
                    if (!knowledgeRegistry?.fetchForRoute) return { query, snapshots: [], diagnostics: queryDiagnostics };
                    try {
                        const fetched = await knowledgeRegistry.fetchForRoute('recommendation_content_news', {
                            kind: 'news',
                            topic: query.topic,
                            purpose: 'content_ideas',
                            limit: 5
                        }, context);
                        return {
                            query,
                            snapshots: strictSnapshots(fetched, 'news', queryDiagnostics, `news:${query.lane}`),
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
                        snapshots: strictSnapshots(fetched, 'news', corpusDiagnostics, 'corpus'),
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
                const rawNewsOffset = Number.parseInt(input?.discovery_offsets?.news ?? input.discovery_offset, 10);
                const newsOffset = Number.isFinite(rawNewsOffset) ? Math.max(0, rawNewsOffset) : 0;
                preferredNewsSource = newsOffset % 2 === 0 ? 'stored_corpus' : 'query_news';
                if (preferredNewsSource === 'stored_corpus') {
                    const corpus = await collectCorpus();
                    corpusSnapshots = corpus.snapshots;
                    corpusDiagnostics = corpus.diagnostics;
                    if (snapshotsHaveItems(corpusSnapshots)) selectedNewsSource = 'stored_corpus';
                    else {
                        collected = await collectNaverNews();
                        if (collected.some((entry) => snapshotsHaveItems(entry.snapshots))) selectedNewsSource = 'query_news';
                    }
                } else {
                    collected = await collectNaverNews();
                    if (collected.some((entry) => snapshotsHaveItems(entry.snapshots))) selectedNewsSource = 'query_news';
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
    snapshotsHaveItems,
    strictSnapshots
};
