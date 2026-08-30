const { createApiError } = require('../errors');
const { TOPIC_STATUS } = require('../../continuous-publishing/contract');
const { buildTopicSheetRow } = require('../../continuous-publishing/topic-capture');

function createContinuousPublishingService(deps = {}) {
    const { Utils, ensureSheetsReadyForUi, executeBlogRowAction } = deps;
    let runnerPromise = null;
    let runnerState = {
        state: 'idle',
        message: '실행 대기 중',
        rowIndex: null,
        rowNumber: null,
        subject: '',
        resultStatus: '',
        startedAt: '',
        finishedAt: ''
    };

    function updateRunnerState(patch = {}) {
        runnerState = { ...runnerState, ...patch };
        return { ...runnerState };
    }

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
        },

        startNextReadyTopic(requestBody = {}) {
            if (runnerPromise) {
                throw createApiError(409, 'CONTINUOUS_RUNNER_BUSY', '이미 다음 글감을 처리하고 있습니다.');
            }
            if (typeof executeBlogRowAction !== 'function') {
                throw createApiError(500, 'CONTINUOUS_RUNNER_UNAVAILABLE', '연속 발행 실행기를 준비하지 못했습니다.');
            }

            const headless = requestBody.headless !== false;
            const startedAt = new Date().toISOString();
            updateRunnerState({
                state: 'selecting',
                message: '다음 발행 준비 글감을 확인하고 있습니다.',
                rowIndex: null,
                rowNumber: null,
                subject: '',
                resultStatus: '',
                startedAt,
                finishedAt: ''
            });

            runnerPromise = (async () => {
                try {
                    await ensureSheetsReadyForUi();
                    const queue = await Utils.readGoogleSheetTopicsAll({
                        status: TOPIC_STATUS.READY,
                        limit: 1,
                        offset: 0,
                        sortBy: 'rowNumber',
                        sortDir: 'asc'
                    });
                    const topic = Array.isArray(queue?.items) ? queue.items[0] : null;
                    if (!topic || !Number.isInteger(Number(topic.rowIndex))) {
                        updateRunnerState({
                            state: 'empty',
                            message: '발행 준비된 글감이 없습니다.',
                            finishedAt: new Date().toISOString()
                        });
                        return;
                    }

                    const rowIndex = Number(topic.rowIndex);
                    updateRunnerState({
                        state: 'running',
                        message: '글감을 생성하고 발행하고 있습니다.',
                        rowIndex,
                        rowNumber: Number(topic.rowNumber || rowIndex + 2),
                        subject: String(topic.subject || topic.keywordsRaw || '제목 없는 글감')
                    });

                    const result = await executeBlogRowAction(
                        { action: 'batch', rowIndex, headless, requireReadyStatus: true },
                        {
                            manualTrigger: true,
                            isAutoCycle: false,
                            isLast: true,
                            operationId: `continuous-publishing:row-${rowIndex}`,
                            onProgress: (message) => updateRunnerState({ message: String(message || '처리 중') })
                        }
                    );
                    Utils.clearSheetCache('topics');
                    if (!result?.success) {
                        updateRunnerState({
                            state: 'failed',
                            message: result?.message || '글감 실행에 실패했습니다.',
                            resultStatus: result?.code || 'FAILED',
                            finishedAt: new Date().toISOString()
                        });
                        return;
                    }
                    updateRunnerState({
                        state: 'completed',
                        message: '다음 글감 한 건을 처리했습니다.',
                        resultStatus: result?.data?.status || '',
                        finishedAt: new Date().toISOString()
                    });
                } catch (error) {
                    updateRunnerState({
                        state: 'failed',
                        message: error.message || '연속 발행 실행 중 오류가 발생했습니다.',
                        resultStatus: error.apiCode || error.code || 'CONTINUOUS_RUNNER_FAILED',
                        finishedAt: new Date().toISOString()
                    });
                } finally {
                    runnerPromise = null;
                }
            })();

            return { accepted: true, ...runnerState };
        },

        getRunnerStatus() {
            return { ...runnerState, busy: runnerPromise !== null };
        }
    };
}

module.exports = {
    createContinuousPublishingService
};
