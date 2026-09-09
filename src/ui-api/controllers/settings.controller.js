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
                    return toErrorResponse(res, requestId, 'STYLE_REFERENCE_ANALYSIS_FAILED', '참고 글을 분석하지 못했습니다.', e);
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
                    return toErrorResponse(res, requestId, 'STYLE_REFERENCE_DELETE_FAILED', '참고 글 자료를 삭제하지 못했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleWritingProfilePreview({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    const data = await service.previewWritingProfile(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'WRITING_PREVIEW_FAILED', '글쓰기 프로필 미리보기를 생성하지 못했습니다.', e);
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

        async handleCoreConnections({ requestId, method, requestBody, res }) {
            if (method === 'GET') {
                try {
                    return sendSuccess(res, requestId, await service.getCoreConnectionSettings());
                } catch (e) {
                    return toErrorResponse(res, requestId, 'SETTINGS_READ_FAILED', '기본 연결 설정을 불러오지 못했습니다.', e);
                }
            }
            if (method === 'POST') {
                try {
                    const data = await service.saveCoreConnectionSettings(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(
                        res,
                        requestId,
                        'SETTINGS_CORE_CONNECTION_SAVE_FAILED',
                        '기본 연결 설정을 저장하지 못했습니다.',
                        e
                    );
                }
            }

            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleAiRoles({ requestId, method, requestBody, res }) {
            if (method === 'GET') {
                try {
                    return sendSuccess(res, requestId, await service.getAiRoleSettings());
                } catch (e) {
                    return toErrorResponse(res, requestId, 'SETTINGS_READ_FAILED', 'AI 모델 설정을 불러오지 못했습니다.', e);
                }
            }
            if (method === 'POST') {
                try {
                    const data = await service.saveAiRoleSettings(requestBody || {});
                    return sendSuccess(res, requestId, data);
                } catch (e) {
                    return toErrorResponse(res, requestId, 'SETTINGS_AI_ROLE_SAVE_FAILED', 'AI 모델 설정을 반영하지 못했습니다.', e);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        },

        async handleOptionalServices({ requestId, method, requestBody, res }) {
            try {
                if (method === 'GET') return sendSuccess(res, requestId, await service.getOptionalServiceSettings());
                if (method === 'POST') return sendSuccess(res, requestId, await service.saveOptionalServiceSettings(requestBody || {}));
                return sendMethodNotAllowed(sendError, res, requestId);
            } catch (e) {
                return toErrorResponse(res, requestId, 'OPTIONAL_SERVICE_SETTINGS_FAILED', '부가 서비스 설정을 처리하지 못했습니다.', e);
            }
        },

        async handleOptionalServiceTest({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try { return sendSuccess(res, requestId, await service.testOptionalServiceConnection(requestBody || {})); }
            catch (e) { return toErrorResponse(res, requestId, 'OPTIONAL_SERVICE_CONNECTION_FAILED', '부가 서비스 연결을 확인하지 못했습니다.', e); }
        },

        async handleAppGeneral({ requestId, method, requestBody, res }) {
            try {
                if (method === 'GET') return sendSuccess(res, requestId, await service.getAppGeneralSettings());
                if (method === 'POST') return sendSuccess(res, requestId, await service.saveAppGeneralSettings(requestBody || {}));
                return sendMethodNotAllowed(sendError, res, requestId);
            } catch (e) {
                return toErrorResponse(res, requestId, 'APP_GENERAL_SETTINGS_FAILED', '앱 일반 설정을 처리하지 못했습니다.', e);
            }
        },
        async handleAppInput({ requestId, method, requestBody, res }) {
            try {
                if (method === 'GET') return sendSuccess(res, requestId, await service.getAppInputSettings());
                if (method === 'POST') return sendSuccess(res, requestId, await service.saveAppInputSettings(requestBody || {}));
                return sendMethodNotAllowed(sendError, res, requestId);
            } catch (e) {
                return toErrorResponse(res, requestId, 'APP_INPUT_SETTINGS_FAILED', '입력 환경 설정을 처리하지 못했습니다.', e);
            }
        },
        async handleExternalConnections({ requestId, method, requestBody, res }) { try { if (method === 'GET') return sendSuccess(res, requestId, await service.getExternalConnectionSettings()); if (method === 'POST') return sendSuccess(res, requestId, await service.saveExternalConnectionSettings(requestBody || {})); return sendMethodNotAllowed(sendError, res, requestId); } catch (e) { return toErrorResponse(res, requestId, 'EXTERNAL_CONNECTION_FAILED', '외부 연결을 처리하지 못했습니다.', e); } },

        async handleTestAiRole({ requestId, method, requestBody, res }) {
            if (method === 'POST') {
                try {
                    return sendSuccess(res, requestId, await service.testAiRoleConnection(requestBody || {}));
                } catch (e) {
                    return toErrorResponse(res, requestId, 'AI_MODEL_CONNECTION_CHECK_FAILED', 'AI 모델 연결을 확인하지 못했습니다.', e);
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
