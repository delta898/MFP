export function formatCollectorRunSummary({ environment, trendDate, runId, status, stage, error, delivery }) {
    const lines = [
        `네이버 트렌드 뉴스레터 ${status === 'success' ? '성공' : '실패'}`,
        `환경: ${environment}`,
        `수집일: ${trendDate}`,
        `실행 ID: ${runId}`
    ];
    if (stage) lines.push(`단계: ${stage}`);
    if (delivery?.status === 'already_processed') lines.push('메일: 기존 발송 완료 (중복 발송 생략)');
    else if (delivery) lines.push(`메일: 성공 ${delivery.sent || 0} · 실패 ${delivery.failed || 0} · 보류 ${delivery.held || 0} · 제외 ${delivery.skipped || 0}`);
    if (error) lines.push(`원인: ${String(error).slice(0, 500)}`);
    return lines.join('\n');
}

export async function sendTelegramSummary(env, summary) {
    const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
    if (!token || !chatId) throw new Error('Telegram notification secrets are not configured.');
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: summary, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) throw new Error(`Telegram send failed (${response.status}).`);
    return { messageId: payload.result?.message_id || null };
}
