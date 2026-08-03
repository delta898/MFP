const axios = require('axios');
const { KIE_BASE_URL } = require('../ai-model-catalog');
const { getModelRuntimeDefinition } = require('./model-runtime-policy');

function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function createCheckError(message, cause = null) {
    const error = new Error(message);
    error.code = 'AI_MODEL_CONNECTION_CHECK_FAILED';
    if (cause?.response?.status) error.remoteStatus = Number(cause.response.status);
    return error;
}

function getRemoteErrorMessage(error) {
    return String(
        error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.response?.data?.msg
        || error?.message
        || '알 수 없는 오류'
    ).trim();
}

function assertModelConfig(kind, modelConfig, definition) {
    if (!['text', 'image'].includes(kind)) {
        throw createCheckError('지원하지 않는 AI 모델 종류입니다.');
    }
    if (!String(modelConfig?.code || '').trim()) {
        throw createCheckError('확인할 모델을 선택해 주세요.');
    }
    if (!definition.transport) {
        throw createCheckError('선택한 모델의 연결 방식을 확인할 수 없습니다.');
    }
    if (modelConfig.provider !== 'direct' && !String(modelConfig.api_key || '').trim()) {
        throw createCheckError('선택한 모델의 API Key를 입력해 주세요.');
    }
    if (modelConfig.provider === 'direct' && !normalizeBaseUrl(modelConfig.base_url)) {
        throw createCheckError('직접 입력 모델의 Base URL을 입력해 주세요.');
    }
}

function assertMatchingModelId(data, requestedCode) {
    const returnedId = String(data?.id || data?.name || '').replace(/^models\//, '').trim();
    if (returnedId && returnedId !== requestedCode) {
        throw createCheckError(`서버가 다른 모델 정보를 반환했습니다: ${returnedId}`);
    }
}

function findOpenAiCompatibleModel(data, requestedCode) {
    const models = Array.isArray(data?.data)
        ? data.data
        : (Array.isArray(data?.models) ? data.models : (Array.isArray(data) ? data : []));
    return models.find((item) => String(item?.id || item?.name || '').trim() === requestedCode) || null;
}

async function checkGoogleModel(httpClient, modelConfig, timeoutMs) {
    const requestedCode = String(modelConfig.code || '').trim();
    const response = await httpClient.get(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(requestedCode)}`,
        {
            params: { key: String(modelConfig.api_key || '').trim() },
            headers: { Accept: 'application/json' },
            timeout: timeoutMs
        }
    );
    assertMatchingModelId(response?.data, requestedCode);

    const supportedMethods = [
        ...(Array.isArray(response?.data?.supportedGenerationMethods)
            ? response.data.supportedGenerationMethods
            : []),
        ...(Array.isArray(response?.data?.supportedActions)
            ? response.data.supportedActions
            : [])
    ];
    const requiredMethod = 'generateContent';
    if (supportedMethods.length > 0 && !supportedMethods.includes(requiredMethod)) {
        throw createCheckError(`${requestedCode} 모델이 ${requiredMethod} 기능을 지원하지 않습니다.`);
    }
}

async function checkAnthropicModel(httpClient, modelConfig, timeoutMs) {
    const requestedCode = String(modelConfig.code || '').trim();
    const baseUrl = normalizeBaseUrl(modelConfig.base_url);
    const response = await httpClient.get(`${baseUrl}/models/${encodeURIComponent(requestedCode)}`, {
        headers: {
            Accept: 'application/json',
            'x-api-key': String(modelConfig.api_key || '').trim(),
            'anthropic-version': '2023-06-01'
        },
        timeout: timeoutMs
    });
    assertMatchingModelId(response?.data, requestedCode);
}

async function checkOpenAiModel(httpClient, modelConfig, timeoutMs) {
    const requestedCode = String(modelConfig.code || '').trim();
    const baseUrl = normalizeBaseUrl(modelConfig.base_url);
    const response = await httpClient.get(`${baseUrl}/models/${encodeURIComponent(requestedCode)}`, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${String(modelConfig.api_key || '').trim()}`
        },
        timeout: timeoutMs
    });
    assertMatchingModelId(response?.data, requestedCode);
}

