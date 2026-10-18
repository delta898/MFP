const test = require('node:test');
const assert = require('node:assert/strict');

const {
    mapLegacyTelegramContentRequest,
    isCanonicalContentRequestBundle,
    applyContentRequestToggle,
    isPublishExecutionEnabled
} = require('./content-request-mapper');

function buildContext() {
    return {
        channel: 'telegram',
        user: { id: 'chat-1' },
        conversation: { id: 'telegram:chat-1' },
        messageId: '101'
    };
}

test('maps legacy register and publish actions into canonical content bundle', async () => {
    const capabilityRegistry = {
        async executeAction(action) {
            if (action.domain === 'content.register_topic' && action.name === 'prepare') {
                return {
                    success: true,
                    data: {
                        theme: '정규화된 주제',
                        keywords: ['alpha', 'beta'],
                        platforms: ['wordpress'],
                        options: {
                            image_gen: false,
                            external_reference: true,
                            post_status: 'draft'
                        },
                        source: 'telegram'
                    }
                };
            }

            if (action.domain === 'content.publish' && action.name === 'prepare') {
                return {
                    success: true,
                    data: {
                        target: 'wordpress',
                        platforms: ['wordpress'],
                        auto_trigger: true,
                        settingsOverrides: {
                            PUBLISH_AUTO_HEADLESS: true
                        },
                        options: {
                            post_status: 'draft'
                        }
                    }
                };
            }

            throw new Error(`unexpected capability: ${action.domain}.${action.name}`);
        }
    };

    const bundle = await mapLegacyTelegramContentRequest({
        actions: [
            {
                action: 'register_topic',
                params: {
                    theme: '원본 주제',
                    keywords: ['raw'],
                    platforms: ['wordpress'],
                    options: { image_gen: true }
                }
            },
            {
                action: 'publish_article',
                params: { target: 'all' }
            }
        ],
        meta: {
            explicit_params: ['image_gen', 'image_gen', 'post_status']
        }
    }, buildContext(), { capabilityRegistry });

    assert.equal(isCanonicalContentRequestBundle(bundle), true);
    assert.equal(bundle.register_request.intent, 'content.register_topic');
    assert.equal(bundle.publish_request.intent, 'content.publish');
    assert.deepEqual(bundle.meta.explicit_params, ['image_gen', 'post_status']);
    assert.deepEqual(bundle.register_request.payload, {
        theme: '정규화된 주제',
        keywords: ['alpha', 'beta'],
        platforms: ['wordpress'],
        options: {
            image_gen: false,
            external_reference: true,
            post_status: 'draft',
            category: '',
            naver_category: '',
            wordpress_category: ''
        },
        source: 'telegram'
    });
    assert.deepEqual(bundle.publish_request.payload.platforms, ['wordpress']);
    assert.equal(bundle.publish_request.payload.options.post_status, 'draft');
    assert.equal(bundle.ui.show_publish_options, true);
    assert.equal(isPublishExecutionEnabled(bundle), true);
});

test('toggle operations mutate canonical bundle without falling back to legacy actions', async () => {
    const bundle = await mapLegacyTelegramContentRequest({
        actions: [
            {
                action: 'register_topic',
                params: {
                    theme: '토글 테스트',
                    options: {
                        image_gen: false,
                        external_reference: true
                    }
                }
            },
            {
                action: 'publish_article',
                params: { target: 'naver' }
            }
        ],
        meta: {
            explicit_params: []
        }
    }, buildContext(), {});

    const afterImageToggle = applyContentRequestToggle(bundle, 'toggle_image');
    assert.equal(afterImageToggle.register_request.payload.options.image_gen, true);
    assert.deepEqual(afterImageToggle.meta.explicit_params, ['image_gen']);

    const afterStatusToggle = applyContentRequestToggle(afterImageToggle, 'toggle_poststatus');
    assert.equal(afterStatusToggle.register_request.payload.options.post_status, 'draft');
    assert.equal(afterStatusToggle.publish_request.payload.options.post_status, 'draft');
    assert.deepEqual(afterStatusToggle.meta.explicit_params, ['image_gen', 'post_status']);

    const afterAutoTriggerToggle = applyContentRequestToggle(afterStatusToggle, 'toggle_autotrigger');
    assert.equal(afterAutoTriggerToggle.publish_request.payload.auto_trigger, false);
    assert.equal(isPublishExecutionEnabled(afterAutoTriggerToggle), false);
});

test('publish-only bundle rejects the ambiguous all target', async () => {
    await assert.rejects(
        mapLegacyTelegramContentRequest({
            actions: [
                {
                    action: 'publish_article',
                    params: { target: 'all' }
                }
            ],
            meta: {}
        }, buildContext(), {}),
        /발행 대상을 정확히 하나 지정/
    );
});
