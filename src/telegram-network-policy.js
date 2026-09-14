'use strict';

const https = require('node:https');

const NETWORK_CODES = new Set([
    'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH',
    'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'
]);
const TLS_CODES = new Set([
    'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
    'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

function redactTelegramText(value, botToken = '') {
    let text = String(value || '');
    const token = String(botToken || '').trim();
    if (token) text = text.split(token).join('[REDACTED_TOKEN]');
    return text
        .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED_TOKEN]')
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 1000);
}

function parseResponseBody(response) {
    const body = response?.data ?? response?.body;
    if (body && typeof body === 'object') return body;
    if (typeof body !== 'string') return {};
    try { return JSON.parse(body); } catch (_error) { return {}; }
}

function collectErrorAttempts(error, botToken = '') {
    const attempts = [];
    const seen = new Set();
    function visit(candidate, depth = 0) {
        if (!candidate || depth > 5 || seen.has(candidate)) return;
        if (typeof candidate === 'object') seen.add(candidate);
        if (Array.isArray(candidate?.errors)) candidate.errors.forEach((item) => visit(item, depth + 1));
        if (candidate?.cause) visit(candidate.cause, depth + 1);
        const code = String(candidate?.code || '').trim();
        const address = String(candidate?.address || '').trim();
        const syscall = String(candidate?.syscall || '').trim();
        const message = redactTelegramText(candidate?.message, botToken);
        if (!code && !address && !syscall && !message) return;
        const key = `${code}|${address}|${syscall}|${message}`;
        if (attempts.some((item) => item.key === key)) return;
        attempts.push({ key, code, address, syscall, message });
    }
    visit(error);
    return attempts.slice(0, 8).map(({ key: _key, ...item }) => item);
}

function describeTelegramError(error, options = {}) {
    const botToken = options.botToken || '';
    const body = parseResponseBody(error?.response);
    const httpStatus = Number(error?.response?.status || error?.response?.statusCode || 0);
    const telegramErrorCode = Number(body?.error_code || 0);
    const description = redactTelegramText(body?.description || '', botToken);
    const attempts = collectErrorAttempts(error, botToken);
    const codes = new Set(attempts.map((item) => item.code).filter(Boolean));
    let category = 'unknown';
    let userMessage = 'Telegram 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';

    if (httpStatus === 401 || telegramErrorCode === 401) {
        category = 'token_invalid';
        userMessage = 'Bot Token이 유효하지 않습니다. BotFather에서 발급한 토큰을 확인해 주세요.';
    } else if ((httpStatus === 400 || telegramErrorCode === 400) && /chat not found/i.test(description)) {
        category = 'chat_not_found';
        userMessage = '채팅을 찾을 수 없습니다. Chat ID를 확인하고 해당 봇에게 /start를 보낸 뒤 다시 시도해 주세요.';
    } else if (httpStatus === 403 || telegramErrorCode === 403) {
        category = 'chat_forbidden';
        userMessage = '해당 채팅에 메시지를 보낼 수 없습니다. 봇 차단 여부와 그룹 권한을 확인해 주세요.';
    } else if (httpStatus === 409 || telegramErrorCode === 409) {
        category = 'polling_conflict';
        userMessage = '같은 Bot Token을 사용하는 다른 수신 봇이 실행 중입니다. 다른 프로그램이나 기존 BlogGenius 실행을 종료해 주세요.';
    } else if (httpStatus === 429 || telegramErrorCode === 429) {
        category = 'rate_limited';
        const retryAfter = Number(body?.parameters?.retry_after || error?.response?.body?.parameters?.retry_after || 0);
        userMessage = retryAfter > 0
            ? `Telegram 요청이 일시적으로 제한되었습니다. ${retryAfter}초 후 다시 시도해 주세요.`
            : 'Telegram 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.';
    } else if ([...codes].some((code) => TLS_CODES.has(code))) {
        category = 'tls';
        userMessage = 'Telegram 보안 연결을 확인하지 못했습니다. PC 시간과 네트워크 보안 설정을 확인해 주세요.';
    } else if ([...codes].some((code) => NETWORK_CODES.has(code)) || (!httpStatus && attempts.length > 0)) {
        category = 'network';
        userMessage = 'Telegram 서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
    } else if (httpStatus || telegramErrorCode) {
        category = 'telegram_api';
    }

    return Object.freeze({
        category,
        code: redactTelegramText(error?.code || attempts[0]?.code || '', botToken),
        httpStatus,
        telegramErrorCode,
        description,
        attempts,
        userMessage
    });
}

function shouldRetryTelegramWithIpv4(error) {
    const details = describeTelegramError(error);
    if (details.category !== 'network') return false;
    return details.attempts.some((item) => NETWORK_CODES.has(item.code));
}

function createTelegramIpv4Agent() {
    return new https.Agent({ family: 4, keepAlive: true });
}

function calculateTelegramPollingBackoffMs(errorCount, options = {}) {
    const baseMs = Math.max(250, Number(options.baseMs || 1000));
    const maxMs = Math.max(baseMs, Number(options.maxMs || 30000));
    const exponent = Math.max(0, Math.min(10, Number(errorCount || 1) - 1));
    return Math.min(maxMs, baseMs * (2 ** exponent));
}

function formatTelegramDiagnostic(details = {}) {
    return JSON.stringify({
        category: details.category || 'unknown',
        code: details.code || '',
        httpStatus: Number(details.httpStatus || 0),
        telegramErrorCode: Number(details.telegramErrorCode || 0),
        description: String(details.description || ''),
        attempts: Array.isArray(details.attempts) ? details.attempts : []
    });
}

module.exports = {
    calculateTelegramPollingBackoffMs,
    collectErrorAttempts,
    createTelegramIpv4Agent,
    describeTelegramError,
    formatTelegramDiagnostic,
    redactTelegramText,
    shouldRetryTelegramWithIpv4
};
