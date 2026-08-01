const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatModelCapabilities } = require('./chat-model');

test('Chat Model summary capability reports the resolved writing-model role', async () => {
    const [capability] = createChatModelCapabilities({
        configState: {
            loadStructuredConfig() {
                return {
                    ai_settings: {
                        TEXT_MODEL: {
                            provider: 'gemini',
                            code: 'gemini-3.6-flash',
                            api_key: 'secret'
                        },
                        CHAT_MODEL: {
                            source: 'writing',
                            selection: null
                        }
                    }
                };
            }
        }
    });

    assert.equal(capability.id, 'settings.chat_model.get_summary');
    const result = await capability.execute();
    assert.equal(result.success, true);
    assert.equal(result.data.source, 'writing');
    assert.equal(result.data.provider, 'gemini');
    assert.match(result.message, /Gemini 3\.6 Flash/);
});
