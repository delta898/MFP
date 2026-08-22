const test = require('node:test');
const assert = require('node:assert/strict');

const {
    formatContentRequestMessage,
    buildContentRequestKeyboard,
    buildSuggestionKeyboard
} = require('./renderer');

test('renderer keeps register-only UI simple and hides publish controls', () => {
    const bundle = {
        meta: {
            explicit_params: []
        },
        ui: {
            show_publish_options: false
        },
        register_request: {
            payload: {
                options: {
                    image_gen: false,
                    external_reference: true,
                    schedule_date: '2026-03-14 09:00',
                    instruction: '핵심만',
                    category: '기술'
                }
            },
            preview: {
                kind: 'topic_registration',
                theme: '테스트 주제',
                keywords: ['a', 'b'],
                options: {
                    image_gen: false,
                    external_reference: true
                }
            }
        },
        publish_request: null
    };

    const message = formatContentRequestMessage(bundle);
    const keyboard = buildContentRequestKeyboard(bundle);

    assert.match(message, /테스트 주제/);
    assert.match(message, /예약 일시/);
    assert.doesNotMatch(message, /발행 형태/);
    assert.equal(keyboard.length, 3);
    assert.deepEqual(keyboard[1], [{ text: '✅ 네, 이대로 등록해 주세요', callback_data: 'publish_confirm' }]);
});

test('renderer uses bounded recommendation feedback callbacks and skips pending confirmations', () => {
    const rows = buildSuggestionKeyboard([{ result: { data: { suggestions: [
        { id: 'confirm-1', type: 'next_action', feedback_enabled: false },
        { id: 'rec_1234567890abcdef', feedback_transport: 'recommendation', feedback_enabled: true }
    ] } } }]);
    assert.deepEqual(rows, [[
        { text: '👍 도움됨 1.2', callback_data: 'rec_fb:h:rec_1234567890abcdef' },
        { text: '👎 별로 1.2', callback_data: 'rec_fb:n:rec_1234567890abcdef' }
    ]]);
    rows.flat().forEach((button) => assert.equal(Buffer.byteLength(button.callback_data) <= 64, true));
});

test('renderer shows publish controls only when publish options are enabled', () => {
    const bundle = {
        meta: {
            explicit_params: ['image_gen']
        },
        ui: {
            show_publish_options: true
        },
        register_request: {
            payload: {
                options: {
                    image_gen: true,
                    external_reference: false
                }
            },
            preview: {
                kind: 'topic_registration',
                theme: '발행 테스트',
                keywords: [],
                options: {
                    image_gen: true,
                    external_reference: false
                }
            }
        },
        publish_request: {
            payload: {
                auto_trigger: false,
                options: {
                    post_status: 'draft'
                }
            },
            preview: {
                kind: 'publish_request',
                platforms: ['naver'],
                auto_trigger: false,
                options: {
                    post_status: 'draft'
                },
                settings: {
                    headless: true
                }
            }
        }
    };

    const message = formatContentRequestMessage(bundle);
    const keyboard = buildContentRequestKeyboard(bundle);

    assert.match(message, /발행까지:\* ❌/);
    assert.match(message, /발행 형태:\* 임시저장/);
    assert.equal(keyboard.length, 4);
    assert.deepEqual(keyboard[1], [
        { text: '📌 임시저장', callback_data: 'toggle_poststatus' },
        { text: '🚀 발행까지: ❌', callback_data: 'toggle_autotrigger' }
    ]);
    assert.deepEqual(keyboard[2], [{ text: '✅ 네, 이대로 등록해 주세요', callback_data: 'publish_confirm' }]);
});
