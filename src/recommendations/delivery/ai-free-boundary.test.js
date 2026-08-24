const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const AI_FREE_RUNTIME_FILES = [
    'src/ui-runtime/recommendation-runtime.js',
    'src/ui-api/services/recommendation-refresh.service.js',
    'src/recommendations/delivery/scheduler.js',
    'src/recommendations/producers/content-knowledge-collector.js',
    'src/recommendations/producers/content-opportunity.js'
];

test('proactive discovery runtime has no generative AI dependency or invocation', () => {
    const forbidden = [
        /require\([^)]*(?:\/ai\/|gemini|openai|chat-model)/i,
        /generateContent\s*\(/,
        /contentIdeaEngine/,
        /CHAT_MODEL/
    ];
    for (const relativePath of AI_FREE_RUNTIME_FILES) {
        const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
        for (const pattern of forbidden) {
            assert.equal(pattern.test(source), false, `${relativePath} must stay AI-free (${pattern})`);
        }
    }
});
