'use strict';

function createUiServerStartup({ config, logger, initializeAgentMemory, startUiServerRuntime } = {}) {
    if (typeof initializeAgentMemory !== 'function' || typeof startUiServerRuntime !== 'function') {
        throw new TypeError('UI server startup requires memory initialization and HTTP server operations.');
    }

    async function startUiServer(options = {}) {
        const safeMode = options.safeMode === true;
        const deferred = !safeMode && options.deferOptionalStartup === true;

        if (!safeMode && !deferred) {
            await initializeAgentMemory({ baseDir: config.ROOT_DIR });
        } else {
            if (safeMode) {
                logger.warn('⚠️ [AgentMemory] 안전 모드에서 지능형 메모리 저장소 준비를 건너뜁니다.');
            } else {
                logger.info('ℹ️ [AgentMemory] 첫 화면 표시 후 지능형 메모리 저장소를 준비합니다.');
            }
        }

        const started = await startUiServerRuntime(options);
        if (!deferred) return started;

        return {
            ...started,
            startDeferredServices: async () => {
                const memory = Promise.resolve()
                    .then(() => initializeAgentMemory({ baseDir: config.ROOT_DIR }))
                    .catch((error) => {
                        logger.error(`❌ [AgentMemory] 지연 초기화 실패: ${error.message}`, error);
                        return false;
                    });
                const optional = Promise.resolve()
                    .then(() => started.startOptionalServices())
                    .catch((error) => {
                        logger.error(`❌ [UI] 지연 백그라운드 기능 시작 실패: ${error.message}`, error);
                        return [];
                    });
                const [memoryReady, optionalResults] = await Promise.all([memory, optional]);
                return { memoryReady, optionalResults };
            }
        };
    }

    return { startUiServer };
}

module.exports = { createUiServerStartup };
