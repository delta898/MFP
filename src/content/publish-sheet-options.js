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
        imageGeneration: typeof parsedOptions.image_gen === 'boolean'
            ? parsedOptions.image_gen
            : input.imageGeneration === true,
        externalReference: typeof parsedOptions.external_reference === 'boolean'
            ? parsedOptions.external_reference
            : input.externalReference !== false
    };
}

function resolveShoppingSheetState(input = {}) {
    const parsedOptions = parseSheetOptionsValue(input.options);
    const parsedCategory = parseStructuredCategory(input.category);
    const optionNaverCategory = normalizeString(parsedOptions.naver_category);
    const optionWordpressCategory = normalizeString(parsedOptions.wordpress_category);

    return {
        options: parsedOptions,
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

    if (fields.imageGeneration !== undefined) next.image_gen = fields.imageGeneration === true;
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
    mergeShoppingSheetOptions,
    mergeTopicSheetOptions,
    parseSheetOptionsValue,
    parseStructuredCategory,
    resolveShoppingSheetState,
    resolveTopicSheetState,
    stringifySheetOptionsValue
};
