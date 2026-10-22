'use strict';

function safeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch (_error) {
        return '';
    }
}

function buildPublishingResultNotification(input = {}) {
    const status = ['completed', 'partial', 'failed'].includes(input.status) ? input.status : 'failed';
    const targets = Array.isArray(input.targets) ? input.targets : [];
    return {
        kind: 'publishing_result',
        workflow: String(input.workflow || '자동 발행'),
        status,
        title: String(input.title || ''),
        summary: String(input.summary || ''),
        source: safeHttpUrl(input.sourceUrl)
            ? { label: String(input.sourceLabel || '원문 열기'), url: safeHttpUrl(input.sourceUrl) }
            : null,
        targets: targets.map((target) => ({
            label: String(target.label || '채널'),
            status: target.success === true ? 'completed' : target.skipped === true ? 'skipped' : 'failed',
            detail: String(target.detail || ''),
            link: safeHttpUrl(target.url)
                ? { label: '게시물 열기', url: safeHttpUrl(target.url) }
                : null
        }))
    };
}

module.exports = { buildPublishingResultNotification, safeHttpUrl };
