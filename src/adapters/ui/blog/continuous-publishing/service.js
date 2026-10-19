const { createApiError } = require('../../../../adapters/ui/errors');
const { TOPIC_STATUS } = require('../../../../services/topics/contract');
const { diagnoseQueueReadiness } = require('../../../../applications/blog/queue-management/queue-readiness');
const { diagnoseSiteTargetAvailability } = require('../../../../applications/blog/queue-execution/site-target-readiness');
const { buildShoppingTopicSheetRow } = require('../../../../applications/shopping/content-preparation/topic-capture');
const {
    AUTOMATION_SETTINGS_SCHEMA_VERSION,
    DEFAULT_AUTOMATION_SETTINGS,
    normalizeAutomationSettings,
    computeNextRunPreview,
    computeQueueRunProjections
} = require('../../../../applications/blog/automation/settings-policy');
const { createAutomationSettingsRepository, resolveAutomationSettingsPath } = require('../../../../adapters/storage/blog/automation-settings');
const { resolveRuntimeEffectPolicy } = require('../../../../services/runtime-environment/effects');
const { createContinuousPublishingScheduler } = require('../../../../applications/blog/automation/scheduler');
const { createBlogQueueManagementApplication } = require('../../../../applications/blog/queue-management/application');
const { createBlogExecutionCoordinator } = require('../../../../applications/blog/execution/execution-coordinator');
const { buildBlogOperationsOverview } = require('../../../../applications/blog/operations-reporting/operations-overview-read-model');
const { buildBlogPublishingResultStats } = require('../../../../applications/blog/operations-reporting/publishing-result-stats-read-model');
const { presentPublishingProgress, buildCompletionLinks } = require('../../../../adapters/ui/blog-publishing-presentation');
const {
    CONTENT_LIFECYCLE_KIND,
    normalizeTargets,
    resolveDeliveryPlan
} = require('../../../../services/content-delivery/contract');

