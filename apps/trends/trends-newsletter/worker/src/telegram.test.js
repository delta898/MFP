import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCollectorRunSummary, sendTelegramSummary } from './telegram.js';

test('formats a clean success summary with visual hierarchy and aggregate email outcomes', () => {
    const summary = formatCollectorRunSummary({
        environment: 'development', trendDate: '2026-11-04', runId: 'run-1', status: 'success',
        delivery: { sent: 4, failed: 0, held: 0, skipped: 2 }
    });
    assert.match(summary, /🟢 <b>네이버 트렌드 뉴스레터<\/b>/);
    assert.match(summary, /2026\.11\.04  ·  개발/);
    assert.match(summary, /<b>4건 발송<\/b>/);
    assert.match(summary, /실패 0  ·  보류 0  ·  제외 2/);
    assert.match(summary, /<code>run-1<\/code>/);
});

test('formats a failed collector report and escapes dynamic HTML', () => {
    const summary = formatCollectorRunSummary({
        environment: 'development', trendDate: '2026-10-18', runId: 'run-2', status: 'failure',
        stage: 'naver_session', error: '세션 <expired> & 재로그인'
    });
    assert.match(summary, /🔴 <b>네이버 트렌드 뉴스레터<\/b>/);
    assert.match(summary, /🔎 단계: 네이버 세션/);
    assert.match(summary, /세션 &lt;expired&gt; &amp; 재로그인/);
    assert.doesNotMatch(summary, /세션 <expired>/);
});

test('explains when a prior delivery was already complete', () => {
    const summary = formatCollectorRunSummary({
        environment: 'development', trendDate: '2026-10-18', runId: 'run-3', status: 'success',
        delivery: { status: 'already_processed' }
    });
    assert.match(summary, /이전 발송이 완료/);
    assert.doesNotMatch(summary, /0건 발송/);
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
    assert.equal(request.body.parse_mode, 'HTML');
    assert.deepEqual(result, { messageId: 7 });
});
