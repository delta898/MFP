const { isLivePublishAllowed } = require('../../../services/runtime-environment/effects');

function createSnsAutomationScheduler(deps = {}) {
    const { CONFIG, Logger } = deps;

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
    const handlers = {
        runSnsDiscoveryCycle: null,
        runSnsDistributionCycle: null,
        runSnsAutomationCycle: null
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

    function getStatus() {
        const { timer, ...status } = snsRuntimeState;
        return { ...status };
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

        Logger.info(String(CONFIG.RUNTIME_ENVIRONMENT_PROFILE?.environment || '').trim().toLowerCase() === 'development'
            ? 'ℹ️ [SNS] 앱 시작 시 RSS 확인을 실행합니다. 개발 환경에서는 Buffer 자동 발행을 하지 않습니다.'
            : 'ℹ️ [SNS] 앱 시작 시 RSS 확인을 실행합니다. Buffer 발행은 예약 주기부터 시작합니다.');
        return triggerSnsDiscoveryCycle('startup');
    }

    function triggerSnsDistributionCycle(trigger = 'ui-manual') {
        return triggerSnsHandler('runSnsDistributionCycle', trigger);
    }

    function triggerSnsAutomationCycle(trigger = 'auto') {
        return triggerSnsHandler('runSnsAutomationCycle', trigger);
    }

    function triggerSnsScheduledCycle(trigger = 'auto') {
        if (String(CONFIG.RUNTIME_ENVIRONMENT_PROFILE?.environment || '').trim().toLowerCase() === 'development') {
            Logger.info('ℹ️ [SNS] 개발 환경: RSS만 확인하고 Buffer 자동 발행은 실행하지 않습니다.');
            return triggerSnsDiscoveryCycle(trigger);
        }
        return triggerSnsAutomationCycle(trigger);
    }

    function scheduleNextSnsCycle(delayMs = null) {
        clearSnsTimer();
        if (!snsRuntimeState.enabled) {
            snsRuntimeState.nextRunAt = null;
            return;
        }

        const intervalMin = Math.max(10, Number.parseInt(CONFIG.SNS_PUBLISH_INTERVAL_MIN, 10) || 10);
        const waitMs = delayMs === null || delayMs === undefined
            ? intervalMin * 60 * 1000
            : Math.max(500, Number.parseInt(delayMs, 10) || 500);
        snsRuntimeState.nextRunAt = new Date(Date.now() + waitMs).toISOString();
        snsRuntimeState.status = snsRuntimeState.running ? 'running' : 'waiting';
        Logger.info(`ℹ️ [SNS] 다음 자동 처리 예약: ${new Date(snsRuntimeState.nextRunAt).toLocaleString()} (주기: ${intervalMin}분)`);

        snsRuntimeState.timer = setTimeout(() => {
            snsRuntimeState.timer = null;
            if (!snsRuntimeState.enabled) return;
            if (snsRuntimeState.running) {
                scheduleNextSnsCycle();
                return;
            }

            triggerSnsScheduledCycle('auto')
                .finally(() => {
                    scheduleNextSnsCycle();
                });
        }, waitMs);
    }

    function syncSnsRunner() {
        const isDevelopment = String(CONFIG.RUNTIME_ENVIRONMENT_PROFILE?.environment || '').trim().toLowerCase() === 'development';
        const automatedPublishAllowed = isLivePublishAllowed(CONFIG);
        const isEnabled = CONFIG.SNS_PUBLISH_ENABLED === true && (automatedPublishAllowed || isDevelopment);
        const intervalMin = Math.max(10, Number.parseInt(CONFIG.SNS_PUBLISH_INTERVAL_MIN, 10) || 10);
        const statusChanged = snsRuntimeState.enabled !== isEnabled;
        const intervalChanged = snsRuntimeState.lastInterval !== intervalMin;

        if (!statusChanged && !intervalChanged && snsRuntimeState.nextRunAt) {
            snsRuntimeState.status = snsRuntimeState.running ? 'running' : 'waiting';
            return;
        }

        snsRuntimeState.enabled = isEnabled;
        snsRuntimeState.lastInterval = intervalMin;
        clearSnsTimer();
        if (!isEnabled) {
            if (CONFIG.SNS_PUBLISH_ENABLED === true && !automatedPublishAllowed) {
                Logger.info(`ℹ️ [SNS] ${CONFIG.RUNTIME_ENVIRONMENT_PROFILE?.environment || '현재'} 환경 정책으로 자동 RSS 확인을 예약하지 않습니다.`);
            }
            snsRuntimeState.status = 'stopped';
            snsRuntimeState.nextRunAt = null;
            return;
        }

        Logger.info(isDevelopment
            ? `ℹ️ [SNS] 개발 환경 RSS 자동 확인 활성화 (주기: ${intervalMin}분, Buffer 자동 발행 차단)`
            : `ℹ️ [SNS] RSS 확인 및 자동 발행 활성화 (주기: ${intervalMin}분)`);
        scheduleNextSnsCycle();
    }

    function syncSnsAutomationWithConfig() {
        syncSnsRunner();
    }

    return {
        snsRuntimeState,
        setHandlers,
        getStatus,
        clearSnsTimer,
        triggerSnsDiscoveryCycle,
        triggerSnsStartupDiscovery,
        triggerSnsDistributionCycle,
        triggerSnsAutomationCycle,
        triggerSnsScheduledCycle,
        scheduleNextSnsCycle,
        syncSnsRunner,
        syncSnsAutomationWithConfig
    };
}

module.exports = {
    createSnsAutomationScheduler
};
