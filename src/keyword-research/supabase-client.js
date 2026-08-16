const { createClient } = require('@supabase/supabase-js');

const DEFAULT_TIMEOUT_MS = 60000;

function withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error('키워드 분석 서버 응답 시간이 초과되었습니다.');
            error.code = 'KEYWORD_FUNCTION_TIMEOUT';
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function readFunctionError(error) {
    let payload = null;
    try {
        const response = error?.context?.clone ? error.context.clone() : error?.context;
        if (response && typeof response.json === 'function') payload = await response.json();
    } catch (_error) {
        payload = null;
    }
    const status = Number(error?.context?.status || 0);
    const code = String(payload?.code || 'KEYWORD_FUNCTION_FAILED');
    const message = status === 429 || code === 'RATE_LIMITED'
        ? '키워드 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.'
        : (status === 401 || code === 'LICENSE_NOT_ACTIVE'
            ? '유효한 라이선스가 필요합니다.'
            : (status === 400
                ? '키워드 분석 입력이 올바르지 않습니다.'
                : '검색량 지표를 불러오지 못했습니다. 입력한 키워드로 제목을 추천합니다.'));
    const wrapped = new Error(message);
    wrapped.code = code;
    wrapped.status = status;
    return wrapped;
}

function createKeywordResearchSupabaseClient(options = {}) {
    const config = options.config || {};
    const License = options.License;
    const createClientImpl = options.createClient || createClient;
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
    let client = options.client || null;

    function getClient() {
        if (client) return client;
        const url = String(config.LICENSE_CHK_URL || '').trim();
        const key = String(config.LICENSE_CHK_KEY || '').trim();
        if (!url || !key) throw new Error('Supabase 키워드 분석 연결이 설정되지 않았습니다.');
        client = createClientImpl(url, key);
        return client;
    }

    return {
        async analyze(request = {}) {
            if (!License || typeof License.resolveAuthenticatedServerContext !== 'function') {
                throw new Error('라이선스 인증 기능을 사용할 수 없습니다.');
            }
            const auth = await License.resolveAuthenticatedServerContext();
            if (!auth?.success || !auth.licenseKey || !auth.hwid) {
                const error = new Error(auth?.message || '유효한 라이선스가 필요합니다.');
                error.code = auth?.code || 'LICENSE_NOT_ACTIVE';
                throw error;
            }

            const invocation = getClient().functions.invoke('keyword-research', {
                body: {
                    ...request,
                    licenseKey: auth.licenseKey,
                    hwid: auth.hwid
                }
            });
            const { data, error } = await withTimeout(invocation, timeoutMs);
            if (error) throw await readFunctionError(error);
            if (!data?.success || !data?.analysis) {
                throw new Error('키워드 분석 서버 응답이 올바르지 않습니다.');
            }
            return data.analysis;
        }
    };
}

module.exports = {
    createKeywordResearchSupabaseClient,
    readFunctionError,
    withTimeout
};
