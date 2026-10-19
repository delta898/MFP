'use strict';

async function runWithHeartbeat(taskLabel, fn, options = {}) {
    const logger = options.logger || console;
    const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 7000;
    const startedAt = Date.now();
    const timer = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
        logger.info?.(`   ⏳ ${taskLabel} 진행 중... (${elapsedSec}초 경과)`);
    }, intervalMs);
    try { return await fn(); }
    finally { clearInterval(timer); }
}

module.exports = { runWithHeartbeat };
