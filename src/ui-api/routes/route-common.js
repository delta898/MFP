function methodNotAllowed({ sendError, res, requestId }) {
    return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
}

function ensureMethod({ method, allowed, sendError, res, requestId }) {
    const list = Array.isArray(allowed) ? allowed : [allowed];
    if (!list.includes(method)) {
        methodNotAllowed({ sendError, res, requestId });
        return false;
    }
    return true;
}

async function withError({ sendError, res, requestId, status = 500, code, defaultMessage }, fn) {
    try {
        return await fn();
    } catch (e) {
        const msg = e?.message || defaultMessage || '요청 처리 중 오류가 발생했습니다.';
        return sendError(res, requestId, status, code || 'INTERNAL_ERROR', msg);
    }
}

module.exports = {
    methodNotAllowed,
    ensureMethod,
    withError
};

