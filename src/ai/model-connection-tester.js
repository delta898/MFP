const axios = require('axios');
const {
    buildOpenAiChatRequest,
    getModelRuntimeDefinition,
    resolveOpenAiImageRequest
} = require('./model-runtime-policy');

const TEXT_TEST_PROMPT = 'Reply with exactly: OK';
const IMAGE_TEST_PROMPT = 'A simple blue circle on a plain white background.';

function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function hasOpenAiText(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return Boolean(content.trim());
    return Array.isArray(content) && content.length > 0;
}

function hasGeminiText(data) {
    return Boolean(data?.candidates?.[0]?.content?.parts?.some((part) => (
        typeof part?.text === 'string' && part.text.trim()
    )));
}

function hasOpenAiImage(data) {
    const image = Array.isArray(data?.data) ? data.data[0] : null;
    return Boolean(
        (typeof image?.b64_json === 'string' && image.b64_json.trim())
        || (typeof image?.url === 'string' && image.url.trim())
    );
}

function hasGeminiImage(data) {
    return Boolean(data?.candidates?.[0]?.content?.parts?.some((part) => (
        typeof part?.inlineData?.data === 'string' && part.inlineData.data.trim()
    )));
}

function hasImagenImage(data) {
    const candidates = [
        ...(Array.isArray(data?.predictions) ? data.predictions : []),
        ...(Array.isArray(data?.generatedImages) ? data.generatedImages : [])
    ];
    return candidates.some((item) => [
        item?.bytesBase64Encoded,
        item?.image?.bytesBase64Encoded,
        item?.imageBytes,
        item?.image?.imageBytes
    ].some((value) => typeof value === 'string' && value.trim()));
}

function getRemoteErrorMessage(error) {
    return String(
        error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.message
        || '알 수 없는 오류'
    ).trim();
}

function createTestError(message, cause = null) {
    const error = new Error(message);
    error.code = 'AI_MODEL_TEST_FAILED';
    if (cause?.response?.status) error.remoteStatus = Number(cause.response.status);
    return error;
}

function assertModelConfig(kind, modelConfig, definition) {
    if (!['text', 'image'].includes(kind)) {
        throw createTestError('지원하지 않는 AI 모델 종류입니다.');
    }
    if (!String(modelConfig?.code || '').trim()) {
        throw createTestError('테스트할 모델을 선택해 주세요.');
    }
    if (!definition.transport) {
        throw createTestError('선택한 모델의 호출 방식을 확인할 수 없습니다.');
    }
    if (modelConfig.provider !== 'direct' && !String(modelConfig.api_key || '').trim()) {
        throw createTestError('선택한 모델의 API Key를 입력해 주세요.');
    }
    if (
        modelConfig.provider === 'direct'
        && !normalizeBaseUrl(modelConfig.base_url)
    ) {
        throw createTestError('직접 입력 모델의 Base URL을 입력해 주세요.');
    }
}

async function testTextModel(httpClient, modelConfig, definition, timeoutMs) {
    const apiKey = String(modelConfig.api_key || '').trim();
    if (definition.transport === 'gemini_generate_content') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelConfig.code)}:generateContent`;
        const response = await httpClient.post(url, {
            contents: [{ parts: [{ text: TEXT_TEST_PROMPT }] }],
            generationConfig: { maxOutputTokens: 16 }
        }, {
            params: { key: apiKey },
            headers: { 'Content-Type': 'application/json' },
            timeout: timeoutMs
        });
        if (!hasGeminiText(response?.data)) {
            throw createTestError('모델 응답에서 텍스트를 확인하지 못했습니다.');
        }
        return;
    }

    const baseUrl = normalizeBaseUrl(modelConfig.base_url);
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const { body } = buildOpenAiChatRequest(modelConfig, TEXT_TEST_PROMPT, { maxTokens: 16 });
    const response = await httpClient.post(`${baseUrl}/chat/completions`, body, {
        headers,
        timeout: timeoutMs
    });
    if (!hasOpenAiText(response?.data)) {
        throw createTestError('모델 응답에서 텍스트를 확인하지 못했습니다.');
    }
}

async function testImageModel(httpClient, modelConfig, definition, timeoutMs) {
    const apiKey = String(modelConfig.api_key || '').trim();
    if (definition.transport === 'gemini_generate_content') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelConfig.code)}:generateContent`;
        const response = await httpClient.post(url, {
            contents: [{ parts: [{ text: IMAGE_TEST_PROMPT }] }],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: { aspectRatio: '1:1' }
            }
        }, {
            params: { key: apiKey },
            headers: { 'Content-Type': 'application/json' },
            timeout: timeoutMs
        });
        if (!hasGeminiImage(response?.data)) {
            throw createTestError('모델 응답에서 이미지 데이터를 확인하지 못했습니다.');
        }
        return;
    }

    if (definition.transport === 'imagen_predict') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelConfig.code)}:predict`;
        const response = await httpClient.post(url, {
            instances: [{ prompt: IMAGE_TEST_PROMPT }],
            parameters: { sampleCount: 1, aspectRatio: '1:1' }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            timeout: timeoutMs
        });
        if (!hasImagenImage(response?.data)) {
            throw createTestError('모델 응답에서 이미지 데이터를 확인하지 못했습니다.');
        }
        return;
    }

    const baseUrl = normalizeBaseUrl(modelConfig.base_url);
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const { body } = resolveOpenAiImageRequest(modelConfig, {
        prompt: IMAGE_TEST_PROMPT,
        aspectRatio: '1:1',
        imageSize: '1K'
    });
    if (Array.isArray(definition.capabilities.quality) && definition.capabilities.quality.includes('low')) {
        body.quality = 'low';
    }
    const response = await httpClient.post(`${baseUrl}/images/generations`, body, {
        headers,
        timeout: timeoutMs
    });
    if (!hasOpenAiImage(response?.data)) {
        throw createTestError('모델 응답에서 이미지 데이터를 확인하지 못했습니다.');
    }
}

async function testModelConnection(options = {}) {
    const kind = String(options.kind || '').trim().toLowerCase();
    const modelConfig = options.modelConfig && typeof options.modelConfig === 'object'
        ? options.modelConfig
        : {};
    const definition = getModelRuntimeDefinition(kind, modelConfig);
    const httpClient = options.httpClient || axios;
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || (kind === 'image' ? 180000 : 45000));
    const now = typeof options.now === 'function' ? options.now : Date.now;

    assertModelConfig(kind, modelConfig, definition);
    const startedAt = now();
    try {
        if (kind === 'text') {
            await testTextModel(httpClient, modelConfig, definition, timeoutMs);
        } else {
            await testImageModel(httpClient, modelConfig, definition, timeoutMs);
        }
    } catch (error) {
        if (error?.code === 'AI_MODEL_TEST_FAILED') throw error;
        const status = Number(error?.response?.status || 0);
        const statusLabel = status ? `HTTP ${status}: ` : '';
        throw createTestError(`${statusLabel}${getRemoteErrorMessage(error)}`, error);
    }

    return {
        success: true,
        kind,
        provider: definition.provider,
        model: String(modelConfig.code || '').trim(),
        transport: definition.transport,
        latency_ms: Math.max(0, now() - startedAt)
    };
}

module.exports = {
    IMAGE_TEST_PROMPT,
    TEXT_TEST_PROMPT,
    testModelConnection
};
