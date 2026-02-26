function createApiError(status, code, message) {
    const err = new Error(message || '요청 처리 중 오류가 발생했습니다.');
    err.status = Number.isInteger(status) ? status : 400;
    err.apiCode = code || 'API_ERROR';
    return err;
}

module.exports = {
    createApiError
};

