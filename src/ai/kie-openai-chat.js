const { KIE_BASE_URL } = require('../ai-model-catalog');

const KIE_MODEL_ROUTE_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

function getKieOpenAiChatEndpoint(modelCode) {
    const route = String(modelCode || '').trim();
    if (!KIE_MODEL_ROUTE_PATTERN.test(route)) {
        throw new Error('KIE.ai 모델 경로가 올바르지 않습니다.');
    }
    return `${KIE_BASE_URL}/${route}/v1/chat/completions`;
}

function extractKieOpenAiChatContent(data) {
    const openAiContent = data?.choices?.[0]?.message?.content;
    if (typeof openAiContent === 'string') return openAiContent.trim();
    if (Array.isArray(openAiContent)) {
        const text = openAiContent
            .map((part) => {
                if (typeof part === 'string') return part;
                return typeof part?.text === 'string' ? part.text : '';
            })
            .join('')
            .trim();
        if (text) return text;
    }

    const geminiParts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(geminiParts)) return '';
    return geminiParts
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();
}

module.exports = {
    extractKieOpenAiChatContent,
    getKieOpenAiChatEndpoint
};
