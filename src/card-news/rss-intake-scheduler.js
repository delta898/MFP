const CARD_NEWS_RSS_INITIAL_DELAY_MS = 60 * 1000;
const CARD_NEWS_RSS_INTERVAL_MS = 30 * 60 * 1000;

function createCardNewsRssIntakeScheduler(options = {}) {
    const intake = options.intake;
    const logger = options.logger;
    const initialDelayMs = Number(options.initialDelayMs ?? CARD_NEWS_RSS_INITIAL_DELAY_MS);
    const intervalMs = Number(options.intervalMs ?? CARD_NEWS_RSS_INTERVAL_MS);
    const setTimer = options.setTimer || setTimeout;
    const clearTimer = options.clearTimer || clearTimeout;
    let running = false;
    let timer = null;

    if (!intake || typeof intake.collect !== 'function') {
        throw new Error('Card News RSS scheduler에는 intake가 필요합니다.');
    }

    function schedule(delayMs) {
        if (!running) return;
        timer = setTimer(async () => {
            timer = null;
            try {
                await intake.collect('scheduled');
            } catch (error) {
                logger?.warn?.(`⚠️ [CardNews RSS] 자동 수집 실패: ${error.message}`);
            } finally {
                schedule(intervalMs);
            }
        }, delayMs);
        timer?.unref?.();
    }

    function start() {
        if (running) return false;
        running = true;
        schedule(initialDelayMs);
        logger?.info?.('ℹ️ [CardNews RSS] 앱 실행 중 30분 간격 자동 수집을 준비했습니다.');
        return true;
    }

    function stop() {
        if (!running) return false;
        running = false;
        if (timer) clearTimer(timer);
        timer = null;
        return true;
    }

    return { start, stop };
}

module.exports = {
    CARD_NEWS_RSS_INITIAL_DELAY_MS,
    CARD_NEWS_RSS_INTERVAL_MS,
    createCardNewsRssIntakeScheduler
};
