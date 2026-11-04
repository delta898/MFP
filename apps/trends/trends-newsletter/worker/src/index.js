import { WorkflowEntrypoint } from 'cloudflare:workers';
import { evaluateTrendsReadiness, getReadinessExpectations, readDevelopmentTrendRows, recordDevelopmentCollectionResult, validateDevelopmentTarget } from '../../src/readiness.js';
import { buildSharedEdition } from '../../src/edition.js';
import { fetchFeaturedBlogPost } from '../../src/adapters/rss.js';
import { loadDevelopmentEdition, saveDevelopmentEdition, markDevelopmentEditionHeld } from '../../src/adapters/supabase-editions.js';
import { recordDevelopmentNewsletterAttempt } from '../../src/adapters/supabase-attempts.js';
import { beginDevelopmentDeliveryCampaign, deliverDevelopmentBatch, loadDevelopmentDeliveryContext } from '../../src/adapters/supabase-delivery.js';
import { formatCollectorRunSummary, sendTelegramSummary } from './telegram.js';

export class DailyTrendsReadinessWorkflow extends WorkflowEntrypoint {
    async run(event, step) {
        const target = validateDevelopmentTarget(this.env);
        const payload = event?.payload || {};
        const trendDate = String(payload.trendDate || '').trim();
        const signalId = String(payload.signalId || '').trim().toLowerCase();
        const runStatus = String(payload.runStatus || 'collected');
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
            || (payload.forceResend !== undefined && typeof payload.forceResend !== 'boolean')
            || !['collected', 'failed'].includes(runStatus)
            || (runStatus === 'collected' && Number(payload.signalItemCount) !== expectations.categories.length * expectations.itemsPerCategory)
            || (runStatus === 'failed' && (!payload.failureStage || !payload.failureSummary))) {
            throw new Error('Collection completion signal has an invalid date, environment, or source.');
        }
        if (payload.forceResend === true && String(this.env.NEWSLETTER_RESEND_ENABLED || '').trim().toLowerCase() !== 'true') {
            throw new Error('Explicit newsletter resend is disabled in this environment.');
        }
        console.log(JSON.stringify({ event: 'collection_signal_received', environment: 'development', projectRef: target.projectRef, trendDate, signalId, workflowId }));

