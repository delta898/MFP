'use strict';

function safeModelSelection(value = {}) {
    const provider = String(value.provider || '').trim().toLowerCase();
    const modelId = String(value.modelId || value.code || '').trim();
    return provider && modelId ? { provider, modelId } : null;
}

function createSnsGenerationApplication(options = {}) {
    const aiGeneration = options.aiGeneration;
    if (!aiGeneration || typeof aiGeneration.generateText !== 'function'
        || typeof aiGeneration.generateImage !== 'function'
        || typeof aiGeneration.resolveModel !== 'function') {
        throw new TypeError('SNS Generation Application requires the shared AI Generation service.');
    }
    const getWritingModel = typeof options.getWritingModel === 'function' ? options.getWritingModel : () => options.writingModel;
    const getChatModel = typeof options.getChatModel === 'function' ? options.getChatModel : () => options.chatModel;
    const getImageModel = typeof options.getImageModel === 'function' ? options.getImageModel : () => options.imageModel;
    const logger = options.logger;

    function selectionFor(kind) {
        const configured = kind === 'image'
            ? getImageModel()
            : kind === 'writing' ? getWritingModel() : getChatModel();
        const selection = safeModelSelection(configured || {});
        if (!selection) return null;
        return aiGeneration.resolveModel(kind === 'image' ? 'image' : 'text', selection);
    }

    function getModelAvailability(kind) {
        const selection = selectionFor(kind);
        if (!selection) return { available: false, model_name: '' };
        const type = kind === 'image' ? 'image' : 'text';
        const model = aiGeneration.getSupportedModels?.(type)?.find((item) => item.provider === selection.provider && item.code === selection.modelId);
        return { available: true, model_name: String(model?.name || selection.modelId), model: selection };
    }

    async function generateText(input = {}, context = {}) {
        const role = input.role === 'writing' ? 'writing' : 'chat';
        const model = selectionFor(role);
        if (!model) {
            const error = new Error(`SNS ${role} model is not available through AI Generation.`);
            error.code = 'SNS_AI_MODEL_UNAVAILABLE';
            throw error;
        }
        const prompt = String(input.prompt || '').trim();
        if (!prompt) throw new TypeError('SNS text generation requires a prompt.');
        const modelInfo = aiGeneration.getSupportedModels?.('text')?.find((item) => item.provider === model.provider && item.code === model.modelId);
        const startedAt = Date.now();
        logger?.info?.(`[SNS][AI] text.generate 시작 (role=${role}, model=${modelInfo?.name || model.modelId}, provider=${model.provider}, modelId=${model.modelId}, transport=${modelInfo?.transport || 'unknown'})`);
        try {
            const result = await aiGeneration.generateText({ modelSelection: model, prompt, options: input.options || {} }, context);
            const content = String(result?.content || '');
            logger?.info?.(`[SNS][AI] text.generate 완료 (role=${role}, modelId=${model.modelId}, elapsed=${Date.now() - startedAt}ms, response=${content.length}자)`);
            return content;
        } catch (error) {
            logger?.warn?.(`[SNS][AI] text.generate 실패 (role=${role}, modelId=${model.modelId}, elapsed=${Date.now() - startedAt}ms, code=${String(error?.code || 'AI_GENERATION_FAILED')})`);
            throw error;
        }
    }

    async function generateImage(input = {}, context = {}) {
        const model = selectionFor('image');
        if (!model) {
            const error = new Error('SNS image model is not available through AI Generation.');
            error.code = 'SNS_AI_MODEL_UNAVAILABLE';
            throw error;
        }
        const prompt = String(input.prompt || '').trim();
        if (!prompt) throw new TypeError('SNS image generation requires a prompt.');
        const modelInfo = aiGeneration.getSupportedModels?.('image')?.find((item) => item.provider === model.provider && item.code === model.modelId);
        const startedAt = Date.now();
        const aspectSupport = aiGeneration.supportsOption?.('image', model, 'aspectRatio', '4:3');
        const aspectRatio = aspectSupport === false ? undefined : '4:3';
        logger?.info?.(`[SNS][AI] image.generate 시작 (model=${modelInfo?.name || model.modelId}, provider=${model.provider}, modelId=${model.modelId}, transport=${modelInfo?.transport || 'unknown'}, aspect=${aspectRatio || 'provider-default'}, size=1K)`);
        try {
            const result = await aiGeneration.generateImage({
                modelSelection: model,
                prompt,
                options: { ...(aspectRatio ? { aspectRatio } : {}), size: '1K', count: 1 }
            }, context);
            const image = result?.images?.[0];
            if (!image || typeof image.dataBase64 !== 'string' || !String(image.mimeType || '').startsWith('image/')) {
                const error = new Error('AI Gateway returned an invalid SNS image result.');
                error.code = 'AI_GATEWAY_INVALID_PROVIDER_RESPONSE';
                throw error;
            }
            logger?.info?.(`[SNS][AI] image.generate 완료 (modelId=${model.modelId}, mime=${image.mimeType}, bytes=${Buffer.from(image.dataBase64, 'base64').byteLength}, elapsed=${Date.now() - startedAt}ms)`);
            return image;
        } catch (error) {
            logger?.warn?.(`[SNS][AI] image.generate 실패 (modelId=${model.modelId}, elapsed=${Date.now() - startedAt}ms, code=${String(error?.code || 'AI_GENERATION_FAILED')})`);
            throw error;
        }
    }

    return Object.freeze({
        getTextAvailability(role = 'chat') { return getModelAvailability(role === 'writing' ? 'writing' : 'chat'); },
        getImageAvailability() { return getModelAvailability('image'); },
        generateText,
        generateImage
    });
}

module.exports = { safeModelSelection, createSnsGenerationApplication };
