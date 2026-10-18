'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogBetaRuntimeComposition } = require('./blog-beta-runtime');

test('Blog Beta composition wires AI Gateway, WordPress publisher, and Blog Publishing Application', () => {
    const registrations = [];
    const corePluginRuntime = {
        ensurePlugins(ids, dependencies) {
            registrations.push({ ids, dependencies });
            return { executeOperation: async () => ({}) };
        }
    };
    const config = {
        TEXT_MODEL_CONFIG: { provider: 'direct', code: 'local-text', base_url: 'http://127.0.0.1:1234/v1' },
        CHAT_MODEL_CONFIG: { provider: 'direct', code: 'local-chat', base_url: 'http://127.0.0.1:1234/v1' },
        IMAGE_MODEL_CONFIG: { provider: 'google', code: 'image-model' },
        AI_MODEL_PROFILES: { text: { direct: {
            provider: 'direct', code: 'saved-text', name: 'Saved Local Text', base_url: 'http://127.0.0.1:1234/v1', api_key: 'secret'
        } } }, WORDPRESS_URL: 'https://site.test',
        WORDPRESS_USER_ID: 'publisher', WORDPRESS_APP_PASSWORD: 'app-password'
    };
    const composition = createBlogBetaRuntimeComposition({
        corePluginRuntime,
        CONFIG: config,
        getAiModelCatalog: () => ({ text: [], image: [] }),
        getGatewaySupport: () => ({ routes: [
            { kind: 'text', provider: 'direct', transport: 'openai_chat_completions', modelIds: null }
        ] }),
        Core: {
            async publishToBlog() {}
        },
        imageOptimizationService: { async optimizeBuffer(bytes) { return { buffer: bytes, optimized: false }; } },
        BrowserLauncher: {},
        AuthSession: {},
        naverPublisherDependencies: {
            getSettings: () => ({ writeUrl: 'https://blog.naver.com/writer/postwrite', headless: true }),
            async createAuthenticatedNaverSession() { throw new Error('not executed in composition test'); }
        },
        Logger: { info() {} }
    });

    assert.equal(composition.corePluginRuntime, corePluginRuntime);
    assert.equal(typeof composition.blogWritingSystem.application.generateText, 'function');
    assert.equal(typeof composition.blogWritingSystem.application.generateChatText, 'function');
    assert.equal(typeof composition.shoppingGenerationApplication.generateText, 'function');
    assert.equal(typeof composition.blogPostingApplication.preparePost, 'function');
    assert.equal(typeof composition.blogPublishingApplication.publishWordPressPlugin, 'function');
    assert.equal(typeof composition.blogPublishingApplication.publishWordPressManuscript, 'function');
    assert.deepEqual(registrations.map(({ ids }) => ids), [['ai-gateway'], ['wordpress-publisher'], ['naver-publisher']]);
    assert.equal(typeof registrations[0].dependencies['ai-gateway'].getProviderProfile, 'function');
    assert.equal(registrations[0].dependencies['ai-gateway'].getProviderProfile({ kind: 'text', provider: 'direct' }).code, 'saved-text');
    assert.equal(typeof registrations[1].dependencies['wordpress-publisher'].getCredentials, 'function');
    assert.equal(typeof composition.naverPublishingSystem.publisher.publish, 'function');
    assert.equal(typeof registrations[2].dependencies['naver-publisher'].getSettings, 'function');
    assert.equal(typeof registrations[2].dependencies['naver-publisher'].createAuthenticatedNaverSession, 'function');
    assert.deepEqual(composition.aiGenerationSystem.service.getSupportedModels('text').map(({ provider, code }) => ({ provider, code })), [
        { provider: 'direct', code: 'saved-text' },
        { provider: 'direct', code: 'local-text' },
        { provider: 'direct', code: 'local-chat' }
    ]);
    assert.equal(JSON.stringify(composition.aiGenerationSystem.service.getSupportedModels('text')).includes('secret'), false);
});
