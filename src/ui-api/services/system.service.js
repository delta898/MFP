const { createApiError } = require('../errors');
const { toSafeRuntimeEnvironmentDiagnostic } = require('../../host/configuration/environment/runtime-profile');
const { buildSetupReadiness } = require('../../services/configuration-readiness/service');
const { resolveRuntimeLogDir } = require('../../utilities/logging/runtime-log-path');

function createSystemService(deps = {}) {
    const {
        APP_VERSION,
        fs,
        path,
        CONFIG,
        parseBoolQuery,
        ensureSheetsReadyForUi,
        Logger,
        peekGoogleOauthStatus = () => ({ state: 'disconnected', connected: false })
    } = deps;
    if (typeof Logger?.getRecentLogs !== 'function') {
        console.error('❌ [System] Logger dependency missing or invalid in SystemService');
    } else {
        Logger.debug('✅ [System] Dashboard SystemService가 로드되었습니다. (Logger 연동 완료)');
    }

    function clampDashboardLogLimit(raw) {
        const value = Number(raw);
        if (!Number.isFinite(value)) return 80;
        return Math.max(10, Math.min(200, Math.floor(value)));
    }

    function logUiEvent(input = {}) {
        const event = String(input.event || '').trim();
        const stage = String(input.stage || '').trim();
        const postStatus = String(input.postStatus || '').trim().toLowerCase();
        const allowedStages = new Set(['requested', 'queued', 'displayed', 'displayed_after_focus']);
        const allowedPostStatuses = new Set(['publish', 'draft']);
        if (event !== 'posting_completion_effect'
            || !allowedStages.has(stage)
            || !allowedPostStatuses.has(postStatus)) {
            throw createApiError(400, 'UI_EVENT_INVALID', '허용되지 않은 UI 이벤트입니다.');
        }
        const stageLabels = {
            requested: '요청됨',
            queued: '화면 복귀 대기',
            displayed: '화면 표시 실행',
            displayed_after_focus: '화면 복귀 후 표시 실행'
        };
        Logger.info(`✨ [CompletionEffect] 포스팅 완료 효과 ${stageLabels[stage]} (status=${postStatus})`);
        return { logged: true };
    }

    function parseLogLine(line = '') {
        const text = String(line || '').trim();
        if (!text) return null;
        const m = text.match(/^\[([^\]]+)\]\s+\[([A-Z]+)\]\s+(.+)$/);
        if (!m) return null;
        return {
            timestamp: m[1],
            level: String(m[2] || '').toLowerCase(),
            message: String(m[3] || '').trim()
        };
    }

    function getRecentLogsFromFile(limit = 80) {
        try {
            const date = new Date();
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const logFile = path.join(resolveRuntimeLogDir({ rootDir: CONFIG.ROOT_DIR, pathImpl: path }), `${y}-${m}-${d}.log`);
            if (!fs.existsSync(logFile)) return [];

            const content = String(fs.readFileSync(logFile, 'utf-8') || '');
            if (!content.trim()) return [];

            const lines = content.split('\n').filter(Boolean);
            const out = [];
            for (let i = lines.length - 1; i >= 0; i -= 1) {
                const parsed = parseLogLine(lines[i]);
                if (!parsed) continue;
                out.push(parsed);
                if (out.length >= limit) break;
            }
            return out;
        } catch (_) {
            return [];
        }
    }

    return {
        async getHealth() {
            return { status: 'ok', version: APP_VERSION };
        },

        async checkUpdate({ updater, forceRaw }) {
            const force = forceRaw === 'true' || forceRaw === true;
            return (await updater.checkForUpdate({ force })) || { hasUpdate: false };
        },

        async getUpdateProgress({ updater }) {
            return { ...updater.progress };
        },

        async applyUpdate({ updater }) {
            await updater.applyUpdate(() => { });
            return { success: true };
        },

        async getDashboardLogs({ limitRaw } = {}) {
            const limit = clampDashboardLogLimit(limitRaw);
            const memoryLogs = Array.isArray(Logger.getRecentLogs(limit)) ? Logger.getRecentLogs(limit) : [];
            const fileLogs = getRecentLogsFromFile(limit);

            // 메모리/파일 로그 합치고 중복 제거 (timestamp + level + message)
            const merged = [];
            const seen = new Set();
            [...memoryLogs, ...fileLogs].forEach((item) => {
                const ts = String(item?.timestamp || '').trim();
                const lv = String(item?.level || '').trim().toLowerCase();
                const msg = String(item?.message || '').trim();
                if (!ts || !msg) return;
                const key = `${ts}__${lv}__${msg}`;
                if (seen.has(key)) return;
                seen.add(key);
                merged.push({ timestamp: ts, level: lv, message: msg });
            });

            return { logs: merged.slice(0, limit) };
        },

        async getLogFiles() {
            const logDir = resolveRuntimeLogDir({ rootDir: CONFIG.ROOT_DIR, pathImpl: path });
            if (!fs.existsSync(logDir)) {
                return { files: [] };
            }
            const files = fs.readdirSync(logDir)
                .filter((f) => f.endsWith('.log'))
                .sort((a, b) => b.localeCompare(a));
            return { files };
        },

        async readLogFile({ filename }) {
            if (!filename || !filename.endsWith('.log') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                throw createApiError(400, 'INVALID_FILE', '잘못된 파일 이름입니다.');
            }
            const logFile = path.join(resolveRuntimeLogDir({ rootDir: CONFIG.ROOT_DIR, pathImpl: path }), filename);
            if (!fs.existsSync(logFile)) {
                throw createApiError(404, 'FILE_NOT_FOUND', '로그 파일을 찾을 수 없습니다.');
            }

            const stats = fs.statSync(logFile);
            const MAX_SIZE = 1024 * 1024; // 1MB
            let content = '';

            if (stats.size > MAX_SIZE) {
                const buffer = Buffer.alloc(MAX_SIZE);
                const fd = fs.openSync(logFile, 'r');
                fs.readSync(fd, buffer, 0, MAX_SIZE, stats.size - MAX_SIZE);
                fs.closeSync(fd);
                content = '\n... [로그 파일이 너무 커서 최근 1MB 내용만 표시됩니다] ...\n\n' + buffer.toString('utf-8');
            } else {
                content = fs.readFileSync(logFile, 'utf-8');
            }

            return { file: filename, content };
        },

        async getConfigStatus() {
            let googleOauth;
            try {
                googleOauth = peekGoogleOauthStatus();
            } catch (error) {
                googleOauth = {
                    state: 'error',
                    connected: false,
                    message: String(error?.message || '')
                };
            }
            return {
                ready: CONFIG.CONFIG_READY === true,
                sourceType: String(CONFIG.CONFIG_SOURCE_TYPE || ''),
                sourcePath: String(CONFIG.CONFIG_SOURCE_PATH || ''),
                message: String(CONFIG.CONFIG_ERROR_MESSAGE || ''),
                version: String(APP_VERSION || '0.0.0'),
                runtimeEnvironment: toSafeRuntimeEnvironmentDiagnostic(
                    CONFIG.RUNTIME_ENVIRONMENT_PROFILE
                ),
                isEssentialSet: CONFIG.CONFIG_IS_ESSENTIAL_SET === true,
                isNaverSet: CONFIG.CONFIG_IS_NAVER_SET === true,
                isWpSet: CONFIG.CONFIG_IS_WP_SET === true,
                setup: buildSetupReadiness({ CONFIG, googleOauth })
            };
        },

        async ensureSheets({ forceRaw }) {
            const force = parseBoolQuery(forceRaw);
            return ensureSheetsReadyForUi({ force });
        },

        logUiEvent
    };
}

module.exports = {
    createSystemService
};
