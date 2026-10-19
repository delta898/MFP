'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createPlatformWorkspaceResolver(options = {}) {
    const config = options.config || {};
    const fsImpl = options.fs || fs;
    const pathImpl = options.path || path;
    const logger = options.logger || console;

    return function resolvePlatformWorkspaceDir(platformHint = 'naver') {
        const workspaceBase = config.WORKSPACE_DIR || pathImpl.join(process.cwd(), 'workspace');
        const platform = String(platformHint || 'naver').toLowerCase();
        let directoryName;

        if (platform === 'wordpress') {
            const siteDomain = String(config.WORDPRESS_URL || '')
                .trim()
                .replace(/^https?:\/\//i, '')
                .replace(/\/$/, '') || 'wp_unknown';
            directoryName = `wp_${siteDomain}`;
        } else {
            const naverId = String(config.NAVER_ID || '').trim();
            directoryName = naverId ? `naver_${naverId}` : 'naver';
        }

        const workspacePath = pathImpl.join(workspaceBase, directoryName);
        if (!fsImpl.existsSync(workspacePath)) {
            try {
                fsImpl.mkdirSync(workspacePath, { recursive: true });
            } catch (error) {
                logger.error(`❌ 플랫폼 워크스페이스 폴더 생성 실패 (${workspacePath}): ${error.message}`);
            }
        }
        return workspacePath;
    };
}

module.exports = { createPlatformWorkspaceResolver };
