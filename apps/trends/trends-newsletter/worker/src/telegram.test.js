import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCollectorRunSummary, sendTelegramSummary } from './telegram.js';

test('formats one concise success summary with aggregate email outcomes', () => {
    const summary = formatCollectorRunSummary({
        environment: 'development', trendDate: '2026-11-04', runId: 'run-1', status: 'success',
        delivery: { sent: 4, failed: 1, held: 0, skipped: 2 }
    });
    assert.match(summary, /성공/);
    assert.match(summary, /메일: 성공 4 · 실패 1/);
});

test('sends Telegram summaries only with configured credentials and validates provider acceptance', async (t) => {
    await assert.rejects(sendTelegramSummary({}, 'summary'), /secrets are not configured/);
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, init) => {
        request = { url: String(url), body: JSON.parse(init.body) };
        return Response.json({ ok: true, result: { message_id: 7 } });
    };
    t.after(() => { globalThis.fetch = originalFetch; });
    const result = await sendTelegramSummary({ TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: 'chat-1' }, 'summary');
    assert.match(request.url, /bottest-token\/sendMessage$/);
    assert.equal(request.body.chat_id, 'chat-1');
    assert.equal(request.body.text, 'summary');
    assert.deepEqual(result, { messageId: 7 });
});
