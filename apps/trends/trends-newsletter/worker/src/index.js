import { WorkflowEntrypoint } from 'cloudflare:workers';
import { evaluateTrendsReadiness, getReadinessExpectations, readDevelopmentTrendRows, recordDevelopmentCollectionResult, validateDevelopmentTarget } from '../../src/readiness.js';
import { buildSharedEdition } from '../../src/edition.js';
import { generateSharedCopy } from '../../src/adapters/cloudflare-ai-gateway.js';
import { fetchFeaturedBlogPost } from '../../src/adapters/rss.js';
import { loadDevelopmentEdition, saveDevelopmentEdition, markDevelopmentEditionHeld } from '../../src/adapters/supabase-editions.js';

export class DailyTrendsReadinessWorkflow extends WorkflowEntrypoint {
    async run(event, step) {
        const target = validateDevelopmentTarget(this.env);
        const payload = event?.payload || {};
        const trendDate = String(payload.trendDate || '').trim();
        const expectations = getReadinessExpectations(this.env);
        const [year, month, day] = trendDate.split('-').map(Number);
        const parsedDate = new Date(Date.UTC(year, month - 1, day));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trendDate)
            || Number.isNaN(parsedDate.getTime())
            || parsedDate.toISOString().slice(0, 10) !== trendDate
            || payload.environment !== 'development'
            || payload.source !== 'naver_creator_advisor'
            || Number(payload.signalItemCount) !== expectations.categories.length * expectations.itemsPerCategory) {
            throw new Error('Collection completion signal has an invalid date, environment, or source.');
        }
        console.log(JSON.stringify({ event: 'collection_signal_received', environment: 'development', projectRef: target.projectRef, trendDate }));

        let result;
        try {
            const rows = await step.do('read-signaled-trends', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                timeout: '30 seconds'
            }, () => readDevelopmentTrendRows(this.env, trendDate));
            result = evaluateTrendsReadiness(rows, trendDate, expectations);
        } catch {
            result = {
                status: 'read_error', trendDate, expectedCategories: expectations.categories.length,
                expectedItemsPerCategory: expectations.itemsPerCategory,
                expectedTotal: expectations.categories.length * expectations.itemsPerCategory,
                uniqueTotal: 0, rawRows: 0, missingCategories: expectations.categories,
                incompleteCategories: {}, unexpectedCategories: [], invalidRows: 0
            };
        }

        const record = await step.do('persist-collection-state', {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds'
        }, () => recordDevelopmentCollectionResult(this.env, result));
        console.log(JSON.stringify({
            event: 'collection_state_recorded', environment: 'development', trendDate,
            collectionStatus: result.status === 'ready' ? 'complete' : result.status,
            uniqueTotal: result.uniqueTotal, workflowRecordId: record
        }));
        const collectionStatus = result.status === 'ready' ? 'complete' : result.status;
        if (collectionStatus !== 'complete') return { ...result, collectionStatus, editionStatus: 'not_started' };

        const existing = await step.do('load-shared-edition', {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds'
        }, () => loadDevelopmentEdition(this.env, trendDate));
        if (existing?.status === 'ready') {
            console.log(JSON.stringify({ event: 'shared_edition_reused', environment: 'development', trendDate }));
            return { ...result, collectionStatus, editionStatus: 'draft_ready', editionReused: true };
        }

        try {
            const post = await step.do('fetch-featured-blog-post', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                // Each of up to eight configured feeds may take 12 seconds.
                timeout: '2 minutes'
            }, () => fetchFeaturedBlogPost(this.env.NEWSLETTER_BLOG_FEEDS));
            const generated = await step.do('generate-shared-copy', {
                retries: { limit: 1, delay: '10 seconds', backoff: 'exponential' },
                timeout: '35 seconds'
            }, () => generateSharedCopy(this.env, trendDate));
            const edition = buildSharedEdition({
                trendDate,
                post,
                copy: generated.copy,
                model: generated.model,
                downloadUrl: this.env.NEWSLETTER_DOWNLOAD_URL,
                downloadBannerUrl: this.env.NEWSLETTER_DOWNLOAD_BANNER_URL
            });
            const saved = await step.do('persist-shared-edition', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                timeout: '30 seconds'
            }, () => saveDevelopmentEdition(this.env, edition));
            console.log(JSON.stringify({
                event: 'shared_edition_saved', environment: 'development', trendDate,
                editionStatus: saved?.status || 'ready', articleSource: edition.featuredPost.source,
                aiModel: edition.aiModel
            }));
            return { ...result, collectionStatus, editionStatus: saved?.status === 'held' ? 'held' : 'draft_ready', editionReused: false };
        } catch (error) {
            await step.do('record-shared-edition-failure', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                timeout: '30 seconds'
            }, () => markDevelopmentEditionHeld(this.env, trendDate, 'generation_failed'));
            console.error(JSON.stringify({ event: 'shared_edition_generation_failed', environment: 'development', trendDate, reason: error instanceof Error ? error.message : 'unknown_error' }));
            return { ...result, collectionStatus, editionStatus: 'held', editionError: 'generation_failed' };
        }
    }
}

export default {
    async fetch() {
        return Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
    }
};
