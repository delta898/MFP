const { TOPIC_STATUS } = require('./contract');

const READY_POST_STATUSES = Object.freeze(['publish', 'draft', 'schedule']);
const READY_PLATFORMS = Object.freeze(['naver', 'wordpress']);
const WRITING_STRATEGIES = Object.freeze(['search', 'discovery']);
const IMAGE_MODES = Object.freeze(['generate', 'prompt_only', 'none']);

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeList(value) {
    const values = Array.isArray(value) ? value : normalizeText(value).split(',');
    return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function normalizeEnum(value, allowed, fallback) {
    const normalized = normalizeText(value).toLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
}

function normalizePlatforms(value) {
    return normalizeList(value)
        .map((item) => item.toLowerCase())
        .filter((item) => READY_PLATFORMS.includes(item));
}

function hasIdeaSeed(topic = {}) {
    return Boolean(
        topic.subject
        || topic.keywords.length > 0
        || topic.instruction
        || topic.referenceUrls.length > 0
    );
}

function normalizeTopicCaptureInput(input = {}) {
    const postStatus = normalizeEnum(input.postStatus, READY_POST_STATUSES, 'publish');
    const imageMode = normalizeEnum(input.imageMode, IMAGE_MODES, 'prompt_only');

    return {
        subject: normalizeText(input.subject),
        title: normalizeText(input.title),
        keywords: normalizeList(input.keywords),
        instruction: normalizeText(input.instruction),
        referenceUrls: normalizeList(input.referenceUrls || input.referenceUrl),
        platforms: normalizePlatforms(input.platforms || input.targets),
        naverCategory: normalizeText(input.naverCategory),
        wordpressCategory: normalizeText(input.wordpressCategory),
        writingStrategy: normalizeEnum(input.writingStrategy, WRITING_STRATEGIES, 'search'),
        imageMode,
        externalReference: input.externalReference !== false,
        postStatus,
        scheduleDate: normalizeText(input.scheduleDate)
    };
}

function validateTopicCapture(input = {}, options = {}) {
    const topic = normalizeTopicCaptureInput(input);
    const ready = options.ready === true;
    const errors = [];

    if (!hasIdeaSeed(topic)) {
        errors.push({ field: 'idea', code: 'IDEA_REQUIRED', message: '주제, 키워드, 지시사항 또는 참고 URL 중 하나를 입력해 주세요.' });
    }

    const invalidReferenceUrl = topic.referenceUrls.find((url) => !/^https?:\/\//i.test(url));
    if (invalidReferenceUrl) {
        errors.push({ field: 'referenceUrls', code: 'REFERENCE_URL_INVALID', message: '참고 URL은 http 또는 https 주소로 입력해 주세요.' });
    }

    if (ready && topic.platforms.length === 0) {
        errors.push({ field: 'platforms', code: 'PLATFORM_REQUIRED', message: '발행 대상을 하나 이상 선택해 주세요.' });
    }

    if (ready && topic.postStatus === 'schedule') {
        const scheduleMs = Date.parse(topic.scheduleDate);
        if (!topic.scheduleDate || Number.isNaN(scheduleMs)) {
            errors.push({ field: 'scheduleDate', code: 'SCHEDULE_DATE_REQUIRED', message: '예약 발행 일시를 입력해 주세요.' });
        }
    }

    return { valid: errors.length === 0, errors, topic };
}

function buildTopicSheetRow(input = {}, options = {}) {
    const ready = options.ready === true;
    const validation = validateTopicCapture(input, { ready });
    if (!validation.valid) {
        const error = new Error(validation.errors[0].message);
        error.code = validation.errors[0].code;
        error.details = validation.errors;
        throw error;
    }

    const topic = validation.topic;
    const status = ready ? TOPIC_STATUS.READY : TOPIC_STATUS.WAITING;

    return {
        subject: topic.subject,
        keywords: topic.keywords,
        content_guide: {
            additional_instructions: topic.instruction,
            reference_urls: topic.referenceUrls
        },
        use_external_ref: topic.externalReference,
        image_options: {
            mode: topic.imageMode,
            generate: topic.imageMode === 'generate'
        },
        source: 'blog_next',
        status,
        category: (topic.naverCategory || topic.wordpressCategory)
            ? `N:${topic.naverCategory}, W:${topic.wordpressCategory}`
            : '',
        postStatus: topic.postStatus,
        scheduleDate: topic.postStatus === 'schedule' ? topic.scheduleDate : '',
        targets: topic.platforms,
        writing_strategy: topic.writingStrategy,
        options: {
            title: topic.title,
            platforms: topic.platforms,
            naver_category: topic.naverCategory,
            wordpress_category: topic.wordpressCategory,
            post_status: topic.postStatus,
            schedule_date: topic.postStatus === 'schedule' ? topic.scheduleDate : '',
            writing_strategy: topic.writingStrategy,
            image_mode: topic.imageMode,
            image_gen: topic.imageMode === 'generate',
            external_reference: topic.externalReference
        }
    };
}

module.exports = {
    IMAGE_MODES,
    READY_PLATFORMS,
    READY_POST_STATUSES,
    WRITING_STRATEGIES,
    buildTopicSheetRow,
    normalizeTopicCaptureInput,
    validateTopicCapture
};
