const axios = require('axios');
const Logger = require('./logger');

/**
 * 텔레그램 알림 서비스
 */
class TelegramService {
    /**
     * 알림 메시지 전송
     * @param {string} message 전송할 메시지
     * @param {Object} options 설정 (botToken, chatId 등)
     */
    static async sendNotification(message, options = {}) {
        const {
            botToken = process.env.NOTIFY_TELEGRAM_BOT_TOKEN,
            chatId = process.env.NOTIFY_TELEGRAM_CHAT_ID,
            enabled = process.env.NOTIFY_TELEGRAM_ENABLED === 'true'
        } = options;

        if (!enabled || !botToken || !chatId) {
            Logger.warn(`⚠️ [Telegram] 알림 전송 스킵: 설정 미비 (enabled: ${enabled}, token: ${!!botToken}, chat: ${!!chatId})`);
            return { success: false, message: '텔레그램 알림이 비활성화되어 있거나 설정이 부족합니다.' };
        }

        try {
            const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
            const response = await axios.post(url, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            }, {
                timeout: 5000
            });

            if (response.data && response.data.ok) {
                Logger.info('✅ [Telegram] 알림 메시지 전송 성공');
                return { success: true };
            } else {
                Logger.error(`❌ [Telegram] 알림 전송 실패: ${JSON.stringify(response.data)}`);
                return { success: false, message: '전송 실패 (API 응답 오류)' };
            }
        } catch (error) {
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            Logger.error(`❌ [Telegram] API 호출 에러: ${errorMsg}`);
            const status = Number(error?.response?.status || 0);
            const description = String(error?.response?.data?.description || '').toLowerCase();
            if (status === 400 && description.includes('chat not found')) {
                return { success: false, message: 'Chat ID를 확인해 주세요.' };
            }
            if (status === 401) {
                return { success: false, message: 'Bot Token을 확인해 주세요.' };
            }
            if (status === 429) {
                return { success: false, message: 'Telegram 요청이 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.' };
            }
            return { success: false, message: 'Telegram과 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    }

    /**
     * 연결 테스트용 메시지 전송
     * @param {string} botToken 
     * @param {string} chatId 
     */
    static async testConnection(botToken, chatId) {
        if (!botToken || !chatId) {
            return { success: false, message: '봇 토큰과 챗 ID를 모두 입력해주세요.' };
        }

        const testMsg = `<b>🔔 BlogGenius 연결 테스트</b>\n\n텔레그램 알림 설정이 올바르게 완료되었습니다!\n현재 시작 시각: ${new Date().toLocaleString()}`;
        return this.sendNotification(testMsg, { botToken, chatId, enabled: true });
    }
}

module.exports = TelegramService;
