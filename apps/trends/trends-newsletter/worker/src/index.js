import { WorkflowEntrypoint } from 'cloudflare:workers';
import { evaluateTrendsReadiness, getReadinessExpectations, readDevelopmentTrendRows, recordDevelopmentCollectionResult, validateDevelopmentTarget } from '../../src/readiness.js';

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
        return { ...result, collectionStatus: result.status === 'ready' ? 'complete' : result.status };
    }
}

export default {
    async fetch() {
        return Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
    }
};
