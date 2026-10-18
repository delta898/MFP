'use strict';

function safeModelSelection(value = {}) {
    const provider = String(value.provider || '').trim().toLowerCase();
    const modelId = String(value.modelId || value.code || '').trim();
    return provider && modelId ? { provider, modelId } : null;
}

function createShoppingGenerationApplication(options = {}) {
    const aiGeneration = options.aiGeneration;
    if (!aiGeneration || typeof aiGeneration.generateText !== 'function'
        || typeof aiGeneration.resolveModel !== 'function') {
        throw new TypeError('Shopping Generation Application requires the shared AI Generation service.');
    }
    const getTextModel = typeof options.getTextModel === 'function' ? options.getTextModel : () => options.textModel;
    const logger = options.logger;

    async function generateText(prompt, context = {}) {
        const normalizedPrompt = String(prompt || '').trim();
        if (!normalizedPrompt) throw new TypeError('Shopping manuscript prompt must be a non-empty string.');
        const configuredModel = safeModelSelection(getTextModel() || {});
        const selection = configuredModel && aiGeneration.resolveModel('text', configuredModel);
        if (!selection) {
            throw Object.assign(new Error('쇼핑 글쓰기 모델을 AI Gateway에서 사용할 수 없습니다.'), {
                code: 'SHOPPING_AI_MODEL_UNAVAILABLE'
            });
        }

        const model = aiGeneration.getSupportedModels?.('text')
            ?.find((item) => item.provider === selection.provider && item.code === selection.modelId);
        const startedAt = Date.now();
        logger?.info?.(`[Shopping][AI] text.generate 시작 (model=${model?.name || selection.modelId}, provider=${selection.provider}, modelId=${selection.modelId}, transport=${model?.transport || 'unknown'})`);
        try {
            const result = await aiGeneration.generateText({
                modelSelection: selection,
                prompt: normalizedPrompt,
                ...(context.generationOptions ? { options: context.generationOptions } : {}),
                ...(aiGeneration.supportsFeature?.('text', selection, 'jsonResponse') ? { responseFormat: 'json' } : {})
            }, Object.fromEntries(Object.entries(context).filter(([key]) => key !== 'generationOptions')));
            const content = String(result?.content || '').trim();
            if (!content) {
                throw Object.assign(new Error('AI Gateway가 빈 쇼핑 원고 응답을 반환했습니다.'), {
                    code: 'AI_GATEWAY_INVALID_PROVIDER_RESPONSE'
                });
            }
            logger?.info?.(`[Shopping][AI] text.generate 완료 (modelId=${selection.modelId}, elapsed=${Date.now() - startedAt}ms, response=${content.length}자)`);
            return content;
        } catch (error) {
            logger?.warn?.(`[Shopping][AI] text.generate 실패 (modelId=${selection.modelId}, elapsed=${Date.now() - startedAt}ms, code=${String(error?.code || 'AI_GENERATION_FAILED')})`);
            throw error;
        }
    }

    return Object.freeze({ generateText });
}

module.exports = { safeModelSelection, createShoppingGenerationApplication };
