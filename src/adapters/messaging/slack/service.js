const axios = require('axios');
const Logger = require('../../../utilities/logging/logger');

/**
 * Slack Webhook 알림 서비스
 */
class SlackService {
    static renderNotification(notification = {}) {
        const escapeMrkdwn = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const statusLabels = { completed: '발행 완료', partial: '일부 발행 실패', failed: '발행 실패' };
        const icons = { completed: '✅', partial: '⚠️', failed: '❌' };
        const status = statusLabels[notification.status] ? notification.status : 'failed';
        const lines = [`*${icons[status]} ${escapeMrkdwn(notification.workflow || '자동 발행')} ${statusLabels[status]}*`];
        if (notification.title) lines.push(`*제목:* ${escapeMrkdwn(notification.title)}`);
        if (notification.summary) lines.push(escapeMrkdwn(notification.summary));
        if (notification.source?.url) {
            lines.push(`*원문:* <${notification.source.url}|${escapeMrkdwn(notification.source.label || '원문 열기')}>`);
        }
        const targets = Array.isArray(notification.targets) ? notification.targets : [];
        if (targets.length) {
            lines.push('', '*채널 결과*');
            for (const target of targets) {
                const resultLabel = target.status === 'completed' ? '완료' : target.status === 'skipped' ? '건너뜀' : '실패';
                const detail = target.detail ? ` — ${escapeMrkdwn(target.detail)}` : '';
                const link = target.link?.url
                    ? ` · <${target.link.url}|${escapeMrkdwn(target.link.label || '게시물 열기')}>`
                    : '';
                lines.push(`• *${escapeMrkdwn(target.label || '채널')}*: ${resultLabel}${detail}${link}`);
            }
        }
        return lines.join('\n');
    }

    /**
     * HTML 태그를 Slack mrkdwn 포맷으로 변환
     * @param {string} html
     * @returns {string}
     */
    static _htmlToMrkdwn(html) {
        const links = [];
        const decodeHtml = (value) => String(value || '')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
        const escapeMrkdwn = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        let text = String(html || '').replace(/<a href="([^"]+)">([^<]+)<\/a>/g, (_match, href, label) => {
            const token = `\u0000LINK${links.length}\u0000`;
            links.push(`<${decodeHtml(href)}|${escapeMrkdwn(decodeHtml(label))}>`);
            return token;
        });
        text = text
            .replace(/<b>/g, '*').replace(/<\/b>/g, '*')
            .replace(/<i>/g, '_').replace(/<\/i>/g, '_');
        text = decodeHtml(text);
        text = escapeMrkdwn(text);
        return text.replace(/\u0000LINK(\d+)\u0000/g, (_match, index) => links[Number(index)] || '');
    }

    /**
     * 알림 메시지 전송
     * @param {string} message 전송할 메시지 (HTML 포맷)
     * @param {Object} options 설정 (webhookUrl, enabled 등)
     */
    static async sendNotification(message, options = {}) {
        const {
            webhookUrl = process.env.NOTIFY_SLACK_WEBHOOK_URL,
            enabled = process.env.NOTIFY_SLACK_ENABLED === 'true'
        } = options;

        if (!enabled || !webhookUrl) {
            Logger.warn(`⚠️ [Slack] 알림 전송 스킵: 설정 미비 (enabled: ${enabled}, webhookUrl: ${!!webhookUrl})`);
            return { success: false, message: 'Slack 알림이 비활성화되어 있거나 설정이 부족합니다.' };
        }

        try {
            const slackText = this._htmlToMrkdwn(message);
            const response = await axios.post(webhookUrl, {
                text: slackText
            }, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' }
            });

            // Slack Webhook은 성공 시 문자열 'ok'를 반환
            if (response.status === 200) {
                Logger.info('✅ [Slack] 알림 메시지 전송 성공');
                return { success: true };
            } else {
                Logger.error(`❌ [Slack] 알림 전송 실패: status=${response.status}`);
                return { success: false, message: `전송 실패 (HTTP ${response.status})` };
            }
        } catch (error) {
            const errorMsg = error.response ? `HTTP ${error.response.status}: ${error.response.data}` : error.message;
            Logger.error(`❌ [Slack] Webhook 호출 에러: ${errorMsg}`);
            return { success: false, message: `통신 에러: ${error.message}` };
        }
    }

    /**
     * 연결 테스트용 메시지 전송
     * @param {string} webhookUrl Slack Incoming Webhook URL
     */
    static async testConnection(webhookUrl) {
        if (!webhookUrl) {
            return { success: false, message: 'Webhook URL을 입력해주세요.' };
        }

        const testMsg = `*🔔 BlogGenius 연결 테스트*\n\nSlack 알림 설정이 올바르게 완료되었습니다!\n현재 시각: ${new Date().toLocaleString()}`;
        return this.sendNotification(testMsg, { webhookUrl, enabled: true });
    }
}

module.exports = SlackService;
