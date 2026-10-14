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
        TEXT_MODEL_CONFIG: { provider: 'openai', code: 'text-model' },
        IMAGE_MODEL_CONFIG: { provider: 'google', code: 'image-model' },
        AI_MODEL_PROFILES: {}, WORDPRESS_URL: 'https://site.test',
        WORDPRESS_USER_ID: 'publisher', WORDPRESS_APP_PASSWORD: 'app-password'
    };
    const composition = createBlogBetaRuntimeComposition({
        corePluginRuntime,
        CONFIG: config,
        getAiModelCatalog: () => ({ text: [], image: [] }),
        getGatewaySupport: () => ({ routes: [] }),
        Core: { async publishToBlog() {}, async publishToWordPress() {} },
        ImageService: { async optimizeBufferForFormat(bytes) { return { buffer: bytes, optimized: false }; } },
        Logger: { info() {} }
    });

    assert.equal(composition.corePluginRuntime, corePluginRuntime);
    assert.equal(typeof composition.blogWritingSystem.application.generateText, 'function');
    assert.equal(typeof composition.blogPublishingApplication.publishWordPressPlugin, 'function');
    assert.deepEqual(registrations[0].ids, ['ai-gateway', 'wordpress-publisher']);
    assert.equal(typeof registrations[0].dependencies['ai-gateway'].transport.request, 'function');
    assert.equal(typeof registrations[0].dependencies['wordpress-publisher'].getCredentials, 'function');
});
