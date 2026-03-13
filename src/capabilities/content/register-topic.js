function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeKeywordList(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeString(item)).filter(Boolean);
    }
    const single = normalizeString(value);
    return single ? [single] : [];
}

function normalizePlatforms(value) {
    const list = Array.isArray(value) ? value : [value];
    const normalized = list
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean)
        .map((item) => (item.includes('wordpress') ? 'wordpress' : 'naver'));
    return Array.from(new Set(normalized.length > 0 ? normalized : ['naver']));
}

function normalizeBoolean(value, defaultValue) {
    if (typeof value === 'boolean') return value;
    return defaultValue;
}

function buildTopicRegistrationPreview(params = {}) {
    const normalizedParams = {
        theme: normalizeString(params.theme),
        keywords: normalizeKeywordList(params.keywords),
        platforms: normalizePlatforms(params.platforms),
        options: {
            image_gen: normalizeBoolean(params.options?.image_gen, false),
            external_reference: normalizeBoolean(params.options?.external_reference, true)
        }
    };

    return {
        kind: 'topic_registration',
        summary: '글감을 등록합니다.',
        theme: normalizedParams.theme,
        keywords: normalizedParams.keywords,
        platforms: normalizedParams.platforms,
        options: {
            image_gen: normalizedParams.options.image_gen,
            external_reference: normalizedParams.options.external_reference
        }
    };
}

function buildRowsFromParams(params = {}, context = {}) {
    const options = params.options || {};
    const platforms = normalizePlatforms(params.platforms);

    return platforms.map((platform) => {
        const isWordPress = platform === 'wordpress';
        const category = isWordPress
            ? normalizeString(options.wordpress_category || options.category)
            : normalizeString(options.naver_category || options.category);

        return {
            subject: normalizeString(params.theme) || '주제 없음',
            keywords: normalizeKeywordList(params.keywords),
            category,
            image_generation: normalizeBoolean(options.image_gen, false),
            use_external_ref: normalizeBoolean(options.external_reference, true),
            post_status: normalizeString(options.post_status),
            options: {
                ...(options || {})
            },
            source: normalizeString(params.source || context?.channel || 'manual'),
            chatId: context?.user?.id || ''
        };
    });
}

function normalizeRegisterTopicParams(params = {}, context = {}) {
    const theme = normalizeString(params.theme);
    const keywords = normalizeKeywordList(params.keywords);
    const options = (params.options && typeof params.options === 'object' && !Array.isArray(params.options))
        ? { ...params.options }
        : {};

    options.image_gen = normalizeBoolean(options.image_gen, false);
    options.external_reference = normalizeBoolean(options.external_reference, true);
    options.post_status = normalizeString(options.post_status);
    options.category = normalizeString(options.category);
    options.naver_category = normalizeString(options.naver_category);
    options.wordpress_category = normalizeString(options.wordpress_category);

    return {
        theme,
        keywords,
        platforms: normalizePlatforms(params.platforms),
        options,
        source: normalizeString(params.source || context?.channel || 'manual')
    };
}

function createRegisterTopicCapabilities(deps = {}) {
    return [
        {
            id: 'content.register_topic.prepare',
            type: 'content.register',
            domain: 'content.register_topic',
            confirmPolicy: 'never',
            validate(params = {}, context = {}) {
                const normalizedParams = normalizeRegisterTopicParams(params, context);
                const errors = [];
                if (!normalizedParams.theme) {
                    errors.push('theme이 필요합니다.');
                }
                return {
                    ok: errors.length === 0,
                    errors,
                    normalizedParams
                };
            },
            async preview(params = {}, context = {}) {
                const normalizedParams = normalizeRegisterTopicParams(params, context);
                return buildTopicRegistrationPreview(normalizedParams);
            },
            async execute(params = {}, context = {}) {
                const normalizedParams = normalizeRegisterTopicParams(params, context);
                return {
                    success: true,
                    message: '글감 등록 준비를 마쳤습니다.',
                    data: {
                        theme: normalizedParams.theme,
                        keywords: normalizedParams.keywords,
                        platforms: normalizedParams.platforms,
                        options: normalizedParams.options,
                        rows: buildRowsFromParams(normalizedParams, context)
                    },
                    sideEffects: []
                };
            }
        },
        {
            id: 'content.register_topic.execute',
            type: 'content.register',
            domain: 'content.register_topic',
            confirmPolicy: 'required',
            validate(params = {}, context = {}) {
                const normalizedParams = normalizeRegisterTopicParams(params, context);
                const errors = [];
                if (!normalizedParams.theme) {
                    errors.push('theme이 필요합니다.');
                }
                return {
                    ok: errors.length === 0,
                    errors,
                    normalizedParams
                };
            },
            async preview(params = {}, context = {}) {
                const normalizedParams = normalizeRegisterTopicParams(params, context);
                return buildTopicRegistrationPreview(normalizedParams);
            },
            async execute(params = {}, context = {}) {
                const normalizedParams = normalizeRegisterTopicParams(params, context);
                const rows = buildRowsFromParams(normalizedParams, context);
                const appendGoogleSheetTopics = typeof deps.appendGoogleSheetTopics === 'function'
                    ? deps.appendGoogleSheetTopics
                    : ((topics, options) => {
                        const Utils = require('../../utils');
                        return Utils.appendGoogleSheetTopics(topics, options);
                    });
                const appendRes = await appendGoogleSheetTopics(rows, { defaultStatus: '발행 준비 완료' });
                if (!appendRes || appendRes.success === false) {
                    throw new Error(appendRes?.message || '글감 시트 등록에 실패했습니다.');
                }
                return {
                    success: true,
                    message: '글감을 시트 대기열에 등록했습니다.',
                    data: {
                        theme: normalizedParams.theme,
                        keywords: normalizedParams.keywords,
                        platforms: normalizedParams.platforms,
                        options: normalizedParams.options,
                        rowCount: rows.length,
                        rowIndices: appendRes?.rowIndices || [],
                        rows
                    },
                    sideEffects: ['google_sheet_topics_appended']
                };
            }
        }
    ];
}

module.exports = {
    createRegisterTopicCapabilities,
    normalizeRegisterTopicParams,
    buildRowsFromParams,
    buildTopicRegistrationPreview
};
