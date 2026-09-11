const { createApiError } = require('../errors');
const { TOPIC_STATUS } = require('../../continuous-publishing/contract');
const { buildTopicSheetRow } = require('../../continuous-publishing/topic-capture');
const { buildShoppingTopicSheetRow } = require('../../continuous-publishing/shopping-topic-capture');
const {
    createAutomationSettingsRepository,
    resolveAutomationSettingsPath,
    computeNextRunPreview,
    computeQueueRunProjections
} = require('../../continuous-publishing/automation-settings');
const { resolveRuntimeEffectPolicy } = require('../../environment/runtime-effects');
const { createContinuousPublishingScheduler } = require('../../continuous-publishing/scheduler');
const { resolveReadyQueueMove } = require('../../continuous-publishing/queue-order');
const { createBlogNextExecutionCoordinator } = require('../../blog-next/execution-coordinator');
const { buildDashboardBlogOperationsOverview } = require('../../dashboard/blog-operations-read-model');
const { buildDashboardBlogResultStats } = require('../../dashboard/blog-result-stats-read-model');
const { presentPublishingProgress, buildCompletionLinks } = require('../../continuous-publishing/presentation');
const {
    CONTENT_LIFECYCLE_KIND,
    createContentLifecycleAdapterRegistry,
    resolveDeliveryPlan
} = require('../../continuous-publishing/content-lifecycle-adapter');

