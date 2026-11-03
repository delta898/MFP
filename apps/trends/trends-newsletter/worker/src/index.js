import { WorkflowEntrypoint } from 'cloudflare:workers';
import { evaluateTrendsReadiness, getReadinessExpectations, readDevelopmentTrendRows, recordDevelopmentCollectionResult, validateDevelopmentTarget } from '../../src/readiness.js';
import { buildSharedEdition } from '../../src/edition.js';
import { generateSharedCopy } from '../../src/adapters/cloudflare-ai-gateway.js';
import { fetchFeaturedBlogPost } from '../../src/adapters/rss.js';
import { loadDevelopmentEdition, saveDevelopmentEdition, markDevelopmentEditionHeld } from '../../src/adapters/supabase-editions.js';
import { recordDevelopmentNewsletterAttempt } from '../../src/adapters/supabase-attempts.js';

export class DailyTrendsReadinessWorkflow extends WorkflowEntrypoint {
    async run(event, step) {
        const target = validateDevelopmentTarget(this.env);
        const payload = event?.payload || {};
        const trendDate = String(payload.trendDate || '').trim();
        const signalId = String(payload.signalId || '').trim().toLowerCase();
        const workflowId = String(event?.instanceId || '').trim();
        const expectations = getReadinessExpectations(this.env);
        const [year, month, day] = trendDate.split('-').map(Number);
        const parsedDate = new Date(Date.UTC(year, month - 1, day));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trendDate)
            || Number.isNaN(parsedDate.getTime())
            || parsedDate.toISOString().slice(0, 10) !== trendDate
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(signalId)
            || !workflowId
            || payload.environment !== 'development'
            || payload.source !== 'naver_creator_advisor'
            || Number(payload.signalItemCount) !== expectations.categories.length * expectations.itemsPerCategory) {
            throw new Error('Collection completion signal has an invalid date, environment, or source.');
        }
        console.log(JSON.stringify({ event: 'collection_signal_received', environment: 'development', projectRef: target.projectRef, trendDate, signalId, workflowId }));

        let result;
        try {
            const rows = await step.do('read-signaled-trends', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                timeout: '30 seconds'
            }, () => readDevelopmentTrendRows(this.env, trendDate));
            result = evaluateTrendsReadiness(rows, trendDate, expectations);
        } catch (error) {
            result = {
                status: 'read_error', trendDate, expectedCategories: expectations.categories.length,
                expectedItemsPerCategory: expectations.itemsPerCategory,
                expectedTotal: expectations.categories.length * expectations.itemsPerCategory,
                uniqueTotal: 0, rawRows: 0, missingCategories: expectations.categories,
                incompleteCategories: {}, unexpectedCategories: [], invalidRows: 0,
                errorCode: 'collection_read_failed'
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
        if (collectionStatus !== 'complete') {
            const status = collectionStatus === 'read_error' ? 'failed' : 'completed';
            await step.do('persist-newsletter-attempt', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
            }, () => recordDevelopmentNewsletterAttempt(this.env, {
                signalId, workflowId, trendDate, status, collectionStatus,
                editionStatus: 'not_started', collectionReport: result,
                errorCode: result.errorCode || null
            }));
            return { ...result, collectionStatus, editionStatus: 'not_started' };
        }

        await step.do('persist-newsletter-attempt', {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
        }, () => recordDevelopmentNewsletterAttempt(this.env, {
            signalId, workflowId, trendDate, status: 'running', collectionStatus,
            editionStatus: 'drafting', collectionReport: result
        }));

        try {
            const existing = await step.do('load-shared-edition', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                timeout: '30 seconds'
            }, () => loadDevelopmentEdition(this.env, trendDate));
            const regenerate = String(this.env.NEWSLETTER_REGENERATE_ON_SIGNAL).trim().toLowerCase() === 'true';
            if (existing?.status === 'ready' && !regenerate) {
                await step.do('complete-newsletter-attempt-reused', {
                    retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
                }, () => recordDevelopmentNewsletterAttempt(this.env, {
                    signalId, workflowId, trendDate, status: 'completed', collectionStatus,
                    editionStatus: 'draft_ready', collectionReport: result, editionSnapshot: existing
                }));
                console.log(JSON.stringify({ event: 'shared_edition_reused', environment: 'development', trendDate, signalId }));
                return { ...result, collectionStatus, editionStatus: 'draft_ready', editionReused: true };
            }

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
                signalId, editionStatus: saved?.status || 'ready', articleSource: edition.featuredPost.source,
                aiModel: edition.aiModel
            }));
            await step.do('complete-newsletter-attempt', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
            }, () => recordDevelopmentNewsletterAttempt(this.env, {
                signalId, workflowId, trendDate, status: 'completed', collectionStatus,
                editionStatus: saved?.status === 'held' ? 'held' : 'draft_ready',
                collectionReport: result, editionSnapshot: saved,
                errorCode: saved?.status === 'held' ? 'generation_failed' : null
            }));
            return { ...result, collectionStatus, editionStatus: saved?.status === 'held' ? 'held' : 'draft_ready', editionReused: false };
        } catch (error) {
            let editionSnapshot = null;
            try {
                editionSnapshot = await step.do('record-shared-edition-failure', {
                    retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                    timeout: '30 seconds'
                }, () => markDevelopmentEditionHeld(this.env, trendDate, 'generation_failed'));
            } catch (holdError) {
                console.error(JSON.stringify({ event: 'shared_edition_hold_write_failed', environment: 'development', trendDate, signalId, reason: holdError instanceof Error ? holdError.message : 'unknown_error' }));
            }
            await step.do('hold-newsletter-attempt', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
            }, () => recordDevelopmentNewsletterAttempt(this.env, {
                signalId, workflowId, trendDate, status: 'held', collectionStatus,
                editionStatus: 'held', collectionReport: result,
                editionSnapshot, errorCode: 'generation_failed'
            }));
            console.error(JSON.stringify({ event: 'shared_edition_generation_failed', environment: 'development', trendDate, signalId, reason: error instanceof Error ? error.message : 'unknown_error' }));
            return { ...result, collectionStatus, editionStatus: 'held', editionError: 'generation_failed' };
        }
    }
}

export default {
    async fetch() {
        return Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
    }
};