async function checkDirectModel(httpClient, modelConfig, timeoutMs) {
    const requestedCode = String(modelConfig.code || '').trim();
    const baseUrl = normalizeBaseUrl(modelConfig.base_url);
    const apiKey = String(modelConfig.api_key || '').trim();
    const headers = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await httpClient.get(`${baseUrl}/models`, {
        headers,
        timeout: timeoutMs
    });
    if (!findOpenAiCompatibleModel(response?.data, requestedCode)) {
        throw createCheckError(`${requestedCode} 모델을 서버의 /models 목록에서 찾지 못했습니다.`);
    }
}

async function checkKieAccount(httpClient, modelConfig, timeoutMs) {
    const response = await httpClient.get(`${KIE_BASE_URL}/api/v1/chat/credit`, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${String(modelConfig.api_key || '').trim()}`
        },
        timeout: timeoutMs
    });
    const responseCode = Number(response?.data?.code);
    if (Number.isFinite(responseCode) && responseCode !== 200) {
        throw createCheckError(String(response?.data?.msg || 'KIE.ai 계정 정보를 확인하지 못했습니다.'));
    }
    const rawCreditBalance = response?.data?.data;
    const creditBalance = Number(rawCreditBalance);
    if (
        rawCreditBalance === null
        || rawCreditBalance === undefined
        || String(rawCreditBalance).trim() === ''
        || !Number.isFinite(creditBalance)
    ) {
        throw createCheckError('KIE.ai 잔여 크레딧 응답을 확인하지 못했습니다.');
    }
    return { credit_balance: creditBalance };
}

async function testModelConnection(options = {}) {
    const kind = String(options.kind || '').trim().toLowerCase();
    const modelConfig = options.modelConfig && typeof options.modelConfig === 'object'
        ? options.modelConfig
        : {};
    const definition = getModelRuntimeDefinition(kind, modelConfig);
    const httpClient = options.httpClient || axios;
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 15000);
    const now = typeof options.now === 'function' ? options.now : Date.now;

    assertModelConfig(kind, modelConfig, definition);
    const startedAt = now();
    let checkDetails = {};
    try {
        if (definition.provider === 'google') {
            await checkGoogleModel(httpClient, modelConfig, timeoutMs);
        } else if (definition.provider === 'anthropic') {
            await checkAnthropicModel(httpClient, modelConfig, timeoutMs);
        } else if (definition.provider === 'openai') {
            await checkOpenAiModel(httpClient, modelConfig, timeoutMs);
        } else if (definition.provider === 'kie') {
            checkDetails = await checkKieAccount(httpClient, modelConfig, timeoutMs);
        } else if (definition.provider === 'direct') {
            await checkDirectModel(httpClient, modelConfig, timeoutMs);
        } else {
            throw createCheckError('연결 확인을 지원하지 않는 공급자입니다.');
        }
    } catch (error) {
        if (error?.code === 'AI_MODEL_CONNECTION_CHECK_FAILED') throw error;
        const status = Number(error?.response?.status || 0);
        const statusLabel = status ? `HTTP ${status}: ` : '';
        throw createCheckError(`${statusLabel}${getRemoteErrorMessage(error)}`, error);
    }

    return {
        success: true,
        check_type: definition.provider === 'kie' ? 'account_credit' : 'metadata',
        generation_performed: false,
        kind,
        provider: definition.provider,
        model: String(modelConfig.code || '').trim(),
        transport: definition.transport,
        latency_ms: Math.max(0, now() - startedAt),
        ...checkDetails
    };
}

module.exports = {
    testModelConnection
};
