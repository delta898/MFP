function createSettingsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;

    function toErrorResponse(res, requestId, fallbackCode, fallbackMessage, e) {
        return sendError(
            res,
            requestId,
            Number(e?.status || 400),
            e?.apiCode || fallbackCode,
            e?.message || fallbackMessage
        );
    }

    return {
        async handleMajor({ requestId, method, requestBody, res }) {
            if (method === 'GET') {
                try {
                    const data = await service.getMajorSettings();
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'SETTINGS_READ_FAILED', '설정 읽기에 실패했습니다.', e);
                }
            }

            if (method === 'POST') {
                try {
                    const data = await service.saveMajorSettings(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'SETTINGS_SAVE_FAILED', '설정 저장에 실패했습니다.', e);
                }
            }

            return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        },

        async handleAdvanced({ requestId, method, requestBody, res }) {
            if (method === 'GET') {
                try {
                    const data = await service.getAdvancedSettings();
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'SETTINGS_READ_FAILED', '설정 읽기에 실패했습니다.', e);
                }
            }

            if (method === 'POST') {
                try {
                    const data = await service.saveAdvancedSettings(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'SETTINGS_SAVE_FAILED', '설정 저장에 실패했습니다.', e);
                }
            }

            return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
        }
    };
}

module.exports = {
    createSettingsController
};
