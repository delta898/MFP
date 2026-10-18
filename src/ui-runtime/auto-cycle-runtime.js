const { buildPublishQuotaPreflight } = require('../publish-quota');
const { normalizeBlogImageMode, generatesBlogImages } = require('../content/blog-image-mode');

function createAutoCycleRuntime(deps = {}) {
    const {
        CONFIG,
        Logger,
        License,
        Utils,
        GoogleSheets,
        urlShorteningService,
        TelegramService,
        SlackService,
        ensureSheetsReadyForUi,
        parseCsvTokens,
        normalizeNonNegativeInt,
        parseConfigBool,
        toFeatureMap,
        isCommandEnabled,
        parseMaxPosts,
        blogAutoDefaults,
        autoRuntimeState,
        publishRuntimeState,
        refreshLegacyAutoRuntimeState,
        executeBlogBatchRowsAction,
        snsRssDiscovery,
        snsDistributionRunner
    } = deps;

    async function runSnsDiscoveryCycle(trigger = 'manual') {
        if (!snsRssDiscovery || typeof snsRssDiscovery.run !== 'function') {
            return {
                success: false,
                code: 'SNS_DISCOVERY_NOT_CONFIGURED',
                message: 'SNS RSS Discovery가 구성되지 않았습니다.'
            };
        }

        return snsRssDiscovery.run(trigger);
    }

    async function runSnsDistributionCycle(trigger = 'manual') {
        if (!snsDistributionRunner || typeof snsDistributionRunner.run !== 'function') {
            return {
                success: false,
                code: 'SNS_DISTRIBUTION_NOT_CONFIGURED',
                message: 'SNS Distribution Runner가 구성되지 않았습니다.'
            };
        }

        return snsDistributionRunner.run(trigger);
    }

    async function runSnsAutomationCycle(trigger = 'auto') {
        const discovery = await runSnsDiscoveryCycle(trigger);
        if (!discovery?.success) {
            return {
                success: false,
                code: discovery?.code || 'SNS_DISCOVERY_FAILED',
                message: discovery?.message || 'SNS RSS 확인에 실패했습니다.',
                data: { discovery, distribution: null }
            };
        }

        const distribution = await runSnsDistributionCycle(trigger);
        return {
            success: distribution?.success === true,
            code: distribution?.success
                ? 'SNS_AUTOMATION_COMPLETED'
                : (distribution?.code || 'SNS_DISTRIBUTION_FAILED'),
            message: distribution?.message || '',
            data: {
                discovery,
                distribution
            }
        };
    }

    async function runAutoPublishCycle(trigger = 'manual', options = {}) {
        const settingsOverrides = options?.settingsOverrides || {};
        const precheck = await License.checkLicenseStatus({ quiet: true });
        if (!precheck.success) return { success: false, message: `라이선스 오류: ${precheck.message}` };
        const features = toFeatureMap(precheck.features);

        if (!isCommandEnabled(features, 'batch')) {
            return { success: false, message: '블로그 batch 권한이 없습니다.' };
        }

        Logger.info(`🚀 [Blog][BatchPublish] 선택 글감 발행 시작 (Trigger: ${trigger})`);

        try {
            const topicsRes = await GoogleSheets.readGoogleSheetTopicsAll({
                status: '',
                limit: 100000,
                sortBy: 'rowNumber',
                sortDir: 'asc'
            });
            const topicItems = Array.isArray(topicsRes.items) ? topicsRes.items : [];

            let candidates = [];
            if (Array.isArray(options?.targetRowIndices) && options.targetRowIndices.length > 0) {
                candidates = topicItems.filter((item) => options.targetRowIndices.includes(item.rowIndex));
            } else {
                candidates = topicItems
                    .filter((item) => String(item?.status || '').trim() === '발행 준비 완료')
                    .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
            }

            let batchSize = normalizeNonNegativeInt(settingsOverrides.PUBLISH_AUTO_BATCH_SIZE ?? CONFIG.PUBLISH_AUTO_BATCH_SIZE, 1);
            if (batchSize === 0) batchSize = 1;

            const selectedCandidates = candidates.slice(0, batchSize);
            const quotaPreflight = buildPublishQuotaPreflight(selectedCandidates.length, precheck);
            const targetCandidates = selectedCandidates.slice(0, quotaPreflight.executable);
            if (targetCandidates.length === 0) {
                Logger.info(quotaPreflight.selected > 0
                    ? `[AUTO][Consumer] ${quotaPreflight.message}`
                    : 'ℹ️ [AUTO][Consumer] 발행 대기 상태인 토픽이 없습니다.');
                return {
                    success: quotaPreflight.selected === 0,
                    code: quotaPreflight.selected > 0 ? 'QUOTA_EXHAUSTED' : undefined,
                    message: quotaPreflight.selected > 0 ? quotaPreflight.message : undefined,
                    data: { published: 0, quotaPreflight }
                };
            }
            Logger.info(`[AUTO][Consumer] ${quotaPreflight.message}`);

            const rawTargets = String(settingsOverrides.PUBLISH_AUTO_TARGET_CHANNELS ?? CONFIG.PUBLISH_AUTO_TARGET_CHANNELS ?? 'naver')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
            const targets = rawTargets.length > 0 ? rawTargets : ['naver'];

            const headless = settingsOverrides.PUBLISH_AUTO_HEADLESS !== undefined
                ? settingsOverrides.PUBLISH_AUTO_HEADLESS
                : (CONFIG.PUBLISH_AUTO_HEADLESS !== undefined ? CONFIG.PUBLISH_AUTO_HEADLESS : CONFIG.HEADLESS);
            const postStatus = String(
                settingsOverrides.PUBLISH_AUTO_POST_STATUS
                ?? CONFIG.PUBLISH_AUTO_POST_STATUS
                ?? 'publish'
            ).trim().toLowerCase() === 'draft' ? 'draft' : 'publish';

            let successCount = 0;
            let failCount = 0;
            const totalResults = [];

            for (const candidate of targetCandidates) {
                const rowOptions = candidate.options || {};
                let rowTargets = targets;
                if (rowOptions.platforms && Array.isArray(rowOptions.platforms) && rowOptions.platforms.length > 0) {
                    rowTargets = rowOptions.platforms;
                }

                const singleResult = await executeBlogBatchRowsAction({
                    action: 'batch',
                    rowIndices: [candidate.rowIndex],
                    headless,
                    targets: rowTargets,
                    postStatus,
                    isAutoCycle: true
                });

                successCount += Number(singleResult?.data?.successCount || 0);
                failCount += Number(singleResult?.data?.failCount || 0);
                if (singleResult?.data?.results) {
                    totalResults.push(...singleResult.data.results);
                }
            }

            const blogResult = { data: { successCount, failCount, results: totalResults } };
            const finalSuccessCount = Number(blogResult?.data?.successCount || 0);
            const finalFailCount = Number(blogResult?.data?.failCount || 0);

            Logger.info(`✅ [Blog][BatchPublish] 선택 글감 발행 완료: 성공 ${finalSuccessCount}건, 실패 ${finalFailCount}건`);

            const shouldSendSummary = (successCount + failCount) > 1 || failCount > 0;

            if (CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED && shouldSendSummary) {
                let detailMsg = '';
                const successItems = (blogResult?.data?.results || []).filter((item) => item.success);
                const displayItems = successItems.slice(0, 3);

                if (displayItems.length > 0) {
                    detailMsg += '\n\n<b>[발행 내역 (최대 3건)]</b>';
                    for (const item of displayItems) {
                        const title = item.data?.title || '제목 없음';
                        const results = item.data?.results || {};

                        const platforms = [];
                        if (results.naver?.success) platforms.push('N');
                        if (results.wordpress?.success) platforms.push('W');
                        const platformIndicator = platforms.length > 0 ? `[${platforms.join('/')}] ` : '';

                        let itemLine = `\n• ${platformIndicator}${title}`;

                        if (results.wordpress?.success && results.wordpress?.postUrl) {
                            let shortUrl = results.wordpress.postUrl;
                            if (urlShorteningService?.isConfigured?.()) {
                                shortUrl = await urlShorteningService.shorten(results.wordpress.postUrl);
                            }
                            itemLine += ` (${shortUrl})`;
                        }

                        detailMsg += itemLine;
                    }
                }

                const msg = `<b>[블로그 글감 발행 완료]</b>\n- 성공: <b>${successCount}</b>건\n- 실패: <b>${failCount}</b>건${detailMsg}\n- 시각: ${new Date().toLocaleString()}`;
                if (CONFIG.NOTIFY_TELEGRAM_ENABLED) {
                    TelegramService.sendNotification(msg, {
                        botToken: CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN,
                        chatId: CONFIG.NOTIFY_TELEGRAM_CHAT_ID,
                        enabled: CONFIG.NOTIFY_TELEGRAM_ENABLED
                    }).catch((error) => Logger.error(`텔레그램 알림 전송 에러: ${error.message}`));
                }
                if (CONFIG.NOTIFY_SLACK_ENABLED) {
                    SlackService.sendNotification(msg, {
                        webhookUrl: CONFIG.NOTIFY_SLACK_WEBHOOK_URL,
                        enabled: CONFIG.NOTIFY_SLACK_ENABLED
                    }).catch((error) => Logger.error(`Slack 알림 전송 에러: ${error.message}`));
                }
            }

            return {
                success: true,
                data: {
                    published: successCount,
                    failed: failCount,
                    skipped: selectedCandidates.length - targetCandidates.length,
                    quotaPreflight
                }
            };
        } catch (error) {
            Logger.error(`❌ [Blog][BatchPublish] 글감 발행 실패: ${error.message}`);
            return { success: false, message: `글감 발행 처리 오류: ${error.message}` };
        }
    }

    function normalizeManualPublishTargetRowIndices(value) {
        if (!Array.isArray(value)) return [];
        return Array.from(new Set(
            value
                .map((item) => Number(item))
                .filter((item) => Number.isInteger(item) && item >= 0)
        ));
    }

    async function triggerAutoPublishCycle(trigger = 'manual', options = {}) {
        if (publishRuntimeState.running) {
            return {
                success: false,
                code: 'PUBLISH_AUTO_ALREADY_RUNNING',
                message: '이미 다른 발행 작업이 실행 중입니다.'
            };
        }

        const normalizedOptions = {
            ...options,
            targetRowIndices: normalizeManualPublishTargetRowIndices(options?.targetRowIndices)
        };
        const startedAt = new Date().toISOString();

        publishRuntimeState.running = true;
        publishRuntimeState.status = 'running';
        publishRuntimeState.message = '발행 작업을 시작했습니다.';
        autoRuntimeState.startedAt = startedAt;
        autoRuntimeState.lastRunAt = startedAt;
        refreshLegacyAutoRuntimeState();

        Promise.resolve()
            .then(async () => {
                const result = await runAutoPublishCycle(trigger, normalizedOptions);
                publishRuntimeState.lastSummary = result || null;
                if (result?.success === false) {
                    publishRuntimeState.status = 'error';
                    publishRuntimeState.message = result?.message || '발행 작업 처리 중 오류가 발생했습니다.';
                } else {
                    publishRuntimeState.message = '발행 작업이 백그라운드에서 완료되었습니다.';
                    autoRuntimeState.cycleCount = Number(autoRuntimeState.cycleCount || 0) + 1;
                }
                autoRuntimeState.lastSummary = result?.data || result || null;
            })
            .catch((error) => {
                Logger.error(`❌ [Blog][BatchPublish] 비동기 발행 시작 실패: ${error.message}`);
                publishRuntimeState.status = 'error';
                publishRuntimeState.message = error.message || '발행 작업 처리 중 오류가 발생했습니다.';
                publishRuntimeState.lastSummary = {
                    success: false,
                    message: publishRuntimeState.message
                };
                autoRuntimeState.lastSummary = publishRuntimeState.lastSummary;
            })
            .finally(() => {
                publishRuntimeState.running = false;
                if (publishRuntimeState.status !== 'error') {
                    publishRuntimeState.status = publishRuntimeState.enabled ? 'waiting' : 'stopped';
                }
                autoRuntimeState.lastRunAt = new Date().toISOString();
                refreshLegacyAutoRuntimeState();
            });

        return {
            success: true,
            data: {
                started: true,
                trigger,
                startedAt,
                targetRowIndices: normalizedOptions.targetRowIndices,
                targetRowCount: normalizedOptions.targetRowIndices.length
            }
        };
    }

    return {
        runSnsDiscoveryCycle,
        runSnsDistributionCycle,
        runSnsAutomationCycle,
        runAutoPublishCycle,
        normalizeManualPublishTargetRowIndices,
        triggerAutoPublishCycle
    };
}

module.exports = {
    createAutoCycleRuntime
};
