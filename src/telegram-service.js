const axios = require('axios');
const Logger = require('./logger');
const {
    createTelegramIpv4Agent,
    describeTelegramError,
    formatTelegramDiagnostic,
    shouldRetryTelegramWithIpv4
} = require('./telegram-network-policy');

/**
 * 텔레그램 알림 서비스
 */
class TelegramService {
    static async callBotApi(method, payload, options = {}) {
        const botToken = String(options.botToken || '').trim();
        const timeout = Number(options.timeout || 8000);
        const url = `https://api.telegram.org/bot${botToken}/${method}`;
        try {
            return await axios.post(url, payload || {}, { timeout });
        } catch (error) {
            const initial = describeTelegramError(error, { botToken });
            if (!shouldRetryTelegramWithIpv4(error)) throw error;
            Logger.warn(`⚠️ [Telegram] 기본 연결 실패, IPv4 호환 재시도: ${formatTelegramDiagnostic(initial)}`);
            const httpsAgent = createTelegramIpv4Agent();
            try {
                const response = await axios.post(url, payload || {}, { timeout, httpsAgent });
                Logger.info(`✅ [Telegram] IPv4 호환 재시도 성공 (method=${method})`);
                return response;
            } catch (retryError) {
                retryError.telegramInitialAttempt = initial;
                throw retryError;
            } finally {
                httpsAgent.destroy();
            }
        }
    }

    static failureResult(error, options = {}) {
        const details = describeTelegramError(error, { botToken: options.botToken });
        Logger.error(`❌ [Telegram] API 호출 실패 (stage=${options.stage || 'send'}): ${formatTelegramDiagnostic(details)}`);
        return {
            success: false,
            stage: options.stage || 'send',
            category: details.category,
            message: options.stage === 'message' && ['unknown', 'telegram_api'].includes(details.category)
                ? '봇과 채팅은 확인됐지만 테스트 메시지를 전송하지 못했습니다. 채팅 권한을 확인해 주세요.'
                : details.userMessage
        };
    }

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
            const response = await this.callBotApi('sendMessage', {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            }, { botToken });

            if (response.data && response.data.ok) {
                Logger.info('✅ [Telegram] 알림 메시지 전송 성공');
                return { success: true };
            } else {
                Logger.error(`❌ [Telegram] 알림 전송 실패: ${JSON.stringify(response.data)}`);
                return { success: false, message: '전송 실패 (API 응답 오류)' };
            }
        } catch (error) {
            return this.failureResult(error, { botToken, stage: options.stage || 'send' });
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

        let stage = 'token';
        try {
            await this.callBotApi('getMe', {}, { botToken });
            stage = 'chat';
            await this.callBotApi('getChat', { chat_id: chatId }, { botToken });
            stage = 'message';
            const testMsg = `<b>🔔 BlogGenius 연결 테스트</b>\n\n텔레그램 알림 설정이 올바르게 완료되었습니다!\n현재 시작 시각: ${new Date().toLocaleString()}`;
            await this.callBotApi('sendMessage', {
                chat_id: chatId,
                text: testMsg,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            }, { botToken });
            Logger.info('✅ [Telegram] Bot Token, 채팅 접근, 테스트 메시지 전송 확인 완료');
            return {
                success: true,
                stage: 'complete',
                message: '연결됨 · 테스트 메시지를 전송했습니다.'
            };
        } catch (error) {
            return this.failureResult(error, { botToken, stage });
        }
    }
}

module.exports = TelegramService;
