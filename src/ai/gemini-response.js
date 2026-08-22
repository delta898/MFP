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

function resolveGeminiTextEndpoint(configuredEndpoint, modelCode) {
    const endpoint = String(configuredEndpoint || '').trim();
    const code = String(modelCode || '').trim();
    if (!endpoint || !code) return endpoint;
    return endpoint.replace(/(\/models\/)[^:]+(:generateContent(?:\?.*)?$)/, `$1${code}$2`);
}

module.exports = {
    extractGeminiText,
    resolveGeminiThinkingConfig,
    resolveGeminiTextEndpoint
};
