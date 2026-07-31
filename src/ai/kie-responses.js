const { KIE_BASE_URL } = require('../ai-model-catalog');
const { applyTextRuntimePolicy } = require('./model-runtime-policy');

const KIE_RESPONSES_ENDPOINT = `${KIE_BASE_URL}/codex/v1/responses`;
const KIE_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);

function buildKieResponsesRequest(modelConfig = {}, prompt = '', options = {}) {
    const { definition, options: sanitizedOptions } = applyTextRuntimePolicy(modelConfig, options);
    const requestedEffort = String(sanitizedOptions.reasoningEffort || '').trim().toLowerCase();
    const reasoningEffort = KIE_REASONING_EFFORTS.has(requestedEffort)
        ? requestedEffort
        : 'low';

    return {
        definition,
        body: {
            model: String(modelConfig.code || '').trim(),
            stream: false,
            input: String(prompt || ''),
            reasoning: { effort: reasoningEffort }
        }
    };
}

function extractKieResponsesText(data) {
    if (typeof data?.output_text === 'string' && data.output_text.trim()) {
        return data.output_text.trim();
    }
    if (!Array.isArray(data?.output)) return '';

    return data.output
        .filter((item) => item?.type === 'message' && Array.isArray(item.content))
        .flatMap((item) => item.content)
        .map((part) => (part?.type === 'output_text' && typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
}

module.exports = {
    KIE_RESPONSES_ENDPOINT,
    buildKieResponsesRequest,
    extractKieResponsesText
};
