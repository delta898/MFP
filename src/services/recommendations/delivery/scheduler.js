const DEFAULT_INTERVAL_MIN = 240;
const DEFAULT_STARTUP_DELAY_MS = 0;
const DEFAULT_BACKOFF_MS = 5 * 60 * 1000;

function boundedNumber(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}

function validTimestamp(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function normalizeDeliveryState(raw = {}) {
    const failureCount = boundedNumber(raw.failure_count, 0, 0, 20);
    return {
        schema_version: 1,
        last_attempt_at: validTimestamp(raw.last_attempt_at) ? new Date(raw.last_attempt_at).toISOString() : '',
        last_success_at: validTimestamp(raw.last_success_at) ? new Date(raw.last_success_at).toISOString() : '',
        next_run_at: validTimestamp(raw.next_run_at) ? new Date(raw.next_run_at).toISOString() : '',
        failure_count: failureCount,
        last_status: ['success', 'degraded', 'failed'].includes(raw.last_status) ? raw.last_status : ''
    };
}

function createDeliveryStateStore(options = {}) {
    const fs = options.fs;
    const path = options.path;
    const persistPath = String(options.persistPath || '').trim();
    if (!fs?.promises || !path || !persistPath) {
        return {
            async load() { return normalizeDeliveryState(); },
            async save(state) { return normalizeDeliveryState(state); }
        };
    }
    return {
        async load() {
            try {
                return normalizeDeliveryState(JSON.parse(await fs.promises.readFile(persistPath, 'utf8')));
            } catch (_error) {
                return normalizeDeliveryState();
            }
        },
        async save(state) {
            const normalized = normalizeDeliveryState(state);
            await fs.promises.mkdir(path.dirname(persistPath), { recursive: true });
            const tempPath = `${persistPath}.tmp-${process.pid}`;
            await fs.promises.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
            await fs.promises.rename(tempPath, persistPath);
            return normalized;
        }
    };
}

function createRecommendationDeliveryScheduler(options = {}) {
    const refreshService = options.refreshService;
    const stateStore = options.stateStore || createDeliveryStateStore(options);
    const logger = options.logger;
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const setTimer = options.setTimeout || setTimeout;
    const clearTimer = options.clearTimeout || clearTimeout;
    const enabled = options.enabled !== false;
    const intervalMs = boundedNumber(options.intervalMinutes, DEFAULT_INTERVAL_MIN, 30, 1440) * 60 * 1000;
    const startupDelayMs = boundedNumber(options.startupDelayMs, DEFAULT_STARTUP_DELAY_MS, 0, 60000);
    const baseBackoffMs = boundedNumber(options.baseBackoffMs, DEFAULT_BACKOFF_MS, 1000, intervalMs);
    let state = normalizeDeliveryState();
    let timer = null;
    let inFlight = null;
    let started = false;

    if (!refreshService?.refresh) throw new Error('recommendation refresh service가 필요합니다.');

    function currentMs() {
        return Date.parse(new Date(now()).toISOString());
    }

    function clearScheduledTimer() {
        if (timer) clearTimer(timer);
        timer = null;
    }

    function scheduleAt(runAtMs) {
        clearScheduledTimer();
        if (!started || !enabled) return;
        const delayMs = Math.max(0, runAtMs - currentMs());
        state.next_run_at = new Date(currentMs() + delayMs).toISOString();
        timer = setTimer(() => {
            timer = null;
            return run('scheduled');
        }, delayMs);
        timer?.unref?.();
    }

    function nextBackoffMs(failureCount) {
        return Math.min(intervalMs, baseBackoffMs * (2 ** Math.max(0, failureCount - 1)));
    }

    async function persist() {
        try {
            state = await stateStore.save(state);
        } catch (error) {
            logger?.warn?.(`⚠️ [RecommendationDelivery] 상태 저장 실패: ${error.message}`);
        }
    }

    async function run(trigger = 'manual') {
        if (!enabled) return { status: 'disabled' };
        if (inFlight) return inFlight;
        clearScheduledTimer();
        inFlight = (async () => {
            const attemptedAt = new Date(now()).toISOString();
            state.last_attempt_at = attemptedAt;
            try {
                const result = await refreshService.refresh({ force: true, trigger });
                const degraded = result?.degraded === true;
                if (degraded) {
                    state.failure_count += 1;
                    state.last_status = 'degraded';
                } else {
                    state.failure_count = 0;
                    state.last_status = 'success';
                    state.last_success_at = attemptedAt;
                }
                const delay = degraded ? nextBackoffMs(state.failure_count) : intervalMs;
                state.next_run_at = new Date(currentMs() + delay).toISOString();
                await persist();
                scheduleAt(Date.parse(state.next_run_at));
                return { status: state.last_status, refresh: result, next_run_at: state.next_run_at };
            } catch (error) {
                state.failure_count += 1;
                state.last_status = 'failed';
                const delay = nextBackoffMs(state.failure_count);
                state.next_run_at = new Date(currentMs() + delay).toISOString();
                await persist();
                scheduleAt(Date.parse(state.next_run_at));
                logger?.warn?.(`⚠️ [RecommendationDelivery] ${trigger} 평가 실패, backoff 예약: ${error.message}`);
                return { status: 'failed', next_run_at: state.next_run_at };
            } finally {
                inFlight = null;
            }
        })();
        return inFlight;
    }

    return {
        async start() {
            if (started) return { ...state };
            started = true;
            if (!enabled) return { ...state };
            state = await stateStore.load();
            const persistedNext = Date.parse(state.next_run_at);
            const nowMs = currentMs();
            const firstRunAt = Number.isFinite(persistedNext) && persistedNext > nowMs
                ? persistedNext
                : nowMs + startupDelayMs;
            scheduleAt(firstRunAt);
            logger?.info?.(`ℹ️ [RecommendationDelivery] 다음 평가 예약: ${state.next_run_at}`);
            return { ...state };
        },
        async runNow(trigger = 'manual') {
            return run(trigger);
        },
        stop() {
            started = false;
            clearScheduledTimer();
        },
        getStatus() {
            return { enabled, running: Boolean(inFlight), started, ...state };
        }
    };
}

module.exports = {
    DEFAULT_BACKOFF_MS,
    DEFAULT_INTERVAL_MIN,
    DEFAULT_STARTUP_DELAY_MS,
    boundedNumber,
    createDeliveryStateStore,
    createRecommendationDeliveryScheduler,
    normalizeDeliveryState
};
