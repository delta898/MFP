const { provenanceFromRuntimeContext } = require('../../../services/memory/interaction-provenance');
const { TOPIC_STATUS } = require('../../../services/topics/contract');

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

function normalizePlatforms(value, fallback = ['naver']) {
    const list = Array.isArray(value) ? value : [value];
    const normalized = list
        .map((item) => normalizeString(item).toLowerCase())
        .filter(Boolean)
        .map((item) => (item.includes('wordpress') ? 'wordpress' : 'naver'));
    return Array.from(new Set(normalized.length > 0 ? normalized : fallback));
}

function normalizeBoolean(value, defaultValue) {
    if (typeof value === 'boolean') return value;
    return defaultValue;
}

function buildTopicRegistrationPreview(params = {}) {
    const normalizedParams = {
        theme: normalizeString(params.theme),
        keywords: normalizeKeywordList(params.keywords),
        platforms: normalizePlatforms(params.platforms, normalizeString(params.action).toLowerCase() === 'save' && params.platforms === undefined ? [] : ['naver']),
        action: normalizeString(params.action).toLowerCase(),
        options: {
            image_gen: normalizeBoolean(params.options?.image_gen, true),
            external_reference: normalizeBoolean(params.options?.external_reference, true),
            category: normalizeString(params.options?.category),
            naver_category: normalizeString(params.options?.naver_category),
            wordpress_category: normalizeString(params.options?.wordpress_category),
            post_status: normalizeString(params.options?.post_status),
            schedule_date: normalizeString(params.options?.schedule_date),
            writing_strategy: normalizeString(params.options?.writing_strategy),
            title: normalizeString(params.options?.title),
            instruction: normalizeString(params.options?.instruction),
            reference_urls: normalizeKeywordList(params.options?.reference_urls)
        }
    };

    return {
        kind: 'topic_registration',
        summary: normalizedParams.action === 'save' ? '글감을 보관합니다.' : '글감을 발행 대기열에 등록합니다.',
        theme: normalizedParams.theme,
        keywords: normalizedParams.keywords,
        platforms: normalizedParams.platforms,
        action: normalizedParams.action,
        status: normalizedParams.action === 'save' ? TOPIC_STATUS.WAITING : TOPIC_STATUS.READY,
        options: {
            image_gen: normalizedParams.options.image_gen,
            external_reference: normalizedParams.options.external_reference,
            category: normalizedParams.options.category,
            naver_category: normalizedParams.options.naver_category,
            wordpress_category: normalizedParams.options.wordpress_category,
            post_status: normalizedParams.options.post_status,
            schedule_date: normalizedParams.options.schedule_date,
            writing_strategy: normalizedParams.options.writing_strategy,
            title: normalizedParams.options.title,
            instruction: normalizedParams.options.instruction,
            reference_urls: normalizedParams.options.reference_urls
        }
    };
}

