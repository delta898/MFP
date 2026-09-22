function extractGeminiText(data = {}) {
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
        ? data.candidates[0].content.parts
        : [];
    const visibleTextParts = parts
        .filter((part) => part?.thought !== true)
        .map((part) => String(part?.text || '').trim())
        .filter(Boolean);
    if (visibleTextParts.length > 0) return visibleTextParts.join('\n');

    return parts
        .map((part) => String(part?.text || '').trim())
        .filter(Boolean)
        .join('\n');
}

const GEMINI_THINKING_EFFORTS = Object.freeze(['minimal', 'low', 'medium', 'high']);

function resolveGeminiThinkingConfig(modelCode, reasoningEffort, capabilities = {}) {
    const model = String(modelCode || '').trim().toLowerCase();
    const effort = String(reasoningEffort || '').trim().toLowerCase();
    if (!/^gemini-3(?:\.|-|$)/.test(model)) return null;
    const requestedIndex = GEMINI_THINKING_EFFORTS.indexOf(effort);
    if (requestedIndex < 0) return null;

    const supportedLevels = Array.isArray(capabilities?.thinking_levels)
        ? capabilities.thinking_levels
            .map((level) => String(level || '').trim().toLowerCase())
            .filter((level) => GEMINI_THINKING_EFFORTS.includes(level))
        : [];
    if (supportedLevels.length === 0) return { thinkingLevel: effort };
    if (supportedLevels.includes(effort)) return { thinkingLevel: effort };

    const nextSupported = GEMINI_THINKING_EFFORTS
        .slice(requestedIndex + 1)
        .find((level) => supportedLevels.includes(level));
    const previousSupported = GEMINI_THINKING_EFFORTS
        .slice(0, requestedIndex)
        .reverse()
        .find((level) => supportedLevels.includes(level));
    const resolvedLevel = nextSupported || previousSupported;
    return resolvedLevel ? { thinkingLevel: resolvedLevel } : null;
}

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Code-owned transports must never send keys to user-supplied URLs: only the
// direct provider may use a custom base URL. All other callers resolve to the
// fixed Gemini address, so a tampered saved base_url cannot exfiltrate the key.
function resolveGeminiEndpointFromConfig({ provider = '', baseUrl = '', code = '' } = {}) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) throw new Error('Gemini 호출에 필요한 모델 코드가 없습니다.');
    if (normalizedProvider === 'direct') {
        const directBase = String(baseUrl || '').trim().replace(/\/+$/, '');
        if (!directBase) throw new Error('직접 입력 모델의 Base URL이 없습니다.');
        return `${directBase}/models/${encodeURIComponent(normalizedCode)}:generateContent`;
    }
    return `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(normalizedCode)}:generateContent`;
}

function describeGeminiEndpoint(endpoint) {
    const raw = String(endpoint || '').trim();
    if (!raw) return '(empty)';
    try {
        const parsed = new URL(raw);
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    } catch (_error) {
        const withoutQuery = raw.split(/[?#]/, 1)[0]
            .replace(/\/\/[^/@\s]+@/, '//[redacted]@');
        return withoutQuery.slice(0, 240) || '(invalid)';
    }
}

module.exports = {
    extractGeminiText,
    resolveGeminiThinkingConfig,
    GEMINI_API_BASE_URL,
    resolveGeminiEndpointFromConfig,
    describeGeminiEndpoint
};
