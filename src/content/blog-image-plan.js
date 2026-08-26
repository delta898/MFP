const { normalizeBlogImageMode, includesBlogImagePrompts } = require('./blog-image-mode');

const AUTO_IMAGE_COUNT_BY_LENGTH = Object.freeze({
    short: 3,
    standard: 4,
    long: 5
});

const MIN_BLOG_IMAGE_COUNT = 1;
const MAX_BLOG_IMAGE_COUNT = 6;
const FALLBACK_BLOG_IMAGE_COUNT = 4;

function isProvided(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function parseImageCount(value, path = 'image_options.count') {
    if (!isProvided(value)) return null;
    const numeric = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(numeric) || numeric < MIN_BLOG_IMAGE_COUNT || numeric > MAX_BLOG_IMAGE_COUNT) {
        const error = new Error(`${path} 값은 ${MIN_BLOG_IMAGE_COUNT}~${MAX_BLOG_IMAGE_COUNT} 사이의 정수여야 합니다.`);
        error.code = 'INVALID_BLOG_IMAGE_COUNT';
        error.path = path;
        throw error;
    }
    return numeric;
}

function resolveImagePlan(input = {}) {
    const mode = normalizeBlogImageMode(input.post_mode ?? input.postMode, {
        legacyGenerate: input.post_generate ?? input.postGenerate,
        fallback: 'prompt_only'
    });
    if (!includesBlogImagePrompts(mode)) {
        return { mode, count: 0, source: 'post_mode', length_preset: null };
    }
    const postCount = parseImageCount(input.post_count ?? input.postCount);
    if (postCount !== null) {
        return { mode, count: postCount, source: 'post', length_preset: null };
    }

    const blog = input.blog_profile || input.blogProfile || {};
    const imagePlan = blog.image_plan || {};
    if (imagePlan.count_mode === 'fixed') {
        const fixedCount = parseImageCount(imagePlan.fixed_count, 'channels.blog.image_plan.fixed_count');
        if (fixedCount !== null) {
            return { mode, count: fixedCount, source: 'profile_fixed', length_preset: blog.length?.preset || null };
        }
    }

    const lengthPreset = String(blog.length?.preset || '').trim().toLowerCase();
    const automaticCount = AUTO_IMAGE_COUNT_BY_LENGTH[lengthPreset];
    if (imagePlan.count_mode === 'auto' && automaticCount) {
        return { mode, count: automaticCount, source: 'profile_auto', length_preset: lengthPreset };
    }

    return { mode, count: FALLBACK_BLOG_IMAGE_COUNT, source: 'fallback', length_preset: lengthPreset || null };
}

function buildBlogImagePlanPrompt(plan = {}) {
    if (!includesBlogImagePrompts(plan.mode)) {
        return [
            '[블로그 이미지 영역 계획]',
            '- content 안에 [[IMAGE_N ...]] 이미지 영역이나 이미지 생성 프롬프트를 작성하지 마세요.',
            '- 이미지 없이 자연스럽게 이어지는 본문만 작성하세요.'
        ].join('\n');
    }
    const count = parseImageCount(plan.count, 'image_plan.count') || FALLBACK_BLOG_IMAGE_COUNT;
    return [
        '[블로그 이미지 영역 계획]',
        `- content 안에 [[IMAGE_N ...]] 블록을 정확히 ${count}개 작성하세요. 범위가 아니라 정확히 ${count}개입니다.`,
        `- 이미지 번호는 0부터 ${count - 1}까지 순서대로 한 번씩만 사용하고 중복하거나 건너뛰지 마세요.`,
        '- 실제 AI 이미지 파일 생성 여부와 무관하게 본문 안의 이미지 영역 및 prompt 블록은 유지하세요.'
    ].join('\n');
}

function collectCompleteImageBlockIndexes(content) {
    const text = String(content || '');
    const indexes = [];
    const pattern = /\[\[IMAGE_(\d+)\s*\n[\s\S]*?\n\]\]/g;
    let match;
    while ((match = pattern.exec(text)) !== null) indexes.push(Number(match[1]));
    return indexes;
}

function validateBlogImageBlocks(content, plan = {}) {
    if (!includesBlogImagePrompts(plan.mode)) {
        const actualIndexes = collectCompleteImageBlockIndexes(content);
        if (actualIndexes.length > 0) {
            const error = new Error('이미지 사용 안 함으로 설정된 글에는 이미지 영역이 없어야 합니다.');
            error.code = 'BLOG_IMAGE_PLAN_MISMATCH';
            error.expected_count = 0;
            error.actual_count = actualIndexes.length;
            error.actual_indexes = actualIndexes;
            throw error;
        }
        return { count: 0, indexes: [] };
    }
    const count = parseImageCount(plan.count, 'image_plan.count') || FALLBACK_BLOG_IMAGE_COUNT;
    const actualIndexes = collectCompleteImageBlockIndexes(content);
    const expectedIndexes = Array.from({ length: count }, (_unused, index) => index);
    const valid = actualIndexes.length === expectedIndexes.length
        && actualIndexes.every((value, index) => value === expectedIndexes[index]);
    if (!valid) {
        const error = new Error(`블로그 이미지 영역은 0부터 ${count - 1}까지 정확히 ${count}개여야 합니다.`);
        error.code = 'BLOG_IMAGE_PLAN_MISMATCH';
        error.expected_count = count;
        error.actual_count = actualIndexes.length;
        error.actual_indexes = actualIndexes;
        throw error;
    }
    return { count, indexes: actualIndexes };
}

module.exports = {
    AUTO_IMAGE_COUNT_BY_LENGTH,
    MIN_BLOG_IMAGE_COUNT,
    MAX_BLOG_IMAGE_COUNT,
    FALLBACK_BLOG_IMAGE_COUNT,
    parseImageCount,
    resolveImagePlan,
    buildBlogImagePlanPrompt,
    collectCompleteImageBlockIndexes,
    validateBlogImageBlocks
};
