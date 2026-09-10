function createUiConfigFileRuntime(deps = {}) {
    const {
        fs,
        crypto,
        CONFIG,
        defaultHost,
        defaultPort,
        defaultShoppingImageSources
    } = deps;

    function resolveReadableConfigSource() {
        const configPath = CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS.configFile;
        if (fs.existsSync(configPath)) {
            return { path: configPath, sourceType: 'config' };
        }

        return {
            path: configPath,
            sourceType: fs.existsSync(configPath) ? 'config' : 'sample'
        };
    }

    function resolveWritableConfigPath() {
        return CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS.configFile;
    }

    function readConfigRaw(configSource) {
        if (!configSource?.path || !fs.existsSync(configSource.path)) {
            throw new Error(`설정 파일을 찾을 수 없습니다: ${configSource?.path || '(unknown)'}`);
        }
        return fs.readFileSync(configSource.path, 'utf-8');
    }

    function createConfigRevision(raw) {
        return crypto.createHash('sha1').update(String(raw || ''), 'utf8').digest('hex');
    }

    function tryResolveReadableConfigSource() {
        try {
            return resolveReadableConfigSource();
        } catch (_error) {
            return null;
        }
    }

    function buildDefaultConfigTemplate() {
        return [
            '# BlogGenius config (auto-generated)',
            'NAVER_ID = ',
            'GOOGLE_SHEET_URL = ',
            'WORDPRESS_USER_ID = ' + (CONFIG.WORDPRESS_USER_ID || ''),
            'WORDPRESS_APP_PASSWORD = ',
            `LISTEN_HOST = ${defaultHost}`,
            `LISTEN_PORT = ${defaultPort}`,
            'HEADLESS = false',
            'TYPING_SPEED = FAST',
            'BLOG_AUTO_MODE = false',
            'BLOG_AUTO_CATEGORIES = ',
            'BLOG_AUTO_MAX_POSTS_PER_RUN = 10',
            'BLOG_AUTO_TRENDS_TIME = 07:30',
            'BLOG_AUTO_IMAGE_GENERATION = true',
            'BLOG_AUTO_EXTERNAL_REFERENCE = true',
            'BLOG_AUTO_NOTIFY_ENABLED = false',
            'BLOG_AUTO_VARIATION_INCLUDE_NEW = false',
            'BLOG_AUTO_VARIATION_INCLUDE_DASH = false',
            'BLOG_AUTO_VARIATION_INCLUDE_NUMBER = true',
            'BLOG_AUTO_VARIATION_NUMBER = 50',
            'BLOG_AUTO_VARIATION_TOP_N = 5',
            'BLOG_AUTO_KEYWORD_REUSE_GAP_DAYS = 15',
            'BLOG_AUTO_HEADLESS = true',
            'MAX_BLOG_POSTS_PER_RUN = 10',
            'MAX_SHOPPING_POSTS_PER_RUN = 10',
            `FTC_DISCLOSURE_IMAGE_URL = ${defaultShoppingImageSources.FTC_DISCLOSURE_IMAGE_URL}`,
            `SHOPPING_CTA_IMAGE_URL1 = ${defaultShoppingImageSources.SHOPPING_CTA_IMAGE_URL1}`,
            `SHOPPING_CTA_IMAGE_URL2 = ${defaultShoppingImageSources.SHOPPING_CTA_IMAGE_URL2}`,
            `SHOPPING_CTA_IMAGE_URL3 = ${defaultShoppingImageSources.SHOPPING_CTA_IMAGE_URL3}`,
            ''
        ].join('\n');
    }

    function parseConfigValue(raw, key) {
        const lines = String(raw || '').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
            const [left, ...rest] = trimmed.split('=');
            if (String(left || '').trim() !== key) continue;
            const joined = rest.join('=');
            const value = joined.includes('#') ? joined.split('#')[0] : joined;
            return String(value || '').trim();
        }
        return '';
    }

    return {
        buildDefaultConfigTemplate,
        createConfigRevision,
        parseConfigValue,
        readConfigRaw,
        resolveReadableConfigSource,
        resolveWritableConfigPath,
        tryResolveReadableConfigSource
    };
}

module.exports = {
    createUiConfigFileRuntime
};
