const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createSettingsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

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

            return sendMethodNotAllowed(sendError, res, requestId);
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

            return sendMethodNotAllowed(sendError, res, requestId);
        }
    };
}

module.exports = {
    createSettingsController
};
