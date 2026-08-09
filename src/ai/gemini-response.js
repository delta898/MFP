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

function resolveGeminiThinkingConfig(modelCode, reasoningEffort) {
    const model = String(modelCode || '').trim().toLowerCase();
    const effort = String(reasoningEffort || '').trim().toLowerCase();
    if (!/^gemini-3(?:\.|-|$)/.test(model)) return null;
    if (!['minimal', 'low', 'medium', 'high'].includes(effort)) return null;
    return { thinkingLevel: effort };
}

module.exports = {
    extractGeminiText,
    resolveGeminiThinkingConfig
};
