const { KIE_BASE_URL } = require('../ai-model-catalog');
const {
    applyTextRuntimePolicy,
    resolveSupportedReasoningEffort
} = require('./model-runtime-policy');

const KIE_RESPONSES_ENDPOINT = `${KIE_BASE_URL}/codex/v1/responses`;
const KIE_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

function buildKieResponsesRequest(modelConfig = {}, prompt = '', options = {}) {
    const { definition, options: sanitizedOptions } = applyTextRuntimePolicy(modelConfig, options);
    const reasoningEffort = resolveSupportedReasoningEffort(
        sanitizedOptions.reasoningEffort,
        definition.capabilities.reasoning_efforts || KIE_REASONING_EFFORTS,
        'low'
    );

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