function buildRowsFromParams(params = {}, context = {}) {
    const options = params.options || {};
    const platforms = Array.isArray(params.platforms) ? params.platforms : normalizePlatforms(params.platforms);

    return platforms.map((platform) => {
        const isWordPress = platform === 'wordpress';
        const category = isWordPress
            ? normalizeString(options.wordpress_category || options.category)
            : normalizeString(options.naver_category || options.category);

        return {
            subject: normalizeString(params.theme) || '주제 없음',
            keywords: normalizeKeywordList(params.keywords),
            category,
            image_generation: normalizeBoolean(options.image_gen, true),
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
    const action = normalizeString(params.action).toLowerCase();
    const options = (params.options && typeof params.options === 'object' && !Array.isArray(params.options))
        ? { ...params.options }
        : {};

    options.image_gen = normalizeBoolean(options.image_gen, true);
    options.external_reference = normalizeBoolean(options.external_reference, true);
    options.post_status = normalizeString(options.post_status);
    options.category = normalizeString(options.category);
    options.naver_category = normalizeString(options.naver_category);
    options.wordpress_category = normalizeString(options.wordpress_category);
    options.schedule_date = normalizeString(options.schedule_date);
    options.writing_strategy = normalizeString(options.writing_strategy);
    options.title = normalizeString(options.title);
    options.instruction = normalizeString(options.instruction);
    options.reference_urls = normalizeKeywordList(options.reference_urls);

    return {
        theme,
        keywords,
        platforms: normalizePlatforms(params.platforms, action === 'save' && params.platforms === undefined ? [] : ['naver']),
        action,
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
            effect: 'generated_output',
            confirmPolicy: 'never',
            validate(params = {}, context = {}) {
                const normalizedParams = normalizeRegisterTopicParams(params, context);
                const errors = [];
                if (!normalizedParams.theme) {
                    errors.push('theme이 필요합니다.');
                }
                if (!['save', 'enqueue'].includes(normalizedParams.action)) {
                    errors.push('글감을 보관하거나 발행 대기열에 추가할지 지정해 주세요.');
                }
                if (normalizedParams.action === 'enqueue' && (!Array.isArray(params.platforms) || params.platforms.length !== 1)) {
                    errors.push('발행 대기열에 넣을 대상 하나를 선택해 주세요.');
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
                        action: normalizedParams.action,
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
            effect: 'external_side_effect',
            confirmPolicy: 'required',
            agentExposure: deps.blogQueueManagementApplication ? {
                category: '블로그 글감',
                title: '블로그 글감 저장 또는 대기열 등록',
                description: '주제와 선택한 옵션으로 블로그 글감을 보관하거나 발행 대기열에 등록합니다.',
                useWhen: '사용자가 주제를 블로그 글감으로 저장하거나 발행 대기열에 넣으라고 합니다.',
                avoidWhen: '사용자가 원고 작성이나 즉시 발행을 요청합니다.',
                parameterSemantics: {
                    theme: { role: 'explicit_constraint' },
                    keywords: { role: 'explicit_constraint' },
                    action: { role: 'selection' },
                    platforms: { role: 'selection' },
                    options: { role: 'requested_option' }
                },
                requiredInputQuestions: {
                    theme: '어떤 주제로 글감을 등록할까요?',
                    action: '글감을 보관함에 저장할까요, 발행 대기열에 넣을까요?',
                    platforms: '발행 대기열에 넣을 플랫폼을 선택해 주세요. 네이버 블로그와 워드프레스 중 어디인가요?',
                    schedule_date: '예약 발행으로 설정하려면 언제 발행할지 날짜와 시간을 알려주세요.'
                },
                optionalInputSuggestions: {
                    keywords: '키워드는 선택 사항이지만, 함께 저장하면 나중에 글감 검색과 원고 작성에 도움이 됩니다.'
                },
                personalizableParameters: {
                    'options.image_gen': { title: '이미지 생성', allowUserDefault: true },
                    'options.external_reference': { title: '외부 참고자료', allowUserDefault: true }
                },
                inputSchema: {
                    type: 'object',
                    properties: {
                        theme: { type: 'string', minLength: 1, maxLength: 500 },
                        keywords: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 100 } },
                        platforms: { type: 'array', minItems: 1, maxItems: 1, items: { type: 'string', enum: ['naver', 'wordpress'] } },
                        action: { type: 'string', enum: ['save', 'enqueue'] },
                        options: {
                            type: 'object',
                            properties: {
                                image_gen: { type: 'boolean' },
                                external_reference: { type: 'boolean' },
                                category: { type: 'string', maxLength: 120 },
                                naver_category: { type: 'string', maxLength: 120 },
                                wordpress_category: { type: 'string', maxLength: 120 },
                                post_status: { type: 'string', enum: ['publish', 'draft', 'schedule'] },
                                schedule_date: { type: 'string', format: 'date-time' },
                                writing_strategy: { type: 'string', enum: ['search', 'discovery'] },
                                title: { type: 'string', maxLength: 300 },
                                instruction: { type: 'string', maxLength: 2000 },
                                reference_urls: { type: 'array', maxItems: 10, items: { type: 'string', format: 'uri', maxLength: 2000 } }
                            },
                            additionalProperties: false
                        }
                    },
                    required: ['theme', 'action'],
                    allOf: [{
                        if: { properties: { action: { const: 'enqueue' } }, required: ['action'] },
                        then: { required: ['platforms'] }
                    }, {
                        if: { properties: { options: { type: 'object', properties: { post_status: { const: 'schedule' } }, required: ['post_status'] } }, required: ['options'] },
                        then: { properties: { options: { type: 'object', required: ['schedule_date'] } } }
                    }],
                    additionalProperties: false
                },
                outputDescription: '저장된 글감의 상태와 시트 행 정보를 반환합니다.',
                examples: ['가을 여행 주제를 글감으로 보관해줘', '키워드는 오사카 여행으로 해서 발행 대기열에 넣어줘']
            } : undefined,
            validate(params = {}, context = {}) {
                const normalizedParams = normalizeRegisterTopicParams(params, context);
                const errors = [];
                if (!normalizedParams.theme) {
                    errors.push('theme이 필요합니다.');
                }
                if (!['save', 'enqueue'].includes(normalizedParams.action)) {
                    errors.push('글감을 보관하거나 발행 대기열에 추가할지 지정해 주세요.');
                }
                if (normalizedParams.action === 'enqueue' && (!Array.isArray(params.platforms) || params.platforms.length !== 1)) {
                    errors.push('발행 대기열에 넣을 대상 하나를 선택해 주세요.');
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
                const application = deps.blogQueueManagementApplication;
                if (typeof application?.captureTopic !== 'function') {
                    throw new Error('Blog Queue Management Application이 capability composition에 연결되지 않았습니다.');
                }
                const captured = await application.captureTopic({
                    action: normalizedParams.action,
                    subject: normalizedParams.theme,
                    keywords: normalizedParams.keywords,
                    targets: normalizedParams.platforms,
                    naverCategory: normalizedParams.options.naver_category || normalizedParams.options.category,
                    wordpressCategory: normalizedParams.options.wordpress_category || normalizedParams.options.category,
                    title: normalizedParams.options.title,
                    instruction: normalizedParams.options.instruction,
                    referenceUrls: normalizedParams.options.reference_urls,
                    imageMode: normalizedParams.options.image_gen ? 'generate' : 'none',
                    externalReference: normalizedParams.options.external_reference,
                    postStatus: normalizedParams.options.post_status || 'publish',
                    scheduleDate: normalizedParams.options.schedule_date,
                    writingStrategy: normalizedParams.options.writing_strategy,
                    source: normalizedParams.source
                }, {
                    memoryProvenance: provenanceFromRuntimeContext(context)
                });
                return {
                    success: true,
                    message: normalizedParams.action === 'save' ? '글감을 보관했습니다.' : '글감을 발행 대기열에 등록했습니다.',
                    data: {
                        persisted: true,
                        theme: normalizedParams.theme,
                        keywords: normalizedParams.keywords,
                        platforms: normalizedParams.platforms,
                        action: normalizedParams.action,
                        status: captured.status || (normalizedParams.action === 'save' ? TOPIC_STATUS.WAITING : TOPIC_STATUS.READY),
                        options: normalizedParams.options,
                        rowCount: 1,
                        rowIndices: captured.rowIndex === null || captured.rowIndex === undefined ? [] : [captured.rowIndex],
                        rowNumber: captured.rowNumber,
                        rowIndex: captured.rowIndex
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
