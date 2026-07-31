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
        },

        async handleTestTelegram({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.testTelegramConnection(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'TELEGRAM_TEST_FAILED', '텔레그램 테스트에 실패했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleTestSlack({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.testSlackConnection(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'SLACK_TEST_FAILED', 'Slack 테스트에 실패했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleTestCustomAi({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.testCustomAiConnection(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'CUSTOM_AI_TEST_FAILED', 'Custom AI 테스트에 실패했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleTestAiModel({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.testAiModelConnection(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'AI_MODEL_CONNECTION_CHECK_FAILED', 'AI 모델 무료 연결 확인에 실패했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleBufferConnection({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.inspectBufferConnection(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'BUFFER_CONNECTION_FAILED', 'Buffer 연결 확인에 실패했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleRegenerateMcpToken({ requestId, method, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.regenerateMcpToken();
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'MCP_TOKEN_REGENERATE_FAILED', 'MCP token 재발급에 실패했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        }
    };
}

module.exports = {
    createSettingsController
};