function createContinuousPublishingService(deps = {}) {
    const { Utils, ensureSheetsReadyForUi, executeBlogRowAction, executeShoppingBatchRowsAction, executeBlogTopicsDelete, CONFIG = {}, fs, path, now, eventStore } = deps;
    const lifecycleAdapters = deps.lifecycleAdapters || createContentLifecycleAdapterRegistry({
        executeBlogRowAction,
        executeShoppingBatchRowsAction
    });
    const pathImpl = path || require('node:path');
    let automationSettingsRepository = deps.automationSettingsRepository || null;
    let automationScheduler = deps.automationScheduler || null;
    const blogNextExecutionCoordinator = deps.blogNextExecutionCoordinator
        || createBlogNextExecutionCoordinator({ now });
    let runnerPromise = null;
    let externalExecutionObserved = false;
    let runnerState = {
        state: 'idle',
        message: '실행 대기 중',
        rowIndex: null,
        rowNumber: null,
        subject: '',
        resultStatus: '',
        progressStage: '',
        completionLinks: [],
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

    function getAutomationSettingsRepository() {
        if (automationSettingsRepository) return automationSettingsRepository;
        automationSettingsRepository = createAutomationSettingsRepository({
            fs,
            path: pathImpl,
            filePath: resolveAutomationSettingsPath(CONFIG, pathImpl)
        });
        return automationSettingsRepository;
    }

    function getAutomationScheduler() {
        if (automationScheduler) return automationScheduler;
        automationScheduler = createContinuousPublishingScheduler({
            now,
            setTimeout: deps.setTimeout,
            clearTimeout: deps.clearTimeout,
            readSettings: () => getAutomationSettingsRepository().read().document,
            runOnce: () => runAutomaticReadyTopic()
        });
        return automationScheduler;
    }

    function getAutomationMode(policy) {
        if (policy.environment === 'local') return 'simulation';
        if (policy.environment === 'development' && policy.automatedDraft) return 'development_draft';
        if (policy.environment === 'production' && policy.automatedPublish) return 'production';
        return 'blocked';
    }

    function toAutomationSettingsResponse(result) {
        const policy = resolveRuntimeEffectPolicy(CONFIG);
        const configuredEnabled = result.document.enabled === true;
        const scheduler = getAutomationScheduler().getStatus();
        const nextRunAtPreview = scheduler.next_run_at || (configuredEnabled
            ? computeNextRunPreview(result.document, { now: typeof now === 'function' ? now() : new Date() })
            : null);
        const mode = getAutomationMode(policy);
        let status = 'disabled';
        if (configuredEnabled && mode === 'blocked') status = 'blocked_by_environment';
        else if (configuredEnabled) status = scheduler.state || 'scheduled';
        return {
            settings: result.document,
            source: result.source,
            warnings: result.warnings,
            runtime: {
                environment: policy.environment,
                environment_allows_automation: mode !== 'blocked',
                automation_mode: mode,
                effective_enabled: configuredEnabled && mode !== 'blocked',
                status,
                next_run_at_preview: nextRunAtPreview,
                scheduler
            }
        };
    }

    function addQueueSchedule(readyItems = []) {
        const automation = toAutomationSettingsResponse(getAutomationSettingsRepository().read());
        const { settings, runtime } = automation;
        const schedulerRunning = runtime.scheduler?.running === true;
        const firstRunAt = runtime.effective_enabled && !schedulerRunning
            ? (runtime.scheduler?.next_run_at || runtime.next_run_at_preview)
            : null;
        const projections = computeQueueRunProjections(settings, {
            firstRunAt,
            count: readyItems.length
        });
        return {
            items: readyItems.map((item, index) => ({
                ...item,
                processing_estimate_at: projections[index] || null
            })),
            automation_schedule: {
                enabled: settings.enabled === true,
                effective_enabled: runtime.effective_enabled === true,
                status: runtime.status,
                interval_minutes: settings.interval_minutes,
                next_processing_at: projections[0] || null,
                basis: 'current_queue_order'
            }
        };
    }

    function topicPostStatus(topic = {}) {
        return String(topic.postStatus || topic.options?.post_status || 'publish').trim().toLowerCase();
    }

    function escapeNotificationText(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function notifyAutomaticResult() {
        const settings = getAutomationSettingsRepository().read().document;
        if (settings.notification_enabled !== true) return;
        if (!['completed', 'failed', 'needs_attention'].includes(runnerState.state)) return;
        const message = `<b>[연속 발행 ${runnerState.state === 'completed' ? '완료' : '확인 필요'}]</b>\n- 글감: ${escapeNotificationText(runnerState.subject || '제목 없음')}\n- 결과: ${escapeNotificationText(runnerState.message)}`;
        const tasks = [];
        if (CONFIG.NOTIFY_TELEGRAM_ENABLED && typeof deps.TelegramService?.sendNotification === 'function') {
            tasks.push(deps.TelegramService.sendNotification(message, {
                botToken: CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN,
                chatId: CONFIG.NOTIFY_TELEGRAM_CHAT_ID,
                enabled: true
            }));
        }
        if (CONFIG.NOTIFY_SLACK_ENABLED && typeof deps.SlackService?.sendNotification === 'function') {
            tasks.push(deps.SlackService.sendNotification(message, {
                webhookUrl: CONFIG.NOTIFY_SLACK_WEBHOOK_URL,
                enabled: true
            }));
        }
        if (tasks.length > 0) await Promise.allSettled(tasks);
    }

    async function requireTopicInStatus(rowIndex, expectedStatus) {
        await ensureSheetsReadyForUi();
        Utils.clearSheetCache('topics');
        const result = await Utils.readGoogleSheetTopicsAll({
            status: expectedStatus,
            limit: 10000,
            offset: 0,
            sortBy: 'rowNumber',
            sortDir: 'asc'
        });
        const item = (Array.isArray(result?.items) ? result.items : [])
            .find(candidate => Number(candidate?.rowIndex) === rowIndex);
        if (!item) {
            const ready = expectedStatus === TOPIC_STATUS.READY;
            throw createApiError(
                409,
                ready ? 'QUEUE_ITEM_NOT_READY' : 'SAVED_TOPIC_NOT_WAITING',
                ready
                    ? '이 글감은 더 이상 발행 대기 상태가 아닙니다. 대기열을 새로고침해 주세요.'
                    : '이 글감은 더 이상 보관 상태가 아닙니다. 목록을 새로고침해 주세요.'
            );
        }
        return item;
    }

    function requireReadyQueueItem(rowIndex) {
        return requireTopicInStatus(rowIndex, TOPIC_STATUS.READY);
    }

    async function requireShoppingTopicInStatus(rowIndex, expectedStatus) {
        await ensureSheetsReadyForUi();
        Utils.clearSheetCache('shopping');
        const result = await Utils.readGoogleSheetShoppingAll({
            limit: 100000,
            offset: 0,
            sortBy: 'rowNumber',
            sortDir: 'asc'
        });
        const item = (Array.isArray(result?.items) ? result.items : [])
            .find((candidate) => Number(candidate?.rowIndex) === rowIndex
                && String(candidate?.status || '').trim() === expectedStatus);
        if (!item) {
            throw createApiError(409, 'SHOPPING_QUEUE_ITEM_NOT_READY', '이 쇼핑 글감은 더 이상 발행 준비 상태가 아닙니다. 대기열을 새로고침해 주세요.');
        }
        return item;
    }

    function requireRunnerIdle() {
        if (blogNextExecutionCoordinator.getStatus().busy) {
            throw createApiError(409, 'CONTINUOUS_RUNNER_BUSY', '다른 글감을 처리하는 동안에는 발행 대기열을 변경하거나 추가 실행할 수 없습니다.');
        }
    }

    async function startShoppingReadyTopic(requestBody = {}) {
        const rowIndex = parseRowIndex(requestBody.rowIndex);
        const shoppingLifecycleAdapter = lifecycleAdapters.get(CONTENT_LIFECYCLE_KIND.SHOPPING);
        if (!shoppingLifecycleAdapter) {
            throw createApiError(500, 'SHOPPING_LIFECYCLE_RUNNER_UNAVAILABLE', '쇼핑 글감 실행기를 준비하지 못했습니다.');
        }
        const executionLease = blogNextExecutionCoordinator.acquire({
            source: 'shopping_continuous_runner',
            subject: '쇼핑 글감 발행',
            message: '선택한 쇼핑 글감을 포스팅하고 있습니다.'
        });
        if (!executionLease) {
            throw createApiError(409, 'CONTINUOUS_RUNNER_BUSY', '다른 글감을 처리하는 동안에는 포스팅을 시작할 수 없습니다. 현재 실행이 끝난 뒤 다시 시도해 주세요.');
        }

        try {
            const topic = await requireShoppingTopicInStatus(rowIndex, '발행 준비 완료');
            const plan = resolveDeliveryPlan(topic);
            if (plan.targets.length === 0) {
                throw createApiError(400, 'SHOPPING_DELIVERY_TARGET_REQUIRED', '저장된 발행 대상이 없습니다. 글감을 수정해 발행 대상을 선택해 주세요.');
            }
            if (plan.postStatus === 'schedule' && !plan.scheduleDate) {
                throw createApiError(400, 'SHOPPING_SCHEDULE_REQUIRED', '예약 발행 일시를 확인해 주세요.');
            }

            const result = await shoppingLifecycleAdapter.execute({
                rowIndex,
                plan,
                execution: {
                    manual: true,
                    headless: requestBody.headless !== false,
                    operationId: `continuous-publishing:shopping-row-${rowIndex}`
                }
            });
            Utils.clearSheetCache('shopping');
            if (!result?.success) {
                throw createApiError(400, result?.code || 'SHOPPING_LIFECYCLE_EXECUTION_FAILED', result?.message || '쇼핑 글감 실행에 실패했습니다.');
            }
            return {
                ...result.data,
                rowIndex,
                rowNumber: Number(result?.data?.rowNumber || topic.rowNumber || rowIndex + 2),
                postStatus: plan.postStatus,
                targets: plan.targets
            };
        } finally {
            executionLease.release();
        }
    }

    function startRunner(requestBody = {}, execution = {}) {
        if (runnerPromise) {
            throw createApiError(409, 'CONTINUOUS_RUNNER_BUSY', '이미 다음 글감을 처리하고 있습니다.');
        }
        const blogLifecycleAdapter = lifecycleAdapters.get(CONTENT_LIFECYCLE_KIND.BLOG);
        if (!blogLifecycleAdapter && execution.simulation !== true) {
            throw createApiError(500, 'CONTINUOUS_RUNNER_UNAVAILABLE', '연속 발행 실행기를 준비하지 못했습니다.');
        }

        const executionLease = blogNextExecutionCoordinator.acquire({
            source: 'continuous_runner',
            subject: '발행 대기열',
            message: '발행 대기열의 글감을 처리하고 있습니다.'
        });
        if (!executionLease) {
            throw createApiError(409, 'CONTINUOUS_RUNNER_BUSY', '다른 블로그 작업을 처리하고 있습니다. 현재 실행이 끝난 뒤 다시 시도해 주세요.');
        }

        const headless = requestBody.headless !== false;
        const requestedRowIndex = requestBody.rowIndex === undefined || requestBody.rowIndex === null || requestBody.rowIndex === ''
            ? null
            : parseRowIndex(requestBody.rowIndex);
        const startedAt = new Date().toISOString();
        updateRunnerState({
            state: 'selecting',
            message: requestedRowIndex === null ? '다음 발행 준비 글감을 확인하고 있습니다.' : '선택한 발행 준비 글감을 확인하고 있습니다.',
            rowIndex: null,
            rowNumber: null,
            subject: '',
            resultStatus: '',
            progressStage: 'preparing',
            completionLinks: [],
            startedAt,
            finishedAt: ''
        });

        runnerPromise = (async () => {
            try {
                let topic;
                if (requestedRowIndex !== null) {
                    topic = await requireReadyQueueItem(requestedRowIndex);
                } else {
                    await ensureSheetsReadyForUi();
                    Utils.clearSheetCache('topics');
                    const queue = await Utils.readGoogleSheetTopicsAll({
                        status: TOPIC_STATUS.READY,
                        limit: 1,
                        offset: 0,
                        sortBy: 'rowNumber',
                        sortDir: 'asc'
                    });
                    topic = Array.isArray(queue?.items) ? queue.items[0] : null;
                }
                if (!topic || !Number.isInteger(Number(topic.rowIndex))) {
                    updateRunnerState({
                        state: 'empty',
                        message: '발행 준비된 글감이 없습니다.',
                        finishedAt: new Date().toISOString()
                    });
                    return;
                }

                const rowIndex = Number(topic.rowIndex);
                const postStatus = topicPostStatus(topic);
                updateRunnerState({
                    state: 'running',
                    message: execution.simulation === true ? 'Local에서 예정 동작을 확인하고 있습니다.' : '글감을 생성하고 발행하고 있습니다.',
                    progressStage: execution.simulation === true ? 'simulation' : 'writing',
                    rowIndex,
                    rowNumber: Number(topic.rowNumber || rowIndex + 2),
                    subject: String(topic.subject || topic.keywordsRaw || '제목 없는 글감')
                });

                if (execution.simulation === true) {
                    updateRunnerState({
                        state: 'simulated',
                        message: 'Local 시뮬레이션을 마쳤습니다. 외부 서비스와 Topics Sheet는 변경하지 않았습니다.',
                        resultStatus: postStatus,
                        finishedAt: new Date().toISOString()
                    });
                    return;
                }
                if (execution.draftOnly === true && postStatus !== 'draft') {
                    updateRunnerState({
                        state: 'needs_attention',
                        message: 'Development 자동 실행은 임시 저장 글감만 처리합니다. 첫 글감의 발행 방식을 확인해 주세요.',
                        resultStatus: `blocked:${postStatus}`,
                        finishedAt: new Date().toISOString()
                    });
                    return;
                }

                const result = await blogLifecycleAdapter.execute({
                    rowIndex,
                    plan: topic,
                    execution: {
                        manual: execution.manual === true,
                        automatic: execution.automatic === true,
                        headless,
                        operationId: `continuous-publishing:row-${rowIndex}`,
                        onProgress: (message) => {
                            const progress = presentPublishingProgress(message, { postStatus });
                            updateRunnerState({ progressStage: progress.stage, message: progress.message });
                        }
                    }
                });
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
                    progressStage: '',
                    completionLinks: buildCompletionLinks({
                        postStatus: result?.data?.postStatus || postStatus,
                        results: result?.data?.results,
                        config: CONFIG
                    }),
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
                executionLease.release();
                runnerPromise = null;
            }
        })();

        return { accepted: true, ...runnerState };
    }

    async function runAutomaticReadyTopic() {
        const policy = resolveRuntimeEffectPolicy(CONFIG);
        const mode = getAutomationMode(policy);
        if (mode === 'blocked') {
            return updateRunnerState({ state: 'blocked', message: '현재 환경에서는 자동 실행할 수 없습니다.', resultStatus: 'blocked' });
        }
        startRunner({ headless: true }, {
            automatic: true,
            simulation: mode === 'simulation',
            draftOnly: mode === 'development_draft'
        });
        const activeRun = runnerPromise;
        if (activeRun) await activeRun;
        if (mode !== 'simulation') await notifyAutomaticResult();
        return { ...runnerState };
    }

    function getRunnerStatusSnapshot() {
        const sharedStatus = blogNextExecutionCoordinator.getStatus();
        if (!runnerPromise && sharedStatus.busy) {
            externalExecutionObserved = true;
            return {
                state: 'running',
                message: sharedStatus.message,
                rowIndex: null,
                rowNumber: null,
                subject: sharedStatus.subject,
                resultStatus: '',
                startedAt: sharedStatus.startedAt,
                finishedAt: '',
                source: sharedStatus.source,
                busy: true
            };
        }
        if (!runnerPromise && externalExecutionObserved) {
            externalExecutionObserved = false;
            updateRunnerState({
                state: 'idle',
                message: '실행 대기 중',
                rowIndex: null,
                rowNumber: null,
                subject: '',
                resultStatus: '',
                progressStage: '',
                completionLinks: [],
                startedAt: '',
                finishedAt: ''
            });
        }
        return { ...runnerState, busy: runnerPromise !== null };
    }

    async function hasReadyTopic() {
        await ensureSheetsReadyForUi();
        const result = await Utils.readGoogleSheetTopicsAll({
            status: TOPIC_STATUS.READY,
            limit: 1,
            offset: 0,
            sortBy: 'rowNumber',
            sortDir: 'asc'
        });
        return (Array.isArray(result?.items) ? result.items : [])
            .some(item => String(item?.status || '').trim() === TOPIC_STATUS.READY);
    }

    async function getGlobalStatusSummary() {
        const runner = getRunnerStatusSnapshot();
        const completion = runner.state === 'completed'
            ? {
                last_completion_at: runner.finishedAt || null,
                last_result_status: runner.resultStatus || ''
            }
            : { last_completion_at: null, last_result_status: '' };
        if (['failed', 'needs_attention', 'blocked'].includes(runner.state)) {
            return {
                ...completion,
                state: 'attention',
                subject: runner.subject || '',
                message: runner.message || '',
                result_status: runner.resultStatus || '',
                next_processing_at: null
            };
        }
        if (runner.busy || ['selecting', 'running'].includes(runner.state)) {
            return {
                ...completion,
                state: 'running',
                subject: runner.subject || '',
                message: runner.message || '',
                result_status: '',
                next_processing_at: null
            };
        }

        const automation = toAutomationSettingsResponse(getAutomationSettingsRepository().read());
        const testRunAt = automation.runtime.scheduler?.test_run_at || null;
        const recurringRunAt = automation.runtime.effective_enabled
            ? (automation.runtime.scheduler?.next_run_at || automation.runtime.next_run_at_preview)
            : null;
        const nextProcessingAt = testRunAt || recurringRunAt;
        if (nextProcessingAt && await hasReadyTopic()) {
            return {
                ...completion,
                state: 'scheduled',
                subject: '',
                message: '',
                result_status: '',
                next_processing_at: nextProcessingAt
            };
        }
        return {
            ...completion,
            state: 'idle',
            subject: '',
            message: '',
            result_status: '',
            next_processing_at: null
        };
    }

    return {
        startAutomationScheduler() {
            return getAutomationScheduler().start();
        },

        getAutomationSettings() {
            return toAutomationSettingsResponse(getAutomationSettingsRepository().read());
        },

        saveAutomationSettings(requestBody = {}) {
            const result = getAutomationSettingsRepository().save(requestBody);
            getAutomationScheduler().refresh();
            return toAutomationSettingsResponse(result);
        },

        scheduleAutomationTest() {
            requireRunnerIdle();
            const policy = resolveRuntimeEffectPolicy(CONFIG);
            if (policy.environment !== 'development' || policy.automatedDraft !== true) {
                throw createApiError(403, 'CONTINUOUS_AUTOMATION_TEST_ENVIRONMENT_BLOCKED', '30초 시험 실행은 Development 환경에서만 사용할 수 있습니다.');
            }
            const scheduler = getAutomationScheduler().scheduleTestRun();
            return { accepted: true, runtime: { environment: policy.environment, automation_mode: 'development_draft', scheduler } };
        },

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

        async captureShoppingTopic(requestBody = {}) {
            let row;
            try {
                row = buildShoppingTopicSheetRow(requestBody);
            } catch (error) {
                throw createApiError(400, error.code || 'SHOPPING_TOPIC_CAPTURE_INVALID', error.message);
            }
            await ensureSheetsReadyForUi();
            const result = await Utils.appendGoogleSheetShopping([row], {
                defaultStatus: row.status
            });
            if (!result?.success) {
                throw createApiError(400, result?.code || 'SHOPPING_TOPIC_CAPTURE_FAILED', result?.message || '쇼핑 글감을 저장하지 못했습니다.');
            }
            return {
                action: 'save',
                status: row.status,
                rowNumber: Array.isArray(result.rowNumbers) ? result.rowNumbers[0] ?? null : null,
                rowIndex: Array.isArray(result.rowIndices) ? result.rowIndices[0] ?? null : null
            };
        },

        async getReadyQueue({ searchParams } = {}) {
            await ensureSheetsReadyForUi();
            Utils.clearSheetCache('topics');
            const requestedLimit = Number.parseInt(String(searchParams?.get('limit') || '50'), 10);
            const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
            const topics = await Utils.readGoogleSheetTopicsAll({
                limit: 100000,
                offset: 0,
                sortBy: 'rowNumber',
                sortDir: 'asc'
            });
            const allItems = Array.isArray(topics?.items) ? topics.items : [];
            const readyItems = allItems.filter(item => String(item?.status || '').trim() === TOPIC_STATUS.READY);
            const savedItems = allItems.filter(item => String(item?.status || '').trim() === TOPIC_STATUS.WAITING);
            const activeRowIndex = runnerPromise && Number.isInteger(Number(runnerState.rowIndex))
                ? Number(runnerState.rowIndex)
                : null;
            const activeItem = activeRowIndex === null
                ? null
                : allItems.find(item => Number(item?.rowIndex) === activeRowIndex) || null;
            const scheduledQueue = addQueueSchedule(readyItems);
            const visibleItems = scheduledQueue.items.map(item => Number(item?.rowIndex) === activeRowIndex
                ? { ...item, processing_estimate_at: null, queue_runtime_state: 'running' }
                : item);
            if (activeItem && !visibleItems.some(item => Number(item?.rowIndex) === activeRowIndex)) {
                visibleItems.push({ ...activeItem, processing_estimate_at: null, queue_runtime_state: 'running' });
                visibleItems.sort((left, right) => Number(left?.rowNumber || 0) - Number(right?.rowNumber || 0));
            }
            const runningCount = activeItem && !readyItems.some(item => Number(item?.rowIndex) === activeRowIndex) ? 1 : 0;
            return {
                items: visibleItems.slice(0, limit),
                saved_items: savedItems.slice(0, limit),
                total: readyItems.length + runningCount,
                limit,
                offset: 0,
                automation_schedule: scheduledQueue.automation_schedule,
                status_summary: {
                    saved: savedItems.length,
                    ready: readyItems.length,
                    running: runningCount
                }
            };
        },

        async getDashboardOverview() {
            const queue = await this.getReadyQueue({ searchParams: new URLSearchParams({ limit: '4' }) });
            return buildDashboardBlogOperationsOverview({
                queue,
                runner: getRunnerStatusSnapshot(),
                generatedAt: typeof now === 'function' ? now() : new Date()
            });
        },

        async getDashboardResultStats() {
            const generatedAt = typeof now === 'function' ? now() : new Date();
            const available = Boolean(
                eventStore
                && eventStore.disabled !== true
                && typeof eventStore.listOwnerBlogPublishResultEvents === 'function'
            );
            const events = available
                ? await eventStore.listOwnerBlogPublishResultEvents('', { limit: 5000 })
                : [];
            const naverId = CONFIG.CONFIG_IS_NAVER_SET === true
                ? String(CONFIG.NAVER_ID || '').trim()
                : '';
            const wordpressUrl = CONFIG.CONFIG_IS_WP_SET === true
                ? String(CONFIG.WORDPRESS_URL || '').trim().replace(/\/$/, '')
                : '';
            return buildDashboardBlogResultStats({
                events,
                available,
                generatedAt,
                platformHomeUrls: {
                    naver: naverId ? `https://blog.naver.com/${encodeURIComponent(naverId)}` : '',
                    wordpress: wordpressUrl
                }
            });
        },

        async updateTopic(requestBody = {}) {
            const rowIndex = parseRowIndex(requestBody.rowIndex);
            const action = String(requestBody.action || 'enqueue').trim();
            if (!['save', 'enqueue'].includes(action)) {
                throw createApiError(400, 'TOPIC_UPDATE_ACTION_INVALID', '글감 저장 방식을 확인해 주세요.');
            }
            const sourceStatus = String(requestBody.sourceStatus || TOPIC_STATUS.READY).trim();
            if (![TOPIC_STATUS.WAITING, TOPIC_STATUS.READY].includes(sourceStatus)) {
                throw createApiError(400, 'TOPIC_SOURCE_STATUS_INVALID', '수정할 글감 상태를 확인해 주세요.');
            }
            if (sourceStatus === TOPIC_STATUS.READY) requireRunnerIdle();
            await requireTopicInStatus(rowIndex, sourceStatus);
            const ready = sourceStatus === TOPIC_STATUS.READY || action === 'enqueue';
            let row;
            try {
                row = buildTopicSheetRow(requestBody, { ready });
            } catch (error) {
                throw createApiError(400, error.code || 'TOPIC_UPDATE_INVALID', error.message);
            }

            await Utils.updateGoogleSheetTopicEditableFields(rowIndex, {
                title: row.options.title || '',
                category: row.category,
                postStatus: row.postStatus,
                scheduleDate: row.scheduleDate,
                subject: row.subject,
                keywords: row.keywords,
                instruction: row.content_guide.additional_instructions,
                referenceUrl: row.content_guide.reference_urls,
                status: row.status,
                imageMode: row.image_options.mode,
                imageGeneration: row.image_options.generate,
                externalReference: row.use_external_ref,
                writingStrategy: row.writing_strategy,
                writingOverrides: row.content_guide.writing_overrides,
                platforms: row.targets
            });
            Utils.clearSheetCache('topics');
            return { action, rowIndex, rowNumber: rowIndex + 2, status: row.status };
        },

        updateReadyTopic(requestBody = {}) {
            return this.updateTopic({ ...requestBody, action: 'save', sourceStatus: TOPIC_STATUS.READY });
        },

        async deleteSavedTopic(requestBody = {}) {
            const rowIndex = parseRowIndex(requestBody.rowIndex);
            await requireTopicInStatus(rowIndex, TOPIC_STATUS.WAITING);
            if (typeof executeBlogTopicsDelete !== 'function') {
                throw createApiError(500, 'SAVED_TOPIC_DELETE_UNAVAILABLE', '보관한 글감 삭제 기능을 준비하지 못했습니다.');
            }
            const result = await executeBlogTopicsDelete({ rowIndices: [rowIndex] });
            if (!result?.success) {
                throw createApiError(400, result?.code || 'SAVED_TOPIC_DELETE_FAILED', result?.message || '보관한 글감을 삭제하지 못했습니다.');
            }
            Utils.clearSheetCache('topics');
            return { rowIndex, rowNumber: rowIndex + 2, deleted: true };
        },

        async removeReadyTopic(requestBody = {}) {
            requireRunnerIdle();
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

        async addSavedTopicToQueue(requestBody = {}) {
            requireRunnerIdle();
            const rowIndex = parseRowIndex(requestBody.rowIndex);
            await requireTopicInStatus(rowIndex, TOPIC_STATUS.WAITING);
            await Utils.updateGoogleSheetStatus(
                rowIndex,
                TOPIC_STATUS.READY,
                '연속 발행 대기열에 추가',
                { throwOnError: true }
            );
            Utils.clearSheetCache('topics');
            return { rowIndex, rowNumber: rowIndex + 2, status: TOPIC_STATUS.READY };
        },

        async reorderReadyTopic(requestBody = {}) {
            requireRunnerIdle();
            const rowIndex = parseRowIndex(requestBody.rowIndex);
            await ensureSheetsReadyForUi();
            Utils.clearSheetCache('topics');
            const topics = await Utils.readGoogleSheetTopicsAll({
                limit: 100000,
                offset: 0,
                sortBy: 'rowNumber',
                sortDir: 'asc'
            });
            let move;
            try {
                move = resolveReadyQueueMove(topics?.items, rowIndex, requestBody.direction);
            } catch (error) {
                throw createApiError(error.code === 'QUEUE_MOVE_BOUNDARY' ? 409 : 400, error.code || 'QUEUE_MOVE_INVALID', error.message);
            }
            if (typeof Utils.moveGoogleSheetTopicRow !== 'function') {
                throw createApiError(500, 'QUEUE_MOVE_UNAVAILABLE', '대기열 순서 변경 기능을 준비하지 못했습니다.');
            }
            await Utils.moveGoogleSheetTopicRow(move);
            Utils.clearSheetCache('topics');
            const queue = await this.getReadyQueue({ searchParams: new URLSearchParams('limit=50') });
            return {
                ...queue,
                moved: {
                    direction: move.direction,
                    subject: move.source.subject || '',
                    previousRowIndex: Number(move.source.rowIndex),
                    adjacentRowIndex: Number(move.target.rowIndex)
                }
            };
        },

        startNextReadyTopic(requestBody = {}) {
            return startRunner(requestBody, { manual: true });
        },

        startShoppingReadyTopic(requestBody = {}) {
            return startShoppingReadyTopic(requestBody);
        },

        getRunnerStatus() {
            return getRunnerStatusSnapshot();
        },

        async getGlobalStatusSummary() {
            return getGlobalStatusSummary();
        }
    };
}

module.exports = {
    createContinuousPublishingService
};
