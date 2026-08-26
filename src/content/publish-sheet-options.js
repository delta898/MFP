const { normalizeWritingStrategyOverride } = require('./writing-strategy');
const { normalizeBlogImageMode } = require('./blog-image-mode');

const SHEET_IMAGE_MODE_LABELS = Object.freeze({
    generate: '이미지 생성',
    prompt_only: '프롬프트 포함',
    none: '미포함'
});

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeString(item)).filter(Boolean);
    }
    const single = normalizeString(value);
    if (!single) return [];
    return single
        .split(',')
        .map((item) => normalizeString(item))
        .filter(Boolean);
}

function normalizeOptionalImageCount(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const numeric = Number(String(value).trim());
    return Number.isInteger(numeric) && numeric >= 1 && numeric <= 6 ? numeric : null;
}

function parseSheetImageModeValue(value, options = {}) {
    const normalized = normalizeString(value).toLowerCase();
    const aliases = {
        generate: 'generate',
        '이미지 생성': 'generate',
        yes: 'generate',
        y: 'generate',
        true: 'generate',
        '예': 'generate',
        prompt_only: 'prompt_only',
        'prompt only': 'prompt_only',
        '프롬프트 포함': 'prompt_only',
        '프롬프트만 포함': 'prompt_only',
        no: 'prompt_only',
        n: 'prompt_only',
        false: 'prompt_only',
        '아니오': 'prompt_only',
        none: 'none',
        '미포함': 'none',
        '이미지 사용 안 함': 'none'
    };
    if (aliases[normalized]) return aliases[normalized];
    return normalizeBlogImageMode(options.mode, {
        legacyGenerate: options.legacyGenerate,
        fallback: options.fallback || 'prompt_only'
    });
}

function formatSheetImageModeValue(mode) {
    return SHEET_IMAGE_MODE_LABELS[normalizeBlogImageMode(mode)] || SHEET_IMAGE_MODE_LABELS.prompt_only;
}

function parseSheetOptionsValue(rawValue) {
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        return { ...rawValue };
    }

    const text = normalizeString(rawValue);
    if (!text) return {};

    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { ...parsed };
        }
        return {};
    } catch (_error) {
        return { post_status: text };
    }
}

function stringifySheetOptionsValue(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) return '';

    const cleaned = {};
    Object.entries(options).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (typeof value === 'string') {
            const trimmed = normalizeString(value);
            if (trimmed) cleaned[key] = trimmed;
            return;
        }
        if (Array.isArray(value)) {
            const normalized = value
                .map((item) => (typeof item === 'string' ? normalizeString(item) : item))
                .filter((item) => item !== '' && item !== undefined && item !== null);
            if (normalized.length > 0) cleaned[key] = normalized;
            return;
        }
        cleaned[key] = value;
    });

    return Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : '';
}

function parseStructuredCategory(rawCategory = '') {
    const category = normalizeString(rawCategory);
    const naverMatch = category.match(/(?:^|,)\s*N:\s*([^,]*)/i);
    const wordpressMatch = category.match(/(?:^|,)\s*W:\s*([^,]*)/i);

    return {
        naverCategory: normalizeString(naverMatch ? naverMatch[1] : ''),
        wordpressCategory: normalizeString(wordpressMatch ? wordpressMatch[1] : '')
    };
}

function buildStructuredCategory(input = {}) {
    const category = normalizeString(input.category);
    const naverCategory = normalizeString(input.naverCategory);
    const wordpressCategory = normalizeString(input.wordpressCategory);

    if (naverCategory || wordpressCategory) {
        return `N:${naverCategory}, W:${wordpressCategory}`;
    }

    return category;
}

