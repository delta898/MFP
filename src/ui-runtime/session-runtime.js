function createUiSessionRuntime(deps = {}) {
    const {
        CONFIG,
        Utils,
        Logger,
        checkAuthSessionValid,
        clearAuthSession,
        runInteractiveNaverLoginFlow,
        sessionCheckTtlMs = 120000,
        sheetsPreflightTtlMs = 10 * 60 * 1000
    } = deps;

    const naverLoginState = {
        status: 'idle',
        message: '',
        startedAt: null,
        finishedAt: null,
        detectedBy: '',
        error: ''
    };

    const uiSheetsPreflightState = {
        inFlight: null,
        status: 'idle',
        lastCheckedAt: null,
        lastSuccessAt: null,
        lastError: ''
    };

    function setNaverLoginState(patch = {}) {
        Object.assign(naverLoginState, patch);
    }

    function getNaverLoginState() {
        return { ...naverLoginState };
    }

    function getNaverLoginStatus() {
        const startedAtMs = naverLoginState.startedAt ? new Date(naverLoginState.startedAt).getTime() : null;
        const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0;
        return {
            status: naverLoginState.status,
            message: naverLoginState.message,
            startedAt: naverLoginState.startedAt,
            finishedAt: naverLoginState.finishedAt,
            detectedBy: naverLoginState.detectedBy,
            error: naverLoginState.error,
            isRunning: naverLoginState.status === 'running',
            elapsedSeconds
        };
    }

    function getUiSheetsPreflightStatus() {
        return {
            status: uiSheetsPreflightState.status,
            lastCheckedAt: uiSheetsPreflightState.lastCheckedAt,
            lastSuccessAt: uiSheetsPreflightState.lastSuccessAt,
            lastError: uiSheetsPreflightState.lastError
        };
    }

    function shouldUseUiSheetsPreflightCache(force = false) {
        if (force) return false;
        if (!uiSheetsPreflightState.lastSuccessAt) return false;
        const last = new Date(uiSheetsPreflightState.lastSuccessAt).getTime();
        if (!Number.isFinite(last)) return false;
        return (Date.now() - last) < sheetsPreflightTtlMs;
    }

    async function ensureSheetsReadyForUi(options = {}) {
        const force = Boolean(options.force);
        if (!CONFIG?.GOOGLE_SHEET_ID) {
            throw new Error('GOOGLE_SHEET_URL(또는 GOOGLE_SHEET_ID)이 비어 있습니다. 설정에서 먼저 입력해 주세요.');
        }

        if (shouldUseUiSheetsPreflightCache(force)) {
            return {
                ok: true,
                cached: true,
                spreadsheetId: String(CONFIG.GOOGLE_SHEET_ID || '').trim(),
                ...getUiSheetsPreflightStatus()
            };
        }

        if (uiSheetsPreflightState.inFlight) {
            return uiSheetsPreflightState.inFlight;
        }

        uiSheetsPreflightState.status = 'checking';
        uiSheetsPreflightState.lastCheckedAt = new Date().toISOString();
        uiSheetsPreflightState.lastError = '';

        uiSheetsPreflightState.inFlight = (async () => {
            const ensured = await Utils.ensureAllSheetsExist();
            if (!ensured?.success) {
                throw new Error(ensured?.message || '필수 시트 준비에 실패했습니다.');
            }
            uiSheetsPreflightState.status = 'ready';
            uiSheetsPreflightState.lastSuccessAt = new Date().toISOString();
            uiSheetsPreflightState.lastError = '';
            return {
                ok: true,
                cached: false,
                spreadsheetId: String(ensured?.spreadsheetId || CONFIG.GOOGLE_SHEET_ID || '').trim(),
                ...getUiSheetsPreflightStatus()
            };
        })()
            .catch((e) => {
                uiSheetsPreflightState.status = 'error';
                uiSheetsPreflightState.lastError = String(e?.message || e || 'unknown');
                throw e;
            })
            .finally(() => {
                uiSheetsPreflightState.lastCheckedAt = new Date().toISOString();
                uiSheetsPreflightState.inFlight = null;
            });

        return uiSheetsPreflightState.inFlight;
    }

    async function checkNaverSessionForUi(options = {}) {
        return checkAuthSessionValid({
            cacheTtlMs: sessionCheckTtlMs,
            ...options
        });
    }

    async function logoutNaverSessionForUi() {
        const result = await clearAuthSession({
            authPath: CONFIG.AUTH_FILE_PATH
        });
        setNaverLoginState({
            status: 'idle',
            message: '로그아웃됨',
            startedAt: null,
            finishedAt: new Date().toISOString(),
            detectedBy: '',
            error: ''
        });
        return result;
    }

    async function runNaverLoginFlowForUi() {
        try {
            Logger.info('🔐 [UI] 네이버 로그인 프로세스 시작');
            setNaverLoginState({
                status: 'running',
                message: '브라우저 실행 중...',
                startedAt: new Date().toISOString(),
                finishedAt: null,
                detectedBy: '',
                error: ''
            });

            const { authPath, detectedBy } = await runInteractiveNaverLoginFlow({
                timeoutMs: 300000,
                authPath: CONFIG.AUTH_FILE_PATH,
                onStateChange: ({ message = '' }) => {
                    if (!message) return;
                    setNaverLoginState({
                        status: 'running',
                        message
                    });
                }
            });
            Logger.info(`✅ [UI] 네이버 로그인 완료 감지 (${detectedBy})`);

            setNaverLoginState({
                status: 'success',
                message: `로그인 완료 및 인증 저장됨 (${authPath})`,
                finishedAt: new Date().toISOString(),
                detectedBy,
                error: ''
            });
        } catch (e) {
            Logger.error(`❌ [UI] 네이버 로그인 실패: ${e.message}`);
            setNaverLoginState({
                status: 'failed',
                message: '로그인 실패',
                finishedAt: new Date().toISOString(),
                error: String(e?.message || 'unknown error')
            });
        }
    }

    return {
        setNaverLoginState,
        getNaverLoginState,
        getNaverLoginStatus,
        ensureSheetsReadyForUi,
        checkNaverSessionForUi,
        logoutNaverSessionForUi,
        runNaverLoginFlowForUi
    };
}

module.exports = {
    createUiSessionRuntime
};
