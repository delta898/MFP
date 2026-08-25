const { createClient } = require('@supabase/supabase-js');

const KNOWLEDGE_GATEWAY_FUNCTION = 'knowledge-gateway';
const DEFAULT_TIMEOUT_MS = 30000;
const SAFE_ERROR_MESSAGES = Object.freeze({
    INVALID_REQUEST: '외부 지식 조회 조건이 올바르지 않습니다.',
    LICENSE_NOT_ACTIVE: '유효한 라이선스가 필요합니다.',
    LICENSE_UNAVAILABLE: '라이선스 상태를 확인하지 못했습니다.',
    RATE_LIMITED: '외부 지식 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    RATE_LIMIT_UNAVAILABLE: '외부 지식 요청 보호 상태를 확인하지 못했습니다.',
    PROVIDER_QUOTA_EXHAUSTED: '외부 지식 공급자의 오늘 조회 한도에 도달했습니다.',
    PROVIDER_BACKOFF: '외부 지식 공급자가 일시적으로 대기 중입니다.',
    PROVIDER_AUTH_FAILED: '외부 지식 공급자 인증 설정을 확인해야 합니다.',
    PROVIDER_RATE_LIMITED: '외부 지식 공급자의 요청 한도에 도달했습니다.',
    UPSTREAM_REQUEST_REJECTED: '외부 지식 공급자가 조회 조건을 거절했습니다.',
    UPSTREAM_TIMEOUT: '외부 지식 공급자 응답 시간이 초과되었습니다.',
    UPSTREAM_FAILED: '외부 지식 공급자 응답을 받지 못했습니다.',
    INVALID_UPSTREAM_RESPONSE: '외부 지식 공급자 응답이 올바르지 않습니다.',
    CORPUS_UNAVAILABLE: '발견 소재를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    NOT_CONFIGURED: '외부 지식 공급자가 아직 구성되지 않았습니다.'
});

function withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error('외부 지식 서버 응답 시간이 초과되었습니다.');
            error.code = 'KNOWLEDGE_GATEWAY_TIMEOUT';
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function readGatewayError(error) {
    let payload = null;
    try {
        const response = error?.context?.clone ? error.context.clone() : error?.context;
        if (response && typeof response.json === 'function') payload = await response.json();
    } catch (_error) {
        payload = null;
    }
    const status = Number(error?.context?.status || 0);
    const code = String(payload?.code || 'KNOWLEDGE_GATEWAY_FAILED').trim();
    const wrapped = new Error(SAFE_ERROR_MESSAGES[code] || '외부 지식을 불러오지 못했습니다.');
    wrapped.code = code;
    wrapped.status = status;
    return wrapped;
}

function createKnowledgeServerGatewayClient(options = {}) {
    const config = options.config || {};
    const License = options.License;
    const createClientImpl = options.createClient || createClient;
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
    let client = options.client || null;

    function getClient() {
        if (client) return client;
        const url = String(config.LICENSE_CHK_URL || '').trim();
        const key = String(config.LICENSE_CHK_KEY || '').trim();
        if (!url || !key) {
            const error = new Error('외부 지식 서버 연결이 설정되지 않았습니다.');
            error.code = 'KNOWLEDGE_GATEWAY_NOT_CONFIGURED';
            throw error;
        }
        client = createClientImpl(url, key);
        return client;
    }

    return {
        async fetchSnapshot(request = {}) {
            if (!License || typeof License.resolveAuthenticatedServerContext !== 'function') {
                throw new Error('라이선스 인증 기능을 사용할 수 없습니다.');
            }
            const auth = await License.resolveAuthenticatedServerContext();
            if (!auth?.success || !auth.licenseKey || !auth.hwid) {
                const error = new Error(auth?.message || SAFE_ERROR_MESSAGES.LICENSE_NOT_ACTIVE);
                error.code = auth?.code || 'LICENSE_NOT_ACTIVE';
                throw error;
            }
            const invocation = getClient().functions.invoke(KNOWLEDGE_GATEWAY_FUNCTION, {
                body: {
                    schema_version: 1,
                    kind: request.kind,
                    purpose: request.purpose,
                    query: request.query,
                    licenseKey: auth.licenseKey,
                    hwid: auth.hwid
                }
            });
            const { data, error } = await withTimeout(invocation, timeoutMs);
            if (error) throw await readGatewayError(error);
            if (!data?.success || !data.snapshot || typeof data.snapshot !== 'object') {
                const invalid = new Error(SAFE_ERROR_MESSAGES.INVALID_UPSTREAM_RESPONSE);
                invalid.code = 'INVALID_UPSTREAM_RESPONSE';
                throw invalid;
            }
            return data.snapshot;
        }
    };
}

module.exports = {
    KNOWLEDGE_GATEWAY_FUNCTION,
    createKnowledgeServerGatewayClient,
    readGatewayError,
    withTimeout
};
