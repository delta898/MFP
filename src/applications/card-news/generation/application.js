'use strict';

const fsDefault = require('node:fs');
const pathDefault = require('node:path');
const { createCardNewsGenerationService } = require('../../../card-news/generation-service');
const { normalizeGenerationSettings, normalizeImageMode } = require('../../../card-news/generation');
const { throwIfCanceled } = require('../../../ai/cancellation');

const MIME_EXTENSIONS = Object.freeze({
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/avif': '.avif'
});

function safeModelSelection(model = {}) {
    const provider = String(model.provider || '').trim().toLowerCase();
    const modelId = String(model.modelId || model.code || '').trim();
    return provider && modelId ? { provider, modelId } : null;
}

function createCardNewsGenerationApplication(options = {}) {
    const aiGeneration = options.aiGeneration;
    if (!aiGeneration || typeof aiGeneration.generateText !== 'function' || typeof aiGeneration.generateImage !== 'function'
        || typeof aiGeneration.supportsOption !== 'function') {
        throw new TypeError('Card News Generation Application requires the shared AI Generation service.');
    }
    const fileSystem = options.fs || fsDefault;
    const pathApi = options.path || pathDefault;
    const getTextModel = typeof options.getTextModel === 'function' ? options.getTextModel : () => options.textModel;
    const getImageModel = typeof options.getImageModel === 'function' ? options.getImageModel : () => options.imageModel;
    const getModelCatalog = typeof options.getModelCatalog === 'function' ? options.getModelCatalog : () => ({});
    const logger = options.logger;

    async function generateText(prompt, retries, requestOptions = {}) {
        const selection = safeModelSelection(getTextModel() || {});
        if (!selection) throw Object.assign(new Error('카드뉴스 글쓰기 모델을 선택해 주세요.'), { code: 'CARD_NEWS_TEXT_MODEL_REQUIRED' });
        const startedAt = Date.now();
        const model = aiGeneration.getSupportedModels?.('text')?.find((item) => item.provider === selection.provider && item.code === selection.modelId)
            || (getModelCatalog()?.text || []).find((item) => item.provider === selection.provider && item.code === selection.modelId);
        logger?.info?.(`[CardNews][AI] text.generate 시작 (model=${model?.name || selection.modelId}, provider=${selection.provider}, modelId=${selection.modelId}, transport=${model?.transport || 'unknown'})`);
        try {
            const modelOptions = {};
            if (Number.isInteger(requestOptions.maxTokens)) modelOptions.maxOutputTokens = requestOptions.maxTokens;
            if (Number.isFinite(requestOptions.temperature)) modelOptions.temperature = requestOptions.temperature;
            const responseFormat = aiGeneration.supportsFeature?.('text', selection, 'jsonResponse') ? 'json' : undefined;
            if (responseFormat) modelOptions.responseFormat = responseFormat;
            const result = await aiGeneration.generateText({
                modelSelection: selection,
                prompt,
                ...(Object.keys(modelOptions).length ? { options: modelOptions } : {})
            }, { signal: requestOptions.signal });
            throwIfCanceled(requestOptions.signal);
            const content = String(result?.content || '');
            logger?.info?.(`[CardNews][AI] text.generate 완료 (modelId=${selection.modelId}, elapsed=${Date.now() - startedAt}ms, response=${content.length}자)`);
            return content;
        } catch (error) {
            logger?.warn?.(`[CardNews][AI] text.generate 실패 (modelId=${selection.modelId}, elapsed=${Date.now() - startedAt}ms, code=${String(error?.code || 'AI_GENERATION_FAILED')})`);
            throw error;
        }
    }

    async function generateImage(prompt, savePath, _retries, requestOptions = {}) {
        const selection = safeModelSelection(requestOptions.modelConfig || options.getImageModel?.() || {});
        if (!selection) throw Object.assign(new Error('카드 이미지 모델을 선택해 주세요.'), { code: 'CARD_NEWS_IMAGE_MODEL_REQUIRED' });
        const model = aiGeneration.getSupportedModels?.('image')?.find((item) => item.provider === selection.provider && item.code === selection.modelId)
            || (getModelCatalog()?.image || []).find((item) => item.provider === selection.provider && item.code === selection.modelId);
        const cardIndex = Number(requestOptions.cardIndex || 0);
        const startedAt = Date.now();
        const reportProgress = (event) => {
            logger?.info?.(`[CardNews][AI] image.generate 진행 (card=${cardIndex || 'unknown'}, phase=${String(event?.phase || 'working')}${Number.isFinite(event?.progress) ? `, progress=${event.progress}%` : ''})`);
            requestOptions.reportProgress?.(event);
        };
        logger?.info?.(`[CardNews][AI] image.generate 시작 (card=${cardIndex || 'unknown'}, model=${model?.name || selection.modelId}, provider=${selection.provider}, modelId=${selection.modelId}, transport=${model?.transport || requestOptions.modelConfig?.transport || 'unknown'})`);
        try {
            const result = await aiGeneration.generateImage({
                modelSelection: selection,
                prompt,
                options: {
                    aspectRatio: requestOptions.aspectRatio,
                    size: requestOptions.imageSize || '1K',
                    count: 1
                }
            }, { signal: requestOptions.signal, reportProgress });
            throwIfCanceled(requestOptions.signal);
            const image = result?.images?.[0];
            const extension = MIME_EXTENSIONS[String(image?.mimeType || '').toLowerCase()];
            if (!image || !extension || typeof image.dataBase64 !== 'string') {
                throw Object.assign(new Error('카드 이미지 결과 형식을 확인하지 못했습니다.'), { code: 'AI_GATEWAY_INVALID_PROVIDER_RESPONSE' });
            }
            const bytes = Buffer.from(image.dataBase64, 'base64');
            if (!bytes.length || bytes.length > 10 * 1024 * 1024) {
                throw Object.assign(new Error('카드 이미지 크기가 허용 범위를 벗어났습니다.'), { code: 'AI_GATEWAY_INVALID_PROVIDER_RESPONSE' });
            }
            const generatedPath = `${String(savePath)}${extension}`;
            fileSystem.writeFileSync(generatedPath, bytes, { flag: 'wx' });
            logger?.info?.(`[CardNews][AI] image.generate 완료 (card=${cardIndex || 'unknown'}, modelId=${selection.modelId}, mime=${image.mimeType}, bytes=${bytes.byteLength}, elapsed=${Date.now() - startedAt}ms)`);
            return generatedPath;
        } catch (error) {
            logger?.warn?.(`[CardNews][AI] image.generate 실패 (card=${cardIndex || 'unknown'}, modelId=${selection.modelId}, elapsed=${Date.now() - startedAt}ms, code=${String(error?.code || 'AI_GENERATION_FAILED')})`);
            throw error;
        }
    }

    const generationService = createCardNewsGenerationService({
        fs: fileSystem,
        path: pathApi,
        workspaceDir: options.workspaceDir,
        generateText,
        generateImage,
        parseStructuredJsonResponse: options.parseStructuredJsonResponse || JSON.parse,
        logger,
        now: options.now,
        createId: options.createId
    });

    return Object.freeze({
        ...generationService,
        getSupportedModels(kind) { return aiGeneration.getSupportedModels?.(kind) || []; },
        generate,
        generateImages
    });

    async function generate(input) {
        assertAspectRatioSupported(input);
        return generationService.generate(input);
    }

    async function generateImages(input) {
        const storedGeneration = generationService.getGeneration(input?.generation_id);
        assertAspectRatioSupported({
            ...input,
            settings: input?.settings || storedGeneration.settings,
            image_mode: 'generate'
        });
        return generationService.generateImages(input);
    }

    function assertAspectRatioSupported(input = {}) {
        if (normalizeImageMode(input.image_mode) !== 'generate') return;
        const aspectRatio = normalizeGenerationSettings(input.settings).aspect_ratio;
        const selection = safeModelSelection(input.imageModelConfig || getImageModel() || {});
        if (selection && aiGeneration.supportsOption('image', selection, 'aspectRatio', aspectRatio) === false) {
            throw Object.assign(new Error(`선택한 이미지 모델은 ${aspectRatio} 비율을 지원하지 않습니다.`), {
                code: 'AI_GATEWAY_UNSUPPORTED_CAPABILITY'
            });
        }
    }
}

module.exports = { createCardNewsGenerationApplication, safeModelSelection };
