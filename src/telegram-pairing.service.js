'use strict';

const crypto = require('node:crypto');
const { TelegramBot } = require('node-telegram-bot-api');
const CONFIG = require('./config-loader');
const TelegramBotService = require('./telegram-bot.service');

const PAIRING_TTL_MS = 5 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createTelegramPairingService(deps = {}) {
    const Bot = deps.TelegramBot || TelegramBot;
    const botService = deps.TelegramBotService || TelegramBotService;
    const config = deps.CONFIG || CONFIG;
    let pending = null;

    function hash(value) {
        return crypto.createHash('sha256').update(String(value)).digest();
    }

    function makeCode() {
        let code = '';
        for (let index = 0; index < 8; index += 1) {
            code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
        }
        return code;
    }

    async function finish({ resumeInbound = true, cancelPolling = false } = {}) {
        const active = pending;
        pending = null;
        if (active?.timer) clearTimeout(active.timer);
        if (active?.bot) {
            try {
                await active.bot.stopPolling(cancelPolling
                    ? { cancel: true, reason: 'Telegram pairing cancelled' }
                    : undefined);
            } catch (_error) { /* polling may not have started */ }
        }
        if (resumeInbound && config.NOTIFY_TELEGRAM_INBOUND_ENABLED === true
            && String(config.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim()
            && String(config.NOTIFY_TELEGRAM_CHAT_ID || '').trim()) {
            botService.init();
        }
    }

    async function start({ botToken, username }) {
        await finish({ resumeInbound: false });
        const wasRunning = botService.getStatus?.().running === true;
        if (wasRunning) await botService.stop();

        const sessionId = crypto.randomUUID();
        const nonce = crypto.randomBytes(24).toString('base64url');
        const bot = new Bot(botToken, {
            polling: { autoStart: false, interval: 1000, params: { timeout: 10 } },
            request: { family: 4 }
        });
        const active = {
            sessionId,
            nonce,
            botToken,
            bot,
            codeHash: null,
            chatId: null,
            attempts: 0,
            expiresAt: Date.now() + PAIRING_TTL_MS,
            timer: null
        };
        pending = active;
        active.timer = setTimeout(() => { void finish(); }, PAIRING_TTL_MS);
        active.timer.unref?.();

        bot.on('message', async (message) => {
            if (pending !== active || Date.now() >= active.expiresAt) return;
            const chat = message?.chat;
            const text = String(message?.text || '').trim();
            if (chat?.type !== 'private' || !text.startsWith('/start')) return;
            const payload = text.split(/\s+/, 2)[1] || '';
            if (payload !== `bg_${nonce}`) return;
            const code = makeCode();
            active.codeHash = hash(code);
            active.chatId = String(chat.id);
            await bot.sendMessage(chat.id, `BlogGenius 연결 코드입니다.\n\n<code>${code}</code>\n\n이 코드를 BlogGenius 설정에 입력해 주세요. 5분 후 만료됩니다.`, { parse_mode: 'HTML' });
        });
        bot.on('polling_error', () => {
            if (pending === active) void finish();
        });
        try {
            await bot.startPolling();
        } catch (error) {
            await finish();
            throw error;
        }
        return {
            sessionId,
            username,
            deepLink: `https://t.me/${encodeURIComponent(username)}?start=bg_${nonce}`,
            expiresAt: new Date(active.expiresAt).toISOString()
        };
    }

    async function complete({ sessionId, code }) {
        const active = pending;
        if (!active || active.sessionId !== String(sessionId || '') || Date.now() >= active.expiresAt) {
            if (active && Date.now() >= active.expiresAt) await finish();
            const error = new Error('연결 요청이 만료되었습니다. Telegram에서 다시 연결을 시작해 주세요.');
            error.code = 'TELEGRAM_PAIRING_EXPIRED';
            throw error;
        }
        active.attempts += 1;
        if (!active.codeHash || !active.chatId) {
            const error = new Error('Telegram에서 연결 링크를 열고 봇에 시작 메시지를 먼저 보내 주세요.');
            error.code = 'TELEGRAM_PAIRING_NOT_STARTED';
            throw error;
        }
        const submittedHash = hash(String(code || '').trim().toUpperCase());
        if (active.attempts > 5 || !crypto.timingSafeEqual(active.codeHash, submittedHash)) {
            if (active.attempts >= 5) await finish();
            const error = new Error(active.attempts >= 5
                ? '확인 횟수를 초과했습니다. Telegram에서 다시 연결해 주세요.'
                : '연결 코드가 일치하지 않습니다. Telegram에 표시된 코드를 확인해 주세요.');
            error.code = active.attempts >= 5 ? 'TELEGRAM_PAIRING_ATTEMPTS_EXCEEDED' : 'TELEGRAM_PAIRING_CODE_INVALID';
            throw error;
        }
        const result = { botToken: active.botToken, chatId: active.chatId };
        await finish({ resumeInbound: false });
        return result;
    }

    return {
        start,
        complete,
        cancel: () => finish({ cancelPolling: true }),
        isPending: () => Boolean(pending)
    };
}

const defaultService = createTelegramPairingService();
module.exports = { ...defaultService, createTelegramPairingService, PAIRING_TTL_MS };