        const notify = async ({ status, stage, error, delivery }) => {
            const summary = formatCollectorRunSummary({ environment: 'development', trendDate, runId: signalId, status, stage, error, delivery });
            try {
                await step.do('send-telegram-run-summary', { retries: { limit: 0 }, timeout: '15 seconds' }, () => sendTelegramSummary(this.env, summary));
                console.log(JSON.stringify({ event: 'telegram_run_summary_sent', environment: 'development', trendDate, signalId }));
            } catch (notifyError) {
                console.error(JSON.stringify({ event: 'telegram_run_summary_failed', environment: 'development', trendDate, signalId, reason: notifyError instanceof Error ? notifyError.message : 'unknown_error' }));
            }
        };
        if (runStatus === 'failed') {
            await notify({ status: 'failure', stage: payload.failureStage, error: payload.failureSummary });
            return { collectorStatus: 'failed', failureStage: payload.failureStage };
        }

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
            await notify({ status: 'failure', stage: 'collection_validation', error: `수집 데이터 검증 실패 (${collectionStatus}, ${result.uniqueTotal}/${result.expectedTotal})` });
            return { ...result, collectionStatus, editionStatus: 'not_started' };
        }

        await step.do('persist-newsletter-attempt', {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
        }, () => recordDevelopmentNewsletterAttempt(this.env, {
            signalId, workflowId, trendDate, status: 'running', collectionStatus,
            editionStatus: 'drafting', collectionReport: result
        }));

        let editionSnapshot = null;
        let editionReused = false;
        try {
            const deliveryContext = await step.do('load-delivery-context', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                timeout: '30 seconds'
            }, () => loadDevelopmentDeliveryContext(this.env, trendDate));
            const existing = deliveryContext?.edition || await step.do('load-shared-edition', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                timeout: '30 seconds'
            }, () => loadDevelopmentEdition(this.env, trendDate));
            const regenerate = String(this.env.NEWSLETTER_REGENERATE_ON_SIGNAL).trim().toLowerCase() === 'true';
            const deliveryAlreadyStarted = deliveryContext?.run?.delivery_status !== undefined
                && deliveryContext.run.delivery_status !== 'not_started';
            if (existing?.status === 'ready' && (!regenerate || deliveryAlreadyStarted)) {
                editionSnapshot = existing;
                editionReused = true;
                console.log(JSON.stringify({ event: 'shared_edition_reused', environment: 'development', trendDate, signalId }));
            } else {
                const post = await step.do('fetch-featured-blog-post', {
                    retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                    // Each of up to eight configured feeds may take 12 seconds.
                    timeout: '2 minutes'
                }, () => fetchFeaturedBlogPost(this.env.NEWSLETTER_BLOG_FEEDS));
                const edition = buildSharedEdition({
                    trendDate,
                    post,
                    downloadUrl: this.env.NEWSLETTER_DOWNLOAD_URL,
                    downloadBannerUrl: this.env.NEWSLETTER_DOWNLOAD_BANNER_URL
                });
                editionSnapshot = await step.do('persist-shared-edition', {
                    retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
                    timeout: '30 seconds'
                }, () => saveDevelopmentEdition(this.env, edition));
                console.log(JSON.stringify({
                    event: 'shared_edition_saved', environment: 'development', trendDate,
                    signalId, editionStatus: editionSnapshot?.status || 'ready', articleSource: edition.featuredPost.source,
                    copySource: 'static_template'
                }));
            }
            if (editionSnapshot?.status !== 'ready') throw new Error('shared_edition_not_ready');
        } catch (error) {
            let heldSnapshot = null;
            try {
                heldSnapshot = await step.do('record-shared-edition-failure', {
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
                editionSnapshot: heldSnapshot, errorCode: 'generation_failed'
            }));
            console.error(JSON.stringify({ event: 'shared_edition_generation_failed', environment: 'development', trendDate, signalId, reason: error instanceof Error ? error.message : 'unknown_error' }));
            await notify({ status: 'failure', stage: 'edition_generation', error: '뉴스레터 에디션 생성에 실패했습니다.' });
            return { ...result, collectionStatus, editionStatus: 'held', editionError: 'generation_failed' };
        }

        try {
            const campaign = await step.do('allocate-newsletter-delivery-revision', {
                retries: { limit: 1, delay: '5 seconds', backoff: 'exponential' },
                timeout: '30 seconds'
            }, () => beginDevelopmentDeliveryCampaign(this.env, trendDate, signalId, payload.forceResend === true));
            if (!campaign.shouldDeliver) {
                await step.do('complete-already-processed-newsletter-attempt', {
                    retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
                }, () => recordDevelopmentNewsletterAttempt(this.env, {
                    signalId, workflowId, trendDate, status: 'completed', collectionStatus,
                    editionStatus: 'draft_ready', collectionReport: result, editionSnapshot
                }));
                console.log(JSON.stringify({
                    event: 'newsletter_delivery_already_processed', environment: 'development',
                    trendDate, signalId, deliveryRevision: campaign.deliveryRevision
                }));
                await notify({ status: 'success', delivery: { status: 'already_processed', sent: 0, failed: 0, held: 0, skipped: 0 } });
                return {
                    ...result, collectionStatus, editionStatus: 'draft_ready', editionReused,
                    deliveryStatus: 'already_processed', deliveryRevision: campaign.deliveryRevision,
                    deliverySummary: null
                };
            }
            const deliveryRevision = campaign.deliveryRevision;
            console.log(JSON.stringify({
                event: 'newsletter_delivery_revision_allocated', environment: 'development', trendDate,
                signalId, deliveryRevision, forceResend: campaign.forceResend
            }));
            let cursor = null;
            let finalDelivery = { status: 'sending', sent: 0, held: 0, failed: 0, skipped: 0, sending: 0 };
            let batchCount = 0;
            while (batchCount < 200) {
                const batch = await step.do(`deliver-recipient-batch-${batchCount + 1}`, {
                    retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
                    timeout: '2 minutes'
                }, () => deliverDevelopmentBatch(this.env, trendDate, deliveryRevision, cursor));
                finalDelivery = batch.delivery;
                console.log(JSON.stringify({
                    event: 'recipient_delivery_batch_completed', environment: 'development', trendDate,
                    batch: batchCount + 1, deliveryRevision, status: batch.delivery.status,
                    sent: batch.delivery.sent, held: batch.delivery.held,
                    failed: batch.delivery.failed, skipped: batch.delivery.skipped
                }));
                batchCount += 1;
                if (!batch.hasMore) break;
                cursor = batch.nextCursor;
            }
            if (batchCount >= 200 && finalDelivery.status === 'sending') throw new Error('recipient_delivery_batch_limit_reached');

            const attemptStatus = finalDelivery.status === 'failed' ? 'failed'
                : ['held', 'sending'].includes(finalDelivery.status) ? 'held' : 'completed';
            await step.do('complete-newsletter-attempt-after-delivery', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
            }, () => recordDevelopmentNewsletterAttempt(this.env, {
                signalId, workflowId, trendDate, status: attemptStatus, collectionStatus,
                editionStatus: 'draft_ready', collectionReport: result, editionSnapshot,
                errorCode: attemptStatus === 'completed' ? null : 'attempt_failed'
            }));
            await notify({
                status: attemptStatus === 'completed' && Number(finalDelivery.failed || 0) === 0
                    && Number(finalDelivery.held || 0) === 0 && Number(finalDelivery.sending || 0) === 0 ? 'success' : 'failure',
                stage: attemptStatus === 'completed' && Number(finalDelivery.failed || 0) === 0
                    && Number(finalDelivery.held || 0) === 0 && Number(finalDelivery.sending || 0) === 0 ? null : 'email_delivery',
                error: attemptStatus === 'completed' && Number(finalDelivery.failed || 0) === 0
                    && Number(finalDelivery.held || 0) === 0 && Number(finalDelivery.sending || 0) === 0 ? null : `메일 발송 상태: ${finalDelivery.status}`,
                delivery: finalDelivery
            });
            return {
                ...result,
                collectionStatus,
                editionStatus: 'draft_ready',
                editionReused,
                deliveryStatus: finalDelivery.status,
                deliveryRevision,
                deliverySummary: finalDelivery
            };
        } catch (error) {
            await step.do('record-recipient-delivery-failure', {
                retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds'
            }, () => recordDevelopmentNewsletterAttempt(this.env, {
                signalId, workflowId, trendDate, status: 'failed', collectionStatus,
                editionStatus: 'draft_ready', collectionReport: result, editionSnapshot,
                errorCode: 'attempt_failed'
            }));
            console.error(JSON.stringify({
                event: 'recipient_delivery_failed', environment: 'development', trendDate, signalId,
                reason: error instanceof Error ? error.message : 'unknown_error'
            }));
            await notify({ status: 'failure', stage: 'email_delivery', error: '메일 발송 Workflow 처리에 실패했습니다.' });
            throw error;
        }
    }
}

export default {
    fetch() {
        return Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
    }
};
