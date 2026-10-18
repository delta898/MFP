'use strict';

const fs = require('node:fs');
const path = require('node:path');
const AUTOMATION_SETTINGS_FILE_NAME = 'continuous_publishing.json';

function createAutomationSettingsRepository(options = {}) {
    const fsImpl = options.fs || fs;
    const pathImpl = options.path || path;
    const filePath = options.filePath;
    const schemaVersion = options.schemaVersion;
    const defaultDocument = options.defaultDocument || {};
    const normalizeDocument = typeof options.normalizeDocument === 'function' ? options.normalizeDocument : (value) => value;
    if (!filePath) throw new Error('continuous publishing settings filePath is required.');

    return {
        filePath,
        read() {
            if (!fsImpl.existsSync(filePath)) {
                return { document: { ...defaultDocument }, source: 'default', warnings: [] };
            }
            try {
                const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
                if (Number(parsed?.schema_version) !== Number(schemaVersion)) {
                    return {
                        document: { ...defaultDocument },
                        source: 'default',
                        warnings: ['지원하지 않는 연속 포스팅 설정 버전이라 기본값을 사용합니다.']
                    };
                }
                return { document: normalizeDocument(parsed), source: 'saved', warnings: [] };
            } catch (_error) {
                return {
                    document: { ...defaultDocument },
                    source: 'default',
                    warnings: ['연속 포스팅 설정을 읽지 못해 기본값을 사용합니다.']
                };
            }
        },
        save(input = {}) {
            const document = {
                ...normalizeDocument(input, { strict: true }),
                updated_at: new Date().toISOString()
            };
            fsImpl.mkdirSync(pathImpl.dirname(filePath), { recursive: true });
            const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
            fsImpl.writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
            fsImpl.renameSync(temporaryPath, filePath);
            return { document, source: 'saved', warnings: [] };
        }
    };
}

function resolveAutomationSettingsPath(config = {}, pathImpl = path) {
    const configDir = String(config.CONFIG_DIR || '').trim();
    if (!configDir) throw new Error('CONFIG_DIR is required for continuous publishing settings.');
    return pathImpl.join(configDir, AUTOMATION_SETTINGS_FILE_NAME);
}

module.exports = { AUTOMATION_SETTINGS_FILE_NAME, createAutomationSettingsRepository, resolveAutomationSettingsPath };
