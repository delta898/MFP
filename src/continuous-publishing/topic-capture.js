const { TOPIC_STATUS } = require('./contract');
const { validateBlogWritingOverrides } = require('../content/blog-writing-overrides');
const { requireSinglePublishTarget } = require('../content/single-publish-target');

const READY_POST_STATUSES = Object.freeze(['publish', 'draft', 'schedule']);
const CAPTURE_PLATFORMS = Object.freeze(['naver', 'wordpress', 'site-hosting']);
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
        .filter((item) => CAPTURE_PLATFORMS.includes(item));
}

function normalizeSiteTarget(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const projectId = normalizeText(value.project_id ?? value.projectId);
    const siteId = normalizeText(value.site_id ?? value.siteId);
    const kind = normalizeText(value.kind ?? value.site_kind ?? value.siteKind).toLowerCase();
    if (!projectId || !siteId || !['blog', 'vault'].includes(kind)) return null;
    return {
        project_id: projectId,
        site_id: siteId,
        kind,
        ...(kind === 'vault' && normalizeText(value.destination_path ?? value.destinationPath)
            ? { destination_path: normalizeText(value.destination_path ?? value.destinationPath).replace(/\\/gu, '/') }
            : {})
    };
}

function isValidYmd(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getScheduleDateIssue(scheduleDate, now = Date.now()) {
    const value = normalizeText(scheduleDate);
    const scheduleMs = Date.parse(value);
    if (!value || !Number.isFinite(scheduleMs)) {
        return { code: 'SCHEDULE_DATE_REQUIRED', message: '예약 발행 일시를 입력해 주세요.' };
    }
    const numericNow = Number(now);
    const nowMs = now instanceof Date
        ? now.getTime()
        : (Number.isFinite(numericNow) ? numericNow : (Date.parse(now) || Date.now()));
    if (Number.isFinite(nowMs) && scheduleMs <= nowMs) {
        return { code: 'SCHEDULE_DATE_PAST', message: '예약 일시는 현재 시각 이후로 선택해 주세요.' };
    }
    return null;
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

    const source = normalizeText(input.source) === 'naver_trend' ? 'naver_trend' : 'blog_next';
    const writingOverrides = validateBlogWritingOverrides(input.writingOverrides || input.writing_overrides).value;
    return {
        subject: normalizeText(input.subject),
        title: normalizeText(input.title),
        keywords: normalizeList(input.keywords),
        instruction: normalizeText(input.instruction),
        referenceUrls: normalizeList(input.referenceUrls || input.referenceUrl),
        platforms: normalizePlatforms(input.platforms || input.targets),
        siteTarget: normalizeSiteTarget(input.siteTarget ?? input.site_target),
        naverCategory: normalizeText(input.naverCategory),
        wordpressCategory: normalizeText(input.wordpressCategory),
        writingStrategy: normalizeEnum(input.writingStrategy, WRITING_STRATEGIES, 'search'),
        writingOverrides,
        imageMode,
        externalReference: input.externalReference !== false,
        postStatus,
        scheduleDate: normalizeText(input.scheduleDate),
        source,
        trendDate: source === 'naver_trend' ? normalizeText(input.trendDate) : ''
    };
}

function validateTopicCapture(input = {}, options = {}) {
    const topic = normalizeTopicCaptureInput(input);
    const ready = options.ready === true;
    const errors = [];
    errors.push(...validateBlogWritingOverrides(input.writingOverrides || input.writing_overrides).errors);

    if (ready && !topic.subject) {
        errors.push({ field: 'subject', code: 'SUBJECT_REQUIRED', message: '대기열에 추가하려면 주제를 입력해 주세요.' });
    } else if (!hasIdeaSeed(topic)) {
        errors.push({ field: 'idea', code: 'IDEA_REQUIRED', message: '주제, 키워드, 지시사항 또는 참고 URL 중 하나를 입력해 주세요.' });
    }

    const invalidReferenceUrl = topic.referenceUrls.find((url) => !/^https?:\/\//i.test(url));
    if (invalidReferenceUrl) {
        errors.push({ field: 'referenceUrls', code: 'REFERENCE_URL_INVALID', message: '참고 URL은 http 또는 https 주소로 입력해 주세요.' });
    }

    const rawSiteTarget = input.siteTarget ?? input.site_target;
    const destinationPath = topic.siteTarget?.destination_path || '';
    const invalidVaultPath = destinationPath && (destinationPath.length > 2000
        || destinationPath.startsWith('/')
        || /^[a-zA-Z]:/u.test(destinationPath)
        || (destinationPath !== '.' && destinationPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')));
    if (rawSiteTarget && !topic.siteTarget) {
        errors.push({ field: 'siteTarget', code: 'SITE_TARGET_INVALID', message: '선택한 사이트 정보를 확인해 주세요.' });
    } else if (invalidVaultPath) {
        errors.push({ field: 'siteTarget', code: 'SITE_DESTINATION_INVALID', message: 'Vault 저장 폴더 경로를 확인해 주세요.' });
    }

    if (topic.source === 'naver_trend' && !isValidYmd(topic.trendDate)) {
        errors.push({ field: 'trendDate', code: 'TREND_DATE_INVALID', message: '선택한 트렌드의 기준일을 확인해 주세요.' });
    }

    if (ready && topic.platforms.length === 0) {
        errors.push({ field: 'platforms', code: 'PLATFORM_REQUIRED', message: '포스팅 대상을 하나 선택해 주세요.' });
    } else if (topic.platforms.length > 1) {
        errors.push({ field: 'platforms', code: 'MULTIPLE_PUBLISH_TARGETS', message: '하나의 글감에는 포스팅 대상을 하나만 선택할 수 있습니다.' });
    }

    if (ready && topic.platforms.includes('site-hosting')) {
        errors.push({ field: 'platforms', code: 'PUBLISH_TARGET_UNSUPPORTED', message: '사이트 포스팅 대기열 실행은 아직 지원하지 않습니다.' });
    }

    if (topic.postStatus === 'schedule' && (ready || topic.scheduleDate)) {
        const issue = getScheduleDateIssue(topic.scheduleDate, options.now);
        if (issue) errors.push({ field: 'scheduleDate', ...issue });
    }

    return { valid: errors.length === 0, errors, topic };
}

function buildTopicSheetRow(input = {}, options = {}) {
    const ready = options.ready === true;
    const validation = validateTopicCapture(input, { ready, now: options.now });
    if (!validation.valid) {
        const error = new Error(validation.errors[0].message);
        error.code = validation.errors[0].code;
        error.details = validation.errors;
        throw error;
    }

    const topic = validation.topic;
    if (ready && !topic.platforms.includes('site-hosting')) requireSinglePublishTarget(topic.platforms);
    const status = ready ? TOPIC_STATUS.READY : TOPIC_STATUS.WAITING;

    return {
        subject: topic.subject,
        keywords: topic.keywords,
        content_guide: {
            additional_instructions: topic.instruction,
            reference_urls: topic.referenceUrls,
            writing_overrides: topic.writingOverrides
        },
        use_external_ref: topic.externalReference,
        image_options: {
            mode: topic.imageMode,
            generate: topic.imageMode === 'generate'
        },
        source: topic.source,
        trendDate: topic.trendDate,
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
            writing_overrides: topic.writingOverrides,
            image_mode: topic.imageMode,
            image_gen: topic.imageMode === 'generate',
            external_reference: topic.externalReference,
            ...(topic.platforms.includes('site-hosting') && topic.siteTarget
                ? { site_target: topic.siteTarget }
                : {})
        }
    };
}

module.exports = {
    IMAGE_MODES,
    READY_PLATFORMS: Object.freeze(['naver', 'wordpress']),
    READY_POST_STATUSES,
    WRITING_STRATEGIES,
    buildTopicSheetRow,
    getScheduleDateIssue,
    normalizeTopicCaptureInput,
    validateTopicCapture
};
