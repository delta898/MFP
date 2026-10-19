'use strict';

const fs = require('node:fs');

const WORDPRESS_ASSET_PATHS = Object.freeze({
    WP_PERMANENT_FTC_URL: ['platforms', 'wordpress', 'assets', 'ftc_image'],
    WP_PERMANENT_CTA_URL1: ['platforms', 'wordpress', 'assets', 'cta_images', 0],
    WP_PERMANENT_CTA_URL2: ['platforms', 'wordpress', 'assets', 'cta_images', 1],
    WP_PERMANENT_CTA_URL3: ['platforms', 'wordpress', 'assets', 'cta_images', 2]
});

function createWordPressPublishedAssetSettings(options = {}) {
    const config = options.config || {};
    const fsImpl = options.fs || fs;
    const logger = options.logger || console;

    return {
        persist(key, value) {
            try {
                const configPath = config.CONFIG_SOURCE_PATH;
                const targetPath = WORDPRESS_ASSET_PATHS[key];
                if (!configPath || !targetPath || !fsImpl.existsSync(configPath) || !configPath.endsWith('.json')) return false;

                const document = JSON.parse(fsImpl.readFileSync(configPath, 'utf8'));
                let current = document;
                for (let index = 0; index < targetPath.length - 1; index += 1) {
                    const segment = targetPath[index];
                    const nextSegment = targetPath[index + 1];
                    if (!current[segment]) current[segment] = typeof nextSegment === 'number' ? [] : {};
                    current = current[segment];
                }
                current[targetPath[targetPath.length - 1]] = value;
                fsImpl.writeFileSync(configPath, JSON.stringify(document, null, 2), 'utf8');
                config[key] = value;
                return true;
            } catch (error) {
                logger.error(`❌ 설정 파일 업데이트 실패 (${key}): ${error.message}`);
                return false;
            }
        }
    };
}

module.exports = { WORDPRESS_ASSET_PATHS, createWordPressPublishedAssetSettings };
