const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createKeywordDiscoveryController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });

    return {
        async explore({ requestId, method, searchParams, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                const keywords = String(searchParams?.get('keywords') || '').trim();
                const excludedKeywords = String(searchParams?.get('exclude') || '')
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean);
                const sessionId = String(searchParams?.get('session_id') || '').trim();
                const operationId = String(searchParams?.get('operation_id') || '').trim();
                return sendSuccess(res, requestId, await service.explore({ requestId, keywords, excludedKeywords, sessionId, operationId }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'KEYWORD_DISCOVERY_FAILED', '키워드 탐색을 불러오지 못했습니다.', error);
            }
        }
    };
}

module.exports = {
    createKeywordDiscoveryController
};
