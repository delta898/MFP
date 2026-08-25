const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CONFIG = require('./config-loader');
const Core = require('./core');
const Utils = require('./utils');
const { getDefaultContentWritingProfile } = require('./content/writing-profile');

test('Core.generateContent uses the selected blog profile composer for the shared blog runtime', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-writing-profile-'));
    const previousProfile = CONFIG.CONTENT_WRITING_PROFILE;
    const previousStrategy = CONFIG.BLOG_WRITING_STRATEGY;
    const previousCallWritingText = Utils.callWritingText;
    let capturedPrompt = '';

    const profile = getDefaultContentWritingProfile();
    profile.common.style_instruction = '핵심 용어는 첫 등장에 쉽게 풀이하세요.';
    profile.channels.blog.length.preset = 'short';
    profile.channels.blog.additional_instruction = '결론에 두 항목 체크리스트를 넣으세요.';
    profile.channels.shopping.additional_instruction = '쇼핑 전용 가격 설명';

    CONFIG.CONTENT_WRITING_PROFILE = profile;
    CONFIG.BLOG_WRITING_STRATEGY = 'search';
    Utils.callWritingText = async (prompt) => {
        capturedPrompt = prompt;
        return JSON.stringify({
            title: '프로필 연결 테스트',
            keywords: ['프로필'],
            hashtags: ['프로필'],
            content: '생성된 본문'
        });
    };

    try {
        const result = await Core.generateContent({
            subject: '프로필 연결',
            keywords: ['글쓰기 프로필'],
            writing_strategy: 'discovery',
            content_guide: {
                additional_instructions: '이번 글에서는 도입을 한 문장으로 작성하세요.',
                reference_urls: []
            },
            use_external_ref: false,
            image_options: { generate: false }
        }, targetDir, {
            platform: 'wordpress',
            enableRelatedPostsAutoLink: false
        });

        assert.equal(result.finalSubject, '프로필 연결 테스트');
        assert.equal(fs.existsSync(path.join(targetDir, 'contents.md')), true);
        assert.match(capturedPrompt, /전략: 발견 중심 \(피드\)/);
        assert.match(capturedPrompt, /약 900~1,200자/);
        assert.match(capturedPrompt, /핵심 용어는 첫 등장에 쉽게 풀이/);
        assert.match(capturedPrompt, /결론에 두 항목 체크리스트/);
        assert.match(capturedPrompt, /이번 글에서는 도입을 한 문장/);
        assert.doesNotMatch(capturedPrompt, /쇼핑 전용 가격 설명/);
    } finally {
        CONFIG.CONTENT_WRITING_PROFILE = previousProfile;
        CONFIG.BLOG_WRITING_STRATEGY = previousStrategy;
        Utils.callWritingText = previousCallWritingText;
        fs.rmSync(targetDir, { recursive: true, force: true });
    }
});
