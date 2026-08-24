const { normalizeKnowledgeSnapshot } = require('../../knowledge/contracts/snapshot');
const { buildContentNewsQueryPlan } = require('./content-query-plan');

const MAX_NEWS_QUERIES = 3;
const MAX_DIAGNOSTICS = 20;

function strictSnapshots(entries = [], kind, diagnostics, source) {
    const snapshots = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
        try {
            snapshots.push(normalizeKnowledgeSnapshot(entry, { kind }));
        } catch (_error) {
            if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ source, code: 'KNOWLEDGE_SNAPSHOT_INVALID' });
        }
    }
    return snapshots;
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
            const newsEligibleQueries = input.serendipity === true
                ? queryPlan.queries.filter((query) => query?.lane === 'discovery')
                : queryPlan.queries;
            const queries = newsEligibleQueries.slice(0, MAX_NEWS_QUERIES);
            const collected = await Promise.all(queries.map(async (query) => {
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
            const newsDiagnostics = collected.flatMap((entry) => entry.diagnostics || []);
            diagnostics.push(...newsDiagnostics.slice(0, Math.max(0, MAX_DIAGNOSTICS - diagnostics.length)));

            return {
                schema_version: 1,
                observed_at: new Date(now()).toISOString(),
                trends,
                query_plan: queryPlan,
                news_queries: collected.map(({ query, snapshots }) => ({ query, snapshots })),
                diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS)
            };
        }
    };
}

module.exports = {
    MAX_NEWS_QUERIES,
    createContentKnowledgeCollector,
    strictSnapshots
};
