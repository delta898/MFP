const { normalizeSnsAiMode } = require('./sns-ai-policy');
const { normalizeHashtagTokens } = require('./sns-content-formatter');

function parseHashtagResponse(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const withoutFence = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    try {
        const parsed = JSON.parse(withoutFence);
        const candidates = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.hashtags) ? parsed.hashtags : []);
        if (candidates.length > 0) return normalizeHashtagTokens(candidates);
    } catch (_error) {
        // Plain hashtag output is accepted below.
    }
    const matches = withoutFence.match(/#[\p{L}\p{N}_]+/gu);
    if (matches?.length) return normalizeHashtagTokens(matches);
    return normalizeHashtagTokens(withoutFence.split(/[\n,]+/));
}

function buildHashtagPrompt(input = {}) {
    return [
        '다음 블로그 글을 SNS에 공유할 때 사용할 관련 해시태그를 최대 5개 생성하세요.',
        '응답은 설명 없이 {"hashtags":["#태그1","#태그2"]} JSON 한 줄만 출력하세요.',
        '중복 태그와 숫자로만 된 태그는 제외하세요.',
        '',
        `제목: ${String(input.title || '').trim()}`,
        `요약: ${String(input.summary || '').trim()}`
    ].join('\n');
}

function createSnsAiService(options = {}) {
    const { CONFIG, Utils, Logger } = options;
    if (!CONFIG || !Utils
        || typeof Utils.callWritingText !== 'function'
        || typeof Utils.callChatText !== 'function') {
        throw new Error('SNS AI Service 의존성이 올바르지 않습니다.');
    }

    async function generateHashtags(input = {}) {
        const mode = normalizeSnsAiMode(input.mode ?? CONFIG.SNS_AI_MODE);
        if (mode === 'none') {
            return { success: true, attempted: false, mode, hashtags: [] };
        }

        const prompt = buildHashtagPrompt(input);
        try {
            const response = mode === 'blog_text'
                ? await Utils.callWritingText(prompt, 1, {
                    usageLabel: 'SNS 콘텐츠 AI',
                    maxTokens: 160,
                    temperature: 0.2
                })
                : await Utils.callChatText(prompt, 1, {
                    usageLabel: 'SNS 콘텐츠 AI',
                    maxTokens: 160,
                    temperature: 0.2
                });
            const hashtags = parseHashtagResponse(response);
            return {
                success: true,
                attempted: true,
                mode,
                hashtags
            };
        } catch (error) {
            Logger?.warn?.(`⚠️ [SNS] AI 해시태그 생성 실패, 해시태그 없이 계속합니다: ${error.message}`);
            return {
                success: false,
                attempted: true,
                mode,
                hashtags: [],
                message: error.message
            };
        }
    }

    return {
        generateHashtags
    };
}

module.exports = {
    parseHashtagResponse,
    buildHashtagPrompt,
    createSnsAiService
};
