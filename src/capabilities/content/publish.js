function normalizeArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeBoolean(value, defaultValue) {
    if (typeof value === 'boolean') return value;
    return defaultValue;
}

function normalizePlatforms(value) {
    const list = Array.isArray(value) ? value : [value];
    const normalized = list
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean)
        .map((item) => (item.includes('wordpress') ? 'wordpress' : 'naver'));
    return Array.from(new Set(normalized.length > 0 ? normalized : ['naver']));
}

function normalizePublishParams(params = {}) {
    const settingsOverrides = (params.settingsOverrides && typeof params.settingsOverrides === 'object' && !Array.isArray(params.settingsOverrides))
        ? { ...params.settingsOverrides }
        : {};
    const options = (params.options && typeof params.options === 'object' && !Array.isArray(params.options))
        ? { ...params.options }
        : {};

    options.post_status = normalizeString(options.post_status) === 'draft' ? 'draft' : 'publish';

    return {
        targetRowIndices: normalizeArray(params.targetRowIndices),
        settingsOverrides,
        target: normalizeString(params.target) || 'selected',
        platforms: normalizePlatforms(params.platforms),
        options,
        auto_trigger: normalizeBoolean(params.auto_trigger, true)
    };
}

function buildPublishRequestPreview(params = {}) {
    const normalizedParams = normalizePublishParams(params);
    return {
        kind: 'publish_request',
        summary: normalizedParams.auto_trigger === false ? '등록까지만 진행합니다.' : '발행 실행을 준비합니다.',
        target: normalizedParams.target || 'selected',
        target_row_count: normalizedParams.targetRowIndices.length,
        platforms: normalizedParams.platforms,
        auto_trigger: normalizedParams.auto_trigger,
        options: {
            post_status: normalizedParams.options.post_status
        },
        settings: {
            headless: normalizedParams.settingsOverrides.PUBLISH_AUTO_HEADLESS === true
        }
    };
}

function createPublishCapabilities(deps = {}) {
    return [
        {
            id: 'content.publish.prepare',
            type: 'content.publish',
            domain: 'content.publish',
            confirmPolicy: 'never',
            validate(params = {}) {
                return {
                    ok: true,
                    errors: [],
                    normalizedParams: normalizePublishParams(params)
                };
            },
            async preview(params = {}) {
                const normalizedParams = normalizePublishParams(params);
                return buildPublishRequestPreview(normalizedParams);
            },
            async execute(params = {}) {
                const normalizedParams = normalizePublishParams(params);
                return {
                    success: true,
                    message: '발행 준비를 마쳤습니다.',
                    data: normalizedParams,
                    sideEffects: []
                };
            }
        },
        {
            id: 'content.publish.execute',
            type: 'content.publish',
            domain: 'content.publish',
            confirmPolicy: 'required',
            validate(params = {}) {
                return {
                    ok: true,
                    errors: [],
                    normalizedParams: normalizePublishParams(params)
                };
            },
            async preview(params = {}) {
                const normalizedParams = normalizePublishParams(params);
                return buildPublishRequestPreview(normalizedParams);
            },
            async execute(params = {}) {
                const normalizedParams = normalizePublishParams(params);
                const axios = deps.axios || require('axios');
                const CONFIG = deps.CONFIG || require('../../config-loader');
                const port = CONFIG.UI_SERVER_PORT || 4577;

                const statusRes = await axios.get(`http://127.0.0.1:${port}/api/v1/auto/status`);
                const isRunning = statusRes.data?.data?.running === true;
                if (isRunning) {
                    return {
                        success: false,
                        message: '이미 다른 발행 작업이 실행 중입니다.',
                        data: {
                            running: true
                        },
                        sideEffects: []
                    };
                }

                const postData = {
                    settingsOverrides: normalizedParams.settingsOverrides
                };
                if (normalizedParams.targetRowIndices.length > 0) {
                    postData.targetRowIndices = normalizedParams.targetRowIndices;
                }

                await axios.post(`http://127.0.0.1:${port}/api/v1/auto/publish/run`, postData);

                return {
                    success: true,
                    message: '발행 작업을 시작했습니다.',
                    data: {
                        targetRowIndices: normalizedParams.targetRowIndices,
                        targetRowCount: normalizedParams.targetRowIndices.length,
                        platforms: normalizedParams.platforms,
                        options: normalizedParams.options,
                        auto_trigger: normalizedParams.auto_trigger
                    },
                    sideEffects: ['publish_run_started']
                };
            }
        }
    ];
}

module.exports = {
    createPublishCapabilities,
    buildPublishRequestPreview,
    normalizePublishParams
};
