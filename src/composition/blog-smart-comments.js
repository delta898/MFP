const { createSmartCommentApplication } = require('../applications/blog/smart-comments/application');
const { createNaverSmartCommentCollector } = require('../adapters/naver/smart-comment-candidate-collector');
const {
    generateSmartCommentDraftBatch,
    generateSmartCommentDrafts
} = require('../applications/blog/smart-comments/draft-generator');

function createBlogSmartCommentApplication(deps = {}) {
    const { CONFIG = {}, Logger, aiGenerationService, checkNaverSessionForUi, BrowserLauncher } = deps;
    const collector = deps.smartCommentCollector || createNaverSmartCommentCollector({ BrowserLauncher, CONFIG, Logger });

    async function callCommentDraftModel(mode, prompt, maxTokens = 768) {
        if (typeof aiGenerationService?.generateText !== 'function') {
            throw new Error('AI Gateway 기반 AI Generation 서비스를 사용할 수 없습니다.');
        }
        const configured = mode === 'custom' ? CONFIG.CHAT_MODEL_CONFIG : CONFIG.TEXT_MODEL_CONFIG;
        const result = await aiGenerationService.generateText({
            modelSelection: {
                provider: String(configured?.provider || '').trim().toLowerCase(),
                modelId: String(configured?.code || '').trim()
            },
            prompt,
            options: { maxOutputTokens: maxTokens, temperature: 0.6, reasoningEffort: 'low' },
            responseFormat: 'json'
        });
        return result?.content ?? result;
    }

    return createSmartCommentApplication({
        config: CONFIG,
        logger: Logger,
        getChatModelCode: () => CONFIG.CHAT_MODEL_CONFIG?.code,
        checkSession: checkNaverSessionForUi,
        collectCandidates: (options) => collector.collect(options),
        generateBatch: ({ aiMode, candidates, maxChars }) => generateSmartCommentDraftBatch({
            aiMode, items: candidates, maxChars, logger: Logger, callModel: callCommentDraftModel
        }),
        generateDraft: (options) => generateSmartCommentDrafts({
            ...options, logger: Logger, callModel: callCommentDraftModel
        })
    });
}

module.exports = { createBlogSmartCommentApplication };
