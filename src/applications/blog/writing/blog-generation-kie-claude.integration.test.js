'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const BlogPromptPaths = require('./prompts/paths');
const { getDefaultContentWritingProfile } = require('../../../services/content-writing/writing-profile');
const { buildBlogGenerationPrompt } = require('./blog-generation-prompt');
const { createBlogWritingApplication } = require('./application');
const { createAiGenerationService } = require('../../../services/ai/generation');
const { createAiGatewayAdapter } = require('../../../adapters/plugins/ai-gateway');
const { createPlugin } = require('../../../../packages/plugins/core/ai-gateway');

test('subject-only blog prompt reaches KIE Claude as one user message with writing requirements intact', async () => {
    let sentBody;
    const plugin = createPlugin({
        getProviderProfile: async () => ({ api_key: 'fixture-key' }),
        fetch: async (_url, init) => {
            sentBody = JSON.parse(init.body);
            return {
                status: 200,
                headers: {},
                async json() {
                    return { content: [{ type: 'text', text: 'fixture response' }] };
                }
            };
        }
    });
    const gateway = createAiGatewayAdapter({
        executeOperation: async (_pluginId, operationId, input, context) =>
            plugin.operations[operationId].execute(input, context)
    });
    const aiGeneration = createAiGenerationService({
        gateway,
        getModelCatalog: () => ({
            text: [{ provider: 'kie', code: 'claude-sonnet-5-5', transport: 'kie_claude_messages' }],
            image: []
        })
    });
    const writing = createBlogWritingApplication({
        aiGeneration,
        getTextModel: () => ({ provider: 'kie', modelId: 'claude-sonnet-5-5' })
    });
    const composed = buildBlogGenerationPrompt({
        profile: getDefaultContentWritingProfile(),
        strategy: 'search',
        config: {
            BLOG_PROMPT_CONTRACT_PATH: BlogPromptPaths.BLOG_PROMPT_CONTRACT_FILE,
            BLOG_PROMPT_SEARCH_PATH: BlogPromptPaths.BLOG_PROMPT_SEARCH_FILE,
            BLOG_PROMPT_DISCOVERY_PATH: BlogPromptPaths.BLOG_PROMPT_DISCOVERY_FILE
        },
        promptPaths: BlogPromptPaths,
        post: { subject: '녹차의 효능' }
    });

    const result = await writing.generateText(composed.prompt);

    assert.equal(result, 'fixture response');
    assert.equal(sentBody.messages.length, 1);
    assert.equal(sentBody.messages[0].role, 'user');
    assert.equal(sentBody.messages[0].content, composed.prompt);
    assert.match(sentBody.messages[0].content, /Subject: 녹차의 효능/);
    assert.match(sentBody.messages[0].content, /약 1,500~1,800자/);
    assert.match(sentBody.messages[0].content, /\[최우선 출력 계약\]/);
    assert.equal(Object.hasOwn(sentBody, 'system'), false);
});