function resolveTopicSheetState(input = {}) {
    const parsedOptions = parseSheetOptionsValue(input.options);
    const parsedCategory = parseStructuredCategory(input.category);
    const optionNaverCategory = normalizeString(parsedOptions.naver_category);
    const optionWordpressCategory = normalizeString(parsedOptions.wordpress_category);

    const category = buildStructuredCategory({
        category: normalizeString(parsedOptions.category) || normalizeString(input.category),
        naverCategory: optionNaverCategory || parsedCategory.naverCategory,
        wordpressCategory: optionWordpressCategory || parsedCategory.wordpressCategory
    });

    const explicitColumnImageMode = normalizeString(input.imageMode);
    const imageMode = parseSheetImageModeValue(explicitColumnImageMode || parsedOptions.image_mode, {
        legacyGenerate: typeof parsedOptions.image_gen === 'boolean'
            ? parsedOptions.image_gen
            : input.imageGeneration,
        fallback: 'prompt_only'
    });

    return {
        options: parsedOptions,
        subject: normalizeString(parsedOptions.subject) || normalizeString(input.subject),
        keywords: Array.isArray(parsedOptions.keywords)
            ? normalizeStringArray(parsedOptions.keywords)
            : normalizeStringArray(input.keywords),
        instruction: normalizeString(parsedOptions.instruction) || normalizeString(input.instruction),
        referenceUrls: Array.isArray(parsedOptions.reference_urls)
            ? normalizeStringArray(parsedOptions.reference_urls)
            : normalizeStringArray(input.referenceUrls),
        category,
        naverCategory: optionNaverCategory || parsedCategory.naverCategory,
        wordpressCategory: optionWordpressCategory || parsedCategory.wordpressCategory,
        postStatus: normalizeString(parsedOptions.post_status) || normalizeString(input.postStatus) || 'publish',
        scheduleDate: normalizeString(parsedOptions.schedule_date) || normalizeString(input.scheduleDate),
        imageMode,
        imageGeneration: imageMode === 'generate',
        imageCount: parsedOptions.image_count !== undefined
            ? parsedOptions.image_count
            : input.imageCount,
        externalReference: typeof parsedOptions.external_reference === 'boolean'
            ? parsedOptions.external_reference
            : input.externalReference !== false,
        writingStrategy: normalizeWritingStrategyOverride(parsedOptions.writing_strategy)
    };
}

function resolveShoppingSheetState(input = {}) {
    const parsedOptions = parseSheetOptionsValue(input.options);
    const parsedCategory = parseStructuredCategory(input.category);
    const optionNaverCategory = normalizeString(parsedOptions.naver_category);
    const optionWordpressCategory = normalizeString(parsedOptions.wordpress_category);

    return {
        options: parsedOptions,
        instruction: normalizeString(parsedOptions.instruction) || normalizeString(input.instruction),
        category: buildStructuredCategory({
            category: normalizeString(parsedOptions.category) || normalizeString(input.category),
            naverCategory: optionNaverCategory || parsedCategory.naverCategory,
            wordpressCategory: optionWordpressCategory || parsedCategory.wordpressCategory
        }),
        naverCategory: optionNaverCategory || parsedCategory.naverCategory,
        wordpressCategory: optionWordpressCategory || parsedCategory.wordpressCategory,
        postStatus: normalizeString(parsedOptions.post_status) || normalizeString(input.postStatus) || 'publish',
        scheduleDate: normalizeString(parsedOptions.schedule_date) || normalizeString(input.scheduleDate)
    };
}

function applyStringOption(target, key, value) {
    const normalized = normalizeString(value);
    if (normalized) target[key] = normalized;
    else delete target[key];
}

function applyArrayOption(target, key, value) {
    const normalized = normalizeStringArray(value);
    if (normalized.length > 0) target[key] = normalized;
    else delete target[key];
}

