'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    copyMissingDefaultImages
} = require('./packaged-default-assets');

function mergeStructuredDefaults(target, defaults) {
    if (Array.isArray(defaults)) return Array.isArray(target) ? target : defaults.slice();
    if (!defaults || typeof defaults !== 'object') return target === undefined ? defaults : target;

    const result = target && typeof target === 'object' && !Array.isArray(target)
        ? { ...target }
        : {};
    Object.keys(defaults).forEach((key) => {
        result[key] = mergeStructuredDefaults(result[key], defaults[key]);
    });
    return result;
}

function readDefaultStructuredConfig(samplePaths, fsImpl = fs) {
    for (const samplePath of samplePaths || []) {
        try {
            if (!fsImpl.existsSync(samplePath)) continue;
            return JSON.parse(fsImpl.readFileSync(samplePath, 'utf8'));
        } catch (_error) { }
    }
    return {};
}

function ensureConfigJsonFromSample({ pairs = [], fsImpl = fs, pathImpl = path, logger = console } = {}) {
    for (const pair of pairs) {
        try {
            if (fsImpl.existsSync(pair.config)) return pair.config;
            const samplePath = (pair.samples || []).find((candidate) => fsImpl.existsSync(candidate));
            if (!samplePath) continue;
            fsImpl.mkdirSync(pathImpl.dirname(pair.config), { recursive: true });
            fsImpl.copyFileSync(samplePath, pair.config);
            logger.info(`✅ config.json 자동 생성 완료: ${pair.config} (from ${samplePath})`);
            return pair.config;
        } catch (error) {
            logger.warn(`⚠️ config.json 자동 생성 실패: ${pair.config} (${error.message})`);
        }
    }
    return '';
}

function loadUserConfig({
    configPath,
    defaultConfig = {},
    samplePairs = [],
    imagesSourceDir = '',
    imagesTargetDir = '',
    fsImpl = fs,
    pathImpl = path,
    logger = console
} = {}) {
    ensureConfigJsonFromSample({ pairs: samplePairs, fsImpl, pathImpl, logger });
    try {
        copyMissingDefaultImages({
            sourceDir: imagesSourceDir,
            targetDir: imagesTargetDir,
            fsImpl,
            pathImpl
        });
    } catch (error) {
        logger.warn(`⚠️ 기본 이미지 초기화 실패: ${error.message}`);
    }

    if (fsImpl.existsSync(configPath)) {
        try {
            const json = JSON.parse(fsImpl.readFileSync(configPath, 'utf8'));
            return {
                ...mergeStructuredDefaults(json, defaultConfig),
                __CONFIG_SOURCE_PATH: configPath,
                __CONFIG_SOURCE_TYPE: 'json',
                __CONFIG_READY: true,
                __CONFIG_ERROR_MESSAGE: ''
            };
        } catch (error) {
            logger.error(`❌ config.json 파싱 실패: ${error.message}`);
        }
    }

    return {
        ...defaultConfig,
        __CONFIG_SOURCE_PATH: configPath,
        __CONFIG_SOURCE_TYPE: 'generated',
        __CONFIG_READY: false,
        __CONFIG_ERROR_MESSAGE: '설정 파일이 없습니다. 기본값으로 시작합니다.'
    };
}

module.exports = {
    mergeStructuredDefaults,
    readDefaultStructuredConfig,
    ensureConfigJsonFromSample,
    loadUserConfig
};
