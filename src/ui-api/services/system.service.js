const { createApiError } = require('../errors');

function createSystemService(deps = {}) {
    const {
        APP_VERSION,
        Utils,
        fs,
        path,
        CONFIG,
        parseBoolQuery,
        ensureSheetsReadyForUi,
        logger
    } = deps;

    return {
        async getHealth() {
            return { status: 'ok', version: APP_VERSION };
        },

        async checkUpdate({ updater }) {
            return (await updater.checkForUpdate()) || { hasUpdate: false };
        },

        async applyUpdate({ updater }) {
            await updater.applyUpdate(() => {});
            return { success: true };
        },

        async getDashboardSummary() {
            return Utils.getDashboardSummary();
        },

        async getDashboardLogs() {
            return { logs: logger.getRecentLogs(20) };
        },

        async getLogFiles() {
            const logDir = path.join(process.cwd(), 'logs');
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
            const logFile = path.join(process.cwd(), 'logs', filename);
            if (!fs.existsSync(logFile)) {
                throw createApiError(404, 'FILE_NOT_FOUND', '로그 파일을 찾을 수 없습니다.');
            }
            const content = fs.readFileSync(logFile, 'utf-8');
            return { file: filename, content };
        },

        async getConfigStatus() {
            return {
                ready: CONFIG.CONFIG_READY === true,
                sourceType: String(CONFIG.CONFIG_SOURCE_TYPE || ''),
                sourcePath: String(CONFIG.CONFIG_SOURCE_PATH || ''),
                message: String(CONFIG.CONFIG_ERROR_MESSAGE || ''),
                version: String(APP_VERSION || '0.0.0')
            };
        },

        async ensureSheets({ forceRaw }) {
            const force = parseBoolQuery(forceRaw);
            return ensureSheetsReadyForUi({ force });
        }
    };
}

module.exports = {
    createSystemService
};