function mergeTopicSheetOptions(existingOptions = {}, fields = {}) {
    const next = parseSheetOptionsValue(existingOptions);

    if (fields.subject !== undefined) applyStringOption(next, 'subject', fields.subject);
    if (fields.keywords !== undefined) applyArrayOption(next, 'keywords', fields.keywords);
    if (fields.instruction !== undefined) applyStringOption(next, 'instruction', fields.instruction);
    if (fields.referenceUrls !== undefined) applyArrayOption(next, 'reference_urls', fields.referenceUrls);
    if (fields.postStatus !== undefined) applyStringOption(next, 'post_status', fields.postStatus);
    if (fields.scheduleDate !== undefined) applyStringOption(next, 'schedule_date', fields.scheduleDate);
    if (fields.writingStrategy !== undefined) {
        applyStringOption(next, 'writing_strategy', normalizeWritingStrategyOverride(fields.writingStrategy));
    }

    if (fields.imageMode !== undefined || fields.imageGeneration !== undefined) {
        const imageMode = parseSheetImageModeValue(fields.imageMode, {
            legacyGenerate: typeof fields.imageGeneration === 'boolean' ? fields.imageGeneration : undefined
        });
        next.image_mode = imageMode;
        next.image_gen = imageMode === 'generate';
    }
    if (fields.imageCount !== undefined) {
        const imageCount = normalizeOptionalImageCount(fields.imageCount);
        if (imageCount !== null) next.image_count = imageCount;
        else delete next.image_count;
    }
    if (fields.externalReference !== undefined) next.external_reference = fields.externalReference === true;

    if (fields.platforms !== undefined) {
        const normalizedPlatforms = Array.isArray(fields.platforms)
            ? fields.platforms.map((item) => normalizeString(item).toLowerCase()).filter(Boolean)
            : normalizeStringArray(fields.platforms).map((item) => item.toLowerCase());
        if (normalizedPlatforms.length > 0) next.platforms = Array.from(new Set(normalizedPlatforms));
        else delete next.platforms;
    }

    if (
        fields.category !== undefined
        || fields.naverCategory !== undefined
        || fields.wordpressCategory !== undefined
    ) {
        const structuredFromCategory = parseStructuredCategory(fields.category);
        const naverCategory = fields.naverCategory !== undefined
            ? normalizeString(fields.naverCategory)
            : structuredFromCategory.naverCategory;
        const wordpressCategory = fields.wordpressCategory !== undefined
            ? normalizeString(fields.wordpressCategory)
            : structuredFromCategory.wordpressCategory;
        const combinedCategory = buildStructuredCategory({
            category: fields.category,
            naverCategory,
            wordpressCategory
        });

        applyStringOption(next, 'category', combinedCategory);
        if (fields.category !== undefined || fields.naverCategory !== undefined) {
            applyStringOption(next, 'naver_category', naverCategory);
        }
        if (fields.category !== undefined || fields.wordpressCategory !== undefined) {
            applyStringOption(next, 'wordpress_category', wordpressCategory);
        }
    }

    return next;
}

function mergeShoppingSheetOptions(existingOptions = {}, fields = {}) {
    const next = parseSheetOptionsValue(existingOptions);

    if (fields.instruction !== undefined) applyStringOption(next, 'instruction', fields.instruction);
    if (fields.postStatus !== undefined) applyStringOption(next, 'post_status', fields.postStatus);
    if (fields.scheduleDate !== undefined) applyStringOption(next, 'schedule_date', fields.scheduleDate);

    if (
        fields.category !== undefined
        || fields.naverCategory !== undefined
        || fields.wordpressCategory !== undefined
    ) {
        const structuredFromCategory = parseStructuredCategory(fields.category);
        const naverCategory = fields.naverCategory !== undefined
            ? normalizeString(fields.naverCategory)
            : structuredFromCategory.naverCategory;
        const wordpressCategory = fields.wordpressCategory !== undefined
            ? normalizeString(fields.wordpressCategory)
            : structuredFromCategory.wordpressCategory;
        const combinedCategory = buildStructuredCategory({
            category: fields.category,
            naverCategory,
            wordpressCategory
        });

        applyStringOption(next, 'category', combinedCategory);
        if (fields.category !== undefined || fields.naverCategory !== undefined) {
            applyStringOption(next, 'naver_category', naverCategory);
        }
        if (fields.category !== undefined || fields.wordpressCategory !== undefined) {
            applyStringOption(next, 'wordpress_category', wordpressCategory);
        }
    }

    return next;
}

module.exports = {
    buildStructuredCategory,
    formatSheetImageModeValue,
    mergeShoppingSheetOptions,
    mergeTopicSheetOptions,
    parseSheetOptionsValue,
    parseSheetImageModeValue,
    parseStructuredCategory,
    resolveShoppingSheetState,
    resolveTopicSheetState,
    stringifySheetOptionsValue
};
