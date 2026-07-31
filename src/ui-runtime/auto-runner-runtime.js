function createAutoRunnerRuntime(deps = {}) {
    const {
        CONFIG,
        Logger,
        parseConfigBool,
        normalizeNonNegativeInt,
        normalizeTimeHHmm,
        computeNextWindowedRunAt,
        normalizeShoppingAutoSettings,
        getBlogAutoSettingsSnapshot,
        getShoppingAutoSettingsSnapshot,
        publishAutoDefaults,
        shoppingAutoDefaults
    } = deps;

    const autoRuntimeState = {
        enabled: false,
        running: false,
        status: 'stopped',
        message: '블로그 자동 모드 비활성화 (레거시)',
        startedAt: null,
        lastRunAt: null,
        nextRunAt: null,
        lastSummary: null,
        cycleCount: 0,
        timer: null,
        lastPublishAtMs: 0
    };

    const trendsRuntimeState = { enabled: false, running: false, status: 'stopped', nextRunAt: null, timer: null, lastTime: null };
    const rssRuntimeState = {
        enabled: false,
        running: false,
        status: 'stopped',
        nextRunAt: null,
        timer: null,
        lastConfigsJson: null,
        lastRunTimes: {}
    };
    const snsRuntimeState = {
        enabled: false,
        running: false,
        status: 'stopped',
        nextRunAt: null,
        timer: null,
        lastInterval: null,
        lastRunAt: null,
        lastResult: null
    };
    const publishRuntimeState = { enabled: false, running: false, status: 'stopped', nextRunAt: null, timer: null, lastInterval: null, lastStartTime: null, lastEndTime: null };
    const shoppingAutoRuntimeState = {
        enabled: false,
        running: false,
        status: 'stopped',
        message: '쇼핑 자동 모드 비활성화',
        startedAt: null,
        lastRunAt: null,
        nextRunAt: null,
        lastSummary: null,
        cycleCount: 0,
        timer: null,
        dayKey: '',
        shoppingPublishedToday: 0
    };

    const handlers = {
        runTrendCollectCycle: null,
        runRssCollectCycle: null,
        runSnsDiscoveryCycle: null,
        runSnsDistributionCycle: null,
        runSnsAutomationCycle: null,
        runAutoPublishCycle: null,
        executeShoppingAutoCycle: null
    };
    let snsStartupDiscoveryRequested = false;

    function requireHandler(name) {
        const handler = handlers[name];
        if (typeof handler !== 'function') {
            throw new Error(`Auto runner handler is not configured: ${name}`);
        }
        return handler;
    }

    function setHandlers(nextHandlers = {}) {
        Object.assign(handlers, nextHandlers);
    }

    function getDateKeyLocal(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function resetShoppingDailyCountersIfNeeded() {
        const today = getDateKeyLocal();
        if (shoppingAutoRuntimeState.dayKey !== today) {
            shoppingAutoRuntimeState.dayKey = today;
            shoppingAutoRuntimeState.shoppingPublishedToday = 0;
        }
    }

    function getAutoStatusPayload() {
        const blogSettings = getBlogAutoSettingsSnapshot();
        const shoppingSettings = getShoppingAutoSettingsSnapshot();
        return {
            blog: {
                enabled: publishRuntimeState.enabled,
                running: publishRuntimeState.running,
                status: publishRuntimeState.status,
                message: publishRuntimeState.message || '',
                startedAt: autoRuntimeState.startedAt,
                lastRunAt: autoRuntimeState.lastRunAt,
                nextRunAt: publishRuntimeState.nextRunAt,
                cycleCount: autoRuntimeState.cycleCount,
                lastSummary: publishRuntimeState.lastSummary || autoRuntimeState.lastSummary,
                settings: blogSettings
            },
            shopping: {
                enabled: shoppingAutoRuntimeState.enabled,
                running: shoppingAutoRuntimeState.running,
                status: shoppingAutoRuntimeState.status,
                message: shoppingAutoRuntimeState.message,
                startedAt: shoppingAutoRuntimeState.startedAt,
                lastRunAt: shoppingAutoRuntimeState.lastRunAt,
                nextRunAt: shoppingAutoRuntimeState.nextRunAt,
                cycleCount: shoppingAutoRuntimeState.cycleCount,
                lastSummary: shoppingAutoRuntimeState.lastSummary,
                dayKey: shoppingAutoRuntimeState.dayKey,
                shoppingPublishedToday: shoppingAutoRuntimeState.shoppingPublishedToday,
                settings: shoppingSettings
            },
            sns: {
                enabled: snsRuntimeState.enabled,
                running: snsRuntimeState.running,
                status: snsRuntimeState.status,
                lastRunAt: snsRuntimeState.lastRunAt,
                nextRunAt: snsRuntimeState.nextRunAt,
                lastResult: snsRuntimeState.lastResult
            },
            enabled: autoRuntimeState.enabled || shoppingAutoRuntimeState.enabled,
            running: autoRuntimeState.running || shoppingAutoRuntimeState.running,
            status: (autoRuntimeState.running || shoppingAutoRuntimeState.running) ? 'running'
                : (autoRuntimeState.status === 'waiting' || shoppingAutoRuntimeState.status === 'waiting' ? 'waiting' : 'stopped'),
            message: [autoRuntimeState.message, shoppingAutoRuntimeState.message].filter(Boolean).join(' / '),
            shoppingPublishedToday: shoppingAutoRuntimeState.shoppingPublishedToday
        };
    }

    function refreshLegacyAutoRuntimeState() {
        autoRuntimeState.enabled = trendsRuntimeState.enabled || publishRuntimeState.enabled || rssRuntimeState.enabled || snsRuntimeState.enabled;
        autoRuntimeState.running = trendsRuntimeState.running || publishRuntimeState.running || rssRuntimeState.running || snsRuntimeState.running;
        autoRuntimeState.message = `Trends: ${trendsRuntimeState.status} | RSS: ${rssRuntimeState.status} | Publish: ${publishRuntimeState.status} | SNS: ${snsRuntimeState.status}`;
        autoRuntimeState.status = autoRuntimeState.running ? 'running' : (autoRuntimeState.enabled ? 'waiting' : 'stopped');
        autoRuntimeState.nextRunAt = publishRuntimeState.nextRunAt || snsRuntimeState.nextRunAt || trendsRuntimeState.nextRunAt || null;
    }

    function syncTrendsRunner() {
        const isEnabled = Boolean(CONFIG.COLLECT_TRENDS_ENABLED);
        const targetTime = String(CONFIG.COLLECT_TRENDS_TIME || '07:30').trim();

        if (trendsRuntimeState.enabled === isEnabled &&
            trendsRuntimeState.lastTime === targetTime &&
            trendsRuntimeState.nextRunAt) {
            trendsRuntimeState.status = trendsRuntimeState.running ? 'running' : 'waiting';
            return;
        }

        if (trendsRuntimeState.timer) clearInterval(trendsRuntimeState.timer);
        trendsRuntimeState.enabled = isEnabled;
        trendsRuntimeState.lastTime = targetTime;

        if (!isEnabled) {
            trendsRuntimeState.status = 'stopped';
            trendsRuntimeState.nextRunAt = null;
            return;
        }

        trendsRuntimeState.status = trendsRuntimeState.running ? 'running' : 'waiting';
        const timeStr = targetTime.split(':');
        const targetHour = parseInt(timeStr[0] || '7', 10);
        const targetMin = parseInt(timeStr[1] || '30', 10);

        const scheduleTrends = () => {
            const now = new Date();
            const target = new Date(now);
            target.setHours(targetHour, targetMin, 0, 0);
            if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);

            const waitMs = Math.max(1000, target.getTime() - now.getTime());
            trendsRuntimeState.nextRunAt = new Date(Date.now() + waitMs).toISOString();
            Logger.info(`ℹ️ [AUTO][Producer] 트렌드 자동 수집 예약: ${new Date(trendsRuntimeState.nextRunAt).toLocaleString()} (설정시간: ${CONFIG.COLLECT_TRENDS_TIME || '07:30'})`);

            if (trendsRuntimeState.timer) clearInterval(trendsRuntimeState.timer);
            trendsRuntimeState.timer = setInterval(() => {
                if (!trendsRuntimeState.enabled || trendsRuntimeState.running) return;
                if (Date.now() >= new Date(trendsRuntimeState.nextRunAt).getTime()) {
                    trendsRuntimeState.running = true;
                    trendsRuntimeState.status = 'running';
                    requireHandler('runTrendCollectCycle')('auto').finally(() => {
                        trendsRuntimeState.running = false;
                        scheduleTrends();
                    });
                }
            }, 10000);
        };
        scheduleTrends();
    }

    function syncRssRunner() {
        const rssConfigs = Array.isArray(CONFIG.COLLECT_RSS_CONFIGS) ? CONFIG.COLLECT_RSS_CONFIGS : [];
        const isGlobalEnabled = parseConfigBool(CONFIG.COLLECT_RSS_ENABLED, false);
        const configsJson = JSON.stringify(rssConfigs);
        const isEnabled = isGlobalEnabled && rssConfigs.some(rc => rc.enabled);

        if (rssRuntimeState.enabled === isEnabled &&
            rssRuntimeState.lastConfigsJson === configsJson &&
            rssRuntimeState.timer) {
            rssRuntimeState.status = rssRuntimeState.running ? 'running' : 'waiting';
            return;
        }

        if (rssRuntimeState.timer) clearInterval(rssRuntimeState.timer);
        rssRuntimeState.enabled = isEnabled;
        rssRuntimeState.lastConfigsJson = configsJson;

        if (!rssRuntimeState.enabled) {
            rssRuntimeState.status = 'stopped';
            rssRuntimeState.nextRunAt = null;
            return;
        }

        rssRuntimeState.status = rssRuntimeState.running ? 'running' : 'waiting';

        const now = Date.now();
        const enabledConfigs = rssConfigs.filter(rc => rc.enabled);
        enabledConfigs.forEach(rc => {
            const url = String(rc.url || '').trim();
            if (!url) return;
            if (!rssRuntimeState.lastRunTimes[url]) {
                rssRuntimeState.lastRunTimes[url] = now;
            }

            const intervalMin = parseInt(rc.interval, 10) || 60;
            const lastRun = rssRuntimeState.lastRunTimes[url];
            const nextRunAt = lastRun + (intervalMin * 60 * 1000);
            const remainingMs = Math.max(0, nextRunAt - now);

            Logger.info(`ℹ️ [AUTO][Producer] RSS 수집 예약: ${new Date(nextRunAt).toLocaleString()} (피드: ${url}, 주기: ${intervalMin}분, 남은시간: ${Math.round(remainingMs / 1000 / 60)}분)`);
        });

        const scheduleRss = () => {
            const checkIntervalMs = 60 * 1000;
            if (rssRuntimeState.timer) clearInterval(rssRuntimeState.timer);

            rssRuntimeState.timer = setInterval(async () => {
                if (!rssRuntimeState.enabled || rssRuntimeState.running) return;

                const currentNow = Date.now();
                const configsToRun = [];

                enabledConfigs.forEach(rc => {
                    const url = String(rc.url || '').trim();
                    if (!url) return;

                    const intervalMin = parseInt(rc.interval, 10) || 60;
                    const intervalMs = intervalMin * 60 * 1000;
                    const lastRun = rssRuntimeState.lastRunTimes[url] || currentNow;

                    if (currentNow - lastRun >= intervalMs) {
                        configsToRun.push(rc);
                    }
                });

                if (configsToRun.length > 0) {
                    rssRuntimeState.running = true;
                    rssRuntimeState.status = 'running';

                    configsToRun.forEach(rc => {
                        rssRuntimeState.lastRunTimes[String(rc.url || '').trim()] = currentNow;
                    });

                    Logger.info(`ℹ️ [AUTO][Producer] RSS 개별 주기 도달 (${configsToRun.length}개 피드 실행)`);
                    requireHandler('runRssCollectCycle')('auto', {
                        settingsOverrides: { COLLECT_RSS_CONFIGS: configsToRun }
                    }).finally(() => {
                        rssRuntimeState.running = false;
                        rssRuntimeState.status = 'waiting';
                    });
                }
            }, checkIntervalMs);
        };
        scheduleRss();
    }

    function clearPublishTimer() {
        if (publishRuntimeState.timer) {
            clearTimeout(publishRuntimeState.timer);
            publishRuntimeState.timer = null;
        }
    }

    function scheduleNextPublishCycle(delayMs = null, options = {}) {
        clearPublishTimer();
        if (!publishRuntimeState.enabled) {
            publishRuntimeState.nextRunAt = null;
            refreshLegacyAutoRuntimeState();
            return;
        }

        const intervalMin = Math.max(1, normalizeNonNegativeInt(CONFIG.PUBLISH_AUTO_INTERVAL_MIN, publishAutoDefaults.intervalMin));
        const intervalMs = intervalMin * 60 * 1000;
        const startTime = normalizeTimeHHmm(CONFIG.PUBLISH_AUTO_START_TIME, publishAutoDefaults.startTime);
        const endTime = normalizeTimeHHmm(CONFIG.PUBLISH_AUTO_END_TIME, publishAutoDefaults.endTime);
        const parsedDelay = (delayMs === null || delayMs === undefined || delayMs === '')
            ? null
            : Math.max(500, parseInt(delayMs, 10) || 0);
        const nextSchedule = computeNextWindowedRunAt({
            delayMs: parsedDelay,
            intervalMs,
            startTime,
            endTime,
            preferWindowStartIfBaseOutside: options.preferWindowStartIfBaseOutside === true
        });
        const waitMs = Math.max(500, nextSchedule.runAt.getTime() - Date.now());

        publishRuntimeState.nextRunAt = nextSchedule.runAt.toISOString();
        publishRuntimeState.status = publishRuntimeState.running ? 'running' : 'waiting';
        refreshLegacyAutoRuntimeState();

        if (nextSchedule.adjustedByWindow) {
            Logger.info(
                `ℹ️ [AUTO][Consumer] 자동 발행 예약이 허용 시간대에 맞춰 조정되었습니다: `
                + `${nextSchedule.runAt.toLocaleString()} `
                + `(원래 후보: ${nextSchedule.candidateAt.toLocaleString()}, 허용시간: ${startTime}~${endTime})`
            );
        } else {
            Logger.info(`ℹ️ [AUTO][Consumer] 자동 발행 예약: ${nextSchedule.runAt.toLocaleString()} (간격: ${intervalMin}분)`);
        }

        publishRuntimeState.timer = setTimeout(() => {
            publishRuntimeState.timer = null;
            if (!publishRuntimeState.enabled || publishRuntimeState.running) return;

            publishRuntimeState.running = true;
            publishRuntimeState.status = 'running';
            refreshLegacyAutoRuntimeState();
            requireHandler('runAutoPublishCycle')('auto').finally(() => {
                publishRuntimeState.running = false;
                scheduleNextPublishCycle();
            });
        }, waitMs);
    }

    function syncPublishRunner() {
        const isEnabled = Boolean(CONFIG.PUBLISH_AUTO_ENABLED);
        let intervalMin = normalizeNonNegativeInt(CONFIG.PUBLISH_AUTO_INTERVAL_MIN, 60);
        if (intervalMin < 1) intervalMin = 60;
        const startTime = normalizeTimeHHmm(CONFIG.PUBLISH_AUTO_START_TIME, publishAutoDefaults.startTime);
        const endTime = normalizeTimeHHmm(CONFIG.PUBLISH_AUTO_END_TIME, publishAutoDefaults.endTime);

        const isIntervalChanged = publishRuntimeState.lastInterval !== intervalMin;
        const isStatusChanged = publishRuntimeState.enabled !== isEnabled;
        const isTimeRangeChanged = publishRuntimeState.lastStartTime !== startTime || publishRuntimeState.lastEndTime !== endTime;

        if (!isStatusChanged && !isIntervalChanged && !isTimeRangeChanged && publishRuntimeState.nextRunAt) {
            publishRuntimeState.status = publishRuntimeState.running ? 'running' : 'waiting';
            refreshLegacyAutoRuntimeState();
            return;
        }

        const wasEnabled = publishRuntimeState.enabled;
        const oldInterval = publishRuntimeState.lastInterval;
        const oldStartTime = publishRuntimeState.lastStartTime;
        const oldEndTime = publishRuntimeState.lastEndTime;

        publishRuntimeState.enabled = isEnabled;
        publishRuntimeState.lastInterval = intervalMin;
        publishRuntimeState.lastStartTime = startTime;
        publishRuntimeState.lastEndTime = endTime;

        clearPublishTimer();

        if (!isEnabled) {
            if (wasEnabled) Logger.info('ℹ️ [AUTO][Consumer] 자동 발행 시스템이 OFF 되었습니다. (기존 예약 취소)');
            publishRuntimeState.status = 'stopped';
            publishRuntimeState.nextRunAt = null;
            refreshLegacyAutoRuntimeState();
            return;
        }

        if (!wasEnabled) {
            Logger.info('ℹ️ [AUTO][Consumer] 자동 발행 시스템이 ON 되었습니다.');
        } else if (isIntervalChanged) {
            Logger.info(`ℹ️ [AUTO][Consumer] 자동 발행 주기가 변경되어 예약을 갱신합니다. (${oldInterval}분 -> ${intervalMin}분)`);
        } else if (isTimeRangeChanged) {
            Logger.info(`ℹ️ [AUTO][Consumer] 자동 발행 허용 시간대가 변경되어 예약을 다시 계산합니다. (${oldStartTime}~${oldEndTime} -> ${startTime}~${endTime})`);
        }

        publishRuntimeState.status = publishRuntimeState.running ? 'running' : 'waiting';
        scheduleNextPublishCycle(null, { preferWindowStartIfBaseOutside: true });
    }

    function clearSnsTimer() {
        if (snsRuntimeState.timer) {
            clearTimeout(snsRuntimeState.timer);
            snsRuntimeState.timer = null;
        }
    }

    async function triggerSnsHandler(handlerName, trigger = 'ui-manual') {
        if (snsRuntimeState.running) {
            return {
                success: false,
                code: 'SNS_CYCLE_ALREADY_RUNNING',
                message: 'SNS RSS 확인 또는 발행이 이미 진행 중입니다.'
            };
        }

        snsRuntimeState.running = true;
        snsRuntimeState.status = 'running';
        snsRuntimeState.lastRunAt = new Date().toISOString();
        refreshLegacyAutoRuntimeState();
        try {
            const result = await requireHandler(handlerName)(trigger);
            snsRuntimeState.lastResult = result || null;
            return result;
        } catch (error) {
            const result = {
                success: false,
                code: 'SNS_CYCLE_FAILED',
                message: error.message
            };
            snsRuntimeState.lastResult = result;
            Logger.error(`❌ [SNS] 자동 처리 실패: ${error.message}`);
            return result;
        } finally {
            snsRuntimeState.running = false;
            snsRuntimeState.status = snsRuntimeState.enabled ? 'waiting' : 'stopped';
            refreshLegacyAutoRuntimeState();
        }
    }

    function triggerSnsDiscoveryCycle(trigger = 'ui-manual') {
        return triggerSnsHandler('runSnsDiscoveryCycle', trigger);
    }

    async function triggerSnsStartupDiscovery() {
        if (snsStartupDiscoveryRequested) {
            return {
                success: true,
                code: 'SNS_STARTUP_DISCOVERY_ALREADY_REQUESTED',
                message: '앱 시작 시 SNS RSS 확인을 이미 요청했습니다.'
            };
        }
        snsStartupDiscoveryRequested = true;
        if (!snsRuntimeState.enabled) {
            return {
                success: true,
                code: 'SNS_STARTUP_DISCOVERY_DISABLED',
                message: 'SNS 자동 발행이 비활성화되어 앱 시작 시 RSS 확인을 건너뜁니다.'
            };
        }

        Logger.info('ℹ️ [SNS] 앱 시작 시 RSS 확인을 실행합니다. Buffer 발행은 예약 주기부터 시작합니다.');
        return triggerSnsDiscoveryCycle('startup');
    }

    function triggerSnsDistributionCycle(trigger = 'ui-manual') {
        return triggerSnsHandler('runSnsDistributionCycle', trigger);
    }

    function triggerSnsAutomationCycle(trigger = 'auto') {
        return triggerSnsHandler('runSnsAutomationCycle', trigger);
    }

    function scheduleNextSnsCycle(delayMs = null) {
        clearSnsTimer();
        if (!snsRuntimeState.enabled) {
            snsRuntimeState.nextRunAt = null;
            refreshLegacyAutoRuntimeState();
            return;
        }

        const intervalMin = Math.max(10, Number.parseInt(CONFIG.SNS_PUBLISH_INTERVAL_MIN, 10) || 10);
        const waitMs = delayMs === null || delayMs === undefined
            ? intervalMin * 60 * 1000
            : Math.max(500, Number.parseInt(delayMs, 10) || 500);
        snsRuntimeState.nextRunAt = new Date(Date.now() + waitMs).toISOString();
        snsRuntimeState.status = snsRuntimeState.running ? 'running' : 'waiting';
        refreshLegacyAutoRuntimeState();
        Logger.info(`ℹ️ [SNS] 다음 자동 처리 예약: ${new Date(snsRuntimeState.nextRunAt).toLocaleString()} (주기: ${intervalMin}분)`);

        snsRuntimeState.timer = setTimeout(() => {
            snsRuntimeState.timer = null;
            if (!snsRuntimeState.enabled) return;
            if (snsRuntimeState.running) {
                scheduleNextSnsCycle();
                return;
            }

            triggerSnsAutomationCycle('auto')
                .finally(() => {
                    scheduleNextSnsCycle();
                });
        }, waitMs);
    }

    function syncSnsRunner() {
        const isEnabled = CONFIG.SNS_PUBLISH_ENABLED === true;
        const intervalMin = Math.max(10, Number.parseInt(CONFIG.SNS_PUBLISH_INTERVAL_MIN, 10) || 10);
        const statusChanged = snsRuntimeState.enabled !== isEnabled;
        const intervalChanged = snsRuntimeState.lastInterval !== intervalMin;

        if (!statusChanged && !intervalChanged && snsRuntimeState.nextRunAt) {
            snsRuntimeState.status = snsRuntimeState.running ? 'running' : 'waiting';
            refreshLegacyAutoRuntimeState();
            return;
        }

        snsRuntimeState.enabled = isEnabled;
        snsRuntimeState.lastInterval = intervalMin;
        clearSnsTimer();
        if (!isEnabled) {
            snsRuntimeState.status = 'stopped';
            snsRuntimeState.nextRunAt = null;
            refreshLegacyAutoRuntimeState();
            return;
        }

        Logger.info(`ℹ️ [SNS] RSS 확인 및 자동 발행 활성화 (주기: ${intervalMin}분)`);
        scheduleNextSnsCycle();
    }

    function syncAutoRunnerWithConfig() {
        syncTrendsRunner();
        syncRssRunner();
        syncPublishRunner();
        syncSnsRunner();
        refreshLegacyAutoRuntimeState();
    }

    function clearShoppingAutoTimer() {
        if (shoppingAutoRuntimeState.timer) {
            clearTimeout(shoppingAutoRuntimeState.timer);
            shoppingAutoRuntimeState.timer = null;
        }
    }

    function scheduleNextShoppingAutoCycle(delayMs = null, options = {}) {
        clearShoppingAutoTimer();
        if (!shoppingAutoRuntimeState.enabled) {
            shoppingAutoRuntimeState.nextRunAt = null;
            return;
        }
        const settings = normalizeShoppingAutoSettings(CONFIG);
        let waitMs = 0;

        if (delayMs !== null && delayMs !== undefined && delayMs !== '') {
            const parsed = parseInt(delayMs, 10);
            waitMs = Math.max(500, isNaN(parsed) ? 500 : parsed);
        } else {
            const intervalMin = Math.max(1, parseInt(settings.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60, 10));
            waitMs = intervalMin * 60 * 1000;
            waitMs = Math.max(60 * 1000, waitMs);
        }
        const nextSchedule = computeNextWindowedRunAt({
            delayMs: waitMs,
            intervalMs: waitMs,
            startTime: settings.SHOPPING_PUBLISH_AUTO_START_TIME,
            endTime: settings.SHOPPING_PUBLISH_AUTO_END_TIME,
            preferWindowStartIfBaseOutside: options.preferWindowStartIfBaseOutside === true
        });
        const delayUntilRun = Math.max(500, nextSchedule.runAt.getTime() - Date.now());

        shoppingAutoRuntimeState.nextRunAt = nextSchedule.runAt.toISOString();
        shoppingAutoRuntimeState.status = shoppingAutoRuntimeState.running ? 'running' : 'waiting';
        shoppingAutoRuntimeState.message = nextSchedule.adjustedByWindow
            ? `허용 시간대에 맞춰 다음 실행을 조정했습니다. (${settings.SHOPPING_PUBLISH_AUTO_START_TIME} ~ ${settings.SHOPPING_PUBLISH_AUTO_END_TIME})`
            : '다음 쇼핑 자동발행을 대기 중입니다.';

        if (nextSchedule.adjustedByWindow) {
            Logger.info(
                `ℹ️ [AUTO][쇼핑] 다음 쇼핑 자동발행 예약이 허용 시간대에 맞춰 조정되었습니다: `
                + `${nextSchedule.runAt.toLocaleString()} `
                + `(원래 후보: ${nextSchedule.candidateAt.toLocaleString()}, 허용시간: ${settings.SHOPPING_PUBLISH_AUTO_START_TIME}~${settings.SHOPPING_PUBLISH_AUTO_END_TIME})`
            );
        } else {
            const waitMinutes = Math.max(1, Math.round(delayUntilRun / (60 * 1000)));
            Logger.info(`ℹ️ [AUTO][쇼핑] 다음 쇼핑 자동발행 예약 완료: ${nextSchedule.runAt.toLocaleString()} (약 ${waitMinutes}분 후 실행)`);
        }

        shoppingAutoRuntimeState.timer = setTimeout(() => {
            shoppingAutoRuntimeState.timer = null;
            if (!shoppingAutoRuntimeState.enabled || shoppingAutoRuntimeState.running) return;

            requireHandler('executeShoppingAutoCycle')('timer').catch((e) => {
                Logger.error(`❌ [AUTO][쇼핑] 사이클 실행 실패: ${e.message}`);
            });
        }, delayUntilRun);
    }

    function stopShoppingAutoRunner(reason = '쇼핑 자동 모드 중지') {
        clearShoppingAutoTimer();
        shoppingAutoRuntimeState.enabled = false;
        shoppingAutoRuntimeState.status = 'stopped';
        shoppingAutoRuntimeState.message = reason;
        shoppingAutoRuntimeState.nextRunAt = null;
    }

    function startShoppingAutoRunner(reason = '쇼핑 자동 모드 시작') {
        shoppingAutoRuntimeState.enabled = true;
        if (!shoppingAutoRuntimeState.startedAt) shoppingAutoRuntimeState.startedAt = new Date().toISOString();
        shoppingAutoRuntimeState.status = shoppingAutoRuntimeState.running ? 'running' : 'waiting';
        shoppingAutoRuntimeState.message = reason;
        scheduleNextShoppingAutoCycle(null, { preferWindowStartIfBaseOutside: true });
    }

    function syncShoppingAutoRunnerWithConfig() {
        const settings = normalizeShoppingAutoSettings(CONFIG);
        if (settings.SHOPPING_PUBLISH_AUTO_ENABLED) {
            startShoppingAutoRunner(`쇼핑 자동 실행 활성화 (주기: ${settings.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN}분)`);
        } else {
            stopShoppingAutoRunner('SHOPPING_PUBLISH_AUTO_ENABLED가 비활성화되어 있습니다.');
        }
    }

    return {
        autoRuntimeState,
        trendsRuntimeState,
        rssRuntimeState,
        snsRuntimeState,
        publishRuntimeState,
        shoppingAutoRuntimeState,
        setHandlers,
        getDateKeyLocal,
        resetShoppingDailyCountersIfNeeded,
        getAutoStatusPayload,
        refreshLegacyAutoRuntimeState,
        syncTrendsRunner,
        syncRssRunner,
        clearPublishTimer,
        scheduleNextPublishCycle,
        syncPublishRunner,
        clearSnsTimer,
        triggerSnsDiscoveryCycle,
        triggerSnsStartupDiscovery,
        triggerSnsDistributionCycle,
        triggerSnsAutomationCycle,
        scheduleNextSnsCycle,
        syncSnsRunner,
        syncAutoRunnerWithConfig,
        clearShoppingAutoTimer,
        scheduleNextShoppingAutoCycle,
        stopShoppingAutoRunner,
        startShoppingAutoRunner,
        syncShoppingAutoRunnerWithConfig
    };
}

module.exports = {
    createAutoRunnerRuntime
};
