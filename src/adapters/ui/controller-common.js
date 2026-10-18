function createControllerErrorResponder(sendError, options = {}) {
    const defaultStatus = Number.isInteger(options.defaultStatus) ? options.defaultStatus : 400;
    return function toErrorResponse(res, requestId, fallbackCode, fallbackMessage, e) {
        return sendError(
            res,
            requestId,
            Number(e?.status || defaultStatus),
            e?.apiCode || fallbackCode,
            e?.message || fallbackMessage
        );
    };
}

function sendMethodNotAllowed(sendError, res, requestId) {
    return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
}

module.exports = {
    createControllerErrorResponder,
    sendMethodNotAllowed
};
