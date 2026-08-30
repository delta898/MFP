const { createApiError } = require('../errors');
const { TOPIC_STATUS } = require('../../continuous-publishing/contract');
const { buildTopicSheetRow } = require('../../continuous-publishing/topic-capture');

function createContinuousPublishingService(deps = {}) {
    const { Utils, ensureSheetsReadyForUi } = deps;

    return {
        async captureTopic(requestBody = {}) {
            const action = String(requestBody.action || '').trim();
            if (!['save', 'enqueue'].includes(action)) {
                throw createApiError(400, 'TOPIC_CAPTURE_ACTION_INVALID', '글감 저장 방식을 확인해 주세요.');
            }
            const ready = action === 'enqueue';
            let row;
            try {
                row = buildTopicSheetRow(requestBody, { ready });
            } catch (error) {
                throw createApiError(400, error.code || 'TOPIC_CAPTURE_INVALID', error.message, error.details);
            }

            await ensureSheetsReadyForUi();
            const result = await Utils.appendGoogleSheetTopics([row], {
                defaultStatus: row.status,
                postAppendDelayMs: 0
            });
            if (!result?.success) {
                throw createApiError(400, 'TOPIC_CAPTURE_FAILED', result?.message || '글감을 저장하지 못했습니다.');
            }

            return {
                action,
                status: row.status,
                rowNumber: Array.isArray(result.rowNumbers) ? result.rowNumbers[0] ?? null : null,
                rowIndex: Array.isArray(result.rowIndices) ? result.rowIndices[0] ?? null : null
            };
        },

        async getReadyQueue({ searchParams } = {}) {
            await ensureSheetsReadyForUi();
            const requestedLimit = Number.parseInt(String(searchParams?.get('limit') || '50'), 10);
            const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
            return Utils.readGoogleSheetTopicsAll({
                status: TOPIC_STATUS.READY,
                limit,
                offset: 0,
                sortBy: 'rowNumber',
                sortDir: 'asc'
            });
        }
    };
}

module.exports = {
    createContinuousPublishingService
};
