const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationDispatcher } = require('./notification-dispatcher');

test('dispatcher fans out to enabled channels and reports each result', async () => {
    const sent = [];
    const dispatcher = createNotificationDispatcher([
        { id: 'telegram', isEnabled: () => true, render: (message) => `tg:${message}`, async send(message) { sent.push(['telegram', message]); return { success: true }; } },
        { id: 'slack', isEnabled: () => true, render: (message) => `slack:${message}`, async send(message) { sent.push(['slack', message]); return { success: false }; } },
        { id: 'future-channel', isEnabled: () => false, async send() { throw new Error('must not send'); } }
    ]);

    const result = await dispatcher.send('message');

    assert.deepEqual(sent, [['telegram', 'tg:message'], ['slack', 'slack:message']]);
    assert.deepEqual(result, {
        attempted: true,
        channels: [
            { id: 'telegram', success: true },
            { id: 'slack', success: false }
        ]
    });
});

test('dispatcher isolates a channel failure from other channel sends', async () => {
    const dispatcher = createNotificationDispatcher([
        { id: 'broken', isEnabled: () => true, async send() { throw new Error('offline'); } },
        { id: 'working', isEnabled: () => true, async send() { return { success: true }; } }
    ]);

    assert.deepEqual(await dispatcher.send('message'), {
        attempted: true,
        channels: [
            { id: 'broken', success: false, message: 'offline' },
            { id: 'working', success: true }
        ]
    });
});
