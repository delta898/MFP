const axios = require('axios');
const Logger = require('./logger');

/**
 * Slack Webhook 알림 서비스
 */
class SlackService {
    /**
     * HTML 태그를 Slack mrkdwn 포맷으로 변환
     * @param {string} html 
     * @returns {string}
     */
    static _htmlToMrkdwn(html) {
        return html
            .replace(/<b>/g, '*').replace(/<\/b>/g, '*')
            .replace(/<i>/g, '_').replace(/<\/i>/g, '_')
            .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '<$1|$2>');
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
