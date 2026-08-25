const test = require('node:test');
const assert = require('node:assert/strict');

const {
    resolveImagePlan,
    buildBlogImagePlanPrompt,
    validateBlogImageBlocks
} = require('./blog-image-plan');

function blogProfile({ preset = 'standard', mode = 'auto', fixedCount = null } = {}) {
    return {
        length: { preset },
        image_plan: { count_mode: mode, fixed_count: fixedCount }
    };
}

function imageBlocks(count, indexes = null) {
    return (indexes || Array.from({ length: count }, (_unused, index) => index))
        .map((index) => `[[IMAGE_${index}\ntitle: 이미지 ${index}\nprompt: image ${index}\n]]`)
        .join('\n\n');
}

test('image plan resolves post override before fixed profile and auto length mapping', () => {
    assert.deepEqual(resolveImagePlan({
        post_count: 2,
        blog_profile: blogProfile({ preset: 'long', mode: 'fixed', fixedCount: 6 })
    }), { count: 2, source: 'post', length_preset: null });

    assert.deepEqual(resolveImagePlan({
        blog_profile: blogProfile({ preset: 'long', mode: 'fixed', fixedCount: 6 })
    }), { count: 6, source: 'profile_fixed', length_preset: 'long' });

    assert.equal(resolveImagePlan({ blog_profile: blogProfile({ preset: 'short' }) }).count, 3);
    assert.equal(resolveImagePlan({ blog_profile: blogProfile({ preset: 'standard' }) }).count, 4);
    assert.equal(resolveImagePlan({ blog_profile: blogProfile({ preset: 'long' }) }).count, 5);
});

test('image plan uses fallback four only for an unresolved profile and rejects invalid explicit counts', () => {
    assert.deepEqual(resolveImagePlan({ blog_profile: {} }), {
        count: 4,
        source: 'fallback',
        length_preset: null
    });
    for (const value of [0, 7, 2.5, 'abc']) {
        assert.throws(
            () => resolveImagePlan({ post_count: value, blog_profile: blogProfile() }),
            (error) => error.code === 'INVALID_BLOG_IMAGE_COUNT'
        );
    }
});

test('image plan prompt requests one exact count and keeps regions when generation is off', () => {
    const prompt = buildBlogImagePlanPrompt({ count: 3 });
    assert.match(prompt, /정확히 3개/);
    assert.match(prompt, /0부터 2까지/);
    assert.match(prompt, /실제 AI 이미지 파일 생성 여부와 무관하게/);
    assert.doesNotMatch(prompt, /3~4/);
});

test('image block validation accepts exact sequential blocks and rejects missing duplicate or skipped indexes', () => {
    assert.deepEqual(validateBlogImageBlocks(imageBlocks(3), { count: 3 }), {
        count: 3,
        indexes: [0, 1, 2]
    });
    for (const content of [imageBlocks(2), imageBlocks(3, [0, 1, 1]), imageBlocks(3, [0, 2, 3])]) {
        assert.throws(
            () => validateBlogImageBlocks(content, { count: 3 }),
            (error) => error.code === 'BLOG_IMAGE_PLAN_MISMATCH'
        );
    }
});
