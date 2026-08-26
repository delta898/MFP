const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createSettingsController(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 400 });

    return {
        async handleWritingProfile({ requestId, method, requestBody, res }) {
            if (method === 'GET') {
                try {
                    const data = await service.getWritingProfile();
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'WRITING_PROFILE_READ_FAILED', '글쓰기 프로필을 읽지 못했습니다.', e);
                }
            }

            if (method === 'PUT') {
                try {
                    const data = await service.saveWritingProfile(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'WRITING_PROFILE_SAVE_FAILED', '글쓰기 프로필을 저장하지 못했습니다.', e);
                }
            }

            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleUseDefaultWritingProfile({ requestId, method, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.useDefaultWritingProfile();
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'WRITING_PROFILE_DEFAULT_FAILED', '기본 글쓰기 프로필로 전환하지 못했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleWritingProfileReferenceAnalysis({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.analyzeWritingProfileReferences(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'STYLE_REFERENCE_ANALYSIS_FAILED', '참고 문체를 분석하지 못했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleWritingProfileReferenceDelete({ requestId, method, res }) {
            if (method === 'DELETE') {
                try {
                    const data = await service.deleteWritingProfileReferences();
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'STYLE_REFERENCE_DELETE_FAILED', '참고 문체 자료를 삭제하지 못했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

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

        async handleTestAiModel({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.testAiModelConnection(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'AI_MODEL_CONNECTION_CHECK_FAILED', 'AI 모델 연결 확인에 실패했습니다.', e);
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
