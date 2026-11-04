function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function formatDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : escapeHtml(value);
}

function formatCount(value) {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
}

const STAGE_LABELS = {
    naver_session: '네이버 세션',
    collection_validation: '수집 데이터 확인',
    trend_ingest: '트렌드 저장',
    collector: '수집',
    edition_generation: '뉴스레터 준비',
    email_delivery: '메일 발송'
};

export function formatCollectorRunSummary({ environment, trendDate, runId, status, stage, error, delivery }) {
    const succeeded = status === 'success';
    const deliveryPaused = delivery?.status === 'disabled';
    const lines = [
        `${succeeded ? '🟢' : '🔴'} <b>네이버 트렌드 뉴스레터</b>`,
        `<b>${deliveryPaused ? '수집 완료 · 메일 발송 대기' : succeeded ? '발송 완료' : '실행 실패'}</b>`,
        `🗓 ${formatDate(trendDate)}  ·  ${environment === 'development' ? '개발' : escapeHtml(environment)}`
    ];

    if (delivery?.status === 'already_processed') {
        lines.push('', '📨 이전 발송이 완료되어 이번 실행에서는 메일을 보내지 않았어요.');
    } else if (deliveryPaused) {
        lines.push('', '📭 현재 메일 발송 모드가 활성 상태가 아니에요. 구독자 메일은 발송하지 않았습니다.');
    } else if (delivery) {
        lines.push(
            '',
            `📨 <b>${formatCount(delivery.sent)}건 발송</b>`,
            `실패 ${formatCount(delivery.failed)}  ·  보류 ${formatCount(delivery.held)}  ·  제외 ${formatCount(delivery.skipped)}`
        );
    }

    if (stage) lines.push('', `🔎 단계: ${STAGE_LABELS[stage] || escapeHtml(stage)}`);
    if (error) lines.push(`💬 ${escapeHtml(String(error).slice(0, 500))}`);
    if (runId) lines.push('', `<code>${escapeHtml(runId)}</code>`);
    return lines.join('\n');
}

export async function sendTelegramSummary(env, summary) {
    const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
    if (!token || !chatId) throw new Error('Telegram notification secrets are not configured.');
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: summary, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) throw new Error(`Telegram send failed (${response.status}).`);
    return { messageId: payload.result?.message_id || null };
}