function createContinuousPublishingService(deps = {}) {
    const { GoogleSheets, ensureSheetsReadyForUi, executeBlogRowAction, executeShoppingBatchRowsAction, executeBlogTopicsDelete, CONFIG = {}, fs, path, now, eventStore } = deps;
    const lifecycleAdapters = deps.lifecycleAdapters || { get: () => null };
    const pathImpl = path || require('node:path');
    let serviceApi = null;
    let automationSettingsRepository = deps.automationSettingsRepository || null;
    let automationScheduler = deps.automationScheduler || null;
    const blogNextExecutionCoordinator = deps.blogNextExecutionCoordinator
        || createBlogExecutionCoordinator({ now });
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
            filePath: resolveAutomationSettingsPath(CONFIG, pathImpl),
            schemaVersion: AUTOMATION_SETTINGS_SCHEMA_VERSION,
            defaultDocument: DEFAULT_AUTOMATION_SETTINGS,
            normalizeDocument: normalizeAutomationSettings
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

    function currentTimeMs() {
        const value = typeof now === 'function' ? now() : new Date();
        const time = value instanceof Date
            ? value.getTime()
            : (typeof value === 'number' ? value : Date.parse(value));
        return Number.isFinite(time) ? time : Date.now();
    }

    function diagnoseReadyTopic(topic = {}) {
        return diagnoseQueueReadiness(topic, { now: currentTimeMs() });
    }

    async function diagnoseQueueTopic(topic = {}) {
        const readiness = diagnoseReadyTopic(topic);
        if (!readiness.plan.targets.includes('site-hosting')) return readiness;
        if (typeof deps.getSiteHostingSiteService !== 'function') return readiness;
        const issue = await diagnoseSiteTargetAvailability(topic, deps.getSiteHostingSiteService);
        if (!issue) return readiness;
        const issues = [...readiness.issues, issue];
        return { ...readiness, ready: false, issues };
    }

    function readinessMessage(issues = []) {
        return issues.map((issue) => issue.message).filter(Boolean).join(' ');
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
        GoogleSheets.clearSheetCache('topics');
        const result = await GoogleSheets.readGoogleSheetTopicsAll({
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
        GoogleSheets.clearSheetCache('shopping');
        const result = await GoogleSheets.readGoogleSheetShoppingAll({
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

    const blogQueueManagementApplication = deps.blogQueueManagementApplication || createBlogQueueManagementApplication({
        now: currentTimeMs,
        isBusy: () => blogNextExecutionCoordinator.getStatus().busy,
        diagnoseTopic: diagnoseQueueTopic,
        getReadyQueue: (options) => serviceApi.getReadyQueue(options),
        addQueueSchedule,
        getActiveRowIndex: () => runnerPromise && Number.isInteger(Number(runnerState.rowIndex)) ? Number(runnerState.rowIndex) : null,
        topicStore: {
            async prepareRead() {
                await ensureSheetsReadyForUi();
                GoogleSheets.clearSheetCache('topics');
            },
            async readByStatus(status, options = {}) {
                await ensureSheetsReadyForUi();
                GoogleSheets.clearSheetCache('topics');
                return GoogleSheets.readGoogleSheetTopicsAll({ ...options, status });
            },
            async readAll(options = {}) {
                await ensureSheetsReadyForUi();
                GoogleSheets.clearSheetCache('topics');
                return GoogleSheets.readGoogleSheetTopicsAll(options);
            },
            async list(query = {}) {
                await ensureSheetsReadyForUi();
                GoogleSheets.clearSheetCache('topics');
                const result = await GoogleSheets.readGoogleSheetTopicsAll(query);
                return { result, sortBy: query.sortBy || 'rowNumber', sortDir: query.sortDir || 'desc' };
            },
            async append(rows, options) {
                await ensureSheetsReadyForUi();
                const result = await GoogleSheets.appendGoogleSheetTopics(rows, options);
                if (result?.success) GoogleSheets.clearSheetCache('topics');
                return result;
            },
            async updateEditableFields(rowIndex, fields) {
                await GoogleSheets.updateGoogleSheetTopicEditableFields(rowIndex, fields);
                GoogleSheets.clearSheetCache('topics');
            },
            async updateStatus(rowIndex, status, reason) {
                await GoogleSheets.updateGoogleSheetStatus(rowIndex, status, reason, { throwOnError: true });
                GoogleSheets.clearSheetCache('topics');
            },
            async deleteRows(rowIndices) {
                const result = await executeBlogTopicsDelete({ rowIndices });
                if (result?.success) GoogleSheets.clearSheetCache('topics');
                return result;
            },
            async moveRow(move) {
                if (typeof GoogleSheets.moveGoogleSheetTopicRow !== 'function') {
                    throw createApiError(500, 'QUEUE_MOVE_UNAVAILABLE', '대기열 순서 변경 기능을 준비하지 못했습니다.');
                }
                await GoogleSheets.moveGoogleSheetTopicRow(move);
                GoogleSheets.clearSheetCache('topics');
            }
        }
    });

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
            GoogleSheets.clearSheetCache('shopping');
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
        const hasLifecycleAdapter = [
            CONTENT_LIFECYCLE_KIND.BLOG,
            CONTENT_LIFECYCLE_KIND.SITE_HOSTING
        ].some((kind) => lifecycleAdapters.get(kind));
        if (!hasLifecycleAdapter && execution.simulation !== true) {
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
                    GoogleSheets.clearSheetCache('topics');
                    const queue = await GoogleSheets.readGoogleSheetTopicsAll({
                        status: TOPIC_STATUS.READY,
                        limit: 100000,
                        offset: 0,
                        sortBy: 'rowNumber',
                        sortDir: 'asc'
                    });
                    const readyItems = Array.isArray(queue?.items) ? queue.items : [];
                    const diagnoses = await Promise.all(readyItems.map(async (item) => ({ item, readiness: await diagnoseQueueTopic(item) })));
                    topic = diagnoses.find(({ readiness }) => readiness.ready)?.item || null;
                    if (!topic && diagnoses.some(({ readiness }) => !readiness.ready)) {
                        const skipped = diagnoses.filter(({ readiness }) => !readiness.ready);
                        const skippedCount = skipped.length;
                        const onlyExpiredSchedules = skipped.every(({ readiness }) => readiness.issues.length === 1
                            && readiness.issues[0].code === 'SCHEDULE_DATE_PAST');
                        updateRunnerState({
                            state: 'empty',
                            message: onlyExpiredSchedules
                                ? '예약 시각이 지난 글감은 건너뛰었습니다. 실행 가능한 글감이 없습니다.'
                                : `${skippedCount}개 글감에 포스팅 설정이 없거나 유효하지 않아 건너뛰었습니다. 실행 가능한 글감이 없습니다.`,
                            resultStatus: onlyExpiredSchedules ? 'SCHEDULED_ITEMS_SKIPPED' : 'QUEUE_ITEMS_SKIPPED',
                            finishedAt: new Date(currentTimeMs()).toISOString()
                        });
                        return;
                    }
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
                let readiness = await diagnoseQueueTopic(topic);
                if (!readiness.ready) {
                    const firstIssue = readiness.issues[0];
                    updateRunnerState({
                        state: requestedRowIndex === null ? 'empty' : 'needs_attention',
                        message: readinessMessage(readiness.issues),
                        progressStage: '',
                        rowIndex,
                        rowNumber: Number(topic.rowNumber || rowIndex + 2),
                        subject: String(topic.subject || topic.keywordsRaw || '제목 없는 글감'),
                        resultStatus: firstIssue?.code || 'QUEUE_ITEM_NOT_READY',
                        finishedAt: new Date(currentTimeMs()).toISOString()
                    });
                    return;
                }
                const postStatus = readiness.plan.postStatus;
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

                readiness = await diagnoseQueueTopic(topic);
                if (!readiness.ready) {
                    const firstIssue = readiness.issues[0];
                    updateRunnerState({
                        state: 'needs_attention',
                        message: readinessMessage(readiness.issues),
                        progressStage: '',
                        rowIndex,
                        rowNumber: Number(topic.rowNumber || rowIndex + 2),
                        subject: String(topic.subject || topic.keywordsRaw || '제목 없는 글감'),
                        resultStatus: firstIssue?.code || 'QUEUE_ITEM_NOT_READY',
                        finishedAt: new Date(currentTimeMs()).toISOString()
                    });
                    return;
                }

                const lifecycleKind = readiness.plan.targets.includes('site-hosting')
                    ? CONTENT_LIFECYCLE_KIND.SITE_HOSTING
                    : CONTENT_LIFECYCLE_KIND.BLOG;
                const lifecycleAdapter = lifecycleAdapters.get(lifecycleKind);
                if (!lifecycleAdapter && execution.simulation !== true) {
                    updateRunnerState({
                        state: 'needs_attention',
                        message: '이 포스팅 대상의 대기열 실행기를 사용할 수 없습니다.',
                        progressStage: '',
                        resultStatus: 'LIFECYCLE_ADAPTER_UNAVAILABLE',
                        finishedAt: new Date(currentTimeMs()).toISOString()
                    });
                    return;
                }
                const result = await lifecycleAdapter?.execute({
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
                GoogleSheets.clearSheetCache('topics');
                if (!result?.success) {
                    if (result?.code === 'SCHEDULE_DATE_PAST') {
                        updateRunnerState({
                            state: 'needs_attention',
                            message: '원고 준비 중 예약 시각이 지났습니다. 포스팅하지 않았으니 예약 설정을 수정해 주세요.',
                            progressStage: '',
                            resultStatus: result.code,
                            finishedAt: new Date(currentTimeMs()).toISOString()
                        });
                        return;
                    }
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
        if (!runnerPromise && sharedStatus.state === 'stopped') {
            externalExecutionObserved = false;
            return {
                ...runnerState,
                ...sharedStatus,
                state: 'stopped',
                resultStatus: '',
                completionLinks: [],
                busy: false
            };
        }
        if (!runnerPromise && sharedStatus.busy) {
            externalExecutionObserved = true;
            return {
                state: 'running',
                ...(sharedStatus.state === 'stop_requested' ? { state: 'stop_requested' } : {}),
                message: sharedStatus.message,
                ...(sharedStatus.progressStage ? { progressStage: sharedStatus.progressStage } : {}),
                ...(sharedStatus.postStatus ? { postStatus: sharedStatus.postStatus } : {}),
                rowIndex: null,
                rowNumber: null,
                subject: sharedStatus.subject,
                resultStatus: '',
                startedAt: sharedStatus.startedAt,
                finishedAt: '',
                source: sharedStatus.source,
                ...(sharedStatus.canStop === true ? { canStop: true } : {}),
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
        const result = await GoogleSheets.readGoogleSheetTopicsAll({
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

    serviceApi = {
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
            return blogQueueManagementApplication.captureTopic(requestBody || {});
        },

        async captureShoppingTopic(requestBody = {}) {
            let row;
            try {
                row = buildShoppingTopicSheetRow(requestBody);
            } catch (error) {
                throw createApiError(400, error.code || 'SHOPPING_TOPIC_CAPTURE_INVALID', error.message);
            }
            const action = String(requestBody.action || 'save').trim().toLowerCase();
            if (!['save', 'enqueue'].includes(action)) {
                throw createApiError(400, 'SHOPPING_TOPIC_CAPTURE_ACTION_INVALID', '지원하지 않는 쇼핑 글감 동작입니다.');
            }
            if (action === 'enqueue' && normalizeTargets(requestBody.targets).length === 0) {
                throw createApiError(400, 'SHOPPING_DELIVERY_TARGET_REQUIRED', '발행 대기열에 추가하려면 포스팅 대상을 하나 이상 선택해 주세요.');
            }
            if (action === 'enqueue') row.status = '발행 준비 완료';
            await ensureSheetsReadyForUi();
            const result = await GoogleSheets.appendGoogleSheetShopping([row], {
                defaultStatus: row.status
            });
            if (!result?.success) {
                throw createApiError(400, result?.code || 'SHOPPING_TOPIC_CAPTURE_FAILED', result?.message || '쇼핑 글감을 저장하지 못했습니다.');
            }
            return {
                action,
                status: row.status,
                rowNumber: Array.isArray(result.rowNumbers) ? result.rowNumbers[0] ?? null : null,
                rowIndex: Array.isArray(result.rowIndices) ? result.rowIndices[0] ?? null : null
            };
        },

        async getReadyQueue({ searchParams } = {}) {
            const requestedLimit = Number.parseInt(String(searchParams?.get('limit') || '50'), 10);
            const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
            return blogQueueManagementApplication.getReadyQueue({ limit });
        },

        async getDashboardOverview() {
            const queue = await this.getReadyQueue({ searchParams: new URLSearchParams({ limit: '4' }) });
            return buildBlogOperationsOverview({
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
            return buildBlogPublishingResultStats({
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
            return blogQueueManagementApplication.updateTopic(requestBody || {});
        },

        updateReadyTopic(requestBody = {}) {
            return this.updateTopic({ ...requestBody, action: 'save', sourceStatus: TOPIC_STATUS.READY });
        },

        async deleteSavedTopic(requestBody = {}) {
            if (typeof executeBlogTopicsDelete !== 'function') {
                throw createApiError(500, 'SAVED_TOPIC_DELETE_UNAVAILABLE', '보관한 글감 삭제 기능을 준비하지 못했습니다.');
            }
            return blogQueueManagementApplication.deleteSavedTopic(requestBody || {});
        },

        async removeReadyTopic(requestBody = {}) {
            return blogQueueManagementApplication.removeReadyTopic(requestBody || {});
        },

        async addSavedTopicToQueue(requestBody = {}) {
            return blogQueueManagementApplication.addSavedTopicToQueue(requestBody || {});
        },

        async reorderReadyTopic(requestBody = {}) {
            return blogQueueManagementApplication.reorderReadyTopic(requestBody || {});
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

        stopCurrentExecution() {
            const result = blogNextExecutionCoordinator.requestStop();
            if (!result.accepted) {
                throw createApiError(409, 'BLOG_NEXT_EXECUTION_NOT_STOPPABLE', '현재 작업은 지금 중지할 수 없습니다.');
            }
            return { accepted: true, ...result.status };
        },

        async getGlobalStatusSummary() {
            return getGlobalStatusSummary();
        }
    };
    return serviceApi;
}

module.exports = {
    createContinuousPublishingService
};
