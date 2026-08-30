const { createApiError } = require('../errors');
const { TOPIC_STATUS } = require('../../continuous-publishing/contract');
const { buildTopicSheetRow } = require('../../continuous-publishing/topic-capture');

function createContinuousPublishingService(deps = {}) {
    const { Utils, ensureSheetsReadyForUi } = deps;

    function parseRowIndex(value) {
        const rowIndex = Number.parseInt(String(value), 10);
        if (!Number.isInteger(rowIndex) || rowIndex < 0) {
            throw createApiError(400, 'QUEUE_ROW_INVALID', '대기열 항목을 확인해 주세요.');
        }
        return rowIndex;
    }

    async function requireReadyQueueItem(rowIndex) {
        await ensureSheetsReadyForUi();
        const result = await Utils.readGoogleSheetTopicsAll({
            status: TOPIC_STATUS.READY,
            limit: 10000,
            offset: 0,
            sortBy: 'rowNumber',
            sortDir: 'asc'
        });
        const item = (Array.isArray(result?.items) ? result.items : [])
            .find(candidate => Number(candidate?.rowIndex) === rowIndex);
        if (!item) {
            throw createApiError(409, 'QUEUE_ITEM_NOT_READY', '이 글감은 더 이상 발행 대기 상태가 아닙니다. 대기열을 새로고침해 주세요.');
        }
        return item;
    }

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
        },

        async updateReadyTopic(requestBody = {}) {
            const rowIndex = parseRowIndex(requestBody.rowIndex);
            await requireReadyQueueItem(rowIndex);
            let row;
            try {
                row = buildTopicSheetRow(requestBody, { ready: true });
            } catch (error) {
                throw createApiError(400, error.code || 'QUEUE_PLAN_INVALID', error.message);
            }

            await Utils.updateGoogleSheetTopicEditableFields(rowIndex, {
                category: row.category,
                postStatus: row.postStatus,
                scheduleDate: row.scheduleDate,
                subject: row.subject,
                keywords: row.keywords,
                instruction: row.content_guide.additional_instructions,
                referenceUrl: row.content_guide.reference_urls,
                status: TOPIC_STATUS.READY,
                imageMode: row.image_options.mode,
                imageGeneration: row.image_options.generate,
                externalReference: row.use_external_ref,
                writingStrategy: row.writing_strategy,
                platforms: row.targets
            });
            Utils.clearSheetCache('topics');
            return { rowIndex, rowNumber: rowIndex + 2, status: TOPIC_STATUS.READY };
        },

        async removeReadyTopic(requestBody = {}) {
            const rowIndex = parseRowIndex(requestBody.rowIndex);
            await requireReadyQueueItem(rowIndex);
            await Utils.updateGoogleSheetStatus(
                rowIndex,
                TOPIC_STATUS.WAITING,
                '연속 발행 대기열에서 제외',
                { throwOnError: true }
            );
            Utils.clearSheetCache('topics');
            return { rowIndex, rowNumber: rowIndex + 2, status: TOPIC_STATUS.WAITING };
        }
    };
}

module.exports = {
    createContinuousPublishingService
};
